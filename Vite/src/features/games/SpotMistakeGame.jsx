// ============================================================================
// FILE 61/85: src/features/games/SpotMistakeGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.11 - SpotMistake Logic & Wrapper V1.23)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Tìm Lỗi Sai (Spot Mistake), quản lý
//           luồng nạp đạn AI/Offline, định vị tọa độ lỗi tuyệt đối (Absolute
//           Indexing), chấm điểm thẩm thấu toàn câu và gọi AI On-Demand.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { callGeminiApi, explainSentenceGrammar } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { SpotMistakePlayScreen } from './SpotMistakeUI';
import {
  getSafeLevelString,
  getConfiguredUiCooldown,
  extractPendingCardsFromQueue
} from './common/gameHelpers';

// ============================================================================
// HELPER NỘI BỘ: PHÂN RÃ KÝ TỰ & ĐỊNH VỊ TỌA ĐỘ LỖI TUYỆT ĐỐI
// ============================================================================
const buildQuestionChunks = (data) => {
  if (!data) return [];
  const sentence = String(data.wrongSentence || '');
  const wrong = String(data.wrongWord || '');
  const originTerm = String(data.origin?.term || '');
  const isChinese = /[\u4e00-\u9fa5]/.test(sentence);

  // Tìm vị trí bắt đầu chính xác của lỗi sai bằng cách so khớp với câu gốc
  let exactStartIndex = wrong ? sentence.indexOf(wrong) : -1;
  if (originTerm && sentence && wrong) {
    let diffIdx = -1;
    const minLen = Math.min(sentence.length, originTerm.length);
    for (let i = 0; i < minLen; i++) {
      if (sentence[i] !== originTerm[i]) {
        diffIdx = i;
        break;
      }
    }
    if (diffIdx === -1 && sentence.length !== originTerm.length) {
      diffIdx = minLen;
    }
    if (diffIdx !== -1) {
      const searchAreaStart = Math.max(0, diffIdx - 3);
      const localIndex = sentence.substring(searchAreaStart).indexOf(wrong);
      if (localIndex !== -1) {
        exactStartIndex = searchAreaStart + localIndex;
      }
    }
  }

  let wordChunks = [];

  if (isChinese) {
    let currentStrIdx = 0;
    wordChunks = Array.from(sentence).map((char, idx) => {
      const isTarget =
        exactStartIndex !== -1 &&
        currentStrIdx >= exactStartIndex &&
        currentStrIdx < exactStartIndex + wrong.length;
      currentStrIdx += char.length;
      return { id: `c-${idx}-${Date.now()}`, text: char, isTarget };
    });
  } else if (wrong && sentence) {
    if (exactStartIndex !== -1) {
      const before = sentence.substring(0, exactStartIndex);
      const matchedText = sentence.substring(
        exactStartIndex,
        exactStartIndex + wrong.length
      );
      const after = sentence.substring(exactStartIndex + wrong.length);

      const beforeChunks = before
        .split(' ')
        .filter((w) => w.trim().length > 0)
        .map((text, idx) => ({
          id: `cb-${idx}-${Date.now()}`,
          text,
          isTarget: false
        }));
      const matchChunk = {
        id: `cm-${Date.now()}`,
        text: matchedText,
        isTarget: true
      };
      const afterChunks = after
        .split(' ')
        .filter((w) => w.trim().length > 0)
        .map((text, idx) => ({
          id: `ca-${idx}-${Date.now()}`,
          text,
          isTarget: false
        }));

      wordChunks = [...beforeChunks, matchChunk, ...afterChunks];
    } else {
      const cleanWrong = wrong.replace(/[.,?!;:'"]/g, '').toLowerCase();
      wordChunks = sentence
        .split(' ')
        .filter((w) => w.trim().length > 0)
        .map((text, idx) => {
          const cleanText = text.replace(/[.,?!;:'"]/g, '').toLowerCase();
          return {
            id: `c-${idx}-${Date.now()}`,
            text,
            isTarget: Boolean(cleanWrong && cleanText === cleanWrong)
          };
        });
    }
  } else {
    wordChunks = sentence
      .split(' ')
      .filter((w) => w.trim().length > 0)
      .map((text, idx) => ({
        id: `c-${idx}-${Date.now()}`,
        text,
        isTarget: false
      }));
  }

  // Chốt chặn an toàn: Đảm bảo luôn có ít nhất 1 chunk là mục tiêu để người chơi không bị kẹt
  if (wordChunks.length > 0 && !wordChunks.some((c) => c.isTarget)) {
    const fallbackIdx = wordChunks.findIndex((c) =>
      c.text.toLowerCase().includes(wrong.toLowerCase())
    );
    if (fallbackIdx !== -1) {
      wordChunks[fallbackIdx].isTarget = true;
    } else {
      wordChunks[wordChunks.length - 1].isTarget = true;
    }
  }

  return wordChunks;
};

// ============================================================================
// 1. ĐỘNG CƠ LOGIC TRÒ CHƠI TÌM LỖI SAI (USE SPOT MISTAKE LOGIC HOOK)
// ============================================================================
export const useSpotMistakeLogic = (cards, config, callbacks) => {
  const {
    isAiMode,
    apiKey,
    lang,
    timeLimit,
    level,
    sourceMode,
    savedState,
    timerMode,
    globalRetryBag,
    difficulty
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

  // [VẮC-XIN PHÒNG THỦ ĐA NHIỆM] Đảm bảo luôn trích xuất 1 Chuỗi duy nhất từ Level
  const safeLevelString = getSafeLevelString(
    config?.level || level,
    lang === 'zh' ? 'zh_level_4' : 'en_level_4'
  );

  // [CỜ BẢO VỆ TÍN HIỆU AI] Chế độ Khó -> Dùng AI bóp méo. Chế độ Dễ -> Dùng Offline
  const isHardMode = difficulty === 'hard';
  const effectiveAiMode =
    sourceMode === 'ai_pure' ||
    (sourceMode === 'card' && isHardMode) ||
    Boolean(isAiMode);

  const savedSM = savedState?.spotMistakeState || null;
  const hasRestoredQuestion = Boolean(
    savedSM && !savedSM._needsNextOnResume && savedSM.currentQuestion
  );

  const [currentQuestion, setCurrentQuestion] = useState(() =>
    hasRestoredQuestion ? savedSM.currentQuestion : null
  );
  const [chunks, setChunks] = useState(() =>
    hasRestoredQuestion
      ? savedSM.chunks?.length > 0
        ? savedSM.chunks
        : buildQuestionChunks(savedSM.currentQuestion)
      : []
  );
  const [stage, setStage] = useState(() =>
    hasRestoredQuestion ? savedSM.stage || 'spot' : 'spot'
  );
  const [selectedIndices, setSelectedIndices] = useState(() =>
    hasRestoredQuestion ? savedSM.selectedIndices || [] : []
  );
  const [inputBuffer, setInputBuffer] = useState(() =>
    hasRestoredQuestion ? savedSM.inputBuffer || '' : ''
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    hasRestoredQuestion ? savedSM.checkStatus || 'idle' : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    hasRestoredQuestion ? savedSM.attempts || 0 : 0
  );
  const [score, setScore] = useState(() => savedSM?.score || 0);
  const [combo, setCombo] = useState(() => savedSM?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => savedSM?.playedCount || 0
  );
  const [time, setTime] = useState(() => savedSM?.time || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => savedSM?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(() => savedSM?.wrongCount || 0);
  const [isGenerating, setIsGenerating] = useState(() => !hasRestoredQuestion);

  // State cho Lazy Loading Hint (Dịch thuật On-Demand) & Giải thích Ngữ pháp AI
  const [isTranslating, setIsTranslating] = useState(false);
  const [isAiExplaining, setIsAiExplaining] = useState(false);

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);

  // State cho Đồng hồ đếm ngược từng câu
  const [timeLeft, setTimeLeft] = useState(() =>
    savedSM?.timeLeft !== undefined ? savedSM.timeLeft : timeLimit || 30
  );

  // Biến đếm đạn & Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedSM?.aiWaitTime !== undefined ? savedSM.aiWaitTime : 0
  );

  // Refs quản lý bất đồng bộ
  const enrichedCardsRef = useRef(cards);
  const deckRef = useRef([]);
  const historyQueueRef = useRef(Utils.safeJsonParse('fc_ai_memory', []));
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
      if (showToast) {
        showToast({
          text: typeof msg === 'string' ? msg : msg.text,
          type,
          id: Date.now()
        });
      }
    },
    [showToast]
  );

  // BỘ NÃO LƯU TRỮ VÀ AUTO-SAVE
  const latestStateRef = useRef({});
  useEffect(() => {
    latestStateRef.current = {
      currentQuestion,
      chunks,
      stage,
      selectedIndices,
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
    chunks,
    stage,
    selectedIndices,
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
        spotMistakeState: {
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
      if (addToRetryBag) addToRetryBag('spotmistake', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag) removeFromRetryBag('spotmistake', termToCheck);
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const baseData = question.origin || {};
      const underlinedCorrection = String(question.correction || '')
        .split('')
        .map((char) => char + '\u0332')
        .join('');
      const sentenceWithUnderline = String(
        question.wrongSentence || ''
      ).replace(question.wrongWord || '', underlinedCorrection);

      const mistakeCard = {
        ...baseData,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        type: 'mistake',
        term: sentenceWithUnderline,
        definition:
          baseData.definition || question.hint || 'Thử thách Spot Mistake',
        analysis: question.explanation,
        example: `Lỗi: ${question.wrongWord} -> Sửa: ${question.correction}`,
        tags: ['spotmistake', safeLevelString, sourceMode],
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
      currentData.checkStatus !== 'success' &&
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

    if (onBack) {
      onBack({
        spotMistakeState: {
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
  const fetchTask = useCallback(async () => {
    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp
    const pulledCard = pullRetryCardWithLock(
      'spotmistake',
      globalRetryBagRef.current,
      lang
    );
    if (pulledCard) return pulledCard;

    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY);

    // 2. AI PURE MODE
    if (isPureMode && effectiveAiMode && currentApiKey) {
      try {
        const meta = {
          id: `spotmistake_${Date.now()}`,
          type: 'ioe_spot_mistake',
          level: safeLevelString,
          topic: config?.topic || '',
          dataMode: config?.dataMode || 'sentence',
          lang: lang,
          mode: 'minigame'
        };
        const freshHistory = Utils.safeJsonParse('fc_ai_memory', []);
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
                wrongSentence: qData.content.wrongSentence,
                wrongWord: qData.content.wrongWord,
                correction: qData.content.correction,
                explanation: qData.content.explanation
              },
              'ioe_spot_mistake'
            );
          }
          if (isInitializingRef.current) {
            safeShowToast('Đang nạp đạn AI...', 'info');
          }
          return qData.content;
        }
      } catch (e) {
        console.warn('AI SpotMistake Fallback:', e.message);
        if (window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Lò đúc SpotMistake AI', e);
        }
      }
    }

    // 3. THẺ GỐC HOẶC KHO CỨU HỘ
    let baseCard = null;
    if (!isPureMode || deckRef.current.length > 0) {
      if (deckRef.current.length === 0 && sourceMode !== 'ai_pure') {
        let validCards = (enrichedCardsRef.current || []).filter(
          (c) => c.term && c.term.trim() !== '' && c.term.length > 2
        );
        if (validCards.length < 2 && FallbackDataEngine) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = config?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const safeLevel =
            safeLevelString || (safeLang === 'zh' ? 'zh_level_1' : 'en_level_1');
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            mode,
            safeLevel,
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
              term: 'The childrens are playing in the park.',
              definition: 'Bọn trẻ đang chơi trong công viên. (Dự phòng)'
            }
          ];
        }
        deckRef.current = Utils.shuffleArray(validCards);
      }
      baseCard = deckRef.current.shift();
    }

    // 4. CỨU HỘ KHẨN CẤP
    if (!baseCard) {
      const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
      const fbResult = FallbackDataEngine.getGameReadyFallback(
        'spotmistake',
        safeLang,
        safeLevelString,
        config
      );
      if (fbResult) return fbResult;
      baseCard = {
        term: 'The childrens are playing in the park.',
        definition: 'Bọn trẻ đang chơi trong công viên. (Dự phòng)'
      };
    }

    // Sliding Window 400
    if (historyQueueRef.current && baseCard) {
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
          // Ignore storage error
        }
      }
    }

    const type = config?.dataMode === 'sentence' ? 'sentence' : 'word';
    const isSentence = type === 'sentence';

    // 5. CHẾ BIẾN LỖI SAI BẰNG AI (HYBRID MODE - CHỈ KÍCH HOẠT NẾU LÀ CHẾ ĐỘ KHÓ)
    if (
      effectiveAiMode &&
      currentApiKey &&
      isSentence &&
      GameAlgoEngine?.DistortionEngine?.ai_distort
    ) {
      try {
        const aiDistortPromise = GameAlgoEngine.DistortionEngine.ai_distort(
          baseCard.term,
          lang,
          type,
          currentApiKey,
          safeLevelString,
          config?.topic,
          baseCard
        );

        let dynamicTimeout = 27000;
        try {
          const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config'));
          if (aiCfg && aiCfg.loadingTime) {
            dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
          }
        } catch {
          // Ignore config parse error
        }

        const timeoutPromise = new Promise((_, r) =>
          setTimeout(() => r(new Error('AI Distort Timeout')), dynamicTimeout)
        );
        const parsedResult = await Promise.race([
          aiDistortPromise,
          timeoutPromise
        ]);

        if (
          parsedResult &&
          parsedResult.wrongSentence &&
          parsedResult.wrongWord
        ) {
          return { ...parsedResult, origin: baseCard, isAiGenerated: true };
        }
      } catch (e) {
        console.warn(
          'AI Distortion failed, returning null to trigger JIT Fallback:',
          e.message
        );
        if (window.logSystemEvent) {
          window.logSystemEvent('Lỗi AI DistortionEngine (Bóp méo)', e);
        }
        if (deckRef.current) deckRef.current.unshift(baseCard);
        return null;
      }
    }

    // 6. CHẾ ĐỘ OFFLINE THUẦN TÚY (CHẾ ĐỘ DỄ)
    let offlineResult = {
      wrongSentence: baseCard.term + 'x',
      wrongWord: baseCard.term + 'x',
      correction: baseCard.term,
      explanation: 'Lỗi hình thái (Dự phòng)'
    };
    if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
      offlineResult = GameAlgoEngine.DistortionEngine.offline_distort(
        baseCard.term,
        lang,
        type
      );
    }
    return { ...offlineResult, origin: baseCard, isAiGenerated: false };
  }, [
    apiKey,
    config,
    effectiveAiMode,
    lang,
    onSaveToHarvest,
    safeLevelString,
    safeShowToast,
    sourceMode
  ]);

  const setupQuestion = useCallback(
    (data) => {
      setCurrentQuestion(data);
      setChunks(buildQuestionChunks(data));
      setStage('spot');
      setSelectedIndices([]);
      setInputBuffer('');
      setCheckStatus('idle');
      setAttempts(0);
      setTimeLeft(timeLimit || 30);
    },
    [timeLimit]
  );

  const buildFallbackSpotData = useCallback(() => {
    if (effectiveAiMode && deckRef.current && deckRef.current.length > 0) {
      const fallbackCard = deckRef.current.shift();
      if (fallbackCard) {
        const type = config?.dataMode === 'sentence' ? 'sentence' : 'word';
        let offlineResult = {
          wrongSentence: fallbackCard.term + 'x',
          wrongWord: fallbackCard.term + 'x',
          correction: fallbackCard.term,
          explanation: 'Lỗi hình thái (Dự phòng)'
        };
        if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
          offlineResult = GameAlgoEngine.DistortionEngine.offline_distort(
            fallbackCard.term,
            lang,
            type
          );
        }
        safeShowToast(
          'AI quá tải, đã kích hoạt thuật toán bóp méo nội bộ!',
          'warning'
        );
        return {
          ...offlineResult,
          origin: fallbackCard,
          isAiGenerated: false,
          _isRescued: true
        };
      }
    }

    if (window.logSystemEvent) {
      window.logSystemEvent(
        'Queue cạn đạn Game Tìm Lỗi Sai',
        'Kích hoạt Hard Fallback'
      );
    }
    safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
    const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
    return FallbackDataEngine.getGameReadyFallback(
      'spotmistake',
      safeLang,
      safeLevelString,
      config
    );
  }, [config, effectiveAiMode, lang, safeLevelString, safeShowToast]);

  // ============================================================================
  // KHỞI TẠO VÒNG ĐỜI GAME & PHỤC HỒI SESSION
  // ============================================================================
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const initGame = async () => {
      if (savedSM) {
        if (savedSM.deck) {
          if (savedSM.deck.length > 0 && typeof savedSM.deck[0] === 'number') {
            deckRef.current = savedSM.deck
              .map((idx) => (enrichedCardsRef.current || [])[idx])
              .filter(Boolean);
          } else {
            deckRef.current = [...savedSM.deck];
          }
        }

        if (coordinatorRef.current) coordinatorRef.current.destroy();
        coordinatorRef.current = QueueEngine.createQueueCoordinator(
          fetchTask,
          4
        );
        const isOfflineFastTrack = sourceMode === 'card' && !effectiveAiMode;
        coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);

        if (savedSM._needsNextOnResume) {
          await coordinatorRef.current.maintain(
            false,
            22000,
            isOfflineFastTrack
          );
          if (isGameActiveRef.current) {
            let data = coordinatorRef.current.pop();
            if (!data) data = buildFallbackSpotData();
            if (data) {
              setupQuestion(data);
              setIsGenerating(false);
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
                  correct: savedSM.correctCount || 0,
                  time: savedSM.time || 0,
                  wrong: savedSM.wrongCount || 0
                });
              }
            }
          }
        }
      } else {
        isInitializingRef.current = true;
        if (sourceMode === 'card') {
          let validCards = (enrichedCardsRef.current || []).filter(
            (c) =>
              c.term &&
              c.term.trim() !== '' &&
              c.definition &&
              c.definition.trim() !== ''
          );
          if (validCards.length < 2) {
            safeShowToast(
              'Bộ thẻ không đủ 2 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
              'warning'
            );
            const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
            const mode =
              config?.dataMode === 'sentence' ? 'sentence' : 'vocab';
            const safeLevel =
              safeLevelString ||
              (safeLang === 'zh' ? 'zh_level_1' : 'en_level_1');
            const fbItems = FallbackDataEngine.getFallbackData(
              safeLang,
              mode,
              safeLevel,
              20
            );
            if (fbItems && fbItems.length > 0) {
              const existingTerms = new Set(validCards.map((c) => c.term));
              const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
              validCards = [...validCards, ...newFbs];
            }
            if (validCards.length < 2) {
              const defaults = [
                {
                  term: 'The childrens are playing in the park.',
                  definition:
                    'Bọn trẻ đang chơi trong công viên. (Dự phòng)'
                },
                {
                  term: 'She go to school everyday.',
                  definition: 'Cô ấy đi học mỗi ngày. (Dự phòng)'
                }
              ];
              const existingTerms = new Set(validCards.map((c) => c.term));
              const neededDefaults = defaults.filter(
                (f) => !existingTerms.has(f.term)
              );
              validCards = [...validCards, ...neededDefaults];
            }
          }
          deckRef.current = Utils.shuffleArray(validCards);
        } else {
          deckRef.current = [];
        }

        if (coordinatorRef.current) coordinatorRef.current.destroy();
        coordinatorRef.current = QueueEngine.createQueueCoordinator(
          fetchTask,
          4
        );

        const isOfflineFastTrack = sourceMode === 'card' && !effectiveAiMode;
        await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);

        let firstData = coordinatorRef.current.pop();
        if (!firstData) firstData = buildFallbackSpotData();

        if (isGameActiveRef.current && firstData) {
          setupQuestion(firstData);
          setIsGenerating(false);
          isInitializingRef.current = false;
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
          if (onEndGame) {
            onEndGame({ correct: 0, time: 0, wrong: 0 });
          }
        }
      }

      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      gameTimerRef.current = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    };

    initGame();

    return () => {
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
    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      setupQuestion(nextData);
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
            if (!data) data = buildFallbackSpotData();
            if (data) {
              setupQuestion(data);
              setIsGenerating(false);
              const currentCooldown =
                sourceMode === 'ai_pure' || effectiveAiMode
                  ? getConfiguredUiCooldown(9)
                  : 0;
              setAiWaitTime(currentCooldown);
            } else {
              safeShowToast(
                'Lỗi tải dữ liệu vòng mới. Buộc kết thúc.',
                'error'
              );
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
    buildFallbackSpotData,
    effectiveAiMode,
    isGenerating,
    onEndGame,
    safeShowToast,
    setupQuestion,
    sourceMode,
    triggerAutoSave
  ]);

  // ============================================================================
  // TƯƠNG TÁC NGƯỜI DÙNG (GIAI ĐOẠN 1: CHỌN LỖI & GIAI ĐOẠN 2: SỬA LỖI)
  // ============================================================================
  const handleSpotClick = useCallback(
    (idx) => {
      if (
        stage !== 'spot' ||
        checkStatus === 'failed' ||
        checkStatus === 'success'
      ) {
        return;
      }
      setSelectedIndices((prev) => {
        if (prev.includes(idx)) return prev.filter((i) => i !== idx);
        return [...prev, idx];
      });
    },
    [checkStatus, stage]
  );

  const handleCheckSpot = useCallback(() => {
    if (
      stage !== 'spot' ||
      checkStatus === 'failed' ||
      checkStatus === 'success' ||
      selectedIndices.length === 0
    ) {
      return;
    }

    const targetIndices = chunks
      .map((c, i) => (c.isTarget ? i : -1))
      .filter((i) => i !== -1);

    // [SMART OVERLAP ALGORITHM]
    const hasOverlap = selectedIndices.some((i) => targetIndices.includes(i));
    const maxTolerance = targetIndices.length + 3;
    const isWithinTolerance = selectedIndices.length <= maxTolerance;
    const isCorrect = hasOverlap && isWithinTolerance;

    if (isCorrect) {
      setStage('correct');
      setCheckStatus('correct_spot');
      setScore((p) => p + 10 * combo);
      setAttempts(0);
      safeShowToast('Phát hiện chuẩn xác! Hãy sửa lại cho đúng.', 'success');
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setCombo(1);
      setScore((p) => Math.max(0, p - 5));
      if (newAttempts >= 3) {
        localPushToRetryBag(currentQuestion);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Đã hết lượt tìm lỗi!', 'error');
        logMistake(currentQuestion);
        proceedToNext(10);
      } else {
        setCheckStatus('wrong_spot');
        safeShowToast(`Chưa đúng! Còn ${3 - newAttempts} lượt.`, 'warning');
        setTimeout(
          () => setCheckStatus((p) => (p === 'wrong_spot' ? 'idle' : p)),
          1000
        );
      }
    }
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    attempts,
    checkStatus,
    chunks,
    combo,
    currentQuestion,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    selectedIndices,
    stage,
    triggerAutoSave
  ]);

  // LUỒNG LAZY LOADING: GỌI AI DỊCH NGHĨA CÂU VĂN ON-DEMAND
  const handleRequestHint = useCallback(async () => {
    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (
      isTranslating ||
      isAiExplaining ||
      isGenerating ||
      !currentQuestion ||
      !currentApiKey
    ) {
      if (!currentApiKey) {
        safeShowToast('Cần cấu hình API Key để gọi AI!', 'warning');
      }
      return;
    }

    const textToTranslate =
      currentQuestion.origin?.term || currentQuestion.wrongSentence;
    if (!textToTranslate) return;

    setIsTranslating(true);
    setIsAiExplaining(true);
    try {
      const prompt = `Dịch câu văn sau sang tiếng Việt một cách ngắn gọn, tự nhiên. CHỈ TRẢ VỀ CÂU DỊCH, KHÔNG GIẢI THÍCH THÊM: "${textToTranslate}"`;
      const res = await callGeminiApi(prompt, null, currentApiKey);
      if (res && res.text) {
        const translatedText = res.text.replace(/["']/g, '').trim();
        setCurrentQuestion((prev) => ({
          ...prev,
          hint: translatedText,
          origin: { ...(prev.origin || {}), definition: translatedText }
        }));
      }
    } catch (error) {
      console.warn('Lỗi dịch tự động:', error);
      safeShowToast(
        'Mạng yếu hoặc lỗi AI. Không thể tải gợi ý lúc này.',
        'error'
      );
    } finally {
      setIsTranslating(false);
      setIsAiExplaining(false);
    }
  }, [
    apiKey,
    currentQuestion,
    isAiExplaining,
    isGenerating,
    isTranslating,
    safeShowToast
  ]);

  // LUỒNG LAZY LOADING: GỌI AI GIẢI THÍCH NGỮ PHÁP ON-DEMAND
  const handleExplain = useCallback(async () => {
    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (isGenerating || isAiExplaining || !currentQuestion) return;
    if (!currentApiKey) {
      safeShowToast('Cần cấu hình API Key để gọi AI!', 'warning');
      return;
    }

    setIsAiExplaining(true);
    try {
      const contextToExplain = `Hãy giải thích ngữ pháp: Câu bị sai là "${currentQuestion.wrongSentence}". Lỗi sai ở chữ "${currentQuestion.wrongWord}" và phải sửa thành "${currentQuestion.correction}". Tại sao lại sửa như vậy?`;
      const result = await explainSentenceGrammar(
        contextToExplain,
        lang,
        currentApiKey
      );
      setCurrentQuestion((prev) => ({ ...prev, explanation: result.text }));
      if (result._tokenUsage) {
        const used = result._tokenUsage.totalTokenCount || 0;
        const currentTotal = parseInt(
          localStorage.getItem('fc_total_tokens') || '0',
          10
        );
        localStorage.setItem('fc_total_tokens', String(currentTotal + used));
      }
    } catch (e) {
      safeShowToast('Lỗi kết nối AI: ' + e.message, 'error');
    } finally {
      setIsAiExplaining(false);
    }
  }, [apiKey, currentQuestion, isAiExplaining, isGenerating, lang, safeShowToast]);

  // CHẤM ĐIỂM THẨM THẤU TOÀN CÂU (HOLISTIC CONTEXT VALIDATION)
  const handleCorrectionSubmit = useCallback(() => {
    if (stage !== 'correct' || !inputBuffer.trim() || !currentQuestion) return;

    const normalize = (str) =>
      str
        ? String(str)
            .toLowerCase()
            .replace(/[.,?!;:"'()[\]{}。，？！；：“”‘’（）【】\u0332]/g, '')
            .replace(/\s+/g, '')
            .trim()
        : '';

    const normalizedInput = normalize(inputBuffer);
    const normalizedCorrection = normalize(currentQuestion.correction);

    const isChinese = /[\u4e00-\u9fa5]/.test(
      currentQuestion.wrongSentence || ''
    );
    const separator = isChinese ? '' : ' ';
    const userSentenceArray = [];
    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
    const minIdx = sortedIndices[0];
    const maxIdx = sortedIndices[sortedIndices.length - 1];

    for (let i = 0; i < chunks.length; i++) {
      if (i < minIdx || i > maxIdx) {
        userSentenceArray.push(chunks[i].text);
      } else if (i === minIdx) {
        userSentenceArray.push(inputBuffer);
      }
    }

    const userFullSentence = userSentenceArray.join(separator);
    const aiCorrectSentence =
      currentQuestion.origin?.term ||
      String(currentQuestion.wrongSentence || '').replace(
        currentQuestion.wrongWord || '',
        currentQuestion.correction || ''
      );

    const normalizedUserFull = normalize(userFullSentence);
    const normalizedAiFull = normalize(aiCorrectSentence);

    const isCorrect =
      normalizedInput === normalizedCorrection ||
      normalizedUserFull === normalizedAiFull;

    if (isCorrect) {
      if (attempts === 0) {
        localRemoveFromRetryBag(
          currentQuestion.origin?.term || currentQuestion.wrongSentence
        );
      }
      setCheckStatus('success');
      setCorrectCount((p) => p + 1);
      setScore((p) => p + 20 * combo);
      setCombo((p) => p + 1);
      safeShowToast('Tuyệt vời! Bạn đã sửa đúng.', 'success');
      proceedToNext(6);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setCombo(1);
      setScore((p) => Math.max(0, p - 5));
      if (newAttempts >= 3) {
        localPushToRetryBag(currentQuestion);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Sai quá 3 lần. Xem đáp án nhé!', 'error');
        logMistake(currentQuestion);
        proceedToNext(10);
      } else {
        setCheckStatus('wrong_correct');
        safeShowToast(`Sai rồi! Còn ${3 - newAttempts} lượt.`, 'warning');
        setTimeout(
          () =>
            setCheckStatus((p) =>
              p === 'wrong_correct' ? 'correct_spot' : p
            ),
          1000
        );
      }
    }
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    attempts,
    chunks,
    combo,
    currentQuestion,
    inputBuffer,
    localPushToRetryBag,
    localRemoveFromRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    selectedIndices,
    stage,
    triggerAutoSave
  ]);

  const handleSkip = useCallback(() => {
    if (checkStatus === 'success' || checkStatus === 'failed') return;
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(10);
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    checkStatus,
    currentQuestion,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    triggerAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN TỪNG CÂU & TRIGGER HẾT GIỜ
  useEffect(() => {
    let timerId = null;
    if (
      timerMode &&
      checkStatus !== 'success' &&
      checkStatus !== 'failed' &&
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

  useEffect(() => {
    if (
      timerMode &&
      timeLeft === 0 &&
      checkStatus !== 'success' &&
      checkStatus !== 'failed' &&
      currentQuestion
    ) {
      const timeoutId = setTimeout(() => {
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(3);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(10);
        setTimeout(() => triggerAutoSave(), 150);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
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
    if (
      (checkStatus === 'success' || checkStatus === 'failed') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => setResultTimer((t) => t - 1), 1000);
      return () => clearTimeout(id);
    } else if (
      (checkStatus === 'success' || checkStatus === 'failed') &&
      resultTimer === 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const nextId = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(nextId);
    }
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(
    () => setIsResultPaused((p) => !p),
    []
  );

  return {
    currentQuestion,
    chunks,
    stage,
    selectedIndices,
    inputBuffer,
    setInputBuffer,
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
    aiWaitTime,
    handleSpotClick,
    handleCheckSpot,
    handleCorrectionSubmit,
    handleSkip,
    nextRound,
    handleSaveAndBack,
    onRequestExplanation: handleExplain,
    handleRequestHint,
    isExplaining: isAiExplaining,
    isTranslating,
    isHardMode
  };
};

// ============================================================================
// 2. COMPONENT BỌC NGOÀI (SPOT MISTAKE GAME WRAPPER)
// ============================================================================
export const SpotMistakeGame = ({
  cards,
  t,
  onFinish,
  onEndGame,
  onQuit,
  onBack,
  mainColor = 'red',
  lang,
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
  const handleEndGameCallback = useCallback(
    (stats) => {
      if (onFinish) {
        onFinish(stats.correct, stats.time, stats.wrong);
      } else if (onEndGame) {
        onEndGame({
          correct: stats.correct,
          time: stats.time,
          wrong: stats.wrong
        });
      }
    },
    [onFinish, onEndGame]
  );

  const safeConfig = config || {
    level: 'level_4_discovery_basic',
    sourceMode: 'card',
    difficulty: 'easy'
  };
  const effectiveAiMode =
    safeConfig.sourceMode === 'ai_pure' ||
    (safeConfig.sourceMode === 'card' && safeConfig.difficulty === 'hard') ||
    Boolean(isAiMode);

  // Bơm ngược cờ aiMode vào cấu hình truyền xuống UI để hiển thị đúng ô đếm đạn
  const finalConfig = { ...safeConfig, aiMode: effectiveAiMode };

  const hookCallbacks = {
    onFinish,
    showToast: window.globalShowToast,
    onLogWrong,
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onBack: onBack || onQuit,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: handleEndGameCallback
  };

  const logic = useSpotMistakeLogic(
    cards,
    {
      ...finalConfig,
      isAiMode: effectiveAiMode,
      apiKey,
      lang,
      timeLimit: safeConfig.timeLimit || 30,
      savedState,
      globalRetryBag
    },
    hookCallbacks
  );

  const handleSaveToNotebook = useCallback(
    (payload) => {
      if (onBookmark) {
        onBookmark(payload);
      } else if (window.handleSaveToNotebook) {
        window.handleSaveToNotebook(payload);
      } else if (window.globalShowToast) {
        window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    },
    [onBookmark]
  );

  const isBookmarked = Boolean(
    logic.currentQuestion?.correction &&
      notebook?.some((n) => n.term?.includes(logic.currentQuestion.correction))
  );

  return (
    <SpotMistakePlayScreen
      t={t}
      mainColor={mainColor}
      config={finalConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={handleEndGameCallback}
      onSaveToNotebook={handleSaveToNotebook}
      isBookmarked={isBookmarked}
      settings={settings}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_11_useSpotMistakeLogic = useSpotMistakeLogic;
  window.useSpotMistakeLogic = useSpotMistakeLogic;
  window.Block5_11_SpotMistakeGame = SpotMistakeGame;
  window.SpotMistakeGame = SpotMistakeGame;
}

export default SpotMistakeGame;