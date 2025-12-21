import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { supabase } from '../supabase';
import DesignedAtSymbol from './DesignedAtSymbol';



const TopBar = ({ darkMode, setDarkMode, onAuthClick, user, navigateOnly, sortPreference, onSortChange, openSettings, isMobile, activePage, onOpenSearch }) => {
    // Pages where the central part (sort + search) should be hidden
    const hiddenPages = ['fastmode', 'todos', 'calendar', 'shop', 'data', 'manage', 'tags', 'search', 'notes'];
    const shouldHideCenter = hiddenPages.includes(activePage);

    const CarrotUp = () => (
        <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M5.575 13.729C4.501 15.033 5.43 17 7.12 17h9.762c1.69 0 2.618-1.967 1.544-3.271l-4.881-5.927a2 2 0 0 0-3.088 0l-4.88 5.927Z" clipRule="evenodd" />
        </svg>
    );

    const CarrotDown = () => (
        <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M18.425 10.271C19.499 8.967 18.57 7 16.88 7H7.12c-1.69 0-2.618 1.967-1.544 3.271l4.881 5.927a2 2 0 0 0 3.088 0l4.88-5.927Z" clipRule="evenodd" />
        </svg>
    );

    const getLabel = (type, currentSort) => {
        if (type === 'trending') return isMobile ? 'T' : 'Trending';

        if (type === 'launch') {
            const isRecent = currentSort === 'launch_recent';
            if (isMobile) return <span className="flex items-center gap-1">L {isRecent ? <CarrotDown /> : <CarrotUp />}</span>;
            return isRecent ? "Newest" : "Oldest";
        }

        if (type === 'credits') {
            const isInc = currentSort === 'credits_inc';
            if (isMobile) return <span className="flex items-center gap-1">C {isInc ? <CarrotUp /> : <CarrotDown />}</span>;
            return <span className="flex items-center gap-1">Credits {isInc ? <CarrotUp /> : <CarrotDown />}</span>;
        }

        if (type === 'rating') {
            const isInc = currentSort === 'rating_inc';
            if (isMobile) return <span className="flex items-center gap-1">R {isInc ? <CarrotUp /> : <CarrotDown />}</span>;
            return <span className="flex items-center gap-1">Rating {isInc ? <CarrotUp /> : <CarrotDown />}</span>;
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
                style={isMobile ? {
                    padding: '6px 8px',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                    border: 'none',
                    background: shouldHideCenter ? undefined : 'transparent'
                } : {}}
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
                <div className={`${shouldHideCenter ? '' : 'tabs'} mobile-scroll-container flex w-full ${shouldHideCenter ? 'justify-center' : ''} items-center gap-1`}>
                    <div className="flex items-center">
                        <UserButton />
                    </div>

                    <div
                        className="flex items-center gap-1 transition-all duration-300 ease-in-out"
                        style={{
                            opacity: shouldHideCenter ? 0 : 1,
                            transform: shouldHideCenter ? 'translateY(-10px)' : 'translateY(0)',
                            pointerEvents: shouldHideCenter ? 'none' : 'auto',
                            maxWidth: shouldHideCenter ? 0 : '400px', // Collapse width roughly
                            overflow: 'hidden'
                        }}
                    >
                        <SortButtonsGroup />

                        <div
                            className={`search-bar-merged cursor-pointer hover:text-foreground transition-colors ${isMobile ? 'active p-1 min-w-0 border-none bg-transparent' : 'ml-2'}`}
                            onClick={onOpenSearch}
                            style={isMobile ? { width: '28px', height: '28px', justifyContent: 'center', padding: 0 } : {}}
                        >
                            <Search size={16} />
                            {!isMobile && <span>Search</span>}
                            {!isMobile && <span className="kbd">CTRL + K</span>}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="topbar"
            style={{
                height: shouldHideCenter ? '0px' : undefined,
                transition: 'height 0.3s ease-in-out'
            }}
        >
            {/* Left side empty or reserved */}
            <div className="topbar-left">
            </div>

            <div
                className="topbar-center"
                style={{
                    transition: 'all 0.3s ease-in-out',
                    opacity: shouldHideCenter ? 0 : 1,
                    transform: `translateX(-50%) ${shouldHideCenter ? 'translateY(-20px)' : 'translateY(0)'}`,
                    pointerEvents: shouldHideCenter ? 'none' : 'auto'
                }}
            >
                <div className="tabs">
                    <SortButtonsGroup />

                    <div
                        className="search-bar-merged cursor-pointer hover:text-foreground transition-colors ml-2"
                        onClick={onOpenSearch}
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
