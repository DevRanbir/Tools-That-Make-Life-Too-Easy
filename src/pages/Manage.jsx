import React, { useState, useEffect, useRef } from 'react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import { supabase } from '../supabase';
import { Upload, Loader2, CheckCircle, Search, Trash2, Plus, X, IndianRupee, Settings, ArrowLeft } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const Manage = ({ navigateOnly }) => {
    const gridRef = useRef(null);
    const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'add'

    // Add Form State
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priceType: 'free',
        priceAmount: '',
        chips: '',
        image: null
    });

    // Manage List State
    const [products, setProducts] = useState([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Fetch Products (Manage Mode)
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;

                // Process for Masonry
                const processed = data.map(item => ({
                    ...item,
                    img: item.image,
                    height: 0, // Handled by CSS
                    url: '#',
                    // Delete Handler
                    onDelete: (id) => handleDelete(id, item.image)
                }));

                setProducts(processed);
            } catch (err) {
                console.error("Error fetching products:", err);
            }
        };

        fetchProducts();
    }, [refreshTrigger, activeTab]);

    // Form Handlers
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData(prev => ({ ...prev, image: file }));
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleRemoveImage = () => {
        setFormData(prev => ({ ...prev, image: null }));
        setPreviewUrl(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title) return alert("Please provide a title.");

        setLoading(true);
        try {
            let publicUrl = null;
            if (formData.image) {
                const fileExt = formData.image.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage.from('products').upload(fileName, formData.image);
                if (uploadError) throw uploadError;
                const { data } = supabase.storage.from('products').getPublicUrl(fileName);
                publicUrl = data.publicUrl;
            }

            const tagsArray = [...new Set(formData.chips.split(',').map(c => c.trim()).filter(c => c))];
            let priceValue = 'Free';
            if (formData.priceType === 'paid') priceValue = `₹${formData.priceAmount}`;
            else if (formData.priceType === 'credits') priceValue = `${formData.priceAmount} Credits`;

            const { error: insertError } = await supabase.from('products').insert([{
                title: formData.title,
                description: formData.description,
                image: publicUrl,
                price: priceValue,
                tags: tagsArray,
                likes: 0,
                views: 0
            }]);

            if (insertError) throw insertError;

            setSuccess(true);
            setFormData({ title: '', description: '', priceType: 'free', priceAmount: '', chips: '', image: null });
            setPreviewUrl(null);
            setTimeout(() => setSuccess(false), 3000);
            setRefreshTrigger(prev => prev + 1);
            setActiveTab('manage'); // Switch back to list view on success
        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id, imageUrl) => {
        if (!window.confirm("Delete this item?")) return;
        try {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) throw error;
            setRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error("Error deleting:", error);
            alert("Delete failed");
        }
    };

    const manageTabs = [
        { id: 'home', label: 'Home', icon: <ArrowLeft size={14} /> },
        { id: 'manage', label: 'Manage Cards', icon: <Search size={14} /> },
        { id: 'add', label: 'Add New', icon: <Plus size={14} /> }
    ];

    const handleTabChange = (id) => {
        if (id === 'home') {
            navigateOnly('home');
        } else {
            setActiveTab(id);
        }
    };

    return (
        <div className="home-page">
            {/* Hero Section (Reused Styling) */}
            <div className="hero-sticky-wrapper">
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                        Add, edit, or delete items from your collection.
                    </p>

                    {/* Reuse Hero Search Layout for Aesthetics */}
                    <div className="hero-search-wrapper" style={{ opacity: 0.8, pointerEvents: 'none' }}>
                        {/* Visual only in Manage page usually, but we keep it for "Match Home" request */}
                        <div className="big-search-bar">
                            <div className="flex items-center gap-2 w-full text-zinc-500">
                                <Settings size={18} />
                                <span>Dashboard Control Center</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="content-overlay content-area">
                {/* Sticky Nav */}
                <div className="sticky-nav-container">
                    <MagneticMorphingNav
                        activeTab={activeTab}
                        onTabChange={handleTabChange}
                        tabs={manageTabs}
                    />
                </div>

                <div className="max-w-[1200px] mx-auto px-5 w-full pt-10">
                    {/* Content Section */}
                    {activeTab === 'manage' ? (
                        <div ref={gridRef} className="masonry-wrapper">
                            <div className="flex items-center justify-between mb-6">
                                <div className="text-zinc-500 text-sm font-mono">Total Items: {products.length}</div>
                            </div>

                            {products.length > 0 ? (
                                <Masonry
                                    items={products}
                                    ease="power3.out"
                                    duration={0.6}
                                    stagger={0.05}
                                    animateFrom="bottom"
                                    scaleOnHover={true}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
                                    <Search size={48} strokeWidth={1} />
                                    <p>No items found in your collection.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ADD FORM STYLE - Forced Split View */
                        <div className="max-w-6xl mx-auto">
                            <div className="bg-card border border-border rounded-3xl p-8 lg:p-10 shadow-2xl relative overflow-hidden">
                                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">

                                    {/* Left Column: Header + Image Upload */}
                                    <div className="flex flex-col h-full gap-6">
                                        <div>
                                            <h2 className="text-3xl font-bold text-foreground tracking-tight">New Entry</h2>
                                            <p className="text-muted-foreground mt-2">Add a new item to the grid.</p>
                                        </div>

                                        <div className={`relative flex-1 group border-2 border-dashed rounded-3xl transition-all duration-300 overflow-hidden flex flex-col justify-center items-center min-h-[350px] bg-muted/50 ${previewUrl ? 'border-ring' : 'border-border hover:border-ring hover:bg-muted'}`}>
                                            <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />

                                            {previewUrl ? (
                                                <div className="relative w-full h-full">
                                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                        <p className="text-white font-medium bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">Change Image</p>
                                                    </div>
                                                    <button type="button" onClick={(e) => { e.preventDefault(); handleRemoveImage(); }} className="absolute top-4 right-4 bg-black/60 hover:bg-destructive text-white p-2.5 rounded-full backdrop-blur-md transition-all z-20">
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                                                    <div className="bg-muted p-5 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300 border border-border shadow-xl">
                                                        <Upload size={32} className="text-muted-foreground" />
                                                    </div>
                                                    <p className="text-lg font-medium text-foreground">Upload Cover Image</p>
                                                    <p className="text-sm text-muted-foreground mt-2 max-w-[240px] leading-relaxed">
                                                        Drag & drop or click to browse. <br />
                                                        <span className="text-muted-foreground/80">Supports SVG, PNG, JPG</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right Column: Inputs */}
                                    <div className="flex flex-col justify-center gap-6 py-2">

                                        {/* Row: Title */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Title</label>
                                            <input
                                                type="text"
                                                name="title"
                                                value={formData.title}
                                                onChange={handleInputChange}
                                                placeholder="e.g. Linear"
                                                className="w-full bg-input border border-border rounded-xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 transition-all font-medium"
                                            />
                                        </div>

                                        {/* Row: Description */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Description</label>
                                            <textarea
                                                name="description"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                placeholder="Describe the tool..."
                                                rows="4"
                                                className="w-full bg-input border border-border rounded-xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 transition-all resize-none font-medium leading-relaxed"
                                            />
                                        </div>

                                        {/* Row: Price & Tags Grid */}
                                        <div className="grid grid-cols-2 gap-5">
                                            {/* Price */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Pricing</label>
                                                <div className="relative">
                                                    <select
                                                        value={formData.priceType}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, priceType: e.target.value }))}
                                                        className="w-full bg-input border border-border rounded-xl px-5 py-4 text-foreground outline-none appearance-none cursor-pointer focus:border-ring transition-all font-medium"
                                                    >
                                                        <option value="free">Free</option>
                                                        <option value="paid">Paid</option>
                                                        <option value="credits">Credits</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Tags */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Tags</label>
                                                <input
                                                    type="text"
                                                    name="chips"
                                                    value={formData.chips}
                                                    onChange={handleInputChange}
                                                    placeholder="SaaS, AI..."
                                                    className="w-full bg-input border border-border rounded-xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-all font-medium"
                                                />
                                            </div>
                                        </div>

                                        {/* Conditional Amount Input */}
                                        {(formData.priceType === 'paid' || formData.priceType === 'credits') && (
                                            <div className="animate-in fade-in slide-in-from-top-2">
                                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1 mb-2 block">{formData.priceType === 'paid' ? 'Amount' : 'Credits'}</label>
                                                <input
                                                    type="number"
                                                    name="priceAmount"
                                                    value={formData.priceAmount}
                                                    onChange={handleInputChange}
                                                    placeholder={formData.priceType === 'paid' ? "Amount in ₹" : "Number of credits"}
                                                    className="w-full bg-input border border-border rounded-xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-all font-medium"
                                                />
                                            </div>
                                        )}

                                        {/* Submit Button */}
                                        <div className="pt-4">
                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full bg-primary text-primary-foreground font-bold text-base py-4 rounded-xl hover:bg-primary/90 transition-all transform active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-white/5"
                                            >
                                                {loading ? <Loader2 size={20} className="animate-spin" /> : success ? <CheckCircle size={20} className="text-green-600" /> : <><Plus size={20} /> Create Entry</>}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default Manage;
