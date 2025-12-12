import React from 'react';
import { ChevronDown, Search } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import CalendarComponent from '../components/comp-542';

const CalendarPage = ({ navigateOnly, user }) => {
    const [eventCounts, setEventCounts] = React.useState({ ongoing: 0, upcoming: 0 });
    const navTabs = [
        { id: 'home', label: 'For you', icon: <ChevronDown size={14} fill="currentColor" /> },
        { id: 'data', label: 'Data' },
        { id: 'calendar', label: 'Calendar' }
    ];

    return (
        <div className="feed-page min-h-screen bg-background relative pb-20">
            {/* Hero Section */}
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        TOOLS THAT MAKE LIFE <br /> TOO EASY
                    </h1>
                    <p className="hero-subtitle">
                        {eventCounts.ongoing} <span className="text-destructive font-bold">Ongoing</span> and {eventCounts.upcoming} <span className="text-destructive font-bold">Upcoming events</span>
                    </p>

                    <div className="hero-search-wrapper">
                        <div className="big-search-bar">
                            <input
                                type="text"
                                placeholder="Search..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        navigateOnly('search');
                                        setTimeout(() => {
                                            window.location.hash = encodeURIComponent(e.target.value.trim());
                                        }, 0);
                                    }
                                }}
                            />
                            <div className="search-actions">
                                <span className="kbd">CTRL + K</span>
                                <button
                                    className="search-btn"
                                    onClick={(e) => {
                                        const input = e.currentTarget.parentElement.previousElementSibling;
                                        if (input && input.value.trim()) {
                                            navigateOnly('search');
                                            setTimeout(() => {
                                                window.location.hash = encodeURIComponent(input.value.trim());
                                            }, 0);
                                        }
                                    }}
                                ><Search size={18} /></button>
                            </div>
                        </div>
                        <div className="hero-footer-text">#1 website for AI tools. Used by 70M+ humans.</div>
                    </div>
                </div>
            </div>

            <div className="content-overlay content-area pt-24 px-4 md:px-6">
                <div className="sticky-nav-container mb-8 flex justify-center">
                    <MagneticMorphingNav
                        activeTab="calendar"
                        onTabChange={navigateOnly}
                        tabs={navTabs}
                        user={user}
                    />
                </div>

                <div className="h-[85vh] w-full max-w-[1800px] mx-auto rounded-lg overflow-hidden bg-background">
                    <CalendarComponent user={user} onEventCountChange={setEventCounts} />
                </div>
            </div>
        </div>
    );
};

export default CalendarPage;
