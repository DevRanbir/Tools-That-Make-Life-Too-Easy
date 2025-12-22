import React, { useState, useId, useEffect } from 'react';
import { Home, Search, Tag, Monitor, Ticket, Settings, Plus, Moon as MoonIcon, Sun as SunIcon, Heart, ShoppingBag, Calendar as CalendarIcon, Database, ListTodo, ChevronsLeft, ChevronsRight, StickyNote } from 'lucide-react';
import DesignedAtSymbol from './DesignedAtSymbol';

const Switch = ({ checked, onCheckedChange, className, id, ...props }) => {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            data-state={checked ? 'checked' : 'unchecked'}
            value={checked ? 'on' : 'off'}
            className={`relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            onClick={() => onCheckedChange(!checked)}
            id={id}
            {...props}
        >
            <span
                data-state={checked ? 'checked' : 'unchecked'}
                className="pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform"
            />
        </button>
    );
};

import SmoothDrawer from './SmoothDrawer';

const Sidebar = ({
    activePage,
    setActivePage,
    darkMode,
    setDarkMode,
    onAuthClick,
    user,
    isSettingsOpen,
    setIsSettingsOpen,
    rightSidebarMode,
    setRightSidebarMode,
    settingsTab,
    setSettingsTab,
    pinnedPages,
    updatePinnedPages,
    onOpenSearch,
    updateSettingPreference
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMobileHidden, setIsMobileHidden] = useState(() => {
        // Hide sidebar by default on mobile (< 768px)
        return typeof window !== 'undefined' && window.innerWidth < 768;
    });
    const switchId = useId();

    // Swipe to show sidebar on mobile
    useEffect(() => {
        let touchStartX = 0;
        let touchStartY = 0;

        const handleTouchStart = (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        };

        const handleTouchEnd = (e) => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            // Check if horizontal swipe is dominant (to avoid blocking vertical scroll)
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Swipe threshold
                if (Math.abs(deltaX) > 50) {
                    if (deltaX > 0) {
                        // Swipe Right -> Open Sidebar (Show)
                        setIsMobileHidden(false);
                    } else {
                        // Swipe Left -> Close Sidebar (Hide)
                        setIsMobileHidden(true);
                    }
                }
            }
        };

        document.addEventListener('touchstart', handleTouchStart);
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    const handleMouseEnter = () => {
        // Prevent expansion if settings drawer is open
        if (user && !isSettingsOpen) setIsExpanded(true);
    };

    const handleMouseLeave = () => {
        setIsExpanded(false);
    };

    // Force collapse if settings open (reactive)
    React.useEffect(() => {
        if (isSettingsOpen) {
            setIsExpanded(false);
        }
    }, [isSettingsOpen]);

    // Tool Deck Preference
    const toolDeckTab = user?.user_metadata?.setting_preferences?.tool_deck_tab || 'todos';

    // Map preference to Icon and Label
    const getToolDeckConfig = () => {
        switch (toolDeckTab) {
            case 'notes': return { icon: StickyNote, label: 'Tool Deck' };
            case 'calendar': return { icon: CalendarIcon, label: 'Tool Deck' };
            default: return { icon: ListTodo, label: 'Tool Deck' };
        }
    };

    const toolDeckConfig = getToolDeckConfig();

    const menuItems = [
        { id: 'manual', icon: Home, label: 'Home' },
        { id: 'search', icon: Search, label: 'Search' },
        { id: 'tags', icon: Tag, label: 'Tags' },
        { id: 'shop', icon: ShoppingBag, label: 'Shop' },
        ...(user ? [
            { id: 'home', icon: Heart, label: 'For You' },
            { id: toolDeckTab, icon: toolDeckConfig.icon, label: toolDeckConfig.label },
            { id: 'data', icon: Database, label: 'Data' },
            ...(user.user_metadata?.role === 'administrator' ? [{ id: 'manage', icon: Monitor, label: 'Manage' }] : []),
        ] : []),
    ];

    // Checked = Sun (Light Mode), Unchecked = Moon (Dark Mode)
    // Current app: darkMode=true. So checked should be false.
    const isChecked = !darkMode;

    const handleCheckedChange = (checked) => {
        setDarkMode(!checked);
        if (updateSettingPreference) updateSettingPreference('dark_mode', !checked);
    };

    return (
        <>
            <div
                className={`sidebar ${isExpanded ? 'expanded' : ''}`}
                style={{
                    transform: isMobileHidden ? 'translateY(-52%) translateX(-100%)' : 'translateY(-52%) translateX(0)',
                    transition: 'transform 0.3s ease, width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div className={`sidebar-toggle-wrapper w-full`}>
                    <span className={`sidebar-toggle-label text-[10px] font-bold tracking-wider transition-all duration-200 ease ${isExpanded ? 'opacity-100' : 'opacity-60 pl-0'}`}>
                        THEME
                    </span>

                    <div className={`mt-2 w-full flex justify-start transition-[padding] duration-200 ease ${isExpanded ? 'pl-0' : 'pl-0'}`}>
                        <button
                            onClick={() => handleCheckedChange(!isChecked)}
                            className={`group relative inline-flex h-16 w-9 shrink-0 cursor-pointer flex-col items-center justify-between rounded-full border border-zinc-800 transition-all duration-300 focus-visible:outline-none focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 opacity-60 hover:opacity-100 ${isChecked ? 'bg-white' : 'bg-black'}`}
                            aria-label="Toggle Theme"
                        >
                            <span
                                className={`absolute left-0 w-full h-8 rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm z-10 ${isChecked ? 'translate-y-full bg-black' : 'translate-y-0 bg-white'}`}
                            />

                            <div className="relative z-20 flex h-8 w-full items-center justify-center">
                                <MoonIcon size={14} className={`transition-all duration-300 ${isChecked ? 'opacity-0 scale-50' : 'opacity-100 scale-100 text-black'}`} />
                            </div>
                            <div className="relative z-20 flex h-8 w-full items-center justify-center">
                                <SunIcon size={14} className={`transition-all duration-300 ${isChecked ? 'opacity-100 scale-100 text-white' : 'opacity-0 scale-50'}`} />
                            </div>
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-2 w-full mt-2">
                    {menuItems.map((item) => (
                        <div
                            key={item.id}
                            className={`sidebar-icon ${activePage === item.id ? 'active' : ''}`}
                            onClick={() => {
                                if (item.id === 'search' && onOpenSearch) {
                                    onOpenSearch();
                                } else {
                                    setActivePage(item.id);
                                }
                            }}
                        >
                            <item.icon size={22} className="min-w-[22px]" />
                            <span className="sidebar-text ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-2 w-full mt-6 pb-2">
                    <SmoothDrawer
                        user={user}
                        onAuthClick={onAuthClick}
                        darkMode={darkMode}
                        setDarkMode={setDarkMode}
                        open={isSettingsOpen}
                        onOpenChange={setIsSettingsOpen}
                        rightSidebarMode={rightSidebarMode}
                        setRightSidebarMode={setRightSidebarMode}
                        setActivePage={setActivePage}
                        activeTab={settingsTab}
                        onTabChange={setSettingsTab}
                        pinnedPages={pinnedPages}
                        updatePinnedPages={updatePinnedPages}
                        updateSettingPreference={updateSettingPreference}
                        trigger={
                            <div className={`sidebar-icon cursor-pointer`}>
                                <Settings size={22} className="min-w-[22px]" />
                                <span className="sidebar-text ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">
                                    Settings
                                </span>
                            </div>
                        }
                    />

                    {user ? (
                        <div
                            className={`sidebar-icon pfp-icon bg-transparent hover:bg-zinc-800 cursor-pointer`}
                            onClick={() => {
                                if (setSettingsTab) setSettingsTab('account');
                                if (setIsSettingsOpen) setIsSettingsOpen(true);
                            }}
                        >
                            <div className="relative shrink-0">
                                {user.user_metadata?.avatar_url ? (
                                    <img src={user.user_metadata.avatar_url} alt="Profile" className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-full object-cover aspect-square shrink-0" />
                                ) : (
                                    <div className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary aspect-square shrink-0">
                                        {user.email?.[0].toUpperCase()}
                                    </div>
                                )}
                                {/* Badge: Visible when collapsed, hidden when expanded */}
                                <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center transition-all duration-300 ease-out ${isExpanded ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}>
                                    <span style={{ color: 'var(--destructive)' }} className="text-[9px] font-bold">
                                        {(user.user_metadata?.role || 'freebiee').charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div className="sidebar-text ml-3 flex flex-col justify-center overflow-hidden whitespace-nowrap">
                                <span className="text-sm font-medium truncate w-full text-left flex items-center">
                                    {/* Prefix: Visible when expanded, hidden when collapsed */}
                                    <span
                                        style={{ color: 'var(--destructive)' }}
                                        className={`font-bold mr-0.5 inline-block origin-left transition-all duration-300 ease-out ${isExpanded ? 'scale-100 opacity-100 w-auto' : 'scale-0 opacity-0 w-0'}`}
                                    >
                                        {(user.user_metadata?.role || 'freebiee').charAt(0).toUpperCase()}
                                    </span>
                                    <span className="flex items-center gap-0.5">
                                        <DesignedAtSymbol size={12} />
                                        {user.user_metadata?.username || user.email?.split('@')[0] || 'User'}
                                    </span>
                                </span>
                                <span className="text-[10px] text-zinc-500 truncate block w-full text-left">{user.email}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="sidebar-icon border border-dashed border-zinc-700/50 hover:border-zinc-500 hover:bg-zinc-800/50" onClick={onAuthClick}>
                            <Plus size={22} className="min-w-[22px]" />
                            <span className="sidebar-text ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">
                                Add Account
                            </span>
                        </div>
                    )}


                    {/* Mobile Hide Button */}
                    <div className="md:hidden w-full mt-2 mb-2">
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMobileHidden(true);
                            }}
                            className="sidebar-icon justify-center hover:bg-zinc-800/50 text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Hide Sidebar"
                        >
                            <ChevronsLeft size={22} className="min-w-[22px] ml-0" />
                        </div>
                    </div>
                </div>
            </div >

            {/* Mobile Show Button - Floating at bottom left */}
            <div
                className={`fixed bottom-[50%] left-0 z-50 md:hidden transition-all duration-300 ${isMobileHidden ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full pointer-events-none'}`}
            >
                <button
                    onClick={() => setIsMobileHidden(false)}
                    className="flex items-center justify-center w-14 h-14 rounded-r-md bg-card border border-l-0 border-border shadow-md text-muted-foreground hover:text-foreground hover:bg-secondary"
                    aria-label="Show Sidebar"
                >
                    <ChevronsRight size={26} />
                </button>
            </div>
        </>
    );
};

export default Sidebar;
