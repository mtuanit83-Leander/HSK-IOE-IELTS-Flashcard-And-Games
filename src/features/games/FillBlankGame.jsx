// ============================================================================
// FILE 59/85: src/features/games/FillBlankGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.9 - FillBlank Logic & Wrapper)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 23:03 (GMT+7)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Điền Từ (useFillBlankLogic &
//           FillBlankGame): đục lỗ 3 ma trận AI Pure / AI Mask / Offline,
//           chấm điểm Pinyin chuẩn xác EN/ZH, Hell Mode (x3 điểm / 15s) và
//           Auto-Save/Resume không rò rỉ.
//           Nâng cấp Ver 1.0 (Lượt 4.2 – Xóa sổ nhánh 'vi' cuối cùng R06A = 0):
//           1. Diệt 1H (R06A) & 1M (R05) Radar: Xóa bỏ nhánh 'vi' cuối cùng
//              của dự án; thay localStorage.setItem('fc_ai_memory') bằng
//              AiMemoryManager + Utils.safeLocalStorageSet; đọc API Key 4 tầng
//              qua resolveActiveApiKey.
//           2. Diệt C1, C3, C4: Gỡ hasStartedRef deadlock StrictMode (bootTimer
//              50ms + cancelled token); hỗ trợ BLANK_TOKEN_REGEX 8/10 gạch;
//              hồi sinh 100% nhánh ai_mask (nhận dataMode + tự nhận diện câu,
//              clearTimeout trong finally, fallback offline không return null).
//           3. Diệt S1, S2, S3, S4, S5, S16: Khóa hasExitedRef triệt tiêu lỗi
//              xóa phạt thoát ngang & Ghost Session khi bấm Kết thúc; quản lý
//              toàn bộ timers qua refs; chấm Pinyin chuẩn 1-1 qua comparePinyin
//              (xóa .includes() gian lận); trích deck sạch chống ô nhiễm khi
//              Resume; bọc try/catch toàn tuyến maintain().
//           4. Diệt C2, C16 & 0 Problems tsc: Chuẩn hóa onSaveToHarvest 2 tham
//              số, showToast(text, type), nối speak/onPlay & isBookmarked NFC.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { FillBlankPlayScreen } from './FillBlankUI';
import {
  resolveActiveApiKey,
  getSafeLevelString,
  getConfiguredUiCooldown
} from './common/gameHelpers';

const BLANK_TOKEN_REGEX = /\[_{2,}\]/g;
const DEFAULT_BLANK = '[__________]';
const CJK_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
const LATIN_ONLY_REGEX = /^[a-zA-Z\s']+$/;

/**
 * Chuẩn hóa ngôn ngữ học chỉ chấp nhận 'en' | 'zh'
 * @param {any} lang
 * @returns {'en' | 'zh'}
 */
const toSafeLang = (lang) => (lang === 'zh' ? 'zh' : 'en');

/**
 * Chuẩn hóa chuỗi phục vụ so sánh khử trùng NFC (bỏ dấu gạch chân kết hợp \u0332)
 * @param {any} value
 * @returns {string}
 */
const normalizeCompareKey = (value) => {
  return String(value || '')
    .replace(/\u0332/g, '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
};

/**
 * Thay thế mọi mẫu đục lỗ [________] / [__________] bằng chuỗi đích
 * @param {string} sentence
 * @param {string} replacement
 * @returns {string}
 */
const replaceBlankTokens = (sentence, replacement) => {
  const safeSentence = typeof sentence === 'string' ? sentence : '';
  const safeReplacement = typeof replacement === 'string' ? replacement : '';
  if (!safeSentence) return safeReplacement;
  BLANK_TOKEN_REGEX.lastIndex = 0;
  if (!BLANK_TOKEN_REGEX.test(safeSentence)) {
    BLANK_TOKEN_REGEX.lastIndex = 0;
    return safeSentence;
  }
  BLANK_TOKEN_REGEX.lastIndex = 0;
  return safeSentence.replace(BLANK_TOKEN_REGEX, () => safeReplacement);
};

/**
 * Nhận diện thẻ có dạng câu/cụm dài phù hợp cho AI đục lỗ (Cloze)
 * @param {string} term
 * @param {'en' | 'zh'} safeLang
 * @returns {boolean}
 */
const isSentenceLikeTerm = (term, safeLang) => {
  const clean = String(term || '').trim();
  if (!clean) return false;
  if (safeLang === 'zh') {
    const cjkMatches = clean.match(CJK_CHAR_REGEX);
    return Boolean((cjkMatches && cjkMatches.length >= 4) || clean.length >= 6);
  }
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length >= 3;
};

/**
 * Chuẩn hóa khóa cấp độ cho Kho thu hoạch AI (en_level_X / zh_level_X)
 * @param {string} levelStr
 * @param {'en' | 'zh'} safeLang
 * @returns {string}
 */
const toCanonicalHarvestLevelKey = (levelStr, safeLang) => {
  const str = String(levelStr || '').toLowerCase();
  const numMatch = str.match(/\d+/);
  const num = numMatch ? numMatch[0] : safeLang === 'zh' ? '1' : '4';
  return safeLang + '_level_' + num;
};

/**
 * Đọc timeout AI động từ fc_ai_config qua Utils.safeJsonParse
 * @param {number} fallbackMs
 * @returns {number}
 */
const getDynamicAiTimeoutMs = (fallbackMs = 22000) => {
  try {
    /** @type {Record<string, any>} */
    const aiCfg =
      Utils && typeof Utils.safeJsonParse === 'function'
        ? Utils.safeJsonParse('fc_ai_config', {})
        : {};
    const parsedSec = Number(aiCfg?.loadingTime);
    if (Number.isFinite(parsedSec) && parsedSec >= 5 && parsedSec <= 120) {
      return parsedSec * 1000 + 5000;
    }
  } catch {
    // Dùng giá trị mặc định
  }
  return fallbackMs;
};

/**
 * Ghi nhận từ/câu vào bộ nhớ AI toàn cục qua AiMemoryManager (fallback safeLocalStorageSet)
 * @param {string} term
 * @param {string[]} historyRefList
 */
const pushToAiMemorySafe = (term, historyRefList) => {
  const clean = String(term || '').trim();
  if (!clean) return;
  const cleanKey = normalizeCompareKey(clean);
  if (!cleanKey) return;

  const exists = historyRefList.some(
    (item) => normalizeCompareKey(item) === cleanKey
  );
  if (!exists) {
    historyRefList.push(clean);
    while (historyRefList.length > 400) {
      historyRefList.shift();
    }
  }

  if (AiMemoryManager && typeof AiMemoryManager.add === 'function') {
    AiMemoryManager.add(clean);
  } else if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_ai_memory', historyRefList);
  }
};

/**
 * Chuẩn hóa đối tượng câu hỏi Điền từ (bọc thép chống crash / rỗng)
 * @param {any} raw
 * @param {Record<string, any> | null} baseCard
 * @param {'en' | 'zh'} safeLang
 * @returns {Record<string, any> | null}
 */
const normalizeFillBlankQuestion = (raw, baseCard, safeLang) => {
  if (!raw || typeof raw !== 'object') return null;

  const origin =
    raw.origin && typeof raw.origin === 'object' ? raw.origin : baseCard || null;

  const targetWord = String(
    raw.targetWord || raw.answer || raw.missingWord || origin?.term || ''
  ).trim();
  if (!targetWord) return null;

  let displaySentence = String(
    raw.displaySentence || raw.sentence || raw.question || ''
  ).trim();

  if (!displaySentence) {
    displaySentence = DEFAULT_BLANK;
  } else {
    BLANK_TOKEN_REGEX.lastIndex = 0;
    if (!BLANK_TOKEN_REGEX.test(displaySentence)) {
      BLANK_TOKEN_REGEX.lastIndex = 0;
      const lowerSent = displaySentence.toLowerCase();
      const lowerTarget = targetWord.toLowerCase();
      const idx = lowerSent.indexOf(lowerTarget);
      if (idx >= 0) {
        displaySentence =
          displaySentence.slice(0, idx) +
          DEFAULT_BLANK +
          displaySentence.slice(idx + targetWord.length);
      } else {
        displaySentence = DEFAULT_BLANK;
      }
    } else {
      BLANK_TOKEN_REGEX.lastIndex = 0;
    }
  }

  const rawDistractors = Array.isArray(raw.distractors)
    ? raw.distractors
    : Array.isArray(raw.options)
      ? raw.options
      : [];

  /** @type {string[]} */
  const cleanDistractors = [];
  const seen = new Set([normalizeCompareKey(targetWord)]);
  for (let i = 0; i < rawDistractors.length; i += 1) {
    const item = rawDistractors[i];
    const txt =
      typeof item === 'string'
        ? item.trim()
        : item && typeof item === 'object' && typeof item.text === 'string'
          ? item.text.trim()
          : '';
    const key = normalizeCompareKey(txt);
    if (key && !seen.has(key)) {
      seen.add(key);
      cleanDistractors.push(txt);
    }
    if (cleanDistractors.length >= 3) break;
  }

  const hint = String(raw.hint || origin?.definition || '').trim();
  const explanation = String(raw.explanation || origin?.analysis || '').trim();

  // Xác định Pinyin riêng cho targetWord (không lấy bừa Pinyin cả câu dài gây gian lận)
  let targetPinyin = String(
    raw.targetPinyin || raw.wordPinyin || raw.pinyin || ''
  ).trim();
  if (
    !targetPinyin &&
    safeLang === 'zh' &&
    origin?.pronunciation &&
    normalizeCompareKey(origin.term) === normalizeCompareKey(targetWord)
  ) {
    targetPinyin = String(origin.pronunciation).trim();
  }

  return {
    ...raw,
    targetWord,
    displaySentence,
    distractors: cleanDistractors,
    hint,
    explanation,
    targetPinyin,
    origin,
    isAiGenerated: Boolean(raw.isAiGenerated),
    _isRescued: Boolean(raw._isRescued || origin?._isRescued)
  };
};

/**
 * Rút trích duy nhất các thẻ gốc sạch từ băng đạn chưa dùng (tránh trộn câu đã đục lỗ vào deck)
 * @param {any} coordinator
 * @param {string} sourceMode
 * @returns {Record<string, any>[]}
 */
const extractCleanBaseCardsFromQueue = (coordinator, sourceMode) => {
  if (sourceMode === 'ai_pure') return [];
  if (!coordinator || typeof coordinator.getPendingItems !== 'function') {
    return [];
  }
  const pending = coordinator.getPendingItems();
  if (!Array.isArray(pending) || pending.length === 0) return [];

  /** @type {Record<string, any>[]} */
  const cleanCards = [];
  const seen = new Set();

  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i];
    if (!item || typeof item !== 'object') continue;
    const candidate =
      item.origin && typeof item.origin === 'object' && item.origin.term
        ? item.origin
        : item.term && !item.displaySentence
          ? item
          : null;
    if (!candidate || typeof candidate.term !== 'string') continue;
    const key = normalizeCompareKey(candidate.term);
    if (key && !seen.has(key)) {
      seen.add(key);
      cleanCards.push(candidate);
    }
  }
  return cleanCards;
};

