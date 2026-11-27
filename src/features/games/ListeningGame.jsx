// ============================================================================
// FILE 69/85: src/features/games/ListeningGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.22 - Listening Logic & Wrapper V1.12)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 21:54 (GMT+7)
// NHIỆM VỤ: Động cơ điều khiển (useListeningLogic) và Component bọc ngoài
//           (ListeningGame) cho trò chơi Đôi Tai Vàng (Listening Comprehension).
//           Nâng cấp Ver 1.0 (Lượt 4.3 - Chốt hạ Giai đoạn 4, Diệt 1M Radar
//           & 0 Problems tsc):
//           1. Diệt 1/1 MEDIUM Radar (R05): Thay localStorage.setItem trần của
//              fc_ai_memory sang AiMemoryManager + Utils.safeLocalStorageSet
//              (khử trùng NFC); gỡ sạch window.handleSaveToNotebook.
//           2. Diệt C29, C30 & S12: stopAudio() tắt loa thật qua stopSpeaking()
//              + speechSynthesis.cancel() kèm khóa phiên audioSessionIdRef;
//              mở khóa nghe lại tự do sau khi chốt đáp án; timeout TTS theo
//              ngôn ngữ CJK (420ms/ký tự) & Latin (140ms/ký tự).
//           3. Diệt S11: Quét API Key 4 tầng qua resolveActiveApiKey (không đá
//              oan user dùng Key Pool/Paid Key; tự chạy mượt kho kịch bản mẫu
//              song ngữ EN/ZH nếu cả 4 tầng trống).
//           4. Diệt C31..C35 & S13..S15: Gỡ StrictMode Deadlock (bootTimer 50ms
//              + cancelled); khóa hasExitedRef + handleEndGameInternal diệt
//              Ghost Session & lỗi xóa án phạt thoát ngang; đồng bộ isBookmarked
//              NFC O(1) theo đáp án đúng; sửa key xóa RetryBag; deck=[] cho
//              ai_pure; validate dữ liệu AI; pure setTimeLeft; reset
//              selectedOptionIndex sau wrong_retry; anti-streak bất biến;
//              onSaveToHarvest chuẩn 2 tham số 12 cột (chặn _isRescued);
//              fc_audioCtx.resume().catch() và chuẩn 0 Problems tsc.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { ExamEngine } from '@/engines/exam';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import {
  resolveActiveApiKey,
  getSafeLevelString,
  getConfiguredUiCooldown
} from './common/gameHelpers';
import { ListeningPlayScreen } from './ListeningUI';

// ============================================================================
// HẰNG SỐ & BỘ KỊCH BẢN NGHE DỰ PHÒNG SONG NGỮ (EN / ZH)
// ============================================================================

const LISTENING_FALLBACK_POOL = {
  en: [
    {
      audioScript:
        'Hello, my name is John. Every Saturday morning, I eat fresh apples for breakfast and play football with my friends in the park.',
      term: 'What does John eat for breakfast on Saturday morning?',
      options: [
        { text: 'Fresh apples', isCorrect: true },
        { text: 'Bananas and milk', isCorrect: false },
        { text: 'Chocolate cake', isCorrect: false },
        { text: 'Orange juice only', isCorrect: false }
      ],
      explanation:
        'Trong đoạn băng, John nói rõ: "I eat fresh apples for breakfast".'
    },
    {
      audioScript:
        'Good afternoon, passengers. The train to London will depart from Platform 4 at 3:15 PM. Please keep your tickets ready.',
      term: 'Which platform does the train to London leave from?',
      options: [
        { text: 'Platform 4', isCorrect: true },
        { text: 'Platform 3', isCorrect: false },
        { text: 'Platform 5', isCorrect: false },
        { text: 'Platform 15', isCorrect: false }
      ],
      explanation:
        'Thông báo nêu rõ: "The train to London will depart from Platform 4".'
    },
    {
      audioScript:
        'Hi Anna, I am sorry I cannot join the movie tonight. I have to finish my science project before tomorrow morning.',
      term: 'Why can the speaker not join the movie tonight?',
      options: [
        { text: 'To finish a science project', isCorrect: true },
        { text: 'Because of heavy rain', isCorrect: false },
        { text: 'To visit grandparents', isCorrect: false },
        { text: 'Because the tickets sold out', isCorrect: false }
      ],
      explanation:
        'Người nói giải thích: "I have to finish my science project before tomorrow morning".'
    },
    {
      audioScript:
        'Welcome to Sunny Bookstore! Today we offer a twenty percent discount on all English dictionaries and children storybooks.',
      term: 'What is the discount at Sunny Bookstore today?',
      options: [
        { text: '20 percent', isCorrect: true },
        { text: '10 percent', isCorrect: false },
        { text: '30 percent', isCorrect: false },
        { text: '50 percent', isCorrect: false }
      ],
      explanation:
        'Đoạn thông báo nhắc đến mức giảm giá: "a twenty percent discount" (20%).'
    }
  ],
  zh: [
    {
      audioScript:
        '大家好，我叫小明。我每天早上七点起床，喝一杯牛奶，然后坐公共汽车去学校。',
      term: '小明每天早上怎么去学校？',
      options: [
        { text: '坐公共汽车', isCorrect: true },
        { text: '骑自行车', isCorrect: false },
        { text: '走路去', isCorrect: false },
        { text: '坐地铁', isCorrect: false }
      ],
      explanation:
        'Trong đoạn băng, Tiểu Minh nói: "然后坐公共汽车去学校" (sau đó đi xe buýt đến trường).'
    },
    {
      audioScript:
        '女：请问，去图书馆怎么走？男：一直往前走，到红绿灯那儿往右拐，图书馆就在医院对面。',
      term: '图书馆在哪里？',
      options: [
        { text: '在医院对面', isCorrect: true },
        { text: '在学校后面', isCorrect: false },
        { text: '在超市旁边', isCorrect: false },
        { text: '在公园里面', isCorrect: false }
      ],
      explanation:
        'Người chỉ đường nói rõ: "图书馆就在医院对面" (Thư viện nằm ngay đối diện bệnh viện).'
    },
    {
      audioScript:
        '今天天气很好，不冷也不热。下午我和朋友打算去公园打羽毛球，晚上一起吃火锅。',
      term: '他们下午打算做什么？',
      options: [
        { text: '去公园打羽毛球', isCorrect: true },
        { text: '在家看电影', isCorrect: false },
        { text: '去商店买衣服', isCorrect: false },
        { text: '去图书馆学习', isCorrect: false }
      ],
      explanation:
        'Đoạn hội thoại nêu rõ: "下午我和朋友打算去公园打羽毛球" (Buổi chiều dự định ra công viên đánh cầu lông).'
    },
    {
      audioScript:
        '服务员，请给我来一碗牛肉面和一杯热茶，不要太辣，谢谢。',
      term: '客人点了什么？',
      options: [
        { text: '牛肉面和热茶', isCorrect: true },
        { text: '饺子和咖啡', isCorrect: false },
        { text: '炒饭和果汁', isCorrect: false },
        { text: '包子和牛奶', isCorrect: false }
      ],
      explanation:
        'Khách gọi: "一碗牛肉面和一杯热茶" (một bát mì bò và một cốc trà nóng).'
    }
  ]
};

