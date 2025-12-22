import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { Drawer } from 'vaul';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { TextShimmer } from '../components/motion-primitives/text-shimmer';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import { supabase } from '../supabase';
import { logTransaction, updateCreditsWithLog } from '../utils/logTransaction';
import { apiCache } from '../utils/apiCache';
import {
    Loader2, X, Download, ZoomIn, ZoomOut, Code, Info,
    Hand, Trash2, Search as SearchIcon, BookOpen, FileText,
    File, ChevronDown, Check, Send, Sparkles, MessageSquare,
    AlertCircle, Eye, ImageIcon, Play, Square, MoreHorizontal, Maximize2,
    Paperclip, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, LogIn, Mail, Edit2, Save, RotateCcw,
    Copy, CheckCheck
} from 'lucide-react';

// Skeleton loading components
const FlowchartSkeleton = () => (
    <div className="w-full max-w-[300px] h-[200px] bg-secondary/50 rounded-lg border border-border animate-pulse flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="text-muted-foreground animate-spin" />
            <span className="text-xs text-muted-foreground">Generating flowchart...</span>
        </div>
    </div>
);

const ChartSkeleton = () => (
    <div className="w-full max-w-[600px] h-[300px] bg-secondary/50 rounded-lg border border-border animate-pulse flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="text-muted-foreground animate-spin" />
            <span className="text-xs text-muted-foreground">Creating charts...</span>
        </div>
    </div>
);

const ImageSkeleton = () => (
    <div className="w-full h-64 bg-secondary/30 rounded-xl border border-border overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-background/50 backdrop-blur-sm rounded-full shadow-lg">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <div className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-foreground/80">Dreaming up image...</span>
                <span className="text-[10px] text-muted-foreground">This magic takes a moment</span>
            </div>
        </div>
    </div>
);

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

