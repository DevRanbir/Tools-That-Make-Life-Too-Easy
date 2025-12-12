
import React from 'react';
import { TrendingUp, Search } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '../supabase';

gsap.registerPlugin(ScrollTrigger);

const ShopPage = ({ navigateOnly, user, sortPreference }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]); // Store filtered results
    const [totalTools, setTotalTools] = useState(0);
    const viewedIds = useRef(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        // Handle hash-based search on mount and hash change
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash) {
                const query = decodeURIComponent(hash.substring(1)); // Remove the '#'
                setSearchQuery(query);
            } else {
                setSearchQuery('');
            }
        };

        handleHashChange(); // Initial check
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
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

                // 2. Fetch User Bookmarks (if logged in)
                let userBookmarks = new Set();
                if (user) {
                    const { data: bookmarkData, error: bookmarkError } = await supabase
                        .from('bookmarks')
                        .select('product_id')
                        .eq('user_id', user.id);

                    if (bookmarkError) {
                        console.error("Error fetching bookmarks:", bookmarkError);
                    } else if (bookmarkData) {
                        bookmarkData.forEach(b => userBookmarks.add(b.product_id));
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
                        if (viewedIds.current.has(id)) return;
                        viewedIds.current.add(id);

                        setProducts(prev => prev.map(p =>
                            p.id === id ? { ...p, views: (p.views || 0) + 1 } : p
                        ));

                        const { error } = await supabase.rpc('increment_views', { row_id: id });
                        if (error) console.error("Error incrementing views:", error);
                    }
                }));

                setProducts(processedProducts);
            } catch (err) {
                console.error("Error fetching products:", err);
            }
        };
        fetchProducts();
    }, [user]);

    // Filter products when products or searchQuery changes
    useEffect(() => {
        if (!searchQuery) {
            setFilteredProducts([]); // Don't show anything by default
        } else {
            const lowerQuery = searchQuery.toLowerCase();
            const filtered = products.filter(p =>
                (p.title && p.title.toLowerCase().includes(lowerQuery)) ||
                (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
                (p.description && p.description.toLowerCase().includes(lowerQuery))
            );

            // Sorting implementation (Client-side)
            let sorted = [...filtered];
            // Same sort logic as Manual.jsx
            switch (sortPreference) {
                case 'launch_recent': sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break;
                case 'launch_old': sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break;
                case 'credits_inc':
                    sorted.sort((a, b) => {
                        const parse = (p) => (!p || p === 'Free') ? 0 : (parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
                        return parse(a.price) - parse(b.price);
                    });
                    break;
                case 'credits_dec':
                    sorted.sort((a, b) => {
                        const parse = (p) => (!p || p === 'Free') ? 0 : (parseFloat(p.replace(/[^0-9.]/g, '')) || 0);
                        return parse(b.price) - parse(a.price);
                    });
                    break;
                case 'rating_inc': sorted.sort((a, b) => (parseFloat(a.rating) || 0) - (parseFloat(b.rating) || 0)); break;
                case 'rating_dec': sorted.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)); break;
                case 'trending':
                default: sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
            }

            setFilteredProducts(sorted);
        }
    }, [products, searchQuery, sortPreference]);


    // Fetch bookmarks manually on this page if needed, or share logical fetch? 
    // Wait, Manual.jsx keeps `products` state internal. Search.jsx does too.
    // We need to fetch bookmarks here as well to show correct state.
    useEffect(() => {
        const fetchBookmarks = async () => {
            if (!user) return;
            const { data: userData } = await supabase
                .from('user_details')
                .select('bookmarks')
                .eq('id', user.id)
                .single();

            if (userData && userData.bookmarks) {
                const bSet = new Set(userData.bookmarks);
                setProducts(prev => prev.map(p => ({ ...p, isBookmarked: bSet.has(p.id) })));
            }
        };
        if (products.length > 0) fetchBookmarks();
    }, [products.length, user]);

    const handleBookmark = async (id) => {
        if (!user) {
            alert("Please login to bookmark items.");
            return;
        }

        const product = products.find(p => p.id === id);
        if (!product) return;

        const newStatus = !product.isBookmarked;

        // Optimistic Update
        const updateList = (list) => list.map(p =>
            p.id === id ? { ...p, isBookmarked: newStatus } : p
        );

        setProducts(updateList);
        setFilteredProducts(updateList);

        try {
            const { error } = await supabase.rpc('toggle_bookmark', { product_id: id });
            if (error) throw error;
        } catch (err) {
            console.error("Bookmark failed", err);
            // Revert
            const revertList = (list) => list.map(p =>
                p.id === id ? { ...p, isBookmarked: !newStatus } : p
            );
            setProducts(revertList);
            setFilteredProducts(revertList);
            alert(`Failed to update bookmark: ${err.message || 'Check console'} `);
        }
    };

    return (
        <div className="feed-page min-h-screen bg-background relative pb-32">
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        {totalTools.toLocaleString()} <span className="text-destructive font-bold">AI tools requires credits to use</span>
                    </p>

                    <div className="hero-search-wrapper">
                        <div className="big-search-bar">
                            <input
                                type="text"
                                placeholder="Search Shop..."
                                value={searchQuery}
                                onChange={(e) => {
                                    const newVal = e.target.value;
                                    setSearchQuery(newVal);
                                    // Update hash without flooding history
                                    if (newVal) {
                                        window.history.replaceState(null, null, `#${encodeURIComponent(newVal)}`);
                                    } else {
                                        window.history.replaceState(null, null, window.location.pathname);
                                    }
                                }}
                            />
                            <div className="search-actions">
                                <span className="kbd">CTRL + K</span>
                                <button className="search-btn"><Search size={18} /></button>
                            </div>
                        </div>
                        <div className="hero-footer-text">#Start typing to search a plan made for you.</div>
                    </div>
                </div>
            </div>

            <div className="content-overlay content-area pt-24">

                <div
                    ref={gridRef}
                    className="masonry-wrapper"
                    style={{ margin: '0 auto', width: '100%', maxWidth: '100%', padding: '0 20px' }}
                >
                    {searchQuery && (
                        <div className="section-header" style={{ alignItems: 'flex-start', marginBottom: 10 }}>
                            <div className="trending-title">
                                <Search size={24} /> {searchQuery ? `Shop Results for "${searchQuery}"` : "Shop"}
                            </div>
                        </div>
                    )}

                    <Masonry
                        items={filteredProducts}
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
        </div>
    );
};

export default ShopPage;
