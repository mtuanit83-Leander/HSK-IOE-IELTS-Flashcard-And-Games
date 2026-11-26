// ============================================================================
// FILE 65/85: src/features/games/ImageQuizGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.18 - Image Quiz Logic & Wrapper)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 23:35 (GMT+7)
// NHIỆM VỤ: Động cơ điều khiển Logic (useImageQuizLogic) và Component bọc
//           (ImageQuizGame) cho trò chơi Đoán Hình Ảnh (Image Quiz).
//           Nâng cấp Ver 1.1 (Vá sạch lỗi ts(2339) type 'never' & 0 Problems):
//           1. Khai báo tường minh kiểu /** @type {any} */ cho phần tử trả về
//              từ ai_generateOptions và dùng String(d).trim() triệt tiêu lỗi
//              TypeScript thu hẹp kiểu nhánh string về 'never'.
//           2. Giữ trọn 100% thành quả Ver 1.0: Diệt 2H + 1M Radar (R05),
//              chặn C7 (xóa sạch bộ thẻ), hồi sinh JIT fillCardWithAi 7 tham số,
//              StrictMode bootTimer 50ms, khóa hasExitedRef diệt Ghost Session,
//              đại phẫu luồng ảnh sạch & chuẩn hóa onSaveToHarvest / showToast.
// ============================================================================

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo
} from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { fillCardWithAi } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { ImageQuizPlayScreen } from './ImageQuizUI';
import {
  getSafeLevelString,
  resolveActiveApiKey,
  getConfiguredUiCooldown
} from './common/gameHelpers';

const POS_BLACKLIST_REGEX =
  /(giới từ|liên từ|phó từ|trợ từ|đại từ|lượng từ|preposition|conjunction|adverb|particle|pronoun|measure word|介词|连词|副词|助词|代词|量词)/i;

const VIET_OR_CJK_REGEX = /[\u00C0-\u1EF9\u3400-\u9FFF\uF900-\uFAFF]/;

const DEFAULT_FALLBACK_CARDS = [
  {
    term: 'Apple',
    definition: 'Quả táo',
    image_keyword: 'red apple fruit'
  },
  {
    term: 'Banana',
    definition: 'Quả chuối',
    image_keyword: 'yellow banana fruit'
  },
  {
    term: 'Cat',
    definition: 'Con mèo',
    image_keyword: 'cute cat animal'
  },
  {
    term: 'Dog',
    definition: 'Con chó',
    image_keyword: 'friendly dog animal'
  }
];

/**
 * Chuẩn hóa mã ngôn ngữ học ('en' | 'zh')
 * @param {any} rawLang
 * @returns {'en' | 'zh'}
 */
const toSafeLang = (rawLang) => {
  return String(rawLang || '').toLowerCase().trim() === 'zh' ? 'zh' : 'en';
};

/**
 * Chuẩn hóa chuỗi khóa từ vựng theo Unicode NFC để đối khớp chính xác
 * @param {any} raw
 * @returns {string}
 */
const normalizeTermKey = (raw) => {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/\u0332/g, '').trim().toLowerCase();
};

/**
 * Chuẩn hóa khóa cấp độ cho Harvest Pool ('en_level_X' | 'zh_level_X')
 * @param {any} rawLevel
 * @param {'en' | 'zh'} lang
 * @returns {string}
 */
const toCanonicalHarvestLevelKey = (rawLevel, lang) => {
  const safeStr = getSafeLevelString(rawLevel, lang + '_level_4');
  const match = String(safeStr).match(/(\d+)/);
  const num = match ? Math.max(1, Math.min(9, parseInt(match[1], 10))) : 4;
  return lang + '_level_' + num;
};

/**
 * Đọc timeout tải AI từ fc_ai_config an toàn
 * @returns {number}
 */
const getConfiguredMaintainTimeoutMs = () => {
  const aiCfg =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_config', null)
      : null;
  const sec = Number(aiCfg?.loadingTime);
  if (Number.isFinite(sec) && sec >= 5 && sec <= 120) {
    return Math.round(sec * 1000);
  }
  return 22000;
};

/**
 * Cộng dồn tổng token tiêu thụ an toàn qua Utils.safeLocalStorageSet (diệt R05 & chống NaN)
 * @param {number} usedTokens
 */
const safeAddTotalTokens = (usedTokens) => {
  const used = Number(usedTokens);
  if (!Number.isFinite(used) || used <= 0) return;
  let prev = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('fc_total_tokens');
      const parsed = parseInt(raw || '0', 10);
      if (Number.isFinite(parsed) && parsed >= 0) prev = parsed;
    }
  } catch (e) {
    console.warn('Read fc_total_tokens failed:', e);
  }
  if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_total_tokens', String(prev + Math.floor(used)));
  }
};

/**
 * Đẩy từ vào trí nhớ AI chống lặp (ưu tiên AiMemoryManager + fallback safeLocalStorageSet)
 * @param {string} term
 * @param {React.MutableRefObject<string[]>} historyQueueRef
 */
const pushTermToAiMemory = (term, historyQueueRef) => {
  const clean = typeof term === 'string' ? term.trim() : '';
  if (!clean) return;
  if (AiMemoryManager && typeof AiMemoryManager.add === 'function') {
    AiMemoryManager.add(clean);
  }
  const list = Array.isArray(historyQueueRef.current)
    ? historyQueueRef.current
    : [];
  const norm = normalizeTermKey(clean);
  const exists = list.some((item) => normalizeTermKey(item) === norm);
  if (!exists) {
    list.push(clean);
    while (list.length > 400) list.shift();
    historyQueueRef.current = list;
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_ai_memory', list);
    }
  }
};

/**
 * Kiểm tra xem URL ảnh có hợp lệ hay không
 * @param {any} url
 * @returns {boolean}
 */
const hasValidImageUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return false;
  if (Utils && typeof Utils.isValidImageUrl === 'function') {
    return Utils.isValidImageUrl(url.trim());
  }
  return /^(https?:\/\/|data:image\/)/i.test(url.trim());
};

/**
 * Giải mã URL ảnh sạch nhất quán cho 1 thẻ/đáp án (diệt S7 & C11)
 * Ưu tiên: 1. Ảnh có sẵn hợp lệ -> 2. image_keyword / imageKeyword -> 3. Từ tiếng Anh trực quan
 * @param {Record<string, any>} item
 * @param {'en' | 'zh'} safeLang
 * @returns {string}
 */
const buildCleanOptionImageUrl = (item, safeLang) => {
  if (!item || typeof item !== 'object') return '';

  if (hasValidImageUrl(item.image)) {
    return String(item.image).trim();
  }

  const rawKeyword = String(
    item.image_keyword || item.imageKeyword || ''
  ).trim();
  if (rawKeyword && Utils && typeof Utils.buildSmartImageUrl === 'function') {
    const builtFromKw = Utils.buildSmartImageUrl(rawKeyword);
    if (builtFromKw) return builtFromKw;
  }

  // Nếu có term tiếng Anh thuần (không chứa dấu tiếng Việt hoặc chữ Hán), dùng buildSmartImageUrl
  const candidateTerm = String(item.term || item.text || '').trim();
  if (candidateTerm) {
    if (
      (safeLang === 'en' || !VIET_OR_CJK_REGEX.test(candidateTerm)) &&
      Utils &&
      typeof Utils.buildSmartImageUrl === 'function'
    ) {
      const built = Utils.buildSmartImageUrl(candidateTerm);
      if (built) return built;
    }

    if (Utils && typeof Utils.resolveSmartImageUrl === 'function') {
      const resolved = Utils.resolveSmartImageUrl(item);
      if (resolved) return resolved;
    }

    // Phương án cuối cùng cho chữ Hán chưa có image_keyword tiếng Anh
    return (
      'https://tse4.mm.bing.net/th?q=' +
      encodeURIComponent(candidateTerm + ' illustration clipart') +
      '&w=400&h=300&c=7&rs=1&p=0'
    );
  }

  return '';
};

/**
 * Lọc danh sách thẻ trực quan hợp lệ cho ImageQuiz (diệt lỗi chọn hư từ trừu tượng)
 * @param {Array<Record<string, any>>} sourceCards
 * @returns {Array<Record<string, any>>}
 */
