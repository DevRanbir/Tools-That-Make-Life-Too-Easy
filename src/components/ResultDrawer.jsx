import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer } from 'vaul';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import {
    Loader2, X, Download, ZoomIn, ZoomOut, Code, Info,
    Hand, Trash2, AlertCircle, ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';
import EmailViewer from './EmailViewer';

const downloadSvgAsPng = async (svgContent, filename) => {
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

const downloadFile = (content, filename) => {
    const link = document.createElement('a');
    link.href = content;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const ResultDrawer = ({ isOpen, onClose, content, title, type }) => {
    const [showInfo, setShowInfo] = useState(false);
    const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
    const [zoom, setZoom] = useState(1); // Will be reset in useEffect
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const [svgContent, setSvgContent] = useState(null);
    const [renderError, setRenderError] = useState(null);

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setViewMode('preview');
            // Default zoom: 2.5 (250%) for flowchart, 1 for image
            setZoom(type === 'image' ? 0.5 : 2.5);
            setPan({ x: 0, y: 0 });
            setSvgContent(null);
            setRenderError(null);
        }
    }, [isOpen, content, type]);

    const handleWheel = (e) => {
        if (viewMode !== 'preview' || (type !== 'flowchart' && type !== 'image')) return;
        const scaleBy = 1.1;
        const newZoom = e.deltaY < 0 ? Math.min(zoom * scaleBy, 5) : Math.max(zoom / scaleBy, 0.2);
        setZoom(newZoom);
    };

    // Keyboard Navigation Logic
    useEffect(() => {
        if (!isOpen || viewMode !== 'preview' || (type !== 'flowchart' && type !== 'image')) return;

        const handleKeyDown = (e) => {
            const step = 40 / zoom; // Adjust step based on zoom level for consistent feel

            switch (e.key) {
                case 'ArrowRight':
                case 'd':
                case 'D':
                    e.preventDefault();
                    setPan(prev => ({ ...prev, x: prev.x - step }));
                    break;
                case 'ArrowLeft':
                case 'a':
                case 'A':
                    e.preventDefault();
                    setPan(prev => ({ ...prev, x: prev.x + step }));
                    break;
                case 'ArrowDown':
                case 's':
                case 'S':
                    e.preventDefault();
                    setPan(prev => ({ ...prev, y: prev.y - step }));
                    break;
                case 'ArrowUp':
                case 'w':
                case 'W':
                    e.preventDefault();
                    setPan(prev => ({ ...prev, y: prev.y + step }));
                    break;
                default:
                    return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, viewMode, type, zoom]);

    // Cleanup svg content when closing or changing content
    useEffect(() => {
        return () => setSvgContent(null);
    }, [content]);

    const sanitizeMermaidCode = (code) => {
        if (!code) return '';
        let clean = code.trim();
        clean = clean.replace(/^```mermaid\n?/, '').replace(/```$/, '').trim();

        // Auto-quote labels if they aren't quoted. ID[Text] -> ID["Text"]
        // This handles [], (), {}, >]
        clean = clean.replace(/(\w+)\[([^"\]\n][^\]\n]*)\]/g, '$1["$2"]');
        clean = clean.replace(/(\w+)\(([^" \)\n][^\)\n]*)\)/g, '$1("$2")');
        clean = clean.replace(/(\w+)\{([^"\}n][^\}\n]*)\}/g, '$1{"$2"}');
        clean = clean.replace(/(\w+)>([^"\]\n][^\]\n]*)\]/g, '$1>["$2"]');

        // Fix unescaped quotes inside labels
        clean = clean.replace(/\["([^"]*)"\]/g, (match, p1) => `["${p1.replace(/"/g, "'")}"]`);
        clean = clean.replace(/\("([^"]*)"\)/g, (match, p1) => `("${p1.replace(/"/g, "'")}")`);

        return clean;
    };

    // Mermaid Rendering Logic
    useEffect(() => {
        let isMounted = true;

        const renderDiagram = async () => {
            if (type !== 'flowchart' || !content || viewMode !== 'preview') return;

            try {
                // Initialize mermaid if needed (can be safe to call multiple times with same config)
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'base',
                    securityLevel: 'loose',
                    themeVariables: {
                        primaryColor: '#e0e7ff',
                        primaryTextColor: '#1e3a8a',
                        primaryBorderColor: '#3b82f6',
                        lineColor: '#64748b',
                        secondaryColor: '#f1f5f9',
                        tertiaryColor: '#ffffff',
                        fontFamily: 'inherit'
                    }
                });

                const id = `mermaid-drawer-${Date.now()}`;

                // Pre-process code to clean up common issues
                let cleanCode = sanitizeMermaidCode(content);

                let { svg } = await mermaid.render(id, cleanCode);

                // Check if mermaid returned an error SVG instead of throwing
                if (svg.includes('Syntax error in text') || svg.includes('mermaid-error')) {
                    throw new Error('Mermaid Syntax Error Detected');
                }

                if (isMounted) {
                    setSvgContent(svg);
                    setRenderError(null);
                }
            } catch (err) {
                // Retry logic (Same as FlowchartRenderer)
                try {
                    const id = `mermaid-drawer-${Date.now()}-retry`;
                    const simpleCode = sanitizeMermaidCode(content)
                        .replace(/\|([^|]*)\|/g, (match, p1) => `|${p1.replace(/['"\[\]]/g, '')}|`)
                        .replace(/'/g, '')
                        .replace(/"/g, '');

                    let { svg } = await mermaid.render(id, simpleCode);

                    if (svg.includes('Syntax error in text') || svg.includes('mermaid-error')) {
                        throw new Error('Mermaid Retry Syntax Error');
                    }
                    if (isMounted) {
                        setSvgContent(svg);
                        setRenderError(null);
                        return;
                    }
                } catch (retryError) {
                    // fall through
                }

                console.error("Mermaid render error:", err);
                if (isMounted) {
                    setRenderError('Failed to render flowchart. Please check the code.');
                }
            }
        };

        renderDiagram();
        return () => { isMounted = false; };
    }, [content, type, viewMode, isOpen]);


    const handleDownload = () => {
        if (!content) return;

        if (type === 'image') {
            downloadFile(content, title || 'image.png');
            return;
        }

        if (type === 'flowchart') {
            downloadSvgAsPng(svgContent, title || `flowchart-${Date.now()}.png`);
            return;
        }


        if (type === 'ppt' || type === 'presentation') {
            downloadFile(content, title || 'presentation.pptx');
            return;
        }

        const mimeType = type === 'html' ? 'text/html' : 'text/markdown';
        const extension = type === 'html' ? 'html' : type === 'flowchart' ? 'mermaid' : 'md';

        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = title || `result.${extension}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const displayTitle = title ? title.replace(/(\.mermaid|\.txt|\.png|\.jpg|\.jpeg|\.html)+$/i, '').replace(/_/g, ' ') : 'Result Viewer';

    return (
        <Drawer.Root open={isOpen} onOpenChange={onClose}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
                <Drawer.Content className="bg-background flex flex-col rounded-t-[20px] h-[85vh] mt-24 fixed bottom-0 inset-x-0 mx-auto w-full max-w-4xl z-[200] border-t border-border outline-none shadow-2xl">
                    <Drawer.Title className="sr-only">{displayTitle}</Drawer.Title>
                    <Drawer.Description className="sr-only">Detailed view of the selected result</Drawer.Description>
                    <div className="flex items-center justify-between p-4 bg-background/95 backdrop-blur border-b border-border z-50 rounded-t-[20px]">
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-muted-foreground/20" />

                        <div className="mt-2 text-left min-w-0">
                            <h2 className="text-foreground font-semibold truncate max-w-[200px] sm:max-w-md text-base">
                                {displayTitle}
                            </h2>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                            {/* Controls */}
                            {(type === 'flowchart' || type === 'image') && (
                                <>
                                    {viewMode === 'preview' && (
                                        <div className="flex items-center gap-1 mr-2 px-2 py-1 bg-secondary/50 rounded-lg">
                                            <button
                                                onClick={() => { setZoom(type === 'image' ? 1 : 2.5); setPan({ x: 0, y: 0 }); }}
                                                className="px-2 py-1 text-xs font-medium hover:bg-background rounded-md transition-colors text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50"
                                                title="Reset View"
                                            >
                                                Reset
                                            </button>
                                            <div className="w-px h-4 bg-border/50 mx-1" />
                                            <button
                                                onClick={() => setZoom(z => Math.max(0.2, z - 0.25))}
                                                className="p-1 hover:bg-background rounded-md transition-colors"
                                                title="Zoom Out"
                                            >
                                                <ZoomOut size={16} />
                                            </button>
                                            <span className="text-xs font-medium w-8 text-center">{Math.round(zoom * 100)}%</span>
                                            <button
                                                onClick={() => setZoom(z => Math.min(5, z + 0.25))}
                                                className="p-1 hover:bg-background rounded-md transition-colors"
                                                title="Zoom In"
                                            >
                                                <ZoomIn size={16} />
                                            </button>
                                        </div>
                                    )}
                                    {type === 'flowchart' && (
                                        <button
                                            onClick={() => setViewMode(viewMode === 'preview' ? 'code' : 'preview')}
                                            className={`p-2 rounded-lg transition-all ${viewMode === 'code' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                                            title={viewMode === 'preview' ? "View Code" : "View Diagram"}
                                        >
                                            <Code size={18} />
                                        </button>
                                    )}
                                </>
                            )}

                            <button
                                onClick={() => setShowInfo(!showInfo)}
                                className={`p-2 rounded-lg transition-all ${showInfo ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                                title="File Info"
                                style={{ display: type === 'email' ? 'none' : 'block' }}
                            >
                                <Info size={18} />
                            </button>
                            <button
                                onClick={handleDownload}
                                className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all box-border"
                                title="Download"
                                style={{ display: type === 'email' ? 'none' : 'block' }}
                            >
                                <Download size={18} />
                            </button>
                            <button
                                className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all box-border cursor-not-allowed opacity-50"
                                title="Delete (Disabled)"
                                style={{ display: type === 'email' ? 'none' : 'block' }}
                            >
                                <Trash2 size={18} />
                            </button>
                            <button
                                onClick={() => onClose(false)}
                                className="p-2 rounded-lg hover:bg-secondary transition-all text-muted-foreground hover:text-foreground"
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <AnimatePresence>
                        {showInfo && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="border-b border-border bg-muted/30 overflow-hidden shrink-0"
                            >
                                <div className="p-4 flex gap-8 text-sm">
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Type</p>
                                        <p className="font-semibold capitalize">{type}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Created</p>
                                        <p className="font-medium">Just now</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Size</p>
                                        <p className="font-medium">{content?.length || 0} chars</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <div className="flex-1 w-full h-full overflow-hidden bg-background text-foreground relative">
                        {(type === 'flowchart' || type === 'image') && viewMode === 'preview' ? (
                            <div
                                className={`flex ${type === 'flowchart' ? 'items-start pt-20' : 'items-center'} justify-center w-full h-full overflow-hidden bg-dot-pattern`}
                                onWheel={handleWheel}
                                style={{ cursor: 'default' }}
                            >
                                {type === 'image' ? (
                                    <img
                                        src={content}
                                        alt={title}
                                        className="origin-center select-none pointer-events-none max-w-none"
                                        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                                        draggable={false}
                                    />
                                ) : renderError ? (
                                    <div className="text-destructive p-4 border border-destructive/20 bg-destructive/5 rounded-lg text-center select-text cursor-default">
                                        <AlertCircle className="mx-auto mb-2" />
                                        <p>{renderError}</p>
                                        <p className="text-xs mt-2 text-muted-foreground">Try switching to code view to inspect the error.</p>
                                    </div>
                                ) : svgContent ? (
                                    <div
                                        className={`${type === 'flowchart' ? 'origin-top' : 'origin-center'} select-none pointer-events-none`}
                                        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                                        dangerouslySetInnerHTML={{ __html: svgContent }}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-muted-foreground select-none">
                                        <Loader2 className="animate-spin" />
                                        <p>Rendering Flowchart...</p>
                                    </div>
                                )}

                                {/* Keyboard shortcut hints - Arrows Only (Interactive) */}
                                <div className="absolute top-1 right-4 p-2 flex flex-col items-center gap-1 z-10 text-muted-foreground/70">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setPan(prev => ({ ...prev, y: prev.y + (40 / zoom) })); }}
                                        className="w-8 h-8 flex items-center justify-center border border-border rounded bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors shadow-sm cursor-pointer"
                                        title="Pan Up"
                                    >
                                        <ArrowUp size={16} />
                                    </button>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setPan(prev => ({ ...prev, x: prev.x + (40 / zoom) })); }}
                                            className="w-8 h-8 flex items-center justify-center border border-border rounded bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors shadow-sm cursor-pointer"
                                            title="Pan Left"
                                        >
                                            <ArrowLeft size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setPan(prev => ({ ...prev, y: prev.y - (40 / zoom) })); }}
                                            className="w-8 h-8 flex items-center justify-center border border-border rounded bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors shadow-sm cursor-pointer"
                                            title="Pan Down"
                                        >
                                            <ArrowDown size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setPan(prev => ({ ...prev, x: prev.x - (40 / zoom) })); }}
                                            className="w-8 h-8 flex items-center justify-center border border-border rounded bg-secondary/50 hover:bg-secondary hover:text-foreground transition-colors shadow-sm cursor-pointer"
                                            title="Pan Right"
                                        >
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : type === 'html' ? (
                            <div className="h-full w-full overflow-auto bg-background p-4 flex items-center justify-center">
                                <div dangerouslySetInnerHTML={{ __html: content }} className="w-full h-full flex items-center justify-center" />
                            </div>
                        ) : type === 'email' ? (
                            <div className=" w-full h-full flex flex-col">
                                <EmailViewer emailData={content} />
                            </div>
                        ) : (type === 'ppt' || type === 'presentation') ? (
                            <div className="w-full h-full overflow-hidden bg-background flex flex-col items-center justify-center relative">
                                <iframe
                                    src={`https://docs.google.com/gview?url=${encodeURIComponent(content)}&embedded=true`}
                                    className="w-full h-full border-0 outline-none bg-transparent z-10"
                                    title="Presentation Preview"
                                />
                                {/* Fallback/Loading message inside container if needed, though iframe handles it */}
                            </div>
                        ) : (
                            <div className="h-full overflow-auto p-4 sm:p-8">
                                <div className="prose prose-sm md:prose-base dark:prose-invert max-w-4xl mx-auto prose-headings:font-semibold prose-a:text-blue-500 hover:prose-a:underline prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-foreground break-words leading-relaxed font-sans">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {content ? (viewMode === 'code' ? '```mermaid\n' + content + '\n```' : content) : '*No content available*'}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
};

export default ResultDrawer;