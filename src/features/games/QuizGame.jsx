// ============================================================================
// FILE 57/85: src/features/games/QuizGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.6 - Quiz Game Logic V1.45)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 21/11/2026 - 06:13 (GMT+7)
// NHIỆM VỤ: Động cơ Logic trung tâm cho trò chơi Trắc Nghiệm (Multiple Choice).
//           Nâng cấp Ver 1.1 theo Master Blueprint (report1.md):
//           1. Sửa chí mạng onPlay(text, null, null, done) diệt lỗi tua nhanh TTS,
//              bảo vệ Khiên WAV 15s, khôi phục xướng nhãn A/B/C/D cho isReverseListen
//              và chống treo nút "Đang đọc..." 8s khi bấm loa đáp án giữa chừng.
//           2. Khôi phục 100% Túi Nháp (top-level term + origin) & diệt stale closure
//              trong QueueCoordinator bằng fetchNextQuizQuestionRef & globalRetryBagRef.
//           3. Chuẩn hóa 100% hợp đồng ExamEngine (mode, grammarId, difficulty, history,
//              localDeck, fallbackIndexRef) + 3 lớp tự phục hồi Chế độ Đảo ngược.
//           4. Đồng bộ chuẩn AiMemoryManager (get/add), chuẩn hóa onSaveToHarvest,
//              showToast(string, type), loại bỏ 100% side-effect trong state updater,
//              tương thích ngược savedState.stats & hoàn thiện 0 Problems.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils, detectSentence } from '../../utils/helpers';
import { AiMemoryManager } from '../../utils/memoryManager';
import { pullRetryCardWithLock } from '../../services/db';
import { fillCardWithAi } from '../../services/geminiApi';
import { GameAlgoEngine } from '../../engines/gameOfflineEngine';
import { FallbackDataEngine } from '../../engines/fallbackData';
import { QueueEngine } from '../../engines/queueEngine';
import { ExamEngine } from '../../engines/exam';
import { GamePlayScreen } from './QuizUI';
import {
  normalizeLevelAndTopic,
  applyAntiStreak,
  createMistakePayload,
  handleExitDiscipline,
  mergePendingAmmoToDeck,
  playGameSFX,
  getConfiguredUiCooldown,
  resolveActiveApiKey
} from './common/gameHelpers';

const VIETNAMESE_DIACRITIC_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const HANZI_REGEX = /[\u4e00-\u9fff]/;

// Chuẩn hóa khóa so khớp Unicode NFC (không phân biệt hoa/thường & khoảng trắng)
const normalizeKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

// Kiểm tra chuỗi có mang hình thái Ngoại ngữ mục tiêu hay không (hỗ trợ tự phục hồi Đảo ngược)
const looksLikeForeignOption = (text, targetLang) => {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (VIETNAMESE_DIACRITIC_REGEX.test(clean)) return false;
  if (targetLang === 'zh') return HANZI_REGEX.test(clean);
  return /[a-zA-Z]/.test(clean);
};

// Đọc cấu hình lưu trữ an toàn từ LocalStorage
const readStoredQuizConfig = () => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem('fc_quiz_config');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

// Đọc độ trễ chuyển câu sau khi trả lời (từ GameMenu hoặc mặc định)
const getAutoNextDelaySeconds = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('fc_game_auto_next_delay');
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 15) {
        return Math.floor(parsed);
      }
    }
  } catch {
    // Fallback an toàn
  }
  return 3;
};

// Đọc cấu hình Lõi AI (maxAmmo, loadingTime...)
const getAiCoreConfig = () => {
  try {
    const cfg = Utils.safeJsonParse('fc_ai_config', {});
    return {
      maxAmmo: Math.max(1, Math.min(10, Number(cfg?.maxAmmo) || 4)),
      loadingTime: Math.max(5, Math.min(60, Number(cfg?.loadingTime) || 22))
    };
  } catch {
    return { maxAmmo: 4, loadingTime: 22 };
  }
};

// Khởi tạo bộ nhớ chống lặp 400 từ (đọc chuẩn AiMemoryManager.get() -> fallback)
const readInitialAiMemory = () => {
  try {
    if (AiMemoryManager) {
      if (typeof AiMemoryManager.get === 'function') {
        const mem = AiMemoryManager.get();
        if (Array.isArray(mem) && mem.length > 0) return [...mem];
      }
      if (typeof AiMemoryManager.getMemory === 'function') {
        const mem = AiMemoryManager.getMemory();
        if (Array.isArray(mem) && mem.length > 0) return [...mem];
      }
    }
  } catch {
    // Fallback sang localStorage
  }
  const savedMem = Utils.safeJsonParse('fc_ai_memory', []);
  return Array.isArray(savedMem) ? savedMem : [];
};

// Đồng bộ thêm từ vào bộ nhớ chống lặp 400 từ (tuyệt đối KHÔNG xóa trắng lịch sử cũ)
const pushTermToAiMemory = (term, historyRef) => {
  const cleanTerm = term ? String(term).trim() : '';
  if (!cleanTerm) return;

  let syncedViaManager = false;
  try {
    if (AiMemoryManager) {
      if (typeof AiMemoryManager.add === 'function') {
        AiMemoryManager.add(cleanTerm);
        syncedViaManager = true;
      } else if (typeof AiMemoryManager.push === 'function') {
        AiMemoryManager.push(cleanTerm);
        syncedViaManager = true;
      } else if (typeof AiMemoryManager.addTerm === 'function') {
        AiMemoryManager.addTerm(cleanTerm);
        syncedViaManager = true;
      }
    }
  } catch {
    syncedViaManager = false;
  }

  const baseList =
    Array.isArray(historyRef.current) && historyRef.current.length > 0
      ? historyRef.current
      : readInitialAiMemory();
  const cleanKey = normalizeKey(cleanTerm);
  const filtered = baseList.filter((item) => normalizeKey(item) !== cleanKey);
  filtered.push(cleanTerm);
  const nextList = filtered.slice(-400);
  historyRef.current = nextList;

  // Chỉ tự ghi trực tiếp xuống localStorage nếu AiMemoryManager không có phương thức quản lý
  if (!syncedViaManager) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fc_ai_memory', JSON.stringify(nextList));
      }
    } catch {
      // Bỏ qua lỗi đầy bộ nhớ trình duyệt
    }
  }
};

// Đóng gói payload chuẩn cho Túi Nháp (khớp 100% yêu cầu top-level term/origin của useAppLogic.addToRetryBag)
const buildRetryBagPayload = (questionData) => {
  if (!questionData || typeof questionData !== 'object') return null;
  const qObj = questionData.question && typeof questionData.question === 'object'
    ? questionData.question
    : questionData.origin || questionData;
  const term = qObj?.term ? String(qObj.term).trim() : '';
  if (!term) return null;

  return {
    ...questionData,
    term,
    origin: qObj
  };
};

