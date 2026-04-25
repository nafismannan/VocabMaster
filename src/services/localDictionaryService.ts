import { DICTIONARY_TEXT } from "../data/wordLibrary";
import { SV_DICTIONARY_TEXT } from "../data/SvWordLibrary";
import { VocabularyResult } from "./geminiService";

const parseLibraryData = (content: string): Map<string, any> => {
  const dict = new Map<string, any>();
  content.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Format (Strict 10 Columns): 
    // | Word | Bengali Meaning | Type | Noun | Verb | Adj | Adv | Synonyms | Antonyms | Example |
    const parts = trimmedLine.split('|').map(p => p.trim());
    
    // We expect 11 parts if it starts and ends with | (e.g. |w|m|t|n|v|aj|av|s|a|e|)
    const startIdx = trimmedLine.startsWith('|') ? 1 : 0;
    
    if (parts.length >= startIdx + 9) {
      const cleanPart = (str: string) => (!str || str === "--") ? "" : str;
      
      const word = parts[startIdx].toLowerCase();
      const meaning = cleanPart(parts[startIdx + 1]);
      const type = cleanPart(parts[startIdx + 2]);
      const noun = cleanPart(parts[startIdx + 3]);
      const verb = cleanPart(parts[startIdx + 4]);
      const adjective = cleanPart(parts[startIdx + 5]);
      const adverb = cleanPart(parts[startIdx + 6]);
      const synonyms = parts[startIdx + 7] && parts[startIdx + 7] !== "--" ? parts[startIdx + 7].split(',').map(s => s.trim()).filter(Boolean) : [];
      const antonyms = parts[startIdx + 8] && parts[startIdx + 8] !== "--" ? parts[startIdx + 8].split(',').map(a => a.trim()).filter(Boolean) : [];
      const example = cleanPart(parts[startIdx + 9]);

      dict.set(word, {
        meaning,
        partOfSpeech: type || (noun ? "Noun" : (verb ? "Verb" : (adjective ? "Adjective" : (adverb ? "Adverb" : "")))),
        example,
        forms: {
          noun: noun || null,
          verb: verb || null,
          adjective: adjective || null,
          adverb: adverb || null
        },
        synonyms,
        antonyms
      });
    }
  });
  return dict;
};

export const DICTIONARY_MAP = parseLibraryData(DICTIONARY_TEXT);
export const SV_DICTIONARY_MAP = parseLibraryData(SV_DICTIONARY_TEXT);

export function getSearchSuggestions(query: string, limit: number = 8): VocabularyResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (normalizedQuery.length < 2) return [];

  const results: VocabularyResult[] = [];
  const seenDisplays = new Set<string>();

  const addSuggestion = (display: string, data: any, mainWord?: string) => {
    const key = display.toLowerCase();
    if (seenDisplays.has(key)) return false;
    
    results.push({
      word: display,
      ...data,
      mainEntryWord: mainWord,
      source: "local"
    } as VocabularyResult);
    seenDisplays.add(key);
    return results.length >= limit;
  };

  // Priority 1: Main Word Match (Prefix)
  for (const [word, data] of SV_DICTIONARY_MAP.entries()) {
    if (word.startsWith(normalizedQuery)) {
      if (addSuggestion(word.charAt(0).toUpperCase() + word.slice(1), data)) return results;
    }
  }
  for (const [word, data] of DICTIONARY_MAP.entries()) {
    if (word.startsWith(normalizedQuery)) {
      if (addSuggestion(word.charAt(0).toUpperCase() + word.slice(1), data)) return results;
    }
  }

  // Priority 2: Related Forms Match (Noun, Verb, Adj, Adv)
  const searchForms = (map: Map<string, any>) => {
    for (const [enWord, data] of map.entries()) {
      const forms = data.forms;
      
      // Noun (Column 4)
      if (forms.noun && forms.noun.toLowerCase().startsWith(normalizedQuery) && forms.noun.toLowerCase() !== enWord) {
        if (addSuggestion(`${forms.noun} (Noun)`, { ...data, meaning: "" }, enWord)) return true;
      }
      // Verb (Column 5)
      if (forms.verb && forms.verb.toLowerCase().startsWith(normalizedQuery) && forms.verb.toLowerCase() !== enWord) {
        if (addSuggestion(`${forms.verb} (Verb)`, { ...data, meaning: "" }, enWord)) return true;
      }
      // Adj (Column 6)
      if (forms.adjective && forms.adjective.toLowerCase().startsWith(normalizedQuery) && forms.adjective.toLowerCase() !== enWord) {
        if (addSuggestion(`${forms.adjective} (Adjective)`, { ...data, meaning: "" }, enWord)) return true;
      }
      // Adv (Column 7)
      if (forms.adverb && forms.adverb.toLowerCase().startsWith(normalizedQuery) && forms.adverb.toLowerCase() !== enWord) {
        if (addSuggestion(`${forms.adverb} (Adverb)`, { ...data, meaning: "" }, enWord)) return true;
      }
    }
    return false;
  };

  if (searchForms(SV_DICTIONARY_MAP)) return results;
  if (searchForms(DICTIONARY_MAP)) return results;

  // Priority 3: Contains Match (Main Word) -> Change to Prefix Match if logic logic needs to be strict
  // Actually the user said "Suggestions should only show words that begin with the letters the user typed"
  // So we skip the contains part entirely or change it to startsWith (which is already done in priority 1 & 2)
  // Let's just remove the contains logic to be strictly prefix-based as requested.

  /* Priority 3 & 4 removed to ensure strictly .startsWith() behavior */

  return results;
}

