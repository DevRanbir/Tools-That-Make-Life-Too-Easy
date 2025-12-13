import React, { useState, useEffect } from 'react';
import LoadingScreen from './components/LoadingScreen';
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
import TodosPage from './pages/Todos';
// import ForYou from './pages/ForYou'; // Reusing Trending for now as requested "same as 2nd"

import { supabase } from './supabase';
import { Toaster, toast } from 'sonner';

const App = () => {
  const [loadingState, setLoadingState] = useState('active'); // 'active' | 'fading' | 'off'
  const [loadingScope, setLoadingScope] = useState('global'); // 'local' | 'global'

  // Initial loading effect
  const timerRef = React.useRef(null);

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

  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    // Default to true (dark) if nothing saved
    return saved !== null ? JSON.parse(saved) : true;
  });
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
    if (path === '/tags') return 'tags';
    if (path === '/fast') return 'fastmode';
    if (path === '/shop') return 'shop';
    if (path === '/calendar') return 'calendar';
    if (path === '/data') return 'data';
    if (path === '/for-you') return 'home';
    return 'manual';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [user, setUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { id: 1, role: 'ai', content: "Hello! I'm your AI assistant. I'm currently in beta mode, but feel free to ask me anything about the tools available here!" }
  ]);
  // activePage determines which page component to render

  const handlePageChange = (newPage) => {
    if (newPage === activePage) return;

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
        // NOTE: We do NOT update loaderTheme here. It stays on the OLD theme.
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
    let pageTitle = 'Manual';

    if (activePage === 'manage') { path = '/manage'; pageTitle = 'Manage'; }
    else if (activePage === 'search') { path = '/search'; pageTitle = 'Search'; }
    else if (activePage === 'todos') { path = '/todos'; pageTitle = 'Todos'; }
    else if (activePage === 'tags') { path = '/tags'; pageTitle = 'Tags'; }
    else if (activePage === 'fastmode') { path = '/fast'; pageTitle = 'Fast Mode'; }
    else if (activePage === 'shop') { path = '/shop'; pageTitle = 'Shop'; }
    else if (activePage === 'calendar') { path = '/calendar'; pageTitle = 'Calendar'; }
    else if (activePage === 'data') { path = '/data'; pageTitle = 'Data'; }
    else if (activePage === 'home') { path = '/for-you'; pageTitle = 'For You'; }
    else { path = '/'; pageTitle = 'Manual'; } // manual

    document.title = `${pageTitle} - Tools That Make Life Too Easy`;

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
      case 'home': return <Manual navigateOnly={handlePageChange} pageName="For You" user={user} sortPreference={sortPreference} />;
      case 'fastmode': return <FastMode navigateOnly={handlePageChange} user={user} messages={chatMessages} setMessages={setChatMessages} />;
      case 'manual': return <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'search': return <SearchPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} />;
      case 'todos': return <TodosPage
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
      />;
      case 'tags': return <TagsPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} />;
      case 'shop': return <ShopPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} />;
      case 'calendar': return user ? <CalendarPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'data': return user ? <DataPage navigateOnly={handlePageChange} user={user} sortPreference={sortPreference} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} />;
      case 'manage': return (user && user.user_metadata?.role === 'administrator') ? <Manage navigateOnly={handlePageChange} /> : <Manual navigateOnly={handlePageChange} pageName="Manual" user={user} sortPreference={sortPreference} />;
      default: return <Home navigateOnly={handlePageChange} sortPreference={sortPreference} />;
    }
  };

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('preferences');
  const [rightSidebarMode, setRightSidebarMode] = useState('full'); // 'full' | 'events' | 'saved' | 'hidden'

  const openSettings = (tab = 'preferences') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

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


  // ...

  // Removed simple early return. Logic moved to overlay below.


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
        />
        <RightSidebar
          user={user}
          isSettingsOpen={isSettingsOpen}
          mode={rightSidebarMode}
          setActivePage={handlePageChange}
          todos={todos}
          completeNextSubtask={completeNextSubtask}
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
        />
        <div className="content-area">
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
