// ============================================================================
// FILE 65/85: src/features/games/ImageQuizGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.18 - Image Quiz Logic & Wrapper V1.14)
// NHIỆM VỤ: Động cơ điều khiển Logic (useImageQuizLogic) và Component bọc
//           (ImageQuizGame) cho trò chơi Đoán Hình Ảnh (Image Quiz).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { ImageQuizPlayScreen } from './ImageQuizUI';
import {
  getSafeLevelString,
  applyAntiStreakShuffle,
  getConfiguredUiCooldown,
  extractPendingCardsFromQueue
} from './common/gameHelpers';

const POS_BLACKLIST_REGEX =
  /(giới từ|liên từ|phó từ|trợ từ|đại từ|lượng từ|preposition|conjunction|adverb|particle|pronoun|measure word|介词|连词|副词|助词|代词|量词)/i;

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (HOOK useImageQuizLogic)
// ============================================================================
export const useImageQuizLogic = (cards, config, callbacks) => {
  const {
    isAiMode,
    apiKey,
    lang,
    timeLimit,
    level,
    sourceMode,
    savedState,
    timerMode,
    globalRetryBag
  } = config;

  const {
    showToast,
    onLogWrong,
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame
  } = callbacks;

  const safeLevelString = getSafeLevelString(level, 'level_4_discovery_basic');

  // Khởi tạo State thông minh từ savedState (nếu có)
  const savedImgState = savedState?.imageQuizState || null;
  const isResumingWithQuestion = Boolean(
    savedImgState &&
      !savedImgState._needsNextOnResume &&
      savedImgState.currentQuestion
  );

  const [currentQuestion, setCurrentQuestion] = useState(() =>
    isResumingWithQuestion ? savedImgState.currentQuestion : null
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
    isResumingWithQuestion ? savedImgState.attempts || 0 : 0
  );
  const [score, setScore] = useState(() => savedImgState?.score || 0);
  const [combo, setCombo] = useState(() => savedImgState?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => savedImgState?.playedCount || 0
  );
  const [time, setTime] = useState(() => savedImgState?.time || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => savedImgState?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => savedImgState?.wrongCount || 0
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
      ? savedImgState.timeLeft
      : timeLimit || 15
  );

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedImgState?.aiWaitTime !== undefined ? savedImgState.aiWaitTime : 0
  );

  // Refs quản lý luồng dữ liệu
  const enrichedCardsRef = useRef(cards);
  const deckRef = useRef([]);
  const historyQueueRef = useRef(
    Utils?.safeJsonParse ? Utils.safeJsonParse('fc_ai_memory', []) : []
  );
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const gameTimerRef = useRef(null);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  const streakTrackerRef = useRef([]);

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
          text: typeof msg === 'string' ? msg : msg?.text || String(msg),
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
        imageQuizState: {
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

  // Chống lặp vị trí đáp án đúng quá 2 lần liên tiếp
  const applyAntiStreak = useCallback((data) => {
    if (data && Array.isArray(data.options)) {
      return {
        ...data,
        options: applyAntiStreakShuffle(data.options, streakTrackerRef)
      };
    }
    return data;
  }, []);

  // TÚI NHÁP TOÀN CỤC & GHI LOG LỖI SAI
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag) addToRetryBag('image_quiz', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag) removeFromRetryBag('image_quiz', termToCheck);
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const baseData = question.origin || {};
      const mistakeCard = {
        ...baseData,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'mistake',
        term: question.term,
        definition: question.definition || 'Nhận diện hình ảnh',
        example: 'Bạn đã chọn sai hình ảnh cho từ này.',
        tags: ['image_quiz', safeLevelString, sourceMode],
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
      currentData.checkStatus !== 'correct' &&
      currentData.checkStatus !== 'wrong' &&
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
        imageQuizState: {
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
    let card = null;

    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp bằng Khóa Nguyên Tử
    const pullFn = pullRetryCardWithLock || Utils?.pullRetryCardWithLock;
    if (pullFn) {
      card = pullFn('image_quiz', globalRetryBagRef.current, lang);
    }

    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey =
      apiKey ||
      localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key');

    // LUỒNG 1: AI PURE MODE (Exam Engine)
    if (isPureMode && isAiMode && currentApiKey && !card) {
      try {
        const meta = {
          id: `imagequiz_${Date.now()}`,
          type: 'ioe_image_quiz',
          level: safeLevelString,
          topic: config?.topic || '',
          dataMode: 'vocab',
          mode: 'minigame',
          askMode: config?.askMode || 'term',
          lang
        };
        const freshHistory = Utils?.safeJsonParse
          ? Utils.safeJsonParse('fc_ai_memory', [])
          : [];
        const qData = await ExamEngine.hydrateQuestion(
          meta,
          currentApiKey,
          freshHistory
        );

        if (qData && qData.content) {
          const normalizedContent = {
            ...qData.content.question,
            ...qData.content,
            term: qData.content.term || qData.content.question?.term,
            definition:
              qData.content.definition ||
              qData.content.question?.definition ||
              ''
          };
          if (onSaveToHarvest) {
            onSaveToHarvest(
              safeLevelString,
              normalizedContent,
              'ioe_image_quiz'
            );
          }
          if (isInitializingRef.current) {
            aiGeneratedCountRef.current += 1;
            safeShowToast(
              `Đã nạp xong câu ${aiGeneratedCountRef.current} bằng AI...`,
              'success'
            );
          }
          return normalizedContent;
        }
      } catch (e) {
        console.warn('AI ImageQuiz Pure Fallback:', e.message);
        if (window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Lò đúc ImageQuiz AI', e);
        }
      }
    }

    // LUỒNG 2: THẺ CỦA TÔI HOẶC CỨU HỘ KHẨN CẤP
    if (!card) {
      if (deckRef.current.length === 0 && !isPureMode) {
        let validCards = (enrichedCardsRef.current || []).filter((c) => {
          if (!c.term || c.term.trim() === '') return false;
          if (
            c.image?.startsWith('http') ||
            (c.image_keyword && c.image_keyword.trim() !== '')
          ) {
            return true;
          }
          if (c.partOfSpeech && POS_BLACKLIST_REGEX.test(c.partOfSpeech)) {
            return false;
          }
          return true;
        });

        if (validCards.length < 4 && FallbackDataEngine) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            'vocab',
            safeLevelString,
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
            { term: 'Apple', definition: 'Quả táo' },
            { term: 'Cat', definition: 'Con mèo' }
          ];
        }
        deckRef.current = Utils.shuffleArray(validCards);
      }

      card = deckRef.current.shift();

      // JIT Enrichment: Nạp ngầm hình ảnh và ý nghĩa nếu thẻ khuyết
      if (
        card &&
        sourceMode === 'card' &&
        isAiMode &&
        currentApiKey &&
        Utils?.fillCardWithAi
      ) {
        const missingFields = [];
        if (!card.definition || card.definition.trim() === '') {
          missingFields.push('definition');
        }
        if (!card.image_keyword || card.image_keyword.trim() === '') {
          missingFields.push('image_keyword');
        }
        if (missingFields.length > 0) {
          try {
            const enriched = await Utils.fillCardWithAi(
              card.term,
              lang,
              currentApiKey,
              missingFields
            );
            card = { ...card, ...enriched, is_enriched: true };
            if (onUpdateCards) onUpdateCards([card]);
            if (enriched._tokenUsage) {
              const currentTotal = parseInt(
                localStorage.getItem('fc_total_tokens') || '0',
                10
              );
              localStorage.setItem(
                'fc_total_tokens',
                currentTotal + (enriched._tokenUsage.totalTokenCount || 0)
              );
            }
          } catch (e) {
            console.warn('JIT Enrich failed for Image Quiz:', e);
          }
        }
      }

      if (card && historyQueueRef.current) {
        if (!historyQueueRef.current.includes(card.term)) {
          historyQueueRef.current.push(card.term);
          while (historyQueueRef.current.length > 400) {
            historyQueueRef.current.shift();
          }
          try {
            localStorage.setItem(
              'fc_ai_memory',
              JSON.stringify(historyQueueRef.current)
            );
          } catch (e) {
            console.warn('Save fc_ai_memory failed:', e);
          }
        }
      }
    }

    // Gọi phao cứu sinh từ Tầng 2 nếu rỗng
    if (!card) {
      const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
      const fbResult = FallbackDataEngine?.getGameReadyFallback
        ? FallbackDataEngine.getGameReadyFallback(
            'imagequiz',
            safeLang,
            safeLevelString,
            config
          )
        : null;
      if (fbResult) return fbResult;
      card = { term: 'Apple', definition: 'Quả táo', isAiGenerated: false };
    }

    // Nếu thẻ lấy từ Retry Bag đã có sẵn mảng options hợp lệ thì trả về luôn
    if (card.options && Array.isArray(card.options) && card.options.length >= 2) {
      return card;
    }

    // NHỊP 2 CỦA CARD MODE: SINH BẪY NHIỄU VÀ BƠM ẢNH
    let distractors = [];
    let isAiGenerated = card.isAiGenerated || false;
    const numOptions = 4;
    const isReverse = config?.askMode === 'def';
    const correctOptText = isReverse
      ? card.term
      : card.definition || card.term;
    const correctOpt = { text: correctOptText, isCorrect: true };

    try {
      if (
        isAiMode &&
        currentApiKey &&
        GameAlgoEngine?.OptionsEngine?.ai_generateOptions
      ) {
        try {
          const dists = await GameAlgoEngine.OptionsEngine.ai_generateOptions(
            card,
            lang,
            'word',
            currentApiKey,
            numOptions - 1,
            safeLevelString,
            config?.topic || '',
            isReverse
          );
          if (dists && dists.length > 0) {
            distractors = dists.map((d) => {
              if (typeof d === 'object' && d !== null && d.text) {
                return { text: d.text, isCorrect: false };
              }
              return {
                text: typeof d === 'string' ? d : String(d),
                isCorrect: false
              };
            });
            isAiGenerated = true;
            const currentTotal = parseInt(
              localStorage.getItem('fc_total_tokens') || '0',
              10
            );
            localStorage.setItem('fc_total_tokens', currentTotal + 150);
          }
        } catch (aiError) {
          console.warn('AI Image Distractor Fallback:', aiError.message);
          if (window.logSystemEvent) {
            window.logSystemEvent('Lỗi API tạo nhiễu ImageQuiz', aiError);
          }
        }
      }

      if (
        distractors.length === 0 &&
        GameAlgoEngine?.OptionsEngine?.offline_generateOptions
      ) {
        const cleanDeckForTraps = (enrichedCardsRef.current || []).filter(
          (c) => c.term && c.term.trim() !== ''
        );
        const distTexts =
          GameAlgoEngine.OptionsEngine.offline_generateOptions(
            correctOptText,
            cleanDeckForTraps,
            lang,
            'word',
            numOptions - 1,
            isReverse
          );
        distractors = distTexts.map((d) => ({ text: d, isCorrect: false }));
      }
    } catch (e) {
      console.warn('Fetch Options Error:', e);
    }

    // Fallback Options nếu thiếu
    if (distractors.length < numOptions - 1) {
      const cleanDeckForPool = (enrichedCardsRef.current || []).filter(
        (c) => c.term && c.term.trim() !== ''
      );
      let pool = cleanDeckForPool
        .filter((c) => c.term !== card.term)
        .map((c) => c.term);

      if (pool.length < numOptions - 1 && FallbackDataEngine) {
        const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
        const fbItems = FallbackDataEngine.getFallbackData(
          safeLang,
          'vocab',
          safeLevelString,
          15
        );
        if (fbItems) {
          const existingTerms = new Set(pool);
          const newFbs = fbItems
            .filter((f) => f.term !== card.term && !existingTerms.has(f.term))
            .map((f) => f.term);
          pool = [...pool, ...newFbs];
        }
      }

      const needed = numOptions - 1 - distractors.length;
      const randomOthers = Utils?.shuffleArray
        ? Utils.shuffleArray(pool).slice(0, needed)
        : pool.slice(0, needed);
      distractors.push(
        ...randomOthers.map((tItem) => ({ text: tItem, isCorrect: false }))
      );
    }

    while (distractors.length < numOptions - 1) {
      distractors.push({
        text: `${correctOptText} ${distractors.length + 1}`,
        isCorrect: false
      });
    }

    distractors = Utils?.shuffleArray
      ? Utils.shuffleArray(distractors.slice(0, numOptions - 1))
      : distractors.slice(0, numOptions - 1);

    const correctPos = Math.floor(Math.random() * (distractors.length + 1));
    const finalOptions = [...distractors];
    finalOptions.splice(correctPos, 0, correctOpt);

    // BƠM LINK ẢNH VÀO TẤT CẢ OPTIONS VỚI IMAGE_KEYWORD CHÍNH XÁC
    const optionsWithImages = finalOptions.map((opt) => {
      let query = `${opt.text} isolated clipart`;
      if (opt.isCorrect && card.image_keyword) {
        query = card.image_keyword;
      }
      return {
        ...opt,
        image:
          opt.image ||
          `https://tse4.mm.bing.net/th?q=${encodeURIComponent(
            query
          )}&w=300&h=300&c=7&rs=1&p=0`
      };
    });

    return {
      ...card,
      options: optionsWithImages,
      origin: card,
      isAiGenerated
    };
  };

  // ============================================================================
  // KHỞI ĐỘNG & PHỤC HỒI PHIÊN CHƠI
  // ============================================================================
  const startNewGame = async () => {
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

    const currentDeck = sourceMode === 'card' ? [...(cards || [])] : [];
    if (sourceMode === 'card') {
      let validCards = currentDeck.filter((c) => {
        if (!c.term || c.term.trim() === '') return false;
        if (
          c.image?.startsWith('http') ||
          (c.image_keyword && c.image_keyword.trim() !== '')
        ) {
          return true;
        }
        if (c.partOfSpeech && POS_BLACKLIST_REGEX.test(c.partOfSpeech)) {
          return false;
        }
        return true;
      });

      if (validCards.length < 4) {
        safeShowToast(
          'Bộ thẻ ít từ vựng trực quan. Đang bù thêm dự phòng...',
          'warning'
        );
        if (FallbackDataEngine?.getFallbackData) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            'vocab',
            safeLevelString,
            20
          );
          if (fbItems && fbItems.length > 0) {
            const existingTerms = new Set(validCards.map((c) => c.term));
            const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length < 4) {
          const defaults = [
            { term: 'Apple', definition: 'Quả táo' },
            { term: 'Banana', definition: 'Quả chuối' },
            { term: 'Cat', definition: 'Con mèo' },
            { term: 'Dog', definition: 'Con chó' }
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
      safeShowToast(
        'Lỗi hệ thống: Không tìm thấy QueueEngine (Block 2.5)',
        'error'
      );
      return;
    }

    const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
    await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);
    let firstData = coordinatorRef.current.pop();

    if (!firstData) {
      if (window.logSystemEvent) {
        window.logSystemEvent(
          'Queue cạn đạn lúc khởi tạo Game Đoán Hình',
          'Kích hoạt Hard Fallback'
        );
      }
      safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
      firstData = FallbackDataEngine?.getGameReadyFallback
        ? FallbackDataEngine.getGameReadyFallback(
            'imagequiz',
            safeLang,
            safeLevelString,
            config
          )
        : null;
    }

    if (isGameActiveRef.current && firstData) {
      setCurrentQuestion(applyAntiStreak(firstData));
      setSelectedIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setIsGenerating(false);
      isInitializingRef.current = false;
      setTimeLeft(timeLimit || 15);

      const currentCooldown =
        sourceMode === 'ai_pure' || isAiMode ? getConfiguredUiCooldown(9) : 0;
      setAiWaitTime(currentCooldown);
      safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
    } else if (isGameActiveRef.current) {
      safeShowToast(
        'Lỗi nghiêm trọng khi tải dữ liệu AI. Buộc kết thúc.',
        'error'
      );
      setIsGenerating(false);
      isInitializingRef.current = false;
      if (onEndGame) {
        onEndGame({ correct: score, time: time, wrong: wrongCount });
      }
    }

    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    gameTimerRef.current = setInterval(() => {
      setTime((prev) => prev + 1);
    }, 1000);
  };

  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    if (savedState && savedState.imageQuizState) {
      const st = savedState.imageQuizState;
      if (st.deck) {
        if (st.deck.length > 0 && typeof st.deck[0] === 'number') {
          deckRef.current = st.deck.map((idx) => cards[idx]).filter(Boolean);
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
        const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
        coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
      }

      if (st._needsNextOnResume) {
        const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
        coordinatorRef.current
          .maintain(false, 22000, isOfflineFastTrack)
          .then(() => {
            if (isGameActiveRef.current) {
              let data = coordinatorRef.current.pop();
              if (!data) {
                if (window.logSystemEvent) {
                  window.logSystemEvent(
                    'Queue cạn đạn lúc Resume Game Đoán Hình',
                    'Kích hoạt Hard Fallback'
                  );
                }
                safeShowToast(
                  'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
                  'warning'
                );
                const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
                data = FallbackDataEngine?.getGameReadyFallback
                  ? FallbackDataEngine.getGameReadyFallback(
                      'imagequiz',
                      safeLang,
                      safeLevelString,
                      config
                    )
                  : null;
              }
              if (data) {
                setCurrentQuestion(applyAntiStreak(data));
                setSelectedIndex(null);
                setCheckStatus('idle');
                setAttempts(0);
                setIsGenerating(false);
                setTimeLeft(timeLimit || 15);
                const currentCooldown =
                  sourceMode === 'ai_pure' || isAiMode
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
      }

      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      gameTimerRef.current = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    } else {
      startNewGame();
    }

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
      setCurrentQuestion(applyAntiStreak(nextData));
      setSelectedIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setTimeLeft(timeLimit || 15);

      const currentCooldown =
        sourceMode === 'ai_pure' || isAiMode ? getConfiguredUiCooldown(9) : 0;
      setAiWaitTime(currentCooldown);
    } else {
      setIsGenerating(true);
      const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
      coordinatorRef.current
        .maintain(false, 22000, isOfflineFastTrack)
        .then(() => {
          if (isGameActiveRef.current) {
            let data = coordinatorRef.current.pop();
            if (!data) {
              if (window.logSystemEvent) {
                window.logSystemEvent(
                  'Queue cạn đạn lúc chuyển vòng Game Đoán Hình',
                  'Kích hoạt Hard Fallback'
                );
              }
              safeShowToast(
                'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
                'warning'
              );
              const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
              data = FallbackDataEngine?.getGameReadyFallback
                ? FallbackDataEngine.getGameReadyFallback(
                    'imagequiz',
                    safeLang,
                    safeLevelString,
                    config
                  )
                : null;
            }
            if (data) {
              setCurrentQuestion(applyAntiStreak(data));
              setSelectedIndex(null);
              setCheckStatus('idle');
              setAttempts(0);
              setIsGenerating(false);
              setTimeLeft(timeLimit || 15);

              const currentCooldown =
                sourceMode === 'ai_pure' || isAiMode
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
    applyAntiStreak,
    config,
    isAiMode,
    isGenerating,
    lang,
    onEndGame,
    safeLevelString,
    safeShowToast,
    sourceMode,
    timeLimit,
    triggerAutoSave
  ]);

  // --- TƯƠNG TÁC NGƯỜI DÙNG ---
  const handleOptionClick = (idx) => {
    if (
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      checkStatus === 'wrong' ||
      isGenerating
    ) {
      return;
    }
    const clickedOpt = currentQuestion.options[idx];
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
        safeShowToast(`Chưa đúng! Còn ${2 - newAttempts} lượt.`, 'warning');
        setTimeout(
          () => setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p)),
          1000
        );
      }
    }
    setTimeout(() => triggerAutoSave(), 150);
  };

  const handleSkip = () => {
    if (
      checkStatus === 'correct' ||
      checkStatus === 'wrong' ||
      checkStatus === 'failed' ||
      isGenerating
    ) {
      return;
    }
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('wrong');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(6);
    setTimeout(() => triggerAutoSave(), 150);
  };

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN TỪNG CÂU
  useEffect(() => {
    let timerId = null;
    if (
      timerMode &&
      checkStatus !== 'correct' &&
      checkStatus !== 'wrong' &&
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

  // CƠ CHẾ GIẬT CÒ KHI HẾT GIỜ (TIMEOUT TRIGGER)
  useEffect(() => {
    if (
      timerMode &&
      timeLeft === 0 &&
      checkStatus !== 'correct' &&
      checkStatus !== 'wrong' &&
      checkStatus !== 'failed'
    ) {
      const timerId = setTimeout(() => {
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(2);
        setCheckStatus('wrong');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(6);
        setTimeout(() => triggerAutoSave(), 150);
      }, 0);
      return () => clearTimeout(timerId);
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

  // Chặn Race Condition cho Auto-next
  useEffect(() => {
    if (
      (checkStatus === 'correct' ||
        checkStatus === 'wrong' ||
        checkStatus === 'failed') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => setResultTimer((tVal) => tVal - 1), 1000);
      return () => clearTimeout(id);
    } else if (
      (checkStatus === 'correct' ||
        checkStatus === 'wrong' ||
        checkStatus === 'failed') &&
      resultTimer === 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(id);
    }
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = () => setIsResultPaused((p) => !p);

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
    aiWaitTime
  };
};

// ============================================================================
// 2. GAME WRAPPER (ImageQuizGame)
// ============================================================================
export const ImageQuizGame = ({
  cards,
  t,
  onFinish,
  onQuit,
  mainColor = 'emerald',
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
  const hookCallbacks = {
    showToast: window.globalShowToast,
    onLogWrong,
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onBack: onQuit,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: (stats) => onFinish(stats.correct, stats.time, stats.wrong)
  };

  const safeConfig = config || {
    level: 'level_4_discovery_basic',
    sourceMode: 'ai_pure'
  };

  const logic = useImageQuizLogic(
    cards,
    {
      ...safeConfig,
      isAiMode: safeConfig.aiMode || isAiMode || false,
      apiKey,
      lang,
      timeLimit: safeConfig.timeLimit || 15,
      savedState,
      globalRetryBag
    },
    hookCallbacks
  );

  const gameCallbacks = {
    onEndGame: (stats) => onFinish(stats.correct, stats.time, stats.wrong),
    onBack: logic.handleSaveAndBack,
    onSaveToNotebook: (payload) => {
      if (onBookmark) {
        onBookmark(payload);
      } else if (window.handleSaveToNotebook) {
        window.handleSaveToNotebook(payload);
      } else if (window.globalShowToast) {
        window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    }
  };

  const isBookmarked =
    logic.currentQuestion?.term &&
    notebook?.some((n) => n.term === logic.currentQuestion.term);

  return (
    <ImageQuizPlayScreen
      t={t}
      mainColor={mainColor}
      config={safeConfig}
      {...logic}
      onBack={gameCallbacks.onBack}
      onEndGame={gameCallbacks.onEndGame}
      onSaveToNotebook={gameCallbacks.onSaveToNotebook}
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