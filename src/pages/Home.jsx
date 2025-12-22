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

    const [searchQuery, setSearchQuery] = useState('');
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        const fetchProducts = async () => {
            const { data, error } = await supabase
                .from('products')
                .select('title, name, description') // minimal fetch for search
                .order('views', { ascending: false }); // Show popular stuff first?

            if (!error && data) {
                setProducts(data);
            }
        };
        fetchProducts();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredSuggestions([]);
            return;
        }

        const lowerQ = searchQuery.toLowerCase();
        const matches = products.filter(p =>
            (p.title && p.title.toLowerCase().includes(lowerQ)) ||
            (p.name && p.name.toLowerCase().includes(lowerQ))
        ).slice(0, 5); // Limit to 5 suggestions

        setFilteredSuggestions(matches);
    }, [searchQuery, products]);

    return (
        <div className="home-page">
            {/* Dynamic Z-index to ensure dropdown shows over content */}
            <div className={`hero-sticky-wrapper ${showDropdown ? '!z-[100]' : ''}`}>
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        43,306 <span className="text-destructive font-bold">AI tools</span> for 11,519 <span className="text-destructive">tasks</span>
                    </p>

                    <div className="hero-search-wrapper">
                        <div className="big-search-bar relative">
                            <input
                                type="text"
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setShowDropdown(true);
                                }}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchQuery.trim()) {
                                        navigateOnly('search');
                                        setTimeout(() => {
                                            window.location.hash = encodeURIComponent(searchQuery.trim());
                                        }, 0);
                                        setShowDropdown(false);
                                    }
                                }}
                            />
                            {/* Search Dropdown */}
                            {showDropdown && searchQuery && filteredSuggestions.length !== 0 && (
                                <div className="absolute top-full left-0 right-0 mt-4 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-[100] overflow-hidden text-left animate-in fade-in slide-in-from-top-2 duration-200">
                                    {filteredSuggestions.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="px-5 py-4 hover:bg-white/5 cursor-pointer flex items-center gap-3 transition-colors group border-b border-white/5 last:border-0"
                                            onClick={() => {
                                                const term = item.title || item.name;
                                                setSearchQuery(term);
                                                navigateOnly('search');
                                                setTimeout(() => {
                                                    window.location.hash = encodeURIComponent(term);
                                                }, 0);
                                            }}
                                        >
                                            <Search size={16} className="text-zinc-500 group-hover:text-white transition-colors" />
                                            <span className="text-base font-medium text-zinc-300 group-hover:text-white transition-colors truncate">
                                                {item.title || item.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
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
                                >
                                    <Search size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="hero-footer-text">#1 website for AI Agents.</div>
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
