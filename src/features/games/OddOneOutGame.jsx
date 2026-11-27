// ============================================================================
// FILE 63/85: src/features/games/OddOneOutGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.13 - OddOneOut Logic & Wrapper)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 10:01 (GMT+7)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Tìm Từ Khác Loại (Odd One Out).
//           Nâng cấp Ver 1.0 (Lượt 4.2 — Diệt 2H + 2M Radar & 0 Problems tsc):
//           1. Diệt 2H + 2M Radar (R05): Thay toàn bộ localStorage.setItem
//              trần (fc_total_tokens, fc_ai_memory) sang safeAddTotalTokens +
//              AiMemoryManager + Utils.safeLocalStorageSet; đọc API Key 4 tầng
//              qua resolveActiveApiKey; gỡ window.Utils & window.handleSaveToNotebook.
//           2. Diệt C13 & C14: Chặn xóa sạch bộ thẻ (cập nhật bất biến toàn bộ
//              enrichedCardsRef thay vì onUpdateCards([poppedCard])); gọi đủ 7
//              tham số fillCardWithAi; truyền tường minh lang: safeLang vào
//              ExamEngine.hydrateQuestion; xóa nhánh TTS 'vi-VN' & nối speak.
//           3. Diệt C15, S2, S3, S4, S14 & S16: Gỡ deadlock hasStartedRef bằng
//              bootTimer 50ms + cancelled token; khóa hasExitedRef diệt lỗi xóa
//              án phạt thoát ngang & Ghost Session; lọc deck sạch (không trộn
//              câu hỏi đã chế biến khi Resume); bọc try/catch toàn tuyến
//              maintain(); reset selectedIndex + dọn sạch mọi timers.
//           4. Diệt S8, S12, S13, C16 & S17: Tự cài applyOddWordAntiStreak bất
//              biến; chuẩn hóa NFC oddWord & isBookmarked chính xác; khử trùng
//              fc_ai_memory; timeout động có clearTimeout trong finally; chuẩn
//              hóa onSaveToHarvest 2 tham số (chặn _isRescued) & showToast(text, type).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { fillCardWithAi } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { AiFactoryEngine } from '@/engines/aiFactory';
import { ExamEngine } from '@/engines/exam';
import { OddOneOutPlayScreen } from './OddOneOutUI';
import {
  resolveActiveApiKey,
  getSafeLevelString,
  getConfiguredUiCooldown
} from './common/gameHelpers';

// ============================================================================
// CÁC HÀM TIỆN ÍCH AN TOÀN (STORAGE, NFC, CHỐNG LẶP VỊ TRÍ & CHUẨN HÓA DỮ LIỆU)
// ============================================================================

/**
 * Chuẩn hóa chuỗi so khớp từ vựng / từ khác loại theo Unicode NFC (Diệt S13)
 * @param {any} raw
 * @returns {string}
 */
const normalizeOddWordKey = (raw) => {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/\u0332/g, '').trim().toLowerCase();
};

/**
 * Đọc khóa localStorage an toàn chống crash ở Private Mode
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
const safeStorageGet = (key, fallback = '') => {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Cộng dồn token AI an toàn qua Utils.safeLocalStorageSet + chống NaN (Diệt R05 HIGH)
 * @param {number} usedTokens
 */
const safeAddTotalTokens = (usedTokens) => {
  const used = Number(usedTokens);
  if (!Number.isFinite(used) || used <= 0) return;
  const rawPrev = safeStorageGet('fc_total_tokens', '0');
  const prevParsed = parseInt(rawPrev, 10);
  const prevSafe = Number.isFinite(prevParsed) && prevParsed >= 0 ? prevParsed : 0;
  const nextTotal = prevSafe + Math.floor(used);
  if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_total_tokens', String(nextTotal));
  }
};

/**
 * Đọc cấu hình AI (loadingTime, maxAmmo) an toàn từ fc_ai_config (Diệt S12)
 * @returns {{ loadingTimeMs: number, maxAmmo: number }}
 */
const getSafeAiRuntimeConfig = () => {
  const parsed =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_config', {})
      : {};
  const loadingSec = Number(parsed?.loadingTime);
  const clampedSec =
    Number.isFinite(loadingSec) && loadingSec >= 10 && loadingSec <= 45
      ? Math.floor(loadingSec)
      : 22;
  const ammoNum = Number(parsed?.maxAmmo);
  const clampedAmmo =
    Number.isFinite(ammoNum) && ammoNum >= 2 && ammoNum <= 8
      ? Math.floor(ammoNum)
      : 4;
  return {
    loadingTimeMs: clampedSec * 1000,
    maxAmmo: clampedAmmo
  };
};

/**
 * Đọc danh sách trí nhớ AI khử trùng từ AiMemoryManager / fc_ai_memory
 * @returns {string[]}
 */
const readFreshAiMemory = () => {
  try {
    if (AiMemoryManager && typeof AiMemoryManager.get === 'function') {
      const mem = AiMemoryManager.get();
      if (Array.isArray(mem)) return mem.filter((x) => typeof x === 'string' && x.trim() !== '');
    }
  } catch {
    // Fallback xuống safeJsonParse bên dưới
  }
  const parsed =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_memory', [])
      : [];
  return Array.isArray(parsed)
    ? parsed.filter((x) => typeof x === 'string' && x.trim() !== '')
    : [];
};

/**
 * Ghi nhớ từ đã sinh vào AiMemoryManager & fc_ai_memory có khử trùng NFC (Diệt R05 & S12)
 * @param {any[]} wordsList
 * @param {React.MutableRefObject<string[]>} historyQueueRef
 */
const rememberWordsToAiMemory = (wordsList, historyQueueRef) => {
  if (!Array.isArray(wordsList) || wordsList.length === 0) return;

  const existingList = Array.isArray(historyQueueRef.current)
    ? [...historyQueueRef.current]
    : [];
  const seenKeys = new Set(existingList.map((w) => normalizeOddWordKey(w)));
  let hasChanged = false;

  for (let i = 0; i < wordsList.length; i += 1) {
    const rawWord = wordsList[i];
    if (typeof rawWord !== 'string') continue;
    const trimmed = rawWord.trim();
    const normKey = normalizeOddWordKey(trimmed);
    if (!normKey || seenKeys.has(normKey)) continue;

    seenKeys.add(normKey);
    existingList.push(trimmed);
    hasChanged = true;

    if (AiMemoryManager && typeof AiMemoryManager.add === 'function') {
      try {
        AiMemoryManager.add(trimmed);
      } catch {
        // Bỏ qua lỗi memory manager phụ
      }
    }
  }

  while (existingList.length > 400) {
    existingList.shift();
  }
  historyQueueRef.current = existingList;

  if (
    hasChanged &&
    Utils &&
    typeof Utils.safeLocalStorageSet === 'function'
  ) {
    Utils.safeLocalStorageSet('fc_ai_memory', existingList);
  }
};

/**
 * Chuẩn hóa khóa cấp độ chuẩn ${safeLang}_level_X cho Harvest Pool & AI (Diệt C16)
 * @param {any} rawLevel
 * @param {'en' | 'zh'} safeLang
 * @returns {string}
 */
const toCanonicalLevelKey = (rawLevel, safeLang) => {
  const safeStr = getSafeLevelString(rawLevel, safeLang + '_level_4');
  const match = String(safeStr).match(/(\d+)/);
  const lvlNum = match ? Number(match[1]) : 4;
  const clamped =
    Number.isFinite(lvlNum) && lvlNum >= 1 && lvlNum <= 9 ? lvlNum : 4;
  return safeLang + '_level_' + String(clamped);
};

