import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';

const TopBar = ({ darkMode, setDarkMode, onAuthClick, user, navigateOnly, sortPreference, onSortChange }) => {

    const sortOptions = [
        { id: 'trending', label: 'Trending' },
        { id: 'launch_recent', label: 'Launch Recent' },
        { id: 'launch_old', label: 'Launch Old' },
        { id: 'credits_inc', label: 'Credits Inc' },
        { id: 'credits_dec', label: 'Credits Dec' },
        { id: 'rating_inc', label: 'Rating Inc' },
        { id: 'rating_dec', label: 'Rating Dec' },
    ];


    return (
        <div className="topbar">
            {/* Left side empty or reserved for future use as Toggle moved to Sidebar */}
            <div className="topbar-left">
            </div>

            <div className="topbar-center">
                <div className="tabs">
                    <SortButton
                        active={sortPreference === 'trending'}
                        label="Trending"
                        onClick={() => onSortChange('trending')}
                    />

                    {/* Launch Group */}
                    <SortButton
                        active={sortPreference === 'launch_recent' || sortPreference === 'launch_old'}
                        label={sortPreference === 'launch_old' ? "Oldest" : "Newest"}
                        onClick={() => onSortChange(sortPreference === 'launch_recent' ? 'launch_old' : 'launch_recent')}
                    />

                    {/* Credits Group */}
                    <SortButton
                        active={sortPreference === 'credits_inc' || sortPreference === 'credits_dec'}
                        label={sortPreference === 'credits_inc' ? "Credits ↑" : "Credits ↓"}
                        onClick={() => onSortChange(sortPreference === 'credits_dec' ? 'credits_inc' : 'credits_dec')}
                    />

                    {/* Rating Group */}
                    <SortButton
                        active={sortPreference === 'rating_inc' || sortPreference === 'rating_dec'}
                        label={sortPreference === 'rating_inc' ? "Rating ↑" : "Rating ↓"}
                        onClick={() => onSortChange(sortPreference === 'rating_dec' ? 'rating_inc' : 'rating_dec')}
                    />

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
                {user ? (
                    <button className="start-now-btn">
                        <span>@{user.user_metadata?.username || user.email?.split('@')[0]} has {user.user_metadata?.credits !== undefined ? user.user_metadata.credits : 0} credits</span>
                    </button>
                ) : (
                    <button className="start-now-btn" onClick={onAuthClick}>
                        <Sparkles size={16} fill="currentColor" />
                        <span>Start now</span>
                    </button>
                )}
            </div>
        </div>
    );
};

const SortButton = ({ active, label, onClick }) => (
    <div
        className={`tab ${active ? 'text-foreground font-semibold bg-secondary/50 rounded-lg' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={onClick}
        style={{ cursor: 'pointer', padding: '6px 12px', transition: 'all 0.2s' }}
    >
        {label}
    </div>
);

export default TopBar;
