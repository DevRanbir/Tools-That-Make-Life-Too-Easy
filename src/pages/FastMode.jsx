import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Paperclip, ArrowUp, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import { TextShimmer } from '../components/motion-primitives/text-shimmer';


const FastMode = ({ navigateOnly, user, messages, setMessages }) => {
    // messages state is now lifted to App.jsx

    const [inputValue, setInputValue] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        if (messages.length > 2) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        const userMsg = { id: Date.now(), role: 'user', content: inputValue };
        setMessages(prev => [...prev, userMsg]);
        setInputValue("");
        setIsThinking(true);

        setTimeout(() => {
            const aiMsg = {
                id: Date.now() + 1,
                role: 'ai',
                content: "I'm a demo AI response. I can't actually process requests yet, but I look good doing it!"
            };
            setMessages(prev => [...prev, aiMsg]);
            setIsThinking(false);
        }, 1000);
    };

    return (
        <div className="feed-page min-h-screen bg-background relative pb-40">
            <div className="content-overlay content-area max-w-2xl mx-auto px-4">
                <div className="sticky-nav-container mb-8 !sticky !top-12 z-50 bg-background/95 backdrop-blur-xl py-4 mt-8">
                    <MagneticMorphingNav
                        activeTab="fastmode"
                        onTabChange={(id) => navigateOnly(id)}
                        user={user}
                    />
                </div>

                <div className="chat-container space-y-6 pt-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            {msg.role === 'ai' && (
                                <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shrink-0 shadow-sm">
                                    <Sparkles size={14} className="text-yellow-400" />
                                </div>
                            )}
                            {msg.role === 'user' && user?.user_metadata?.avatar_url && (
                                <img src={user.user_metadata.avatar_url} alt="User" className="w-8 h-8 rounded-full object-cover shrink-0" />
                            )}
                            {msg.role === 'user' && !user?.user_metadata?.avatar_url && (
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                    {user ? user.email[0].toUpperCase() : 'U'}
                                </div>
                            )}

                            <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`relative px-2 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-secondary text-secondary-foreground rounded-2xl rounded-tr-sm'
                                    : 'text-muted-foreground'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50">
                <div className="relative rounded-3xl bg-card border border-border p-4 shadow-2xl">
                    {/* Top Badge */}
                    {/* Top Badge */}
                    <AnimatePresence>
                        {isThinking && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, height: 0, marginBottom: 0 }}
                                animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 16 }}
                                exit={{ opacity: 0, y: 10, height: 0, marginBottom: 0 }}
                                transition={{ duration: 0.3 }}
                                className="flex justify-between items-center px-2 overflow-hidden"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white flex items-center gap-1">Agent <Sparkles size={12} className="text-yellow-400" /></span>
                                    <TextShimmer className="text-sm font-medium">Thinking</TextShimmer>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Input */}
                    <input
                        type="text"
                        placeholder="What can I do for you?"
                        className="w-full bg-transparent text-xl text-foreground placeholder:text-muted-foreground outline-none pb-8 px-2"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />

                    {/* Bottom Controls */}
                    <div className="flex items-center justify-between px-2">
                        <button className="flex items-center gap-2 bg-secondary hover:bg-muted transition-colors rounded-full px-3 py-1.5 text-sm text-secondary-foreground border border-border">
                            <span className="font-semibold text-foreground">AI</span> Bianca Pro Model
                        </button>

                        <div className="flex items-center gap-2">
                            <button className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
                                <Paperclip size={20} />
                            </button>
                            <button
                                onClick={handleSend}
                                className={`p-2 transition-all rounded-xl border border-border ${inputValue.trim()
                                    ? 'bg-foreground text-background hover:opacity-90'
                                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                                    }`}
                            >
                                <ArrowUp size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FastMode;
