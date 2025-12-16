
import React from 'react';
import { TrendingUp, Search, Bookmark } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '../supabase';

gsap.registerPlugin(ScrollTrigger);

const Manual = ({ navigateOnly, pageName = 'Manual', user, sortPreference }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [totalTools, setTotalTools] = useState(0);
    const viewedIds = useRef(new Set());

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
        // Use existing 'products' state for search suggestions as it contains loaded items
        // Note: Manual.jsx might filter products for 'For You' view (line 94).
        // If we want GLOBAL search suggestions even when viewing 'For You', we should ideally have the full list.
        // However, 'products' here is whatever is displayed. 
        // If user wants to search *global* database tools while on 'For You', we technically need the full list.
        // But the previous implementation in Home.jsx fetched a separate list.
        // Let's rely on 'products' for now. If 'For You' filters distinct items, suggestions will only show saved items.
        // Use-case: "Search..." on "For You" probably implies searching *saved* stuff? 
        // Or searching *global* stuff? 
        // User said: "showing... AI tool... saved". 
        // Usually top search is global. 
        // If 'products' is filtered, this search is local to the view.
        // Let's stick to using 'products' (what's visible/loaded) for simplicity unless requested otherwise.
        // actually looking at Home.jsx, it fetched *separate* global list.
        // Manual.jsx fetches *global* list first (data), then filters it for 'For You'.
        // BUT 'products' state is updated to the *filtered* list (line 138).
        // So this will search only visible items. 
        // If global search is desired, we'd need a separate full list state.
        // Let's leave it as searching visible items for now or maybe filtering implies navigation?
        // Wait, Home.jsx's logic was: fetch small list of *all* products title/name.
        // Manual.jsx fetches *all* products full data.
        // So we can just use the initial full list... but we lose it after filtering.
        // Let's just use 'products' (what is on screen) for now to be safe, or 
        // better: Filter from the *suggestion* perspective.
        // If user types "auto", they probably want to find tools, not just saved ones.
        // Let's accept that for now it searches current view. 

        const matches = products.filter(p =>
            (p.title && p.title.toLowerCase().includes(lowerQ)) ||
            (p.name && p.name.toLowerCase().includes(lowerQ))
        ).slice(0, 5);

        setFilteredSuggestions(matches);
    }, [searchQuery, products]);

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

                // 2. Fetch User Details (Bookmarks) (if logged in)
                let userBookmarks = new Set();
                if (user) {
                    const { data: userData, error: userError } = await supabase
                        .from('user_details')
                        .select('bookmarks')
                        .eq('id', user.id)
                        .single();

                    if (userError && userError.code !== 'PGRST116') { // Ignore 'not found' error
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
                    isLiked: Array.isArray(doc.liked_by) && user ? doc.liked_by.includes(user.id) : false,
                    onView: async (id) => {
                        if (!user) return;

                        // Check local session view
                        if (viewedIds.current.has(id)) return;

                        // Check persistent database view
                        // Note: doc.viewed_by captures the state at fetch time. 
                        // If user is already in it, don't increment.
                        if (doc.viewed_by && doc.viewed_by.includes(user.id)) {
                            viewedIds.current.add(id); // Mark as viewed in session so we don't check again
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
                    // ... sorting logic remains same ...
                    // Sorting implementation (Client-side since we have all data)
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
                            // Default Supabase order created_at, but trending implies views/bookmarks
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

            // Saves are no longer on 'products' table, so we don't increment/decrement them there.
            // If you wanted to display global save counts, you'd need a separate counter or count the array length (expensive).
            // For now, per requirement "remove saves column", we stop updating it.

        } catch (err) {
            console.error("Bookmark operation failed:", err);
            // Revert state
            setProducts(prev => prev.map(p =>
                p.id === id
                    ? { ...p, isBookmarked: wasBookmarked }
                    : p
            ));
            alert(`Failed to update bookmark: ${err.message || 'Check console'} `);
        }
    };

    const handleLike = async (id) => {
        if (!user) {
            alert("Please login to like items.");
            return;
        }

        const product = products.find(p => p.id === id);
        if (!product) return;

        const wasLiked = product.isLiked;
        const newLikedState = !wasLiked;
        const currentLikes = product.likes || 0;
        const newLikesCount = newLikedState ? currentLikes + 1 : Math.max(0, currentLikes - 1);

        // Optimistic Update
        let newLikedBy = product.liked_by || [];
        if (newLikedState) {
            if (!newLikedBy.includes(user.id)) newLikedBy = [...newLikedBy, user.id];
        } else {
            newLikedBy = newLikedBy.filter(uid => uid !== user.id);
        }

        setProducts(prev => prev.map(p =>
            p.id === id ? { ...p, isLiked: newLikedState, likes: newLikesCount, liked_by: newLikedBy } : p
        ));

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
            // Revert
            setProducts(prev => prev.map(p =>
                p.id === id ? { ...p, isLiked: wasLiked, likes: currentLikes, liked_by: product.liked_by } : p
            ));
            alert(`Failed to update like: ${err.message || 'Check console'} `);
        }
    };

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
                            <>
                                showing {products.length} <span className="text-destructive font-bold">AI tool{products.length !== 1 ? 's' : ''} you saved</span>
                            </>
                        ) : (
                            <>
                                {totalTools.toLocaleString()} <span className="text-destructive font-bold">AI tools</span> and 0 <span className="text-destructive">tasks done</span>
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

                    {pageName === 'For You' && products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-500">
                            <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center mb-6">
                                <Bookmark size={36} className="text-muted-foreground" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3">No saved tools yet</h3>
                            <p className="text-muted-foreground max-w-md mb-8 text-lg">
                                {user ? "Your collection is looking a bit empty. Explore the manual to find and bookmark tools you love!" : "Log in to access your saved tools and start building your collection."}
                            </p>
                            <button 
                                onClick={() => navigateOnly('manual')}
                                className="px-8 py-3 bg-foreground text-background rounded-full font-semibold hover:opacity-90 transition-all hover:scale-105 active:scale-95"
                            >
                                {user ? "Explore Manual" : "Go to Manual"}
                            </button>
                        </div>
                    ) : (
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
                            onLike={handleLike}
                            user={user}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Manual;
