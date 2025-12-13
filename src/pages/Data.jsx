import React, { useState, useEffect } from 'react';
import { Database, ChevronDown } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import FileExplorer from '../components/FileExplorer';

const DataPage = ({ navigateOnly, user }) => {
    const navTabs = [
        { id: 'home', label: 'For you', icon: <ChevronDown size={14} fill="currentColor" /> },
        { id: 'todos', label: 'Todo' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'data', label: 'Data' }
    ];

    const [totalFiles, setTotalFiles] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        // Handle hash-based search
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash) {
                const query = decodeURIComponent(hash.substring(1));
                setSearchQuery(query);
            } else {
                setSearchQuery('');
            }
        };
        handleHashChange();
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    return (
        <div className="feed-page min-h-screen bg-background relative pb-20">
            {/* Hero Section */}
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        TOOLS THAT MAKE LIFE <br /> TOO EASY
                    </h1>
                    <p className="hero-subtitle">
                        {totalFiles} <span className="text-destructive font-bold">Files stored</span>
                    </p>

                    <div className="hero-search-wrapper">
                        <div className="big-search-bar">
                            <input
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => {
                                    const newVal = e.target.value;
                                    setSearchQuery(newVal);
                                    if (newVal) {
                                        window.history.replaceState(null, null, `#${encodeURIComponent(newVal)}`);
                                    } else {
                                        window.history.replaceState(null, null, window.location.pathname);
                                    }
                                }}
                            />
                            <div className="search-actions">
                                <span className="kbd">CTRL + K</span>
                                <button className="search-btn"><Database size={18} /></button>
                            </div>
                        </div>
                        <div className="hero-footer-text">#Start typing to search.</div>
                    </div>
                </div>
            </div>

            <div className="content-overlay content-area pt-24 px-4 md:px-6">
                <div className="sticky-nav-container mb-8 flex justify-center">
                    <MagneticMorphingNav
                        activeTab="data"
                        onTabChange={navigateOnly}
                        tabs={navTabs}
                        user={user}
                    />
                </div>

                <div className="w-full max-w-[1400px] mx-auto">
                    <FileExplorer
                        user={user}
                        externalSearchQuery={searchQuery}
                        onFileCountChange={setTotalFiles}
                    />
                </div>
            </div>
        </div>
    );
};

export default DataPage;
