// ============================================================================
// FILE 55/85: src/features/games/ScrambleGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.4 - Scramble Logic V1.14)
// NHIỆM VỤ: Động cơ xử lý State, Trộn từ, AI Preload và Micro thu âm
//           cho trò chơi Ghép Câu (Scramble Game).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { fillCardWithAi, explainSentenceGrammar } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { ScramblePlayScreen } from './ScrambleUI';
import {
  getSafeLevelString,
  getConfiguredUiCooldown,
  extractPendingCardsFromCoordinator
} from './common/gameHelpers';

// Đọc cấu hình đã lưu từ LocalStorage một cách an toàn
const getSavedScrambleConfig = () => {
  try {
    const saved = localStorage.getItem('fc_scramble_config');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const ScrambleGame = ({
  cards = [],
  t,
  onBack,
  onEndGame,
  onPause,
  mainColor = 'orange',
  lang = 'en',
  onPlay,
  apiKey,
  onBookmark,
  notebook,
  isPaused = false,
  showToast,
  onLogWrong,
  savedState,
  settings,
  timerMode,
  timeLimit = 60,
  initialDifficulty,
  onAutoSave,
  level,
  onSaveToHarvest,
  config,
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag,
  onUpdateCards
}) => {
  const safeShowToast = useCallback(
    (msg, type = 'success') => {
      if (showToast) {
        showToast({ text: msg, type, id: Date.now() });
      } else if (typeof window !== 'undefined' && window.globalShowToast) {
        window.globalShowToast(msg, type);
      }
    },
    [showToast]
  );

  const initialCfg = getSavedScrambleConfig();

  const [inputMethod] = useState(() => initialCfg.inputMethod || config?.inputMethod || 'tap');
  const [isAiMode] = useState(() =>
    initialCfg.aiMode !== undefined ? initialCfg.aiMode : Boolean(config?.aiMode)
  );
  const [autoReadAnswer] = useState(() =>
    initialCfg.autoReadAnswer !== undefined
      ? initialCfg.autoReadAnswer
      : Boolean(config?.autoReadAnswer)
  );
  const [sourceMode] = useState(() => initialCfg.sourceMode || config?.sourceMode || 'card');
  const [suddenDeath] = useState(() =>
    initialCfg.suddenDeath !== undefined ? initialCfg.suddenDeath : Boolean(config?.suddenDeath)
  );

  // Khởi tạo State thông minh từ savedState để tránh cascading renders trong useEffect
  const [gameState, setGameState] = useState(() => {
    if (savedState?.gameState && !savedState._needsNextOnResume) {
      return JSON.parse(JSON.stringify(savedState.gameState));
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
    () => savedState?.difficulty || initialDifficulty || (initialCfg.hardMode ? 'hard' : 'easy')
  );
  const [stats, setStats] = useState(() => savedState?.stats || { correct: 0, wrong: 0 });
  const [inputBuffer, setInputBuffer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showExplainModal, setShowExplainModal] = useState(false);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [isAiExplaining, setIsAiExplaining] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => savedState?.timeLeft || timeLimit || 60);
  const [isGenerating, setIsGenerating] = useState(() => {
    if (savedState?.gameState && !savedState._needsNextOnResume) return false;
    return true;
  });

  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedState?.aiWaitTime !== undefined ? savedState.aiWaitTime : 0
  );

  // Refs quản lý vòng đời và dữ liệu ngầm
  const cardsRef = useRef(cards);
  const deckRef = useRef(savedState?.deck ? [...savedState.deck] : []);
  const historyQueueRef = useRef(Utils.safeJsonParse('fc_ai_memory', []));
  const coordinatorRef = useRef(null);
  const dragItemRef = useRef(null);
  const dragOverItemRef = useRef(null);
  const timerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const activeDragElementRef = useRef(null);
  const recognitionRef = useRef(null);
  const typeInputRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const hardTimerRef = useRef(null);
  const latestStateRef = useRef({});
  const isGameActiveRef = useRef(true);
  const isInitializingRef = useRef(false);
  const globalRetryBagRef = useRef(globalRetryBag);

  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    latestStateRef.current = {
      gameState,
      difficulty,
      stats,
      timeLeft,
      deck: deckRef.current,
      aiWaitTime
    };
  }, [gameState, difficulty, stats, timeLeft, aiWaitTime]);

  // ============================================================================
  // HÀM TRIGGER AUTO SAVE (THU HỒI ĐẠN TRONG QUEUE)
  // ============================================================================
  const triggerAutoSave = useCallback(() => {
    if (
      isGameActiveRef.current &&
      onAutoSave &&
      latestStateRef.current &&
      latestStateRef.current.gameState?.origin
    ) {
      const currentData = latestStateRef.current;
      const pendingCards = extractPendingCardsFromCoordinator(coordinatorRef.current);
      const mergedDeck = [...pendingCards, ...(currentData.deck || [])];

      onAutoSave({
        gameState: currentData.gameState,
        stats: currentData.stats,
        difficulty: currentData.difficulty,
        deck: mergedDeck,
        timeLeft: currentData.timeLeft,
        aiWaitTime: currentData.aiWaitTime
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

  // ĐỒNG HỒ QUÉT ĐẠN NGẦM & COOLDOWN UI
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (coordinatorRef.current && typeof coordinatorRef.current.length === 'function') {
        setQueueLength(coordinatorRef.current.length());
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  useEffect(() => {
    let cdTimer = null;
    if (aiWaitTime > 0 && !isPaused && !isGenerating && !isResultPaused) {
      cdTimer = setTimeout(() => setAiWaitTime((prev) => prev - 1), 1000);
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isPaused, isGenerating, isResultPaused]);

  // ============================================================================
  // BỘ NÃO TÚI NHÁP TOÀN CỤC & LOG LỖI SAI
  // ============================================================================
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag) addToRetryBag('scramble', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag) removeFromRetryBag('scramble', termToCheck);
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (questionOrigin) => {
      if (!onLogWrong || !questionOrigin) return;
      const mistakeCard = {
        ...questionOrigin,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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
    let card = null;
    let isAiGenerated = false;
    const currentDataMode = config?.dataMode || 'vocab';
    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key');
    const safeLevelStr = getSafeLevelString(
      config?.level || level,
      lang === 'zh' ? 'zh_level_1' : 'en_level_4'
    );

    // 1. Ưu tiên 30% rút từ Túi nháp lỗi sai (Atomic Lock)
    const pullLockFn = pullRetryCardWithLock || Utils?.pullRetryCardWithLock;
    if (pullLockFn) {
      card = pullLockFn('scramble', globalRetryBagRef.current, lang);
    }

    // 2. Nhánh AI Pure Mode
    if (!card && isPureMode) {
      try {
        const meta = {
          id: `scramble_${Date.now()}`,
          type: 'ioe_scramble',
          level: safeLevelStr || 'level_4_discovery_basic',
          topic: config?.topic || '',
          dataMode: currentDataMode,
          difficulty,
          hardMode: difficulty === 'hard',
          mode: 'minigame',
          inputMethod,
          lang
        };
        const freshHistory = Utils.safeJsonParse('fc_ai_memory', []);
        const qData = await ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory);
        if (qData && qData.content) {
          if (onSaveToHarvest) {
            onSaveToHarvest(meta.level, {
              displaySentence: qData.content.origin?.term || '',
              targetWord: qData.content.origin?.term || '',
              hint: qData.content.origin?.definition || ''
            });
          }
          return qData.content;
        }
      } catch (e) {
        console.warn('PureMode Engine Fallback:', e);
        if (typeof window !== 'undefined' && window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Lò đúc Scramble AI', e);
        }
      }
    }

    // 3. Nhánh rút từ Bộ thẻ cá nhân (Card Mode)
    if (!card) {
      if (deckRef.current.length === 0 && sourceMode !== 'ai_pure') {
        let validCards = (cardsRef.current || []).filter((c) => c.term && c.term.trim() !== '');
        if (validCards.length < 2 && FallbackDataEngine) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = currentDataMode === 'sentence' ? 'sentence' : 'vocab';
          const fbItems = FallbackDataEngine.getFallbackData(safeLang, mode, safeLevelStr, 20);
          if (fbItems && fbItems.length > 0) {
            const existingTerms = new Set(validCards.map((c) => c.term));
            const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length === 0) {
          validCards = [{ term: 'Learning languages is fun', definition: 'Học ngôn ngữ rất vui' }];
        }
        deckRef.current = Utils.shuffleArray ? Utils.shuffleArray(validCards) : validCards;
      }

      card = deckRef.current.shift();

      // Dịch nghĩa ngầm (JIT Enrich) nếu thẻ khuyết nghĩa
      if (card && (!card.definition || card.definition.trim() === '')) {
        const enrichFn = fillCardWithAi || Utils?.fillCardWithAi;
        if (isAiMode && currentApiKey && enrichFn) {
          try {
            const enriched = await enrichFn(
              card.term,
              lang,
              currentApiKey,
              ['definition', 'pronunciation', 'grammar_type'],
              currentDataMode
            );
            card = { ...card, ...enriched, is_enriched: true };
            if (onUpdateCards) onUpdateCards([card]);
          } catch {
            card = { ...card, definition: 'Không thể tải nghĩa (Lỗi AI)' };
          }
        } else {
          card = { ...card, definition: 'Bấm Giải thích để tra nghĩa bằng AI' };
        }
      }

      if (historyQueueRef.current && card) {
        if (!historyQueueRef.current.includes(card.term)) {
          historyQueueRef.current.push(card.term);
          while (historyQueueRef.current.length > 400) historyQueueRef.current.shift();
          try {
            localStorage.setItem('fc_ai_memory', JSON.stringify(historyQueueRef.current));
          } catch {}
        }
      }
    }

    // 4. Cứu hộ tĩnh nếu vẫn chưa có thẻ
    if (!card) {
      if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
        const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
        const mode =
          safeLang === 'zh' ? 'sentence' : currentDataMode === 'sentence' ? 'sentence' : 'vocab';
        const fbItems = FallbackDataEngine.getFallbackData(safeLang, mode, safeLevelStr, 1);
        if (fbItems && fbItems.length > 0) card = fbItems[0];
      }
      if (!card) {
        card = {
          term: 'Learning languages is very fun.',
          definition: 'Học ngôn ngữ rất thú vị.'
        };
      }
    }

    // 5. Tách mảnh từ/chữ và trộn nhiễu cho phương thức Chạm thẻ ('tap')
    let parts = [];
    if (inputMethod === 'tap') {
      const isChinese = lang === 'zh';
      const isSentence = config?.dataMode === 'sentence';
      const type = isSentence ? 'sentence' : 'word';

      const cleanAndLower = (textArr) =>
        textArr
          .map((p) => {
            let cleaned = String(p).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
            if (!isChinese) cleaned = cleaned.toLowerCase();
            return cleaned;
          })
          .filter((p) => p.trim() !== '');

      if (isChinese) {
        parts = card.term.split('');
      } else {
        parts = isSentence ? card.term.split(' ') : card.term.split('');
      }
      parts = cleanAndLower(parts);

      if (difficulty === 'hard') {
        let targetCount = 2;
        const len = parts.length;
        if (len >= 5 && len <= 10) targetCount = Math.floor(Math.random() * 2) + 4;
        else if (len > 10) targetCount = Math.floor(Math.random() * 3) + 5;

        let noiseWords = [];
        if (
          isAiMode &&
          currentApiKey &&
          GameAlgoEngine?.ScrambleNoiseEngine?.ai_getNoise
        ) {
          try {
            const aiCallPromise = GameAlgoEngine.ScrambleNoiseEngine.ai_getNoise(
              card.term,
              lang,
              type,
              currentApiKey,
              targetCount,
              safeLevelStr,
              config?.topic || '',
              card
            );
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AI Timeout')), 20000)
            );
            noiseWords = await Promise.race([aiCallPromise, timeoutPromise]);
            if (noiseWords && noiseWords.length > 0) isAiGenerated = true;
          } catch (e) {
            console.warn('AI Scramble Distractor fallback:', e.message);
          }
        }

        if (
          (!noiseWords || noiseWords.length === 0) &&
          GameAlgoEngine?.ScrambleNoiseEngine?.offline_getNoise
        ) {
          const cleanDeck = (cardsRef.current || []).filter(
            (c) => c.term && c.term.trim() !== '' && c.definition && c.definition.trim() !== ''
          );
          noiseWords = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(
            card.term,
            cleanDeck,
            lang,
            type,
            targetCount
          );
        }

        if (noiseWords && noiseWords.length > 0) {
          let finalNoiseWords = [];
          if (isChinese || type === 'word') {
            noiseWords.forEach((w) => {
              const cleanW = String(w).replace(/\s/g, '');
              finalNoiseWords.push(...cleanW.split(''));
            });
          } else {
            finalNoiseWords = noiseWords;
          }
          finalNoiseWords = cleanAndLower(finalNoiseWords);
          finalNoiseWords = Utils.shuffleArray(finalNoiseWords).slice(0, targetCount);
          parts.push(...finalNoiseWords);
        }
      }
    }

    return { origin: card, parts, isAiGenerated, _isRescued: false };
  }, [
    apiKey,
    config?.dataMode,
    config?.level,
    config?.topic,
    difficulty,
    inputMethod,
    isAiMode,
    lang,
    level,
    onSaveToHarvest,
    onUpdateCards,
    sourceMode
  ]);

  // ============================================================================
  // KHỞI TẠO TRÒ CHƠI & PHỤC HỒI PHIÊN CHƠI
  // ============================================================================
  const startNewGame = useCallback(async () => {
    setIsGenerating(true);
    setStats({ correct: 0, wrong: 0 });
    isInitializingRef.current = true;

    const safeLevelStr = getSafeLevelString(
      config?.level || level,
      lang === 'zh' ? 'zh_level_1' : 'en_level_4'
    );

    let currentDeck = sourceMode === 'card' ? [...(cardsRef.current || [])] : [];
    if (sourceMode === 'card') {
      let validCards = currentDeck.filter((c) => c.term && c.term.trim() !== '');
      if (validCards.length < 2) {
        safeShowToast('Bộ thẻ không đủ 2 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...', 'warning');
        if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = config?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const fbItems = FallbackDataEngine.getFallbackData(safeLang, mode, safeLevelStr, 20);
          if (fbItems && fbItems.length > 0) {
            const existingTerms = new Set(validCards.map((c) => c.term));
            const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length < 2) {
          const defaults = [
            { term: 'Apple', definition: 'Quả táo' },
            { term: 'Banana', definition: 'Quả chuối' }
          ];
          const existingTerms = new Set(validCards.map((c) => c.term));
          const neededDefaults = defaults.filter((f) => !existingTerms.has(f.term));
          validCards = [...validCards, ...neededDefaults];
        }
      }
      deckRef.current = Utils.shuffleArray(validCards);
    } else {
      deckRef.current = [];
    }

    if (coordinatorRef.current) coordinatorRef.current.destroy();
    if (QueueEngine && QueueEngine.createQueueCoordinator) {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
    } else {
      return;
    }

    const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
    await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
    }

    let firstData = coordinatorRef.current.pop();
    if (!firstData) {
      safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      firstData = FallbackDataEngine
        ? FallbackDataEngine.getGameReadyFallback('scramble', lang, safeLevelStr, {
            difficulty,
            inputMethod,
            dataMode: config?.dataMode
          })
        : null;
    }

    if (isGameActiveRef.current && firstData) {
      let finalChunks = [];
      if (inputMethod === 'tap') {
        finalChunks = Utils.shuffleArray(
          [...(firstData.parts || [])].map((text, id) => ({
            id: `chunk-${id}-${Date.now()}`,
            text
          }))
        );
      }
      setGameState({
        origin: firstData.origin,
        chunks: finalChunks,
        userAnswer: [],
        isCorrect: null,
        attempts: 0,
        isAiGenerated: firstData.isAiGenerated,
        _isRescued: firstData._isRescued || firstData.origin?._isRescued
      });
      setIsGenerating(false);
      isInitializingRef.current = false;
      setTimeLeft(timeLimit || 60);

      let currentCooldown = 0;
      if (sourceMode === 'ai_pure' || isAiMode) {
        currentCooldown = getConfiguredUiCooldown(9);
      }
      setAiWaitTime(currentCooldown);
      setTimeout(() => triggerAutoSave(), 150);
    } else if (isGameActiveRef.current) {
      safeShowToast('Lỗi tải dữ liệu ban đầu. Buộc kết thúc.', 'error');
      setIsGenerating(false);
      isInitializingRef.current = false;
      if (onEndGame) onEndGame(latestStateRef.current.stats || { correct: 0, wrong: 0 });
    }
  }, [
    config?.dataMode,
    config?.level,
    difficulty,
    fetchTask,
    inputMethod,
    isAiMode,
    lang,
    level,
    onEndGame,
    safeShowToast,
    sourceMode,
    timeLimit,
    triggerAutoSave
  ]);

  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const safeLevelStr = getSafeLevelString(
      config?.level || level,
      lang === 'zh' ? 'zh_level_1' : 'en_level_4'
    );

    if (savedState && savedState.gameState) {
      if (coordinatorRef.current) coordinatorRef.current.destroy();
      if (QueueEngine && QueueEngine.createQueueCoordinator) {
        coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
        const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
        coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
      }

      if (savedState._needsNextOnResume) {
        const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
        coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack).then(() => {
          if (isGameActiveRef.current) {
            let data = coordinatorRef.current.pop();
            if (!data) {
              data = FallbackDataEngine
                ? FallbackDataEngine.getGameReadyFallback('scramble', lang, safeLevelStr, {
                    difficulty,
                    inputMethod,
                    dataMode: config?.dataMode
                  })
                : null;
            }
            if (data) {
              let finalChunks = [];
              if (inputMethod === 'tap') {
                finalChunks = Utils.shuffleArray(
                  [...(data.parts || [])].map((text, id) => ({
                    id: `chunk-${id}-${Date.now()}`,
                    text
                  }))
                );
              }
              setGameState({
                origin: data.origin,
                chunks: finalChunks,
                userAnswer: [],
                isCorrect: null,
                attempts: 0,
                isAiGenerated: data.isAiGenerated,
                _isRescued: data._isRescued || data.origin?._isRescued
              });
              setIsGenerating(false);
              let currentCooldown = 0;
              if (sourceMode === 'ai_pure' || isAiMode) {
                currentCooldown = getConfiguredUiCooldown(9);
              }
              setAiWaitTime(currentCooldown);
            } else {
              setIsGenerating(false);
              if (onEndGame) onEndGame(savedState.stats || { correct: 0, wrong: 0 });
            }
          }
        });
      }
    } else {
      setTimeout(() => {
        if (isGameActiveRef.current) startNewGame();
      }, 0);
    }

    return () => {
      isGameActiveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
      if (coordinatorRef.current) coordinatorRef.current.destroy();
    };
  }, [
    config?.dataMode,
    config?.level,
    difficulty,
    fetchTask,
    inputMethod,
    isAiMode,
    lang,
    level,
    onEndGame,
    savedState,
    sourceMode,
    startNewGame
  ]);

  // ============================================================================
  // CHUYỂN VÒNG & XỬ LÝ BỎ QUA / ĐẾM NGƯỢC
  // ============================================================================
  const proceedToNext = useCallback(
    (defaultDelayMs) => {
      if (isGameActiveRef.current) {
        let delaySec = Math.ceil(defaultDelayMs / 1000);
        if (aiWaitTime > delaySec) {
          delaySec = aiWaitTime;
        }
        if (delaySec < 1) delaySec = 1;
        setResultTimer(delaySec);
      }
    },
    [aiWaitTime]
  );

  const handleSkip = useCallback(
    (isTimeout = false) => {
      if (isGenerating || isPaused || gameState.isCorrect !== null) return;
      localPushToRetryBag(gameState.origin);
      setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
      setGameState((prev) => ({ ...prev, isCorrect: false, attempts: 3 }));

      if (isTimeout) safeShowToast('Hết giờ! (+1 Sai)', 'error');
      else safeShowToast('Đã bỏ qua (+1 Sai)', 'error');

      logMistake(gameState.origin);
      proceedToNext(5000);
      if (onPlay && gameState.origin?.term) onPlay(gameState.origin.term);
      setTimeout(() => triggerAutoSave(), 150);
    },
    [
      gameState.isCorrect,
      gameState.origin,
      isGenerating,
      isPaused,
      localPushToRetryBag,
      logMistake,
      onPlay,
      proceedToNext,
      safeShowToast,
      triggerAutoSave
    ]
  );

  // Đồng hồ đếm ngược thời gian mỗi câu
  useEffect(() => {
    if (!timerMode || isPaused || gameState.isCorrect !== null || isGenerating) return;
    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    } else {
      timerRef.current = setTimeout(() => handleSkip(true), 0);
    }
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, isPaused, timerMode, gameState.isCorrect, isGenerating, handleSkip]);

  // Dừng ghi âm khi Tạm dừng game
  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        setTimeout(() => setIsListening(false), 0);
      }
    }
  }, [isPaused, isListening]);

  const nextRound = useCallback(() => {
    if (isGenerating) return;
    setResultTimer(0);
    setIsResultPaused(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
    setInputBuffer('');
    setShowExplainModal(false);
    setAiExplanation(null);
    if (recognitionRef.current) recognitionRef.current.abort();
    setIsListening(false);
    setTimeLeft(timeLimit || 60);

    if (inputMethod === 'type') {
      setTimeout(() => typeInputRef.current?.focus(), 100);
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
    }

    const safeLevelStr = getSafeLevelString(
      config?.level || level,
      lang === 'zh' ? 'zh_level_1' : 'en_level_4'
    );

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      let finalChunks = [];
      if (inputMethod === 'tap') {
        finalChunks = Utils.shuffleArray(
          [...(nextData.parts || [])].map((text, id) => ({
            id: `chunk-${id}-${Date.now()}`,
            text
          }))
        );
      }
      setGameState({
        origin: nextData.origin,
        chunks: finalChunks,
        userAnswer: [],
        isCorrect: null,
        attempts: 0,
        isAiGenerated: nextData.isAiGenerated,
        _isRescued: nextData._isRescued || nextData.origin?._isRescued
      });
      let currentCooldown = 0;
      if (sourceMode === 'ai_pure' || isAiMode) {
        currentCooldown = getConfiguredUiCooldown(9);
      }
      setAiWaitTime(currentCooldown);
    } else {
      setIsGenerating(true);
      const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
      coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack).then(() => {
        if (isGameActiveRef.current) {
          let data = coordinatorRef.current.pop();
          if (!data) {
            data = FallbackDataEngine
              ? FallbackDataEngine.getGameReadyFallback('scramble', lang, safeLevelStr, {
                  difficulty,
                  inputMethod,
                  dataMode: config?.dataMode
                })
              : null;
          }
          if (data) {
            let finalChunks = [];
            if (inputMethod === 'tap') {
              finalChunks = Utils.shuffleArray(
                [...(data.parts || [])].map((text, id) => ({
                  id: `chunk-${id}-${Date.now()}`,
                  text
                }))
              );
            }
            setGameState({
              origin: data.origin,
              chunks: finalChunks,
              userAnswer: [],
              isCorrect: null,
              attempts: 0,
              isAiGenerated: data.isAiGenerated,
              _isRescued: data._isRescued || data.origin?._isRescued
            });
            setIsGenerating(false);
            let currentCooldown = 0;
            if (sourceMode === 'ai_pure' || isAiMode) {
              currentCooldown = getConfiguredUiCooldown(9);
            }
            setAiWaitTime(currentCooldown);
          } else {
            safeShowToast('Lỗi tải vòng mới. Buộc kết thúc.', 'error');
            setIsGenerating(false);
            if (onEndGame) onEndGame(latestStateRef.current.stats || { correct: 0, wrong: 0 });
          }
        }
      });
    }
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    config?.dataMode,
    config?.level,
    difficulty,
    inputMethod,
    isAiMode,
    isGenerating,
    lang,
    level,
    onEndGame,
    safeShowToast,
    sourceMode,
    timeLimit,
    triggerAutoSave
  ]);

  // Đồng hồ tự động chuyển câu sau khi trả lời xong
  useEffect(() => {
    const isDone =
      gameState.isCorrect === true || (gameState.isCorrect === false && gameState.attempts >= 3);
    if (isDone && resultTimer > 0 && !isResultPaused && !isGenerating) {
      const id = setTimeout(() => setResultTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(id);
    } else if (isDone && resultTimer === 0 && !isResultPaused && !isGenerating) {
      const id = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(id);
    }
  }, [gameState.isCorrect, gameState.attempts, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = () => setIsResultPaused((p) => !p);

  const handleSaveAndBack = () => {
    const currentData = latestStateRef.current;
    let finalStats = { ...currentData.stats };
    let needsNext = false;

    if (currentData.gameState?.isCorrect === null && currentData.gameState?.origin) {
      localPushToRetryBag(currentData.gameState.origin);
      logMistake(currentData.gameState.origin);
      finalStats.wrong += 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const sessionData = JSON.parse(
      JSON.stringify({
        gameState: currentData.gameState,
        stats: finalStats,
        difficulty: currentData.difficulty,
        deck: currentData.deck,
        timeLeft: currentData.timeLeft,
        aiWaitTime: currentData.aiWaitTime,
        _needsNextOnResume: needsNext
      })
    );
    if (onBack) onBack(sessionData);
  };

  // ============================================================================
  // ĐỘNG CƠ KIỂM TRA ĐÁP ÁN (ĐA PHƯƠNG THỨC)
  // ============================================================================
  const checkAnswer = () => {
    if (!gameState.origin || isPaused) return;
    let isCorrect = false;

    if (inputMethod === 'type' || inputMethod === 'voice') {
      isCorrect =
        Utils.advancedNormalize(inputBuffer, lang) ===
        Utils.advancedNormalize(gameState.origin.term, lang);
    } else if (inputMethod === 'tap') {
      const isChinese = lang === 'zh';
      const isSentence = config?.dataMode === 'sentence';
      const separator = !isChinese && isSentence ? ' ' : '';
      const userString = gameState.userAnswer.map((c) => c.text).join(separator);
      isCorrect =
        Utils.advancedNormalize(userString, lang) ===
        Utils.advancedNormalize(gameState.origin.term, lang);
    }

    if (isCorrect) {
      if (gameState.attempts === 0) {
        localRemoveFromRetryBag(gameState.origin.term);
      }
      setGameState((prev) => ({ ...prev, isCorrect: true }));
      setStats((s) => ({ ...s, correct: s.correct + 1 }));
      proceedToNext(3000);
      if (autoReadAnswer && onPlay) onPlay(gameState.origin.term);
      setTimeout(() => triggerAutoSave(), 150);
    } else {
      // Áp dụng Sudden Death: Sai 1 lần ép attempts lên MAX (3)
      const newAttempts = suddenDeath ? 3 : gameState.attempts + 1;
      setGameState((prev) => ({ ...prev, isCorrect: false, attempts: newAttempts }));

      if (newAttempts >= 3) {
        localPushToRetryBag(gameState.origin);
        setStats((s) => ({ ...s, wrong: s.wrong + 1 }));
        logMistake(gameState.origin);
        proceedToNext(5000);
        if (onPlay) onPlay(gameState.origin.term);
      } else {
        if (newAttempts === 2) {
          if (difficulty !== 'hard' && onPlay) {
            onPlay(gameState.origin.term);
            safeShowToast('Sai rồi, nghe lại và thử lại nhé!', 'warning');
          } else {
            safeShowToast('Sai rồi, hãy thử lại!', 'warning');
          }
        } else {
          safeShowToast('Sai rồi, hãy thử lại!', 'warning');
        }

        setTimeout(() => {
          setGameState((prev) => {
            if (prev.isCorrect === true || prev.attempts >= 3) return prev;
            return {
              ...prev,
              isCorrect: null,
              userAnswer: inputMethod === 'tap' ? [] : prev.userAnswer,
              chunks:
                inputMethod === 'tap'
                  ? Utils.shuffleArray([
                      ...prev.chunks,
                      ...prev.userAnswer.filter((c) => !c.isPunct)
                    ])
                  : prev.chunks
            };
          });
          if (inputMethod === 'type') {
            setInputBuffer('');
            setTimeout(() => typeInputRef.current?.focus(), 50);
          }
        }, 1200);
      }
      setTimeout(() => triggerAutoSave(), 150);
    }
  };

  // ============================================================================
  // ĐỘNG CƠ NHẬN DIỆN GIỌNG NÓI (REAL-TIME PREVIEW)
  // ============================================================================
  const toggleMic = () => {
    if (isPaused || gameState.isCorrect !== null) return;
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      safeShowToast('Trình duyệt không hỗ trợ nhận diện giọng nói!', 'error');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
      setIsListening(false);
      return;
    }

    setInputBuffer('');
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'vi-VN';

      const resetSilenceTimer = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
            safeShowToast('Đã tự ngắt vì không có âm thanh (5s)', 'info');
          }
        }, 5000);
      };

      recognition.onstart = () => {
        setIsListening(true);
        resetSilenceTimer();
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        hardTimerRef.current = setTimeout(() => {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
            safeShowToast('Đã tự ngắt (Giới hạn tối đa 15s)', 'warning');
          }
        }, 15000);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
      };

      recognition.onerror = (event) => {
        console.error('Speech Recognition Error:', event.error);
        setIsListening(false);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        if (event.error === 'not-allowed') {
          safeShowToast('Bạn cần cấp quyền Micro.', 'error');
        }
      };

      recognition.onresult = (event) => {
        let currentInputBuffer = '';
        let hasValidText = false;
        for (let i = 0; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          currentInputBuffer += text;
          if (text.trim().length > 0) hasValidText = true;
        }
        if (hasValidText) resetSilenceTimer();
        setInputBuffer(currentInputBuffer);
      };

      recognition.start();
    } catch (e) {
      console.error('Mic start error:', e);
      safeShowToast('Không thể khởi động Micro.', 'error');
    }
  };

  // ============================================================================
  // XỬ LÝ KÉO THẢ (DRAG & DROP + TOUCH DRAG)
  // ============================================================================
  const onDragStart = (e, index) => {
    if (isPaused) return;
    dragItemRef.current = index;
    if (e.target) e.target.classList.add('opacity-50');
  };

  const onDragEnter = (_e, index) => {
    if (isPaused) return;
    dragOverItemRef.current = index;
  };

  const onDragEnd = (e) => {
    if (e && e.target) e.target.classList.remove('opacity-50');
    const draggedIdx = dragItemRef.current;
    const overIdx = dragOverItemRef.current;
    if (draggedIdx === null || overIdx === null || draggedIdx === overIdx || isPaused) return;

    const newList = [...gameState.userAnswer];
    const draggedItem = newList[draggedIdx];
    newList.splice(draggedIdx, 1);
    newList.splice(overIdx, 0, draggedItem);
    setGameState((prev) => ({ ...prev, userAnswer: newList }));
    dragItemRef.current = null;
    dragOverItemRef.current = null;
    setTimeout(() => triggerAutoSave(), 150);
  };

  const onTouchStart = (e, index) => {
    if (isPaused) return;
    dragItemRef.current = index;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
    const touch = e.touches[0];
    const target = e.currentTarget;
    activeDragElementRef.current = target;
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    target.style.transition = 'none';
    target.style.zIndex = '1000';
    target.style.position = 'relative';
    target.classList.add('opacity-80', 'scale-110', 'shadow-2xl', 'ring-2', `ring-${mainColor}-400`);
  };

  const onTouchMove = (e) => {
    if (isPaused || !activeDragElementRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;
    activeDragElementRef.current.style.transform = `translate(${dx}px, ${dy}px)`;

    const prevDisplay = activeDragElementRef.current.style.display;
    activeDragElementRef.current.style.display = 'none';
    const targetUnderFinger = document.elementFromPoint(touch.clientX, touch.clientY);
    activeDragElementRef.current.style.display = prevDisplay;

    if (targetUnderFinger) {
      const item = targetUnderFinger.closest('[data-drag-index]');
      if (item) {
        const index = parseInt(item.getAttribute('data-drag-index'), 10);
        if (!isNaN(index) && index !== dragItemRef.current) {
          dragOverItemRef.current = index;
        }
      }
    }
  };

  const onTouchEnd = (e) => {
    if (isPaused) return;
    if (activeDragElementRef.current) {
      activeDragElementRef.current.style.transform = '';
      activeDragElementRef.current.style.zIndex = '';
      activeDragElementRef.current.style.position = '';
      activeDragElementRef.current.style.transition = '';
      activeDragElementRef.current.classList.remove(
        'opacity-80',
        'scale-110',
        'shadow-2xl',
        'ring-2',
        `ring-${mainColor}-400`
      );
      activeDragElementRef.current = null;
    }
    onDragEnd(e);
  };

  // ============================================================================
  // GIẢI THÍCH NGỮ PHÁP BẰNG AI & THÊM DẤU CÂU
  // ============================================================================
  const handleExplain = async () => {
    if (isGenerating || !gameState.origin) return;
    setShowExplainModal(true);
    if (aiExplanation) return;
    setIsAiExplaining(true);
    try {
      const explainFn = explainSentenceGrammar || Utils?.explainSentenceGrammar;
      const result = await explainFn(gameState.origin.term, lang, apiKey);
      setAiExplanation(result.text);
      if (result._tokenUsage) {
        const used = result._tokenUsage.totalTokenCount || 0;
        const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
        localStorage.setItem('fc_total_tokens', String(currentTotal + used));
      }
    } catch (e) {
      setAiExplanation('Lỗi kết nối AI: ' + e.message);
    } finally {
      setIsAiExplaining(false);
    }
  };

  const isBookmarked = Boolean(
    gameState.origin && notebook?.some((n) => n.term === gameState.origin.term)
  );

  const handleAddPunctuation = (punct) => {
    if (!gameState.origin || isPaused || gameState.isCorrect !== null) return;
    setGameState((prev) => ({
      ...prev,
      userAnswer: [
        ...prev.userAnswer,
        { id: `punct-${Date.now()}-${Math.random()}`, text: punct, isPunct: true }
      ]
    }));
    setTimeout(() => triggerAutoSave(), 150);
  };

  return (
    <ScramblePlayScreen
      t={t}
      mainColor={mainColor}
      lang={lang}
      settings={settings}
      config={{
        ...config,
        sourceMode,
        aiMode: isAiMode,
        suddenDeath,
        level: config?.level || level
      }}
      isPaused={isPaused}
      timerMode={timerMode}
      timeLimit={timeLimit}
      timeLeft={timeLeft}
      inputMethod={inputMethod}
      isGenerating={isGenerating}
      aiCountdown={0}
      gameState={gameState}
      setGameState={setGameState}
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
      onEndGame={onEndGame}
      onPause={onPause}
      onPlay={onPlay}
      onBookmark={onBookmark}
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