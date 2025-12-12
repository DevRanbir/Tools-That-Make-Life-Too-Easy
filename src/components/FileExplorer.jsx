import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import {
    File as FileIcon, FileText, Image, Music, Video, MoreVertical,
    Trash2, Download, Grid, List, Search
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { filesize } from 'filesize';
import { motion, AnimatePresence } from 'framer-motion';

const FileExplorer = ({ user, externalSearchQuery, onFileCountChange }) => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
    const [internalSearchQuery, setInternalSearchQuery] = useState('');

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
            const { data, error } = await supabase
                .storage
                .from(BUCKET_NAME)
                .list(user.id + '/', {
                    limit: 100,
                    offset: 0,
                    sortBy: { column: 'created_at', order: 'desc' },
                });

            if (error) {
                console.error("Error fetching files:", error);
            } else {
                let fileList = data || [];

                // Check if empty and upload welcome.txt
                if (fileList.length === 0) {
                    const welcomeContent = "Welcome to your Project Cloud Drive!\n\nThis is a safe place to store your project data.";
                    const welcomeFile = new File([welcomeContent], "welcome.txt", { type: "text/plain" });
                    try {
                        const { error: uploadError } = await supabase.storage
                            .from(BUCKET_NAME)
                            .upload(`${user.id}/welcome.txt`, welcomeFile);

                        if (!uploadError) {
                            // Manually object since re-fetching might be overkill for one file
                            const now = new Date().toISOString();
                            fileList = [{
                                name: "welcome.txt",
                                id: "welcome-dummy-id",
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

                setFiles(fileList);
                if (onFileCountChange) onFileCountChange(fileList.length);
            }
        } catch (err) {
            console.error("Unexpected error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (fileName) => {
        if (fileName === 'welcome.txt') {
            alert("The welcome file cannot be deleted.");
            return;
        }

        if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

        try {
            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([`${user.id}/${fileName}`]);

            if (error) {
                alert(`Error deleting file: ${error.message}`);
            } else {
                const newFiles = files.filter(f => f.name !== fileName);
                setFiles(newFiles);
                if (onFileCountChange) onFileCountChange(newFiles.length);
            }
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const handleDownload = async (fileName) => {
        try {
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(`${user.id}/${fileName}`);

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
        if (mimeType?.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return <Image className="text-blue-400" size={40} />;
        if (mimeType?.startsWith('video/') || fileName.match(/\.(mp4|mov|avi)$/i)) return <Video className="text-red-400" size={40} />;
        if (mimeType?.startsWith('audio/') || fileName.match(/\.(mp3|wav)$/i)) return <Music className="text-purple-400" size={40} />;
        if (fileName.match(/\.pdf$/i)) return <FileText className="text-red-500" size={40} />;
        return <FileIcon className="text-gray-400" size={40} />;
    };

    const filteredFiles = files.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!user) {
        return <div className="text-center py-20 text-muted-foreground">Please log in to view your files.</div>;
    }

    return (
        <div className="w-full max-w-[1400px] mx-auto p-6 min-h-[600px] bg-background/50 rounded-xl">
            {/* Toolbar */}
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold px-2">My Drive</h2>
                </div>

                <div className="flex items-center gap-3">
                    {/* Show internal search only if external is NOT provided */}
                    {externalSearchQuery === undefined && (
                        <div className="relative flex-1 md:w-64">
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
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : filteredFiles.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-64 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                    <FileIcon size={48} className="mb-4 opacity-20" />
                    <p>No files found</p>
                </div>
            ) : (
                <>
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            <AnimatePresence>
                                {filteredFiles.map((file) => (
                                    <motion.div
                                        key={file.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        layout
                                        className="group relative bg-card hover:bg-secondary/40 border border-border/50 hover:border-border rounded-xl p-4 flex flex-col items-center justify-between aspect-[4/5] transition-all"
                                    >
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleDownload(file.name)}
                                                    className="p-1.5 bg-background/80 rounded-full hover:bg-background hover:text-primary shadow-sm"
                                                    title="Download"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(file.name)}
                                                    className="p-1.5 bg-background/80 rounded-full hover:bg-background hover:text-destructive shadow-sm"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex-1 flex items-center justify-center w-full">
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
                                {filteredFiles.map((file) => (
                                    <motion.div
                                        key={file.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="group grid grid-cols-[1fr_auto_auto] gap-4 items-center px-4 py-3 bg-card hover:bg-secondary/40 border border-transparent hover:border-border/50 rounded-lg transition-colors"
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
                                                onClick={() => handleDownload(file.name)}
                                                className="p-1.5 hover:bg-background rounded-md text-foreground/70 hover:text-foreground transition-colors"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(file.name)}
                                                className="p-1.5 hover:bg-background rounded-md text-foreground/70 hover:text-destructive transition-colors"
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
            )}
        </div>
    );
};

export default FileExplorer;
