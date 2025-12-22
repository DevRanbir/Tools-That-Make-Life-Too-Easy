
import React from 'react';
import { TrendingUp, Search } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { supabase } from '../supabase';
import { logTransaction, updateCreditsWithLog } from '../utils/logTransaction';
import { toast } from 'sonner';

gsap.registerPlugin(ScrollTrigger);
import CongustedPricing from '../components/mvpblocks/congusted-pricing';

const ShopPage = ({ navigateOnly, user, sortPreference }) => {
    const gridRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [filteredProducts, setFilteredProducts] = useState([]); // Store filtered results
    const [totalTools, setTotalTools] = useState(0);
    const viewedIds = useRef(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const [userDetails, setUserDetails] = useState(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [pendingUpgradePlan, setPendingUpgradePlan] = useState(null);

    useEffect(() => {
        // Handle hash-based search on mount and hash change
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash) {
                const content = decodeURIComponent(hash.substring(1)); // Remove the '#'
                if (content.startsWith('tab=')) {
                    const tabId = content.split('=')[1];
                    if (tabId) setActiveTab(tabId);
                    setSearchQuery(''); // Clear search if we are navigating to a tab
                } else {
                    setSearchQuery(content);
                }
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

                const paidToolsCount = productsData.filter(p =>
                    p.price &&
                    p.price.toLowerCase() !== 'free' &&
                    p.price !== '0'
                ).length;
                setTotalTools(paidToolsCount);

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
    // Fetch user details including bookmarks and credits
    useEffect(() => {
        const fetchUserDetails = async () => {
            if (!user) return;
            const { data } = await supabase
                .from('user_details')
                .select('bookmarks, role, credits')
                .eq('id', user.id)
                .maybeSingle();

            if (data) {
                // Check for credit limit overflow immediately
                const currentCredits = Number(data.credits || 0);
                const userRole = (data.role || 'freebiee').toLowerCase();
                let roleLimit = 5;
                if (userRole === 'common') roleLimit = 20;
                if (userRole === 'wealthy' || userRole === 'newuser') roleLimit = 50;
                if (userRole === 'administrator') roleLimit = 100;

                const maxAllowed = roleLimit + 10;

                if (currentCredits > maxAllowed) {
                    toast.error(`Credit limit exceeded! Adjusting your balance to the limit of ${maxAllowed}.`);

                    // CRITICAL: Update credits AND logs in the same query to trigger the database trigger
                    const description = `Credit limit adjustment (Role: ${userRole})`;
                    await updateCreditsWithLog(user.id, maxAllowed, maxAllowed - currentCredits, description);

                    // Update local state to the limit
                    data.credits = maxAllowed;
                }

                setUserDetails(data);
                if (data.bookmarks) {
                    const bSet = new Set(data.bookmarks);
                    setProducts(prev => prev.map(p => ({ ...p, isBookmarked: bSet.has(p.id) })));
                }
            }
        };
        if (products.length > 0) fetchUserDetails();
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

    const handlePlanSelect = async (plan) => {
        if (!user) {
            toast.error("Please log in to upgrade your role.");
            return;
        }

        if (activeTab === 'buy_roles') {
            let role = 'freebiee';
            let credits = 0;

            if (plan.name === 'Common') {
                role = 'common';
                credits = 20;
            } else if (plan.name === 'Wealthy') {
                role = 'wealthy';
                credits = 50;
            } else if (plan.name === 'Administrator' || plan.href?.startsWith('mailto:')) {
                if (plan.href) window.location.href = plan.href;
                else toast.info("Please contact support to become an Administrator.");
                return;
            }

            // Warning about credit loss needs confirmation
            setPendingUpgradePlan(plan);
            setShowUpgradeModal(true);
        } else {
            // BUY CREDITS LOGIC
            if (!userDetails) {
                toast.error("Could not verify user details. Please try again.");
                return;
            }

            const purchaseAmount = plan.creditValue;
            const currentCredits = Number(userDetails.credits || 0);
            const userRole = (userDetails.role || 'freebiee').toLowerCase();

            let roleLimit = 5; // Freebie default
            if (userRole === 'common') roleLimit = 20;
            if (userRole === 'wealthy' || userRole === 'newuser') roleLimit = 50;
            if (userRole === 'administrator') roleLimit = 100;

            const maxAllowed = roleLimit + 10;

            if (currentCredits + purchaseAmount > maxAllowed) {
                toast.error(`Credit limit exceeded! You cannot hold more than ${maxAllowed} credits on your current plan.`);
                return;
            }

            const loadingToast = toast.loading(`Purchasing ${purchaseAmount} credits...`);
            try {
                const { error } = await supabase.rpc('increment_credits', { amount: purchaseAmount, user_id: user.id });

                if (error) throw error;

                // Refresh
                const { data: newData } = await supabase.from('user_details').select('*').eq('id', user.id).maybeSingle();
                if (newData) {
                    setUserDetails(newData);
                    // Log purchase with new balance
                    await logTransaction(
                        user.id,
                        purchaseAmount,
                        'credit',
                        `Purchased ${purchaseAmount} credits`,
                        newData.credits
                    );
                }

                toast.dismiss(loadingToast);
                // toast.success handled by logTransaction
            } catch (err) {
                console.error('Error purchasing credits:', err);
                toast.dismiss(loadingToast);
                toast.error("Purchase failed.");
            }
        }
    };

    const executeRoleUpgrade = async () => {
        const plan = pendingUpgradePlan;
        if (!plan || !user) return;

        setShowUpgradeModal(false); // Close immediately or wait? Better close first.

        let role = 'freebiee';
        let credits = 0;

        if (plan.name === 'Common') {
            role = 'common';
            credits = 20;
        } else if (plan.name === 'Wealthy') {
            role = 'wealthy';
            credits = 50;
        }

        const loadingToast = toast.loading(`Upgrading to ${plan.name}...`);

        try {
            // First, update role
            const { error: roleError } = await supabase
                .from('user_details')
                .update({ role: role })
                .eq('id', user.id);

            if (roleError) throw roleError;

            // Then update credits and logs atomically using the database function
            const { error: creditsError } = await supabase.rpc('update_credits_with_log', {
                user_id: user.id,
                new_credits: credits,
                credits_spent: credits,
                log_type: 'credit',
                log_description: `Credit reset to ${credits} (Role Upgrade: ${plan.name})`
            });

            if (creditsError) throw creditsError;

            // Show success toast
            toast.success(`Credited ${credits} Credits`, {
                description: `Credit reset to ${credits} (Role Upgrade: ${plan.name})`
            });

            // Refresh user details
            const { data: newData } = await supabase.from('user_details').select('*').eq('id', user.id).maybeSingle();
            if (newData) setUserDetails(newData);

            toast.dismiss(loadingToast);
            // toast.success handled by logTransaction
        } catch (error) {
            console.error('Error upgrading role:', error);
            toast.dismiss(loadingToast);
            toast.error("Failed to upgrade role. Please try again.");
        } finally {
            setPendingUpgradePlan(null);
        }
    };

    const [activeTab, setActiveTab] = useState('buy_roles');

    const shopTabs = [
        { id: 'buy_roles', label: 'Buy Roles' },
        { id: 'buy_credits', label: 'Buy Credits' }
    ];

    const rolePlans = [
        {
            name: "Common",
            price: "40",
            yearlyPrice: "38",
            period: "per month",
            features: [
                "Role Badge: Common",
                "20 Monthly Credits",
                "Basic Support",
                "Access to Standard Tools"
            ],
            description: "A great start for regular users.",
            buttonText: "Upgrade to Common",
            href: "#",
            isPopular: false,
            currency: "INR"
        },
        {
            name: "Wealthy",
            price: "99",
            yearlyPrice: "94",
            period: "per month",
            features: [
                "Role Badge: Wealthy",
                "50 Monthly Credits",
                "Priority Support",
                "Access to Premium Tools",
                "Early Access to New Features"
            ],
            description: "For power users who need more.",
            buttonText: "Upgrade to Wealthy",
            href: "#",
            isPopular: true,
            currency: "INR"
        },
        {
            name: "Administrator",
            price: "Custom",
            yearlyPrice: "Custom",
            period: "contact only",
            features: [
                "Role Badge: Administrator",
                "Infinite Credits",
                "Dedicated Support",
                "All Tools Unlocked",
                "Admin Dashboard Access"
            ],
            description: "Complete control and maximum power.",
            buttonText: "Contact Us",
            href: "mailto:support@toolsthatmakelifetooeasy.com",
            isPopular: false,
        },
    ];

    const creditPlans = [
        {
            name: "1 Credit",
            price: "2",
            yearlyPrice: "2",
            period: "one-time",
            features: [
                "1 Credit",
                "Instant Delivery"
            ],
            description: "Quick top-up.",
            buttonText: "Buy 1 Credit",
            href: "#",
            isPopular: false,
            creditValue: 1,
            currency: "INR"
        },
        {
            name: "5 Credits",
            price: "8",
            yearlyPrice: "8",
            period: "one-time",
            features: [
                "5 Credits",
                "Instant Delivery"
            ],
            description: "Small bundle.",
            buttonText: "Buy 5 Credits",
            href: "#",
            isPopular: true,
            creditValue: 5,
            currency: "INR"
        },
        {
            name: "10 Credits",
            price: "19",
            yearlyPrice: "19",
            period: "one-time",
            features: [
                "10 Credits",
                "Instant Delivery"
            ],
            description: "Best value pack.",
            buttonText: "Buy 10 Credits",
            href: "#",
            isPopular: false,
            creditValue: 10,
            currency: "INR"
        },
    ];

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
                        <div className="hero-footer-text">#Start exploring to get a plan made just for you.</div>
                    </div>
                </div>
            </div>


            <div className="content-overlay content-area pt-24">
                <div className="mb-20">
                    <div className="flex justify-center mb-8">
                        <MagneticMorphingNav
                            tabs={shopTabs}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                        />
                    </div>

                    {activeTab === 'buy_roles' && (
                        <CongustedPricing
                            title="Upgrade Your Role"
                            description="Unlock more monthly credits and exclusive features."
                            plans={rolePlans}
                            onPlanSelect={handlePlanSelect}
                        />
                    )}

                    {activeTab === 'buy_credits' && (
                        <CongustedPricing
                            title="Top Up Credits"
                            description="Need more power? Buy credits that never expire."
                            plans={creditPlans}
                            showToggle={false}
                            onPlanSelect={handlePlanSelect}
                        />
                    )}
                </div>

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

            {/* Custom Confirmation Modal */}
            {showUpgradeModal && pendingUpgradePlan && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-all"
                        onClick={() => setShowUpgradeModal(false)}
                    />

                    {/* Modal Content */}
                    <div className="relative z-[101] w-full max-w-md overflow-hidden rounded-xl border bg-card p-0 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-xl font-semibold leading-none tracking-tight mb-2">Confirm Upgrade</h3>
                            <p className="text-sm text-muted-foreground mb-6">
                                Warning: Upgrading to <span className="font-bold text-primary">{pendingUpgradePlan.name}</span> will reset your current billing cycle.
                                <br /><br />
                                Any remaining credits will be replaced by the new plan's allocation immediately.
                            </p>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowUpgradeModal(false)}
                                    className="px-4 py-2 rounded-md hover:bg-muted text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeRoleUpgrade}
                                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
                                >
                                    Confirm Upgrade
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShopPage;
