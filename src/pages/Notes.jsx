import React, { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import {
    ChevronDown, Plus, Save, FileText, Trash2, Loader2,
    Search, Upload, Cloud, X, Bold, Italic,
    Underline, List, Code, Menu, AlignLeft,
    Heading1, Heading2, Quote, MoreHorizontal, Settings,
    Command, Keyboard, FolderOpen, Sidebar, ChevronLeft, Eye, Code2
} from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const NotesPage = ({ navigateOnly, user }) => {
    // --- Navigation Tabs ---
    const navTabs = [
        { id: 'todos', label: 'Todo' },
        { id: 'notes', label: 'Notes' },
        { id: 'calendar', label: 'Calendar' }
    ];

    // --- State ---
    const [activeFile, setActiveFile] = useState(null);
    const [openFiles, setOpenFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Drive/Explorer State
    const [isExplorerOpen, setIsExplorerOpen] = useState(true);
    const [driveFiles, setDriveFiles] = useState([]);
    const [loadingDrive, setLoadingDrive] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Save/Name State
    const [showNameModal, setShowNameModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [editingTab, setEditingTab] = useState(null); // Track which tab is being renamed (by filename)
    const [tempTabName, setTempTabName] = useState(''); // Temp state for input

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, file: null });

    // Menu State
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);

    const editorRef = useRef(null);
    const codeEditorRef = useRef(null);

    // --- Effect to sync content to Editor when File/Mode changes (fixes "olleh" cursor jump) ---
    useEffect(() => {
        if (!activeFile) return;

        // If Rich Mode: Manually set innerHTML only on file switch/mode switch
        // We do NOT want to set it on every render (typing), as that resets cursor.
        if (activeFile.viewMode === 'rich' && editorRef.current) {
            // Only update if significantly different to avoid cursor issues on minor re-renders (though dependency array handles most)
            if (editorRef.current.innerHTML !== activeFile.content) {
                editorRef.current.innerHTML = activeFile.content;
            }
        }
    }, [activeFile?.id, activeFile?.name, activeFile?.viewMode]); // Only re-sync if ID/Name or ViewMode changes

    // --- Auto-Fetch Drive Files ---
    useEffect(() => {
        if (user) fetchDrive();
    }, [user]);

    // --- Dynamic Sidebar Width ---
    const sidebarWidth = useMemo(() => {
        if (driveFiles.length === 0) return 250;
        const maxLen = Math.max(...driveFiles.map(f => f.name.length));
        const calculated = (maxLen * 8.5) + 60;
        return Math.min(450, Math.max(250, calculated));
    }, [driveFiles]);

    // --- Actions ---

    const execCmd = (command, value = null) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            editorRef.current.focus();
        }
        handleInput();
    };

    const fetchDrive = async () => {
        if (!user) return;
        setLoadingDrive(true);
        try {
            const { data, error } = await supabase.storage.from('drive').list(`${user.id}/`, {
                limit: 100, sortBy: { column: 'created_at', order: 'desc' }
            });
            if (error) throw error;
            const validExts = ['html', 'txt', 'md', 'json', 'js', 'css'];
            const filtered = data.filter(f => validExts.some(ext => f.name.toLowerCase().endsWith('.' + ext)));
            setDriveFiles(filtered);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load drive files");
        } finally {
            setLoadingDrive(false);
        }
    };

    const handleNew = () => {
        const file = {
            name: 'Untitled Note',
            content: '<h1>New Note</h1><p>Start writing...</p>',
            dirty: true,
            isNew: true,
            viewMode: 'rich',
            id: Date.now().toString()
        };
        openFileSession(file);
        setIsExplorerOpen(false);
        setShowMenu(false);
    };

    const handleDelete = (e, file) => {
        e.stopPropagation();
        if (file.name === 'welcome.txt') return toast.error("Cannot delete welcome file");
        setDeleteConfirm({ isOpen: true, file });
    };

    const confirmDelete = async () => {
        const file = deleteConfirm.file;
        if (!file) return;

        const toastId = toast.loading("Deleting...");
        try {
            const { error } = await supabase.storage.from('drive').remove([`${user.id}/${file.name}`]);
            if (error) throw error;

            setDriveFiles(prev => prev.filter(f => f.name !== file.name));

            // Close tab if open
            if (openFiles.some(f => f.name === file.name)) {
                const remain = openFiles.filter(f => f.name !== file.name);
                setOpenFiles(remain);
                if (activeFile?.name === file.name) {
                    setActiveFile(remain.length > 0 ? remain[remain.length - 1] : null);
                }
            }
            toast.success("Deleted");
            toast.dismiss(toastId);
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete", { id: toastId });
        } finally {
            setDeleteConfirm({ isOpen: false, file: null });
        }
    };

    const importFile = async (fileStub) => {
        const toastId = toast.loading("Opening...");
        try {
            const { data, error } = await supabase.storage.from('drive').download(`${user.id}/${fileStub.name}`);
            if (error) throw error;
            const text = await data.text();

            const isCodeFile = fileStub.name.match(/\.(html|md|js|css|json)$/i);

            openFileSession({
                name: fileStub.name,
                content: text,
                dirty: false,
                isNew: false,
                viewMode: isCodeFile ? 'code' : 'rich',
                id: fileStub.id || fileStub.name
            });
            setIsExplorerOpen(false);
            toast.dismiss(toastId);
        } catch (e) {
            toast.error("Error opening file", { id: toastId });
        }
    };

    const openFileSession = (file) => {
        const existing = openFiles.find(f => f.name === file.name);
        if (existing) {
            setActiveFile(existing);
        } else {
            setOpenFiles(prev => [...prev, file]);
            setActiveFile(file);
        }
    };

    // --- Tab Renaming Logic ---
    const startRenaming = (e, file) => {
        e.stopPropagation();
        if (file.name === 'welcome.txt') return; // Uneditable
        if (activeFile?.name === file.name) {
            setEditingTab(file.name);
            setTempTabName(file.name);
        } else {
            setActiveFile(file);
        }
    };

    const finishRenaming = async () => {
        if (!editingTab) return;
        const oldName = editingTab;
        let newFinalName = tempTabName.trim();

        if (!newFinalName || newFinalName === oldName) {
            setEditingTab(null);
            return;
        }

        // If not new, we should technically allow rename, but Supabase rename is tricky.
        // For now, let's treat it as a "Save As" if dirty, OR a Move if saved.
        // Simplest User Flow: Just rename the tab. Next save saves to new name. Old file stays?
        // Better: Actually rename in list.

        // 1. Check for duplicates in open tabs
        if (openFiles.some(f => f.name === newFinalName && f.name !== oldName)) {
            toast.error("File with this name is already open");
            return; // Don't revert, let user fix
        }

        const isSavedFile = !activeFile.isNew;

        // If it's a saved file, try to rename on server
        if (isSavedFile) {
            const toastId = toast.loading("Renaming...");
            try {
                // Supabase Storage 'move'
                const { error } = await supabase.storage.from('drive').move(`${user.id}/${oldName}`, `${user.id}/${newFinalName}`);
                if (error) throw error;

                toast.dismiss(toastId);
                toast.success("Renamed!");

                // Update Drive List
                fetchDrive();
            } catch (e) {
                console.error(e);
                toast.error("Rename failed", { id: toastId });
                // Fallback: don't update UI name if server failed
                setEditingTab(null);
                return;
            }
        }

        // Update local state
        const updatedFile = { ...activeFile, name: newFinalName };
        setOpenFiles(prev => prev.map(f => f.name === oldName ? updatedFile : f));
        setActiveFile(updatedFile);
        setEditingTab(null);
    };

    const closeFile = (e, fileName) => {
        e.stopPropagation();
        const remain = openFiles.filter(f => f.name !== fileName);
        setOpenFiles(remain);
        if (activeFile?.name === fileName) {
            setActiveFile(remain.length > 0 ? remain[remain.length - 1] : null);
        }
    };

    const prepareSave = () => {
        if (!activeFile) return;
        // welcome.txt uneditable check
        if (activeFile.name === 'welcome.txt') {
            toast.error("welcome.txt is read-only");
            return;
        }

        if (activeFile.isNew || activeFile.name === 'Untitled Note') {
            setNewName('');
            setShowNameModal(true);
        } else {
            doSave(activeFile.name);
        }
    };

    const doSave = async (name) => {
        if (name === 'welcome.txt') return;

        let finalName = name;
        if (!finalName.includes('.')) finalName += '.html';

        setIsLoading(true);
        // Get content from the active editor reference (Rich or Code)
        let contentToSave = activeFile.content;

        if (activeFile.viewMode === 'rich' && editorRef.current) {
            contentToSave = editorRef.current.innerHTML;
        } else if (activeFile.viewMode === 'code' && codeEditorRef.current) {
            contentToSave = codeEditorRef.current.value;
        }

        try {
            const { error } = await supabase.storage.from('drive').upload(`${user.id}/${finalName}`, contentToSave, {
                upsert: true, contentType: 'text/html'
            });
            if (error) throw error;

            toast.success("Saved!");
            const updated = {
                ...activeFile,
                name: finalName,
                content: contentToSave,
                dirty: false,
                isNew: false,
            };
            setOpenFiles(prev => prev.map(f => f.name === activeFile.name ? updated : f));
            setActiveFile(updated);
            setShowNameModal(false);

            fetchDrive();
        } catch (e) {
            console.error(e);
            toast.error("Save failed");
        } finally {
            setIsLoading(false);
        }
    };

    const handleInput = (e) => {
        if (activeFile?.name === 'welcome.txt') return; // Read only

        const actualContent = activeFile.viewMode === 'rich'
            ? editorRef.current?.innerHTML
            : codeEditorRef.current?.value;

        if (activeFile && !activeFile.dirty) {
            setActiveFile(prev => ({ ...prev, content: actualContent, dirty: true }));
            setOpenFiles(prev => prev.map(f => f.name === activeFile.name ? { ...f, content: actualContent, dirty: true } : f));
        } else {
            setActiveFile(prev => ({ ...prev, content: actualContent }));
            setOpenFiles(prev => prev.map(f => f.name === activeFile.name ? { ...f, content: actualContent } : f));
        }
    };

    const toggleViewMode = () => {
        if (!activeFile) return;
        if (activeFile.name.toLowerCase().endsWith('.html')) {
            toast.error("Rich text disabled for HTML files");
            return;
        }

        const newMode = activeFile.viewMode === 'rich' ? 'code' : 'rich';

        let currentContent = activeFile.content;
        if (activeFile.viewMode === 'rich' && editorRef.current) currentContent = editorRef.current.innerHTML;
        else if (activeFile.viewMode === 'code' && codeEditorRef.current) currentContent = codeEditorRef.current.value;

        const updated = { ...activeFile, viewMode: newMode, content: currentContent };
        setActiveFile(updated);
        setOpenFiles(prev => prev.map(f => f.name === activeFile.name ? updated : f));
    };

    // --- Components ---

    const IconButton = ({ icon: Icon, onClick, active, title, disabled }) => (
        <button
            onClick={onClick}
            title={title}
            disabled={disabled}
            className={`p-1.5 rounded transition-all duration-200 ${active
                ? 'bg-primary/20 text-primary'
                : disabled ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
        >
            <Icon size={16} strokeWidth={2.5} />
        </button>
    );

    const Modal = ({ isOpen, onClose, title, children }) => {
        if (!isOpen) return null;
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95">
                    <div className="p-4 border-b border-border flex justify-between items-center">
                        <h3 className="font-semibold">{title}</h3>
                        <button onClick={onClose}><X size={18} className="text-muted-foreground hover:text-foreground" /></button>
                    </div>
                    <div className="p-6">{children}</div>
                </div>
            </div>
        );
    };

    const CommandRow = ({ label, shortcut, icon: Icon, onClick }) => (
        <button onClick={onClick} className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 group text-left transition-colors">
            <div className="flex items-center gap-3 text-muted-foreground group-hover:text-foreground">
                {Icon && <Icon size={18} />}
                <span className="text-sm font-medium">{label}</span>
            </div>
            {shortcut && (
                <div className="flex gap-1">
                    {shortcut.split(' ').map((key, i) => (
                        <span key={i} className="bg-muted border border-border px-1.5 py-0.5 rounded text-[10px] text-muted-foreground font-mono uppercase">
                            {key}
                        </span>
                    ))}
                </div>
            )}
        </button>
    );

    const totalFiles = driveFiles.length;

    return (
        <div className="feed-page min-h-screen bg-background relative pb-20">
            {/* HERO SECTION - Sticky */}
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        {user ? (
                            <>
                                You have {totalFiles} <span className="text-destructive font-bold">file{totalFiles !== 1 ? 's' : ''} saved</span> in your drive
                            </>
                        ) : (
                            <>
                                Capture your <span className="text-destructive font-bold">ideas</span> instantly
                            </>
                        )}
                    </p>
                </div>
            </div>

            {/* <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} /> */}

            <div className="content-overlay pt-2 px-4 md:px-6 max-w-6xl mx-auto flex flex-col items-center">

                <div className="sticky-nav-container mb-6 flex justify-center shrink-0 w-full">
                    <MagneticMorphingNav activeTab="notes" onTabChange={navigateOnly} tabs={navTabs} user={user} />
                </div>

                {/* Main Workspace Frame */}
                <div className="w-full flex bg-card border border-border rounded-xl shadow-2xl overflow-hidden relative sticky top-6 h-[85vh] md:h-[calc(100vh-3rem)] mb-12">

                    {/* --- LEFT SIDEBAR (Explorer) --- */}
                    <AnimatePresence initial={false}>
                        {isExplorerOpen && (
                            <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: sidebarWidth, opacity: 1 }}
                                exit={{ width: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="border-r border-border bg-muted/20 flex flex-col overflow-hidden shrink-0"
                            >
                                {/* Header */}
                                <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Explorer</span>
                                    <button onClick={() => setIsExplorerOpen(false)} className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
                                        <ChevronLeft size={16} />
                                    </button>
                                </div>

                                {/* List */}
                                <div className="flex-1 overflow-y-auto p-2">
                                    <div className="mb-4 relative">
                                        <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                                        <input
                                            type="text"
                                            placeholder="Search..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                                        />
                                    </div>
                                    <button onClick={handleNew} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg mb-4 font-medium">
                                        <Plus size={16} /> New Note
                                    </button>
                                    <div className="space-y-0.5">
                                        {loadingDrive ? (
                                            <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
                                        ) : (
                                            driveFiles
                                                .filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .map(file => (
                                                    <div
                                                        key={file.name}
                                                        onClick={() => importFile(file)}
                                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary text-left group cursor-pointer relative pr-8"
                                                    >
                                                        <FileText size={16} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                                                        <div className="flex-1 truncate">
                                                            <div className="text-sm font-medium truncate text-foreground">{file.name}</div>
                                                            <div className="text-[10px] text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</div>
                                                        </div>
                                                        <button
                                                            onClick={(e) => handleDelete(e, file)}
                                                            className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-all"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* --- RIGHT: EDITOR --- */}
                    <div className="flex-1 flex flex-col min-w-0 bg-background">

                        {/* Header */}
                        <div className="h-12 flex items-center border-b border-border bg-muted/30 pl-2 pr-4 gap-3 select-none relative z-20">
                            {!isExplorerOpen && (
                                <button onClick={() => setIsExplorerOpen(true)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground mr-1">
                                    <Sidebar size={18} />
                                </button>
                            )}
                            <div className="relative" ref={menuRef}>
                                <button
                                    onClick={() => setShowMenu(!showMenu)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showMenu ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                >
                                    <FolderOpen size={16} /> File
                                </button>
                                <AnimatePresence>
                                    {showMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}
                                            className="absolute top-full left-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-xl p-1.5 overflow-hidden z-[100]"
                                        >
                                            <button onClick={handleNew} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary rounded-lg flex items-center gap-2 text-foreground"><Plus size={16} /> New Note</button>
                                            <button onClick={() => { setIsExplorerOpen(true); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-secondary rounded-lg flex items-center gap-2 text-foreground"><Sidebar size={16} /> Show Explorer</button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div className="w-px h-5 bg-border/60 mx-1" />
                            <div className="flex-1 flex overflow-x-auto no-scrollbar items-end h-full pt-1">
                                {openFiles.length === 0 ? <span className="text-xs text-muted-foreground italic px-2 my-auto">No open files</span> : openFiles.map(file => (
                                    <div
                                        key={file.name}
                                        onClick={() => setActiveFile(file)}
                                        className={`group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium cursor-pointer rounded-t-lg border-t border-x border-transparent -mb-[1px] select-none transition-all mr-1 min-w-[120px] max-w-[200px] ${activeFile?.name === file.name ? 'bg-background border-border text-foreground z-10' : 'bg-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground border-b border-b-border'}`}
                                    >
                                        <FileText size={14} className={`shrink-0 ${activeFile?.name === file.name ? 'text-primary' : 'opacity-50'}`} />

                                        {/* Editable Tab Name */}
                                        {editingTab === file.name ? (
                                            <input
                                                autoFocus
                                                value={tempTabName}
                                                onChange={e => setTempTabName(e.target.value)}
                                                onBlur={finishRenaming}
                                                onKeyDown={e => { if (e.key === 'Enter') finishRenaming(); if (e.key === 'Escape') setEditingTab(null); }}
                                                onClick={e => e.stopPropagation()}
                                                className="bg-transparent border-none outline-none text-foreground w-full p-0 m-0 leading-none h-auto font-inherit"
                                            />
                                        ) : (
                                            <span
                                                className="truncate flex-1"
                                                onClick={(e) => startRenaming(e, file)}
                                            >
                                                {file.name}
                                            </span>
                                        )}

                                        <div onClick={(e) => closeFile(e, file.name)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/10 hover:text-destructive rounded transition-all cursor-pointer">
                                            {file.dirty ? <div className="w-2 h-2 rounded-full bg-yellow-500 m-0.5" /> : <X size={12} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Toolbar */}
                        {activeFile && (
                            <div className="h-12 border-b border-border bg-background flex items-center px-4 gap-1 overflow-x-auto no-scrollbar shrink-0 z-10">
                                {activeFile.viewMode === 'rich' ? (
                                    <>
                                        <IconButton icon={Bold} onClick={() => execCmd('bold')} title="Bold" />
                                        <IconButton icon={Italic} onClick={() => execCmd('italic')} title="Italic" />
                                        <IconButton icon={Underline} onClick={() => execCmd('underline')} title="Underline" />
                                        <div className="w-px h-6 bg-border mx-2" />
                                        <IconButton icon={Heading1} onClick={() => execCmd('formatBlock', 'H1')} title="Heading 1" />
                                        <IconButton icon={Heading2} onClick={() => execCmd('formatBlock', 'H2')} title="Heading 2" />
                                        <IconButton icon={Quote} onClick={() => execCmd('formatBlock', 'BLOCKQUOTE')} title="Quote" />
                                        <div className="w-px h-6 bg-border mx-2" />
                                        <IconButton icon={List} onClick={() => execCmd('insertUnorderedList')} title="List" />
                                        <IconButton icon={Code} onClick={() => execCmd('formatBlock', 'PRE')} title="Code Block" />
                                    </>
                                ) : (
                                    <div className="text-xs font-mono text-muted-foreground px-2 flex-1">Raw Editing Mode</div>
                                )}

                                <div className="flex-1" />

                                {/* Helper for button state */}
                                {(() => {
                                    const isRichTextDisabled = activeFile?.name?.toLowerCase().endsWith('.html');
                                    return (
                                        <button
                                            onClick={toggleViewMode}
                                            disabled={isRichTextDisabled}
                                            className={`p-1.5 rounded mr-2 ${isRichTextDisabled ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                            title={isRichTextDisabled ? 'Rich text disabled for HTML' : (activeFile.viewMode === 'rich' ? 'Switch to Code View' : 'Switch to Rich View')}
                                        >
                                            {activeFile.viewMode === 'rich' ? <Code2 size={16} /> : <Eye size={16} />}
                                        </button>
                                    );
                                })()}

                                <span className="text-xs text-muted-foreground mr-4 hidden sm:block">
                                    {activeFile.dirty ? 'Unsaved' : 'Saved'}
                                </span>
                                <button onClick={prepareSave} disabled={isLoading} className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-bold hover:bg-primary/90 transition-all uppercase">
                                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                                </button>
                            </div>
                        )}

                        {/* WORKSPACE */}
                        <div className="flex-1 overflow-hidden relative bg-background" onClick={() => { if (activeFile?.viewMode === 'rich') editorRef.current?.focus(); }}>
                            {activeFile ? (
                                activeFile.viewMode === 'rich' ? (
                                    <div
                                        ref={editorRef}
                                        contentEditable={activeFile.name !== 'welcome.txt'} // Read-only if welcome.txt
                                        onInput={handleInput}
                                        className="w-full h-full p-8 md:p-12 outline-none prose prose-zinc dark:prose-invert prose-lg overflow-y-auto custom-scrollbar"
                                        style={{ whiteSpace: 'pre-wrap' }}
                                        suppressContentEditableWarning={true}
                                    />
                                ) : (
                                    <textarea
                                        ref={codeEditorRef}
                                        readOnly={activeFile.name === 'welcome.txt'}
                                        className="w-full h-full p-8 md:p-12 bg-transparent text-foreground font-mono text-sm leading-relaxed resize-none outline-none custom-scrollbar"
                                        value={activeFile.content}
                                        onChange={handleInput}
                                        spellCheck={false}
                                    />
                                )
                            ) : (
                                // Start Screen
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                                    <div className="mb-6 opacity-30"><Command size={48} /></div>
                                    <h2 className="text-xl font-semibold text-foreground mb-8">Get Started</h2>
                                    <div className="w-full max-w-sm flex flex-col gap-2">
                                        <CommandRow label="New Note" icon={Plus} shortcut="New" onClick={handleNew} />
                                        <CommandRow label="Open Explorer" icon={Sidebar} shortcut="Ctrl B" onClick={() => setIsExplorerOpen(true)} />
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </div>

            <Modal isOpen={showNameModal} onClose={() => setShowNameModal(false)} title="Name your Note">
                <div className="flex flex-col gap-4">
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="My Awesome Note" className="w-full bg-secondary border border-border rounded-lg px-4 py-2 custom-focus-ring outline-none" onKeyDown={(e) => { if (e.key === 'Enter') doSave(newName); }} autoFocus />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowNameModal(false)} className="px-4 py-2 rounded-lg hover:bg-secondary text-sm">Cancel</button>
                        <button onClick={() => doSave(newName)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">Save Note</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={deleteConfirm.isOpen} onClose={() => setDeleteConfirm({ isOpen: false, file: null })} title="Delete File?">
                <div className="flex flex-col gap-4">
                    <p className="text-muted-foreground">
                        Are you sure you want to delete <span className="font-semibold text-foreground">"{deleteConfirm.file?.name}"</span>? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setDeleteConfirm({ isOpen: false, file: null })} className="px-4 py-2 rounded-lg hover:bg-secondary text-sm">Cancel</button>
                        <button onClick={confirmDelete} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90">Delete Forever</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default NotesPage;