const filterVisualCards = (sourceCards) => {
  if (!Array.isArray(sourceCards)) return [];
  return sourceCards.filter((c) => {
    if (!c || typeof c !== 'object') return false;
    if (typeof c.term !== 'string' || !c.term.trim()) return false;
    if (
      hasValidImageUrl(c.image) ||
      (typeof c.image_keyword === 'string' && c.image_keyword.trim() !== '') ||
      (typeof c.imageKeyword === 'string' && c.imageKeyword.trim() !== '')
    ) {
      return true;
    }
    if (c.partOfSpeech && POS_BLACKLIST_REGEX.test(String(c.partOfSpeech))) {
      return false;
    }
    return true;
  });
};

/**
 * Chuẩn hóa đối tượng câu hỏi ImageQuiz (diệt S9 spread string & đảm bảo cấu trúc options)
 * @param {Record<string, any> | null | undefined} raw
 * @param {Record<string, any> | null} fallbackOrigin
 * @param {'en' | 'zh'} safeLang
 * @returns {Record<string, any> | null}
 */
const normalizeImageQuizQuestion = (raw, fallbackOrigin, safeLang) => {
  if (!raw || typeof raw !== 'object') return null;

  const qObj =
    raw.question &&
    typeof raw.question === 'object' &&
    !Array.isArray(raw.question)
      ? raw.question
      : null;

  const resolvedTerm = String(
    raw.term ||
      qObj?.term ||
      (typeof raw.question === 'string' ? raw.question : '') ||
      fallbackOrigin?.term ||
      ''
  ).trim();

  if (!resolvedTerm) return null;

  const resolvedDef = String(
    raw.definition ||
      qObj?.definition ||
      raw.meaning ||
      raw.hint ||
      fallbackOrigin?.definition ||
      ''
  ).trim();

  const rawOptions = Array.isArray(raw.options)
    ? raw.options
    : Array.isArray(qObj?.options)
      ? qObj.options
      : [];

  if (rawOptions.length < 2) return null;

  const normalizedOptions = rawOptions
    .map((opt, idx) => {
      if (typeof opt === 'string') {
        const cleanStr = opt.trim();
        return {
          text: cleanStr || 'Option ' + (idx + 1),
          image: buildCleanOptionImageUrl({ term: cleanStr }, safeLang),
          imageKeyword: '',
          isCorrect: false
        };
      }
      if (!opt || typeof opt !== 'object') return null;

      const optText = String(
        opt.text ||
          opt.label ||
          opt.term ||
          opt.imageKeyword ||
          opt.image_keyword ||
          ''
      ).trim();
      const optKw = String(opt.imageKeyword || opt.image_keyword || '').trim();
      const isCorrectFlag =
        opt.isCorrect === true ||
        String(opt.isCorrect).toLowerCase() === 'true';

      const imgUrl = buildCleanOptionImageUrl(
        {
          image: opt.image,
          image_keyword: optKw,
          term: opt.term || optKw || optText
        },
        safeLang
      );

      return {
        ...opt,
        text: optText || optKw || 'Option ' + (idx + 1),
        imageKeyword: optKw,
        image: imgUrl,
        isCorrect: isCorrectFlag
      };
    })
    .filter(Boolean);

  if (normalizedOptions.length < 2) return null;

  // Đảm bảo luôn có ít nhất 1 đáp án đúng
  const hasCorrect = normalizedOptions.some((o) => o && o.isCorrect === true);
  if (!hasCorrect) {
    const matchIdx = normalizedOptions.findIndex(
      (o) =>
        o &&
        (normalizeTermKey(o.text) === normalizeTermKey(resolvedTerm) ||
          (resolvedDef &&
            normalizeTermKey(o.text) === normalizeTermKey(resolvedDef)))
    );
    const targetIdx = matchIdx >= 0 ? matchIdx : 0;
    if (normalizedOptions[targetIdx]) {
      normalizedOptions[targetIdx] = {
        ...normalizedOptions[targetIdx],
        isCorrect: true
      };
    }
  }

  return {
    ...(qObj || {}),
    ...raw,
    term: resolvedTerm,
    definition: resolvedDef,
    options: normalizedOptions.slice(0, 4),
    origin: raw.origin || fallbackOrigin || null,
    isAiGenerated: Boolean(raw.isAiGenerated),
    _isRescued: Boolean(raw._isRescued || raw.origin?._isRescued)
  };
};

/**
 * Chống lặp vị trí đáp án đúng quá 2 lần liên tiếp (Bất biến 100% — diệt S8)
 * @param {Record<string, any> | null} questionData
 * @param {React.MutableRefObject<number[]>} streakTrackerRef
 * @returns {Record<string, any> | null}
 */