/**
 * Kiểm tra & chuẩn hóa cấu trúc câu hỏi OddOneOut (bảo toàn bất biến, vá lệch hoa/thường oddWord)
 * @param {any} rawData
 * @returns {Record<string, any> | null}
 */
const normalizeOddOneOutQuestion = (rawData) => {
  if (!rawData || typeof rawData !== 'object') return null;

  const rawWords = Array.isArray(rawData.words)
    ? rawData.words
    : Array.isArray(rawData.options)
      ? rawData.options
      : [];

  const cleanWords = rawWords
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item.term || item.word || item.text || '').trim();
      }
      return '';
    })
    .filter(Boolean);

  if (cleanWords.length < 2) return null;

  const rawOdd = String(
    rawData.oddWord || rawData.odd_word || rawData.answer || ''
  ).trim();
  const oddNorm = normalizeOddWordKey(rawOdd);

  let matchedOddWord = '';
  if (oddNorm) {
    const found = cleanWords.find((w) => normalizeOddWordKey(w) === oddNorm);
    if (found) matchedOddWord = found;
  }

  // Fallback an toàn nếu AI trả oddWord lệch chính tả nhẹ hoặc chỉ số đáp án
  if (!matchedOddWord) {
    const idxNum = Number(rawData.oddIndex ?? rawData.correctIndex);
    if (
      Number.isInteger(idxNum) &&
      idxNum >= 0 &&
      idxNum < cleanWords.length
    ) {
      matchedOddWord = cleanWords[idxNum];
    } else if (rawOdd) {
      matchedOddWord = rawOdd;
      if (cleanWords.length < 4) {
        cleanWords.push(rawOdd);
      } else {
        cleanWords[cleanWords.length - 1] = rawOdd;
      }
    } else {
      matchedOddWord = cleanWords[cleanWords.length - 1];
    }
  }

  return {
    ...rawData,
    words: cleanWords,
    oddWord: matchedOddWord,
    explanation: String(
      rawData.explanation || rawData.hint || rawData.reason || ''
    ).trim(),
    originCards: Array.isArray(rawData.originCards) ? rawData.originCards : [],
    isAiGenerated: Boolean(rawData.isAiGenerated),
    _isRescued: Boolean(rawData._isRescued || rawData.origin?._isRescued)
  };
};

/**
 * Chống lặp vị trí từ khác loại quá 2 lần liên tiếp (Bất biến hoàn toàn — Diệt S8)
 * @param {any} rawData
 * @param {React.MutableRefObject<number[]>} streakTrackerRef
 * @returns {Record<string, any> | null}
 */
const applyOddWordAntiStreak = (rawData, streakTrackerRef) => {
  const normalized = normalizeOddOneOutQuestion(rawData);
  if (!normalized || !Array.isArray(normalized.words)) return normalized;

  const words = [...normalized.words];
  const oddNorm = normalizeOddWordKey(normalized.oddWord);
  const currentOddIdx = words.findIndex(
    (w) => normalizeOddWordKey(w) === oddNorm
  );

  if (currentOddIdx < 0 || words.length < 2) {
    return normalized;
  }

  const history = Array.isArray(streakTrackerRef.current)
    ? streakTrackerRef.current
    : [];
  const lastTwoSame =
    history.length >= 2 &&
    history[history.length - 1] === currentOddIdx &&
    history[history.length - 2] === currentOddIdx;

  let finalOddIdx = currentOddIdx;

  if (lastTwoSame) {
    const candidates = [];
    for (let i = 0; i < words.length; i += 1) {
      if (i !== currentOddIdx) candidates.push(i);
    }
    if (candidates.length > 0) {
      const targetIdx =
        candidates[Math.floor(Math.random() * candidates.length)];
      const temp = words[targetIdx];
      words[targetIdx] = words[currentOddIdx];
      words[currentOddIdx] = temp;
      finalOddIdx = targetIdx;
    }
  }

  const nextHistory = [...history, finalOddIdx];
  while (nextHistory.length > 2) {
    nextHistory.shift();
  }
  streakTrackerRef.current = nextHistory;

  return {
    ...normalized,
    words
  };
};

/**
 * Trích xuất thẻ gốc sạch từ hàng đợi Coordinator để không làm ô nhiễm deck khi Resume (Diệt S16)
 * @param {any} coordinator
 * @returns {Record<string, any>[]}
 */
const extractCleanBaseCardsFromQueue = (coordinator) => {
  if (!coordinator || typeof coordinator.getPendingItems !== 'function') {
    return [];
  }
  const pendingItems = coordinator.getPendingItems();
  if (!Array.isArray(pendingItems) || pendingItems.length === 0) return [];

  /** @type {Record<string, any>[]} */
  const cleanCards = [];
  const seenTerms = new Set();

  for (let i = 0; i < pendingItems.length; i += 1) {
    const item = pendingItems[i];
    if (!item || typeof item !== 'object') continue;

    const candidate =
      (Array.isArray(item.originCards) && item.originCards[0]) ||
      (item.origin && typeof item.origin === 'object' ? item.origin : null) ||
      (typeof item.term === 'string' && !Array.isArray(item.words) ? item : null);

    if (
      candidate &&
      typeof candidate.term === 'string' &&
      candidate.term.trim() !== ''
    ) {
      const key = normalizeOddWordKey(candidate.term);
      if (key && !seenTerms.has(key)) {
        seenTerms.add(key);
        cleanCards.push(candidate);
      }
    }
  }

  return cleanCards;
};

/**
 * Lọc bộ thẻ đầu vào thành danh sách thẻ gốc sạch, khử trùng NFC (chống rác deck Resume)
 * @param {any[]} rawList
 * @returns {Record<string, any>[]}
 */