// ============================================================================
// HÀM TIỆN ÍCH THUẦN (NFC, HARVEST, MEMORY, ANTI-STREAK, VALIDATION)
// ============================================================================

/**
 * Chuẩn hóa chuỗi Unicode NFC phục vụ đối khớp O(1).
 * @param {any} text
 * @returns {string}
 */
const normalizeCompareKey = (text) => {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  try {
    return raw.normalize('NFC').replace(/\s+/g, ' ').toLowerCase();
  } catch {
    return raw.replace(/\s+/g, ' ').toLowerCase();
  }
};

/**
 * Chuẩn hóa mã cấp độ sang định dạng canonical cho Kho Thu Hoạch AI.
 * @param {string} rawLevel
 * @param {'en' | 'zh'} lang
 * @returns {string}
 */
const toCanonicalHarvestLevelKey = (rawLevel, lang) => {
  const safeLang = lang === 'zh' ? 'zh' : 'en';
  const raw = String(rawLevel || '').trim();
  if (/^(en|zh)_level_\d+$/i.test(raw)) {
    return raw.toLowerCase();
  }
  const numMatch = raw.match(/(\d+)/);
  if (numMatch && numMatch[1]) {
    const lvlNum = Math.min(9, Math.max(1, Number(numMatch[1]) || 1));
    return safeLang + '_level_' + String(lvlNum);
  }
  return safeLang === 'zh' ? 'zh_level_1' : 'en_level_4';
};

/**
 * Chạy Promise có giới hạn thời gian và luôn clearTimeout trong finally.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 */
const runWithTimeout = async (promise, timeoutMs, label) => {
  const safeMs = Math.max(3000, Number(timeoutMs) || 22000);
  let timerId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(label || 'Hết thời gian chờ phản hồi AI'));
    }, safeMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
  }
};

/**
 * Ghi nhớ đoạn kịch bản đã sinh vào AiMemoryManager & fc_ai_memory an toàn (R05).
 * @param {string} snippet
 * @param {React.MutableRefObject<string[]>} historyQueueRef
 */
const recordListeningAiMemory = (snippet, historyQueueRef) => {
  const clean = String(snippet || '').trim();
  if (!clean) return;

  if (typeof AiMemoryManager?.add === 'function') {
    try {
      AiMemoryManager.add(clean);
    } catch {
      // Fallback đồng bộ xuống bộ đệm an toàn bên dưới
    }
  }

  const currentList = Array.isArray(historyQueueRef.current)
    ? [...historyQueueRef.current]
    : [];
  const norm = normalizeCompareKey(clean);
  const exists = currentList.some(
    (entry) => normalizeCompareKey(entry) === norm
  );
  if (!exists) {
    currentList.push(clean);
    while (currentList.length > 400) {
      currentList.shift();
    }
    historyQueueRef.current = currentList;
    if (typeof Utils?.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_ai_memory', JSON.stringify(currentList));
    }
  }
};

/**
 * Tráo vị trí các lựa chọn bất biến và bẻ gãy chuỗi 2 lần cùng vị trí đáp án đúng.
 * @param {Record<string, any> | null} questionData
 * @param {React.MutableRefObject<number[]>} streakTrackerRef
 * @returns {Record<string, any> | null}
 */
const applyListeningAntiStreak = (questionData, streakTrackerRef) => {
  if (
    !questionData ||
    !Array.isArray(questionData.options) ||
    questionData.options.length < 2
  ) {
    return questionData;
  }

  const clonedOptions = questionData.options.map((opt) => ({
    text: String(opt?.text ?? '').trim(),
    isCorrect:
      opt?.isCorrect === true ||
      String(opt?.isCorrect || '').toLowerCase() === 'true'
  }));

  let shuffled =
    typeof Utils?.shuffleArray === 'function'
      ? Utils.shuffleArray(clonedOptions)
      : [...clonedOptions];

  const tracker = Array.isArray(streakTrackerRef.current)
    ? streakTrackerRef.current
    : [];
  const lastTwoSame =
    tracker.length >= 2 &&
    tracker[tracker.length - 1] === tracker[tracker.length - 2];
  const forbiddenIdx = lastTwoSame ? tracker[tracker.length - 1] : -1;

  let correctIdx = shuffled.findIndex((o) => o.isCorrect);
  if (forbiddenIdx >= 0 && correctIdx === forbiddenIdx && shuffled.length > 1) {
    const swapCandidates = shuffled
      .map((_, idx) => idx)
      .filter((idx) => idx !== forbiddenIdx);
    const targetIdx =
      swapCandidates[Math.floor(Math.random() * swapCandidates.length)];
    const temp = shuffled[correctIdx];
    shuffled[correctIdx] = shuffled[targetIdx];
    shuffled[targetIdx] = temp;
    correctIdx = targetIdx;
  }

  if (correctIdx >= 0) {
    const nextTracker = [...tracker, correctIdx];
    while (nextTracker.length > 4) {
      nextTracker.shift();
    }
    streakTrackerRef.current = nextTracker;
  }

  return {
    ...questionData,
    options: shuffled
  };
};

/**
 * Chuẩn hóa & kiểm duyệt nghiêm ngặt 1 câu hỏi nghe hiểu (từ AI hoặc Fallback).
 * @param {any} raw
 * @param {boolean} isAiFlag
 * @returns {Record<string, any> | null}
 */
