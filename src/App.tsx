import * as React from "react";
import { useState, useEffect } from "react";
import { Search, Save, Download, Trash2, BookOpen, Book, BookmarkCheck, ArrowLeft, Languages, Loader2, Palette, BrainCircuit, CheckCircle2, XCircle, RefreshCw, Star, Calendar, PencilLine, History, Sparkles, ClipboardCheck, MessageSquareQuote, Settings, HelpCircle, Info, Menu, Library, Key, Lightbulb, Cloud } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { 
  fetchVocabulary, 
  VocabularyResult, 
  analyzeSentence, 
  SentenceAnalysisResult, 
  generateQuiz, 
  QuizQuestion, 
  setManualApiKey, 
  completeVocabularyData,
  generateTranslationPassage,
  evaluateTranslation,
  TranslationPassage,
  TranslationFeedback,
  TranslationLogEntry,
  clearAllCache,
  fetchDailyIdiom,
  IdiomResult,
  shuffle
} from "@/src/services/geminiService";
import { getRandomWords, getRandomSvWords, getLibraryWords, getSvLibraryWords, generateStaticQuizQuestion, generateMiniAgentQuestion, searchLocalDictionary, getSearchSuggestions } from "@/src/services/localDictionaryService";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DICTIONARY_MAP } from "@/src/services/localDictionaryService";
import { AuthService } from "@/src/services/googleAuthService";
import { DriveSyncService } from "@/src/services/googleDriveSyncService";

const formatTimeDistance = (timestamp: number) => {
  if (timestamp === 0) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
};

type Theme = "slate" | "midnight" | "forest" | "sunset" | "royal";

