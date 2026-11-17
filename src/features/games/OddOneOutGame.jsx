// ============================================================================
// FILE 63/85: src/features/games/OddOneOutGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.13 - OddOneOut Logic & Wrapper V1.14)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Tìm Từ Khác Loại (Odd One Out). Quản lý
//           luồng nạp đạn AI Pure / Hybrid / Offline, chống lặp vị trí đáp án,
//           đồng bộ Auto-Save và kết nối với OddOneOutPlayScreen.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { fillCardWithAi } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { AiFactoryEngine } from '@/engines/aiFactory';
import { ExamEngine } from '@/engines/exam';
import { OddOneOutPlayScreen } from './OddOneOutUI';
import {
  getSafeLevelString,
  applyAntiStreakShuffle,
  extractPendingCardsFromCoordinator,
  getConfiguredUiCooldown
} from './common/gameHelpers';

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (HOOK useOddOneOutLogic)
// ============================================================================
export const useOddOneOutLogic = (cards, config, callbacks) => {
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

  // Bảo vệ chuỗi Level an toàn khỏi mảng Multi-select
  const safeLevel = getSafeLevelString(level, 'level_4_discovery_basic');

  // Khởi tạo trực tiếp từ savedState nếu có phiên chơi đang dở
  const savedSt = savedState?.oddOneOutState || null;
  const needsNextOnResume = Boolean(savedSt?._needsNextOnResume);

  const [currentQuestion, setCurrentQuestion] = useState(() =>
    savedSt && !needsNextOnResume ? savedSt.currentQuestion : null
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
    savedSt && !needsNextOnResume ? savedSt.attempts || 0 : 0
  );
  const [score, setScore] = useState(() => savedSt?.score || 0);
  const [combo, setCombo] = useState(() => savedSt?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => savedSt?.playedCount || 0
  );
  const [time, setTime] = useState(() => savedSt?.time || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => savedSt?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(() => savedSt?.wrongCount || 0);
  const [isGenerating, setIsGenerating] = useState(
    () => !savedSt || needsNextOnResume
  );

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() =>
    savedSt?.timeLeft !== undefined ? savedSt.timeLeft : timeLimit || 15
  );

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedSt?.aiWaitTime !== undefined ? savedSt.aiWaitTime : 0
  );

  // Refs quản lý bất đồng bộ
  const enrichedCardsRef = useRef(cards);
  const historyQueueRef = useRef(
    Utils ? Utils.safeJsonParse('fc_ai_memory', []) : []
  );
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const gameTimerRef = useRef(null);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  const deckRef = useRef([]);

  // Trí nhớ lưu vết vị trí đáp án đúng 2 lượt gần nhất (Chống lặp vị trí)
  const streakTrackerRef = useRef([]);

  // Đồng bộ túi nháp RAM
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

  // Bộ não lưu trữ và Auto-Save
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
      const pendingCards = extractPendingCardsFromCoordinator(
        coordinatorRef.current
      );
      const mergedDeck = [...pendingCards, ...(currentData.deck || [])];

      onAutoSave({
        oddOneOutState: {
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

  // Đồng hồ quét đạn ngầm (500ms)
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

  // Đồng hồ làm nguội UI (UI Cooldown Timer)
  useEffect(() => {
    let cdTimer = null;
    if (aiWaitTime > 0 && !isGenerating && !isResultPaused) {
      cdTimer = setTimeout(() => setAiWaitTime((prev) => prev - 1), 1000);
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // Chống lặp vị trí từ khác loại quá 2 lần liên tiếp
  const applyAntiStreak = useCallback((data) => {
    return applyAntiStreakShuffle(data, streakTrackerRef);
  }, []);

  // Quản lý Túi nháp & Ghi log lỗi sai
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag) addToRetryBag('oddoneout', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck, wordsArray) => {
      if (removeFromRetryBag) {
        removeFromRetryBag('oddoneout', termToCheck, wordsArray);
      }
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const baseData = (question.originCards && question.originCards[0]) || {};
      const mistakeCard = {
        ...baseData,
        id: `mistake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'mistake',
        term: Array.isArray(question.words)
          ? question.words.join(' • ')
          : question.words,
        definition: `Từ khác loại: ${question.oddWord}`,
        analysis: question.explanation,
        example: `Nhóm từ: ${
          Array.isArray(question.words)
            ? question.words.join(', ')
            : question.words
        }`,
        tags: ['oddoneout', safeLevel, sourceMode],
        timestamp: Date.now()
      };
      onLogWrong(mistakeCard);
    },
    [onLogWrong, safeLevel, sourceMode]
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
        oddOneOutState: {
          ...currentData,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [localPushToRetryBag, logMistake, onBack, safeShowToast]);

  // ==========================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE - FETCH TASK)
  // ==========================================================================
  const fetchTask = async () => {
    // 1. Đánh chặn 30%: Bốc từ túi nháp (Sử dụng Khóa Nguyên Tử Tầng 2)
    const puller = Utils?.pullRetryCardWithLock || pullRetryCardWithLock;
    if (puller) {
      const pulledCard = puller('oddoneout', globalRetryBagRef.current, lang);
      if (pulledCard) return pulledCard;
    }

    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey = apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY);
    const canCallAi = isAiMode && currentApiKey;

    // 2. AI PURE MODE: Tự động sinh danh sách 4 từ với 1 từ khác loại thông qua Máy Trộn Đề
    if (isPureMode && canCallAi && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: `oddoneout_${Date.now()}`,
          type: 'ioe_odd_one_out',
          level: safeLevel,
          topic: config?.topic || '',
          dataMode: config?.dataMode || 'vocab',
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
              safeLevel,
              {
                displaySentence: Array.isArray(qData.content.words)
                  ? qData.content.words.join(' • ')
                  : qData.content.words,
                targetWord: qData.content.oddWord,
                hint: qData.content.explanation
              },
              'ioe_odd_one_out'
            );
          }
          if (isInitializingRef.current && showToast) {
            safeShowToast('Đang nạp đạn AI...', 'info');
          }
          return qData.content;
        }
      } catch (e) {
        console.warn('AI OddOneOut Pure Fallback:', e.message);
        if (window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề OddOneOut AI', e);
        }
      }
    }

    // 2.5 HYBRID AI MODE (Thử thách AI với Thẻ gốc làm hạt giống)
    if (!isPureMode && isAiMode && currentApiKey && AiFactoryEngine) {
      let poppedCard = null;
      try {
        if (deckRef.current.length === 0) {
          let validCards = (enrichedCardsRef.current || []).filter(
            (c) => c.term && c.term.trim() !== ''
          );
          if (validCards.length < 4 && FallbackDataEngine?.getFallbackData) {
            const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
            const fbItems = FallbackDataEngine.getFallbackData(
              safeLang,
              'vocab',
              safeLevel,
              20
            );
            if (fbItems && fbItems.length >= 4) {
              const existingTerms = new Set(validCards.map((v) => v.term));
              const newFbs = fbItems.filter((f) => !existingTerms.has(f.term));
              validCards = [...validCards, ...newFbs];
            }
          }
          deckRef.current = Utils?.shuffleArray
            ? Utils.shuffleArray(validCards)
            : validCards;
        }

        poppedCard = deckRef.current.shift();
        if (poppedCard) {
          // [CƠ CHẾ JIT ENRICHMENT] Dịch bổ sung nếu thẻ hạt giống khuyết nghĩa
          if (!poppedCard.definition || poppedCard.definition.trim() === '') {
            try {
              const enrichFn = Utils?.fillCardWithAi || fillCardWithAi;
              if (enrichFn) {
                const enriched = await enrichFn(
                  poppedCard.term,
                  lang,
                  currentApiKey,
                  ['definition', 'pronunciation']
                );
                poppedCard = {
                  ...poppedCard,
                  ...enriched,
                  is_enriched: true
                };
                if (onUpdateCards) onUpdateCards([poppedCard]);
                if (enriched._tokenUsage) {
                  const currentTotal = parseInt(
                    localStorage.getItem('fc_total_tokens') || '0',
                    10
                  );
                  localStorage.setItem(
                    'fc_total_tokens',
                    String(
                      currentTotal + (enriched._tokenUsage.totalTokenCount || 0)
                    )
                  );
                }
              }
            } catch (e) {
              console.warn('JIT Enrich failed for OddOneOut Hybrid:', e);
              poppedCard.definition = 'Từ vựng ngẫu nhiên';
            }
          }

          const historyPrompt = AiFactoryEngine.getHistoryPrompt(
            historyQueueRef.current
          );
          const hybridPrompt =
            historyPrompt +
            `\nCRITICAL REQUIREMENT: You MUST include the exact word/phrase "${poppedCard.term}" (Meaning: ${
              poppedCard.definition || 'Unknown'
            }) as one of the 4 items in your array. It can be the odd one out, or one of the 3 similar items.`;

          const aiPromise = AiFactoryEngine.forgeMatrix(
            'odd_one_out',
            safeLevel,
            lang,
            currentApiKey,
            config?.topic,
            hybridPrompt,
            config?.dataMode
          );
          const timeoutPromise = new Promise((_, r) =>
            setTimeout(() => r(new Error('AI Hybrid Timeout')), 15000)
          );
          const parsedResult = await Promise.race([aiPromise, timeoutPromise]);

          if (parsedResult && parsedResult.words && parsedResult.oddWord) {
            if (Array.isArray(parsedResult.words)) {
              parsedResult.words.forEach((w) => {
                if (w && typeof w === 'string') {
                  historyQueueRef.current.push(w.trim());
                }
              });
              while (historyQueueRef.current.length > 400) {
                historyQueueRef.current.shift();
              }
              try {
                localStorage.setItem(
                  'fc_ai_memory',
                  JSON.stringify(historyQueueRef.current)
                );
              } catch (e) {
                console.warn('Save fc_ai_memory error:', e);
              }
            }

            if (parsedResult._tokenUsage) {
              const used = parsedResult._tokenUsage.totalTokenCount || 0;
              const currentTotal = parseInt(
                localStorage.getItem('fc_total_tokens') || '0',
                10
              );
              localStorage.setItem(
                'fc_total_tokens',
                String(currentTotal + used)
              );
            }

            if (onSaveToHarvest) {
              onSaveToHarvest(safeLevel, {
                displaySentence: Array.isArray(parsedResult.words)
                  ? parsedResult.words.join(' • ')
                  : parsedResult.words,
                targetWord: parsedResult.oddWord,
                hint: parsedResult.explanation
              });
            }

            if (isInitializingRef.current) {
              aiGeneratedCountRef.current += 1;
              safeShowToast(
                `Đã nạp xong câu ${aiGeneratedCountRef.current} bằng AI...`,
                'success'
              );
            }

            return {
              ...parsedResult,
              originCards: [poppedCard],
              isAiGenerated: true
            };
          }
        }
      } catch (e) {
        console.warn('Hybrid AI OddOneOut Fallback:', e.message);
        if (window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse OddOneOut Hybrid AI', e);
        }
        if (poppedCard) deckRef.current.unshift(poppedCard);
      }
    }

    // 3. THẺ GỐC HOẶC KHO TỔNG OFFLINE (Khi không bật AI hoặc AI sập mạng)
    if (GameAlgoEngine?.OddOneOutEngine?.offline_generate) {
      const cleanDeck = (enrichedCardsRef.current || []).filter(
        (c) =>
          c.term &&
          c.term.trim() !== '' &&
          c.definition &&
          c.definition.trim() !== ''
      );
      const offlineResult = GameAlgoEngine.OddOneOutEngine.offline_generate(
        cleanDeck,
        lang
      );
      if (offlineResult) {
        if (offlineResult.words && Array.isArray(offlineResult.words)) {
          offlineResult.words.forEach((w) => {
            if (w && typeof w === 'string') {
              historyQueueRef.current.push(w.trim());
            }
          });
          while (historyQueueRef.current.length > 400) {
            historyQueueRef.current.shift();
          }
          try {
            localStorage.setItem(
              'fc_ai_memory',
              JSON.stringify(historyQueueRef.current)
            );
          } catch (e) {
            console.warn('Save fc_ai_memory error:', e);
          }
        }
        return { ...offlineResult, isAiGenerated: false };
      }
    }

    // 4. CỨU HỘ KHẨN CẤP TĨNH
    const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
    const fbResult = FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'oddoneout',
          safeLang,
          safeLevel,
          config
        )
      : null;
    if (fbResult) return fbResult;

    return {
      words: ['apple', 'banana', 'orange', 'cat'],
      oddWord: 'cat',
      explanation: 'Cat là động vật (Dự phòng tuyệt đối).',
      isAiGenerated: false,
      _isRescued: true
    };
  };

  // ==========================================================================
  // KHỞI ĐỘNG & PHỤC HỒI PHIÊN CHƠI
  // ==========================================================================
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
      let validCards = currentDeck.filter((c) => c.term && c.term.trim() !== '');
      if (validCards.length < 4) {
        safeShowToast(
          'Bộ thẻ không đủ 4 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
          'warning'
        );
        if (FallbackDataEngine?.getFallbackData) {
          const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
          const fbItems = FallbackDataEngine.getFallbackData(
            safeLang,
            'vocab',
            safeLevel,
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
            { term: 'Apple', definition: 'Quả táo', partOfSpeech: 'Noun' },
            { term: 'Banana', definition: 'Quả chuối', partOfSpeech: 'Noun' },
            { term: 'Orange', definition: 'Quả cam', partOfSpeech: 'Noun' },
            { term: 'Cat', definition: 'Con mèo', partOfSpeech: 'Animal' }
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

    const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
    await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);

    let firstData = coordinatorRef.current.pop();
    if (!firstData) {
      if (window.logSystemEvent) {
        window.logSystemEvent(
          'Queue cạn đạn lúc khởi tạo Game Từ Khác Loại',
          'Kích hoạt Hard Fallback'
        );
      }
      safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
      firstData = FallbackDataEngine?.getGameReadyFallback
        ? FallbackDataEngine.getGameReadyFallback(
            'oddoneout',
            safeLang,
            safeLevel,
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
        'Lỗi nghiêm trọng khi tải dữ liệu. Buộc kết thúc.',
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

    if (savedState && savedState.oddOneOutState) {
      const st = savedState.oddOneOutState;
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
                    'Queue cạn đạn lúc Resume Game Từ Khác Loại',
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
                      'oddoneout',
                      safeLang,
                      safeLevel,
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

  // ==========================================================================
  // CHUYỂN VÒNG & TƯƠNG TÁC NGƯỜI DÙNG
  // ==========================================================================
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
                  'Queue cạn đạn lúc chuyển vòng Game Từ Khác Loại',
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
                    'oddoneout',
                    safeLang,
                    safeLevel,
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
    isGenerating,
    timeLimit,
    sourceMode,
    isAiMode,
    applyAntiStreak,
    safeShowToast,
    lang,
    safeLevel,
    config,
    onEndGame,
    triggerAutoSave
  ]);

  const handleOptionClick = (idx) => {
    if (
      checkStatus === 'success' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return;
    }

    const clickedWord = currentQuestion.words[idx];
    setSelectedIndex(idx);

    const isCorrect =
      String(clickedWord).toLowerCase().trim() ===
      String(currentQuestion.oddWord).toLowerCase().trim();

    if (isCorrect) {
      if (attempts === 0) {
        localRemoveFromRetryBag(currentQuestion.oddWord, currentQuestion.words);
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
      checkStatus === 'success' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return;
    }
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(8);
    setTimeout(() => triggerAutoSave(), 150);
  };

  // Động cơ đếm ngược thời gian mỗi câu
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

  // Xử lý khi hết giờ
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
        setAttempts(2);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(8);
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

  // Tự động chuyển câu khi hết thời gian chờ kết quả
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
    handleSaveAndBack,
    aiWaitTime
  };
};

// ============================================================================
// 2. GAME WRAPPER COMPONENT (ODD ONE OUT GAME)
// ============================================================================
export const OddOneOutGame = ({
  cards,
  t,
  onFinish,
  onQuit,
  onEndGame: propOnEndGame,
  onBack: propOnBack,
  mainColor = 'pink',
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
  onPlay,
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag
}) => {
  const handleEndGame = (stats) => {
    if (onFinish) {
      onFinish(stats.correct, stats.time, stats.wrong);
    } else if (propOnEndGame) {
      propOnEndGame(stats);
    }
  };

  const handleQuit = (sessionData) => {
    if (propOnBack) {
      propOnBack(sessionData);
    } else if (onQuit) {
      onQuit(sessionData);
    }
  };

  const safeConfig = config || {
    level: 'level_4_discovery_basic',
    sourceMode: 'card'
  };
  const effectiveAiMode =
    safeConfig.sourceMode === 'ai_pure' ||
    Boolean(safeConfig.aiMode) ||
    Boolean(isAiMode);

  const hookCallbacks = {
    showToast: window.globalShowToast,
    onLogWrong,
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onBack: handleQuit,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: handleEndGame
  };

  const logic = useOddOneOutLogic(
    cards,
    {
      ...safeConfig,
      isAiMode: effectiveAiMode,
      apiKey,
      lang,
      timeLimit: safeConfig.timeLimit || 15,
      savedState,
      globalRetryBag
    },
    hookCallbacks
  );

  const isBookmarked = Boolean(
    logic.currentQuestion?.oddWord &&
      notebook?.some(
        (n) => n.term && n.term.includes(logic.currentQuestion.oddWord)
      )
  );

  const safeOnPlay =
    onPlay ||
    ((text) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'en' ? 'en-US' : lang === 'zh' ? 'zh-CN' : 'vi-VN';
      window.speechSynthesis.speak(u);
    });

  return (
    <OddOneOutPlayScreen
      t={t}
      mainColor={mainColor}
      config={{ ...safeConfig, aiMode: effectiveAiMode }}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={handleEndGame}
      onSaveToNotebook={(payload) => {
        if (onBookmark) {
          onBookmark(payload);
        } else if (window.handleSaveToNotebook) {
          window.handleSaveToNotebook(payload);
        } else if (window.globalShowToast) {
          window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
        }
      }}
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