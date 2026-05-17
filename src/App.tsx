import React, { useState, useRef, useEffect } from 'react';
import { Send, StopCircle, Home, MessageSquare, Database, FileText, Users, Settings, Plus, Globe, ChevronDown, ArrowRight, Lock, Sun, LayoutGrid, Box, Code, Circle, ArrowUp, X, User, LogIn, LogOut, Mic, MicOff, Volume2, VolumeX, Edit2, Check, Trash2 } from 'lucide-react';
import { MessageComponent, ChatMessage } from './components/MessageComponent';
import { LiveChat } from './components/LiveChat';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, signInWithGoogle, signOut } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestoreInfo';

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeView, setActiveView] = useState('home');
  const [currentAgent, setCurrentAgent] = useState('Fusion');
  const [showLiveChat, setShowLiveChat] = useState(false);
  const [jokeMode, setJokeMode] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Groupchat state
  const [gcMessages, setGcMessages] = useState<ChatMessage[]>([]);
  const [gcInput, setGcInput] = useState('');
  const [gcUsage, setGcUsage] = useState({ date: new Date().toLocaleDateString(), count: 0 });
  const [isNightTime, setIsNightTime] = useState(false);
  const [isGroqEnabled, setIsGroqEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => setIsGroqEnabled(d.hasGroq)).catch(console.error);

    const checkTime = () => {
      const hr = new Date().getHours();
      setIsNightTime(hr >= 23 || hr < 4);
    };
    checkTime();
    const iv = setInterval(checkTime, 1000 * 60);
    return () => clearInterval(iv);
  }, []);

  // Theme state
  const [currentTheme, setCurrentTheme] = useState('default');
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userName, setUserName] = useState('');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Thread editing state
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [focusActive, setFocusActive] = useState(false);
  
  // Voice state
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('fusion-theme') || 'default';
      setCurrentTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
      
      const savedAutoScroll = localStorage.getItem('fusion-autoscroll');
      if (savedAutoScroll !== null) {
        setAutoScroll(savedAutoScroll === 'true');
      }

      const savedJokeMode = localStorage.getItem('fusion-jokemode');
      if (savedJokeMode !== null) {
        setJokeMode(savedJokeMode === 'true');
      }
      
      if (!localStorage.getItem('fusion-visited')) {
        setIsFirstVisit(true);
      }

      const savedThreads = localStorage.getItem('fusion-threads');
      if (savedThreads) {
        try {
          const parsed = JSON.parse(savedThreads);
          setThreads(parsed);
        } catch (e) {
          console.error("Failed to parse threads", e);
        }
      }
      
      const savedGcUsage = localStorage.getItem('fusion-gc-usage');
      if (savedGcUsage) {
        try {
          const parsed = JSON.parse(savedGcUsage);
          if (parsed.date === new Date().toLocaleDateString()) {
            setGcUsage(parsed);
          } else {
            setGcUsage({ date: new Date().toLocaleDateString(), count: 0 });
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (currentThreadId && messages.length > 0) {
      setThreads(prev => {
        const existing = prev.find(t => t.id === currentThreadId);
        let newThreads;
        if (existing) {
          newThreads = prev.map(t => t.id === currentThreadId ? { ...t, messages, updatedAt: Date.now() } : t);
        } else {
          const title = 'New Chat';
          newThreads = [{ id: currentThreadId, title, messages, updatedAt: Date.now() }, ...prev];
        }
        localStorage.setItem('fusion-threads', JSON.stringify(newThreads));
        return newThreads;
      });
    }
  }, [messages, currentThreadId]);

  const handleThemeSelect = (themeName: string) => {
    setCurrentTheme(themeName);
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('fusion-theme', themeName);
    localStorage.setItem('fusion-visited', 'true');
    setIsFirstVisit(false);
  };

  useEffect(() => {
    // Initialize Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        
        recognitionRef.current.onstart = () => {
          setIsListening(true);
        };
        
        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(transcript);
          // Automatically submit when voice stops
          handleSubmit(undefined, transcript);
        };
        
        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
        };
        
        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setInput(''); // Clear input for new speech
      recognitionRef.current?.start();
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setUserName(userDoc.data().displayName || '');
          } else {
            // First time login
            const defaultName = user.displayName || 'You';
            setUserName(defaultName);
            await setDoc(userDocRef, {
              uid: user.uid,
              email: user.email || '',
              displayName: defaultName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            setIsProfileModalOpen(true); // Open modal on first login to set name
          }
        } catch (error: any) {
          console.error("Firestore init error", error);
          if (error?.message?.includes("Missing or insufficient permissions")) {
             // likely rule propagation delay or non-existent scenario causing denial in edge cases
             console.warn("Permission denied getting user doc, it may not exist or rules are propagating");
             setUserName(user.displayName || 'You'); 
          } else {
             // For debugging inside AI Studio
             handleFirestoreError(error, OperationType.GET, 'users');
          }
        }
      } else {
        setUserName('');
      }
      setIsAuthLoading(false);
    }, (error) => {
      console.error(error);
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        await updateDoc(userDocRef, {
          displayName: userName,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(userDocRef, {
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: userName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsProfileModalOpen(false);
    } catch (error) {
       console.error("Error saving profile", error);
       handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsProfileModalOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault();
    const submitText = overrideInput || input;
    if (!submitText.trim() || isGenerating) return;

    let activeThreadId = currentThreadId;
    let isNewThread = false;
    if (!activeThreadId) {
      activeThreadId = crypto.randomUUID();
      setCurrentThreadId(activeThreadId);
      isNewThread = true;
    }

    if (isNewThread) {
      fetch('/api/name-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: submitText })
      }).then(res => res.json()).then(data => {
         if (data.title && data.title !== 'New Chat') {
           setThreads(prev => {
              const newThreads = prev.map(t => t.id === activeThreadId ? { ...t, title: data.title } : t);
              localStorage.setItem('fusion-threads', JSON.stringify(newThreads));
              return newThreads;
           });
         }
      }).catch(err => console.error(err));
    }

    const userMessage: ChatMessage = { role: 'user', text: submitText };
    let newMessages = [...messages, userMessage];

    const isCodingRelated = /code|react|python|html|css|javascript|typescript|rust|go|c\+\+|java|algorithm|bug|error|debug|api|function|array|loop/i.test(submitText);
    let agentToUse = currentAgent;
    
    setInput('');
    setIsGenerating(true);

    if (isCodingRelated && currentAgent !== 'CodeBro') {
      agentToUse = 'CodeBro';
      setCurrentAgent('CodeBro');
      
      setMessages([...newMessages]);
      
      // Simulate typing delay for the first message
      await new Promise(resolve => setTimeout(resolve, 1500));
      const fusionHoldsMessage: ChatMessage = { role: 'model', text: "coding stuff isn't really my lane 😭\n\nlemme grab CodeBro.", agentName: 'Fusion' };
      newMessages = [...newMessages, fusionHoldsMessage];
      setMessages([...newMessages]);
      
      // Simulate delay before system notification
      await new Promise(resolve => setTimeout(resolve, 1800));
      const systemMessage: ChatMessage = { role: 'system_notification', text: "Fusion - CodeBro has joined the chat." };
      newMessages = [...newMessages, systemMessage];
      setMessages([...newMessages]);
      
      // Small pause before codebro starts generating response
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      setMessages(newMessages);
    }

    const modelMessage: ChatMessage = { role: 'model', text: '' };
    setMessages([...newMessages, modelMessage]);

    abortControllerRef.current = new AbortController();

    try {
      // Build history for backend API expected format
      const contents = newMessages.filter(msg => msg.role !== 'system_notification').map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, currentAgent: agentToUse, jokeMode }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        let errMessage = 'An error occurred';
        try {
          const resJson = await response.json();
          errMessage = resJson.error || errMessage;
        } catch { }
        throw new Error(errMessage);
      }

      if (!response.body) throw new Error("No body in response");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let fullResponseText = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkString = decoder.decode(value, { stream: true });
          const lines = chunkString.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(5).trim();
              if (data === '[DONE]') {
                done = true;
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (typeof parsed.text === 'string') {
                  fullResponseText += parsed.text;
                  setMessages(prev => {
                    const cloned = [...prev];
                    const last = cloned[cloned.length - 1];
                    cloned[cloned.length - 1] = { 
                      ...last, 
                      text: last.text + parsed.text,
                      isLive: last.isLive || parsed.isLive
                    };
                    return cloned;
                  });
                }
              } catch (err) {
                // Ignore parse errors on split chunks
              }
            }
          }
        }
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("Generation stopped");
      } else {
        console.error("Chat error:", error);
        setMessages(prev => {
          const cloned = [...prev];
          const last = cloned[cloned.length - 1];
          cloned[cloned.length - 1] = { ...last, text: last.text + `\n\n**Error:** ${error.message}` };
          return cloned;
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleGCSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!gcInput.trim() || isGenerating) return;

    if (gcUsage.count >= 5) {
      alert("You have reached the limit of 5 Groupchat uses per day. The GC needs to sleep.");
      return;
    }

    const newUsage = { date: gcUsage.date, count: gcUsage.count + 1 };
    setGcUsage(newUsage);
    localStorage.setItem('fusion-gc-usage', JSON.stringify(newUsage));

    const userMessage: ChatMessage = { role: 'user', text: gcInput };
    setGcMessages(prev => [...prev, userMessage]);
    setGcInput('');
    setIsGenerating(true);

    abortControllerRef.current = new AbortController();

    const isLateNight = new Date().getHours() >= 23 || new Date().getHours() < 4;

    try {
      const contents = [...gcMessages, userMessage].map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const response = await fetch('/api/groupchat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, isLateNight }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error("API error");
      if (!response.body) throw new Error("No body");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let fullResponseText = '';
      
      const updateParsedMessages = (latestText: string) => {
          const parsedMessages: ChatMessage[] = [];
          const lines = latestText.split('\n');
          let currAgent = "Fusion";
          let currText = "";
          let isAction = false;
          
          for (let line of lines) {
            const match = line.match(/^(CodeBro|LoreKeeper|SearchGoblin|CinemaKid|Fusion):\s*(.*)/i);
            if (match) {
              if (currText.trim()) {
                 parsedMessages.push({ role: "model", text: currText.trim(), agentName: currAgent, isAction });
              }
              currAgent = match[1];
              let matchText = match[2];
              
              if (matchText.startsWith("Action: ")) {
                 isAction = true;
                 currText = matchText.substring(8) + "\n";
              } else {
                 isAction = false;
                 currText = matchText + "\n";
              }
            } else {
              currText += line + "\n";
            }
          }
          if (currText.trim()) {
            parsedMessages.push({ role: "model", text: currText.trim(), agentName: currAgent, isAction });
          }
          return parsedMessages;
      };

      setGcMessages(prev => [...prev, { role: 'model', text: '', agentName: 'Fusion' }]); // Placeholder to be replaced

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkString = decoder.decode(value, { stream: true });
          const lines = chunkString.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(5).trim();
              if (data === '[DONE]') {
                done = true;
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (typeof parsed.text === 'string') {
                  fullResponseText += parsed.text;
                  const newParsedMsgs = updateParsedMessages(fullResponseText);
                  setGcMessages(prev => {
                     // Keep user messages and previous model messages
                     const baseMessages = prev.filter(msg => {
                        // Keep if it's not part of the current stream
                        // since we append multiple messages, this is tricky.
                        // Actually, it's easier to just replace all messages after the last user message.
                        return false; 
                     });
                     // wait, safer way: keep up to the user message
                     const allExceptLatestStream = prev.slice(0, prev.findLastIndex(p => p.role === 'user') + 1);
                     return [...allExceptLatestStream, ...newParsedMsgs];
                  });
                }
              } catch (err) {}
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
         console.error(error);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  };

  const handleCardClick = (promptText: string) => {
    handleSubmit(undefined, promptText);
  };

  return (
    <div className="flex h-screen bg-[var(--bg-main)] text-[var(--text-primary)] font-sans antialiased overflow-hidden selection:bg-[var(--bg-inverse)]/20">
      
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col bg-[var(--bg-main)] z-20">
        <div className="px-6 py-8 flex items-center gap-3">
          <div className="w-8 h-8 relative flex items-center justify-center">
            <div className="absolute w-3.5 h-3.5 bg-[#D2C3B2] rounded-[2px] transform rotate-45 -translate-y-[4px] -translate-x-[4px]"></div>
            <div className="absolute w-3.5 h-3.5 bg-[#6F5B4D] rounded-[2px] transform rotate-45 translate-y-[4px] translate-x-[4px]"></div>
            <div className="absolute w-3.5 h-3.5 bg-[#9C8573] rounded-[2px] transform rotate-45 -translate-y-[4px] translate-x-[4px]"></div>
            <div className="absolute w-3.5 h-3.5 bg-[#4E4035] rounded-[2px] transform rotate-45 translate-y-[4px] -translate-x-[4px]"></div>
          </div>
          <h1 className="font-serif text-[24px] tracking-wide text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2">
            {currentAgent === 'Fusion' ? 'Fusion' : `Fusion - ${currentAgent}`}
            <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded tracking-wider uppercase font-sans font-medium flex-shrink-0 animate-pulse">Beta</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 py-2 flex flex-col gap-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setActiveView('home');
              setMessages([]);
              setCurrentThreadId(null);
            }}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px]", activeView === 'home' && !currentThreadId ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <Plus size={18} className="opacity-80" strokeWidth={1.5} />
            New Chat
          </motion.button>
          
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveView('home')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px]", activeView === 'home' && currentThreadId ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <Home size={18} className="opacity-80" strokeWidth={1.5} />
            The Crib
          </motion.button>
          
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveView('memory')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px]", activeView === 'memory' ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <Database size={18} className="opacity-80" strokeWidth={1.5} />
            Deep Lore
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveView('files')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px]", activeView === 'files' ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <FileText size={18} className="opacity-80" strokeWidth={1.5} />
            Receipts
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveView('agents')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px]", activeView === 'agents' ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <Users size={18} className="opacity-80" strokeWidth={1.5} />
            The Squad
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveView('groupchat')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px]", activeView === 'groupchat' ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <Users size={18} className="opacity-80" strokeWidth={1.5} />
            Groupchat
            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded tracking-wider uppercase ml-auto">Beta</span>
          </motion.button>

          {threads.length > 0 && (
            <>
              <div className="mt-4 mb-1 px-4 text-[11px] font-mono tracking-widest text-[var(--text-muted-dark)] uppercase">
                Recent Chats
              </div>
              <div className="flex flex-col gap-0.5">
                {threads.map(thread => (
                  <div key={thread.id} className="relative group">
                    {editingThreadId === thread.id ? (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-overlay-02)]">
                        <MessageSquare size={14} className="opacity-60 shrink-0 text-[var(--text-primary)]" />
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (editingTitle.trim()) {
                                setThreads(prev => {
                                  const newThreads = prev.map(t => t.id === thread.id ? { ...t, title: editingTitle.trim() } : t);
                                  localStorage.setItem('fusion-threads', JSON.stringify(newThreads));
                                  return newThreads;
                                });
                              }
                              setEditingThreadId(null);
                            } else if (e.key === 'Escape') {
                              setEditingThreadId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingTitle.trim()) {
                              setThreads(prev => {
                                const newThreads = prev.map(t => t.id === thread.id ? { ...t, title: editingTitle.trim() } : t);
                                localStorage.setItem('fusion-threads', JSON.stringify(newThreads));
                                return newThreads;
                              });
                            }
                            setEditingThreadId(null);
                          }}
                          className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] font-medium outline-none min-w-0"
                        />
                        <button
                          className="p-1 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur
                            if (editingTitle.trim()) {
                              setThreads(prev => {
                                const newThreads = prev.map(t => t.id === thread.id ? { ...t, title: editingTitle.trim() } : t);
                                localStorage.setItem('fusion-threads', JSON.stringify(newThreads));
                                return newThreads;
                              });
                            }
                            setEditingThreadId(null);
                          }}
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setCurrentThreadId(thread.id);
                          setMessages(thread.messages);
                          setActiveView('home');
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-colors text-[13px] text-left",
                          currentThreadId === thread.id && activeView === 'home'
                            ? "bg-[var(--bg-overlay-02)] text-[var(--text-primary)] font-medium"
                            : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-01)] hover:text-[var(--text-secondary)]"
                        )}
                      >
                        <div className="flex items-center gap-3 w-full min-w-0 pr-6">
                          <MessageSquare size={14} className="opacity-60 shrink-0" />
                          <span className="truncate flex-1">{thread.title}</span>
                        </div>
                        <div 
                          className={cn(
                            "absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center bg-transparent gap-0.5",
                            currentThreadId === thread.id && activeView === 'home' ? "bg-[var(--bg-overlay-02)] from-[var(--bg-overlay-02)]" : "bg-[var(--bg-main)] group-hover:bg-[var(--bg-overlay-01)] from-[var(--bg-main)] group-hover:from-[var(--bg-overlay-01)]"
                          )}
                        >
                          <div 
                            className="p-1.5 rounded-md hover:bg-[var(--bg-overlay-04)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingThreadId(thread.id);
                              setEditingTitle(thread.title);
                            }}
                          >
                            <Edit2 size={13} />
                          </div>
                          <div 
                            className="p-1.5 rounded-md hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setThreads(prev => {
                                const newThreads = prev.filter(t => t.id !== thread.id);
                                localStorage.setItem('fusion-threads', JSON.stringify(newThreads));
                                return newThreads;
                              });
                              if (currentThreadId === thread.id) {
                                setCurrentThreadId(null);
                                setMessages([]);
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="p-4 flex flex-col gap-1">
          <button 
            onClick={() => setActiveView('settings')}
            className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors font-medium text-[14px] mb-2", activeView === 'settings' ? "bg-[var(--bg-overlay-04)] text-[var(--accent-primary)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-overlay-02)] hover:text-[var(--text-secondary)]")}
          >
            <Settings size={18} className="opacity-80" strokeWidth={1.5} />
            Vibe Check
          </button>
          
          <button 
            onClick={() => currentUser ? setIsProfileModalOpen(true) : handleSignIn()}
            className="flex items-center justify-between px-3 py-2.5 rounded-2xl hover:bg-[var(--bg-overlay-02)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-overlay-04)] text-[var(--text-muted-dark)] flex items-center justify-center text-[11px] font-medium border border-transparent">
                {currentUser ? getUserInitials(userName) : <User size={14} />}
              </div>
              <span className="text-[13px] font-medium text-[var(--text-muted-dark)] truncate max-w-[100px] text-left">
                {isAuthLoading ? 'Loading...' : (currentUser ? (userName || 'Profile') : 'Sign In')}
              </span>
            </div>
            {currentUser && <ChevronDown size={14} className="text-[var(--text-muted-dark)]" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 relative flex flex-col min-w-0 bg-[var(--bg-main)] overflow-hidden">
        
        {/* Ambient Background Gradients */}
        <div className="absolute top-[-20%] left-[10%] w-[60vw] h-[60vw] bg-[#FF719A] opacity-[0.06] blur-[160px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-[#4E6BFF] opacity-[0.06] blur-[160px] rounded-full pointer-events-none"></div>
        
        {/* Top Header */}
        <header className="absolute top-0 right-0 left-0 p-6 flex justify-end items-center gap-3 z-20 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4">
            <button className="w-9 h-9 flex items-center justify-center hover:bg-[var(--bg-overlay-05)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Sun size={18} strokeWidth={1.5} />
            </button>
            {currentUser ? (
              <button 
                onClick={() => setIsProfileModalOpen(true)}
                className="w-9 h-9 rounded-full bg-[var(--bg-modal)] text-[var(--text-secondary)] flex items-center justify-center text-[13px] font-medium border border-white-[0.05] hover:border-[var(--border-medium)] transition-colors"
              >
                {getUserInitials(userName)[0]}
              </button>
            ) : (
              <button
                onClick={handleSignIn}
                className="px-4 py-1.5 rounded-full bg-[var(--accent-primary)] text-[var(--bg-main)] text-[13px] font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Status Indicator */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
            >
              <div className="flex items-center gap-3 bg-[var(--bg-modal)]/90 backdrop-blur-md border border-[var(--border-light)] rounded-full pl-3 pr-4 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
                 <div className="relative flex h-3 w-3">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                 </div>
                 <span className="text-[13px] font-medium text-[var(--text-primary)]">Listening...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto scroll-smooth flex flex-col items-center">
          
          {activeView === 'threads' && (
            <div className="flex-1 w-full flex flex-col px-8 pt-16 max-w-4xl">
              <div className="w-full mb-8">
                <h2 className="text-[32px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-2">
                  Yapping History
                </h2>
                <p className="text-[15px] text-[var(--text-secondary)] font-medium tracking-wide">
                  All your past yaps, saved right here. No cap.
                </p>
              </div>
              <div className="w-full flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-5 rounded-[20px] bg-[var(--bg-surface)]/60 border border-[var(--border-light)] hover:bg-[var(--bg-surface-hover)]/80 transition-colors cursor-pointer flex flex-col gap-2">
                     <span className="text-xs font-mono text-[var(--text-muted-dark)]">Today, 2:4{i} PM</span>
                     <p className="text-[var(--text-primary)] font-medium">Explain why quantum computing is actually goated...</p>
                     <p className="text-[var(--text-muted)] text-sm line-clamp-1">Bro, so basically quantum computing is like mewing for computers...</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'memory' && (
            <div className="flex-1 w-full flex flex-col px-8 pt-16 max-w-4xl">
              <div className="w-full mb-8">
                <h2 className="text-[32px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-2">
                  Deep Lore
                </h2>
                <p className="text-[15px] text-[var(--text-secondary)] font-medium tracking-wide">
                  Things I remember about your vibe.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-[20px] bg-[var(--bg-surface)]/60 border border-[var(--border-light)] flex flex-col gap-2">
                   <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center mb-2">
                      <Database size={16} />
                   </div>
                   <h3 className="text-[var(--text-primary)] font-medium">Tech Stack</h3>
                   <p className="text-[var(--text-muted)] text-sm">Likes to build stuff with React and Tailwind. Big fan of clean interfaces.</p>
                </div>
                <div className="p-5 rounded-[20px] bg-[var(--bg-surface)]/60 border border-[var(--border-light)] flex flex-col gap-2">
                   <div className="w-8 h-8 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center mb-2">
                      <Circle size={16} />
                   </div>
                   <h3 className="text-[var(--text-primary)] font-medium">Communication Style</h3>
                   <p className="text-[var(--text-muted)] text-sm">Prefers straight to the point answers but with a chill, unhinged vibe.</p>
                </div>
              </div>
            </div>
          )}

          {activeView === 'files' && (
            <div className="flex-1 w-full flex flex-col px-8 pt-16 max-w-4xl">
              <div className="w-full mb-8">
                <h2 className="text-[32px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-2">
                  Receipts
                </h2>
                <p className="text-[15px] text-[var(--text-secondary)] font-medium tracking-wide">
                  Drop your files, PDFs, or code snippets here so I can analyze them.
                </p>
              </div>
              <div className="w-full flex-1 min-h-[300px] border-[var(--bg-border-strong)] border-dashed border-[var(--border-medium)] rounded-[24px] bg-[var(--bg-panel)]/50 flex flex-col items-center justify-center gap-4 transition-colors hover:border-[var(--border-strong)] mb-12">
                 <div className="w-12 h-12 rounded-full bg-[var(--bg-overlay-05)] flex items-center justify-center text-[var(--text-muted)]">
                    <FileText size={24} />
                 </div>
                 <div className="text-center">
                    <p className="text-[var(--text-primary)] font-medium mb-1">Drag and drop your receipts here</p>
                    <p className="text-[var(--text-muted-dark)] text-sm">PDFs, text, and images supported</p>
                 </div>
                 <button className="px-5 py-2.5 rounded-full bg-[var(--bg-overlay-05)] hover:bg-[var(--bg-overlay-10)] text-[var(--text-primary)] text-[13px] font-medium transition-colors mt-2">
                    Browse Files
                 </button>
              </div>
            </div>
          )}

          {activeView === 'agents' && (
            <div className="flex-1 w-full flex flex-col px-8 pt-16 max-w-4xl">
              <div className="w-full mb-8">
                <h2 className="text-[32px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-2">
                  The Squad
                </h2>
                <p className="text-[15px] text-[var(--text-secondary)] font-medium tracking-wide">
                  Switch out my personality to one of my variants.
                </p>
              </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { name: "Fusion", desc: "Late-night conversational companion.", color: "from-[#8b5cf6] to-[#3b82f6]" },
                    { name: "CodeBro", desc: "Coding + debugging specialist.", color: "from-[#22c55e] to-[#14b8a6]" },
                    { name: "LoreKeeper", desc: "Memory + deep talks.", color: "from-[#f59e0b] to-[#ea580c]" },
                    { name: "SearchGoblin", desc: "Web-search obsessed info hunter 😭.", color: "from-[#ec4899] to-[#eab308]" },
                    { name: "CinemaKid", desc: "Movies, music, games.", color: "from-[#a855f7] to-[#ec4899]" }
                  ].map((agent, i) => (
                   <div 
                     key={i} 
                     onClick={() => setCurrentAgent(agent.name)}
                     className={cn("p-5 rounded-[20px] bg-[var(--bg-surface)]/60 border transition-colors cursor-pointer flex flex-col gap-3", agent.name === currentAgent ? "border-[var(--border-strong)] ring-1 ring-[var(--border-medium)]" : "border-[var(--border-light)] hover:bg-[var(--bg-surface-hover)]/80")}
                   >
                      <div className={cn("w-10 h-10 rounded-full bg-gradient-to-tr flex items-center justify-center shadow-lg", agent.color)}>
                         <span className="text-[var(--text-inverse)] text-xs font-bold font-serif">{agent.name[0]}</span>
                      </div>
                      <div>
                         <h3 className="text-[var(--text-primary)] font-medium text-lg">{agent.name} {agent.name === currentAgent && <span className="text-xs bg-[var(--bg-inverse)]/10 px-2 py-0.5 rounded-full ml-2 text-[var(--text-secondary)]">Current</span>}</h3>
                         <p className="text-[var(--text-muted)] text-sm mt-1">{agent.desc}</p>
                      </div>
                   </div>
                 ))}
              </div>
            </div>
          )}

          {activeView === 'settings' && (
            <div className="flex-1 w-full flex flex-col px-8 pt-16 max-w-4xl">
              <div className="w-full mb-8">
                <h2 className="text-[32px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-2">
                  Vibe Check
                </h2>
                <p className="text-[15px] text-[var(--text-secondary)] font-medium tracking-wide">
                  Configure your experience.
                </p>
              </div>
              <div className="w-full flex space-y-6 flex-col pb-12">
                <div className="p-6 rounded-[24px] bg-[var(--bg-surface)] border border-[var(--border-light)] flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="text-[var(--text-primary)] font-medium mb-1">Brainrot Level</h4>
                        <p className="text-[var(--text-muted)] text-sm">How much slang I should use.</p>
                     </div>
                     <select defaultValue="Brainrot (Max)" className="bg-[var(--bg-modal)] border border-[var(--border-medium)] rounded-lg px-4 py-2 text-[var(--text-primary)] focus:outline-none text-sm">
                        <option>Normie (Low)</option>
                        <option>Chronically Online (Medium)</option>
                        <option>Brainrot (Max)</option>
                     </select>
                  </div>
                  <div className="h-px bg-[var(--bg-overlay-05)] w-full" />
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="text-[var(--text-primary)] font-medium mb-1">Permanent Joke Mode</h4>
                        <p className="text-[var(--text-muted)] text-sm">Makes Fusion unhinged 24/7 (unless you need real help).</p>
                     </div>
                     <button 
                       onClick={() => {
                         const newValue = !jokeMode;
                         setJokeMode(newValue);
                         localStorage.setItem('fusion-jokemode', newValue.toString());
                       }}
                       className={cn("w-12 h-6 rounded-full flex items-center px-1 transition-colors", jokeMode ? "bg-blue-500" : "bg-[#3A3940]")}
                     >
                        <div className={cn("w-4 h-4 rounded-full bg-[var(--bg-inverse)] transition-transform", jokeMode ? "transform translate-x-6" : "transform translate-x-0")}></div>
                     </button>
                  </div>
                  <div className="h-px bg-[var(--bg-overlay-05)] w-full" />
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="text-[var(--text-primary)] font-medium mb-1">Aesthetic</h4>
                        <p className="text-[var(--text-muted)] text-sm">Change the vibe of the entire app.</p>
                     </div>
                     <select 
                        value={currentTheme}
                        onChange={(e) => handleThemeSelect(e.target.value)}
                        className="bg-[var(--bg-modal)] border border-[var(--border-medium)] rounded-lg px-4 py-2 text-[var(--text-primary)] focus:outline-none text-sm"
                     >
                        <option value="default">Midnight</option>
                        <option value="girly-pop">Girly Pop</option>
                        <option value="pinterest-minimal">Minimal</option>
                     </select>
                  </div>
                  <div className="h-px bg-[var(--bg-overlay-05)] w-full" />
                  <div className="flex items-center justify-between">
                     <div>
                        <h4 className="text-[var(--text-primary)] font-medium mb-1">Auto-scroll</h4>
                        <p className="text-[var(--text-muted)] text-sm">Automatically scroll to the newest messages.</p>
                     </div>
                     <button 
                       onClick={() => {
                         const newValue = !autoScroll;
                         setAutoScroll(newValue);
                         localStorage.setItem('fusion-autoscroll', newValue.toString());
                       }}
                       className={cn("w-12 h-6 rounded-full flex items-center px-1 transition-colors", autoScroll ? "bg-blue-500" : "bg-[#3A3940]")}
                     >
                        <div className={cn("w-4 h-4 rounded-full bg-[var(--bg-inverse)] transition-transform", autoScroll ? "transform translate-x-6" : "transform translate-x-0")}></div>
                     </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'home' && messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex-1 w-full flex flex-col justify-center items-center px-8 relative max-w-[840px]"
            >
              
              {/* Hero */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                className="text-center mb-10 transform -translate-y-8"
              >
                <h2 className="text-[64px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-4 drop-shadow-md">
                  What's the tea?
                </h2>
                <p className="text-[18px] text-[var(--text-secondary)] tracking-wide">
                  Your totally chill, super smart AI bestie and vibe-checker.
                </p>
              </motion.div>

              {/* Input Container */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                className="w-full mb-6"
              >
                <form 
                  onSubmit={handleSubmit}
                  className="bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-light)] rounded-[32px] p-5 flex flex-col focus-within:border-[var(--border-medium)] transition-all duration-500 shadow-[0_8px_40px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.02)_inset]"
                >
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px';
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Spill it..."
                    className="w-full py-2 px-2 min-h-[60px] max-h-[240px] text-[16px] focus:outline-none placeholder:text-[var(--text-muted-dark)] text-[var(--text-primary)] bg-transparent resize-none text-[var(--text-primary)] leading-relaxed custom-scrollbar font-sans"
                    rows={2}
                  />
                  
                  <div className="flex justify-between items-center mt-3 pt-2">
                    <div className="flex items-center gap-2">
                      <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full bg-transparent text-[var(--text-muted-dark)] hover:text-[var(--text-primary)] transition-colors">
                        <Plus size={20} strokeWidth={1.5} />
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setShowLiveChat(true)}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-transparent text-[var(--text-muted-dark)] hover:text-[var(--text-primary)] transition-colors"
                        title="Live Talk Mode"
                      >
                        <Mic size={20} strokeWidth={1.5} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[var(--text-muted-dark)]">
                        <span className="text-[11px] font-medium">⌘</span>
                        <span className="text-[11px] font-medium">↵</span>
                      </div>
                      
                      {isGenerating ? (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={stopGeneration}
                          title="Stop generating"
                          className="w-10 h-10 rounded-full bg-[var(--bg-inverse)] text-[var(--bg-main)] flex items-center justify-center shrink-0 hover:bg-[var(--accent-hover)]"
                        >
                          <StopCircle size={18} strokeWidth={2.5} fill="currentColor" />
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="submit"
                          disabled={!input.trim()}
                          className="w-10 h-10 rounded-full bg-[var(--bg-inverse)] text-[var(--bg-main)] flex items-center justify-center shrink-0 disabled:opacity-30 disabled:bg-[var(--bg-overlay-05)] disabled:text-[var(--text-muted-dark)] disabled:cursor-not-allowed hover:bg-[var(--accent-hover)]"
                        >
                          <ArrowUp size={20} strokeWidth={2} />
                        </motion.button>
                      )}
                    </div>
                  </div>
                </form>
              </motion.div>



            </motion.div>
          )}

          {activeView === 'groupchat' && (
            <div className={cn("flex flex-col w-full h-full relative font-sans transition-all duration-1000", isNightTime ? "bg-[#0a0a0e] text-[#a0a0b0]" : "")}>
              
              {isNightTime && (
                 <div className="absolute inset-0 pointer-events-none z-0 bg-blue-900/5 mix-blend-overlay"></div>
              )}

              <div className={cn("absolute top-0 left-0 right-0 z-10 px-8 py-6 pb-8 pointer-events-none flex justify-between items-center transition-colors duration-1000", isNightTime ? "bg-gradient-to-b from-[#0a0a0e] via-[#0a0a0e]/90 to-transparent" : "bg-gradient-to-b from-[var(--bg-main)] via-[var(--bg-main)]/90 to-transparent")}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">Groupchat</h2>
                    <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded tracking-wider uppercase ml-1 animate-pulse">Beta</span>
                    {isNightTime && (
                       <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded tracking-wider uppercase ml-1 flex items-center gap-1"><Sun size={10} className="hidden" />🌙 Late Night</span>
                    )}
                  </div>
                  <p className={cn("text-[13px]", isNightTime ? "text-indigo-200/50" : "text-[var(--text-muted)]")}>All the agents in one place. Daily limit: {gcUsage.count}/5</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pt-24 pb-32 flex flex-col items-center custom-scrollbar">
                <div className="max-w-[800px] w-full z-10 relative">
                  {gcMessages.length === 0 ? (
                    <div className={cn("w-full mt-20 flex flex-col items-center opacity-70", isNightTime ? "text-indigo-200/50" : "")}>
                       <Users size={32} className="mb-4" />
                       <h3 className={cn("font-medium mb-1", isNightTime ? "text-indigo-100" : "text-[var(--text-secondary)]")}>Start the chaos</h3>
                       <p className={cn("text-[13px] text-center max-w-sm", isNightTime ? "text-indigo-200/50" : "text-[var(--text-muted)]")}>Watch the models argue, agree, or roast each other over whatever you say.</p>
                    </div>
                  ) : (
                    gcMessages.map((m, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className={cn("w-full", m.role === 'model' && !m.text ? "animate-pulse" : "")}
                      >
                        <MessageComponent 
                          message={m} 
                          userName={userName} 
                          userInitials={getUserInitials(userName)} 
                          agentName={m.agentName || 'Fusion'}
                          isGenerating={isGenerating && i === gcMessages.length - 1}
                        />
                      </motion.div>
                    ))
                  )}
                  <div ref={bottomRef} className="h-4" />
                </div>
              </div>

              {/* Groupchat Input Area */}
              <div className={cn("absolute bottom-0 left-0 right-0 z-30 pt-16 pb-8 px-6 flex justify-center transition-colors duration-1000", isNightTime ? "bg-gradient-to-t from-[#0a0a0e] via-[#0a0a0e]/90 to-transparent" : "bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)]/90 to-transparent")}>
                 <div className="w-full max-w-[800px]">
                    <form 
                      onSubmit={handleGCSubmit}
                      className={cn("backdrop-blur-xl border rounded-[32px] p-2 pr-3 flex items-center shadow-[0_8px_40px_rgba(0,0,0,0.4)] transition-all duration-300", 
                        isNightTime ? "bg-[#14141d]/90 border-white/5 focus-within:border-indigo-500/30 text-[#e0e0e0]" : "bg-[var(--bg-surface)]/90 border-[var(--border-light)] focus-within:border-[var(--border-medium)]")}
                    >
                      <textarea
                        value={gcInput}
                        onChange={(e) => {
                          setGcInput(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                        }}
                        onKeyDown={(e) => {
                           if (e.key === 'Enter' && !e.shiftKey) {
                             e.preventDefault();
                             handleGCSubmit();
                           }
                        }}
                        placeholder="Say something to the group..."
                        className={cn("flex-1 py-3 px-4 min-h-[48px] max-h-[160px] text-[15px] focus:outline-none bg-transparent resize-none leading-relaxed custom-scrollbar font-sans ml-2", isNightTime ? "text-[#e0e0e0] placeholder:text-[#505060]" : "placeholder:text-[var(--text-muted-dark)] text-[var(--text-primary)]")}
                        rows={1}
                        disabled={isGenerating || gcUsage.count >= 5}
                      />
                      {isGenerating ? (
                        <motion.button
                          type="button"
                          className="w-10 h-10 rounded-full bg-[var(--bg-inverse)] text-[var(--bg-main)] flex items-center justify-center shrink-0 opacity-50 cursor-not-allowed ml-2"
                        >
                          <Circle size={18} className="animate-spin" />
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="submit"
                          disabled={!gcInput.trim() || gcUsage.count >= 5}
                          className="w-10 h-10 rounded-full bg-[var(--bg-inverse)] text-[var(--bg-main)] flex items-center justify-center shrink-0 disabled:opacity-30 disabled:bg-[var(--bg-overlay-05)] disabled:text-[var(--text-muted-dark)] disabled:cursor-not-allowed hover:bg-[var(--accent-hover)] transition-colors ml-2"
                        >
                          <ArrowUp size={20} strokeWidth={2} />
                        </motion.button>
                      )}
                    </form>
                 </div>
              </div>
            </div>
          )}

          {activeView === 'home' && messages.length > 0 && (
            <div className="max-w-[800px] w-full px-6 pt-24 pb-32 flex flex-col pt-12">
              {messages.map((m, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <MessageComponent 
                    message={m} 
                    userName={userName} 
                    userInitials={getUserInitials(userName)} 
                    agentName={currentAgent}
                    isGenerating={isGenerating && i === messages.length - 1}
                  />
                </motion.div>
              ))}
              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </main>

        {/* Floating Input Area (Only visible when chat has started) */}
        {activeView === 'home' && messages.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-30 pt-16 pb-8 px-6 bg-gradient-to-t from-[var(--bg-main)] via-[var(--bg-main)]/90 to-transparent pointer-events-none flex justify-center">
             <div className="w-full max-w-[800px] pointer-events-auto">
                <form 
                  onSubmit={handleSubmit}
                  className="bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-light)] rounded-[32px] p-2 pr-3 flex items-center shadow-[0_8px_40px_rgba(0,0,0,0.4)] focus-within:border-[var(--border-medium)] transition-all duration-300"
                >
                  <button type="button" className="w-10 h-10 ml-2 flex items-center justify-center rounded-full bg-transparent text-[var(--text-muted-dark)] hover:text-[var(--text-primary)] transition-colors shrink-0">
                    <Plus size={20} strokeWidth={1.5} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowLiveChat(true)}
                    className="w-10 h-10 ml-1 flex items-center justify-center rounded-full bg-transparent text-[var(--text-muted-dark)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                    title="Live Talk Mode"
                  >
                    <Mic size={20} strokeWidth={1.5} />
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Spill it..."
                    className="flex-1 py-3 px-4 min-h-[48px] max-h-[160px] text-[15px] focus:outline-none placeholder:text-[var(--text-muted-dark)] text-[var(--text-primary)] bg-transparent resize-none text-[var(--text-primary)] leading-relaxed custom-scrollbar font-sans ml-2"
                    rows={1}
                  />
                  {isGenerating ? (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      onClick={stopGeneration}
                      title="Stop generating"
                      className="w-10 h-10 rounded-full bg-[var(--bg-inverse)] text-[var(--bg-main)] flex items-center justify-center shrink-0 hover:bg-[var(--accent-hover)] transition-colors ml-2"
                    >
                      <StopCircle size={18} strokeWidth={2.5} fill="currentColor" />
                    </motion.button>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      disabled={!input.trim()}
                      className="w-10 h-10 rounded-full bg-[var(--bg-inverse)] text-[var(--bg-main)] flex items-center justify-center shrink-0 disabled:opacity-30 disabled:bg-[var(--bg-overlay-05)] disabled:text-[var(--text-muted-dark)] disabled:cursor-not-allowed hover:bg-[var(--accent-hover)] transition-colors ml-2"
                    >
                      <ArrowUp size={20} strokeWidth={2} />
                    </motion.button>
                  )}
                </form>
             </div>
          </div>
        )}

      </div>

      <AnimatePresence>
        {showLiveChat && <LiveChat onClose={() => setShowLiveChat(false)} currentAgent={currentAgent} isGroqEnabled={isGroqEnabled} />}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[var(--bg-modal)] border border-[var(--bg-border-strong)] rounded-[24px] p-6 w-full max-w-sm shadow-2xl relative"
            >
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay-05)] rounded-full transition-colors"
              >
                <X size={18} />
              </button>
              
              <div className="flex flex-col items-center mb-6 pt-4">
                <div className="w-20 h-20 rounded-full bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-center text-[28px] font-medium border border-[var(--border-medium)] mb-4 shadow-inner">
                  {getUserInitials(userName)}
                </div>
                <h3 className="text-[20px] font-serif text-[var(--text-primary)]">Hello, {userName}!</h3>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">What should {currentAgent === 'Fusion' ? 'Fusion' : `Fusion - ${currentAgent}`} call you?</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-muted)] mb-2 uppercase tracking-wide">Display Name</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input 
                      type="text" 
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full bg-[var(--bg-panel)] border border-[var(--bg-border-strong)] rounded-xl py-2.5 pl-10 pr-4 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
                      placeholder="Enter your name"
                      maxLength={30}
                    />
                  </div>
                </div>
                
                <button 
                  onClick={handleSaveProfile}
                  className="w-full py-3 mt-4 rounded-xl bg-[var(--accent-primary)] text-[var(--bg-main)] font-medium text-[14px] hover:bg-[var(--accent-hover)] transition-colors"
                >
                  Save Changes
                </button>
                
                <div className="pt-2 border-t border-[var(--bg-border-strong)]">
                  <button 
                    onClick={handleSignOut}
                    className="w-full py-3 flex items-center justify-center gap-2 rounded-xl bg-transparent border border-[var(--border-medium)] text-[#b33e36] font-medium text-[14px] hover:bg-[var(--bg-overlay-03)] transition-colors"
                  >
                    <LogOut size={16} />
                    Log Out
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Theme Selection Modal */}
      <AnimatePresence>
        {isFirstVisit && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--bg-modal)] border border-[var(--bg-border-strong)] rounded-[32px] p-8 w-full max-w-lg shadow-2xl relative"
            >
              <div className="text-center mb-8">
                <h2 className="text-[32px] font-sans font-bold tracking-tight text-[var(--text-primary)] mb-2">Pick your aesthetic</h2>
                <p className="text-[15px] text-[var(--text-secondary)]">Set the vibe before we start talking.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'default', name: 'Midnight', bg: '#0A0A0B', accent: '#4E6BFF' },
                  { id: 'girly-pop', name: 'Girly Pop', bg: '#FFF0F5', accent: '#FF69B4' },
                  { id: 'pinterest-minimal', name: 'Minimal', bg: '#FDFBF7', accent: '#A79782' }
                ].map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeSelect(theme.id)}
                    className="flex flex-col items-center gap-3 group"
                  >
                    <div 
                      className="w-full aspect-[4/3] rounded-2xl border-2 transition-all duration-300 shadow-sm flex items-center justify-center"
                      style={{ 
                        backgroundColor: theme.bg,
                        borderColor: currentTheme === theme.id ? theme.accent : 'transparent'
                      }}
                    >
                      <div className="w-12 h-6 rounded-full" style={{ backgroundColor: theme.accent, opacity: 0.8 }} />
                    </div>
                    <span className="text-[14px] font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">{theme.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
