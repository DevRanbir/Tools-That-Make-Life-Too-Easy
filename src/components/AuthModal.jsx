import React, { useState } from 'react';
import { supabase } from '../supabase';
import { X, Mail, Lock, ArrowRight, Sparkles, Upload, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cropper, CropperImage, CropperCropArea } from './ui/cropper';

const AuthModal = ({ isOpen, onClose, startStep = 0, mode = 'default', user }) => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    const [step, setStep] = useState(startStep); // 0: auth, 0.5: verify-email, 1: profile, 2: occupation, 3: preference
    const [onboardingData, setOnboardingData] = useState({
        username: '',
        avatar: null, // preview URL
        occupation: 'freelancer',
        preference: 'mixed'
    });
    const fileInputRef = React.useRef(null);

    // Cropper State
    const [isCropping, setIsCropping] = useState(false);
    const [originalImage, setOriginalImage] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [avatarBlob, setAvatarBlob] = useState(null);

    // Reset state when opening/closing
    React.useEffect(() => {
        if (isOpen) {
            setStep(startStep);
            setError(null);
            setIsSignUp(false);
            if (!user) {
                setEmail('');
                setPassword('');
            }
        }
    }, [isOpen, startStep, user]);


    // Pre-fill data if user exists
    React.useEffect(() => {
        if (user) {
            setOnboardingData(prev => ({
                ...prev,
                username: user.user_metadata?.username || '',
                occupation: user.user_metadata?.occupation || 'freelancer',
                preference: user.user_metadata?.sort_preference || 'mixed',
                avatar: user.user_metadata?.avatar_url || null
            }));
        }
    }, [user, isOpen]);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
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
                onClose();
            }
        } catch (error) {
            setError(error.message);
        } finally {
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
                // Fail open or closed? Closed is safer for uniqueness.
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
                    // Continue anyway, maybe just avatar failed
                } else {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(fileName);
                    finalAvatarUrl = `${publicUrl}?t=${Date.now()}`;
                }
            } else if (onboardingData.avatar && onboardingData.avatar.startsWith('http')) {
                finalAvatarUrl = onboardingData.avatar;
            }

            const updates = {
                username: onboardingData.username,
                occupation: onboardingData.occupation,
                sort_preference: onboardingData.preference,
                updated_at: new Date(),
                // Default setup for new users (or existing ones updating)
                // We should only set defaults if they don't exist, but here we might just overwrite for setup?
                // Actually, user might already have roles if they logged in before. 
                // We should probably NOT overwrite role/credits if they exist on the user object?
                // But the user object in this scope is `session.user`.
                // Let's assume on first setup we default them.
                role: user?.user_metadata?.role || 'freebiee',
                credits: user?.user_metadata?.credits !== undefined ? user.user_metadata.credits : 0
            };

            if (finalAvatarUrl) {
                updates.avatar_url = finalAvatarUrl;
            }

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
                    avatar_url: finalAvatarUrl || `https://ui-avatars.com/api/?name=${onboardingData.username}`,
                    role: updates.role,
                    credits: updates.credits
                });

            if (profileError) console.error("Error creating user profile:", profileError);
            onClose();
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
            <div
                className="w-full max-w-[380px] bg-card border border-border rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                style={{ maxHeight: '90vh', overflowY: 'auto' }}
            >
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition-colors z-20"
                >
                    <X size={20} />
                </button>

                <AnimatePresence mode="wait">
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
                                <div className="w-12 h-12 bg-secondary/50 rounded-2xl flex items-center justify-center border border-border mb-4 shadow-sm text-foreground ring-1 ring-white/5">
                                    <Sparkles size={20} fill="currentColor" className="opacity-80" />
                                </div>
                                <h2 className="text-xl font-bold text-foreground tracking-tight">
                                    {isSignUp ? 'Create your account' : 'Welcome back'}
                                </h2>
                                <p className="text-muted-foreground text-sm mt-2 font-medium">
                                    {isSignUp ? 'Start building your dream workspace.' : 'Enter your details to continue.'}
                                </p>
                            </div>

                            <form onSubmit={handleAuth} className="space-y-4">
                                <div className="space-y-1.5">
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" size={16} />
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-secondary/30 border border-input rounded-xl py-3.5 pl-11 pr-4 text-foreground text-sm outline-none focus:border-ring focus:bg-secondary/50 transition-all font-medium placeholder:text-muted-foreground"
                                            placeholder="Email address"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="relative group">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors" size={16} />
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-secondary/30 border border-input rounded-xl py-3.5 pl-11 pr-4 text-foreground text-sm outline-none focus:border-ring focus:bg-secondary/50 transition-all font-medium placeholder:text-muted-foreground"
                                            placeholder="Password"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                        <p className="text-red-400 text-xs font-medium text-center">{error}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 mt-4 shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    {loading ? 'Processing...' : (isSignUp ? 'Continue' : 'Sign In')}
                                    {!loading && <ArrowRight size={16} strokeWidth={2.5} />}
                                </button>
                            </form>

                            <div className="mt-8 text-center">
                                <p className="text-muted-foreground text-xs font-medium">
                                    {isSignUp ? "Already have an account?" : "Don't have an account?"}
                                    <button
                                        onClick={() => setIsSignUp(!isSignUp)}
                                        className="text-foreground hover:text-muted-foreground ml-1.5 font-bold transition-colors inline-flex items-center gap-1 group"
                                    >
                                        {isSignUp ? "Log in" : "Sign up"}
                                    </button>
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {step === 0.5 && (
                        <motion.div
                            key="verify-email"
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            variants={stepVariants}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col items-center text-center"
                        >
                            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-6 ring-4 ring-secondary/50">
                                <Mail size={32} className="text-foreground" />
                            </div>
                            <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
                            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                                We've sent a verification link to <span className="text-foreground font-medium">{email}</span>.<br />
                                Please verify your email to continue setting up your account.
                            </p>

                            <button
                                onClick={() => {
                                    setStep(0);
                                    setIsSignUp(false);
                                }}
                                className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all"
                            >
                                Back to Login
                            </button>
                        </motion.div>
                    )}

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
                            <h2 className="text-xl font-bold text-foreground mb-6">Setup Profile</h2>

                            {isCropping && originalImage ? (
                                <div className="w-full flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
                                    <div className="relative w-full h-64 bg-secondary/50 rounded-xl overflow-hidden border border-border">
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
                                            className="flex-1 py-2 rounded-lg bg-secondary text-primary font-medium hover:bg-secondary/80 transition"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCropConfirm}
                                            className="flex-1 py-2 rounded-lg bg-foreground text-background font-bold hover:opacity-90 transition"
                                        >
                                            Save Photo
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center border-2 border-dashed border-border hover:border-sidebar-primary cursor-pointer transition-colors relative mb-6 group overflow-hidden"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {onboardingData.avatar ? (
                                            <img src={onboardingData.avatar} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-1">
                                                <Upload size={20} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                                                <span className="text-[10px] text-muted-foreground font-medium">Upload</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-[10px] text-white font-bold">Change</span>
                                        </div>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleFileSelect}
                                    />

                                    {mode !== 'avatar_only' && (
                                        <div className="w-full space-y-1.5 mb-6">
                                            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider ml-1">Username</label>
                                            <input
                                                type="text"
                                                value={onboardingData.username}
                                                onChange={(e) => setOnboardingData({ ...onboardingData, username: e.target.value })}
                                                className="w-full bg-secondary/30 border border-input rounded-xl py-3 px-4 text-foreground text-sm outline-none focus:border-ring transition-all font-medium placeholder:text-muted-foreground"
                                                placeholder="@username"
                                                autoFocus
                                            />
                                            {error && step === 1 && (
                                                <p className="text-red-400 text-xs font-medium ml-1 mt-1">{error}</p>
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
                                        className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {mode === 'avatar_only' ? 'Save Avatar' : 'Continue'} {(mode !== 'avatar_only') && <ArrowRight size={16} />}
                                    </button>
                                </>
                            )}
                        </motion.div>
                    )}

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
                            <h2 className="text-xl font-bold text-foreground mb-2 text-center">What do you do?</h2>
                            <p className="text-muted-foreground text-sm mb-6 text-center">This helps us customize your feed.</p>

                            <div className="flex flex-col gap-3 mb-6">
                                {['Student', 'Worker', 'Freelancer'].map((role) => (
                                    <div
                                        key={role}
                                        onClick={() => setOnboardingData({ ...onboardingData, occupation: role.toLowerCase() })}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${onboardingData.occupation === role.toLowerCase()
                                            ? 'bg-secondary border-primary/50 shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]'
                                            : 'bg-card border-border hover:border-ring/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${onboardingData.occupation === role.toLowerCase() ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                                                {role === 'Student' && <span className="text-xs font-bold">🎓</span>}
                                                {role === 'Worker' && <span className="text-xs font-bold">💼</span>}
                                                {role === 'Freelancer' && <span className="text-xs font-bold">🚀</span>}
                                            </div>
                                            <span className={`font-medium transition-colors ${onboardingData.occupation === role.toLowerCase() ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>{role}</span>
                                        </div>
                                        {onboardingData.occupation === role.toLowerCase() && (
                                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-5 h-5 bg-foreground rounded-full flex items-center justify-center">
                                                <Check size={12} className="text-background" strokeWidth={3} />
                                            </motion.div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setStep(3)}
                                className="w-full bg-foreground hover:opacity-90 text-background font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                Continue <ArrowRight size={16} />
                            </button>
                        </motion.div>
                    )}

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
                            <h2 className="text-xl font-bold text-foreground mb-2 text-center">Sorting Preference</h2>
                            <p className="text-muted-foreground text-sm mb-6 text-center">How do you prefer to see tools sorted?</p>

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
                                {loading ? 'Saving...' : 'Finish Setup'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default AuthModal;
