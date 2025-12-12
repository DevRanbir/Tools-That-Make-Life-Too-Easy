import React, { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { supabase } from '../supabase';

const RightSidebar = ({ user, isSettingsOpen }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [bookmarks, setBookmarks] = useState([]);

    useEffect(() => {
        if (user) {
            fetchBookmarks();

            // Subscribe to real-time changes
            const subscription = supabase
                .channel('user-details-changes')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'user_details',
                    filter: `id=eq.${user.id}`
                }, (payload) => {
                    fetchBookmarks();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(subscription);
            };
        } else {
            setBookmarks([]);
        }
    }, [user]);

    const fetchBookmarks = async () => {
        try {
            if (!user?.id) return;

            // Step 1: Get the product IDs from user_details
            const { data: userData, error: userError } = await supabase
                .from('user_details')
                .select('bookmarks')
                .eq('id', user.id)
                .single();

            if (userError && userError.code !== 'PGRST116') throw userError;

            if (userData && userData.bookmarks && userData.bookmarks.length > 0) {
                // Limit to top 8 bookmarks
                const productIds = userData.bookmarks.slice(0, 8);

                // Step 2: Get the product details
                // Using select('*') to avoid guessing column names like 'name' vs 'title'
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('*')
                    .in('id', productIds);

                if (productsError) throw productsError;

                if (productsData) {
                    setBookmarks(productsData);
                }
            } else {
                setBookmarks([]);
            }
        } catch (error) {
            console.error('Error fetching bookmarks:', error);
        }
    };

    const handleMouseEnter = () => {
        if (user) setIsExpanded(true);
    };

    const handleMouseLeave = () => {
        setIsExpanded(false);
    };

    const isVisible = user && bookmarks.length > 0;

    // Inline styles to mirror the left sidebar without touching index.css
    const sidebarStyle = {
        width: isExpanded ? 'fit-content' : '60px', // Dynamic width
        minWidth: '60px',
        maxWidth: '400px',
        height: 'auto',
        minHeight: 'fit-content',
        position: 'fixed',
        right: 0,
        top: '40%',
        transform: isVisible ? 'translate(0, -50%)' : 'translate(150%, -50%)', // Slide in/out
        border: '1px solid var(--border)',
        borderRight: 'none',
        borderRadius: '16px 0 0 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end', // Aligns children to the right side
        padding: '1.5rem 0 1rem 0', // Reduced bottom padding
        gap: '0.5rem',
        backgroundColor: 'var(--card)',
        zIndex: 100,
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)', // Smooth slide with slight bounce
        overflowX: 'hidden',
        boxShadow: '-4px 0 24px -4px rgba(0, 0, 0, 0.2)',
        opacity: isVisible ? 1 : 0,
        filter: isSettingsOpen ? 'blur(4px)' : 'none', // Blur when settings open
        pointerEvents: isSettingsOpen ? 'none' : 'auto', // Disable clicks
    };

    return (
        <div
            style={sidebarStyle}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className={`w-full flex flex-col items-end pr-[14px] mb-[4px] transition-all duration-200 ${isExpanded ? 'pr-[20px] pl-[20px]' : ''}`}>
                <span className={`text-[10px] font-bold tracking-wider transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-60'}`}>
                    SAVED
                </span>

                {/* Reduced visual spacer */}
                <div className="mt-1 h-2 w-8"></div>
            </div>

            <div
                className="flex flex-col gap-2 w-full mt-2 overflow-y-auto max-h-[calc(100vh-250px)]"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                <style>
                    {`
                        .no-scrollbar::-webkit-scrollbar {
                            display: none;
                        }
                    `}
                </style>
                {user ? (
                    bookmarks.length > 0 ? (
                        bookmarks.map((product) => (
                            <div
                                key={product.id}
                                className={`group w-full h-[56px] flex items-center justify-end pr-[10px] text-muted-foreground cursor-pointer relative transition-all duration-200 hover:text-foreground hover:opacity-100 opacity-60 ${isExpanded ? 'pr-[20px] pl-[20px]' : ''}`}
                                onClick={() => { }}
                            >
                                <span
                                    className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-all duration-200 pointer-events-none ${isExpanded ? 'opacity-100 w-auto pointer-events-auto' : 'opacity-0 w-0'}`}
                                >
                                    {product.title || product.name}
                                </span>

                                <div className="min-w-[40px] w-[40px] h-[40px] flex items-center justify-center rounded-xl overflow-hidden bg-background border border-border group-hover:scale-105 transition-transform duration-200 shadow-sm">
                                    {(product.image || product.img) ? (
                                        <img src={product.image || product.img} alt={product.title || product.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-lg font-bold text-muted-foreground select-none">
                                            {(product.title || product.name || '?').charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className={`group w-full h-[56px] flex items-center justify-end pr-[10px] text-muted-foreground cursor-default opacity-50`}>
                            <span
                                className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 w-0'}`}
                            >
                                No bookmarks
                            </span>
                            <div className="min-w-[40px] w-[40px] flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                <Bookmark size={28} />
                            </div>
                        </div>
                    )
                ) : (
                    <div className={`group w-full h-[56px] flex items-center justify-end pr-[10px] text-muted-foreground cursor-default opacity-50`}>
                        <span
                            className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 w-0'}`}
                        >
                            Login to view
                        </span>
                        <div className="min-w-[40px] w-[40px] flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                            <Bookmark size={28} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RightSidebar;
