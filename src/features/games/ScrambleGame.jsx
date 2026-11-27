// ============================================================================
// FILE 55/85: src/features/games/ScrambleGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.4 - Scramble Logic V1.14)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 18:22 (GMT+7)
// NHIỆM VỤ: Động cơ xử lý State, Trộn từ, AI Preload, Giải thích Ngữ pháp
//           và Micro thu âm cho trò chơi Ghép Câu (Scramble Game).
//           Nâng cấp Ver 1.0 (Lượt 4.3 — Diệt 2M Radar & 0 Problems tsc):
//           1. Diệt 2/2 MEDIUM Radar (R05): Thay localStorage.setItem trần
//              của fc_ai_memory & fc_total_tokens bằng AiMemoryManager +
//              Utils.safeLocalStorageSet + safeAddTotalTokens (chống NaN);
//              đọc API Key 4 tầng qua resolveActiveApiKey; gỡ window.Utils.
//           2. Diệt C4 (Xóa sạch bộ thẻ): Cập nhật bất biến toàn bộ cardsRef
//              thay vì onUpdateCards([card]); gọi đủ 7 tham số fillCardWithAi.
//           3. Diệt C5, C7, C8, S1..S6: Gỡ StrictMode Deadlock (bootTimer 50ms
//              + cancelled token); khóa hasExitedRef diệt xóa phạt thoát ngang
//              & Ghost Session; lọc deck sạch chống Crash Resume; chặn Double-
//              Submit; đúng 7 tham số ai_getNoise; đo tổng time & đồng bộ
//              dataMode + isWordLevelSplit; bỏ 'vi-VN' & dọn SpeechRecognition;
//              bỏ silentUtterance phá Khiên WAV 15s; nối speak/stopSpeaking;
//              onSaveToHarvest chuẩn 2 tham số 12 cột (chặn _isRescued).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { fillCardWithAi, explainSentenceGrammar } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { ScramblePlayScreen } from './ScrambleUI';
import {
  resolveActiveApiKey,
  getSafeLevelString,
  getConfiguredUiCooldown
} from './common/gameHelpers';

// Bảng màu viền kéo thả tĩnh chống Tailwind JIT purge (Diệt S2)
const SCRAMBLE_RING_CLASS = {
  orange: 'ring-orange-400',
  sky: 'ring-sky-400',
  red: 'ring-red-400',
  indigo: 'ring-indigo-400',
  emerald: 'ring-emerald-400',
  purple: 'ring-purple-400',
  pink: 'ring-pink-400',
  cyan: 'ring-cyan-400',
  blue: 'ring-blue-400',
  slate: 'ring-slate-400'
};

/**
 * Đọc an toàn một khóa chuỗi từ localStorage
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
const safeStorageRead = (key, fallback = '') => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const val = window.localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Chuẩn hóa khóa đối khớp thẻ theo Unicode NFC + lowercase (Diệt S5)
 * @param {any} text
 * @returns {string}
 */
const normalizeTermKey = (text) => {
  if (typeof text !== 'string') return '';
  return text.normalize('NFC').replace(/\u0332/g, '').trim().toLowerCase();
};

/**
 * Cộng dồn Token an toàn qua Utils.safeLocalStorageSet (chống NaN & R05)
 * @param {any} tokenUsage
 */
const safeAddTotalTokens = (tokenUsage) => {
  const used = Number(tokenUsage?.totalTokenCount);
  if (!Number.isFinite(used) || used <= 0) return;
  const prevRaw = parseInt(safeStorageRead('fc_total_tokens', '0'), 10);
  const prevSafe = Number.isFinite(prevRaw) && prevRaw > 0 ? prevRaw : 0;
  const nextTotal = prevSafe + Math.floor(used);
  if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_total_tokens', String(nextTotal));
  }
};

/**
 * Ghi từ vào bộ nhớ chống lặp AI an toàn (AiMemoryManager + Utils.safeLocalStorageSet)
 * @param {React.MutableRefObject<string[]>} historyRef
 * @param {string} rawTerm
 */
const recordTermToAiMemory = (historyRef, rawTerm) => {
  const cleanTerm = typeof rawTerm === 'string' ? rawTerm.trim() : '';
  if (!cleanTerm) return;
  try {
    if (AiMemoryManager && typeof AiMemoryManager.add === 'function') {
      AiMemoryManager.add(cleanTerm);
    }
  } catch {
    // Bỏ qua lỗi bộ nhớ tạm
  }
  const normKey = normalizeTermKey(cleanTerm);
  const list = Array.isArray(historyRef.current) ? [...historyRef.current] : [];
  const exists = list.some((item) => normalizeTermKey(item) === normKey);
  if (!exists) {
    list.push(cleanTerm);
    while (list.length > 400) list.shift();
    historyRef.current = list;
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_ai_memory', list);
    }
  }
};

/**
 * Đọc cấu hình đã lưu từ LocalStorage an toàn
 * @returns {Record<string, any>}
 */
const getSavedScrambleConfig = () => {
  const raw =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_scramble_config', {})
      : {};
  return raw && typeof raw === 'object' ? raw : {};
};

/**
 * Đọc timeout AI động từ fc_ai_config (mặc định 22000ms)
 * @returns {number}
 */
const getDynamicAiTimeoutMs = () => {
  const aiCfg =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_config', {})
      : {};
  const sec = Number(aiCfg?.loadingTime);
  if (Number.isFinite(sec) && sec >= 5 && sec <= 120) {
    return Math.round(sec * 1000);
  }
  return 22000;
};

/**
 * Chuẩn hóa khóa level dạng canonical cho onSaveToHarvest (en_level_X / zh_level_X)
 * @param {string} rawLevel
 * @param {'en' | 'zh'} activeLang
 * @returns {string}
 */
const toCanonicalHarvestLevelKey = (rawLevel, activeLang) => {
  const prefix = activeLang === 'zh' ? 'zh_level_' : 'en_level_';
  const fallback = activeLang === 'zh' ? 'zh_level_1' : 'en_level_4';
  const str = String(rawLevel || '').trim().toLowerCase();
  if (!str) return fallback;
  const match = str.match(/level[_\s-]*(\d+)/i) || str.match(/\b([1-9])\b/);
  if (match && match[1]) {
    return prefix + match[1];
  }
  return fallback;
};

/**
 * Chuẩn hóa topic thành chuỗi sạch từ String hoặc Array (Array Armor)
 * @param {any} rawTopic
 * @returns {string}
 */
