import React from 'react';
import { TrendingUp, BookOpen, Settings, Monitor, Search, Image as ImageIcon, Sparkles, Plus } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';

import Masonry from '../components/Masonry';
import { useRef, useLayoutEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

import { supabase } from '../supabase';
import { useState, useEffect } from 'react';

const Home = ({ navigateOnly, sortPreference }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]); // Default to empty array

    /* 
    // Products fetching removed as per request to show cards only on Manual tab
    useEffect(() => {
        const fetchProducts = async () => {
             // ... fetching logic ...
        };
        fetchProducts();
        // ... subscription ...
    }, []);
    */

    return (
        <div className="home-page">
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        43,306 <span className="text-destructive font-bold">AI tools</span> for 11,519 <span className="text-destructive">tasks</span>
                    </p>

                    <div className="hero-search-wrapper">
                        <div className="big-search-bar">
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        navigateOnly('search');
                                        // Small timeout to allow state change then update hash
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



            <div className="content-overlay content-area">
                <div className="sticky-nav-container">
                    <MagneticMorphingNav
                        activeTab="home"
                        onTabChange={(id) => navigateOnly(id)}
                    />
                </div>

                <div
                    ref={gridRef}
                    className="masonry-wrapper"
                    style={{ margin: '0 auto', width: '100%', maxWidth: '100%', padding: '0 20px' }}
                >
                    {/* Masonry Grid removed for Home tab */}
                </div>
            </div>
        </div>
    );
};

export default Home;