// Create reverse indexes for Bengali to English lookup
const reverseDictionary = new Map<string, string[]>();
const reverseSvDictionary = new Map<string, string[]>();

const buildReverseIndex = (map: Map<string, any>, reverseMap: Map<string, string[]>) => {
  map.forEach((data, enWord) => {
    const bnMeaning = data.meaning;
    if (!reverseMap.has(bnMeaning)) {
      reverseMap.set(bnMeaning, []);
    }
    reverseMap.get(bnMeaning)!.push(enWord);
  });
};

buildReverseIndex(DICTIONARY_MAP, reverseDictionary);
buildReverseIndex(SV_DICTIONARY_MAP, reverseSvDictionary);

export function searchLocalDictionary(word: string): (VocabularyResult & { relatedFormFound?: boolean, matchedForm?: string }) | null {
  const normalizedWord = word.toLowerCase().trim();
  
  // TRIPLE CHECK SEQUENCE:
  // 1. Check wordLibrary.js (DICTIONARY_MAP)
  // 2. Check SvWordLibrary.js (SV_DICTIONARY_MAP)
  
  // English to Bengali - Dictionary
  let result = DICTIONARY_MAP.get(normalizedWord);
  if (result) return { word: normalizedWord.charAt(0).toUpperCase() + normalizedWord.slice(1), ...result, source: "local" };

  // English to Bengali - Special Vocabulary
  result = SV_DICTIONARY_MAP.get(normalizedWord);
  if (result) return { word: normalizedWord.charAt(0).toUpperCase() + normalizedWord.slice(1), ...result, source: "local" };

  // FALLBACK 1: Search in grammatical forms (Noun, Verb, Adj, Adv)
  // Check DICTIONARY_MAP
  for (const [enWord, data] of DICTIONARY_MAP.entries()) {
    const f = data.forms;
    if (
      (f.noun && f.noun.toLowerCase() === normalizedWord) ||
      (f.verb && f.verb.toLowerCase() === normalizedWord) ||
      (f.adjective && f.adjective.toLowerCase() === normalizedWord) ||
      (f.adverb && f.adverb.toLowerCase() === normalizedWord)
    ) {
      return { 
        word: enWord.charAt(0).toUpperCase() + enWord.slice(1), 
        ...data, 
        source: "local",
        relatedFormFound: true,
        matchedForm: normalizedWord
      };
    }
  }

  // Check SV_DICTIONARY_MAP
  for (const [enWord, data] of SV_DICTIONARY_MAP.entries()) {
    const f = data.forms;
    if (
      (f.noun && f.noun.toLowerCase() === normalizedWord) ||
      (f.verb && f.verb.toLowerCase() === normalizedWord) ||
      (f.adjective && f.adjective.toLowerCase() === normalizedWord) ||
      (f.adverb && f.adverb.toLowerCase() === normalizedWord)
    ) {
      return { 
        word: enWord.charAt(0).toUpperCase() + enWord.slice(1), 
        ...data, 
        source: "local",
        relatedFormFound: true,
        matchedForm: normalizedWord
      };
    }
  }

  // Bengali to English - Dictionary
  let enWords = reverseDictionary.get(normalizedWord);
  if (enWords && enWords.length > 0) {
    const enWord = enWords[0];
    return { word: enWord.charAt(0).toUpperCase() + enWord.slice(1), ...DICTIONARY_MAP.get(enWord), source: "local" };
  }

  // Bengali to English - Special Vocabulary
  enWords = reverseSvDictionary.get(normalizedWord);
  if (enWords && enWords.length > 0) {
    const enWord = enWords[0];
    return { word: enWord.charAt(0).toUpperCase() + enWord.slice(1), ...SV_DICTIONARY_MAP.get(enWord), source: "local" };
  }
  
  return null;
}