const getSafeTopicString = (rawTopic) => {
  if (Array.isArray(rawTopic)) {
    return rawTopic
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return typeof rawTopic === 'string' ? rawTopic.trim() : '';
};

/**
 * Quyết định đồng nhất tách theo TỪ hay theo CHỮ CÁI (Diệt C11 & S4)
 * - Tiếng Trung ('zh'): luôn tách theo từng chữ Hán (false)
 * - Tiếng Anh ('en'): tách theo TỪ (true) khi dataMode === 'sentence' HOẶC
 *   chuỗi có chứa khoảng trắng; chỉ tách từng chữ cái khi là từ đơn 1 từ
 * @param {string} term
 * @param {'en' | 'zh'} activeLang
 * @param {string} mode
 * @returns {boolean}
 */
const isWordLevelSplit = (term, activeLang, mode) => {
  if (activeLang === 'zh') return false;
  if (mode === 'sentence') return true;
  const trimmed = String(term || '').trim();
  return /\s+/.test(trimmed);
};

/**
 * Làm sạch danh sách mảnh từ/chữ cái
 * @param {any[]} textArr
 * @param {'en' | 'zh'} activeLang
 * @returns {string[]}
 */
const cleanPartsArray = (textArr, activeLang) => {
  const isChinese = activeLang === 'zh';
  return (Array.isArray(textArr) ? textArr : [])
    .map((p) => {
      let cleaned = String(p ?? '').replace(
        /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,
        ''
      );
      if (!isChinese) cleaned = cleaned.toLowerCase();
      return cleaned;
    })
    .filter((p) => p.trim() !== '');
};

/**
 * Tách câu/từ gốc thành mảng mảnh sạch
 * @param {string} term
 * @param {'en' | 'zh'} activeLang
 * @param {string} mode
 * @returns {string[]}
 */
const splitTermIntoParts = (term, activeLang, mode) => {
  const trimmed = String(term || '').trim();
  if (!trimmed) return [];
  if (activeLang === 'zh') {
    return cleanPartsArray(trimmed.split(''), 'zh');
  }
  const rawArr = isWordLevelSplit(trimmed, activeLang, mode)
    ? trimmed.split(/\s+/)
    : trimmed.split('');
  return cleanPartsArray(rawArr, 'en');
};

/**
 * Chuẩn hóa đối tượng câu đố Ghép Câu (bảo đảm luôn có origin & parts hợp lệ — Diệt S3)
 * @param {any} rawTask
 * @param {'en' | 'zh'} activeLang
 * @param {string} mode
 * @param {string} method
 * @returns {{
 *   origin: Record<string, any>,
 *   parts: string[],
 *   isAiGenerated: boolean,
 *   _isRescued: boolean
 * } | null}
 */
const normalizeScrambleTask = (rawTask, activeLang, mode, method) => {
  if (!rawTask || typeof rawTask !== 'object') return null;
  const rawOrigin =
    rawTask.origin && typeof rawTask.origin === 'object'
      ? rawTask.origin
      : rawTask.term
        ? rawTask
        : null;
  const cleanTerm = String(rawOrigin?.term || '').trim();
  if (!cleanTerm) return null;

  const cleanDef = String(
    rawOrigin?.definition || rawTask.definition || rawTask.hint || ''
  ).trim();

  let parts = Array.isArray(rawTask.parts)
    ? cleanPartsArray(rawTask.parts, activeLang)
    : [];
  if (method === 'tap' && parts.length === 0) {
    parts = splitTermIntoParts(cleanTerm, activeLang, mode);
  }

  const isRescued = Boolean(rawTask._isRescued || rawOrigin?._isRescued);
  return {
    origin: {
      ...rawOrigin,
      term: cleanTerm,
      definition: cleanDef || 'Bấm Giải thích để xem phân tích chi tiết'
    },
    parts,
    isAiGenerated: Boolean(rawTask.isAiGenerated) && !isRescued,
    _isRescued: isRescued
  };
};

/**
 * Chuyển mảng parts thành các thẻ chunk xáo trộn có id duy nhất
 * @param {string[]} parts
 * @param {number} roundSeq
 * @returns {Array<{ id: string, text: string }>}
 */
const buildShuffledChunks = (parts, roundSeq) => {
  const safeParts = Array.isArray(parts) ? parts : [];
  const mapped = safeParts.map((text, idx) => ({
    id: 'chunk-' + String(roundSeq) + '-' + String(idx) + '-' + String(Date.now()),
    text: String(text)
  }));
  return Utils && typeof Utils.shuffleArray === 'function'
    ? Utils.shuffleArray(mapped)
    : mapped;
};

/**
 * Lọc danh sách thẻ gốc sạch (chặn ô nhiễm deck khi Auto-Save / Resume — Diệt C8)
 * @param {any[]} rawDeck
 * @returns {Array<Record<string, any>>}
 */
const sanitizeCardDeck = (rawDeck) => {
  if (!Array.isArray(rawDeck)) return [];
  const seen = new Set();
  /** @type {Array<Record<string, any>>} */
  const cleanList = [];

  for (let i = 0; i < rawDeck.length; i += 1) {
    const item = rawDeck[i];
    if (!item || typeof item !== 'object') continue;
    const candidate =
      item.origin && typeof item.origin === 'object' ? item.origin : item;
    if (candidate._isRescued || item._isRescued) continue;
    const term = String(candidate.term || '').trim();
    if (!term) continue;
    const norm = normalizeTermKey(term);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    cleanList.push({ ...candidate, term });
  }
  return cleanList;
};

/**
 * Trích xuất riêng thẻ gốc sạch còn tồn trong QueueCoordinator để hoàn trả vào deck
 * @param {any} coordinator
 * @returns {Array<Record<string, any>>}
 */
const extractCleanBaseCardsFromQueue = (coordinator) => {
  if (!coordinator) return [];
  const rawItems =
    typeof coordinator.getPendingItems === 'function'
      ? coordinator.getPendingItems()
      : Array.isArray(coordinator.queue)
        ? coordinator.queue
        : [];
  return sanitizeCardDeck(rawItems);
};

/**
 * Tạo dữ liệu cứu hộ tĩnh an toàn theo đúng ngôn ngữ EN/ZH
 * @param {'en' | 'zh'} activeLang
 * @param {string} levelStr
 * @param {string} difficulty
 * @param {string} inputMethod
 * @param {string} mode
 * @returns {{
 *   origin: Record<string, any>,
 *   parts: string[],
 *   isAiGenerated: boolean,
 *   _isRescued: boolean
 * }}
 */
const buildEmergencyScrambleFallback = (
  activeLang,
  levelStr,
  difficulty,
  inputMethod,
  mode
) => {
  const fromEngine =
    FallbackDataEngine &&
    typeof FallbackDataEngine.getGameReadyFallback === 'function'
      ? FallbackDataEngine.getGameReadyFallback('scramble', activeLang, levelStr, {
          difficulty,
          inputMethod,
          dataMode: mode
        })
      : null;
  const normalized = normalizeScrambleTask(
    fromEngine,
    activeLang,
    mode,
    inputMethod
  );
  if (normalized) {
    return { ...normalized, isAiGenerated: false, _isRescued: true };
  }

  const fallbackOrigin =
    activeLang === 'zh'
      ? {
          term: '我喜欢学习汉语',
          definition: 'Tôi thích học tiếng Hán',
          _isRescued: true
        }
      : {
          term: 'Learning languages is very fun',
          definition: 'Học ngôn ngữ rất thú vị',
          _isRescued: true
        };
  return {
    origin: fallbackOrigin,
    parts:
      inputMethod === 'tap'
        ? splitTermIntoParts(fallbackOrigin.term, activeLang, mode)
        : [],
    isAiGenerated: false,
    _isRescued: true
  };
};

// ============================================================================
// COMPONENT CHÍNH: SCRAMBLE GAME
// ============================================================================
/**
 * @param {{
 *   cards?: Array<Record<string, any>>,
 *   t?: (key: string) => string,
 *   onBack?: (sessionData?: any) => void,
 *   onQuit?: (sessionData?: any) => void,
 *   onEndGame?: (stats?: Record<string, any>) => void,
 *   onFinish?: (correct: number, time: number, wrong: number) => void,
 *   onPause?: () => void,
 *   mainColor?: string,
 *   lang?: string,
 *   onPlay?: (text: string, rate?: any, voice?: any, onEnd?: any) => void,
 *   speak?: (text: string, rate?: any, voice?: any, onEnd?: any) => void,
 *   stopSpeaking?: () => void,
 *   apiKey?: string,
 *   onBookmark?: (payload: Record<string, any>) => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   notebook?: Array<Record<string, any>>,
 *   isPaused?: boolean,
 *   showToast?: (msg: string, type?: string) => void,
 *   onLogWrong?: (card: Record<string, any>) => void,
 *   savedState?: Record<string, any> | null,
 *   settings?: Record<string, any>,
 *   timerMode?: boolean,
 *   timeLimit?: number,
 *   initialDifficulty?: string,
 *   onAutoSave?: (sessionData: Record<string, any>) => void,
 *   level?: any,
 *   currentLevel?: any,
 *   currentTopic?: any,
 *   dataMode?: string,
 *   onSaveToHarvest?: (levelKey: string, data: Record<string, any>) => void,
 *   config?: Record<string, any>,
 *   globalRetryBag?: Record<string, any>,
 *   addToRetryBag?: (gameType: string, data: Record<string, any>) => void,
 *   removeFromRetryBag?: (gameType: string, term: string) => void,
 *   onUpdateCards?: (cards: Array<Record<string, any>>) => void
 * }} props
 */
export const ScrambleGame = ({
  cards = [],
  t = undefined,
  onBack = undefined,
  onQuit = undefined,
  onEndGame = undefined,
  onFinish = undefined,
  onPause = undefined,
  mainColor = 'orange',
  lang = 'en',
  onPlay = undefined,
  speak = undefined,
  stopSpeaking = undefined,
  apiKey = '',
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = [],
  isPaused = false,
  showToast = undefined,
  onLogWrong = undefined,
  savedState = null,
  settings = undefined,
  timerMode = undefined,
  timeLimit = undefined,
  initialDifficulty = undefined,
  onAutoSave = undefined,
  level = undefined,
  currentLevel = undefined,
  currentTopic = undefined,
  dataMode = undefined,
  onSaveToHarvest = undefined,
  config = undefined,
  globalRetryBag = undefined,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined,
  onUpdateCards = undefined
}) => {
  /** @type {'en' | 'zh'} */
  const safeLang = lang === 'zh' ? 'zh' : 'en';
  const effectivePlay = onPlay || speak;
  const effectiveBookmark = onBookmark || onSaveToNotebook;
  const effectiveBack = onBack || onQuit;

  // Ưu tiên config truyền vào từ GameView trước initialCfg từ localStorage (Diệt C9)
  const [resolvedConfig] = useState(() => {
    const savedCfg = getSavedScrambleConfig();
    const srcMode =
      config?.sourceMode === 'ai_pure' || config?.sourceMode === 'card'
        ? config.sourceMode
        : savedCfg.sourceMode === 'ai_pure'
          ? 'ai_pure'
          : 'card';
    const rawMethod = config?.inputMethod || savedCfg.inputMethod || 'tap';
    const method =
      srcMode === 'ai_pure'
        ? 'tap'
        : rawMethod === 'type' || rawMethod === 'voice'
          ? rawMethod
          : 'tap';
    const hardFlag =
      config?.hardMode !== undefined
        ? Boolean(config.hardMode)
        : initialDifficulty === 'hard'
          ? true
          : Boolean(savedCfg.hardMode);
    const aiFlag =
      srcMode === 'card' && hardFlag && method === 'tap'
        ? config?.aiMode !== undefined
          ? Boolean(config.aiMode)
          : Boolean(savedCfg.aiMode)
        : false;
    const autoReadFlag =
      config?.autoReadAnswer !== undefined
        ? Boolean(config.autoReadAnswer)
        : Boolean(savedCfg.autoReadAnswer);
    const suddenDeathFlag =
      config?.suddenDeath !== undefined
        ? Boolean(config.suddenDeath)
        : Boolean(savedCfg.suddenDeath);
    const tModeFlag =
      config?.timerMode !== undefined
        ? Boolean(config.timerMode)
        : timerMode !== undefined
          ? Boolean(timerMode)
          : Boolean(savedCfg.timerMode);
    const parsedLimit = Number(
      config?.timeLimit ?? timeLimit ?? savedCfg.timeLimit ?? 60
    );
    const tLimit =
      Number.isFinite(parsedLimit) && parsedLimit >= 10 ? parsedLimit : 60;

    return {
      sourceMode: srcMode,
      inputMethod: method,
      hardMode: hardFlag,
      aiMode: aiFlag,
      autoReadAnswer: autoReadFlag,
      suddenDeath: suddenDeathFlag,
      timerMode: tModeFlag,
      timeLimit: tLimit
    };
  });

  const {
    sourceMode,
    inputMethod,
    aiMode: isAiMode,
    autoReadAnswer,
    suddenDeath,
    timerMode: effectiveTimerMode,
    timeLimit: effectiveTimeLimit
  } = resolvedConfig;

  const effectiveDataMode =
    config?.dataMode === 'sentence' || dataMode === 'sentence'
      ? 'sentence'
      : 'vocab';
  const effectiveLevelInput = config?.level || level || currentLevel;
  const effectiveTopicInput = config?.topic || currentTopic || '';
  const safeLevelStr = getSafeLevelString(
    effectiveLevelInput,
    safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'
  );
  const safeTopicStr = getSafeTopicString(effectiveTopicInput);

  // Toast an toàn chuẩn chữ ký (text, type) khớp globals.d.ts (Diệt C12)
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const safeShowToast = useCallback((msg, type = 'success') => {
    const text =
      typeof msg === 'string' ? msg : String(msg?.text || msg || '');
    if (!text) return;
    if (typeof showToastRef.current === 'function') {
      showToastRef.current(text, type);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.globalShowToast === 'function'
    ) {
      window.globalShowToast(text, type);
    }
  }, []);

  // Khởi tạo State thông minh từ savedState
  const [gameState, setGameState] = useState(() => {
    if (savedState?.gameState && !savedState._needsNextOnResume) {
      try {
        return JSON.parse(JSON.stringify(savedState.gameState));
      } catch {
        // Bỏ qua nếu savedState lỗi định dạng
      }
    }
    return {
      origin: null,
      chunks: [],
      userAnswer: [],
      isCorrect: null,
      attempts: 0,
      isAiGenerated: false,
      _isRescued: false
    };
  });

  const [difficulty] = useState(
    () =>
      savedState?.difficulty ||
      initialDifficulty ||
      (resolvedConfig.hardMode ? 'hard' : 'easy')
  );
  const [stats, setStats] = useState(() => ({
    correct: Number(savedState?.stats?.correct) || 0,
    wrong: Number(savedState?.stats?.wrong) || 0
  }));
  // Bộ đếm tổng thời gian chơi cho màn Tổng kết (Diệt S4)
  const [time, setTime] = useState(() => Number(savedState?.time) || 0);
  const [inputBuffer, setInputBuffer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showExplainModal, setShowExplainModal] = useState(false);
  const [aiExplanation, setAiExplanation] = useState(
    /** @type {string | null} */ (null)
  );
  const [isAiExplaining, setIsAiExplaining] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedTL = Number(savedState?.timeLeft);
    return Number.isFinite(savedTL) && savedTL > 0
      ? savedTL
      : effectiveTimeLimit;
  });
  const [isGenerating, setIsGenerating] = useState(() => {
    if (savedState?.gameState?.origin && !savedState._needsNextOnResume) {
      return false;
    }
    return true;
  });

  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedState?.aiWaitTime !== undefined ? Number(savedState.aiWaitTime) || 0 : 0
  );

  // Refs quản lý vòng đời, chống StrictMode Deadlock & Ghost Session
  const cardsRef = useRef(Array.isArray(cards) ? cards : []);
  const deckRef = useRef(
    sourceMode === 'card' ? sanitizeCardDeck(savedState?.deck || []) : []
  );
  const historyQueueRef = useRef(
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_memory', [])
      : []
  );
  /** @type {React.MutableRefObject<any>} */
  const coordinatorRef = useRef(null);
  /** @type {React.MutableRefObject<number | null>} */
  const dragItemRef = useRef(null);
  /** @type {React.MutableRefObject<number | null>} */
  const dragOverItemRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const timerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const retryResetTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const saveDebounceTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const focusTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  /** @type {React.MutableRefObject<HTMLElement | null>} */
  const activeDragElementRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const recognitionRef = useRef(null);
  /** @type {React.MutableRefObject<HTMLInputElement | null>} */
  const typeInputRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const silenceTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const hardTimerRef = useRef(null);
  const roundSeqRef = useRef(1);
  const explainRunIdRef = useRef(0);
  const latestStateRef = useRef(/** @type {Record<string, any>} */ ({}));
  const isGameActiveRef = useRef(true);
  const hasExitedRef = useRef(false);
  const globalRetryBagRef = useRef(globalRetryBag);
  const onUpdateCardsRef = useRef(onUpdateCards);
  const onSaveToHarvestRef = useRef(onSaveToHarvest);
  const onAutoSaveRef = useRef(onAutoSave);
  const onEndGameRef = useRef(onEndGame);
  const onFinishRef = useRef(onFinish);
  const stopSpeakingRef = useRef(stopSpeaking);

  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  useEffect(() => {
    cardsRef.current = Array.isArray(cards) ? cards : [];
  }, [cards]);

  useEffect(() => {
    onUpdateCardsRef.current = onUpdateCards;
    onSaveToHarvestRef.current = onSaveToHarvest;
    onAutoSaveRef.current = onAutoSave;
    onEndGameRef.current = onEndGame;
    onFinishRef.current = onFinish;
    stopSpeakingRef.current = stopSpeaking;
  }, [
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onEndGame,
    onFinish,
    stopSpeaking
  ]);

  useEffect(() => {
    latestStateRef.current = {
      gameState,
      difficulty,
      stats,
      time,
      timeLeft,
      deck: deckRef.current,
      aiWaitTime
    };
  }, [gameState, difficulty, stats, time, timeLeft, aiWaitTime]);

  // ============================================================================
  // DỌN SẠCH MICRO & SPEECH RECOGNITION AN TOÀN (Diệt C6)
  // ============================================================================
  const stopRecognitionSafely = useCallback((shouldAbort = true) => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (hardTimerRef.current) {
      clearTimeout(hardTimerRef.current);
      hardTimerRef.current = null;
    }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.onstart = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        if (shouldAbort && typeof rec.abort === 'function') {
          rec.abort();
        } else if (typeof rec.stop === 'function') {
          rec.stop();
        }
      } catch {
        // Bỏ qua lỗi trạng thái SpeechRecognition đã dừng
      }
    }
    setIsListening(false);
  }, []);

  // ============================================================================
  // HÀM TRIGGER AUTO SAVE (KHÓA hasExitedRef DIỆT GHOST SESSION — C7)
  // ============================================================================
  const triggerAutoSave = useCallback(() => {
    if (
      hasExitedRef.current ||
      !isGameActiveRef.current ||
      typeof onAutoSaveRef.current !== 'function' ||
      !latestStateRef.current?.gameState?.origin
    ) {
      return;
    }
    const currentData = latestStateRef.current;
    const mergedDeck =
      sourceMode === 'card'
        ? sanitizeCardDeck([
            ...extractCleanBaseCardsFromQueue(coordinatorRef.current),
            ...(Array.isArray(currentData.deck) ? currentData.deck : [])
          ])
        : [];

    onAutoSaveRef.current({
      gameState: currentData.gameState,
      stats: currentData.stats,
      time: currentData.time || 0,
      difficulty: currentData.difficulty,
      deck: mergedDeck,
      timeLeft: currentData.timeLeft,
      aiWaitTime: currentData.aiWaitTime
    });
  }, [sourceMode]);

  const scheduleAutoSave = useCallback(() => {
    if (saveDebounceTimerRef.current) {
      clearTimeout(saveDebounceTimerRef.current);
    }
    saveDebounceTimerRef.current = setTimeout(() => {
      saveDebounceTimerRef.current = null;
      triggerAutoSave();
    }, 150);
  }, [triggerAutoSave]);

  // Kết thúc ván chơi tập trung (khóa hasExitedRef & truyền đủ time — Diệt C7 & S4)
  const handleEndGameInternal = useCallback(
    (overrideStats = null) => {
      if (hasExitedRef.current) return;
      hasExitedRef.current = true;
      isGameActiveRef.current = false;
      explainRunIdRef.current += 1;
      stopRecognitionSafely(true);
      if (typeof stopSpeakingRef.current === 'function') {
        stopSpeakingRef.current();
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }

      const finalCorrect = Number(
        overrideStats?.correct ?? latestStateRef.current?.stats?.correct ?? 0
      );
      const finalWrong = Number(
        overrideStats?.wrong ?? latestStateRef.current?.stats?.wrong ?? 0
      );
      const finalTime = Number(
        overrideStats?.time ?? latestStateRef.current?.time ?? 0
      );

      if (typeof onFinishRef.current === 'function') {
        onFinishRef.current(finalCorrect, finalTime, finalWrong);
      } else if (typeof onEndGameRef.current === 'function') {
        onEndGameRef.current({
          correct: finalCorrect,
          wrong: finalWrong,
          time: finalTime
        });
      }
    },
    [stopRecognitionSafely]
  );

  // ============================================================================
  // BỘ ĐẾM TỔNG THỜI GIAN CHƠI, QUÉT ĐẠN NGẦM & PHANH AI
  // ============================================================================
  useEffect(() => {
    if (isPaused || isGenerating || !gameState.origin) return undefined;
    const clock = setInterval(() => {
      setTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(clock);
  }, [isPaused, isGenerating, gameState.origin]);

  useEffect(() => {
    const queueScanner = setInterval(() => {
      const coord = coordinatorRef.current;
      if (!coord) {
        setQueueLength(0);
        return;
      }
      if (typeof coord.getPendingItems === 'function') {
        const items = coord.getPendingItems();
        const validCount = Array.isArray(items)
          ? items.filter((item) => item && !item._isRescued).length
          : 0;
        setQueueLength(validCount);
      } else if (typeof coord.length === 'function') {
        setQueueLength(coord.length());
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  useEffect(() => {
    if (aiWaitTime <= 0 || isPaused || isGenerating || isResultPaused) {
      return undefined;
    }
    const cdTimer = setTimeout(() => {
      setAiWaitTime((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(cdTimer);
  }, [aiWaitTime, isPaused, isGenerating, isResultPaused]);

  // ============================================================================
  // BỘ NÃO TÚI NHÁP TOÀN CỤC & LOG LỖI SAI
  // ============================================================================
  const localPushToRetryBag = useCallback(
    (questionOrigin) => {
      if (typeof addToRetryBag === 'function' && questionOrigin) {
        addToRetryBag('scramble', questionOrigin);
      }
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (typeof removeFromRetryBag === 'function' && termToCheck) {
        removeFromRetryBag('scramble', termToCheck);
      }
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (questionOrigin) => {
      if (typeof onLogWrong !== 'function' || !questionOrigin) return;
      const mistakeCard = {
        ...questionOrigin,
        id:
          'mistake_' +
          String(Date.now()) +
          '_' +
          Math.random().toString(36).substring(2, 11),
        type: 'mistake',
        tags: ['scramble', difficulty, sourceMode],
        timestamp: Date.now()
      };
      onLogWrong(mistakeCard);
    },
    [onLogWrong, difficulty, sourceMode]
  );

  // ============================================================================
  // TÌM NẠP DỮ LIỆU ĐƯỜNG ỐNG THỐNG NHẤT (FETCH TASK)
  // ============================================================================
  const fetchTask = useCallback(async () => {
    /** @type {Record<string, any> | null} */
    let card = null;
    let isAiGenerated = false;
    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey = resolveActiveApiKey(apiKey);
    const canonicalHarvestLevel = toCanonicalHarvestLevelKey(
      safeLevelStr,
      safeLang
    );

    // 1. Ưu tiên 30% rút từ Túi nháp lỗi sai (Atomic Lock)
    if (typeof pullRetryCardWithLock === 'function') {
      const pulled = pullRetryCardWithLock(
        'scramble',
        globalRetryBagRef.current,
        safeLang
      );
      if (pulled && typeof pulled === 'object') {
        const candidateOrigin =
          pulled.origin && typeof pulled.origin === 'object'
            ? pulled.origin
            : pulled;
        if (String(candidateOrigin?.term || '').trim()) {
          card = candidateOrigin;
        }
      }
    }

    // 2. Nhánh AI Pure Mode (Diệt S3: hậu kiểm + ghi memory + chặn _isRescued)
    if (!card && isPureMode && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: 'scramble_' + String(Date.now()),
          type: 'ioe_scramble',
          level: safeLevelStr,
          topic: safeTopicStr,
          dataMode: effectiveDataMode,
          difficulty,
          hardMode: difficulty === 'hard',
          mode: 'minigame',
          inputMethod,
          lang: safeLang
        };
        const freshHistory =
          Utils && typeof Utils.safeJsonParse === 'function'
            ? Utils.safeJsonParse('fc_ai_memory', [])
            : [];
        const qData = await ExamEngine.hydrateQuestion(
          meta,
          currentApiKey,
          freshHistory
        );
        const normalized = normalizeScrambleTask(
          qData?.content,
          safeLang,
          effectiveDataMode,
          inputMethod
        );
        if (normalized) {
          recordTermToAiMemory(historyQueueRef, normalized.origin.term);
          if (
            !normalized._isRescued &&
            typeof onSaveToHarvestRef.current === 'function'
          ) {
            onSaveToHarvestRef.current(canonicalHarvestLevel, {
              term: normalized.origin.term,
              definition: normalized.origin.definition,
              displaySentence: normalized.origin.term,
              targetWord: normalized.origin.term,
              hint: normalized.origin.definition,
              partOfSpeech:
                effectiveDataMode === 'sentence' ? 'Sentence' : 'Vocab',
              topic: safeTopicStr,
              level: canonicalHarvestLevel,
              language: safeLang,
              gameType: 'scramble'
            });
          }
          return normalized;
        }
      } catch (e) {
        console.warn('PureMode Engine Fallback:', e);
        if (
          typeof window !== 'undefined' &&
          typeof window.logSystemEvent === 'function'
        ) {
          window.logSystemEvent('Lỗi API/Parse Lò đúc Scramble AI', e);
        }
      }
    }

    // 3. Nhánh rút từ Bộ thẻ cá nhân (Card Mode)
    if (!card) {
      if (deckRef.current.length === 0 && !isPureMode) {
        let validCards = sanitizeCardDeck(cardsRef.current || []);
        if (validCards.length < 2 && FallbackDataEngine?.getFallbackData) {
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            effectiveDataMode,
            safeLevelStr,
            20
          );
          if (Array.isArray(fbItems) && fbItems.length > 0) {
            const existingKeys = new Set(
              validCards.map((c) => normalizeTermKey(c.term))
            );
            const newFbs = fbItems.filter(
              (f) => f?.term && !existingKeys.has(normalizeTermKey(f.term))
            );
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length === 0) {
          validCards = [
            safeLang === 'zh'
              ? { term: '我喜欢学习汉语', definition: 'Tôi thích học tiếng Hán' }
              : {
                  term: 'Learning languages is fun',
                  definition: 'Học ngôn ngữ rất vui'
                }
          ];
        }
        deckRef.current =
          Utils && typeof Utils.shuffleArray === 'function'
            ? Utils.shuffleArray(validCards)
            : validCards;
      }

      card = deckRef.current.shift() || null;

      // Dịch nghĩa ngầm (JIT Enrich) — Diệt C4: đủ 7 tham số & cập nhật bất biến toàn bộ cardsRef
      if (card && (!card.definition || String(card.definition).trim() === '')) {
        if (isAiMode && currentApiKey && typeof fillCardWithAi === 'function') {
          try {
            const existingData = {
              term: card.term,
              definition: card.definition || '',
              pronunciation: card.pronunciation || '',
              example: card.example || '',
              partOfSpeech: card.partOfSpeech || '',
              topic: card.topic || '',
              image: card.image || '',
              analysis: card.analysis || ''
            };
            const enriched = await fillCardWithAi(
              card.term,
              safeLang,
              currentApiKey,
              ['definition', 'pronunciation', 'grammar_type'],
              effectiveDataMode,
              [safeLevelStr],
              existingData
            );
            if (enriched && typeof enriched === 'object') {
              /** @type {Record<string, any>} */
              const mergedCard = { ...card, ...enriched, is_enriched: true };
              card = mergedCard;

              if (enriched._tokenUsage) {
                safeAddTotalTokens(enriched._tokenUsage);
              }

              // Cập nhật bất biến trên TOÀN BỘ danh sách thẻ thay vì onUpdateCards([card])!
              const currentAllCards = Array.isArray(cardsRef.current)
                ? cardsRef.current
                : [];
              if (
                currentAllCards.length > 0 &&
                typeof onUpdateCardsRef.current === 'function'
              ) {
                const targetNorm = normalizeTermKey(mergedCard.term);
                let didReplace = false;
                const nextAllCards = currentAllCards.map((item) => {
                  const sameId =
                    mergedCard.id !== undefined &&
                    item?.id !== undefined &&
                    item.id === mergedCard.id;
                  const sameTerm =
                    normalizeTermKey(item?.term) === targetNorm;
                  if (!didReplace && (sameId || sameTerm)) {
                    didReplace = true;
                    return { ...item, ...enriched, is_enriched: true };
                  }
                  return item;
                });
                if (didReplace) {
                  cardsRef.current = nextAllCards;
                  onUpdateCardsRef.current(nextAllCards);
                }
              }
            }
          } catch {
            card = { ...card, definition: 'Không thể tải nghĩa (Lỗi AI)' };
          }
        } else {
          card = {
            ...card,
            definition: 'Bấm Giải thích để tra nghĩa bằng AI'
          };
        }
      }

      if (card?.term) {
        recordTermToAiMemory(historyQueueRef, card.term);
      }
    }

    // 4. Cứu hộ tĩnh nếu vẫn chưa có thẻ
    if (!card) {
      return buildEmergencyScrambleFallback(
        safeLang,
        safeLevelStr,
        difficulty,
        inputMethod,
        effectiveDataMode
      );
    }

    // 5. Tách mảnh từ/chữ và trộn nhiễu cho phương thức Chạm thẻ ('tap')
    /** @type {string[]} */
    let parts = [];
    if (inputMethod === 'tap') {
      const wordLevel = isWordLevelSplit(card.term, safeLang, effectiveDataMode);
      const type = wordLevel ? 'sentence' : 'word';
      parts = splitTermIntoParts(card.term, safeLang, effectiveDataMode);

      if (difficulty === 'hard') {
        let targetCount = 2;
        const len = parts.length;
        if (len >= 5 && len <= 10) {
          targetCount = Math.floor(Math.random() * 2) + 4;
        } else if (len > 10) {
          targetCount = Math.floor(Math.random() * 3) + 5;
        }

        /** @type {any[]} */
        let noiseWords = [];
        if (
          isAiMode &&
          currentApiKey &&
          GameAlgoEngine?.ScrambleNoiseEngine?.ai_getNoise
        ) {
          /** @type {any} */
          let timeoutId = null;
          try {
            // Đúng 7 tham số theo gameAiEngine.js Ver 1.1 (Diệt S3 ts(2554))
            const aiCallPromise =
              GameAlgoEngine.ScrambleNoiseEngine.ai_getNoise(
                card.term,
                safeLang,
                type,
                currentApiKey,
                targetCount,
                safeLevelStr,
                safeTopicStr
              );
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new Error('AI Timeout')),
                getDynamicAiTimeoutMs()
              );
            });
            const aiResult = await Promise.race([aiCallPromise, timeoutPromise]);
            if (Array.isArray(aiResult) && aiResult.length > 0) {
              noiseWords = aiResult;
              isAiGenerated = true;
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e || '');
            console.warn('AI Scramble Distractor fallback:', errMsg);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }

        if (
          (!noiseWords || noiseWords.length === 0) &&
          GameAlgoEngine?.ScrambleNoiseEngine?.offline_getNoise
        ) {
          const cleanDeck = sanitizeCardDeck(cardsRef.current || []).filter(
            (c) => String(c.definition || '').trim() !== ''
          );
          const offNoise = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(
            card.term,
            cleanDeck,
            safeLang,
            type,
            targetCount
          );
          if (Array.isArray(offNoise)) {
            noiseWords = offNoise;
          }
        }

        if (Array.isArray(noiseWords) && noiseWords.length > 0) {
          /** @type {string[]} */
          let finalNoiseWords = [];
          if (safeLang === 'zh' || type === 'word') {
            noiseWords.forEach((w) => {
              const cleanW = String(w ?? '').replace(/\s/g, '');
              if (cleanW) finalNoiseWords.push(...cleanW.split(''));
            });
          } else {
            finalNoiseWords = noiseWords.map((w) => String(w ?? ''));
          }
          finalNoiseWords = cleanPartsArray(finalNoiseWords, safeLang);
          if (Utils && typeof Utils.shuffleArray === 'function') {
            finalNoiseWords = Utils.shuffleArray(finalNoiseWords);
          }
          parts.push(...finalNoiseWords.slice(0, targetCount));
        }
      }
    }

    return {
      origin: card,
      parts,
      isAiGenerated,
      _isRescued: Boolean(card._isRescued)
    };
  }, [
    apiKey,
    difficulty,
    effectiveDataMode,
    inputMethod,
    isAiMode,
    safeLang,
    safeLevelStr,
    safeTopicStr,
    sourceMode
  ]);

  // Helper nạp dữ liệu vòng chơi vào state
  const applyRoundData = useCallback(
    (rawTask) => {
      const normalized = normalizeScrambleTask(
        rawTask,
        safeLang,
        effectiveDataMode,
        inputMethod
      );
      if (!normalized) return false;
      roundSeqRef.current += 1;
      const finalChunks =
        inputMethod === 'tap'
          ? buildShuffledChunks(normalized.parts, roundSeqRef.current)
          : [];
      setGameState({
        origin: normalized.origin,
        chunks: finalChunks,
        userAnswer: [],
        isCorrect: null,
        attempts: 0,
        isAiGenerated: normalized.isAiGenerated,
        _isRescued: normalized._isRescued
      });
      setIsGenerating(false);
      setTimeLeft(effectiveTimeLimit);
      const currentCooldown =
        sourceMode === 'ai_pure' || isAiMode ? getConfiguredUiCooldown(9) : 0;
      setAiWaitTime(currentCooldown);
      return true;
    },
    [
      effectiveDataMode,
      effectiveTimeLimit,
      inputMethod,
      isAiMode,
      safeLang,
      sourceMode
    ]
  );

  // ============================================================================
  // KHỞI TẠO & PHỤC HỒI PHIÊN CHƠI (CHUẨN REACT 18 STRICTMODE — Diệt C5)
  // ============================================================================
  const startNewGame = useCallback(
    async (isCancelledFn) => {
      if (isCancelledFn()) return;
      setIsGenerating(true);
      setStats({ correct: 0, wrong: 0 });
      setTime(0);

      if (sourceMode === 'card') {
        let validCards = sanitizeCardDeck(cardsRef.current || []);
        if (validCards.length < 2) {
          safeShowToast(
            'Bộ thẻ không đủ 2 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
            'warning'
          );
          if (FallbackDataEngine?.getFallbackData) {
            const fbItems = FallbackDataEngine.getFallbackData(
              safeLang,
              effectiveDataMode,
              safeLevelStr,
              20
            );
            if (Array.isArray(fbItems) && fbItems.length > 0) {
              const existingKeys = new Set(
                validCards.map((c) => normalizeTermKey(c.term))
              );
              const newFbs = fbItems.filter(
                (f) => f?.term && !existingKeys.has(normalizeTermKey(f.term))
              );
              validCards = [...validCards, ...newFbs];
            }
          }
          if (validCards.length < 2) {
            const defaults =
              safeLang === 'zh'
                ? [
                    { term: '我喜欢学习汉语', definition: 'Tôi thích học tiếng Hán' },
                    { term: '今天天气很好', definition: 'Thời tiết hôm nay rất đẹp' }
                  ]
                : [
                    { term: 'Apple', definition: 'Quả táo' },
                    { term: 'Banana', definition: 'Quả chuối' }
                  ];
            const existingKeys = new Set(
              validCards.map((c) => normalizeTermKey(c.term))
            );
            validCards = [
              ...validCards,
              ...defaults.filter(
                (d) => !existingKeys.has(normalizeTermKey(d.term))
              )
            ];
          }
        }
        deckRef.current =
          Utils && typeof Utils.shuffleArray === 'function'
            ? Utils.shuffleArray(validCards)
            : validCards;
      } else {
        deckRef.current = [];
      }

      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
      if (!QueueEngine?.createQueueCoordinator) {
        if (!isCancelledFn()) {
          applyRoundData(
            buildEmergencyScrambleFallback(
              safeLang,
              safeLevelStr,
              difficulty,
              inputMethod,
              effectiveDataMode
            )
          );
        }
        return;
      }

      const coord = QueueEngine.createQueueCoordinator(fetchTask, 4);
      coordinatorRef.current = coord;

      const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
      try {
        await coord.maintain(true, getDynamicAiTimeoutMs(), isOfflineFastTrack);
      } catch (err) {
        console.warn('Scramble initial maintain failed:', err);
      }

      if (isCancelledFn() || !isGameActiveRef.current) return;

      let firstData = coord.pop();
      if (!firstData) {
        safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
        firstData = buildEmergencyScrambleFallback(
          safeLang,
          safeLevelStr,
          difficulty,
          inputMethod,
          effectiveDataMode
        );
      }

      if (applyRoundData(firstData)) {
        scheduleAutoSave();
      } else {
        safeShowToast('Lỗi tải dữ liệu ban đầu. Buộc kết thúc.', 'error');
        setIsGenerating(false);
        handleEndGameInternal({ correct: 0, wrong: 0, time: 0 });
      }
    },
    [
      applyRoundData,
      difficulty,
      effectiveDataMode,
      fetchTask,
      handleEndGameInternal,
      inputMethod,
      isAiMode,
      safeLang,
      safeLevelStr,
      safeShowToast,
      scheduleAutoSave,
      sourceMode
    ]
  );

  // Mount / StrictMode Lifecycle Effect (Đặt trước Auto-Save effect — Diệt C5 & C7)
  useEffect(() => {
    let cancelled = false;
    isGameActiveRef.current = true;
    hasExitedRef.current = false;

    const bootTimer = setTimeout(() => {
      if (cancelled) return;

      if (savedState && savedState.gameState) {
        if (coordinatorRef.current) {
          coordinatorRef.current.destroy();
          coordinatorRef.current = null;
        }
        if (QueueEngine?.createQueueCoordinator) {
          const coord = QueueEngine.createQueueCoordinator(fetchTask, 4);
          coordinatorRef.current = coord;
          const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;

          if (savedState._needsNextOnResume) {
            coord
              .maintain(false, getDynamicAiTimeoutMs(), isOfflineFastTrack)
              .catch((err) => {
                console.warn('Scramble resume maintain failed:', err);
              })
              .finally(() => {
                if (cancelled || !isGameActiveRef.current) return;
                let data = coord.pop();
                if (!data) {
                  data = buildEmergencyScrambleFallback(
                    safeLang,
                    safeLevelStr,
                    difficulty,
                    inputMethod,
                    effectiveDataMode
                  );
                }
                if (!applyRoundData(data)) {
                  setIsGenerating(false);
                  handleEndGameInternal({
                    correct: Number(savedState?.stats?.correct) || 0,
                    wrong: Number(savedState?.stats?.wrong) || 0,
                    time: Number(savedState?.time) || 0
                  });
                }
              });
          } else {
            coord
              .maintain(false, getDynamicAiTimeoutMs(), isOfflineFastTrack)
              .catch(() => {});
          }
        }
      } else {
        startNewGame(() => cancelled);
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      triggerAutoSave();
      isGameActiveRef.current = false;
      explainRunIdRef.current += 1;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      stopRecognitionSafely(true);
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
    };
    // Chỉ chạy theo vòng đời mount của phiên chơi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save định kỳ 5s (độc lập, không tranh chấp unmount)
  useEffect(() => {
    const intervalTimer = setInterval(() => {
      triggerAutoSave();
    }, 5000);
    return () => clearInterval(intervalTimer);
  }, [triggerAutoSave]);

  // ============================================================================
  // CHUYỂN VÒNG & XỬ LÝ BỎ QUA / ĐẾM NGƯỢC
  // ============================================================================
  const proceedToNext = useCallback(
    (defaultDelayMs) => {
      if (!isGameActiveRef.current) return;
      let delaySec = Math.ceil(defaultDelayMs / 1000);
      if (aiWaitTime > delaySec) {
        delaySec = aiWaitTime;
      }
      if (delaySec < 1) delaySec = 1;
      setResultTimer(delaySec);
    },
    [aiWaitTime]
  );

  const handleSkip = useCallback(
    (isTimeout = false) => {
      if (isGenerating || isPaused || gameState.isCorrect !== null) return;
      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }
      stopRecognitionSafely(true);
      localPushToRetryBag(gameState.origin);
      setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
      setGameState((prev) => ({ ...prev, isCorrect: false, attempts: 3 }));

      if (isTimeout) safeShowToast('Hết giờ! (+1 Sai)', 'error');
      else safeShowToast('Đã bỏ qua (+1 Sai)', 'error');

      logMistake(gameState.origin);
      proceedToNext(5000);
      if (typeof effectivePlay === 'function' && gameState.origin?.term) {
        effectivePlay(gameState.origin.term);
      }
      scheduleAutoSave();
    },
    [
      effectivePlay,
      gameState.isCorrect,
      gameState.origin,
      isGenerating,
      isPaused,
      localPushToRetryBag,
      logMistake,
      proceedToNext,
      safeShowToast,
      scheduleAutoSave,
      stopRecognitionSafely
    ]
  );

  // Đồng hồ đếm ngược thời gian mỗi câu
  useEffect(() => {
    if (
      !effectiveTimerMode ||
      isPaused ||
      gameState.isCorrect !== null ||
      isGenerating ||
      !gameState.origin
    ) {
      return undefined;
    }
    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      timerRef.current = setTimeout(() => handleSkip(true), 0);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    timeLeft,
    isPaused,
    effectiveTimerMode,
    gameState.isCorrect,
    gameState.origin,
    isGenerating,
    handleSkip
  ]);

  // Dừng ghi âm khi Tạm dừng game
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (isListening) {
        stopRecognitionSafely(false);
      }
    }
  }, [isPaused, isListening, stopRecognitionSafely]);

  const nextRound = useCallback(() => {
    if (isGenerating || !isGameActiveRef.current) return;
    setResultTimer(0);
    setIsResultPaused(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    explainRunIdRef.current += 1;
    setInputBuffer('');
    setShowExplainModal(false);
    setAiExplanation(null);
    setIsAiExplaining(false);
    stopRecognitionSafely(true);
    setTimeLeft(effectiveTimeLimit);

    if (inputMethod === 'type') {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        typeInputRef.current?.focus();
      }, 100);
    }

    const coord = coordinatorRef.current;
    if (coord && typeof coord.length === 'function' && coord.length() > 0) {
      const nextData = coord.pop();
      if (applyRoundData(nextData)) {
        scheduleAutoSave();
        return;
      }
    }

    setIsGenerating(true);
    const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
    const activeCoord =
      coord ||
      (QueueEngine?.createQueueCoordinator
        ? (coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            4
          ))
        : null);

    if (!activeCoord) {
      applyRoundData(
        buildEmergencyScrambleFallback(
          safeLang,
          safeLevelStr,
          difficulty,
          inputMethod,
          effectiveDataMode
        )
      );
      scheduleAutoSave();
      return;
    }

    activeCoord
      .maintain(false, getDynamicAiTimeoutMs(), isOfflineFastTrack)
      .catch((err) => {
        console.warn('Scramble nextRound maintain failed:', err);
      })
      .finally(() => {
        if (!isGameActiveRef.current) return;
        let data = activeCoord.pop();
        if (!data) {
          data = buildEmergencyScrambleFallback(
            safeLang,
            safeLevelStr,
            difficulty,
            inputMethod,
            effectiveDataMode
          );
        }
        if (applyRoundData(data)) {
          scheduleAutoSave();
        } else {
          safeShowToast('Lỗi tải vòng mới. Buộc kết thúc.', 'error');
          setIsGenerating(false);
          handleEndGameInternal();
        }
      });
  }, [
    applyRoundData,
    difficulty,
    effectiveDataMode,
    effectiveTimeLimit,
    fetchTask,
    handleEndGameInternal,
    inputMethod,
    isAiMode,
    isGenerating,
    safeLang,
    safeLevelStr,
    safeShowToast,
    scheduleAutoSave,
    sourceMode,
    stopRecognitionSafely
  ]);

  // Đồng hồ tự động chuyển câu sau khi trả lời xong (tạm dừng chuẩn khi isPaused — Diệt S6)
  useEffect(() => {
    const isDone =
      gameState.isCorrect === true ||
      (gameState.isCorrect === false && (Number(gameState.attempts) || 0) >= 3);
    if (!isDone || isPaused || isResultPaused || isGenerating) {
      return undefined;
    }
    if (resultTimer > 0) {
      const id = setTimeout(() => {
        setResultTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => nextRound(), 0);
    return () => clearTimeout(id);
  }, [
    gameState.isCorrect,
    gameState.attempts,
    resultTimer,
    isPaused,
    isResultPaused,
    isGenerating,
    nextRound
  ]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((p) => !p);
  }, []);

  // Thoát về Menu kèm phạt thoát ngang (khóa hasExitedRef trước onBack — Diệt C7)
  const handleSaveAndBack = useCallback(() => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    isGameActiveRef.current = false;
    explainRunIdRef.current += 1;
    stopRecognitionSafely(true);
    if (typeof stopSpeakingRef.current === 'function') {
      stopSpeakingRef.current();
    }

    const currentData = latestStateRef.current;
    // Nếu bấm Hủy khi đang tải câu đầu tiên (chưa có origin) -> thoát sạch không phạt
    if (!currentData?.gameState?.origin) {
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
      if (typeof effectiveBack === 'function') effectiveBack(null);
      return;
    }

    const finalStats = {
      correct: Number(currentData.stats?.correct) || 0,
      wrong: Number(currentData.stats?.wrong) || 0
    };
    let needsNext = false;

    if (currentData.gameState.isCorrect === null) {
      localPushToRetryBag(currentData.gameState.origin);
      logMistake(currentData.gameState.origin);
      finalStats.wrong += 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const mergedDeck =
      sourceMode === 'card'
        ? sanitizeCardDeck([
            ...extractCleanBaseCardsFromQueue(coordinatorRef.current),
            ...(Array.isArray(currentData.deck) ? currentData.deck : [])
          ])
        : [];

    if (coordinatorRef.current) {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    const sessionData = JSON.parse(
      JSON.stringify({
        gameState: currentData.gameState,
        stats: finalStats,
        time: currentData.time || 0,
        difficulty: currentData.difficulty,
        deck: mergedDeck,
        timeLeft: currentData.timeLeft,
        aiWaitTime: currentData.aiWaitTime,
        _needsNextOnResume: needsNext
      })
    );
    if (typeof effectiveBack === 'function') effectiveBack(sessionData);
  }, [
    effectiveBack,
    localPushToRetryBag,
    logMistake,
    safeShowToast,
    sourceMode,
    stopRecognitionSafely
  ]);

  // ============================================================================
  // CHỌN / GỠ THẺ TỪ (TÁCH SIDE-EFFECT RA KHỎI STATE UPDATER — Diệt C2)
  // ============================================================================
  const handlePickChunk = useCallback(
    (chunk) => {
      if (
        !chunk ||
        isPaused ||
        isGenerating ||
        gameState.isCorrect !== null
      ) {
        return;
      }
      setGameState((prev) => {
        if (prev.isCorrect !== null) return prev;
        return {
          ...prev,
          userAnswer: [...(Array.isArray(prev.userAnswer) ? prev.userAnswer : []), chunk],
          chunks: (Array.isArray(prev.chunks) ? prev.chunks : []).filter(
            (c) => c.id !== chunk.id
          )
        };
      });
      scheduleAutoSave();
    },
    [gameState.isCorrect, isGenerating, isPaused, scheduleAutoSave]
  );

  const handleUnpickChunk = useCallback(
    (chunk) => {
      if (
        !chunk ||
        isPaused ||
        isGenerating ||
        gameState.isCorrect !== null
      ) {
        return;
      }
      setGameState((prev) => {
        if (prev.isCorrect !== null) return prev;
        return {
          ...prev,
          userAnswer: (Array.isArray(prev.userAnswer) ? prev.userAnswer : []).filter(
            (c) => c.id !== chunk.id
          ),
          chunks: chunk.isPunct
            ? Array.isArray(prev.chunks)
              ? prev.chunks
              : []
            : [...(Array.isArray(prev.chunks) ? prev.chunks : []), chunk]
        };
      });
      scheduleAutoSave();
    },
    [gameState.isCorrect, isGenerating, isPaused, scheduleAutoSave]
  );

  // ============================================================================
  // ĐỘNG CƠ KIỂM TRA ĐÁP ÁN (ĐA PHƯƠNG THỨC & CHỐNG DOUBLE-SUBMIT — Diệt S1)
  // ============================================================================
  const checkAnswer = useCallback(() => {
    if (
      !gameState.origin ||
      isPaused ||
      isGenerating ||
      gameState.isCorrect !== null
    ) {
      return;
    }

    stopRecognitionSafely(true);

    let isCorrect = false;
    const normFn =
      Utils && typeof Utils.advancedNormalize === 'function'
        ? Utils.advancedNormalize
        : (s) => normalizeTermKey(s);

    if (inputMethod === 'type' || inputMethod === 'voice') {
      isCorrect =
        normFn(inputBuffer, safeLang) ===
        normFn(gameState.origin.term, safeLang);
    } else if (inputMethod === 'tap') {
      const wordLevel = isWordLevelSplit(
        gameState.origin.term,
        safeLang,
        effectiveDataMode
      );
      const separator = wordLevel ? ' ' : '';
      const userString = (Array.isArray(gameState.userAnswer)
        ? gameState.userAnswer
        : []
      )
        .map((c) => c.text)
        .join(separator);
      isCorrect =
        normFn(userString, safeLang) ===
        normFn(gameState.origin.term, safeLang);
    }

    if (isCorrect) {
      if ((Number(gameState.attempts) || 0) === 0) {
        localRemoveFromRetryBag(gameState.origin.term);
      }
      setGameState((prev) => ({ ...prev, isCorrect: true }));
      setStats((s) => ({ ...s, correct: s.correct + 1 }));
      proceedToNext(3000);
      if (autoReadAnswer && typeof effectivePlay === 'function') {
        effectivePlay(gameState.origin.term);
      }
      scheduleAutoSave();
      return;
    }

    // Áp dụng Sudden Death: Sai 1 lần ép attempts lên MAX (3)
    const newAttempts = suddenDeath
      ? 3
      : (Number(gameState.attempts) || 0) + 1;
    setGameState((prev) => ({
      ...prev,
      isCorrect: false,
      attempts: newAttempts
    }));

    if (newAttempts >= 3) {
      localPushToRetryBag(gameState.origin);
      setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
      logMistake(gameState.origin);
      proceedToNext(5000);
      if (typeof effectivePlay === 'function') {
        effectivePlay(gameState.origin.term);
      }
    } else {
      if (newAttempts === 2) {
        if (difficulty !== 'hard' && typeof effectivePlay === 'function') {
          effectivePlay(gameState.origin.term);
          safeShowToast('Sai rồi, nghe lại và thử lại nhé!', 'warning');
        } else {
          safeShowToast('Sai rồi, hãy thử lại!', 'warning');
        }
      } else {
        safeShowToast('Sai rồi, hãy thử lại!', 'warning');
      }

      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
      }
      retryResetTimerRef.current = setTimeout(() => {
        retryResetTimerRef.current = null;
        if (!isGameActiveRef.current) return;
        setGameState((prev) => {
          if (prev.isCorrect === true || (Number(prev.attempts) || 0) >= 3) {
            return prev;
          }
          const combinedChunks = [
            ...(Array.isArray(prev.chunks) ? prev.chunks : []),
            ...(Array.isArray(prev.userAnswer) ? prev.userAnswer : []).filter(
              (c) => !c.isPunct
            )
          ];
          return {
            ...prev,
            isCorrect: null,
            userAnswer: inputMethod === 'tap' ? [] : prev.userAnswer,
            chunks:
              inputMethod === 'tap'
                ? Utils && typeof Utils.shuffleArray === 'function'
                  ? Utils.shuffleArray(combinedChunks)
                  : combinedChunks
                : prev.chunks
          };
        });
        if (inputMethod === 'type' || inputMethod === 'voice') {
          setInputBuffer('');
        }
        if (inputMethod === 'type') {
          if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
          focusTimerRef.current = setTimeout(() => {
            focusTimerRef.current = null;
            typeInputRef.current?.focus();
          }, 50);
        }
      }, 1200);
    }
    scheduleAutoSave();
  }, [
    autoReadAnswer,
    difficulty,
    effectiveDataMode,
    effectivePlay,
    gameState.attempts,
    gameState.isCorrect,
    gameState.origin,
    gameState.userAnswer,
    inputBuffer,
    inputMethod,
    isGenerating,
    isPaused,
    localPushToRetryBag,
    localRemoveFromRetryBag,
    logMistake,
    proceedToNext,
    safeLang,
    safeShowToast,
    scheduleAutoSave,
    stopRecognitionSafely,
    suddenDeath
  ]);

  // ============================================================================
  // ĐỘNG CƠ NHẬN DIỆN GIỌNG NÓI (XÓA 'vi-VN' & DỌN SẠCH HANDLER — Diệt C6)
  // ============================================================================
  const toggleMic = useCallback(() => {
    if (isPaused || isGenerating || gameState.isCorrect !== null) return;
    /** @type {any} */
    const win = typeof window !== 'undefined' ? window : null;
    const SpeechRecognitionCtor = win
      ? win.SpeechRecognition || win.webkitSpeechRecognition
      : null;

    if (!SpeechRecognitionCtor) {
      safeShowToast('Trình duyệt không hỗ trợ nhận diện giọng nói!', 'error');
      return;
    }

    if (isListening) {
      stopRecognitionSafely(false);
      return;
    }

    stopRecognitionSafely(true);
    setInputBuffer('');

    try {
      const recognition = new SpeechRecognitionCtor();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      // Chỉ sử dụng en-US hoặc zh-CN (xóa bỏ hoàn toàn nhánh 'vi-VN')
      recognition.lang = safeLang === 'zh' ? 'zh-CN' : 'en-US';

      const resetSilenceTimer = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          if (recognitionRef.current === recognition) {
            stopRecognitionSafely(false);
            safeShowToast('Đã tự ngắt vì không có âm thanh (5s)', 'info');
          }
        }, 5000);
      };

      recognition.onstart = () => {
        if (recognitionRef.current !== recognition) return;
        setIsListening(true);
        resetSilenceTimer();
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        hardTimerRef.current = setTimeout(() => {
          hardTimerRef.current = null;
          if (recognitionRef.current === recognition) {
            stopRecognitionSafely(false);
            safeShowToast('Đã tự ngắt (Giới hạn tối đa 15s)', 'warning');
          }
        }, 15000);
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          stopRecognitionSafely(false);
        }
      };

      /**
       * @param {any} event
       */
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return;
        const errCode = event?.error || '';
        stopRecognitionSafely(true);
        if (errCode === 'not-allowed') {
          safeShowToast('Bạn cần cấp quyền Micro.', 'error');
        }
      };

      /**
       * @param {any} event
       */
      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition || !event?.results) return;
        let currentTranscript = '';
        let hasValidText = false;
        for (let i = 0; i < event.results.length; i += 1) {
          const text = String(event.results[i]?.[0]?.transcript || '');
          currentTranscript += text;
          if (text.trim().length > 0) hasValidText = true;
        }
        if (hasValidText) resetSilenceTimer();
        setInputBuffer(currentTranscript);
      };

      recognition.start();
    } catch (e) {
      console.error('Mic start error:', e);
      stopRecognitionSafely(true);
      safeShowToast('Không thể khởi động Micro.', 'error');
    }
  }, [
    gameState.isCorrect,
    isGenerating,
    isListening,
    isPaused,
    safeLang,
    safeShowToast,
    stopRecognitionSafely
  ]);

  // ============================================================================
  // XỬ LÝ KÉO THẢ (DRAG & DROP + TOUCH DRAG — KHÓA KHI CHỐT & MÀU TĨNH S2)
  // ============================================================================
  const activeRingClass =
    SCRAMBLE_RING_CLASS[mainColor] || SCRAMBLE_RING_CLASS.orange;

  /**
   * @param {any} e
   * @param {number} index
   */
  const onDragStart = useCallback(
    (e, index) => {
      if (isPaused || isGenerating || gameState.isCorrect !== null) return;
      dragItemRef.current = index;
      if (e?.currentTarget) e.currentTarget.classList.add('opacity-50');
    },
    [gameState.isCorrect, isGenerating, isPaused]
  );

  /**
   * @param {any} _e
   * @param {number} index
   */
  const onDragEnter = useCallback(
    (_e, index) => {
      if (isPaused || isGenerating || gameState.isCorrect !== null) return;
      dragOverItemRef.current = index;
    },
    [gameState.isCorrect, isGenerating, isPaused]
  );

  /**
   * @param {any} e
   */
  const onDragEnd = useCallback(
    (e) => {
      if (e?.currentTarget) e.currentTarget.classList.remove('opacity-50');
      const draggedIdx = dragItemRef.current;
      const overIdx = dragOverItemRef.current;
      dragItemRef.current = null;
      dragOverItemRef.current = null;

      if (
        draggedIdx === null ||
        overIdx === null ||
        draggedIdx === overIdx ||
        isPaused ||
        isGenerating ||
        gameState.isCorrect !== null
      ) {
        return;
      }

      setGameState((prev) => {
        if (prev.isCorrect !== null || !Array.isArray(prev.userAnswer)) {
          return prev;
        }
        if (
          draggedIdx < 0 ||
          draggedIdx >= prev.userAnswer.length ||
          overIdx < 0 ||
          overIdx >= prev.userAnswer.length
        ) {
          return prev;
        }
        const newList = [...prev.userAnswer];
        const [draggedItem] = newList.splice(draggedIdx, 1);
        newList.splice(overIdx, 0, draggedItem);
        return { ...prev, userAnswer: newList };
      });
      scheduleAutoSave();
    },
    [gameState.isCorrect, isGenerating, isPaused, scheduleAutoSave]
  );

  /**
   * @param {any} e
   * @param {number} index
   */
  const onTouchStart = useCallback(
    (e, index) => {
      if (isPaused || isGenerating || gameState.isCorrect !== null) return;
      const touch = e?.touches?.[0];
      const target = e?.currentTarget;
      if (!touch || !target) return;

      dragItemRef.current = index;
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(20);
      }
      activeDragElementRef.current = target;
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      target.style.transition = 'none';
      target.style.zIndex = '1000';
      target.style.position = 'relative';
      target.classList.add(
        'opacity-80',
        'scale-110',
        'shadow-2xl',
        'ring-2',
        activeRingClass
      );
    },
    [activeRingClass, gameState.isCorrect, isGenerating, isPaused]
  );

  /**
   * @param {any} e
   */
  const onTouchMove = useCallback(
    (e) => {
      const el = activeDragElementRef.current;
      const touch = e?.touches?.[0];
      if (isPaused || isGenerating || !el || !touch) return;

      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      el.style.transform =
        'translate(' + String(dx) + 'px, ' + String(dy) + 'px)';

      const prevDisplay = el.style.display;
      el.style.display = 'none';
      const targetUnderFinger = document.elementFromPoint(
        touch.clientX,
        touch.clientY
      );
      el.style.display = prevDisplay;

      if (targetUnderFinger) {
        const item = targetUnderFinger.closest('[data-drag-index]');
        if (item) {
          const index = parseInt(
            item.getAttribute('data-drag-index') || '',
            10
          );
          if (!Number.isNaN(index) && index !== dragItemRef.current) {
            dragOverItemRef.current = index;
          }
        }
      }
    },
    [isGenerating, isPaused]
  );

  /**
   * @param {any} e
   */
  const onTouchEnd = useCallback(
    (e) => {
      const el = activeDragElementRef.current;
      if (el) {
        el.style.transform = '';
        el.style.zIndex = '';
        el.style.position = '';
        el.style.transition = '';
        el.classList.remove(
          'opacity-80',
          'scale-110',
          'shadow-2xl',
          'ring-2',
          activeRingClass
        );
        activeDragElementRef.current = null;
      }
      onDragEnd(e);
    },
    [activeRingClass, onDragEnd]
  );

  // ============================================================================
  // GIẢI THÍCH NGỮ PHÁP BẰNG AI (CHỐNG RACE + API KEY 4 TẦNG + TOKEN AN TOÀN)
  // ============================================================================
  const handleExplain = useCallback(async () => {
    if (isGenerating || !gameState.origin?.term) return;
    setShowExplainModal(true);
    if (aiExplanation) return;

    const currentApiKey = resolveActiveApiKey(apiKey);
    if (!currentApiKey) {
      setAiExplanation(
        'Chưa cấu hình API Key. Vui lòng thêm API Key để dùng tính năng Phân tích Ngữ pháp.'
      );
      return;
    }

    explainRunIdRef.current += 1;
    const runId = explainRunIdRef.current;
    setIsAiExplaining(true);

    try {
      const result = await explainSentenceGrammar(
        gameState.origin.term,
        safeLang,
        currentApiKey
      );
      if (result && typeof result === 'object' && result._tokenUsage) {
        safeAddTotalTokens(result._tokenUsage);
      }
      if (!isGameActiveRef.current || explainRunIdRef.current !== runId) {
        return;
      }
      const text =
        typeof result === 'string'
          ? result
          : String(result?.text || 'Không có dữ liệu phân tích.');
      setAiExplanation(text);
    } catch (e) {
      if (!isGameActiveRef.current || explainRunIdRef.current !== runId) {
        return;
      }
      const errMsg = e instanceof Error ? e.message : String(e || '');
      setAiExplanation('Lỗi kết nối AI: ' + errMsg);
    } finally {
      if (isGameActiveRef.current && explainRunIdRef.current === runId) {
        setIsAiExplaining(false);
      }
    }
  }, [aiExplanation, apiKey, gameState.origin, isGenerating, safeLang]);

  // Đối khớp Bookmark chuẩn Unicode NFC O(1) (Diệt S5)
  const notebookKeySet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(notebook)) {
      notebook.forEach((item) => {
        const key = normalizeTermKey(item?.term);
        if (key) set.add(key);
      });
    }
    return set;
  }, [notebook]);

  const isBookmarked = useMemo(() => {
    const key = normalizeTermKey(gameState.origin?.term);
    return Boolean(key && notebookKeySet.has(key));
  }, [gameState.origin?.term, notebookKeySet]);

  /**
   * @param {string} punct
   */
  const handleAddPunctuation = useCallback(
    (punct) => {
      if (
        !gameState.origin ||
        isPaused ||
        isGenerating ||
        gameState.isCorrect !== null
      ) {
        return;
      }
      setGameState((prev) => {
        if (prev.isCorrect !== null) return prev;
        return {
          ...prev,
          userAnswer: [
            ...(Array.isArray(prev.userAnswer) ? prev.userAnswer : []),
            {
              id:
                'punct-' +
                String(Date.now()) +
                '-' +
                Math.random().toString(36).slice(2, 8),
              text: punct,
              isPunct: true
            }
          ]
        };
      });
      scheduleAutoSave();
    },
    [
      gameState.isCorrect,
      gameState.origin,
      isGenerating,
      isPaused,
      scheduleAutoSave
    ]
  );

  return (
    <ScramblePlayScreen
      t={t}
      mainColor={mainColor}
      lang={safeLang}
      settings={settings}
      config={{
        ...config,
        sourceMode,
        aiMode: isAiMode,
        suddenDeath,
        dataMode: effectiveDataMode,
        level: effectiveLevelInput,
        topic: effectiveTopicInput
      }}
      isPaused={isPaused}
      timerMode={effectiveTimerMode}
      timeLimit={effectiveTimeLimit}
      timeLeft={timeLeft}
      time={time}
      inputMethod={inputMethod}
      isGenerating={isGenerating}
      aiCountdown={0}
      gameState={gameState}
      setGameState={setGameState}
      onPickChunk={handlePickChunk}
      onUnpickChunk={handleUnpickChunk}
      stats={stats}
      difficulty={difficulty}
      inputBuffer={inputBuffer}
      setInputBuffer={setInputBuffer}
      typeInputRef={typeInputRef}
      isListening={isListening}
      showExplainModal={showExplainModal}
      setShowExplainModal={setShowExplainModal}
      aiExplanation={aiExplanation}
      isAiExplaining={isAiExplaining}
      onBack={handleSaveAndBack}
      onEndGame={handleEndGameInternal}
      onPause={onPause}
      onPlay={effectivePlay}
      onBookmark={effectiveBookmark}
      triggerAutoSave={triggerAutoSave}
      checkAnswer={checkAnswer}
      toggleMic={toggleMic}
      handleSkip={handleSkip}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      handleExplain={handleExplain}
      nextRound={nextRound}
      isBookmarked={isBookmarked}
      handleAddPunctuation={handleAddPunctuation}
      resultTimer={resultTimer}
      isResultPaused={isResultPaused}
      toggleResultPause={toggleResultPause}
      queueLength={queueLength}
      aiWaitTime={aiWaitTime}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.ScrambleGame = ScrambleGame;
  window.Block5_4_ScrambleGame = ScrambleGame;
}

export default ScrambleGame;