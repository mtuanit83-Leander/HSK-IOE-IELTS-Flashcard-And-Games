// ============================================================================
// FILE 53/85: src/features/games/MatchGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.2 - Match Logic V1.15)
// NHIỆM VỤ: Động cơ xử lý Logic, quản lý dữ liệu, Batch Queue, tạo bẫy vô nghiệm
//           (Hard Mode), State và Timer của Game Nối Ô (Match Game).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { callGeminiApi } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import {
  getSafeLevelString,
  getConfiguredUiCooldown,
  playGameSFX,
  extractPendingCardsFromQueue
} from './common/gameHelpers';
import { MatchPlayScreen } from './MatchUI';

const DEFAULT_MATCH_STATE = {
  pairs: [],
  leftItems: [],
  rightItems: [],
  connections: {},
  selectedLeft: null,
  isChecked: false,
  score: 0,
  correctLines: [],
  wrongLines: [],
  missingLines: [],
  timer: 10,
  isAiGenerated: false,
  isResultPaused: false,
  _isRescued: false
};

export const MatchGame = ({
  cards = [],
  t,
  onBack,
  onEndGame,
  onPause,
  mainColor = 'purple',
  isAiMode: propAiMode,
  lang = 'en',
  onBookmark,
  notebook = [],
  isPaused = false,
  onLogWrong,
  savedState,
  settings,
  timerMode: propTimerMode,
  timeLimit: propTimeLimit,
  initialDifficulty: propDifficulty,
  onAutoSave,
  onUpdateCards,
  level,
  onSaveToHarvest,
  config = {},
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag,
  isMuted = false
}) => {
  // Chuẩn hóa cấu hình từ Props hoặc LocalStorage
  const effectiveTimerMode = propTimerMode ?? config?.timerMode ?? false;
  const effectiveTimeLimit = propTimeLimit ?? config?.timeLimit ?? 60;

  const [isAiMode] = useState(() => {
    if (config?.aiMode !== undefined) return Boolean(config.aiMode);
    if (propAiMode !== undefined) return Boolean(propAiMode);
    try {
      const cfg = JSON.parse(localStorage.getItem('fc_match_config') || '{}');
      return Boolean(cfg.aiMode);
    } catch {
      return false;
    }
  });

  const [difficulty] = useState(() => {
    if (savedState?.difficulty) return savedState.difficulty;
    if (config?.hardMode !== undefined) return config.hardMode ? 'hard' : 'easy';
    try {
      const cfg = JSON.parse(localStorage.getItem('fc_match_config') || '{}');
      if (cfg?.hardMode !== undefined) return cfg.hardMode ? 'hard' : 'easy';
      return propDifficulty || (isAiMode ? 'hard' : 'easy');
    } catch {
      return propDifficulty || (isAiMode ? 'hard' : 'easy');
    }
  });

  const [sourceMode] = useState(() => {
    if (config?.sourceMode) return config.sourceMode;
    try {
      const cfg = JSON.parse(localStorage.getItem('fc_match_config') || '{}');
      return cfg?.sourceMode || 'card';
    } catch {
      return 'card';
    }
  });

  // Khởi tạo trực tiếp từ savedState (nếu có) để tránh cascading renders trong useEffect
  const [matchState, setMatchState] = useState(() => {
    if (savedState?.matchState && !savedState._needsNextOnResume) {
      return JSON.parse(JSON.stringify(savedState.matchState));
    }
    return DEFAULT_MATCH_STATE;
  });

  const [timeLeft, setTimeLeft] = useState(() => {
    if (savedState?.timeLeft !== undefined && !savedState._needsNextOnResume) {
      return savedState.timeLeft;
    }
    return effectiveTimeLimit;
  });

  const [gameStats, setGameStats] = useState(() => {
    return savedState?.gameStats || { correct: 0, wrong: 0 };
  });

  const [isLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(() => {
    if (savedState?.matchState && !savedState._needsNextOnResume) {
      return false;
    }
    return true;
  });

  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() => {
    if (savedState?.aiWaitTime !== undefined && !savedState._needsNextOnResume) {
      return savedState.aiWaitTime;
    }
    return 0;
  });

  // Refs đồng bộ không gây re-render
  const cardsRef = useRef(cards);
  const diffRef = useRef(difficulty);
  const configRef = useRef(config);
  const langRef = useRef(lang);
  const sourceModeRef = useRef(sourceMode);
  const isAiModeRef = useRef(isAiMode);
  const onSaveToHarvestRef = useRef(onSaveToHarvest);
  const onUpdateCardsRef = useRef(onUpdateCards);
  const globalRetryBagRef = useRef(globalRetryBag);

  const deckRef = useRef(savedState?.deck ? [...savedState.deck] : []);
  const coordinatorRef = useRef(null);
  const timerRef = useRef(null);
  const latestStateRef = useRef({});
  const isGameActiveRef = useRef(true);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  useEffect(() => {
    diffRef.current = difficulty;
  }, [difficulty]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);
  useEffect(() => {
    isAiModeRef.current = isAiMode;
  }, [isAiMode]);
  useEffect(() => {
    onSaveToHarvestRef.current = onSaveToHarvest;
  }, [onSaveToHarvest]);
  useEffect(() => {
    onUpdateCardsRef.current = onUpdateCards;
  }, [onUpdateCards]);
  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  const safeShowToast = useCallback((msg, type = 'success') => {
    if (typeof window !== 'undefined' && window.globalShowToast) {
      window.globalShowToast({ text: msg, type, id: Date.now() });
    }
  }, []);

  useEffect(() => {
    isGameActiveRef.current = true;
    return () => {
      isGameActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestStateRef.current = {
      matchState,
      difficulty,
      gameStats,
      timeLeft,
      deck: deckRef.current,
      aiWaitTime
    };
  }, [matchState, difficulty, gameStats, timeLeft, aiWaitTime]);

  // ============================================================================
  // AUTO-SAVE TIẾN TRÌNH CHƠI (MỖI 5 GIÂY)
  // ============================================================================
  const triggerAutoSave = useCallback(() => {
    if (
      isGameActiveRef.current &&
      onAutoSave &&
      latestStateRef.current?.matchState?.pairs?.length > 0
    ) {
      const currentData = latestStateRef.current;
      const pendingCards = extractPendingCardsFromQueue(coordinatorRef.current);
      const mergedDeck = [...pendingCards, ...(currentData.deck || [])];
      const uniqueMergedDeck = mergedDeck.filter(
        (v, i, a) => v && v.term && a.findIndex((item) => item && item.term === v.term) === i
      );

      onAutoSave({
        matchState: currentData.matchState,
        gameStats: currentData.gameStats,
        difficulty: currentData.difficulty,
        deck: uniqueMergedDeck,
        timeLeft: currentData.timeLeft,
        aiWaitTime: currentData.aiWaitTime,
        _needsNextOnResume: false
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

  // Quét số lượng đạn đã nạp trong BatchQueueCoordinator
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (coordinatorRef.current && typeof coordinatorRef.current.length === 'function') {
        setQueueLength(coordinatorRef.current.length());
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // Đồng hồ đếm ngược làm nguội UI (AI Cooldown)
  useEffect(() => {
    let cdTimer = null;
    if (aiWaitTime > 0 && !isPaused && !isGenerating && !matchState.isResultPaused) {
      cdTimer = setTimeout(() => setAiWaitTime((prev) => prev - 1), 1000);
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isPaused, isGenerating, matchState.isResultPaused]);

  // Quản lý Túi nháp (Retry Bag) & Ghi sổ Lỗi sai
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag) addToRetryBag('match', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag) removeFromRetryBag('match', termToCheck);
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (cardOrigin) => {
      if (!onLogWrong || !cardOrigin) return;
      const mistakeCard = {
        ...cardOrigin,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        type: 'mistake',
        tags: ['match', difficulty, sourceModeRef.current],
        timestamp: Date.now()
      };
      onLogWrong(mistakeCard);
    },
    [onLogWrong, difficulty]
  );

  // ============================================================================
  // HÀM TẢI DỮ LIỆU ĐƯỜNG ỐNG (FETCH TASK CHO BATCH QUEUE)
  // ============================================================================
  const fetchTask = useCallback(async () => {
    const currentDiff = diffRef.current;
    const currentSourceMode = sourceModeRef.current;
    const currentDataMode = configRef.current?.dataMode || 'vocab';
    const currentApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    const targetCount = currentDiff === 'hard' ? 4 : 5;
    const retryCards = [];

    // Bọc thép Multi-select Level
    const safeLevelString = getSafeLevelString(
      configRef.current?.level || level,
      langRef.current === 'zh' ? 'zh_level_1' : 'en_level_4'
    );

    const pullFn = pullRetryCardWithLock || Utils?.pullRetryCardWithLock;
    if (pullFn) {
      const pulledCard = pullFn('match', globalRetryBagRef.current, langRef.current);
      if (pulledCard) {
        retryCards.push(pulledCard);
      }
    }

    // 1. Nhánh AI Tự Sinh (AI Pure Mode)
    if (currentSourceMode === 'ai_pure') {
      try {
        const meta = {
          id: `match_${Date.now()}`,
          type: 'ioe_match',
          level: safeLevelString || 'level_4_discovery_basic',
          topic: Array.isArray(configRef.current?.topic)
            ? configRef.current.topic[0] || ''
            : configRef.current?.topic || '',
          dataMode: currentDataMode,
          difficulty: currentDiff,
          hardMode: currentDiff === 'hard',
          mode: 'minigame',
          lang: langRef.current
        };
        const freshHistory = Utils.safeJsonParse('fc_ai_memory', []);
        const qData = await ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory);
        if (qData && qData.content) {
          if (onSaveToHarvestRef.current && qData.content.pairs) {
            qData.content.pairs.forEach((c) =>
              onSaveToHarvestRef.current(meta.level, {
                displaySentence: c.term,
                targetWord: c.term,
                hint: c.definition
              })
            );
          }
          return qData.content;
        }
      } catch (e) {
        console.warn('PureMode Match Fallback:', e);
        if (typeof window !== 'undefined' && window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Lò đúc Match AI', e);
        }
      }
    }

    // 2. Nhánh Thẻ của tôi (Card Mode) hoặc Fallback từ AI Pure
    const pool = [...retryCards];
    let attempts = 0;
    const maxAttempts = (cardsRef.current?.length || 20) * 2;

    while (pool.length < targetCount && attempts < maxAttempts) {
      if (deckRef.current.length === 0 && currentSourceMode !== 'ai_pure') {
        let validCards = (cardsRef.current || []).filter(
          (c) => c && c.term && c.term.trim() !== ''
        );
        if (validCards.length < targetCount && FallbackDataEngine) {
          const safeLang = langRef.current === 'en' || langRef.current === 'zh' ? langRef.current : 'en';
          const mode = currentDataMode === 'sentence' ? 'sentence' : 'vocab';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            mode,
            safeLevelString,
            20
          );
          if (fbItems && fbItems.length >= targetCount) validCards = fbItems;
        }
        if (validCards.length < targetCount) {
          validCards = [
            { term: 'Apple', definition: 'Quả táo' },
            { term: 'Banana', definition: 'Quả chuối' },
            { term: 'Cat', definition: 'Con mèo' },
            { term: 'Dog', definition: 'Con chó' },
            { term: 'Bird', definition: 'Con chim' }
          ];
        }
        deckRef.current = Utils.shuffleArray(validCards);
      }

      if (deckRef.current.length > 0) {
        let c = deckRef.current.shift();
        attempts++;

        // [JIT PROCESSING] Dịch thuật On-demand ngầm cho thẻ khuyết nghĩa
        if (c && (!c.definition || c.definition.trim() === '')) {
          if (isAiModeRef.current && currentApiKey && callGeminiApi) {
            try {
              const targetLang =
                langRef.current === 'zh'
                  ? 'Chinese'
                  : langRef.current === 'vi'
                  ? 'Vietnamese'
                  : 'English';
              const prompt = `Dịch từ/câu sau sang tiếng Việt ngắn gọn nhất (dưới 6 từ). KHÔNG giải thích. Từ/câu: "${c.term}". Ngôn ngữ gốc: ${targetLang}.`;
              const schema = {
                type: 'OBJECT',
                properties: { definition: { type: 'STRING' } },
                required: ['definition']
              };
              let dynamicTimeout = 15000;
              try {
                const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config') || '{}');
                if (aiCfg && aiCfg.loadingTime) {
                  dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 2000;
                }
              } catch {}
              const callPromise = callGeminiApi(prompt, schema, currentApiKey);
              const timeoutPromise = new Promise((_, r) =>
                setTimeout(() => r(new Error('JIT Enrich Timeout')), dynamicTimeout)
              );
              const res = await Promise.race([callPromise, timeoutPromise]);
              const parsed = Utils.parseAiJson(res.text);
              if (parsed && parsed.definition) {
                c = { ...c, definition: parsed.definition };
                if (onUpdateCardsRef.current) {
                  const newCards = [...(cardsRef.current || [])];
                  const idx = newCards.findIndex((card) => card.term === c.term);
                  if (idx !== -1) {
                    newCards[idx] = { ...newCards[idx], definition: parsed.definition };
                    cardsRef.current = newCards;
                    onUpdateCardsRef.current(newCards);
                  }
                }
              }
            } catch (e) {
              console.warn('[JIT Enrich] Lỗi dịch thuật ngầm cho từ:', c.term, e.message);
            }
          }
        }

        if (c && c.definition && c.definition.trim() !== '') {
          if (!pool.some((r) => r.term === c.term)) pool.push(c);
        }
      } else {
        break;
      }
    }

    if (pool.length < targetCount) {
      const needed = targetCount - pool.length;
      if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
        const safeLang = langRef.current === 'en' || langRef.current === 'zh' ? langRef.current : 'en';
        const mode = currentDataMode === 'sentence' ? 'sentence' : 'vocab';
        const fbItems = FallbackDataEngine.getFallbackData(
          safeLang,
          mode,
          safeLevelString,
          needed + 10
        );
        if (fbItems && fbItems.length > 0) {
          for (const fb of fbItems) {
            if (pool.length >= targetCount) break;
            if (!pool.some((r) => r.term === fb.term)) pool.push(fb);
          }
        }
      }
      while (pool.length < targetCount) {
        pool.push({
          term: 'Fallback ' + pool.length,
          definition: 'Dự phòng ' + pool.length
        });
      }
    }

    const realCards = pool.slice(0, targetCount);
    const trapCards = [];
    let isAiGenerated = false;

    // 3. Tạo 2 thẻ bẫy vô nghiệm khi ở Chế độ Khó (Hard Mode)
    if (currentDiff === 'hard') {
      const cleanDeckForTraps = (cardsRef.current || []).filter(
        (c) => c && c.term && c.term.trim() !== '' && c.definition && c.definition.trim() !== ''
      );
      const availableTraps = cleanDeckForTraps.filter(
        (c) => !realCards.some((r) => r.term === c.term)
      );
      let trapSources = Utils.shuffleArray([...availableTraps]).slice(0, 2);

      if (trapSources.length < 2) {
        const needed = 2 - trapSources.length;
        if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
          const safeLang =
            langRef.current === 'en' || langRef.current === 'zh' ? langRef.current : 'en';
          const mode = currentDataMode === 'sentence' ? 'sentence' : 'vocab';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            mode,
            safeLevelString,
            15
          );
          if (fbItems) {
            const validFbs = fbItems.filter(
              (c) =>
                !realCards.some((r) => r.term === c.term) &&
                !trapSources.some((tr) => tr.term === c.term)
            );
            trapSources = [...trapSources, ...validFbs.slice(0, needed)];
          }
        }
        while (trapSources.length < 2) {
          trapSources.push({
            term: 'Trap FB ' + trapSources.length,
            definition: 'Bẫy DP ' + trapSources.length
          });
        }
      }

      for (let i = 0; i < trapSources.length; i++) {
        const trapCard = trapSources[i];
        let distortedTerm = null;
        let explanation = '';
        const isSentence = configRef.current?.dataMode === 'sentence';
        const type = isSentence ? 'sentence' : 'word';
        const isAiModeActive = isAiModeRef.current;

        if (
          isAiModeActive &&
          currentApiKey &&
          GameAlgoEngine?.DistortionEngine?.ai_distort
        ) {
          try {
            const safeTopicStr = Array.isArray(configRef.current?.topic)
              ? configRef.current.topic[0] || ''
              : configRef.current?.topic || '';
            const res = await GameAlgoEngine.DistortionEngine.ai_distort(
              trapCard.term,
              langRef.current,
              type,
              currentApiKey,
              safeLevelString,
              safeTopicStr
            );
            const returnedDistortion = type === 'word' ? res.wrongWord : res.wrongSentence;
            if (returnedDistortion && returnedDistortion !== trapCard.term) {
              distortedTerm = returnedDistortion;
              explanation = res.explanation;
              isAiGenerated = true;
              const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
              localStorage.setItem('fc_total_tokens', String(currentTotal + 150));
            }
          } catch (e) {
            console.warn('AI Distortion fallback to Offline Engine', e.message);
            if (typeof window !== 'undefined' && window.logSystemEvent) {
              window.logSystemEvent('Lỗi API bóp méo bẫy Match', e);
            }
          }
        }

        if (!distortedTerm && GameAlgoEngine?.DistortionEngine?.offline_distort) {
          const offRes = GameAlgoEngine.DistortionEngine.offline_distort(
            trapCard.term,
            langRef.current,
            type
          );
          distortedTerm = type === 'word' ? offRes.wrongWord : offRes.wrongSentence;
          explanation = offRes.explanation;
        } else if (!distortedTerm) {
          distortedTerm = trapCard.term + 'x';
          explanation = 'Lỗi hình thái từ (Offline).';
        }

        trapCards.push({
          term: distortedTerm,
          distortedTerm: distortedTerm,
          definition: trapCard.definition,
          explanation: explanation,
          originalTerm: trapCard.term,
          isAiGenerated: isAiGenerated
        });
      }
    }

    const leftItems = [...realCards, ...trapCards].map((c, i) => ({
      id: `left_${i}_${Date.now()}`,
      term: c.term,
      definition: c.definition || 'No definition',
      isTrap: trapCards.some((tr) => tr.term === c.term),
      origin: c
    }));

    const rightItems = [];
    realCards.forEach((c, i) => {
      rightItems.push({
        id: `right_real_${i}_${Date.now()}`,
        term: c.term,
        isTrap: false
      });
    });

    for (let i = 0; i < trapCards.length; i++) {
      const trapCard = trapCards[i];
      rightItems.push({
        id: `right_trap_${i}_${Date.now()}`,
        term: trapCard.distortedTerm || trapCard.term,
        isTrap: true,
        originalTerm: trapCard.originalTerm,
        explanation: trapCard.explanation
      });
    }

    const shuffleNoAdjacentTraps = (arr) => {
      let res = [...arr];
      let valid = false;
      let tries = 0;
      while (!valid && tries < 50) {
        res = Utils.shuffleArray(res);
        valid = true;
        for (let j = 0; j < res.length - 1; j++) {
          if (res[j].isTrap && res[j + 1].isTrap) {
            valid = false;
            break;
          }
        }
        tries++;
      }
      return res;
    };

    return {
      pairs: realCards,
      leftItems: shuffleNoAdjacentTraps(leftItems),
      rightItems: shuffleNoAdjacentTraps(rightItems),
      isAiGenerated,
      _isRescued: false
    };
  }, [level]);

  // Áp dụng dữ liệu vòng chơi mới lên UI
  const applyMatchData = useCallback(
    (data) => {
      setMatchState({
        pairs: data.pairs || [],
        leftItems: data.leftItems || [],
        rightItems: data.rightItems || [],
        connections: {},
        selectedLeft: null,
        isChecked: false,
        score: 0,
        correctLines: [],
        wrongLines: [],
        missingLines: [],
        timer: 10,
        isAiGenerated: Boolean(data.isAiGenerated),
        isResultPaused: false,
        _isRescued: Boolean(data._isRescued)
      });
      setTimeLeft(effectiveTimeLimit);
      isInitializingRef.current = false;
      setIsGenerating(false);

      let currentCooldown = 0;
      if (sourceModeRef.current === 'ai_pure' || isAiModeRef.current) {
        currentCooldown = getConfiguredUiCooldown(9);
      }
      setAiWaitTime(currentCooldown);
      setTimeout(() => triggerAutoSave(), 150);
    },
    [effectiveTimeLimit, triggerAutoSave]
  );

  // Khởi tạo ván chơi mới
  const startMatch = useCallback(async () => {
    isInitializingRef.current = true;
    setIsGenerating(true);
    const safeLevelString = getSafeLevelString(
      configRef.current?.level || level,
      langRef.current === 'zh' ? 'zh_level_1' : 'en_level_4'
    );

    if (typeof window !== 'undefined' && window.fc_audioCtx?.state === 'suspended') {
      window.fc_audioCtx.resume();
    }

    if (sourceModeRef.current === 'card') {
      let validCards = [...(cardsRef.current || [])].filter(
        (c) => c && c.term && c.term.trim() !== ''
      );
      if (validCards.length < 4) {
        safeShowToast('Bộ thẻ không đủ 4 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...', 'warning');
        if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
          const safeLang =
            langRef.current === 'en' || langRef.current === 'zh' ? langRef.current : 'en';
          const mode = configRef.current?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            mode,
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
            { term: 'Dog', definition: 'Con chó' },
            { term: 'Bird', definition: 'Con chim' }
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
    if (QueueEngine && QueueEngine.createBatchQueueCoordinator) {
      coordinatorRef.current = QueueEngine.createBatchQueueCoordinator(fetchTask, 4);
    } else {
      safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine (Block 2.5)', 'error');
      return;
    }

    const isOfflineFastTrack = sourceModeRef.current === 'card' && !isAiModeRef.current;
    await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);
    let firstData = coordinatorRef.current.pop();

    if (!firstData) {
      if (typeof window !== 'undefined' && window.logSystemEvent) {
        window.logSystemEvent(
          'Queue cạn đạn lúc khởi tạo Game Nối Ô',
          'Kích hoạt Hard Fallback'
        );
      }
      safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      firstData = FallbackDataEngine
        ? FallbackDataEngine.getGameReadyFallback('match', langRef.current, safeLevelString, {
            difficulty: diffRef.current,
            dataMode: configRef.current?.dataMode
          })
        : null;
    }

    if (isGameActiveRef.current && firstData) {
      applyMatchData(firstData);
      safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
    }
  }, [level, fetchTask, applyMatchData, safeShowToast]);

  // Xử lý thoát về Menu kèm kỷ luật thoát ngang
  const handleSaveAndBack = useCallback(() => {
    const currentData = latestStateRef.current;
    const finalStats = { ...(currentData.gameStats || { correct: 0, wrong: 0 }) };
    let needsNext = false;

    if (
      !currentData.matchState?.isChecked &&
      currentData.matchState?.leftItems &&
      currentData.matchState.leftItems.length > 0
    ) {
      currentData.matchState.leftItems.forEach((item) => {
        if (!item.isTrap && item.origin) {
          localPushToRetryBag(item.origin);
          logMistake(item.origin);
        }
      });
      finalStats.wrong += currentData.matchState.pairs?.length || 4;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính lỗi sai!', 'warning');
    }

    const sessionData = JSON.parse(
      JSON.stringify({
        matchState: currentData.matchState,
        difficulty: currentData.difficulty,
        gameStats: finalStats,
        deck: currentData.deck,
        timeLeft: currentData.timeLeft,
        aiWaitTime: currentData.aiWaitTime,
        _needsNextOnResume: needsNext
      })
    );
    if (onBack) onBack(sessionData);
  }, [localPushToRetryBag, logMistake, safeShowToast, onBack]);

  // Chuyển sang vòng nối ô tiếp theo
  const generateMatch = useCallback(async () => {
    if (typeof window !== 'undefined' && window.fc_audioCtx?.state === 'suspended') {
      window.fc_audioCtx.resume();
    }

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      if (isGameActiveRef.current && nextData) {
        applyMatchData(nextData);
      }
    } else {
      setIsGenerating(true);
      if (coordinatorRef.current) {
        const isOfflineFastTrack = sourceModeRef.current === 'card' && !isAiModeRef.current;
        await coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
        let fresh = coordinatorRef.current.pop();
        if (!fresh) {
          if (typeof window !== 'undefined' && window.logSystemEvent) {
            window.logSystemEvent(
              'Queue cạn đạn lúc chuyển vòng Game Nối Ô',
              'Kích hoạt Hard Fallback'
            );
          }
          safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
          const safeLevelString = getSafeLevelString(
            configRef.current?.level || level,
            langRef.current === 'zh' ? 'zh_level_1' : 'en_level_4'
          );
          fresh = FallbackDataEngine
            ? FallbackDataEngine.getGameReadyFallback(
                'match',
                langRef.current,
                safeLevelString,
                {
                  difficulty: diffRef.current,
                  dataMode: configRef.current?.dataMode
                }
              )
            : null;
        }
        if (isGameActiveRef.current && fresh) {
          applyMatchData(fresh);
        }
      }
    }
  }, [applyMatchData, safeShowToast, level]);

  // Kiểm tra kết quả nối dây
  const checkMatch = useCallback(
    (isTimeout = false) => {
      let roundScore = 0;
      const correctLines = [];
      const wrongLines = [];
      const missingLines = [];

      matchState.leftItems.forEach((left) => {
        const userConnectedRightId = matchState.connections[left.id];
        if (left.isTrap) {
          if (userConnectedRightId === undefined) {
            roundScore++;
          } else {
            wrongLines.push({ start: left.id, end: userConnectedRightId });
            if (left.origin) logMistake(left.origin);
          }
        } else {
          const correctRight = matchState.rightItems.find(
            (r) => !r.isTrap && r.term === left.term
          );
          if (userConnectedRightId !== undefined) {
            if (correctRight && userConnectedRightId === correctRight.id) {
              roundScore++;
              correctLines.push({ start: left.id, end: userConnectedRightId });
              localRemoveFromRetryBag(left.term);
            } else {
              wrongLines.push({ start: left.id, end: userConnectedRightId });
              if (correctRight) {
                missingLines.push({ start: left.id, end: correctRight.id });
              }
              if (left.origin) logMistake(left.origin);
              if (left.origin) localPushToRetryBag(left.origin);
            }
          } else {
            if (correctRight) {
              missingLines.push({ start: left.id, end: correctRight.id });
            }
            if (left.origin) logMistake(left.origin);
            if (left.origin) localPushToRetryBag(left.origin);
          }
        }
      });

      const isPerfectRound = roundScore === matchState.leftItems.length;
      playGameSFX(isPerfectRound ? 'correct' : 'wrong', isMuted);

      let delaySec = 10;
      if (aiWaitTime > delaySec) {
        delaySec = aiWaitTime;
      }

      setGameStats((p) => ({
        correct: p.correct + roundScore,
        wrong: p.wrong + (matchState.leftItems.length - roundScore)
      }));

      setMatchState((p) => ({
        ...p,
        isChecked: true,
        score: roundScore,
        correctLines,
        wrongLines,
        missingLines,
        timer: delaySec,
        isResultPaused: false
      }));

      if (difficulty === 'hard' && isPerfectRound) {
        safeShowToast('Xuất sắc! Bạn không sập bẫy!', 'success');
      } else if (difficulty === 'hard' && !isPerfectRound) {
        if (isTimeout) safeShowToast('Hết giờ! Cẩn thận sập bẫy nhé!', 'warning');
        else safeShowToast('Có lỗi sai rồi, cẩn thận sập bẫy nhé!', 'warning');
      } else if (isTimeout) {
        safeShowToast('Hết giờ! Đã tự động kiểm tra.', 'warning');
      }

      setTimeout(() => triggerAutoSave(), 150);
    },
    [
      matchState.leftItems,
      matchState.rightItems,
      matchState.connections,
      aiWaitTime,
      difficulty,
      isMuted,
      logMistake,
      localRemoveFromRetryBag,
      localPushToRetryBag,
      safeShowToast,
      triggerAutoSave
    ]
  );

  // Vòng đời khởi tạo hoặc khôi phục ván chơi (Chạy 1 lần khi mount)
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const initTimer = setTimeout(() => {
      if (savedState && savedState.matchState) {
        if (coordinatorRef.current) coordinatorRef.current.destroy();
        if (QueueEngine && QueueEngine.createBatchQueueCoordinator) {
          coordinatorRef.current = QueueEngine.createBatchQueueCoordinator(fetchTask, 4);
          const isOfflineFastTrack = sourceModeRef.current === 'card' && !isAiModeRef.current;
          coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
        }

        if (savedState._needsNextOnResume) {
          const isOfflineFastTrack = sourceModeRef.current === 'card' && !isAiModeRef.current;
          coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack).then(() => {
            if (isGameActiveRef.current) {
              let fresh = coordinatorRef.current.pop();
              if (!fresh) {
                if (typeof window !== 'undefined' && window.logSystemEvent) {
                  window.logSystemEvent(
                    'Queue cạn đạn lúc Resume Game Nối Ô',
                    'Kích hoạt Hard Fallback'
                  );
                }
                safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
                const safeLevelString = getSafeLevelString(
                  configRef.current?.level || level,
                  langRef.current === 'zh' ? 'zh_level_1' : 'en_level_4'
                );
                fresh = FallbackDataEngine
                  ? FallbackDataEngine.getGameReadyFallback(
                      'match',
                      langRef.current,
                      safeLevelString,
                      {
                        difficulty: diffRef.current,
                        dataMode: configRef.current?.dataMode
                      }
                    )
                  : null;
              }
              if (fresh) {
                applyMatchData(fresh);
              } else {
                safeShowToast('Lỗi tải dữ liệu. Buộc kết thúc.', 'error');
                setIsGenerating(false);
                if (onEndGame) onEndGame(savedState.gameStats || { correct: 0, wrong: 0 });
              }
            }
          });
        }
      } else {
        startMatch();
      }
    }, 0);

    return () => {
      clearTimeout(initTimer);
      isGameActiveRef.current = false;
      if (coordinatorRef.current) coordinatorRef.current.destroy();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [savedState, fetchTask, applyMatchData, startMatch, safeShowToast, level, onEndGame]);

  // Đồng hồ đếm ngược thời gian làm bài mỗi vòng
  useEffect(() => {
    if (!effectiveTimerMode || matchState.isChecked || isPaused || isLoading || isGenerating) {
      return;
    }
    if (timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    } else {
      timerRef.current = setTimeout(() => checkMatch(true), 0);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, effectiveTimerMode, matchState.isChecked, isPaused, isLoading, isGenerating, checkMatch]);

  // Đồng hồ đếm ngược 10s xem kết quả trước khi tự qua vòng mới
  useEffect(() => {
    if (isPaused || isGenerating) return;
    let id = null;
    if (matchState.isChecked && matchState.timer > 0 && !matchState.isResultPaused) {
      id = setTimeout(
        () => setMatchState((p) => ({ ...p, timer: p.timer - 1 })),
        1000
      );
    } else if (matchState.isChecked && matchState.timer === 0 && !matchState.isResultPaused) {
      id = setTimeout(() => generateMatch(), 0);
    }
    return () => {
      if (id) clearTimeout(id);
    };
  }, [
    matchState.isChecked,
    matchState.timer,
    isPaused,
    matchState.isResultPaused,
    isGenerating,
    generateMatch
  ]);

  const toggleResultPause = useCallback(() => {
    setMatchState((p) => ({ ...p, isResultPaused: !p.isResultPaused }));
  }, []);

  // Xử lý click nối ô Trái - Phải
  const handleMatchClick = useCallback(
    (side, id) => {
      if (matchState.isChecked || isPaused) return;
      playGameSFX('click', isMuted);

      if (side === 'left') {
        const existingRight = matchState.connections[id];
        if (existingRight !== undefined) {
          const newConn = { ...matchState.connections };
          delete newConn[id];
          setMatchState((p) => ({ ...p, connections: newConn, selectedLeft: id }));
        } else {
          setMatchState((p) => ({ ...p, selectedLeft: id }));
        }
      } else {
        if (matchState.selectedLeft !== null) {
          const currentLeft = Object.keys(matchState.connections).find(
            (key) => matchState.connections[key] === id
          );
          const newConn = { ...matchState.connections };
          if (currentLeft) delete newConn[currentLeft];
          newConn[matchState.selectedLeft] = id;
          setMatchState((p) => ({ ...p, connections: newConn, selectedLeft: null }));
        }
      }
    },
    [matchState.isChecked, matchState.connections, matchState.selectedLeft, isPaused, isMuted]
  );

  const totalPlayed = gameStats.correct + gameStats.wrong;
  const accuracy = totalPlayed > 0 ? Math.round((gameStats.correct / totalPlayed) * 100) : 0;

  return (
    <MatchPlayScreen
      t={t}
      mainColor={mainColor}
      isLoading={isLoading}
      isPaused={isPaused}
      onPause={onPause}
      handleSaveAndBack={handleSaveAndBack}
      onEndGame={onEndGame}
      timerMode={effectiveTimerMode}
      timeLeft={timeLeft}
      timeLimit={effectiveTimeLimit}
      gameStats={gameStats}
      accuracy={accuracy}
      difficulty={difficulty}
      isAiMode={isAiMode}
      matchState={matchState}
      settings={settings}
      notebook={notebook}
      onBookmark={onBookmark}
      handleMatchClick={handleMatchClick}
      checkMatch={checkMatch}
      generateMatch={generateMatch}
      toggleResultPause={toggleResultPause}
      isGenerating={isGenerating}
      aiCountdown={0}
      config={{ sourceMode, level: config?.level || level }}
      queueLength={queueLength}
      aiWaitTime={aiWaitTime}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.MatchGame = MatchGame;
  window.Block5_1_MatchGame = MatchGame;
  window.Block5_2_MatchGame = MatchGame;
}

export default MatchGame;