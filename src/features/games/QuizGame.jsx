// ============================================================================
// FILE 57/85: src/features/games/QuizGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.6 - Quiz Logic V1.50)
// NHIỆM VỤ: Động cơ xử lý Logic, Quản lý dữ liệu, Trạm gác Độc bản 2 chiều
//           (Online + Offline), Âm thanh tuần tự và Timer cho Game Trắc Nghiệm.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { fillCardWithAi } from '@/services/geminiApi';
import { getGrammarTopics } from '@/engines/microPrompts';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import {
  getSafeLevelString,
  applyAntiStreakShuffle,
  getConfiguredUiCooldown,
  mergePendingAmmoToDeck
} from './common/gameHelpers';
import { GamePlayScreen } from './QuizUI';

export const QuizGame = ({
  cards = [],
  t,
  mainColor = 'blue',
  lang = 'en',
  timerMode = false,
  listenMode = false,
  isAiMode = false,
  timeLimit = 30,
  hardMode = false,
  onPlay,
  onBookmark,
  notebook = [],
  showToast,
  onLogWrong,
  onMissingKey,
  onBack,
  onEndGame,
  savedState,
  settings,
  onAutoSave,
  level,
  onSaveToHarvest,
  config,
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag,
  onUpdateCards
}) => {
  // Wrapper an toàn bảo vệ hệ thống Toast Toàn cục
  const safeShowToast = useCallback(
    (msg, type = 'success') => {
      if (showToast) {
        showToast({ text: msg, type: type, id: Date.now() });
      } else if (typeof window !== 'undefined' && window.globalShowToast) {
        window.globalShowToast(msg, type);
      }
    },
    [showToast]
  );

  // Đọc cấu hình từ LocalStorage & Props
  const [askMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fc_quiz_config'))?.askMode || config?.askMode || 'term';
    } catch {
      return config?.askMode || 'term';
    }
  });

  const [showPronun] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fc_quiz_config'))?.showPronun || config?.showPronun || false;
    } catch {
      return config?.showPronun || false;
    }
  });

  const [autoReadAnswer] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fc_quiz_config'))?.autoReadAnswer || config?.autoReadAnswer || false;
    } catch {
      return config?.autoReadAnswer || false;
    }
  });

  const [sourceMode] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fc_quiz_config'))?.sourceMode || config?.sourceMode || 'card';
    } catch {
      return config?.sourceMode || 'card';
    }
  });

  const [dataMode] = useState(() => config?.dataMode || 'vocab');

  // Khởi tạo State thông minh từ savedState để tránh cascading renders trong useEffect
  const [gameMode, setGameMode] = useState(() => {
    if (savedState?.currentQuestionData) {
      return savedState.gameMode || (listenMode ? 'listen' : 'read');
    }
    return listenMode ? 'listen' : 'read';
  });

  const [currentQuestionData, setCurrentQuestionData] = useState(() => {
    if (savedState?.currentQuestionData && !savedState._needsNextOnResume) {
      return savedState.currentQuestionData;
    }
    return null;
  });

  const [score, setScore] = useState(() => {
    if (savedState?.currentQuestionData) {
      return savedState.stats?.correct || savedState.score || 0;
    }
    return 0;
  });

  const [streak, setStreak] = useState(() => {
    if (savedState?.currentQuestionData) {
      return savedState.streak || 0;
    }
    return 0;
  });

  const [wrongCount, setWrongCount] = useState(() => {
    if (savedState?.currentQuestionData) {
      return savedState.stats?.wrong || savedState.wrongCount || 0;
    }
    return 0;
  });

  const [timeLeft, setTimeLeft] = useState(() => {
    if (savedState?.currentQuestionData && savedState.timeLeft) {
      return savedState.timeLeft;
    }
    return timeLimit || 30;
  });

  const [isRoundStarted, setIsRoundStarted] = useState(!timerMode);
  const [isPaused, setIsPaused] = useState(false);

  const [listenPlayCount, setListenPlayCount] = useState(() => {
    if (savedState?.currentQuestionData && savedState.quizState?.listenPlayCount !== undefined) {
      return savedState.quizState.listenPlayCount;
    }
    return 0;
  });

  const [clickedWrongIndices, setClickedWrongIndices] = useState(() => new Set());
  const [showChanceToast, setShowChanceToast] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [feedbackType, setFeedbackType] = useState(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [hasStartedListening, setHasStartedListening] = useState(false);
  const [isGenerating, setIsGenerating] = useState(() => {
    if (savedState?.currentQuestionData && !savedState._needsNextOnResume) {
      return false;
    }
    return true;
  });

  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);

  // Biến đếm đạn AI và Phanh UI (UI Cooldown)
  const [aiAmmoCount, setAiAmmoCount] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(0);

  const audioTimeoutRef = useRef(null);
  const timerRef = useRef(null);
  const autoNextTimeoutRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const coordinatorRef = useRef(null);
  const deckRef = useRef([]);
  const historyQueueRef = useRef([]);
  const cardsRef = useRef(cards);
  const stateRef = useRef({});
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  const configRef = useRef(config);
  const streakTrackerRef = useRef([]);
  const globalRetryBagRef = useRef(globalRetryBag);

  // Con trỏ cứu hộ tịnh tiến độc lập chống lặp
  const fallbackIndexRef = useRef(Math.floor(Math.random() * 1000000));
  // Cầu dao ngắt luồng Audio Tuần tự
  const audioSequenceAbortRef = useRef(false);

  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    stateRef.current = {
      gameMode,
      score,
      streak,
      wrongCount,
      currentQuestionData,
      timeLeft,
      deck: deckRef.current,
      isAiMode,
      listenPlayCount,
      aiWaitTime
    };
  }, [
    gameMode,
    score,
    streak,
    wrongCount,
    currentQuestionData,
    timeLeft,
    isAiMode,
    listenPlayCount,
    aiWaitTime
  ]);

  // Hàm trích xuất Level an toàn chống lỗi Multi-select
  const resolveLevelString = useCallback(
    (defaultLevel = 'level_4_discovery_basic') => {
      return getSafeLevelString(configRef.current?.level || level, defaultLevel);
    },
    [level]
  );

  // ============================================================================
  // HÀM TRIGGER AUTO SAVE
  // ============================================================================
  const triggerAutoSave = useCallback(() => {
    if (
      isGameActiveRef.current &&
      onAutoSave &&
      stateRef.current &&
      stateRef.current.currentQuestionData
    ) {
      const currentData = stateRef.current;
      const mergedDeck = mergePendingAmmoToDeck(coordinatorRef.current, currentData.deck);

      const sessionData = {
        quizState: {
          currentCard: currentData.currentQuestionData?.question || null,
          options: currentData.currentQuestionData?.options || [],
          userAnswer: null,
          isCorrect: null,
          listenPlayCount: currentData.listenPlayCount,
          aiWaitTime: currentData.aiWaitTime
        },
        stats: { correct: currentData.score, wrong: currentData.wrongCount },
        difficulty: hardMode ? 'hard' : 'easy',
        deck: mergedDeck,
        timeLeft: currentData.timeLeft,
        gameMode: currentData.gameMode,
        streak: currentData.streak,
        currentQuestionData: currentData.currentQuestionData,
        _needsNextOnResume: false
      };
      onAutoSave(sessionData);
    }
  }, [onAutoSave, hardMode]);

  useEffect(() => {
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
    return () => {
      clearInterval(intervalTimer);
      triggerAutoSave();
    };
  }, [triggerAutoSave]);

  // ============================================================================
  // ĐỒNG HỒ QUÉT ĐẠN & PHANH UI
  // ============================================================================
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (
        coordinatorRef.current &&
        typeof coordinatorRef.current.getPendingItems === 'function'
      ) {
        const pending = coordinatorRef.current.getPendingItems();
        const realAiCount = pending.filter((item) => item && item.isAiGenerated).length;
        setAiAmmoCount(realAiCount);
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

  const applyAntiStreak = useCallback((data) => {
    if (data && Array.isArray(data.options)) {
      return {
        ...data,
        options: applyAntiStreakShuffle(data.options, streakTrackerRef)
      };
    }
    return data;
  }, []);

  const localPushToRetryBag = useCallback(
    (question) => {
      if (addToRetryBag) addToRetryBag('quiz', question);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (term) => {
      if (removeFromRetryBag) removeFromRetryBag('quiz', term);
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const mistakeCard = {
        ...question,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'mistake',
        tags: ['quiz', hardMode ? 'hard' : 'easy', gameMode, sourceMode],
        timestamp: Date.now()
      };
      onLogWrong(mistakeCard);
    },
    [onLogWrong, hardMode, gameMode, sourceMode]
  );

  // ============================================================================
  // ĐỘNG CƠ CỨU HỘ JIT ĐỊNH TUYẾN ĐA NGUỒN
  // ============================================================================
  const getEmergencyQuizFallback = useCallback(() => {
    const randomIndex = fallbackIndexRef.current++;
    const meta = {
      id: `quiz_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'quiz',
      level: resolveLevelString(),
      topic: configRef.current?.topic || '',
      dataMode: configRef.current?.dataMode || dataMode || 'vocab',
      difficulty: hardMode ? 'hard' : 'easy',
      askMode: askMode,
      lang: lang,
      mode: 'minigame'
    };

    const localDeck = Utils.safeJsonParse('fc_data_' + lang, []);
    let fallbackFormatted = null;

    if (ExamEngine && typeof ExamEngine.getEmergencyFallback === 'function') {
      const fbRaw = ExamEngine.getEmergencyFallback(meta, localDeck, randomIndex);
      if (fbRaw && fbRaw.content) {
        fallbackFormatted = {
          question: fbRaw.content,
          options: fbRaw.content.options || [],
          isAiGenerated: false,
          _isRescued: true
        };
      }
    }

    if (!fallbackFormatted) {
      const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
      fallbackFormatted =
        FallbackDataEngine && typeof FallbackDataEngine.getGameReadyFallback === 'function'
          ? FallbackDataEngine.getGameReadyFallback('quiz', safeLang, resolveLevelString(), {
              isReverse: askMode === 'def'
            })
          : null;
    }

    if (!fallbackFormatted) {
      fallbackFormatted = {
        question: {
          term: 'Lỗi đường truyền',
          definition: 'Không thể kết xuất dữ liệu an toàn'
        },
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
          { text: 'C', isCorrect: false },
          { text: 'D', isCorrect: false }
        ],
        isAiGenerated: false,
        _isRescued: true
      };
    }

    return fallbackFormatted;
  }, [resolveLevelString, dataMode, hardMode, askMode, lang]);

  // ============================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE)
  // ============================================================================
  async function fetchTask() {
    let card = null;
    const currentApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    let activeGrammarId = null;

    const currentLevelStr = resolveLevelString();
    const currentAskMode = configRef.current?.askMode || askMode;
    const canUseGrammar = currentAskMode === 'def' && sourceMode === 'ai_pure';

    if (canUseGrammar && configRef.current && configRef.current.grammarFocus) {
      if (configRef.current.grammarFocus === 'random') {
        const availableTopics =
          typeof getGrammarTopics === 'function'
            ? getGrammarTopics('quiz', lang, currentLevelStr)
            : [];
        if (availableTopics && availableTopics.length > 0) {
          const nonGeneral = availableTopics.filter((topic) => !topic.id.startsWith('general_'));
          const poolToUse = nonGeneral.length > 0 ? nonGeneral : availableTopics;
          activeGrammarId = poolToUse[Math.floor(Math.random() * poolToUse.length)].id;
        }
      } else {
        activeGrammarId = configRef.current.grammarFocus;
      }
    }

    if (typeof pullRetryCardWithLock === 'function') {
      card = pullRetryCardWithLock('quiz', globalRetryBagRef.current, lang);
    }

    if (sourceMode === 'ai_pure' && !card) {
      if (!currentApiKey) {
        if (onMissingKey) onMissingKey();
        console.warn('Quiz PureMode: Missing API Key, falling back to offline data.');
      } else {
        try {
          const meta = {
            id: `quiz_${Date.now()}`,
            type: 'quiz',
            level: resolveLevelString(),
            topic: configRef.current?.topic || '',
            dataMode: configRef.current?.dataMode || dataMode || 'vocab',
            difficulty: hardMode ? 'hard' : 'easy',
            hardMode: hardMode,
            askMode: askMode,
            mode: 'minigame',
            grammarId: activeGrammarId
          };
          const freshHistory = Utils.safeJsonParse('fc_ai_memory', []);
          const qData = await ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory);
          if (qData && qData.content) {
            if (onSaveToHarvest) {
              onSaveToHarvest(
                meta.level,
                {
                  term: qData.content.question?.term,
                  definition: qData.content.question?.definition,
                  options: qData.content.options
                },
                'ioe_multiple_choice'
              );
            }
            return qData.content;
          }
        } catch (e) {
          console.warn('PureMode Forge Error:', e);
          if (typeof window !== 'undefined' && window.logSystemEvent) {
            window.logSystemEvent('Lỗi API/Parse Lò đúc Quiz AI', e);
          }
          throw e;
        }
      }
    }

    if (!card) {
      if (deckRef.current.length === 0 && sourceMode !== 'ai_pure') {
        let validCards = (cardsRef.current || []).filter(
          (c) => c.term && c.term.trim() !== ''
        );
        if (validCards.length < 4 && FallbackDataEngine) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = configRef.current?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const safeLevel = resolveLevelString(
            safeLang === 'zh' ? 'zh_level_1' : 'en_level_1'
          );
          const fbItems = FallbackDataEngine.getFallbackData(safeLang, mode, safeLevel, 20);
          if (fbItems && fbItems.length > 0) {
            const existingTerms = new Set(validCards.map((c) => c.term));
            const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
            validCards = [...validCards, ...newFbs];
          }
        }
        deckRef.current = Utils.shuffleArray(validCards);
      }
      const nextCard = deckRef.current.shift();
      card = nextCard ? { ...nextCard } : null;
    }

    if (card && currentAskMode !== 'def') {
      delete card.grammar_type;
    }

    if (
      card &&
      sourceMode === 'card' &&
      isAiMode &&
      currentApiKey &&
      (!card.definition || card.definition.trim() === '')
    ) {
      try {
        const enrichedData = await fillCardWithAi(card.term, lang, currentApiKey, ['definition']);
        if (enrichedData && enrichedData.definition) {
          card.definition = enrichedData.definition;
          if (onUpdateCards) onUpdateCards([card]);
        }
      } catch (enrichError) {
        console.warn('[JIT Enrich] Lỗi khi dịch ngầm thẻ:', enrichError);
        card.definition = card.term;
      }
    }

    if (!card || !card.term) {
      throw new Error('Từ chối nạp đạn khuyết tật vào hàng đợi.');
    }

    if (historyQueueRef.current) {
      if (!historyQueueRef.current.includes(card.term)) {
        historyQueueRef.current.push(card.term);
        if (historyQueueRef.current.length > 400) historyQueueRef.current.shift();
        try {
          localStorage.setItem('fc_ai_memory', JSON.stringify(historyQueueRef.current));
        } catch (e) {
          console.warn('Save memory failed:', e);
        }
      }
    }

    let distractors = [];
    let isAiGenerated = card.isAiGenerated || false;
    const numOptions = 4;
    const isReverse = askMode === 'def';
    const isSentenceMode = configRef.current?.dataMode === 'sentence';
    const type = isSentenceMode ? 'sentence' : 'word';

    // [V1.47] Khởi tạo Đáp án Đúng kèm Bản dịch
    const correctOptText = isReverse
      ? isSentenceMode
        ? card.displaySentence || card.term
        : card.term
      : card.definition || card.term;
    const correctOptMeaning = isReverse
      ? card.definition || ''
      : isSentenceMode
      ? card.displaySentence || card.term
      : card.term;

    const correctOpt = {
      text: correctOptText,
      meaning: correctOptMeaning,
      isCorrect: true
    };

    try {
      if (
        hardMode &&
        isAiMode &&
        currentApiKey &&
        GameAlgoEngine &&
        GameAlgoEngine.OptionsEngine?.ai_generateOptions
      ) {
        try {
          const distractorLang = isReverse ? lang : 'vi';
          let dynamicTimeout = 25000;
          try {
            const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config'));
            if (aiCfg && aiCfg.loadingTime) {
              dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
            }
          } catch (e) {
            console.warn('Read ai_config failed:', e);
          }

          const aiCallPromise = GameAlgoEngine.OptionsEngine.ai_generateOptions(
            card,
            distractorLang,
            type,
            currentApiKey,
            numOptions - 1,
            resolveLevelString(),
            configRef.current?.topic,
            isReverse
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI Timeout')), dynamicTimeout)
          );
          const dists = await Promise.race([aiCallPromise, timeoutPromise]);

          if (dists && dists.length > 0) {
            distractors = dists.map((d) => {
              if (typeof d === 'object' && d !== null && d.text) {
                return { text: d.text, meaning: d.meaning, isCorrect: false };
              }
              return { text: typeof d === 'string' ? d : String(d), isCorrect: false };
            });
            isAiGenerated = true;
            const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
            localStorage.setItem('fc_total_tokens', String(currentTotal + 150));
          }
        } catch (aiError) {
          console.warn('AI Quiz Preload Fallback:', aiError.message);
        }
      }
    } catch (e) {
      console.warn('Fetch Options Error:', e);
    }

    // ==========================================================================
    // [V1.50] CHỐT CHẶN ĐỘC BẢN 2 CHIỀU CẤP ĐỘ TÍCH HỢP (Integration 2D Gatekeeper)
    // ==========================================================================
    const textSet = new Set([(correctOpt.text || '').toLowerCase().trim()]);
    const meaningSet = new Set([(correctOpt.meaning || '').toLowerCase().trim()]);
    const validDistractors = [];

    for (const d of distractors) {
      const tLower = d.text ? d.text.toLowerCase().trim() : '';
      const mLower = d.meaning ? d.meaning.toLowerCase().trim() : '';

      if (!tLower || textSet.has(tLower) || (mLower && meaningSet.has(mLower))) {
        console.warn(
          '[Integration Gatekeeper] Đã chém bỏ bẫy trùng lặp từ AI:',
          d.text,
          '|',
          d.meaning
        );
        continue;
      }

      textSet.add(tLower);
      if (mLower) meaningSet.add(mLower);
      validDistractors.push(d);
    }

    distractors = validDistractors;

    // ==========================================================================
    // [V1.50] ĐỘNG CƠ FALLBACK TỔNG KHO VÀ BÙ ĐẮP LIÊN HOÀN (Continuous Padding)
    // ==========================================================================
    if (distractors.length < numOptions - 1) {
      const needed = numOptions - 1 - distractors.length;
      let offlineDists = [];

      if (GameAlgoEngine && GameAlgoEngine.OptionsEngine?.offline_generateOptions) {
        offlineDists = GameAlgoEngine.OptionsEngine.offline_generateOptions(
          correctOptText,
          cardsRef.current || [],
          lang,
          type,
          needed + 2,
          isReverse,
          hardMode
        );
      }

      // Trình Dò tìm Semantic (Dò tìm thẻ gốc để khôi phục bản dịch)
      const lookupCard = (targetText) => {
        const checkCard = (c) => {
          if (!c) return false;
          const cTerm = isSentenceMode ? c.displaySentence || c.term : c.term;
          return isReverse ? cTerm === targetText : c.definition === targetText;
        };

        let found = (cardsRef.current || []).find(checkCard);
        if (found) return found;

        try {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const masterPool = Utils.safeJsonParse('fc_data_' + safeLang, []);
          found = masterPool.find(checkCard);
          if (found) return found;
        } catch (e) {
          console.warn('Master pool lookup error:', e);
        }

        if (FallbackDataEngine && typeof FallbackDataEngine.getFallbackData === 'function') {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            isSentenceMode ? 'sentence' : 'vocab',
            'en_level_1',
            20
          );
          found = (fbItems || []).find(checkCard);
          if (found) return found;
        }
        return null;
      };

      for (const distText of offlineDists) {
        if (distractors.length >= numOptions - 1) break;

        const foundCard = lookupCard(distText);
        let optMeaning = '';
        if (foundCard) {
          optMeaning = isReverse
            ? foundCard.definition
            : isSentenceMode
            ? foundCard.displaySentence || foundCard.term
            : foundCard.term;
        }

        const tLower = distText.toLowerCase().trim();
        const mLower = optMeaning ? optMeaning.toLowerCase().trim() : '';

        if (!textSet.has(tLower) && (!mLower || !meaningSet.has(mLower))) {
          distractors.push({
            text: distText,
            meaning: optMeaning || '',
            isCorrect: false
          });
          textSet.add(tLower);
          if (mLower) meaningSet.add(mLower);
        }
      }
    }

    while (distractors.length < numOptions - 1) {
      distractors.push({
        text: `${correctOptText} ${distractors.length + 1}`,
        isCorrect: false
      });
    }

    distractors = Utils.shuffleArray(distractors.slice(0, numOptions - 1));
    const correctPos = Math.floor(Math.random() * (distractors.length + 1));
    const finalOptions = [...distractors];
    finalOptions.splice(correctPos, 0, correctOpt);

    return { question: card, options: finalOptions, isAiGenerated };
  }

  // ============================================================================
  // ĐỘNG CƠ ÂM THANH TUẦN TỰ (SEQUENTIAL AUDIO ENGINE)
  // ============================================================================
  const cleanupTimers = useCallback(() => {
    audioSequenceAbortRef.current = true;
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (autoNextTimeoutRef.current) clearTimeout(autoNextTimeoutRef.current);
  }, []);

  const triggerAudio = useCallback(
    (qData = currentQuestionData, delay = 0, isManual = false) => {
      if (!qData || !isGameActiveRef.current) return;

      if (isManual && gameMode === 'listen' && hardMode && !timerMode) {
        if (listenPlayCount >= 2) {
          safeShowToast('Đã hết 2 lượt nghe! Chấp nhận sai để xem đáp án.', 'warning');
          return;
        }
        setListenPlayCount((prev) => prev + 1);
      }

      audioSequenceAbortRef.current = true;
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);

      async function playFn() {
        if (!isGameActiveRef.current) return;
        audioSequenceAbortRef.current = false;
        setHasStartedListening(true);
        setIsAudioPlaying(true);

        const isReverseListen = gameMode === 'listen' && askMode === 'def';
        if (isReverseListen) {
          const labels = ['A', 'B', 'C', 'D', 'E'];
          const options = qData.options || [];
          for (let i = 0; i < options.length; i++) {
            if (audioSequenceAbortRef.current) break;
            await new Promise((resolve) => {
              if (audioSequenceAbortRef.current) return resolve();
              if (onPlay) onPlay(labels[i], null, null, () => resolve());
              else resolve();
            });
            if (audioSequenceAbortRef.current) break;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            if (audioSequenceAbortRef.current) break;
            await new Promise((resolve) => {
              if (audioSequenceAbortRef.current) return resolve();
              if (onPlay) onPlay(options[i].text, null, null, () => resolve());
              else resolve();
            });
            if (audioSequenceAbortRef.current) break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } else {
          const isSentenceMode = configRef.current?.dataMode === 'sentence';
          const textToPlay =
            isSentenceMode && qData.question?.displaySentence
              ? qData.question.displaySentence
              : qData.question?.term || '';

          await new Promise((resolve) => {
            if (audioSequenceAbortRef.current) return resolve();
            if (onPlay) onPlay(textToPlay, null, null, () => resolve());
            else resolve();
          });
        }

        if (isGameActiveRef.current && !audioSequenceAbortRef.current) {
          setIsAudioPlaying(false);
        }
      }

      if (delay > 0) {
        audioTimeoutRef.current = setTimeout(playFn, delay);
      } else {
        playFn();
      }
    },
    [currentQuestionData, gameMode, hardMode, timerMode, listenPlayCount, safeShowToast, askMode, onPlay]
  );

  // ============================================================================
  // KHỞI ĐỘNG & CHUYỂN VÒNG CHƠI
  // ============================================================================
  async function handleStartGame() {
    if (sourceMode === 'card' && (!cardsRef.current || cardsRef.current.length < 2)) return;
    setIsGenerating(true);
    setListenPlayCount(0);
    isInitializingRef.current = true;
    aiGeneratedCountRef.current = 0;
    streakTrackerRef.current = [];

    const currentDeck = sourceMode === 'card' ? [...(cardsRef.current || [])] : [];
    if (sourceMode === 'card') {
      let validCards = currentDeck.filter((c) => c.term && c.term.trim() !== '');
      if (validCards.length < 4) {
        safeShowToast('Bộ thẻ không đủ 4 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...', 'warning');
        if (FallbackDataEngine && typeof FallbackDataEngine.getFallbackData === 'function') {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const mode = configRef.current?.dataMode === 'sentence' ? 'sentence' : 'vocab';
          const safeLevel = resolveLevelString(
            safeLang === 'zh' ? 'zh_level_1' : 'en_level_1'
          );
          const fbItems = FallbackDataEngine.getFallbackData(safeLang, mode, safeLevel, 20);
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
    if (QueueEngine && typeof QueueEngine.createQueueCoordinator === 'function') {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
    } else {
      safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine (Block 2.5)', 'error');
      return;
    }

    const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
    try {
      await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);
    } catch (queueErr) {
      console.warn('[Safe Fallback] Timeout hoặc lỗi nạp đạn AI khi khởi tạo:', queueErr);
    }

    let firstData = coordinatorRef.current.pop();
    if (!firstData) {
      safeShowToast('Máy chủ bận, đã kích hoạt dữ liệu dự phòng!', 'warning');
      firstData = getEmergencyQuizFallback();
    }

    if (isGameActiveRef.current && firstData) {
      const processedFirst = applyAntiStreak(firstData);
      setCurrentQuestionData(processedFirst);
      setIsGenerating(false);
      isInitializingRef.current = false;
      setAiWaitTime(0);
      if (gameMode === 'listen') triggerAudio(processedFirst, 600);
      setTimeout(() => triggerAutoSave(), 150);
    } else if (isGameActiveRef.current) {
      safeShowToast('Lỗi nghiêm trọng khi tải dữ liệu. Buộc kết thúc.', 'error');
      setIsGenerating(false);
      isInitializingRef.current = false;
      if (onEndGame) onEndGame({ correct: score, wrong: wrongCount });
    }
  }

  // Khởi tạo hoặc Khôi phục phiên chơi (bất đồng bộ để đạt 0 Problems)
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const initTimer = setTimeout(() => {
      if (savedState && savedState.currentQuestionData) {
        if (savedState.deck) {
          deckRef.current = [...savedState.deck];
        }
        if (coordinatorRef.current) coordinatorRef.current.destroy();
        if (QueueEngine && typeof QueueEngine.createQueueCoordinator === 'function') {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
          const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
          coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack).catch((err) => {
            console.warn('Background maintain error:', err);
          });
        }

        if (savedState._needsNextOnResume && coordinatorRef.current) {
          const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
          coordinatorRef.current
            .maintain(false, 22000, isOfflineFastTrack)
            .then(() => {
              if (isGameActiveRef.current) {
                let qData = coordinatorRef.current.pop();
                if (!qData) {
                  safeShowToast('Máy chủ bận, kích hoạt dự phòng!', 'warning');
                  qData = getEmergencyQuizFallback();
                }
                if (qData) {
                  const processed = applyAntiStreak(qData);
                  setCurrentQuestionData(processed);
                  setIsGenerating(false);
                  if (savedState.gameMode === 'listen' && !timerMode) {
                    triggerAudio(processed, 600);
                  }
                  setAiWaitTime(0);
                } else {
                  setIsGenerating(false);
                  if (onEndGame) {
                    onEndGame({
                      correct: savedState.stats?.correct || 0,
                      wrong: savedState.stats?.wrong || 0
                    });
                  }
                }
              }
            })
            .catch(() => {
              if (isGameActiveRef.current) {
                const qData = getEmergencyQuizFallback();
                if (qData) {
                  setCurrentQuestionData(applyAntiStreak(qData));
                  setIsGenerating(false);
                }
              }
            });
        }
      } else {
        handleStartGame();
      }
    }, 0);

    return () => {
      clearTimeout(initTimer);
      isGameActiveRef.current = false;
      cleanupTimers();
      if (coordinatorRef.current) coordinatorRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    if (isPaused) {
      cleanupTimers();
    }
  }, [isPaused, cleanupTimers]);

  async function handleNext() {
    if (!isGameActiveRef.current || isGenerating) return;
    cleanupTimers();
    setSelectedOptionIndex(null);
    setIsChecking(false);
    setFeedbackType(null);
    setClickedWrongIndices(new Set());
    setShowChanceToast(false);
    setIsAudioPlaying(false);
    setHasStartedListening(false);
    setTimeLeft(timeLimit);
    setListenPlayCount(0);
    setResultTimer(0);
    setIsResultPaused(false);

    try {
      if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
        const qData = coordinatorRef.current.pop();
        const processed = applyAntiStreak(qData);
        setCurrentQuestionData(processed);
        if (gameMode === 'listen' && !timerMode) triggerAudio(processed, 600);
        setAiWaitTime(0);
        setTimeout(() => triggerAutoSave(), 150);
      } else if (coordinatorRef.current) {
        setIsGenerating(true);
        const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
        coordinatorRef.current
          .maintain(false, 22000, isOfflineFastTrack)
          .then(() => {
            if (isGameActiveRef.current) {
              let qData = coordinatorRef.current.pop();
              if (!qData) {
                safeShowToast('Máy chủ bận, kích hoạt dự phòng!', 'warning');
                qData = getEmergencyQuizFallback();
              }
              if (qData) {
                const processed = applyAntiStreak(qData);
                setCurrentQuestionData(processed);
                setIsGenerating(false);
                if (gameMode === 'listen' && !timerMode) triggerAudio(processed, 600);
                setAiWaitTime(0);
              } else {
                safeShowToast('Lỗi tải dữ liệu. Buộc kết thúc.', 'error');
                setIsGenerating(false);
                if (onEndGame) onEndGame({ correct: score, wrong: wrongCount });
              }
              setTimeout(() => triggerAutoSave(), 150);
            }
          })
          .catch(() => {
            if (isGameActiveRef.current) {
              const qData = getEmergencyQuizFallback();
              if (qData) {
                const processed = applyAntiStreak(qData);
                setCurrentQuestionData(processed);
                setIsGenerating(false);
                if (gameMode === 'listen' && !timerMode) triggerAudio(processed, 600);
                setAiWaitTime(0);
              }
              setTimeout(() => triggerAutoSave(), 150);
            }
          });
      }
    } catch (err) {
      console.error('Next Round Critical Error:', err);
      setIsGenerating(false);
    }
  }

  // Đồng hồ đếm ngược chờ chuyển câu sau khi trả lời
  useEffect(() => {
    if (feedbackType && resultTimer > 0 && !isPaused && !isResultPaused && !isGenerating) {
      const id = setTimeout(() => setResultTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(id);
    } else if (feedbackType && resultTimer === 0 && !isPaused && !isResultPaused && !isGenerating) {
      const id = setTimeout(() => handleNext(), 0);
      return () => clearTimeout(id);
    }
  }, [feedbackType, resultTimer, isPaused, isResultPaused, isGenerating]);

  const handleAnswer = (index, isCorrect, isTimeout = false, isForceReveal = false) => {
    if (isChecking) return;
    cleanupTimers();

    const isSentenceMode = configRef.current?.dataMode === 'sentence';
    const textToPlay =
      isSentenceMode && currentQuestionData?.question?.displaySentence
        ? currentQuestionData.question.displaySentence
        : currentQuestionData?.question?.term || '';

    const proceedToNext = (defaultDelayMs) => {
      if (isGameActiveRef.current) {
        let delaySec = Math.ceil(defaultDelayMs / 1000);
        if (isAiMode) {
          delaySec = getConfiguredUiCooldown(9);
        }
        if (delaySec < 1) delaySec = 1;
        setResultTimer(delaySec);
      }
    };

    if (isTimeout) {
      setResultTimer(-1);
      localPushToRetryBag(currentQuestionData?.question);
      setIsChecking(true);
      setFeedbackType('timeout');
      setStreak(0);
      setWrongCount((w) => w + 1);
      logMistake(currentQuestionData?.question);
      proceedToNext(1000);
      setTimeout(() => triggerAutoSave(), 150);
      return;
    }

    if (isForceReveal) {
      setResultTimer(-1);
      localPushToRetryBag(currentQuestionData?.question);
      setIsChecking(true);
      setSelectedOptionIndex(999);
      setFeedbackType('wrong');
      setStreak(0);
      setWrongCount((w) => w + 1);
      logMistake(currentQuestionData?.question);
      proceedToNext(1000);
      setTimeout(() => triggerAutoSave(), 150);
      return;
    }

    if (isCorrect) {
      setResultTimer(-1);
      if (clickedWrongIndices.size === 0 && currentQuestionData?.question?.term) {
        localRemoveFromRetryBag(currentQuestionData.question.term);
      }
      setIsChecking(true);
      setSelectedOptionIndex(index);
      setFeedbackType('correct');
      setScore((s) => s + 1);
      setStreak((s) => s + 1);

      if (autoReadAnswer && onPlay) {
        let finished = false;
        const safetyFallback = setTimeout(() => {
          if (!finished) {
            finished = true;
            proceedToNext(1000);
          }
        }, 8000);
        onPlay(textToPlay, null, null, () => {
          if (!finished) {
            finished = true;
            clearTimeout(safetyFallback);
            proceedToNext(1000);
          }
        });
      } else {
        proceedToNext(1000);
      }
    } else {
      if (!clickedWrongIndices.has(index)) {
        const newWrong = new Set(clickedWrongIndices).add(index);
        setClickedWrongIndices(newWrong);
        const isSuddenDeath = configRef.current?.suddenDeath || false;
        if (!isSuddenDeath && newWrong.size === 1) {
          setShowChanceToast(true);
          setTimeout(() => setShowChanceToast(false), 2000);
          return;
        }
      }

      setResultTimer(-1);
      localPushToRetryBag(currentQuestionData?.question);
      setIsChecking(true);
      setSelectedOptionIndex(index);
      setFeedbackType('wrong');
      setStreak(0);
      setWrongCount((w) => w + 1);
      logMistake(currentQuestionData?.question);

      if (autoReadAnswer && onPlay) {
        let finished = false;
        const safetyFallback = setTimeout(() => {
          if (!finished) {
            finished = true;
            proceedToNext(1000);
          }
        }, 8000);
        onPlay(textToPlay, null, null, () => {
          if (!finished) {
            finished = true;
            clearTimeout(safetyFallback);
            proceedToNext(1000);
          }
        });
      } else {
        proceedToNext(1000);
      }
    }

    setTimeout(() => triggerAutoSave(), 150);
  };

  // Đồng hồ đếm ngược thời gian mỗi câu
  useEffect(() => {
    if (
      !isPaused &&
      timerMode &&
      isRoundStarted &&
      !isChecking &&
      !isGenerating &&
      currentQuestionData
    ) {
      if (timeLeft > 0) {
        timerRef.current = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
      } else {
        timerRef.current = setTimeout(() => handleAnswer(null, false, true), 0);
      }
    }
    return () => clearTimeout(timerRef.current);
  }, [
    timeLeft,
    isPaused,
    timerMode,
    isRoundStarted,
    isChecking,
    isGenerating,
    currentQuestionData
  ]);

  const handleSaveAndBack = () => {
    cleanupTimers();
    isGameActiveRef.current = false;
    const currentData = stateRef.current;
    let finalWrongCount = currentData.wrongCount;
    let finalStreak = currentData.streak;
    let needsNext = false;

    if (!isChecking && currentData.currentQuestionData) {
      localPushToRetryBag(currentData.currentQuestionData.question);
      logMistake(currentData.currentQuestionData.question);
      finalWrongCount += 1;
      finalStreak = 0;
      needsNext = true;
      setWrongCount(finalWrongCount);
      setStreak(0);
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const mergedDeck = mergePendingAmmoToDeck(coordinatorRef.current, currentData.deck);
    const sessionData = JSON.parse(
      JSON.stringify({
        quizState: {
          currentCard: currentData.currentQuestionData?.question || null,
          options: currentData.currentQuestionData?.options || [],
          userAnswer: null,
          isCorrect: null,
          listenPlayCount: currentData.listenPlayCount,
          aiWaitTime: 0
        },
        stats: { correct: currentData.score, wrong: finalWrongCount },
        difficulty: hardMode ? 'hard' : 'easy',
        deck: mergedDeck,
        timeLeft: currentData.timeLeft,
        gameMode: currentData.gameMode,
        streak: finalStreak,
        currentQuestionData: currentData.currentQuestionData,
        _needsNextOnResume: needsNext
      })
    );

    if (onBack) {
      onBack({ ...sessionData, timerMode, listenMode, hardMode, timeLimit });
    }
  };

  const handleSkip = () => {
    if (isChecking || isGenerating) return;
    cleanupTimers();
    setWrongCount((w) => w + 1);
    setStreak(0);
    safeShowToast('Bỏ qua (+1 sai)', 'warning');
    localPushToRetryBag(currentQuestionData?.question);
    logMistake(currentQuestionData?.question);
    handleNext();
    setTimeout(() => triggerAutoSave(), 150);
  };

  return (
    <GamePlayScreen
      t={t}
      mainColor={mainColor}
      currentQuestionData={currentQuestionData}
      streak={streak}
      correctCount={score}
      wrongCount={wrongCount}
      gameMode={gameMode}
      setGameMode={setGameMode}
      isAudioPlaying={isAudioPlaying}
      playSequence={() => triggerAudio(currentQuestionData, 0, true)}
      onBookmark={onBookmark}
      isInNotebook={notebook?.some((n) => n.term === currentQuestionData?.question?.term)}
      onPlay={onPlay}
      selectedOptionIndex={selectedOptionIndex}
      isChecking={isChecking}
      clickedWrongIndices={clickedWrongIndices}
      hasStartedListening={hasStartedListening}
      handleAnswer={handleAnswer}
      onSkip={handleSkip}
      isAiMode={isAiMode}
      isGenerating={isGenerating}
      showChanceToast={showChanceToast}
      feedbackType={feedbackType}
      timerMode={timerMode}
      timeLeft={timeLeft}
      totalTime={timeLimit}
      isRoundStarted={isRoundStarted}
      onStartRound={() => {
        setIsRoundStarted(true);
        if (gameMode === 'listen') triggerAudio();
      }}
      isPaused={isPaused}
      onPause={() => setIsPaused(!isPaused)}
      onBack={handleSaveAndBack}
      onEndGame={() => {
        isGameActiveRef.current = false;
        if (onEndGame) onEndGame({ correct: score, wrong: wrongCount });
      }}
      settings={settings}
      askMode={askMode}
      showPronun={showPronun}
      hardMode={hardMode}
      listenPlayCount={listenPlayCount}
      sourceMode={sourceMode}
      resultTimer={resultTimer}
      isResultPaused={isResultPaused}
      toggleResultPause={() => setIsResultPaused((p) => !p)}
      config={configRef.current}
      aiWaitTime={aiWaitTime}
      onNext={() => handleNext()}
      aiAmmoCount={aiAmmoCount}
      notebook={notebook}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_6_QuizGame = QuizGame;
  window.QuizGame = QuizGame;
}

export default QuizGame;