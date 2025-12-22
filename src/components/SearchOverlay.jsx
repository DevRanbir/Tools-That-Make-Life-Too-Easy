import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { supabase } from '../supabase';

const SearchOverlay = ({ navigateOnly, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState([]);
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        // Trigger fade-in on mount
        const timer = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        // Focus input on mount
        if (inputRef.current) {
            inputRef.current.focus();
        }

        const fetchProducts = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setProducts(data);
            } else if (error) {
                console.error('SearchOverlay fetch error:', error);
            }
            setIsLoading(false);
        };
        fetchProducts();

        // Handle ESC key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(() => {
            onClose();
        }, 300); // 300ms transition
    };

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredSuggestions([]);
            return;
        }

        const lowerQ = searchQuery.toLowerCase();
        const matches = products.filter(p =>
            (p.title && p.title.toLowerCase().includes(lowerQ)) ||
            (p.name && p.name.toLowerCase().includes(lowerQ))
        ).slice(0, 5);

        setFilteredSuggestions(matches);
    }, [searchQuery, products]);

    const handleSearch = (term) => {
        if (term && term.trim()) {
            navigateOnly('search');
            setTimeout(() => {
                window.location.hash = encodeURIComponent(term.trim());
            }, 0);
            handleClose();
        }
    };

    return (
        <div
            className={`fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={handleClose}
        >
            <div
                className={`w-full max-w-2xl px-4 relative transition-all duration-300 ease-out transform ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 -translate-y-4'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="hero-search-wrapper w-full">
                    {/* ... content ... */}
                    <div className="big-search-bar relative bg-card">
                        <input
                            ref={inputRef}
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
                                if (e.key === 'Enter') {
                                    handleSearch(searchQuery);
                                }
                            }}
                            className="bg-transparent border-none outline-none text-foreground text-lg flex-1"
                        />

                        {/* Search Dropdown */}
                        {showDropdown && searchQuery && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden text-left">
                                {isLoading ? (
                                    <div className="px-4 py-3 text-muted-foreground text-sm flex items-center gap-2">
                                        <Sparkles className="animate-spin" size={14} /> Loading tools...
                                    </div>
                                ) : filteredSuggestions.length > 0 ? (
                                    filteredSuggestions.map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="px-4 py-3 hover:bg-secondary cursor-pointer flex items-center gap-3 transition-colors border-b border-border last:border-0"
                                            onMouseDown={(e) => {
                                                e.preventDefault(); // Prevent input blur
                                                handleSearch(item.title || item.name);
                                            }}
                                        >
                                            <Search size={16} className="text-muted-foreground" />
                                            <span className="text-base font-medium text-foreground truncate">
                                                {item.title || item.name}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-4 py-3 text-muted-foreground text-sm">
                                        No results found for "{searchQuery}"
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="search-actions">
                            <span className="kbd cursor-pointer" onClick={handleClose}>ESC to exit</span>
                            <button
                                className="search-btn"
                                onClick={() => handleSearch(searchQuery)}
                            >
                                <Search size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="hero-footer-text text-center mt-4">Find the right agent for your needs. Type your query, we handle the rest.</div>
                </div>
            </div>
        </div>
    );
};

export default SearchOverlay;
