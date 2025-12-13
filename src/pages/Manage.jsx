import React, { useState, useEffect, useRef } from 'react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Masonry from '../components/Masonry';
import ProductForm from '../components/ProductForm';
import { supabase } from '../supabase';
import { Upload, Loader2, CheckCircle, Search, Trash2, Plus, X, IndianRupee, Settings, ArrowLeft, FileSpreadsheet, Download, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// --- Component: Bulk Upload ---
const BulkUpload = ({ onComplete }) => {
    const [step, setStep] = useState(1);
    const [csvFile, setCsvFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    // Helper: Simple CSV Parser
    const parseCSV = (text) => {
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        return lines.slice(1).map((line, index) => {
            const values = line.split(',');
            const entry = {};
            headers.forEach((h, i) => {
                entry[h] = values[i]?.trim();
            });
            // Add internal ID for UI handling
            entry._id = `row-${index}`;
            entry._imageFile = null; // Local image file
            entry._status = 'pending'; // pending, uploading, done, error
            return entry;
        });
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setCsvFile(file);

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            const data = parseCSV(text);
            setParsedData(data);
            setStep(2);
        };
        reader.readAsText(file);
    };

    const handleRowImageChange = (rowId, file) => {
        setParsedData(prev => prev.map(item =>
            item._id === rowId ? { ...item, _imageFile: file } : item
        ));
    };

    const handleRowUpdate = (rowId, field, value) => {
        setParsedData(prev => prev.map(item =>
            item._id === rowId ? { ...item, [field]: value } : item
        ));
    };

    const handleRemoveRow = (rowId) => {
        setParsedData(prev => prev.filter(item => item._id !== rowId));
    };

    const handleBulkSubmit = async () => {
        setIsProcessing(true);
        setUploadProgress({ current: 0, total: parsedData.length });

        let completed = 0;

        for (const item of parsedData) {
            try {
                // Update item status to processing
                setParsedData(prev => prev.map(p => p._id === item._id ? { ...p, _status: 'uploading' } : p));

                let publicUrl = null;

                // 1. Upload Image (if local file exists)
                if (item._imageFile) {
                    const fileExt = item._imageFile.name.split('.').pop();
                    const fileName = `bulk_${Date.now()}_${Math.random()}.${fileExt}`;
                    const { error: uploadError } = await supabase.storage.from('products').upload(fileName, item._imageFile);
                    if (uploadError) throw uploadError;
                    const { data } = supabase.storage.from('products').getPublicUrl(fileName);
                    publicUrl = data.publicUrl;
                } else if (item.image && item.image.startsWith('http')) {
                    publicUrl = item.image; // Keep existing URL if valid
                }

                // 2. Prepare Data
                const tagsArray = item.tags ? item.tags.split(';').map(c => c.trim()).filter(c => c) : []; // Assume semicolon in CSV for array
                let priceValue = 'Free';
                if (item.price_type === 'credits') priceValue = `${item.price} Credits`;

                // 3. Insert
                const { error: insertError } = await supabase.from('products').insert([{
                    title: item.title,
                    description: item.description,
                    image: publicUrl,
                    price: priceValue,
                    tags: tagsArray,
                    likes: 0,
                    views: 0
                }]);

                if (insertError) throw insertError;

                // Mark Done
                setParsedData(prev => prev.map(p => p._id === item._id ? { ...p, _status: 'success' } : p));

            } catch (error) {
                console.error("Bulk upload error for row:", item, error);
                setParsedData(prev => prev.map(p => p._id === item._id ? { ...p, _status: 'error' } : p));
            }

            completed++;
            setUploadProgress(prev => ({ ...prev, current: completed }));
        }

        setIsProcessing(false);
        setTimeout(() => {
            alert("Bulk upload completed!");
            onComplete();
        }, 1000);
    };

    const downloadTemplate = () => {
        const headers = "title,description,price_type,price,tags,image_url_optional";
        const row1 = "Example Tool,A great tool for X,free,,SaaS;AI,";
        const row2 = "Credit Tool,Worth 5 credits,credits,5,Design;Assets,";
        const blob = new Blob([headers + "\n" + row1 + "\n" + row2], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "products_template.csv";
        a.click();
    };

    return (
        <div className="w-full">
            {/* Stepper Header */}
            <div className="flex items-center justify-center mb-8">
                <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center font-bold">1</div>
                    <span className="font-medium">Upload JSON/CSV</span>
                </div>
                <div className="w-16 h-0.5 bg-border mx-4" />
                <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center font-bold">2</div>
                    <span className="font-medium">Map & Review</span>
                </div>
                <div className="w-16 h-0.5 bg-border mx-4" />
                <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center font-bold">3</div>
                    <span className="font-medium">Finish</span>
                </div>
            </div>

            {/* Step 1: Upload */}
            {step === 1 && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl p-16 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <FileSpreadsheet size={64} className="text-muted-foreground mb-6" />
                    <h3 className="text-xl font-bold mb-2">Upload Products CSV</h3>
                    <p className="text-muted-foreground text-center max-w-sm mb-8">
                        Drag and drop your CSV file here, or click to browse.
                        Make sure to follow the template format.
                    </p>

                    <div className="flex gap-4">
                        <label className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold cursor-pointer hover:bg-primary/90 transition-all flex items-center gap-2">
                            <Upload size={18} />
                            Select File
                            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <button onClick={downloadTemplate} className="bg-secondary text-foreground px-6 py-3 rounded-xl font-bold hover:bg-secondary/80 transition-all flex items-center gap-2">
                            <Download size={18} />
                            Template
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Review Grid */}
            {step === 2 && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold">Review {parsedData.length} Items</h3>
                        <div className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
                            Tip: You can manually attach images to each row below.
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2">
                        {parsedData.map((item, idx) => (
                            <div key={item._id} className="bg-card border border-border rounded-xl p-4 flex gap-6 items-start shadow-sm relative group">
                                {/* Image Uploader Mini */}
                                <div className="w-24 h-24 flex-shrink-0 bg-muted rounded-lg border border-border overflow-hidden relative">
                                    {item._imageFile ? (
                                        <img src={URL.createObjectURL(item._imageFile)} className="w-full h-full object-cover" />
                                    ) : item.image ? (
                                        <img src={item.image} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                            <ImageIcon size={24} opacity={0.5} />
                                        </div>
                                    )}
                                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                                        <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">Change</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleRowImageChange(item._id, e.target.files[0])} />
                                    </label>
                                </div>

                                {/* Fields */}
                                <div className="flex-1 grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase text-muted-foreground font-bold">Title</label>
                                        <input
                                            value={item.title || ''}
                                            onChange={(e) => handleRowUpdate(item._id, 'title', e.target.value)}
                                            className="w-full bg-input border border-border rounded px-2 py-1 text-sm font-medium"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase text-muted-foreground font-bold">Tags (semicolon split)</label>
                                        <input
                                            value={item.tags || ''}
                                            onChange={(e) => handleRowUpdate(item._id, 'tags', e.target.value)}
                                            className="w-full bg-input border border-border rounded px-2 py-1 text-sm text-muted-foreground"
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[10px] uppercase text-muted-foreground font-bold">Description</label>
                                        <textarea
                                            value={item.description || ''}
                                            onChange={(e) => handleRowUpdate(item._id, 'description', e.target.value)}
                                            rows={2}
                                            className="w-full bg-input border border-border rounded px-2 py-1 text-sm leading-tight resize-none"
                                        />
                                    </div>
                                </div>

                                {/* Status Flag for future upload */}
                                <div className="absolute top-2 right-2 flex flex-col gap-2">
                                    <button onClick={() => handleRemoveRow(item._id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-md transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end pt-4 border-t border-border">
                        <button
                            onClick={handleBulkSubmit}
                            disabled={isProcessing}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all shadow-lg flex items-center gap-2"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    Uploading ({uploadProgress.current}/{uploadProgress.total})
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={20} />
                                    Upload All
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Manage = ({ navigateOnly }) => {
    const gridRef = useRef(null);
    const [activeTab, setActiveTab] = useState('manage'); // 'manage' or 'add'
    const [addMode, setAddMode] = useState('single'); // 'single' | 'bulk'
    
    // Manage List State
    const [products, setProducts] = useState([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [editingItem, setEditingItem] = useState(null);

    // Fetch Products (Manage Mode)
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("Error fetching products:", error);
                }

                if (data) {
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
                }
            } catch (err) {
                console.error("Error fetching products:", err);
            }
        };

        fetchProducts();
    }, [refreshTrigger, activeTab]);

    const handleDelete = async (id, imageUrl) => {
        if (!window.confirm("Delete this item?")) return;
        try {
            // 1. Delete Image if exists
            if (imageUrl && imageUrl.includes('/products/')) {
                // Extract filename from URL (assumes standard Supabase storage URL format)
                const imagePath = imageUrl.split('/products/').pop();
                if (imagePath) {
                    const { error: storageError } = await supabase.storage
                        .from('products')
                        .remove([imagePath]);
                    
                    if (storageError) {
                        console.warn("Could not delete image from storage:", storageError);
                        // We continue to delete the record even if image delete fails, 
                        // but logging it is good.
                    }
                }
            }

            // 2. Delete Record
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
                        <>
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
                                        onItemClick={setEditingItem}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
                                        <Search size={48} strokeWidth={1} />
                                        <p>No items found in your collection.</p>
                                    </div>
                                )}
                            </div>

                            {/* Edit Modal */}
                            {editingItem && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
                                    <div className="bg-card w-full max-w-6xl rounded-3xl p-8 lg:p-10 relative overflow-hidden my-auto border border-border shadow-2xl">
                                        <button 
                                            onClick={() => setEditingItem(null)} 
                                            className="absolute top-4 right-4 bg-muted hover:bg-destructive hover:text-white text-muted-foreground p-2 rounded-full transition-all z-20"
                                        >
                                            <X size={20} />
                                        </button>
                                        <ProductForm 
                                            initialData={editingItem} 
                                            isEditMode={true} 
                                            onSuccess={() => { setEditingItem(null); setRefreshTrigger(p => p+1); }}
                                            onCancel={() => setEditingItem(null)}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* ADD FORM STYLE - Forced Split View */
                        <div className="max-w-6xl mx-auto">
                            {/* Mode Toggle */}
                            <div className="flex justify-center mb-8">
                                <div className="bg-muted p-1 rounded-xl inline-flex">
                                    <button
                                        onClick={() => setAddMode('single')}
                                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${addMode === 'single' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Single Entry
                                    </button>
                                    <button
                                        onClick={() => setAddMode('bulk')}
                                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${addMode === 'bulk' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Bulk Upload
                                    </button>
                                </div>
                            </div>

                            <div className="bg-card border border-border rounded-3xl p-8 lg:p-10 shadow-2xl relative overflow-hidden">
                                {addMode === 'bulk' ? (
                                    <BulkUpload onComplete={() => { setActiveTab('manage'); setRefreshTrigger(p => p + 1); }} />
                                ) : (
                                    <ProductForm onSuccess={() => { setActiveTab('manage'); setRefreshTrigger(p => p + 1); }} />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default Manage;
