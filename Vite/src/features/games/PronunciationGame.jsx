// ============================================================================
// FILE 67/85: src/features/games/PronunciationGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.20 - Pronunciation Logic & Wrapper V1.18)
// NHIỆM VỤ: Động cơ xử lý Logic (usePronunciationLogic) và Container điều phối
//           (PronunciationGame) cho trò chơi Vua Ngữ Âm (Pronunciation).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { QueueEngine } from '@/engines/queueEngine';
import { AiFactoryEngine } from '@/engines/aiFactory';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { ExamEngine } from '@/engines/exam';
import {
  getSafeLevelString,
  applyAntiStreakShuffle,
  getConfiguredUiCooldown,
  extractPendingCardsFromQueue
} from './common/gameHelpers';
import { PronunciationPlayScreen } from './PronunciationUI';

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (usePronunciationLogic Hook)
// ============================================================================
export const usePronunciationLogic = (cards, config, callbacks) => {
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
    onSaveToHarvest,
    onAutoSave,
    onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame
  } = callbacks;

  // Vành đai phòng thủ chống nhiễm độc Mảng từ Multi-select
  const safeLevelString = getSafeLevelString(level, 'level_4_discovery_basic');
  const savedPronun = savedState?.pronunciationState || null;

  // Khởi tạo State thông minh từ phiên lưu (nếu có) để tránh cascading renders
  const [currentQuestion, setCurrentQuestion] = useState(() =>
    savedPronun && !savedPronun._needsNextOnResume
      ? savedPronun.currentQuestion || null
      : null
  );
  const [selectedIndex, setSelectedIndex] = useState(() =>
    savedPronun && !savedPronun._needsNextOnResume
      ? savedPronun.selectedIndex ?? null
      : null
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    savedPronun && !savedPronun._needsNextOnResume
      ? savedPronun.checkStatus || 'idle'
      : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    savedPronun && !savedPronun._needsNextOnResume
      ? savedPronun.attempts || 0
      : 0
  );
  const [score, setScore] = useState(() => savedPronun?.score || 0);
  const [combo, setCombo] = useState(() => savedPronun?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => savedPronun?.playedCount || 0
  );
  const [time, setTime] = useState(() => savedPronun?.time || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => savedPronun?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => savedPronun?.wrongCount || 0
  );
  const [isGenerating, setIsGenerating] = useState(() =>
    savedPronun ? Boolean(savedPronun._needsNextOnResume) : true
  );

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() =>
    savedPronun?.timeLeft !== undefined
      ? savedPronun.timeLeft
      : timeLimit || 20
  );

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedPronun?.aiWaitTime !== undefined ? savedPronun.aiWaitTime : 0
  );

  // Refs quản lý bất đồng bộ
  const historyQueueRef = useRef(Utils.safeJsonParse('fc_ai_memory', []));
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const gameTimerRef = useRef(null);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  const deckRef = useRef([]);
  const cardsRef = useRef(cards);

  // Trí nhớ lưu vết vị trí đáp án đúng 2 lượt gần nhất
  const streakTrackerRef = useRef([]);

  // Đồng bộ túi nháp RAM & thẻ gốc
  const globalRetryBagRef = useRef(globalRetryBag);
  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

  useEffect(() => {
    cardsRef.current = cards;
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

  // ==========================================================================
  // HÀM TRIGGER AUTO SAVE (Thu hồi đạn chưa bắn từ QueueEngine)
  // ==========================================================================
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
        pronunciationState: {
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

  // ĐỒNG HỒ QUÉT ĐẠN NGẦM (HONEST AMMO SCANNER 500ms)
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (
        coordinatorRef.current &&
        typeof coordinatorRef.current.length === 'function'
      ) {
        const q = coordinatorRef.current.queue || [];
        const validAmmoCount = q.filter(
          (item) => item && !item._isRescued
        ).length;
        setQueueLength(validAmmoCount);
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

  // ==========================================================================
  // HÀM TIỆN ÍCH ANTI-STREAK
  // ==========================================================================
  const applyAntiStreak = useCallback((data) => {
    if (data && Array.isArray(data.options)) {
      return {
        ...data,
        options: applyAntiStreakShuffle(data.options, streakTrackerRef)
      };
    }
    return data;
  }, []);

  // ==========================================================================
  // BỘ NÃO TÚI NHÁP TOÀN CỤC & LOG LỖI SAI
  // ==========================================================================
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag) addToRetryBag('pronunciation', questionData);
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag) removeFromRetryBag('pronunciation', termToCheck);
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const correctOpt = question.options?.find((o) => o.isCorrect);
      const cleanTerm = correctOpt ? correctOpt.text : question.term;
      const mistakeCard = {
        id: `mistake_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'mistake',
        term: Array.isArray(question.options)
          ? question.options.map((o) => o.text).join(' • ')
          : String(question.term || ''),
        definition: `Phát âm khác: ${cleanTerm}`,
        analysis: question.definition || 'Câu hỏi phân biệt ngữ âm',
        tags: ['pronunciation', safeLevelString, sourceMode],
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
        pronunciationState: {
          ...currentData,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [localPushToRetryBag, logMistake, onBack, safeShowToast]);

  // ==========================================================================
  // HÀM CỨU HỘ KHẨN CẤP (HARD FALLBACK)
  // ==========================================================================
  const getPronunciationFallback = useCallback(() => {
    let fb = FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'pronunciation',
          'en',
          safeLevelString,
          config
        )
      : null;

    if (!fb || fb.term?.includes('Lỗi hệ thống')) {
      fb = {
        term: 'cat, bat, tall, map',
        definition: 'Từ tall có âm /ɔː/ khác với âm /æ/ ở các từ còn lại.',
        options: Utils.shuffleArray([
          { text: 'cat', isCorrect: false },
          { text: 'bat', isCorrect: false },
          { text: 'tall', isCorrect: true },
          { text: 'map', isCorrect: false }
        ]),
        isAiGenerated: false,
        _isRescued: true
      };
    }
    return fb;
  }, [config, safeLevelString]);

  // ==========================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE - FETCH TASK)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp (Khóa nguyên tử)
    const pulledCard = pullRetryCardWithLock(
      'pronunciation',
      globalRetryBagRef.current,
      lang
    );
    if (pulledCard) return pulledCard;

    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY);

    // 2. AI PURE MODE: Tự động sinh thử thách Ngữ Âm qua ExamEngine
    if (isPureMode && currentApiKey && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: `pronunciation_${Date.now()}`,
          type: 'ioe_pronunciation',
          level: safeLevelString,
          topic: config?.topic || '',
          dataMode: 'vocab',
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
              meta.level,
              {
                displaySentence: qData.content.term,
                targetWord:
                  qData.content.options?.find((o) => o.isCorrect)?.text || '',
                hint: qData.content.definition || qData.content.explanation
              },
              'ioe_pronunciation'
            );
          }
          if (isInitializingRef.current) {
            aiGeneratedCountRef.current += 1;
            safeShowToast(
              `Đã nạp xong câu ${aiGeneratedCountRef.current} bằng AI...`,
              'success'
            );
          }
          return qData.content;
        }
      } catch (e) {
        console.warn('AI Pronunciation Pure Fallback:', e.message);
        if (window.logSystemEvent) {
          window.logSystemEvent(
            'Lỗi API/Parse Máy Trộn Đề Pronunciation AI',
            e
          );
        }
      }
    }

    // 2.5 HYBRID AI MODE (Thử thách AI với Thẻ gốc làm hạt giống)
    if (!isPureMode && currentApiKey && AiFactoryEngine?.forgeMatrix) {
      let poppedCard = null;
      try {
        if (deckRef.current.length === 0) {
          const validCards = (cardsRef.current || []).filter(
            (c) => c.term && c.term.trim().length > 0
          );
          deckRef.current = Utils.shuffleArray([...validCards]);
        }
        poppedCard = deckRef.current.shift();

        if (poppedCard) {
          const historyPrompt = AiFactoryEngine.getHistoryPrompt(
            historyQueueRef.current
          );
          const hybridPrompt =
            historyPrompt +
            `\nCRITICAL REQUIREMENT: You MUST include the exact word "${poppedCard.term}" as one of the 4 items. It can be the one with different pronunciation or not.`;

          const parsed = await AiFactoryEngine.forgeMatrix(
            'pronunciation',
            safeLevelString,
            lang,
            currentApiKey,
            config?.topic,
            hybridPrompt,
            'vocab'
          );

          if (parsed && parsed.options && parsed.options.length === 4) {
            parsed.options.forEach((opt) => {
              if (opt && opt.text) {
                historyQueueRef.current.push(opt.text.toLowerCase().trim());
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
              console.warn('Sync fc_ai_memory failed:', e);
            }

            const result = {
              ...parsed,
              isAiGenerated: true,
              type: 'pronunciation'
            };

            if (parsed._tokenUsage) {
              const used = parsed._tokenUsage.totalTokenCount || 0;
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
              onSaveToHarvest(
                safeLevelString,
                {
                  displaySentence: parsed.term,
                  targetWord:
                    parsed.options.find((o) => o.isCorrect)?.text || '',
                  hint: parsed.definition || parsed.explanation
                },
                'ioe_pronunciation'
              );
            }

            if (isInitializingRef.current) {
              aiGeneratedCountRef.current += 1;
              safeShowToast(
                `Đã nạp xong câu ${aiGeneratedCountRef.current} bằng AI...`,
                'success'
              );
            }

            return { ...result, originCards: [poppedCard] };
          }
        }
      } catch (e) {
        console.warn('Hybrid AI Pronunciation Fallback:', e.message);
        if (window.logSystemEvent) {
          window.logSystemEvent(
            'Lỗi API/Parse Lò đúc Pronunciation Hybrid AI',
            e
          );
        }
        if (poppedCard) deckRef.current.unshift(poppedCard);
      }
    }

    // Nếu các luồng AI thất bại -> trả về null để QueueEngine không nạp đạn lép
    return null;
  }, [
    apiKey,
    config?.topic,
    lang,
    onSaveToHarvest,
    safeLevelString,
    safeShowToast,
    sourceMode
  ]);

  // ==========================================================================
  // KHỞI TẠO & PHỤC HỒI VÒNG ĐỜI GAME
  // ==========================================================================
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const startNewGame = async () => {
      const currentApiKey =
        apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY);
      if (!currentApiKey) {
        safeShowToast(
          'Dạng bài Ngữ âm bắt buộc phải có API Key để hoạt động!',
          'error'
        );
        if (onEndGame) onEndGame({ correct: 0, time: 0, wrong: 0 });
        return;
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

      if (sourceMode === 'card') {
        let validCards = (cardsRef.current || []).filter(
          (c) => c.term && c.term.trim().length > 0
        );
        if (validCards.length === 0) {
          validCards = [{ term: 'cat' }, { term: 'school' }];
        }
        deckRef.current = Utils.shuffleArray([...validCards]);
      } else {
        deckRef.current = [];
      }

      if (coordinatorRef.current) coordinatorRef.current.destroy();
      if (QueueEngine?.createQueueCoordinator) {
        coordinatorRef.current = QueueEngine.createQueueCoordinator(
          fetchTask,
          4
        );
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
            'Queue cạn đạn lúc khởi tạo Game Ngữ Âm',
            'Kích hoạt Hard Fallback'
          );
        }
        safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
        firstData = getPronunciationFallback();
      }

      if (isGameActiveRef.current && firstData) {
        setCurrentQuestion(applyAntiStreak(firstData));
        setSelectedIndex(null);
        setCheckStatus('idle');
        setAttempts(0);
        setIsGenerating(false);
        isInitializingRef.current = false;
        setTimeLeft(timeLimit || 20);
        setAiWaitTime(getConfiguredUiCooldown(9));
        safeShowToast('Hoàn tất! Bắt đầu luyện phát âm.', 'success');
      } else if (isGameActiveRef.current) {
        safeShowToast(
          'Lỗi nghiêm trọng khi tải dữ liệu AI. Buộc kết thúc.',
          'error'
        );
        setIsGenerating(false);
        isInitializingRef.current = false;
        if (onEndGame) onEndGame({ correct: 0, time: 0, wrong: 0 });
      }

      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      gameTimerRef.current = setInterval(() => {
        setTime((prev) => prev + 1);
      }, 1000);
    };

    if (savedState && savedState.pronunciationState) {
      const st = savedState.pronunciationState;
      if (st.deck) {
        deckRef.current = [...st.deck];
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
                    'Queue cạn đạn lúc Resume Game Ngữ Âm',
                    'Kích hoạt Hard Fallback'
                  );
                }
                safeShowToast(
                  'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
                  'warning'
                );
                data = getPronunciationFallback();
              }
              if (data) {
                setCurrentQuestion(applyAntiStreak(data));
                setSelectedIndex(null);
                setCheckStatus('idle');
                setAttempts(0);
                setIsGenerating(false);
                setTimeLeft(timeLimit || 20);
                setAiWaitTime(getConfiguredUiCooldown(9));
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
  }, [
    apiKey,
    applyAntiStreak,
    fetchTask,
    getPronunciationFallback,
    isAiMode,
    onEndGame,
    safeShowToast,
    savedState,
    sourceMode,
    timeLimit
  ]);

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
      setTimeLeft(timeLimit || 20);
      setAiWaitTime(getConfiguredUiCooldown(9));
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
                  'Queue cạn đạn lúc chuyển vòng Game Ngữ Âm',
                  'Kích hoạt Hard Fallback'
                );
              }
              safeShowToast(
                'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
                'warning'
              );
              data = getPronunciationFallback();
            }
            if (data) {
              setCurrentQuestion(applyAntiStreak(data));
              setSelectedIndex(null);
              setCheckStatus('idle');
              setAttempts(0);
              setIsGenerating(false);
              setTimeLeft(timeLimit || 20);
              setAiWaitTime(getConfiguredUiCooldown(9));
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
    getPronunciationFallback,
    isAiMode,
    isGenerating,
    onEndGame,
    safeShowToast,
    sourceMode,
    timeLimit,
    triggerAutoSave
  ]);

  // ==========================================================================
  // TƯƠNG TÁC NGƯỜI DÙNG
  // ==========================================================================
  const handleOptionClick = useCallback(
    (idx) => {
      if (
        checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        isGenerating ||
        !currentQuestion
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
          setCheckStatus('failed');
          setWrongCount((p) => p + 1);
          safeShowToast('Đã hết lượt!', 'error');
          logMistake(currentQuestion);
          proceedToNext(7);
        } else {
          setCheckStatus('wrong_retry');
          safeShowToast(
            `Chưa đúng! Còn ${2 - newAttempts} lượt.`,
            'warning'
          );
          setTimeout(
            () => setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p)),
            1000
          );
        }
      }
      setTimeout(() => triggerAutoSave(), 150);
    },
    [
      attempts,
      checkStatus,
      combo,
      currentQuestion,
      isGenerating,
      localPushToRetryBag,
      localRemoveFromRetryBag,
      logMistake,
      proceedToNext,
      safeShowToast,
      triggerAutoSave
    ]
  );

  const handleSkip = useCallback(() => {
    if (
      checkStatus === 'correct' ||
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
    proceedToNext(7);
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    checkStatus,
    currentQuestion,
    isGenerating,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    triggerAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN TỪNG CÂU
  useEffect(() => {
    let timerId = null;
    if (
      timerMode &&
      checkStatus !== 'correct' &&
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
        proceedToNext(7);
        triggerAutoSave();
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

  // CHỐNG RACE CONDITION CHO AUTO-NEXT
  useEffect(() => {
    if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => setResultTimer((t) => t - 1), 1000);
      return () => clearTimeout(id);
    } else if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      resultTimer === 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(id);
    }
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(
    () => setIsResultPaused((p) => !p),
    []
  );

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
// 2. GAME WRAPPER COMPONENT (PronunciationGame)
// ============================================================================
export const PronunciationGame = ({
  cards,
  t,
  onFinish,
  onEndGame,
  onQuit,
  onBack,
  mainColor = 'indigo',
  lang = 'en',
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
  const handleFinishGame = useCallback(
    (stats) => {
      if (onFinish) {
        onFinish(stats?.correct || 0, stats?.time || 0, stats?.wrong || 0);
      } else if (onEndGame) {
        onEndGame({
          correct: stats?.correct || 0,
          wrong: stats?.wrong || 0,
          time: stats?.time || 0
        });
      }
    },
    [onFinish, onEndGame]
  );

  const safeConfig = config || {
    level: 'level_4_discovery_basic',
    sourceMode: 'ai_pure'
  };

  const hookCallbacks = {
    showToast: window.globalShowToast,
    onLogWrong,
    onUpdateCards,
    onSaveToHarvest,
    onAutoSave,
    onBack: onQuit || onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: handleFinishGame
  };

  const logic = usePronunciationLogic(
    cards,
    {
      ...safeConfig,
      isAiMode:
        safeConfig.sourceMode === 'ai_pure' || Boolean(safeConfig.aiMode),
      apiKey,
      lang,
      timeLimit: safeConfig.timeLimit || 20,
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

  const correctOpt = logic.currentQuestion?.options?.find((o) => o.isCorrect);
  const targetWord = correctOpt ? correctOpt.text : null;
  const isBookmarked = Boolean(
    targetWord &&
      notebook?.some((n) => n.term === targetWord || n.term?.includes(targetWord))
  );

  const safeOnPlay =
    onPlay ||
    ((text) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'en' ? 'en-US' : 'vi-VN';
      window.speechSynthesis.speak(u);
    });

  return (
    <PronunciationPlayScreen
      t={t}
      mainColor={mainColor}
      config={safeConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={handleFinishGame}
      onSaveToNotebook={handleSaveToNotebook}
      isBookmarked={isBookmarked}
      settings={settings}
      onPlay={safeOnPlay}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_20_usePronunciationLogic = usePronunciationLogic;
  window.usePronunciationLogic = usePronunciationLogic;
  window.Block5_20_PronunciationGame = PronunciationGame;
  window.PronunciationGame = PronunciationGame;
}

export default PronunciationGame;