/**
 * Lọc danh sách deck sạch, loại bỏ phần tử hỏng/câu đục lỗ bị lưu nhầm từ phiên cũ
 * @param {any[]} rawList
 * @param {Record<string, any>[]} fallbackCards
 * @returns {Record<string, any>[]}
 */
const sanitizeDeckList = (rawList, fallbackCards) => {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  /** @type {Record<string, any>[]} */
  const result = [];
  const seen = new Set();

  for (let i = 0; i < rawList.length; i += 1) {
    const entry = rawList[i];
    let card = null;
    if (typeof entry === 'number') {
      card = Array.isArray(fallbackCards) ? fallbackCards[entry] : null;
    } else if (entry && typeof entry === 'object') {
      card =
        entry.origin && typeof entry.origin === 'object' && entry.origin.term
          ? entry.origin
          : entry.term
            ? entry
            : null;
    }
    if (!card || typeof card.term !== 'string' || !card.term.trim()) continue;
    const key = normalizeCompareKey(card.term);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(card);
    }
  }
  return result;
};

/**
 * Chuẩn hóa chuỗi đầu vào để chấm đáp án Điền Từ
 * @param {string} str
 * @param {'en' | 'zh'} safeLang
 * @returns {string}
 */
const normalizeFillAnswer = (str, safeLang) => {
  let s = String(str || '').toLowerCase();
  if (Utils && typeof Utils.advancedNormalize === 'function') {
    s = Utils.advancedNormalize(s, safeLang);
  } else {
    s = s.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  }
  return s.trim();
};

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (HOOK useFillBlankLogic)
// ============================================================================
/**
 * @param {Record<string, any>[]} cards
 * @param {Record<string, any>} config
 * @param {Record<string, any>} callbacks
 */