export function getRandomWords(count: number): VocabularyResult[] {
  const allWords = Array.from(DICTIONARY_MAP.keys());
  const shuffled = allWords.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(word => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    ...DICTIONARY_MAP.get(word)
  }) as VocabularyResult);
}

export function getRandomSvWords(count: number): VocabularyResult[] {
  const allWords = Array.from(SV_DICTIONARY_MAP.keys());
  const shuffled = allWords.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count).map(word => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    ...SV_DICTIONARY_MAP.get(word)
  }) as VocabularyResult);
}

export function getLibraryWords(): VocabularyResult[] {
  return Array.from(DICTIONARY_MAP.entries()).map(([word, data]) => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    ...data
  }) as VocabularyResult);
}

export function getSvLibraryWords(): VocabularyResult[] {
  return Array.from(SV_DICTIONARY_MAP.entries()).map(([word, data]) => ({
    word: word.charAt(0).toUpperCase() + word.slice(1),
    ...data
  }) as VocabularyResult);
}

export function generateStaticQuizQuestion(pool: VocabularyResult[], targetWord?: VocabularyResult): { 
  question: string, 
  options: string[], 
  correctAnswer: string, 
  word: string,
  explanation?: string
} | null {
  // We need at least 4 words in the pool to provide 3 distractors
  if (pool.length < 4) return null;
  
  const target = targetWord || pool[Math.floor(Math.random() * pool.length)];
  if (!target.example || target.example === "-") return null;

  const correctAnswer = target.word;
  
  // Replace word in example with ____
  // Use a safer regex that handles potential special characters and ensures we match the whole word if possible
  const escapedWord = target.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const question = target.example.replace(new RegExp(`\\b${escapedWord}\\b`, 'gi'), '____');
  
  // If the simple regex failed (e.g. word was part of another word), try a more aggressive one
  const finalQuestion = question === target.example ? target.example.replace(new RegExp(escapedWord, 'gi'), '____') : question;
  
  // Generate distractors from the pool
  const distractors = new Set<string>();
  let attempts = 0;
  while (distractors.size < 3 && attempts < 50) {
    attempts++;
    const randomWord = pool[Math.floor(Math.random() * pool.length)];
    if (randomWord.word.toLowerCase() !== correctAnswer.toLowerCase()) {
      distractors.add(randomWord.word);
    }
  }

  // If we couldn't find enough distractors in the provided pool, fall back to the main dictionary
  if (distractors.size < 3) {
    const allWords = Array.from(DICTIONARY_MAP.keys());
    while (distractors.size < 3) {
      const randomWord = allWords[Math.floor(Math.random() * allWords.length)];
      if (randomWord.toLowerCase() !== correctAnswer.toLowerCase()) {
        distractors.add(randomWord.charAt(0).toUpperCase() + randomWord.slice(1));
      }
    }
  }

  const options = [correctAnswer, ...Array.from(distractors)].sort(() => Math.random() - 0.5);

  return {
    question: finalQuestion,
    options,
    correctAnswer,
    word: target.word,
    explanation: `Meaning: ${target.meaning}`
  };
}

