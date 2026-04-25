import { GoogleGenAI, Type } from "@google/genai";
import { searchLocalDictionary } from "./localDictionaryService";

let genAI: GoogleGenAI | null = null;
let manualApiKey: string | null = null;

export function setManualApiKey(key: string | null) {
  manualApiKey = key;
  genAI = null; // Reset instance to use new key
}

function getAI() {
  if (!genAI) {
    const userKey = typeof window !== "undefined" ? localStorage.getItem('gemini_api_key') : null;
    const apiKey = userKey || manualApiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === "undefined") {
      throw new Error("Gemini API Key is missing. Please enter it in the settings sidebar.");
    }
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

// Helper to provide descriptive errors for 403, 429, or network issues
function handleGenAIError(error: any) {
  const errorStr = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
  const status = error?.status || (typeof error === 'object' ? error?.error?.status : null);
  const userKey = typeof window !== "undefined" ? localStorage.getItem('gemini_api_key') : null;
  const isUserKey = !!(userKey || manualApiKey);

  if (status === "RESOURCE_EXHAUSTED" || errorStr.includes("429") || errorStr.toLowerCase().includes("quota")) {
    if (isUserKey) {
      return new Error("Your personal API quota is full. Please wait 60 seconds.");
    }
    return new Error("AI Quota Exceeded (429): You have reached the usage limit for the free Gemini API. To continue searching or enriching without interrupts, please provide your own Gemini API Key in the Settings Hub.");
  }

  if (status === "PERMISSION_DENIED" || errorStr.includes("403") || errorStr.toLowerCase().includes("permission")) {
    if (isUserKey) {
       return new Error("API Key is invalid or restricted.");
    }
    return new Error("Gemini API Permission Denied (403): Your API key may not have access to this model, or the Generative Language API is disabled in your Google Cloud project.");
  }
  
  if (errorStr.includes("xhr error") || errorStr.includes("fetch") || errorStr.includes("Rpc failed")) {
    return new Error(`Gemini Network Error: The background service is currently unavailable or blocked. (${errorStr.substring(0, 50)}...)`);
  }

  return error instanceof Error ? error : new Error(errorStr);
}

export interface VocabularyResult {
  word: string;
  meaning: string;
  partOfSpeech: string;
  example: string;
  forms: {
    noun?: string;
    verb?: string;
    adjective?: string;
    adverb?: string;
  };
  synonyms: string[];
  antonyms: string[];
  source?: "local" | "ai" | "hybrid" | "cache";
  relatedFormFound?: boolean;
  matchedForm?: string;
  mainEntryWord?: string;
}

// AI Cache Utilities (Personal Cache Database)
const CACHE_KEY = "HYBRID_CACHE";
const MAX_CACHE_SIZE = 50; 
const MAX_HISTORY_SIZE = 50;
let memoizedCache: Record<string, VocabularyResult> | null = null;

// window.ai type definitions
declare global {
  interface Window {
    ai?: {
      canCreateTextSession: () => Promise<"readily" | "after-download" | "no">;
      createTextSession: (options?: any) => Promise<AISession>;
    };
  }
}

interface AISession {
  prompt: (text: string) => Promise<string>;
  destroy: () => void;
}

async function getLocalAI(): Promise<AISession | null> {
  if (typeof window !== "undefined" && window.ai) {
    try {
      const status = await window.ai.canCreateTextSession();
      if (status === "readily") {
        return await window.ai.createTextSession();
      }
    } catch (e) {
      console.warn("Local AI check failed:", e);
    }
  }
  return null;
}

function getCache(): Record<string, VocabularyResult> {
  if (typeof window === "undefined") return {};
  if (memoizedCache) return memoizedCache;
  const saved = localStorage.getItem(CACHE_KEY);
  try {
    const parsed = saved ? JSON.parse(saved) : {};
    // Ensure cap even on load
    const keys = Object.keys(parsed);
    if (keys.length > MAX_CACHE_SIZE) {
      const limited: Record<string, VocabularyResult> = {};
      keys.slice(-MAX_CACHE_SIZE).forEach(k => limited[k] = parsed[k]);
      return (memoizedCache = limited);
    }
    return (memoizedCache = parsed || {});
  } catch {
    return (memoizedCache = {});
  }
}

function saveToCache(result: VocabularyResult) {
  if (typeof window === "undefined") return;
  const cache = getCache();
  cache[result.word.toLowerCase()] = { ...result, source: "cache" };
  
  // Cap cache size (Remove oldest entries)
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_SIZE) {
    delete cache[keys[0]];
  }
  
  memoizedCache = cache;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function clearAllCache() {
  // 1. Target SEARCH Cache ONLY
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem("HYBRID_CACHE"); // Legacy backup key
  memoizedCache = {};

  // 2. Target Translation History (Older than 50)
  const savedHistory = localStorage.getItem("TRANSLATION_HISTORY");
  if (savedHistory) {
    try {
      const history = JSON.parse(savedHistory);
      if (Array.isArray(history) && history.length > 50) {
        localStorage.setItem("TRANSLATION_HISTORY", JSON.stringify(history.slice(0, 50)));
      }
    } catch (e) {
      localStorage.removeItem("TRANSLATION_HISTORY"); 
    }
  }

  // NOTE: Cleanup Shield explicitly EXCLUDES 'lingo-bengali-list' (Saved Words) and 'PHRASES_COLLECTION' (Auto-Saved Idioms)
}

function getFromCache(word: string): VocabularyResult | null {
  const cache = getCache();
  return cache[word.toLowerCase()] || null;
}

export interface SentenceAnalysisResult {
  translation: string;
  grammarFocus: string;
  wordsAnalyzed: {
    word: string;
    pos: string;
    bn: string;
  }[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  category: "noun" | "verb" | "adjective" | "adverb" | "synonym" | "antonym" | "meaning" | "sentence_pos";
}

export interface TranslationPassage {
  id: string;
  topic: string;
  banglaPassage: string;
  modelAnswer: string;
  timestamp: number;
}

export interface TranslationFeedback {
  score: number;
  corrections: {
    original: string;
    user: string;
    corrected: string;
    literalAvoid?: string; // Literal version to avoid
  }[];
  errorBreakdown: {
    category: "Grammar" | "Spelling" | "Awkward Choice" | "Other";
    description: string;
  }[];
  vocabularyUpgrade: {
    original: string;
    sophisticated: string;
    explanation: string;
  }[];
  naturalSuggestions: {
    literal: string;
    natural: string;
    reason: string;
  }[];
  modelAbstractTranslation: string; // Full sense-for-sense model answer
}

export interface TranslationLogEntry {
  passage: TranslationPassage;
  userTranslation: string;
  feedback: TranslationFeedback;
  timestamp: number;
}

export interface IdiomResult {
  phrase: string;
  meaning: string;
  example: string;
  timestamp: number;
}

// Throttling and Queueing logic to prevent 429s (especially during enrichment bursts)
class RequestQueue {
  private queue: { fn: () => Promise<any>, priority: number }[] = [];
  private processing = false;
  private minDelay = 4500; // 4.5s between requests to be strictly safe on free tier (13-15 RPM)

  async add<T>(fn: () => Promise<T>, priority = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: async () => {
          try {
            const result = await fn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        priority
      });
      // Sort by priority (higher first)
      this.queue.sort((a, b) => b.priority - a.priority);
      this.process();
    });
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task.fn();
        // Constant delay between requests to stay under rate limits
        await new Promise(res => setTimeout(res, this.minDelay));
      }
    }

    this.processing = false;
  }
}