const normalizeListeningQuestion = (raw, isAiFlag = false) => {
  if (!raw || typeof raw !== 'object') return null;

  const audioScript = String(
    raw.audioScript || raw.script || raw.transcript || ''
  ).trim();
  const term = String(raw.term || raw.question || '').trim();
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];

  if (!audioScript || !term || rawOptions.length < 2) return null;

  const cleanedOptions = rawOptions
    .map((opt) => {
      if (typeof opt === 'string') {
        return { text: opt.trim(), isCorrect: false };
      }
      return {
        text: String(opt?.text ?? opt?.label ?? '').trim(),
        isCorrect:
          opt?.isCorrect === true ||
          String(opt?.isCorrect || '').toLowerCase() === 'true'
      };
    })
    .filter((o) => o.text.length > 0);

  if (cleanedOptions.length < 2) return null;
  if (!cleanedOptions.some((o) => o.isCorrect)) {
    // Tự phục hồi nếu có đáp án đúng ghi ngoài options
    const ansHint = normalizeCompareKey(raw.answer || raw.correctAnswer || '');
    const matchedIdx = ansHint
      ? cleanedOptions.findIndex(
          (o) => normalizeCompareKey(o.text) === ansHint
        )
      : -1;
    if (matchedIdx >= 0) {
      cleanedOptions[matchedIdx].isCorrect = true;
    } else {
      return null;
    }
  }

  /** @type {Record<string, any>} */
  const normalized = {
    audioScript,
    term,
    options: cleanedOptions,
    explanation: String(raw.explanation || raw.analysis || '').trim(),
    isAiGenerated: Boolean(raw.isAiGenerated ?? isAiFlag),
    _isRescued: Boolean(raw._isRescued || raw?.origin?._isRescued),
    type: 'listening'
  };

  if (raw.topic) normalized.topic = raw.topic;
  return normalized;
};

/**
 * Lấy văn bản đáp án đúng để đồng bộ Bookmark & Kho Thu Hoạch.
 * @param {Record<string, any> | null} question
 * @returns {string}
 */
const extractCorrectAnswerText = (question) => {
  if (!question || typeof question !== 'object') return '';
  const options = Array.isArray(question.options) ? question.options : [];
  const correctOpt = options.find((o) => o && o.isCorrect);
  return (
    String(correctOpt?.text || '').trim() || String(question.term || '').trim()
  );
};

// ============================================================================
// 1. ĐỘNG CƠ LOGIC TRÒ CHƠI NGHE HIỂU (HOOK useListeningLogic)
// ============================================================================
/**
 * Hook quản lý toàn bộ logic, hàng đợi AI, âm thanh và tự lưu cho Đôi Tai Vàng.
 * @param {Record<string, any>} config
 * @param {Record<string, any>} callbacks
 */
