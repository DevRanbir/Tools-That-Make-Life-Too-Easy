import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ChevronDown, Bookmark, Heart, Clock } from 'lucide-react';
import './MagneticMorphingNav.css';

const defaultTabs = [
    { id: 'home', label: 'For you', icon: <ChevronDown size={14} fill="currentColor" /> },
    { id: 'manual', label: 'Manual' },
    { id: 'fastmode', label: 'Fast mode' }
];

const MagneticMorphingNav = ({ activeTab, onTabChange, tabs = defaultTabs, user, availableCategories, onSectionSelect }) => {
    const [hoveredTab, setHoveredTab] = useState(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const navRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (navRef.current && !navRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const visibleTabs = user ? tabs : tabs.filter(tab => tab.id !== 'home');

    // Close dropdown when interacting with other parts could be handled via global click listener, 
    // but for now, we'll ensure it closes if we switch tabs away from home.
    // However, if we are already on home and click home again, we toggle.

    const handleTabClick = (tabId) => {
        if (tabId === 'home') {
            // Just toggle dropdown regardless of current page
            // User requirement: "on click ... open a dropdown" (and NOT open page directly)
            setIsDropdownOpen(!isDropdownOpen);
        } else {
            setIsDropdownOpen(false);
            onTabChange(tabId);
        }
    };

    const dropdownItems = [
        { label: 'Bookmarked', icon: Bookmark },
        { label: 'Liked', icon: Heart },
        { label: 'Recently Used', icon: Clock },
        { label: 'Trending', icon: TrendingUp }
    ].filter(item => !availableCategories || availableCategories.includes(item.label));

    return (
        <div ref={navRef} className="magnetic-nav relative">
            {visibleTabs.map((tab) => (
                <div key={tab.id} className="relative">
                    <button
                        onClick={() => handleTabClick(tab.id)}
                        onMouseEnter={() => setHoveredTab(tab.id)}
                        onMouseLeave={() => setHoveredTab(null)}
                        className={`magnetic-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="active-pill"
                                className="nav-pill-active"
                                initial={false}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}

                        {activeTab !== tab.id && hoveredTab === tab.id && (
                            <motion.div
                                layoutId="hover-pill"
                                className="nav-pill-hover"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.3 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            />
                        )}

                        <span className="nav-content flex items-center gap-1.5">
                            {tab.id === 'home' && (
                                <span className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}>
                                    {tab.icon}
                                </span>
                            )}
                            {tab.label}
                        </span>
                    </button>

                    {/* Dropdown for Home Tab */}
                    {tab.id === 'home' && isDropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-1 space-y-0.5">
                                {dropdownItems.length > 0 ? (
                                    dropdownItems.map((item) => (
                                        <button
                                            key={item.label}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors text-left"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onSectionSelect) onSectionSelect(item.label);
                                                setIsDropdownOpen(false);
                                            }}
                                        >
                                            <item.icon size={14} className="opacity-70" />
                                            {item.label}
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-3 py-3 text-center">
                                        <p className="text-xs text-muted-foreground">
                                            Start liking, bookmarking, and using agents to see more here.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default MagneticMorphingNav;