const sanitizeCardDeck = (rawList) => {
  if (!Array.isArray(rawList)) return [];
  /** @type {Record<string, any>[]} */
  const result = [];
  const seen = new Set();

  for (let i = 0; i < rawList.length; i += 1) {
    const c = rawList[i];
    if (
      !c ||
      typeof c !== 'object' ||
      typeof c.term !== 'string' ||
      c.term.trim() === '' ||
      Array.isArray(c.words)
    ) {
      continue;
    }
    const key = normalizeOddWordKey(c.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(c);
  }
  return result;
};

/**
 * Xây dựng dữ liệu dự phòng tuyệt đối theo ngôn ngữ (0% trắng màn hình)
 * @param {'en' | 'zh'} safeLang
 * @returns {Record<string, any>}
 */
const createHardEmergencyOddQuestion = (safeLang) => {
  if (safeLang === 'zh') {
    return {
      words: ['苹果', '香蕉', '橙子', '小猫'],
      oddWord: '小猫',
      explanation: '小猫 (con mèo) là động vật, 3 từ còn lại đều là trái cây.',
      originCards: [],
      isAiGenerated: false,
      _isRescued: true
    };
  }
  return {
    words: ['apple', 'banana', 'orange', 'cat'],
    oddWord: 'cat',
    explanation: 'Cat (con mèo) là động vật, 3 từ còn lại đều là trái cây.',
    originCards: [],
    isAiGenerated: false,
    _isRescued: true
  };
};

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (HOOK useOddOneOutLogic)
// ============================================================================
/**
 * @param {Record<string, any>[]} cards
 * @param {Record<string, any>} config
 * @param {Record<string, any>} callbacks
 */
export const useOddOneOutLogic = (cards, config, callbacks) => {
  /** @type {Record<string, any>} */
  const safeCfg = config && typeof config === 'object' ? config : {};
  /** @type {Record<string, any>} */
  const safeCbs = callbacks && typeof callbacks === 'object' ? callbacks : {};

  /** @type {'en' | 'zh'} */
  const safeLang = safeCfg.lang === 'zh' ? 'zh' : 'en';
  const sourceMode = safeCfg.sourceMode === 'ai_pure' ? 'ai_pure' : 'card';
  const isAiMode = Boolean(safeCfg.isAiMode || sourceMode === 'ai_pure');
  const timerMode = Boolean(safeCfg.timerMode);
  const safeTimeLimit =
    Number(safeCfg.timeLimit) > 0 ? Number(safeCfg.timeLimit) : 15;
  const canonicalLevel = toCanonicalLevelKey(safeCfg.level, safeLang);

  // Refs ổn định chống tái tạo fetchTask/callbacks mỗi giây (Diệt S12)
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const configRef = useRef(safeCfg);
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const callbacksRef = useRef(safeCbs);
  /** @type {React.MutableRefObject<Record<string, any>[]>} */
  const enrichedCardsRef = useRef(Array.isArray(cards) ? cards : []);
  /** @type {React.MutableRefObject<any>} */
  const globalRetryBagRef = useRef(safeCfg.globalRetryBag);

  configRef.current = {
    ...safeCfg,
    lang: safeLang,
    sourceMode,
    isAiMode,
    timerMode,
    timeLimit: safeTimeLimit,
    canonicalLevel
  };
  callbacksRef.current = safeCbs;

  useEffect(() => {
    enrichedCardsRef.current = Array.isArray(cards) ? cards : [];
  }, [cards]);

  useEffect(() => {
    globalRetryBagRef.current = safeCfg.globalRetryBag;
  }, [safeCfg.globalRetryBag]);

  // Khởi tạo trực tiếp từ savedState nếu có phiên chơi đang dở
  const savedSt = safeCfg.savedState?.oddOneOutState || null;
  const needsNextOnResume = Boolean(
    savedSt &&
      (savedSt._needsNextOnResume ||
        savedSt.checkStatus === 'success' ||
        savedSt.checkStatus === 'failed' ||
        !savedSt.currentQuestion)
  );

  const [currentQuestion, setCurrentQuestion] = useState(() =>
    savedSt && !needsNextOnResume
      ? normalizeOddOneOutQuestion(savedSt.currentQuestion)
      : null
  );
  const [selectedIndex, setSelectedIndex] = useState(() =>
    savedSt && !needsNextOnResume && savedSt.selectedIndex !== undefined
      ? savedSt.selectedIndex
      : null
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    savedSt && !needsNextOnResume ? savedSt.checkStatus || 'idle' : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    savedSt && !needsNextOnResume ? Number(savedSt.attempts) || 0 : 0
  );
  const [score, setScore] = useState(() => Number(savedSt?.score) || 0);
  const [combo, setCombo] = useState(() => Math.max(1, Number(savedSt?.combo) || 1));
  const [playedCount, setPlayedCount] = useState(
    () => Number(savedSt?.playedCount) || 0
  );
  const [time, setTime] = useState(() => Number(savedSt?.time) || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => Number(savedSt?.correctCount) || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => Number(savedSt?.wrongCount) || 0
  );
  const [isGenerating, setIsGenerating] = useState(
    () => !savedSt || needsNextOnResume
  );

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedTL = Number(savedSt?.timeLeft);
    return !needsNextOnResume && Number.isFinite(savedTL) && savedTL > 0
      ? savedTL
      : safeTimeLimit;
  });

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() => {
    const savedWait = Number(savedSt?.aiWaitTime);
    return !needsNextOnResume && Number.isFinite(savedWait) && savedWait >= 0
      ? savedWait
      : 0;
  });

  // Refs quản lý bất đồng bộ & khóa chống Ghost Session (Diệt C15, S1, S2, S3, S14)
  /** @type {React.MutableRefObject<string[]>} */
  const historyQueueRef = useRef(readFreshAiMemory());
  /** @type {React.MutableRefObject<any>} */
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const hasExitedRef = useRef(false);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  /** @type {React.MutableRefObject<Record<string, any>[]>} */
  const deckRef = useRef([]);
  /** @type {React.MutableRefObject<number[]>} */
  const streakTrackerRef = useRef([]);

  // Refs quản lý toàn bộ timers để dọn sạch tuyệt đối
  /** @type {React.MutableRefObject<any>} */
  const gameTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const retryResetTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const autoSaveDebounceRef = useRef(null);

  const cleanupAuxTimers = useCallback(() => {
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
  }, []);

  // Toast chuẩn 2 tham số (text, type) khớp GameView Ver 1.4 & globals.d.ts (Diệt C16)
  const safeShowToast = useCallback((msg, type = 'success') => {
    const text =
      typeof msg === 'string'
        ? msg
        : msg && typeof msg === 'object'
          ? String(msg.text || '')
          : '';
    if (!text) return;
    if (typeof callbacksRef.current?.showToast === 'function') {
      callbacksRef.current.showToast(text, type);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.globalShowToast === 'function'
    ) {
      window.globalShowToast(text, type);
    }
  }, []);

  // Cập nhật ảnh chụp state mới nhất cho Auto-Save & Exit
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const latestStateRef = useRef({});
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

  // Lưu trạng thái chơi an toàn: chặn tuyệt đối ghi đè sau khi đã thoát/kết thúc (Diệt S2, S3, S4, S16)
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

    const activeSource = configRef.current?.sourceMode || 'card';
    const cleanDeck =
      activeSource === 'ai_pure'
        ? []
        : sanitizeCardDeck([
            ...extractCleanBaseCardsFromQueue(coordinatorRef.current),
            ...(Array.isArray(currentData.deck) ? currentData.deck : [])
          ]);

    const isSettled =
      currentData.checkStatus === 'success' ||
      currentData.checkStatus === 'failed';

    onAutoSaveFn({
      oddOneOutState: {
        ...currentData,
        deck: cleanDeck,
        _needsNextOnResume: isSettled
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

  // Kết thúc phiên học sạch sẽ (khóa hasExitedRef trước khi unmount — Diệt S3)
  const handleEndGameInternal = useCallback(
    (statsOverride = null) => {
      hasExitedRef.current = true;
      isGameActiveRef.current = false;
      cleanupAuxTimers();
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }

      const cur = latestStateRef.current;
      const finalStats = statsOverride || {
        correct: Number(cur.correctCount) || 0,
        time: Number(cur.time) || 0,
        wrong: Number(cur.wrongCount) || 0
      };

      if (typeof callbacksRef.current?.onEndGame === 'function') {
        callbacksRef.current.onEndGame(finalStats);
      }
    },
    [cleanupAuxTimers]
  );

  // Đồng hồ Auto-Save định kỳ 5s
  useEffect(() => {
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
    return () => {
      clearInterval(intervalTimer);
      triggerAutoSave();
    };
  }, [triggerAutoSave]);

  // Đồng hồ quét đạn ngầm (500ms)
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (
        coordinatorRef.current &&
        typeof coordinatorRef.current.length === 'function'
      ) {
        setQueueLength(coordinatorRef.current.length());
      } else {
        setQueueLength(0);
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // Đồng hồ làm nguội UI (UI Cooldown Timer)
  useEffect(() => {
    if (aiWaitTime <= 0 || isGenerating || isResultPaused) return undefined;
    const cdTimer = setTimeout(
      () => setAiWaitTime((prev) => Math.max(0, prev - 1)),
      1000
    );
    return () => clearTimeout(cdTimer);
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // Quản lý Túi nháp & Ghi log lỗi sai
  const localPushToRetryBag = useCallback((questionData) => {
    if (!questionData || typeof callbacksRef.current?.addToRetryBag !== 'function') {
      return;
    }
    const payload = {
      ...questionData,
      term:
        questionData.oddWord ||
        (Array.isArray(questionData.words)
          ? questionData.words.join(' • ')
          : '')
    };
    callbacksRef.current.addToRetryBag('oddoneout', payload);
  }, []);

  const localRemoveFromRetryBag = useCallback((termToCheck, wordsArray) => {
    if (typeof callbacksRef.current?.removeFromRetryBag === 'function') {
      callbacksRef.current.removeFromRetryBag(
        'oddoneout',
        termToCheck,
        wordsArray
      );
    }
  }, []);

  const logMistake = useCallback((question) => {
    const onLogWrongFn = callbacksRef.current?.onLogWrong;
    if (typeof onLogWrongFn !== 'function' || !question) return;
    const baseData =
      (Array.isArray(question.originCards) && question.originCards[0]) || {};
    const wordsJoined = Array.isArray(question.words)
      ? question.words.join(' • ')
      : String(question.words || '');
    const cfg = configRef.current;

    const mistakeCard = {
      ...baseData,
      id:
        'mistake_' +
        String(Date.now()) +
        '_' +
        Math.random().toString(36).slice(2, 11),
      type: 'mistake',
      term: wordsJoined,
      definition: 'Từ khác loại: ' + String(question.oddWord || ''),
      analysis: String(question.explanation || ''),
      example:
        'Nhóm từ: ' +
        (Array.isArray(question.words)
          ? question.words.join(', ')
          : wordsJoined),
      tags: ['oddoneout', cfg.canonicalLevel || 'en_level_4', cfg.sourceMode || 'card'],
      timestamp: Date.now()
    };
    onLogWrongFn(mistakeCard);
  }, []);

  // Thoát ngang có kỷ luật + khóa hasExitedRef ngăn Auto-Save unmount ghi đè (Diệt S2 & S4)
  const handleSaveAndBack = useCallback(() => {
    const currentData = latestStateRef.current;
    let finalWrongCount = Number(currentData.wrongCount) || 0;
    let finalCombo = Math.max(1, Number(currentData.combo) || 1);
    const isSettled =
      currentData.checkStatus === 'success' ||
      currentData.checkStatus === 'failed';
    let needsNext = isSettled;

    if (!isSettled && currentData.currentQuestion) {
      localPushToRetryBag(currentData.currentQuestion);
      logMistake(currentData.currentQuestion);
      finalWrongCount += 1;
      finalCombo = 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const activeSource = configRef.current?.sourceMode || 'card';
    const cleanDeck =
      activeSource === 'ai_pure'
        ? []
        : sanitizeCardDeck([
            ...extractCleanBaseCardsFromQueue(coordinatorRef.current),
            ...(Array.isArray(currentData.deck) ? currentData.deck : [])
          ]);

    // Chốt cờ thoát trước khi gọi onBack để cleanup không ghi đè phạt thoát ngang
    hasExitedRef.current = true;
    isGameActiveRef.current = false;
    cleanupAuxTimers();
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    if (typeof callbacksRef.current?.onBack === 'function') {
      callbacksRef.current.onBack({
        oddOneOutState: {
          ...currentData,
          deck: cleanDeck,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [cleanupAuxTimers, localPushToRetryBag, logMistake, safeShowToast]);

  // ==========================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE - FETCH TASK)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    const cfg = configRef.current;
    /** @type {'en' | 'zh'} */
    const activeLang = cfg.lang === 'zh' ? 'zh' : 'en';
    const activeSource = cfg.sourceMode === 'ai_pure' ? 'ai_pure' : 'card';
    const activeAiMode = Boolean(cfg.isAiMode || activeSource === 'ai_pure');
    const activeLevelKey = toCanonicalLevelKey(cfg.level, activeLang);

    // 1. Đánh chặn 30%: Bốc từ túi nháp (Khóa Nguyên Tử Tầng 2 — ES Module trực tiếp)
    if (typeof pullRetryCardWithLock === 'function') {
      const pulledCard = pullRetryCardWithLock(
        'oddoneout',
        globalRetryBagRef.current,
        activeLang
      );
      const normalizedRetry = normalizeOddOneOutQuestion(pulledCard);
      if (normalizedRetry) return normalizedRetry;
    }

    const isPureMode = activeSource === 'ai_pure';
    const currentApiKey = resolveActiveApiKey(cfg.apiKey);
    const canCallAi = activeAiMode && Boolean(currentApiKey);

    // 2. AI PURE MODE: Tự động sinh 4 từ với 1 từ khác loại qua Máy Trộn Đề (Diệt C14 & C16)
    if (isPureMode && canCallAi && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: 'oddoneout_' + String(Date.now()),
          type: 'ioe_odd_one_out',
          lang: activeLang,
          level: activeLevelKey,
          topic: cfg.topic || '',
          dataMode: cfg.dataMode || 'vocab',
          mode: 'minigame'
        };
        const freshHistory = readFreshAiMemory();
        /** @type {any} */
        const qData = await ExamEngine.hydrateQuestion(
          meta,
          currentApiKey,
          freshHistory
        );

        const normalizedPure = normalizeOddOneOutQuestion(qData?.content);
        if (normalizedPure) {
          rememberWordsToAiMemory(normalizedPure.words, historyQueueRef);

          // Chỉ thu hoạch câu AI thật (chặn _isRescued) & gọi đúng chuẩn 2 tham số (Diệt C16)
          if (
            !normalizedPure._isRescued &&
            typeof callbacksRef.current?.onSaveToHarvest === 'function'
          ) {
            callbacksRef.current.onSaveToHarvest(activeLevelKey, {
              term: normalizedPure.oddWord,
              definition: normalizedPure.explanation,
              displaySentence: normalizedPure.words.join(' • '),
              targetWord: normalizedPure.oddWord,
              hint: normalizedPure.explanation,
              partOfSpeech: 'OddOneOut',
              topic: Array.isArray(cfg.topic)
                ? cfg.topic.join(', ')
                : String(cfg.topic || 'General'),
              level: activeLevelKey,
              language: activeLang
            });
          }

          if (isInitializingRef.current) {
            safeShowToast('Đang nạp đạn AI...', 'info');
          }
          return {
            ...normalizedPure,
            isAiGenerated: !normalizedPure._isRescued
          };
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e || '');
        console.warn('AI OddOneOut Pure Fallback:', errMsg);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề OddOneOut AI', e);
        }
      }
    }

    // 2.5 HYBRID AI MODE (Thử thách AI với Thẻ gốc làm hạt giống)
    if (!isPureMode && activeAiMode && currentApiKey && AiFactoryEngine) {
      /** @type {Record<string, any> | null} */
      let poppedCard = null;
      try {
        if (deckRef.current.length === 0) {
          let validCards = sanitizeCardDeck(enrichedCardsRef.current);
          if (validCards.length < 4 && FallbackDataEngine?.getFallbackData) {
            const fbItems = FallbackDataEngine.getFallbackData(
              activeLang,
              'vocab',
              activeLevelKey,
              20
            );
            if (Array.isArray(fbItems) && fbItems.length > 0) {
              validCards = sanitizeCardDeck([...validCards, ...fbItems]);
            }
          }
          deckRef.current =
            Utils && typeof Utils.shuffleArray === 'function'
              ? Utils.shuffleArray(validCards)
              : [...validCards];
        }

        poppedCard = deckRef.current.shift() || null;
        if (poppedCard && poppedCard.term) {
          // [CƠ CHẾ JIT ENRICHMENT] Gọi đủ 7 tham số & cập nhật bất biến toàn bộ bộ thẻ (Diệt C13)
          if (!poppedCard.definition || String(poppedCard.definition).trim() === '') {
            try {
              if (typeof fillCardWithAi === 'function') {
                /** @type {any} */
                const enriched = await fillCardWithAi(
                  poppedCard.term,
                  activeLang,
                  currentApiKey,
                  ['definition', 'pronunciation'],
                  'vocab',
                  [activeLevelKey],
                  poppedCard
                );
                if (enriched && typeof enriched === 'object') {
                  const updatedCard = {
                    ...poppedCard,
                    ...enriched,
                    is_enriched: true
                  };
                  poppedCard = updatedCard;

                  // Cập nhật bất biến trên toàn bộ enrichedCardsRef (TUYỆT ĐỐI KHÔNG gửi mảng 1 thẻ!)
                  const prevList = Array.isArray(enrichedCardsRef.current)
                    ? enrichedCardsRef.current
                    : [];
                  const targetNorm = normalizeOddWordKey(updatedCard.term);
                  let foundMatch = false;
                  const nextCards = prevList.map((item) => {
                    if (!item || typeof item !== 'object') return item;
                    const isSameId =
                      updatedCard.id !== undefined &&
                      item.id !== undefined &&
                      item.id === updatedCard.id;
                    const isSameTerm =
                      targetNorm !== '' &&
                      normalizeOddWordKey(item.term) === targetNorm;
                    if (isSameId || isSameTerm) {
                      foundMatch = true;
                      return { ...item, ...updatedCard };
                    }
                    return item;
                  });

                  if (
                    foundMatch &&
                    typeof callbacksRef.current?.onUpdateCards === 'function'
                  ) {
                    enrichedCardsRef.current = nextCards;
                    callbacksRef.current.onUpdateCards(nextCards);
                  }

                  if (enriched._tokenUsage?.totalTokenCount) {
                    safeAddTotalTokens(enriched._tokenUsage.totalTokenCount);
                  }
                }
              }
            } catch (e) {
              console.warn('JIT Enrich failed for OddOneOut Hybrid:', e);
              poppedCard = {
                ...poppedCard,
                definition: poppedCard.definition || 'Từ vựng ngẫu nhiên'
              };
            }
          }

          const historyPrompt =
            typeof AiFactoryEngine.getHistoryPrompt === 'function'
              ? AiFactoryEngine.getHistoryPrompt(historyQueueRef.current)
              : '';
          const hybridPrompt =
            String(historyPrompt || '') +
            '\nCRITICAL REQUIREMENT: You MUST include the exact word/phrase "' +
            String(poppedCard.term) +
            '" (Meaning: ' +
            String(poppedCard.definition || 'Unknown') +
            ') as one of the 4 items in your array. It can be the odd one out, or one of the 3 similar items.';

          const { loadingTimeMs } = getSafeAiRuntimeConfig();
          const hybridTimeoutMs = Math.max(15000, loadingTimeMs);

          let timeoutId = null;
          /** @type {any} */
          let parsedResult = null;
          try {
            const aiPromise = AiFactoryEngine.forgeMatrix(
              'odd_one_out',
              activeLevelKey,
              activeLang,
              currentApiKey,
              cfg.topic,
              hybridPrompt,
              cfg.dataMode || 'vocab'
            );
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(
                () => reject(new Error('AI Hybrid Timeout')),
                hybridTimeoutMs
              );
            });
            parsedResult = await Promise.race([aiPromise, timeoutPromise]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }

          const normalizedHybrid = normalizeOddOneOutQuestion(parsedResult);
          if (normalizedHybrid) {
            rememberWordsToAiMemory(normalizedHybrid.words, historyQueueRef);

            if (parsedResult?._tokenUsage?.totalTokenCount) {
              safeAddTotalTokens(parsedResult._tokenUsage.totalTokenCount);
            }

            if (
              !normalizedHybrid._isRescued &&
              typeof callbacksRef.current?.onSaveToHarvest === 'function'
            ) {
              callbacksRef.current.onSaveToHarvest(activeLevelKey, {
                term: normalizedHybrid.oddWord,
                definition: normalizedHybrid.explanation,
                displaySentence: normalizedHybrid.words.join(' • '),
                targetWord: normalizedHybrid.oddWord,
                hint: normalizedHybrid.explanation,
                partOfSpeech: 'OddOneOut',
                topic: Array.isArray(cfg.topic)
                  ? cfg.topic.join(', ')
                  : String(cfg.topic || 'General'),
                level: activeLevelKey,
                language: activeLang
              });
            }

            if (isInitializingRef.current) {
              aiGeneratedCountRef.current += 1;
              safeShowToast(
                'Đã nạp xong câu ' +
                  String(aiGeneratedCountRef.current) +
                  ' bằng AI...',
                'success'
              );
            }

            return {
              ...normalizedHybrid,
              originCards: [poppedCard],
              isAiGenerated: true
            };
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e || '');
        console.warn('Hybrid AI OddOneOut Fallback:', errMsg);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse OddOneOut Hybrid AI', e);
        }
        if (poppedCard) deckRef.current.unshift(poppedCard);
      }
    }

    // 3. THẺ GỐC HOẶC KHO TỔNG OFFLINE (Khi không bật AI hoặc AI mất kết nối)
    if (GameAlgoEngine?.OddOneOutEngine?.offline_generate) {
      const cleanDeck = sanitizeCardDeck(enrichedCardsRef.current).filter(
        (c) => typeof c.definition === 'string' && c.definition.trim() !== ''
      );
      /** @type {any} */
      const offlineResult = GameAlgoEngine.OddOneOutEngine.offline_generate(
        cleanDeck,
        activeLang
      );
      const normalizedOffline = normalizeOddOneOutQuestion(offlineResult);
      if (normalizedOffline) {
        rememberWordsToAiMemory(normalizedOffline.words, historyQueueRef);
        return { ...normalizedOffline, isAiGenerated: false };
      }
    }

    // 4. CỨU HỘ KHẨN CẤP TĨNH
    /** @type {any} */
    const fbResult = FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'oddoneout',
          activeLang,
          activeLevelKey,
          cfg
        )
      : null;
    const normalizedFb = normalizeOddOneOutQuestion(fbResult);
    if (normalizedFb) {
      return { ...normalizedFb, isAiGenerated: false, _isRescued: true };
    }

    return createHardEmergencyOddQuestion(activeLang);
  }, [safeShowToast]);

  // Helper lấy câu dự phòng khi Queue cạn đạn
  const getRescuedQuestion = useCallback((contextLabel) => {
    const cfg = configRef.current;
    /** @type {'en' | 'zh'} */
    const activeLang = cfg.lang === 'zh' ? 'zh' : 'en';
    const activeLevelKey = toCanonicalLevelKey(cfg.level, activeLang);

    if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
      window.logSystemEvent(contextLabel, 'Kích hoạt Hard Fallback');
    }
    safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');

    const fbRaw = FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'oddoneout',
          activeLang,
          activeLevelKey,
          cfg
        )
      : null;
    return (
      normalizeOddOneOutQuestion(fbRaw) ||
      createHardEmergencyOddQuestion(activeLang)
    );
  }, [safeShowToast]);

  // ==========================================================================
  // KHỞI ĐỘNG & PHỤC HỒI PHIÊN CHƠI (CHUẨN REACT 18 STRICTMODE — DIỆT C15)
  // ==========================================================================
  useEffect(() => {
    let cancelled = false;
    hasExitedRef.current = false;
    isGameActiveRef.current = true;

    // Trì hoãn 50ms để chống React 18 StrictMode double-mount kích hoạt _triggerZombieKiller
    const bootTimer = setTimeout(() => {
      if (cancelled) return;

      const cfg = configRef.current;
      /** @type {'en' | 'zh'} */
      const activeLang = cfg.lang === 'zh' ? 'zh' : 'en';
      const activeSource = cfg.sourceMode === 'ai_pure' ? 'ai_pure' : 'card';
      const activeAiMode = Boolean(cfg.isAiMode || activeSource === 'ai_pure');
      const activeLevelKey = toCanonicalLevelKey(cfg.level, activeLang);
      const activeLimit = Number(cfg.timeLimit) > 0 ? Number(cfg.timeLimit) : 15;
      const { loadingTimeMs, maxAmmo } = getSafeAiRuntimeConfig();
      const isOfflineFastTrack = activeSource === 'card' && !activeAiMode;

      const startGameClock = () => {
        if (gameTimerRef.current) clearInterval(gameTimerRef.current);
        gameTimerRef.current = setInterval(() => {
          if (isGameActiveRef.current && !hasExitedRef.current) {
            setTime((prev) => prev + 1);
          }
        }, 1000);
      };

      const mountCoordinator = () => {
        if (coordinatorRef.current) {
          coordinatorRef.current.destroy();
          coordinatorRef.current = null;
        }
        if (QueueEngine?.createQueueCoordinator) {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            maxAmmo
          );
          return true;
        }
        return false;
      };

      const savedSession = cfg.savedState?.oddOneOutState || null;

      if (savedSession) {
        // Phục hồi deck sạch từ phiên đã lưu
        if (activeSource === 'card') {
          let restoredDeck = [];
          if (Array.isArray(savedSession.deck)) {
            if (
              savedSession.deck.length > 0 &&
              typeof savedSession.deck[0] === 'number'
            ) {
              const sourceList = enrichedCardsRef.current || [];
              restoredDeck = sanitizeCardDeck(
                savedSession.deck.map((idx) => sourceList[idx]).filter(Boolean)
              );
            } else {
              restoredDeck = sanitizeCardDeck(savedSession.deck);
            }
          }
          deckRef.current = restoredDeck;
        } else {
          deckRef.current = [];
        }

        if (!mountCoordinator()) {
          safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
          setIsGenerating(false);
          return;
        }

        const resumeNeedsNext = Boolean(
          savedSession._needsNextOnResume ||
            savedSession.checkStatus === 'success' ||
            savedSession.checkStatus === 'failed' ||
            !savedSession.currentQuestion
        );

        if (resumeNeedsNext) {
          coordinatorRef.current
            .maintain(false, loadingTimeMs, isOfflineFastTrack)
            .catch((err) => {
              console.warn('OddOneOut Resume maintain error:', err);
            })
            .then(() => {
              if (cancelled || !isGameActiveRef.current || hasExitedRef.current) {
                return;
              }
              let data = coordinatorRef.current
                ? coordinatorRef.current.pop()
                : null;
              if (!data) {
                data = getRescuedQuestion(
                  'Queue cạn đạn lúc Resume Game Từ Khác Loại'
                );
              }
              const readyQ = applyOddWordAntiStreak(data, streakTrackerRef);
              if (readyQ) {
                setCurrentQuestion(readyQ);
                setSelectedIndex(null);
                setCheckStatus('idle');
                setAttempts(0);
                setIsGenerating(false);
                setTimeLeft(activeLimit);
                const currentCooldown =
                  activeSource === 'ai_pure' || activeAiMode
                    ? getConfiguredUiCooldown(9)
                    : 0;
                setAiWaitTime(currentCooldown);
              } else {
                safeShowToast('Lỗi tải dữ liệu. Buộc kết thúc.', 'error');
                setIsGenerating(false);
                handleEndGameInternal({
                  correct: Number(savedSession.correctCount) || 0,
                  time: Number(savedSession.time) || 0,
                  wrong: Number(savedSession.wrongCount) || 0
                });
              }
            });
        } else {
          // Nạp đạn ngầm không chặn UI khi resume giữa câu đang chơi
          coordinatorRef.current
            .maintain(false, loadingTimeMs, isOfflineFastTrack)
            .catch((err) => {
              console.warn('OddOneOut Background maintain error:', err);
            });
        }

        startGameClock();
        return;
      }

      // Khởi tạo ván chơi mới hoàn toàn
      const runStartNewGame = async () => {
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

        if (activeSource === 'card') {
          let validCards = sanitizeCardDeck(enrichedCardsRef.current);
          if (validCards.length < 4) {
            safeShowToast(
              'Bộ thẻ không đủ 4 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
              'warning'
            );
            if (FallbackDataEngine?.getFallbackData) {
              const fbItems = FallbackDataEngine.getFallbackData(
                activeLang,
                'vocab',
                activeLevelKey,
                20
              );
              if (Array.isArray(fbItems) && fbItems.length > 0) {
                validCards = sanitizeCardDeck([...validCards, ...fbItems]);
              }
            }
            if (validCards.length < 4) {
              const defaults =
                activeLang === 'zh'
                  ? [
                      { term: '苹果', definition: 'Quả táo', partOfSpeech: 'Noun' },
                      { term: '香蕉', definition: 'Quả chuối', partOfSpeech: 'Noun' },
                      { term: '橙子', definition: 'Quả cam', partOfSpeech: 'Noun' },
                      { term: '小猫', definition: 'Con mèo', partOfSpeech: 'Animal' }
                    ]
                  : [
                      { term: 'Apple', definition: 'Quả táo', partOfSpeech: 'Noun' },
                      { term: 'Banana', definition: 'Quả chuối', partOfSpeech: 'Noun' },
                      { term: 'Orange', definition: 'Quả cam', partOfSpeech: 'Noun' },
                      { term: 'Cat', definition: 'Con mèo', partOfSpeech: 'Animal' }
                    ];
              validCards = sanitizeCardDeck([...validCards, ...defaults]);
            }
          }
          deckRef.current =
            Utils && typeof Utils.shuffleArray === 'function'
              ? Utils.shuffleArray(validCards)
              : [...validCards];
        } else {
          deckRef.current = [];
        }

        if (!mountCoordinator()) {
          safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
          setIsGenerating(false);
          isInitializingRef.current = false;
          return;
        }

        try {
          await coordinatorRef.current.maintain(
            true,
            loadingTimeMs,
            isOfflineFastTrack
          );
        } catch (err) {
          console.warn('OddOneOut initial maintain error:', err);
        }

        if (cancelled || !isGameActiveRef.current || hasExitedRef.current) {
          return;
        }

        let firstData = coordinatorRef.current
          ? coordinatorRef.current.pop()
          : null;
        if (!firstData) {
          firstData = getRescuedQuestion(
            'Queue cạn đạn lúc khởi tạo Game Từ Khác Loại'
          );
        }

        const readyFirst = applyOddWordAntiStreak(firstData, streakTrackerRef);
        if (readyFirst) {
          setCurrentQuestion(readyFirst);
          setSelectedIndex(null);
          setCheckStatus('idle');
          setAttempts(0);
          setIsGenerating(false);
          isInitializingRef.current = false;
          setTimeLeft(activeLimit);

          const currentCooldown =
            activeSource === 'ai_pure' || activeAiMode
              ? getConfiguredUiCooldown(9)
              : 0;
          setAiWaitTime(currentCooldown);
          safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
          startGameClock();
        } else {
          safeShowToast(
            'Lỗi nghiêm trọng khi tải dữ liệu. Buộc kết thúc.',
            'error'
          );
          setIsGenerating(false);
          isInitializingRef.current = false;
          handleEndGameInternal({
            correct: Number(latestStateRef.current.correctCount) || 0,
            time: Number(latestStateRef.current.time) || 0,
            wrong: Number(latestStateRef.current.wrongCount) || 0
          });
        }
      };

      runStartNewGame();
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      isGameActiveRef.current = false;
      cleanupAuxTimers();
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
    cleanupAuxTimers,
    fetchTask,
    getRescuedQuestion,
    handleEndGameInternal,
    safeShowToast
  ]);

  // ==========================================================================
  // CHUYỂN VÒNG & TƯƠNG TÁC NGƯỜI DÙNG
  // ==========================================================================
  const proceedToNext = useCallback(
    (defaultDelaySec) => {
      if (!isGameActiveRef.current || hasExitedRef.current) return;
      let delaySec = Number(defaultDelaySec) || 6;
      if (aiWaitTime > delaySec) {
        delaySec = aiWaitTime;
      }
      if (delaySec < 1) delaySec = 1;
      setResultTimer(delaySec);
    },
    [aiWaitTime]
  );

  const nextRound = useCallback(() => {
    if (isGenerating || !isGameActiveRef.current || hasExitedRef.current) return;
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }

    const cfg = configRef.current;
    const activeSource = cfg.sourceMode === 'ai_pure' ? 'ai_pure' : 'card';
    const activeAiMode = Boolean(cfg.isAiMode || activeSource === 'ai_pure');
    const activeLimit = Number(cfg.timeLimit) > 0 ? Number(cfg.timeLimit) : 15;
    const { loadingTimeMs } = getSafeAiRuntimeConfig();
    const isOfflineFastTrack = activeSource === 'card' && !activeAiMode;

    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      const readyNext = applyOddWordAntiStreak(
        nextData || getRescuedQuestion('Câu hỏi trống khi pop vòng mới'),
        streakTrackerRef
      );
      setCurrentQuestion(readyNext);
      setSelectedIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setTimeLeft(activeLimit);

      const currentCooldown =
        activeSource === 'ai_pure' || activeAiMode
          ? getConfiguredUiCooldown(9)
          : 0;
      setAiWaitTime(currentCooldown);
      scheduleAutoSave();
      return;
    }

    setIsGenerating(true);
    const maintainPromise = coordinatorRef.current
      ? coordinatorRef.current.maintain(false, loadingTimeMs, isOfflineFastTrack)
      : Promise.resolve();

    maintainPromise
      .catch((err) => {
        console.warn('OddOneOut nextRound maintain error:', err);
      })
      .then(() => {
        if (!isGameActiveRef.current || hasExitedRef.current) return;
        let data = coordinatorRef.current ? coordinatorRef.current.pop() : null;
        if (!data) {
          data = getRescuedQuestion(
            'Queue cạn đạn lúc chuyển vòng Game Từ Khác Loại'
          );
        }

        const readyNext = applyOddWordAntiStreak(data, streakTrackerRef);
        if (readyNext) {
          setCurrentQuestion(readyNext);
          setSelectedIndex(null);
          setCheckStatus('idle');
          setAttempts(0);
          setIsGenerating(false);
          setTimeLeft(activeLimit);

          const currentCooldown =
            activeSource === 'ai_pure' || activeAiMode
              ? getConfiguredUiCooldown(9)
              : 0;
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
      });
  }, [
    getRescuedQuestion,
    handleEndGameInternal,
    isGenerating,
    safeShowToast,
    scheduleAutoSave
  ]);

  const handleOptionClick = useCallback(
    (idx) => {
      if (
        checkStatus === 'success' ||
        checkStatus === 'failed' ||
        isGenerating ||
        !currentQuestion ||
        !Array.isArray(currentQuestion.words) ||
        idx < 0 ||
        idx >= currentQuestion.words.length
      ) {
        return;
      }

      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }

      const clickedWord = currentQuestion.words[idx];
      setSelectedIndex(idx);

      const isCorrect =
        normalizeOddWordKey(clickedWord) !== '' &&
        normalizeOddWordKey(clickedWord) ===
          normalizeOddWordKey(currentQuestion.oddWord);

      if (isCorrect) {
        if (attempts === 0) {
          localRemoveFromRetryBag(
            currentQuestion.oddWord,
            currentQuestion.words
          );
        }
        setCheckStatus('success');
        setCorrectCount((p) => p + 1);
        setScore((p) => p + 15 * combo);
        setCombo((p) => p + 1);
        safeShowToast('Xuất sắc!', 'success');
        proceedToNext(6);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setCombo(1);
        setScore((p) => Math.max(0, p - 5));

        if (newAttempts >= 2) {
          localPushToRetryBag(currentQuestion);
          setCheckStatus('failed');
          setWrongCount((p) => p + 1);
          safeShowToast('Đã hết lượt!', 'error');
          logMistake(currentQuestion);
          proceedToNext(8);
        } else {
          setCheckStatus('wrong_retry');
          safeShowToast(
            'Chưa đúng! Còn ' + String(2 - newAttempts) + ' lượt.',
            'warning'
          );
          // Reset cả selectedIndex lẫn checkStatus sau 1000ms (Diệt S14)
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
      checkStatus === 'success' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return;
    }
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(8);
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

  // Động cơ đếm ngược thời gian mỗi câu (Pure updater — không side-effect trong setState)
  useEffect(() => {
    if (
      !timerMode ||
      checkStatus === 'success' ||
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

  // Xử lý khi hết giờ
  useEffect(() => {
    if (
      !timerMode ||
      timeLeft !== 0 ||
      checkStatus === 'success' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      if (!isGameActiveRef.current || hasExitedRef.current) return;
      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }
      localPushToRetryBag(currentQuestion);
      setCombo(1);
      setAttempts(2);
      setCheckStatus('failed');
      setWrongCount((p) => p + 1);
      safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
      logMistake(currentQuestion);
      proceedToNext(8);
      scheduleAutoSave();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [
    timeLeft,
    timerMode,
    checkStatus,
    isGenerating,
    currentQuestion,
    logMistake,
    safeShowToast,
    scheduleAutoSave,
    localPushToRetryBag,
    proceedToNext
  ]);

  // Tự động chuyển câu khi hết thời gian chờ kết quả
  useEffect(() => {
    const isSettled = checkStatus === 'success' || checkStatus === 'failed';
    if (!isSettled || isResultPaused || isGenerating) return undefined;

    if (resultTimer > 0) {
      const id = setTimeout(
        () => setResultTimer((prev) => Math.max(0, prev - 1)),
        1000
      );
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => nextRound(), 0);
    return () => clearTimeout(id);
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((p) => !p);
  }, []);

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
    handleSaveAndBack,
    handleEndGameInternal,
    aiWaitTime
  };
};

// ============================================================================
// 2. GAME WRAPPER COMPONENT (ODD ONE OUT GAME)
// ============================================================================
/**
 * @param {{
 *   cards?: Record<string, any>[],
 *   t?: Record<string, any>,
 *   onFinish?: (correct: number, time: number, wrong: number) => void,
 *   onQuit?: (sessionData: Record<string, any>) => void,
 *   onEndGame?: (stats: { correct: number, time: number, wrong: number }) => void,
 *   onBack?: (sessionData: Record<string, any>) => void,
 *   mainColor?: string,
 *   lang?: string,
 *   isAiMode?: boolean,
 *   apiKey?: string,
 *   onBookmark?: (payload: Record<string, any>) => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   notebook?: Record<string, any>[],
 *   onLogWrong?: (card: Record<string, any>) => void,
 *   settings?: Record<string, any>,
 *   config?: Record<string, any>,
 *   onUpdateCards?: (cards: Record<string, any>[]) => void,
 *   onSaveToHarvest?: (levelKey: string, data: Record<string, any>) => void,
 *   savedState?: Record<string, any>,
 *   onAutoSave?: (data: Record<string, any>) => void,
 *   onPlay?: (text: string) => void,
 *   speak?: (text: string, arg2?: any, arg3?: any, onDone?: any) => void,
 *   stopSpeaking?: () => void,
 *   showToast?: (msg: string, type?: string) => void,
 *   currentLevel?: string | string[],
 *   currentTopic?: string | string[],
 *   dataMode?: string,
 *   globalRetryBag?: Record<string, any>,
 *   addToRetryBag?: (gameType: string, data: Record<string, any>) => void,
 *   removeFromRetryBag?: (gameType: string, term: string, extra?: any) => void
 * }} props
 */
export const OddOneOutGame = ({
  cards = [],
  t = undefined,
  onFinish = undefined,
  onQuit = undefined,
  onEndGame: propOnEndGame = undefined,
  onBack: propOnBack = undefined,
  mainColor = 'pink',
  lang = 'en',
  isAiMode = false,
  apiKey = '',
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = [],
  onLogWrong = undefined,
  settings = undefined,
  config = undefined,
  onUpdateCards = undefined,
  onSaveToHarvest = undefined,
  savedState = undefined,
  onAutoSave = undefined,
  onPlay = undefined,
  speak = undefined,
  stopSpeaking = undefined,
  showToast = undefined,
  currentLevel = undefined,
  currentTopic = undefined,
  dataMode = 'vocab',
  globalRetryBag = undefined,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined
}) => {
  /** @type {'en' | 'zh'} */
  const safeLang = lang === 'zh' ? 'zh' : 'en';

  // Dừng giọng đọc khi thoát game
  useEffect(() => {
    return () => {
      if (typeof stopSpeaking === 'function') {
        stopSpeaking();
      } else if (
        typeof window !== 'undefined' &&
        window.speechSynthesis &&
        typeof window.speechSynthesis.cancel === 'function'
      ) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopSpeaking]);

  const handleEndGame = useCallback(
    (stats) => {
      const safeCorrect = Number(stats?.correct) || 0;
      const safeTime = Number(stats?.time) || 0;
      const safeWrong = Number(stats?.wrong) || 0;
      if (typeof onFinish === 'function') {
        onFinish(safeCorrect, safeTime, safeWrong);
      } else if (typeof propOnEndGame === 'function') {
        propOnEndGame({
          correct: safeCorrect,
          time: safeTime,
          wrong: safeWrong
        });
      }
    },
    [onFinish, propOnEndGame]
  );

  const handleQuit = useCallback(
    (sessionData) => {
      if (typeof propOnBack === 'function') {
        propOnBack(sessionData);
      } else if (typeof onQuit === 'function') {
        onQuit(sessionData);
      }
    },
    [propOnBack, onQuit]
  );
/** @type {Record<string, any>} */
  const safeConfig = useMemo(() => {
    const base = config && typeof config === 'object' ? config : {};
    return {
      ...base,
      level: base.level || currentLevel || safeLang + '_level_4',
      topic: base.topic !== undefined ? base.topic : currentTopic || '',
      dataMode: base.dataMode || dataMode || 'vocab',
      sourceMode: base.sourceMode === 'ai_pure' ? 'ai_pure' : 'card'
    };
  }, [config, currentLevel, currentTopic, dataMode, safeLang]);

  const effectiveAiMode =
    safeConfig.sourceMode === 'ai_pure' ||
    Boolean(safeConfig.aiMode) ||
    Boolean(isAiMode);

  const hookConfig = useMemo(
    () => ({
      ...safeConfig,
      isAiMode: effectiveAiMode,
      apiKey,
      lang: safeLang,
      timeLimit: Number(safeConfig.timeLimit) > 0 ? Number(safeConfig.timeLimit) : 15,
      savedState,
      globalRetryBag
    }),
    [safeConfig, effectiveAiMode, apiKey, safeLang, savedState, globalRetryBag]
  );

  const hookCallbacks = useMemo(
    () => ({
      showToast,
      onLogWrong,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      onBack: handleQuit,
      addToRetryBag,
      removeFromRetryBag,
      onEndGame: handleEndGame
    }),
    [
      showToast,
      onLogWrong,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      handleQuit,
      addToRetryBag,
      removeFromRetryBag,
      handleEndGame
    ]
  );

  const logic = useOddOneOutLogic(cards, hookConfig, hookCallbacks);

  // Đối khớp Bookmark chính xác theo Unicode NFC (không dùng .includes() báo nhầm — Diệt S13)
  const notebookKeySet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(notebook)) {
      for (let i = 0; i < notebook.length; i += 1) {
        const key = normalizeOddWordKey(notebook[i]?.term);
        if (key) set.add(key);
      }
    }
    return set;
  }, [notebook]);

  const isBookmarked = Boolean(
    logic.currentQuestion?.oddWord &&
      notebookKeySet.has(normalizeOddWordKey(logic.currentQuestion.oddWord))
  );

  // Nối thẳng speak từ GameView Ver 1.4 & xóa nhánh 'vi-VN' (Diệt C14)
  const safeOnPlay = useCallback(
    (text) => {
      const cleanText = String(text || '').trim();
      if (!cleanText) return;
      if (typeof onPlay === 'function') {
        onPlay(cleanText);
        return;
      }
      if (typeof speak === 'function') {
        speak(cleanText, null, null, null);
        return;
      }
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(cleanText);
      u.lang = safeLang === 'zh' ? 'zh-CN' : 'en-US';
      window.speechSynthesis.speak(u);
    },
    [onPlay, speak, safeLang]
  );

  const handleSaveToNotebookInternal = useCallback(
    (payload) => {
      if (typeof onBookmark === 'function') {
        onBookmark(payload);
      } else if (typeof onSaveToNotebook === 'function') {
        onSaveToNotebook(payload);
      } else if (typeof showToast === 'function') {
        showToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      } else if (
        typeof window !== 'undefined' &&
        typeof window.globalShowToast === 'function'
      ) {
        window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    },
    [onBookmark, onSaveToNotebook, showToast]
  );

  return (
    <OddOneOutPlayScreen
      t={t}
      mainColor={mainColor}
      config={{ ...safeConfig, aiMode: effectiveAiMode }}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={logic.handleEndGameInternal}
      onSaveToNotebook={handleSaveToNotebookInternal}
      isBookmarked={isBookmarked}
      settings={settings}
      onPlay={safeOnPlay}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_13_useOddOneOutLogic = useOddOneOutLogic;
  window.useOddOneOutLogic = useOddOneOutLogic;
  window.Block5_13_OddOneOutGame = OddOneOutGame;
  window.OddOneOutGame = OddOneOutGame;
}

export default OddOneOutGame;