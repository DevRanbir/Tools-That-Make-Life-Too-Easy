import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Star, StarHalf, X, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

// Custom Star Rating Component to replace missing CRating
const CustomRating = ({ value, onChange, max = 5, className, tooltips = [] }) => {
    const [hoverValue, setHoverValue] = useState(null);

    const displayValue = hoverValue !== null ? hoverValue : value;

    const handleMouseMove = (e, starValue) => {
        const { left, width } = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - left) / width;
        const newValue = percent < 0.5 ? starValue - 0.5 : starValue;
        setHoverValue(newValue);
    };

    return (
        <div className={`flex items-center ${className}`} onMouseLeave={() => setHoverValue(null)}>
            <div className="flex gap-1" style={{ position: 'relative' }}>
                {[...Array(max)].map((_, index) => {
                    const starValue = index + 1;
                    const filled = displayValue >= starValue;
                    const isHalf = displayValue >= starValue - 0.5 && displayValue < starValue;
                    const isHoverTarget = hoverValue !== null && Math.ceil(hoverValue) === starValue;

                    return (
                        <button
                            key={index}
                            type="button"
                            className="relative focus:outline-none transition-transform hover:scale-110"
                            onMouseMove={(e) => handleMouseMove(e, starValue)}
                            onClick={() => onChange(hoverValue || starValue)}
                            title={""} // Disable native tooltip since we are using custom one
                        >
                            <div className="relative w-5 h-5">
                                <Star
                                    size={20}
                                    className={`absolute inset-0 transition-colors ${filled
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'fill-transparent text-muted-foreground/40'
                                        }`}
                                    strokeWidth={filled ? 0 : 1.5}
                                />
                                {isHalf && (
                                    <div className="absolute inset-0 overflow-hidden w-1/2">
                                        <Star
                                            size={20}
                                            className="fill-yellow-400 text-yellow-400"
                                            strokeWidth={0}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Floating Tooltip */}
                            {isHoverTarget && tooltips[index] && (
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-popover border border-border text-popover-foreground text-[10px] font-medium rounded shadow-lg whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 pointer-events-none z-50">
                                    {tooltips[index]}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const RatingSystem = ({ productId, initialValue = 0, onRate, compact = false, onReset }) => {
    const [rating, setRating] = useState(initialValue);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        setRating(initialValue);
    }, [initialValue]);

    const handleRatingChange = async (newValue) => {
        setRating(newValue);
        setIsUpdating(true);

        try {
            const { error } = await supabase
                .from('products')
                .update({ rating: newValue })
                .eq('id', productId);

            if (error) throw error;

            toast.success(`Rating updated to ${newValue}`);
            if (onRate) onRate(newValue);
        } catch (error) {
            console.error('Error updating rating:', error);
            toast.error('Failed to update rating');
            setRating(initialValue);
        } finally {
            setIsUpdating(false);
        }
    };

    if (compact) {
        return (
            <div className="flex items-center gap-2 pr-4 border-r border-white/10 mr-2">
                <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                            key={star}
                            size={24}
                            className={`${rating >= star
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'fill-transparent text-muted-foreground/30'
                                }`}
                            strokeWidth={rating >= star ? 0 : 1.5}
                            onClick={() => handleRatingChange(star)}
                            style={{ cursor: 'pointer' }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between gap-6 px-6 py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 w-fit mx-auto max-w-2xl">
            <div className="flex items-center gap-4">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Rate Response</span>
                    <CustomRating
                        value={rating}
                        onChange={handleRatingChange}
                        tooltips={['Very bad', 'Bad', 'Meh', 'Good', 'Very good']}
                        className="scale-100"
                    />
                </div>
            </div>

            {onReset && (
                <>
                    <div className="h-8 w-px bg-white/10" />
                    <button
                        onClick={onReset}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-lg"
                    >
                        <RotateCcw size={16} />
                        Use Again
                    </button>
                </>
            )}

            {isUpdating && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] text-primary animate-pulse">
                    <Loader2 size={12} className="animate-spin" />
                    Updating...
                </div>
            )}
        </div>
    );
};

export default RatingSystem;