export const useFillBlankLogic = (cards, config = {}, callbacks = {}) => {
  const safeLang = toSafeLang(config?.lang);
  const sourceMode = config?.sourceMode === 'ai_pure' ? 'ai_pure' : 'card';
  const timerMode = Boolean(config?.timerMode);
  const isHellMode = config?.difficulty === 'hell';
  const rawLimit = Number(config?.timeLimit);
  const safeBaseLimit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 30;
  const effectiveTimeLimit = isHellMode
    ? Math.min(15, safeBaseLimit)
    : safeBaseLimit;

  const effectiveAiMode =
    sourceMode === 'ai_pure' ||
    (sourceMode === 'card' && Boolean(config?.aiChallenge)) ||
    Boolean(config?.isAiMode) ||
    Boolean(config?.aiMode);

  const safeLevelString = getSafeLevelString(
    config?.level,
    safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'
  );

  const savedFillBlank = config?.savedState?.fillBlankState || null;
  const hasRestorableQuestion = Boolean(
    savedFillBlank &&
      !savedFillBlank._needsNextOnResume &&
      savedFillBlank.currentQuestion
  );

  // Refs ổn định cho config & callbacks (chống stale closure & tránh tái tạo fetchTask)
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const configRef = useRef({});
  configRef.current = {
    ...config,
    lang: safeLang,
    sourceMode,
    timerMode,
    isHellMode,
    effectiveTimeLimit,
    effectiveAiMode,
    safeLevelString,
    dataMode: config?.dataMode || 'vocab',
    topic: config?.topic || '',
    apiKey: config?.apiKey || ''
  };

  /** @type {React.MutableRefObject<Record<string, any>>} */
  const callbacksRef = useRef({});
  callbacksRef.current = callbacks || {};

  // State Game Cơ bản (Khởi tạo lười từ savedState)
  const [currentQuestion, setCurrentQuestion] = useState(() =>
    hasRestorableQuestion
      ? normalizeFillBlankQuestion(
          savedFillBlank.currentQuestion,
          savedFillBlank.currentQuestion?.origin || null,
          safeLang
        )
      : null
  );
  const [inputBuffer, setInputBuffer] = useState(() =>
    hasRestorableQuestion ? String(savedFillBlank.inputBuffer || '') : ''
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    hasRestorableQuestion ? String(savedFillBlank.checkStatus || 'idle') : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    hasRestorableQuestion ? Number(savedFillBlank.attempts) || 0 : 0
  );
  const [score, setScore] = useState(() => Number(savedFillBlank?.score) || 0);
  const [combo, setCombo] = useState(() => Number(savedFillBlank?.combo) || 1);
  const [playedCount, setPlayedCount] = useState(
    () => Number(savedFillBlank?.playedCount) || 0
  );
  const [time, setTime] = useState(() => Number(savedFillBlank?.time) || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => Number(savedFillBlank?.correctCount) || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => Number(savedFillBlank?.wrongCount) || 0
  );
  const [isGenerating, setIsGenerating] = useState(
    () => !hasRestorableQuestion
  );
  const [aiAmmoCount, setAiAmmoCount] = useState(0);

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);

  // Đồng hồ đếm ngược từng câu (Cưỡng chế <= 15s cho Hell Mode)
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedTl = Number(savedFillBlank?.timeLeft);
    return Number.isFinite(savedTl) && savedTl >= 0
      ? Math.min(savedTl, effectiveTimeLimit)
      : effectiveTimeLimit;
  });

  // Biến Phanh UI (UI Cooldown)
  const [aiWaitTime, setAiWaitTime] = useState(() => {
    const savedWait = Number(savedFillBlank?.aiWaitTime);
    return Number.isFinite(savedWait) && savedWait >= 0 ? savedWait : 0;
  });

  // Refs quản lý bất đồng bộ & vòng đời StrictMode
  const enrichedCardsRef = useRef(Array.isArray(cards) ? cards : []);
  /** @type {React.MutableRefObject<Record<string, any>[]>} */
  const deckRef = useRef([]);
  const historyQueueRef = useRef(
    /** @type {string[]} */ (
      Utils && typeof Utils.safeJsonParse === 'function'
        ? Utils.safeJsonParse('fc_ai_memory', [])
        : []
    )
  );
  const coordinatorRef = useRef(/** @type {any} */ (null));
  const isGameActiveRef = useRef(true);
  const hasExitedRef = useRef(false);
  const gameTimerRef = useRef(/** @type {any} */ (null));
  const retryResetTimerRef = useRef(/** @type {any} */ (null));
  const autoSaveDebounceRef = useRef(/** @type {any} */ (null));
  const isInitializingRef = useRef(false);
  const globalRetryBagRef = useRef(config?.globalRetryBag);

  useEffect(() => {
    globalRetryBagRef.current = config?.globalRetryBag;
  }, [config?.globalRetryBag]);

  useEffect(() => {
    enrichedCardsRef.current = Array.isArray(cards) ? cards : [];
  }, [cards]);

  const clearTransientTimers = useCallback(() => {
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
          : 'Thông báo';
    if (!text) return;

    const cbShowToast = callbacksRef.current?.showToast;
    if (typeof cbShowToast === 'function') {
      cbShowToast(text, type);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
      window.globalShowToast(text, type);
    }
  }, []);

  // BỘ NÃO LƯU TRỮ VÀ AUTO-SAVE
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const latestStateRef = useRef({});
  useEffect(() => {
    latestStateRef.current = {
      currentQuestion,
      inputBuffer,
      checkStatus,
      attempts,
      score,
      combo,
      playedCount,
      time,
      correctCount,
      wrongCount,
      deck: deckRef.current,
      timeLeft,
      aiWaitTime
    };
  }, [
    currentQuestion,
    inputBuffer,
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
    const onAutoSaveFn = callbacksRef.current?.onAutoSave;
    if (
      hasExitedRef.current ||
      !isGameActiveRef.current ||
      typeof onAutoSaveFn !== 'function' ||
      !latestStateRef.current ||
      !latestStateRef.current.currentQuestion
    ) {
      return;
    }
    const currentData = latestStateRef.current;
    const modeNow = configRef.current.sourceMode;
    const pendingBaseCards = extractCleanBaseCardsFromQueue(
      coordinatorRef.current,
      modeNow
    );
    const mergedDeck =
      modeNow === 'ai_pure'
        ? []
        : sanitizeDeckList(
            [...pendingBaseCards, ...(currentData.deck || [])],
            enrichedCardsRef.current
          );

    const isAlreadySettled =
      currentData.checkStatus === 'correct' ||
      currentData.checkStatus === 'wrong';

    onAutoSaveFn({
      fillBlankState: {
        ...currentData,
        deck: mergedDeck,
        _needsNextOnResume: isAlreadySettled
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
    const intervalTimer = setInterval(() => {
      triggerAutoSave();
    }, 5000);
    return () => {
      clearInterval(intervalTimer);
      triggerAutoSave();
    };
  }, [triggerAutoSave]);

  // ĐỒNG HỒ QUÉT ĐẠN NGẦM (QUEUE SCANNER - ĐẾM TRUNG THỰC)
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (
        coordinatorRef.current &&
        typeof coordinatorRef.current.getPendingItems === 'function'
      ) {
        const pending = coordinatorRef.current.getPendingItems();
        const aiCount = Array.isArray(pending)
          ? pending.filter((item) => item && item.isAiGenerated).length
          : 0;
        setAiAmmoCount(aiCount);
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // ĐỒNG HỒ LÀM NGUỘI UI (UI COOLDOWN TIMER)
  useEffect(() => {
    /** @type {any} */
    let cdTimer = null;
    if (aiWaitTime > 0 && !isGenerating && !isResultPaused) {
      cdTimer = setTimeout(
        () => setAiWaitTime((prev) => Math.max(0, prev - 1)),
        1000
      );
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // BỘ NÃO TÚI NHÁP TOÀN CỤC (GLOBAL RETRY BAG LOGIC)
  const localPushToRetryBag = useCallback((questionData) => {
    const addFn = callbacksRef.current?.addToRetryBag;
    if (typeof addFn === 'function' && questionData) {
      const payload = {
        ...questionData,
        term:
          questionData.origin?.term ||
          questionData.targetWord ||
          questionData.displaySentence ||
          ''
      };
      addFn('fillblank', payload);
    }
  }, []);

  const localRemoveFromRetryBag = useCallback((termToCheck) => {
    const removeFn = callbacksRef.current?.removeFromRetryBag;
    if (typeof removeFn === 'function' && termToCheck) {
      removeFn('fillblank', termToCheck);
    }
  }, []);

  // Cỗ máy đóng gói Lỗi sai (Auto-Log)
  const logMistake = useCallback((question) => {
    const onLogWrongFn = callbacksRef.current?.onLogWrong;
    if (typeof onLogWrongFn !== 'function' || !question) return;

    const baseData =
      question.origin && typeof question.origin === 'object'
        ? question.origin
        : {};
    const targetWordStr = String(question.targetWord || '').trim();
    const underlinedTarget = targetWordStr
      ? targetWordStr
          .split('')
          .map((char) => char + '\u0332')
          .join('')
      : '';
    const displayStr = String(question.displaySentence || DEFAULT_BLANK);
    const sentenceWithUnderline = replaceBlankTokens(
      displayStr,
      underlinedTarget
    );
    const fullSentence = replaceBlankTokens(displayStr, targetWordStr);

    const mistakeCard = {
      ...baseData,
      id:
        'mistake_' +
        Date.now() +
        '_' +
        Math.random().toString(36).substring(2, 11),
      type: 'mistake',
      term: sentenceWithUnderline || targetWordStr,
      definition:
        baseData.definition ||
        question.hint ||
        'Thử thách Điền Từ (Fill in the Blank)',
      analysis: question.explanation || baseData.analysis || '',
      example: fullSentence,
      tags: [
        'fillblank',
        configRef.current.safeLevelString,
        configRef.current.sourceMode
      ],
      timestamp: Date.now()
    };
    onLogWrongFn(mistakeCard);
  }, []);

  // Thoát về Menu kèm khóa hasExitedRef chống cleanup AutoSave ghi đè án phạt thoát ngang
  const handleSaveAndBack = useCallback(() => {
    const currentData = latestStateRef.current;
    const modeNow = configRef.current.sourceMode;
    let finalWrongCount = Number(currentData.wrongCount) || 0;
    let finalCombo = Number(currentData.combo) || 1;
    let needsNext = false;

    if (
      (currentData.checkStatus === 'idle' ||
        currentData.checkStatus === 'wrong_retry') &&
      currentData.currentQuestion
    ) {
      localPushToRetryBag(currentData.currentQuestion);
      logMistake(currentData.currentQuestion);
      finalWrongCount += 1;
      finalCombo = 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    } else if (
      currentData.checkStatus === 'correct' ||
      currentData.checkStatus === 'wrong'
    ) {
      needsNext = true;
    }

    const pendingBaseCards = extractCleanBaseCardsFromQueue(
      coordinatorRef.current,
      modeNow
    );
    const mergedDeck =
      modeNow === 'ai_pure'
        ? []
        : sanitizeDeckList(
            [...pendingBaseCards, ...(currentData.deck || [])],
            enrichedCardsRef.current
          );

    // Khóa cứng trước khi unmount để ngăn cleanup triggerAutoSave ghi đè
    hasExitedRef.current = true;
    isGameActiveRef.current = false;
    clearTransientTimers();
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (coordinatorRef.current) {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    const onBackFn = callbacksRef.current?.onBack;
    if (typeof onBackFn === 'function') {
      onBackFn({
        fillBlankState: {
          ...currentData,
          deck: mergedDeck,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [clearTransientTimers, localPushToRetryBag, logMistake, safeShowToast]);

  // Kết thúc sớm / Hoàn tất: khóa hasExitedRef triệt tiêu Ghost Session
  const handleEndGameInternal = useCallback(
    (stats) => {
      hasExitedRef.current = true;
      isGameActiveRef.current = false;
      clearTransientTimers();
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
      const onEndGameFn = callbacksRef.current?.onEndGame;
      if (typeof onEndGameFn === 'function') {
        const finalStats = stats || {
          correct: Number(latestStateRef.current.correctCount) || 0,
          time: Number(latestStateRef.current.time) || 0,
          wrong: Number(latestStateRef.current.wrongCount) || 0
        };
        onEndGameFn(finalStats);
      }
    },
    [clearTransientTimers]
  );

  // Nạp đầy bộ bài hợp lệ cho Card Mode
  const buildCardDeck = useCallback((sourceCards, cfg) => {
    const currentLang = cfg.lang;
    const mode = cfg.dataMode === 'sentence' ? 'sentence' : 'vocab';
    let validCards = (Array.isArray(sourceCards) ? sourceCards : []).filter(
      (c) => c && typeof c.term === 'string' && c.term.trim() !== ''
    );

    if (validCards.length < 2 && FallbackDataEngine?.getFallbackData) {
      const fbItems = FallbackDataEngine.getFallbackData(
        currentLang,
        mode,
        cfg.safeLevelString,
        20
      );
      if (Array.isArray(fbItems) && fbItems.length > 0) {
        const existingKeys = new Set(
          validCards.map((c) => normalizeCompareKey(c.term))
        );
        const newFbs = fbItems.filter(
          (f) => f && f.term && !existingKeys.has(normalizeCompareKey(f.term))
        );
        validCards = [...validCards, ...newFbs];
      }
    }

    if (validCards.length < 2) {
      const defaults =
        currentLang === 'zh'
          ? [
              { term: '我喜欢学习汉语。', definition: 'Tôi thích học tiếng Trung.' },
              { term: '今天天气很好。', definition: 'Thời tiết hôm nay rất đẹp.' }
            ]
          : [
              {
                term: 'Learning languages is very fun.',
                definition: 'Học ngôn ngữ rất thú vị.'
              },
              {
                term: 'I practice English every day.',
                definition: 'Tôi thực hành tiếng Anh mỗi ngày.'
              }
            ];
      const existingKeys = new Set(
        validCards.map((c) => normalizeCompareKey(c.term))
      );
      defaults.forEach((d) => {
        if (!existingKeys.has(normalizeCompareKey(d.term))) {
          validCards.push(d);
        }
      });
    }

    return Utils && typeof Utils.shuffleArray === 'function'
      ? Utils.shuffleArray(validCards)
      : validCards;
  }, []);

  // Hàm tạo câu đố Offline nội bộ từ 1 thẻ gốc
  const buildOfflineFillQuestion = useCallback((baseCard, cfg, isRescued) => {
    const currentLang = cfg.lang;
    const isSentence =
      cfg.dataMode === 'sentence' || isSentenceLikeTerm(baseCard.term, currentLang);
    const maskType = isSentence ? 'sentence' : 'word';

    const offRes = GameAlgoEngine?.ClozeEngine?.offline_mask
      ? GameAlgoEngine.ClozeEngine.offline_mask(
          baseCard.term,
          currentLang,
          maskType,
          enrichedCardsRef.current || []
        )
      : {
          targetWord: baseCard.term,
          displaySentence: DEFAULT_BLANK,
          hint: baseCard.definition,
          distractors: []
        };

    return normalizeFillBlankQuestion(
      {
        ...offRes,
        origin: baseCard,
        hint: baseCard.definition || offRes?.hint || '',
        type: maskType,
        isAiGenerated: false,
        _isRescued: Boolean(isRescued)
      },
      baseCard,
      currentLang
    );
  }, []);

  // ============================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE) - FETCH TASK
  // ============================================================================
  const fetchTask = useCallback(async () => {
    const cfg = configRef.current;
    const currentLang = cfg.lang;
    const isPureMode = cfg.sourceMode === 'ai_pure';

    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp toàn cục
    if (typeof pullRetryCardWithLock === 'function') {
      const pulledCard = pullRetryCardWithLock(
        'fillblank',
        globalRetryBagRef.current,
        currentLang
      );
      if (pulledCard) {
        const normalizedRetry = normalizeFillBlankQuestion(
          pulledCard,
          pulledCard.origin || null,
          currentLang
        );
        if (normalizedRetry) return normalizedRetry;
      }
    }

    const currentApiKey = resolveActiveApiKey(cfg.apiKey);

    // 2. AI PURE MODE: Tạo câu mới hoàn toàn từ AI thông qua ExamEngine
    if (isPureMode && cfg.effectiveAiMode && currentApiKey && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: 'fillblank_' + Date.now(),
          type: 'ioe_fill_blank',
          level: cfg.safeLevelString,
          topic: cfg.topic || '',
          dataMode: 'sentence',
          lang: currentLang,
          mode: 'minigame'
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
          const normalized = normalizeFillBlankQuestion(
            {
              ...qData.content,
              isAiGenerated:
                qData.content.isAiGenerated !== false && !qData.content._isRescued,
              _isRescued: Boolean(qData.content._isRescued)
            },
            qData.content.origin || null,
            currentLang
          );

          if (normalized) {
            const onSaveHarvestFn = callbacksRef.current?.onSaveToHarvest;
            if (
              typeof onSaveHarvestFn === 'function' &&
              normalized.isAiGenerated &&
              !normalized._isRescued
            ) {
              const harvestLevelKey = toCanonicalHarvestLevelKey(
                cfg.safeLevelString,
                currentLang
              );
              const fullSentence = replaceBlankTokens(
                normalized.displaySentence,
                normalized.targetWord
              );
              onSaveHarvestFn(harvestLevelKey, {
                term: fullSentence,
                definition: normalized.hint || '',
                analysis: normalized.explanation || '',
                example: normalized.displaySentence,
                partOfSpeech: 'Sentence',
                topic: Array.isArray(cfg.topic)
                  ? cfg.topic.join(', ')
                  : String(cfg.topic || 'General'),
                grammar_type: Array.isArray(normalized.grammar_type)
                  ? normalized.grammar_type
                  : ['Fill in the Blank'],
                level: harvestLevelKey,
                language: currentLang,
                displaySentence: normalized.displaySentence,
                targetWord: normalized.targetWord,
                hint: normalized.hint
              });
            }

            pushToAiMemorySafe(normalized.targetWord, historyQueueRef.current);

            if (isInitializingRef.current) {
              safeShowToast('Đang nạp đạn AI...', 'info');
            }
            return normalized;
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('AI FillBlank PureMode Fallback:', errMsg);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề FillBlank', e);
        }
      }
    }

    // 3. RÚT THẺ GỐC HOẶC TỪ KHO CỨU HỘ
    /** @type {Record<string, any> | null} */
    let baseCard = null;
    if (!isPureMode || deckRef.current.length > 0) {
      if (deckRef.current.length === 0 && !isPureMode) {
        deckRef.current = buildCardDeck(enrichedCardsRef.current, cfg);
      }
      baseCard = deckRef.current.shift() || null;
    }

    // 4. CỨU HỘ KHẨN CẤP NẾU KHÔNG CÓ THẺ
    if (!baseCard) {
      const fbResult = FallbackDataEngine?.getGameReadyFallback
        ? FallbackDataEngine.getGameReadyFallback(
            'fillblank',
            currentLang,
            cfg.safeLevelString,
            cfg
          )
        : null;
      const normalizedFb = normalizeFillBlankQuestion(
        fbResult ? { ...fbResult, isAiGenerated: false, _isRescued: true } : null,
        null,
        currentLang
      );
      if (normalizedFb) return normalizedFb;

      baseCard =
        currentLang === 'zh'
          ? {
              term: '我喜欢学习汉语。',
              definition: 'Tôi thích học tiếng Trung. (Dự phòng)'
            }
          : {
              term: 'Learning languages is very fun.',
              definition: 'Học ngôn ngữ rất thú vị. (Dự phòng)'
            };
    }

    pushToAiMemorySafe(baseCard.term, historyQueueRef.current);

    const isSentenceCard =
      cfg.dataMode === 'sentence' || isSentenceLikeTerm(baseCard.term, currentLang);
    const maskType = isSentenceCard ? 'sentence' : 'word';

    // 5. ĐỘNG CƠ ĐỤC LỖ AI (CHẠY CHO THẺ CÂU HOẶC THẺ CỤM TỪ KHI BẬT THỬ THÁCH AI)
    if (
      cfg.effectiveAiMode &&
      currentApiKey &&
      isSentenceCard &&
      GameAlgoEngine?.ClozeEngine?.ai_mask
    ) {
      /** @type {any} */
      let timeoutId = null;
      try {
        const dynamicTimeout = getDynamicAiTimeoutMs(22000);
        const aiMaskPromise = GameAlgoEngine.ClozeEngine.ai_mask(
          baseCard.term,
          baseCard.definition || '',
          currentLang,
          currentApiKey,
          cfg.safeLevelString,
          cfg.topic || ''
        );
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('AI Mask Timeout'));
          }, dynamicTimeout);
        });
        const res = await Promise.race([aiMaskPromise, timeoutPromise]);
        const normalizedAiMask = normalizeFillBlankQuestion(
          {
            ...res,
            origin: baseCard,
            hint: res?.hint || baseCard.definition || '',
            type: maskType,
            isAiGenerated: true,
            _isRescued: false
          },
          baseCard,
          currentLang
        );
        if (normalizedAiMask) {
          return normalizedAiMask;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.warn('AI Masking failed, fallback to offline mask:', errMsg);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi AI ClozeEngine (Đục lỗ)', e);
        }
        // Không return null gây vỡ nợ Queue: chuyển ngay xuống offline_mask kèm gắn cờ cứu hộ
        const rescuedOffline = buildOfflineFillQuestion(baseCard, cfg, true);
        if (rescuedOffline) return rescuedOffline;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    // 6. CHẾ ĐỘ OFFLINE THUẦN TÚY
    return buildOfflineFillQuestion(baseCard, cfg, false);
  }, [buildCardDeck, buildOfflineFillQuestion, safeShowToast]);

  // Hàm cứu hộ tức thời (JIT Offline Fallback) khi Queue AI bị rỗng
  const getJitFallbackQuestion = useCallback(() => {
    const cfg = configRef.current;
    if (cfg.effectiveAiMode && deckRef.current.length > 0) {
      const fallbackCard = deckRef.current.shift();
      if (fallbackCard) {
        const rescued = buildOfflineFillQuestion(fallbackCard, cfg, true);
        if (rescued) {
          safeShowToast('AI quá tải, đã kích hoạt thuật toán nội bộ!', 'warning');
          return rescued;
        }
      }
    }

    if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
      window.logSystemEvent(
        'Queue cạn đạn Game Điền Từ',
        'Kích hoạt Hard Fallback'
      );
    }
    safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
    const fbRaw = FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'fillblank',
          cfg.lang,
          cfg.safeLevelString,
          cfg
        )
      : null;

    const normalizedFb = normalizeFillBlankQuestion(
      fbRaw ? { ...fbRaw, isAiGenerated: false, _isRescued: true } : null,
      null,
      cfg.lang
    );
    if (normalizedFb) return normalizedFb;

    return buildOfflineFillQuestion(
      cfg.lang === 'zh'
        ? { term: '我喜欢学习汉语。', definition: 'Tôi thích học tiếng Trung.' }
        : {
            term: 'Learning languages is very fun.',
            definition: 'Học ngôn ngữ rất thú vị.'
          },
      cfg,
      true
    );
  }, [buildOfflineFillQuestion, safeShowToast]);

  // Helper áp dụng câu hỏi mới vào UI một cách nhất quán
  const applyNextQuestionState = useCallback(
    (rawQuestion, showStartToast) => {
      const cfg = configRef.current;
      const normalized =
        normalizeFillBlankQuestion(
          rawQuestion,
          rawQuestion?.origin || null,
          cfg.lang
        ) || getJitFallbackQuestion();

      if (!isGameActiveRef.current || hasExitedRef.current) return;

      if (normalized) {
        setCurrentQuestion(normalized);
        setInputBuffer('');
        setCheckStatus('idle');
        setAttempts(0);
        setIsGenerating(false);
        isInitializingRef.current = false;
        setTimeLeft(cfg.effectiveTimeLimit);

        const currentCooldown =
          cfg.sourceMode === 'ai_pure' || cfg.effectiveAiMode
            ? getConfiguredUiCooldown(9)
            : 0;
        setAiWaitTime(currentCooldown);
        if (showStartToast) {
          safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
        }
      } else {
        safeShowToast('Lỗi nghiêm trọng khi tải dữ liệu. Buộc kết thúc.', 'error');
        setIsGenerating(false);
        isInitializingRef.current = false;
        handleEndGameInternal({
          correct: Number(latestStateRef.current.correctCount) || 0,
          time: Number(latestStateRef.current.time) || 0,
          wrong: Number(latestStateRef.current.wrongCount) || 0
        });
      }
    },
    [getJitFallbackQuestion, handleEndGameInternal, safeShowToast]
  );

  // KHỞI ĐỘNG HOẶC PHỤC HỒI PHIÊN CHƠI (CHUẨN REACT 18 STRICTMODE)
  useEffect(() => {
    let cancelled = false;
    isGameActiveRef.current = true;
    hasExitedRef.current = false;

    const bootTimer = setTimeout(async () => {
      if (cancelled) return;
      const cfg = configRef.current;
      const st = cfg.savedState?.fillBlankState || null;
      const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.effectiveAiMode;

      const startGameClock = () => {
        if (gameTimerRef.current) clearInterval(gameTimerRef.current);
        gameTimerRef.current = setInterval(() => {
          setTime((prev) => prev + 1);
        }, 1000);
      };

      if (st) {
        // PHỤC HỒI PHIÊN CHƠI TỪ SESSION
        if (cfg.sourceMode === 'card') {
          const cleanRestored = sanitizeDeckList(st.deck, enrichedCardsRef.current);
          deckRef.current =
            cleanRestored.length > 0
              ? cleanRestored
              : buildCardDeck(enrichedCardsRef.current, cfg);
        } else {
          deckRef.current = [];
        }

        if (coordinatorRef.current) coordinatorRef.current.destroy();
        if (QueueEngine?.createQueueCoordinator) {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
        } else {
          safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
          setIsGenerating(false);
          return;
        }

        if (st._needsNextOnResume || !st.currentQuestion) {
          setCurrentQuestion(null);
          setIsGenerating(true);
          try {
            await coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
          } catch (err) {
            console.warn('FillBlank Resume maintain error:', err);
          }
          if (cancelled || !isGameActiveRef.current || hasExitedRef.current) return;
          const popped = coordinatorRef.current ? coordinatorRef.current.pop() : null;
          applyNextQuestionState(popped, false);
        } else {
          isInitializingRef.current = false;
          coordinatorRef.current
            .maintain(false, 22000, isOfflineFastTrack)
            .catch((err) => console.warn('FillBlank bg maintain error:', err));
        }

        if (!cancelled && isGameActiveRef.current && !hasExitedRef.current) {
          startGameClock();
        }
        return;
      }

      // KHỞI TẠO PHIÊN MỚI
      setIsGenerating(true);
      setPlayedCount(0);
      setScore(0);
      setCombo(1);
      setTime(0);
      setCorrectCount(0);
      setWrongCount(0);
      isInitializingRef.current = true;

      if (cfg.sourceMode === 'card') {
        const rawValidCount = (enrichedCardsRef.current || []).filter(
          (c) => c && typeof c.term === 'string' && c.term.trim() !== ''
        ).length;
        if (rawValidCount < 2) {
          safeShowToast(
            'Bộ thẻ không đủ 2 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
            'warning'
          );
        }
        deckRef.current = buildCardDeck(enrichedCardsRef.current, cfg);
      } else {
        deckRef.current = [];
      }

      if (coordinatorRef.current) coordinatorRef.current.destroy();
      if (QueueEngine?.createQueueCoordinator) {
        coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
      } else {
        safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
        setIsGenerating(false);
        return;
      }

      try {
        await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);
      } catch (err) {
        console.warn('FillBlank start maintain error:', err);
      }

      if (cancelled || !isGameActiveRef.current || hasExitedRef.current) return;

      const firstData = coordinatorRef.current ? coordinatorRef.current.pop() : null;
      applyNextQuestionState(firstData, true);

      if (!cancelled && isGameActiveRef.current && !hasExitedRef.current) {
        startGameClock();
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      clearTransientTimers();
      isGameActiveRef.current = false;
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
    applyNextQuestionState,
    buildCardDeck,
    clearTransientTimers,
    fetchTask,
    safeShowToast
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
    clearTransientTimers();
    setPlayedCount((prev) => prev + 1);
    setResultTimer(0);
    setIsResultPaused(false);

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      applyNextQuestionState(nextData, false);
      scheduleAutoSave();
      return;
    }

    setIsGenerating(true);
    const cfg = configRef.current;
    const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.effectiveAiMode;

    if (!coordinatorRef.current && QueueEngine?.createQueueCoordinator) {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
    }

    if (!coordinatorRef.current) {
      applyNextQuestionState(null, false);
      scheduleAutoSave();
      return;
    }

    coordinatorRef.current
      .maintain(false, 22000, isOfflineFastTrack)
      .catch((err) => {
        console.warn('FillBlank nextRound maintain error:', err);
      })
      .finally(() => {
        if (!isGameActiveRef.current || hasExitedRef.current) return;
        const popped = coordinatorRef.current ? coordinatorRef.current.pop() : null;
        applyNextQuestionState(popped, false);
        scheduleAutoSave();
      });
  }, [
    applyNextQuestionState,
    clearTransientTimers,
    fetchTask,
    isGenerating,
    scheduleAutoSave
  ]);

  const checkAnswer = useCallback(() => {
    if (
      !currentQuestion ||
      (checkStatus !== 'idle' && checkStatus !== 'wrong_retry')
    ) {
      return;
    }
    const trimmedInput = String(inputBuffer || '').trim();
    if (!trimmedInput) return;

    const cfg = configRef.current;
    const currentLang = cfg.lang;
    const normTarget = normalizeFillAnswer(currentQuestion.targetWord, currentLang);
    const normInput = normalizeFillAnswer(trimmedInput, currentLang);

    let isCorrect = false;
    if (normTarget && normTarget === normInput) {
      isCorrect = true;
    } else if (
      currentLang === 'zh' &&
      LATIN_ONLY_REGEX.test(trimmedInput) &&
      currentQuestion.targetPinyin &&
      Utils &&
      typeof Utils.comparePinyin === 'function'
    ) {
      // Đối khớp Pinyin 1-1 chính xác cho riêng targetWord (chống gian lận .includes())
      isCorrect = Boolean(
        Utils.comparePinyin(trimmedInput, currentQuestion.targetPinyin)
      );
    }

    if (isCorrect) {
      clearTransientTimers();
      if (normTarget !== normInput) {
        setInputBuffer(currentQuestion.targetWord);
      }
      if (attempts === 0) {
        localRemoveFromRetryBag(
          currentQuestion.origin?.term || currentQuestion.targetWord
        );
      }
      setCheckStatus('correct');
      setCorrectCount((p) => p + 1);
      const scoreMultiplier = cfg.isHellMode ? 3 : 1;
      setScore((prev) => prev + 15 * combo * scoreMultiplier);
      setCombo((prev) => prev + 1);
      safeShowToast(
        cfg.isHellMode ? 'Xuất sắc! (Địa ngục x3)' : 'Chính xác!',
        'success'
      );
      proceedToNext(5);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setCombo(1);
      const penalty = cfg.isHellMode ? 15 : 5;
      setScore((prev) => Math.max(0, prev - penalty));

      if (newAttempts >= 3) {
        clearTransientTimers();
        localPushToRetryBag(currentQuestion);
        setCheckStatus('wrong');
        setWrongCount((p) => p + 1);
        safeShowToast('Đã hết lượt! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(5);
      } else {
        setCheckStatus('wrong_retry');
        safeShowToast(
          cfg.isHellMode ? 'Sai rồi! Trừ 15 điểm!' : 'Chưa đúng, hãy thử lại!',
          'warning'
        );
        if (retryResetTimerRef.current) {
          clearTimeout(retryResetTimerRef.current);
        }
        retryResetTimerRef.current = setTimeout(() => {
          retryResetTimerRef.current = null;
          setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p));
        }, 1000);
      }
    }
    scheduleAutoSave();
  }, [
    attempts,
    checkStatus,
    clearTransientTimers,
    combo,
    currentQuestion,
    inputBuffer,
    localPushToRetryBag,
    localRemoveFromRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave
  ]);

  const handleSkip = useCallback(() => {
    if (
      !currentQuestion ||
      isGenerating ||
      (checkStatus !== 'idle' && checkStatus !== 'wrong_retry')
    ) {
      return;
    }
    clearTransientTimers();
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setAttempts(3);
    setCheckStatus('wrong');
    setWrongCount((p) => p + 1);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(5);
    scheduleAutoSave();
  }, [
    checkStatus,
    clearTransientTimers,
    currentQuestion,
    isGenerating,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN TỪNG CÂU (PURE STATE UPDATER)
  useEffect(() => {
    /** @type {any} */
    let timerId = null;
    if (
      timerMode &&
      (checkStatus === 'idle' || checkStatus === 'wrong_retry') &&
      !isGenerating &&
      currentQuestion
    ) {
      timerId = setInterval(() => {
        setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [timerMode, checkStatus, isGenerating, currentQuestion]);

  // CƠ CHẾ GIẬT CÒ KHI HẾT GIỜ (TIMEOUT TRIGGER)
  useEffect(() => {
    /** @type {any} */
    let timeoutHandler = null;
    if (
      timerMode &&
      timeLeft === 0 &&
      (checkStatus === 'idle' || checkStatus === 'wrong_retry') &&
      currentQuestion
    ) {
      timeoutHandler = setTimeout(() => {
        clearTransientTimers();
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(3);
        setCheckStatus('wrong');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(5);
        scheduleAutoSave();
      }, 0);
    }
    return () => {
      if (timeoutHandler) clearTimeout(timeoutHandler);
    };
  }, [
    timeLeft,
    timerMode,
    checkStatus,
    currentQuestion,
    clearTransientTimers,
    logMistake,
    safeShowToast,
    scheduleAutoSave,
    localPushToRetryBag,
    proceedToNext
  ]);

  // ĐỒNG HỒ TỰ ĐỘNG CHUYỂN CÂU KHI ĐÃ HIỆN KẾT QUẢ
  useEffect(() => {
    /** @type {any} */
    let id = null;
    if (
      (checkStatus === 'correct' || checkStatus === 'wrong') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      id = setTimeout(() => setResultTimer((tVal) => Math.max(0, tVal - 1)), 1000);
    } else if (
      (checkStatus === 'correct' || checkStatus === 'wrong') &&
      resultTimer === 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      id = setTimeout(() => nextRound(), 0);
    }
    return () => {
      if (id) clearTimeout(id);
    };
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((p) => !p);
  }, []);

  return {
    currentQuestion,
    inputBuffer,
    setInputBuffer,
    checkStatus,
    attempts,
    time,
    score,
    combo,
    playedCount,
    isFinished,
    isGenerating,
    aiCountdown: 0,
    correctCount,
    wrongCount,
    resultTimer,
    isResultPaused,
    toggleResultPause,
    timeLeft,
    aiAmmoCount,
    aiWaitTime,
    checkAnswer,
    handleNext: nextRound,
    handleSkip,
    handleSaveAndBack,
    handleEndGameInternal
  };
};

// ============================================================================
// 2. GAME WRAPPER (FillBlankGame)
// ============================================================================
/**
 * @param {{
 *   cards?: Record<string, any>[],
 *   t?: Record<string, any>,
 *   onFinish?: (correct: number, time: number, wrong: number) => void,
 *   onQuit?: (sessionData?: Record<string, any>) => void,
 *   onEndGame?: (stats: { correct: number, time: number, wrong: number }) => void,
 *   onBack?: (sessionData?: Record<string, any>) => void,
 *   mainColor?: string,
 *   lang?: string,
 *   dataMode?: string,
 *   currentLevel?: string | string[],
 *   currentTopic?: string | string[],
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
 *   onAutoSave?: (sessionData: Record<string, any>) => void,
 *   globalRetryBag?: Record<string, any>,
 *   addToRetryBag?: (gameType: string, payload: Record<string, any>) => void,
 *   removeFromRetryBag?: (gameType: string, term: string) => void,
 *   showToast?: (msg: string, type?: string) => void,
 *   speak?: (text: string, langOverride?: any, rateOverride?: any, onDone?: any) => void,
 *   onPlay?: (text: string) => void
 * }} props
 */
export const FillBlankGame = ({
  cards = [],
  t = undefined,
  onFinish = undefined,
  onQuit = undefined,
  onEndGame: propOnEndGame = undefined,
  onBack: propOnBack = undefined,
  mainColor = 'blue',
  lang = 'en',
  dataMode = undefined,
  currentLevel = undefined,
  currentTopic = undefined,
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
  globalRetryBag = undefined,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined,
  showToast = undefined,
  speak = undefined,
  onPlay = undefined
}) => {
  const safeLang = toSafeLang(lang);

  const handleEndGameWrapper = useCallback(
    (stats = { correct: 0, time: 0, wrong: 0 }) => {
      if (typeof onFinish === 'function') {
        onFinish(stats.correct || 0, stats.time || 0, stats.wrong || 0);
      } else if (typeof propOnEndGame === 'function') {
        propOnEndGame(stats);
      }
    },
    [onFinish, propOnEndGame]
  );

  const mergedConfig = useMemo(() => {
    const base =
      config && typeof config === 'object'
        ? config
        : {
            level: safeLang === 'zh' ? 'zh_level_1' : 'en_level_4',
            sourceMode: 'card'
          };
    return {
      ...base,
      level: base.level || currentLevel || (safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'),
      topic: base.topic !== undefined ? base.topic : currentTopic || '',
      dataMode: base.dataMode || dataMode || 'vocab',
      isAiMode: Boolean(isAiMode),
      apiKey: apiKey || '',
      lang: safeLang,
      savedState,
      globalRetryBag
    };
  }, [
    apiKey,
    config,
    currentLevel,
    currentTopic,
    dataMode,
    globalRetryBag,
    isAiMode,
    safeLang,
    savedState
  ]);

  const hookCallbacks = useMemo(
    () => ({
      onFinish,
      showToast:
        typeof showToast === 'function'
          ? showToast
          : typeof window !== 'undefined' &&
              typeof window.globalShowToast === 'function'
            ? window.globalShowToast
            : undefined,
      onLogWrong,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      onBack: onQuit || propOnBack,
      addToRetryBag,
      removeFromRetryBag,
      onEndGame: handleEndGameWrapper
    }),
    [
      addToRetryBag,
      handleEndGameWrapper,
      onAutoSave,
      onFinish,
      onLogWrong,
      onQuit,
      onSaveToHarvest,
      onUpdateCards,
      propOnBack,
      removeFromRetryBag,
      showToast
    ]
  );

  const logic = useFillBlankLogic(cards, mergedConfig, hookCallbacks);

  // Kiểm tra Bookmark chính xác theo chuẩn NFC (khớp cả câu đầy đủ lẫn từ gốc)
  const isBookmarked = useMemo(() => {
    if (!logic.currentQuestion || !Array.isArray(notebook) || notebook.length === 0) {
      return false;
    }
    const target = String(logic.currentQuestion.targetWord || '').trim();
    const fullSentence = replaceBlankTokens(
      String(logic.currentQuestion.displaySentence || ''),
      target
    );
    const fullKey = normalizeCompareKey(fullSentence);
    const targetKey = normalizeCompareKey(target);

    return notebook.some((n) => {
      if (!n || typeof n.term !== 'string') return false;
      const noteKey = normalizeCompareKey(n.term);
      return Boolean(
        noteKey && (noteKey === fullKey || (targetKey && noteKey === targetKey))
      );
    });
  }, [logic.currentQuestion, notebook]);

  // Phát âm chuẩn 2 ngôn ngữ EN / ZH (ưu tiên speak từ GameView)
  const handlePlayAudio = useCallback(
    (text) => {
      const cleanText = String(text || '').trim();
      if (!cleanText) return;
      if (typeof onPlay === 'function') {
        onPlay(cleanText);
        return;
      }
      if (typeof speak === 'function') {
        speak(cleanText, safeLang);
        return;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.lang = safeLang === 'zh' ? 'zh-CN' : 'en-US';
          window.speechSynthesis.speak(utterance);
        } catch {
          // Bỏ qua nếu trình duyệt chặn TTS
        }
      }
    },
    [onPlay, safeLang, speak]
  );

  const handleSaveToNotebookWrapper = useCallback(
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
    <FillBlankPlayScreen
      t={t}
      mainColor={mainColor}
      config={mergedConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={logic.handleEndGameInternal}
      onPlay={handlePlayAudio}
      onSaveToNotebook={handleSaveToNotebookWrapper}
      isBookmarked={isBookmarked}
      settings={settings}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_9_useFillBlankLogic = useFillBlankLogic;
  window.useFillBlankLogic = useFillBlankLogic;
  window.Block5_9_FillBlankGame = FillBlankGame;
  window.FillBlankGame = FillBlankGame;
}

export default FillBlankGame;