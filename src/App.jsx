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
// import ForYou from './pages/ForYou'; // Reusing Trending for now as requested "same as 2nd"

import { supabase } from './supabase';

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

  // Initialize theme and check URL route
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // specific check for /manage route
    if (window.location.pathname === '/manage') {
      setActivePage('manage');
    }
    if (window.location.pathname === '/search') {
      setActivePage('search');
    }
  }, [darkMode]);

  // Check auth state
  useEffect(() => {
    // getUser validates against the server, ensuring deleted accounts are caught
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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

  const handleAuthClick = () => {
    setAuthStartStep(0); // Regular login/signup
    setShowAuthModal(true);
  };

  const renderContent = () => {
    switch (activePage) {
      case 'home': return <Manual navigateOnly={setActivePage} pageName="For You" user={user} sortPreference={sortPreference} />;
      case 'fastmode': return <FastMode navigateOnly={setActivePage} user={user} messages={chatMessages} setMessages={setChatMessages} />;
      case 'manual': return <Manual navigateOnly={setActivePage} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'search': return <SearchPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} />;
      case 'shop': return <ShopPage navigateOnly={setActivePage} user={user} sortPreference={sortPreference} />;
      case 'manage': return <Manage navigateOnly={setActivePage} />;
      default: return <Home navigateOnly={setActivePage} sortPreference={sortPreference} />;
    }
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
        />
        <RightSidebar user={user} isSettingsOpen={isSettingsOpen} />
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
      />
    </div>
  );
};

export default App;
