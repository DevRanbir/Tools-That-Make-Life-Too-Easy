import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import TopBar from './components/TopBar';
import AuthModal from './components/AuthModal';
import Home from './pages/Home';
import Manual from './pages/Manual';
import FastMode from './pages/FastMode';
import Manage from './pages/Manage';
import SearchPage from './pages/Search';
import ShopPage from './pages/Shop';
import CalendarPage from './pages/Calendar';
import DataPage from './pages/Data';
import TagsPage from './pages/Tags';
// import ForYou from './pages/ForYou'; // Reusing Trending for now as requested "same as 2nd"

import { supabase } from './supabase';
import { Toaster } from 'sonner';

const App = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [activePage, setActivePage] = useState('manual');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [user, setUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { id: 1, role: 'ai', content: "Hello! I'm your AI assistant. I'm currently in beta mode, but feel free to ask me anything about the tools available here!" }
  ]);
  // activePage determines which page component to render

  const [authStartStep, setAuthStartStep] = useState(0);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Handle URL synchronization
  useEffect(() => {
    // 1. Handle browser back/forward buttons & Initial Load
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/manage') setActivePage('manage');
      else if (path === '/search') setActivePage('search');
      else if (path === '/tags') setActivePage('tags');
      else if (path === '/fast') setActivePage('fastmode');
      else if (path === '/shop') setActivePage('shop');
      else if (path === '/calendar') setActivePage('calendar');
      else if (path === '/data') setActivePage('data');
      else if (path === '/for-you') setActivePage('home');
      else setActivePage('manual'); // Default to manual (root)
    };

    window.addEventListener('popstate', handlePopState);
    handlePopState(); // Trigger on mount

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 2. Sync state to URL
  useEffect(() => {
    let path = '/';
    if (activePage === 'manage') path = '/manage';
    else if (activePage === 'search') path = '/search';
    else if (activePage === 'tags') path = '/tags';
    else if (activePage === 'fastmode') path = '/fast';
    else if (activePage === 'shop') path = '/shop';
    else if (activePage === 'calendar') path = '/calendar';
    else if (activePage === 'data') path = '/data';
    else if (activePage === 'home') path = '/for-you';
    else path = '/'; // manual

    if (window.location.pathname !== path) {
      // Preserve hash if it exists (e.g. for search)
      const hash = window.location.hash;
      window.history.pushState({}, '', path + hash);
    }
  }, [activePage]);

  // Check auth state and fetch user details
  useEffect(() => {
    let subscription = null; // Store subscription reference

    const fetchUserDetails = async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        return;
      }

      const { data: details, error } = await supabase
        .from('user_details')
        .select('role, credits')
        .eq('id', currentUser.id)
        .single();

      if (error && error.code !== 'PGRST116') { // Ignore "no rows" error for new users initially
        console.error("Error fetching user details:", error);
      }

      const role = details?.role || 'freebiee';
      const credits = details?.credits ?? 0; // Default to 0 if null

      // Merge details into user metadata for easy access in components
      setUser({
        ...currentUser,
        user_metadata: {
          ...currentUser.user_metadata,
          role: role,
          credits: credits
        }
      });
    };

    // Initial load
    supabase.auth.getUser().then(({ data: { user } }) => {
      fetchUserDetails(user);
    });

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserDetails(session.user);
      } else {
        setUser(null);
      }
    });

    // Real-time subscription for user_details updates
    const userDetailsSubscription = supabase
      .channel('public:user_details')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_details' }, (payload) => {
        // Only update if the changed record belongs to the current user
        setUser(prevUser => {
          if (prevUser && payload.new.id === prevUser.id) {
            return {
              ...prevUser,
              user_metadata: {
                ...prevUser.user_metadata,
                role: payload.new.role,
                credits: payload.new.credits
              }
            };
          }
          return prevUser;
        });
      })
      .subscribe();


    return () => {
      authListener.unsubscribe();
      supabase.removeChannel(userDetailsSubscription);
    };
  }, []);

  // Force onboarding if user exists but has no username
  useEffect(() => {
    if (user) {
      const hasUsername = user.user_metadata?.username;
      if (!hasUsername) {
        setAuthStartStep(1); // Start at Profile Setup
        setShowAuthModal(true);
      }
    }
  }, [user]);

  // Sort Preference State
  const [sortPreference, setSortPreference] = useState('trending');

  // Load user preference on auth
  useEffect(() => {
    if (user && user.user_metadata?.sort_preference) {
      setSortPreference(user.user_metadata.sort_preference);
    }
  }, [user]);

  const updateSortPreference = async (newSort) => {
    setSortPreference(newSort);
    if (user) {
      const { error } = await supabase.auth.updateUser({
        data: { sort_preference: newSort }
      });
      if (error) console.error("Error saving sort preference:", error);
    }
  };

  const [authMode, setAuthMode] = useState('default');

  const handleAuthClick = (step = 0, mode = 'default') => {
    setAuthStartStep(typeof step === 'number' ? step : 0);
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const renderContent = () => {
    switch (activePage) {
      case 'home': return <Manual navigateOnly={setActivePage} pageName="For You" user={user} sortPreference={sortPreference} />;
      case 'fastmode': return <FastMode navigateOnly={setActivePage} user={user} messages={chatMessages} setMessages={setChatMessages} />;
      case 'manual': return <Manual navigateOnly={setActivePage} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'search': return <SearchPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} />;
      case 'tags': return <TagsPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} />;
      case 'shop': return <ShopPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} />;
      case 'calendar': return user ? <CalendarPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} /> : <Manual navigateOnly={setActivePage} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'data': return user ? <DataPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} /> : <Manual navigateOnly={setActivePage} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'manage': return <Manage navigateOnly={setActivePage} />;
      default: return <Home navigateOnly={setActivePage} sortPreference={sortPreference} />;
    }
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [rightSidebarMode, setRightSidebarMode] = useState('full'); // 'full' | 'events' | 'saved' | 'hidden'

  // ...

  return (
    <div className="layout">
      <div className="main-body">
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onAuthClick={handleAuthClick}
          user={user}
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          rightSidebarMode={rightSidebarMode}
          setRightSidebarMode={setRightSidebarMode}
        />
        <RightSidebar
          user={user}
          isSettingsOpen={isSettingsOpen}
          mode={rightSidebarMode}
        />
        <TopBar
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onAuthClick={handleAuthClick}
          user={user}
          navigateOnly={setActivePage}
          sortPreference={sortPreference}
          onSortChange={updateSortPreference}
        />
        <div className="content-area">
          {renderContent()}
        </div>
      </div>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        startStep={authStartStep}
        mode={authMode}
        user={user}
      />
      <Toaster />
    </div>
  );
};

export default App;