const globalQueue = new RequestQueue();

async function callAIWithRetry(fn: () => Promise<any>, retries = 3, delay = 3000, priority = 0, onAttempt?: (attempt: number) => void) {
  for (let i = 0; i < retries; i++) {
    if (onAttempt) onAttempt(i + 1);
    try {
      // Use the global queue to serialize requests
      return await globalQueue.add(fn, priority);
    } catch (error: any) {
      const isRateLimit = error?.message?.includes("429") || error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("quota") || error?.message?.includes("fetch");
      
      if (isRateLimit && i < retries - 1) {
        // Exponential backoff with jitter (spreads out retries to avoid synchronization)
        const jitter = Math.random() * 1000;
        const backoff = (delay * Math.pow(2.5, i)) + jitter;
        
        console.warn(`Rate limit hit. Retrying in ${Math.round(backoff)}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    }
  }
}

export async function completeVocabularyData(word: string, existingData: Partial<VocabularyResult>): Promise<VocabularyResult> {
  const normalizedWord = word.toLowerCase().trim();
  
  // FALLBACK-FIRST: Check if word exists in local dictionary before calling AI
  const localResult = searchLocalDictionary(normalizedWord);
  if (localResult) {
    // If it's a complete entry in the library, use it instead of AI
    const hasForms = localResult.forms.noun || localResult.forms.verb;
    if (hasForms && localResult.example) {
      return { ...localResult, source: "local" };
    }
  }

  const missingFields = [];
  if (!existingData.partOfSpeech) missingFields.push("part of speech");
  if (!existingData.example) missingFields.push("example sentence");
  if (!existingData.forms?.noun) missingFields.push("noun form");
  if (!existingData.forms?.verb) missingFields.push("verb form");
  if (!existingData.forms?.adjective) missingFields.push("adjective form");
  if (!existingData.forms?.adverb) missingFields.push("adverb form");
  if (!existingData.synonyms || existingData.synonyms.length === 0) missingFields.push("synonyms");
  if (!existingData.antonyms || existingData.antonyms.length === 0) missingFields.push("antonyms");

  if (missingFields.length === 0) return existingData as VocabularyResult;

  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: `Complete the missing vocabulary information for the English word: "${word}". 
        The Bengali meaning is already known as: "${existingData.meaning}". DO NOT change this meaning.
        
        Please provide the following missing information: ${missingFields.join(", ")}.
        
        Return the full entry including the existing meaning. If a form truly doesn't exist, return null for that field.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              meaning: { type: Type.STRING },
              partOfSpeech: { type: Type.STRING, enum: ["Noun", "Verb", "Adjective", "Adverb", "Pronoun"] },
              example: { type: Type.STRING },
              forms: {
                type: Type.OBJECT,
                properties: {
                  noun: { type: Type.STRING, nullable: true },
                  verb: { type: Type.STRING, nullable: true },
                  adjective: { type: Type.STRING, nullable: true },
                  adverb: { type: Type.STRING, nullable: true },
                },
                required: ["noun", "verb", "adjective", "adverb"],
              },
              synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["word", "meaning", "partOfSpeech", "example", "forms", "synonyms", "antonyms"],
          },
        },
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 3000, 0); // Priority 0: Background enrichment

  if (!response.text) {
    throw new Error("Failed to complete vocabulary data");
  }

  const aiResult = JSON.parse(response.text.trim());
  const finalResult: VocabularyResult = { 
    ...aiResult, 
    meaning: existingData.meaning || aiResult.meaning, // Ensure local meaning is preserved
    source: "hybrid" 
  };
  
  // Persistent AI Cache (Automatic)
  saveToCache(finalResult);
  
  return finalResult;
}

export async function fetchVocabulary(word: string): Promise<VocabularyResult> {
  const normalizedWord = word.toLowerCase().trim();

  // Tier 1: Static Library (wordLibrary.js)
  const localResult = searchLocalDictionary(normalizedWord);
  
  // Tier 2: Personal Cache Database (HYBRID_CACHE)
  const cachedResult = getFromCache(normalizedWord);

  // If word exists in Static Library
  if (localResult) {
    // STATIC-FIRST: Trust wordLibrary.js completely. Do NOT call AI if found here.
    return { ...localResult, source: "local" };
  }

  // Tier 2: Search Cache for words not in Fixed Library
  if (cachedResult) {
    return { ...cachedResult, source: "cache" };
  }

  // Tier 3: Hybrid AI Engine (Local AI -> Cloud Fallback)
  
  // Try Local AI for word meaning/POS (though it's better for sentence/translation)
  // For vocabulary search, Gemini Pro/Flash is usually preferred for structure, 
  // so we jump to cloud but we check online status.
  
  // Tier 3: Live AI Search (Gemini)
  if (!navigator.onLine) {
    throw new Error("Word not found in local library and you are offline.");
  }

  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide the Bengali meaning, part of speech, a meaningful example sentence, different word forms (Noun, Verb, Adjective, Adverb, Pronoun), and a list of 3-5 synonyms and antonyms for the English word: "${word}".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              meaning: { type: Type.STRING },
              partOfSpeech: { type: Type.STRING, enum: ["Noun", "Verb", "Adjective", "Adverb", "Pronoun"] },
              example: { type: Type.STRING },
              forms: {
                type: Type.OBJECT,
                properties: {
                  noun: { type: Type.STRING, nullable: true },
                  verb: { type: Type.STRING, nullable: true },
                  adjective: { type: Type.STRING, nullable: true },
                  adverb: { type: Type.STRING, nullable: true },
                },
                required: ["noun", "verb", "adjective", "adverb"],
              },
              synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["word", "meaning", "partOfSpeech", "example", "forms", "synonyms", "antonyms"],
          },
        },
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 3000, 10); // Priority 10: User Search

  if (!response.text) {
    throw new Error("Failed to get a response from Gemini");
  }

  const aiResult = JSON.parse(response.text.trim());
  const finalResult: VocabularyResult = { ...aiResult, source: "ai" };
  
  // Auto-Learning: Save to Tier 2 Cache automatically
  saveToCache(finalResult);
  
  return finalResult;
}

