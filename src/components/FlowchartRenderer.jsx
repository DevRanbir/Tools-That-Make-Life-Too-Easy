import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Download } from 'lucide-react';
import mermaid from 'mermaid';

const sanitizeMermaidCode = (code) => {
    if (!code) return '';
    let clean = code.trim();
    // Remove markdown code blocks
    clean = clean.replace(/^(?:```mermaid\s*)?/, '').replace(/```$/, '').trim();

    // Fix: Handle missing Node IDs. e.g. A --> [Label] which is invalid in Mermaid.
    // We insert a generated ID to make it valid.
    let idCounter = 0;
    clean = clean.replace(/((?:---|-->|-\.->|==>))\s*\[/g, (match, arrow) => {
        return `${arrow} Node_Fix_${idCounter++}[`;
    });

    // Fix: Allow hyphens in node IDs (e.g. Node-A[Label])
    // Auto-quote labels if they aren't quoted. ID[Text] -> ID["Text"]
    clean = clean.replace(/([a-zA-Z0-9_-]+)\[([^"\]\n]+)\]/g, '$1["$2"]');
    clean = clean.replace(/([a-zA-Z0-9_-]+)\(([^"\)\n]+)\)/g, '$1("$2")');
    clean = clean.replace(/([a-zA-Z0-9_-]+)\{([^"\}\n]+)\}/g, '$1{"$2"}');

    // Fix unescaped quotes inside labels: ["Text "quote" text"] -> ["Text 'quote' text"]
    // We try to catch obvious cases where a quote appears inside a standard quoted label
    // This is imperfect but helps with common LLM mistakes
    clean = clean.replace(/(\["[^"\]]*)"([^"\]]*)("\])/g, '$1\'$2$3');

    // Ensure "graph TD" or similar exists
    if (!clean.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph)/)) {
        clean = 'graph TD\n' + clean;
    }

    return clean;
};

const downloadSvgAsPng = (svgContent, filename) => {
    if (!svgContent) return;
    try {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');
        if (!svgElement) return;

        const viewBox = svgElement.getAttribute('viewBox');
        let width, height;
        if (viewBox) {
            const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);
            width = vbWidth;
            height = vbHeight;
        } else {
            width = parseFloat(svgElement.getAttribute('width')) || 800;
            height = parseFloat(svgElement.getAttribute('height')) || 600;
        }

        svgElement.setAttribute('width', width);
        svgElement.setAttribute('height', height);

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
        const svgData = encodeURIComponent(svgString);
        const dataUrl = `data:image/svg+xml;charset=utf-8,${svgData}`;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = 3;
        canvas.width = width * scale;
        canvas.height = height * scale;

        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
                URL.revokeObjectURL(link.href);
            }, 'image/png', 1.0);
        };
        img.src = dataUrl;
    } catch (err) {
        console.error('Download failed', err);
    }
};

const FlowchartRenderer = ({ flowchart, index = 0, mermaidInitialized, onClick }) => {
    const [svgContent, setSvgContent] = useState(null);
    const [error, setError] = useState(null);
    const [isRendering, setIsRendering] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const renderDiagram = async () => {
            try {
                setIsRendering(true);
                setError(null);

                // Extract code if passed as object
                let codeToRender = flowchart;
                if (typeof flowchart === 'object' && flowchart !== null) {
                    codeToRender = flowchart.code || flowchart.mermaid || flowchart.content || flowchart.chart || JSON.stringify(flowchart);
                }
                codeToRender = String(codeToRender).trim();

                const uniqueId = `mermaid-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Suppress Mermaid's error output
                const originalError = console.error;
                console.error = (...args) => {
                    const msg = args.join(' ');
                    if (msg.includes('Syntax error') || msg.includes('mermaid') || msg.includes('UnknownDiagramError')) {
                        return;
                    }
                    originalError.apply(console, args);
                };

                try {
                    // Logic to handle initialization via prop if provided, or global check logic could be added here
                    // For now assuming mermaid is available globally or we re-init broadly
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: 'default',
                        securityLevel: 'loose',
                        flowchart: {
                            useMaxWidth: true,
                            htmlLabels: true,
                            curve: 'basis'
                        },
                        logLevel: 'error'
                    });

                    // Pre-process code to clean up common issues
                    let cleanCode = sanitizeMermaidCode(codeToRender);

                    let { svg } = await mermaid.render(uniqueId, cleanCode);

                    // Check if mermaid returned an error SVG instead of throwing
                    if (svg.includes('Syntax error in text') || svg.includes('mermaid-error')) {
                        throw new Error('Mermaid Syntax Error Detected');
                    }

                    if (isMounted) {
                        setSvgContent(svg);
                        setIsRendering(false);
                    }
                } catch (renderError) {
                    // Try one more time with a very strict cleanup if first attempt fails
                    try {
                        const simpleCode = sanitizeMermaidCode(codeToRender)
                            .replace(/\|([^|]*)\|/g, (match, p1) => `|${p1.replace(/['"\[\]]/g, '')}|`)
                            .replace(/'/g, '')
                            .replace(/"/g, '');

                        let { svg } = await mermaid.render(uniqueId + '-retry', simpleCode);

                        if (svg.includes('Syntax error in text') || svg.includes('mermaid-error')) {
                            throw new Error('Mermaid Retry Syntax Error');
                        }
                        if (isMounted) {
                            setSvgContent(svg);
                            setIsRendering(false);
                            return;
                        }
                    } catch (retryError) {
                        // Fall through to error state
                    }

                    if (isMounted) {
                        setError(renderError.message || renderError.toString());
                        setIsRendering(false);
                    }
                } finally {
                    console.error = originalError;
                }
            } catch (e) {
                if (isMounted) {
                    setError(e.message || e.toString());
                    setIsRendering(false);
                }
            }
        };

        renderDiagram();

        return () => {
            isMounted = false;
        };
    }, [flowchart, index]);

    return (
        <div className="w-full relative group my-4">
            <button
                onClick={onClick}
                type="button"
                className="w-full flex flex-col relative isolate transition-transform active:scale-[0.99]"
            >
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border/50 shadow-sm z-10 bg-muted/20 flex items-start justify-center pt-4">
                    <div className="absolute inset-0 bg-muted/20" />
                    {isRendering ? (
                        <div className="flex flex-col items-center gap-2 mt-8">
                            <Loader2 size={24} className="text-muted-foreground animate-spin" />
                            <span className="text-xs text-muted-foreground">Rendering...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-2 text-destructive mt-8">
                            <AlertCircle size={24} />
                            <span className="text-xs">Failed to render</span>
                        </div>
                    ) : svgContent && (
                        <div
                            dangerouslySetInnerHTML={{ __html: svgContent }}
                            className="w-full h-full flex items-start justify-center p-4 pointer-events-none opacity-80"
                            style={{
                                zoom: '0.4' // Crude way to fit larger diagrams
                            }}
                        />
                    )}
                </div>

                <div className="relative -mt-3 w-[95%] mx-auto p-3 pt-5 bg-secondary/95 backdrop-blur-sm rounded-b-xl border-x border-b border-border/50 shadow-sm z-0 transform group-hover:translate-y-2 transition-transform duration-300 ease-out text-left">
                    <div className="flex flex-col gap-1 min-w-0">
                        <div className="text-sm font-medium text-foreground line-clamp-1">
                            Flowchart Diagram
                        </div>
                        <div className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded w-fit font-semibold uppercase tracking-wider border border-primary/20">
                            MERMAID
                        </div>
                    </div>
                </div>
            </button>

            {/* Direct Download Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    downloadSvgAsPng(svgContent, `flowchart-${index}-${Date.now()}.png`);
                }}
                className="absolute top-2 right-2 z-20 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                title="Download PNG"
                disabled={!svgContent || isRendering || error}
            >
                <Download size={16} />
            </button>
        </div>
    );
};

export default FlowchartRenderer;