// Chuẩn hóa cấu trúc dữ liệu câu hỏi từ ExamEngine (chống lồng 2 lớp question.question)
const normalizeExamQuizPayload = (rawPayload, { isReverse = false, isRescued = false } = {}) => {
  if (!rawPayload || typeof rawPayload !== 'object') return null;

  const content =
    rawPayload.content && typeof rawPayload.content === 'object' ? rawPayload.content : rawPayload;
  let questionObj = null;
  let rawOptions = [];

  if (content.question && typeof content.question === 'object') {
    questionObj = { ...content.question };
    rawOptions = Array.isArray(content.options)
      ? content.options
      : Array.isArray(content.question.options)
      ? content.question.options
      : [];
  } else if (content.term || content.definition || content.displaySentence) {
    questionObj = {
      term: content.term || content.displaySentence || '',
      definition: content.definition || content.meaning || '',
      pronunciation: content.pronunciation || '',
      displaySentence: content.displaySentence || content.term || '',
      level: content.level || rawPayload.level || '',
      topic: content.topic || rawPayload.topic || '',
      partOfSpeech: content.partOfSpeech || '',
      language: content.language || rawPayload.lang || '',
      questionText: content.questionText || '',
      _isRescued: Boolean(isRescued || content._isRescued || rawPayload._isRescued)
    };
    rawOptions = Array.isArray(content.options) ? content.options : [];
  }

  if (!questionObj || (!questionObj.term && !questionObj.definition)) return null;

  const normalizedOptions = rawOptions
    .filter((opt) => opt !== null && opt !== undefined)
    .map((opt) => {
      if (typeof opt === 'string') {
        const expected = isReverse ? questionObj.term : questionObj.definition;
        return {
          text: opt.trim(),
          meaning: '',
          isCorrect: normalizeKey(opt) === normalizeKey(expected)
        };
      }
      return {
        text: String(opt.text ?? opt.label ?? '').trim(),
        meaning: String(opt.meaning ?? opt.subText ?? '').trim(),
        isCorrect: Boolean(opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true')
      };
    })
    .filter((opt) => opt.text);

  if (normalizedOptions.length < 2) return null;

  // Đảm bảo luôn có ít nhất 1 đáp án đúng
  if (!normalizedOptions.some((o) => o.isCorrect)) {
    const expectedText = isReverse ? questionObj.term : questionObj.definition;
    const matchIdx = normalizedOptions.findIndex(
      (o) => normalizeKey(o.text) === normalizeKey(expectedText)
    );
    if (matchIdx >= 0) {
      normalizedOptions[matchIdx].isCorrect = true;
    } else {
      normalizedOptions[0].isCorrect = true;
    }
  }

  return {
    question: {
      ...questionObj,
      _isRescued: Boolean(isRescued || questionObj._isRescued || rawPayload._isRescued)
    },
    options: normalizedOptions,
    isAiGenerated: Boolean(rawPayload.isAiGenerated ?? content.isAiGenerated ?? !isRescued),
    _isRescued: Boolean(isRescued || content._isRescued || rawPayload._isRescued),
    _rawExamId: rawPayload.id || content.id || null
  };
};

// ============================================================================
// COMPONENT CHÍNH: QUIZ GAME
// ============================================================================
export const QuizGame = ({
  cards = [],
  t,
  mainColor = 'blue',
  lang = 'en',
  level,
  apiKey = '',
  timerMode: propTimerMode,
  listenMode: propListenMode,
  isAiMode: propIsAiMode,
  timeLimit: propTimeLimit,
  hardMode: propHardMode,
  config: propConfig = {},
  onPlay,
  onBookmark,
  notebook = [],
  showToast,
  onLogWrong,
  onMissingKey,
  onBack,
  onEndGame,
  onAutoSave,
  savedState = null,
  settings = {},
  onUpdateCards,
  onSaveToHarvest,
  globalRetryBag = {},
  addToRetryBag,
  removeFromRetryBag
}) => {
  const safeLang = lang === 'zh' ? 'zh' : 'en';

  // ==========================================================================
  // 1. HỢP NHẤT CẤU HÌNH THEO THỨ TỰ ƯU TIÊN CHUẨN (CHỐNG GHI ĐÈ KHI RESUME)
  //    Ưu tiên: savedState.config -> propConfig -> props phẳng -> localStorage
  // ==========================================================================
  const resolvedConfig = useMemo(() => {
    const stored = readStoredQuizConfig();
    const resumeCfg =
      savedState?.config && typeof savedState.config === 'object' ? savedState.config : {};
    const incomingCfg = propConfig && typeof propConfig === 'object' ? propConfig : {};

    const sourceMode =
      resumeCfg.sourceMode ?? incomingCfg.sourceMode ?? stored.sourceMode ?? 'card';
    const askMode = resumeCfg.askMode ?? incomingCfg.askMode ?? stored.askMode ?? 'term';
    const hardMode = Boolean(
      resumeCfg.hardMode ?? incomingCfg.hardMode ?? propHardMode ?? stored.hardMode ?? false
    );
    const listenMode = Boolean(
      resumeCfg.listenMode ?? incomingCfg.listenMode ?? propListenMode ?? stored.listenMode ?? false
    );
    const timerMode = Boolean(
      resumeCfg.timerMode ?? incomingCfg.timerMode ?? propTimerMode ?? stored.timerMode ?? false
    );
    const rawTimeLimit = Number(
      resumeCfg.timeLimit ?? incomingCfg.timeLimit ?? propTimeLimit ?? stored.timeLimit ?? 30
    );
    const timeLimit = Number.isFinite(rawTimeLimit) && rawTimeLimit > 0 ? rawTimeLimit : 30;
    const showPronun = Boolean(
      resumeCfg.showPronun ?? incomingCfg.showPronun ?? stored.showPronun ?? false
    );
    const autoReadAnswer = Boolean(
      resumeCfg.autoReadAnswer ?? incomingCfg.autoReadAnswer ?? stored.autoReadAnswer ?? false
    );
    const suddenDeath = Boolean(
      resumeCfg.suddenDeath ?? incomingCfg.suddenDeath ?? stored.suddenDeath ?? false
    );
    const dataMode = resumeCfg.dataMode ?? incomingCfg.dataMode ?? 'vocab';
    const grammarFocus =
      sourceMode === 'ai_pure' && askMode === 'def'
        ? resumeCfg.grammarFocus ?? incomingCfg.grammarFocus ?? 'random'
        : 'random';

    const rawAiFlag =
      resumeCfg.isAiMode ??
      resumeCfg.aiMode ??
      incomingCfg.isAiMode ??
      incomingCfg.aiMode ??
      propIsAiMode ??
      stored.aiMode ??
      false;

    const isAiMode =
      sourceMode === 'ai_pure'
        ? true
        : hardMode && askMode === 'term' && sourceMode === 'card'
        ? true
        : Boolean(rawAiFlag);

    const rawLevel =
      resumeCfg.level ??
      incomingCfg.level ??
      level ??
      (safeLang === 'zh' ? 'zh_level_4' : 'en_level_4');

    const rawTopic = resumeCfg.topic ?? incomingCfg.topic ?? [];

    return {
      sourceMode,
      askMode,
      hardMode,
      listenMode,
      timerMode,
      timeLimit,
      showPronun,
      autoReadAnswer,
      suddenDeath,
      dataMode,
      grammarFocus,
      isAiMode,
      aiMode: isAiMode,
      level: rawLevel,
      topic: rawTopic
    };
  }, [
    savedState,
    propConfig,
    propTimerMode,
    propListenMode,
    propIsAiMode,
    propTimeLimit,
    propHardMode,
    level,
    safeLang
  ]);

  const {
    sourceMode,
    askMode,
    hardMode,
    listenMode,
    timerMode,
    timeLimit,
    showPronun,
    isAiMode
  } = resolvedConfig;

  // ==========================================================================
  // 2. STATE & REFS QUẢN LÝ VÒNG ĐỜI VÁN CHƠI (TƯƠNG THÍCH NGƯỢC savedState.stats)
  // ==========================================================================
  const [currentQuestionData, setCurrentQuestionData] = useState(
    () => savedState?.currentQuestionData || null
  );
  const [streak, setStreak] = useState(
    () => Number(savedState?.streak ?? savedState?.stats?.streak) || 0
  );
  const [correctCount, setCorrectCount] = useState(
    () => Number(savedState?.correctCount ?? savedState?.stats?.correct) || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => Number(savedState?.wrongCount ?? savedState?.stats?.wrong) || 0
  );

  const [gameMode, setGameMode] = useState(() => (listenMode ? 'listen' : 'read'));
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [hasStartedListening, setHasStartedListening] = useState(() => !listenMode);
  const [listenPlayCount, setListenPlayCount] = useState(
    () => Number(savedState?.listenPlayCount) || 0
  );

  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [clickedWrongIndices, setClickedWrongIndices] = useState(() => {
    const savedWrong = savedState?.clickedWrongIndices;
    if (savedWrong instanceof Set) return new Set(savedWrong);
    if (Array.isArray(savedWrong)) return new Set(savedWrong);
    return new Set();
  });
  const [feedbackType, setFeedbackType] = useState(null);
  const [showChanceToast, setShowChanceToast] = useState(false);

  const [isGenerating, setIsGenerating] = useState(() => !savedState?.currentQuestionData);
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedT = Number(savedState?.timeLeft);
    return Number.isFinite(savedT) && savedT > 0 ? savedT : timeLimit;
  });
  const [isRoundStarted, setIsRoundStarted] = useState(() => !timerMode);
  const [isPaused, setIsPaused] = useState(false);

  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [aiAmmoCount, setAiAmmoCount] = useState(0);

  // Refs ổn định chống Stale Closure (cập nhật đồng bộ trong thân render)
  const isMountedRef = useRef(true);
  const configRef = useRef(resolvedConfig);
  const cardsRef = useRef(cards);
  const globalRetryBagRef = useRef(globalRetryBag);
  const deckRef = useRef([]);
  const coordinatorRef = useRef(null);
  const streakTrackerRef = useRef([]);
  const fallbackIndexRef = useRef(0);
  const isNextTransitioningRef = useRef(false);

  // Bộ nhớ chống lặp 400 từ: đồng bộ với AiMemoryManager & fc_ai_memory
  const historyQueueRef = useRef(readInitialAiMemory());

  // Refs phản chiếu state mới nhất cho AutoSave, Timers (StrictMode-safe) & Audio
  const currentQuestionDataRef = useRef(currentQuestionData);
  const isCheckingRef = useRef(isChecking);
  const isRoundStartedRef = useRef(isRoundStarted);
  const isPausedRef = useRef(isPaused);
  const isResultPausedRef = useRef(isResultPaused);
  const correctCountRef = useRef(correctCount);
  const wrongCountRef = useRef(wrongCount);
  const streakRef = useRef(streak);
  const timeLeftRef = useRef(timeLeft);
  const resultTimerValRef = useRef(resultTimer);
  const listenPlayCountRef = useRef(listenPlayCount);
  const clickedWrongIndicesRef = useRef(clickedWrongIndices);
  const singleOptionPlaysRef = useRef(0);

  // Refs quản lý tất cả Timers & Phiên âm thanh (diệt 100% Race Condition)
  const timerRef = useRef(null);
  const resultTimerRef = useRef(null);
  const safetyFallbackRef = useRef(null);
  const chanceToastTimerRef = useRef(null);
  const audioStepTimerRef = useRef(null);
  const audioStepResolveRef = useRef(null);
  const audioSessionIdRef = useRef(0);

  // Đồng bộ tức thời (0ms) trong thân render
  configRef.current = resolvedConfig;
  cardsRef.current = cards;
  globalRetryBagRef.current = globalRetryBag;
  currentQuestionDataRef.current = currentQuestionData;
  isCheckingRef.current = isChecking;
  isRoundStartedRef.current = isRoundStarted;
  isPausedRef.current = isPaused;
  isResultPausedRef.current = isResultPaused;
  correctCountRef.current = correctCount;
  wrongCountRef.current = wrongCount;
  streakRef.current = streak;
  listenPlayCountRef.current = listenPlayCount;
  clickedWrongIndicesRef.current = clickedWrongIndices;

  // ==========================================================================
  // 3. QUẢN LÝ TIMERS & ÂM THANH AN TOÀN (CHUẨN HỢP ĐỒNG useAppLogic.speak)
  // ==========================================================================
  // Tăng phiên âm thanh và xả các bước chờ chuỗi đọc (KHÔNG cancel speechSynthesis
  // trước khi gọi onPlay để bảo vệ Khiên WAV 15s của useAppLogic.speak)
  const bumpAudioSession = useCallback(() => {
    audioSessionIdRef.current += 1;
    if (audioStepTimerRef.current) {
      clearTimeout(audioStepTimerRef.current);
      audioStepTimerRef.current = null;
    }
    if (audioStepResolveRef.current) {
      const resolveWait = audioStepResolveRef.current;
      audioStepResolveRef.current = null;
      resolveWait();
    }
    return audioSessionIdRef.current;
  }, []);

  // Dừng hẳn âm thanh (dùng khi Pause, chuyển câu, thoát game hoặc unmount)
  const stopAllAudio = useCallback(() => {
    bumpAudioSession();
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Bỏ qua an toàn
    }
    if (isMountedRef.current) {
      setIsAudioPlaying(false);
    }
  }, [bumpAudioSession]);

  // Chờ giữa các nhịp đọc trong chuỗi A/B/C/D (có thể giải phóng ngay khi hủy phiên)
  const waitAudioStep = useCallback((ms) => {
    return new Promise((resolve) => {
      audioStepResolveRef.current = resolve;
      audioStepTimerRef.current = setTimeout(() => {
        audioStepTimerRef.current = null;
        audioStepResolveRef.current = null;
        resolve();
      }, ms);
    });
  }, []);

  const cleanupTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (resultTimerRef.current) {
      clearInterval(resultTimerRef.current);
      resultTimerRef.current = null;
    }
    if (safetyFallbackRef.current) {
      clearTimeout(safetyFallbackRef.current);
      safetyFallbackRef.current = null;
    }
    if (chanceToastTimerRef.current) {
      clearTimeout(chanceToastTimerRef.current);
      chanceToastTimerRef.current = null;
    }
  }, []);

  // Ref trỏ tới handleNext & startResultCountdown để dùng an toàn trong mọi callback
  const handleNextRef = useRef(null);

  // Bắt đầu đếm ngược thời gian chuyển câu (KHÔNG có side-effect trong React state updater)
  const startResultCountdown = useCallback((onDoneCallback) => {
    if (resultTimerRef.current) {
      clearInterval(resultTimerRef.current);
      resultTimerRef.current = null;
    }

    const cfg = configRef.current;
    const baseDelay = getAutoNextDelaySeconds();
    const cooldownSec =
      cfg.isAiMode || cfg.sourceMode === 'ai_pure'
        ? getConfiguredUiCooldown(baseDelay)
        : baseDelay;
    const initialSec = Math.max(
      baseDelay,
      cfg.isAiMode ? Math.min(cooldownSec, baseDelay + 2) : baseDelay
    );

    resultTimerValRef.current = initialSec;
    setResultTimer(initialSec);

    resultTimerRef.current = setInterval(() => {
      if (!isMountedRef.current || isPausedRef.current || isResultPausedRef.current) return;
      const nextVal = resultTimerValRef.current - 1;
      if (nextVal <= 0) {
        if (resultTimerRef.current) {
          clearInterval(resultTimerRef.current);
          resultTimerRef.current = null;
        }
        resultTimerValRef.current = 0;
        setResultTimer(0);
        if (typeof onDoneCallback === 'function') {
          onDoneCallback();
        }
        return;
      }
      resultTimerValRef.current = nextVal;
      setResultTimer(nextVal);
    }, 1000);
  }, []);

  // Hàm phát âm thanh 1 chuỗi — VÁ CHÍ MẠNG: gọi chuẩn 4 tham số onPlay(text, null, null, done)
  const speakOnce = useCallback(
    (textToSpeak, sessionId) => {
      return new Promise((resolve) => {
        if (!textToSpeak || sessionId !== audioSessionIdRef.current || !isMountedRef.current) {
          resolve();
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        // Timeout an toàn phòng trường hợp trình duyệt không bắn sự kiện onend
        const guardMs = Math.max(2500, Math.min(9000, String(textToSpeak).length * 140 + 1800));
        const guardTimer = setTimeout(finish, guardMs);

        const done = () => {
          clearTimeout(guardTimer);
          finish();
        };

        try {
          if (typeof onPlay === 'function') {
            // HỢP ĐỒNG useAppLogic.speak(text, rate = null, voice = null, onEnd = null)
            const ret = onPlay(String(textToSpeak), null, null, done);
            if (ret && typeof ret.then === 'function') {
              ret.then(done).catch(done);
            }
          } else {
            done();
          }
        } catch {
          done();
        }
      });
    },
    [onPlay]
  );

  // Phát âm thanh cho câu hỏi hiện tại (hỗ trợ cả xuôi và Đảo ngược + Luyện Nghe xướng A/B/C/D)
  const triggerAudio = useCallback(
    async (questionData = currentQuestionDataRef.current, { countAsPlay = true } = {}) => {
      if (!questionData || !isMountedRef.current) return;

      const cfg = configRef.current;
      const isLimited = cfg.listenMode && cfg.hardMode && !cfg.timerMode;
      if (countAsPlay && isLimited && listenPlayCountRef.current >= 2) {
        return;
      }

      const mySessionId = bumpAudioSession();

      if (countAsPlay && cfg.listenMode) {
        const nextCount = listenPlayCountRef.current + 1;
        listenPlayCountRef.current = nextCount;
        setListenPlayCount(nextCount);
      }

      setHasStartedListening(true);
      setIsAudioPlaying(true);

      try {
        if (cfg.askMode === 'def') {
          // Chế độ Đảo ngược + Luyện Nghe: xướng nhãn A/B/C/D rồi đọc lần lượt 4 đáp án
          const opts = Array.isArray(questionData.options) ? questionData.options : [];
          const optionLabels = ['A', 'B', 'C', 'D'];
          for (let idx = 0; idx < opts.length; idx++) {
            if (mySessionId !== audioSessionIdRef.current || !isMountedRef.current) return;
            const optText = opts[idx]?.text;
            if (!optText) continue;

            const label = optionLabels[idx];
            if (label) {
              await speakOnce(label, mySessionId);
              if (mySessionId !== audioSessionIdRef.current || !isMountedRef.current) return;
              await waitAudioStep(250);
            }

            if (mySessionId !== audioSessionIdRef.current || !isMountedRef.current) return;
            await speakOnce(optText, mySessionId);

            if (mySessionId !== audioSessionIdRef.current || !isMountedRef.current) return;
            if (idx < opts.length - 1) {
              await waitAudioStep(800);
            }
          }
        } else {
          // Chế độ Xuôi + Luyện Nghe: đọc từ/câu hỏi chính
          const qText = questionData.question?.term;
          if (qText) {
            await speakOnce(qText, mySessionId);
          }
        }
      } finally {
        if (mySessionId === audioSessionIdRef.current && isMountedRef.current) {
          setIsAudioPlaying(false);
        }
      }
    },
    [bumpAudioSession, speakOnce, waitAudioStep]
  );

  // Phát âm thanh trên từng đáp án (khớp QuizUI.jsx Ver 1.1 & chống treo "Đang đọc...")
  const handlePlayOption = useCallback(
    (textToSpeak, _optIndex, meta = {}) => {
      if (!textToSpeak || !isMountedRef.current) return;

      const cfg = configRef.current;
      const isReverseListenActive = Boolean(meta.isReverseListen && !meta.isChecking);
      const isLimited = cfg.listenMode && cfg.hardMode && !cfg.timerMode;

      // Chặn spam vô hạn ở Hard Mode khi bấm loa lẻ trước lúc trả lời:
      // 4 lần nghe đáp án lẻ = 1 lượt nghe tổng (nghe đủ cả 4 đáp án x 2 lượt)
      if (isReverseListenActive && isLimited) {
        if (listenPlayCountRef.current >= 2) return;
        singleOptionPlaysRef.current += 1;
        if (singleOptionPlaysRef.current >= 4) {
          singleOptionPlaysRef.current = 0;
          const nextCount = listenPlayCountRef.current + 1;
          listenPlayCountRef.current = nextCount;
          setListenPlayCount(nextCount);
        }
      }

      // Chống treo nút "Đang đọc..." (8s) nếu người dùng bấm loa nghe lại giữa lúc autoReadAnswer
      if (isCheckingRef.current && resultTimerValRef.current === -1) {
        if (safetyFallbackRef.current) {
          clearTimeout(safetyFallbackRef.current);
          safetyFallbackRef.current = null;
        }
        startResultCountdown(() => {
          if (isMountedRef.current && handleNextRef.current) {
            handleNextRef.current();
          }
        });
      }

      const mySessionId = bumpAudioSession();
      setHasStartedListening(true);
      setIsAudioPlaying(true);

      speakOnce(textToSpeak, mySessionId).finally(() => {
        if (mySessionId === audioSessionIdRef.current && isMountedRef.current) {
          setIsAudioPlaying(false);
        }
      });
    },
    [bumpAudioSession, speakOnce, startResultCountdown]
  );

  // ==========================================================================
  // 4. TRA CỨU NGHĨA GỐC & DỰNG CÂU HỎI TỪ THẺ (SONG NGỮ EN/ZH + NFC)
  // ==========================================================================
  const lookupCardMetadata = useCallback(
    (textVal, isForeignText) => {
      const targetKey = normalizeKey(textVal);
      if (!targetKey) return null;

      const searchPools = [cardsRef.current || []];
      try {
        const masterPool = Utils.safeJsonParse(`fc_data_${safeLang}`, []);
        if (Array.isArray(masterPool) && masterPool.length > 0) {
          searchPools.push(masterPool);
        }
      } catch {
        // Bỏ qua an toàn
      }

      for (const pool of searchPools) {
        const found = pool.find((c) => {
          if (!c) return false;
          const field = isForeignText ? c.term : c.definition;
          return normalizeKey(field) === targetKey;
        });
        if (found) return found;
      }

      // Fallback về kho dữ liệu tĩnh đúng ngôn ngữ
      try {
        if (FallbackDataEngine && typeof FallbackDataEngine.getFallbackData === 'function') {
          const fallbackLevel = safeLang === 'zh' ? 'zh_level_1' : 'en_level_1';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            configRef.current.dataMode === 'sentence' ? 'sentence' : 'vocab',
            fallbackLevel,
            25
          );
          if (Array.isArray(fbItems)) {
            const foundFb = fbItems.find((c) => {
              if (!c) return false;
              const field = isForeignText ? c.term : c.definition;
              return normalizeKey(field) === targetKey;
            });
            if (foundFb) return foundFb;
          }
        }
      } catch {
        // Bỏ qua an toàn
      }

      return null;
    },
    [safeLang]
  );

  // Dựng câu hỏi hoàn chỉnh từ 1 thẻ gốc (Online AI + Offline Fallback + Anti-Streak)
  const buildQuestionFromCard = useCallback(
    async (rawCard, { skipMemoryPush = false, forceOffline = false } = {}) => {
      if (!rawCard || !rawCard.term) return null;

      const cfg = configRef.current;
      const card = { ...rawCard };
      const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(cfg.level, cfg.topic, safeLang);
      const currentApiKey = resolveActiveApiKey(apiKey);
      const itemType =
        cfg.dataMode === 'sentence' || detectSentence(card.term) ? 'sentence' : 'word';

      // Tự động điền nghĩa nếu thẻ khuyết definition (đủ 7 tham số chuẩn, không mutate prop cards)
      if (!card.definition || !String(card.definition).trim()) {
        if (!forceOffline && currentApiKey && typeof fillCardWithAi === 'function') {
          try {
            const enriched = await fillCardWithAi(
              card.term,
              safeLang,
              currentApiKey,
              ['definition'],
              cfg.dataMode,
              pickedLevel,
              card
            );
            if (enriched && enriched.definition) {
              card.definition = String(enriched.definition).trim();
              if (typeof onUpdateCards === 'function') {
                onUpdateCards([card]);
              }
            }
          } catch (e) {
            console.warn('[QuizGame] Auto-fill definition failed:', e);
          }
        }
        if (!card.definition || !String(card.definition).trim()) {
          card.definition = card.term;
        }
      }

      // Ghi nhận từ đã dùng vào bộ nhớ 400 từ (không xóa lịch sử cũ)
      if (!skipMemoryPush) {
        pushTermToAiMemory(card.term, historyQueueRef);
      }

      const reverseMode = cfg.askMode === 'def';
      const correctText = reverseMode ? card.term : card.definition;
      const correctMeaning = reverseMode ? card.definition : card.term;

      let distractors = [];
      let isAiGenerated = false;

      // Nhánh 1: Tạo đáp án nhiễu bằng AI (khi bật isAiMode và có API Key)
      if (
        !forceOffline &&
        cfg.isAiMode &&
        currentApiKey &&
        GameAlgoEngine?.OptionsEngine?.ai_generateOptions
      ) {
        let timeoutId = null;
        try {
          const aiCallPromise = GameAlgoEngine.OptionsEngine.ai_generateOptions(
            card,
            safeLang,
            itemType,
            currentApiKey,
            3,
            pickedLevel,
            pickedTopic,
            reverseMode
          );
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('AI_OPTIONS_TIMEOUT')), 20000);
          });

          const aiResult = await Promise.race([aiCallPromise, timeoutPromise]);
          if (Array.isArray(aiResult) && aiResult.length > 0) {
            distractors = aiResult
              .filter((d) => d && d.text && normalizeKey(d.text) !== normalizeKey(correctText))
              .slice(0, 3);
            if (distractors.length > 0) {
              isAiGenerated = true;
            }
          }
        } catch (err) {
          console.warn('[QuizGame] AI distractors fallback to offline:', err?.message || err);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }

      // Nhánh 2: Bù đắp phần khuyết thiếu (hoặc chạy 100% Offline) bằng GameOfflineEngine
      if (distractors.length < 3 && GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
        const needed = 3 - distractors.length;
        const offlineRaw = GameAlgoEngine.OptionsEngine.offline_generateOptions(
          correctText,
          cardsRef.current,
          safeLang,
          itemType,
          needed + 3,
          reverseMode,
          cfg.hardMode
        );

        const existingTextKeys = new Set([
          normalizeKey(correctText),
          ...distractors.map((d) => normalizeKey(d.text))
        ]);
        const existingMeaningKeys = new Set([
          normalizeKey(correctMeaning),
          ...distractors.map((d) => normalizeKey(d.meaning)).filter(Boolean)
        ]);

        for (const textVal of offlineRaw || []) {
          if (distractors.length >= 3) break;
          const cleanVal = String(textVal || '').trim();
          const valKey = normalizeKey(cleanVal);
          if (!valKey || existingTextKeys.has(valKey)) continue;

          const matchedCard = lookupCardMetadata(cleanVal, reverseMode);
          const pairMeaning = matchedCard
            ? reverseMode
              ? matchedCard.definition || ''
              : matchedCard.term || ''
            : '';

          const meaningKey = normalizeKey(pairMeaning);
          if (meaningKey && existingMeaningKeys.has(meaningKey)) continue;

          existingTextKeys.add(valKey);
          if (meaningKey) existingMeaningKeys.add(meaningKey);
          distractors.push({ text: cleanVal, meaning: pairMeaning });
        }
      }

      const rawOptions = [
        { text: correctText, meaning: correctMeaning, isCorrect: true },
        ...distractors.slice(0, 3).map((d) => ({
          text: String(d.text || '').trim(),
          meaning: String(d.meaning || '').trim(),
          isCorrect: false
        }))
      ];

      const shuffledOptions = Utils.shuffleArray(rawOptions);
      return applyAntiStreak(
        {
          question: card,
          options: shuffledOptions,
          isAiGenerated,
          _isRescued: Boolean(card._isRescued)
        },
        streakTrackerRef
      );
    },
    [apiKey, lookupCardMetadata, onUpdateCards, safeLang]
  );

  // ==========================================================================
  // 4.5. TẦNG TỰ PHỤC HỒI 3 LỚP CHO DỮ LIỆU TỪ EXAM ENGINE (VÁ BUG E1/E2/E4)
  // ==========================================================================
  const repairAndNormalizeExamQuizPayload = useCallback(
    async (rawPayload, { isReverse = false, isRescued = false } = {}) => {
      const normalized = normalizeExamQuizPayload(rawPayload, { isReverse, isRescued });
      if (!normalized) return null;

      let question = { ...normalized.question };
      let options = normalized.options.map((opt) => ({ ...opt }));
      let isAiGenerated = normalized.isAiGenerated;

      if (isReverse) {
        // LỚP 1: Khôi phục question.term nếu getEmergencyFallback đã ghi đè Tiếng Việt vào .term
        const termStr = String(question.term || '');
        const defStr = String(question.definition || '');
        const correctOpt = options.find((o) => o.isCorrect);

        if (
          correctOpt &&
          correctOpt.text &&
          (normalizeKey(termStr) === normalizeKey(defStr) ||
            termStr.includes('(Thẻ khuyết nghĩa)') ||
            !termStr.trim())
        ) {
          if (normalizeKey(correctOpt.text) !== normalizeKey(defStr)) {
            question.term = correctOpt.text;
            if (!defStr.trim() || normalizeKey(defStr) === normalizeKey(correctOpt.text)) {
              question.definition = question.questionText || termStr || defStr;
            }
          }
        }

        // LỚP 2: Phát hiện & tự tái tạo 4 đáp án Ngoại ngữ khi ExamEngine 1-Shot/2-Shot trả nhầm chiều
        const termKey = normalizeKey(question.term);
        const defKey = normalizeKey(question.definition);
        const currentCorrect = options.find((o) => o.isCorrect);
        const correctMatchesDef = Boolean(
          currentCorrect &&
            defKey &&
            termKey &&
            termKey !== defKey &&
            normalizeKey(currentCorrect.text) === defKey
        );
        const missingForeignAnswer = Boolean(
          termKey &&
            !options.some((o) => normalizeKey(o.text) === termKey) &&
            looksLikeForeignOption(question.term, safeLang) &&
            currentCorrect &&
            !looksLikeForeignOption(currentCorrect.text, safeLang)
        );

        if (correctMatchesDef || missingForeignAnswer) {
          const wrongOpts = options.filter((o) => !o.isCorrect);
          const wrongOptsAreValidForeign =
            wrongOpts.length >= 2 &&
            wrongOpts.every((o) => looksLikeForeignOption(o.text, safeLang)) &&
            !wrongOpts.some((o) => normalizeKey(o.text) === termKey);

          if (wrongOptsAreValidForeign) {
            // Nhánh Legacy 2-Shot: chỉ đáp án đúng bị nhầm sang Tiếng Việt -> đổi lại sang Foreign term
            options = options.map((opt) =>
              opt.isCorrect
                ? { ...opt, text: question.term, meaning: question.definition || '' }
                : opt
            );
          } else {
            // Nhánh Fast 1-Shot vocab_mcq: cả 4 đáp án đều là Tiếng Việt -> tái tạo 4 đáp án Ngoại ngữ
            const rebuilt = await buildQuestionFromCard(question, {
              skipMemoryPush: true,
              forceOffline: Boolean(isRescued)
            });
            if (rebuilt && Array.isArray(rebuilt.options) && rebuilt.options.length >= 2) {
              question = { ...question, ...rebuilt.question, _isRescued: Boolean(isRescued) };
              options = rebuilt.options;
              isAiGenerated = Boolean(!isRescued && (isAiGenerated || rebuilt.isAiGenerated));
            }
          }
        }
      }

      // LỚP 3: Bổ sung meaning cho đáp án cứu hộ còn trống & kiểm duyệt tối thiểu 2 đáp án hợp lệ
      const enrichedOptions = options
        .filter((opt) => opt && opt.text)
        .map((opt) => {
          if (opt.meaning) return opt;
          if (opt.isCorrect) {
            return {
              ...opt,
              meaning: isReverse ? question.definition || '' : question.term || ''
            };
          }
          const matched = lookupCardMetadata(opt.text, isReverse);
          const inferredMeaning = matched
            ? isReverse
              ? matched.definition || ''
              : matched.term || ''
            : '';
          return { ...opt, meaning: inferredMeaning };
        });

      if (enrichedOptions.length < 2) return null;

      return {
        ...normalized,
        question,
        options: enrichedOptions,
        isAiGenerated
      };
    },
    [buildQuestionFromCard, lookupCardMetadata, safeLang]
  );

  // Dựng câu hỏi cứu hộ khẩn cấp khi ExamEngine AI Pure gặp sự cố mạng/API
  const getEmergencyQuizFallback = useCallback(async () => {
    const cfg = configRef.current;
    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(cfg.level, cfg.topic, safeLang);
    const reverseMode = cfg.askMode === 'def';

    // Ưu tiên 1: Xin cứu hộ đồng cấp từ ExamEngine (truyền đủ localDeck & fallbackIndex tuyến tính)
    try {
      if (ExamEngine && typeof ExamEngine.getEmergencyFallback === 'function') {
        const fbMeta = {
          id: `quiz_rescue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mode: 'minigame',
          type: 'quiz',
          lang: safeLang,
          level: pickedLevel,
          topic: pickedTopic,
          dataMode: cfg.dataMode,
          askMode: cfg.askMode,
          hardMode: cfg.hardMode,
          difficulty: cfg.hardMode ? 'hard' : 'easy'
        };
        const fbRaw = ExamEngine.getEmergencyFallback(
          fbMeta,
          cardsRef.current,
          fallbackIndexRef.current++
        );
        const repaired = await repairAndNormalizeExamQuizPayload(fbRaw, {
          isReverse: reverseMode,
          isRescued: true
        });
        if (repaired) {
          return applyAntiStreak(repaired, streakTrackerRef);
        }
      }
    } catch (e) {
      console.warn('[QuizGame] ExamEngine emergency fallback error:', e);
    }

    // Ưu tiên 2: Rút thẻ dự phòng từ FallbackDataEngine đúng ngôn ngữ & build câu hỏi offline
    try {
      if (FallbackDataEngine && typeof FallbackDataEngine.getFallbackData === 'function') {
        const fbCards = FallbackDataEngine.getFallbackData(
          safeLang,
          cfg.dataMode === 'sentence' ? 'sentence' : 'vocab',
          pickedLevel,
          12
        );
        if (Array.isArray(fbCards) && fbCards.length > 0) {
          const picked = {
            ...fbCards[fallbackIndexRef.current++ % fbCards.length],
            _isRescued: true
          };
          const built = await buildQuestionFromCard(picked, { forceOffline: true });
          if (built) return { ...built, isAiGenerated: false, _isRescued: true };
        }
      }
    } catch (e) {
      console.warn('[QuizGame] FallbackDataEngine rescue error:', e);
    }

    return null;
  }, [buildQuestionFromCard, repairAndNormalizeExamQuizPayload, safeLang]);

  // ==========================================================================
  // 5. HÀM TÁC VỤ NẠP ĐẠN CHO QUEUE ENGINE (ZERO STALE CLOSURE)
  // ==========================================================================
  const fetchNextQuizQuestion = useCallback(async () => {
    const cfg = configRef.current;
    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(cfg.level, cfg.topic, safeLang);
    const currentApiKey = resolveActiveApiKey(apiKey);
    const reverseMode = cfg.askMode === 'def';

    // 1. Ưu tiên bốc 30% thẻ từ Túi Nháp (đọc từ globalRetryBagRef.current mới nhất 0ms)
    try {
      const latestRetryBag = globalRetryBagRef.current;
      if (typeof pullRetryCardWithLock === 'function' && latestRetryBag) {
        const retryItem = pullRetryCardWithLock('quiz', latestRetryBag, safeLang);
        if (retryItem) {
          const readyQuiz = await repairAndNormalizeExamQuizPayload(retryItem, {
            isReverse: reverseMode,
            isRescued: Boolean(retryItem._isRescued)
          });
          if (readyQuiz && readyQuiz.options.length >= 2) {
            return applyAntiStreak(
              { ...readyQuiz, _fromRetryBag: true },
              streakTrackerRef
            );
          }
          const retryCard = retryItem.question || retryItem.origin || retryItem;
          if (retryCard && retryCard.term) {
            const builtRetry = await buildQuestionFromCard(retryCard);
            if (builtRetry) return { ...builtRetry, _fromRetryBag: true };
          }
        }
      }
    } catch (e) {
      console.warn('[QuizGame] Retry bag pull warning:', e);
    }

    // 2. Nhánh AI Tự Sinh (ai_pure) thông qua ExamEngine (đủ hợp đồng chuẩn)
    if (cfg.sourceMode === 'ai_pure') {
      if (currentApiKey && ExamEngine && typeof ExamEngine.hydrateQuestion === 'function') {
        try {
          const meta = {
            id: `quiz_pure_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            mode: 'minigame',
            type: 'quiz',
            lang: safeLang,
            level: pickedLevel,
            topic: pickedTopic,
            dataMode: cfg.dataMode,
            askMode: cfg.askMode,
            hardMode: cfg.hardMode,
            difficulty: cfg.hardMode ? 'hard' : 'easy',
            grammarId:
              cfg.grammarFocus && cfg.grammarFocus !== 'random' ? cfg.grammarFocus : null
          };

          const qData = await ExamEngine.hydrateQuestion(
            meta,
            currentApiKey,
            historyQueueRef.current
          );
          const repaired = await repairAndNormalizeExamQuizPayload(qData, {
            isReverse: reverseMode,
            isRescued: Boolean(qData?.content?._isRescued)
          });

          if (repaired) {
            pushTermToAiMemory(repaired.question?.term, historyQueueRef);

            // Thu hoạch câu hỏi AI sinh mới với đầy đủ siêu dữ liệu 12 cột Excel
            if (
              !repaired._isRescued &&
              typeof onSaveToHarvest === 'function' &&
              repaired.question?.term
            ) {
              try {
                const harvestPayload = {
                  ...repaired.question,
                  options: repaired.options,
                  level: repaired.question.level || pickedLevel,
                  topic: repaired.question.topic || pickedTopic,
                  language: repaired.question.language || safeLang,
                  dataMode: repaired.question.dataMode || cfg.dataMode,
                  type: 'quiz'
                };
                onSaveToHarvest(harvestPayload, safeLang, cfg.dataMode);
              } catch {
                // Không chặn luồng game nếu harvest lỗi
              }
            }
            return applyAntiStreak(repaired, streakTrackerRef);
          }
        } catch (err) {
          console.warn(
            '[QuizGame] ExamEngine.hydrateQuestion failed, rescuing:',
            err?.message || err
          );
        }
      }
      return await getEmergencyQuizFallback();
    }

    // 3. Nhánh Thẻ của tôi (card)
    if (!Array.isArray(deckRef.current) || deckRef.current.length === 0) {
      const sourceCards = Array.isArray(cardsRef.current) ? cardsRef.current : [];
      if (sourceCards.length === 0) return null;
      deckRef.current = Utils.shuffleArray([...sourceCards]);
    }

    const nextCard = deckRef.current.shift();
    if (!nextCard) return null;

    return await buildQuestionFromCard(nextCard);
  }, [
    apiKey,
    buildQuestionFromCard,
    getEmergencyQuizFallback,
    onSaveToHarvest,
    repairAndNormalizeExamQuizPayload,
    safeLang
  ]);

  // Khóa wrapper ổn định cho QueueCoordinator (không bao giờ giữ closure cũ)
  const fetchNextQuizQuestionRef = useRef(fetchNextQuizQuestion);
  fetchNextQuizQuestionRef.current = fetchNextQuizQuestion;

  // ==========================================================================
  // 6. CƠ CHẾ CHUYỂN CÂU & CHẤM ĐIỂM
  // ==========================================================================
  const syncAmmoCount = useCallback(() => {
    if (!isMountedRef.current) return;
    const len =
      coordinatorRef.current && typeof coordinatorRef.current.length === 'function'
        ? coordinatorRef.current.length()
        : 0;
    setAiAmmoCount(len);
  }, []);

  // Chuyển sang câu hỏi tiếp theo
  const handleNext = useCallback(async () => {
    if (!isMountedRef.current || isNextTransitioningRef.current) return;
    isNextTransitioningRef.current = true;

    cleanupTimers();
    stopAllAudio();

    isCheckingRef.current = false;
    setIsChecking(false);
    setSelectedOptionIndex(null);
    const emptyWrong = new Set();
    clickedWrongIndicesRef.current = emptyWrong;
    setClickedWrongIndices(emptyWrong);
    setFeedbackType(null);
    setShowChanceToast(false);
    isResultPausedRef.current = false;
    setIsResultPaused(false);
    resultTimerValRef.current = 0;
    setResultTimer(0);
    listenPlayCountRef.current = 0;
    setListenPlayCount(0);
    singleOptionPlaysRef.current = 0;

    const cfg = configRef.current;
    timeLeftRef.current = cfg.timeLimit;
    setTimeLeft(cfg.timeLimit);
    setHasStartedListening(!cfg.listenMode);

    try {
      let nextQ = null;
      const coord = coordinatorRef.current;

      if (coord && typeof coord.pop === 'function') {
        nextQ = coord.pop();
        syncAmmoCount();
      }

      if (!nextQ) {
        setIsGenerating(true);
        const { loadingTime } = getAiCoreConfig();
        const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.isAiMode;

        if (coord && typeof coord.maintain === 'function') {
          await coord.maintain(false, loadingTime * 1000, isOfflineFastTrack);
          nextQ = coord.pop();
          syncAmmoCount();
        }
        if (!nextQ) {
          nextQ = await fetchNextQuizQuestionRef.current();
        }
      } else if (coord && typeof coord.maintain === 'function') {
        const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.isAiMode;
        coord.maintain(false, 22000, isOfflineFastTrack).then(syncAmmoCount).catch(() => {});
      }

      if (!isMountedRef.current) return;

      currentQuestionDataRef.current = nextQ || null;
      setCurrentQuestionData(nextQ || null);
      setIsGenerating(false);

      // Tự phát âm thanh từ câu 2 trở đi khi đang ở Luyện Nghe (kể cả khi bật timerMode)
      if (nextQ && cfg.listenMode && (!cfg.timerMode || isRoundStartedRef.current)) {
        triggerAudio(nextQ, { countAsPlay: false });
      }
    } catch (err) {
      console.error('[QuizGame] handleNext failed:', err);
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    } finally {
      isNextTransitioningRef.current = false;
    }
  }, [cleanupTimers, stopAllAudio, syncAmmoCount, triggerAudio]);

  handleNextRef.current = handleNext;

  // Ghi nhận lỗi sai chuẩn hóa bằng createMistakePayload & Túi Nháp (có đủ top-level term)
  const recordMistake = useCallback(
    (questionData) => {
      if (!questionData) return;
      try {
        if (typeof onLogWrong === 'function') {
          const extraTags = [
            configRef.current.hardMode ? 'hard' : 'normal',
            configRef.current.listenMode ? 'listen' : 'read'
          ];
          const mistakeCard = createMistakePayload(questionData, 'quiz', extraTags);
          if (mistakeCard && mistakeCard.term) {
            onLogWrong(mistakeCard);
          }
        }
        if (typeof addToRetryBag === 'function') {
          const retryPayload = buildRetryBagPayload(questionData);
          if (retryPayload) {
            addToRetryBag('quiz', retryPayload);
          }
        }
      } catch (e) {
        console.warn('[QuizGame] recordMistake error:', e);
      }
    },
    [addToRetryBag, onLogWrong]
  );

  // Xử lý người dùng chọn đáp án / Hết giờ / Bỏ cuộc nghe
  const handleAnswer = useCallback(
    (index, isCorrect, isTimeout = false, isGiveUp = false) => {
      if (isCheckingRef.current || !currentQuestionDataRef.current || isPausedRef.current) return;

      const cfg = configRef.current;
      const questionData = currentQuestionDataRef.current;

      // Trường hợp SAI LẦN 1 ở chế độ Cơ hội thứ 2 (!suddenDeath):
      // Tuyệt đối KHÔNG gọi cleanupTimers() để đồng hồ timerMode chạy liên tục!
      if (
        !isCorrect &&
        !isTimeout &&
        !isGiveUp &&
        !cfg.suddenDeath &&
        clickedWrongIndicesRef.current.size === 0
      ) {
        playGameSFX('wrong', settings?.isMuted);
        const nextWrong = new Set(clickedWrongIndicesRef.current);
        nextWrong.add(index);
        clickedWrongIndicesRef.current = nextWrong;
        setClickedWrongIndices(nextWrong);
        setShowChanceToast(true);

        if (chanceToastTimerRef.current) clearTimeout(chanceToastTimerRef.current);
        chanceToastTimerRef.current = setTimeout(() => {
          chanceToastTimerRef.current = null;
          if (isMountedRef.current) setShowChanceToast(false);
        }, 1600);
        return;
      }

      // ĐÃ CHỐT KẾT QUẢ CÂU HỎI -> Dừng đồng hồ đếm giờ & âm thanh đang phát
      cleanupTimers();
      if (!cfg.autoReadAnswer) {
        stopAllAudio();
      }

      setSelectedOptionIndex(index);
      isCheckingRef.current = true;
      setIsChecking(true);
      setShowChanceToast(false);

      if (isCorrect) {
        playGameSFX('correct', settings?.isMuted);
        setFeedbackType('correct');
        const nextCorrect = correctCountRef.current + 1;
        correctCountRef.current = nextCorrect;
        setCorrectCount(nextCorrect);
        const nextStreak = streakRef.current + 1;
        streakRef.current = nextStreak;
        setStreak(nextStreak);

        // Xóa khỏi Túi Nháp nếu trả lời đúng
        if (typeof removeFromRetryBag === 'function' && questionData.question?.term) {
          try {
            removeFromRetryBag('quiz', questionData.question.term);
          } catch {
            // Bỏ qua an toàn
          }
        }
      } else {
        playGameSFX('wrong', settings?.isMuted);
        setFeedbackType(isTimeout ? 'timeout' : 'wrong');
        const nextWrongCount = wrongCountRef.current + 1;
        wrongCountRef.current = nextWrongCount;
        setWrongCount(nextWrongCount);
        streakRef.current = 0;
        setStreak(0);
        recordMistake(questionData);
      }

      const proceedNext = () => {
        if (isMountedRef.current && handleNextRef.current) {
          handleNextRef.current();
        }
      };

      // Chế độ "Đọc lại đáp án" trước khi đếm ngược chuyển câu
      if (cfg.autoReadAnswer && questionData.question?.term) {
        resultTimerValRef.current = -1;
        setResultTimer(-1); // Khớp QuizUI Ver 1.1: hiển thị "Đang đọc..."
        const mySessionId = bumpAudioSession();

        let movedToCountdown = false;
        const beginCountdown = () => {
          if (
            movedToCountdown ||
            !isMountedRef.current ||
            !isCheckingRef.current ||
            resultTimerValRef.current !== -1
          ) {
            return;
          }
          movedToCountdown = true;
          if (safetyFallbackRef.current) {
            clearTimeout(safetyFallbackRef.current);
            safetyFallbackRef.current = null;
          }
          startResultCountdown(proceedNext);
        };

        // Safety fallback 8000ms được lưu vào ref để hủy ngay nếu chuyển câu hoặc bấm loa lẻ
        safetyFallbackRef.current = setTimeout(beginCountdown, 8000);
        speakOnce(questionData.question.term, mySessionId).then(beginCountdown);
      } else {
        startResultCountdown(proceedNext);
      }
    },
    [
      bumpAudioSession,
      cleanupTimers,
      recordMistake,
      removeFromRetryBag,
      settings?.isMuted,
      speakOnce,
      startResultCountdown,
      stopAllAudio
    ]
  );

  // ==========================================================================
  // 7. ĐỒNG HỒ ĐẾM NGƯỢC GIỚI HẠN THỜI GIAN (REACT 18 STRICTMODE SAFE)
  // ==========================================================================
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (
      !timerMode ||
      !isRoundStarted ||
      isPaused ||
      isChecking ||
      isGenerating ||
      !currentQuestionData
    ) {
      return undefined;
    }

    timerRef.current = setInterval(() => {
      if (!isMountedRef.current || isPausedRef.current || isCheckingRef.current) return;
      const nextVal = timeLeftRef.current - 1;
      if (nextVal <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        timeLeftRef.current = 0;
        setTimeLeft(0);
        handleAnswer(999, false, true, false);
        return;
      }
      timeLeftRef.current = nextVal;
      setTimeLeft(nextVal);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [timerMode, isRoundStarted, isPaused, isChecking, isGenerating, currentQuestionData, handleAnswer]);

  // ==========================================================================
  // 8. KHỞI TẠO & KHÔI PHỤC PHIÊN CHƠI (MOUNT / RESUME)
  // ==========================================================================
  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const initGameSession = async () => {
      const cfg = configRef.current;

      // Chống treo màn hình trắng khi bộ thẻ < 2 ở chế độ Thẻ cá nhân
      // Khớp hợp đồng useAppLogic.showToast(messageString, type) — tuyệt đối không truyền Object
      if (
        cfg.sourceMode === 'card' &&
        (!Array.isArray(cardsRef.current) || cardsRef.current.length < 2)
      ) {
        setIsGenerating(false);
        if (typeof showToast === 'function') {
          const msg = t ? t('needMoreCards', { n: 2 }) : 'Cần ít nhất 2 thẻ để chơi Trắc Nghiệm';
          showToast(String(msg), 'error');
        }
        if (typeof onBack === 'function') onBack(null);
        return;
      }

      // Kiểm tra API Key 4 tầng nếu là chế độ AI Tự sinh
      if (cfg.sourceMode === 'ai_pure' && !resolveActiveApiKey(apiKey)) {
        if (typeof onMissingKey === 'function') onMissingKey();
      }

      // Khởi tạo bộ bài (ưu tiên khôi phục deck từ savedState nếu có)
      if (Array.isArray(savedState?.deck) && savedState.deck.length > 0) {
        deckRef.current = [...savedState.deck];
      } else {
        deckRef.current = Utils.shuffleArray([...(cardsRef.current || [])]);
      }

      // Khởi tạo QueueCoordinator với wrapper ổn định (diệt Stale Closure 100%)
      const { maxAmmo, loadingTime } = getAiCoreConfig();
      const coord =
        QueueEngine && typeof QueueEngine.createQueueCoordinator === 'function'
          ? QueueEngine.createQueueCoordinator(() => fetchNextQuizQuestionRef.current(), maxAmmo)
          : null;
      coordinatorRef.current = coord;

      const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.isAiMode;

      // Trường hợp 1: Resume và câu hiện tại vẫn chưa trả lời xong
      if (savedState?.currentQuestionData && !savedState?._needsNextOnResume) {
        currentQuestionDataRef.current = savedState.currentQuestionData;
        setCurrentQuestionData(savedState.currentQuestionData);
        setIsGenerating(false);

        if (coord && typeof coord.maintain === 'function') {
          coord.maintain(false, loadingTime * 1000, isOfflineFastTrack).then(syncAmmoCount).catch(() => {});
        }

        // Chỉ tự phát âm thanh câu 1 nếu KHÔNG bị khóa bởi timerMode chờ bấm BẮT ĐẦU
        if (cfg.listenMode && !cfg.timerMode) {
          triggerAudio(savedState.currentQuestionData, { countAsPlay: false });
        }
        return;
      }

      // Trường hợp 2: Ván mới hoặc Resume sau khi câu trước đã chấm xong (_needsNextOnResume === true)
      setIsGenerating(true);
      let firstQuestion = null;

      if (coord && typeof coord.maintain === 'function') {
        await coord.maintain(true, loadingTime * 1000, isOfflineFastTrack);
        if (cancelled) return;
        firstQuestion = coord.pop();
        syncAmmoCount();
        // Kích hoạt nạp đạn bổ sung ngầm (chỉ 1 luồng duy nhất)
        coord.maintain(false, loadingTime * 1000, isOfflineFastTrack).then(syncAmmoCount).catch(() => {});
      }

      if (!firstQuestion && !cancelled) {
        firstQuestion = await fetchNextQuizQuestionRef.current();
      }

      if (cancelled || !isMountedRef.current) return;

      currentQuestionDataRef.current = firstQuestion || null;
      setCurrentQuestionData(firstQuestion || null);
      setIsGenerating(false);

      // Không phát trộm âm thanh câu 1 khi timerMode đang khóa màn hình chờ bấm BẮT ĐẦU
      if (firstQuestion && cfg.listenMode && !cfg.timerMode) {
        triggerAudio(firstQuestion, { countAsPlay: false });
      }
    };

    initGameSession();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      cleanupTimers();
      stopAllAudio();
      if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
    };
    // Chạy đúng 1 lần khi mount mỗi phiên (GameView đổi key={gameSessionId} cho mỗi ván mới)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================================
  // 9. AUTO-SAVE ĐỊNH KỲ & LƯU PHIÊN KHI QUAY LẠI (CHỐNG CÀY ĐIỂM VÔ HẠN)
  // ==========================================================================
  const buildSessionSnapshot = useCallback(() => {
    const mergedDeck = mergePendingAmmoToDeck(coordinatorRef.current, deckRef.current);
    const alreadyChecked = isCheckingRef.current;

    return {
      // Nếu câu hiện tại đã chấm điểm xong (isChecking === true), đánh dấu _needsNextOnResume = true
      // để lần Resume sau tự chuyển sang câu mới, chặn 100% lỗi cày điểm vô hạn!
      currentQuestionData: alreadyChecked ? null : currentQuestionDataRef.current,
      _needsNextOnResume: alreadyChecked,
      deck: mergedDeck,
      streak: streakRef.current,
      correctCount: correctCountRef.current,
      wrongCount: wrongCountRef.current,
      timeLeft: alreadyChecked ? configRef.current.timeLimit : timeLeftRef.current,
      listenPlayCount: alreadyChecked ? 0 : listenPlayCountRef.current,
      clickedWrongIndices: alreadyChecked ? [] : Array.from(clickedWrongIndicesRef.current || []),
      config: configRef.current
    };
  }, []);

  // AutoSave mỗi 5 giây
  useEffect(() => {
    if (typeof onAutoSave !== 'function') return undefined;

    const autoSaveTimer = setInterval(() => {
      if (!isMountedRef.current || !currentQuestionDataRef.current) return;
      onAutoSave(buildSessionSnapshot());
    }, 5000);

    return () => clearInterval(autoSaveTimer);
  }, [buildSessionSnapshot, onAutoSave]);

  // Nút Back trên Header: lưu phiên an toàn rồi quay về Menu
  const handleSaveAndBack = useCallback(() => {
    cleanupTimers();
    stopAllAudio();
    const snapshot = currentQuestionDataRef.current ? buildSessionSnapshot() : null;
    if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }
    if (typeof onBack === 'function') {
      onBack(snapshot);
    }
  }, [buildSessionSnapshot, cleanupTimers, onBack, stopAllAudio]);

  // Nút Kết thúc ván chơi: áp dụng kỷ luật thoát ngang & báo kết quả
  const handleEndGameInternal = useCallback(
    (statsOverride) => {
      cleanupTimers();
      stopAllAudio();

      const totalAnswered = correctCountRef.current + wrongCountRef.current;
      if (currentQuestionDataRef.current && !isCheckingRef.current && totalAnswered > 0) {
        const retryPayload = buildRetryBagPayload(currentQuestionDataRef.current);
        handleExitDiscipline({
          isPlaying: true,
          isAnswered: false,
          currentCard: currentQuestionDataRef.current,
          rawQuestionData: retryPayload || currentQuestionDataRef.current,
          gameType: 'quiz',
          extraTags: ['early_exit'],
          onLogWrong,
          addToRetryBag
        });
      }

      if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }

      if (typeof onEndGame === 'function') {
        onEndGame(
          statsOverride || {
            correct: correctCountRef.current,
            wrong: wrongCountRef.current
          }
        );
      }
    },
    [addToRetryBag, cleanupTimers, onEndGame, onLogWrong, stopAllAudio]
  );

  // Nút "BẮT ĐẦU" khi dùng timerMode: mở khóa màn hình & tự phát âm thanh nếu đang Luyện nghe
  const handleStartRound = useCallback(() => {
    isRoundStartedRef.current = true;
    setIsRoundStarted(true);
    if (configRef.current.listenMode && currentQuestionDataRef.current) {
      triggerAudio(currentQuestionDataRef.current, { countAsPlay: false });
    }
  }, [triggerAudio]);

  // Nút Tạm dừng / Tiếp tục (không đặt side-effect trong updater)
  const handleTogglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) {
      stopAllAudio();
    }
  }, [stopAllAudio]);

  // Nút Dừng đếm ngược tự chuyển câu sau khi trả lời
  const handleToggleResultPause = useCallback(() => {
    const next = !isResultPausedRef.current;
    isResultPausedRef.current = next;
    setIsResultPaused(next);
  }, []);

  // Nút Bỏ qua câu này (ghi nhận vào Túi Nháp, tăng wrongCount +1, reset streak về 0)
  const handleSkip = useCallback(() => {
    if (isCheckingRef.current || isGenerating || isPausedRef.current) return;
    if (currentQuestionDataRef.current && typeof addToRetryBag === 'function') {
      try {
        const retryPayload = buildRetryBagPayload(currentQuestionDataRef.current);
        if (retryPayload) {
          addToRetryBag('quiz', retryPayload);
        }
      } catch {
        // Bỏ qua an toàn
      }
    }
    const nextWrong = wrongCountRef.current + 1;
    wrongCountRef.current = nextWrong;
    setWrongCount(nextWrong);
    streakRef.current = 0;
    setStreak(0);
    handleNext();
  }, [addToRetryBag, handleNext, isGenerating]);

  // Kiểm tra câu hỏi hiện tại đã có trong Sổ tay chưa (chuẩn hóa Unicode NFC)
  const isCurrentQuestionInNotebook = useMemo(() => {
    const qKey = normalizeKey(currentQuestionData?.question?.term);
    if (!qKey || !Array.isArray(notebook)) return false;
    return notebook.some((n) => normalizeKey(n?.term) === qKey);
  }, [currentQuestionData, notebook]);

  // ==========================================================================
  // 10. RENDER GIAO DIỆN CHƠI (GAME PLAY SCREEN)
  // ==========================================================================
  return (
    <GamePlayScreen
      t={t}
      mainColor={mainColor}
      currentQuestionData={currentQuestionData}
      streak={streak}
      gameMode={gameMode}
      setGameMode={setGameMode}
      isAudioPlaying={isAudioPlaying}
      playSequence={() => triggerAudio(currentQuestionDataRef.current, { countAsPlay: true })}
      onBookmark={onBookmark}
      isInNotebook={isCurrentQuestionInNotebook}
      onPlay={onPlay}
      onPlayOption={handlePlayOption}
      selectedOptionIndex={selectedOptionIndex}
      isChecking={isChecking}
      clickedWrongIndices={clickedWrongIndices}
      hasStartedListening={hasStartedListening}
      handleAnswer={handleAnswer}
      isAiMode={isAiMode}
      showChanceToast={showChanceToast}
      isGenerating={isGenerating}
      timerMode={timerMode}
      timeLeft={timeLeft}
      totalTime={timeLimit}
      isRoundStarted={isRoundStarted}
      onStartRound={handleStartRound}
      onEndGame={handleEndGameInternal}
      onPause={handleTogglePause}
      onBack={handleSaveAndBack}
      feedbackType={feedbackType}
      isPaused={isPaused}
      correctCount={correctCount}
      wrongCount={wrongCount}
      onSkip={handleSkip}
      settings={settings}
      askMode={askMode}
      showPronun={showPronun}
      hardMode={hardMode}
      listenPlayCount={listenPlayCount}
      sourceMode={sourceMode}
      config={resolvedConfig}
      aiWaitTime={0}
      resultTimer={resultTimer}
      isResultPaused={isResultPaused}
      toggleResultPause={handleToggleResultPause}
      onNext={handleNext}
      aiAmmoCount={aiAmmoCount}
      notebook={notebook}
    />
  );
};

if (typeof window !== 'undefined') {
  window.QuizGame = QuizGame;
  window.Block5_6_QuizGame = QuizGame;
}

export default QuizGame;