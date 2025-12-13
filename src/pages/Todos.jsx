
import React, { useState, useRef, useEffect } from 'react';
import { ListTodo, CheckSquare, Plus, Trash2, Check, ChevronRight, ChevronDown, Calendar as CalendarIcon, Tag as TagIcon, X, Pin } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TodosPage = ({ navigateOnly, user, todos, toggleTodo, toggleExpand, addTodo, deleteTodo, toggleSubtask, deleteSubtask, addSubtask, togglePin, editTodo, editSubtask }) => {
    // Local input states
    const [newTodo, setNewTodo] = useState('');
    const [newSubtaskInputs, setNewSubtaskInputs] = useState({});

    const navTabs = [
        { id: 'home', label: 'For you', icon: <ChevronDown size={14} fill="currentColor" /> },
        { id: 'todos', label: 'Todo' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'data', label: 'Data' }
    ];

    // Animations
    const containerRef = useRef(null);
    useEffect(() => {
        if (containerRef.current) {
            gsap.fromTo(containerRef.current.children,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, stagger: 0.1, duration: 0.5, ease: 'power2.out' }
            );
        }
    }, [todos.length === 0]); // Initial load animation only ideally

    // Local wrappers to handle inputs
    const handleAddTodo = (e) => {
        e.preventDefault();
        addTodo(newTodo);
        setNewTodo('');
    };

    const handleAddSubtask = (e, todoId) => {
        e.preventDefault();
        const text = newSubtaskInputs[todoId];
        addSubtask(todoId, text);
        setNewSubtaskInputs(prev => ({ ...prev, [todoId]: '' }));
    };

    // Custom Checkbox Component
    const Checkbox = ({ checked, onClick, size = 'md' }) => {
        const sizeClasses = size === 'sm' ? 'w-4 h-4 rounded-[4px]' : 'w-5 h-5 rounded-md';
        const iconSize = size === 'sm' ? 10 : 12;

        return (
            <div
                onClick={(e) => { e.stopPropagation(); onClick(); }}
                className={`${sizeClasses} border flex items-center justify-center transition-all duration-200 cursor-pointer flex-shrink-0 ${checked
                    ? 'bg-primary border-primary text-primary-foreground shadow-sm scale-110'
                    : 'border-muted-foreground/40 hover:border-muted-foreground/60 bg-transparent'
                    }`}
            >
                {checked && <Check size={iconSize} strokeWidth={3.5} />}
            </div>
        );

    };

    const EditableText = ({ text, onSave, className }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [value, setValue] = useState(text);
        const inputRef = useRef(null);

        useEffect(() => {
            if (isEditing && inputRef.current) {
                inputRef.current.focus();
            }
        }, [isEditing]);

        const handleSave = () => {
            if (value.trim() && value !== text) {
                onSave(value);
            } else {
                setValue(text); // Revert if empty or unchanged
            }
            setIsEditing(false);
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                handleSave();
            } else if (e.key === 'Escape') {
                setValue(text);
                setIsEditing(false);
            }
        };

        if (isEditing) {
            return (
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className={`bg-transparent outline-none border-b border-primary/50 text-foreground w-full ${className}`}
                />
            );
        }

        return (
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                }}
                className={`cursor-text hover:underline decoration-dashed decoration-zinc-500/50 underline-offset-4 ${className}`}
            >
                {text}
            </span>
        );
    };

    return (
        <div className="feed-page min-h-screen bg-background relative pb-32">
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        Yoh have <span className="text-destructive font-bold">{todos.filter(t => !t.completed).length}</span> pending tasks
                    </p>

                    <div className="hero-search-wrapper">
                        <form onSubmit={handleAddTodo} className="big-search-bar">
                            <input
                                type="text"
                                placeholder="Create a new task..."
                                value={newTodo}
                                onChange={(e) => setNewTodo(e.target.value)}
                            />
                            <div className="search-actions">
                                <span className="kbd">ENTER</span>
                                <button type="submit" className="search-btn"><Plus size={18} /></button>
                            </div>
                        </form>
                        <div className="hero-footer-text">#Start typing to create a new task.</div>
                    </div>
                </div>
            </div>

            <div className="content-overlay content-area pt-24">
                <div className="sticky-nav-container mb-8 flex justify-center">
                    <MagneticMorphingNav
                        activeTab="todos"
                        onTabChange={navigateOnly}
                        tabs={navTabs}
                        user={user}
                    />
                </div>
                <div className="masonry-wrapper" style={{ margin: '0 auto', width: '100%', maxWidth: '800px', padding: '0 20px' }}>

                    <div className="section-header" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
                        <div className="trending-title">
                            <ListTodo size={24} /> My Tasks
                        </div>
                    </div>

                    <div className="flex flex-col gap-4" ref={containerRef}>
                        {todos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground border border-dashed border-border rounded-xl">
                                <CheckSquare size={48} strokeWidth={1} className="mb-4 opacity-50" />
                                <p>No tasks yet. Add one above!</p>
                            </div>
                        ) : (
                            todos.map(todo => {
                                const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;

                                return (
                                    <div
                                        key={todo.id}
                                        className={`group relative rounded-2xl border transition-all duration-300 overflow-hidden ${todo.completed
                                            ? 'bg-card/50 border-border/50 opacity-80'
                                            : 'bg-card border-border hover:border-primary/30 hover:shadow-md'
                                            }`}
                                    >
                                        <div
                                            className="p-4 flex items-center gap-4 cursor-pointer select-none"
                                            onClick={() => toggleExpand(todo.id)}
                                        >

                                            {/* Checkbox Wrapper */}
                                            <div className="flex-shrink-0 pt-0.5">
                                                <Checkbox checked={todo.completed} onClick={() => toggleTodo(todo.id)} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className={`text-base font-medium transition-all duration-300 ${todo.completed ? 'text-muted-foreground opacity-40 line-through' : 'text-foreground'}`}>
                                                    <EditableText
                                                        text={todo.text}
                                                        onSave={(newText) => editTodo(todo.id, newText)}
                                                    />
                                                </div>
                                                {hasSubtasks && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {todo.subtasks.filter(t => t.completed).length}/{todo.subtasks.length} subtasks
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); togglePin(todo.id); }}
                                                    className={`p-2 rounded-lg transition-all duration-200 ${todo.pinned
                                                        ? 'text-foreground'
                                                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground opacity-0 group-hover:opacity-100'
                                                        }`}
                                                >
                                                    <Pin size={20} className={todo.pinned ? 'fill-current' : ''} />
                                                </button>

                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleExpand(todo.id); }}
                                                    className={`p-2 rounded-lg transition-all duration-200 ${todo.expanded ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                                                >
                                                    <ChevronDown size={20} className={`transition-transform duration-300 ${todo.expanded ? 'rotate-180' : ''}`} />
                                                </button>

                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteTodo(todo.id) }}
                                                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-secondary/50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Section */}
                                        <div
                                            className={`transition-all duration-300 ease-in-out overflow-hidden ${todo.expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                                                }`}
                                        >
                                            <div className="px-4 pb-4 bg-muted/20">
                                                <div className="space-y-1 pl-[34px] pt-3 relative">

                                                    {/* Connecting Line */}
                                                    <div className="absolute left-[21px] top-0 bottom-6 w-px bg-border"></div>

                                                    {/* Subtasks List */}
                                                    {todo.subtasks.map(st => (
                                                        <div key={st.id} className="group/sub flex items-center gap-3 min-h-[40px] hover:bg-muted/50 -ml-2 px-2 py-2 rounded-lg transition-colors">
                                                            <div className="relative z-10">
                                                                <Checkbox checked={st.completed} onClick={() => toggleSubtask(todo.id, st.id)} size="sm" />
                                                            </div>
                                                            <div className={`text-base flex-1 transition-colors ${st.completed ? 'text-muted-foreground line-through' : 'text-foreground/90'}`}>
                                                                <EditableText
                                                                    text={st.text}
                                                                    onSave={(newText) => editSubtask(todo.id, st.id, newText)}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => deleteSubtask(todo.id, st.id)}
                                                                className="opacity-0 group-hover/sub:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}

                                                    {/* Add Subtask Input */}
                                                    <form
                                                        onSubmit={(e) => handleAddSubtask(e, todo.id)}
                                                        className="flex items-center gap-3 py-1 -ml-2 px-2"
                                                    >
                                                        <div className="w-4 h-4 flex items-center justify-center relative z-10">
                                                            <Plus size={14} className="text-muted-foreground" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            value={newSubtaskInputs[todo.id] || ''}
                                                            onChange={(e) => setNewSubtaskInputs(prev => ({ ...prev, [todo.id]: e.target.value }))}
                                                            placeholder="Add a step..."
                                                            className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground p-0 focus:ring-0"
                                                        />
                                                    </form>

                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TodosPage;