export async function analyzeSentence(sentence: string): Promise<SentenceAnalysisResult> {
  // Map every word against word.txt first
  const words = sentence.split(/\s+/).map(w => w.replace(/[.,!?;:]/g, ""));
  const localWords: { word: string; pos: string; bn: string; }[] = [];

  for (const word of words) {
    const local = searchLocalDictionary(word);
    if (local) {
      localWords.push({
        word: local.word,
        pos: local.partOfSpeech,
        bn: local.meaning
      });
    }
  }

  // If we are offline and have some local words, we provide a basic result if possible, 
  // but usually sentence analysis needs AI for translation and grammar.
  if (!navigator.onLine && !(await getLocalAI())) {
    if (localWords.length > 0) {
       return {
         translation: "[Offline: Full translation unavailable]",
         grammarFocus: "[Offline: Grammar analysis unavailable]",
         wordsAnalyzed: localWords
       };
    }
    throw new Error("Offline: Sentence analysis requires an internet connection.");
  }

  // Cloud Fallback (Prefer Pro for complex sentence analysis if available, otherwise Flash)
  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following English sentence: "${sentence}". 
        1. Provide a natural Bengali translation.
        2. Explain the key grammatical structure or focus.
        3. Break down the sentence word by word (or phrase by phrase) with parts of speech and Bengali meanings.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translation: { type: Type.STRING },
              grammarFocus: { type: Type.STRING },
              wordsAnalyzed: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    bn: { type: Type.STRING },
                  },
                  required: ["word", "pos", "bn"],
                },
              },
            },
            required: ["translation", "grammarFocus", "wordsAnalyzed"],
          },
        },
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 3000, 8); // Priority 8: User Sentence Input

  if (!response.text) {
    throw new Error("Failed to get a response from Gemini");
  }

  return JSON.parse(response.text.trim());
}

