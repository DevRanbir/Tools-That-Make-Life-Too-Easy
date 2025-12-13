import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import DesignedAtSymbol from './DesignedAtSymbol';

const TopBar = ({ darkMode, setDarkMode, onAuthClick, user, navigateOnly, sortPreference, onSortChange, openSettings, isMobile }) => {

    const getLabel = (type, currentSort) => {
        if (type === 'trending') return isMobile ? 'T' : 'Trending';

        if (type === 'launch') {
            const isRecent = currentSort === 'launch_recent';
            if (isMobile) return `L ${isRecent ? '↓' : '↑'}`;
            return isRecent ? "Newest" : "Oldest";
        }

        if (type === 'credits') {
            const isInc = currentSort === 'credits_inc';
            if (isMobile) return `C ${isInc ? '↑' : '↓'}`;
            return isInc ? "Credits ↑" : "Credits ↓";
        }

        if (type === 'rating') {
            const isInc = currentSort === 'rating_inc';
            if (isMobile) return `R ${isInc ? '↑' : '↓'}`;
            return isInc ? "Rating ↑" : "Rating ↓";
        }
    };

    const UserButton = () => {
        const credits = user?.user_metadata?.credits !== undefined ? user.user_metadata.credits : 0;
        const username = user?.user_metadata?.username || user?.email?.split('@')[0];

        if (!user) {
            return (
                <button className="start-now-btn" onClick={onAuthClick}>
                    <Sparkles size={16} fill="currentColor" />
                    <span>{isMobile ? "Login" : "Start now"}</span>
                </button>
            );
        }

        return (
            <button
                className="start-now-btn"
                style={isMobile ? { padding: '6px 8px', fontSize: '0.8rem', whiteSpace: 'nowrap', border: 'none', background: 'transparent' } : {}}
                onClick={() => openSettings && openSettings('account')}
            >
                <span className="flex items-center gap-0.5 underline decoration-dashed underline-offset-4 cursor-pointer">
                    {isMobile && <span className="mr-0.5 font-bold text-muted-foreground transition-colors hover:text-foreground">{credits}</span>}
                    <DesignedAtSymbol size={13} />
                    {username}
                </span>
                {!isMobile && <span>has {credits} credits</span>}
            </button>
        );
    };

    const SortButtonsGroup = () => (
        <>
            <SortButton
                active={sortPreference === 'trending'}
                label={getLabel('trending')}
                onClick={() => onSortChange('trending')}
            />

            {/* Launch Group */}
            <SortButton
                active={sortPreference === 'launch_recent' || sortPreference === 'launch_old'}
                label={getLabel('launch', sortPreference)}
                onClick={() => onSortChange(sortPreference === 'launch_recent' ? 'launch_old' : 'launch_recent')}
            />

            {/* Credits Group */}
            <SortButton
                active={sortPreference === 'credits_inc' || sortPreference === 'credits_dec'}
                label={getLabel('credits', sortPreference)}
                onClick={() => onSortChange(sortPreference === 'credits_dec' ? 'credits_inc' : 'credits_dec')}
            />

            {/* Rating Group */}
            <SortButton
                active={sortPreference === 'rating_inc' || sortPreference === 'rating_dec'}
                label={getLabel('rating', sortPreference)}
                onClick={() => onSortChange(sortPreference === 'rating_dec' ? 'rating_inc' : 'rating_dec')}
            />
        </>
    );

    if (isMobile) {
        return (
            <div className="topbar mobile">
                <div className="tabs mobile-scroll-container items-center gap-1">
                    <div className="flex items-center">
                        <UserButton />
                    </div>

                    <SortButtonsGroup />

                    <div
                        className={`search-bar-merged cursor-pointer hover:text-foreground transition-colors ${isMobile ? 'active p-1 min-w-0 border-none bg-transparent' : 'ml-2'}`}
                        onClick={() => navigateOnly && navigateOnly('search')}
                        style={isMobile ? { width: '28px', height: '28px', justifyContent: 'center', padding: 0 } : {}}
                    >
                        <Search size={16} />
                        {!isMobile && <span>Search</span>}
                        {!isMobile && <span className="kbd">CTRL + K</span>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="topbar">
            {/* Left side empty or reserved */}
            <div className="topbar-left">
            </div>

            <div className="topbar-center">
                <div className="tabs">
                    <SortButtonsGroup />

                    <div
                        className="search-bar-merged cursor-pointer hover:text-foreground transition-colors ml-2"
                        onClick={() => navigateOnly && navigateOnly('search')}
                    >
                        <Search size={16} />
                        <span>Search</span>
                        <span className="kbd">CTRL + K</span>
                    </div>
                </div>
            </div>

            <div className="topbar-right">
                <UserButton />
            </div>
        </div>
    );
};

const SortButton = ({ active, label, onClick }) => (
    <div
        className={`tab ${active ? 'text-foreground font-semibold bg-secondary/50 rounded-lg' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={onClick}
        style={{ cursor: 'pointer', padding: '6px 12px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
    >
        {label}
    </div>
);

export default TopBar;
