// ============================================================================
// FILE 59/85: src/features/games/FillBlankGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.9 - FillBlank Logic & Wrapper V2.32)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Điền Từ (useFillBlankLogic & FillBlankGame),
//           hỗ trợ đục lỗ 3 ma trận AI/Offline, chấm điểm Pinyin không dấu,
//           chế độ Địa Ngục (Hell Mode x3 điểm) và lưu phiên tự động.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { FillBlankPlayScreen } from './FillBlankUI';
import {
  getSafeLevelString,
  getConfiguredUiCooldown,
  extractPendingCardsFromQueue
} from './common/gameHelpers';

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (HOOK useFillBlankLogic)
// ============================================================================
export const useFillBlankLogic = (cards, config = {}, callbacks = {}) => {
  const {
    isAiMode,
    apiKey: propApiKey,
    lang,
    timeLimit,
    level,
    sourceMode = 'card',
    savedState,
    timerMode,
    globalRetryBag,
    aiChallenge
  } = config;

  const {
    showToast,
    onLogWrong,
    onSaveToHarvest,
    onAutoSave,
    onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame
  } = callbacks;

  // [MULTI-SELECT ARMOR] - Ép kiểu an toàn bảo vệ Tầng 2 khỏi biến Mảng
  const safeLevelString = getSafeLevelString(level, 'level_4_discovery_basic');
  const safeConfigLevel = getSafeLevelString(config?.level, safeLevelString);

  // [CỜ BẢO VỆ TÍN HIỆU AI] Đảm bảo nhánh Thử thách AI luôn được kích hoạt
  const isHellMode = config?.difficulty === 'hell';
  const effectiveAiMode =
    sourceMode === 'ai_pure' ||
    (sourceMode === 'card' && Boolean(aiChallenge)) ||
    Boolean(isAiMode);

  const savedFillBlank = savedState?.fillBlankState;
  const initialTime = isHellMode
    ? Math.min(15, timeLimit || 30)
    : timeLimit || 30;

  // State Game Cơ bản (Khởi tạo lười từ savedState để tránh cascading renders)
  const [currentQuestion, setCurrentQuestion] = useState(() =>
    savedFillBlank && !savedFillBlank._needsNextOnResume
      ? savedFillBlank.currentQuestion || null
      : null
  );
  const [inputBuffer, setInputBuffer] = useState(() =>
    savedFillBlank && !savedFillBlank._needsNextOnResume
      ? savedFillBlank.inputBuffer || ''
      : ''
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    savedFillBlank && !savedFillBlank._needsNextOnResume
      ? savedFillBlank.checkStatus || 'idle'
      : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    savedFillBlank && !savedFillBlank._needsNextOnResume
      ? savedFillBlank.attempts || 0
      : 0
  );
  const [score, setScore] = useState(() => savedFillBlank?.score || 0);
  const [combo, setCombo] = useState(() => savedFillBlank?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => savedFillBlank?.playedCount || 0
  );
  const [time, setTime] = useState(() => savedFillBlank?.time || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => savedFillBlank?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => savedFillBlank?.wrongCount || 0
  );
  const [isGenerating, setIsGenerating] = useState(() =>
    savedFillBlank && !savedFillBlank._needsNextOnResume && savedFillBlank.currentQuestion
      ? false
      : true
  );
  const [aiAmmoCount, setAiAmmoCount] = useState(0);

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);

  // State cho Đồng hồ đếm ngược từng câu (Cưỡng chế 15s cho Hell Mode)
  const [timeLeft, setTimeLeft] = useState(() =>
    savedFillBlank?.timeLeft !== undefined
      ? savedFillBlank.timeLeft
      : initialTime
  );

  // Biến Phanh UI (UI Cooldown)
  const [aiWaitTime, setAiWaitTime] = useState(
    () => savedFillBlank?.aiWaitTime || 0
  );

  // Refs quản lý bất đồng bộ
  const enrichedCardsRef = useRef(cards);
  const deckRef = useRef([]);
  const historyQueueRef = useRef(
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_memory', [])
      : []
  );
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const gameTimerRef = useRef(null);
  const isInitializingRef = useRef(false);
  const globalRetryBagRef = useRef(globalRetryBag);

  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  useEffect(() => {
    enrichedCardsRef.current = cards;
  }, [cards]);

  const safeShowToast = useCallback(
    (msg, type = 'success') => {
      const text = typeof msg === 'string' ? msg : msg?.text || 'Thông báo';
      if (showToast) {
        showToast({ text, type, id: Date.now() });
      } else if (typeof window !== 'undefined' && window.globalShowToast) {
        window.globalShowToast(text, type);
      }
    },
    [showToast]
  );

  // BỘ NÃO LƯU TRỮ VÀ AUTO-SAVE
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
    if (
      isGameActiveRef.current &&
      onAutoSave &&
      latestStateRef.current &&
      latestStateRef.current.currentQuestion
    ) {
      const currentData = latestStateRef.current;
      const pendingCards = extractPendingCardsFromQueue(coordinatorRef.current);
      const mergedDeck = [...pendingCards, ...(currentData.deck || [])];

      onAutoSave({
        fillBlankState: {
          ...currentData,
          deck: mergedDeck,
          _needsNextOnResume: false
        }
      });
    }
  }, [onAutoSave]);

  useEffect(() => {
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
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
        const aiCount = pending.filter((item) => item && item.isAiGenerated).length;
        setAiAmmoCount(aiCount);
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // ĐỒNG HỒ LÀM NGUỘI UI (UI COOLDOWN TIMER)
  useEffect(() => {
    let cdTimer = null;
    if (aiWaitTime > 0 && !isGenerating && !isResultPaused) {
      cdTimer = setTimeout(() => setAiWaitTime((prev) => prev - 1), 1000);
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // BỘ NÃO TÚI NHÁP TOÀN CỤC (GLOBAL RETRY BAG LOGIC)
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag && questionData) addToRetryBag('fillblank', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag && termToCheck) {
        removeFromRetryBag('fillblank', termToCheck);
      }
    },
    [removeFromRetryBag]
  );

  // Cỗ máy đóng gói Lỗi sai (Auto-Log)
  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const baseData = question.origin || {};
      const targetWordStr = question.targetWord || '';
      const underlinedTarget = targetWordStr
        .split('')
        .map((char) => char + '\u0332')
        .join('');
      const displayStr = question.displaySentence || '[__________]';
      const sentenceWithUnderline = displayStr.replace(
        '[__________]',
        underlinedTarget
      );

      const mistakeCard = {
        ...baseData,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        type: 'mistake',
        term: sentenceWithUnderline,
        definition:
          baseData.definition || question.hint || 'Thử thách Fill in the Blank',
        example: displayStr.replace('[__________]', targetWordStr),
        tags: ['fillblank', safeLevelString, sourceMode],
        timestamp: Date.now()
      };
      onLogWrong(mistakeCard);
    },
    [onLogWrong, safeLevelString, sourceMode]
  );

  const handleSaveAndBack = useCallback(() => {
    const currentData = latestStateRef.current;
    let finalWrongCount = currentData.wrongCount;
    let finalCombo = currentData.combo;
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
    }

    if (onBack) {
      onBack({
        fillBlankState: {
          ...currentData,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [localPushToRetryBag, logMistake, onBack, safeShowToast]);

  // ============================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE) - FETCH TASK
  // ============================================================================
  const fetchTask = async () => {
    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp
    const pullLockFn = pullRetryCardWithLock || Utils?.pullRetryCardWithLock;
    if (typeof pullLockFn === 'function') {
      const pulledCard = pullLockFn('fillblank', globalRetryBagRef.current, lang);
      if (pulledCard) return pulledCard;
    }

    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey =
      localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key') ||
      propApiKey ||
      '';

    // 2. AI PURE MODE: Tạo câu mới hoàn toàn từ AI thông qua ExamEngine
    if (isPureMode && effectiveAiMode && currentApiKey) {
      try {
        const meta = {
          id: `fillblank_${Date.now()}`,
          type: 'ioe_fill_blank',
          level: safeLevelString,
          topic: config?.topic || '',
          dataMode: 'sentence',
          lang: lang,
          mode: 'minigame'
        };
        const freshHistory = Utils
          ? Utils.safeJsonParse('fc_ai_memory', [])
          : [];
        const qData = await ExamEngine.hydrateQuestion(
          meta,
          currentApiKey,
          freshHistory
        );

        if (qData && qData.content) {
          if (onSaveToHarvest) {
            onSaveToHarvest(
              safeLevelString,
              {
                displaySentence: qData.content.displaySentence,
                targetWord: qData.content.targetWord,
                hint: qData.content.hint
              },
              'ioe_fill_blank'
            );
          }
          if (isInitializingRef.current) {
            safeShowToast('Đang nạp đạn AI...', 'info');
          }
          return qData.content;
        }
      } catch (e) {
        console.warn('AI FillBlank PureMode Fallback:', e.message);
        if (typeof window !== 'undefined' && window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề FillBlank', e);
        }
      }
    }

    // 3. RÚT THẺ GỐC HOẶC TỪ KHO CỨU HỘ
    let baseCard = null;
    if (!isPureMode || deckRef.current.length > 0) {
      if (deckRef.current.length === 0 && sourceMode !== 'ai_pure') {
        let validCards = (enrichedCardsRef.current || []).filter(
          (c) => c && c.term && c.term.trim() !== ''
        );
        if (validCards.length < 2 && FallbackDataEngine) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = config?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const safeLevelForFb =
            safeConfigLevel || (safeLang === 'zh' ? 'zh_level_1' : 'en_level_1');
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            mode,
            safeLevelForFb,
            20
          );
          if (fbItems && fbItems.length > 0) {
            const existingTerms = new Set(validCards.map((c) => c.term));
            const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length === 0) {
          validCards = [
            {
              term: 'Learning languages is very fun.',
              definition: 'Học ngôn ngữ rất thú vị.'
            }
          ];
        }
        deckRef.current = Utils?.shuffleArray
          ? Utils.shuffleArray(validCards)
          : validCards;
      }
      baseCard = deckRef.current.shift();
    }

    // 4. CỨU HỘ KHẨN CẤP
    if (!baseCard) {
      const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
      const fbResult = FallbackDataEngine?.getGameReadyFallback
        ? FallbackDataEngine.getGameReadyFallback(
            'fillblank',
            safeLang,
            safeConfigLevel,
            config
          )
        : null;
      if (fbResult) return fbResult;
      baseCard = {
        term: 'Learning languages is very fun.',
        definition: 'Học ngôn ngữ rất thú vị. (Dự phòng)'
      };
    }

    // Sliding Window 400 & Sync LocalStorage cho Card Mode
    if (historyQueueRef.current && baseCard && baseCard.term) {
      if (!historyQueueRef.current.includes(baseCard.term)) {
        historyQueueRef.current.push(baseCard.term);
        while (historyQueueRef.current.length > 400) {
          historyQueueRef.current.shift();
        }
        try {
          localStorage.setItem(
            'fc_ai_memory',
            JSON.stringify(historyQueueRef.current)
          );
        } catch {
          // Bỏ qua lỗi bộ nhớ đầy
        }
      }
    }

    const isSentence = config?.dataMode === 'sentence';
    const type = isSentence ? 'sentence' : 'word';

    // 5. ĐỘNG CƠ ĐỤC LỖ CHUNG (MASKING ENGINE)
    let maskedResult = null;
    if (
      effectiveAiMode &&
      currentApiKey &&
      isSentence &&
      GameAlgoEngine?.ClozeEngine?.ai_mask
    ) {
      try {
        const aiMaskPromise = GameAlgoEngine.ClozeEngine.ai_mask(
          baseCard.term,
          baseCard.definition,
          lang,
          currentApiKey,
          safeLevelString,
          config?.topic
        );
        let dynamicTimeout = 22000;
        try {
          const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config') || '{}');
          if (aiCfg && aiCfg.loadingTime) {
            dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
          }
        } catch {
          // Mặc định 22s
        }
        const timeoutPromise = new Promise((_, r) =>
          setTimeout(() => r(new Error('AI Mask Timeout')), dynamicTimeout)
        );
        const res = await Promise.race([aiMaskPromise, timeoutPromise]);
        maskedResult = {
          ...res,
          origin: baseCard,
          type: type,
          isAiGenerated: true
        };
      } catch (e) {
        console.warn('AI Masking failed, fallback to offline mask:', e.message);
        if (typeof window !== 'undefined' && window.logSystemEvent) {
          window.logSystemEvent('Lỗi AI ClozeEngine (Đục lỗ)', e);
        }
        if (deckRef.current) deckRef.current.unshift(baseCard);
        return null;
      }
    }

    // 6. CHẾ ĐỘ OFFLINE THUẦN TÚY HOẶC JIT FALLBACK NỘI BỘ
    if (!maskedResult) {
      const offRes = GameAlgoEngine?.ClozeEngine?.offline_mask
        ? GameAlgoEngine.ClozeEngine.offline_mask(
            baseCard.term,
            lang,
            type,
            enrichedCardsRef.current || []
          )
        : {
            targetWord: baseCard.term,
            displaySentence: '[__________]',
            hint: baseCard.definition,
            distractors: []
          };

      maskedResult = {
        ...offRes,
        origin: baseCard,
        hint: baseCard.definition || offRes.hint,
        type: type,
        isAiGenerated: false
      };
    }

    return maskedResult;
  };

  // Hàm cứu hộ tức thời (JIT Offline Fallback) khi Queue AI bị rỗng
  const getJitFallbackQuestion = useCallback(() => {
    if (effectiveAiMode && deckRef.current && deckRef.current.length > 0) {
      const fallbackCard = deckRef.current.shift();
      if (fallbackCard) {
        const type = config?.dataMode === 'sentence' ? 'sentence' : 'word';
        const offlineResult = GameAlgoEngine?.ClozeEngine?.offline_mask
          ? GameAlgoEngine.ClozeEngine.offline_mask(
              fallbackCard.term,
              lang,
              type,
              enrichedCardsRef.current || []
            )
          : {
              targetWord: fallbackCard.term,
              displaySentence: '[__________]',
              hint: fallbackCard.definition,
              distractors: []
            };
        safeShowToast('AI quá tải, đã kích hoạt thuật toán nội bộ!', 'warning');
        return {
          ...offlineResult,
          origin: fallbackCard,
          hint: fallbackCard.definition || offlineResult.hint,
          isAiGenerated: false,
          _isRescued: true
        };
      }
    }

    if (typeof window !== 'undefined' && window.logSystemEvent) {
      window.logSystemEvent(
        'Queue cạn đạn Game Điền Từ',
        'Kích hoạt Hard Fallback'
      );
    }
    safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
    const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
    return FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'fillblank',
          safeLang,
          safeConfigLevel,
          config
        )
      : null;
  }, [config, effectiveAiMode, lang, safeConfigLevel, safeShowToast]);

  const startNewGame = async () => {
    setIsGenerating(true);
    setPlayedCount(0);
    setScore(0);
    setCombo(1);
    setTime(0);
    setCorrectCount(0);
    setWrongCount(0);
    isInitializingRef.current = true;

    let currentDeck = sourceMode === 'card' ? [...(cards || [])] : [];
    if (sourceMode === 'card') {
      let validCards = currentDeck.filter(
        (c) => c && c.term && c.term.trim() !== ''
      );
      if (validCards.length < 2) {
        safeShowToast(
          'Bộ thẻ không đủ 2 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
          'warning'
        );
        if (FallbackDataEngine?.getFallbackData) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = config?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const safeLevelForFb =
            safeConfigLevel || (safeLang === 'zh' ? 'zh_level_1' : 'en_level_1');
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            mode,
            safeLevelForFb,
            20
          );
          if (fbItems && fbItems.length > 0) {
            const existingTerms = new Set(validCards.map((c) => c.term));
            const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length < 2) {
          const defaults = [
            {
              term: 'Learning languages is very fun.',
              definition: 'Học ngôn ngữ rất thú vị.'
            },
            {
              term: 'I practice English every day.',
              definition: 'Tôi thực hành tiếng Anh mỗi ngày.'
            }
          ];
          const existingTerms = new Set(validCards.map((c) => c.term));
          const neededDefaults = defaults.filter(
            (f) => !existingTerms.has(f.term)
          );
          validCards = [...validCards, ...neededDefaults];
        }
      }
      deckRef.current = Utils?.shuffleArray
        ? Utils.shuffleArray(validCards)
        : validCards;
    } else {
      deckRef.current = [];
    }

    if (coordinatorRef.current) coordinatorRef.current.destroy();
    if (QueueEngine?.createQueueCoordinator) {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
    } else {
      safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
      return;
    }

    const isOfflineFastTrack = sourceMode === 'card' && !effectiveAiMode;
    await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);

    let data = coordinatorRef.current.pop();
    if (!data) {
      data = getJitFallbackQuestion();
    }

    if (isGameActiveRef.current && data) {
      setCurrentQuestion(data);
      setInputBuffer('');
      setCheckStatus('idle');
      setAttempts(0);
      setIsGenerating(false);
      isInitializingRef.current = false;
      setTimeLeft(isHellMode ? Math.min(15, timeLimit || 30) : timeLimit || 30);

      const currentCooldown =
        sourceMode === 'ai_pure' || effectiveAiMode
          ? getConfiguredUiCooldown(9)
          : 0;
      setAiWaitTime(currentCooldown);
      safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
    } else if (isGameActiveRef.current) {
      safeShowToast(
        'Lỗi nghiêm trọng khi tải dữ liệu. Buộc kết thúc.',
        'error'
      );
      setIsGenerating(false);
      isInitializingRef.current = false;
      if (onEndGame) onEndGame({ correct: 0, wrong: 0, time: 0 });
    }

    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    gameTimerRef.current = setInterval(() => {
      setTime((prev) => prev + 1);
    }, 1000);
  };

  // KHỞI ĐỘNG HOẶC PHỤC HỒI PHIÊN CHƠI TỪ SESSION
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const initTimer = setTimeout(() => {
      if (savedState && savedState.fillBlankState) {
        const st = savedState.fillBlankState;
        if (st.deck) {
          if (st.deck.length > 0 && typeof st.deck[0] === 'number') {
            deckRef.current = st.deck
              .map((idx) => (cards || [])[idx])
              .filter(Boolean);
          } else {
            deckRef.current = [...st.deck];
          }
        }

        if (coordinatorRef.current) coordinatorRef.current.destroy();
        if (QueueEngine?.createQueueCoordinator) {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            4
          );
          const isOfflineFastTrack = sourceMode === 'card' && !effectiveAiMode;
          coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
        }

        if (st._needsNextOnResume) {
          setCurrentQuestion(null);
          setIsGenerating(true);
          const isOfflineFastTrack = sourceMode === 'card' && !effectiveAiMode;
          coordinatorRef.current
            .maintain(false, 22000, isOfflineFastTrack)
            .then(() => {
              if (isGameActiveRef.current) {
                let data = coordinatorRef.current.pop();
                if (!data) {
                  data = getJitFallbackQuestion();
                }
                if (data) {
                  setCurrentQuestion(data);
                  setInputBuffer('');
                  setCheckStatus('idle');
                  setAttempts(0);
                  setIsGenerating(false);
                  setTimeLeft(
                    isHellMode ? Math.min(15, timeLimit || 30) : timeLimit || 30
                  );
                  const currentCooldown =
                    sourceMode === 'ai_pure' || effectiveAiMode
                      ? getConfiguredUiCooldown(9)
                      : 0;
                  setAiWaitTime(currentCooldown);
                } else {
                  safeShowToast('Lỗi tải dữ liệu. Buộc kết thúc.', 'error');
                  setIsGenerating(false);
                  if (onEndGame) {
                    onEndGame({
                      correct: st.correctCount || 0,
                      time: st.time || 0,
                      wrong: st.wrongCount || 0
                    });
                  }
                }
              }
            });
        } else {
          isInitializingRef.current = false;
        }

        if (gameTimerRef.current) clearInterval(gameTimerRef.current);
        gameTimerRef.current = setInterval(() => {
          setTime((prev) => prev + 1);
        }, 1000);
      } else {
        startNewGame();
      }
    }, 0);

    return () => {
      clearTimeout(initTimer);
      isGameActiveRef.current = false;
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (coordinatorRef.current) coordinatorRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proceedToNext = useCallback(
    (defaultDelaySec) => {
      if (isGameActiveRef.current) {
        let delaySec = defaultDelaySec;
        if (aiWaitTime > delaySec) {
          delaySec = aiWaitTime;
        }
        if (delaySec < 1) delaySec = 1;
        setResultTimer(delaySec);
      }
    },
    [aiWaitTime]
  );

  const nextRound = useCallback(() => {
    if (isGenerating) return;
    setPlayedCount((prev) => prev + 1);
    setResultTimer(0);
    setIsResultPaused(false);

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      setCurrentQuestion(nextData);
      setInputBuffer('');
      setCheckStatus('idle');
      setAttempts(0);
      setTimeLeft(isHellMode ? Math.min(15, timeLimit || 30) : timeLimit || 30);

      const currentCooldown =
        sourceMode === 'ai_pure' || effectiveAiMode
          ? getConfiguredUiCooldown(9)
          : 0;
      setAiWaitTime(currentCooldown);
    } else {
      setIsGenerating(true);
      const isOfflineFastTrack = sourceMode === 'card' && !effectiveAiMode;
      coordinatorRef.current
        .maintain(false, 22000, isOfflineFastTrack)
        .then(() => {
          if (isGameActiveRef.current) {
            let data = coordinatorRef.current.pop();
            if (!data) {
              data = getJitFallbackQuestion();
            }
            if (data) {
              setCurrentQuestion(data);
              setInputBuffer('');
              setCheckStatus('idle');
              setAttempts(0);
              setIsGenerating(false);
              setTimeLeft(
                isHellMode ? Math.min(15, timeLimit || 30) : timeLimit || 30
              );

              const currentCooldown =
                sourceMode === 'ai_pure' || effectiveAiMode
                  ? getConfiguredUiCooldown(9)
                  : 0;
              setAiWaitTime(currentCooldown);
            } else {
              safeShowToast('Lỗi tải dữ liệu vòng mới. Buộc kết thúc.', 'error');
              setIsGenerating(false);
              if (onEndGame) {
                onEndGame({
                  correct: latestStateRef.current.correctCount,
                  time: latestStateRef.current.time,
                  wrong: latestStateRef.current.wrongCount
                });
              }
            }
          }
        });
    }
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    effectiveAiMode,
    getJitFallbackQuestion,
    isGenerating,
    isHellMode,
    onEndGame,
    safeShowToast,
    sourceMode,
    timeLimit,
    triggerAutoSave
  ]);

  const checkAnswer = useCallback(() => {
    if (
      !currentQuestion ||
      (checkStatus !== 'idle' && checkStatus !== 'wrong_retry')
    ) {
      return;
    }
    if (inputBuffer.trim() === '') return;

    const normalize = (str) => {
      let s = (str || '').toLowerCase();
      if (Utils && typeof Utils.advancedNormalize === 'function') {
        s = Utils.advancedNormalize(s, lang || 'en');
      } else {
        s = s.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      }
      return s.trim();
    };

    const cleanStr = (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z]/g, '')
        .toLowerCase();

    let isCorrect = false;
    const normTarget = normalize(currentQuestion.targetWord);
    const normInput = normalize(inputBuffer);

    if (normTarget === normInput) {
      isCorrect = true;
    } else if (
      (lang === 'zh' || lang === 'vi') &&
      /^[a-zA-Z\s]+$/.test(inputBuffer)
    ) {
      const cleanInput = cleanStr(inputBuffer);
      if (cleanInput.length >= 2) {
        if (
          Utils?.comparePinyin &&
          Utils.comparePinyin(inputBuffer, currentQuestion.origin?.pronunciation)
        ) {
          isCorrect = true;
        } else if (currentQuestion.origin?.pronunciation) {
          const cleanSentencePinyin = cleanStr(
            currentQuestion.origin.pronunciation
          );
          if (cleanSentencePinyin.includes(cleanInput)) {
            isCorrect = true;
          }
        }
      }
    }

    if (isCorrect) {
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
      // [HELL MODE] x3 Điểm số
      const scoreMultiplier = isHellMode ? 3 : 1;
      setScore((prev) => prev + 15 * combo * scoreMultiplier);
      setCombo((prev) => prev + 1);
      safeShowToast(
        isHellMode ? 'Xuất sắc! (Địa ngục x3)' : 'Chính xác!',
        'success'
      );
      proceedToNext(5);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setCombo(1);
      // [HELL MODE] Phạt cực nặng (-15 thay vì -5)
      const penalty = isHellMode ? 15 : 5;
      setScore((prev) => Math.max(0, prev - penalty));

      if (newAttempts >= 3) {
        localPushToRetryBag(currentQuestion);
        setCheckStatus('wrong');
        setWrongCount((p) => p + 1);
        safeShowToast('Đã hết lượt! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(5);
      } else {
        setCheckStatus('wrong_retry');
        safeShowToast(
          isHellMode ? 'Sai rồi! Trừ 15 điểm!' : 'Chưa đúng, hãy thử lại!',
          'warning'
        );
        setTimeout(
          () => setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p)),
          1000
        );
      }
    }
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    attempts,
    checkStatus,
    combo,
    currentQuestion,
    inputBuffer,
    isHellMode,
    lang,
    localPushToRetryBag,
    localRemoveFromRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    triggerAutoSave
  ]);

  const handleSkip = useCallback(() => {
    if (checkStatus === 'idle' || checkStatus === 'wrong_retry') {
      localPushToRetryBag(currentQuestion);
      setCombo(1);
      setAttempts(3);
      setCheckStatus('wrong');
      setWrongCount((p) => p + 1);
      safeShowToast('Đã bỏ qua!', 'error');
      logMistake(currentQuestion);
      proceedToNext(5);
      setTimeout(() => triggerAutoSave(), 150);
    }
  }, [
    checkStatus,
    currentQuestion,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    triggerAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN
  useEffect(() => {
    let timerId = null;
    if (
      timerMode &&
      (checkStatus === 'idle' || checkStatus === 'wrong_retry') &&
      !isGenerating &&
      currentQuestion
    ) {
      timerId = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerId);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [timerMode, checkStatus, isGenerating, currentQuestion]);

  // CƠ CHẾ GIẬT CÒ KHI HẾT GIỜ (TIMEOUT TRIGGER - Bọc bất đồng bộ chuẩn React Hooks)
  useEffect(() => {
    let timeoutHandler = null;
    if (
      timerMode &&
      timeLeft === 0 &&
      (checkStatus === 'idle' || checkStatus === 'wrong_retry') &&
      currentQuestion
    ) {
      timeoutHandler = setTimeout(() => {
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(3);
        setCheckStatus('wrong');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(5);
        setTimeout(() => triggerAutoSave(), 150);
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
    logMistake,
    safeShowToast,
    triggerAutoSave,
    localPushToRetryBag,
    proceedToNext
  ]);

  // ĐỒNG HỒ TỰ ĐỘNG CHUYỂN CÂU KHI ĐÃ HIỆN KẾT QUẢ
  useEffect(() => {
    let id = null;
    if (
      (checkStatus === 'correct' || checkStatus === 'wrong') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      id = setTimeout(() => setResultTimer((t) => t - 1), 1000);
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

  const toggleResultPause = () => setIsResultPaused((p) => !p);

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
    handleSaveAndBack
  };
};

// ============================================================================
// 2. GAME WRAPPER (FillBlankGame)
// ============================================================================
export const FillBlankGame = ({
  cards,
  t,
  onFinish,
  onQuit,
  onEndGame: propOnEndGame,
  onBack: propOnBack,
  mainColor = 'blue',
  lang = 'en',
  isAiMode,
  apiKey,
  onBookmark,
  notebook,
  onLogWrong,
  settings,
  config,
  onUpdateCards,
  onSaveToHarvest,
  savedState,
  onAutoSave,
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag
}) => {
  const handleEndGameWrapper = useCallback(
    (stats = { correct: 0, time: 0, wrong: 0 }) => {
      if (onFinish) {
        onFinish(stats.correct, stats.time, stats.wrong);
      } else if (propOnEndGame) {
        propOnEndGame(stats);
      }
    },
    [onFinish, propOnEndGame]
  );

  const safeConfig = config || {
    level: 'level_4_discovery_basic',
    sourceMode: 'card'
  };

  const hookCallbacks = {
    onFinish,
    showToast:
      typeof window !== 'undefined' ? window.globalShowToast : undefined,
    onLogWrong,
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onBack: onQuit || propOnBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: handleEndGameWrapper
  };

  const logic = useFillBlankLogic(
    cards,
    {
      ...safeConfig,
      isAiMode,
      apiKey,
      lang,
      savedState,
      globalRetryBag
    },
    hookCallbacks
  );

  const isBookmarked = Boolean(
    logic.currentQuestion?.targetWord &&
      notebook?.some(
        (n) =>
          n.term && n.term.includes(logic.currentQuestion.targetWord)
      )
  );

  return (
    <FillBlankPlayScreen
      t={t}
      mainColor={mainColor}
      config={safeConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={handleEndGameWrapper}
      onSaveToNotebook={(payload) => {
        if (onBookmark) {
          onBookmark(payload);
        } else if (typeof window !== 'undefined' && window.globalShowToast) {
          window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
        }
      }}
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