// Fisher-Yates shuffle algorithm
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function generateQuiz(vocabularyList: VocabularyResult[], count: number = 20): Promise<QuizQuestion[]> {
  if (vocabularyList.length < 3) {
    throw new Error("Need at least 3 words in your list to generate a quiz.");
  }

  // Anti-Repetition Algorithm: Shuffle mechanism
  // If we don't have enough words to fill the count uniquely, we cycle through them
  let selectedWords: VocabularyResult[] = [];
  const shuffledBase = shuffle(vocabularyList);
  
  if (shuffledBase.length >= count) {
    // We have enough unique words
    selectedWords = shuffledBase.slice(0, count);
  } else {
    // Fallback Rule: Reuse words in a second round/loop only if library doesn't have enough
    const loops = Math.ceil(count / shuffledBase.length);
    for (let i = 0; i < loops; i++) {
      selectedWords = [...selectedWords, ...shuffle(shuffledBase)];
    }
    selectedWords = selectedWords.slice(0, count);
  }

  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a ${count}-question multiple-choice quiz based on these words (in this order): ${JSON.stringify(selectedWords)}. 
        
        CRITICAL REQUIREMENTS:
        1. Exactly ${count} questions.
        2. One question per word in the provided list.
        randomize the question types across these categories:
           - "meaning": Provide the BENGALI word and ask for the correct ENGLISH word (Bengali-to-English).
           - "noun": Identifying the noun form of an English word.
           - "verb": Identifying the verb form of an English word.
           - "adjective": Identifying the adjective form of an English word.
           - "adverb": Identifying the adverb form of an English word.
           - "synonym": Identifying a synonym for an English word.
           - "antonym": Identifying an antonym for an English word.
           - "sentence_pos": Provide a full English sentence (using the word), highlight the word, and ask for its correct part of speech.
        4. Each question MUST have a "category" field.
        5. Ensure distractors (wrong answers) are plausible.
        6. IMPORTANT: Ensure a diverse mix of categories.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Exactly 4 options"
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                category: { 
                  type: Type.STRING, 
                  enum: ["noun", "verb", "adjective", "adverb", "synonym", "antonym", "meaning", "sentence_pos"] 
                },
              },
              required: ["question", "options", "correctAnswer", "category"],
            },
          },
        },
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 3000, 5); // Priority 5: Quiz Generation

  if (!response.text) {
    throw new Error("Failed to generate quiz");
  }

  const questions: QuizQuestion[] = JSON.parse(response.text.trim());
  
  // Shuffle options for each question AND shuffle the question order
  const processedQuestions = questions.map(q => ({
    ...q,
    options: shuffle(q.options)
  }));

  return shuffle(processedQuestions);
}

