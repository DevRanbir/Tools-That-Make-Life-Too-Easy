import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { ProgressiveBlur } from './progressive-blur';
import { MorphingDialogTrigger } from './morphing-dialog';

export function MasonryCard({ item, imageHeight, handleMouseEnter, handleMouseLeave, disableMorph }) {
    const [isHover, setIsHover] = useState(false);

    const onEnter = (e) => {
        setIsHover(true);
        if (handleMouseEnter) handleMouseEnter(e, item);
    };

    const onLeave = (e) => {
        setIsHover(false);
        if (handleMouseLeave) handleMouseLeave(e, item);
    };

    // Calculate style for height if provided
    const imageContainerStyle = imageHeight ? { height: imageHeight } : {};

    const formatTimeAgo = (dateString) => {
        if (!dateString) return "Released recently";
        const diff = Date.now() - new Date(dateString).getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return `Released ${seconds}s ago`;
        if (hours < 1) return `Released ${minutes}m ago`;
        if (days < 1) return `Released ${hours}h ago`;
        return `Released ${days}d ago`;
    };

    const CardContent = (
            <div
                className="group relative flex h-full w-full flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:border-ring shadow-sm hover:shadow-md"
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
            >
                {/* Header Section */}
                <div className="flex w-full gap-4 mb-4">
                    {/* Text Header */}
                    <div className="flex flex-col min-w-0 flex-1 justify-between py-0.5">
                        <div className="flex flex-col gap-0.5">
                            <h3 className="truncate text-[17px] font-semibold text-foreground leading-tight">
                                {item.title || item.name}
                            </h3>
                        </div>
                    </div>
                </div>

                {/* Image Content */}
                {item.img && (
                    <div
                        className="relative w-full overflow-hidden rounded-xl bg-muted border border-border"
                        style={imageContainerStyle}
                    >
                        <img
                            src={item.img}
                            alt={item.title || item.name}
                            className="w-full h-auto object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        />

                        {/* Expand Icon - visible on image hover */}
                        {!item.onDelete && (
                            <div
                                className="absolute top-3 right-3 rounded-full bg-black/40 p-2 text-white backdrop-blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 border border-white/10"
                            >
                                <ArrowUpRight size={16} />
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-3 flex flex-col gap-3">
                    <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                        {item.description || "The identity layer for every SaaS entry point."}
                    </p>

                    {/* Chips Section */}
                    <div className="flex flex-wrap gap-1.5 max-h-[3.6rem] overflow-hidden mask-image-b">
                        {/* Fallback to default tag if no tags provided, but logic implies standardizing 'tags' */}
                        {[...new Set(item.tags || ["Identity verification"])].map((tag, i) => (
                            <div key={i} className="flex items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1 text-[10px] font-medium text-secondary-foreground border border-border hover:bg-secondary transition-colors">
                                {tag === "Identity verification" && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                                )}
                                <span>{tag}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-3 flex flex-col gap-2">
                    {/* Row 1 */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatTimeAgo(item.created_at)}</span>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-foreground font-medium">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                                <span>{item.likes ? item.likes.toLocaleString() : "0"}</span>
                            </div>
                            <div className="flex items-center gap-1 text-foreground font-medium">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                                <span>{item.views ? item.views.toLocaleString() : "0"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Row 2 */}
                    <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="text-xs text-foreground font-medium">{item.price && item.price !== 'Free' ? `${item.price}` : "Free"}</span>
                        <div className="flex items-center gap-3">
                            {/* Star */}
                            <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                <span>{item.rating || "0.0"}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Manage Delete Button */}
                {item.onDelete && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            item.onDelete(item.id);
                        }}
                        className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-xl transition-transform hover:scale-110 z-50 cursor-pointer border-2 border-card"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </div>
                )}
            </div>
        );

    if (disableMorph) {
        return (
            <div className="w-full h-full block text-left p-0 border-none bg-none">
                {CardContent}
            </div>
        );
    }

    return (
        <MorphingDialogTrigger
            style={{ width: '100%', height: '100%', padding: 0, border: 'none', background: 'none', display: 'block', textAlign: 'left' }}
            className="w-full h-full"
            onClick={() => {
                if (item.onView) item.onView(item.id);
            }}
        >
            {CardContent}
        </MorphingDialogTrigger>
    );

}
