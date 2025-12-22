
import React from 'react';
import { TrendingUp, Search, Bookmark, Heart } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '../supabase';

gsap.registerPlugin(ScrollTrigger);

const Manual = ({ navigateOnly, pageName = 'Manual', user, sortPreference, targetSection, onAuthClick }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [totalTools, setTotalTools] = useState(0);
    const [tasksDone, setTasksDone] = useState(0);
    const viewedIds = useRef(new Set());
    const [recentTools, setRecentTools] = useState([]);
    const [trendingTools, setTrendingTools] = useState([]);
    const [bookmarkedTools, setBookmarkedTools] = useState([]);
    const [likedTools, setLikedTools] = useState([]);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // Search Filtering
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

    // Updated Realtime Task Counter
    useEffect(() => {
        const fetchTasksDone = async () => {
            const { data, error } = await supabase
                .from('task_done')
                .select('total_tasks')
                .limit(1)
                .single();

            if (data) {
                setTasksDone(data.total_tasks);
            }
        };

        fetchTasksDone();

        const channel = supabase
            .channel('task_done_changes')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'task_done' },
                (payload) => {
                    console.log("New total:", payload.new.total_tasks);
                    setTasksDone(payload.new.total_tasks);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
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

                setTotalTools(productsData.length);

                // 2. Fetch User Details (Bookmarks, Logs)
                let userBookmarks = new Set();
                let userLogs = [];

                if (user) {
                    const { data: userData, error: userError } = await supabase
                        .from('user_details')
                        .select('bookmarks, logs')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (userError && userError.code !== 'PGRST116') {
                        console.error("Error fetching user details:", userError);
                    } else if (userData) {
                        if (userData.bookmarks) {
                            userData.bookmarks.forEach(id => userBookmarks.add(id));
                        }
                        if (userData.logs) {
                            userLogs = userData.logs;
                        }
                    }
                }

                // 3. Process Data
                let processedProducts = productsData.map(doc => ({
                    ...doc,
                    img: doc.image,
                    height: Math.floor(Math.random() * (600 - 300 + 1) + 300),
                    url: '#',
                    isBookmarked: userBookmarks.has(doc.id),
                    isLiked: Array.isArray(doc.liked_by) && user ? doc.liked_by.includes(user.id) : false,
                    onView: async (id) => {
                        if (!user) return;
                        if (viewedIds.current.has(id)) return;
                        if (doc.viewed_by && doc.viewed_by.includes(user.id)) {
                            viewedIds.current.add(id);
                            return;
                        }

                        viewedIds.current.add(id);

                        // Optimistic
                        setProducts(prev => prev.map(p =>
                            p.id === id ? { ...p, views: (p.views || 0) + 1 } : p
                        ));

                        const { error } = await supabase.rpc('register_view', { row_id: id });
                        if (error) console.error("Error incrementing views:", error);
                    }
                }));

                // 4. Categorize for 'For You'
                if (pageName === 'For You') {
                    if (!user) {
                        setProducts([]);
                        return;
                    }
                    // Bookmarked
                    setBookmarkedTools(processedProducts.filter(p => p.isBookmarked));

                    // Liked
                    setLikedTools(processedProducts.filter(p => p.isLiked));

                    // Trending (Top 3 views)
                    setTrendingTools([...processedProducts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3));

                    // Recently Used
                    const recentMap = new Map();
                    userLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    userLogs.forEach(log => {
                        const product = processedProducts.find(p => p.title && (log.description.includes(p.title) || p.title.includes(log.description)));
                        if (product && !recentMap.has(product.id)) {
                            recentMap.set(product.id, product);
                        }
                    });
                    setRecentTools(Array.from(recentMap.values()).slice(0, 4));

                    // Keep main products as bookmarked for now or all? 
                    // Let's set it to ALL processed products so 'search' still works on everything if needed, 
                    // but the view renders specific categories.
                    setProducts(processedProducts);
                } else {
                    // Normal Manual Page - Still populate categories for nav
                    // Bookmarked
                    setBookmarkedTools(processedProducts.filter(p => p.isBookmarked));

                    // Liked
                    setLikedTools(processedProducts.filter(p => p.isLiked));

                    // Trending (Top 3 views)
                    setTrendingTools([...processedProducts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3));

                    // Recently Used
                    const recentMap = new Map();
                    userLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    userLogs.forEach(log => {
                        const product = processedProducts.find(p => 
                            p.title && 
                            log.description && 
                            (log.description.includes(p.title) || p.title.includes(log.description))
                        );
                        if (product && !recentMap.has(product.id)) {
                            recentMap.set(product.id, product);
                        }
                    });
                    setRecentTools(Array.from(recentMap.values()).slice(0, 4));

                    // Normal Manual Filtering
                    let sorted = [...processedProducts];
                    switch (sortPreference) {
                        case 'launch_recent': sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
                        case 'launch_old': sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
                        case 'credits_inc':
                            sorted.sort((a, b) => {
                                const parse = p => (!p || p === 'Free') ? 0 : (parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
                                return parse(a.price) - parse(b.price);
                            });
                            break;
                        case 'credits_dec':
                            sorted.sort((a, b) => {
                                const parse = p => (!p || p === 'Free') ? 0 : (parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
                                return parse(b.price) - parse(a.price);
                            });
                            break;
                        case 'rating_inc': sorted.sort((a, b) => (parseFloat(a.rating) || 0) - (parseFloat(b.rating) || 0)); break;
                        case 'rating_dec': sorted.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)); break;
                        case 'trending':
                        default: sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
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

        let product = products.find(p => p.id === id) ||
            bookmarkedTools.find(p => p.id === id) ||
            likedTools.find(p => p.id === id) ||
            recentTools.find(p => p.id === id) ||
            trendingTools.find(p => p.id === id);

        if (!product) return;

        const newStatus = !product.isBookmarked;
        const transform = (p) => ({ ...p, isBookmarked: newStatus });
        const updateList = (list) => list.map(p => p.id === id ? transform(p) : p);

        setProducts(prev => updateList(prev));
        setRecentTools(prev => updateList(prev));
        setTrendingTools(prev => updateList(prev));
        setLikedTools(prev => updateList(prev));

        setBookmarkedTools(prev => {
            if (newStatus) {
                if (prev.some(p => p.id === id)) return updateList(prev);
                return [transform(product), ...prev];
            } else {
                return prev.filter(p => p.id !== id);
            }
        });

        try {
            const { error } = await supabase.rpc('toggle_bookmark', { product_id: id });
            if (error) throw error;
        } catch (err) {
            console.error("Bookmark operation failed:", err);
            alert(`Failed to update bookmark: ${err.message}`);
        }
    };

    const handleLike = async (id) => {
        if (!user) {
            alert("Please login to like items.");
            return;
        }

        let product = products.find(p => p.id === id) ||
            bookmarkedTools.find(p => p.id === id) ||
            likedTools.find(p => p.id === id) ||
            recentTools.find(p => p.id === id) ||
            trendingTools.find(p => p.id === id);

        if (!product) return;

        const wasLiked = product.isLiked;
        const newLikedState = !wasLiked;
        const newLikesCount = newLikedState ? (product.likes || 0) + 1 : Math.max(0, (product.likes || 0) - 1);

        let newLikedBy = product.liked_by || [];
        if (newLikedState) {
            if (!newLikedBy.includes(user.id)) newLikedBy = [...newLikedBy, user.id];
        } else {
            newLikedBy = newLikedBy.filter(uid => uid !== user.id);
        }

        const transform = (p) => ({ ...p, isLiked: newLikedState, likes: newLikesCount, liked_by: newLikedBy });
        const updateList = (list) => list.map(p => p.id === id ? transform(p) : p);

        setProducts(prev => updateList(prev));
        setBookmarkedTools(prev => updateList(prev));
        setRecentTools(prev => updateList(prev));
        setTrendingTools(prev => updateList(prev));

        setLikedTools(prev => {
            if (newLikedState) {
                if (prev.some(p => p.id === id)) return updateList(prev);
                return [transform(product), ...prev];
            } else {
                return prev.filter(p => p.id !== id);
            }
        });

        try {
            const { error } = await supabase
                .from('products')
                .update({
                    likes: newLikesCount,
                    liked_by: newLikedBy
                })
                .eq('id', id);

            if (error) throw error;
        } catch (err) {
            console.error("Like failed", err);
            alert(`Failed to update like: ${err.message}`);
        }
    };

    const scrollToSection = (label) => {
        const id = `section-${label.replace(/\s+/g, '-').toLowerCase()}`;
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    useEffect(() => {
        if (targetSection) {
            // Slight delay to ensure render
            setTimeout(() => scrollToSection(targetSection), 100);
        }
    }, [targetSection]);

    return (
        <div className="feed-page min-h-screen bg-background relative pb-32">
            {/* Dynamic Z-index to ensure dropdown shows over content */}
            <div className={`hero-sticky-wrapper ${showDropdown ? '!z-[100]' : ''}`}>
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        {pageName === 'For You' ? (
                            bookmarkedTools.length > 0 ? (
                                <>
                                    showing {bookmarkedTools.length} <span className="text-destructive font-bold">AI tool{bookmarkedTools.length !== 1 ? 's' : ''} you saved</span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">Start liking & using agents to see them here.</span>
                            )
                        ) : (
                            <>
                                {totalTools.toLocaleString()} <span className="text-destructive font-bold">AI tools</span> and {tasksDone.toLocaleString()} <span className="text-destructive font-bold">Tasks Done</span>
                            </>
                        )}
                    </p>


                </div>
            </div>

            <div className="content-overlay content-area pt-24">
                <div className="sticky-nav-container mb-8">
                    <MagneticMorphingNav
                        activeTab={pageName === 'For You' ? 'home' : (pageName === 'Fast mode' ? 'fastmode' : 'manual')}
                        onTabChange={(id) => navigateOnly(id)}
                        user={user}
                        availableCategories={[
                            bookmarkedTools.length > 0 && 'Bookmarked',
                            likedTools.length > 0 && 'Liked',
                            recentTools.length > 0 && 'Recently Used',
                            trendingTools.length > 0 && 'Trending'
                        ].filter(Boolean)}
                        onSectionSelect={(section) => navigateOnly('home', section)}
                    />
                </div>

                <div
                    ref={gridRef}
                    className="masonry-wrapper"
                    style={{ margin: '0 auto', width: '100%', maxWidth: '100%', padding: '0 20px' }}
                >
                    {pageName === 'For You' ? (
                        <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            {/* Bookmarked */}
                            {bookmarkedTools.length > 0 && (
                                <section id="section-bookmarked" className="scroll-mt-40">
                                    <div className="section-header flex items-center gap-2 mb-6 border-b border-border pb-2">
                                        <Bookmark size={20} /> <h2 className="text-xl font-bold">Bookmarked</h2>
                                    </div>
                                    <Masonry items={bookmarkedTools} onBookmark={handleBookmark} onLike={handleLike} user={user} onAuthClick={onAuthClick} />
                                </section>
                            )}

                            {/* Liked */}
                            {likedTools.length > 0 && (
                                <section id="section-liked" className="scroll-mt-40">
                                    <div className="section-header flex items-center gap-2 mb-6 border-b border-border pb-2">
                                        <Heart size={20} /> <h2 className="text-xl font-bold">Liked</h2>
                                    </div>
                                    <Masonry items={likedTools} onBookmark={handleBookmark} onLike={handleLike} user={user} onAuthClick={onAuthClick} />
                                </section>
                            )}

                            {/* Recently Used */}
                            {recentTools.length > 0 && (
                                <section id="section-recently-used" className="scroll-mt-40">
                                    <div className="section-header flex items-center gap-2 mb-6 border-b border-border pb-2">
                                        <Search size={20} /> <h2 className="text-xl font-bold">Recently Used</h2>
                                    </div>
                                    <Masonry items={recentTools} onBookmark={handleBookmark} onLike={handleLike} user={user} onAuthClick={onAuthClick} />
                                </section>
                            )}

                            {/* Trending */}
                            {trendingTools.length > 0 && (
                                <section id="section-trending" className="scroll-mt-40">
                                    <div className="section-header flex items-center gap-2 mb-6 border-b border-border pb-2">
                                        <TrendingUp size={20} /> <h2 className="text-xl font-bold">Trending</h2>
                                    </div>
                                    <Masonry items={trendingTools} onBookmark={handleBookmark} onLike={handleLike} user={user} onAuthClick={onAuthClick} />
                                </section>
                            )}
                        </div>
                    ) : (
                        pageName === 'For You' && products.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-500">
                                <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center mb-6">
                                    <Bookmark size={36} className="text-muted-foreground" />
                                </div>
                                {/* ... (Error/Empty state if failed) ... */}
                                <h3 className="text-2xl font-bold mb-3">Loading or Empty...</h3>
                            </div>
                        ) : (
                            // Normal Manual View
                            <>
                                {/* Section Header */}
                                <div className="section-header" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                                    <div className="trending-title">
                                        <TrendingUp size={24} /> {pageName}
                                    </div>
                                </div>
                                <Masonry
                                    items={products}
                                    ease="power3.out"
                                    duration={0.6}
                                    stagger={0.05}
                                    animateFrom="bottom"
                                    scaleOnHover={true}
                                    hoverScale={0.98}
                                    blurToFocus={true}
                                    colorShiftOnHover={false}
                                    onBookmark={handleBookmark}
                                    onLike={handleLike}
                                    user={user}
                                    onAuthClick={onAuthClick}
                                />
                            </>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default Manual;
