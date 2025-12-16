import React, { useState, useEffect, useRef } from 'react';
import { Drawer } from 'vaul';
import { supabase } from '../supabase';
import { X, Mail, Lock, ArrowRight, Sparkles, Upload, Check, Moon, Sun, Monitor, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cropper, CropperImage, CropperCropArea } from './ui/cropper';

const AuthDrawer = ({
    open,
    onOpenChange,
    startStep = 0,
    mode = 'default',
    user,
    darkMode,
    setDarkMode
}) => {
    // Auth State
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    // Flow State
    const [step, setStep] = useState(startStep); // 0: auth, 0.5: verify-email, 1: profile, 2: occupation, 3: preference
    const [onboardingData, setOnboardingData] = useState({
        username: '',
        avatar: null, // preview URL
        occupation: 'freelancer',
        preference: 'mixed'
    });

    const fileInputRef = useRef(null);

    // Cropper State
    const [isCropping, setIsCropping] = useState(false);
    const [originalImage, setOriginalImage] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [avatarBlob, setAvatarBlob] = useState(null);

    // Reset state when opening
    useEffect(() => {
        if (open) {
            setStep(startStep);
            setError(null);
            setIsSignUp(false);
            if (!user) {
                setEmail('');
                setPassword('');
            }
        }
    }, [open, startStep, user]);

    // Check for explicit bucket avatar
    const [bucketAvatarUrl, setBucketAvatarUrl] = useState(null);
    const [isCheckingBucket, setIsCheckingBucket] = useState(false);

    useEffect(() => {
        const checkBucketAvatar = async () => {
            if (user) {
                setIsCheckingBucket(true);
                // Check if file exists in bucket (async)
                const { data: files } = await supabase.storage
                    .from('avatars')
                    .list(user.id, {
                        limit: 1,
                        search: 'avatar.png'
                    });

                if (files && files.length > 0) {
                    const bucketUrl = supabase.storage
                        .from('avatars')
                        .getPublicUrl(`${user.id}/avatar.png`).data.publicUrl;
                    setBucketAvatarUrl(bucketUrl + `?t=${Date.now()}`);
                } else {
                    setBucketAvatarUrl(null);
                }
                setIsCheckingBucket(false);

                // Note: Onboarding data fill is moved out or dependent on this if needed
                // but keeping independent is fine for now
            }
        };

        checkBucketAvatar();
    }, [user, open]);

    // Pre-fill data if user exists (for onboarding mode)
    useEffect(() => {
        if (user) {
            setOnboardingData(prev => ({
                ...prev,
                username: user.user_metadata?.username || user.user_metadata?.full_name?.replace(/\s+/g, '').toLowerCase().slice(0, 15) || '',
                occupation: user.user_metadata?.occupation || 'freelancer',
                preference: user.user_metadata?.sort_preference || 'mixed',
                avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || null
            }));
        }
    }, [user, open]);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: 'https://tools-that-make-life-too-easy.appwrite.network/'
                    }
                });
                if (error) throw error;

                if (data.user && !data.session) {
                    setStep(0.5);
                    return;
                }

                if (data.user && data.session) {
                    setStep(1);
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onOpenChange(false);
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: 'https://tools-that-make-life-too-easy.appwrite.network/',
                },
            });
            if (error) throw error;
        } catch (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setOriginalImage(url);
            setIsCropping(true);
        }
        e.target.value = ''; // Reset input
    };

    const getCroppedImg = (imageSrc, crop) => {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.src = imageSrc;
            image.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = crop.width;
                canvas.height = crop.height;

                ctx.drawImage(
                    image,
                    crop.x,
                    crop.y,
                    crop.width,
                    crop.height,
                    0,
                    0,
                    crop.width,
                    crop.height
                );

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas is empty'));
                        return;
                    }
                    resolve(blob);
                }, 'image/png');
            };
            image.onerror = (e) => { reject(e); };
        });
    };

    const handleCropConfirm = async () => {
        if (!originalImage || !crop.width || !crop.height) return;
        try {
            const blob = await getCroppedImg(originalImage, crop);
            const url = URL.createObjectURL(blob);
            setAvatarBlob(blob);
            setOnboardingData(prev => ({ ...prev, avatar: url }));
            setIsCropping(false);
        } catch (e) {
            console.error(e);
            alert("Failed to crop image");
        }
    };

    const validateUsername = async (username) => {
        setError(null);
        setLoading(true);

        // 1. Check characters
        const regex = /^[a-zA-Z0-9_#-]+$/;
        if (!regex.test(username)) {
            setError("Username can only contain letters, numbers, #, _, and -");
            setLoading(false);
            return false;
        }

        // 2. Check uniqueness (case-insensitive)
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (!session) return false;

            const { data, error } = await supabase
                .from('user_details')
                .select('id')
                .ilike('username', username)
                .maybeSingle();

            if (error) {
                console.error("Validation check failed", error);
                setError("Could not validate username. Please try again.");
                setLoading(false);
                return false;
            }

            if (data && data.id !== session.user.id) {
                setError("Username is already taken.");
                setLoading(false);
                return false;
            }

        } catch (err) {
            console.error(err);
            setError("Validation error.");
            setLoading(false);
            return false;
        }

        setLoading(false);
        return true;
    };

    const handleOnboardingSubmit = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) {
                throw new Error("Auth session missing! Please verify your email or log in again.");
            }

            let finalAvatarUrl = null;

            // Upload to Supabase Storage if we have a blob
            if (avatarBlob) {
                const fileName = `${session.user.id}/avatar.png`;
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, avatarBlob, { upsert: true });

                if (uploadError) {
                    console.error("Storage upload failed:", uploadError);
                    throw new Error("Failed to upload profile picture. Please try again.");
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(fileName);

                finalAvatarUrl = `${publicUrl}?t=${Date.now()}`;
            } else if (onboardingData.avatar && onboardingData.avatar.startsWith('http')) {
                // Use the existing URL (could be Google PFP or previously set avatar)
                finalAvatarUrl = onboardingData.avatar;
            } else if (user?.user_metadata?.avatar_url) {
                // Fallback to what we already have if nothing changed
                finalAvatarUrl = user.user_metadata.avatar_url;
            }

            // Determine avatar preference
            let preferenceType = 'none';
            if (finalAvatarUrl) {
                if (finalAvatarUrl.includes('googleusercontent.com')) {
                    preferenceType = 'social';
                } else {
                    preferenceType = 'custom';
                }
            }

            const updates = {
                username: onboardingData.username,
                occupation: onboardingData.occupation,
                sort_preference: onboardingData.preference,
                avatar_preference: preferenceType, // Save preference
                updated_at: new Date(),
                role: user?.user_metadata?.role || 'freebiee',
                credits: user?.user_metadata?.credits !== undefined ? user.user_metadata.credits : 0,
                // Ensure we save the avatar_url if we found one
                ...(finalAvatarUrl ? { avatar_url: finalAvatarUrl } : {})
            };

            // No need to explicitly add avatar_url here as it's added above if it exists
            // BUT, if we are updating user metadata, we should include it if we have it

            const { error } = await supabase.auth.updateUser({
                data: updates
            });

            if (error) throw error;

            // Also create/update the user_details row
            const { error: profileError } = await supabase
                .from('user_details')
                .upsert({
                    id: session.user.id,
                    username: onboardingData.username,
                    occupation: onboardingData.occupation,
                    sort_preference: onboardingData.preference,
                    avatar_preference: preferenceType, // Sync to table
                    avatar_url: finalAvatarUrl || `https://ui-avatars.com/api/?name=${onboardingData.username}`,
                    role: updates.role,
                    credits: updates.credits
                });

            if (profileError) console.error("Error creating user profile:", profileError);
            onOpenChange(false);
            window.location.reload();
        } catch (error) {
            console.error(error);
            setError(error.message || "Failed to save profile.");
        } finally {
            setLoading(false);
        }
    };

    const stepVariants = {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 }
    };

    return (
        <Drawer.Root shouldScaleBackground open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
                <Drawer.Content className="bg-background/95 backdrop-blur-3xl flex flex-col rounded-t-[20px] h-[85vh] mt-24 fixed bottom-0 inset-x-0 mx-auto w-full max-w-2xl z-[200] border-t border-white/10 outline-none shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">

                    <div className="sr-only">
                        <Drawer.Title>Authentication</Drawer.Title>
                        <Drawer.Description>Sign in or create an account</Drawer.Description>
                    </div>

                    {/* Handle bar */}
                    <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mt-4 mb-2" />

                    <div className="flex-1 overflow-y-auto p-8 relative">
                        {/* Close Button */}
                        <div className="absolute top-0 right-8 z-50">
                            <button
                                onClick={() => onOpenChange(false)}
                                className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="w-full max-w-md mx-auto h-full flex flex-col justify-center">
                            <AnimatePresence mode="wait">
                                {/* STEP 0: LOGIN / SIGNUP */}
                                {step === 0 && (
                                    <motion.div
                                        key="auth"
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        variants={stepVariants}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col"
                                    >
                                        <div className="mb-8 flex flex-col items-center text-center">
                                            <div className="w-16 h-16 bg-gradient-to-tr from-primary/20 to-primary/5 rounded-2xl flex items-center justify-center border border-border mb-6 shadow-sm ring-1 ring-white/5 mx-auto">
                                                <Sparkles size={28} className="text-primary" fill="currentColor" fillOpacity={0.2} />
                                            </div>
                                            <h2 className="text-3xl font-bold text-foreground tracking-tight mb-2">
                                                {isSignUp ? 'Create account' : 'Welcome back'}
                                            </h2>
                                            <p className="text-muted-foreground text-sm font-medium leading-relaxed max-w-xs mx-auto">
                                                {isSignUp ? 'Join to unlock powerful tools and sync your data across devices.' : 'Sign in to access your workspace.'}
                                            </p>
                                        </div>

                                        <form onSubmit={handleAuth} className="space-y-4">
                                            <div className="space-y-1.5">
                                                <div className="relative group">
                                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" size={18} />
                                                    <input
                                                        type="email"
                                                        required
                                                        value={email}
                                                        onChange={(e) => setEmail(e.target.value)}
                                                        className="w-full bg-secondary/30 border border-input rounded-xl py-3.5 pl-11 pr-4 text-foreground text-base outline-none focus:border-ring focus:bg-secondary/50 transition-all font-medium placeholder:text-muted-foreground"
                                                        placeholder="Email address"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <div className="relative group">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" size={18} />
                                                    <input
                                                        type="password"
                                                        required
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className="w-full bg-secondary/30 border border-input rounded-xl py-3.5 pl-11 pr-4 text-foreground text-base outline-none focus:border-ring focus:bg-secondary/50 transition-all font-medium placeholder:text-muted-foreground"
                                                        placeholder="Password"
                                                    />
                                                </div>
                                            </div>

                                            {error && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2"
                                                >
                                                    <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                                                    <p className="text-red-400 text-xs font-medium text-center flex-1">{error}</p>
                                                </motion.div>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 mt-2 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed"
                                            >
                                                {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
                                                {!loading && <ArrowRight size={18} strokeWidth={2.5} />}
                                            </button>
                                        </form>

                                        <div className="relative my-6">
                                            <div className="absolute inset-0 flex items-center">
                                                <span className="w-full border-t border-border" />
                                            </div>
                                            <div className="relative flex justify-center text-xs uppercase">
                                                <span className="bg-background px-2 text-muted-foreground font-medium">Or continue with</span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handleGoogleLogin}
                                            disabled={loading}
                                            className="w-full bg-secondary hover:bg-secondary/80 text-foreground font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm border border-border"
                                        >
                                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                                <path
                                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                    fill="#4285F4"
                                                />
                                                <path
                                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                    fill="#34A853"
                                                />
                                                <path
                                                    d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.83z"
                                                    fill="#FBBC05"
                                                />
                                                <path
                                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z"
                                                    fill="#EA4335"
                                                />
                                            </svg>
                                            Google
                                        </button>

                                        <div className="mt-8 text-center">
                                            <p className="text-muted-foreground text-sm font-medium">
                                                {isSignUp ? "Already have an account?" : "Don't have an account?"}
                                                <button
                                                    onClick={() => setIsSignUp(!isSignUp)}
                                                    className="text-foreground hover:text-primary ml-1.5 font-bold transition-colors inline-flex items-center gap-1 group"
                                                >
                                                    {isSignUp ? "Log in" : "Sign up"}
                                                </button>
                                            </p>
                                        </div>
                                    </motion.div>
                                )}

                                {/* STEP 0.5: VERIFY EMAIL */}
                                {step === 0.5 && (
                                    <motion.div
                                        key="verify-email"
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        variants={stepVariants}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col items-center text-center py-8"
                                    >
                                        <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6 ring-4 ring-secondary/50 animate-pulse">
                                            <Mail size={40} className="text-foreground" />
                                        </div>
                                        <h2 className="text-2xl font-bold text-foreground mb-2">Check your email</h2>
                                        <p className="text-muted-foreground text-base mb-8 leading-relaxed max-w-sm">
                                            We've sent a verification link to <span className="text-foreground font-bold">{email}</span>.<br />
                                            Please verify your email to continue setting up your account.
                                        </p>

                                        <button
                                            onClick={() => {
                                                setStep(0);
                                                setIsSignUp(false);
                                            }}
                                            className="w-full bg-secondary hover:bg-secondary/80 text-foreground font-bold py-3.5 rounded-xl transition-all"
                                        >
                                            Back to Login
                                        </button>
                                    </motion.div>
                                )}

                                {/* STEP 1: PROFILE SETUP */}
                                {step === 1 && (
                                    <motion.div
                                        key="profile"
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        variants={stepVariants}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col items-center"
                                    >
                                        <h2 className="text-2xl font-bold text-foreground mb-1">Setup Profile</h2>
                                        <p className="text-muted-foreground text-sm mb-8">How should we identify you?</p>

                                        {isCropping && originalImage ? (
                                            <div className="w-full flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
                                                <div className="relative w-full h-80 bg-secondary/50 rounded-xl overflow-hidden border border-border">
                                                    <Cropper
                                                        image={originalImage}
                                                        className="h-full w-full"
                                                        onCropChange={setCrop}
                                                    >
                                                        <CropperImage />
                                                        <CropperCropArea className="rounded-full" />
                                                    </Cropper>
                                                </div>
                                                <div className="flex gap-3 w-full">
                                                    <button
                                                        onClick={() => { setIsCropping(false); setOriginalImage(null); }}
                                                        className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-medium hover:bg-secondary/80 transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handleCropConfirm}
                                                        className="flex-1 py-3 rounded-xl bg-foreground text-background font-bold hover:opacity-90 transition"
                                                    >
                                                        Save Photo
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div
                                                    className="w-32 h-32 bg-secondary rounded-full flex items-center justify-center border-4 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors relative mb-8 group overflow-hidden shadow-sm"
                                                    onClick={() => fileInputRef.current?.click()}
                                                >
                                                    {onboardingData.avatar ? (
                                                        <img src={onboardingData.avatar} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1.5">
                                                            <Upload size={28} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Upload</span>
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-xs text-white font-bold uppercase tracking-wide">Change</span>
                                                    </div>
                                                </div>
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={handleFileSelect}
                                                />

                                                {/* CONFLICT RESOLUTION UI */}
                                                {user?.user_metadata?.picture && (
                                                    <div className="flex flex-col gap-2 mb-8 w-full">
                                                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider text-center">Choose Profile Picture</span>
                                                        <div className="flex items-center gap-3">
                                                            {/* Option 1: New (Blob) OR Saved (Bucket) OR Upload New */}
                                                            {avatarBlob ? (
                                                                <div
                                                                    className={`flex-1 p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-2 bg-secondary border-primary/50`}
                                                                    onClick={() => fileInputRef.current?.click()}
                                                                >
                                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                                        <img src={onboardingData.avatar} className="w-full h-full object-cover" alt="New" />
                                                                    </div>
                                                                    <span className="text-xs font-semibold">New</span>
                                                                </div>
                                                            ) : bucketAvatarUrl ? (
                                                                <div
                                                                    className={`flex-1 p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-2 ${onboardingData.avatar === bucketAvatarUrl ? 'bg-secondary border-primary/50' : 'hover:bg-secondary/50 border-border'}`}
                                                                    onClick={() => {
                                                                        setAvatarBlob(null);
                                                                        setOnboardingData(prev => ({ ...prev, avatar: bucketAvatarUrl }));
                                                                    }}
                                                                >
                                                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                                        <img src={bucketAvatarUrl} className="w-full h-full object-cover" alt="Saved" />
                                                                    </div>
                                                                    <span className="text-xs font-semibold">Saved</span>
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className={`flex-1 p-2 rounded-xl border border-dashed cursor-pointer transition-all flex items-center gap-2 hover:bg-secondary/50 border-border`}
                                                                    onClick={() => fileInputRef.current?.click()}
                                                                >
                                                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                                                        <Upload size={14} className="text-muted-foreground" />
                                                                    </div>
                                                                    <span className="text-xs font-semibold">Upload</span>
                                                                </div>
                                                            )}

                                                            {/* Option 2: Google */}
                                                            <div
                                                                className={`flex-1 p-2 rounded-xl border cursor-pointer transition-all flex items-center gap-2 ${onboardingData.avatar === user.user_metadata.picture && !avatarBlob ? 'bg-secondary border-primary/50' : 'hover:bg-secondary/50 border-border'}`}
                                                                onClick={() => {
                                                                    setAvatarBlob(null);
                                                                    setOnboardingData(prev => ({ ...prev, avatar: user.user_metadata.picture }));
                                                                }}
                                                            >
                                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                                                    <img src={user.user_metadata.picture} className="w-full h-full object-cover" alt="Google" />
                                                                </div>
                                                                <span className="text-xs font-semibold">Google</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {mode !== 'avatar_only' && (
                                                    <div className="w-full space-y-1.5 mb-8">
                                                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Username</label>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">@</span>
                                                            <input
                                                                type="text"
                                                                value={onboardingData.username}
                                                                onChange={(e) => setOnboardingData({ ...onboardingData, username: e.target.value })}
                                                                className="w-full bg-secondary/30 border border-input rounded-xl py-3.5 pl-9 pr-4 text-foreground text-base outline-none focus:border-ring transition-all font-medium placeholder:text-muted-foreground/50"
                                                                placeholder="username"
                                                                autoFocus
                                                            />
                                                        </div>
                                                        {error && step === 1 && (
                                                            <motion.p
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                className="text-red-400 text-xs font-medium ml-1 mt-1 flex items-center gap-1"
                                                            >
                                                                <AlertCircle size={12} /> {error}
                                                            </motion.p>
                                                        )}
                                                    </div>
                                                )}

                                                <button
                                                    onClick={async () => {
                                                        if (mode === 'avatar_only') {
                                                            await handleOnboardingSubmit();
                                                        } else {
                                                            const isValid = await validateUsername(onboardingData.username);
                                                            if (isValid) setStep(2);
                                                        }
                                                    }}
                                                    disabled={(!onboardingData.username && mode !== 'avatar_only') || loading}
                                                    className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                                                >
                                                    {mode === 'avatar_only' ? 'Save Avatar' : 'Continue'} {(mode !== 'avatar_only') && <ArrowRight size={18} />}
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                )}

                                {/* STEP 2: OCCUPATION */}
                                {step === 2 && (
                                    <motion.div
                                        key="occupation"
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        variants={stepVariants}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col"
                                    >
                                        <h2 className="text-2xl font-bold text-foreground mb-2 text-center">What do you do?</h2>
                                        <p className="text-muted-foreground text-sm mb-8 text-center">This helps us customize your feed.</p>

                                        <div className="flex flex-col gap-3 mb-8">
                                            {['Student', 'Worker', 'Freelancer'].map((role) => (
                                                <div
                                                    key={role}
                                                    onClick={() => setOnboardingData({ ...onboardingData, occupation: role.toLowerCase() })}
                                                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${onboardingData.occupation === role.toLowerCase()
                                                        ? 'bg-secondary border-primary/50 shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]'
                                                        : 'bg-card border-border hover:border-ring/50'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${onboardingData.occupation === role.toLowerCase() ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                                                            {role === 'Student' && <span className="text-lg">🎓</span>}
                                                            {role === 'Worker' && <span className="text-lg">💼</span>}
                                                            {role === 'Freelancer' && <span className="text-lg">🚀</span>}
                                                        </div>
                                                        <span className={`font-medium text-base transition-colors ${onboardingData.occupation === role.toLowerCase() ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{role}</span>
                                                    </div>
                                                    {onboardingData.occupation === role.toLowerCase() && (
                                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 bg-foreground rounded-full flex items-center justify-center">
                                                            <Check size={14} className="text-background" strokeWidth={3} />
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setStep(3)}
                                            className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
                                        >
                                            Continue <ArrowRight size={18} />
                                        </button>
                                    </motion.div>
                                )}

                                {/* STEP 3: PREFERENCE */}
                                {step === 3 && (
                                    <motion.div
                                        key="preference"
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        variants={stepVariants}
                                        transition={{ duration: 0.2 }}
                                        className="flex flex-col"
                                    >
                                        <h2 className="text-2xl font-bold text-foreground mb-2 text-center">Sorting Preference</h2>
                                        <p className="text-muted-foreground text-sm mb-8 text-center">How do you prefer to see tools sorted?</p>

                                        <div className="grid grid-cols-1 gap-3 mb-8">
                                            {[
                                                { id: 'trending', label: 'Trending First', desc: 'Most popular tools at the top' },
                                                { id: 'launch_recent', label: 'Newest First', desc: 'Freshly launched tools' },
                                                { id: 'rating_dec', label: 'Top Rated', desc: 'Highest rated tools first' }
                                            ].map((pref) => (
                                                <div
                                                    key={pref.id}
                                                    onClick={() => setOnboardingData({ ...onboardingData, preference: pref.id })}
                                                    className={`relative overflow-hidden p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${onboardingData.preference === pref.id
                                                        ? 'bg-secondary border-primary/50 shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]'
                                                        : 'bg-card border-border hover:border-ring/50'
                                                        }`}
                                                >
                                                    <div className="flex flex-col gap-1 z-10">
                                                        <span className={`text-sm font-bold ${onboardingData.preference === pref.id ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                            {pref.label}
                                                        </span>
                                                        <span className={`text-xs font-medium ${onboardingData.preference === pref.id ? 'text-muted-foreground' : 'text-muted-foreground/80'}`}>
                                                            {pref.desc}
                                                        </span>
                                                    </div>
                                                    {onboardingData.preference === pref.id && (
                                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="z-10 bg-foreground rounded-full p-1">
                                                            <Check size={12} className="text-background" strokeWidth={3} />
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {error && (
                                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                                <p className="text-red-400 text-xs font-medium text-center">{error}</p>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleOnboardingSubmit}
                                            disabled={loading}
                                            className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                                        >
                                            {loading ? 'Setting up...' : 'Finish Setup'}
                                            {!loading && <Check size={18} strokeWidth={2.5} />}
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
};

export default AuthDrawer;