// Flowchart Renderer Component with Modal
const FlowchartRenderer = ({ flowchart, index, mermaidInitialized, onClick }) => {
    const [svgContent, setSvgContent] = useState(null);
    const [error, setError] = useState(null);
    const [isRendering, setIsRendering] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const renderDiagram = async () => {
            try {
                setIsRendering(true);
                setError(null);

                const codeToRender = flowchart.trim();
                const uniqueId = `mermaid-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Suppress Mermaid's error output
                const originalError = console.error;
                console.error = (...args) => {
                    const msg = args.join(' ');
                    if (msg.includes('Syntax error') || msg.includes('mermaid')) {
                        return;
                    }
                    originalError.apply(console, args);
                };

                try {
                    if (mermaidInitialized && !mermaidInitialized.current) {
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
                        if (mermaidInitialized) mermaidInitialized.current = true;
                    }

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
    }, [flowchart, index, mermaidInitialized]);

    return (
        <div className="w-full relative group">
            <button
                onClick={onClick}
                className="w-full flex flex-col relative isolate"
            >
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border/50 shadow-sm z-10 bg-muted/20 flex items-start justify-center pt-4">
                    <div className="absolute inset-0 bg-muted/20" />
                    {isRendering ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 size={24} className="text-muted-foreground animate-spin" />
                            <span className="text-xs text-muted-foreground">Rendering...</span>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-2 text-destructive">
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

                // Pre-process code to clean up common issues (Same as FlowchartRenderer)
                let cleanCode = content
                    .replace(/\[\s*"([^"]*)"\s*\]/g, '["$1"]')
                    .replace(/'/g, '');

                const { svg } = await mermaid.render(id, cleanCode);

                if (isMounted) {
                    setSvgContent(svg);
                    setRenderError(null);
                }
            } catch (err) {
                // Retry logic (Same as FlowchartRenderer)
                try {
                    const id = `mermaid-drawer-${Date.now()}-retry`;
                    const simpleCode = content.replace(/\|([^|]*)\|/g, (match, p1) => `|${p1.replace(/['"\[\]]/g, '')}|`);
                    const { svg } = await mermaid.render(id, simpleCode);
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
                        ) : (
                            <div className="h-full overflow-auto p-4 sm:p-8">
                                <div className="prose prose-sm md:prose-base dark:prose-invert max-w-4xl mx-auto prose-headings:font-semibold prose-a:text-blue-500 hover:prose-a:underline prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-code:text-foreground">
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



// Skeleton components moved to top

// WhatsApp Preview Component
const WhatsAppPreviewWithState = ({ previewData, taskIndex }) => {
    const [message, setMessage] = useState(previewData?.message || '');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [cancelled, setCancelled] = useState(false);
    const [error, setError] = useState(null);
    const [rewriting, setRewriting] = useState(false);

    const handleSend = async (data) => {
        setSending(true);
        setError(null);
        try {
            const sendPayload = {
                operation: 'send_message',
                phone_number: data.recipient,
                message: data.message
            };

            const response = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sendPayload)
            });

            const result = await response.json();

            if (result.status === 'success') {
                console.log('✅ WhatsApp sent successfully!', result);
                setSent(true);
            } else {
                console.error('❌ WhatsApp send failed:', result);
                setError(result.message || 'Failed to send');
            }
        } catch (error) {
            console.error('Error sending WhatsApp:', error);
            setError('Network error. Please try again.');
        } finally {
            setSending(false);
        }
    };

    return <WhatsAppPreview
        previewData={{ ...previewData, message }}
        onSend={(data) => handleSend({ ...data, message })}
        onCancel={() => setCancelled(true)}
        sending={sending}
        sent={sent}
        cancelled={cancelled}
        error={error}
        onRewrite={async () => {
            setRewriting(true);
            try {
                const response = await fetch('/api/whatsapp/rewrite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, tone: 'friendly' })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    setMessage(data.rewritten);
                }
            } catch (error) {
                console.error('Rewrite failed:', error);
            } finally {
                setRewriting(false);
            }
        }}
        rewriting={rewriting}
        message={message}
        setMessage={setMessage}
    />;
};

const WhatsAppPreview = ({ previewData, onSend, onCancel, onRewrite, sending = false, sent = false, cancelled = false, error = null, rewriting = false, message, setMessage }) => {

    // If cancelled, show minimal cancelled state
    if (cancelled) {
        return (
            <div className="p-4 bg-secondary/30 rounded-lg border border-border space-y-3">
                <div className="flex items-center gap-2 p-2 bg-muted rounded text-muted-foreground text-sm">
                    <X size={16} />
                    <span>WhatsApp message cancelled</span>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 bg-secondary/30 rounded-lg border border-border space-y-3">
            <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-green-500" />
                <span className="text-sm font-medium">WhatsApp Message Preview</span>
            </div>

            {/* Recipient Info */}
            <div className="p-2 bg-background rounded border border-border/50">
                <div className="text-xs text-muted-foreground">To:</div>
                <div className="text-sm font-medium">
                    {previewData?.recipient_name || previewData?.recipient || 'Unknown'}
                </div>
                {previewData?.recipient && previewData?.recipient_name && (
                    <div className="text-xs text-muted-foreground">{previewData.recipient}</div>
                )}
            </div>

            {/* Message Content */}
            <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Message:</div>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full p-3 bg-background rounded border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                    rows={4}
                    placeholder="Enter your message..."
                />
            </div>

            {/* Status Messages */}
            {sent && (
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded text-green-500 text-sm">
                    <Check size={16} />
                    <span>✓ Message sent successfully!</span>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-sm">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onSend({ ...previewData, message })}
                    disabled={sending || sent || !message.trim()}
                    className={`flex items-center gap-2 px-4 py-2 ${sent ? 'bg-green-600' : 'bg-green-500 hover:bg-green-600'} disabled:bg-green-500/50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors`}
                >
                    {sending ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            Sending...
                        </>
                    ) : sent ? (
                        <>
                            <Check size={14} />
                            Sent ✓
                        </>
                    ) : (
                        <>
                            <Send size={14} />
                            Send via WhatsApp
                        </>
                    )}
                </button>

                <button
                    onClick={onRewrite}
                    disabled={rewriting || sending || sent || !message.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm rounded-lg transition-colors"
                    title="Rewrite with AI"
                >
                    {rewriting ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            Rewriting...
                        </>
                    ) : (
                        <>
                            <Sparkles size={14} />
                            Rewrite
                        </>
                    )}
                </button>

                <button
                    onClick={onCancel}
                    disabled={sending || sent}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-500 text-sm rounded-lg transition-colors"
                    title="Cancel and dismiss"
                >
                    <X size={14} />
                    Cancel
                </button>
            </div>

            {/* Status Messages */}
            {!previewData?.service_ready && (
                <div className="text-xs text-orange-500 flex items-center gap-1">
                    <AlertCircle size={12} />
                    WhatsApp service not running. Start it with: cd Whatsapp-Agent && npm start
                </div>
            )}
        </div>
    );
};



// Image component with loading skeleton
const ImageWithLoader = ({ src, alt, className, isChart = false }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    return (
        <div className="relative">
            {isLoading && !hasError && (
                <div className={`absolute inset-0 bg-secondary/30 rounded-lg animate-pulse flex items-center justify-center ${className}`}>
                    <Loader2 size={24} className="text-muted-foreground animate-spin" />
                </div>
            )}
            <img
                src={src}
                alt={alt}
                className={`${className} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                }}
                style={{ display: hasError ? 'none' : 'block' }}
            />
            {hasError && (
                <div className={`flex items-center justify-center ${className} bg-secondary/50 rounded-lg border border-border`}>
                    <span className="text-xs text-muted-foreground">Failed to load {isChart ? 'chart' : 'image'}</span>
                </div>
            )}
        </div>
    );
};

// Function to download file properly
const downloadFile = async (url, filename) => {
    try {
        // Add download parameter to URL to force download on server side
        const downloadUrl = url.includes('?') ? `${url}&download=true` : `${url}?download=true`;

        // Try fetch approach with blob
        const response = await fetch(downloadUrl, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Clean up after a short delay
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        }, 100);
    } catch (error) {
        console.error('Download failed, trying alternative method:', error);

        // Fallback: Try using download attribute directly with server-side download
        try {
            const downloadUrl = url.includes('?') ? `${url}&download=true` : `${url}?download=true`;
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename;
            link.setAttribute('download', filename);
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();

            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
        } catch (fallbackError) {
            console.error('Both download methods failed:', fallbackError);
            // Last resort: open in new tab
            window.open(url, '_blank');
        }
    }
};

// Simple markdown to HTML converter with table support
const markdownToHtml = (markdown) => {
    if (!markdown) return '';

    let html = markdown;

    // Remove any file references that might be embedded (like "research_result.md" or similar)
    html = html.replace(/\b\w+_result\.(md|txt)\b/gi, '');
    html = html.replace(/\bresearch_result\.md\b/gi, '');
    html = html.replace(/\bdocument\.md\b/gi, '');
    html = html.replace(/\bcase_study\.md\b/gi, '');

    // Process tables first (before other markdown processing)
    // Match markdown tables: | col1 | col2 | col3 |
    // This regex matches: header row, separator row (with dashes), and data rows
    const tableRegex = /(\|.+\|\s*\n\|[:\s\-|]+\|\s*\n(?:\|.+\|\s*\n?)+)/g;
    html = html.replace(tableRegex, (match) => {
        const lines = match.trim().split('\n').filter(line => line.trim());
        if (lines.length < 2) return match;

        // First line is header
        const headerRow = lines[0];
        const separatorRow = lines[1];
        const dataRows = lines.slice(2);

        // Parse header - split by | and filter out empty cells
        const headers = headerRow.split('|')
            .map(cell => cell.trim())
            .filter(cell => cell && !cell.match(/^[\s\-:]+$/)); // Filter out separator-like cells

        if (headers.length === 0) return match;

        // Build table HTML
        let tableHtml = '<div class="overflow-x-auto my-4"><table class="min-w-full border-collapse border border-border">';

        // Header row
        tableHtml += '<thead><tr class="bg-secondary/50">';
        headers.forEach(header => {
            tableHtml += `<th class="border border-border px-4 py-2 text-left font-semibold text-foreground">${header}</th>`;
        });
        tableHtml += '</tr></thead>';

        // Data rows
        if (dataRows.length > 0) {
            tableHtml += '<tbody>';
            dataRows.forEach(row => {
                const cells = row.split('|')
                    .map(cell => cell.trim())
                    .filter(cell => cell && !cell.match(/^[\s\-:]+$/)); // Filter out separator-like cells

                if (cells.length > 0) {
                    tableHtml += '<tr class="hover:bg-secondary/30">';
                    // Ensure we have the same number of cells as headers
                    for (let i = 0; i < headers.length; i++) {
                        const cellContent = cells[i] || '';
                        tableHtml += `<td class="border border-border px-4 py-2 text-foreground/90">${cellContent}</td>`;
                    }
                    tableHtml += '</tr>';
                }
            });
            tableHtml += '</tbody>';
        }
        tableHtml += '</table></div>';

        return tableHtml;
    });

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2 text-foreground">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3 text-foreground">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4 text-foreground">$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>');

    // Images - handle before other processing
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        // Handle relative URLs by prepending the backend URL
        const imageUrl = url.startsWith('http') ? url : `http://20.197.35.140:5001${url}`;
        return `<img src="${imageUrl}" alt="${alt || ''}" class="max-w-full h-auto rounded-lg my-4 border border-border" />`;
    });

    // Mermaid code blocks - extract and render (handle before other processing)
    html = html.replace(/```mermaid\n([\s\S]*?)```/g, (match, mermaidCode) => {
        const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Store the code in a data attribute and display it in a pre tag
        // We'll render it properly in the useEffect
        const code = mermaidCode.trim();
        // Escape HTML entities in the code for display, but keep it in data attribute for rendering
        const escapedForDisplay = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="mermaid-container my-4" data-mermaid-code="${code.replace(/"/g, '&quot;')}"><pre class="mermaid bg-secondary/30 p-4 rounded-lg border border-border overflow-x-auto">${escapedForDisplay}</pre></div>`;
    });

    // Bullet points
    html = html.replace(/^[-*] (.*$)/gim, '<li class="ml-4 mb-1">$1</li>');
    // Wrap contiguous li elements in ul
    html = html.replace(/((?:<li class="ml-4 mb-1">.*?<\/li>\n?)+)/g, '<ul class="list-disc ml-6 mb-3 space-y-1">$1</ul>');

    // Numbered lists
    html = html.replace(/^\d+\. (.*$)/gim, '<li class="ml-4 mb-1">$1</li>');

    // Paragraphs (lines that aren't already wrapped and aren't table rows)
    html = html.split('\n').map(line => {
        const trimmed = line.trim();
        // Skip if it's a table row, header, list item, or empty
        if (!trimmed ||
            line.match(/^<[hult]/) ||
            line.match(/^<\/[hult]/) ||
            line.match(/^<li/) ||
            line.match(/^<table/) ||
            line.match(/^<\/table/) ||
            line.match(/^<thead/) ||
            line.match(/^<\/thead/) ||
            line.match(/^<tbody/) ||
            line.match(/^<\/tbody/) ||
            line.match(/^<tr/) ||
            line.match(/^<\/tr/) ||
            line.match(/^<th/) ||
            line.match(/^<\/th/) ||
            line.match(/^<td/) ||
            line.match(/^<\/td/) ||
            line.match(/^\|.*\|$/) // Markdown table row
        ) {
            return line;
        }
        return `<p class="mb-3 leading-relaxed">${line}</p>`;
    }).join('\n');

    // Clean up multiple consecutive <p> tags
    html = html.replace(/(<\/p>\s*)+/g, '</p>');

    return html;
};

// Component to render markdown content with mermaid support
const MarkdownContent = ({ content, renderedContent, isMarkdown }) => {
    const contentRef = useRef(null);

    useEffect(() => {
        if (!isMarkdown || !contentRef.current) return;

        // Find all mermaid containers and render them
        const mermaidContainers = contentRef.current.querySelectorAll('.mermaid-container');

        mermaidContainers.forEach(async (container) => {
            // Get the code from data attribute
            const mermaidCode = container.getAttribute('data-mermaid-code');
            if (!mermaidCode) return;

            // Check if already rendered
            if (container.querySelector('.mermaid-rendered')) return;

            try {
                const uniqueId = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const cleanCode = sanitizeMermaidCode(mermaidCode);
                const { svg } = await mermaid.render(uniqueId, cleanCode);

                // Replace the container content with the rendered SVG
                const svgDiv = document.createElement('div');
                svgDiv.innerHTML = svg;
                svgDiv.className = 'mermaid-rendered bg-white rounded-lg p-4 border border-border overflow-auto';
                container.innerHTML = '';
                container.appendChild(svgDiv);
            } catch (error) {
                console.error('Error rendering mermaid:', error);
                // Keep the original pre element if rendering fails
            }
        });
    }, [isMarkdown, renderedContent]);

    return (
        <div className="px-3 pb-3 border-t border-border pt-3">
            <div className={`text-sm text-foreground/90 max-h-[600px] overflow-y-auto p-4 bg-background/50 rounded border border-border ${isMarkdown ? 'prose prose-sm max-w-none' : 'whitespace-pre-wrap'
                }`}>
                {isMarkdown ? (
                    <div
                        ref={contentRef}
                        dangerouslySetInnerHTML={{ __html: renderedContent }}
                        className="markdown-content"
                        style={{
                            lineHeight: '1.7',
                            color: 'inherit'
                        }}
                    />
                ) : (
                    content
                )}
            </div>
        </div>
    );
};

const FileBox = ({ type, filename, content }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const getIcon = () => {
        switch (type) {
            case 'research': return <SearchIcon size={20} className="text-indigo-500" />;
            case 'case_study': return <BookOpen size={20} className="text-pink-500" />;
            case 'document': return <FileText size={20} className="text-purple-500" />;
            case 'summary': return <FileText size={20} className="text-cyan-500" />;
            case 'brainstorm': return <FileText size={20} className="text-orange-500" />;
            default: return <File size={20} className="text-muted-foreground" />;
        }
    };

    const getExtension = () => {
        if (filename.includes('.')) {
            return filename.split('.').pop();
        }
        return type === 'case_study' || type === 'document' || type === 'research' ? 'md' : 'txt';
    };

    const isMarkdown = type === 'research' || type === 'case_study' || type === 'document' || type === 'summary' || filename.endsWith('.md');
    const renderedContent = isMarkdown ? markdownToHtml(content) : content;

    return (
        <div className="border border-border rounded-lg bg-card hover:bg-secondary/50 transition-colors">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-3 flex items-center gap-3 text-left"
            >
                <div className="flex-shrink-0">
                    {getIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{filename}</div>
                    <div className="text-xs text-muted-foreground">.{getExtension()}</div>
                </div>
                <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>
            {isExpanded && (
                <MarkdownContent
                    content={content}
                    renderedContent={renderedContent}
                    isMarkdown={isMarkdown}
                />
            )}
        </div>
    );
};

const EventViewer = ({ eventData }) => {
    const formatDate = (dateStr) => {
        if (!dateStr) return 'Not specified';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: eventData.all_day ? undefined : '2-digit',
                minute: eventData.all_day ? undefined : '2-digit'
            });
        } catch (e) {
            return dateStr;
        }
    };

    const getColorClass = (color) => {
        const colorMap = {
            'sky': 'bg-blue-500/20 border-blue-500/40 text-blue-600',
            'amber': 'bg-amber-500/20 border-amber-500/40 text-amber-600',
            'orange': 'bg-orange-500/20 border-orange-500/40 text-orange-600',
            'emerald': 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600',
            'violet': 'bg-violet-500/20 border-violet-500/40 text-violet-600',
            'rose': 'bg-rose-500/20 border-rose-500/40 text-rose-600'
        };
        return colorMap[color] || colorMap['sky'];
    };

    return (
        <div className="space-y-3 w-full">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                    <div className={`inline-block px-3 py-1.5 rounded-full border text-sm font-medium mb-3 ${getColorClass(eventData.color || 'sky')}`}>
                        {eventData.title || 'New Event'}
                    </div>
                </div>
            </div>

            <div className="bg-background border border-border rounded-lg overflow-hidden">
                <div className="p-4 space-y-3">
                    {eventData.description && (
                        <div>
                            <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Description</div>
                            <div className="text-sm text-foreground/90">{eventData.description}</div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Start</div>
                            <div className="text-sm text-foreground font-medium">{formatDate(eventData.start_time)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">End</div>
                            <div className="text-sm text-foreground font-medium">{formatDate(eventData.end_time)}</div>
                        </div>
                    </div>

                    {eventData.all_day && (
                        <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-600 dark:text-blue-400">
                            📅 All-day event
                        </div>
                    )}

                    {eventData.location && (
                        <div>
                            <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wide">Location</div>
                            <div className="text-sm text-foreground/90">📍 {eventData.location}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const EmailViewer = ({ emailData }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedEmail, setEditedEmail] = useState(emailData);
    const [plainTextBody, setPlainTextBody] = useState('');
    const [originalPlainText, setOriginalPlainText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [sendStatus, setSendStatus] = useState(null);



    // Extract plain text from HTML for editing
    const extractPlainText = (html) => {
        if (!html) return '';
        // Remove code block markers
        let text = html.replace(/```html\n?/gi, '').replace(/```\n?/g, '');
        // Create a temporary DOM element to extract text
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        // Get text content and clean up
        let plainText = tempDiv.textContent || tempDiv.innerText || '';
        // Clean up extra whitespace
        plainText = plainText.replace(/\n{3,}/g, '\n\n').trim();
        return plainText;
    };

    const cleanHTML = (html) => {
        if (!html) return '';
        // Remove code block markers
        let cleaned = html.replace(/```html\n?/gi, '').replace(/```\n?/g, '');
        // Remove escaped HTML entities
        cleaned = cleaned.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        // Remove style tags
        cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        // Remove DOCTYPE, html, head
        cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
        cleaned = cleaned.replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '');
        cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        return cleaned.trim();
    };

    // Initialize state when emailData changes
    useEffect(() => {
        if (emailData) {
            setEditedEmail(emailData);
            const initialPlainText = extractPlainText(emailData.body);
            setPlainTextBody(initialPlainText);
            setOriginalPlainText(initialPlainText);
        }
    }, [emailData]);

    const handleSend = async () => {
        if (!editedEmail.to || !editedEmail.subject || !editedEmail.body) {
            setSendStatus({
                type: 'error',
                message: 'Please fill in all fields (To, Subject, Body)'
            });
            return;
        }

        setIsSending(true);
        setSendStatus(null);

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: editedEmail.to,
                    subject: editedEmail.subject,
                    body: editedEmail.body
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setIsSent(true);
                setSendStatus({
                    type: 'success',
                    message: 'Email sent successfully!'
                });
            } else {
                setSendStatus({
                    type: 'error',
                    message: data.error || 'Failed to send email. Please check configuration.'
                });
            }
        } catch (error) {
            setSendStatus({
                type: 'error',
                message: 'Error sending email: ' + error.message
            });
        } finally {
            setIsSending(false);
        }
    };

    const toggleEdit = () => {
        // Redundant with inline editing, but kept compatibility if called elsewhere
    };

    return (
        <div className="w-full h-full bg-background flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Mail size={18} />
                    </div>
                    <span className="font-semibold text-foreground">Email Draft</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mr-2">
                        <Eye size={14} />
                        <span>Previewing & Editing</span>
                    </div>
                    <button
                        onClick={handleSend}
                        disabled={isSending}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {isSending ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                Send
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Status Message */}
            {sendStatus && (
                <div className={`px-6 py-2 text-xs font-medium flex items-center gap-2 ${sendStatus.type === 'success'
                    ? 'bg-green-500/10 text-green-600 border-b border-green-500/10'
                    : 'bg-red-500/10 text-red-600 border-b border-red-500/10'
                    }`}>
                    {sendStatus.type === 'success' ? <Check size={12} /> : <AlertCircle size={12} />}
                    {sendStatus.message}
                </div>
            )}

            {/* Content Form - Always Editable */}
            <div className="p-6 space-y-6 flex-1 overflow-auto">
                <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto w-full">

                    {/* To Field */}
                    <div className="group relative">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide ml-1 mb-1.5 block">To</label>
                        <div className="relative">
                            <input
                                type="email"
                                value={editedEmail.to}
                                onChange={(e) => setEditedEmail({ ...editedEmail, to: e.target.value })}
                                className="w-full px-4 py-3 bg-secondary/30 border border-border/50 hover:border-border focus:border-primary/50 focus:bg-secondary/50 rounded-xl text-sm transition-all outline-none font-medium text-foreground pr-10"
                                placeholder="recipient@example.com"
                            />
                            <Edit2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none group-focus-within:text-primary/70 transition-colors" />
                        </div>
                    </div>

                    {/* Subject Field */}
                    <div className="group relative">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide ml-1 mb-1.5 block">Subject</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={editedEmail.subject}
                                onChange={(e) => setEditedEmail({ ...editedEmail, subject: e.target.value })}
                                className="w-full px-4 py-3 bg-secondary/30 border border-border/50 hover:border-border focus:border-primary/50 focus:bg-secondary/50 rounded-xl text-sm transition-all outline-none font-semibold text-foreground pr-10"
                                placeholder="Email subject"
                            />
                            <Edit2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none group-focus-within:text-primary/70 transition-colors" />
                        </div>
                    </div>

                    {/* Body Field - Acts as plain text editor but looks like preview */}
                    <div className="group relative">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide ml-1 mb-1.5 block">Body</label>
                        <div className="relative">
                            <textarea
                                value={plainTextBody}
                                onChange={(e) => setPlainTextBody(e.target.value)}
                                className="w-full px-5 py-5 bg-card/60 border border-border/50 hover:border-border focus:border-primary/50 focus:bg-card/80 rounded-xl text-sm transition-all outline-none min-h-[400px] resize-none leading-relaxed shadow-sm font-sans"
                                placeholder="Write your email content here..."
                            />
                            <Edit2 size={14} className="absolute right-4 top-4 text-muted-foreground/50 pointer-events-none group-focus-within:text-primary/70 transition-colors" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Clickable box for images/flowcharts/charts in compact view
const MediaBox = ({ type, onClick, onDownload, title }) => {
    const isFlowchart = type === 'flowchart';
    const isImage = type === 'image';
    const isChart = type === 'chart';

    return (
        <div className="border border-border/50 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all cursor-pointer group shadow-sm">
            <div
                onClick={onClick}
                className="w-full p-3.5 flex items-center gap-3.5"
            >
                <div className="p-2.5 bg-background rounded-lg border border-border/50 shadow-sm transition-transform group-hover:scale-105 flex-shrink-0">
                    {isFlowchart ? (
                        <FileText size={20} className="text-primary" />
                    ) : isChart ? (
                        <ImageIcon size={20} className="text-primary" />
                    ) : (
                        <ImageIcon size={20} className="text-primary" />
                    )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="text-sm font-semibold text-foreground line-clamp-1">
                        {title || (isFlowchart ? 'Flowchart' : isChart ? 'Chart' : 'Image')}
                    </div>
                    <div className="text-[10px] w-fit font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border border-primary/20 bg-primary/10 text-primary">
                        {isFlowchart ? 'MERMAID' : 'PNG'}
                    </div>
                </div>

            </div>
        </div>
    );
};

// Helper function to generate filename from task text
const generateFilename = (taskText, agentType, defaultName) => {
    if (!taskText || taskText.trim() === '') {
        return defaultName;
    }

    // Clean and sanitize the task text for filename
    let filename = taskText
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_+/g, '_') // Replace multiple underscores with single
        .substring(0, 50); // Limit length

    // Remove trailing underscores
    filename = filename.replace(/_+$/, '');

    if (!filename || filename.length < 3) {
        return defaultName;
    }

    // Add appropriate extension based on agent type
    let extension = 'txt';
    if (agentType === 'research' || agentType === 'document' || agentType === 'case_study') {
        extension = 'md';
    } else if (agentType === 'flowchart') {
        extension = 'mermaid';
    }
    return `${filename}.${extension}`;
};

const TaskTimeline = ({ tasks, results, isProcessing, onModalToggle, setResultDrawerState, setResultDrawerOpen }) => {
    const [completedTasks, setCompletedTasks] = useState(new Set());

    // Track sending status by result ID or index to allow parallel sending
    const [sendingEmails, setSendingEmails] = useState({}); // { [index]: { status: 'idle'|'sending'|'success'|'error', message: '' } }

    const handleDirectEmailSend = async (index, result) => {
        if (!result.to || !result.subject || !result.body) {
            setSendingEmails(prev => ({
                ...prev,
                [index]: { status: 'error', message: 'Missing fields' }
            }));
            return;
        }

        setSendingEmails(prev => ({
            ...prev,
            [index]: { status: 'sending', message: 'Sending...' }
        }));

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: result.to,
                    subject: result.subject,
                    body: result.body
                }),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setSendingEmails(prev => ({
                    ...prev,
                    [index]: { status: 'success', message: 'Sent!' }
                }));
                // Reset success message after 3 seconds
                setTimeout(() => {
                    setSendingEmails(prev => {
                        const newState = { ...prev };
                        delete newState[index];
                        return newState;
                    });
                }, 3000);
            } else {
                setSendingEmails(prev => ({
                    ...prev,
                    [index]: { status: 'error', message: 'Failed' }
                }));
            }
        } catch (error) {
            setSendingEmails(prev => ({
                ...prev,
                [index]: { status: 'error', message: 'Error' }
            }));
        }
    };
    const [processingTasks, setProcessingTasks] = useState(new Set());
    const mermaidInitialized = useRef(false);

    useEffect(() => {
        // Initialize Mermaid once
        if (!mermaidInitialized.current) {
            // Suppress Mermaid error messages
            const originalLogError = console.error;
            console.error = (...args) => {
                // Filter out Mermaid syntax error messages
                const message = args.join(' ');
                if (
                    (message.includes('Syntax error') && message.includes('mermaid')) ||
                    message.includes('Parse error on line') ||
                    message.includes('Error executing queue') ||
                    message.includes("Expecting 'SQE'")
                ) {
                    return; // Suppress Mermaid syntax errors
                }
                originalLogError.apply(console, args);
            };

            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose',
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true,
                    curve: 'basis'
                },
                logLevel: 'error' // Only show critical errors
            });
            mermaidInitialized.current = true;
        }
    }, []);

    const [capturedResults, setCapturedResults] = useState({});

    useEffect(() => {
        if (isProcessing && tasks.length > 0 && processingTasks.size === 0 && completedTasks.size === 0) {
            // Start ALL tasks immediately for parallel processing
            setProcessingTasks(new Set(tasks.map((_, i) => i)));
        }
    }, [tasks, isProcessing]);

    useEffect(() => {
        // If the main process has stopped (stream finished), force complete everything
        if (!isProcessing && tasks.length > 0) {
            // Prevent infinite loop by checking if updates are actually needed
            if (completedTasks.size !== tasks.length || processingTasks.size !== 0) {
                setCompletedTasks(new Set(tasks.map((_, i) => i)));
                setProcessingTasks(new Set());
            }
            return;
        }

        if (results && Object.keys(results).length > 0) {
            // Check ALL processing tasks, not just one
            const processingArray = Array.from(processingTasks);

            processingArray.forEach(taskIndex => {
                if (taskIndex >= tasks.length) return;

                const task = tasks[taskIndex];
                const agentName = task.agent === 'flowchart' ? 'Flowchart Agent' :
                    task.agent === 'email' ? 'Email Agent' :
                        task.agent === 'research' ? 'Research Agent' :
                            task.agent === 'image' ? 'Image Agent' :
                                task.agent === 'summary' ? 'Summary Agent' :
                                    task.agent === 'brainstorm' ? 'Brainstorm Agent' :
                                        task.agent === 'document' ? 'Document Agent' :
                                            task.agent === 'case_study' ? 'Case Study Agent' :
                                                task.agent === 'plotting' ? 'Plotting Agent' :
                                                    task.agent === 'checklist' ? 'Checklist Agent' :
                                                        task.agent === 'calendar' ? 'Calendar Agent' :
                                                            task.agent === 'daily_digest' ? 'Daily Digest Agent' :
                                                                task.agent === 'call' ? 'Call Agent' :
                                                                    task.agent === 'whatsapp' ? 'WhatsApp Agent' :
                                                                        task.agent === 'presentation' ? 'Presentation Agent' : 'AI Agent';

                // Try to get result by task index first (most specific), fall back to agent name
                const taskResultKey = `task_${taskIndex}`;
                const agentResultKey = agentName;
                const result = results[taskResultKey] || results[agentResultKey];

                const hasCapturedResult = capturedResults[taskIndex];

                // If we get a result for this task, capture it
                if (result && !result.error && !hasCapturedResult) {
                    // For parallel execution with task indices, we don't need staleness check
                    // Each task has its own index, so results won't collide
                    const usingTaskIndex = !!results[taskResultKey];
                    let isStale = false;

                    // Only check for staleness if we're using agent name (backward compatibility)
                    if (!usingTaskIndex) {
                        for (let i = taskIndex - 1; i >= 0; i--) {
                            if (tasks[i].agent === task.agent && completedTasks.has(i)) {
                                const prevResult = capturedResults[i];
                                if (prevResult && JSON.stringify(prevResult) === JSON.stringify(result)) {
                                    isStale = true;
                                }
                                break;
                            }
                        }
                    }

                    if (!isStale) {
                        // For image and plotting agents, wait until image_url/chart_url is available
                        const isImageAgent = task.agent === 'image';
                        const isPlottingAgent = task.agent === 'plotting';
                        const hasImageUrl = result.image_url && result.image_url.length > 0;
                        const hasChartUrl = result.chart_url && result.chart_url.length > 0;

                        // Only mark complete if:
                        // - Not an image/plotting agent, OR
                        // - Is an image agent AND has image_url, OR
                        // - Is a plotting agent AND has chart_url
                        const canComplete = (!isImageAgent && !isPlottingAgent) ||
                            (isImageAgent && hasImageUrl) ||
                            (isPlottingAgent && hasChartUrl);

                        if (canComplete) {
                            // Capture the result
                            setCapturedResults(prev => ({
                                ...prev,
                                [taskIndex]: { ...result }
                            }));

                            // Mark task as complete
                            setTimeout(() => {
                                setCompletedTasks(prev => new Set([...prev, taskIndex]));
                                setProcessingTasks(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(taskIndex);
                                    return newSet;
                                });
                            }, 300);
                        }
                    }
                }
            });
        }
    }, [results, tasks, processingTasks, isProcessing, completedTasks, capturedResults]);


    return (
        <div className="flex flex-col gap-0">
            {tasks.map((task, index) => {
                // Show all tasks immediately for parallel visualization
                const shouldShow = true;

                const isCompleted = completedTasks.has(index);
                const isProcessing = processingTasks.has(index) && !isCompleted;
                const isLast = index === tasks.length - 1;
                const agentName = task.agent === 'flowchart' ? 'Flowchart Agent' :
                    task.agent === 'email' ? 'Email Agent' :
                        task.agent === 'research' ? 'Research Agent' :
                            task.agent === 'image' ? 'Image Agent' :
                                task.agent === 'summary' ? 'Summary Agent' :
                                    task.agent === 'brainstorm' ? 'Brainstorm Agent' :
                                        task.agent === 'document' ? 'Document Agent' :
                                            task.agent === 'case_study' ? 'Case Study Agent' :
                                                task.agent === 'plotting' ? 'Plotting Agent' :
                                                    task.agent === 'checklist' ? 'Checklist Agent' :
                                                        task.agent === 'calendar' ? 'Calendar Agent' :
                                                            task.agent === 'daily_digest' ? 'Daily Digest Agent' :
                                                                task.agent === 'call' ? 'Call Agent' :
                                                                    task.agent === 'whatsapp' ? 'WhatsApp Agent' :
                                                                        task.agent === 'presentation' ? 'Presentation Agent' : 'AI Agent';

                // Find result for this agent
                // ALWAYS use task index for lookup to prevent duplicate results when multiple tasks use same agent
                const taskResultKey = `task_${index}`;
                const result = results?.[taskResultKey] || capturedResults[index];
                console.log(`[DEBUG] Rendering task ${index} (${task.agent}), result:`, result);

                return (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="flex gap-4 relative"
                    >
                        {/* Timeline Track */}
                        {/* Timeline Track - Only show if there are multiple tasks */}
                        {tasks.length > 1 && (
                            <div className="flex flex-col items-center shrink-0 w-4">
                                {/* Dot */}
                                <div className={`w-2 h-2 rounded-full z-10 mt-2 ${isCompleted ? 'bg-green-500' : isProcessing ? 'bg-primary animate-pulse' : 'bg-border'}`} />
                                {/* Line */}
                                {!isLast && <div className="w-[1px] flex-1 bg-border/50 -mb-2 mt-0.5" />}
                            </div>
                        )}



                        {/* Content */}
                        <div className={`flex flex-col pb-6 transition-opacity duration-500 ${isCompleted ? 'opacity-100' : isProcessing ? 'opacity-90' : 'opacity-60'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                {isProcessing && !isCompleted ? (
                                    <TextShimmer className="font-semibold text-sm">{agentName}</TextShimmer>
                                ) : (
                                    <span className="font-semibold text-sm text-foreground">{agentName}</span>
                                )}
                                {isCompleted && (
                                    result?.error ? (
                                        <X size={14} className="text-red-500 ml-1" />
                                    ) : (
                                        <Check size={14} className="text-green-500 ml-1" />
                                    )
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{task.task}</p>

                            {/* Skeleton Loading for Processing */}
                            {isProcessing && !isCompleted && (
                                <div className="mt-2">
                                    {task.agent === 'image' && (
                                        <div className="mb-2">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <div className="w-1 h-1 bg-primary rounded-full animate-pulse"></div>
                                                <span>{result ? 'Uploading to cloud storage...' : 'Generating image...'}</span>
                                            </div>
                                        </div>
                                    )}
                                    {(task.agent === 'flowchart' || task.agent === 'image' || task.agent === 'plotting') && (
                                        <div className="p-3 bg-secondary/50 rounded-lg border border-border/50">
                                            {task.agent === 'flowchart' ? (
                                                <FlowchartSkeleton />
                                            ) : task.agent === 'plotting' ? (
                                                <ChartSkeleton />
                                            ) : (
                                                <ImageSkeleton />
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Result Preview (Only if completed) */}
                            {isCompleted && result && (
                                <div className="mt-2">
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-500">
                                        {result.image_urls && Array.isArray(result.image_urls) && result.image_urls.length > 0 ? (
                                            // Multiple separate charts
                                            result.image_urls.map((imageUrl, imgIndex) => (
                                                <MediaBox
                                                    key={imgIndex}
                                                    type="chart"
                                                    title={result.chart_types?.[imgIndex] ? `${result.chart_types[imgIndex].charAt(0).toUpperCase() + result.chart_types[imgIndex].slice(1)} Chart` : `Chart ${imgIndex + 1}`}
                                                    onClick={() => {
                                                        setResultDrawerState({
                                                            type: 'image',
                                                            content: `http://20.197.35.140:5001${imageUrl}`,
                                                            title: `${result.title || 'Chart'} - ${result.chart_types?.[imgIndex] || 'Chart'} ${imgIndex + 1}`
                                                        });
                                                        setResultDrawerOpen(true);
                                                    }}
                                                    onDownload={() => {
                                                        const url = `http://20.197.35.140:5001${imageUrl}`;
                                                        const filename = imageUrl.split('/').pop() || `chart_${imgIndex + 1}.png`;
                                                        downloadFile(url, filename);
                                                    }}
                                                />
                                            ))
                                        ) : result.flowchart ? (

                                            <FlowchartRenderer
                                                flowchart={result.flowchart}
                                                index={index}
                                                mermaidInitialized={mermaidInitialized}
                                                onClick={() => {
                                                    setResultDrawerState({ content: result.flowchart, title: 'Flowchart Diagram', type: 'flowchart' });
                                                    setResultDrawerOpen(true);
                                                }}
                                            />
                                        ) : (result.image_url && !result.chart_html && !result.chart_url) ? (
                                            <div className="w-full relative group">
                                                <button
                                                    onClick={() => {
                                                        const imgUrl = result.image_url.startsWith('http') ? result.image_url : `http://localhost:5001${result.image_url}`;
                                                        setResultDrawerState({ content: imgUrl, title: result.topic || 'Generated Image', type: 'image' });
                                                        setResultDrawerOpen(true);
                                                    }}
                                                    className="w-full flex flex-col relative isolate"
                                                >
                                                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border/50 shadow-sm z-10 bg-muted/20">
                                                        <div className="absolute inset-0 bg-muted/20" />
                                                        <img
                                                            src={result.image_url.startsWith('http') ? result.image_url : `http://20.197.35.140:5001${result.image_url}`}
                                                            alt="Preview"
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                            loading="lazy"
                                                        />
                                                    </div>

                                                    <div className="relative -mt-3 w-[95%] mx-auto p-3 pt-5 bg-secondary/95 backdrop-blur-sm rounded-b-xl border-x border-b border-border/50 shadow-sm z-0 transform group-hover:translate-y-2 transition-transform duration-300 ease-out text-left">
                                                        <div className="flex flex-col gap-1 min-w-0">
                                                            <div className="text-sm font-medium text-foreground line-clamp-1">
                                                                {result.topic || 'Generated Image'}
                                                            </div>
                                                            <div className="text-[10px] bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded w-fit font-semibold uppercase tracking-wider">
                                                                IMAGE
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Direct Download Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const imgUrl = result.image_url.startsWith('http') ? result.image_url : `http://20.197.35.140:5001${result.image_url}`;
                                                        const filename = result.image_url.split('/').pop() || 'image.png';
                                                        downloadFile(imgUrl, filename);
                                                    }}
                                                    className="absolute top-2 right-2 z-20 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                                    title="Download Image"
                                                >
                                                    <Download size={16} />
                                                </button>
                                            </div>
                                        ) : (result.chart_html || result.chart_url) ? (
                                            <div className="w-full relative group">
                                                <button
                                                    onClick={() => {
                                                        const chartUrl = result.chart_url?.startsWith('http') ? result.chart_url : `http://20.197.35.140:5001${result.chart_url}`;
                                                        setResultDrawerState({
                                                            type: result.chart_html ? 'html' : 'image',
                                                            content: result.chart_html || chartUrl,
                                                            title: result.title || 'Chart'
                                                        });
                                                        setResultDrawerOpen(true);
                                                    }}
                                                    className="w-full flex flex-col relative isolate"
                                                >
                                                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border/50 shadow-sm z-10 bg-muted/20">
                                                        <div className="absolute inset-0 bg-muted/20" />
                                                        {result.chart_html ? (
                                                            <div
                                                                dangerouslySetInnerHTML={{ __html: result.chart_html }}
                                                                className="w-full h-full"
                                                                style={{ pointerEvents: 'none' }}
                                                            />
                                                        ) : (
                                                            <img
                                                                src={result.chart_url?.startsWith('http') ? result.chart_url : `http://20.197.35.140:5001${result.chart_url}`}
                                                                alt="Chart Preview"
                                                                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105 p-2"
                                                                loading="lazy"
                                                            />
                                                        )}
                                                    </div>

                                                    <div className="relative -mt-3 w-[95%] mx-auto p-3 pt-5 bg-secondary/95 backdrop-blur-sm rounded-b-xl border-x border-b border-border/50 shadow-sm z-0 transform group-hover:translate-y-2 transition-transform duration-300 ease-out text-left">
                                                        <div className="flex flex-col gap-1 min-w-0">
                                                            <div className="text-sm font-medium text-foreground line-clamp-1">
                                                                {result.title || 'Chart'}
                                                            </div>
                                                            <div className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded w-fit font-semibold uppercase tracking-wider">
                                                                {result.chart_type?.toUpperCase() || 'CHART'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Direct Download Button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (result.chart_url) {
                                                            const chartUrl = result.chart_url.startsWith('http') ? result.chart_url : `http://20.197.35.140:5001${result.chart_url}`;
                                                            const filename = result.chart_url.split('/').pop() || 'chart.png';
                                                            downloadFile(chartUrl, filename);
                                                        }
                                                    }}
                                                    className="absolute top-2 right-2 z-20 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                                    title="Download Chart"
                                                >
                                                    <Download size={16} />
                                                </button>
                                            </div>
                                        ) : task.agent === 'presentation' && result.pptx_url ? (
                                            // Presentation Download Card
                                            <div className="w-full p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <FileText size={24} className="text-blue-500 flex-shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-foreground truncate">
                                                                {result.topic || 'PowerPoint Presentation'}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                                {result.slides} slides • {result.template} template
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const url = `http://20.197.35.140:5001${result.pptx_url}`;
                                                        const filename = result.filename || result.pptx_url.split('/').pop() || 'presentation.pptx';
                                                        downloadFile(url, filename);
                                                    }}
                                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
                                                >
                                                    <Download size={14} />
                                                    Download Presentation
                                                </button>
                                            </div>
                                        ) : task.agent === 'whatsapp' && result.preview_data ? (
                                            // WhatsApp Preview
                                            <WhatsAppPreviewWithState
                                                previewData={result.preview_data}
                                                taskIndex={index}
                                            />
                                        ) : result.body ? (
                                            <div className="w-full max-w-sm border border-border rounded-xl bg-card hover:bg-secondary/20 transition-all duration-200 p-4 flex flex-col gap-3 shadow-sm group">
                                                <div className="flex items-start gap-3">
                                                    <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-lg shrink-0 mt-0.5">
                                                        <Mail size={18} />
                                                    </div>
                                                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h4 className="font-medium text-sm text-foreground">Email Draft</h4>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground line-clamp-1">
                                                            {result.subject || 'No Subject'}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground/70 truncate">
                                                            To: {result.to || 'Unknown Recipient'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 mt-1">
                                                    <button
                                                        onClick={() => setResultDrawerState({
                                                            content: {
                                                                to: result.to || '',
                                                                subject: result.subject || 'Untitled',
                                                                body: result.body || ''
                                                            },
                                                            title: 'Email Draft',
                                                            type: 'email'
                                                        }, setResultDrawerOpen(true))}
                                                        className="flex-1 py-2 bg-background border border-border hover:bg-secondary hover:border-secondary-foreground/20 text-foreground rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                                    >
                                                        <Eye size={13} className="text-muted-foreground" />
                                                        Review
                                                    </button>
                                                    <button
                                                        onClick={() => handleDirectEmailSend(index, result)}
                                                        disabled={sendingEmails[index]?.status === 'sending' || sendingEmails[index]?.status === 'success'}
                                                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 shadow-sm border ${sendingEmails[index]?.status === 'success'
                                                            ? 'bg-green-600 text-white border-green-600'
                                                            : sendingEmails[index]?.status === 'error'
                                                                ? 'bg-red-600 text-white border-red-600'
                                                                : 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                                                            }`}
                                                    >
                                                        {sendingEmails[index]?.status === 'sending' ? (
                                                            <>
                                                                <Loader2 size={13} className="animate-spin" />
                                                                Sending...
                                                            </>
                                                        ) : sendingEmails[index]?.status === 'success' ? (
                                                            <>
                                                                <Check size={13} />
                                                                Sent!
                                                            </>
                                                        ) : sendingEmails[index]?.status === 'error' ? (
                                                            <>
                                                                <AlertCircle size={13} />
                                                                Error
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Send size={13} />
                                                                Send directly
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (result.result || result.ideas || result.content || result.summary || result.document || result.message) ? (
                                            // Handle Text/File Results
                                            (() => {
                                                // Determine if it's a file type
                                                const isFile = result.result || result.ideas || result.content || result.summary || result.document;

                                                if (isFile) {
                                                    const type = result.result ? 'research' : result.ideas ? 'brainstorm' : result.content ? 'document' : result.summary ? 'summary' : 'case_study';
                                                    const filename = result.result ? generateFilename(task.task, 'research', 'research.md') :
                                                        result.ideas ? generateFilename(task.task, 'brainstorm', 'brainstorm.txt') :
                                                            result.content ? generateFilename(task.task, 'document', 'document.md') :
                                                                result.summary ? generateFilename(task.task, 'summary', 'summary.md') :
                                                                    generateFilename(task.task, 'case_study', 'case_study.md');

                                                    let content = result.result || result.ideas?.join('\n') || result.content || result.summary || result.document || '';

                                                    // Append sources for research
                                                    if (type === 'research' && result.sources && result.sources.length > 0) {
                                                        const sourcesText = '\n\n### References\n' + result.sources.map((s, i) => `${i + 1}. ${s}`).join('\n');
                                                        // Check if sources are already present to avoid duplication
                                                        if (!content.includes('### References') && !content.includes(result.sources[0])) {
                                                            content += sourcesText;
                                                        }
                                                    }

                                                    const ext = filename.split('.').pop();
                                                    const nameWithoutExt = filename.replace(`.${ext}`, '').replace(/_/g, ' ');

                                                    return (
                                                        <div className="w-full">
                                                            <button
                                                                onClick={() => {
                                                                    setResultDrawerState({ content, title: filename, type });
                                                                    setResultDrawerOpen(true);
                                                                }}
                                                                className="w-full flex items-center justify-between p-3.5 pr-5 bg-secondary/30 hover:bg-secondary/50 rounded-xl border border-border/50 transition-all group text-left shadow-sm"
                                                            >
                                                                <div className="flex items-center gap-2 overflow-hidden">
                                                                    <div className="p-2.5 bg-background rounded-lg text-primary border border-border/50 shadow-sm transition-transform group-hover:scale-105">
                                                                        {type === 'research' ? <BookOpen size={20} /> :
                                                                            type === 'brainstorm' ? <Sparkles size={20} /> :
                                                                                <FileText size={20} />}
                                                                    </div>
                                                                    <div className="min-w-0 flex flex-col gap-0.5">
                                                                        <div className="text-sm font-semibold text-foreground line-clamp-1" title={nameWithoutExt}>
                                                                            {nameWithoutExt}
                                                                        </div>
                                                                        <div className="text-[10px] text-primary px-1.5 py-0.5 rounded-[16px] w-fit font-bold uppercase tracking-widest">
                                                                            {ext}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    );
                                                } else if (result.message && (task.agent === 'checklist' || task.agent === 'calendar' || task.agent === 'daily_digest')) {
                                                    // Simple Success Message
                                                    return (
                                                        <button
                                                            onClick={() => toggleTaskExpansion(index)}
                                                            className="w-full py-1 text-left transition-all group"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-medium text-primary truncate">
                                                                    {result.message.split('\n')[0]}
                                                                </span>
                                                                <Check size={14} className="text-green-500 flex-shrink-0" />
                                                            </div>
                                                        </button>
                                                    );
                                                }
                                                return null;
                                            })()
                                        ) : result.response ? (
                                            <div className="w-full">
                                                <button
                                                    onClick={() => {
                                                        setResultDrawerState({ content: result.response, title: 'AI Response', type: 'text' });
                                                        setResultDrawerOpen(true);
                                                    }}
                                                    className="w-full flex items-center justify-between p-3.5 pr-5 bg-secondary/30 hover:bg-secondary/50 rounded-xl border border-border/50 transition-all group text-left shadow-sm"
                                                >
                                                    <div className="flex items-center gap-3.5 overflow-hidden">
                                                        <div className="p-2.5 bg-background rounded-lg text-primary border border-border/50 shadow-sm transition-transform group-hover:scale-105">
                                                            <MessageSquare size={20} />
                                                        </div>
                                                        <div className="min-w-0 flex flex-col gap-0.5">
                                                            <div className="text-sm font-semibold text-foreground line-clamp-1">
                                                                Response Generated
                                                            </div>
                                                            <div className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-md w-fit font-bold uppercase tracking-widest border border-primary/20">
                                                                TEXT
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>
                                            </div>
                                        ) : result.event_preview && task.agent === 'calendar' ? (
                                            <EventViewer
                                                eventData={{
                                                    title: result.event_preview.title || 'New Event',
                                                    description: result.event_preview.description || '',
                                                    start_time: result.event_preview.start_time || '',
                                                    end_time: result.event_preview.end_time || '',
                                                    all_day: result.event_preview.all_day || false,
                                                    location: result.event_preview.location || '',
                                                    color: result.event_preview.color || 'sky'
                                                }}
                                            />
                                        ) : (
                                            <div
                                                className="w-full p-3 bg-secondary/50 rounded-lg border border-border/50 text-left transition-all group"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                        {result.error ? (
                                                            <X size={16} className="text-red-500 flex-shrink-0" />
                                                        ) : (
                                                            <Check size={16} className="text-green-500 flex-shrink-0" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-foreground break-words whitespace-pre-wrap">
                                                                {result.error ? `Error: ${result.error}` : "Task Completed"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>




                                </div>
                            )
                            }
                        </div>
                    </motion.div >
                );
            })}
        </div >
    );
};



const FastMode = ({ navigateOnly, user, messages, setMessages, onAuthClick, onChatReset }) => {
    // messages state is now lifted to App.jsx

    const WELCOME_MESSAGE = [{
        id: Date.now(),
        role: 'ai',
        content: "Hi there! I'm Bianca, a friendly AI assistant from Tools That Make Life Too Easy. I can help you with a variety of tasks using my specialized agents."
    }];

    const [showClearConfirm, setShowClearConfirm] = useState(false); // State for custom clear confirmation

    // Selection State
    const [selection, setSelection] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const handleSelection = () => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.toString().trim()) {
                setSelection(null);
                setCopied(false);
                return;
            }

            const text = sel.toString();
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            // Only show if selection is within the chat area (optional check, but good for safety)
            // For now, global within FastMode page
            setSelection({
                text,
                x: rect.left + rect.width / 2,
                y: rect.top
            });
        };

        // Debounce slightly or just run
        document.addEventListener('selectionchange', handleSelection);
        return () => document.removeEventListener('selectionchange', handleSelection);
    }, []);

    const handleCopy = () => {
        if (selection?.text) {
            navigator.clipboard.writeText(selection.text);
            setCopied(true);
            setTimeout(() => {
                setCopied(false);
                // Optional: Clear selection? window.getSelection().removeAllRanges();
            }, 2000);
        }
    };
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    // 1. Available Quick Actions/Categories for "Chips"
    const [availableCategories, setAvailableCategories] = useState([]);

    // Fetch available categories for "For You" dropdown
    useEffect(() => {
        const fetchCategories = async () => {
            if (!user) {
                setAvailableCategories([]);
                return;
            }

            try {
                // 1. Fetch Products for Likes and Trending
                const { data: productsData } = await supabase
                    .from('products')
                    .select('id, title, description, views, liked_by');

                // 2. Fetch User Details for Bookmarks and Logs
                const { data: userData } = await supabase
                    .from('user_details')
                    .select('bookmarks, logs')
                    .eq('id', user.id)
                    .single();

                const categories = [];

                if (productsData && productsData.length > 0) {
                    // Trending: Always has items if products exist
                    categories.push('Trending');

                    // Liked: Check if any product is liked by user
                    const hasLiked = productsData.some(p => p.liked_by && p.liked_by.includes(user.id));
                    if (hasLiked) categories.push('Liked');
                }

                if (userData) {
                    // Bookmarked: Check if bookmarks array is not empty
                    if (userData.bookmarks && userData.bookmarks.length > 0) {
                        categories.push('Bookmarked');
                    }

                    // Recently Used: Check logs (simplified matching check)
                    if (userData.logs && userData.logs.length > 0) {
                        // We use a simplified check here: if logs exist, we likely have recent items.
                        // To be strictly consistent with Manual.jsx, we should match them, 
                        // but for dropdown visibility, this might be sufficient and faster.
                        // Let's do a quick match to be safe.
                        const hasRecent = userData.logs.some(log =>
                            productsData.some(p =>
                                p.title && (log.description?.includes(p.title) || p.title.includes(log.description))
                            )
                        );
                        if (hasRecent) categories.push('Recently Used');
                    }
                }

                setAvailableCategories(categories);
            } catch (err) {
                console.error("Error fetching available categories:", err);
            }
        };

        fetchCategories();
    }, [user]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [showFileOptions, setShowFileOptions] = useState(false);
    const [summaryFocus, setSummaryFocus] = useState('general');
    const [summaryLength, setSummaryLength] = useState('medium');
    const [isUploading, setIsUploading] = useState(false);


    const [credits, setCredits] = useState(null);

    // Track previous user ID to detect auth changes (Login/Logout)
    const prevUserIdRef = useRef(user?.id);

    // Effect 1: Handle Chat Reset on Auth Change
    useEffect(() => {
        // Skip initial hydration check where user goes from undefined -> object
        if (prevUserIdRef.current === undefined && user?.id) {
            prevUserIdRef.current = user.id;
            return;
        }

        const currentUserId = user?.id;
        // Check if ID changed (e.g., login, logout, switch)
        if (prevUserIdRef.current !== currentUserId) {
            // Only reset if it's an actual change, not just initial load
            if (prevUserIdRef.current !== undefined || currentUserId === undefined) {
                setMessages(WELCOME_MESSAGE); // Reset to welcome message
            }
            prevUserIdRef.current = currentUserId; // Update ref
        }
    }, [user?.id, setMessages]);

    // Effect 2: Subscribe to Real-time Credit Balance (Only when logged in)
    useEffect(() => {
        if (!user) {
            setCredits(null);
            return;
        }

        const fetchCredits = async () => {
            const { data } = await supabase.from('user_details').select('credits').eq('id', user.id).maybeSingle();
            if (data) setCredits(data.credits);
        };

        fetchCredits();

        const channel = supabase
            .channel('credits_update')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_details', filter: `id=eq.${user.id}` }, (payload) => {
                if (payload.new && typeof payload.new.credits === 'number') {
                    setCredits(payload.new.credits);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id]); // Depend on ID to re-subscribe if user changes


    // Result Drawer State
    const [resultDrawerOpen, setResultDrawerOpen] = useState(false);
    const [resultDrawerState, setResultDrawerState] = useState(null); // { content, title, type }

    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-focus input on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const scrollToBottom = () => {
        const scrollContainer = document.querySelector('.main-body > .content-area');
        const endRef = messagesEndRef.current;

        if (scrollContainer && endRef) {
            const executeScroll = () => {
                let targetScroll = scrollContainer.scrollHeight;

                // Try to find the last message element (previous sibling of the end ref)
                // We assume the previous sibling inside the chat container is the last message wrapper
                const lastMessage = endRef.previousElementSibling;

                if (lastMessage && lastMessage.classList.contains('flex')) { // Crude check ensures it's likely a message row
                    const containerHeight = scrollContainer.clientHeight;
                    const elementTop = lastMessage.offsetTop;
                    const elementHeight = lastMessage.offsetHeight;

                    // Calculate position to center the element visually
                    targetScroll = elementTop - (containerHeight / 2) + (elementHeight / 2);

                    // Ensure we don't scroll past the top
                    targetScroll = Math.max(0, targetScroll);
                }

                animate(scrollContainer.scrollTop, targetScroll, {
                    type: "spring",
                    stiffness: 50,
                    damping: 15,
                    duration: 1.0,
                    onUpdate: (latest) => {
                        scrollContainer.scrollTop = latest;
                    }
                });
            };

            // Immediate attempt
            executeScroll();

            // Checking again after content expansion (rendering/animations)
            // Increased delays slightly to account for smooth height transitions
            setTimeout(executeScroll, 150);
            setTimeout(executeScroll, 700);
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Initialize with default message if empty
    useEffect(() => {
        if (!messages || messages.length === 0) {
            // Scroll to top
            const scrollContainer = document.querySelector('.main-body > .content-area');
            if (scrollContainer) scrollContainer.scrollTop = 0;

            const initialMsg = {
                id: 'welcome-msg',
                role: 'ai',
                content: "Hi there! I'm Bianca, a friendly AI assistant from Tools That Make Life Too Easy. I can help you with a variety of tasks using my specialized agents."
            };
            setMessages([initialMsg]);
        }
    }, [messages, setMessages]);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const allowedTypes = ['.pdf', '.txt', '.md', '.docx', '.doc'];
            const fileExt = '.' + file.name.split('.').pop().toLowerCase();

            if (!allowedTypes.includes(fileExt)) {
                alert(`Unsupported file type. Allowed: ${allowedTypes.join(', ')}`);
                return;
            }

            setSelectedFile(file);
            setShowFileOptions(true);

            // Clear file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleCancelFile = () => {
        setSelectedFile(null);
        setShowFileOptions(false);
        setSummaryFocus('general');
        setSummaryLength('medium');
    };

    const handleFileUpload = async () => {
        if (!selectedFile) return;

        if (!user) {
            const authPromptMsg = {
                id: Date.now(),
                role: 'ai',
                content: "Please sign up or sign in to use AI agents. Click the button below to get started!",
                requiresAuth: true
            };
            setMessages(prev => [...prev, authPromptMsg]);
            return;
        }

        setIsUploading(true);

        const userMsg = {
            id: Date.now(),
            role: 'user',
            content: `Uploaded: ${selectedFile.name} (Focus: ${summaryFocus}, Length: ${summaryLength})`
        };
        setMessages(prev => [...prev, userMsg]);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('focus', summaryFocus);
            formData.append('max_length', summaryLength);

            const response = await fetch('/api/summary/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.status === 'success') {
                const aiMsg = {
                    id: Date.now() + 1,
                    role: 'ai',
                    content: "File summarized successfully.",
                    data: {
                        tasks: [{ agent: 'summary', task: `Summarize ${selectedFile.name}` }],
                        results: {
                            'Summary Agent': {
                                summary: data.result?.summary || ''
                            }
                        }
                    },
                    isProcessing: false
                };
                setMessages(prev => [...prev, aiMsg]);
            } else {
                const errorMsg = {
                    id: Date.now() + 1,
                    role: 'ai',
                    content: `Error: ${data.error || 'Failed to summarize file'}`
                };
                setMessages(prev => [...prev, errorMsg]);
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            const errorMsg = {
                id: Date.now() + 1,
                role: 'ai',
                content: "Sorry, I encountered an error uploading the file. Please try again."
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsUploading(false);
            setSelectedFile(null);
            setShowFileOptions(false);
            setSummaryFocus('general');
            setSummaryLength('medium');
        }
    };

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        // Optimistically add user message
        const userMsg = { id: Date.now(), role: 'user', content: inputValue };
        setMessages(prev => [...prev, userMsg]);
        setInputValue("");

        // Reset textarea height
        const textarea = document.querySelector('textarea[placeholder*="What can I do"]');
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = '60px';
        }

        // Check if user is authenticated - Intercept for Guests
        if (!user) {
            // Simulate AI thinking briefly for better UX
            setIsLoading("thinking");
            setTimeout(() => {
                setIsLoading(false);
                const authPromptMsg = {
                    id: Date.now() + 1,
                    role: 'ai',
                    content: "Please sign up or sign in to use AI agents. Click the button below to get started!",
                    requiresAuth: true
                };
                setMessages(prev => [...prev, authPromptMsg]);
            }, 600);
            return;
        }

        // Check Credits - Block if 0
        const { data: latestUserCheck } = await supabase.from('user_details').select('credits').eq('id', user.id).maybeSingle();
        if (latestUserCheck && latestUserCheck.credits <= 0) {
            setIsLoading("thinking");
            setTimeout(() => {
                setIsLoading(false);
                const noCreditsMsg = {
                    id: Date.now() + 1,
                    role: 'ai',
                    content: "You need at least 1 credit to use this feature. \n\nYou can get more credits from the **Shop** page (accessible via the sidebar) for just **₹2/credit** or **₹19 per 10 credits**, or upgrade to a **Common** or **Wealthy** role to unlock more capabilities.",
                };
                setMessages(prev => [...prev, noCreditsMsg]);
            }, 600);
            return;
        }

        // Shared state for this execution
        let creditsDeducted = 0;

        // Helper to update credits in DB
        const updateUserCredits = async (changeAmount) => {
            const { data: latestUser } = await supabase.from('user_details').select('credits').eq('id', user.id).maybeSingle();
            if (latestUser) {
                const newCredits = Math.max(0, latestUser.credits + changeAmount);
                
                // CRITICAL: Update credits AND logs in the same query to trigger the database trigger
                const description = changeAmount > 0 ? 'Credit adjustment' : 'Fast Mode Agent Usage';
                await updateCreditsWithLog(user.id, newCredits, changeAmount, description);

                // Update local user object strictly for UI reflection if needed, 
                // though usually the auth listener handles this.
                // We won't mutate `user` directly as it's likely from a context/hook.
                return newCredits;
            }
            return 0;
        };



        // Timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            setIsLoading(false);
            const timeoutMsg = {
                id: Date.now() + 1,
                role: 'ai',
                content: "Thinking timed out. The server took too long to respond. Please try again."
            };
            setMessages(prev => [...prev, timeoutMsg]);
        }, 60000); // 60 seconds

        setIsLoading("Analyzing your request and routing to appropriate agents...");

        try {
            const requestBody = {
                prompt: userMsg.content,
                user: user?.user_metadata?.username || user?.email || null
            };
            
            const response = await apiCache.fetchWithFallback(requestBody, controller.signal);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let tasksData = null;
            let resultsData = {};
            let agentPrices = {}; // Store fetched prices for agents handling tasks

            // Helper to fetch price, normalizing agent name
            // We map code agent keys to DB titles loosely
            const fetchAgentPrice = async (agentKey) => {
                // Map known keys to DB Titles
                const keyMap = {
                    'research': 'Research Agent',
                    'image': 'Image Agent',
                    'calendar': 'Daily Schedule Agent',
                    'checklist': 'Checklist Agent',
                    'todo': 'Checklist Agent',
                    'email': 'Email Agent',
                    'call': 'Call Agent',
                    'summary': 'Summary Agent',
                    'presentation': 'Presentation Agent',
                    'chart': 'Chart Agent',
                    'data': 'Data Analysis Agent',
                    'analysis': 'Data Analysis Agent'
                };

                let searchTerm = keyMap[agentKey] || agentKey;
                // If no mapping, try to search by generic name

                const { data: products } = await supabase
                    .from('products')
                    .select('title, price')
                    .ilike('title', `%${searchTerm}%`)
                    .limit(1);

                if (products && products.length > 0) {
                    const priceStr = products[0].price; // "4 Credits", "Free"
                    if (priceStr.toLowerCase().includes('free')) return 0;
                    const match = priceStr.match(/(\d+)/);
                    return match ? parseInt(match[1]) : 0;
                }
                return 0; // Default to free if not found? Or maybe 1? Let's default to safe 0 (free) or keep initial 1.
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'tasks') {
                                tasksData = data.tasks;

                                // 1. Identify if ANY paid agent is required
                                let maxPriceFound = 0;
                                let isPaidTask = false;

                                for (const task of tasksData) {
                                    if (task.agent) {
                                        const price = await fetchAgentPrice(task.agent);
                                        agentPrices[task.agent] = price; // Cache it
                                        if (price > 0) {
                                            isPaidTask = true;
                                            if (price > maxPriceFound) maxPriceFound = price;
                                        }
                                    }
                                }

                                // 2. If Paid Task identified, Check Balance and Deduct Initial Credit
                                if (isPaidTask) {
                                    // Check current balance real-time
                                    const { data: latestUser } = await supabase.from('user_details').select('credits').eq('id', user.id).maybeSingle();
                                    const currentCredits = latestUser?.credits || 0;

                                    if (currentCredits <= 0) {
                                        // INSUFFICIENT CREDITS
                                        // We should stop processing if possible, or at least inform user.
                                        // Since backend is streaming, we can't easily kill it without a new abort signal or just ignoring it.
                                        // We will throw an error here to break the loop and effectively stop "listening"
                                        // The backend might continue but user won't see results?
                                        // Actually, if we throw, we hit the catch block.

                                        throw new Error("INSUFFICIENT_CREDITS");
                                    } else {
                                        // Deduct 1 credit upfront for Paid Task
                                        if (creditsDeducted === 0) {
                                            const deductAmount = 1;
                                            await updateUserCredits(-deductAmount);
                                            creditsDeducted = deductAmount;
                                        }
                                    }
                                }
                                // Else if free, do nothing. creditsDeducted remains 0.

                                setIsLoading("Thinking");
                                // Show initial AI message with tasks
                                setMessages(prev => {
                                    return [...prev, {
                                        id: Date.now() + 1,
                                        role: 'ai',
                                        content: "Processing your request...",
                                        data: { tasks: data.tasks, results: {} },
                                        isProcessing: true
                                    }];
                                });
                            } else if (data.type === 'result') {
                                // Update results incrementally using task index to handle multiple tasks of same agent
                                const taskIndex = data.index !== undefined ? data.index : tasksData.findIndex(t => {
                                    const agentNameMap = {
                                        'Flowchart Agent': 'flowchart',
                                        'Image Agent': 'image',
                                        'Research Agent': 'research',
                                        'Email Agent': 'email',
                                        'Summary Agent': 'summary',
                                        'Document Agent': 'document',
                                        'Case Study Agent': 'case_study',
                                        'Brainstorm Agent': 'brainstorm',
                                        'Presentation Agent': 'presentation'
                                    };
                                    return agentNameMap[data.agent] === t.agent;
                                });

                                // Store by both agent name (for backward compatibility) and index
                                console.log(`[DEBUG] Received result for ${data.agent}, taskIndex: ${taskIndex}`, data.data);
                                const resultData = data.data || { error: data.error };
                                resultsData[data.agent] = resultData;
                                if (taskIndex >= 0) {
                                    resultsData[`task_${taskIndex}`] = resultData;
                                    console.log(`[DEBUG] Stored as task_${taskIndex}:`, resultsData[`task_${taskIndex}`]);
                                }

                                // Handling Completion Cost for Paid Agents
                                // Handling Completion Cost for Paid Agents
                                if (!data.error) {
                                    // Robust Price Lookup:
                                    // Try direct cache lookup first (by result key)
                                    // If failed, try fetching dynamically (handles key mismatches like "research" vs "Research Agent")
                                    let price = agentPrices[data.agent];
                                    if (price === undefined) {
                                        try {
                                            price = await fetchAgentPrice(data.agent);
                                            // Cache it for future updates from this agent
                                            agentPrices[data.agent] = price;
                                        } catch (err) {
                                            console.error("Failed to fetch price for agent:", data.agent, err);
                                            price = 0;
                                        }
                                    }

                                    // Only deduct remaining IF we previously decided it was a paid flow (creditsDeducted=1) 
                                    // OR if we missed it somehow? (Unlikely given tasks block runs first).
                                    // Logic: if price > 1, deduct (price - 1).
                                    // Wait, if we have multiple paid agents, say A(4) and B(3).
                                    // 'tasks' block sees paid -> deducts 1. creditsDeducted=1.
                                    // A finishes: price 4. Deduct 3? (4-1).
                                    // B finishes: price 3. Deduct 2? (3-1).
                                    // Total deducted: 1 + 3 + 2 = 6.
                                    // Total Cost: 4 + 3 = 7.
                                    // We are short 1 credit?
                                    // Ah, the logic "deduct remaining" assumes the initial 1 covered THIS agent.
                                    // If we share the initial 1 across multiple agents, we undercharge.

                                    // Fix: We need to track `creditsDeducted` more granularly or simply:
                                    // The initial 1 credit covers the *first* paid agent's first credit.
                                    // Any *subsequent* paid agents should trigger full price deduction?
                                    // OR simpler:
                                    // Just deduct (Price - 1) if Price > 0 ?
                                    // If A(4) => 1 upfront. A finishes: 4-1=3. Total 4. Correct for A.
                                    // If B(3) => B touches upfront? No, upfront was for A?
                                    // We can't distinguish who "used" the upfront credit.

                                    // Let's assume the upfront credit applies to the *whole request*.
                                    // If we use multiple agents, we sum their costs?
                                    // If A(4) and B(3) = 7 total.
                                    // Current logic: Upfront 1.
                                    // A finishes: 4-1 = 3.
                                    // B finishes: 3-1 = 2.
                                    // Total 1+3+2 = 6. Still missing 1.

                                    // Solution: 
                                    // Just deduct full price for subsequent agents?
                                    // Or safer:
                                    // Track `globalUpfrontUsed`.
                                    // If price > 0:
                                    //   amountToDeduct = price;
                                    //   if (creditsDeducted > 0) {
                                    //      amountToDeduct -= creditsDeducted;
                                    //      creditsDeducted = 0; // Upfront credit is "spent"
                                    //   }
                                    //   Deduct amountToDeduct.

                                    if (price > 0) {
                                        let amountToDeduct = price;
                                        if (creditsDeducted > 0) {
                                            // Provide the discount of the upfront credit
                                            amountToDeduct -= creditsDeducted;
                                            creditsDeducted = 0; // Mark as consumed
                                        }
                                        // If amountToDeduct > 0 (e.g. Price 4, Discount 1 => 3. Price 3, Discount 0 (used) => 3)
                                        if (amountToDeduct > 0) {
                                            await updateUserCredits(-amountToDeduct);
                                        }
                                    }
                                }

                                setMessages(prev => {
                                    const lastMsg = prev[prev.length - 1];
                                    if (lastMsg && lastMsg.role === 'ai' && lastMsg.data) {
                                        return [
                                            ...prev.slice(0, -1),
                                            {
                                                ...lastMsg,
                                                data: {
                                                    tasks: tasksData,
                                                    results: { ...resultsData }
                                                }
                                            }
                                        ];
                                    }
                                    return prev;
                                });
                            } else if (data.type === 'complete') {
                                // Mark as complete
                                setMessages(prev => {
                                    const lastMsg = prev[prev.length - 1];
                                    if (lastMsg && lastMsg.role === 'ai') {
                                        return [
                                            ...prev.slice(0, -1),
                                            { ...lastMsg, isProcessing: false, content: "Task completed." }
                                        ];
                                    }
                                    return prev;
                                });
                            } else if (data.type === 'error') {
                                throw new Error(data.error);
                            }
                        } catch (parseError) {
                            console.error("Error parsing SSE data:", parseError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error calling API:", error);

            // Refund ONLY if we deducted and it failed (and we didn't use it up?)
            // If `creditsDeducted` is still > 0, it means we took 1 but never successfully completed a paid task to "consume" it.
            // So we refund it.
            // If `creditsDeducted` is 0, either we never took it (free task) or we consumed it (paid task finished).
            if (creditsDeducted > 0) {
                await updateUserCredits(1);
            }

            let errorMessage = "Sorry, I encountered an error connecting to the agent server.";
            if (error.message === "INSUFFICIENT_CREDITS") {
                errorMessage = "Insufficient credits. Please top up to use this agent.";
                // We likely want to show a clear UI state for this.
                toast.error("Insufficient credits");
            } else if (error.name === 'AbortError') {
                return; // Handled by timeout callback
            }

            const errorMsg = {
                id: Date.now() + 1,
                role: 'ai',
                content: errorMessage
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            clearTimeout(timeoutId);
            setIsLoading(false);
        }
    };

    return (
        <div className="feed-page min-h-screen bg-background relative pb-40">
            <div className="content-overlay content-area max-w-2xl mx-auto px-4">
                <div className="sticky-nav-container mb-8 !sticky !top-12 z-50 bg-background/95 backdrop-blur-xl py-4 mt-8">
                    <MagneticMorphingNav
                        activeTab="fastmode"
                        onTabChange={(id) => navigateOnly(id)}
                        user={user}
                        onSectionSelect={(section) => navigateOnly('home', section)}
                        availableCategories={availableCategories}
                    />
                </div>

                <div className="chat-container space-y-6 pt-4 pb-32 p-4 md:p-0 relative z-0">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            {msg.role === 'ai' && (
                                <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shrink-0 shadow-sm">
                                    <Sparkles size={14} className="text-yellow-400" />
                                </div>
                            )}
                            {msg.role === 'user' && user?.user_metadata?.avatar_url && (
                                <img src={user.user_metadata.avatar_url} alt="User" className="w-8 h-8 rounded-full object-cover shrink-0" />
                            )}
                            {msg.role === 'user' && !user?.user_metadata?.avatar_url && (
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                    {user ? user.email[0].toUpperCase() : 'U'}
                                </div>
                            )}

                            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`relative text-sm leading-relaxed break-words whitespace-pre-wrap ${msg.role === 'user'
                                    ? 'px-4 py-2 bg-secondary text-secondary-foreground rounded-2xl rounded-tr-sm'
                                    : 'px-0 py-1 text-muted-foreground'
                                    }`}>
                                    {msg.role === 'ai' ? (
                                        msg.requiresAuth ? (
                                            <div className="flex flex-col gap-3">
                                                <div className="whitespace-pre-wrap text-foreground">
                                                    {msg.content}
                                                </div>
                                                <button
                                                    onClick={() => onAuthClick && onAuthClick(0, 'default')}
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity font-medium"
                                                >
                                                    <LogIn size={16} />
                                                    Sign In / Sign Up
                                                </button>
                                            </div>
                                        ) : msg.requiresReset ? (
                                            <div className="flex flex-col gap-3">
                                                <div className="whitespace-pre-wrap text-foreground">
                                                    {msg.content}
                                                </div>
                                                <button
                                                    onClick={() => onChatReset && onChatReset()}
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-muted transition-colors font-medium border border-border w-fit relative z-50 cursor-pointer"
                                                >
                                                    <RotateCcw size={16} />
                                                    Start Fresh
                                                </button>
                                            </div>
                                        ) : msg.data && msg.data.tasks && msg.data.tasks.length === 1 && msg.data.tasks[0].agent === 'general' && msg.data.results && msg.data.results['Assistant'] ? (
                                            // For simple greetings/general responses, just show the text (now parsed as markdown)
                                            <div
                                                className="markdown-content text-foreground text-sm prose prose-sm max-w-none prose-headings:font-semibold prose-a:text-blue-500 hover:prose-a:underline prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground [&>h3]:mt-0 [&>h3]:mb-2"
                                                dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.data.results['Assistant'].response || msg.content) }}
                                            />
                                        ) : msg.data && msg.data.tasks ? (
                                            <TaskTimeline
                                                tasks={msg.data.tasks}
                                                results={msg.data.results}
                                                isProcessing={msg.isProcessing || false}
                                                onModalToggle={setIsModalOpen}

                                                setResultDrawerState={setResultDrawerState}
                                                setResultDrawerOpen={setResultDrawerOpen}
                                            />
                                        ) : (
                                            <div
                                                className="markdown-content text-foreground text-sm prose prose-sm max-w-none prose-headings:font-semibold prose-a:text-blue-500 hover:prose-a:underline prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground [&>h3]:mt-0 [&>h3]:mb-2"
                                                dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
                                            />
                                        )
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50 transition-all duration-300 ${isModalOpen ? 'opacity-30 blur-sm pointer-events-none' : 'opacity-100'}`}>
                <div className="relative rounded-3xl bg-card border border-border p-4 shadow-2xl">
                    <AnimatePresence>
                        {isLoading && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, height: 0, marginBottom: 0 }}
                                animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 16 }}
                                exit={{ opacity: 0, y: 10, height: 0, marginBottom: 0 }}
                                transition={{ duration: 0.3 }}
                                className="flex justify-between items-center px-2 overflow-hidden"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-foreground flex items-center gap-1">Agent <Sparkles size={12} className="text-yellow-400" /></span>
                                    <TextShimmer className="text-sm font-medium">{isLoading === true ? 'Thinking' : isLoading}</TextShimmer>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* File Options Panel */}
                    {showFileOptions && selectedFile && (
                        <div className="mb-6 p-4 bg-secondary/30 rounded-2xl border border-border shadow-inner">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/50">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                                        <FileText size={18} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-foreground truncate max-w-[150px]">{selectedFile.name}</span>
                                        <span className="text-[10px] text-muted-foreground">
                                            {(selectedFile.size / 1024).toFixed(1)} KB
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={handleCancelFile}
                                    className="p-1.5 hover:bg-background rounded-full transition-all text-muted-foreground hover:text-red-500"
                                    title="Remove file"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Focus</label>
                                    <div className="relative group">
                                        <select
                                            value={summaryFocus}
                                            onChange={(e) => setSummaryFocus(e.target.value)}
                                            className="w-full pl-3 pr-8 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer transition-all hover:border-primary/50"
                                        >
                                            <option value="general">General</option>
                                            <option value="key_points">Key Points</option>
                                            <option value="action_items">Action Items</option>
                                            <option value="decisions">Decisions</option>
                                            <option value="timeline">Timeline</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Length</label>
                                    <div className="relative group">
                                        <select
                                            value={summaryLength}
                                            onChange={(e) => setSummaryLength(e.target.value)}
                                            className="w-full pl-3 pr-8 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer transition-all hover:border-primary/50"
                                        >
                                            <option value="short">Short</option>
                                            <option value="medium">Medium</option>
                                            <option value="long">Long</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none group-hover:text-foreground transition-colors" />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleFileUpload}
                                disabled={isUploading}
                                className={`w-full px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm ${isUploading
                                    ? 'bg-primary/50 text-primary-foreground cursor-wait'
                                    : 'bg-primary text-primary-foreground hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]'
                                    }`}
                            >
                                {isUploading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Analyzing...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={16} />
                                        <span>Generate Summary</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Input */}
                    {/* Input */}

                    <textarea
                        ref={inputRef}
                        placeholder={showFileOptions ? "File selected. Configure options above or type a message..." : "What can I do for you?"}
                        className="w-full bg-transparent text-xl text-foreground placeholder:text-muted-foreground outline-none pb-8 px-2 resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={isUploading}
                        rows={1}
                        style={{
                            height: 'auto',
                            minHeight: '60px'
                        }}
                        onInput={(e) => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                        }}
                    />

                    {/* Bottom Controls */}
                    <div className="flex items-center justify-between px-2">
                        <button className="flex items-center gap-2 bg-secondary hover:bg-muted transition-colors rounded-full px-3 py-1.5 text-sm text-secondary-foreground border border-border">
                            <span className="font-semibold text-foreground">Ax</span> Bianca v1.0
                        </button>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="p-2 text-muted-foreground hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10"
                                title="Reset Chat"
                            >
                                <RotateCcw size={18} />
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".pdf,.txt,.md,.docx,.doc"
                                onChange={handleFileSelect}
                                disabled={!user || isUploading}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={!user || isUploading || showFileOptions}
                                className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"
                            >
                                <Paperclip size={20} />
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={!user || isUploading}
                                className={`p-2 transition-all rounded-xl border border-border ${!user || isUploading
                                    ? 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50'
                                    : inputValue.trim()
                                        ? 'bg-foreground text-background hover:opacity-90'
                                        : 'bg-secondary text-muted-foreground hover:bg-muted'
                                    }`}
                            >
                                <ArrowUp size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>



            <ResultDrawer
                isOpen={resultDrawerOpen}
                onClose={setResultDrawerOpen}
                content={resultDrawerState?.content}
                title={resultDrawerState?.title}
                type={resultDrawerState?.type}
            />

            <ConfirmationModal
                isOpen={showClearConfirm}
                onClose={() => setShowClearConfirm(false)}
                onConfirm={() => {
                    setMessages(WELCOME_MESSAGE);
                    // allow App.jsx effect to handle localStorage sync
                    setShowClearConfirm(false);
                }}
                title="Clear Chat History?"
                description="This will permanently delete your current conversation history. This action cannot be undone."
            />

            {/* Floating Copy Button */}
            <AnimatePresence>
                {selection && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        style={{
                            position: 'fixed',
                            left: selection.x,
                            top: selection.y,
                            transform: 'translate(-50%, -100%)',
                            marginTop: '-8px',
                            zIndex: 9999
                            // Note: Position is fixed relative to viewport, which matches getBoundingClientRect
                        }}
                    >
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-full shadow-lg hover:opacity-90 transition-opacity text-xs font-medium"
                        >
                            {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// Custom Confirmation Modal
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, description }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 scale-100 animate-in zoom-in-95 duration-200 relative z-10">
                <div className="flex flex-col gap-2 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-2">
                        <Trash2 className="text-red-600 dark:text-red-500" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {description}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors font-medium text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors font-medium text-sm shadow-lg shadow-red-600/20"
                    >
                        Yes, Clear
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FastMode;
