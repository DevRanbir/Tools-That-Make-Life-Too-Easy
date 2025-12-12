
import React from 'react';
import { Search, X } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '../supabase';

gsap.registerPlugin(ScrollTrigger);

const TagsPage = ({ navigateOnly, user, sortPreference }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]); // All products
    // filteredProducts is what we show in the grid
    const [displayedProducts, setDisplayedProducts] = useState([]);

    // Tag State
    const [allTags, setAllTags] = useState([]);
    const [visibleTags, setVisibleTags] = useState([]); // Filtered by search
    const [selectedTag, setSelectedTag] = useState(null);
    const [tagSearchQuery, setTagSearchQuery] = useState('');

    const [totalTools, setTotalTools] = useState(0);
    const viewedIds = useRef(new Set());

    // 1. Fetch Products & Extract Tags
    useEffect(() => {
        const fetchProducts = async () => {
            try {
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

                // Extract Tags
                const tagsSet = new Set();
                productsData.forEach(p => {
                    if (Array.isArray(p.tags)) {
                        p.tags.forEach(t => tagsSet.add(t));
                    }
                });
                const sortedTags = Array.from(tagsSet).sort();
                setAllTags(sortedTags);
                setVisibleTags(sortedTags);

                // Fetch Bookmarks for product state
                let userBookmarks = new Set();
                if (user) {
                    const { data: bookmarkData } = await supabase
                        .from('bookmarks')
                        .select('product_id')
                        .eq('user_id', user.id);

                    if (bookmarkData) {
                        bookmarkData.forEach(b => userBookmarks.add(b.product_id));
                    }
                }

                // Process Products
                let processedProducts = productsData.map(doc => ({
                    ...doc,
                    img: doc.image,
                    height: Math.floor(Math.random() * (600 - 300 + 1) + 300),
                    url: '#',
                    isBookmarked: userBookmarks.has(doc.id),
                    isLiked: Array.isArray(doc.liked_by) && user ? doc.liked_by.includes(user.id) : false,
                    onView: async (id) => {
                        // View counting logic (same as other pages)
                        if (!user) return;
                        if (viewedIds.current.has(id)) return;
                        viewedIds.current.add(id);

                        setProducts(prev => prev.map(p =>
                            p.id === id ? { ...p, views: (p.views || 0) + 1 } : p
                        ));
                        // Optimistic update handled locally mostly
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

    // 2. Filter Tags based on Search
    useEffect(() => {
        if (!tagSearchQuery) {
            setVisibleTags(allTags);
        } else {
            const lowerQuery = tagSearchQuery.toLowerCase();
            setVisibleTags(allTags.filter(t => t.toLowerCase().includes(lowerQuery)));
        }
    }, [tagSearchQuery, allTags]);

    // 3. Filter Products based on Selected Tag
    useEffect(() => {
        if (!selectedTag) {
            setDisplayedProducts([]); // Show nothing if no tag selected
        } else {
            let filtered = products.filter(p => p.tags && p.tags.includes(selectedTag));

            // Apply Sort Preference
            let sorted = [...filtered];
            // Reusing sort logic for consistency
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
            setDisplayedProducts(sorted);
        }
    }, [selectedTag, products, sortPreference]);

    const handleBookmark = async (id) => {
        if (!user) {
            alert("Please login to bookmark items.");
            return;
        }
        const product = products.find(p => p.id === id);
        if (!product) return;
        const newStatus = !product.isBookmarked;

        const updateList = (list) => list.map(p =>
            p.id === id ? { ...p, isBookmarked: newStatus } : p
        );

        setProducts(updateList);
        setDisplayedProducts(updateList); // Also update displayed list (NOTE: this might re-filter/sort if displayedProducts is derived, but here it's state)
        // Actually displayedProducts is state, but we need to update 'products' (source) too?
        // In the original code, `setDisplayedProducts` was updated but `products` should also be updated because filtering uses it?
        // The original code only updated `products`. Wait, let check...
        // Original code: setProducts(updateList); setDisplayedProducts(updateList);  <- Confirmed.
        // Wait, updateList iterates 'list'. If current list is 'products', it updates that.
        // We need to apply map to BOTH products and displayedProducts.
        // Actually the passed 'list' param is confusing.
        // Let's rewrite safely.

        const updateAll = products.map(p => p.id === id ? { ...p, isBookmarked: newStatus } : p);
        const updateDisplayed = displayedProducts.map(p => p.id === id ? { ...p, isBookmarked: newStatus } : p);

        setProducts(updateAll);
        setDisplayedProducts(updateDisplayed);

        try {
            const { error } = await supabase.rpc('toggle_bookmark', { product_id: id });
            if (error) throw error;
        } catch (err) {
            console.error("Bookmark failed", err);
            // Revert
            const revertAll = products.map(p => p.id === id ? { ...p, isBookmarked: !newStatus } : p);
            const revertDisplayed = displayedProducts.map(p => p.id === id ? { ...p, isBookmarked: !newStatus } : p);
            setProducts(revertAll);
            setDisplayedProducts(revertDisplayed);
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

        const updateAll = products.map(p => p.id === id ? { ...p, isLiked: newLikedState, likes: newLikesCount, liked_by: newLikedBy } : p);
        const updateDisplayed = displayedProducts.map(p => p.id === id ? { ...p, isLiked: newLikedState, likes: newLikesCount, liked_by: newLikedBy } : p);

        setProducts(updateAll);
        setDisplayedProducts(updateDisplayed);

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
            const revertAll = products.map(p => p.id === id ? { ...p, isLiked: wasLiked, likes: currentLikes, liked_by: product.liked_by } : p);
            const revertDisplayed = displayedProducts.map(p => p.id === id ? { ...p, isLiked: wasLiked, likes: currentLikes, liked_by: product.liked_by } : p);
            setProducts(revertAll);
            setDisplayedProducts(revertDisplayed);
            alert(`Failed to update like: ${err.message || 'Check console'} `);
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
                        {totalTools.toLocaleString()} <span className="text-destructive font-bold">AI tools ready to be searched</span>
                    </p>

                    <div className="hero-search-wrapper">
                        {/* 1. Search Bar for Tags */}
                        <div className="big-search-bar">
                            <input
                                type="text"
                                placeholder="Search tags..."
                                value={tagSearchQuery}
                                onChange={(e) => setTagSearchQuery(e.target.value)}
                            />
                            <div className="search-actions">
                                <span className="kbd">CTRL + K</span>
                                <button className="search-btn"><Search size={18} /></button>
                            </div>
                        </div>
                        <div className="hero-footer-text">#Select a tag to view tools</div>

                        {/* 2. Chips Container */}
                        <div className="filter-chip-container mt-4">
                            {visibleTags.map(tag => (
                                <div
                                    key={tag}
                                    className={`filter-chip ${selectedTag === tag ? 'selected' : ''}`}
                                    onClick={() => setSelectedTag(prev => prev === tag ? null : tag)}
                                >
                                    {tag}
                                    {selectedTag === tag && <X size={14} />}
                                </div>
                            ))}
                            {visibleTags.length === 0 && (
                                <div className="text-muted-foreground text-sm">No tags found</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="content-overlay content-area pt-24">
                <div
                    ref={gridRef}
                    className="masonry-wrapper"
                    style={{ margin: '0 auto', width: '100%', maxWidth: '100%', padding: '0 20px' }}
                >
                    {/* 3. Grid (Only if tag selected) */}
                    {selectedTag && (
                        <Masonry
                            items={displayedProducts}
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

                    {!selectedTag && (
                        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                            <Search size={48} strokeWidth={1} className="mb-4 opacity-50" />
                            <p>Select a tag above to explore tools</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TagsPage;
