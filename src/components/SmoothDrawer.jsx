import React from 'react';
import { Drawer } from 'vaul';
import { Settings, X, Moon, Sun, User, LogOut } from 'lucide-react';
import { supabase } from '../supabase';

const SmoothDrawer = ({ trigger, user, onAuthClick, darkMode, setDarkMode, open, onOpenChange }) => {
    // const [open, setOpen] = React.useState(false); // Controlled by parent now

    const handleLogout = async () => {
        await supabase.auth.signOut();
        onOpenChange(false);
        window.location.reload(); // Simple reload to clear state
    };

    return (
        <Drawer.Root shouldScaleBackground open={open} onOpenChange={onOpenChange}>
            <Drawer.Trigger asChild>
                {trigger}
            </Drawer.Trigger>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
                <Drawer.Content className="bg-background/95 backdrop-blur-3xl flex flex-col rounded-t-[20px] h-[60vh] max-h-[600px] mt-24 fixed bottom-0 inset-x-0 mx-auto w-full max-w-lg z-50 border-t border-white/10 outline-none shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">

                    {/* Handle bar for dragging */}
                    <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-600/50 mt-4 mb-6" />

                    <div className="p-6 pt-0 flex-1 overflow-y-auto">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                            <button
                                onClick={() => onOpenChange(false)}
                                className="p-2 rounded-full hover:bg-zinc-800/50 transition-colors"
                            >
                                <X size={20} className="text-muted-foreground" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Account Section */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider ml-1">Account</h3>
                                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl overflow-hidden p-1">
                                    {user ? (
                                        <div className="p-3">
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg font-bold">
                                                    {user.user_metadata?.avatar_url ? (
                                                        <img src={user.user_metadata.avatar_url} className="w-full h-full object-cover rounded-full" />
                                                    ) : (
                                                        user.email?.[0].toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-base">{user.user_metadata?.username || 'User'}</p>
                                                    <p className="text-xs text-muted-foreground">{user.email}</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-3 rounded-xl transition-colors font-medium text-sm"
                                            >
                                                <LogOut size={16} />
                                                Sign out
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-4 text-center">
                                            <p className="text-sm text-muted-foreground mb-3">You are not signed in.</p>
                                            <button
                                                onClick={() => { onAuthClick(); onOpenChange(false); }}
                                                className="w-full bg-foreground text-background py-2.5 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
                                            >
                                                Sign In / Sign Up
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Preferences Section */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider ml-1">Preferences</h3>
                                <div className="bg-zinc-900/40 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                                    <div className="flex items-center justify-between p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-zinc-800/50">
                                                {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                                            </div>
                                            <span className="font-medium text-sm">Dark Mode</span>
                                        </div>
                                        {/* We use the same generic switch structure or just a simple button */}
                                        <button
                                            onClick={() => setDarkMode(!darkMode)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${!darkMode ? 'bg-primary' : 'bg-zinc-700'
                                                }`}
                                        >
                                            <span className={`${!darkMode ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
};

export default SmoothDrawer;
