import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { gsap } from 'gsap';
import { createPortal } from 'react-dom';
import { Bookmark, ArrowUpRight, Loader2, Send, Sparkles, X, User, ArrowUp, CheckCheck, Copy, Trash2, RotateCcw, Paperclip, Download, LogIn, FileText, Mail, Eye, AlertCircle, Check } from 'lucide-react';
import { MasonryCard } from './MasonryCard';
import { supabase } from '../supabase';
import { logTransaction, updateCreditsWithLog } from '../utils/logTransaction';
import { apiCache } from '../utils/apiCache';
import SmoothDrawer from './SmoothDrawer';
import { Drawer } from 'vaul';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import FlowchartRenderer from './FlowchartRenderer';
import ResultDrawer from './ResultDrawer';

import './Masonry.css';
import RatingSystem from './RatingSystem';

// Custom Image Renderer with Loading State
const ImageRenderer = ({ node, onClick, ...props }) => {
    const [isLoading, setIsLoading] = useState(true);

    return (
        <div
            onClick={() => onClick && onClick()}
            className={`relative group rounded-xl overflow-hidden my-4 border border-border/50 shadow-sm transition-all hover:shadow-md min-h-[200px] bg-muted/5 ${onClick ? 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]' : ''}`}
        >
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10">
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                            <Sparkles size={12} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground animate-pulse">Generating visual...</span>
                    </div>
                </div>
            )}
            <img
                {...props}
                className={`w-full h-auto transition-all duration-500 ${isLoading ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}`}
                onLoad={() => setIsLoading(false)}
                onError={() => setIsLoading(false)} // Handle error as loaded to stop spinner
            />
            {!isLoading && (
                <button
                    onClick={async (e) => {
                        e.stopPropagation();
                        try {
                            const response = await fetch(props.src);
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `generated-image-${Date.now()}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                        } catch (error) {
                            console.error('Download failed:', error);
                            window.open(props.src, '_blank');
                        }
                    }}
                    className="absolute top-3 right-3 p-2.5 bg-black/50 hover:bg-black/70 text-white rounded-xl opacity-0 translate-y-2 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-md shadow-lg border border-white/10 z-20"
                    title="Download Image"
                >
                    <Download size={18} />
                </button>
            )}
        </div>
    );
};

const PresentationCard = ({ data, onOpen }) => {
    const { topic, slides, template, pptx_url, filename } = data;
    const downloadUrl = pptx_url?.startsWith('http') ? pptx_url : `http://20.197.35.140:5001${pptx_url}`;

    const handleDownload = (e) => {
        e?.stopPropagation();
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename || 'presentation.pptx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div
            onClick={() => onOpen && onOpen(downloadUrl, 'ppt', topic || 'Presentation')}
            className="group relative w-full max-w-sm mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-0 shadow-lg backdrop-blur-md transition-all hover:bg-white/10 hover:shadow-xl cursor-pointer"
        >

            <div className="p-4 flex items-center gap-1">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-inner">
                    <FileText size={24} className="drop-shadow-sm" />
                </div>

                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-foreground" title={topic || 'PowerPoint Presentation'}>
                        {topic || 'PowerPoint Presentation'}
                    </h4>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <ArrowUpRight size={12} /> {slides || 8} Slides
                        </span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span className="capitalize">{template || 'Modern'}</span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="group/btn flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                        title="Download"
                    >
                        <Download size={16} />
                    </button>
                </div>
            </div>

            {/* Hover Effect Light */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-orange-500/0 via-white/5 to-orange-500/0 opacity-0 transition-opacity group-hover:opacity-100 blur-xl" />
        </div>
    );
};

const DocumentCard = ({ data, onOpen }) => {
    const { topic, length, document_type, file_path, filename } = data;
    // Ensure we have a valid URL or at least prevent broken links, if file_path exists
    const downloadUrl = file_path ? (file_path.startsWith('http') ? file_path : `http://20.197.35.140:5001${file_path}`) : null;

    const handleDownload = (e) => {
        e?.stopPropagation();

        if (downloadUrl) {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filename || 'document.md';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (data.document) {
            // Create blob from content if no URL
            const blob = new Blob([data.document], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename || 'research_report.md';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    const handleOpen = () => {
        if (!onOpen) return;
        let content = data.document || downloadUrl;
        // Clean markdown fences if it's text content to ensure it renders as Markdown, not a code block
        if (data.document && typeof data.document === 'string') {
            content = data.document
                .replace(/^```markdown\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();
        }
        onOpen(content, 'markdown', topic || 'Document');
    };

    return (
        <div
            onClick={handleOpen}
            className="group relative w-full max-w-sm mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-0 shadow-lg backdrop-blur-md transition-all hover:bg-white/10 hover:shadow-xl cursor-pointer"
        >
            <div className="p-4 flex items-center gap-1">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-inner">
                    <FileText size={24} className="drop-shadow-sm" />
                </div>

                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-foreground" title={topic || 'Generated Document'}>
                        {topic || 'Generated Document'}
                    </h4>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 capitalize">
                            {document_type || 'Document'}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span className="flex items-center gap-1">
                            {length ? `${length} words` : 'Markdown'}
                        </span>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="group/btn flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                        title="Download"
                    >
                        <Download size={16} />
                    </button>
                </div>
            </div>

            {/* Hover Effect Light */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-500/0 via-white/5 to-blue-500/0 opacity-0 transition-opacity group-hover:opacity-100 blur-xl" />
        </div>
    );
};
const EmailCard = ({ data, onOpen, onSend, sendingStatus }) => {
    const { to, subject, body } = data;

    return (
        <div className="w-full max-w-sm border border-border rounded-xl bg-card hover:bg-secondary/20 transition-all duration-200 p-4 flex flex-col gap-3 shadow-sm group mt-2">
            <div className="flex items-start gap-3">
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-lg shrink-0 mt-0.5">
                    <Mail size={18} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium text-sm text-foreground">Email Draft</h4>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                        {subject || 'No Subject'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 truncate">
                        To: {to || 'Unknown Recipient'}
                    </p>
                </div>
            </div>
            <div className="flex gap-2 mt-1">
                <button
                    onClick={() => onOpen(data, 'email', subject || 'Email Draft')}
                    className="flex-1 py-2 bg-background border border-border hover:bg-secondary hover:border-secondary-foreground/20 text-foreground rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                    <Eye size={13} className="text-muted-foreground" />
                    Review
                </button>
                <button
                    onClick={onSend}
                    disabled={sendingStatus?.status === 'sending' || sendingStatus?.status === 'success'}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 shadow-sm border ${sendingStatus?.status === 'success'
                        ? 'bg-green-600 text-white border-green-600'
                        : sendingStatus?.status === 'error'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                        }`}
                >
                    {sendingStatus?.status === 'sending' ? (
                        <>
                            <Loader2 size={13} className="animate-spin" />
                            Sending...
                        </>
                    ) : sendingStatus?.status === 'success' ? (
                        <>
                            <Check size={13} />
                            Sent!
                        </>
                    ) : sendingStatus?.status === 'error' ? (
                        <>
                            <AlertCircle size={13} />
                            Error
                        </>
                    ) : (
                        <>
                            <Send size={13} />
                            Send directly
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

const AGENT_MAPPINGS = [
    { keys: ['email'], suggestions: ["Clean my inbox and show me only the important unread emails.", "Draft a quick reply to this email and keep the tone polite.", "Summarize my last 10 emails and highlight pending follow-ups.", "Rewrite this email to sound more professional but still friendly."] },
    { keys: ['call'], suggestions: ["Schedule a quick call with my team tomorrow evening.", "Join this call and pull out the key discussion points.", "Auto-respond to calls for the next 3 hours—I’m studying.", "Convert this call recording into tasks and action items."] },
    { keys: ['meeting'], suggestions: ["Turn this meeting recording into clean notes with action items.", "Summarize the group discussion into decisions + next steps.", "Highlight deadlines mentioned in this meeting.", "Extract only the task assignments from this conversation."] },
    { keys: ['response checker', 'mail response'], suggestions: ["Review this email and tell me what they want exactly.", "Extract the questions from this message and draft a reply.", "Tell me if this email needs a follow-up or I can ignore it.", "Rewrite a clear professional response for this email."] },
    { keys: ['whatsapp'], suggestions: ["Send a quick update to my group about my schedule.", "Auto-reply to WhatsApp messages for 2 hours—I’m in class.", "Summarize all unread WhatsApp chats since morning.", "Draft a polite reminder message for my project group."] },
    { keys: ['task board'], suggestions: ["Sync all my tasks from notes and emails into one list.", "Create a priority plan for today from my task board.", "Show me overdue tasks and suggest a catch-up plan.", "Group my tasks into work, study, and personal."] },
    { keys: ['checklist'], suggestions: ["Create a reusable lab checklist for chemistry experiments.", "Make a morning routine checklist I can tick daily.", "Convert this assignment instruction into a step-by-step checklist.", "Make a travel packing checklist for a 3-day trip."] },
    { keys: ['research'], suggestions: ["Find top sources for this topic and give me 5-line summaries.", "Compare these two tools and tell me which is better for students.", "Gather research papers on this concept and summarize them.", "Give me quick alternatives to this product with pros/cons."] },
    { keys: ['pdf'], suggestions: ["Clean this scanned page and convert it into an editable doc.", "Turn these notes into a polished PDF with proper formatting.", "Extract text from this blurry image using OCR.", "Combine these images into a single neat PDF."] },
    { keys: ['document', 'writer', 'copy'], suggestions: ["Draft a 1-page report based on these notes—simple tone.", "Create a proposal with headings and bullet points.", "Rewrite this paragraph in my writing style—clear and concise.", "Make a LinkedIn-style post from this idea."] },
    { keys: ['flowchart', 'diagram'], suggestions: ["Convert these bullet points into a clean flowchart.", "Make a process flow for how this system works.", "Draw a simple workflow from problem → solution steps.", "Turn this algorithm into a visual flowchart."] },
    { keys: ['image'], suggestions: ["Create an illustration for this idea—simple and clean.", "Make a social graphic with this quote.", "Generate a quick mockup for my app’s home screen.", "Turn this description into a product image."] },
    { keys: ['case study'], suggestions: ["Turn this story into a 1-page case study with metrics.", "Summarize this project into problem, solution, impact.", "Rewrite this client win into a case study format.", "Extract key insights and outcomes from this story."] },
    { keys: ['automation'], suggestions: ["Create an automation that sends me a summary every evening.", "Whenever I receive an assignment email, add it to my tasks.", "Link Gmail + Calendar to auto-create events from emails.", "Notify me whenever this file changes."] },
    { keys: ['digest', 'data'], suggestions: ["Summarize my dashboard today: trends + warnings.", "Give me the top 3 insights from this dataset.", "Highlight anything unusual in this week’s metrics.", "Suggest action steps from this performance report."] },
    { keys: ['reminder'], suggestions: ["Set reminders from these notes and categorize them.", "Find upcoming commitments and remind me by priority.", "Add gentle nudges for my deadlines this week.", "Create reminders for the tasks mentioned in this email."] },
    { keys: ['calendar'], suggestions: ["Find free time slots this week and suggest class blocks.", "Schedule a 30-minute meeting with buffer before/after.", "Fix conflicting events in my calendar.", "Plan my day by arranging tasks into time blocks."] },
    { keys: ['schedule'], suggestions: ["Build today’s study plan based on my deadlines.", "Balance classes, tasks, and breaks for a productive day.", "Auto-adjust my day when a task takes longer.", "Make a study timetable around my fixed commitments."] },
    { keys: ['brainstorm'], suggestions: ["Give me 10 creative ideas for this project.", "Make quick wireframes for this app concept.", "Brainstorm catchy titles for this topic.", "Generate new project ideas based on my interests."] },
    { keys: ['knowledge', 'sops', 'faq'], suggestions: ["Explain how to do this task step-by-step.", "Find relevant SOPs or guides for this question.", "Show me shortcuts or tips to do this faster.", "Give me FAQs related to this topic."] },
    { keys: ['summary'], suggestions: ["Summarize this long document into short bullets.", "Give me a crisp TL;DR of this conversation.", "Extract only decisions and actions from this transcript.", "Make a 1-minute read version of this text."] },
    { keys: ['exam', 'blueprint'], suggestions: ["Break this syllabus into a study checklist.", "Mark topics into strong/weak areas from my notes.", "Create a revision plan for this chapter.", "Highlight what I must learn before the exam."] },
    { keys: ['presentation', 'slide'], suggestions: ["Convert these bullets into a slide deck outline.", "Write speaker notes for this presentation.", "Make my intro slide more engaging.", "Draft a 5-minute practice script."] },
    { keys: ['hackathon'], suggestions: ["Organize our hackathon tasks into a timeline.", "Track submissions and deadlines for our team.", "Create a pitch outline for our hackathon project.", "Highlight risks and blockers for our build."] },
    { keys: ['news', 'interest'], suggestions: ["Send me interesting articles based on my subjects.", "Curate events happening this week related to tech.", "Summarize the top stories I should know today.", "Find opportunities or competitions relevant to me."] },
    { keys: ['sos', 'emergency'], suggestions: ["Share my live location with emergency contacts.", "Show nearby emergency numbers and campus security.", "Send an alert message to my trusted list.", "Guide me with quick safety steps in this situation."] },
    { keys: ['order', 'shop'], suggestions: ["Reorder my last Blinkit items quickly.", "Find cheaper alternatives to these groceries.", "Place a night-time snack order under ₹200.", "Track delivery status and notify me on arrival."] },
    { keys: ['code', 'dev'], suggestions: ["Write a React component", "Explain this function", "Debug a Python script", "Create a database schema"] },
];

const getSuggestions = (item) => {
    const title = (item?.title || item?.name || '').toLowerCase();
    const isFree = !item?.price || item?.price === 'Free';

    let suggestions = isFree ? ["Help me gets started", "What can you do?", "Give me an example"] : [];

    const matched = AGENT_MAPPINGS.find(m => m.keys.some(k => title.includes(k)));

    if (matched) {
        suggestions = matched.suggestions;
    }
    return suggestions;
};

/* eslint-disable react/prop-types */
const SuggestionsList = ({ suggestions, onSelect }) => {
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 0);
            setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, [suggestions]);

    const scroll = (direction) => {
        if (scrollRef.current) {
            const amount = 200;
            scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
        }
    };

    return (
        <div className="relative group/suggestions mb-2">
            {/* Left Gradient Cover + Arrow */}
            <div className={`absolute left-0 top-0 bottom-0 flex items-center z-20 transition-all duration-300 ${canScrollLeft ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'}`}>
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-card via-card/80 to-transparent pointer-events-none" />
                <button
                    type="button"
                    onClick={() => scroll('left')}
                    className="relative ml-0.5 p-1 px-1.5 h-7 bg-background/50 hover:bg-background border border-border/50 rounded-full shadow-sm text-muted-foreground hover:text-foreground transition-all hover:scale-105 backdrop-blur-md flex items-center justify-center group/btn"
                >
                    <svg className="w-3.5 h-3.5 group-hover/btn:-translate-x-0.5 transition-transform" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M13.729 5.575c1.304-1.074 3.27-.146 3.27 1.544v9.762c0 1.69-1.966 2.618-3.27 1.544l-5.927-4.881a2 2 0 0 1 0-3.088l5.927-4.88Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            <div
                ref={scrollRef}
                onScroll={checkScroll}
                className="flex gap-2 px-1 overflow-x-auto scrollbar-none scroll-smooth py-1"
            >
                {suggestions.map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => onSelect(s)}
                        className="text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border border-border/50 shrink-0"
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Right Gradient Cover + Arrow */}
            <div className={`absolute right-0 top-0 bottom-0 flex items-center justify-end z-20 transition-all duration-300 ${canScrollRight ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 pointer-events-none'}`}>
                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-card via-card/80 to-transparent pointer-events-none" />
                <button
                    type="button"
                    onClick={() => scroll('right')}
                    className="relative mr-0.5 p-1 px-1.5 h-7 bg-background/50 hover:bg-background border border-border/50 rounded-full shadow-sm text-muted-foreground hover:text-foreground transition-all hover:scale-105 backdrop-blur-md flex items-center justify-center group/btn"
                >
                    <svg className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M10.271 5.575C8.967 4.501 7 5.43 7 7.12v9.762c0 1.69 1.967 2.618 3.271 1.544l5.927-4.881a2 2 0 0 0 0-3.088l-5.927-4.88Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

const Masonry = ({
    items,
    onBookmark,
    onLike,
    onItemClick,
    user,
    ease = 'power3.out',
    duration = 0.6,
    stagger = 0.05,
    animateFrom = 'bottom',
    scaleOnHover = true,
    hoverScale = 0.95,
    blurToFocus = true,
    colorShiftOnHover = false,
    onAuthClick
}) => {
    const containerRef = useRef(null);
    const hasMounted = useRef(false);

    // State for controlling detail drawers
    const [openedItemId, setOpenedItemId] = useState(null);

    // State for Fast Mode Drawer
    const [fastModeItem, setFastModeItem] = useState(null);
    const [userInput, setUserInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);
    const messagesEndRef = useRef(null);

    // Result Drawer State
    const [resultDrawerOpen, setResultDrawerOpen] = useState(false);
    const [resultDrawerContent, setResultDrawerContent] = useState(null);
    const [resultDrawerType, setResultDrawerType] = useState('flowchart'); // 'flowchart' | 'image' | 'ppt'
    const [resultDrawerTitle, setResultDrawerTitle] = useState('');

    // Close Confirmation State
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);

    // Track sending status by message index
    const [sendingEmails, setSendingEmails] = useState({}); // { [index]: { status: 'idle'|'sending'|'success'|'error', message: '' } }

    const handleDirectEmailSend = async (index, emailData) => {
        if (!emailData.to || !emailData.subject || !emailData.body) {
            setSendingEmails(prev => ({
                ...prev,
                [index]: { status: 'error', message: 'Missing fields' }
            }));
            return;
        }

        setSendingEmails(prev => ({
            ...prev,
            [index]: { status: 'sending', message: 'Sending...' }
        }));

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailData.to,
                    subject: emailData.subject,
                    body: emailData.body
                }),
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setSendingEmails(prev => ({
                    ...prev,
                    [index]: { status: 'success', message: 'Sent!' }
                }));
                // Reset success message after 3 seconds
                setTimeout(() => {
                    setSendingEmails(prev => {
                        const newState = { ...prev };
                        delete newState[index];
                        return newState;
                    });
                }, 3000);
            } else {
                setSendingEmails(prev => ({
                    ...prev,
                    [index]: { status: 'error', message: 'Failed' }
                }));
            }
        } catch (error) {
            setSendingEmails(prev => ({
                ...prev,
                [index]: { status: 'error', message: 'Error' }
            }));
        }
    };



    const openResultDrawer = (content, type, title = '') => {
        setResultDrawerContent(content);
        setResultDrawerType(type);
        setResultDrawerTitle(title);
        setResultDrawerOpen(true);
    };

    const markdownComponents = useMemo(() => ({
        code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeContent = String(children).replace(/\n$/, '');

            if (!inline && match && match[1] === 'mermaid') {
                return (
                    <FlowchartRenderer
                        flowchart={codeContent}
                        onClick={() => openResultDrawer(codeContent, 'flowchart', 'Flowchart Diagram')}
                    />
                );
            }

            return !inline && match ? (
                <div className="relative group my-4 rounded-lg overflow-hidden border border-border/50 bg-[#1e1e1e]">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-border/10">
                        <span className="text-xs font-medium text-gray-400">{match[1]}</span>
                        <button
                            onClick={() => navigator.clipboard.writeText(codeContent)}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Copy Code"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                    <div className="p-4 overflow-x-auto">
                        <code className={className} {...props}>
                            {children}
                        </code>
                    </div>
                </div>
            ) : (
                <code className={`${className} bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono`} {...props}>
                    {children}
                </code>
            )
        },
        a: ({ node, ...props }) => <a {...props} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" />,
        ul: ({ node, ...props }) => <ul className="list-disc ml-6 my-2 space-y-1" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal ml-6 my-2 space-y-1" {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-primary/50 pl-4 my-2 italic text-muted-foreground" {...props} />,
        img: ({ node, ...props }) => (
            <ImageRenderer
                {...props}
                node={node}
                onClick={() => openResultDrawer(props.src, 'image', props.alt || 'Generated Image')}
            />
        )
    }), []);

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

    const fastModeInputRef = useRef(null);

    useEffect(() => {
        if (fastModeItem) {
            const timer = setTimeout(() => {
                fastModeInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [fastModeItem]);

    // Check for hash to auto-open drawer
    useEffect(() => {
        const checkHash = () => {
            const hash = window.location.hash;
            if (hash && hash.startsWith('#product-') && items.length > 0) {
                const id = hash.replace('#product-', '');
                const target = items.find(i => String(i.id) === id);
                if (target) {
                    setOpenedItemId(target.id);
                }
            }
        };

        checkHash();
        window.addEventListener('hashchange', checkHash);
        return () => window.removeEventListener('hashchange', checkHash);
    }, [items]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

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

    const handleLike = (item, e) => {
        if (e) e.stopPropagation();
        if (onLike) {
            onLike(item.id);
        } else {
            console.warn("onLike prop not provided to Masonry");
        }
    };

    const handleUseTool = (item) => {
        // Blur current element to prevent focus trap issues during drawer switch
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        setOpenedItemId(null); // Close detail drawer
        window.history.replaceState(null, null, ' ');
        setFastModeItem(item); // Open Fast Mode drawer
        setMessages([
            {
                role: 'system',
                content: `Welcome to **${item.title || item.name}**! \n\nI'm ready to help you. What would you like to do?`
            }
        ]);
        setUserInput('');
        setHasSubmitted(false);
    };

    const handleFastModeSubmit = async () => {
        if (!userInput.trim() || !fastModeItem || isProcessing) return;

        const currentInput = userInput.trim();
        setUserInput('');
        setMessages(prev => [...prev, { role: 'user', content: currentInput }]);
        setIsProcessing(true);

        // Only set hasSubmitted (which hides the input) if it's NOT a free tool
        const isFree = !fastModeItem.price || fastModeItem.price === 'Free';
        if (!isFree) {
            setHasSubmitted(true);
        }

        try {
            console.log('[MASONRY] Starting agent execution with prompt:', currentInput);

            // Credit Deduction Logic
            let cost = 0;
            if (fastModeItem.price && fastModeItem.price !== 'Free') {
                const match = fastModeItem.price.match(/(\d+)/);
                if (match) cost = parseInt(match[1]);
            }

            if (cost > 0) {
                // Fetch current credits
                const { data: userData, error: userError } = await supabase
                    .from('user_details')
                    .select('credits')
                    .eq('id', user.id)
                    .maybeSingle();

                if (userError || !userData) {
                    setMessages(prev => [...prev, { role: 'system', content: "Error: Could not verify credits. Please try again." }]);
                    setIsProcessing(false);
                    return;
                }

                if (userData.credits < cost) {
                    setMessages(prev => [...prev, { role: 'system', content: `Insufficient credits. You need ${cost} credits but have ${userData.credits}.` }]);
                    setIsProcessing(false);
                    return;
                }

                const newCredits = userData.credits - cost;

                // CRITICAL: Update credits AND logs in the same query to trigger the database trigger
                const description = `Used agent: ${fastModeItem.title || 'Agent'}`;
                const result = await updateCreditsWithLog(user.id, newCredits, -cost, description);

                if (!result.success) {
                    setMessages(prev => [...prev, { role: 'system', content: "Error: Failed to deduct credits." }]);
                    setIsProcessing(false);
                    return;
                }
            }


            const systemContext = `You are the specific agent "${fastModeItem.title}". 
Your task is strictly defined by this description: "${fastModeItem.description || fastModeItem.shortDescription || 'Assist the user efficiently'}". 
Do NOT allow yourself to be distracted or change personas. 
Perform ONLY the task relevant to your identity as "${fastModeItem.title}".
If the user asks for something outside your scope, politely decline and remind them of your specific purpose.`;

            const fullPrompt = `${systemContext}\n\nUser Request: ${currentInput}`;

            const requestBody = {
                prompt: fullPrompt,
                user: user?.user_metadata?.username || user?.email || null,
                agent: fastModeItem.title
            };
            
            const response = await apiCache.fetchWithFallback(requestBody);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Add a placeholder message for the result
            setMessages(prev => [...prev, { role: 'assistant', content: 'Thinking...', isStreaming: true }]);

            let currentAssistantMessage = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'result') {
                                // For result types, we append formatted content
                                let contentToAdd = '';
                                if (data.data?.image_url) {
                                    contentToAdd = `\n![Generated Image](${data.data.image_url})\n`;
                                } else if (data.data?.pptx_url || (data.data?.file_path && data.data.file_path.endsWith('.pptx'))) {
                                    // Handle Presentation - attach to message instead of appending text
                                    const pptData = {
                                        ...data.data,
                                        pptx_url: data.data.pptx_url || data.data.file_path
                                    };

                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        if (newMessages.length > 0) {
                                            newMessages[newMessages.length - 1] = {
                                                ...newMessages[newMessages.length - 1],
                                                attachment: { type: 'presentation', data: pptData }
                                            };
                                        }
                                        return newMessages;
                                    });
                                    // contentToAdd = '\n\n'; 
                                } else if (data.data?.document || (data.data?.document_type && data.data?.filename)) {
                                    // Handle Document Agent - attach to message
                                    let cleanDoc = data.data.document || '';
                                    if (typeof cleanDoc === 'string') {
                                        cleanDoc = cleanDoc
                                            .replace(/^```markdown\s*/i, '')
                                            .replace(/^```\s*/i, '')
                                            .replace(/```\s*$/i, '')
                                            .trim();
                                    }

                                    const docData = {
                                        ...data.data,
                                        document: cleanDoc, // The clean markdown content
                                        file_path: data.data.file_path || data.data.url
                                    };

                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        if (newMessages.length > 0) {
                                            newMessages[newMessages.length - 1] = {
                                                ...newMessages[newMessages.length - 1],
                                                attachment: { type: 'document', data: docData }
                                            };
                                        }
                                        return newMessages;
                                    });
                                    // Ensure no text is appended to the message bubble
                                    contentToAdd = '';
                                } else if (data.data?.presentation_url || data.data?.ppt_url || data.data?.slide_url) {
                                    const pptUrl = data.data.presentation_url || data.data.ppt_url || data.data.slide_url;
                                    contentToAdd = `\n**Presentation Generated!**\n\n[Download Presentation](${pptUrl})\n`;
                                } else if (data.data?.flowchart) {
                                    contentToAdd = `\n\`\`\`mermaid\n${data.data.flowchart}\n\`\`\`\n`;
                                } else if (data.data?.summary) {
                                    contentToAdd = `\n${data.data.summary}\n`;
                                } else if (data.data?.output) {
                                    // Handle Code/Writer Agent
                                    // Check if this is Research Agent - if so, force Document Card
                                    const isResearch = fastModeItem?.title?.toLowerCase()?.includes('research');

                                    if (isResearch) {
                                        let content = data.data.output || '';
                                        if (typeof content === 'string') {
                                            content = content.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
                                        }
                                        const docData = {
                                            ...data.data,
                                            document: content,
                                            topic: data.data.topic || 'Research Report',
                                            document_type: 'report',
                                            filename: 'research_report.md'
                                        };
                                        setMessages(prev => {
                                            const newMessages = [...prev];
                                            if (newMessages.length > 0) {
                                                newMessages[newMessages.length - 1] = {
                                                    ...newMessages[newMessages.length - 1],
                                                    attachment: { type: 'document', data: docData }
                                                };
                                            }
                                            return newMessages;
                                        });
                                        contentToAdd = '';
                                    } else {
                                        contentToAdd = `\n${data.data.output}\n`;
                                    }
                                } else if (data.data?.tasks && Array.isArray(data.data.tasks)) {
                                    // Handle Planner/Checklist Agent
                                    contentToAdd = `\n**Plan:**\n${data.data.tasks.map(t => `- [ ] ${t.task || t}`).join('\n')}\n`;
                                } else if (data.data?.email_preview || (data.data?.subject && data.data?.body) || (data.data?.body && data.data?.to)) {
                                    // Handle Email Agent Response
                                    const email = data.data.email_preview || data.data;
                                    const emailData = {
                                        to: email.to || '',
                                        subject: email.subject || 'No Subject',
                                        body: email.body || ''
                                    };
                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        if (newMessages.length > 0) {
                                            newMessages[newMessages.length - 1] = {
                                                ...newMessages[newMessages.length - 1],
                                                attachment: { type: 'email', data: emailData }
                                            };
                                        }
                                        return newMessages;
                                    });
                                    contentToAdd = ''; // Suppress raw text logic
                                } else if (data.data?.article || data.data?.report) {
                                    // Handle Research Agent -> Convert to Document Attachment
                                    let content = data.data.article || data.data.report || '';

                                    if (typeof content === 'string') {
                                        content = content
                                            .replace(/^```markdown\s*/i, '')
                                            .replace(/^```\s*/i, '')
                                            .replace(/```\s*$/i, '')
                                            .trim();
                                    }

                                    const docData = {
                                        ...data.data,
                                        document: content,
                                        topic: data.data.topic || 'Research Report',
                                        document_type: 'report',
                                        filename: 'research_report.md'
                                    };

                                    setMessages(prev => {
                                        const newMessages = [...prev];
                                        if (newMessages.length > 0) {
                                            newMessages[newMessages.length - 1] = {
                                                ...newMessages[newMessages.length - 1],
                                                attachment: { type: 'document', data: docData }
                                            };
                                        }
                                        return newMessages;
                                    });
                                    // Ensure no text is appended to the message bubble
                                    contentToAdd = '';
                                    // contentToAdd = `\n${data.data.article || data.data.report}\n`; 
                                } else if (data.data?.content) {
                                    const isResearch = fastModeItem?.title?.toLowerCase()?.includes('research');
                                    if (isResearch) {
                                        let content = data.data.content || '';
                                        if (typeof content === 'string') {
                                            content = content.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
                                        }
                                        const docData = {
                                            ...data.data,
                                            document: content,
                                            topic: data.data.topic || 'Research Report',
                                            document_type: 'report',
                                            filename: 'research_report.md'
                                        };
                                        setMessages(prev => {
                                            const newMessages = [...prev];
                                            if (newMessages.length > 0) {
                                                newMessages[newMessages.length - 1] = {
                                                    ...newMessages[newMessages.length - 1],
                                                    attachment: { type: 'document', data: docData }
                                                };
                                            }
                                            return newMessages;
                                        });
                                        contentToAdd = '';
                                    } else {
                                        contentToAdd = `\n${data.data.content}\n`;
                                    }
                                } else if (data.data?.response) {
                                    const isResearch = fastModeItem?.title?.toLowerCase()?.includes('research');
                                    if (isResearch) {
                                        let content = data.data.response || '';
                                        if (typeof content === 'string') {
                                            content = content.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
                                        }
                                        const docData = {
                                            ...data.data,
                                            document: content,
                                            topic: data.data.topic || 'Research Report',
                                            document_type: 'report',
                                            filename: 'research_report.md'
                                        };
                                        setMessages(prev => {
                                            const newMessages = [...prev];
                                            if (newMessages.length > 0) {
                                                newMessages[newMessages.length - 1] = {
                                                    ...newMessages[newMessages.length - 1],
                                                    attachment: { type: 'document', data: docData }
                                                };
                                            }
                                            return newMessages;
                                        });
                                        contentToAdd = '';
                                    } else {
                                        contentToAdd = `\n${data.data.response}\n`;
                                    }
                                } else if (data.data?.result) {
                                    const isResearch = fastModeItem?.title?.toLowerCase()?.includes('research');
                                    if (isResearch) {
                                        let content = data.data.result || '';
                                        if (typeof content === 'string') {
                                            content = content.replace(/^```markdown\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
                                        }
                                        if (data.data.sources && Array.isArray(data.data.sources)) {
                                            content += `\n\n### Sources\n${data.data.sources.map(s => `- ${s}`).join('\n')}`;
                                        }

                                        const docData = {
                                            ...data.data,
                                            document: content,
                                            topic: data.data.topic || 'Research Report',
                                            document_type: 'report',
                                            filename: 'research_report.md'
                                        };

                                        setMessages(prev => {
                                            const newMessages = [...prev];
                                            if (newMessages.length > 0) {
                                                newMessages[newMessages.length - 1] = {
                                                    ...newMessages[newMessages.length - 1],
                                                    attachment: { type: 'document', data: docData }
                                                };
                                            }
                                            return newMessages;
                                        });
                                        contentToAdd = '';
                                    } else {
                                        contentToAdd = `\n${data.data.result}\n`;
                                        if (data.data.sources && Array.isArray(data.data.sources)) {
                                            contentToAdd += `\n\n**Sources:**\n${data.data.sources.map(s => `- ${s}`).join('\n')}\n`;
                                        }
                                    }
                                } else if (data.data?.output) {
                                    contentToAdd = `\n${data.data.output}\n`;
                                } else if (data.data?.answer) {
                                    contentToAdd = `\n${data.data.answer}\n`;
                                } else if (typeof data.data === 'string') {
                                    contentToAdd = `\n${data.data}\n`;
                                } else if (typeof data.data === 'object' && data.data.message && data.data.event_preview) {
                                    // Handle Calendar Agent Response
                                    const { message, event_preview } = data.data;
                                    contentToAdd = `\n${message}\n\n**Event Created:**\n- **Title:** ${event_preview.title}\n- **Time:** ${new Date(event_preview.start_time).toLocaleString()} - ${new Date(event_preview.end_time).toLocaleString()}\n- **Location:** ${event_preview.location || 'N/A'}\n`;
                                } else if (typeof data.data === 'object' && data.data.message) {
                                    contentToAdd = `\n${data.data.message}\n`;
                                } else if (data.data) {
                                    contentToAdd = `\n\`\`\`json\n${JSON.stringify(data.data, null, 2)}\n\`\`\`\n`;
                                }

                                currentAssistantMessage += contentToAdd;

                                setMessages(prev => {
                                    const newMsgs = [...prev];
                                    const lastMsg = newMsgs[newMsgs.length - 1];
                                    if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                                        lastMsg.content = currentAssistantMessage;
                                    }
                                    return newMsgs;
                                });
                            }
                        } catch (e) {
                            console.error('Parse error:', e);
                        }
                    }
                }
            }

            // Finalize streaming state and append helpful tip if content was generated
            const hasGeneratedContent = currentAssistantMessage.match(/!\[.*\]\(.*\)|```mermaid|```/);

            if (hasGeneratedContent) {
                currentAssistantMessage += "You can always get generated content from the **Data** page in the sidebar.";
            }

            setMessages(prev => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg.role === 'assistant') {
                    lastMsg.content = currentAssistantMessage;
                    lastMsg.isStreaming = false;
                }
                return newMsgs;
            });

        } catch (error) {
            console.error('Agent execution error:', error);
            setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }]);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div ref={containerRef} className="list">
            {items.map(item => {
                if (onItemClick) {
                    return (
                        <div
                            key={item.id}
                            className="item-wrapper cursor-pointer"
                            onMouseEnter={e => handleMouseEnter(e, item)}
                            onMouseLeave={e => handleMouseLeave(e, item)}
                            onClick={(e) => {
                                e.stopPropagation();
                                onItemClick(item);
                            }}
                        >
                            <MasonryCard
                                item={item}
                                disableMorph={true}
                                handleMouseEnter={handleMouseEnter}
                                handleMouseLeave={handleMouseLeave}
                            />
                        </div>
                    );
                }

                return (
                    <SmoothDrawer
                        key={item.id}
                        open={openedItemId === item.id}
                        onOpenChange={(open) => {
                            setOpenedItemId(open ? item.id : null);
                            if (!open) window.history.replaceState(null, null, ' ');
                        }}
                        trigger={
                            <div
                                data-key={item.id}
                                className="item-wrapper"
                                onMouseEnter={e => handleMouseEnter(e, item)}
                                onMouseLeave={e => handleMouseLeave(e, item)}
                                onClick={() => setOpenedItemId(item.id)}
                            >
                                <MasonryCard
                                    item={item}
                                    handleMouseEnter={handleMouseEnter}
                                    handleMouseLeave={handleMouseLeave}
                                />
                            </div>
                        }
                    >
                        <div className='pointer-events-auto relative flex h-full flex-col overflow-hidden w-full'>
                            {/* Header Section */}
                            <div className="flex items-start justify-between p-8 pb-6 border-b border-border/50 shrink-0">
                                <div className="flex gap-5">
                                    <div className="flex flex-col gap-1">
                                        <h3 className='text-xl md:text-3xl font-bold text-foreground tracking-tight'>
                                            {item.title || item.name}
                                        </h3>
                                        <div className='text-muted-foreground font-medium'>
                                            Configure your tool settings and start using
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={() => {
                                            if (!user) {
                                                onAuthClick && onAuthClick();
                                                return;
                                            }
                                            handleUseTool(item);
                                        }}
                                        className="bg-secondary border border-border hover:bg-muted text-foreground shadow-lg px-6 py-2 md:px-8 md:py-2.5 rounded-full font-semibold transition-all flex items-center gap-2 text-xs md:text-sm"
                                    >
                                        {!user ? (
                                            <>
                                                Sign In to Use
                                                <LogIn className="w-5 h-5" />
                                            </>
                                        ) : item.price && item.price !== 'Free' ? (
                                            <>
                                                Use {item.price.replace(/[^0-9]/g, '')} credits/msg
                                                <svg className="w-5 h-5 text-current" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v9m-5 0H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2M8 9l4-5 4 5m1 8h.01" />
                                                </svg>
                                            </>
                                        ) : (
                                            <>
                                                Open Tool
                                                <svg className="w-5 h-5 text-current" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v9m-5 0H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-2M8 9l4-5 4 5m1 8h.01" />
                                                </svg>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto p-8 pt-6 pb-32 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                <div className="flex flex-col rounded-3xl border border-border overflow-hidden bg-card shadow-sm">
                                    {/* Image Section */}
                                    {item.img && (
                                        <div className="relative w-full bg-muted/20">
                                            <img
                                                src={item.img}
                                                alt={item.title || item.name}
                                                className='w-full h-auto block'
                                            />
                                        </div>
                                    )}

                                    {/* About Section */}
                                    <div className="bg-muted/30 p-8 border-t border-border/50 backdrop-blur-sm rounded-b-3xl">
                                        <div className="flex items-center gap-2 mb-4 text-primary font-semibold text-xs md:text-sm uppercase tracking-wider">
                                            About {item.title || item.name}
                                        </div>
                                        <div>
                                            <p className='text-muted-foreground leading-relaxed text-sm md:text-[15px] whitespace-normal break-words'>
                                                {item.description || "Solve themed crossword grids by filling in words based on given clues. This game strengthens vocabulary, spelling, and logical thinking as you complete each interconnected puzzle."}
                                            </p>
                                        </div>

                                        {/* Tags */}
                                        <div className="flex flex-wrap gap-2 mt-6">
                                            {[...new Set(item.tags || ["Productivity", "AI Tool", "Utility"])].map((tag, i) => (
                                                <span key={i} className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-[10px] md:text-xs font-medium border border-border/50">
                                                    {tag}
                                                </span>
                                            ))}
                                            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground font-mono">
                                                <div className="flex items-center gap-1.5">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                    {item.views || 0}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                                                    {item.likes || 0}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Bottom Dock */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-card border-t border-x border-border rounded-t-2xl px-8 py-4 md:px-12 md:py-5 z-20 flex items-center justify-center shadow-2xl w-full md:w-auto">
                                <div className="flex items-center gap-8">
                                    <div
                                        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={(e) => handleLike(item, e)}
                                    >
                                        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                                            {item.isLiked ? 'Liked' : 'Like Now'}
                                        </span>
                                        {/* Like Button */}
                                        <div
                                            className={`transition-colors p-3 rounded-full border border-border bg-background ${item.isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
                                            title={item.isLiked ? "Unlike" : "Like"}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill={item.isLiked ? "currentColor" : "none"}
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            >
                                                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                                            </svg>
                                        </div>
                                    </div>

                                    <div
                                        className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onBookmark && onBookmark(item.id);
                                        }}
                                    >
                                        <div
                                            className={`transition-colors p-3 rounded-full border border-border bg-background ${item.isBookmarked ? 'text-yellow-500' : 'text-muted-foreground'}`}
                                            title={item.isBookmarked ? "Remove Bookmark" : "Bookmark"}
                                        >
                                            <Bookmark size={24} fill={item.isBookmarked ? "currentColor" : "none"} />
                                        </div>
                                        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                                            {item.isBookmarked ? 'Bookmarked' : 'Mark Now'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </SmoothDrawer>
                );
            })}

            {/* Fast Mode Drawer - Exact UI Match */}
            <Drawer.Root
                open={!!fastModeItem}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowCloseConfirm(true);
                    }
                }}
            >
                <Drawer.Portal>
                    <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[50]" />
                    <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[60] mt-24 flex h-[90vh] flex-col rounded-t-[28px] border-t border-white/10 bg-background/95 outline-none backdrop-blur-3xl shadow-2xl max-w-4xl mx-auto">
                        <div className="sr-only">
                            <Drawer.Title>Fast Mode Agent Interaction</Drawer.Title>
                            <Drawer.Description>
                                Interact with the AI agent {fastModeItem?.title || 'Fast Mode'}
                            </Drawer.Description>
                        </div>

                        {/* Header / Handle */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                            <div className="w-12 h-1.5 rounded-full bg-white/10 mx-auto absolute left-1/2 -translate-x-1/2 top-4" />
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-xl text-primary">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground">Bianca {fastModeItem?.title || 'Agent'}</h3>
                                    <p className="text-xs text-muted-foreground">AI Powered Assistant</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                {hasSubmitted && !isProcessing && (
                                    <div className="scale-75 origin-right">
                                        <RatingSystem
                                            productId={fastModeItem?.id}
                                            initialValue={fastModeItem?.rating || 0}
                                            compact={true}
                                            onRate={(newVal) => {
                                                // Update fastModeItem rating locally
                                                setFastModeItem(prev => ({ ...prev, rating: newVal }));
                                                // Update the item in the main items list if it's there
                                                // Note: this depends on how items are passed, but it's good practice
                                            }}
                                        />
                                    </div>
                                )}
                                <button
                                    onClick={() => setShowCloseConfirm(true)}
                                    className="p-2 hover:bg-white/5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Chat Area - Matches FastMode.jsx structure */}
                        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent w-full">
                            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-40 min-h-full">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        {msg.role !== 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shrink-0 shadow-sm mt-1">
                                                <Sparkles size={14} className="text-yellow-400" />
                                            </div>
                                        )}
                                        {msg.role === 'user' && (user?.user_metadata?.avatar_url ? (
                                            <img src={user.user_metadata.avatar_url} alt="User" className="w-8 h-8 rounded-full object-cover shrink-0 mt-1" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-1">
                                                {user ? user.id[0].toUpperCase() : 'U'}
                                            </div>
                                        ))}

                                        <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                            <div className={`relative text-sm leading-relaxed break-words whitespace-pre-wrap select-text ${msg.role === 'user'
                                                ? 'px-4 py-2 bg-secondary text-secondary-foreground rounded-2xl rounded-tr-sm'
                                                : 'px-0 py-1 text-muted-foreground'
                                                } ${msg.content === 'Thinking...' ? 'animate-shimmer text-lg font-medium' : ''}`}>
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={markdownComponents}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                                {msg.attachment?.type === 'presentation' && (
                                                    <PresentationCard
                                                        data={msg.attachment.data}
                                                        onOpen={(url, type, title) => openResultDrawer(url, type, title)}
                                                    />
                                                )}
                                                {msg.attachment?.type === 'document' && (
                                                    <DocumentCard
                                                        data={msg.attachment.data}
                                                        onOpen={(url, type, title) => openResultDrawer(url, type, title)}
                                                    />
                                                )}
                                                {msg.attachment?.type === 'email' && (
                                                    <EmailCard
                                                        data={msg.attachment.data}
                                                        onOpen={(data, type, title) => openResultDrawer(data, type, title)}
                                                        onSend={() => handleDirectEmailSend(idx, msg.attachment.data)}
                                                        sendingStatus={sendingEmails[idx]}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {isProcessing && messages[messages.length - 1]?.role !== 'assistant' && (
                                    <div className="flex items-center gap-3 animate-pulse">
                                        <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shrink-0">
                                            <Sparkles size={14} className="text-yellow-400" />
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span className="animate-shimmer text-lg font-medium">Thinking...</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        {/* Floating Input Area - Exact Match */}
                        {/* Floating Input Area - Exact Match */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50">
                            {!hasSubmitted ? (
                                <div className="relative rounded-3xl bg-card border border-border p-4 shadow-2xl ring-1 ring-white/10">
                                    <form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            handleFastModeSubmit();
                                        }}
                                    >
                                        {(() => {
                                            const suggestions = getSuggestions(fastModeItem || {});
                                            if (suggestions.length === 0) return null;

                                            return (
                                                <SuggestionsList
                                                    suggestions={suggestions}
                                                    onSelect={(s) => setUserInput(s)}
                                                />
                                            );
                                        })()}

                                        <textarea
                                            ref={fastModeInputRef}
                                            type="text"
                                            value={userInput}
                                            onChange={(e) => setUserInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleFastModeSubmit();
                                                }
                                                // Handle arrow key suggestion cycling
                                                if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                                    const suggestions = getSuggestions(fastModeItem || {});
                                                    if (!suggestions.length) return;

                                                    const currentIndex = suggestions.indexOf(userInput);
                                                    const inputLength = userInput.length;
                                                    const { selectionStart, selectionEnd } = e.target;

                                                    if (e.key === 'ArrowRight') {
                                                        // Cycle next if at end OR if currently displaying a suggestion
                                                        if (selectionStart === inputLength && selectionEnd === inputLength) {
                                                            if (currentIndex !== -1 || userInput === '') {
                                                                e.preventDefault();
                                                                const nextIndex = (currentIndex + 1) % suggestions.length;
                                                                setUserInput(suggestions[nextIndex]);
                                                            }
                                                        }
                                                    } else if (e.key === 'ArrowLeft') {
                                                        // Cycle prev if at start
                                                        if (selectionStart === 0 && selectionEnd === 0) {
                                                            if (currentIndex !== -1 || userInput === '') {
                                                                e.preventDefault();
                                                                const prevIndex = currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1;
                                                                setUserInput(suggestions[prevIndex]);
                                                            }
                                                        }
                                                    }
                                                }
                                            }}
                                            placeholder={`Ask Bianca ${fastModeItem?.title || 'Agent'}...`}
                                            className="w-full bg-transparent text-xl text-foreground placeholder:text-muted-foreground outline-none pb-12 px-2 resize-none min-h-[60px] max-h-[200px] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                                            style={{ height: 'auto' }}
                                        />

                                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-2 bg-secondary hover:bg-muted transition-colors rounded-full px-3 py-1.5 text-sm text-secondary-foreground border border-border cursor-default">
                                                    <span className="font-semibold text-foreground">Bianca</span> Agent
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setMessages([])}
                                                    className="p-2 text-muted-foreground hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/10"
                                                    title="Reset Chat"
                                                >
                                                    <RotateCcw size={18} />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="submit"
                                                    disabled={!userInput.trim() || isProcessing}
                                                    className={`p-2 transition-all rounded-xl border border-border ${!userInput.trim() || isProcessing
                                                        ? 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50'
                                                        : 'bg-foreground text-background hover:opacity-90 shadow-lg shadow-primary/20'
                                                        }`}
                                                >
                                                    {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <ArrowUp size={20} />}
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                !isProcessing && (
                                    <>
                                        <div className="mt-8">
                                            <RatingSystem
                                                productId={fastModeItem?.id}
                                                initialValue={fastModeItem?.rating || 0}
                                                onRate={(newVal) => setFastModeItem(prev => ({ ...prev, rating: newVal }))}
                                                onReset={() => {
                                                    setHasSubmitted(false);
                                                    setUserInput('');
                                                    setMessages([
                                                        {
                                                            role: 'system',
                                                            content: `Welcome to **${fastModeItem?.title || fastModeItem?.name}**! \n\nI'm ready to help you. What would you like to do?`
                                                        }
                                                    ]);
                                                }}
                                            />
                                        </div>
                                    </>
                                )
                            )}
                        </div>

                    </Drawer.Content>

                    {/* Confirmation Modal - Moved outside to guarantee rendering */}
                </Drawer.Portal>
            </Drawer.Root >

            {/* Confirmation Modal */}
            {showCloseConfirm && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
                    <div
                        className="bg-card border border-border p-6 rounded-2xl shadow-2xl max-w-[340px] w-full animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center text-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground">
                                <RotateCcw size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Close Drawer?</h3>
                                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                    Do you want to close this drawer? Don't worry, all files and data are saved in the <strong>Data</strong> page.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCloseConfirm(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors font-medium text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowCloseConfirm(false);
                                    setFastModeItem(null);
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-foreground text-background hover:opacity-90 transition-colors font-medium text-sm"
                            >
                                Close Drawer
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}



            <ResultDrawer
                isOpen={resultDrawerOpen}
                onClose={setResultDrawerOpen}
                content={resultDrawerContent}
                title={resultDrawerTitle}
                type={resultDrawerType}
            />
        </div >
    );
};

export default Masonry;
