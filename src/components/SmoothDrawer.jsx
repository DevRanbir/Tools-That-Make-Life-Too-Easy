import React, { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { Settings, X, Moon, Sun, User, LogOut, Database, CreditCard, Layout, Eye, EyeOff, FileText, Image as ImageIcon, Folder, File, Home, Search, ShoppingBag, ListTodo, Calendar as CalendarIcon, Tag, Zap, Monitor, Activity, Sparkles, Lock } from 'lucide-react';
import { supabase } from '../supabase';
import { toast } from 'sonner';

const SmoothDrawer = ({ trigger, children, user, onAuthClick, darkMode, setDarkMode, open, onOpenChange, rightSidebarMode, setRightSidebarMode, setActivePage, activeTab = 'preferences', onTabChange, pinnedPages = [], updatePinnedPages, updateSettingPreference }) => {
    // Controlled state: use activeTab and onTabChange from props

    // Account State
    const [username, setUsername] = useState(user?.user_metadata?.username || '');
    const [isSaving, setIsSaving] = useState(false);

    // Account State - User Details
    const [userDetails, setUserDetails] = useState(null);
    const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);

    // Avatar State
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

    // Data State
    const [buckets, setBuckets] = useState([]);
    const [files, setFiles] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // Logs State
    const [logs, setLogs] = useState([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);

    useEffect(() => {
        if (user) {
            setUsername(user.user_metadata?.username || '');
        }
    }, [user]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        onOpenChange(false);
        window.location.reload();
    };

    const handleUpdateProfile = async () => {
        setIsSaving(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { username: username }
            });
            if (error) throw error;
            // Ideally show a toast here
        } catch (error) {
            console.error('Error updating profile:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const fetchUserDetails = async () => {
        if (!user) return;
        setIsLoadingUserDetails(true);
        try {
            const { data, error } = await supabase
                .from('user_details')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (data) setUserDetails(data);
        } catch (error) {
            console.error('Error fetching user details:', error);
        } finally {
            setIsLoadingUserDetails(false);
        }
    };

    useEffect(() => {
        if (user) {
            if (activeTab === 'data') {
                fetchStorageData();
                fetchUserDetails();
            } else if (activeTab === 'account') {
                fetchUserDetails();
            } else if (activeTab === 'usage') {
                fetchLogs();
            }
        }
    }, [activeTab, user]);

    const fetchLogs = async () => {
        setIsLoadingLogs(true);
        try {
            const { data, error } = await supabase
                .from('user_details')
                .select('logs')
                .eq('id', user.id)
                .maybeSingle();

            if (data && data.logs) {
                // Determine format
                // New format: { description, type, credits_spent, current_total_credits, created_at }
                // Sort by date desc
                const sortedLogs = data.logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setLogs(sortedLogs);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setIsLoadingLogs(false);
        }
    };

    const fetchStorageData = async () => {
        setIsLoadingData(true);
        try {
            // 1. List Buckets
            const { data: bucketsData, error: bucketsError } = await supabase.storage.listBuckets();
            if (bucketsData) setBuckets(bucketsData);

            // 2. List Files in 'drive' bucket for this user
            // User folders are typically named with their user ID
            if (user) {
                const { data: filesData, error: filesError } = await supabase.storage
                    .from('drive')
                    .list(user.id, {
                        limit: 10,
                        sortBy: { column: 'created_at', order: 'desc' },
                    });

                if (filesData) {
                    setFiles(filesData);
                }
            }
        } catch (error) {
            console.error('Error loading storage data:', error);
        } finally {
            setIsLoadingData(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                alert('File size too large. Please select an image under 2MB.');
                return;
            }
            setAvatarFile(file);
            const objectUrl = URL.createObjectURL(file);
            setAvatarPreview(objectUrl);
        }
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile || !user) return;
        setIsUploadingAvatar(true);

        try {
            const fileExt = avatarFile.name.split('.').pop();
            const fileName = `avatar-${Date.now()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            // 1. Delete old files in user's avatar folder to keep it clean
            const { data: listData } = await supabase.storage.from('avatars').list(user.id);
            if (listData && listData.length > 0) {
                const filesToRemove = listData.map(x => `${user.id}/${x.name}`);
                await supabase.storage.from('avatars').remove(filesToRemove);
            }

            // 2. Upload new file
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, avatarFile);

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 4. Update Auth Metadata
            const { error: updateAuthError } = await supabase.auth.updateUser({
                data: {
                    avatar_url: publicUrl,
                    avatar_preference: 'custom' // Explicitly set preference to custom on upload
                }
            });

            if (updateAuthError) throw updateAuthError;

            // 5. Update user_details table
            const { error: updateTableError } = await supabase
                .from('user_details')
                .upsert({
                    id: user.id,
                    avatar_url: publicUrl,
                    avatar_preference: 'custom', // Sync to table
                    updated_at: new Date().toISOString()
                });

            if (updateTableError) throw updateTableError;

            // Reset state
            setAvatarFile(null);
            setAvatarPreview(null);
            setIsEditingAvatar(false);

            // Reload page to reflect changes (simplest way to sync all states)
            window.location.reload();

        } catch (error) {
            console.error('Error uploading avatar:', error);
            alert('Failed to update avatar. Please try again.');
        } finally {
            setIsUploadingAvatar(false);
        }
    };

    const tabs = [
        { id: 'preferences', label: 'Preferences', icon: Settings },
        { id: 'usage', label: 'Activity', icon: Activity },
        { id: 'data', label: 'Data', icon: Database },
        { id: 'account', label: 'Account', icon: User },
        { id: 'billing', label: 'Billing', icon: CreditCard },
    ];

    const availablePages = [
        { id: 'search', label: 'Search', icon: Search },
        { id: 'home', label: 'For You', icon: Home }, // Using Home icon for 'For You' as per sidebar
        { id: 'shop', label: 'Shop', icon: ShoppingBag },
        { id: 'todos', label: 'Todos', icon: ListTodo },
        { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
        { id: 'tags', label: 'Tags', icon: Tag },
        { id: 'fastmode', label: 'Fast Mode', icon: Zap },
        { id: 'data', label: 'Data', icon: Database },
    ];

    const handleTogglePin = (pageId) => {
        if (!user || !updatePinnedPages) return;

        const isPinned = pinnedPages.includes(pageId);
        if (isPinned) {
            updatePinnedPages(pinnedPages.filter(id => id !== pageId));
        } else {
            if (pinnedPages.length >= 3) {
                // Ideally show toast here, but for now just don't add
                return;
            }
            updatePinnedPages([...pinnedPages, pageId]);
        }
    };

    return (
        <Drawer.Root shouldScaleBackground open={open} onOpenChange={onOpenChange}>
            <Drawer.Trigger asChild>
                {trigger}
            </Drawer.Trigger>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
                <Drawer.Content className={`bg-background/95 backdrop-blur-3xl flex flex-col rounded-t-[20px] max-h-[85vh] mt-24 fixed bottom-0 inset-x-0 mx-auto w-full max-w-2xl z-[200] border-t border-white/10 outline-none shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)] ${!children ? 'h-[85vh]' : 'h-auto'}`}>

                    <div className="sr-only">
                        <Drawer.Title>Settings Drawer</Drawer.Title>
                        <Drawer.Description>Settings and preferences for the application</Drawer.Description>
                    </div>

                    {/* Handle bar */}
                    <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mt-4 mb-2" />

                    {children ? children : (
                        <div className="flex flex-1 overflow-hidden">
                            {/* Sidebar Tabs */}
                            <div className="w-48 border-r border-border flex flex-col p-4 gap-1 overflow-y-auto">
                                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 px-2">Settings</h2>
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => onTabChange && onTabChange(tab.id)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === tab.id
                                            ? 'bg-secondary text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                                            }`}
                                    >
                                        <tab.icon size={18} />
                                        {tab.label}
                                    </button>
                                ))}

                                <div className="mt-auto pt-4 border-t border-border">
                                    {user ? (
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 w-full transition-colors"
                                        >
                                            <LogOut size={18} />
                                            Log Out
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { onAuthClick(); onOpenChange(false); }}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 w-full transition-colors"
                                        >
                                            <User size={18} />
                                            Sign In
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Main Content Area */}
                            <div className="flex-1 p-8 overflow-y-auto">
                                {/* Close Button Mobile / Tablet hidden usually, but good to have */}
                                <div className="absolute top-2 right-4 z-50 bg-background/95 rounded-lg transition-colors">
                                    <button
                                        onClick={() => onOpenChange(false)}
                                        className="p-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                {activeTab === 'preferences' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h3 className="text-xl font-semibold mb-1">Preferences</h3>
                                            <p className="text-sm text-muted-foreground">Manage your interface and display settings.</p>
                                        </div>

                                        {user && (
                                            <>
                                                <div className="space-y-6">
                                                    {/* Right Sidebar Visibility */}
                                                    <div className="space-y-3">
                                                        <h4 className="text-sm font-medium text-foreground">Right Sidebar Visibility</h4>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {[
                                                                { id: 'full', label: 'Full Display', icon: Layout },
                                                                { id: 'events', label: 'Events Only', icon: Eye },
                                                                { id: 'saved', label: 'Saved Only', icon: FileText },
                                                                { id: 'hidden', label: 'Hidden', icon: EyeOff },
                                                            ].map((option) => (
                                                                <button
                                                                    key={option.id}
                                                                    onClick={() => {
                                                                        setRightSidebarMode(option.id);
                                                                        if (updateSettingPreference) updateSettingPreference('right_sidebar_mode', option.id);
                                                                    }}
                                                                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 ${rightSidebarMode === option.id
                                                                        ? 'bg-primary/10 border-primary text-primary'
                                                                        : 'bg-card border-border hover:bg-secondary/50 hover:border-secondary text-muted-foreground'
                                                                        }`}
                                                                >
                                                                    <option.icon size={20} />
                                                                    <span className="text-xs font-medium">{option.label}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Tool Deck Defaults */}
                                                    <div className="space-y-3">
                                                        <h4 className="text-sm font-medium text-foreground">Tool Deck Defaults</h4>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {[
                                                                { id: 'todos', label: 'Todos', icon: ListTodo },
                                                                { id: 'notes', label: 'Notes', icon: FileText },
                                                                { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
                                                            ].map((option) => {
                                                                const currentToolDeck = user?.user_metadata?.setting_preferences?.tool_deck_tab || 'todos';
                                                                const isActive = currentToolDeck === option.id;
                                                                return (
                                                                    <button
                                                                        key={option.id}
                                                                        onClick={() => updateSettingPreference && updateSettingPreference('tool_deck_tab', option.id)}
                                                                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 ${isActive
                                                                            ? 'bg-primary/10 border-primary text-primary'
                                                                            : 'bg-card border-border hover:bg-secondary/50 hover:border-secondary text-muted-foreground'
                                                                            }`}
                                                                    >
                                                                        <option.icon size={20} />
                                                                        <span className="text-xs font-medium">{option.label}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="h-px bg-border" />

                                                {/* Pinned Pages (Right Sidebar) */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-sm font-medium text-foreground">Top 3 Pinned Pages</h4>
                                                        <span className="text-xs text-muted-foreground">{pinnedPages.length}/3 selected</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                        {availablePages.map((page) => {
                                                            const isPinned = pinnedPages.includes(page.id);
                                                            return (
                                                                <button
                                                                    key={page.id}
                                                                    onClick={() => handleTogglePin(page.id)}
                                                                    disabled={!isPinned && pinnedPages.length >= 3}
                                                                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-200 ${isPinned
                                                                        ? 'bg-primary/10 border-primary text-primary'
                                                                        : 'bg-card border-border hover:bg-secondary/50 hover:border-secondary text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed'
                                                                        }`}
                                                                >
                                                                    <page.icon size={18} />
                                                                    <span className="text-xs font-medium">{page.label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                                                        Selected pages will appear in your right sidebar for quick access.
                                                    </p>
                                                </div>

                                                <div className="h-px bg-border" />
                                            </>
                                        )}

                                        {/* Dark Mode */}
                                        <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-secondary text-foreground">
                                                    {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">Theme Mode</div>
                                                    <div className="text-xs text-muted-foreground">{darkMode ? 'Dark Mode' : 'Light Mode'}</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setDarkMode(!darkMode)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${!darkMode ? 'bg-primary' : 'bg-zinc-700'}`}
                                            >
                                                <span className={`${!darkMode ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                            </button>
                                        </div>

                                        {/* Restart Onboarding */}
                                        <div className="p-4 bg-card border border-border rounded-xl flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-secondary text-foreground">
                                                    <Sparkles size={18} />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">Onboarding Setup</div>
                                                    <div className="text-xs text-muted-foreground">Restart the welcome tutorial</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    onOpenChange(false);
                                                    onAuthClick(1, 're_onboarding'); // Start from Profile step
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors border border-border"
                                            >
                                                Restart
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'data' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h3 className="text-xl font-semibold mb-1">My Data</h3>
                                            <p className="text-sm text-muted-foreground">View your stored files and buckets.</p>
                                        </div>

                                        {user ? (
                                            <div className="space-y-8">
                                                {/* User Details Section */}
                                                <div className="space-y-3">
                                                    <h4 className="text-sm font-medium text-foreground uppercase tracking-wider text-xs">User Profile Data</h4>
                                                    <div className="bg-card border border-border rounded-xl p-4 overflow-x-auto">
                                                        {isLoadingUserDetails ? (
                                                            <div className="text-sm text-muted-foreground">Loading details...</div>
                                                        ) : userDetails ? (
                                                            <div className="grid grid-cols-1 gap-y-4 text-sm mt-2">
                                                                {Object.entries(userDetails)
                                                                    .filter(([key]) => !['id', 'username', 'avatar_url', 'status', 'role', 'credits', 'created_at', 'setting_preferences', 'logs', 'avatar_preference'].includes(key))
                                                                    .map(([key, value]) => {
                                                                        if (key === 'bookmarks') {
                                                                            return (
                                                                                <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 items-center">
                                                                                    <span className="font-medium text-muted-foreground uppercase text-xs">{key}</span>
                                                                                    <div className="col-span-2">
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setActivePage?.('home');
                                                                                                onOpenChange(false);
                                                                                            }}
                                                                                            className="text-xs text-destructive rounded-md font-medium hover:bg-primary/20 transition-colors"
                                                                                        >
                                                                                            View in For You
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        const isClickable = key === 'occupation' || key === 'sort_preference';

                                                                        return (
                                                                            <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 items-center">
                                                                                <span className="font-medium text-muted-foreground uppercase text-xs">{key.replace(/_/g, ' ')}</span>
                                                                                <span
                                                                                    className={`col-span-2 font-mono truncate text-foreground text-xs sm:text-sm ${isClickable ? 'cursor-pointer hover:text-primary transition-colors underline decoration-dashed underline-offset-4' : ''}`}
                                                                                    onClick={() => {
                                                                                        if (key === 'occupation') onAuthClick(2, 'single_edit');
                                                                                        if (key === 'sort_preference') onAuthClick(3, 'single_edit');
                                                                                    }}
                                                                                >
                                                                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-muted-foreground">No profile details found.</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <h4 className="text-sm font-medium text-foreground uppercase tracking-wider text-xs">Files</h4>
                                                    <div className="bg-card border border-border rounded-xl overflow-hidden min-h-[100px]">
                                                        {isLoadingData ? (
                                                            <div className="p-8 text-center text-muted-foreground text-sm">Loading files...</div>
                                                        ) : files.length > 0 ? (
                                                            files.map((file) => (
                                                                <div key={file.id} className="flex items-center gap-4 p-3 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border last:border-0">
                                                                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                                                                        <FileText size={20} className="text-foreground" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium truncate">{file.name}</p>
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                                                        {new Date(file.created_at).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="p-8 text-center text-muted-foreground text-sm">
                                                                No files found in your drive.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                                                <p className="text-muted-foreground text-sm">Please sign in to view your data.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'account' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h3 className="text-xl font-semibold mb-1">Account</h3>
                                            <p className="text-sm text-muted-foreground">Manage your personal information.</p>
                                        </div>

                                        {user ? (
                                            <div className="space-y-6">
                                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                                    {/* Avatar Section */}
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div
                                                            onClick={() => {
                                                                onOpenChange(false);
                                                                onAuthClick(1, 'avatar_only');
                                                            }}
                                                            className="group relative w-24 h-24 rounded-full bg-secondary overflow-hidden flex-shrink-0 border-2 border-border cursor-pointer transition-all hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background"
                                                        >
                                                            {user.user_metadata?.avatar_url ? (
                                                                <img src={user.user_metadata.avatar_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-indigo-500/20 text-indigo-400">
                                                                    {user.email?.[0].toUpperCase()}
                                                                </div>
                                                            )}

                                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <ImageIcon size={20} className="text-white" />
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                onOpenChange(false);
                                                                onAuthClick(1, 'avatar_only');
                                                            }}
                                                            className="text-xs text-primary hover:underline font-medium"
                                                        >
                                                            Change
                                                        </button>
                                                    </div>

                                                    <div className="flex-1 space-y-4 w-full text-center sm:text-left">
                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium uppercase text-muted-foreground">Username</label>
                                                            <input
                                                                type="text"
                                                                value={username}
                                                                onChange={(e) => setUsername(e.target.value)}
                                                                className="w-full px-4 py-2.5 rounded-lg bg-card border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm outline-none transition-all placeholder:text-muted-foreground"
                                                                placeholder="Enter your username"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="text-xs font-medium uppercase text-muted-foreground">Email Address</label>
                                                            <div className="px-4 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground font-mono opacity-80 cursor-not-allowed">
                                                                {user.email}
                                                            </div>
                                                        </div>

                                                        {/* MOVED ITEMS: Plan, Credits, Created At */}
                                                        {userDetails && (
                                                            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                                                                {/* Created At */}
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 items-center">
                                                                    <span className="font-medium text-muted-foreground uppercase text-xs">CREATED AT</span>
                                                                    <span className="col-span-2 font-mono truncate text-foreground text-xs sm:text-sm">
                                                                        {userDetails.created_at ? String(userDetails.created_at) : new Date(user.created_at).toISOString()}
                                                                    </span>
                                                                </div>

                                                                {/* Plan */}
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 items-center">
                                                                    <span className="font-medium text-muted-foreground uppercase text-xs">PLAN</span>
                                                                    <div className="col-span-2">
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-500/10 text-indigo-400 capitalize border border-indigo-500/20">
                                                                            {String(userDetails.role || 'Freebiee')}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Credits */}
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 items-center">
                                                                    <span className="font-medium text-muted-foreground uppercase text-xs">CREDITS</span>
                                                                    <div className="col-span-2 flex items-center gap-2">
                                                                        {(() => {
                                                                            const role = userDetails.role || 'freebiee';
                                                                            const limits = { freebiee: 0, common: 20, wealthy: 50, administrator: 100, NewUser: 0 };
                                                                            const monthlyLimit = limits[role] || 0;
                                                                            const maxCap = monthlyLimit + 10;
                                                                            return (
                                                                                <span className="text-muted-foreground text-xs">
                                                                                    Monthly: {monthlyLimit} refill
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                        <button
                                                                            onClick={() => {
                                                                                if (onOpenChange) onOpenChange(false);
                                                                                if (setActivePage) setActivePage('shop');
                                                                                setTimeout(() => {
                                                                                    window.location.hash = 'tab=buy_credits';
                                                                                }, 100);
                                                                            }}
                                                                            className="ml-auto text-[10px] bg-primary/10 text-destructive px-2 py-1 rounded-md hover:bg-primary/20 transition-colors whitespace-nowrap font-medium"
                                                                        >
                                                                            Get More
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-xs font-medium uppercase text-muted-foreground">Last Login</label>
                                                                <div className="text-sm text-foreground font-mono">
                                                                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'N/A'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2 pt-2">
                                                            <label className="text-[10px] font-medium uppercase text-muted-foreground">User ID</label>
                                                            <div className="text-[10px] text-muted-foreground font-mono select-all truncate">
                                                                {user.id}
                                                            </div>
                                                        </div>

                                                        <div className="pt-2">
                                                            <button
                                                                onClick={async () => {
                                                                    if (!user?.email) return;
                                                                    const toastId = toast.loading('Sending reset email...');
                                                                    try {
                                                                        const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                                                                            redirectTo: 'https://tools-that-make-life-too-easy.appwrite.network/auth/reset-password',
                                                                        });
                                                                        if (error) throw error;
                                                                        toast.success('Reset email sent! Check your inbox.', { id: toastId });
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                        toast.error(`Error: ${err.message}`, { id: toastId });
                                                                    }
                                                                }}
                                                                className="text-xs text-primary hover:underline font-medium flex items-center gap-1 mb-3"
                                                            >
                                                                <Lock size={12} /> Send Reset Password Mail
                                                            </button>

                                                            <button
                                                                onClick={handleUpdateProfile}
                                                                disabled={isSaving}
                                                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 mt-2"
                                                            >
                                                                {isSaving ? 'Saving...' : 'Save Changes'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                                                <p className="text-muted-foreground text-sm">Please sign in to manage account settings.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'usage' && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div>
                                            <h3 className="text-xl font-semibold mb-1">Activity Log</h3>
                                            <p className="text-sm text-muted-foreground">Track your credit usage and agent interactions.</p>
                                        </div>

                                        {user ? (
                                            <div className="space-y-6">
                                                {/* Monthly Stats Summary */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    {(() => {
                                                        const currentMonth = new Date().getMonth();
                                                        const currentYear = new Date().getFullYear();
                                                        const stats = logs.reduce((acc, log) => {
                                                            const logDate = new Date(log.created_at);
                                                            if (logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear) {
                                                                // Infer type/amount if needed
                                                                const amount = log.credits_spent !== undefined ? log.credits_spent : (log.amount || 0);
                                                                let type = log.type;
                                                                if (!type) {
                                                                    type = amount > 0 ? 'debit' : 'credit';
                                                                }

                                                                // If type is credit, adds to purchased (absolute value)
                                                                // If type is debit, adds to used (absolute value)
                                                                if (type === 'credit') {
                                                                    acc.purchased += Math.abs(amount);
                                                                } else {
                                                                    acc.used += Math.abs(amount);
                                                                }
                                                            }
                                                            return acc;
                                                        }, { purchased: 0, used: 0 });

                                                        return (
                                                            <>
                                                                <div className="bg-card border border-border p-4 rounded-xl flex flex-col gap-1">
                                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly Used</span>
                                                                    <div className="text-2xl font-bold text-foreground">{stats.used}</div>
                                                                    <div className="text-xs text-muted-foreground">Credits spent this month</div>
                                                                </div>
                                                                <div className="bg-card border border-border p-4 rounded-xl flex flex-col gap-1">
                                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Monthly Purchased</span>
                                                                    <div className="text-2xl font-bold text-green-500">{stats.purchased}</div>
                                                                    <div className="text-xs text-muted-foreground">Credits added this month</div>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>

                                                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                                                            <thead className="bg-muted/30">
                                                                <tr className="border-b border-border">
                                                                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider w-full md:w-auto">Description</th>
                                                                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">Type</th>
                                                                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center">Amount</th>
                                                                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider text-center min-w-[140px]">Date</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-border">
                                                                {isLoadingLogs ? (
                                                                    <tr>
                                                                        <td colSpan="5" className="px-4 py-8 text-center text-muted-foreground">
                                                                            Loading activity...
                                                                        </td>
                                                                    </tr>
                                                                ) : logs.length > 0 ? (
                                                                    logs.map((log, index) => {
                                                                        const amount = log.credits_spent !== undefined ? log.credits_spent : (log.amount || 0);
                                                                        const type = log.type || (amount > 0 ? 'debit' : 'credit');

                                                                        return (
                                                                            <tr key={index} className="hover:bg-secondary/20 transition-colors group">
                                                                                <td className="px-4 py-3 font-medium text-foreground whitespace-normal break-words max-w-[200px] md:max-w-xs">
                                                                                    {String(log.description || 'Transaction')}
                                                                                </td>
                                                                                <td className="px-4 py-3 align-top text-center">
                                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border border-border bg-muted/50 text-muted-foreground">
                                                                                        {type === 'credit' ? 'Credited' : 'Debited'}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-4 py-3 font-mono text-xs align-top text-center text-muted-foreground">
                                                                                    {type === 'credit' ? '+' : '-'}{Math.abs(amount)}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-center text-xs text-muted-foreground align-top">
                                                                                    {new Date(log.created_at).toLocaleString(undefined, {
                                                                                        month: 'short',
                                                                                        day: 'numeric',
                                                                                        hour: '2-digit',
                                                                                        minute: '2-digit'
                                                                                    })}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <tr>
                                                                        <td colSpan="5" className="px-4 py-8 text-center text-muted-foreground">
                                                                            No activity recorded yet.
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border">
                                                <p className="text-muted-foreground text-sm">Please sign in to view activity.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'billing' && (
                                    <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div className="h-16 p-4 flex items-center justify-center ">
                                            <div>
                                                <h3 className="text-lg font-semibold">Coming Soon</h3>
                                                <p className="text-sm text-muted-foreground mx-auto mt-2">
                                                    Billing and subscription management <br />will be available in a future update.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root >
    );
};

export default SmoothDrawer;
