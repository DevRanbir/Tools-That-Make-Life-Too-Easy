import React, { useState, useEffect, useRef } from 'react';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import RightSidebar from './components/RightSidebar';
import TopBar from './components/TopBar';
import AuthDrawer from './components/AuthDrawer';
import Home from './pages/Home';
import Manual from './pages/Manual';
import FastMode from './pages/FastMode';
import Manage from './pages/Manage';
import SearchPage from './pages/Search';
import ShopPage from './pages/Shop';
import CalendarPage from './pages/Calendar';
import DataPage from './pages/Data';
import TagsPage from './pages/Tags';
import TodosPage from './pages/Todos';
import NotesPage from './pages/Notes';
import SearchOverlay from './components/SearchOverlay';
import Flowcharts from './pages/Flowcharts';
import Images from './pages/Images';
import Emails from './pages/Emails';
import Research from './pages/Research';
import Presentations from './pages/Presentations';
import Documents from './pages/Documents';
import CaseStudies from './pages/CaseStudies';
import ErrorPage from './pages/ErrorPage';
// import ForYou from './pages/ForYou'; // Reusing Trending for now as requested "same as 2nd"

import { supabase } from './supabase';
import { Toaster, toast } from 'sonner';

const App = () => {
  const [loadingState, setLoadingState] = useState('active'); // 'active' | 'fading' | 'off'
  const [loadingScope, setLoadingScope] = useState('global'); // 'local' | 'global'
  const contentAreaRef = React.useRef(null);

  // Initial loading effect
  const timerRef = React.useRef(null);
  const isFirstAuthEvent = useRef(true);

  const INITIAL_CHAT_MESSAGES = [
    { id: Date.now(), role: 'ai', content: "Hi there! I'm Bianca, a friendly AI assistant from Tools That Make Life Too Easy. I can help you with a variety of tasks using my specialized agents." }
  ];

  const clearTimers = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Initial loading effect
  useEffect(() => {
    // Start fading after 2500ms
    timerRef.current = setTimeout(() => {
      setLoadingState('fading');

      // Turn off completely after fade out (approx 700ms transition)
      timerRef.current = setTimeout(() => {
        setLoadingState('off');
      }, 700);
    }, 2500);

    return () => clearTimers();
  }, []);

  const [user, setUser] = useState(null); // Moved here to avoid initialization error

  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      return saved !== null ? JSON.parse(saved) : true;
    } catch (e) {
      console.warn("Invalid theme in localStorage, defaulting to dark:", e);
      return true;
    }
  });

  // Sync Dark Mode from Supabase
  useEffect(() => {
    if (user && user.user_metadata?.setting_preferences?.dark_mode !== undefined) {
      const prefMode = user.user_metadata.setting_preferences.dark_mode;
      if (prefMode !== darkMode) {
        setDarkMode(prefMode);
      }
    }
  }, [user?.user_metadata?.setting_preferences?.dark_mode]);
  // Keep track of the theme displayed by the loader specifically
  const [loaderTheme, setLoaderTheme] = useState(darkMode);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [activePage, setActivePage] = useState(() => {
    const path = window.location.pathname;
    if (path === '/manage') return 'manage';
    if (path === '/search') return 'search';
    if (path === '/todos') return 'todos';
    if (path === '/notes') return 'notes';
    if (path === '/tags') return 'tags';
    if (path === '/fast') return 'fastmode';
    if (path === '/shop') return 'shop';
    if (path === '/calendar') return 'calendar';
    if (path === '/data') return 'data';
    if (path === '/for-you') return 'home';
    if (path === '/flowcharts') return 'flowcharts';
    if (path === '/images') return 'images';
    if (path === '/emails') return 'emails';
    if (path === '/research') return 'research';
    if (path === '/presentations') return 'presentations';
    if (path === '/documents') return 'documents';
    if (path === '/case-studies') return 'case-studies';
    if (path === '/' || path === '') return 'manual';
    return 'error';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  /* MOVED user STATE DECLARATION UP */
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('chat_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Error loading chat history:", e);
    }
    return INITIAL_CHAT_MESSAGES;
  });

  // Persist chat history only if user is logged in
  useEffect(() => {
    if (user) {
      localStorage.setItem('chat_history', JSON.stringify(chatMessages));
    }
  }, [chatMessages, user]);

  const hasCheckedForReset = useRef(false);

  // Inject reset prompt on reload if history exists
  useEffect(() => {
    if (!hasCheckedForReset.current) {
      hasCheckedForReset.current = true;
      if (chatMessages.length > 1) {
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (!lastMsg.requiresReset) {
          setChatMessages(prev => {
            // Double check inside the state update to be safe
            const currentLast = prev[prev.length - 1];
            if (currentLast && !currentLast.requiresReset) {
              return [...prev, {
                id: Date.now(),
                role: 'ai',
                content: "I noticed you have an active session. Would you like to continue or start over?",
                requiresReset: true
              }];
            }
            return prev;
          });
        }
      }
    }
  }, []);

  const handleChatReset = () => {
    setChatMessages(INITIAL_CHAT_MESSAGES);
  };
  // activePage determines which page component to render

  const [targetSection, setTargetSection] = useState(null);

  const handlePageChange = (newPage, section = null) => {
    if (section) setTargetSection(section);
    if (newPage === activePage) return;

    // Clear hash when changing pages to prevent search queries from persisting
    if (window.location.hash) {
      window.history.replaceState(null, null, ' ');
    }

    const isInstantTransition = (activePage === 'manual' && newPage === 'fastmode');

    if (isInstantTransition) {
      setActivePage(newPage);
      return;
    }

    // Clear any existing timers to prevent glitches
    clearTimers();

    setLoadingScope('local');
    setLoaderTheme(darkMode); // Sync to current theme BEFORE showing loader
    // 1. Show loader
    setLoadingState('active');

    // Scroll to top to ensure loader is visible and page starts fresh
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
    }

    // 2. Wait for fade/transition, then switch page
    timerRef.current = setTimeout(() => {
      setActivePage(newPage);

      // 3. Keep loader for a moment then fade out
      timerRef.current = setTimeout(() => {
        setLoadingState('fading');

        // 4. Turn off
        timerRef.current = setTimeout(() => {
          setLoadingState('off');
        }, 700);
      }, 800); // Wait bit longer for content to render
    }, 300); // 300ms fade in buffer
  };

  const updateTheme = (newModeOrFn) => {
    // 1. Lock the loader to the CURRENT theme before we switch
    setLoaderTheme(darkMode);
    setLoadingScope('global'); // Show globally
    clearTimers();
    setLoadingState('active');

    // 2. Wait for loader to fully appear (cover the screen), then switch the APP theme
    timerRef.current = setTimeout(() => {
      setDarkMode(prev => {
        const next = typeof newModeOrFn === 'function' ? newModeOrFn(prev) : newModeOrFn;
        // Sync to Supabase
        if (updateSettingPreference) {
          updateSettingPreference('dark_mode', next);
        }
        return next;
      });

      // 3. Wait a bit (app is now new theme, loader is still old theme)
      //    User sees: Old Theme Loader -> Fades out to reveal New Theme App
      timerRef.current = setTimeout(() => {
        setLoadingState('fading');

        // 4. Cleanup after animation ends
        timerRef.current = setTimeout(() => {
          setLoadingState('off');
          // Now we can sync loader theme for next time (optional, but good practice)
          // We need to know the 'next' value here to set it correctly.
          // Since setDarkMode is async/batched, simpler to just let it be or use effect.
          // Actually, we can just sync it to 'darkMode' state in an effect or here if we knew the value.
          // Let's rely on the next call to updateTheme to reset it to 'darkMode'.
        }, 700);
      }, 1500);
    }, 400);
  };

  const [authStartStep, setAuthStartStep] = useState(0);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', JSON.stringify(darkMode));
  }, [darkMode]);

  // Handle URL synchronization
  useEffect(() => {
    // 1. Handle browser back/forward buttons & Initial Load
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/manage') setActivePage('manage');
      else if (path === '/search') setActivePage('search');
      else if (path === '/todos') setActivePage('todos');
      else if (path === '/notes') setActivePage('notes');
      else if (path === '/tags') setActivePage('tags');
      else if (path === '/fast') setActivePage('fastmode');
      else if (path === '/shop') setActivePage('shop');
      else if (path === '/calendar') setActivePage('calendar');
      else if (path === '/data') setActivePage('data');
      else if (path === '/for-you') setActivePage('home');
      else if (path === '/flowcharts') setActivePage('flowcharts');
      else if (path === '/images') setActivePage('images');
      else if (path === '/emails') setActivePage('emails');
      else if (path === '/research') setActivePage('research');
      else if (path === '/presentations') setActivePage('presentations');
      else if (path === '/documents') setActivePage('documents');
      else if (path === '/case-studies') setActivePage('case-studies');
      else if (path === '/' || path === '') setActivePage('manual');
      else setActivePage('error');
    };

    window.addEventListener('popstate', handlePopState);
    handlePopState(); // Trigger on mount

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 2. Sync state to URL
  useEffect(() => {
    let path = '/';
    let pageTitle = 'Manual';

    if (activePage === 'manage') { path = '/manage'; pageTitle = 'Manage'; }
    else if (activePage === 'search') { path = '/search'; pageTitle = 'Search'; }
    else if (activePage === 'todos') { path = '/todos'; pageTitle = 'Todos'; }
    else if (activePage === 'notes') { path = '/notes'; pageTitle = 'Notes'; }
    else if (activePage === 'tags') { path = '/tags'; pageTitle = 'Tags'; }
    else if (activePage === 'fastmode') { path = '/fast'; pageTitle = 'Fast Mode'; }
    else if (activePage === 'shop') { path = '/shop'; pageTitle = 'Shop'; }
    else if (activePage === 'calendar') { path = '/calendar'; pageTitle = 'Calendar'; }
    else if (activePage === 'data') { path = '/data'; pageTitle = 'Data'; }
    else if (activePage === 'home') { path = '/for-you'; pageTitle = 'For You'; }
    else if (activePage === 'flowcharts') { path = '/flowcharts'; pageTitle = 'Flowcharts'; }
    else if (activePage === 'images') { path = '/images'; pageTitle = 'Images'; }
    else if (activePage === 'emails') { path = '/emails'; pageTitle = 'Emails'; }
    else if (activePage === 'research') { path = '/research'; pageTitle = 'Research'; }
    else if (activePage === 'presentations') { path = '/presentations'; pageTitle = 'Presentations'; }
    else if (activePage === 'documents') { path = '/documents'; pageTitle = 'Documents'; }
    else if (activePage === 'case-studies') { path = '/case-studies'; pageTitle = 'Case Studies'; }
    else if (activePage === 'manual') { path = '/'; pageTitle = 'Manual'; }
    else { path = '/error'; pageTitle = 'Page Not Found'; }

    document.title = `${pageTitle} - Tools That Make Life Too Easy`;

    if (window.location.pathname !== path) {
      // If navigating to search, preserve the hash (query)
      if (activePage === 'search' && window.location.hash) {
        window.history.pushState({}, '', path + window.location.hash);
      } else {
        // Clean url on page change otherwise
        window.history.pushState({}, '', path);
      }
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
        .select('role, credits, setting_preferences, avatar_preference, avatar_url, occupation, username, sort_preference')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user details:", error);
      }

      const role = details?.role || 'NewUser';
      const credits = details?.credits ?? 0;
      const settingPreferences = details?.setting_preferences || {};
      // Prioritize database avatar details
      const dbAvatarPreference = details?.avatar_preference;
      const dbAvatarUrl = details?.avatar_url;

      // Merge details into user metadata for easy access in components
      setUser({
        ...currentUser,
        user_metadata: {
          ...currentUser.user_metadata,
          role: role,
          credits: credits,
          setting_preferences: settingPreferences,
          avatar_preference: dbAvatarPreference, // Store preference
          // If we have a DB avatar and verify it's preferred or exists, use it.
          // This ensures if 'custom' is set, we use the dbAvatarUrl.
          ...(dbAvatarUrl ? { avatar_url: dbAvatarUrl } : {}),
          occupation: details?.occupation,
          username: details?.username || currentUser.user_metadata?.username,
          sort_preference: details?.sort_preference || currentUser.user_metadata?.sort_preference
        }
      });
    };

    // Initial load
    supabase.auth.getUser().then(({ data: { user } }) => {
      fetchUserDetails(user);
    });

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((event, session) => {
      // Check if this is an explicit Login or Logout event (not initial session restore)
      if (isFirstAuthEvent.current) {
        isFirstAuthEvent.current = false;
      } else {
        if (event === 'SIGNED_IN') {
          setChatMessages(INITIAL_CHAT_MESSAGES);
        }
        if (event === 'SIGNED_OUT') {
          setChatMessages(INITIAL_CHAT_MESSAGES);
          localStorage.removeItem('chat_history');
        }
      }

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
                credits: payload.new.credits,
                setting_preferences: payload.new.setting_preferences || {}
              }
            };
          }
          return prevUser;
        });
      })
      .subscribe();


    return () => {
      authListener.unsubscribe();
      userDetailsSubscription.unsubscribe();
    };
  }, []); // Run once on mount

  // Force onboarding if user exists but has no username
  // Force onboarding if user exists but has no username OR if PFP needs resolution
  // Force onboarding if user exists but has no username OR if PFP needs resolution
  useEffect(() => {
    const checkUserStatus = async () => {
      if (user && !showAuthModal) {
        const hasUsername = user.user_metadata?.username;
        const googlePic = user.user_metadata?.picture;
        const currentAvatar = user.user_metadata?.avatar_url;

        // 0. Check if username and occupation are set. If so, we can possibly skip.
        // But better to check specifically what is missing.


        // 1. Check for missing username (New User)
        if (!hasUsername) {
          setAuthStartStep(1);
          setShowAuthModal(true);
          return;
        }

        const hasOccupation = user.user_metadata?.occupation;
        if (!hasOccupation) {
          setAuthStartStep(2);
          setShowAuthModal(true);
          return;
        }

        const hasSortPref = user.user_metadata?.sort_preference;
        if (!hasSortPref) {
          setAuthStartStep(3);
          setShowAuthModal(true);
          return;
        }

        const settingParams = user.user_metadata?.setting_preferences || {};

        if (!settingParams.manage_sidebar_mode) {
          setAuthStartStep(4);
          setShowAuthModal(true);
          return;
        }

        if (!settingParams.tool_deck_preference) {
          setAuthStartStep(5);
          setShowAuthModal(true);
          return;
        }


        // 2. Check for PFP Conflict (Bucket vs Google)
        // If user has a Google Pic AND (Current Avatar is that Google Pic OR missing OR they match)
        if (googlePic && (!currentAvatar || currentAvatar === googlePic)) {
          // Check if file exists in bucket (async)
          // We look for 'avatar.png' inside the folder named with user.id
          const { data: files } = await supabase.storage
            .from('avatars')
            .list(user.id, {
              limit: 1,
              search: 'avatar.png'
            });

          if (files && files.length > 0) {
            // Bucket file exists! But we are using Google Pic. Conflict!
            console.log("PFP Conflict Detected: Bucket file exists but using Google Pic.");
            setAuthStartStep(1);
            setShowAuthModal(true);
          }
        }
      }
    };

    checkUserStatus();
  }, [user]);

  // Sort Preference State
  const [sortPreference, setSortPreference] = useState('trending');

  // Load user preference on auth
  useEffect(() => {
    if (user && user.user_metadata?.sort_preference) {
      setSortPreference(user.user_metadata.sort_preference);
    }
  }, [user]);

  // Reset sort preference to saved user preference when changing valid pages
  useEffect(() => {
    if (user && user.user_metadata?.sort_preference) {
      setSortPreference(user.user_metadata.sort_preference);
    } else {
      setSortPreference('trending'); // Default for guests
    }
  }, [activePage, user?.user_metadata?.sort_preference]);

  const updateSortPreference = async (newSort, persist = false) => {
    setSortPreference(newSort);
    if (persist && user) {
      const { error } = await supabase.auth.updateUser({
        data: { sort_preference: newSort }
      });
      if (error) console.error("Error saving sort preference:", error);
    }
  };

  // Pinned Pages Preference State
  const [pinnedPages, setPinnedPages] = useState([]);

  // Load user preference on auth
  useEffect(() => {
    if (user) {
      const prefs = user.user_metadata?.setting_preferences;
      if (prefs?.pinned_pages) {
        setPinnedPages(prefs.pinned_pages);
      } else if (user.user_metadata?.pinned_pages) {
        // Fallback to old metadata location if not in new prefs
        const savedPins = Array.isArray(user.user_metadata.pinned_pages) ? user.user_metadata.pinned_pages : [];
        setPinnedPages(savedPins.length > 0 ? savedPins : ['fastmode']);
      } else {
        setPinnedPages(['fastmode']);
      }
    } else {
      setPinnedPages(['fastmode']);
    }
  }, [user]);

  const updatePinnedPages = async (newPinnedPages) => {
    setPinnedPages(newPinnedPages);
    if (user) {
      // Update both old location (for backward capability/safety) and new location
      updateSettingPreference('pinned_pages', newPinnedPages);

      const { error } = await supabase.auth.updateUser({
        data: { pinned_pages: newPinnedPages }
      });
      if (error) console.error("Error saving pinned pages:", error);
    }
  };

  const updateSettingPreference = async (key, value) => {
    if (!user) return;
    const currentPrefs = user.user_metadata?.setting_preferences || {};
    const newPrefs = { ...currentPrefs, [key]: value };

    // Optimistic update
    setUser(prev => ({
      ...prev,
      user_metadata: {
        ...prev.user_metadata,
        setting_preferences: newPrefs
      }
    }));

    try {
      await supabase
        .from('user_details')
        .update({ setting_preferences: newPrefs })
        .eq('id', user.id);
    } catch (error) {
      console.error("Error updating preferences:", error);
      // Revert if needed (optional)
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
      case 'home': return user ? <Manual navigateOnly={handlePageChange} pageName="For You" user={user} sortPreference={sortPreference} targetSection={targetSection} onAuthClick={handleAuthClick} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'fastmode': return <FastMode navigateOnly={handlePageChange} user={user} messages={chatMessages} setMessages={setChatMessages} onAuthClick={handleAuthClick} onChatReset={handleChatReset} />;
      case 'manual': return <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'search': return <SearchPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} />;
      case 'todos': return user ? <TodosPage
        navigateOnly={handlePageChange}
        user={user}
        todos={todos}
        toggleTodo={toggleTodo}
        toggleExpand={toggleExpand}
        addTodo={addTodo}
        deleteTodo={deleteTodo}
        toggleSubtask={toggleSubtask}
        deleteSubtask={deleteSubtask}
        addSubtask={addSubtask}
        togglePin={togglePin}
        editTodo={editTodo}
        editSubtask={editSubtask}
      /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'notes': return user ? <NotesPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} darkMode={darkMode} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'tags': return <TagsPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} />;
      case 'shop': return <ShopPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} />;
      case 'calendar': return user ? <CalendarPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'data': return user ? <DataPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} darkMode={darkMode} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'flowcharts': return <Flowcharts user={user} />;
      case 'images': return <Images user={user} />;
      case 'emails': return <Emails user={user} />;
      case 'research': return <Research user={user} />;
      case 'presentations': return <Presentations user={user} />;
      case 'documents': return <Documents user={user} />;
      case 'case-studies': return <CaseStudies user={user} />;
      case 'manage': return (user && user.user_metadata?.role === 'administrator') ? <Manage navigateOnly={handlePageChange} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} onAuthClick={handleAuthClick} />;
      case 'error': return <ErrorPage navigateOnly={handlePageChange} pageName="Page Not Found" user={user} sortPreference={sortPreference} />;
      default: return <Home navigateOnly={handlePageChange} sortPreference={sortPreference} />;
    }
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('preferences');
  const [rightSidebarMode, setRightSidebarMode] = useState('full'); // 'full' | 'events' | 'saved' | 'hidden'

  // Sync Right Sidebar Mode from Supabase
  useEffect(() => {
    if (user && user.user_metadata?.setting_preferences?.right_sidebar_mode) {
      setRightSidebarMode(user.user_metadata.setting_preferences.right_sidebar_mode);
    }
  }, [user?.user_metadata?.setting_preferences?.right_sidebar_mode]);

  const openSettings = (tab = 'preferences') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const toggleSearch = () => setIsSearchOpen(prev => !prev);

  // --- TODOS STATE & LOGIC LIFTED FROM TODOS PAGE ---
  const [todos, setTodos] = useState([]);

  // Fetch Todos from Supabase
  useEffect(() => {
    if (user) {
      const fetchTodos = async () => {
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .order('created_at', { ascending: true });

        if (data) {
          // Merge with simple UI state (all expanded by default)
          setTodos(data.map(t => ({ ...t, expanded: true })));
        }
      };

      fetchTodos();
    } else {
      // Reset to empty or demo data if logged out
      setTodos([
        {
          id: 1,
          text: 'Review project requirements',
          completed: false,
          expanded: true,
          pinned: false,
          subtasks: [
            { id: 11, text: 'Check client email for specs', completed: true },
            { id: 12, text: 'List key deliverables and timeline', completed: false }
          ]
        },
        {
          id: 2,
          text: 'Design database schema',
          completed: false,
          expanded: true,
          pinned: false,
          subtasks: []
        },
      ]);
    }
  }, [user]);

  const toggleTodo = async (id) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    const newCompleted = !todo.completed;
    let newSubtasks = todo.subtasks;

    // If checking main task, auto-complete all subtasks
    if (newCompleted) {
      newSubtasks = todo.subtasks.map(st => ({ ...st, completed: true }));
    }

    const newPinned = newCompleted ? false : todo.pinned;

    // Optimistic Update
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, completed: newCompleted, subtasks: newSubtasks, pinned: newPinned } : t
    ));

    if (user) {
      await supabase.from('todos').update({
        completed: newCompleted,
        subtasks: newSubtasks,
        pinned: newPinned
      }).eq('id', id);
    }
  };

  const toggleExpand = (id) => {
    setTodos(prev => prev.map(todo =>
      todo.id === id ? { ...todo, expanded: !todo.expanded } : todo
    ));
  };

  const addTodo = async (text) => {
    if (!text.trim()) return;

    if (user) {
      const { data, error } = await supabase.from('todos').insert([{
        user_id: user.id,
        text,
        completed: false,
        pinned: false,
        subtasks: []
      }]).select().single();

      if (data) {
        setTodos(prev => [...prev, { ...data, expanded: false }]);
      }
    } else {
      const newId = Date.now();
      const newItem = { id: newId, text: text, completed: false, expanded: false, pinned: false, subtasks: [] };
      setTodos(prev => [...prev, newItem]);
    }
  };

  const deleteTodo = async (id) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
    if (user) {
      await supabase.from('todos').delete().eq('id', id);
    }
  };

  const toggleSubtask = async (todoId, subtaskId) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const newSubtasks = todo.subtasks.map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );

    const allSubtasksCompleted = newSubtasks.length > 0 && newSubtasks.every(st => st.completed);

    // Determine if we should check the main task
    // Only check if all subtasks are completed. If not, uncheck main task? 
    // User logic: "When oil subtasks are completed then automatically complete the Main task"
    // Also usually if one becomes uncompleted, the main task should imply uncompleted.
    // Let's stick to: All completed -> Main completed. Not all completed -> Main incomplete.
    const newCompleted = allSubtasksCompleted ? true : false;

    // If completed, unpin. If not completed, keep existing pin status.
    const newPinned = newCompleted ? false : todo.pinned;

    setTodos(prev => prev.map(t =>
      t.id === todoId ? { ...t, subtasks: newSubtasks, completed: newCompleted, pinned: newPinned } : t
    ));

    if (user) {
      await supabase
        .from('todos')
        .update({ subtasks: newSubtasks, completed: newCompleted, pinned: newPinned })
        .eq('id', todoId);
    }
  };

  const deleteSubtask = async (todoId, subtaskId) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const newSubtasks = todo.subtasks.filter(st => st.id !== subtaskId);

    setTodos(prev => prev.map(t => {
      if (t.id !== todoId) return t;
      return { ...t, subtasks: newSubtasks };
    }));

    if (user) {
      await supabase.from('todos').update({ subtasks: newSubtasks }).eq('id', todoId);
    }
  };

  const addSubtask = async (todoId, text) => {
    if (!text || !text.trim()) return;

    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const newSubtask = { id: Date.now(), text: text, completed: false };
    const newSubtasks = [...todo.subtasks, newSubtask];

    setTodos(prev => prev.map(t => {
      if (t.id !== todoId) return t;
      return {
        ...t,
        subtasks: newSubtasks,
        expanded: true
      };
    }));

    if (user) {
      await supabase.from('todos').update({ subtasks: newSubtasks }).eq('id', todoId);
    }
  };

  const togglePin = async (id) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (!todo.pinned) {
      const currentPinnedCount = todos.filter(t => t.pinned).length;
      if (currentPinnedCount >= 3) {
        toast.error("You can pin at most 3 tasks.", { id: 'pin-limit-reached' });
        return;
      }
    }

    // Optimistic
    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, pinned: !t.pinned } : t
    ));

    if (user) {
      await supabase.from('todos').update({ pinned: !todo.pinned }).eq('id', id);
    }
    if (user) {
      await supabase.from('todos').update({ pinned: !todo.pinned }).eq('id', id);
    }
  };

  const editTodo = async (id, newText) => {
    if (!newText || !newText.trim()) return;

    setTodos(prev => prev.map(t =>
      t.id === id ? { ...t, text: newText } : t
    ));

    if (user) {
      await supabase.from('todos').update({ text: newText }).eq('id', id);
    }
  };

  const editSubtask = async (todoId, subtaskId, newText) => {
    if (!newText || !newText.trim()) return;

    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const newSubtasks = todo.subtasks.map(st =>
      st.id === subtaskId ? { ...st, text: newText } : st
    );

    setTodos(prev => prev.map(t =>
      t.id === todoId ? { ...t, subtasks: newSubtasks } : t
    ));

    if (user) {
      await supabase.from('todos').update({ subtasks: newSubtasks }).eq('id', todoId);
    }
  };

  const completeNextSubtask = async (todoId) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const firstIncompleteIndex = todo.subtasks.findIndex(st => !st.completed);
    if (firstIncompleteIndex === -1) return;

    const newSubtasks = [...todo.subtasks];
    newSubtasks[firstIncompleteIndex] = { ...newSubtasks[firstIncompleteIndex], completed: true };

    const allSubtasksCompleted = newSubtasks.length > 0 && newSubtasks.every(st => st.completed);
    const newCompleted = allSubtasksCompleted ? true : todo.completed;

    // If it becomes completed, unpin it
    const newPinned = newCompleted ? false : todo.pinned;

    setTodos(prev => prev.map(t => {
      if (t.id !== todoId) return t;
      return { ...t, subtasks: newSubtasks, completed: newCompleted, pinned: newPinned };
    }));

    if (user) {
      await supabase
        .from('todos')
        .update({ subtasks: newSubtasks, completed: newCompleted, pinned: newPinned })
        .eq('id', todoId);
    }
  };


  return (
    <div className="layout">
      <div className="main-body">
        <Sidebar
          activePage={activePage}
          setActivePage={handlePageChange}
          darkMode={darkMode}
          setDarkMode={updateTheme}
          onAuthClick={handleAuthClick}
          user={user}
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          rightSidebarMode={rightSidebarMode}
          setRightSidebarMode={setRightSidebarMode}
          settingsTab={settingsTab}
          setSettingsTab={setSettingsTab}
          pinnedPages={pinnedPages}
          updatePinnedPages={updatePinnedPages}
          onOpenSearch={toggleSearch}
          updateSettingPreference={updateSettingPreference}
        />
        <RightSidebar
          user={user}
          isSettingsOpen={isSettingsOpen}
          mode={rightSidebarMode}
          setActivePage={handlePageChange}
          todos={todos}
          completeNextSubtask={completeNextSubtask}
          pinnedPages={pinnedPages}
          onOpenSearch={toggleSearch}
        />
        <TopBar
          darkMode={darkMode}
          setDarkMode={updateTheme}
          onAuthClick={handleAuthClick}
          user={user}
          navigateOnly={handlePageChange}
          sortPreference={sortPreference}
          onSortChange={updateSortPreference}
          openSettings={openSettings}
          isMobile={isMobile}
          activePage={activePage}
          onOpenSearch={toggleSearch}
        />
        <div
          className="content-area"
          ref={contentAreaRef}
          style={{ overflowY: loadingState !== 'off' ? 'hidden' : undefined }}
        >
          {renderContent()}
          {loadingState !== 'off' && (
            <LoadingScreen
              darkMode={loaderTheme}
              fadeOut={loadingState === 'fading'}
              isGlobal={loadingScope === 'global'}
            />
          )}
        </div>
      </div>
      <AuthDrawer
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        startStep={authStartStep}
        mode={authMode}
        user={user}
        darkMode={darkMode}
        setDarkMode={updateTheme}
      />
      <Toaster />
      {isSearchOpen && (
        <SearchOverlay
          navigateOnly={handlePageChange}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
