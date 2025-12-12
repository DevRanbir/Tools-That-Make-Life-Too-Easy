import React from 'react';
import { TrendingUp, BookOpen, Settings, Paperclip, ArrowUp, ChevronDown, Sparkles } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';

import Masonry from '../components/Masonry';
import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

import { supabase } from '../supabase';
import { useState, useEffect } from 'react';

const Trending = ({ navigateOnly, pageName = 'Trending', user, sortPreference }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]);
    const viewedIds = useRef(new Set());

    useEffect(() => {
        // 1. Fast Mode: No Cards
        if (pageName === 'Fast mode') {
            setProducts([]);
            return;
        }

        const fetchProducts = async () => {
            try {
                // 1. Fetch Products
                let query = supabase
                    .from('products')
                    .select('*')
                    .order('created_at', { ascending: false });

                const { data: productsData, error: productError } = await query;

                if (productError) {
                    console.error("Error fetching products:", productError);
                    return;
                }

                // 2. Fetch User Details (Bookmarks) (if logged in)
                let userBookmarks = new Set();
                if (user) {
                    const { data: userData, error: userError } = await supabase
                        .from('user_details')
                        .select('bookmarks')
                        .eq('id', user.id)
                        .single();

                    if (userError && userError.code !== 'PGRST116') {
                        console.error("Error fetching user details:", userError);
                    } else if (userData && userData.bookmarks) {
                        userData.bookmarks.forEach(id => userBookmarks.add(id));
                    }
                }

                // 3. Process Data
                let processedProducts = productsData.map(doc => ({
                    ...doc,
                    img: doc.image,
                    height: Math.floor(Math.random() * (600 - 300 + 1) + 300),
                    url: '#',
                    isBookmarked: userBookmarks.has(doc.id),
                    onView: async (id) => {
                        if (!user) return;

                        // Check local session view
                        if (viewedIds.current.has(id)) return;

                        // Check database view
                        if (doc.viewed_by && doc.viewed_by.includes(user.id)) {
                            viewedIds.current.add(id);
                            return;
                        }

                        viewedIds.current.add(id);

                        // Optimistic update
                        setProducts(prev => prev.map(p =>
                            p.id === id ? { ...p, views: (p.views || 0) + 1, viewed_by: [...(p.viewed_by || []), user.id] } : p
                        ));

                        // Call RPC to register view safely
                        const { error } = await supabase.rpc('register_view', { row_id: id });
                        if (error) console.error("Error incrementing views:", error);
                    }
                }));

                // 4. Filter for For You (Bookmarks)
                if (pageName === 'For You') {
                    if (!user) {
                        setProducts([]); // No user = no bookmarks shown
                        return;
                    }
                    processedProducts = processedProducts.filter(p => userBookmarks.has(p.id));
                }

                if (processedProducts.length > 0 || pageName === 'For You') {
                    // Sorting
                    let sorted = [...processedProducts];
                    switch (sortPreference) {
                        case 'launch_recent':
                            sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                            break;
                        case 'launch_old':
                            sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                            break;
                        case 'credits_inc':
                            sorted.sort((a, b) => {
                                const parsePrice = (p) => {
                                    if (!p || p === 'Free') return 0;
                                    return parseFloat(p.replace(/[^0-9.]/g, '')) || 0;
                                };
                                return parsePrice(a.price) - parsePrice(b.price);
                            });
                            break;
                        case 'credits_dec':
                            sorted.sort((a, b) => {
                                const parsePrice = (p) => {
                                    if (!p || p === 'Free') return 0;
                                    return parseFloat(p.replace(/[^0-9.]/g, '')) || 0;
                                };
                                return parsePrice(b.price) - parsePrice(a.price);
                            });
                            break;
                        case 'rating_inc':
                            sorted.sort((a, b) => (parseFloat(a.rating) || 0) - (parseFloat(b.rating) || 0));
                            break;
                        case 'rating_dec':
                            sorted.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
                            break;
                        case 'trending':
                        default:
                            // Default to views
                            sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
                            break;
                    }
                    setProducts(sorted);
                }
            } catch (err) {
                console.error("Error fetching products:", err);
            }
        };
        fetchProducts();
    }, [pageName, user, sortPreference]);

    const handleBookmark = async (id) => {
        if (!user) {
            alert("Please login to bookmark items.");
            return;
        }

        const product = products.find(p => p.id === id);
        if (!product) return;

        const wasBookmarked = product.isBookmarked;
        const newStatus = !wasBookmarked;

        // Optimistic Update
        setProducts(prev => prev.map(p =>
            p.id === id
                ? { ...p, isBookmarked: newStatus } // Saves count removed from products table
                : p
        ));

        try {
            // Use RPC for atomic toggle
            const { error } = await supabase.rpc('toggle_bookmark', { product_id: id });

            if (error) throw error;
        } catch (err) {
            console.error("Bookmark operation failed:", err);
            // Revert state
            setProducts(prev => prev.map(p =>
                p.id === id
                    ? { ...p, isBookmarked: wasBookmarked }
                    : p
            ));
            alert(`Failed to update bookmark: ${err.message || 'Check console'}`);
        }
    };

    return (
        <div className="feed-page min-h-screen bg-background relative pb-32">
            <div className="content-overlay content-area pt-24">
                <div className="sticky-nav-container mb-8">
                    <MagneticMorphingNav
                        activeTab={pageName === 'For You' ? 'home' : (pageName === 'Fast mode' ? 'fastmode' : 'manual')}
                        onTabChange={(id) => navigateOnly(id)}
                    />
                </div>

                <div
                    ref={gridRef}
                    className="masonry-wrapper"
                    style={{ margin: '0 auto', width: '100%', maxWidth: '100%', padding: '0 20px' }}
                >
                    <div className="section-header" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                        <div className="trending-title">
                            <TrendingUp size={24} /> {pageName}
                        </div>
                    </div>

                    {/* Always render Masonry, but list might be empty for fast mode if no bookmarks */}
                    <Masonry
                        items={products}
                        ease="power3.out"
                        duration={0.6}
                        stagger={0.05}
                        animateFrom="bottom"
                        scaleOnHover={true}
                        hoverScale={0.95}
                        blurToFocus={true}
                        colorShiftOnHover={false}
                        onBookmark={handleBookmark}
                        user={user}
                    />
                </div>
            </div>

            {/* AI Prompt Bottom Bar */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50">
                <div className="relative rounded-3xl bg-[#1e1e1e] border border-white/10 p-4 shadow-2xl">
                    {/* Top Badge */}
                    <div className="flex justify-between items-center mb-4 px-2">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-white flex items-center gap-1">AI <Sparkles size={12} className="text-yellow-400" /></span>
                            <span className="text-zinc-400 text-sm">is free this weekend!</span>
                        </div>
                        <span className="text-zinc-500 text-xs font-medium cursor-pointer hover:text-white transition-colors">Ship Now!</span>
                    </div>

                    {/* Input */}
                    <input
                        type="text"
                        placeholder="What can I do for you?"
                        className="w-full bg-transparent text-xl text-white placeholder:text-zinc-500 outline-none pb-8 px-2"
                    />

                    {/* Bottom Controls */}
                    <div className="flex items-center justify-between px-2">
                        <button className="flex items-center gap-2 bg-[#2a2a2a] hover:bg-[#333] transition-colors rounded-full px-3 py-1.5 text-sm text-zinc-300 border border-white/5">
                            <span className="font-semibold text-white">AI</span> Claude 4.5 Sonnet <ChevronDown size={14} />
                        </button>

                        <div className="flex items-center gap-2">
                            <button className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                                <Paperclip size={20} />
                            </button>
                            <button className="p-2 bg-[#2a2a2a] hover:bg-white hover:text-black text-white transition-all rounded-xl border border-white/5">
                                <ArrowUp size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Trending;
