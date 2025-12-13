import React, { useState, useEffect } from 'react';
import { Bookmark, Settings } from 'lucide-react';
import { supabase } from '../supabase';

const RightSidebar = ({ user, isSettingsOpen, mode = 'full', setActivePage }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [bookmarks, setBookmarks] = useState([]);

    // Check if user is administrator
    const isAdministrator = user?.user_metadata?.role === 'administrator';

    // Mock Data for Events (You would likely fetch this via a hook or prop)
    const [ongoingEvents, setOngoingEvents] = useState([]);
    const [upcomingEvents, setUpcomingEvents] = useState([]);

    useEffect(() => {
        if (user) {
            fetchBookmarks();
            fetchEvents();

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

            // Subscribe to events changes
            const eventsSubscription = supabase
                .channel('events-changes')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'events',
                    filter: `user_id=eq.${user.id}`
                }, () => {
                    fetchEvents();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(subscription);
                supabase.removeChannel(eventsSubscription);
            };
        } else {
            setBookmarks([]);
            setOngoingEvents([]);
            setUpcomingEvents([]);
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
                // Limit to top 3 bookmarks
                const productIds = userData.bookmarks.slice(0, 3);

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

    const fetchEvents = async () => {
        try {
            if (!user?.id) return;

            const now = new Date();
            const nowISO = now.toISOString();

            // Fetch future and currently ongoing events
            // Using start_time for simple query, refinement in JS
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .order('start_time', { ascending: true });

            if (error) throw error;

            if (data) {
                const ongoing = [];
                const upcoming = [];

                data.forEach(event => {
                    const start = new Date(event.start_time);
                    const end = new Date(event.end_time);

                    if (end < now) return; // Skip past events

                    // Format Time: 9:30
                    const timeStr = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });

                    // Format Date for Upcoming
                    let dateStr = "";
                    const isToday = start.toDateString() === now.toDateString();

                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const isTomorrow = start.toDateString() === tomorrow.toDateString();

                    if (isTomorrow) {
                        dateStr = "Tomorrow";
                    } else if (isToday) {
                        dateStr = "Today";
                    } else {
                        // e.g. 13th
                        const day = start.getDate();
                        const suffix = ["th", "st", "nd", "rd"][(day % 10 > 3 || [11, 12, 13].includes(day % 100)) ? 0 : day % 10];
                        dateStr = `${day}${suffix}`;
                    }


                    const processedEvent = {
                        ...event,
                        time: timeStr,
                        date: dateStr
                    };

                    if (start <= now && end > now) {
                        processedEvent.type = 'ongoing';
                        ongoing.push(processedEvent);
                    } else if (start > now) {
                        processedEvent.type = 'upcoming';
                        // Only take top 3 upcoming
                        if (upcoming.length < 3) upcoming.push(processedEvent);
                    }
                });

                setOngoingEvents(ongoing);
                setUpcomingEvents(upcoming);
            }

        } catch (error) {
            console.error('Error fetching events:', error);
        }
    };

    const handleMouseEnter = () => {
        if (user) setIsExpanded(true);
    };

    const handleMouseLeave = () => {
        setIsExpanded(false);
    };

    const isVisible = user && mode !== 'hidden' && (
        (mode === 'full' && (bookmarks.length > 0 || ongoingEvents.length > 0 || upcomingEvents.length > 0 || isAdministrator)) ||
        (mode === 'saved' && (bookmarks.length > 0 || isAdministrator)) ||
        (mode === 'events' && (ongoingEvents.length > 0 || upcomingEvents.length > 0 || isAdministrator))
    );

    // Inline styles to mirror the left sidebar without touching index.css
    const sidebarStyle = {
        width: isExpanded ? 'fit-content' : '65px', // Dynamic width
        minWidth: '65px',
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
            {/* ADMIN SECTION */}
            {isAdministrator && (
                <>
                    <div className={`w-full flex flex-col mb-[2px] transition-all duration-300 items-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''}`}>
                        <span className={`text-[10px] font-bold tracking-wider text-right transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-60'}`}>
                            ADMIN
                        </span>
                    </div>

                    <div className="flex flex-col gap-[2px] w-full mb-4">
                        <div
                            className={`group w-full h-[48px] flex items-center justify-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''} text-muted-foreground cursor-pointer relative transition-all duration-200 hover:text-foreground hover:opacity-100 opacity-60`}
                            onClick={() => setActivePage('manage')}
                        >
                            <span
                                className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-all duration-300 ease-in-out ${isExpanded ? 'opacity-100 max-w-[200px] pointer-events-auto' : 'opacity-0 max-w-0 pointer-events-none'}`}
                            >
                                Manage Page
                            </span>

                            <div className="min-w-[40px] w-[40px] h-[40px] flex items-center justify-center rounded-xl overflow-hidden bg-background border border-border group-hover:scale-105 transition-transform duration-200 shadow-sm">
                                <Settings size={20} />
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* EVENTS SECTION */}
            {user && (mode === 'full' || mode === 'events') && (ongoingEvents.length > 0 || upcomingEvents.length > 0) && (
                <>
                    <div className={`w-full flex flex-col mb-[2px] transition-all duration-300 items-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''}`}>
                        <span className={`text-[10px] font-bold tracking-wider text-right transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-60'}`}>
                            EVENTS
                        </span>
                    </div>

                    <div className="flex flex-col gap-[2px] w-full mb-4">
                        {ongoingEvents.map((event, index) => (
                            <EventItem
                                key={`ongoing-${index}`}
                                title={event.title}
                                time={event.time}
                                date={event.date}
                                isExpanded={isExpanded}
                                type={event.type}
                            />
                        ))}
                        {upcomingEvents.map((event, index) => (
                            <EventItem
                                key={`upcoming-${index}`}
                                title={event.title}
                                time={event.time}
                                date={event.date}
                                isExpanded={isExpanded}
                                type={event.type}
                            />
                        ))}
                    </div>
                </>
            )}

            {(mode === 'full' || mode === 'saved') && (
                <>
                    <div className={`w-full flex flex-col mb-[2px] transition-all duration-300 items-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''}`}>
                        <span className={`text-[10px] font-bold tracking-wider text-right transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-60'}`}>
                            STORED
                        </span>

                        {/* Reduced visual spacer */}
                        <div className="mt-0 h-1 w-8"></div>
                    </div>

                    <div
                        className="flex flex-col gap-1 w-full mt-1 overflow-y-auto max-h-[calc(100vh-250px)]"
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
                                        className={`group w-full h-[48px] flex items-center justify-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''} text-muted-foreground cursor-pointer relative transition-all duration-200 hover:text-foreground hover:opacity-100 opacity-60`}
                                        onClick={() => { }}
                                    >
                                        <span
                                            className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-all duration-300 ease-in-out ${isExpanded ? 'opacity-100 max-w-[200px] pointer-events-auto' : 'opacity-0 max-w-0 pointer-events-none'}`}
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

                                <div className={`group w-full h-[48px] flex items-center justify-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''} text-muted-foreground cursor-default opacity-50`}>
                                    <span
                                        className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-all duration-300 ease-in-out ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}
                                    >
                                        No bookmarks
                                    </span>
                                    <div className="min-w-[40px] w-[40px] flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                        <Bookmark size={28} />
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className={`group w-full h-[48px] flex items-center justify-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''} text-muted-foreground cursor-default opacity-50`}>
                                <span
                                    className={`text-sm font-medium whitespace-nowrap overflow-hidden mr-3 transition-all duration-300 ease-in-out ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}
                                >
                                    Login to view
                                </span>
                                <div className="min-w-[40px] w-[40px] flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                                    <Bookmark size={28} />
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const EventItem = ({ title, time, date, isExpanded, type }) => {
    const primaryLabel = type === 'ongoing' ? time : date;

    // Logic for what to show inside the circle icon
    let iconContent = "?";
    if (type === 'ongoing') {
        // Show time (e.g., "9:30")
        iconContent = time;
    } else {
        // Show date number or short form
        if (date === 'Tomorrow') iconContent = 'Tm';
        else if (date) {
            // Extract number if possible, e.g. "13th" -> "13"
            const match = date.match(/\d+/);
            iconContent = match ? match[0] : date.substring(0, 2);
        }
    }

    return (
        <div
            className={`group w-full h-[48px] flex items-center justify-end pr-[10px] ${isExpanded ? 'pl-[20px]' : ''} text-muted-foreground cursor-pointer relative transition-all duration-200 hover:text-foreground hover:opacity-100 opacity-60`}
        >
            <div
                className={`flex flex-col items-end justify-end mr-3 transition-all duration-300 ease-in-out ${isExpanded ? 'opacity-100 max-w-[200px] pointer-events-auto' : 'opacity-0 max-w-0 pointer-events-none'}`}
            >

                {/* Show Title when expanded */}
                <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                    {title}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                    {type}
                </span>
            </div>



            <div className="min-w-[40px] w-[40px] h-[40px] flex items-center justify-center rounded-xl overflow-hidden bg-background border border-border group-hover:scale-105 transition-transform duration-200 shadow-sm">
                <span className="text-[10px] font-bold text-muted-foreground select-none">
                    {iconContent}
                </span>
            </div>
        </div >
    );
};

export default RightSidebar;