const applyImageOptionsAntiStreak = (questionData, streakTrackerRef) => {
  if (
    !questionData ||
    !Array.isArray(questionData.options) ||
    questionData.options.length < 2
  ) {
    return questionData;
  }

  const optionsCopy = questionData.options.map((o) =>
    o && typeof o === 'object' ? { ...o } : o
  );
  let correctIdx = optionsCopy.findIndex(
    (o) =>
      o &&
      (o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true')
  );
  if (correctIdx < 0) return questionData;

  const recent = Array.isArray(streakTrackerRef.current)
    ? streakTrackerRef.current
    : [];

  if (
    recent.length >= 2 &&
    recent[recent.length - 1] === correctIdx &&
    recent[recent.length - 2] === correctIdx
  ) {
    const candidateIndices = [];
    for (let i = 0; i < optionsCopy.length; i++) {
      if (i !== correctIdx) candidateIndices.push(i);
    }
    if (candidateIndices.length > 0) {
      const swapIdx =
        candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
      const temp = optionsCopy[correctIdx];
      optionsCopy[correctIdx] = optionsCopy[swapIdx];
      optionsCopy[swapIdx] = temp;
      correctIdx = swapIdx;
    }
  }

  const nextRecent = [...recent, correctIdx];
  while (nextRecent.length > 4) nextRecent.shift();
  streakTrackerRef.current = nextRecent;

  return {
    ...questionData,
    options: optionsCopy
  };
};

/**
 * Trích xuất danh sách THẺ GỐC sạch từ hàng đợi đang nạp (diệt S16 ô nhiễm deck)
 * @param {any} coordinator
 * @param {boolean} isPureMode
 * @returns {Array<Record<string, any>>}
 */
const extractCleanBaseCardsFromQueue = (coordinator, isPureMode) => {
  if (isPureMode || !coordinator) return [];
  const rawItems =
    typeof coordinator.getPendingItems === 'function'
      ? coordinator.getPendingItems()
      : Array.isArray(coordinator.queue)
        ? coordinator.queue
        : [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  /** @type {Array<Record<string, any>>} */
  const cleanCards = [];
  const seenKeys = new Set();

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const base =
      item.origin && typeof item.origin === 'object' && item.origin.term
        ? item.origin
        : item.term
          ? {
              term: item.term,
              definition: item.definition || '',
              image: item.image || '',
              image_keyword: item.image_keyword || item.imageKeyword || '',
              partOfSpeech: item.partOfSpeech || ''
            }
          : null;
    if (!base || typeof base.term !== 'string' || !base.term.trim()) continue;
    const key = normalizeTermKey(base.term);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    cleanCards.push(base);
  }

  return cleanCards;
};

/**
 * Gộp 2 danh sách thẻ gốc sạch và khử trùng NFC
 * @param {Array<Record<string, any>>} pendingCards
 * @param {Array<Record<string, any>>} existingDeck
 * @returns {Array<Record<string, any>>}
 */
const mergeCleanDecks = (pendingCards, existingDeck) => {
  /** @type {Array<Record<string, any>>} */
  const merged = [];
  const seen = new Set();
  const combined = [
    ...(Array.isArray(pendingCards) ? pendingCards : []),
    ...(Array.isArray(existingDeck) ? existingDeck : [])
  ];
  for (const c of combined) {
    if (
      !c ||
      typeof c !== 'object' ||
      typeof c.term !== 'string' ||
      !c.term.trim()
    ) {
      continue;
    }
    const k = normalizeTermKey(c.term);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    merged.push(c);
  }
  return merged;
};

/**
 * Tạo phao cứu sinh khẩn cấp đã chuẩn hóa cho ImageQuiz
 * @param {'en' | 'zh'} safeLang
 * @param {string} safeLevelString
 * @param {Record<string, any>} cfg
 * @returns {Record<string, any>}
 */
const buildHardFallbackQuestion = (safeLang, safeLevelString, cfg) => {
  if (
    FallbackDataEngine &&
    typeof FallbackDataEngine.getGameReadyFallback === 'function'
  ) {
    const fb = FallbackDataEngine.getGameReadyFallback(
      'imagequiz',
      safeLang,
      safeLevelString,
      cfg
    );
    const normalized = normalizeImageQuizQuestion(
      fb,
      fb?.origin || null,
      safeLang
    );
    if (normalized) {
      return { ...normalized, _isRescued: true };
    }
  }

  const seed = DEFAULT_FALLBACK_CARDS[0];
  return {
    term: seed.term,
    definition: seed.definition,
    options: DEFAULT_FALLBACK_CARDS.map((item, idx) => ({
      text: item.definition,
      imageKeyword: item.image_keyword,
      image: buildCleanOptionImageUrl(item, safeLang),
      isCorrect: idx === 0
    })),
    origin: seed,
    isAiGenerated: false,
    _isRescued: true
  };
};

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (HOOK useImageQuizLogic)
// ============================================================================
/**
 * @param {Array<Record<string, any>>} cards
 * @param {Record<string, any>} config
 * @param {Record<string, any>} callbacks
 */
export const useImageQuizLogic = (cards, config, callbacks) => {
  const safeConfig = config || {};
  const safeCallbacks = callbacks || {};

  const safeLang = toSafeLang(safeConfig.lang);
  const safeLevelString = getSafeLevelString(
    safeConfig.level,
    safeLang + '_level_4'
  );
  const safeTimeLimit =
    Number(safeConfig.timeLimit) > 0 ? Number(safeConfig.timeLimit) : 15;
  const sourceMode = safeConfig.sourceMode === 'card' ? 'card' : 'ai_pure';
  const isAiMode = Boolean(safeConfig.isAiMode || sourceMode === 'ai_pure');
  const timerMode = Boolean(safeConfig.timerMode);

  // Khởi tạo State thông minh từ savedState (nếu có)
  const savedImgState = safeConfig.savedState?.imageQuizState || null;
  const isResumingWithQuestion = Boolean(
    savedImgState &&
      !savedImgState._needsNextOnResume &&
      savedImgState.currentQuestion &&
      Array.isArray(savedImgState.currentQuestion.options) &&
      savedImgState.currentQuestion.options.length >= 2
  );

  const [currentQuestion, setCurrentQuestion] = useState(() =>
    isResumingWithQuestion
      ? normalizeImageQuizQuestion(
          savedImgState.currentQuestion,
          savedImgState.currentQuestion.origin || null,
          safeLang
        )
      : null
  );
  const [selectedIndex, setSelectedIndex] = useState(() =>
    isResumingWithQuestion && savedImgState.selectedIndex !== undefined
      ? savedImgState.selectedIndex
      : null
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    isResumingWithQuestion ? savedImgState.checkStatus || 'idle' : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    isResumingWithQuestion ? Number(savedImgState.attempts) || 0 : 0
  );
  const [score, setScore] = useState(() => Number(savedImgState?.score) || 0);
  const [combo, setCombo] = useState(() =>
    Number(savedImgState?.combo) >= 1 ? Number(savedImgState.combo) : 1
  );
  const [playedCount, setPlayedCount] = useState(
    () => Number(savedImgState?.playedCount) || 0
  );
  const [time, setTime] = useState(() => Number(savedImgState?.time) || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => Number(savedImgState?.correctCount) || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => Number(savedImgState?.wrongCount) || 0
  );
  const [isGenerating, setIsGenerating] = useState(
    () => !isResumingWithQuestion
  );

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);

  // State cho Đồng hồ đếm ngược từng câu
  const [timeLeft, setTimeLeft] = useState(() =>
    savedImgState?.timeLeft !== undefined
      ? Math.max(0, Number(savedImgState.timeLeft) || 0)
      : safeTimeLimit
  );

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedImgState?.aiWaitTime !== undefined
      ? Math.max(0, Number(savedImgState.aiWaitTime) || 0)
      : 0
  );

  // Refs ổn định tránh Stale Closure & tái tạo fetchTask
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const configRef = useRef({
    ...safeConfig,
    lang: safeLang,
    level: safeConfig.level,
    safeLevelString,
    sourceMode,
    isAiMode,
    timeLimit: safeTimeLimit,
    timerMode
  });
  configRef.current = {
    ...safeConfig,
    lang: safeLang,
    level: safeConfig.level,
    safeLevelString,
    sourceMode,
    isAiMode,
    timeLimit: safeTimeLimit,
    timerMode
  };

  /** @type {React.MutableRefObject<Record<string, any>>} */
  const callbacksRef = useRef(safeCallbacks);
  callbacksRef.current = safeCallbacks;

  const enrichedCardsRef = useRef(Array.isArray(cards) ? cards : []);
  useEffect(() => {
    enrichedCardsRef.current = Array.isArray(cards) ? cards : [];
  }, [cards]);

  const globalRetryBagRef = useRef(safeConfig.globalRetryBag);
  useEffect(() => {
    globalRetryBagRef.current = safeConfig.globalRetryBag;
  }, [safeConfig.globalRetryBag]);

  /** @type {React.MutableRefObject<Array<Record<string, any>>>} */
  const deckRef = useRef([]);
  /** @type {React.MutableRefObject<string[]>} */
  const historyQueueRef = useRef(
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_memory', [])
      : []
  );
  /** @type {React.MutableRefObject<any>} */
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const hasExitedRef = useRef(false);
  /** @type {React.MutableRefObject<any>} */
  const gameTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const retryResetTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const autoSaveDebounceRef = useRef(null);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  /** @type {React.MutableRefObject<number[]>} */
  const streakTrackerRef = useRef([]);

  const clearAuxTimers = useCallback(() => {
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
  }, []);

  const safeShowToast = useCallback((msg, type = 'success') => {
    const text =
      typeof msg === 'string'
        ? msg
        : msg && typeof msg.text === 'string'
          ? msg.text
          : String(msg || '');
    if (!text) return;
    const cb = callbacksRef.current?.showToast;
    if (typeof cb === 'function') {
      cb(text, type);
    } else if (
      typeof window !== 'undefined' &&
      typeof window.globalShowToast === 'function'
    ) {
      window.globalShowToast(text, type);
    }
  }, []);

  // BỘ NÃO LƯU TRỮ VÀ AUTO-SAVE (Diệt S2, S3, S4, S16)
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const latestStateRef = useRef({});
  useEffect(() => {
    latestStateRef.current = {
      currentQuestion,
      selectedIndex,
      checkStatus,
      attempts,
      score,
      combo,
      playedCount,
      time,
      correctCount,
      wrongCount,
      timeLeft,
      deck: deckRef.current,
      aiWaitTime
    };
  }, [
    currentQuestion,
    selectedIndex,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    correctCount,
    wrongCount,
    timeLeft,
    aiWaitTime
  ]);

  const triggerAutoSave = useCallback(() => {
    if (!isGameActiveRef.current || hasExitedRef.current) return;
    const onAutoSaveFn = callbacksRef.current?.onAutoSave;
    const currentData = latestStateRef.current;
    if (
      typeof onAutoSaveFn !== 'function' ||
      !currentData ||
      !currentData.currentQuestion
    ) {
      return;
    }

    const isPure = configRef.current.sourceMode === 'ai_pure';
    const pendingCards = extractCleanBaseCardsFromQueue(
      coordinatorRef.current,
      isPure
    );
    const mergedDeck = isPure
      ? []
      : mergeCleanDecks(pendingCards, currentData.deck);

    const isQuestionSettled =
      currentData.checkStatus === 'correct' ||
      currentData.checkStatus === 'wrong' ||
      currentData.checkStatus === 'failed';

    onAutoSaveFn({
      imageQuizState: {
        ...currentData,
        deck: mergedDeck,
        _needsNextOnResume: isQuestionSettled
      }
    });
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
    }
    autoSaveDebounceRef.current = setTimeout(() => {
      autoSaveDebounceRef.current = null;
      triggerAutoSave();
    }, 150);
  }, [triggerAutoSave]);

  useEffect(() => {
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
    return () => {
      clearInterval(intervalTimer);
      // Chỉ lưu khi thực sự đang active và chưa thoát chủ động (diệt S2 & S3)
      if (isGameActiveRef.current && !hasExitedRef.current) {
        triggerAutoSave();
      }
    };
  }, [triggerAutoSave]);

  // ĐỒNG HỒ QUÉT ĐẠN NGẦM (QUEUE SCANNER 500ms)
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (
        coordinatorRef.current &&
        typeof coordinatorRef.current.length === 'function'
      ) {
        setQueueLength(coordinatorRef.current.length());
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // ĐỒNG HỒ LÀM NGUỘI UI (UI COOLDOWN TIMER)
  useEffect(() => {
    if (aiWaitTime <= 0 || isGenerating || isResultPaused) return undefined;
    const cdTimer = setTimeout(
      () => setAiWaitTime((prev) => Math.max(0, prev - 1)),
      1000
    );
    return () => clearTimeout(cdTimer);
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // Chống lặp vị trí đáp án đúng quá 2 lần liên tiếp
  const applyAntiStreak = useCallback((data) => {
    return applyImageOptionsAntiStreak(data, streakTrackerRef);
  }, []);

  // TÚI NHÁP TOÀN CỤC & GHI LOG LỖI SAI
  const localPushToRetryBag = useCallback((questionData) => {
    if (!questionData) return;
    const fn = callbacksRef.current?.addToRetryBag;
    if (typeof fn === 'function') {
      fn('image_quiz', {
        ...questionData,
        term: questionData.term || questionData.origin?.term || ''
      });
    }
  }, []);

  const localRemoveFromRetryBag = useCallback((termToCheck) => {
    if (!termToCheck) return;
    const fn = callbacksRef.current?.removeFromRetryBag;
    if (typeof fn === 'function') {
      fn('image_quiz', termToCheck);
    }
  }, []);

  const logMistake = useCallback((question) => {
    const fn = callbacksRef.current?.onLogWrong;
    if (typeof fn !== 'function' || !question) return;
    const baseData =
      question.origin && typeof question.origin === 'object'
        ? question.origin
        : {};
    const mistakeCard = {
      ...baseData,
      id:
        'mistake_' +
        Date.now() +
        '_' +
        Math.random().toString(36).slice(2, 11),
      type: 'mistake',
      term: question.term,
      definition: question.definition || 'Nhận diện hình ảnh',
      example: 'Bạn đã chọn sai hình ảnh cho từ này.',
      tags: [
        'image_quiz',
        configRef.current.safeLevelString,
        configRef.current.sourceMode
      ],
      timestamp: Date.now()
    };
    fn(mistakeCard);
  }, []);

  // KẾT THÚC CHỦ ĐỘNG (Khóa hasExitedRef diệt S3 Ghost Session)
  const handleEndGameInternal = useCallback(
    (statsOverride) => {
      hasExitedRef.current = true;
      isGameActiveRef.current = false;
      clearAuxTimers();
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
      const cur = latestStateRef.current || {};
      const finalStats = statsOverride || {
        correct: Number(cur.correctCount) || 0,
        time: Number(cur.time) || 0,
        wrong: Number(cur.wrongCount) || 0
      };
      const endFn = callbacksRef.current?.onEndGame;
      if (typeof endFn === 'function') {
        endFn({
          correct: Number(finalStats.correct) || 0,
          time: Number(finalStats.time) || 0,
          wrong: Number(finalStats.wrong) || 0
        });
      }
    },
    [clearAuxTimers]
  );

  // THOÁT TẠM DỪNG (Khóa hasExitedRef diệt S2 ghi đè phạt thoát ngang)
  const handleSaveAndBack = useCallback(() => {
    hasExitedRef.current = true;
    isGameActiveRef.current = false;
    clearAuxTimers();

    const currentData = latestStateRef.current || {};
    let finalWrongCount = Number(currentData.wrongCount) || 0;
    let finalCombo = Number(currentData.combo) || 1;
    let needsNext = false;

    const isSettled =
      currentData.checkStatus === 'correct' ||
      currentData.checkStatus === 'wrong' ||
      currentData.checkStatus === 'failed';

    if (!isSettled && currentData.currentQuestion) {
      localPushToRetryBag(currentData.currentQuestion);
      logMistake(currentData.currentQuestion);
      finalWrongCount += 1;
      finalCombo = 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    } else if (isSettled) {
      needsNext = true;
    }

    const isPure = configRef.current.sourceMode === 'ai_pure';
    const pendingCards = extractCleanBaseCardsFromQueue(
      coordinatorRef.current,
      isPure
    );
    const mergedDeck = isPure
      ? []
      : mergeCleanDecks(pendingCards, currentData.deck);

    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    const backFn = callbacksRef.current?.onBack;
    if (typeof backFn === 'function') {
      backFn({
        imageQuizState: {
          ...currentData,
          deck: mergedDeck,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [clearAuxTimers, localPushToRetryBag, logMistake, safeShowToast]);

  // Cập nhật bất biến 1 thẻ đã làm giàu lên bộ thẻ gốc (diệt C7 xóa sạch bộ thẻ!)
  const persistEnrichedCardImmutably = useCallback((updatedCard) => {
    const updateFn = callbacksRef.current?.onUpdateCards;
    if (typeof updateFn !== 'function' || !updatedCard || !updatedCard.term) {
      return;
    }
    const baseList = Array.isArray(enrichedCardsRef.current)
      ? enrichedCardsRef.current
      : [];
    if (baseList.length === 0) return;

    const targetNorm = normalizeTermKey(updatedCard.term);
    let matched = false;
    const nextCards = baseList.map((item) => {
      if (!item) return item;
      const sameId =
        updatedCard.id !== undefined &&
        item.id !== undefined &&
        item.id === updatedCard.id;
      const sameTerm = !sameId && normalizeTermKey(item.term) === targetNorm;
      if (sameId || sameTerm) {
        matched = true;
        return { ...item, ...updatedCard };
      }
      return item;
    });

    if (matched) {
      enrichedCardsRef.current = nextCards;
      updateFn(nextCards);
    }
  }, []);

  // ============================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE) - FETCH TASK
  // ============================================================================
  const fetchTask = useCallback(async () => {
    const cfg = configRef.current;
    const curLang = toSafeLang(cfg.lang);
    const curLevelStr = cfg.safeLevelString;
    const isPureMode = cfg.sourceMode === 'ai_pure';
    const canUseAi = Boolean(cfg.isAiMode);

    /** @type {Record<string, any> | null} */
    let card = null;

    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp bằng Khóa Nguyên Tử
    if (typeof pullRetryCardWithLock === 'function') {
      card = pullRetryCardWithLock(
        'image_quiz',
        globalRetryBagRef.current,
        curLang
      );
    }

    const currentApiKey = resolveActiveApiKey(cfg.apiKey);

    // LUỒNG 1: AI PURE MODE (Exam Engine)
    if (
      isPureMode &&
      canUseAi &&
      currentApiKey &&
      !card &&
      ExamEngine &&
      typeof ExamEngine.hydrateQuestion === 'function'
    ) {
      try {
        const meta = {
          id: 'imagequiz_' + Date.now(),
          type: 'ioe_image_quiz',
          level: curLevelStr,
          topic: cfg.topic || '',
          dataMode: 'vocab',
          mode: 'minigame',
          askMode: cfg.askMode || 'term',
          lang: curLang
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

        if (qData && qData.content) {
          const normalizedContent = normalizeImageQuizQuestion(
            {
              ...qData.content,
              isAiGenerated:
                qData.content.isAiGenerated !== undefined
                  ? Boolean(qData.content.isAiGenerated)
                  : true,
              _isRescued: Boolean(qData.content._isRescued || qData._isRescued)
            },
            null,
            curLang
          );

          if (normalizedContent) {
            pushTermToAiMemory(normalizedContent.term, historyQueueRef);
            const saveHarvestFn = callbacksRef.current?.onSaveToHarvest;
            if (
              typeof saveHarvestFn === 'function' &&
              !normalizedContent._isRescued
            ) {
              const harvestLevelKey = toCanonicalHarvestLevelKey(
                cfg.level || curLevelStr,
                curLang
              );
              saveHarvestFn(harvestLevelKey, {
                term: normalizedContent.term,
                definition: normalizedContent.definition || '',
                image:
                  normalizedContent.options.find((o) => o.isCorrect)?.image ||
                  '',
                gameType: 'ioe_image_quiz'
              });
            }
            if (isInitializingRef.current) {
              aiGeneratedCountRef.current += 1;
              safeShowToast(
                'Đã nạp xong câu ' +
                  aiGeneratedCountRef.current +
                  ' bằng AI...',
                'success'
              );
            }
            return normalizedContent;
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('AI ImageQuiz Pure Fallback:', errMsg);
        if (
          typeof window !== 'undefined' &&
          typeof window.logSystemEvent === 'function'
        ) {
          window.logSystemEvent('Lỗi API/Parse Lò đúc ImageQuiz AI', e);
        }
      }
    }

    // LUỒNG 2: THẺ CỦA TÔI HOẶC CỨU HỘ KHẨN CẤP
    if (!card) {
      if (deckRef.current.length === 0 && !isPureMode) {
        let validCards = filterVisualCards(enrichedCardsRef.current);

        if (
          validCards.length < 4 &&
          FallbackDataEngine &&
          typeof FallbackDataEngine.getFallbackData === 'function'
        ) {
          const fbItems = FallbackDataEngine.getFallbackData(
            curLang,
            'vocab',
            curLevelStr,
            20
          );
          if (Array.isArray(fbItems) && fbItems.length > 0) {
            const existingKeys = new Set(
              validCards.map((c) => normalizeTermKey(c.term))
            );
            const newFbs = fbItems.filter(
              (f) => f && f.term && !existingKeys.has(normalizeTermKey(f.term))
            );
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length < 4) {
          const existingKeys = new Set(
            validCards.map((c) => normalizeTermKey(c.term))
          );
          const extraDefaults = DEFAULT_FALLBACK_CARDS.filter(
            (f) => !existingKeys.has(normalizeTermKey(f.term))
          );
          validCards = [...validCards, ...extraDefaults];
        }
        deckRef.current =
          Utils && typeof Utils.shuffleArray === 'function'
            ? Utils.shuffleArray(validCards)
            : [...validCards];
      }

      card = deckRef.current.shift() || null;

      // JIT Enrichment: Nạp ngầm hình ảnh & ý nghĩa nếu thẻ gốc khuyết (diệt C7 & C8)
      if (
        card &&
        !isPureMode &&
        canUseAi &&
        currentApiKey &&
        typeof fillCardWithAi === 'function'
      ) {
        /** @type {string[]} */
        const missingFields = [];
        if (!card.definition || !String(card.definition).trim()) {
          missingFields.push('definition');
        }
        if (
          !hasValidImageUrl(card.image) &&
          (!card.image_keyword || !String(card.image_keyword).trim()) &&
          (!card.imageKeyword || !String(card.imageKeyword).trim())
        ) {
          missingFields.push('image');
        }
        if (missingFields.length > 0) {
          try {
            const levelContextArr = Array.isArray(cfg.level)
              ? cfg.level
              : [curLevelStr];
            /** @type {Record<string, any> | null} */
            const enriched = await fillCardWithAi(
              card.term,
              curLang,
              currentApiKey,
              missingFields,
              'vocab',
              levelContextArr,
              card
            );
            if (enriched && typeof enriched === 'object') {
              const tokenUsage = enriched._tokenUsage;
              const { _tokenUsage: _ignoredUsage, ...cleanEnriched } = enriched;
              card = {
                ...card,
                ...cleanEnriched,
                is_enriched: true
              };
              persistEnrichedCardImmutably(card);
              if (tokenUsage && tokenUsage.totalTokenCount) {
                safeAddTotalTokens(tokenUsage.totalTokenCount);
              }
            }
          } catch (e) {
            console.warn('JIT Enrich failed for Image Quiz:', e);
          }
        }
      }

      if (card && card.term) {
        pushTermToAiMemory(card.term, historyQueueRef);
      }
    }

    // Phao cứu sinh Tầng 2 nếu rỗng
    if (!card) {
      return buildHardFallbackQuestion(curLang, curLevelStr, cfg);
    }

    // Nếu thẻ lấy từ Retry Bag đã có sẵn mảng options hợp lệ thì chuẩn hóa & trả về ngay
    if (Array.isArray(card.options) && card.options.length >= 2) {
      const normalizedRetry = normalizeImageQuizQuestion(
        card,
        card.origin || null,
        curLang
      );
      if (normalizedRetry) return normalizedRetry;
    }

    // NHỊP 2 CỦA CARD MODE: SINH 3 ĐÁP ÁN NHIỄU TRỰC QUAN & BƠM ẢNH ĐỒNG NHẤT (Diệt S7 & C11)
    const numOptions = 4;
    let isAiGenerated = Boolean(card.isAiGenerated);
    const cardNormKey = normalizeTermKey(card.term);

    const correctOpt = {
      text: String(card.definition || card.term || '').trim(),
      imageKeyword: String(card.image_keyword || card.imageKeyword || '').trim(),
      image: buildCleanOptionImageUrl(card, curLang),
      isCorrect: true
    };

    /** @type {Array<Record<string, any>>} */
    let distractors = [];
    const usedKeys = new Set([cardNormKey]);
    if (card.definition) usedKeys.add(normalizeTermKey(card.definition));

    // Ưu tiên 1: Nếu bật AI & ngôn ngữ Anh -> dùng AI sinh từ Tiếng Anh trực quan (isReverse = true, diệt S7!)
    if (
      canUseAi &&
      currentApiKey &&
      curLang === 'en' &&
      GameAlgoEngine?.OptionsEngine?.ai_generateOptions
    ) {
      try {
        /** @type {any[]} */
        const dists = await GameAlgoEngine.OptionsEngine.ai_generateOptions(
          card,
          curLang,
          'word',
          currentApiKey,
          numOptions - 1,
          curLevelStr,
          cfg.topic || '',
          true
        );
        if (Array.isArray(dists) && dists.length > 0) {
          for (const rawItem of dists) {
            /** @type {any} */
            const d = rawItem;
            const rawText =
              typeof d === 'object' && d !== null && d.text
                ? String(d.text).trim()
                : typeof d === 'string'
                  ? String(d).trim()
                  : '';
            const norm = normalizeTermKey(rawText);
            if (!norm || usedKeys.has(norm)) continue;
            usedKeys.add(norm);
            distractors.push({
              text: rawText,
              imageKeyword: rawText,
              image: buildCleanOptionImageUrl(
                { term: rawText, image_keyword: rawText },
                curLang
              ),
              isCorrect: false
            });
          }
          if (distractors.length > 0) {
            isAiGenerated = true;
            safeAddTotalTokens(150);
          }
        }
      } catch (aiError) {
        const errMsg =
          aiError instanceof Error ? aiError.message : String(aiError);
        console.warn('AI Image Distractor Fallback:', errMsg);
        if (
          typeof window !== 'undefined' &&
          typeof window.logSystemEvent === 'function'
        ) {
          window.logSystemEvent('Lỗi API tạo nhiễu ImageQuiz', aiError);
        }
      }
    }

    // Ưu tiên 2: Rút các thẻ trực quan thật từ bộ thẻ hiện tại (giữ nguyên image / image_keyword đồng nhất)
    if (distractors.length < numOptions - 1) {
      const visualPool = filterVisualCards(enrichedCardsRef.current).filter(
        (c) => !usedKeys.has(normalizeTermKey(c.term))
      );
      const shuffledVisual =
        Utils && typeof Utils.shuffleArray === 'function'
          ? Utils.shuffleArray(visualPool)
          : visualPool;

      for (const candidate of shuffledVisual) {
        if (distractors.length >= numOptions - 1) break;
        const norm = normalizeTermKey(candidate.term);
        if (!norm || usedKeys.has(norm)) continue;
        usedKeys.add(norm);
        distractors.push({
          text: String(candidate.definition || candidate.term).trim(),
          imageKeyword: String(
            candidate.image_keyword || candidate.imageKeyword || ''
          ).trim(),
          image: buildCleanOptionImageUrl(candidate, curLang),
          isCorrect: false
        });
      }
    }

    // Ưu tiên 3: Bổ sung từ FallbackDataEngine đồng cấp (có sẵn cấu trúc thẻ)
    if (
      distractors.length < numOptions - 1 &&
      FallbackDataEngine &&
      typeof FallbackDataEngine.getFallbackData === 'function'
    ) {
      const fbItems = FallbackDataEngine.getFallbackData(
        curLang,
        'vocab',
        curLevelStr,
        20
      );
      const shuffledFb =
        Array.isArray(fbItems) && Utils && typeof Utils.shuffleArray === 'function'
          ? Utils.shuffleArray(fbItems)
          : Array.isArray(fbItems)
            ? fbItems
            : [];
      for (const fb of shuffledFb) {
        if (distractors.length >= numOptions - 1) break;
        if (!fb || !fb.term) continue;
        const norm = normalizeTermKey(fb.term);
        if (!norm || usedKeys.has(norm)) continue;
        usedKeys.add(norm);
        distractors.push({
          text: String(fb.definition || fb.term).trim(),
          imageKeyword: String(fb.image_keyword || fb.imageKeyword || '').trim(),
          image: buildCleanOptionImageUrl(fb, curLang),
          isCorrect: false
        });
      }
    }

    // Ưu tiên 4: Phao cuối DEFAULT_FALLBACK_CARDS đảm bảo luôn đủ 4 ảnh sạch
    for (const defItem of DEFAULT_FALLBACK_CARDS) {
      if (distractors.length >= numOptions - 1) break;
      const norm = normalizeTermKey(defItem.term);
      if (usedKeys.has(norm)) continue;
      usedKeys.add(norm);
      distractors.push({
        text: defItem.definition,
        imageKeyword: defItem.image_keyword,
        image: buildCleanOptionImageUrl(defItem, 'en'),
        isCorrect: false
      });
    }

    const pickedDistractors =
      Utils && typeof Utils.shuffleArray === 'function'
        ? Utils.shuffleArray(distractors.slice(0, numOptions - 1))
        : distractors.slice(0, numOptions - 1);

    const correctPos = Math.floor(
      Math.random() * (pickedDistractors.length + 1)
    );
    const finalOptions = [...pickedDistractors];
    finalOptions.splice(correctPos, 0, correctOpt);

    return {
      ...card,
      term: String(card.term).trim(),
      definition: String(card.definition || '').trim(),
      options: finalOptions,
      origin: card,
      isAiGenerated,
      _isRescued: Boolean(card._isRescued)
    };
  }, [persistEnrichedCardImmutably, safeShowToast]);

  // ============================================================================
  // KHỞI ĐỘNG & PHỤC HỒI PHIÊN CHƠI (CHUẨN REACT 18 STRICTMODE — DIỆT C9)
  // ============================================================================
  const startNewGame = useCallback(async () => {
    const cfg = configRef.current;
    const curLang = toSafeLang(cfg.lang);
    const curLevelStr = cfg.safeLevelString;
    const isPure = cfg.sourceMode === 'ai_pure';

    setIsGenerating(true);
    setPlayedCount(0);
    setScore(0);
    setCombo(1);
    setTime(0);
    setCorrectCount(0);
    setWrongCount(0);
    isInitializingRef.current = true;
    aiGeneratedCountRef.current = 0;
    streakTrackerRef.current = [];

    if (!isPure) {
      let validCards = filterVisualCards(enrichedCardsRef.current);

      if (validCards.length < 4) {
        safeShowToast(
          'Bộ thẻ ít từ vựng trực quan. Đang bù thêm dự phòng...',
          'warning'
        );
        if (
          FallbackDataEngine &&
          typeof FallbackDataEngine.getFallbackData === 'function'
        ) {
          const fbItems = FallbackDataEngine.getFallbackData(
            curLang,
            'vocab',
            curLevelStr,
            20
          );
          if (Array.isArray(fbItems) && fbItems.length > 0) {
            const existingKeys = new Set(
              validCards.map((c) => normalizeTermKey(c.term))
            );
            const newFbs = fbItems.filter(
              (f) => f && f.term && !existingKeys.has(normalizeTermKey(f.term))
            );
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length < 4) {
          const existingKeys = new Set(
            validCards.map((c) => normalizeTermKey(c.term))
          );
          const neededDefaults = DEFAULT_FALLBACK_CARDS.filter(
            (f) => !existingKeys.has(normalizeTermKey(f.term))
          );
          validCards = [...validCards, ...neededDefaults];
        }
      }
      deckRef.current =
        Utils && typeof Utils.shuffleArray === 'function'
          ? Utils.shuffleArray(validCards)
          : [...validCards];
    } else {
      deckRef.current = [];
    }

    if (coordinatorRef.current) {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    if (
      !QueueEngine ||
      typeof QueueEngine.createQueueCoordinator !== 'function'
    ) {
      safeShowToast(
        'Lỗi hệ thống: Không tìm thấy QueueEngine (Block 2.5)',
        'error'
      );
      setIsGenerating(false);
      isInitializingRef.current = false;
      return;
    }

    coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
    const isOfflineFastTrack = !isPure && !cfg.isAiMode;
    const timeoutMs = getConfiguredMaintainTimeoutMs();

    try {
      await coordinatorRef.current.maintain(true, timeoutMs, isOfflineFastTrack);
    } catch (err) {
      console.warn('ImageQuiz initial maintain error:', err);
    }

    if (!isGameActiveRef.current || hasExitedRef.current) return;

    let firstData = coordinatorRef.current ? coordinatorRef.current.pop() : null;

    if (!firstData) {
      if (
        typeof window !== 'undefined' &&
        typeof window.logSystemEvent === 'function'
      ) {
        window.logSystemEvent(
          'Queue cạn đạn lúc khởi tạo Game Đoán Hình',
          'Kích hoạt Hard Fallback'
        );
      }
      safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      firstData = buildHardFallbackQuestion(curLang, curLevelStr, cfg);
    }

    if (isGameActiveRef.current && !hasExitedRef.current && firstData) {
      setCurrentQuestion(applyAntiStreak(firstData));
      setSelectedIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setIsGenerating(false);
      isInitializingRef.current = false;
      setTimeLeft(cfg.timeLimit);

      const currentCooldown =
        isPure || cfg.isAiMode ? getConfiguredUiCooldown(9) : 0;
      setAiWaitTime(currentCooldown);
      safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
    } else if (isGameActiveRef.current && !hasExitedRef.current) {
      safeShowToast(
        'Lỗi nghiêm trọng khi tải dữ liệu AI. Buộc kết thúc.',
        'error'
      );
      setIsGenerating(false);
      isInitializingRef.current = false;
      handleEndGameInternal({ correct: 0, time: 0, wrong: 0 });
      return;
    }

    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    gameTimerRef.current = setInterval(() => {
      setTime((prev) => prev + 1);
    }, 1000);
  }, [applyAntiStreak, fetchTask, handleEndGameInternal, safeShowToast]);

  // Mount Effect chuẩn React 18 StrictMode (bootTimer 50ms chống ZombieKiller)
  useEffect(() => {
    let cancelled = false;
    isGameActiveRef.current = true;
    hasExitedRef.current = false;

    const bootTimer = setTimeout(() => {
      if (cancelled || !isGameActiveRef.current) return;

      const cfg = configRef.current;
      const st = cfg.savedState?.imageQuizState || null;
      const curLang = toSafeLang(cfg.lang);
      const curLevelStr = cfg.safeLevelString;
      const isPure = cfg.sourceMode === 'ai_pure';
      const isOfflineFastTrack = !isPure && !cfg.isAiMode;
      const timeoutMs = getConfiguredMaintainTimeoutMs();

      if (st) {
        if (!isPure && Array.isArray(st.deck)) {
          if (st.deck.length > 0 && typeof st.deck[0] === 'number') {
            deckRef.current = st.deck
              .map((idx) => enrichedCardsRef.current[idx])
              .filter(Boolean);
          } else {
            deckRef.current = mergeCleanDecks([], st.deck);
          }
        } else {
          deckRef.current = [];
        }

        if (coordinatorRef.current) {
          coordinatorRef.current.destroy();
          coordinatorRef.current = null;
        }

        if (
          QueueEngine &&
          typeof QueueEngine.createQueueCoordinator === 'function'
        ) {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            4
          );
        }

        const shouldPullNext =
          Boolean(st._needsNextOnResume) || !st.currentQuestion;

        if (coordinatorRef.current) {
          if (shouldPullNext) {
            setIsGenerating(true);
            coordinatorRef.current
              .maintain(false, timeoutMs, isOfflineFastTrack)
              .catch((err) => {
                console.warn('ImageQuiz resume maintain error:', err);
              })
              .finally(() => {
                if (
                  cancelled ||
                  !isGameActiveRef.current ||
                  hasExitedRef.current
                ) {
                  return;
                }
                let data = coordinatorRef.current
                  ? coordinatorRef.current.pop()
                  : null;
                if (!data) {
                  if (
                    typeof window !== 'undefined' &&
                    typeof window.logSystemEvent === 'function'
                  ) {
                    window.logSystemEvent(
                      'Queue cạn đạn lúc Resume Game Đoán Hình',
                      'Kích hoạt Hard Fallback'
                    );
                  }
                  safeShowToast(
                    'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
                    'warning'
                  );
                  data = buildHardFallbackQuestion(curLang, curLevelStr, cfg);
                }

                if (data) {
                  setCurrentQuestion(applyAntiStreak(data));
                  setSelectedIndex(null);
                  setCheckStatus('idle');
                  setAttempts(0);
                  setIsGenerating(false);
                  setTimeLeft(cfg.timeLimit);
                  const currentCooldown =
                    isPure || cfg.isAiMode ? getConfiguredUiCooldown(9) : 0;
                  setAiWaitTime(currentCooldown);
                } else {
                  safeShowToast('Lỗi tải dữ liệu. Buộc kết thúc.', 'error');
                  setIsGenerating(false);
                  handleEndGameInternal({
                    correct: Number(st.correctCount) || 0,
                    time: Number(st.time) || 0,
                    wrong: Number(st.wrongCount) || 0
                  });
                }
              });
          } else {
            // Đã có sẵn câu hiện tại -> chỉ nạp đạn ngầm cho vòng tiếp theo
            coordinatorRef.current
              .maintain(false, timeoutMs, isOfflineFastTrack)
              .catch((err) => {
                console.warn('ImageQuiz background maintain error:', err);
              });
          }
        }

        if (gameTimerRef.current) clearInterval(gameTimerRef.current);
        gameTimerRef.current = setInterval(() => {
          setTime((prev) => prev + 1);
        }, 1000);
      } else {
        startNewGame();
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      isGameActiveRef.current = false;
      clearAuxTimers();
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
    };
  }, [
    applyAntiStreak,
    clearAuxTimers,
    fetchTask,
    handleEndGameInternal,
    safeShowToast,
    startNewGame
  ]);

  const proceedToNext = useCallback(
    (defaultDelaySec) => {
      if (!isGameActiveRef.current || hasExitedRef.current) return;
      let delaySec = defaultDelaySec;
      if (aiWaitTime > delaySec) {
        delaySec = aiWaitTime;
      }
      if (delaySec < 1) delaySec = 1;
      setResultTimer(delaySec);
    },
    [aiWaitTime]
  );

  const nextRound = useCallback(() => {
    if (isGenerating || hasExitedRef.current) return;
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }

    const cfg = configRef.current;
    const curLang = toSafeLang(cfg.lang);
    const curLevelStr = cfg.safeLevelString;
    const isPure = cfg.sourceMode === 'ai_pure';

    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    if (
      coordinatorRef.current &&
      typeof coordinatorRef.current.length === 'function' &&
      coordinatorRef.current.length() > 0
    ) {
      const nextData = coordinatorRef.current.pop();
      if (nextData) {
        setCurrentQuestion(applyAntiStreak(nextData));
        setSelectedIndex(null);
        setCheckStatus('idle');
        setAttempts(0);
        setTimeLeft(cfg.timeLimit);

        const currentCooldown =
          isPure || cfg.isAiMode ? getConfiguredUiCooldown(9) : 0;
        setAiWaitTime(currentCooldown);
        scheduleAutoSave();
        return;
      }
    }

    setIsGenerating(true);
    const isOfflineFastTrack = !isPure && !cfg.isAiMode;
    const timeoutMs = getConfiguredMaintainTimeoutMs();

    const finishNextFetch = () => {
      if (!isGameActiveRef.current || hasExitedRef.current) return;
      let data = coordinatorRef.current ? coordinatorRef.current.pop() : null;
      if (!data) {
        if (
          typeof window !== 'undefined' &&
          typeof window.logSystemEvent === 'function'
        ) {
          window.logSystemEvent(
            'Queue cạn đạn lúc chuyển vòng Game Đoán Hình',
            'Kích hoạt Hard Fallback'
          );
        }
        safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
        data = buildHardFallbackQuestion(curLang, curLevelStr, cfg);
      }

      if (data) {
        setCurrentQuestion(applyAntiStreak(data));
        setSelectedIndex(null);
        setCheckStatus('idle');
        setAttempts(0);
        setIsGenerating(false);
        setTimeLeft(cfg.timeLimit);

        const currentCooldown =
          isPure || cfg.isAiMode ? getConfiguredUiCooldown(9) : 0;
        setAiWaitTime(currentCooldown);
        scheduleAutoSave();
      } else {
        safeShowToast('Lỗi tải dữ liệu vòng mới. Buộc kết thúc.', 'error');
        setIsGenerating(false);
        handleEndGameInternal({
          correct: Number(latestStateRef.current.correctCount) || 0,
          time: Number(latestStateRef.current.time) || 0,
          wrong: Number(latestStateRef.current.wrongCount) || 0
        });
      }
    };

    if (
      coordinatorRef.current &&
      typeof coordinatorRef.current.maintain === 'function'
    ) {
      coordinatorRef.current
        .maintain(false, timeoutMs, isOfflineFastTrack)
        .catch((err) => {
          console.warn('ImageQuiz nextRound maintain error:', err);
        })
        .finally(finishNextFetch);
    } else {
      finishNextFetch();
    }
  }, [
    applyAntiStreak,
    handleEndGameInternal,
    isGenerating,
    safeShowToast,
    scheduleAutoSave
  ]);

  // --- TƯƠNG TÁC NGƯỜI DÙNG ---
  const handleOptionClick = useCallback(
    (idx) => {
      if (
        !currentQuestion ||
        !Array.isArray(currentQuestion.options) ||
        checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        checkStatus === 'wrong' ||
        isGenerating
      ) {
        return;
      }

      const clickedOpt = currentQuestion.options[idx];
      if (!clickedOpt) return;

      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }

      setSelectedIndex(idx);
      const isCorrect =
        clickedOpt.isCorrect === true ||
        String(clickedOpt.isCorrect).toLowerCase() === 'true';

      if (isCorrect) {
        if (attempts === 0) {
          localRemoveFromRetryBag(currentQuestion.term);
        }
        setCheckStatus('correct');
        setCorrectCount((p) => p + 1);
        setScore((p) => p + 15 * combo);
        setCombo((p) => p + 1);
        safeShowToast('Xuất sắc!', 'success');
        proceedToNext(5);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setCombo(1);
        setScore((p) => Math.max(0, p - 5));

        if (newAttempts >= 2) {
          localPushToRetryBag(currentQuestion);
          setCheckStatus('wrong');
          setWrongCount((p) => p + 1);
          safeShowToast('Đã hết lượt!', 'error');
          logMistake(currentQuestion);
          proceedToNext(6);
        } else {
          setCheckStatus('wrong_retry');
          safeShowToast(
            'Chưa đúng! Còn ' + (2 - newAttempts) + ' lượt.',
            'warning'
          );
          retryResetTimerRef.current = setTimeout(() => {
            retryResetTimerRef.current = null;
            setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p));
            setSelectedIndex(null);
          }, 1000);
        }
      }
      scheduleAutoSave();
    },
    [
      attempts,
      checkStatus,
      combo,
      currentQuestion,
      isGenerating,
      localPushToRetryBag,
      localRemoveFromRetryBag,
      logMistake,
      proceedToNext,
      safeShowToast,
      scheduleAutoSave
    ]
  );

  const handleSkip = useCallback(() => {
    if (
      !currentQuestion ||
      checkStatus === 'correct' ||
      checkStatus === 'wrong' ||
      checkStatus === 'failed' ||
      isGenerating
    ) {
      return;
    }
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('wrong');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(6);
    scheduleAutoSave();
  }, [
    checkStatus,
    currentQuestion,
    isGenerating,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN TỪNG CÂU (Tách sạch side-effect khỏi updater)
  useEffect(() => {
    if (
      !timerMode ||
      checkStatus === 'correct' ||
      checkStatus === 'wrong' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return undefined;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [timerMode, checkStatus, isGenerating, currentQuestion]);

  // CƠ CHẾ GIẬT CÒ KHI HẾT GIỜ (TIMEOUT TRIGGER)
  useEffect(() => {
    if (
      !timerMode ||
      timeLeft !== 0 ||
      !currentQuestion ||
      isGenerating ||
      checkStatus === 'correct' ||
      checkStatus === 'wrong' ||
      checkStatus === 'failed'
    ) {
      return undefined;
    }

    const timerId = setTimeout(() => {
      localPushToRetryBag(currentQuestion);
      setCombo(1);
      setAttempts(2);
      setCheckStatus('wrong');
      setWrongCount((p) => p + 1);
      safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
      logMistake(currentQuestion);
      proceedToNext(6);
      scheduleAutoSave();
    }, 0);
    return () => clearTimeout(timerId);
  }, [
    timeLeft,
    timerMode,
    checkStatus,
    currentQuestion,
    isGenerating,
    logMistake,
    safeShowToast,
    scheduleAutoSave,
    localPushToRetryBag,
    proceedToNext
  ]);

  // Chặn Race Condition cho Auto-next
  useEffect(() => {
    const isSettled =
      checkStatus === 'correct' ||
      checkStatus === 'wrong' ||
      checkStatus === 'failed';
    if (!isSettled || isResultPaused || isGenerating) return undefined;

    if (resultTimer > 0) {
      const id = setTimeout(
        () => setResultTimer((tVal) => Math.max(0, tVal - 1)),
        1000
      );
      return () => clearTimeout(id);
    }

    const id = setTimeout(() => nextRound(), 0);
    return () => clearTimeout(id);
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(
    () => setIsResultPaused((p) => !p),
    []
  );

  return {
    currentQuestion,
    selectedIndex,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    isFinished,
    isGenerating,
    aiCountdown: 0,
    correctCount,
    wrongCount,
    resultTimer,
    isResultPaused,
    toggleResultPause,
    timeLeft,
    queueLength,
    handleOptionClick,
    handleSkip,
    nextRound,
    handleNext: nextRound,
    handleSaveAndBack,
    handleEndGameInternal,
    aiWaitTime
  };
};

// ============================================================================
// 2. GAME WRAPPER (ImageQuizGame)
// ============================================================================
/**
 * @param {{
 *   cards?: Array<Record<string, any>>,
 *   t?: Record<string, any>,
 *   onFinish?: (correct: number, time: number, wrong: number) => void,
 *   onQuit?: (sessionData?: Record<string, any>) => void,
 *   onEndGame?: (stats: { correct: number, time: number, wrong: number }) => void,
 *   onBack?: (sessionData?: Record<string, any>) => void,
 *   mainColor?: string,
 *   lang?: string,
 *   isAiMode?: boolean,
 *   apiKey?: string,
 *   onBookmark?: (payload: Record<string, any>) => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   notebook?: Array<Record<string, any>>,
 *   onLogWrong?: (mistakeCard: Record<string, any>) => void,
 *   settings?: Record<string, any>,
 *   config?: Record<string, any>,
 *   currentLevel?: string | string[],
 *   currentTopic?: string | string[],
 *   onUpdateCards?: (cards: Array<Record<string, any>>) => void,
 *   onSaveToHarvest?: (levelKey: string, payload: Record<string, any>) => void,
 *   savedState?: Record<string, any>,
 *   onAutoSave?: (stateObj: Record<string, any>) => void,
 *   speak?: (text: string) => void,
 *   onPlay?: (text: string) => void,
 *   showToast?: (text: string, type?: string) => void,
 *   globalRetryBag?: Record<string, any>,
 *   addToRetryBag?: (gameType: string, data: Record<string, any>) => void,
 *   removeFromRetryBag?: (gameType: string, term: string) => void
 * }} props
 */
export const ImageQuizGame = ({
  cards = [],
  t = undefined,
  onFinish = undefined,
  onQuit = undefined,
  onEndGame: propOnEndGame = undefined,
  onBack: propOnBack = undefined,
  mainColor = 'emerald',
  lang = 'en',
  isAiMode = false,
  apiKey = '',
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = [],
  onLogWrong = undefined,
  settings = undefined,
  config = undefined,
  currentLevel = undefined,
  currentTopic = undefined,
  onUpdateCards = undefined,
  onSaveToHarvest = undefined,
  savedState = undefined,
  onAutoSave = undefined,
  speak = undefined,
  onPlay = undefined,
  showToast = undefined,
  globalRetryBag = undefined,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined
}) => {
  const safeLang = toSafeLang(lang);

  const emitToast = useCallback(
    (msg, type = 'success') => {
      const text =
        typeof msg === 'string'
          ? msg
          : msg && typeof msg.text === 'string'
            ? msg.text
            : String(msg || '');
      if (!text) return;
      if (typeof showToast === 'function') {
        showToast(text, type);
      } else if (
        typeof window !== 'undefined' &&
        typeof window.globalShowToast === 'function'
      ) {
        window.globalShowToast(text, type);
      }
    },
    [showToast]
  );

  const handleFinishBridge = useCallback(
    (stats) => {
      const c = Number(stats?.correct) || 0;
      const tm = Number(stats?.time) || 0;
      const w = Number(stats?.wrong) || 0;
      if (typeof onFinish === 'function') {
        onFinish(c, tm, w);
      } else if (typeof propOnEndGame === 'function') {
        propOnEndGame({ correct: c, time: tm, wrong: w });
      }
    },
    [onFinish, propOnEndGame]
  );

  const handleBackBridge = useCallback(
    (sessionData) => {
      if (typeof propOnBack === 'function') {
        propOnBack(sessionData);
      } else if (typeof onQuit === 'function') {
        onQuit(sessionData);
      }
    },
    [onQuit, propOnBack]
  );

  const resolvedConfig = useMemo(() => {
    const baseCfg = config || {
      level: currentLevel || safeLang + '_level_4',
      topic: currentTopic || '',
      sourceMode: 'ai_pure'
    };
    const effectiveSource =
      baseCfg.sourceMode === 'card' ? 'card' : 'ai_pure';
    const effectiveAiMode =
      effectiveSource === 'ai_pure' ||
      Boolean(baseCfg.aiMode) ||
      Boolean(isAiMode);

    return {
      ...baseCfg,
      level: baseCfg.level || currentLevel || safeLang + '_level_4',
      topic:
        baseCfg.topic !== undefined ? baseCfg.topic : currentTopic || '',
      sourceMode: effectiveSource,
      aiMode: effectiveAiMode,
      isAiMode: effectiveAiMode,
      apiKey,
      lang: safeLang,
      timeLimit: Number(baseCfg.timeLimit) > 0 ? Number(baseCfg.timeLimit) : 15,
      savedState,
      globalRetryBag
    };
  }, [
    apiKey,
    config,
    currentLevel,
    currentTopic,
    globalRetryBag,
    isAiMode,
    safeLang,
    savedState
  ]);

  const hookCallbacks = useMemo(
    () => ({
      showToast: emitToast,
      onLogWrong,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      onBack: handleBackBridge,
      addToRetryBag,
      removeFromRetryBag,
      onEndGame: handleFinishBridge
    }),
    [
      addToRetryBag,
      emitToast,
      handleBackBridge,
      handleFinishBridge,
      onAutoSave,
      onLogWrong,
      onSaveToHarvest,
      onUpdateCards,
      removeFromRetryBag
    ]
  );

  const logic = useImageQuizLogic(cards, resolvedConfig, hookCallbacks);

  const handleSaveToNotebookBridge = useCallback(
    (payload) => {
      if (typeof onBookmark === 'function') {
        onBookmark(payload);
      } else if (typeof onSaveToNotebook === 'function') {
        onSaveToNotebook(payload);
      } else {
        emitToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    },
    [emitToast, onBookmark, onSaveToNotebook]
  );

  const safeOnPlay = useCallback(
    (text) => {
      const clean = typeof text === 'string' ? text.trim() : '';
      if (!clean) return;
      if (typeof onPlay === 'function') {
        onPlay(clean);
      } else if (typeof speak === 'function') {
        speak(clean);
      } else if (
        typeof window !== 'undefined' &&
        window.speechSynthesis
      ) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = safeLang === 'zh' ? 'zh-CN' : 'en-US';
        window.speechSynthesis.speak(u);
      }
    },
    [onPlay, safeLang, speak]
  );

  const isBookmarked = useMemo(() => {
    const targetNorm = normalizeTermKey(logic.currentQuestion?.term);
    if (!targetNorm || !Array.isArray(notebook)) return false;
    return notebook.some((n) => normalizeTermKey(n?.term) === targetNorm);
  }, [logic.currentQuestion?.term, notebook]);

  return (
    <ImageQuizPlayScreen
      t={t}
      mainColor={mainColor}
      config={resolvedConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={logic.handleEndGameInternal}
      onPlay={safeOnPlay}
      onSaveToNotebook={handleSaveToNotebookBridge}
      isBookmarked={isBookmarked}
      settings={settings}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_18_useImageQuizLogic = useImageQuizLogic;
  window.useImageQuizLogic = useImageQuizLogic;
  window.Block5_18_ImageQuizGame = ImageQuizGame;
  window.ImageQuizGame = ImageQuizGame;
}

export default ImageQuizGame;