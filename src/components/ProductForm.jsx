import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { Upload, Loader2, CheckCircle, Plus, X, Link as LinkIcon, Crop as CropIcon, ZoomIn, ZoomOut } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';

const ProductForm = ({ initialData, onSuccess, onCancel, isEditMode = false }) => {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priceType: 'free',
        priceAmount: '',
        chips: '',
        image: null
    });

    // Image Handling
    const [previewUrl, setPreviewUrl] = useState(null);
    const [showUrlInput, setShowUrlInput] = useState(false);

    // Cropper State
    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isCropping, setIsCropping] = useState(false);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    useEffect(() => {
        if (initialData) {
            let pType = 'free';
            let pAmount = '';

            if (initialData.price && initialData.price !== 'Free') {
                if (initialData.price.toLowerCase().includes('credits')) {
                    pType = 'credits';
                    pAmount = initialData.price.replace(/[^0-9]/g, '');
                }
            }

            setFormData({
                title: initialData.title || '',
                description: initialData.description || '',
                priceType: pType,
                priceAmount: pAmount,
                chips: Array.isArray(initialData.tags) ? initialData.tags.join(', ') : (initialData.tags || ''),
                image: null
            });
            setPreviewUrl(initialData.image || initialData.img || null);
        }
    }, [initialData]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // --- Image Processing ---

    const readFile = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result));
            reader.readAsDataURL(file);
        });
    };

    const handleImageChange = async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageDataUrl = await readFile(file);
            setImageSrc(imageDataUrl);
            setIsCropping(true);
            setShowUrlInput(false);
        }
    };

    const handlePaste = async (e) => {
        if (e.clipboardData.files.length > 0) {
            const file = e.clipboardData.files[0];
            if (file.type.startsWith('image/')) {
                const imageDataUrl = await readFile(file);
                setImageSrc(imageDataUrl);
                setIsCropping(true);
                setShowUrlInput(false);
                e.preventDefault();
            }
        } else {
            const text = e.clipboardData.getData('text');
            if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
                setFormData(prev => ({ ...prev, image: null })); // URL mode
                setImageSrc(text); // For cropping URL images too!
                setIsCropping(true);
                e.preventDefault();
            }
        }
    };

    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const performCrop = async () => {
        try {
            const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            const croppedUrl = URL.createObjectURL(croppedImageBlob);

            // Convert blob to file for upload
            const file = new File([croppedImageBlob], "cropped_image.jpg", { type: "image/jpeg" });

            setPreviewUrl(croppedUrl);
            setFormData(prev => ({ ...prev, image: file }));
            setIsCropping(false);
            setImageSrc(null);
        } catch (e) {
            console.error(e);
            alert("Failed to crop image");
        }
    };

    const handleRemoveImage = () => {
        setFormData(prev => ({ ...prev, image: null }));
        setPreviewUrl(null);
        setShowUrlInput(false);
        setImageSrc(null);
    };

    // --- Submissions ---

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title) return alert("Please provide a title.");

        setLoading(true);
        try {
            let publicUrl = previewUrl;

            // If new file upload exists (from cropper or otherwise if we skipped logic)
            if (formData.image) {
                const fileExt = formData.image.name.split('.').pop() || 'jpg';
                const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage.from('products').upload(fileName, formData.image);
                if (uploadError) throw uploadError;
                const { data } = supabase.storage.from('products').getPublicUrl(fileName);
                publicUrl = data.publicUrl;
            } else if (!previewUrl) {
                publicUrl = null;
            }
            // Note: If previewUrl is just a string URL (link mode without crop), it is preserved.
            // But our new flow forces crop for everything entered via paste/upload. 
            // If they just typed a URL in the box, we didn't crop it.

            const tagsArray = [...new Set(formData.chips.split(',').map(c => c.trim()).filter(c => c))];
            let priceValue = 'Free';
            if (formData.priceType === 'credits') priceValue = `${formData.priceAmount} Credits`;

            const productData = {
                title: formData.title,
                description: formData.description,
                image: publicUrl,
                price: priceValue,
                tags: tagsArray,
            };

            if (isEditMode && initialData?.id) {
                const { error } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', initialData.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('products')
                    .insert([{ ...productData, likes: 0, views: 0 }]);
                if (error) throw error;
            }

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                if (onSuccess) onSuccess();
            }, 1500);

            if (!isEditMode) {
                setFormData({ title: '', description: '', priceType: 'free', priceAmount: '', chips: '', image: null });
                setPreviewUrl(null);
            }

        } catch (error) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-full relative">
            {/* Cropper Modal Overlay */}
            {isCropping && imageSrc && (
                <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="w-full max-w-3xl h-[60vh] relative border-2 border-border rounded-3xl overflow-hidden bg-black shadow-2xl">
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={1000 / 344}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                        />
                    </div>

                    <div className="flex items-center gap-6 mt-6 w-full max-w-lg">
                        <ZoomOut size={16} className="text-muted-foreground" />
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby="Zoom"
                            onChange={(e) => setZoom(e.target.value)}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <ZoomIn size={16} className="text-muted-foreground" />
                    </div>

                    <div className="flex gap-4 mt-8">
                        <button
                            onClick={() => { setIsCropping(false); setImageSrc(null); }}
                            className="px-6 py-2.5 rounded-xl font-semibold bg-secondary hover:bg-muted text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={performCrop}
                            className="px-8 py-2.5 rounded-xl font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center gap-2"
                        >
                            <CropIcon size={18} />
                            Apply Crop
                        </button>
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 w-full h-full">
                {/* Left Column: Header + Image Upload */}
                <div className="flex flex-col h-full gap-6">
                    <div>
                        <h2 className="text-3xl font-bold text-foreground tracking-tight">
                            {isEditMode ? 'Edit Entry' : 'New Entry'}
                        </h2>
                        <p className="text-muted-foreground mt-2">
                            {isEditMode ? 'Modify item details.' : 'Add a new item to the grid.'}
                        </p>
                    </div>

                    <div
                        className={`relative flex-1 group border-2 border-dashed rounded-3xl transition-all duration-300 overflow-hidden flex flex-col justify-center items-center min-h-[350px] bg-muted/50 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/20 outline-none ${previewUrl ? 'border-ring' : 'border-border hover:border-ring hover:bg-muted'}`}
                        onPaste={handlePaste}
                        tabIndex="0"
                    >
                        <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />

                        {previewUrl ? (
                            <div className="relative w-full h-full">
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                    <p className="text-white font-medium bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">Change Image</p>
                                </div>
                                <button type="button" onClick={(e) => { e.preventDefault(); handleRemoveImage(); }} className="absolute top-4 right-4 bg-black/60 hover:bg-destructive text-white p-2.5 rounded-full backdrop-blur-md transition-all z-20 pointer-events-auto">
                                    <X size={18} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground p-6 text-center w-full z-20 pointer-events-none">
                                <div className="bg-muted p-5 rounded-2xl mb-5 group-hover:scale-110 transition-transform duration-300 border border-border shadow-xl">
                                    <Upload size={32} className="text-muted-foreground" />
                                </div>
                                <p className="text-lg font-medium text-foreground">Upload Cover Image</p>
                                <p className="text-sm text-muted-foreground mt-2 max-w-[240px] leading-relaxed">
                                    Drag & drop, click to browse <br /> or <span className="text-foreground font-semibold">Ctrl+V</span> to paste
                                </p>

                                {/* URL Input Helper */}
                                <div className="mt-6 pointer-events-auto z-30 w-full max-w-[240px]">
                                    {showUrlInput ? (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                                            <input
                                                type="text"
                                                placeholder="https://..."
                                                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-ring"
                                                value={previewUrl || ''}
                                                onChange={(e) => {
                                                    // For direct URL input without cropping we just set previewUrl
                                                    setPreviewUrl(e.target.value);
                                                    setFormData(prev => ({ ...prev, image: null }));
                                                }}
                                                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setShowUrlInput(false) }}
                                                className="p-1.5 hover:bg-muted rounded-md"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setShowUrlInput(true);
                                            }}
                                            className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-full border border-transparent hover:border-border hover:bg-background transition-all"
                                        >
                                            <LinkIcon size={12} />
                                            <span>Or paste image URL</span>
                                        </button>
                                    )}
                                </div>
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
                    {(formData.priceType === 'credits') && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1 mb-2 block">Credits</label>
                            <input
                                type="number"
                                name="priceAmount"
                                value={formData.priceAmount}
                                onChange={handleInputChange}
                                placeholder="Number of credits"
                                className="w-full bg-input border border-border rounded-xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-all font-medium"
                            />
                        </div>
                    )}

                    {/* Submit Button */}
                    <div className="pt-4 flex gap-4">
                        {onCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                className="flex-1 bg-secondary text-secondary-foreground font-bold text-base py-4 rounded-xl hover:bg-secondary/80 transition-all shadow-sm"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-1 bg-primary text-primary-foreground font-bold text-base py-4 rounded-xl hover:bg-primary/90 transition-all transform active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-white/5 ${!onCancel ? 'w-full' : ''}`}
                        >
                            {loading ? <Loader2 size={20} className="animate-spin" /> : success ? <CheckCircle size={20} className="text-green-600" /> : <>{isEditMode ? 'Save Changes' : <><Plus size={20} /> Create Entry</>}</>}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ProductForm;
