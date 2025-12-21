import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import {
    File as FileIcon, FileText, Image, Music, Video, MoreVertical,
    Trash2, Download, Grid, List, Search, Folder, ChevronLeft, ChevronRight, Home, ChevronDown,
    Archive, StickyNote, FileSpreadsheet, Code, FileCode, Info, Mail, BarChart,
    BookOpen, Lightbulb, LineChart, Presentation, ZoomIn, ZoomOut, AlertCircle, Loader2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { filesize } from 'filesize';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { RotateCw, Play, Pause, Eye, Code as CodeIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import LoadingScreen from './LoadingScreen';
import { BarVisualizer } from '@/components/ui/bar-visualizer';
import * as XLSX from 'xlsx';
import {
    ScrubBarContainer,
    ScrubBarTrack,
    ScrubBarProgress,
    ScrubBarThumb,
    ScrubBarTimeLabel
} from '@/components/ui/scrub-bar';

const EXTENSION_GROUPS = {
    Images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'],
    Videos: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'],
    Audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac'],
    PDFs: ['pdf'],
    Spreadsheets: ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
    Flowcharts: ['mermaid', 'mmd'],
    Notes: ['txt', 'md', 'notes', 'json'], // JSON could be code, but user said notes for txt/md. I'll put JSON in Code.
    Code: ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'json', 'html', 'css', 'php', 'rb', 'go', 'rs', 'swift'],
    Archives: ['zip', 'rar', '7z', 'tar', 'gz', 'pkg', 'dmg'],
    Documents: ['doc', 'docx', 'rtf', 'odt', 'ppt', 'pptx', 'pages', 'key'],
};

// Helper for consistent grouping logic
// Notes: Re-evaluated JSON -> Code makes more sense for devs, but keeping mapping flexible.
EXTENSION_GROUPS.Notes = ['txt', 'md', 'markdown']; // Overriding if I made a mistake above in thought process

const AudioPreview = ({ previewUrl }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioStream, setAudioStream] = useState(null);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef(null);
    const audioContextRef = useRef(null);
    const sourceRef = useRef(null);

    const togglePlay = async () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            // Context needs user interaction to start
            if (!audioContextRef.current) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioContextRef.current = new AudioContextClass();
            }

            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            // Create source if not exists
            if (!sourceRef.current && audioRef.current) {
                try {
                    const src = audioContextRef.current.createMediaElementSource(audioRef.current);
                    src.connect(audioContextRef.current.destination); // For hearing audio

                    const dest = audioContextRef.current.createMediaStreamDestination();
                    src.connect(dest);
                    setAudioStream(dest.stream);
                    sourceRef.current = src;
                } catch (e) {
                    console.error("Audio Setup Failed", e);
                }
            }

            try {
                await audioRef.current.play();
                setIsPlaying(true);
            } catch (e) {
                console.error("Play failed", e);
            }
        }
    };

    // Ensure cleanup
    useEffect(() => {
        return () => {
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleScrub = (value) => {
        if (audioRef.current) {
            audioRef.current.currentTime = value;
            setCurrentTime(value);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl px-4">
            <BarVisualizer
                state={isPlaying ? "speaking" : "listening"}
                barCount={20}
                mediaStream={audioStream}
                className="w-full h-48 bg-transparent"
            />

            {/* Scrub Bar */}
            <div className="w-full flex items-center gap-4">
                <ScrubBarTimeLabel time={currentTime} />
                <ScrubBarContainer
                    value={currentTime}
                    duration={duration}
                    onScrub={handleScrub}
                    className="flex-1"
                >
                    <ScrubBarTrack className="h-2">
                        <ScrubBarProgress />
                        <ScrubBarThumb />
                    </ScrubBarTrack>
                </ScrubBarContainer>
                <ScrubBarTimeLabel time={duration} />
            </div>

            <audio
                ref={audioRef}
                src={previewUrl}
                onEnded={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                crossOrigin="anonymous"
                className="hidden"
            />

            <button
                onClick={togglePlay}
                className="p-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-transform active:scale-95 shadow-lg"
            >
                {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
            </button>
        </div>
    );
};



const SpreadsheetPreview = ({ data }) => {
    if (!data || data.length === 0) return <div className="text-muted-foreground p-4">Empty spreadsheet</div>;

    const headers = data[0];
    const rows = data.slice(1);

    return (
        <div className="w-full h-full overflow-auto bg-card text-card-foreground p-4">
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="border-b border-border">
                        {headers.map((header, i) => (
                            <th key={i} className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap bg-secondary/30 sticky top-0 z-10">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                            {row.map((cell, j) => (
                                <td key={j} className="p-2 whitespace-nowrap">
                                    {cell !== null && cell !== undefined ? String(cell) : ''}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Helper to get folder icons for breadcrumb
const getFolderIcon = (groupName) => {
    switch (groupName) {
        case 'images': return <Image size={14} />;
        case 'documents': return <FileText size={14} />;
        case 'flowcharts': return <BarChart size={14} />;
        case 'emails': return <Mail size={14} />;
        case 'research': return <Search size={14} />;
        case 'presentations': return <Presentation size={14} />;
        case 'case_studies': return <BookOpen size={14} />;
        case 'brainstorm': return <Lightbulb size={14} />;
        case 'plots': return <LineChart size={14} />;
        case 'summaries': return <FileText size={14} />;
        // Keep old ones for backward compatibility
        case 'Images': return <Image size={14} />;
        case 'Videos': return <Video size={14} />;
        case 'Audio': return <Music size={14} />;
        case 'PDFs': return <FileText size={14} />;
        case 'Documents': return <FileIcon size={14} />;
        case 'Spreadsheets': return <FileSpreadsheet size={14} />;
        case 'Code': return <Code size={14} />;
        case 'Archives': return <Archive size={14} />;
        case 'Notes': return <StickyNote size={14} />;
        default: return <Folder size={14} />;
    }
};

const FileExplorer = ({ user, externalSearchQuery, onFileCountChange, darkMode }) => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
    const [internalSearchQuery, setInternalSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState('root'); // 'root' or group name
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    const [previewType, setPreviewType] = useState(null); // 'image', 'video', 'audio', 'pdf', 'text', 'code', 'other'
    const [showInfo, setShowInfo] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [shouldRenderLoader, setShouldRenderLoader] = useState(false);
    const [fileToDelete, setFileToDelete] = useState(null); // Name of file to delete
    const [showSource, setShowSource] = useState(false); // Toggle between rendered and source for md/html
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Flowchart State
    const [svgContent, setSvgContent] = useState(null);
    const [renderError, setRenderError] = useState(null);
    const [zoom, setZoom] = useState(2); // Default to 200%
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [chartViewMode, setChartViewMode] = useState('preview'); // 'preview' | 'code'

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };

        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownOpen]);


    // Fetch preview when selectedFile changes
    useEffect(() => {
        setShowInfo(false); // Reset info view
        setShowSource(false); // Reset source view on file change
        if (!selectedFile) {
            setPreviewUrl(null);
            setPreviewContent(null);
            setPreviewType(null);
            return;
        }



        const fetchPreview = async () => {
            setLoadingPreview(true);
            const file = selectedFile;
            const ext = file.name.split('.').pop().toLowerCase();
            const path = file.fullPath || `${user.id}/${file.name}`;

            let type = 'other';
            if (EXTENSION_GROUPS.Images.includes(ext)) type = 'image';
            else if (EXTENSION_GROUPS.Videos.includes(ext)) type = 'video';
            else if (EXTENSION_GROUPS.Audio.includes(ext)) type = 'audio';
            else if (EXTENSION_GROUPS.PDFs.includes(ext)) type = 'pdf';
            else if (EXTENSION_GROUPS.Spreadsheets.includes(ext)) type = 'spreadsheet';
            else if (EXTENSION_GROUPS.Documents.includes(ext)) type = 'document';
            else if (['md', 'markdown'].includes(ext)) type = 'markdown'; // Explicit check
            else if (['html', 'htm'].includes(ext)) type = 'html'; // Explicit check
            else if (EXTENSION_GROUPS.Flowcharts.includes(ext)) type = 'flowchart';
            else if (EXTENSION_GROUPS.Code.includes(ext)) type = 'code';
            else if (EXTENSION_GROUPS.Notes.includes(ext)) type = 'text';

            setPreviewType(type);

            try {
                if (['image', 'video', 'audio', 'pdf', 'document'].includes(type)) { // Added document here for URL generation
                    // Get Signed URL
                    const { data, error } = await supabase.storage
                        .from(BUCKET_NAME)
                        .createSignedUrl(path, 3600); // 1 hour

                    if (data?.signedUrl) {
                        setPreviewUrl(data.signedUrl);
                        // For documents (Word, PPT), PDFs, video, audio, we turn off loader once URL is ready.
                        // Images handle their own loading state via onLoad in the render.
                        // Video now handles its own loading state via onLoadedData in the render.
                        if (type !== 'image' && type !== 'video') {
                            setLoadingPreview(false);
                        }
                    } else {
                        console.error('Error creating signed URL:', error);
                        setLoadingPreview(false);
                    }
                } else if (['text', 'code', 'markdown', 'html', 'flowchart'].includes(type)) {
                    // Download content
                    if (file.metadata?.size > 1024 * 1024) {
                        setPreviewContent("File too large to preview.");
                        setLoadingPreview(false);
                        return;
                    }

                    const { data, error } = await supabase.storage
                        .from(BUCKET_NAME)
                        .download(path);

                    if (data) {
                        const text = await data.text();
                        setPreviewContent(text);
                    } else {
                        setPreviewContent("Failed to load content.");
                    }
                    setLoadingPreview(false);
                } else if (type === 'spreadsheet') {
                    // Handle Spreadsheet
                    const { data, error } = await supabase.storage
                        .from(BUCKET_NAME)
                        .download(path);

                    if (data) {
                        const arrayBuffer = await data.arrayBuffer();
                        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Header: 1 gives array of arrays
                        setPreviewContent(jsonData);
                    } else {
                        console.error("Error dl spreadsheet", error);
                        setPreviewContent(null);
                    }
                    setLoadingPreview(false);
                } else {
                    setLoadingPreview(false);
                }

            } catch (err) {
                console.error("Preview fetch error:", err);
                setLoadingPreview(false);
            }
        };

        fetchPreview();
    }, [selectedFile, user.id]);

    // Cleanup svg content when closing or changing content
    useEffect(() => {
        setSvgContent(null);
        setRenderError(null);
        setZoom(2); // Reset to 200%
        setPan({ x: 0, y: 0 });
        setChartViewMode('preview');
    }, [selectedFile]);

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

    // Keyboard Navigation Logic
    useEffect(() => {
        if (!selectedFile || previewType !== 'flowchart' || chartViewMode !== 'preview') return;

        const handleKeyDown = (e) => {
            const step = 40 / zoom;

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
    }, [selectedFile, previewType, chartViewMode, zoom]);

    // Mermaid Rendering Logic
    useEffect(() => {
        let isMounted = true;
        const renderDiagram = async () => {
            if (previewType !== 'flowchart' || !previewContent || chartViewMode !== 'preview') return;

            try {
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

                const id = `mermaid-explorer-${Date.now()}`;

                // Pre-process code
                let cleanCode = sanitizeMermaidCode(previewContent);

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
                // Retry logic
                try {
                    const id = `mermaid-explorer-${Date.now()}-retry`;
                    const simpleCode = sanitizeMermaidCode(previewContent)
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
                    setRenderError('Failed to render flowchart. Check code.');
                }
            }
        };

        renderDiagram();
        return () => { isMounted = false; };
    }, [previewContent, previewType, chartViewMode]);

    const handleWheel = (e) => {
        if (previewType !== 'flowchart') return;
        const scaleBy = 1.1;
        const newZoom = e.deltaY < 0 ? Math.min(zoom * scaleBy, 5) : Math.max(zoom / scaleBy, 0.2);
        setZoom(newZoom);
    };

    useEffect(() => {
        let timeout;
        if (loadingPreview) {
            setShouldRenderLoader(true);
        } else {
            timeout = setTimeout(() => {
                setShouldRenderLoader(false);
            }, 750); // Slightly longer than 700ms transition to be safe
        }
        return () => clearTimeout(timeout);
    }, [loadingPreview]);

    // Use external query if provided, otherwise internal
    const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;

    const BUCKET_NAME = 'drive';

    useEffect(() => {
        if (user) {
            fetchFiles();
        }
    }, [user]);

    const fetchFiles = async () => {
        setLoading(true);
        try {
            // Define storage folders
            const storageFolders = ['images', 'documents', 'flowcharts', 'emails', 'research',
                'presentations', 'case_studies', 'brainstorm', 'plots', 'summaries'];

            let allFiles = [];

            // Fetch files from each folder
            for (const folder of storageFolders) {
                try {
                    const { data, error } = await supabase
                        .storage
                        .from(BUCKET_NAME)
                        .list(`${user.id}/${folder}`, {
                            limit: 100,
                            offset: 0,
                            sortBy: { column: 'created_at', order: 'desc' },
                        });

                    if (error) {
                        console.log(`[${folder}] Fetch error:`, error);
                    }

                    if (!error && data) {
                        console.log(`[${folder}] Found ${data.length} files:`, data.map(f => f.name));
                        // Add folder info to each file
                        const filesWithFolder = data.map(file => ({
                            ...file,
                            folder: folder,
                            fullPath: `${user.id}/${folder}/${file.name}`
                        }));
                        allFiles = [...allFiles, ...filesWithFolder];
                    }
                } catch (err) {
                    console.error(`Error fetching from ${folder}:`, err);
                }
            }

            // Check if empty and upload welcome.txt
            if (allFiles.length === 0) {
                const welcomeContent = "Welcome to your Project Cloud Drive!\n\nThis is a safe place to store your project data.";
                const welcomeFile = new File([welcomeContent], "welcome.txt", { type: "text/plain" });
                try {
                    const { error: uploadError } = await supabase.storage
                        .from(BUCKET_NAME)
                        .upload(`${user.id}/documents/welcome.txt`, welcomeFile);

                    if (!uploadError) {
                        const now = new Date().toISOString();
                        allFiles = [{
                            name: "welcome.txt",
                            id: "welcome-dummy-id",
                            folder: "documents",
                            fullPath: `${user.id}/documents/welcome.txt`,
                            updated_at: now,
                            created_at: now,
                            last_accessed_at: now,
                            metadata: { size: welcomeFile.size, mimetype: "text/plain" }
                        }];
                    }
                } catch (e) {
                    console.error("Auto-upload failed", e);
                }
            }

            setFiles(allFiles);
            if (onFileCountChange) onFileCountChange(allFiles.length);
        } catch (err) {
            console.error("Unexpected error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (fileName) => {
        if (fileName === 'welcome.txt') {
            toast.error("The welcome file cannot be deleted.");
            return;
        }
        setFileToDelete(fileName);
    };

    const confirmDelete = async () => {
        if (!fileToDelete) return;

        try {
            // Find the file to get its folder path
            const fileObj = files.find(f => f.name === fileToDelete);
            const filePath = fileObj?.fullPath || `${user.id}/${fileToDelete}`;

            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([filePath]);

            if (error) {
                toast.error(`Error deleting file: ${error.message}`);
            } else {
                const newFiles = files.filter(f => f.name !== fileToDelete);
                setFiles(newFiles);
                toast.success('File deleted successfully');
                if (onFileCountChange) onFileCountChange(newFiles.length);
                if (selectedFile?.name === fileToDelete) setSelectedFile(null);
            }
        } catch (err) {
            console.error("Delete error:", err);
            toast.error("Failed to delete file");
        } finally {
            setFileToDelete(null);
        }
    };

    const handleDownload = async (fileName) => {
        try {
            // Find the file to get its folder path
            const fileObj = files.find(f => f.name === fileName);
            const filePath = fileObj?.fullPath || `${user.id}/${fileName}`;

            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(filePath);

            if (error) throw error;

            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error("Download error:", err);
            alert("Download failed.");
        }
    };

    const getFileIcon = (mimeType, fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();

        if (EXTENSION_GROUPS.Images.includes(ext) || mimeType?.startsWith('image/')) return <Image className="text-blue-400" size={40} />;
        if (EXTENSION_GROUPS.Videos.includes(ext) || mimeType?.startsWith('video/')) return <Video className="text-red-400" size={40} />;
        if (EXTENSION_GROUPS.Audio.includes(ext) || mimeType?.startsWith('audio/')) return <Music className="text-purple-400" size={40} />;

        if (EXTENSION_GROUPS.PDFs.includes(ext)) return <FileText className="text-red-500" size={40} />;
        if (EXTENSION_GROUPS.Spreadsheets.includes(ext)) return <FileSpreadsheet className="text-green-500" size={40} />;
        if (EXTENSION_GROUPS.Code.includes(ext)) return <FileCode className="text-yellow-500" size={40} />;
        if (EXTENSION_GROUPS.Archives.includes(ext)) return <Archive className="text-orange-400" size={40} />;
        if (EXTENSION_GROUPS.Notes.includes(ext)) return <StickyNote className="text-yellow-200" size={40} />;
        if (EXTENSION_GROUPS.Flowcharts.includes(ext)) return <BarChart className="text-indigo-400" size={40} />;
        if (EXTENSION_GROUPS.Documents.includes(ext)) return <FileText className="text-blue-500" size={40} />;

        return <FileIcon className="text-gray-400" size={40} />;
    };

    // --- Grouping Logic ---
    const getFileCategory = (file) => {
        const name = file.name.toLowerCase();
        const ext = name.split('.').pop();

        if (EXTENSION_GROUPS.Images.includes(ext)) return 'Images';
        if (EXTENSION_GROUPS.Videos.includes(ext)) return 'Videos';
        if (EXTENSION_GROUPS.Audio.includes(ext)) return 'Audio';

        if (EXTENSION_GROUPS.PDFs.includes(ext)) return 'PDFs';
        if (EXTENSION_GROUPS.Spreadsheets.includes(ext)) return 'Spreadsheets';
        if (EXTENSION_GROUPS.Code.includes(ext)) return 'Code';
        if (EXTENSION_GROUPS.Archives.includes(ext)) return 'Archives';
        if (EXTENSION_GROUPS.Flowcharts.includes(ext)) return 'Flowcharts';
        if (EXTENSION_GROUPS.Notes.includes(ext)) return 'Notes';
        if (EXTENSION_GROUPS.Documents.includes(ext)) return 'Documents';

        return 'Others';
    };

    const groupedFiles = React.useMemo(() => {
        const groups = {
            images: [],
            documents: [],
            flowcharts: [],
            emails: [],
            research: [],
            presentations: [],
            case_studies: [],
            brainstorm: [],
            plots: [],
            summaries: [],
            Others: []
        };

        files.forEach(file => {
            const folder = file.folder || 'Others';
            if (groups[folder]) {
                groups[folder].push(file);
            } else {
                groups.Others.push(file);
            }
        });

        return groups;
    }, [files]);

    const activeFiles = currentFolder === 'root'
        ? files
        : groupedFiles[currentFolder] || [];

    const isSearching = searchQuery.trim().length > 0;

    const displayFiles = isSearching
        ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : activeFiles;

    const showingFolders = !isSearching && currentFolder === 'root';

    if (!user) {
        return <div className="text-center py-20 text-muted-foreground">Please log in to view your files.</div>;
    }

    return (
        <div className="w-full max-w-[1400px] mx-auto p-6 min-h-[600px] bg-background/50 rounded-xl">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div className="flex items-center justify-between w-full md:w-auto md:justify-start md:flex-1 gap-4">
                    {isSearching ? (
                        <h2 className="text-xl font-semibold px-2">Search Results</h2>
                    ) : (
                        /* Breadcrumb Navigation */
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <button
                                onClick={() => setCurrentFolder('root')}
                                className={`flex items-center gap-1.5 transition-colors ${currentFolder === 'root' ? 'text-foreground font-medium' : 'hover:text-foreground'}`}
                            >
                                <Home size={18} />
                                <span className="hidden md:inline">My Drive</span>
                            </button>

                            {currentFolder !== 'root' && (
                                <>
                                    <ChevronRight size={14} />
                                    <div className="relative" ref={dropdownRef}>
                                        <button
                                            onClick={() => setDropdownOpen(!dropdownOpen)}
                                            className="flex items-center gap-2 text-foreground font-medium bg-card hover:bg-secondary border border-border px-3 py-1.5 rounded-lg transition-all"
                                        >
                                            {getFolderIcon(currentFolder)}
                                            <span className="capitalize hidden md:inline">{currentFolder.replace('_', ' ')}</span>
                                            <ChevronDown size={14} className={`opacity-50 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Dropdown Menu */}
                                        {dropdownOpen && (
                                            <div className="absolute top-full left-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 cursor-default">
                                                <div className="max-h-96 overflow-y-auto p-1">
                                                    {Object.keys(groupedFiles)
                                                        .filter(group => groupedFiles[group].length > 0)
                                                        .map(group => (
                                                            <button
                                                                key={group}
                                                                onClick={() => {
                                                                    setCurrentFolder(group);
                                                                    setDropdownOpen(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 rounded-lg transition-colors ${currentFolder === group ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-secondary'}`}
                                                            >
                                                                <span className={currentFolder === group ? 'text-primary' : 'text-muted-foreground'}>
                                                                    {getFolderIcon(group)}
                                                                </span>
                                                                <span className="capitalize">{group.replace('_', ' ')}</span>
                                                                {currentFolder === group && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                                                            </button>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchFiles}
                            className="p-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-all shrink-0"
                            title="Refresh"
                            disabled={loading}
                        >
                            <RotateCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                        {!showingFolders && (
                            <div className="flex bg-secondary/50 rounded-lg p-1 border border-border">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <Grid size={18} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    <List size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                {/* Show internal search only if external is NOT provided */}
                {externalSearchQuery === undefined && (
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Search files..."
                            value={internalSearchQuery}
                            onChange={(e) => setInternalSearchQuery(e.target.value)}
                            className="w-full bg-secondary/50 border border-border rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                )}
            </div>

            {/* Content */}
            {
                loading ? (
                    <div className="relative h-64 w-full">
                        <LoadingScreen isGlobal={false} transparent={true} darkMode={darkMode} sizeClass="w-32 h-32" />
                    </div>
                ) : isSearching && displayFiles.length === 0 ? (
                    <div className="flex flex-col justify-center items-center h-64 text-muted-foreground">
                        <Search size={48} className="mb-4 opacity-20" />
                        <p>No files matching "{searchQuery}"</p>
                    </div>
                ) : showingFolders ? (
                    // FOLDER VIEW
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {Object.entries(groupedFiles).map(([groupName, groupFiles]) => (
                            <motion.div
                                key={groupName}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    if (groupedFiles[groupName]?.length > 0) {
                                        setCurrentFolder(groupName);
                                    } else {
                                        toast.error(`No files in ${groupName}`, {
                                            description: "This folder is currently empty."
                                        });
                                    }
                                }}
                                className="bg-card hover:bg-secondary/40 border border-border/50 hover:border-border rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all aspect-square gap-4"
                            >
                                <div className={`p-4 rounded-full bg-secondary/30 ${groupFiles.length > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {groupName === 'images' && <Image size={32} />}
                                    {groupName === 'documents' && <FileText size={32} />}
                                    {groupName === 'flowcharts' && <BarChart size={32} />}
                                    {groupName === 'emails' && <Mail size={32} />}
                                    {groupName === 'research' && <Search size={32} />}
                                    {groupName === 'presentations' && <Presentation size={32} />}
                                    {groupName === 'case_studies' && <BookOpen size={32} />}
                                    {groupName === 'brainstorm' && <Lightbulb size={32} />}
                                    {groupName === 'plots' && <LineChart size={32} />}
                                    {groupName === 'summaries' && <FileText size={32} />}
                                    {groupName === 'Others' && <Folder size={32} />}
                                </div>
                                <div className="text-center">
                                    <h3 className="font-medium text-lg capitalize">{groupName.replace('_', ' ')}</h3>
                                    <p className="text-sm text-muted-foreground">{groupFiles.length} items</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    // FILE VIEW (Grid/List)
                    <>
                        {displayFiles.length === 0 ? (
                            <div className="flex flex-col justify-center items-center h-64 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                                <Folder size={48} className="mb-4 opacity-20" />
                                <p>This folder is empty</p>
                            </div>
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                <AnimatePresence>
                                    {displayFiles.map((file) => (
                                        <motion.div
                                            key={file.id}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            layout
                                            onClick={() => setSelectedFile(file)}
                                            className="group relative bg-card hover:bg-secondary/40 border border-border/50 hover:border-border rounded-xl p-4 flex flex-col items-center justify-between aspect-[4/5] transition-all cursor-pointer"
                                        >
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownload(file.name); }}
                                                        className="p-1.5 bg-background/90 rounded-full hover:bg-background hover:text-primary shadow-sm"
                                                        title="Download"
                                                    >
                                                        <Download size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(file.name); }}
                                                        className="p-1.5 bg-background/90 rounded-full hover:bg-background hover:text-destructive shadow-sm"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Extension Badge */}
                                            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-md bg-background/90 text-muted-foreground shadow-sm">
                                                    .{file.name.split('.').pop()}
                                                </span>
                                            </div>

                                            <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
                                                {/* Thumbnail or Icon */}
                                                <div className="p-4 rounded-2xl bg-secondary/30 group-hover:bg-secondary/50 transition-colors">
                                                    {getFileIcon(file.metadata?.mimetype, file.name)}
                                                </div>
                                            </div>

                                            <div className="w-full mt-4 text-center">
                                                <p className="text-sm font-medium truncate w-full" title={file.name}>{file.name}</p>
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                    {filesize(file.metadata?.size || 0)}
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {/* List Header */}
                                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
                                    <div>Name</div>
                                    <div className="w-32">Size</div>
                                    <div className="w-32 text-right">Actions</div>
                                </div>
                                <AnimatePresence>
                                    {displayFiles.map((file) => (
                                        <motion.div
                                            key={file.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            onClick={() => setSelectedFile(file)}
                                            className="group grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 bg-card hover:bg-secondary/40 border border-transparent hover:border-border/50 rounded-lg transition-colors cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="shrink-0 scale-75">
                                                    {getFileIcon(file.metadata?.mimetype, file.name)}
                                                </div>
                                                <span className="truncate font-medium text-sm">{file.name}</span>
                                            </div>
                                            <div className="w-32 text-xs text-muted-foreground">
                                                {filesize(file.metadata?.size || 0)}
                                            </div>
                                            <div className="w-32 flex justify-end gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDownload(file.name); }}
                                                    className="p-1.5 hover:bg-background rounded-md text-foreground/70 hover:text-foreground transition-colors"
                                                    title="Download"
                                                >
                                                    <Download size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(file.name); }}
                                                    className="p-1.5 hover:bg-background rounded-md text-foreground/70 hover:text-destructive transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </>
                )
            }
            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {fileToDelete && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setFileToDelete(null)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative bg-card border border-border w-full max-w-sm rounded-xl p-6 shadow-2xl flex flex-col gap-4"
                        >
                            <div className="flex flex-col gap-2 text-center items-center">
                                <div className="p-3 bg-destructive/10 text-destructive rounded-full mb-2">
                                    <Trash2 size={24} />
                                </div>
                                <h3 className="text-lg font-semibold text-foreground">Delete File?</h3>
                                <p className="text-sm text-muted-foreground">
                                    Are you sure you want to delete <span className="font-medium text-foreground">"{fileToDelete}"</span>? This action cannot be undone.
                                </p>
                            </div>
                            <div className="flex gap-3 mt-2">
                                <button
                                    onClick={() => setFileToDelete(null)}
                                    className="flex-1 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* File Drawer */}
            <Drawer.Root open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
                    <Drawer.Content className="bg-background flex flex-col rounded-t-[20px] h-[90vh] mt-24 fixed bottom-0 inset-x-0 mx-auto w-full max-w-4xl z-[200] border-t border-border outline-none shadow-2xl">
                        <div className="sr-only">
                            <Drawer.Title>{selectedFile?.name}</Drawer.Title>
                            <Drawer.Description>File details and preview</Drawer.Description>
                        </div>

                        {/* Top Bar with Actions (Relative, solid background) */}
                        <div className="flex items-center justify-between p-4 bg-background/95 backdrop-blur border-b border-border z-50 rounded-t-[20px]">
                            {/* Handle visually */}
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-muted-foreground/20" />

                            <div className="mt-2 text-left min-w-0">
                                <h2 className="text-foreground font-semibold truncate max-w-[200px] sm:max-w-md text-base">
                                    {selectedFile?.name}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                {/* Toggle Source/Render Button for MD/HTML */}
                                {(previewType === 'markdown' || previewType === 'html') && (
                                    <button
                                        onClick={() => setShowSource(!showSource)}
                                        className={`p-2 rounded-lg transition-all ${showSource ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                                        title={showSource ? "Show Preview" : "Show Source"}
                                    >
                                        {showSource ? <Eye size={18} /> : <CodeIcon size={18} />}
                                    </button>
                                )}



                                {/* Flowchart Controls */}
                                {previewType === 'flowchart' && (
                                    <>
                                        {chartViewMode === 'preview' && (
                                            <div className="flex items-center gap-1 mr-2 px-2 py-1 bg-secondary/50 rounded-lg">
                                                <button
                                                    onClick={() => { setZoom(2); setPan({ x: 0, y: 0 }); }}
                                                    className="px-2 py-1 text-xs font-medium hover:bg-background rounded-md transition-colors text-muted-foreground hover:text-foreground"
                                                >
                                                    Reset
                                                </button>
                                                <div className="w-px h-4 bg-border/50 mx-1" />
                                                <button onClick={() => setZoom(z => Math.max(0.2, z - 0.25))} className="p-1 hover:bg-background rounded-md"><ZoomOut size={16} /></button>
                                                <span className="text-xs font-medium w-8 text-center">{Math.round(zoom * 100)}%</span>
                                                <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-1 hover:bg-background rounded-md"><ZoomIn size={16} /></button>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setChartViewMode(chartViewMode === 'preview' ? 'code' : 'preview')}
                                            className={`p-2 rounded-lg transition-all ${chartViewMode === 'code' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                                            title={chartViewMode === 'preview' ? "View Code" : "View Diagram"}
                                        >
                                            <Code size={18} />
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => setShowInfo(!showInfo)}
                                    className={`p-2 rounded-lg transition-all ${showInfo ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                                    title="File Info"
                                >
                                    <Info size={18} />
                                </button>
                                <button
                                    onClick={() => handleDownload(selectedFile.name)}
                                    className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all box-border"
                                    title="Download"
                                >
                                    <Download size={18} />
                                </button>
                                <button
                                    onClick={() => {
                                        const fileName = selectedFile.name;
                                        setSelectedFile(null);
                                        setTimeout(() => handleDelete(fileName), 300);
                                    }}
                                    className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all box-border"
                                    title="Delete"
                                >
                                    <Trash2 size={18} />
                                </button>
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    className="p-2 rounded-lg hover:bg-secondary transition-all text-muted-foreground hover:text-foreground"
                                    title="Close"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="flex-1 relative w-full h-full overflow-hidden bg-background flex items-center justify-center">
                            {/* Loader Overlay */}
                            {shouldRenderLoader && (
                                <div className="absolute inset-0 z-[60] pointer-events-none">
                                    <LoadingScreen
                                        darkMode={darkMode}
                                        fadeOut={!loadingPreview}
                                        isGlobal={false}
                                    />
                                </div>
                            )}

                            {selectedFile && (
                                <>
                                    {previewType === 'image' && previewUrl ? (
                                        <div className="w-full h-full flex items-center justify-center p-4 sm:p-8 bg-muted/20">
                                            <img
                                                src={previewUrl}
                                                alt={selectedFile.name}
                                                onLoad={() => setLoadingPreview(false)}
                                                onError={() => setLoadingPreview(false)}
                                                className={`max-w-full max-h-full object-contain drop-shadow-sm transition-opacity duration-700 ${loadingPreview ? 'opacity-0' : 'opacity-100'}`}
                                            />
                                        </div>
                                    ) : previewType === 'video' && previewUrl ? (
                                        <div className="w-full h-full flex items-center justify-center bg-black">
                                            <video
                                                src={previewUrl}
                                                controls
                                                className="max-w-full max-h-full"
                                                onLoadedData={() => setLoadingPreview(false)}
                                            />
                                        </div>
                                    ) : previewType === 'audio' && previewUrl ? (
                                        <div className="flex flex-col items-center justify-center w-full h-full bg-muted/20">
                                            <AudioPreview previewUrl={previewUrl} />
                                        </div>
                                    ) : previewType === 'pdf' && previewUrl ? (
                                        <iframe src={previewUrl} className="w-full h-full border-0 outline-none bg-transparent" title="PDF Preview" />
                                    ) : previewType === 'document' && previewUrl ? (
                                        <iframe
                                            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`}
                                            className="w-full h-full border-0 outline-none bg-transparent"
                                            title="Document Preview"
                                        />
                                    ) : previewType === 'spreadsheet' && previewContent ? (
                                        <SpreadsheetPreview data={previewContent} />
                                    ) : previewType === 'flowchart' && chartViewMode === 'preview' ? (
                                        <div
                                            className="flex items-start pt-20 justify-center w-full h-full overflow-hidden bg-dot-pattern"
                                            onWheel={handleWheel}
                                            style={{ cursor: 'default' }}
                                        >
                                            {renderError ? (
                                                <div className="text-destructive p-4 border border-destructive/20 bg-destructive/5 rounded-lg text-center select-text cursor-default">
                                                    <AlertCircle className="mx-auto mb-2" />
                                                    <p>{renderError}</p>
                                                    <p className="text-xs mt-2 text-muted-foreground">Try switching to code view to inspect the error.</p>
                                                </div>
                                            ) : svgContent ? (
                                                <div
                                                    className="origin-top select-none pointer-events-none"
                                                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                                                    dangerouslySetInnerHTML={{ __html: svgContent }}
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground select-none">
                                                    <Loader2 className="animate-spin" />
                                                    <p>Rendering Flowchart...</p>
                                                </div>
                                            )}

                                            {/* Keyboard shortcut hints - Arrows Only (Interactive) - Same as ResultDrawer */}
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
                                    ) : (previewType === 'markdown' || (previewType === 'flowchart' && chartViewMode === 'code')) && previewContent !== null ? (
                                        <div className="w-full h-full overflow-auto bg-background text-foreground p-4 sm:p-8">
                                            {showSource || chartViewMode === 'code' ? (
                                                <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words max-w-4xl mx-auto bg-muted/30 p-4 rounded-lg">
                                                    {previewContent}
                                                </pre>
                                            ) : (
                                                /* Enhanced GitHub-like Markdown Container */
                                                <div className="prose prose-sm md:prose-base dark:prose-invert max-w-4xl mx-auto prose-headings:font-semibold prose-a:text-blue-500 hover:prose-a:underline prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {previewContent}
                                                    </ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    ) : previewType === 'html' && previewContent !== null ? (
                                        <div className="w-full h-full overflow-hidden bg-background">
                                            {showSource ? (
                                                <div className="w-full h-full overflow-auto p-4 sm:p-8">
                                                    <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words max-w-4xl mx-auto bg-muted/30 p-4 rounded-lg text-foreground">
                                                        {previewContent}
                                                    </pre>
                                                </div>
                                            ) : (
                                                <iframe
                                                    srcDoc={previewContent}
                                                    className="w-full h-full border-0 outline-none bg-white"
                                                    title="HTML Preview"
                                                />
                                            )}
                                        </div>
                                    ) : (previewType === 'text' || previewType === 'code') && previewContent !== null ? (
                                        <div className="w-full h-full overflow-auto bg-muted/30 text-foreground p-4 sm:p-8">
                                            <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words max-w-4xl mx-auto">
                                                {previewContent}
                                            </pre>
                                        </div>
                                    ) : (
                                        /* Fallback */
                                        <div className="flex flex-col items-center gap-6 text-muted-foreground opacity-50">
                                            {(() => {
                                                const ext = selectedFile.name.split('.').pop().toLowerCase();
                                                if (EXTENSION_GROUPS.Spreadsheets.includes(ext)) return <FileSpreadsheet size={80} />;
                                                if (EXTENSION_GROUPS.Flowcharts.includes(ext)) return <BarChart size={80} />;
                                                if (EXTENSION_GROUPS.Archives.includes(ext)) return <Archive size={80} />;
                                                return <FileIcon size={80} />;
                                            })()}
                                            <p className="text-lg font-medium">No Preview Available</p>
                                        </div>
                                    )}

                                    {/* Info Overlay Panel */}
                                    {showInfo && (
                                        <div className="absolute top-4 right-4 w-72 md:w-80 bg-card border border-border rounded-xl p-4 shadow-xl z-50 animate-in fade-in slide-in-from-top-4 zoom-in-95">
                                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Details</h3>
                                            <div className="space-y-3 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Type</span>
                                                    <span className="text-foreground font-mono text-xs">{selectedFile.metadata?.mimetype || 'Unknown'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Size</span>
                                                    <span className="text-foreground">{filesize(selectedFile.metadata?.size || 0)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Uploaded</span>
                                                    <span className="text-foreground text-xs text-right">
                                                        {new Date(selectedFile.created_at).toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="pt-2">
                                                    <span className="text-muted-foreground block mb-1">Path</span>
                                                    <code className="block bg-muted p-2 rounded text-xs text-foreground break-all select-all border border-border">
                                                        {user.id}/{selectedFile.name}
                                                    </code>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </Drawer.Content>
                </Drawer.Portal>
            </Drawer.Root>
        </div >
    );
};

export default FileExplorer;
