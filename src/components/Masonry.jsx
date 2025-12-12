
import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Bookmark, ArrowUpRight } from 'lucide-react';
import { MasonryCard } from './MasonryCard';
import {
    MorphingDialog,
    MorphingDialogContent,
    MorphingDialogTitle,
    MorphingDialogImage,
    MorphingDialogSubtitle,
    MorphingDialogClose,
    MorphingDialogDescription,
    MorphingDialogContainer,
} from './morphing-dialog';

import './Masonry.css';

const Masonry = ({
    items,
    onBookmark,
    user,
    ease = 'power3.out',
    duration = 0.6,
    stagger = 0.05,
    animateFrom = 'bottom',
    scaleOnHover = true,
    hoverScale = 0.95,
    blurToFocus = true,
    colorShiftOnHover = false
}) => {
    const containerRef = useRef(null);
    const hasMounted = useRef(false);

    useLayoutEffect(() => {
        if (!items.length) return;

        const elements = containerRef.current.querySelectorAll('.item-wrapper');

        if (!hasMounted.current) {
            gsap.fromTo(elements,
                {
                    opacity: 0,
                    y: 100,
                    ...(blurToFocus && { filter: 'blur(10px)' })
                },
                {
                    opacity: 1,
                    y: 0,
                    ...(blurToFocus && { filter: 'blur(0px)' }),
                    duration: 0.8,
                    ease: 'power3.out',
                    stagger: stagger
                }
            );
            hasMounted.current = true;
        }
    }, [items, stagger, blurToFocus]);

    const handleMouseEnter = (e, item) => {
        const element = e.currentTarget;
        if (scaleOnHover) {
            gsap.to(element, {
                scale: hoverScale,
                duration: 0.3,
                ease: 'power2.out'
            });
        }
    };

    const handleMouseLeave = (e, item) => {
        const element = e.currentTarget;
        if (scaleOnHover) {
            gsap.to(element, {
                scale: 1,
                duration: 0.3,
                ease: 'power2.out'
            });
        }
    };

    return (
        <div ref={containerRef} className="list">
            {items.map(item => {
                return (
                    <MorphingDialog
                        key={item.id}
                        transition={{
                            type: 'spring',
                            bounce: 0.05,
                            duration: 0.25,
                        }}
                    >
                        <div
                            data-key={item.id}
                            className="item-wrapper"
                            onMouseEnter={e => handleMouseEnter(e, item)}
                            onMouseLeave={e => handleMouseLeave(e, item)}
                        >
                            <MasonryCard
                                item={item}
                                // imageHeight is removed to let content dictate height
                                handleMouseEnter={handleMouseEnter}
                                handleMouseLeave={handleMouseLeave}
                            />
                        </div>

                        <MorphingDialogContainer>
                            <MorphingDialogContent
                                style={{ borderRadius: '24px' }}
                                className='pointer-events-auto relative flex h-auto max-h-[90vh] flex-col overflow-hidden border border-border bg-card w-[90vw] max-w-[1100px] shadow-2xl'
                            >
                                {/* Header Section */}
                                <div className="flex items-start justify-between p-8 pb-6 border-b border-border/50">
                                    <div className="flex gap-5">
                                        <div className="flex flex-col gap-1">
                                            <MorphingDialogTitle className='text-3xl font-bold text-foreground tracking-tight'>
                                                {item.title || item.name}
                                            </MorphingDialogTitle>
                                            <div className='text-muted-foreground font-medium'>
                                                Configure your tool settings and start using
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onBookmark && onBookmark(item.id);
                                            }}
                                            className={`transition-colors p-2 rounded-full ${item.isBookmarked ? 'text-yellow-500' : 'text-muted-foreground hover:text-foreground'}`}
                                            title={item.isBookmarked ? "Remove Bookmark" : "Bookmark"}
                                        >
                                            <Bookmark size={20} fill={item.isBookmarked ? "currentColor" : "none"} />
                                        </button>
                                        <MorphingDialogClose className='static text-muted-foreground hover:text-foreground transition-colors font-medium text-sm px-2'>
                                            Close
                                        </MorphingDialogClose>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto p-8 pt-6 pb-32 space-y-6 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                    {/* Image Section (Reordered to top) */}
                                    {item.img && (
                                        <div className="relative w-full min-h-[200px] rounded-2xl overflow-hidden border border-border bg-muted/20 flex-shrink-0">
                                            <MorphingDialogImage
                                                src={item.img}
                                                alt={item.title || item.name}
                                                className='w-full h-auto'
                                            />
                                        </div>
                                    )}

                                    {/* About Section */}
                                    <div className="bg-muted/30 border border-border/60 min-h-[200px] rounded-3xl p-6">
                                        <div className="flex items-center gap-2 mb-4 text-primary font-semibold text-sm uppercase tracking-wider">
                                            About {item.title || item.name}
                                        </div>
                                        <MorphingDialogDescription
                                            disableLayoutAnimation
                                            variants={{
                                                initial: { opacity: 0, y: 10 },
                                                animate: { opacity: 1, y: 0 },
                                                exit: { opacity: 0, y: 10 },
                                            }}
                                        >
                                            <p className='text-muted-foreground leading-relaxed text-[15px] whitespace-normal break-words'>
                                                {item.description || "Solve themed crossword grids by filling in words based on given clues. This game strengthens vocabulary, spelling, and logical thinking as you complete each interconnected puzzle."}
                                            </p>
                                        </MorphingDialogDescription>

                                        {/* Tags */}
                                        <div className="flex flex-wrap gap-2 mt-6">
                                            {[...new Set(item.tags || ["Productivity", "AI Tool", "Utility"])].map((tag, i) => (
                                                <span key={i} className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium border border-border/50">
                                                    {tag}
                                                </span>
                                            ))}
                                            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground font-mono">
                                                <div className="flex items-center gap-1.5">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                    {item.views || 0}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                                                    {item.saves || 0}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sticky Bottom Dock */}
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-card border-t border-x border-border rounded-t-2xl px-12 py-5 pb-5 z-20 flex items-center justify-center shadow-2xl">
                                    <button className="bg-secondary border border-border hover:bg-muted text-foreground shadow-lg px-8 py-2.5 rounded-full font-semibold transition-all flex items-center gap-2 text-sm">
                                        {item.price && item.price !== 'Free' ? (
                                            <>
                                                Use {item.price} <ArrowUpRight size={16} />
                                            </>
                                        ) : (
                                            <>
                                                Open Tool <ArrowUpRight size={16} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </MorphingDialogContent>
                        </MorphingDialogContainer>
                    </MorphingDialog>
                );
            })}
        </div>
    );
};

export default Masonry;