export function generateMiniAgentQuestion(
  pool: VocabularyResult[], 
  type: 'context' | 'pos' | 'transformation' | 'relation', 
  targetWord?: VocabularyResult
): { 
  question: string, 
  options: string[], 
  correctAnswer: string, 
  word: string,
  explanation?: string,
  category: string
} | null {
  if (pool.length < 5) return null;
  
  const target = targetWord || pool[Math.floor(Math.random() * pool.length)];
  if (!target.word) return null;

  if (type === 'context') {
    // Mode A: Grammar/Usage (Context Fill)
    if (!target.example || target.example === "-") return null;
    const escapedWord = target.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const question = target.example.replace(new RegExp(`\\b${escapedWord}\\b`, 'gi'), '____');
    if (question === target.example) return null; 

    const correctAnswer = target.word;
    
    // Distractors: Same Part of Speech
    const samePosPool = pool.filter(w => 
      w.partOfSpeech === target.partOfSpeech && 
      w.word.toLowerCase() !== target.word.toLowerCase()
    );

    let distractorsList = samePosPool.map(w => w.word);
    if (distractorsList.length < 3) {
      const globalSamePos = getLibraryWords().filter(w => 
        w.partOfSpeech === target.partOfSpeech && 
        w.word.toLowerCase() !== target.word.toLowerCase()
      );
      distractorsList = [...new Set([...distractorsList, ...globalSamePos.map(w => w.word)])];
    }
    if (distractorsList.length < 3) return null;

    const shuffledDistractors = distractorsList.sort(() => 0.5 - Math.random()).slice(0, 3);
    const options = [correctAnswer, ...shuffledDistractors].sort(() => 0.5 - Math.random());

    return {
      question: `Fill in the blank: "${question}"`,
      options,
      correctAnswer,
      word: target.word,
      explanation: `"${target.word}" means "${target.meaning}".`,
      category: "grammar_usage"
    };
  } else if (type === 'pos') {
    // Mode B: POS Identification
    if (!target.example || target.example === "-" || !target.partOfSpeech) return null;
    const correctAnswer = target.partOfSpeech;
    const options = ["Noun", "Verb", "Adjective", "Adverb"];
    if (!options.includes(correctAnswer)) return null;

    return {
      question: `In the sentence: "${target.example}", what is the Part of Speech of the word "${target.word}"?`,
      options: shuffle(options),
      correctAnswer,
      word: target.word,
      category: "pos_id"
    };
  } else if (type === 'transformation') {
    // Mode C: Word Form Transformation
    const forms = target.forms;
    const availableForms = [];
    if (forms.noun) availableForms.push({ type: 'Noun', val: forms.noun });
    if (forms.verb) availableForms.push({ type: 'Verb', val: forms.verb });
    if (forms.adjective) availableForms.push({ type: 'Adjective', val: forms.adjective });
    if (forms.adverb) availableForms.push({ type: 'Adverb', val: forms.adverb });

    if (availableForms.length < 2) return null; // Need at least one transformation different from the word itself (usually word is one of them)
    
    // Pick a form that is different from the word itself to be the question
    // Actually, usually the word is the base.
    const selected = availableForms[Math.floor(Math.random() * availableForms.length)];
    const correctAnswer = selected.val;
    
    const distractors = new Set<string>();
    // Add other forms as distractors first
    availableForms.filter(f => f.val !== correctAnswer).forEach(f => distractors.add(f.val));
    
    // Fill with random words
    let attempts = 0;
    while (distractors.size < 3 && attempts < 20) {
      const rw = pool[Math.floor(Math.random() * pool.length)].word;
      if (rw !== target.word && rw !== correctAnswer) distractors.add(rw);
      attempts++;
    }

    const options = [correctAnswer, ...Array.from(distractors)].slice(0, 4).sort(() => 0.5 - Math.random());

    return {
      question: `What is the ${selected.type} form of the word "${target.word}"?`,
      options,
      correctAnswer,
      word: target.word,
      category: "transformation"
    };
  } else {
    // Mode D: Synonyms/Antonyms
    const isSynonym = Math.random() > 0.5;
    const list = isSynonym ? target.synonyms : target.antonyms;
    if (!list || list.length === 0) return null;

    const correctAnswer = list[Math.floor(Math.random() * list.length)];
    const distractors = new Set<string>();
    
    // Antonyms as distractors if question is synonym, and vice versa
    const otherList = isSynonym ? target.antonyms : target.synonyms;
    if (otherList) otherList.forEach(w => distractors.add(w));

    let attempts = 0;
    while (distractors.size < 3 && attempts < 20) {
      const rw = pool[Math.floor(Math.random() * pool.length)].word;
      if (rw !== target.word && rw !== correctAnswer) distractors.add(rw);
      attempts++;
    }

    const options = [correctAnswer, ...Array.from(distractors)].slice(0, 4).sort(() => 0.5 - Math.random());

    return {
      question: `What is a ${isSynonym ? 'synonym' : 'antonym'} of the word "${target.word}"?`,
      options,
      correctAnswer,
      word: target.word,
      category: "relation"
    };
  }
}

// Fisher-Yates shuffle helper inside the service
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