export const useListeningLogic = (config, callbacks) => {
  /** @type {Record<string, any>} */
  const cfg = config && typeof config === 'object' ? config : {};
  /** @type {Record<string, any>} */
  const cbs = callbacks && typeof callbacks === 'object' ? callbacks : {};

  /** @type {'en' | 'zh'} */
  const safeLang = cfg.lang === 'zh' ? 'zh' : 'en';
  const sourceMode = String(cfg.sourceMode || 'ai_pure');
  const isAiMode = Boolean(cfg.isAiMode || sourceMode === 'ai_pure');
  const timerMode = Boolean(cfg.timerMode);
  const timeLimit = Number(cfg.timeLimit) > 0 ? Number(cfg.timeLimit) : 45;
  const maxPlays = Number(cfg.maxPlays) > 0 ? Number(cfg.maxPlays) : 3;
  const isPaused = Boolean(cfg.isPaused);
  const savedState = cfg.savedState || null;
  const globalRetryBag = cfg.globalRetryBag || null;

  const safeLevelString = getSafeLevelString(
    cfg.level,
    safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'
  );
  const canonicalHarvestLevel = toCanonicalHarvestLevelKey(
    safeLevelString,
    safeLang
  );

  const savedListening = savedState?.listeningState || null;
  const needsNextOnResume = Boolean(savedListening?._needsNextOnResume);

  // Lazy Initialization từ savedState
  const [currentQuestion, setCurrentQuestion] = useState(() =>
    savedListening && !needsNextOnResume
      ? normalizeListeningQuestion(
          savedListening.currentQuestion,
          Boolean(savedListening.currentQuestion?.isAiGenerated)
        )
      : null
  );
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(() =>
    savedListening &&
    !needsNextOnResume &&
    savedListening.selectedOptionIndex !== undefined
      ? savedListening.selectedOptionIndex
      : null
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    savedListening && !needsNextOnResume
      ? String(savedListening.checkStatus || 'idle')
      : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    savedListening && !needsNextOnResume
      ? Number(savedListening.attempts) || 0
      : 0
  );
  const [score, setScore] = useState(() =>
    savedListening ? Number(savedListening.score) || 0 : 0
  );
  const [combo, setCombo] = useState(() =>
    savedListening ? Number(savedListening.combo) || 1 : 1
  );
  const [playedCount, setPlayedCount] = useState(() =>
    savedListening ? Number(savedListening.playedCount) || 0 : 0
  );
  const [time, setTime] = useState(() =>
    savedListening ? Number(savedListening.time) || 0 : 0
  );
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(() =>
    savedListening ? Number(savedListening.correctCount) || 0 : 0
  );
  const [wrongCount, setWrongCount] = useState(() =>
    savedListening ? Number(savedListening.wrongCount) || 0 : 0
  );
  const [isGenerating, setIsGenerating] = useState(() =>
    savedListening ? needsNextOnResume || !savedListening.currentQuestion : true
  );

  // State âm thanh đặc thù của Đôi Tai Vàng
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playCount, setPlayCount] = useState(() =>
    savedListening && !needsNextOnResume
      ? Number(savedListening.playCount) || 0
      : 0
  );

  // UX Timer State
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() =>
    savedListening &&
    !needsNextOnResume &&
    Number.isFinite(Number(savedListening.timeLeft))
      ? Math.max(0, Number(savedListening.timeLeft))
      : timeLimit
  );

  // Biến đếm đạn & Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedListening && Number.isFinite(Number(savedListening.aiWaitTime))
      ? Math.max(0, Number(savedListening.aiWaitTime))
      : 0
  );

  // Refs ổn định & quản lý vòng đời bất đồng bộ
  const historyQueueRef = useRef(
    typeof Utils?.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_memory', [])
      : []
  );
  const coordinatorRef = useRef(/** @type {any} */ (null));
  const isMountedRef = useRef(true);
  const isGameActiveRef = useRef(true);
  const hasExitedRef = useRef(false);
  const gameTimerRef = useRef(/** @type {any} */ (null));
  const audioTimeoutRef = useRef(/** @type {any} */ (null));
  const audioSessionIdRef = useRef(0);
  const retryTimerRef = useRef(/** @type {any} */ (null));
  const autoSaveTimerRef = useRef(/** @type {any} */ (null));
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  const fallbackIndexRef = useRef(0);
  const streakTrackerRef = useRef(/** @type {number[]} */ ([]));

  // Đồng bộ Refs cho callbacks & cấu hình động (chống Stale Closure)
  const globalRetryBagRef = useRef(globalRetryBag);
  const callbacksRef = useRef(cbs);
  const configRef = useRef(/** @type {Record<string, any>} */ ({
    safeLang,
    apiKey: cfg.apiKey || '',
    sourceMode,
    isAiMode,
    timerMode,
    timeLimit,
    maxPlays,
    isPaused,
    safeLevelString,
    canonicalHarvestLevel,
    topic: cfg.topic
  }));

  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  useEffect(() => {
    callbacksRef.current = cbs;
  });

  useEffect(() => {
    configRef.current = {
      safeLang,
      apiKey: cfg.apiKey || '',
      sourceMode,
      isAiMode,
      timerMode,
      timeLimit,
      maxPlays,
      isPaused,
      safeLevelString,
      canonicalHarvestLevel,
      topic: cfg.topic
    };
  }, [
    safeLang,
    cfg.apiKey,
    sourceMode,
    isAiMode,
    timerMode,
    timeLimit,
    maxPlays,
    isPaused,
    safeLevelString,
    canonicalHarvestLevel,
    cfg.topic
  ]);

  // Toast an toàn chuẩn 2 tham số (text, type) - diệt ts(2345)
  const safeShowToast = useCallback((msg, type = 'success') => {
    const text =
      typeof msg === 'string'
        ? msg
        : msg && typeof msg === 'object'
        ? String(msg.text || '')
        : '';
    if (!text) return;

    const showToastFn = callbacksRef.current?.showToast;
    if (typeof showToastFn === 'function') {
      showToastFn(text, type);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
      window.globalShowToast(text, type);
    }
  }, []);

  // Ảnh chụp trạng thái mới nhất cho Auto-Save & Exit
  const latestStateRef = useRef(/** @type {Record<string, any>} */ ({}));
  useEffect(() => {
    latestStateRef.current = {
      currentQuestion,
      selectedOptionIndex,
      checkStatus,
      attempts,
      score,
      combo,
      playedCount,
      time,
      correctCount,
      wrongCount,
      timeLeft,
      playCount,
      aiWaitTime
    };
  }, [
    currentQuestion,
    selectedOptionIndex,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    correctCount,
    wrongCount,
    timeLeft,
    playCount,
    aiWaitTime
  ]);

  // ============================================================================
  // AUDIO CONTROLLER (TẮT LOA THẬT + KHÓA PHIÊN audioSessionIdRef + NGHE LẠI)
  // ============================================================================
  const stopAudio = useCallback(() => {
    audioSessionIdRef.current += 1;
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    if (isMountedRef.current) {
      setIsAudioPlaying(false);
    }

    const stopSpeakingFn = callbacksRef.current?.stopSpeaking;
    if (typeof stopSpeakingFn === 'function') {
      try {
        stopSpeakingFn();
      } catch {
        // Bỏ qua lỗi từ trình phát ngoài
      }
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Bỏ qua trên trình duyệt chặn SpeechSynthesis
      }
    }
  }, []);

  const handlePlayAudio = useCallback(() => {
    if (!currentQuestion?.audioScript) return;

    // Nếu đang phát -> bấm lại để dừng phát tức thì (S12)
    if (isAudioPlaying) {
      stopAudio();
      return;
    }

    const isFinishedRound =
      checkStatus === 'correct' || checkStatus === 'failed';
    if (!isFinishedRound && playCount >= maxPlays) {
      return;
    }

    // Hủy mọi luồng đọc cũ và mở phiên âm thanh mới
    stopAudio();
    const mySessionId = audioSessionIdRef.current + 1;
    audioSessionIdRef.current = mySessionId;

    setIsAudioPlaying(true);
    if (!isFinishedRound) {
      setPlayCount((p) => p + 1);
    }

    let isDone = false;
    const finishPlay = () => {
      if (isDone) return;
      if (mySessionId !== audioSessionIdRef.current) return;
      isDone = true;
      if (audioTimeoutRef.current) {
        clearTimeout(audioTimeoutRef.current);
        audioTimeoutRef.current = null;
      }
      if (isMountedRef.current) {
        setIsAudioPlaying(false);
      }
    };

    const script = String(currentQuestion.audioScript || '').trim();
    const activeLang = configRef.current.safeLang;
    const msPerChar = activeLang === 'zh' ? 420 : 140;
    const durationMs = Math.min(90000, Math.max(12000, script.length * msPerChar));

    audioTimeoutRef.current = setTimeout(() => {
      finishPlay();
    }, durationMs);

    const onPlayFn = callbacksRef.current?.onPlay;
    if (typeof onPlayFn === 'function') {
      try {
        onPlayFn(script, 0.85, null, finishPlay);
      } catch (err) {
        console.warn('Listening onPlay error:', err);
        finishPlay();
      }
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(script);
        u.lang = activeLang === 'zh' ? 'zh-CN' : 'en-US';
        u.rate = 0.85;
        u.onend = finishPlay;
        u.onerror = finishPlay;
        window.speechSynthesis.speak(u);
      } catch (err) {
        console.warn('Fallback TTS error:', err);
        finishPlay();
      }
    } else {
      finishPlay();
    }
  }, [
    currentQuestion,
    isAudioPlaying,
    checkStatus,
    playCount,
    maxPlays,
    stopAudio
  ]);

  // ============================================================================
  // AUTO-SAVE & ĐÓNG GÓI KẾT THÚC AN TOÀN (KHÓA hasExitedRef DIỆT GHOST SESSION)
  // ============================================================================
  const triggerAutoSave = useCallback(() => {
    if (hasExitedRef.current || !isGameActiveRef.current) return;
    const onAutoSaveFn = callbacksRef.current?.onAutoSave;
    const currentData = latestStateRef.current;
    if (typeof onAutoSaveFn !== 'function' || !currentData?.currentQuestion) {
      return;
    }

    onAutoSaveFn({
      listeningState: {
        ...currentData,
        deck: [],
        _needsNextOnResume: false
      }
    });
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      triggerAutoSave();
    }, 150);
  }, [triggerAutoSave]);

  const handleEndGameInternal = useCallback(
    (overrideStats = undefined) => {
      if (hasExitedRef.current) return;
      hasExitedRef.current = true;
      isGameActiveRef.current = false;
      stopAudio();

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        try {
          coordinatorRef.current.destroy();
        } catch {
          // Bỏ qua lỗi hủy coordinator
        }
        coordinatorRef.current = null;
      }

      const snap = latestStateRef.current || {};
      const stats = overrideStats || {
        correct: Number(snap.correctCount) || 0,
        score: Number(snap.score) || 0,
        time: Number(snap.time) || 0,
        wrong: Number(snap.wrongCount) || 0
      };

      const onEndGameFn = callbacksRef.current?.onEndGame;
      if (typeof onEndGameFn === 'function') {
        onEndGameFn(stats);
      }
    },
    [stopAudio]
  );

  // ============================================================================
  // TÚI NHÁP TOÀN CỤC & LOG LỖI SAI
  // ============================================================================
  const localPushToRetryBag = useCallback((questionData) => {
    const fn = callbacksRef.current?.addToRetryBag;
    if (typeof fn === 'function' && questionData) {
      fn('listening', questionData);
    }
  }, []);

  const localRemoveFromRetryBag = useCallback((questionData) => {
    const fn = callbacksRef.current?.removeFromRetryBag;
    if (typeof fn === 'function' && questionData) {
      const primaryKey =
        String(questionData.term || '').trim() ||
        String(questionData.audioScript || '').trim();
      if (primaryKey) {
        fn('listening', primaryKey, {
          term: questionData.term,
          audioScript: questionData.audioScript
        });
      }
    }
  }, []);

  const logMistake = useCallback((question) => {
    const onLogWrongFn = callbacksRef.current?.onLogWrong;
    if (typeof onLogWrongFn !== 'function' || !question) return;

    const ansText = extractCorrectAnswerText(question) || 'Chưa rõ';
    const curCfg = configRef.current;

    const mistakeCard = {
      id:
        'mistake_' +
        String(Date.now()) +
        '_' +
        Math.random().toString(36).substring(2, 9),
      type: 'mistake',
      term: 'Nghe: ' + String(question.term || ''),
      definition: 'Đáp án: ' + ansText,
      analysis: String(question.explanation || ''),
      example: 'Transcript: ' + String(question.audioScript || ''),
      tags: ['listening', curCfg.safeLevelString, curCfg.sourceMode],
      timestamp: Date.now()
    };
    onLogWrongFn(mistakeCard);
  }, []);

  const handleSaveAndBack = useCallback(() => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    isGameActiveRef.current = false;
    stopAudio();

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }

    const currentData = latestStateRef.current || {};
    let finalWrongCount = Number(currentData.wrongCount) || 0;
    let finalCombo = Number(currentData.combo) || 1;
    let needsNext = false;

    if (
      currentData.checkStatus !== 'correct' &&
      currentData.checkStatus !== 'failed' &&
      currentData.currentQuestion
    ) {
      localPushToRetryBag(currentData.currentQuestion);
      logMistake(currentData.currentQuestion);
      finalWrongCount += 1;
      finalCombo = 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const onBackFn = callbacksRef.current?.onBack;
    if (typeof onBackFn === 'function') {
      onBackFn({
        listeningState: {
          ...currentData,
          deck: [],
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [stopAudio, localPushToRetryBag, logMistake, safeShowToast]);

  // ============================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (FALLBACK SONG NGỮ + FETCH TASK)
  // ============================================================================
  const getDefaultFallbackListening = useCallback(() => {
    const curCfg = configRef.current;
    const activeLang = curCfg.safeLang;

    const fbResult =
      typeof FallbackDataEngine?.getGameReadyFallback === 'function'
        ? FallbackDataEngine.getGameReadyFallback(
            'listening',
            activeLang,
            curCfg.safeLevelString,
            curCfg
          )
        : null;

    if (fbResult && !String(fbResult.term || '').includes('Lỗi hệ thống')) {
      const normalizedFb = normalizeListeningQuestion(
        { ...fbResult, isAiGenerated: false, _isRescued: true },
        false
      );
      if (normalizedFb) return normalizedFb;
    }

    const pool =
      LISTENING_FALLBACK_POOL[activeLang] || LISTENING_FALLBACK_POOL.en;
    const chosen = pool[fallbackIndexRef.current % pool.length];
    fallbackIndexRef.current += 1;

    return {
      audioScript: chosen.audioScript,
      term: chosen.term,
      options:
        typeof Utils?.shuffleArray === 'function'
          ? Utils.shuffleArray(chosen.options.map((o) => ({ ...o })))
          : chosen.options.map((o) => ({ ...o })),
      explanation: chosen.explanation,
      isAiGenerated: false,
      _isRescued: true,
      type: 'listening'
    };
  }, []);

  const fetchTask = useCallback(async () => {
    const curCfg = configRef.current;
    const activeLang = curCfg.safeLang;

    // 1. Đánh chặn 30%: Bốc từ Túi Nháp bằng khóa nguyên tử
    if (typeof pullRetryCardWithLock === 'function') {
      const pulledCard = pullRetryCardWithLock(
        'listening',
        globalRetryBagRef.current,
        activeLang
      );
      const validPulled = normalizeListeningQuestion(
        pulledCard,
        Boolean(pulledCard?.isAiGenerated)
      );
      if (validPulled) return validPulled;
    }

    // 2. Quét API Key 4 tầng (không bỏ sót Key Pool / Paid Key)
    const currentApiKey = resolveActiveApiKey(curCfg.apiKey);

    if (currentApiKey && typeof ExamEngine?.hydrateQuestion === 'function') {
      try {
        const meta = {
          id: 'listening_' + String(Date.now()),
          type: 'ioe_listening',
          level: curCfg.safeLevelString,
          topic: Array.isArray(curCfg.topic)
            ? curCfg.topic.join(', ')
            : String(curCfg.topic || ''),
          dataMode: 'vocab',
          mode: 'minigame',
          lang: activeLang
        };

        const aiCfg =
          typeof Utils?.safeJsonParse === 'function'
            ? Utils.safeJsonParse('fc_ai_config', {})
            : {};
        const dynamicTimeoutMs = Math.max(
          15000,
          (Number(aiCfg?.loadingTime) || 22) * 1000
        );

        const freshHistory =
          typeof Utils?.safeJsonParse === 'function'
            ? Utils.safeJsonParse('fc_ai_memory', [])
            : [];

        const qData = await runWithTimeout(
          ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory),
          dynamicTimeoutMs,
          'Timeout tải kịch bản Listening AI'
        );

        if (qData && qData.content) {
          const parsed = qData.content;
          const isRescued = Boolean(
            qData._isRescued || parsed._isRescued || qData.isFallback
          );
          const result = normalizeListeningQuestion(
            {
              audioScript: parsed.audioScript,
              term: parsed.question || parsed.term,
              options: parsed.options,
              explanation: parsed.explanation,
              isAiGenerated: !isRescued,
              _isRescued: isRescued,
              topic: meta.topic
            },
            !isRescued
          );

          if (result) {
            if (result.audioScript) {
              recordListeningAiMemory(
                result.audioScript.substring(0, 60),
                historyQueueRef
              );
            }

            // Thu hoạch AI chuẩn 2 tham số & 12 cột (chặn tuyệt đối _isRescued)
            const onSaveToHarvestFn = callbacksRef.current?.onSaveToHarvest;
            if (
              typeof onSaveToHarvestFn === 'function' &&
              result.isAiGenerated &&
              !result._isRescued
            ) {
              const correctAns = extractCorrectAnswerText(result);
              onSaveToHarvestFn(curCfg.canonicalHarvestLevel, {
                term: result.term,
                definition: correctAns,
                pronunciation: '',
                analysis:
                  'Transcript: ' +
                  result.audioScript +
                  (result.explanation
                    ? '\nGiải thích: ' + result.explanation
                    : ''),
                sinoViet: '',
                example: result.audioScript,
                image: '',
                partOfSpeech: 'Listening',
                topic: meta.topic || 'Listening Comprehension',
                grammar_type: ['Listening'],
                level: curCfg.canonicalHarvestLevel,
                language: activeLang,
                displaySentence: result.audioScript,
                targetWord: correctAns,
                hint: result.term
              });
            }

            if (isInitializingRef.current) {
              aiGeneratedCountRef.current += 1;
              safeShowToast(
                'Đã nạp xong kịch bản ' +
                  String(aiGeneratedCountRef.current) +
                  '...',
                'success'
              );
            }

            return result;
          }
        }
      } catch (e) {
        const errMsg =
          e instanceof Error ? e.message : String(e || 'Unknown error');
        console.warn('AI Listening Fallback:', errMsg);
        if (
          typeof window !== 'undefined' &&
          typeof window.logSystemEvent === 'function'
        ) {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề Listening AI', e);
        }
      }
    }

    // 3. Fallback khẩn cấp song ngữ EN/ZH
    return getDefaultFallbackListening();
  }, [safeShowToast, getDefaultFallbackListening]);

  // ============================================================================
  // KHỞI ĐỘNG & PHỤC HỒI VÒNG ĐỜI (CHUẨN REACT 18 STRICTMODE)
  // ============================================================================
  const applyNextQuestionToState = useCallback(
    (rawData, toastMessage = '') => {
      if (!isMountedRef.current || !isGameActiveRef.current) return;
      const prepared = applyListeningAntiStreak(rawData, streakTrackerRef);
      if (!prepared) return;

      setCurrentQuestion(prepared);
      setSelectedOptionIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setPlayCount(0);
      setIsGenerating(false);
      isInitializingRef.current = false;
      setTimeLeft(configRef.current.timeLimit || 45);
      setAiWaitTime(getConfiguredUiCooldown(9));
      if (toastMessage) {
        safeShowToast(toastMessage, 'success');
      }
    },
    [safeShowToast]
  );

  const startNewGame = useCallback(async () => {
    const curCfg = configRef.current;
    const currentApiKey = resolveActiveApiKey(curCfg.apiKey);

    if (!currentApiKey) {
      safeShowToast(
        'Chưa có API Key — đang chạy bộ kịch bản nghe mẫu dự phòng!',
        'warning'
      );
    }

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

    if (
      typeof window !== 'undefined' &&
      window.fc_audioCtx &&
      window.fc_audioCtx.state === 'suspended'
    ) {
      Promise.resolve(window.fc_audioCtx.resume()).catch(() => {});
    }

    if (coordinatorRef.current) {
      try {
        coordinatorRef.current.destroy();
      } catch {
        // Bỏ qua lỗi hủy cũ
      }
      coordinatorRef.current = null;
    }

    if (typeof QueueEngine?.createQueueCoordinator === 'function') {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 3);
    } else {
      const fb = getDefaultFallbackListening();
      applyNextQuestionToState(fb, 'Sẵn sàng! Hãy bấm nghe.');
      return;
    }

    const isOfflineFastTrack = !currentApiKey;
    try {
      await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);
    } catch (err) {
      console.warn('Listening initial maintain error:', err);
    }

    if (!isMountedRef.current || !isGameActiveRef.current) return;

    let firstData = coordinatorRef.current ? coordinatorRef.current.pop() : null;
    if (!firstData) {
      if (
        typeof window !== 'undefined' &&
        typeof window.logSystemEvent === 'function'
      ) {
        window.logSystemEvent(
          'Queue cạn đạn lúc khởi tạo Game Đôi Tai Vàng',
          'Kích hoạt Hard Fallback'
        );
      }
      if (currentApiKey) {
        safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      }
      firstData = getDefaultFallbackListening();
    }

    applyNextQuestionToState(firstData, 'Sẵn sàng! Hãy bấm nghe.');
  }, [
    safeShowToast,
    fetchTask,
    getDefaultFallbackListening,
    applyNextQuestionToState
  ]);

  // Mount Effect (khai báo TRƯỚC Auto-Save cleanup, dùng bootTimer 50ms + cancelled)
  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;
    isGameActiveRef.current = true;
    hasExitedRef.current = false;

    const bootTimer = setTimeout(() => {
      if (cancelled) return;

      if (savedListening) {
        if (coordinatorRef.current) {
          try {
            coordinatorRef.current.destroy();
          } catch {
            // Bỏ qua lỗi hủy cũ
          }
          coordinatorRef.current = null;
        }

        const hasKey = Boolean(resolveActiveApiKey(configRef.current.apiKey));
        const isOfflineFastTrack = !hasKey;

        if (typeof QueueEngine?.createQueueCoordinator === 'function') {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            3
          );
          if (needsNextOnResume || !savedListening.currentQuestion) {
            coordinatorRef.current
              .maintain(false, 22000, isOfflineFastTrack)
              .then(() => {
                if (cancelled || !isGameActiveRef.current) return;
                let data = coordinatorRef.current
                  ? coordinatorRef.current.pop()
                  : null;
                if (!data) {
                  if (
                    typeof window !== 'undefined' &&
                    typeof window.logSystemEvent === 'function'
                  ) {
                    window.logSystemEvent(
                      'Queue cạn đạn lúc Resume Game Đôi Tai Vàng',
                      'Kích hoạt Hard Fallback'
                    );
                  }
                  safeShowToast(
                    'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
                    'warning'
                  );
                  data = getDefaultFallbackListening();
                }
                applyNextQuestionToState(data);
              })
              .catch(() => {
                if (cancelled || !isGameActiveRef.current) return;
                applyNextQuestionToState(getDefaultFallbackListening());
              });
          } else {
            coordinatorRef.current
              .maintain(false, 22000, isOfflineFastTrack)
              .catch(() => {});
          }
        } else if (needsNextOnResume || !savedListening.currentQuestion) {
          applyNextQuestionToState(getDefaultFallbackListening());
        }
      } else {
        startNewGame();
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      isMountedRef.current = false;
      isGameActiveRef.current = false;
      stopAudio();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        try {
          coordinatorRef.current.destroy();
        } catch {
          // Bỏ qua lỗi hủy coordinator
        }
        coordinatorRef.current = null;
      }
    };
    // Chỉ chạy theo vòng đời mount/unmount của phiên chơi hiện tại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-Save định kỳ 5s (đặt SAU mount effect & khóa cứng bằng hasExitedRef)
  useEffect(() => {
    const intervalTimer = setInterval(() => {
      triggerAutoSave();
    }, 5000);
    return () => {
      clearInterval(intervalTimer);
      if (!hasExitedRef.current) {
        triggerAutoSave();
      }
    };
  }, [triggerAutoSave]);

  // Đồng hồ tổng thời gian chơi (tạm dừng khi isPaused hoặc isGenerating)
  useEffect(() => {
    if (isPaused || isGenerating) return;
    gameTimerRef.current = setInterval(() => {
      setTime((prev) => prev + 1);
    }, 1000);
    return () => {
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
    };
  }, [isPaused, isGenerating]);

  // Đồng hồ quét băng đạn ngầm (Queue Scanner 500ms, ưu tiên getPendingItems)
  useEffect(() => {
    const queueScanner = setInterval(() => {
      const coord = coordinatorRef.current;
      if (!coord) {
        setQueueLength(0);
        return;
      }
      if (typeof coord.getPendingItems === 'function') {
        const items = coord.getPendingItems();
        setQueueLength(Array.isArray(items) ? items.length : 0);
      } else if (typeof coord.length === 'function') {
        setQueueLength(Number(coord.length()) || 0);
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // Đồng hồ làm nguội Phanh UI (UI Cooldown Timer)
  useEffect(() => {
    let cdTimer = null;
    if (aiWaitTime > 0 && !isGenerating && !isResultPaused && !isPaused) {
      cdTimer = setTimeout(() => {
        setAiWaitTime((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isGenerating, isResultPaused, isPaused]);

  // ============================================================================
  // CHUYỂN CÂU & TƯƠNG TÁC NGƯỜI DÙNG
  // ============================================================================
  const proceedToNext = useCallback(
    (defaultDelaySec) => {
      if (!isGameActiveRef.current) return;
      let delaySec = Number(defaultDelaySec) || 8;
      if (aiWaitTime > delaySec) {
        delaySec = aiWaitTime;
      }
      if (delaySec < 1) delaySec = 1;
      setResultTimer(delaySec);
    },
    [aiWaitTime]
  );

  const nextRound = useCallback(() => {
    if (isGenerating || !isGameActiveRef.current) return;
    stopAudio();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    const coord = coordinatorRef.current;
    const queuedLen =
      coord && typeof coord.length === 'function' ? coord.length() : 0;

    if (coord && queuedLen > 0) {
      const nextData = coord.pop();
      applyNextQuestionToState(nextData || getDefaultFallbackListening());
      scheduleAutoSave();
      return;
    }

    if (!coord) {
      applyNextQuestionToState(getDefaultFallbackListening());
      scheduleAutoSave();
      return;
    }

    setIsGenerating(true);
    const hasKey = Boolean(resolveActiveApiKey(configRef.current.apiKey));
    const isOfflineFastTrack = !hasKey;

    coord
      .maintain(false, 22000, isOfflineFastTrack)
      .then(() => {
        if (!isMountedRef.current || !isGameActiveRef.current) return;
        let data = coordinatorRef.current ? coordinatorRef.current.pop() : null;
        if (!data) {
          if (
            typeof window !== 'undefined' &&
            typeof window.logSystemEvent === 'function'
          ) {
            window.logSystemEvent(
              'Queue cạn đạn lúc chuyển vòng Game Đôi Tai Vàng',
              'Kích hoạt Hard Fallback'
            );
          }
          if (hasKey) {
            safeShowToast(
              'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
              'warning'
            );
          }
          data = getDefaultFallbackListening();
        }
        applyNextQuestionToState(data);
        scheduleAutoSave();
      })
      .catch(() => {
        if (!isMountedRef.current || !isGameActiveRef.current) return;
        applyNextQuestionToState(getDefaultFallbackListening());
        scheduleAutoSave();
      });
  }, [
    isGenerating,
    stopAudio,
    applyNextQuestionToState,
    getDefaultFallbackListening,
    safeShowToast,
    scheduleAutoSave
  ]);

  const handleOptionClick = useCallback(
    (idx) => {
      if (
        checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        checkStatus === 'wrong_retry' ||
        isGenerating ||
        isPaused ||
        !currentQuestion
      ) {
        return;
      }

      stopAudio();
      const clickedOpt = currentQuestion.options?.[idx];
      if (!clickedOpt) return;

      setSelectedOptionIndex(idx);
      const isCorrect =
        clickedOpt.isCorrect === true ||
        String(clickedOpt.isCorrect || '').toLowerCase() === 'true';

      if (isCorrect) {
        if (attempts === 0) {
          localRemoveFromRetryBag(currentQuestion);
        }
        setCheckStatus('correct');
        setCorrectCount((p) => p + 1);
        setScore((p) => p + 20 * combo);
        setCombo((p) => p + 1);
        safeShowToast('Chính xác!', 'success');
        proceedToNext(8);
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
          proceedToNext(10);
        } else {
          setCheckStatus('wrong_retry');
          safeShowToast(
            'Chưa đúng! Còn ' + String(2 - newAttempts) + ' lượt.',
            'warning'
          );
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
          }
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (!isMountedRef.current) return;
            setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p));
            setSelectedOptionIndex(null);
          }, 1000);
        }
      }

      scheduleAutoSave();
    },
    [
      checkStatus,
      isGenerating,
      isPaused,
      currentQuestion,
      stopAudio,
      attempts,
      localRemoveFromRetryBag,
      combo,
      safeShowToast,
      proceedToNext,
      localPushToRetryBag,
      logMistake,
      scheduleAutoSave
    ]
  );

  const handleSkip = useCallback(() => {
    if (
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      isPaused ||
      !currentQuestion
    ) {
      return;
    }

    stopAudio();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(10);
    scheduleAutoSave();
  }, [
    checkStatus,
    isGenerating,
    isPaused,
    currentQuestion,
    stopAudio,
    localPushToRetryBag,
    safeShowToast,
    logMistake,
    proceedToNext,
    scheduleAutoSave
  ]);

  // Động cơ đếm ngược từng câu (Pure setTimeLeft updater, không side-effect)
  useEffect(() => {
    if (
      !timerMode ||
      isPaused ||
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion ||
      timeLeft <= 0
    ) {
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timerId);
  }, [timerMode, isPaused, checkStatus, isGenerating, currentQuestion, timeLeft]);

  // Giật cò khi hết giờ (Timeout Trigger)
  useEffect(() => {
    if (
      timerMode &&
      !isPaused &&
      timeLeft === 0 &&
      checkStatus !== 'correct' &&
      checkStatus !== 'failed' &&
      !isGenerating &&
      currentQuestion
    ) {
      const timeoutId = setTimeout(() => {
        if (!isMountedRef.current || !isGameActiveRef.current) return;
        stopAudio();
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(2);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(10);
        scheduleAutoSave();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [
    timeLeft,
    timerMode,
    isPaused,
    checkStatus,
    isGenerating,
    currentQuestion,
    stopAudio,
    localPushToRetryBag,
    safeShowToast,
    logMistake,
    proceedToNext,
    scheduleAutoSave
  ]);

  // Đồng hồ tự động chuyển câu sau khi hiện kết quả
  useEffect(() => {
    if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating &&
      !isPaused
    ) {
      const id = setTimeout(() => {
        setResultTimer((t) => (t > 0 ? t - 1 : 0));
      }, 1000);
      return () => clearTimeout(id);
    }

    if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      resultTimer === 0 &&
      !isResultPaused &&
      !isGenerating &&
      !isPaused &&
      aiWaitTime <= 0
    ) {
      const nextId = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(nextId);
    }
  }, [
    checkStatus,
    resultTimer,
    isResultPaused,
    isGenerating,
    isPaused,
    aiWaitTime,
    nextRound
  ]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((p) => !p);
  }, []);

  return {
    currentQuestion,
    selectedOptionIndex,
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
    isAudioPlaying,
    playCount,
    handlePlayAudio,
    stopAudio,
    maxPlays,
    aiWaitTime
  };
};

// ============================================================================
// 2. COMPONENT BỌC NGOÀI (ListeningGame Wrapper)
// ============================================================================
/**
 * Component bọc ngoài kết nối GameView (Ver 1.4) với ListeningPlayScreen.
 * @param {Record<string, any>} props
 */
export const ListeningGame = ({
  t = undefined,
  onFinish = undefined,
  onEndGame = undefined,
  onQuit = undefined,
  onBack = undefined,
  mainColor = 'cyan',
  lang = 'en',
  apiKey = '',
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = [],
  onLogWrong = undefined,
  settings = undefined,
  config = undefined,
  onSaveToHarvest = undefined,
  savedState = null,
  onAutoSave = undefined,
  onPlay = undefined,
  speak = undefined,
  stopSpeaking = undefined,
  showToast = undefined,
  isPaused = false,
  currentLevel = undefined,
  currentTopic = undefined,
  globalRetryBag = null,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined
}) => {
  /** @type {'en' | 'zh'} */
  const safeLang = lang === 'zh' ? 'zh' : 'en';

  /** @type {Record<string, any>} */
  const safeConfig = useMemo(() => {
    /** @type {Record<string, any>} */
    const base =
      config && typeof config === 'object' ? { ...config } : {};
    /** @type {Record<string, any>} */
    const merged = {
      ...base,
      level:
        base.level ??
        currentLevel ??
        (safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'),
      topic: base.topic ?? currentTopic ?? '',
      sourceMode: base.sourceMode || 'ai_pure',
      aiMode:
        base.aiMode !== undefined
          ? Boolean(base.aiMode)
          : (base.sourceMode || 'ai_pure') === 'ai_pure',
      timerMode: Boolean(base.timerMode),
      timeLimit: Number(base.timeLimit) > 0 ? Number(base.timeLimit) : 45,
      maxPlays: Number(base.maxPlays) > 0 ? Number(base.maxPlays) : 3
    };
    return merged;
  }, [config, currentLevel, currentTopic, safeLang]);

  const handleEndGameAction = useCallback(
    (stats = { correct: 0, time: 0, wrong: 0 }) => {
      if (typeof onFinish === 'function') {
        onFinish(
          Number(stats.correct) || 0,
          Number(stats.time) || 0,
          Number(stats.wrong) || 0
        );
      } else if (typeof onEndGame === 'function') {
        onEndGame(stats);
      }
    },
    [onFinish, onEndGame]
  );

  /** @type {Record<string, any>} */
  const hookConfig = useMemo(() => {
    /** @type {Record<string, any>} */
    const resolved = {
      ...safeConfig,
      isAiMode: Boolean(
        safeConfig.sourceMode === 'ai_pure' || safeConfig.aiMode
      ),
      apiKey,
      lang: safeLang,
      timeLimit: Number(safeConfig.timeLimit) || 45,
      maxPlays: Number(safeConfig.maxPlays) || 3,
      isPaused: Boolean(isPaused),
      savedState,
      globalRetryBag
    };
    return resolved;
  }, [safeConfig, apiKey, safeLang, isPaused, savedState, globalRetryBag]);

  const hookCallbacks = {
    showToast,
    onLogWrong,
    onSaveToHarvest,
    onAutoSave,
    onBack: onQuit || onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: handleEndGameAction,
    onPlay: speak || onPlay,
    stopSpeaking
  };

  const logic = useListeningLogic(hookConfig, hookCallbacks);

  // Gỡ window.handleSaveToNotebook legacy, ưu tiên prop từ GameView Ver 1.4
  const handleNotebookSave = useCallback(
    (payload) => {
      const saveFn = onBookmark || onSaveToNotebook;
      if (typeof saveFn === 'function') {
        saveFn(payload);
        return;
      }
      if (typeof showToast === 'function') {
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

  // Tập đối khớp Sổ tay O(1) chuẩn Unicode NFC — đồng bộ 100% với ListeningUI (S13)
  const notebookKeySet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(notebook)) {
      for (let i = 0; i < notebook.length; i += 1) {
        const item = notebook[i];
        const key = normalizeCompareKey(item?.term);
        if (key) set.add(key);
      }
    }
    return set;
  }, [notebook]);

  const isBookmarked = useMemo(() => {
    if (!logic.currentQuestion || notebookKeySet.size === 0) return false;
    const ansKey = normalizeCompareKey(
      extractCorrectAnswerText(logic.currentQuestion)
    );
    const termKey = normalizeCompareKey(logic.currentQuestion.term);
    return Boolean(
      (ansKey && notebookKeySet.has(ansKey)) ||
        (termKey && notebookKeySet.has(termKey))
    );
  }, [logic.currentQuestion, notebookKeySet]);

  return (
    <ListeningPlayScreen
      t={t}
      mainColor={mainColor}
      lang={safeLang}
      config={safeConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={logic.handleEndGameInternal}
      onSaveToNotebook={handleNotebookSave}
      isBookmarked={isBookmarked}
      settings={settings}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_22_useListeningLogic = useListeningLogic;
  window.useListeningLogic = useListeningLogic;
  window.Block5_22_ListeningGame = ListeningGame;
  window.ListeningGame = ListeningGame;
}

export default ListeningGame;