import React, { useState, useEffect } from 'react';
import { Database, ChevronDown } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import FileExplorer from '../components/FileExplorer';

const DataPage = ({ navigateOnly, user, darkMode }) => {
    const navTabs = [
        { id: 'todos', label: 'Todo' },
        { id: 'notes', label: 'Notes' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'data', label: 'Data' }
    ];

    const [totalFiles, setTotalFiles] = useState(0);

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
                        onFileCountChange={setTotalFiles}
                        darkMode={darkMode}
                    />
                </div>
            </div>
        </div>
    );
};

export default DataPage;