export default function App() {
  const dictionaryRef = React.useRef(DICTIONARY_MAP);
  const translationHistoryRef = React.useRef<TranslationLogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<VocabularyResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VocabularyResult | null>(null);
  
  // Initialize state directly from localStorage to prevent race conditions
  const [savedList, setSavedList] = useState<VocabularyResult[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("lingo-bengali-list");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved list", e);
        return [];
      }
    }
    return [];
  });

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "slate";
    return (localStorage.getItem("vocab-master-theme") as Theme) || "slate";
  });
  const [mode, setMode] = useState<"home" | "word" | "daily" | "sentence" | "quiz" | "translation" | "special">("home");
  const [sentenceResult, setSentenceResult] = useState<SentenceAnalysisResult | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false); // Collapsible Theme
  const [showApiSettings, setShowApiSettings] = useState(false); // Collapsible API Key
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
  const [isGoogleAuth, setIsGoogleAuth] = useState(AuthService.isAuthenticated());
  const [isAuthReady, setIsAuthReady] = useState(AuthService.isReady());
  const [isLoginInProgress, setIsLoginInProgress] = useState(false);
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('google_user_email') || "");
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem('vocab_master_last_updated') || '0');
  });
  const [relativeSyncTime, setRelativeSyncTime] = useState("");
  const [dailyWords, setDailyWords] = useState<VocabularyResult[]>([]);
  const [phraseList, setPhraseList] = useState<IdiomResult[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("PHRASES_COLLECTION");
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Structural UI State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    library: false,
    phrases: false,
    saved: false
  });

  // Translation Module State
  const [translationPassage, setTranslationPassage] = useState<TranslationPassage | null>(null);
  const [userTranslation, setUserTranslation] = useState("");
  const [translationFeedback, setTranslationFeedback] = useState<TranslationFeedback | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showAnalysisFeedback, setShowAnalysisFeedback] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isRetaking, setIsRetaking] = useState(false);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const [staticQuiz, setStaticQuiz] = useState<{
    isActive: boolean;
    mode: 'library' | 'saved';
    questions: any[];
    currentIndex: number;
    score: number;
    answerGiven: boolean;
    selectedAnswer: string | null;
  }>({
    isActive: false,
    mode: 'library',
    questions: [],
    currentIndex: 0,
    score: 0,
    answerGiven: false,
    selectedAnswer: null
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Monitor Online/Offline Status (Handled below in main listener)
  // Daily Words Logic (24h Cycle)
  useEffect(() => {
    const checkDailyWords = () => {
      const stored = localStorage.getItem("vocab-master-daily");
      const lastUpdate = localStorage.getItem("vocab-master-daily-time");
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (stored && lastUpdate && (now - parseInt(lastUpdate) < oneDayMs)) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length === 5) {
            setDailyWords(parsed);
          } else {
            refreshDailyWords();
          }
        } catch (e) {
          console.error("Failed to parse daily words", e);
          refreshDailyWords();
        }
      } else {
        refreshDailyWords();
      }
    };

    const refreshDailyWords = () => {
      try {
        const newWords = getRandomSvWords(5);
        if (newWords.length < 5) {
          toast.error("Critical: SvWordLibrary.js source is missing or incomplete!");
        }
        setDailyWords(newWords);
        localStorage.setItem("vocab-master-daily", JSON.stringify(newWords));
        localStorage.setItem("vocab-master-daily-time", Date.now().toString());
      } catch (err) {
        console.error("Sv-Daily Error:", err);
        toast.error("Source Error: SvWordLibrary.js not found.");
      }
    };

    checkDailyWords();
  }, []);

  // AI Daily Idiom System (24h Cycle)
  useEffect(() => {
    const checkDailyIdiom = async () => {
      const lastUpdate = localStorage.getItem("vocab-master-idiom-time");
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (!lastUpdate || (now - parseInt(lastUpdate) > oneDayMs)) {
        if (isOnline) {
          try {
            const newIdiom = await fetchDailyIdiom();
            setPhraseList(prev => {
              // Ensure we don't duplicate
              const isDuplicate = prev.some(p => p.phrase.toLowerCase() === newIdiom.phrase.toLowerCase());
              if (isDuplicate) return prev;
              
              const updated = [newIdiom, ...prev].slice(0, 50);
              localStorage.setItem("PHRASES_COLLECTION", JSON.stringify(updated));
              markDirty();
              return updated;
            });
            localStorage.setItem("vocab-master-idiom-time", now.toString());
          } catch (e) {
            console.error("Daily idiom auto-fetch failed", e);
          }
        }
      }
    };

    checkDailyIdiom();
  }, [isOnline]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Google Drive Sync Initialization
  useEffect(() => {
    const initAuth = async () => {
      await AuthService.initialize();
      const ready = AuthService.isReady();
      setIsAuthReady(ready);
      
      const isAuthed = AuthService.isAuthenticated();
      setIsGoogleAuth(isAuthed);
      
      if (isAuthed) {
        triggerGoogleSync(false);
      } else {
        const previouslyConnected = localStorage.getItem('is_user_connected') === 'true';
        if (previouslyConnected && ready) {
          AuthService.login(true);
        }
      }
    };

    const handleAuthSuccess = async () => {
      setIsGoogleAuth(true);
      setIsLoginInProgress(false);
      localStorage.setItem('is_user_connected', 'true');
      // Fetch user email after login
      try {
        const token = AuthService.getToken();
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await resp.json();
        if (data.email) {
          setUserEmail(data.email);
          localStorage.setItem('google_user_email', data.email);
        }
      } catch (e) {
        console.error("Failed to fetch user email", e);
      }
      triggerGoogleSync(false);
    };

    const handleAuthLogout = () => {
      setIsGoogleAuth(false);
      setIsLoginInProgress(false);
      setUserEmail("");
      localStorage.removeItem('google_user_email');
      localStorage.removeItem('is_user_connected');
      setLastSyncedAt(0);
    };

    const handleAuthError = (e: any) => {
      setIsLoginInProgress(false);
      toast.error(e.detail || "Google authentication failed.");
    };

    window.addEventListener('google-auth-success', handleAuthSuccess);
    window.addEventListener('google-auth-logout', handleAuthLogout);
    window.addEventListener('google-auth-error', handleAuthError);

    initAuth();

    // Check readiness status periodically in bg
    const statusInterval = setInterval(() => {
      const ready = AuthService.isReady();
      setIsAuthReady(ready);
    }, 2000);

    return () => {
      window.removeEventListener('google-auth-success', handleAuthSuccess);
      window.removeEventListener('google-auth-logout', handleAuthLogout);
      window.removeEventListener('google-auth-error', handleAuthError);
      clearInterval(statusInterval);
    };
  }, []);

  const triggerGoogleSync = async (manual: boolean = true) => {
    if (!AuthService.isAuthenticated()) return;
    setIsGoogleSyncing(true);
    const result = await DriveSyncService.performSync(!manual);
    if (result.status !== 'error') {
      if (result.status === 'updated') {
        const data = DriveSyncService.packageFullAppData();
        setSavedList(data.vocab);
        setPhraseList(data.phrases);
        translationHistoryRef.current = data.translations;
        
        // Update daily words if they were part of the sync (legacy check)
        const daily = JSON.parse(localStorage.getItem('vocab-master-daily') || '[]');
        setDailyWords(daily);
      }
      
      if (result.status === 'updated' || result.status === 'pushed') {
        if (manual) {
          toast.success("Vocab, Phrases, and Translation History synced successfully!");
        }
      } else if (result.status === 'no-change') {
        if (manual) {
          toast.info("Cloud and local data are already in sync.");
        }
      }
      
      if (result.lastUpdated) {
        setLastSyncedAt(result.lastUpdated);
      }
    } else {
      if (manual) {
        toast.error("Drive synchronization failed.");
      }
    }
    setIsGoogleSyncing(false);
  };

  // Auto-sync Interval (Every 5 minutes)
  useEffect(() => {
    if (isGoogleAuth && isOnline) {
      const interval = setInterval(() => {
        triggerGoogleSync(false);
      }, 5 * 60 * 1000); // 5 minutes
      return () => clearInterval(interval);
    }
  }, [isGoogleAuth, isOnline]);

  // Relative Time Updater
  useEffect(() => {
    const updateRelativeTime = () => {
      setRelativeSyncTime(lastSyncedAt ? formatTimeDistance(lastSyncedAt) : "Never");
    };
    
    updateRelativeTime();
    const interval = setInterval(updateRelativeTime, 60000); // Every minute
    return () => clearInterval(interval);
  }, [lastSyncedAt]);
  const markDirty = () => {
    const now = Date.now();
    localStorage.setItem('vocab_master_last_updated', now.toString());
    setLastSyncedAt(now);
  };

  const performShieldCleanup = () => {
    // 1. Clean Translation History (Keep last 50)
    const history = JSON.parse(localStorage.getItem("TRANSLATION_HISTORY") || "[]");
    if (history.length > 50) {
      localStorage.setItem("TRANSLATION_HISTORY", JSON.stringify(history.slice(0, 50)));
      markDirty();
    }

    // 2. Clear Search Cache (Safe purge of temporary AI results)
    clearAllCache();

    // 3. Keep Saved Words, Sv Library, and Phrases (Immortal Data)
    toast.success("Cleanup Shield: Cache & History purged. Saved words/phrases are safe.");
  };
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.info("Connection restored. Online features available.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You are offline. Some features may be unavailable.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Background Sync Logic (Manual Saved List)
  useEffect(() => {
    let isMounted = true;

    if (isOnline && savedList.length > 0) {
      const enrichSavedWords = async () => {
        const missingEntries = savedList.filter(item => 
          !item.partOfSpeech || 
          !item.example || 
          !item.forms.noun || 
          !item.forms.verb || 
          !item.forms.adjective || 
          !item.forms.adverb
        );
        if (missingEntries.length === 0) return;

        setIsSyncing(true);

        for (const entry of missingEntries.slice(0, 5)) { // Limit to 5 per burst to avoid long queueing
          if (!isMounted) break;
          // Add delay to prevent massive queue floods
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            const completedData = await completeVocabularyData(entry.word, entry);
            if (isMounted) {
              const updatedEntry = { ...completedData, word: entry.word };
              
              setSavedList(prev => prev.map(item => 
                item.word.toLowerCase() === entry.word.toLowerCase() ? updatedEntry : item
              ));
              markDirty();

              setResult(prev => {
                if (prev && prev.word.toLowerCase() === entry.word.toLowerCase()) {
                  return updatedEntry;
                }
                return prev;
              });
            }
          } catch (error: any) {
            console.error(`Failed to enrich ${entry.word}:`, error);
            // If we hit a quota limit, stop the background enrichment loop early
            if (error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota")) {
              console.warn("Quota exceeded during background enrichment. Stopping burst.");
              break; 
            }
          }
        }

        if (isMounted) setIsSyncing(false);
      };

      enrichSavedWords();
    }

    return () => {
      isMounted = false;
    };
  }, [isOnline]);

  // Quiz State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);

  // Performance Tracking State
  const [currentQuizPerformance, setCurrentQuizPerformance] = useState<Record<string, { correct: number, total: number }>>({});
  const [cumulativePerformance, setCumulativePerformance] = useState<Record<string, { correct: number, total: number }>>({
    noun: { correct: 0, total: 0 },
    verb: { correct: 0, total: 0 },
    adjective: { correct: 0, total: 0 },
    adverb: { correct: 0, total: 0 },
    synonym: { correct: 0, total: 0 },
    antonym: { correct: 0, total: 0 },
    meaning: { correct: 0, total: 0 },
    sentence_pos: { correct: 0, total: 0 },
  });

  // Load saved list and theme from localStorage on mount
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.add("dark");

    const savedPerf = localStorage.getItem("vocab-master-performance");
    if (savedPerf) {
      try {
        setCumulativePerformance(JSON.parse(savedPerf));
      } catch (e) {
        console.error("Failed to parse performance data", e);
      }
    }

    const savedKey = localStorage.getItem("gemini_api_key") || localStorage.getItem("vocab-master-api-key");
    if (savedKey) {
      setApiKey(savedKey);
      setManualApiKey(savedKey);
      if (!localStorage.getItem("gemini_api_key")) {
        localStorage.setItem("gemini_api_key", savedKey);
      }
    }
  }, []);

  // Save list to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("lingo-bengali-list", JSON.stringify(savedList));
  }, [savedList]);

  // Save theme to localStorage and update document attribute
  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("vocab-master-theme", newTheme);
    toast.info(`Theme changed to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`);
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setManualApiKey(val);
    localStorage.setItem("gemini_api_key", val);
    localStorage.setItem("vocab-master-api-key", val); // Keep for backwards compatibility
  };

  const exportToCSV = () => {
    if (savedList.length === 0) {
      toast.error("Vocabulary list is empty!");
      return;
    }

    const header = ["Word", "Meaning", "Type", "Noun", "Verb", "Adj", "Adv", "Synonyms", "Antonyms", "Example"];
    const rows = savedList.map(item => [
      item.word,
      item.meaning,
      item.partOfSpeech || "",
      item.forms.noun || "",
      item.forms.verb || "",
      item.forms.adjective || "",
      item.forms.adverb || "",
      item.synonyms.join(", "),
      item.antonyms.join(", "),
      item.example || ""
    ]);

    const csvContent = [
      header.join(","),
      ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `VocabMaster_List_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Vocabulary list exported as CSV!");
  };

  const searchRef = React.useRef<HTMLDivElement>(null);
  const homeSearchRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        (searchRef.current && !searchRef.current.contains(event.target as Node)) &&
        (homeSearchRef.current && !homeSearchRef.current.contains(event.target as Node))
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchTermChange = (val: string) => {
    setSearchTerm(val);
    if (val.trim().length >= 2) {
      const matches = getSearchSuggestions(val, 8); // Top 8 matches
      setSuggestions(matches);
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: VocabularyResult) => {
    let searchWord = suggestion.word;
    let matchedForm: string | undefined = undefined;
    
    if (suggestion.mainEntryWord) {
      // suggestion.word is "abduction (Noun)", we want searchWord = "Abduct", matchedForm = "abduction"
      const parts = suggestion.word.split(" (");
      matchedForm = parts[0].toLowerCase();
      searchWord = suggestion.mainEntryWord;
    }
    
    setSearchTerm(searchWord);
    setSuggestions([]);
    setShowSuggestions(false);

    const localData = searchLocalDictionary(searchWord);
    if (localData) {
      setResult({ ...localData, matchedForm: matchedForm || localData.matchedForm });
      setMode("word");
      return;
    }
    performSearch(searchWord);
  };

  const performSearch = async (word: string) => {
    setLoading(true);
    setResult(null);
    setSentenceResult(null);
    setShowSuggestions(false);
    
    // Check local first
    const normalizedQuery = word.toLowerCase().trim();
    const localData = searchLocalDictionary(normalizedQuery);
    if (localData) {
      setResult(localData);
      setLoading(false);
      setMode("word");
      return;
    }

    try {
      const data = await fetchVocabulary(word);
      
      // Post-process AI result to set matchedForm if it matches one of the variations
      let matchedForm: string | undefined = undefined;
      const f = data.forms;
      if (f.noun?.toLowerCase() === normalizedQuery) matchedForm = normalizedQuery;
      else if (f.verb?.toLowerCase() === normalizedQuery) matchedForm = normalizedQuery;
      else if (f.adjective?.toLowerCase() === normalizedQuery) matchedForm = normalizedQuery;
      else if (f.adverb?.toLowerCase() === normalizedQuery) matchedForm = normalizedQuery;
      
      setResult({ ...data, matchedForm });
      setMode("word");
      
      const isComplete = data.partOfSpeech && data.example && data.forms.noun && data.forms.verb;
      if (!isComplete && isOnline) {
        try {
          const completed = await completeVocabularyData(data.word, data);
          setResult(prev => (prev && prev.word.toLowerCase() === data.word.toLowerCase() ? { ...completed, matchedForm: prev.matchedForm } : prev));
        } catch (error) {
          console.error("Smart Fill failed:", error);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestions(false);
    if (!searchTerm.trim()) return;

    if (mode === "word" || mode === "home") {
      performSearch(searchTerm);
    } else {
      setLoading(true);
      setSentenceResult(null);
      try {
        const data = await analyzeSentence(searchTerm);
        setSentenceResult(data);
      } catch (error: any) {
        toast.error(error.message || "Analysis failed.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSaveWord = (wordData: VocabularyResult) => {
    setSavedList(prev => {
      const exists = prev.some(item => item.word.toLowerCase() === wordData.word.toLowerCase());
      if (exists) {
        toast.info(`"${wordData.word}" is already in your list.`);
        return prev;
      }
      toast.success(`"${wordData.word}" saved to your list!`);
      const newList = [wordData, ...prev].slice(0, 50);
      markDirty();
      return newList;
    });
  };

  const startQuiz = async () => {
    // Determine pool and count based on where the user is starting from
    const quizSource = staticQuiz.mode === 'library' ? 'Special Library' : 'Your Vocabulary';
    const pool = staticQuiz.mode === 'library' ? getSvLibraryWords() : savedList;
    const targetCount = staticQuiz.mode === 'library' ? 20 : 15;

    if (pool.length < 3) {
      toast.error(`Need at least 3 words in ${quizSource} to start a quiz!`);
      return;
    }
    
    setQuizLoading(true);
    setQuizFinished(false);
    setQuizScore(0);
    setCurrentQuestionIdx(0);
    setSelectedOption(null);
    setIsCorrect(null);
    setCurrentQuizPerformance({});
    try {
      const questions = await generateQuiz(pool, targetCount);
      setQuizQuestions(questions);
    } catch (error: any) {
      const message = error.message || "Failed to generate quiz. Try again.";
      toast.error(message);
    } finally {
      setQuizLoading(false);
    }
  };

  const handleOptionSelect = (option: string) => {
    if (selectedOption !== null) return;
    
    const currentQuestion = quizQuestions[currentQuestionIdx];
    setSelectedOption(option);
    const correct = option === currentQuestion.correctAnswer;
    setIsCorrect(correct);
    
    // Track performance for current quiz
    const category = currentQuestion.category;
    setCurrentQuizPerformance(prev => ({
      ...prev,
      [category]: {
        correct: (prev[category]?.correct || 0) + (correct ? 1 : 0),
        total: (prev[category]?.total || 0) + 1
      }
    }));

    if (correct) {
      setQuizScore(prev => prev + 1);
      toast.success("Correct!");
    } else {
      toast.error("Wrong answer!");
    }
  };

  const nextQuestion = () => {
    if (currentQuestionIdx < quizQuestions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
      setSelectedOption(null);
      setIsCorrect(null);
    } else {
      // Finalize Quiz: Update Cumulative Performance
      setQuizFinished(true);
      const newCumulative = { ...cumulativePerformance };
      Object.keys(currentQuizPerformance).forEach(cat => {
        newCumulative[cat].correct += currentQuizPerformance[cat].correct;
        newCumulative[cat].total += currentQuizPerformance[cat].total;
      });
      setCumulativePerformance(newCumulative);
      localStorage.setItem("vocab-master-performance", JSON.stringify(newCumulative));
    }
  };

  const removeFromList = (word: string) => {
    setSavedList(savedList.filter(item => item.word !== word));
    markDirty();
    toast.info("Removed from list");
  };

  // Load Translation History (Single run on mount)
  useEffect(() => {
    const saved = localStorage.getItem("TRANSLATION_HISTORY") || localStorage.getItem("TRANSLATION_LOG");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          translationHistoryRef.current = parsed;
          // Migration from old key to new key
          if (localStorage.getItem("TRANSLATION_LOG")) {
            localStorage.setItem("TRANSLATION_HISTORY", saved);
            localStorage.removeItem("TRANSLATION_LOG");
          }
        }
      } catch (e) {
        console.warn("Failed to parse translation history, clearing legacy data.", e);
        localStorage.removeItem("TRANSLATION_HISTORY");
        localStorage.removeItem("TRANSLATION_LOG");
        translationHistoryRef.current = [];
      }
    }
  }, []);

  const startStaticQuiz = (mode: 'library' | 'saved') => {
    const rawPool = mode === 'library' ? getSvLibraryWords() : savedList;
    
    // Anti-Repetition Algorithm: Shuffle words
    let pool = shuffle([...rawPool]);
    const targetCount = mode === 'library' ? 20 : 15;

    if (rawPool.length < 3) {
      toast.error(mode === 'library' ? "Special Vocabulary library is too small." : "Add at least 3 words to your list for a quiz.");
      return;
    }

    // Fallback Rule: If library is too small, reuse words in a second loop
    if (pool.length < targetCount) {
      const loops = Math.ceil(targetCount / pool.length);
      let augmentedPool = [];
      for (let i = 0; i < loops; i++) {
        augmentedPool = [...augmentedPool, ...shuffle(pool)];
      }
      pool = augmentedPool.slice(0, targetCount);
    } else {
      pool = pool.slice(0, targetCount);
    }
    
    const questions = [];
    const types: ('context' | 'pos' | 'transformation' | 'relation')[] = ['context', 'pos', 'transformation', 'relation'];
    
    let typeIndex = 0;

    // Generate variety questions for each word in the pool
    for (const target of pool) {
      let attempts = 0;
      let questionAdded = false;
      
      // Try to get a diverse question type for this word
      while (attempts < types.length && !questionAdded) {
        const type = types[(typeIndex + attempts) % types.length];
        const q = generateMiniAgentQuestion(rawPool, type, target);
        if (q) {
          questions.push(q);
          questionAdded = true;
          typeIndex++; // Rotate base types for diversity
        }
        attempts++;
      }
      
      // Secondary Fallback: meaning question if others fail
      if (!questionAdded) {
        // Just meaning question
        const options = shuffle([
          target.word, 
          ...(rawPool.filter(w => w.word !== target.word).sort(() => 0.5 - Math.random()).slice(0, 3).map(w => w.word))
        ]);
        if (options.length >= 4) {
          questions.push({
            question: `What is the English word for "${target.meaning}"?`,
            options,
            correctAnswer: target.word,
            word: target.word,
            category: "meaning",
            explanation: `"${target.word}" translates to "${target.meaning}".`
          });
          questionAdded = true;
        }
      }
    }

    if (questions.length < 5) {
      toast.error("Not enough vocabulary data to generate a quiz.");
      return;
    }

    setStaticQuiz({
      isActive: true,
      mode,
      questions: shuffle(questions),
      currentIndex: 0,
      score: 0,
      answerGiven: false,
      selectedAnswer: null
    });
    setMode("quiz");
  };

  const finishStaticQuiz = () => {
    const attemptedCount = staticQuiz.currentIndex + 1;
    toast.success(`Quiz Finished Early! Final Score: ${staticQuiz.score}/${attemptedCount}`);
    setStaticQuiz(prev => ({ ...prev, isActive: false }));
    setMode("home");
  };

  const handleStaticQuizAnswer = (answer: string) => {
    if (staticQuiz.answerGiven) return;

    const isCorrect = answer === staticQuiz.questions[staticQuiz.currentIndex].correctAnswer;
    
    setStaticQuiz(prev => ({ 
      ...prev, 
      score: isCorrect ? prev.score + 1 : prev.score,
      answerGiven: true,
      selectedAnswer: answer
    }));
  };

  const nextStaticQuestion = () => {
    if (staticQuiz.currentIndex < staticQuiz.questions.length - 1) {
      setStaticQuiz(prev => ({ 
        ...prev, 
        currentIndex: prev.currentIndex + 1,
        answerGiven: false,
        selectedAnswer: null
      }));
    } else {
      toast.success(`Quiz Finished! Final Score: ${staticQuiz.score}/${staticQuiz.questions.length}`);
      setStaticQuiz(prev => ({ ...prev, isActive: false }));
      setMode("home");
    }
  };
  // Integrated History Saver (Prevents duplication based on topic)
  const saveToTranslationHistory = (entry: TranslationLogEntry) => {
    // Filter out existing entries with same topic to ensure only one per passage type
    const cleanedHistory = translationHistoryRef.current.filter(
      item => item.passage.topic !== entry.passage.topic
    );
    // Add new entry to the top
    translationHistoryRef.current = [entry, ...cleanedHistory].slice(0, 50);
    localStorage.setItem("TRANSLATION_HISTORY", JSON.stringify(translationHistoryRef.current));
    markDirty();
  };

  const handleNewTranslationPractice = async () => {
    setIsRetaking(false);
    if (!isOnline) {
      if (translationHistoryRef.current.length > 0) {
        toast.info("Offline: Picking a random passage from your history.");
        const randomEntry = translationHistoryRef.current[Math.floor(Math.random() * translationHistoryRef.current.length)];
        setTranslationPassage(randomEntry.passage);
        setOfflineModelAnswer(randomEntry.feedback?.modelAbstractTranslation || randomEntry.passage.modelAnswer);
        setUserTranslation("");
        setTranslationFeedback(null);
        setMode("translation");
        setShowHistory(false);
        return;
      }
      toast.error("Offline: No history available to practice.");
      return;
    }
    setLoading(true);
    setAnalysisAttempt(0);
    try {
      const passage = await generateTranslationPassage();
      setTranslationPassage(passage);
      setOfflineModelAnswer(passage.modelAnswer); // Store generated model answer for immediate feedback if user goes offline mid-session
      setUserTranslation("");
      setTranslationFeedback(null);
      setMode("translation");
      setShowHistory(false);
      
      // Proactively save this passage to history immediately upon generation (Immediate Persistence)
      const newEntry: TranslationLogEntry = {
        passage: passage,
        userTranslation: "",
        feedback: {
          score: 0,
          corrections: [],
          errorBreakdown: [],
          vocabularyUpgrade: [],
          naturalSuggestions: [],
          modelAbstractTranslation: passage.modelAnswer
        },
        timestamp: Date.now()
      };
      saveToTranslationHistory(newEntry);
    } catch (e) {
      toast.error("Failed to generate passage. Please check your API settings.");
    } finally {
      setLoading(false);
    }
  };

  const [offlineModelAnswer, setOfflineModelAnswer] = useState<string | null>(null);

  const handleRetake = () => {
    setUserTranslation("");
    setTranslationFeedback(null);
    setShowAnalysisFeedback(false);
    setIsRetaking(true);
    toast.info("Retake started: Try to improve your translation!");
  };

  const handleShowAnswer = () => {
    if (!translationPassage) return;
    
    const feedback: TranslationFeedback = {
      score: 0,
      corrections: [],
      errorBreakdown: [],
      vocabularyUpgrade: [],
      naturalSuggestions: [],
      modelAbstractTranslation: translationPassage.modelAnswer
    };
    setTranslationFeedback(feedback);
    setShowAnalysisFeedback(false);
    setIsRetaking(false);
    
    // Save to History as a "Preview" attempt if not already saved
    const newEntry: TranslationLogEntry = {
      passage: translationPassage,
      userTranslation,
      feedback,
      timestamp: Date.now()
    };
    saveToTranslationHistory(newEntry);
  };

  const handleSubmitTranslation = async () => {
    if (!translationPassage || !userTranslation.trim()) return;
    
    if (!isOnline) {
      if (offlineModelAnswer) {
        toast.success("Self-Correction Mode: Compare with the Model Answer!");
        // We simulate a feedback object that only has the model answer for self-correction view
        const feedback: TranslationFeedback = {
          score: 0,
          corrections: [],
          errorBreakdown: [],
          vocabularyUpgrade: [],
          naturalSuggestions: [],
          modelAbstractTranslation: offlineModelAnswer
        };
        setTranslationFeedback(feedback);
        setShowAnalysisFeedback(true);
        setIsRetaking(false);
        
        // Save to History even for retakes
        const newEntry: TranslationLogEntry = {
          passage: translationPassage,
          userTranslation,
          feedback,
          timestamp: Date.now()
        };
        saveToTranslationHistory(newEntry);
      } else {
        toast.error("Offline: AI analysis unavailable for new passages.");
      }
      return;
    }
    
    setIsEvaluating(true);
      setAnalysisAttempt(1);
      try {
        const feedback = await evaluateTranslation(
          translationPassage.banglaPassage, 
          userTranslation,
          (attempt) => setAnalysisAttempt(attempt)
        );
        setTranslationFeedback(feedback);
        setShowAnalysisFeedback(true);
        setIsRetaking(false);
        
        // Save to History using ref to avoid re-renders during sync chain
        const newEntry: TranslationLogEntry = {
          passage: translationPassage,
          userTranslation,
          feedback,
          timestamp: Date.now()
        };
        
        saveToTranslationHistory(newEntry);
        toast.success("Analysis complete!");
      } catch (e: any) {
        console.error("Analysis failed, bypassing to Safety Reveal:", e);
        if (offlineModelAnswer) {
          toast.info("AI Analysis unavailable. Revealing Model Answer for self-correction.");
          const fallbackFeedback: TranslationFeedback = {
            score: 0,
            corrections: [],
            errorBreakdown: [{ category: "Other", description: "AI analysis failed (Cloud Timeout or Offline). Review the Model Answer to verify your attempt." }],
            vocabularyUpgrade: [],
            naturalSuggestions: [],
            modelAbstractTranslation: offlineModelAnswer
          };
          setTranslationFeedback(fallbackFeedback);
          setShowAnalysisFeedback(true);
          setIsRetaking(false);
          
          const newEntry: TranslationLogEntry = {
            passage: translationPassage,
            userTranslation,
            feedback: fallbackFeedback,
            timestamp: Date.now()
          };
          saveToTranslationHistory(newEntry);
        } else {
          toast.error("Evaluation failed and no model answer found.");
        }
      } finally {
        setIsEvaluating(false);
        setAnalysisAttempt(0);
      }
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Background Decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
      </div>

      <AnimatePresence>
        {isGoogleAuth && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-4 right-4 z-[100] hidden md:flex items-center gap-3 glass-dark border border-slate-700/50 px-4 py-2 rounded-full shadow-lg"
          >
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-bold uppercase leading-none">Synced</span>
              <span className="text-[10px] text-emerald-400 font-medium">{formatTimeDistance(lastSyncedAt)}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50">
              <Cloud className="w-4 h-4 text-emerald-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help System Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-lg glass-dark border border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-700/50 bg-primary/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-bold">VocabMaster Setup Guide</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowHelp(false)} className="rounded-full">
                  <XCircle className="w-6 h-6 text-muted-foreground" />
                </Button>
              </div>
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Sparkles className="w-5 h-5" />
                    <h4 className="font-bold uppercase tracking-widest text-xs">Cloud AI Setup</h4>
                  </div>
                  <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30">
                    <p className="text-sm leading-relaxed text-slate-300">
                      <span className="text-white font-bold">Gemini API:</span> Go to <span className="text-primary font-medium">Google AI Studio</span> &gt; <span className="text-white">Get API Key</span> &gt; Copy & Paste into the Settings field.
                    </p>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <BrainCircuit className="w-5 h-5" />
                    <h4 className="font-bold uppercase tracking-widest text-xs">Local AI Setup</h4>
                  </div>
                  <div className="p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30">
                    <p className="text-sm leading-relaxed text-slate-300 mb-3">
                      Available on Chrome Desktop or High-end Android devices.
                    </p>
                    <ul className="space-y-2 text-xs text-slate-400 list-disc pl-4">
                      <li>Go to <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-400">chrome://flags</code></li>
                      <li>Enable <span className="text-white">"Prompt API for Gemini Nano"</span></li>
                      <li>Enable <span className="text-white">"Enables optimization guide on device"</span></li>
                      <li>Restart Chrome for changes to take effect.</li>
                    </ul>
                  </div>
                </section>

                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 flex gap-4 items-start">
                  <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Using Local AI (Gemini Nano) offers zero-latency analysis and complete privacy, as your data never leaves your device.
                  </p>
                </div>
              </div>
              <div className="p-6 bg-slate-900/50 border-t border-slate-700/50 flex justify-end">
                <Button onClick={() => setShowHelp(false)} className="rounded-xl px-8 font-bold">Got it!</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className="w-full border-b border-slate-700/50 glass-dark sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center h-16 sm:h-20">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setMode("home")}>
              <div className="p-2 sm:p-3 bg-primary/20 rounded-xl sm:rounded-2xl group-hover:bg-primary/30 transition-all duration-300">
                <Languages className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-3">
                <span>Vocab<span className="text-primary">Master</span></span>
                <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-900/60 border border-slate-800 shadow-inner">
                  <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isOnline ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse" : "bg-slate-600"}`}></div>
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${isOnline ? "text-emerald-400" : "text-slate-500"} hidden min-[400px]:inline`}>
                    {isOnline ? "Live" : "Offline"}
                  </span>
                </div>
                
                {isGoogleAuth && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-900/60 border border-slate-800 shadow-inner">
                    <RefreshCw className={`w-1.5 h-1.5 sm:w-2 sm:h-2 ${isGoogleSyncing ? "animate-spin text-primary" : "text-emerald-400"}`} />
                    <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400">
                      {isGoogleSyncing ? "Syncing..." : lastSyncedAt > 0 ? `Synced ${formatTimeDistance(lastSyncedAt)}` : "Online"}
                    </span>
                  </div>
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {mode !== "home" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode("home");
                  setResult(null);
                  setSentenceResult(null);
                  setTranslationPassage(null);
                  setTranslationFeedback(null);
                  setStaticQuiz(p => ({ ...p, isActive: false }));
                }}
                className="rounded-xl h-9 sm:h-10 text-xs font-bold gap-2 text-primary hover:bg-primary/10 px-2 sm:px-4"
              >
                <ArrowLeft className="w-4 h-4" /> 
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden text-[10px]">Back</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-xl h-9 w-9 sm:h-10 sm:w-10 transition-all duration-300 ${showSettings ? "bg-primary/20 text-primary" : "text-emerald-400"}`}
            >
              <Settings className={`w-5 h-5 sm:w-6 sm:h-6 ${showSettings ? "animate-spin-slow text-primary" : "text-emerald-400"}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Gear Icon Settings Hub */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-dark border border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-700/50 bg-primary/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Settings className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-bold">Settings Hub</h3>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="rounded-full">
                  <XCircle className="w-6 h-6 text-muted-foreground" />
                </Button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  {/* API Key Setting */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Key className="w-3 h-3" /> Gemini API Key
                    </label>
                    <Input
                      type="password"
                      placeholder="Paste Gemini API Key..."
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      className="bg-slate-800/50 border-slate-700 h-11 text-sm rounded-xl"
                    />
                  </div>

                  {/* Theme Setting */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                      <Palette className="w-3 h-3" /> Theme Selection
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {["slate", "midnight", "sunset", "royal"].map((t) => (
                        <Button
                          key={t}
                          variant={theme === t ? "default" : "outline"}
                          size="sm"
                          onClick={() => changeTheme(t as Theme)}
                          className="capitalize h-10 text-[10px] rounded-xl border-slate-700"
                        >
                          {t}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                  <div className="pt-4 border-t border-slate-700/50 space-y-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                       <Cloud className="w-3 h-3" /> Cloud Synchronization
                    </label>
                    
                    {!isGoogleAuth ? (
                      <div className="space-y-3">
                        <Button 
                          onClick={() => {
                            if (!isAuthReady) {
                              toast.info("Sync is still warming up, please wait 3 seconds.");
                              return;
                            }
                            setIsLoginInProgress(true);
                            AuthService.login();
                          }} 
                          disabled={isLoginInProgress}
                          className={`w-full py-7 rounded-2xl ${isLoginInProgress ? "bg-slate-800" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"} text-white font-bold flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all`}
                        >
                          {isLoginInProgress || !isAuthReady ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              {isLoginInProgress ? "Connecting..." : "Initializing..."}
                            </>
                          ) : (
                            <>
                              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6 rounded-full" />
                              Connect with Google
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Account</span>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase">Connected</span>
                          </div>
                          <p className="text-xs font-medium text-slate-200 truncate">{userEmail}</p>
                          <div className="pt-2 flex items-center justify-between text-[9px] text-slate-500">
                            <span>Last Synced</span>
                            <span>{relativeSyncTime}</span>
                          </div>
                        </div>
                        <Button 
                          onClick={() => triggerGoogleSync(true)} 
                          disabled={isGoogleSyncing}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold flex items-center justify-center gap-2 h-12"
                        >
                          <RefreshCw className={`w-4 h-4 ${isGoogleSyncing ? "animate-spin" : ""}`} />
                          Sync Now
                        </Button>
                        <Button 
                          variant="ghost"
                          onClick={() => AuthService.logout()} 
                          className="w-full text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl font-bold h-10"
                        >
                          Sign Out
                        </Button>
                      </div>
                    )}
                  </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-700/50">
                  <Button 
                    variant="outline" 
                    onClick={() => { setShowHelp(true); setShowSettings(false); }}
                    className="rounded-xl h-12 border-slate-700 hover:bg-amber-500/10 text-amber-500 gap-2 font-bold"
                  >
                    <HelpCircle className="w-5 h-5" /> Help Guide
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => { performShieldCleanup(); setShowSettings(false); }}
                    className="rounded-xl h-12 border-slate-700 hover:bg-destructive/10 text-destructive gap-2 font-bold"
                  >
                    <Trash2 className="w-5 h-5" /> Cleanup Shield
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        <main className="flex-1 flex flex-col items-center py-6 md:py-12 px-4 space-y-8 md:space-y-12 pb-32">
          {(mode === "word" || mode === "home" || mode === "sentence") && (
            <div className="w-full max-w-4xl space-y-8">
              {/* Welcome Section - Home Only */}
              {mode === "home" && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center space-y-4"
                >
                  <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-2">
                    <Languages className="w-8 h-8 text-primary" />
                  </div>
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                    Vocab<span className="text-primary">Master</span>
                  </h1>
                  <p className="text-muted-foreground text-sm md:text-base max-w-xl mx-auto px-4">
                    Master English vocabulary with Bengal translations, AI sentence analysis, and professional practice modules.
                  </p>

                  <div className="pt-6 flex justify-center">
                    <AnimatePresence>
                      {isSyncing && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Syncing...</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* Dashboard Feature Hub - Home Only */}
              {mode === "home" && (
                <div className="px-2 sm:px-4">
                  <Card className="bg-slate-900/40 border-slate-700/50 rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-8 shadow-2xl overflow-hidden">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                      {/* Feature: Search */}
                      <Button 
                        onClick={() => { setMode("word"); setResult(null); setSentenceResult(null); setSearchTerm(""); }} 
                        className="h-28 md:h-32 rounded-3xl bg-primary hover:bg-primary/90 flex flex-col items-center justify-center gap-1 shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all active:scale-95 text-white"
                      >
                        <Search className="w-7 h-7" />
                        <span className="font-bold text-base md:text-lg">Search</span>
                      </Button>

                      {/* Feature: Daily Words */}
                      <Button 
                        variant="ghost"
                        onClick={() => setMode("daily")} 
                        className="h-28 md:h-32 justify-center flex-col gap-2 text-slate-300 hover:bg-white/5 rounded-3xl"
                      >
                        <div className="p-2 bg-rose-500/10 rounded-lg">
                          <Calendar className="w-5 h-5 text-rose-400" />
                        </div>
                        <span className="font-bold text-sm md:text-base">Daily Words</span>
                      </Button>

                      {/* Feature: Sentence Analysis */}
                      <Button 
                        variant="ghost"
                        onClick={() => { setMode("sentence"); setResult(null); setSentenceResult(null); setSearchTerm(""); }} 
                        className="h-24 md:h-28 justify-center flex-col gap-2 text-slate-300 hover:bg-white/5 rounded-3xl"
                      >
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                          <PencilLine className="w-5 h-5 text-emerald-400" />
                        </div>
                        <span className="font-bold text-xs md:text-sm">Sentence Analysis</span>
                      </Button>

                      {/* Feature: Quiz Mode */}
                      <Button 
                        variant="ghost"
                        onClick={() => setMode("quiz")} 
                        className="h-24 md:h-28 justify-center flex-col gap-2 text-slate-300 hover:bg-white/5 rounded-3xl"
                      >
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <BrainCircuit className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="font-bold text-xs md:text-sm">Quiz Mode</span>
                      </Button>

                      {/* Feature: Translation Practice */}
                      <Button 
                        variant="ghost"
                        onClick={() => setMode("translation")} 
                        className="h-24 md:h-28 justify-center flex-col gap-2 text-slate-300 hover:bg-white/5 rounded-3xl"
                      >
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                          <Languages className="w-5 h-5 text-amber-400" />
                        </div>
                        <span className="font-bold text-xs md:text-sm">Translation Practice</span>
                      </Button>

                      {/* Feature: Special Vocabulary */}
                      <Button 
                        onClick={() => setMode("special")} 
                        className="h-24 md:h-28 rounded-3xl bg-indigo-600/20 hover:bg-indigo-600/30 flex flex-col items-center justify-center gap-2 border border-indigo-500/30 transition-all active:scale-95 text-indigo-300 lg:col-span-1"
                      >
                        <Library className="w-6 h-6" />
                        <span className="font-bold text-xs md:text-sm">Special Vocabulary</span>
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {/* Main Unified Search Bar */}
              <div className="px-4" ref={homeSearchRef}>
                <Card className="bg-slate-900/40 border-slate-700/50 rounded-[2rem] p-6 space-y-4 shadow-xl !overflow-visible">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                    <Input 
                      placeholder={mode === "sentence" ? "Enter English sentence..." : "English word..."}
                      className="pl-10 tap-target bg-slate-950/50 border-slate-700/50 focus:ring-primary rounded-2xl text-lg backdrop-blur-sm w-full h-14"
                      value={searchTerm}
                      onChange={(e) => handleSearchTermChange(e.target.value)}
                      onFocus={() => (mode === "home" || mode === "word") && searchTerm.trim().length >= 2 && setShowSuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSearch();
                        }
                      }}
                    />
                    
                    {/* Suggestions Dropdown */}
                    <AnimatePresence>
                      {showSuggestions && (mode === "home" || mode === "word") && suggestions.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute z-[9999] left-0 right-0 bottom-[calc(100%+12px)] bg-[#1a1a2e]/95 border border-primary/30 rounded-2xl overflow-hidden shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                        >
                          <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                            {suggestions.map((s, idx) => (
                              <button
                                key={idx}
                                onClick={() => selectSuggestion(s)}
                                className="suggestion-item w-full p-4 flex flex-col items-start gap-1 transition-colors border-b border-white/5 hover:bg-white/5 last:border-0 text-left"
                              >
                                <span className="font-bold text-primary">{s.word}</span>
                                <span className="text-xs text-muted-foreground line-clamp-1">{s.meaning}</span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <Button 
                    onClick={(e) => handleSearch(e)} 
                    size="lg" 
                    className="tap-target w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all active:scale-95 text-lg font-bold text-white relative overflow-hidden"
                    disabled={loading}
                  >
                    <div className="flex items-center gap-3">
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <div className={`w-2.5 h-2.5 rounded-full border border-white/20 ${isOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"}`}></div>
                          {mode === "sentence" ? "Analyze Sentence" : "Search Dictionary"}
                        </>
                      )}
                    </div>
                  </Button>
                </Card>
              </div>

              {/* Seamless Transitions & Results */}
              {(mode === "word" || mode === "sentence") && (
                <div className="px-4 space-y-6">
                  <div className="flex items-center">
                    <Button 
                      variant="ghost" 
                      onClick={() => { setMode("home"); setResult(null); setSentenceResult(null); setSearchTerm(""); }} 
                      className="text-muted-foreground hover:text-primary gap-2 transition-all font-bold px-0 h-8"
                    >
                      <ArrowLeft className="w-4 h-4" /> ⬅️ Back to Dashboard
                    </Button>
                  </div>

                  {/* Word Detail Section (when results arrived) */}
                  {mode === "word" && result && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="glass-dark border-slate-700/50 rounded-[2rem] overflow-hidden shadow-2xl">
                        <div className="p-8 space-y-8">
                          {/* Word Header */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 capitalize whitespace-nowrap">
                                  {result.word}
                                </h2>
                                <div className="hidden md:flex gap-2">
                                  <button
                                    onClick={() => handleSaveWord(result)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all font-bold text-xs ${
                                      savedList.some((v) => v.word.toLowerCase() === result.word.toLowerCase())
                                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                                        : 'bg-emerald-500 border-transparent text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                                    }`}
                                  >
                                    <BookmarkCheck className="w-4 h-4" />
                                    {savedList.some((v) => v.word.toLowerCase() === result.word.toLowerCase()) ? "Saved" : "Save Word"}
                                  </button>
                                  {result.source === "local" && (
                                    <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 text-[10px] uppercase font-black tracking-widest flex items-center">
                                      LAYER 1: STATIC
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className={`flex items-center gap-3 font-bold px-3 py-1 rounded-lg transition-all duration-300 ${result.relatedFormFound ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-primary/80"}`}>
                                <Book className="w-5 h-5" />
                                <span className="text-lg md:text-xl font-black uppercase tracking-tight">{result.partOfSpeech}</span>
                              </div>
                            </div>
                            {/* Mobile Save Button */}
                            <div className="flex md:hidden gap-2">
                              <button
                                onClick={() => handleSaveWord(result)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all font-bold ${
                                  savedList.some((v) => v.word.toLowerCase() === result.word.toLowerCase())
                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                                    : 'bg-emerald-500 text-white'
                                }`}
                              >
                                <BookmarkCheck className="w-5 h-5" />
                                {savedList.some((v) => v.word.toLowerCase() === result.word.toLowerCase()) ? "Saved" : "Save Word"}
                              </button>
                            </div>
                          </div>
                                             {/* Body: Meaning (Center) */}
                          <div className="text-center py-10 bg-slate-800/20 rounded-3xl border border-slate-700/20 shadow-inner">
                            {result.relatedFormFound && (
                              <div className="mb-2">
                                <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-[10px] uppercase font-black tracking-widest rounded-full border border-amber-500/30 animate-pulse">
                                  Related Form Found
                                </span>
                              </div>
                            )}
                            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4 opacity-50">Bengali Meaning</h3>
                            <p className="text-4xl md:text-5xl font-black text-white leading-tight drop-shadow-sm">{result.meaning}</p>
                          </div>

                          {/* Grid: 4 Grammatical Forms */}
                          <div className="relative p-6 bg-slate-800/40 rounded-3xl border border-slate-700/30">
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 opacity-60">Grammatical Variations</h3>
                            {!result.partOfSpeech && isOnline && (
                              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center rounded-3xl z-10">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 bg-slate-900 px-3 py-1 rounded-full border border-emerald-500/30">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  SYNCING...
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              <div className={`flex flex-col py-3 px-4 rounded-xl border transition-all duration-300 ${result.matchedForm === result.forms.noun?.toLowerCase() ? "bg-emerald-500/10 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/30" : "bg-slate-900/40 border-slate-700/20"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded ${result.matchedForm === result.forms.noun?.toLowerCase() ? "bg-emerald-500 text-white" : "text-muted-foreground opacity-50"}`}>Noun</span>
                                  {result.matchedForm === result.forms.noun?.toLowerCase() && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                </div>
                                <span className={`text-base ${result.matchedForm === result.forms.noun?.toLowerCase() ? "active-match" : "font-semibold text-slate-100"}`}>
                                  {result.forms.noun || "—"}
                                </span>
                              </div>
                              <div className={`flex flex-col py-3 px-4 rounded-xl border transition-all duration-300 ${result.matchedForm === result.forms.verb?.toLowerCase() ? "bg-emerald-500/10 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/30" : "bg-slate-900/40 border-slate-700/20"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded ${result.matchedForm === result.forms.verb?.toLowerCase() ? "bg-emerald-500 text-white" : "text-muted-foreground opacity-50"}`}>Verb</span>
                                  {result.matchedForm === result.forms.verb?.toLowerCase() && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                </div>
                                <span className={`text-base ${result.matchedForm === result.forms.verb?.toLowerCase() ? "active-match" : "font-semibold text-slate-100"}`}>
                                  {result.forms.verb || "—"}
                                </span>
                              </div>
                              <div className={`flex flex-col py-3 px-4 rounded-xl border transition-all duration-300 ${result.matchedForm === result.forms.adjective?.toLowerCase() ? "bg-emerald-500/10 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/30" : "bg-slate-900/40 border-slate-700/20"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded ${result.matchedForm === result.forms.adjective?.toLowerCase() ? "bg-emerald-500 text-white" : "text-muted-foreground opacity-50"}`}>Adjective</span>
                                  {result.matchedForm === result.forms.adjective?.toLowerCase() && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                </div>
                                <span className={`text-base ${result.matchedForm === result.forms.adjective?.toLowerCase() ? "active-match" : "font-semibold text-slate-100"}`}>
                                  {result.forms.adjective || "—"}
                                </span>
                              </div>
                              <div className={`flex flex-col py-3 px-4 rounded-xl border transition-all duration-300 ${result.matchedForm === result.forms.adverb?.toLowerCase() ? "bg-emerald-500/10 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/30" : "bg-slate-900/40 border-slate-700/20"}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[9px] uppercase font-black tracking-widest px-1.5 py-0.5 rounded ${result.matchedForm === result.forms.adverb?.toLowerCase() ? "bg-emerald-500 text-white" : "text-muted-foreground opacity-50"}`}>Adverb</span>
                                  {result.matchedForm === result.forms.adverb?.toLowerCase() && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                </div>
                                <span className={`text-base ${result.matchedForm === result.forms.adverb?.toLowerCase() ? "active-match" : "font-semibold text-slate-100"}`}>
                                  {result.forms.adverb || "—"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Vocabulary: Synonyms & Antonyms */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="syn-ant-box p-6 bg-slate-800/40 rounded-3xl border border-slate-700/30 flex flex-col">
                              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 opacity-60">Synonyms</h3>
                              <div className="flex flex-wrap gap-2">
                                {result.synonyms.length > 0 ? result.synonyms.map(s => (
                                  <span key={s} onClick={() => selectSuggestion(s)} className="cursor-pointer px-3 py-1 bg-primary/10 text-primary rounded-xl text-[13px] border border-primary/20 font-medium hover:bg-primary/20 transition-colors">{s}</span>
                                )) : <span className="text-xs text-slate-500 italic">No synonyms listed</span>}
                              </div>
                            </div>
                            <div className="syn-ant-box p-6 bg-slate-800/40 rounded-3xl border border-slate-700/30 flex flex-col">
                              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 opacity-60">Antonyms</h3>
                              <div className="flex flex-wrap gap-2">
                                {result.antonyms.length > 0 ? result.antonyms.map(a => (
                                  <span key={a} className="px-3 py-1 bg-destructive/10 text-destructive rounded-xl text-[13px] border border-destructive/20 font-medium">{a}</span>
                                )) : <span className="text-xs text-slate-500 italic">No antonyms listed</span>}
                              </div>
                            </div>
                          </div>

                          {/* Footer: Example Sentence */}
                          <div className="p-6 bg-slate-900/40 rounded-3xl border border-slate-700/30 border-l-4 border-l-primary/50 relative overflow-hidden group">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground opacity-60">Contextual Usage</h3>
                              <Sparkles className="w-4 h-4 text-primary opacity-30 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-xl italic text-slate-200 leading-relaxed font-serif tracking-tight drop-shadow-sm">
                              {result.example ? `"${result.example}"` : "Usage example currently unavailable."}
                            </p>
                          </div>
                          <div className="p-5 bg-black/20 rounded-2xl border border-white/5 space-y-2">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Advanced Tip</span>
                              <p className="text-sm text-slate-400">{result.advancedTips}</p>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  )}

                  {/* Sentence Analysis Section */}
                  {mode === "sentence" && sentenceResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <Card className="glass-dark border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl">
                         <div className="p-8 space-y-8">
                            <div className="space-y-4">
                                <div className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">AI Sentence Breakdown</div>
                                <div className="p-6 bg-slate-800/40 rounded-2xl border border-white/5">
                                  <p className="text-xl md:text-2xl text-slate-100 leading-relaxed font-bold italic">"{searchTerm}"</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-3">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Bengali Translation</span>
                                <p className="text-xl font-bold">{sentenceResult.translation}</p>
                              </div>
                              <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-3">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Grammar / Structure</span>
                                <p className="text-sm text-slate-300 leading-relaxed">{sentenceResult.grammarFocus}</p>
                              </div>
                            </div>

                            <div className="space-y-4">
                               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vocabulary Extraction</span>
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                 {sentenceResult.wordsAnalyzed.map((word, idx) => (
                                   <button 
                                      key={idx}
                                      onClick={() => selectSuggestion(word.word)}
                                      className="p-4 bg-black/20 hover:bg-primary/10 border border-white/5 hover:border-primary/50 transition-all rounded-xl text-left group"
                                   >
                                      <div className="font-bold text-slate-100 group-hover:text-primary transition-colors">{word.word}</div>
                                      <div className="text-[10px] text-muted-foreground uppercase">{word.pos}</div>
                                      <div className="text-xs text-slate-400 mt-1">{word.bn}</div>
                                   </button>
                                 ))}
                               </div>
                            </div>
                         </div>
                      </Card>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          )}


        {/* Quiz Section: Logic-Driven Mini-Agent */}
        {mode === "quiz" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="content-adaptive mb-16"
          >
            {!staticQuiz.isActive ? (
              <div className="flex flex-col items-center justify-center p-12 glass-dark rounded-3xl border border-slate-700/50 space-y-8 text-center max-w-2xl mx-auto shadow-2xl">
                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-2">Mini-Agent Quiz Engine</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Choose your vocabulary pool. The Mini-Agent generates grammatically challenging context questions and POS identification tasks.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <Button 
                    onClick={() => startStaticQuiz('saved')} 
                    className="h-28 flex flex-col gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 hover:bg-primary/10 hover:border-primary/50 transition-all font-bold"
                  >
                    <BookmarkCheck className="w-6 h-6 text-primary" />
                    <div className="flex flex-col">
                      <span className="text-lg">Your Vocabulary</span>
                      <span className="text-[10px] font-normal opacity-60 uppercase tracking-tighter">Personal Saved Set</span>
                    </div>
                  </Button>
                  
                  <Button 
                    onClick={() => startStaticQuiz('library')}
                    className="h-28 flex flex-col gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all font-bold"
                  >
                    <Book className="w-6 h-6 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="text-lg">Special Library</span>
                      <span className="text-[10px] font-normal opacity-60 uppercase tracking-tighter">Sv-20 Logic Pack</span>
                    </div>
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-muted-foreground opacity-50 uppercase tracking-[0.2em] font-black pt-4 border-t border-white/5 w-full justify-center">
                  <BrainCircuit className="w-3 h-3" /> Same-POS Distractor Protection Enabled
                </div>

                <div className="w-full flex justify-center pt-8 border-t border-white/10 mt-4">
                   <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                        setMode("home");
                        setStaticQuiz(p => ({ ...p, isActive: false }));
                     }} 
                    className="text-muted-foreground hover:text-primary flex gap-2 h-10 px-6 rounded-xl border border-transparent hover:border-slate-700/50 transition-all font-bold"
                   >
                      <ArrowLeft className="w-4 h-4" /> ⬅️ Back to Dashboard
                   </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-8">
                <Card className="glass-dark border-slate-700/50 rounded-3xl overflow-hidden shadow-2xl relative">
                  <div className="absolute top-4 left-4">
                    <Button variant="ghost" size="sm" onClick={() => { setMode("home"); setStaticQuiz(p => ({ ...p, isActive: false })); }} className="rounded-xl h-8 text-[10px] uppercase font-bold text-muted-foreground hover:text-foreground">
                      <ArrowLeft className="w-3 h-3 mr-1" /> ⬅️ Back to Dashboard
                    </Button>
                  </div>
                  <CardHeader className="p-8 pb-4 text-center mt-6">
                    <div className="inline-block px-3 py-1 bg-emerald-500/10 rounded-full text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase mb-4 border border-emerald-500/20">
                      Offline {staticQuiz.mode === 'library' ? 'Special' : 'Personal'} Mode
                    </div>
                    <div className="flex flex-col gap-2 mb-6">
                      <h2 className="text-sm font-black text-muted-foreground/60 uppercase tracking-widest text-center">
                         {staticQuiz.currentIndex + 1} of {staticQuiz.questions.length}
                      </h2>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${((staticQuiz.currentIndex + 1) / staticQuiz.questions.length) * 100}%` }}
                          className="h-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                        />
                      </div>
                    </div>
                    <CardTitle className="text-xl md:text-2xl font-bold leading-relaxed transition-all pt-4">
                      {staticQuiz.questions[staticQuiz.currentIndex].question}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-8 pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {staticQuiz.questions[staticQuiz.currentIndex].options.map((option: string) => {
                        const isCorrect = option === staticQuiz.questions[staticQuiz.currentIndex].correctAnswer;
                        const isSelected = option === staticQuiz.selectedAnswer;
                        const showFeedback = staticQuiz.answerGiven;

                        return (
                          <Button
                            key={option}
                            variant={showFeedback ? (isCorrect ? "default" : (isSelected ? "destructive" : "outline")) : "outline"}
                            onClick={() => handleStaticQuizAnswer(option)}
                            disabled={showFeedback}
                            className={`h-24 py-4 px-6 rounded-2xl font-bold text-base transition-all whitespace-normal break-words leading-tight shadow-md flex justify-between items-center ${
                              !showFeedback ? "border-slate-700/50 hover:border-primary/50 hover:bg-primary/5" : ""
                            } ${
                              showFeedback && isCorrect ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/20" : ""
                            } ${
                              showFeedback && isSelected && !isCorrect ? "bg-rose-500/20 text-rose-500 border-rose-500/50 hover:bg-rose-500/20" : ""
                            }`}
                          >
                            <span className="flex-1 text-center">{option}</span>
                            {showFeedback && isCorrect && <span className="ml-2 text-xl">✅</span>}
                            {showFeedback && isSelected && !isCorrect && <span className="ml-2 text-xl">❌</span>}
                          </Button>
                        );
                      })}
                    </div>

                    {staticQuiz.answerGiven && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="pt-4 flex justify-center"
                      >
                        <Button 
                          onClick={nextStaticQuestion}
                          className="w-full sm:w-auto px-12 h-14 rounded-2xl font-black text-lg bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 gap-3 group"
                        >
                          {staticQuiz.currentIndex < staticQuiz.questions.length - 1 ? (
                            <>
                              Next Question <ArrowLeft className="w-5 h-5 rotate-180 group-hover:translate-x-1 transition-transform" />
                            </>
                          ) : (
                            <>
                              See Final Results <CheckCircle2 className="w-5 h-5" />
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )}

                    <div className="pt-6 border-t border-slate-700/30 flex flex-col sm:flex-row items-center gap-4">
                      <Button 
                        variant="ghost" 
                        onClick={finishStaticQuiz}
                        className="w-full sm:w-auto text-xs font-black text-rose-500/70 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl gap-2"
                      >
                        <ArrowLeft className="w-4 h-4" /> ⬅️ Back to Dashboard
                      </Button>
                      <div className="flex-1" />
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Mastery Progress</span>
                        <span className="text-sm font-black text-primary">SCORE: {staticQuiz.score}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </motion.div>
        )}


        {/* Daily Words Section */}
        {/* Special Vocabulary Mode */}
        {mode === "special" && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setMode("home")}
                  className="rounded-xl"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Library className="w-6 h-6 text-indigo-400" />
                    Special Vocabulary
                  </h2>
                  <p className="text-xs text-muted-foreground">Comprehensive list of advanced academic and professional vocabulary.</p>
                </div>
              </div>
              <Button 
                onClick={() => startStaticQuiz('library')}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-11 px-6 font-bold shadow-lg shadow-indigo-500/20"
              >
                <BrainCircuit className="w-4 h-4 mr-2" />
                Quick Quiz (20 Qs)
              </Button>
            </div>

            <div className="space-y-4">
              {getSvLibraryWords().map((word, idx) => (
                <Card key={idx} className="glass-dark border-slate-700/50 rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-all group">
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center font-mono text-xs font-bold text-slate-500 border border-slate-700/50 shrink-0">
                          {idx + 1}
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-3">
                            <h3 className="text-xl font-bold text-primary">{word.word}</h3>
                            <span className="text-[10px] uppercase font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded tracking-widest">{word.partOfSpeech}</span>
                          </div>
                          <p className="text-slate-200 font-medium text-lg">{word.meaning}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-700/30 grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column: Forms & Example */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Word Forms</span>
                          <div className="flex flex-wrap gap-2">
                            {word.forms.noun && (
                              <div className="px-2 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50 flex flex-col min-w-[70px]">
                                <span className="text-[8px] uppercase font-bold text-slate-500">Noun</span>
                                <span className="text-xs font-medium text-slate-300">{word.forms.noun}</span>
                              </div>
                            )}
                            {word.forms.verb && (
                              <div className="px-2 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50 flex flex-col min-w-[70px]">
                                <span className="text-[8px] uppercase font-bold text-slate-500">Verb</span>
                                <span className="text-xs font-medium text-slate-300">{word.forms.verb}</span>
                              </div>
                            )}
                            {word.forms.adjective && (
                              <div className="px-2 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50 flex flex-col min-w-[70px]">
                                <span className="text-[8px] uppercase font-bold text-slate-500">Adjective</span>
                                <span className="text-xs font-medium text-slate-300">{word.forms.adjective}</span>
                              </div>
                            )}
                            {word.forms.adverb && (
                              <div className="px-2 py-1 bg-slate-800/50 rounded-lg border border-slate-700/50 flex flex-col min-w-[70px]">
                                <span className="text-[8px] uppercase font-bold text-slate-500">Adverb</span>
                                <span className="text-xs font-medium text-slate-300">{word.forms.adverb}</span>
                              </div>
                            )}
                            {!word.forms.noun && !word.forms.verb && !word.forms.adjective && !word.forms.adverb && (
                              <span className="text-xs text-slate-600 italic">No alternative forms listed</span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-black text-indigo-400/70 tracking-wider">Example Sentence</span>
                          <p className="text-sm text-slate-400 italic leading-relaxed bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/10">
                            "{word.example}"
                          </p>
                        </div>
                      </div>

                      {/* Right Column: Synonyms & Antonyms */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-black text-emerald-400/70 tracking-wider">Synonyms</span>
                          <div className="flex flex-wrap gap-1.5">
                            {word.synonyms.length > 0 ? word.synonyms.map((syn, sIdx) => (
                              <span key={sIdx} className="text-xs px-2 py-1 bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 rounded-lg font-medium">
                                {syn}
                              </span>
                            )) : <span className="text-xs text-slate-600 italic">None listed</span>}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-black text-rose-400/70 tracking-wider">Antonyms</span>
                          <div className="flex flex-wrap gap-1.5">
                            {word.antonyms.length > 0 ? word.antonyms.map((ant, aIdx) => (
                              <span key={aIdx} className="text-xs px-2 py-1 bg-rose-500/5 text-rose-400 border border-rose-500/20 rounded-lg font-medium">
                                {ant}
                              </span>
                            )) : <span className="text-xs text-slate-600 italic">None listed</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

          </motion.div>
        )}

        {mode === "daily" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="content-adaptive mb-16"
          >
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="flex items-center gap-3 px-4 justify-center">
                <Calendar className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold tracking-tight">Words of the Day</h2>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setMode("home");
                  setResult(null);
                }} 
                className="text-muted-foreground hover:text-primary gap-2 font-bold"
              >
                <ArrowLeft className="w-4 h-4" /> ⬅️ Back to Dashboard
              </Button>
            </div>
            
            <div className="flex flex-col gap-8 items-center w-full">
              {dailyWords.map((word) => (
                <motion.div
                  key={word.word}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="w-full"
                >
                  <Card className="glass-dark border-slate-700/50 rounded-3xl overflow-hidden shadow-xl border-l-[6px] border-l-primary/50">
                    <CardHeader className="pb-4 border-b border-white/5 bg-white/5">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-2xl text-primary font-black tracking-tight">{word.word}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{word.partOfSpeech}</span>
                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                            <span className="text-xs text-emerald-400 font-bold">{word.meaning}</span>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSaveWord(word)}
                          className="rounded-full hover:bg-primary/20 text-primary h-10 w-10"
                        >
                          <Save className="w-5 h-5" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      {/* 4 Forms Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(word.forms).map(([key, val]) => (
                          <div key={key} className="flex flex-col p-3 bg-slate-800/40 rounded-xl border border-white/5">
                            <span className="text-[9px] uppercase font-black text-muted-foreground opacity-50 mb-1">{key}</span>
                            <span className="text-sm font-semibold truncate text-slate-200">{val || "—"}</span>
                          </div>
                        ))}
                      </div>

                      {/* Synonyms & Antonyms */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <span className="text-[9px] uppercase font-black text-emerald-400 opacity-60 tracking-widest">Synonyms</span>
                           <div className="flex flex-wrap gap-1.5">
                              {word.synonyms.length > 0 ? word.synonyms.map(s => (
                                <span key={s} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/20">{s}</span>
                              )) : <span className="text-[10px] italic text-slate-500">—</span>}
                           </div>
                        </div>
                        <div className="space-y-2">
                           <span className="text-[9px] uppercase font-black text-rose-400 opacity-60 tracking-widest">Antonyms</span>
                           <div className="flex flex-wrap gap-1.5">
                              {word.antonyms.length > 0 ? word.antonyms.map(a => (
                                <span key={a} className="px-2 py-0.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-bold border border-rose-500/20">{a}</span>
                              )) : <span className="text-[10px] italic text-slate-500">—</span>}
                           </div>
                        </div>
                      </div>

                      {/* Example Sentence */}
                      <div className="p-4 bg-primary/5 rounded-2xl border-l-[3px] border-primary/40 italic text-slate-300 text-sm leading-relaxed">
                        "{word.example}"
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}


        {/* Translation Practice Module */}
        <AnimatePresence mode="wait">
          {mode === "translation" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="content-adaptive translation-container mb-16 space-y-8"
            >
              {!translationPassage && !showHistory ? (
                <div className="flex flex-col items-center justify-center p-12 glass-dark rounded-3xl border border-slate-700/50 space-y-6 text-center">
                  <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-2">
                    <PencilLine className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold mb-2">Bangla to English Practice</h2>
                    <p className="text-muted-foreground max-w-md">
                      Improve your translation skills with AI-generated passages on complex topics like Bangladesh's social economy, global climate, or tech ethics.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
                    <Button 
                      onClick={handleNewTranslationPractice} 
                      disabled={loading}
                      className="flex-1 rounded-2xl h-12 font-bold shadow-lg shadow-primary/20"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                      New Practice
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowHistory(true)}
                      className="flex-1 rounded-2xl h-12 font-bold border-slate-700"
                    >
                      <History className="w-4 h-4 mr-2" />
                      View History
                    </Button>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setMode("home");
                      setTranslationPassage(null);
                      setTranslationFeedback(null);
                    }} 
                    className="text-muted-foreground hover:text-primary gap-2 font-bold"
                  >
                    <ArrowLeft className="w-4 h-4" /> ⬅️ Back to Dashboard
                  </Button>
                </div>
              ) : showHistory ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <History className="w-6 h-6 text-primary" />
                      Practice History
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} className="rounded-xl">
                      Back to Practice
                    </Button>
                  </div>
                  
                  {translationHistoryRef.current.length === 0 ? (
                    <div className="p-12 glass-dark rounded-3xl text-center text-muted-foreground italic border border-slate-700/50">
                      No past practices found. Start a new one!
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {translationHistoryRef.current.map((entry, idx) => (
                        <Card key={idx} className="glass-dark border-slate-700/50 rounded-2xl overflow-hidden hover:border-primary/30 transition-all">
                          <CardHeader className="p-4 bg-slate-800/30 flex flex-row items-center justify-between">
                            <div>
                              <CardTitle className="text-sm font-bold text-primary">{entry.passage.topic}</CardTitle>
                              <CardDescription className="text-[10px] uppercase tracking-wider font-semibold opacity-60">
                                {new Date(entry.timestamp).toLocaleDateString()} • Score: {entry.feedback.score}/10
                              </CardDescription>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setTranslationPassage(entry.passage);
                                setUserTranslation(entry.userTranslation);
                                setTranslationFeedback(entry.feedback);
                                // If it was a blank entry or they are coming back to finish it, start in retake mode if no analysis yet
                                const isUnfinished = entry.userTranslation === "" || (entry.feedback.score === 0 && entry.feedback.corrections.length === 0);
                                setIsRetaking(isUnfinished);
                                setShowHistory(false);
                              }}
                              className="text-xs font-bold text-primary hover:bg-primary/10 rounded-xl"
                            >
                              Review Details →
                            </Button>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <PencilLine className="w-5 h-5 text-primary" />
                      </div>
                      <h2 className="text-xl font-bold">{translationPassage?.topic}</h2>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => { 
                        // Final session save if user typed something
                        if (translationPassage && userTranslation.trim()) {
                          const entry: TranslationLogEntry = {
                            passage: translationPassage,
                            userTranslation: userTranslation,
                            feedback: translationFeedback || {
                              score: 0,
                              corrections: [],
                              errorBreakdown: [],
                              vocabularyUpgrade: [],
                              naturalSuggestions: [],
                              modelAbstractTranslation: translationPassage.modelAnswer
                            },
                            timestamp: Date.now()
                          };
                          saveToTranslationHistory(entry);
                        }
                        setTranslationPassage(null); 
                        setTranslationFeedback(null); 
                        setUserTranslation(""); 
                      }}
                      className="text-muted-foreground hover:text-primary rounded-xl"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      ⬅️ Back
                    </Button>
                  </div>

                  <div className="translation-grid">
                    {/* Bangla Passage */}
                    <Card className="glass-dark border-slate-700/50 rounded-2xl overflow-hidden h-full flex flex-col">
                      <CardHeader className="p-4 bg-slate-800/30 border-b border-slate-700/50 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Original Bangla</CardTitle>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={handleRetake}
                          disabled={isEvaluating}
                          className="h-7 px-3 text-[10px] font-bold gap-2 hover:bg-primary/10 hover:text-primary transition-colors rounded-lg border border-transparent hover:border-primary/20"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRetaking ? 'animate-spin' : ''}`} />
                          Retake
                        </Button>
                      </CardHeader>
                      <CardContent className="p-6 flex-1">
                        <p className="text-lg leading-relaxed text-slate-100 font-medium whitespace-pre-wrap">
                          {translationPassage?.banglaPassage}
                        </p>
                      </CardContent>
                    </Card>

                    {/* Translation Input */}
                    <Card className="glass-dark border-slate-700/50 rounded-2xl overflow-hidden h-full flex flex-col">
                      <CardHeader className="p-4 bg-slate-800/30 border-b border-slate-700/50">
                        <CardTitle className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Your English Translation</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 flex-1 flex flex-col gap-4">
                        <Textarea 
                          placeholder="Type your translation here..."
                          value={userTranslation}
                          onChange={(e) => setUserTranslation(e.target.value)}
                          disabled={showAnalysisFeedback || isEvaluating}
                          className="flex-1 bg-slate-900/40 border-slate-700/50 rounded-xl p-4 text-base resize-none focus-visible:ring-primary/30 min-h-[250px]"
                        />
                        {!showAnalysisFeedback && (
                          <div className="flex gap-3 mt-auto">
                            <Button
                              variant="secondary"
                              onClick={handleShowAnswer}
                              disabled={isEvaluating || !userTranslation.trim()}
                              className="flex-1 h-12 rounded-xl font-bold bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50"
                            >
                              Show Answer
                            </Button>
                            <Button 
                              onClick={handleSubmitTranslation} 
                              disabled={isEvaluating || !userTranslation.trim()}
                              className="flex-[1.5] h-12 rounded-xl font-bold shadow-lg bg-primary hover:bg-primary/90"
                            >
                              {isEvaluating ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analyzing... {analysisAttempt > 1 ? `Attempt [${analysisAttempt}/3]` : ""}</>
                              ) : (
                                <><Sparkles className="w-4 h-4 mr-2" /> AI Analysis</>
                              )}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Feedback Section */}
                  <AnimatePresence>
                    {translationFeedback && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-8"
                      >
                        {/* Permanent Side-by-Side Glassmorphism Comparison */}
                        <div className="comparison-container mt-4">
                          {/* Reference Translation (Emerald Green) */}
                          <div className="compare-card compare-card-model">
                            <div className="compare-header">
                              <span>Reference Translation</span>
                              <Sparkles className="w-3 h-3 animate-pulse" />
                            </div>
                            <div className="compare-body">
                              {translationFeedback.modelAbstractTranslation}
                            </div>
                          </div>

                          {/* Your Attempt (Royal Blue) */}
                          <div className="compare-card compare-card-user">
                            <div className="compare-header">
                              <span>Your Attempt</span>
                              <PencilLine className="w-3 h-3" />
                            </div>
                            <div className="compare-body">
                              {userTranslation}
                            </div>
                          </div>
                        </div>

                        {/* Performance Score */}
                        {showAnalysisFeedback && (
                          <>
                            <div className="p-6 bg-slate-800/40 rounded-3xl border border-slate-700/50 flex flex-col items-center text-center">
                              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black mb-4 border-4 ${
                                translationFeedback.score >= 8 ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' :
                                translationFeedback.score >= 5 ? 'bg-amber-500/10 border-amber-500 text-amber-400' :
                                'bg-red-500/10 border-red-500 text-red-400'
                              }`}>
                                {translationFeedback.score}
                              </div>
                              <h3 className="text-xl font-bold mb-1">Performance Score</h3>
                              <p className="text-muted-foreground text-sm">Prioritizing natural flow and contextual meaning.</p>
                            </div>

                            {/* Correction Table */}
                            <div className="space-y-4">
                              <h3 className="text-lg font-bold flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                "Sense-for-Sense" Corrections
                              </h3>
                              <div className="space-y-4">
                                {translationFeedback.corrections.map((corr, idx) => (
                                  <div key={idx} className="glass-dark border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl">
                                    <div className="correction-card-grid p-4 gap-6">
                                      <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Original Bangla</span>
                                        <p className="text-sm font-medium text-slate-200">{corr.original}</p>
                                      </div>
                                      <div className="space-y-2">
                                        <div>
                                          <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Your Version</span>
                                          <p className="text-sm text-red-300/80 italic">{corr.user}</p>
                                        </div>
                                        {corr.literalAvoid && (
                                          <div className="p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                                            <span className="text-[9px] uppercase font-bold text-red-400/70">Literal Translation (Avoid this)</span>
                                            <p className="text-[11px] text-red-300/60 line-through decoration-red-500/50">{corr.literalAvoid}</p>
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-[10px] uppercase font-bold text-emerald-400/80">Natural/Abstract Version</span>
                                        <p className="text-sm text-emerald-400 font-medium">{corr.corrected}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Natural Suggestions Comparison */}
                            {translationFeedback.naturalSuggestions && translationFeedback.naturalSuggestions.length > 0 && (
                              <div className="space-y-4">
                                <h3 className="text-lg font-bold flex items-center gap-2 text-amber-400">
                                  <Palette className="w-5 h-5" />
                                  Linguistic Nuances
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {translationFeedback.naturalSuggestions.map((suggestion, idx) => (
                                    <div key={idx} className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/20 flex flex-col gap-2">
                                      <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-red-400/80 uppercase">Literal/Stilted</span>
                                        <p className="text-xs text-slate-400 line-through opacity-60 italic">{suggestion.literal}</p>
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-emerald-400/80 uppercase">Natural/Fluent</span>
                                        <p className="text-sm font-bold text-emerald-400">{suggestion.natural}</p>
                                      </div>
                                      <p className="text-[10px] text-slate-500 mt-2 leading-relaxed border-t border-amber-500/10 pt-2">{suggestion.reason}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Errors & Vocabulary Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              {/* Error Breakdown */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-bold flex items-center gap-2 text-red-400">
                                  <XCircle className="w-5 h-5" />
                                  Error Breakdown
                                </h3>
                                <div className="space-y-3">
                                  {translationFeedback.errorBreakdown.map((err, idx) => (
                                    <div key={idx} className="p-4 bg-red-500/5 rounded-2xl border border-red-500/20">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black uppercase text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
                                          {err.category}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-300 leading-relaxed">{err.description}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Vocabulary Upgrade */}
                              <div className="space-y-4">
                                <h3 className="text-lg font-bold flex items-center gap-2 text-primary">
                                  <Sparkles className="w-5 h-5" />
                                  Vocabulary Upgrade
                                </h3>
                                <div className="grid grid-cols-1 gap-3">
                                  {translationFeedback.vocabularyUpgrade.map((voc, idx) => (
                                    <div key={idx} className="p-4 bg-primary/5 rounded-2xl border border-primary/20">
                                      <div className="flex items-baseline gap-2 mb-1">
                                        <span className="text-sm font-bold text-primary">{voc.sophisticated}</span>
                                        <span className="text-[10px] text-muted-foreground">instead of</span>
                                        <span className="text-xs line-through opacity-50">{voc.original}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 italic line-clamp-2">{voc.explanation}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Model Abstract Translation Section - Removed redundant since it's in the comparison cards */}
                        
                        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-700/50">
                          <Button 
                            onClick={handleNewTranslationPractice} 
                            className="flex-1 rounded-2xl h-12 font-bold bg-primary hover:bg-primary/90"
                          >
                            New Practice
                          </Button>
                          <Button 
                            variant="secondary"
                            onClick={handleRetake}
                            className="flex-1 rounded-2xl h-12 font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retake Test
                          </Button>
                          <Button 
                            variant="outline"
                            onClick={() => setShowHistory(true)}
                            className="flex-1 rounded-2xl h-12 font-bold border-slate-700"
                          >
                            <History className="w-4 h-4 mr-2" />
                            View History
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
          {/* Phrases & Idioms Collection - Persistent Position (BOTTOM) */}
          <div className="w-full max-w-4xl space-y-12 mt-12">
            <div className="px-4 pb-0">
                <Button 
                  variant="ghost" 
                  onClick={() => toggleSection('phrases')}
                  className="w-full flex justify-between items-center bg-slate-800/30 hover:bg-slate-800/50 rounded-2xl p-4 h-auto border border-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquareQuote className="w-5 h-5 text-amber-500" />
                    <span className="font-bold">Phrases & Idioms Collection</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-black">{phraseList.length}</span>
                  </div>
                  <motion.div
                    animate={{ rotate: expandedSections.phrases ? 180 : 0 }}
                  >
                    <Download className="w-4 h-4 text-muted-foreground rotate-180" />
                  </motion.div>
                </Button>

                <AnimatePresence>
                  {expandedSections.phrases && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden space-y-3 pt-4"
                    >
                      {phraseList.length === 0 ? (
                        <div className="p-8 glass-dark rounded-2xl text-center text-xs text-muted-foreground italic border border-slate-700/30">
                          Your collection is empty. New AI phrases are added every 24h.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {phraseList.map((idiom, idx) => (
                            <div key={idx} className="idiom-card">
                              <div className="flex justify-between items-start">
                                <span className="idiom-phrase">{idiom.phrase}</span>
                                <Sparkles className="w-3 h-3 text-primary/30" />
                              </div>
                              <span className="idiom-meaning">{idiom.meaning}</span>
                              <p className="idiom-example">"{idiom.example}"</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Your Vocabulary List (Image Style: BOTTOM ALWAYS) */}
              <div className="px-4 pb-32 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-10 bg-emerald-500 rounded-full" />
                    <h2 className="text-4xl font-bold tracking-tight">Your Vocabulary List</h2>
                  </div>
                  
                  <div className="flex justify-center">
                    <Button 
                      onClick={() => exportToCSV()}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full px-12 py-6 h-auto text-lg font-bold gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      <Download className="w-6 h-6" /> Export as CSV
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-900/40 rounded-[2rem] border border-slate-800/50 overflow-x-auto backdrop-blur-sm">
                  <Table className="min-w-[1300px]">
                    <TableHeader className="bg-slate-950/40">
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Word</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Meaning</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Type</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Noun</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Verb</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Adj</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Adv</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Synonyms</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6">Antonyms</TableHead>
                        <TableHead className="text-slate-400 font-bold text-sm py-4 px-6 w-1/4">Sentence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-20 text-slate-500 italic text-lg">
                            Your saved words will appear here.
                          </TableCell>
                        </TableRow>
                      ) : (
                        savedList.map((item, idx) => (
                          <TableRow 
                            key={idx} 
                            onClick={() => { setSearchTerm(item.word); handleSearch(); }}
                            className="border-slate-800 hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <TableCell className="py-4 px-6 text-primary font-bold text-lg group-hover:scale-105 transition-transform origin-left whitespace-nowrap">
                              {item.word}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-100 text-sm">
                              {item.meaning}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-xs font-bold uppercase tracking-widest">
                              {item.partOfSpeech || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-xs italic">
                              {item.forms?.noun || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-xs italic">
                              {item.forms?.verb || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-xs italic">
                              {item.forms?.adjective || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-xs italic">
                              {item.forms?.adverb || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-[10px]">
                              {item.synonyms?.join(", ") || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-400 text-[10px]">
                              {item.antonyms?.join(", ") || "-"}
                            </TableCell>
                            <TableCell className="py-4 px-6 text-slate-300 text-[10px] italic leading-relaxed">
                              {item.example || "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {isSyncing && (
                <div className="flex justify-center mt-8">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 tracking-widest">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    BACKGROUND SYNCING...
                  </div>
                </div>
              )}
            </div>
        
      </main>
      <Toaster position="bottom-right" theme="dark" closeButton />
    </div>
  );
}
