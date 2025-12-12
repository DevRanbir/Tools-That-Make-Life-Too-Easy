import React, { useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ChevronDown } from 'lucide-react';
import './MagneticMorphingNav.css';

const defaultTabs = [
    { id: 'home', label: 'For you', icon: <ChevronDown size={14} fill="currentColor" /> },
    { id: 'manual', label: 'Manual' },
    { id: 'fastmode', label: 'Fast mode' }
];

const MagneticMorphingNav = ({ activeTab, onTabChange, tabs = defaultTabs, user }) => {
    const [hoveredTab, setHoveredTab] = useState(null);

    const visibleTabs = user ? tabs : tabs.filter(tab => tab.id !== 'home');

    return (
        <div className="magnetic-nav">
            {visibleTabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
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

                    <span className="nav-content">
                        {tab.icon}
                        {tab.label}
                    </span>
                </button>
            ))}
        </div>
    );
};

export default MagneticMorphingNav;