export async function generateTranslationPassage(): Promise<TranslationPassage> {
  const topics = ["Bangladesh's social economy", "Global climate", "Tech ethics", "Artificial Intelligence impact", "Mental Health in modern society"];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate an intermediate to advanced level Bangla passage for translation practice.
        Topic: ${topic}
        Requirements:
        1. The passage must be EXACTLY 3 lines long. No more, no less.
        2. The language should be formal, sophisticated, and reflect adult-level discourse (complex sentence structures) despite being only 3 lines.
        3. Return a JSON object with 'topic', 'banglaPassage', and a 'modelAnswer' (the perfect native-level English translation).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              banglaPassage: { type: Type.STRING },
              modelAnswer: { type: Type.STRING },
            },
            required: ["topic", "banglaPassage", "modelAnswer"],
          },
        },
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 3000, 5); // Priority 5: Translation Passage Generation

  if (!response.text) {
    throw new Error("Failed to generate translation passage");
  }

  const result = JSON.parse(response.text.trim());
  return {
    ...result,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
}

export async function evaluateTranslation(
  banglaPassage: string, 
  userTranslation: string, 
  onAttempt?: (attempt: number) => void
): Promise<TranslationFeedback> {
  
  // Path A: Local AI
  const localSession = await getLocalAI();
  if (localSession) {
    try {
      const prompt = `Evaluate from Bangla: "${banglaPassage}" to User English: "${userTranslation}". Return JSON: {score(0-10), corrections[], errorBreakdown[], vocabularyUpgrade[], naturalSuggestions[], modelAbstractTranslation}. Prioritize sense-for-sense.`;
      const localResultText = await localSession.prompt(prompt);
      localSession.destroy();
      return JSON.parse(localResultText.trim());
    } catch (e) {
      console.warn("Local AI evaluation failed:", e);
    }
  }

  // Path B: Cloud Fallback with Retries and Attempt tracker
  if (!navigator.onLine) {
    throw new Error("Offline: Local AI missing and cloud analysis unavailable.");
  }

  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3.1-pro-preview", // Pro for complex analysis
        contents: `You are an expert English-Bengali translator. Evaluate the following translation from Bangla to English.
        
        CRITICAL EVALUATION RULE:
        Prioritize "Abstract/Sense-for-Sense" translation over "Literal/Word-for-Word" translation. 
        A good translation should sound like it was written natively in English, capturing the nuances and idioms rather than just mapping words.
    
        GRADING CRITERIA (0-10 Score):
        - Contextual Meaning: Did the user capture the spirit and underlying nuance of the Bangla passage?
        - English Idioms & Collocations: Does the English reflect natural native-speaker patterns?
        - Flow & Cohesion: Is the sentence structure fluid and sophisticated, or does it feel robotic/stilted?
    
        Bangla Original:
        ${banglaPassage}
        
        User's English Translation:
        ${userTranslation}
        
        Provide a structured feedback in JSON format including:
        1. A score from 0-10 based on the criteria above.
        2. A correction table: for each significant sentence or phrase, show the Bangla original, the user's version, and your "Natural/Abstract" corrected version. Optionally include a "literalAvoid" field showing a literal translation that should be avoided.
        3. A breakdown of errors (Grammar, Spelling, Awkward Choice).
        4. A list of 5-8 'Sophisticated Words' or phrases.
        5. A list of 'naturalSuggestions' comparing common literal translations to better natural alternatives.
        6. A 'modelAbstractTranslation': Provide a complete, perfectly natural, high-level English version of the entire Bangla passage for the user to study from. This should be a 'Sense-for-Sense' translation.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              corrections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    user: { type: Type.STRING },
                    corrected: { type: Type.STRING },
                    literalAvoid: { type: Type.STRING, nullable: true },
                  },
                  required: ["original", "user", "corrected"]
                }
              },
              errorBreakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING, enum: ["Grammar", "Spelling", "Awkward Choice", "Other"] },
                    description: { type: Type.STRING }
                  },
                  required: ["category", "description"]
                }
              },
              vocabularyUpgrade: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    sophisticated: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["original", "sophisticated", "explanation"]
                }
              },
              naturalSuggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    literal: { type: Type.STRING, description: "Literal Translation (Avoid this)" },
                    natural: { type: Type.STRING, description: "Natural/Abstract Translation (Better)" },
                    reason: { type: Type.STRING }
                  },
                  required: ["literal", "natural", "reason"]
                }
              },
              modelAbstractTranslation: { type: Type.STRING, description: "Full sense-for-sense model answer" }
            },
            required: ["score", "corrections", "errorBreakdown", "vocabularyUpgrade", "naturalSuggestions", "modelAbstractTranslation"]
          },
        },
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 6000, 10, onAttempt); // Priority 10: Translation Submission Analysis

  if (!response.text) {
    throw new Error("Failed to evaluate translation");
  }

  return JSON.parse(response.text.trim());
}

export function saveTranslationToHistory(entry: TranslationLogEntry) {
  const saved = localStorage.getItem("TRANSLATION_HISTORY");
  let history: TranslationLogEntry[] = [];
  try {
    history = saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.warn("History parse failed", e);
  }
  
  history = [entry, ...history].slice(0, MAX_HISTORY_SIZE);
  localStorage.setItem("TRANSLATION_HISTORY", JSON.stringify(history));
}

export async function fetchDailyIdiom(): Promise<IdiomResult> {
  const response = await callAIWithRetry(async () => {
    try {
      return await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Generate one intermediate-to-advanced English idiom or common phrase. Provide its meaning and a natural example sentence. Return only JSON format: { \"phrase\": \"...\", \"meaning\": \"...\", \"example\": \"...\" }",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              phrase: { type: Type.STRING },
              meaning: { type: Type.STRING },
              example: { type: Type.STRING }
            },
            required: ["phrase", "meaning", "example"]
          }
        }
      });
    } catch (e) {
      throw handleGenAIError(e);
    }
  }, 3, 2000, 5);

  if (!response.text) {
    throw new Error("Failed to fetch daily idiom");
  }

  const result = JSON.parse(response.text.trim());
  return {
    ...result,
    timestamp: Date.now()
  };
}
