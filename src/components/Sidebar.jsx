import React, { useState, useId } from 'react';
import { Home, Search, Tag, Monitor, Ticket, Settings, Plus, Moon as MoonIcon, Sun as SunIcon, Heart, ShoppingBag } from 'lucide-react';

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

const Sidebar = ({ activePage, setActivePage, darkMode, setDarkMode, onAuthClick, user, isSettingsOpen, setIsSettingsOpen }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const switchId = useId();

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

    const menuItems = [
        { id: 'manual', icon: Home, label: 'Home' },
        { id: 'search', icon: Search, label: 'Search' },
        { id: 'tags', icon: Tag, label: 'Tags' },
        // Show 'For You' only if user is logged in
        ...(user ? [{ id: 'home', icon: Heart, label: 'For You' }] : []),
        { id: 'shop', icon: ShoppingBag, label: 'Shop' },
    ];

    // Checked = Sun (Light Mode), Unchecked = Moon (Dark Mode)
    // Current app: darkMode=true. So checked should be false.
    const isChecked = !darkMode;

    const handleCheckedChange = (checked) => {
        setDarkMode(!checked);
    };

    return (
        <div
            className={`sidebar ${isExpanded ? 'expanded' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className={`sidebar-toggle-wrapper w-full`}>
                <span className={`sidebar-toggle-label text-[10px] font-bold tracking-wider transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-60'}`}>
                    THEME
                </span>

                {/* New Theme Toggle Component - Vertical */}
                <div className="mt-2">
                    <div className="relative inline-grid h-16 w-8 grid-rows-[1fr_1fr] items-center justify-items-center font-medium text-sm">
                        <Switch
                            checked={isChecked}
                            onCheckedChange={handleCheckedChange}
                            className="peer absolute inset-0 h-full w-full rounded-full border border-zinc-800 transition-colors data-[state=unchecked]:bg-zinc-950 data-[state=checked]:bg-white [&_span]:absolute [&_span]:top-0 [&_span]:left-0 [&_span]:z-10 [&_span]:w-full [&_span]:h-1/2 [&_span]:transition-transform [&_span]:duration-300 [&_span]:ease-[cubic-bezier(0.16,1,0.3,1)] [&_span]:data-[state=checked]:translate-y-full [&_span]:data-[state=checked]:bg-black [&_span]:data-[state=unchecked]:bg-white [&_span]:shadow-sm"
                            id={switchId}
                        />
                        <span className="pointer-events-none relative z-20 flex h-full w-full items-center justify-center transition-opacity duration-300 peer-data-[state=checked]:opacity-0">
                            <MoonIcon aria-hidden="true" size={14} className="text-black" />
                        </span>
                        <span className="pointer-events-none relative z-20 flex h-full w-full items-center justify-center transition-opacity duration-300 peer-data-[state=unchecked]:opacity-0">
                            <SunIcon aria-hidden="true" size={14} className="text-white" />
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-2 w-full mt-6">
                {menuItems.map((item) => (
                    <div
                        key={item.id}
                        className={`sidebar-icon ${activePage === item.id ? 'active' : ''}`}
                        onClick={() => setActivePage(item.id)}
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
                    <div className={`sidebar-icon pfp-icon bg-transparent hover:bg-zinc-800`}>
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt="Profile" className="w-8 h-8 min-w-[32px] rounded-full object-cover" />
                        ) : (
                            <div className="w-8 h-8 min-w-[32px] rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                {user.email?.[0].toUpperCase()}
                            </div>
                        )}
                        <div className="sidebar-text ml-3 flex flex-col justify-center overflow-hidden whitespace-nowrap">
                            <span className="text-sm font-medium truncate block w-full text-left">@{user.user_metadata?.username || user.email?.split('@')[0] || 'User'}</span>
                            <span className="text-sm text-zinc-500 truncate block w-full text-left">{user.email}</span>
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
            </div>
        </div>
    );
};

export default Sidebar;
