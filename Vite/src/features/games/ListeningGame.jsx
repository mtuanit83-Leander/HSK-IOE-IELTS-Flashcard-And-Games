// ============================================================================
// FILE 69/85: src/features/games/ListeningGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.22 - Listening Logic & Wrapper V1.12)
// NHIỆM VỤ: Động cơ điều khiển (useListeningLogic) và Component bọc ngoài
//           (ListeningGame) cho trò chơi Đôi Tai Vàng (Listening Comprehension).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { ExamEngine } from '@/engines/exam';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import {
  getSafeLevelString,
  applyAntiStreakShuffle,
  getConfiguredUiCooldown,
  extractPendingCardsFromQueue
} from './common/gameHelpers';
import { ListeningPlayScreen } from './ListeningUI';

// ============================================================================
// 1. ĐỘNG CƠ LOGIC TRÒ CHƠI NGHE HIỂU (HOOK useListeningLogic)
// ============================================================================
export const useListeningLogic = (config, callbacks) => {
  const {
    isAiMode,
    apiKey,
    lang,
    timeLimit = 45,
    level,
    sourceMode = 'ai_pure',
    savedState,
    timerMode = false,
    maxPlays = 3,
    globalRetryBag
  } = config || {};

  const {
    showToast,
    onLogWrong,
    onSaveToHarvest,
    onAutoSave,
    onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame,
    onPlay
  } = callbacks || {};

  // Vành đai phòng thủ chống nhiễm độc Mảng từ Multi-select Level
  const safeLevelString = getSafeLevelString(
    config?.level || level,
    'level_4_discovery_basic'
  );

  const savedListening = savedState?.listeningState || null;
  const needsNextOnResume = Boolean(savedListening?._needsNextOnResume);

  // Khởi tạo State trực tiếp từ savedState (Lazy Initialization) để đạt 0 Warnings
  const [currentQuestion, setCurrentQuestion] = useState(() =>
    savedListening && !needsNextOnResume
      ? savedListening.currentQuestion || null
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
      ? savedListening.checkStatus || 'idle'
      : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    savedListening && !needsNextOnResume ? savedListening.attempts || 0 : 0
  );
  const [score, setScore] = useState(() =>
    savedListening ? savedListening.score || 0 : 0
  );
  const [combo, setCombo] = useState(() =>
    savedListening ? savedListening.combo || 1 : 1
  );
  const [playedCount, setPlayedCount] = useState(() =>
    savedListening ? savedListening.playedCount || 0 : 0
  );
  const [time, setTime] = useState(() =>
    savedListening ? savedListening.time || 0 : 0
  );
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(() =>
    savedListening ? savedListening.correctCount || 0 : 0
  );
  const [wrongCount, setWrongCount] = useState(() =>
    savedListening ? savedListening.wrongCount || 0 : 0
  );
  const [isGenerating, setIsGenerating] = useState(() =>
    savedListening ? needsNextOnResume : true
  );

  // State âm thanh đặc thù của Đôi Tai Vàng
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playCount, setPlayCount] = useState(() =>
    savedListening && !needsNextOnResume ? savedListening.playCount || 0 : 0
  );

  // UX Timer State cho màn hình hiển thị kết quả
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() =>
    savedListening && savedListening.timeLeft !== undefined
      ? savedListening.timeLeft
      : timeLimit || 45
  );

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedListening && savedListening.aiWaitTime !== undefined
      ? savedListening.aiWaitTime
      : 0
  );

  // Refs quản lý bất đồng bộ
  const historyQueueRef = useRef(
    Utils?.safeJsonParse ? Utils.safeJsonParse('fc_ai_memory', []) : []
  );
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(true);
  const gameTimerRef = useRef(null);
  const audioTimeoutRef = useRef(null);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  const deckRef = useRef(
    savedListening && Array.isArray(savedListening.deck)
      ? [...savedListening.deck]
      : []
  );

  // Trí nhớ lưu vết vị trí đáp án đúng 2 lượt gần nhất
  const streakTrackerRef = useRef([]);

  // Đồng bộ túi nháp RAM
  const globalRetryBagRef = useRef(globalRetryBag);
  useEffect(() => {
    globalRetryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);

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
      aiWaitTime,
      deck: deckRef.current
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
  // HÀM TRIGGER AUTO SAVE (Thu hồi đạn chưa bắn từ QueueEngine)
  // ============================================================================
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
        listeningState: {
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

  // ============================================================================
  // HÀM TIỆN ÍCH ANTI-STREAK (BẺ GÃY CHUỖI ĐÁP ÁN TRÙNG LẶP)
  // ============================================================================
  const applyAntiStreak = useCallback((data) => {
    if (data && Array.isArray(data.options)) {
      return {
        ...data,
        options: applyAntiStreakShuffle(data.options, streakTrackerRef)
      };
    }
    return data;
  }, []);

  // ============================================================================
  // AUDIO CONTROLLER (XỬ LÝ ÂM THANH KỊCH BẢN NGHE)
  // ============================================================================
  const stopAudio = useCallback(() => {
    setIsAudioPlaying(false);
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current);
    }
  }, []);

  const handlePlayAudio = useCallback(() => {
    if (
      isAudioPlaying ||
      playCount >= maxPlays ||
      !currentQuestion?.audioScript ||
      checkStatus === 'correct' ||
      checkStatus === 'failed'
    ) {
      return;
    }

    setIsAudioPlaying(true);
    setPlayCount((p) => p + 1);

    let isDone = false;
    const finishPlay = () => {
      if (!isDone && isGameActiveRef.current) {
        isDone = true;
        setIsAudioPlaying(false);
        if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
      }
    };

    const durationMs = Math.max(10000, currentQuestion.audioScript.length * 150);
    audioTimeoutRef.current = setTimeout(() => {
      finishPlay();
    }, durationMs);

    if (onPlay) {
      onPlay(currentQuestion.audioScript, 0.85, null, finishPlay);
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(currentQuestion.audioScript);
        u.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
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
    isAudioPlaying,
    playCount,
    maxPlays,
    currentQuestion,
    checkStatus,
    onPlay,
    lang
  ]);

  // ============================================================================
  // BỘ NÃO TÚI NHÁP TOÀN CỤC & LOG LỖI SAI
  // ============================================================================
  const localPushToRetryBag = useCallback(
    (questionData) => {
      if (addToRetryBag && questionData) {
        addToRetryBag('listening', questionData);
      }
    },
    [addToRetryBag]
  );

  const localRemoveFromRetryBag = useCallback(
    (termToCheck) => {
      if (removeFromRetryBag && termToCheck) {
        removeFromRetryBag('listening', termToCheck);
      }
    },
    [removeFromRetryBag]
  );

  const logMistake = useCallback(
    (question) => {
      if (!onLogWrong || !question) return;
      const correctOpt = question.options?.find((o) => o.isCorrect);
      const ansText = correctOpt ? correctOpt.text : 'Chưa rõ';

      const mistakeCard = {
        id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: 'mistake',
        term: `Nghe: ${question.term}`,
        definition: `Đáp án: ${ansText}`,
        analysis: question.explanation || '',
        example: `Transcript: ${question.audioScript || ''}`,
        tags: ['listening', safeLevelString, sourceMode],
        timestamp: Date.now()
      };
      onLogWrong(mistakeCard);
    },
    [onLogWrong, safeLevelString, sourceMode]
  );

  const handleSaveAndBack = useCallback(() => {
    stopAudio();
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
        listeningState: {
          ...currentData,
          wrongCount: finalWrongCount,
          combo: finalCombo,
          _needsNextOnResume: needsNext
        }
      });
    }
  }, [stopAudio, localPushToRetryBag, logMistake, safeShowToast, onBack]);

  // ============================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE - FETCH TASK)
  // ============================================================================
  const getDefaultFallbackListening = useCallback(() => {
    const safeLang = lang === 'en' || lang === 'zh' ? lang : 'en';
    const fbResult = FallbackDataEngine?.getGameReadyFallback
      ? FallbackDataEngine.getGameReadyFallback(
          'listening',
          safeLang,
          safeLevelString,
          config
        )
      : null;

    if (fbResult && !fbResult.term?.includes('Lỗi hệ thống')) {
      return fbResult;
    }

    const rawOptions = [
      { text: 'Apples', isCorrect: true },
      { text: 'Bananas', isCorrect: false },
      { text: 'Oranges', isCorrect: false },
      { text: 'Grapes', isCorrect: false }
    ];

    return {
      audioScript:
        'Hello, my name is John. I like to eat apples and play football in the park.',
      term: 'What does John like to eat?',
      options: Utils?.shuffleArray
        ? Utils.shuffleArray(rawOptions)
        : rawOptions,
      explanation: "Trong đoạn băng, người nói nói rằng: 'I like to eat apples'.",
      isAiGenerated: false,
      _isRescued: true
    };
  }, [lang, safeLevelString, config]);

  const fetchTask = useCallback(async () => {
    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp bằng Khóa nguyên tử
    if (pullRetryCardWithLock) {
      const pulledCard = pullRetryCardWithLock(
        'listening',
        globalRetryBagRef.current,
        lang
      );
      if (pulledCard) return pulledCard;
    }

    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY) || '';

    // 2. AI GENERATION QUA EXAM ENGINE
    if (currentApiKey && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: `listening_${Date.now()}`,
          type: 'ioe_listening',
          level: safeLevelString,
          topic: config?.topic || '',
          dataMode: 'vocab',
          mode: 'minigame',
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
          const parsed = qData.content;
          const result = {
            audioScript: parsed.audioScript,
            term: parsed.question || parsed.term,
            options: parsed.options,
            explanation: parsed.explanation,
            isAiGenerated: true,
            type: 'listening'
          };

          if (parsed.audioScript) {
            const scriptSnippet = parsed.audioScript.substring(0, 50);
            historyQueueRef.current.push(scriptSnippet);
            while (historyQueueRef.current.length > 400) {
              historyQueueRef.current.shift();
            }
            try {
              localStorage.setItem(
                'fc_ai_memory',
                JSON.stringify(historyQueueRef.current)
              );
            } catch (err) {
              console.warn('Save fc_ai_memory error:', err);
            }
          }

          if (onSaveToHarvest) {
            onSaveToHarvest(safeLevelString, result, 'ioe_listening');
          }

          if (isInitializingRef.current) {
            aiGeneratedCountRef.current += 1;
            safeShowToast(
              `Đã nạp xong kịch bản ${aiGeneratedCountRef.current}...`,
              'success'
            );
          }

          return result;
        }
      } catch (e) {
        console.warn('AI Listening Fallback:', e.message);
        if (typeof window !== 'undefined' && window.logSystemEvent) {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề Listening AI', e);
        }
      }
    }

    // 3. FALLBACK KHẨN CẤP
    return getDefaultFallbackListening();
  }, [
    lang,
    apiKey,
    safeLevelString,
    config,
    onSaveToHarvest,
    safeShowToast,
    getDefaultFallbackListening
  ]);

  // ============================================================================
  // KHỞI ĐỘNG & PHỤC HỒI VÒNG ĐỜI TRÒ CHƠI
  // ============================================================================
  const startNewGame = useCallback(async () => {
    const currentApiKey =
      apiKey || localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    if (!currentApiKey) {
      safeShowToast(
        'Dạng bài Nghe Hiểu bắt buộc phải có API Key để hoạt động!',
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

    if (
      typeof window !== 'undefined' &&
      window.fc_audioCtx &&
      window.fc_audioCtx.state === 'suspended'
    ) {
      window.fc_audioCtx.resume();
    }

    if (coordinatorRef.current) coordinatorRef.current.destroy();
    if (QueueEngine?.createQueueCoordinator) {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 3);
    } else {
      safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
      return;
    }

    const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
    await coordinatorRef.current.maintain(true, 22000, isOfflineFastTrack);
    let firstData = coordinatorRef.current.pop();

    if (!firstData) {
      if (typeof window !== 'undefined' && window.logSystemEvent) {
        window.logSystemEvent(
          'Queue cạn đạn lúc khởi tạo Game Đôi Tai Vàng',
          'Kích hoạt Hard Fallback'
        );
      }
      safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
      firstData = getDefaultFallbackListening();
    }

    if (isGameActiveRef.current && firstData) {
      setCurrentQuestion(applyAntiStreak(firstData));
      setSelectedOptionIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setPlayCount(0);
      setIsGenerating(false);
      isInitializingRef.current = false;
      setTimeLeft(timeLimit || 45);
      setAiWaitTime(getConfiguredUiCooldown(9));
      safeShowToast('Sẵn sàng! Hãy bấm nghe.', 'success');
    } else if (isGameActiveRef.current) {
      safeShowToast(
        'Lỗi nghiêm trọng khi tải kịch bản AI. Buộc kết thúc.',
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
  }, [
    apiKey,
    safeShowToast,
    onEndGame,
    fetchTask,
    sourceMode,
    isAiMode,
    getDefaultFallbackListening,
    applyAntiStreak,
    timeLimit
  ]);

  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    isGameActiveRef.current = true;

    const initTimer = setTimeout(() => {
      if (savedListening) {
        if (coordinatorRef.current) coordinatorRef.current.destroy();
        if (QueueEngine?.createQueueCoordinator) {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            3
          );
          const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
          coordinatorRef.current.maintain(false, 22000, isOfflineFastTrack);
        }

        if (needsNextOnResume) {
          const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
          coordinatorRef.current
            .maintain(false, 22000, isOfflineFastTrack)
            .then(() => {
              if (!isGameActiveRef.current) return;
              let data = coordinatorRef.current.pop();
              if (!data) {
                if (typeof window !== 'undefined' && window.logSystemEvent) {
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
              if (data) {
                setCurrentQuestion(applyAntiStreak(data));
                setSelectedOptionIndex(null);
                setCheckStatus('idle');
                setAttempts(0);
                setPlayCount(0);
                setIsGenerating(false);
                setTimeLeft(timeLimit || 45);
                setAiWaitTime(getConfiguredUiCooldown(9));
              } else {
                safeShowToast('Lỗi tải dữ liệu. Buộc kết thúc.', 'error');
                setIsGenerating(false);
                if (onEndGame) {
                  onEndGame({
                    correct: savedListening.correctCount || 0,
                    time: savedListening.time || 0,
                    wrong: savedListening.wrongCount || 0
                  });
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
    }, 0);

    return () => {
      clearTimeout(initTimer);
      isGameActiveRef.current = false;
      stopAudio();
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (coordinatorRef.current) coordinatorRef.current.destroy();
    };
  }, [
    savedListening,
    needsNextOnResume,
    fetchTask,
    sourceMode,
    isAiMode,
    safeShowToast,
    getDefaultFallbackListening,
    applyAntiStreak,
    timeLimit,
    onEndGame,
    startNewGame,
    stopAudio
  ]);

  // ============================================================================
  // CHUYỂN CÂU & TƯƠNG TÁC NGƯỜI DÙNG
  // ============================================================================
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
    stopAudio();
    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      setCurrentQuestion(applyAntiStreak(nextData));
      setSelectedOptionIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setPlayCount(0);
      setTimeLeft(timeLimit || 45);
      setAiWaitTime(getConfiguredUiCooldown(9));
    } else {
      setIsGenerating(true);
      const isOfflineFastTrack = sourceMode === 'card' && !isAiMode;
      coordinatorRef.current
        .maintain(false, 22000, isOfflineFastTrack)
        .then(() => {
          if (!isGameActiveRef.current) return;
          let data = coordinatorRef.current.pop();
          if (!data) {
            if (typeof window !== 'undefined' && window.logSystemEvent) {
              window.logSystemEvent(
                'Queue cạn đạn lúc chuyển vòng Game Đôi Tai Vàng',
                'Kích hoạt Hard Fallback'
              );
            }
            safeShowToast(
              'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
              'warning'
            );
            data = getDefaultFallbackListening();
          }
          if (data) {
            setCurrentQuestion(applyAntiStreak(data));
            setSelectedOptionIndex(null);
            setCheckStatus('idle');
            setAttempts(0);
            setPlayCount(0);
            setIsGenerating(false);
            setTimeLeft(timeLimit || 45);
            setAiWaitTime(getConfiguredUiCooldown(9));
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
        });
    }

    setTimeout(() => triggerAutoSave(), 150);
  }, [
    isGenerating,
    stopAudio,
    applyAntiStreak,
    timeLimit,
    sourceMode,
    isAiMode,
    safeShowToast,
    getDefaultFallbackListening,
    onEndGame,
    triggerAutoSave
  ]);

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

      stopAudio();
      const clickedOpt = currentQuestion.options?.[idx];
      if (!clickedOpt) return;

      setSelectedOptionIndex(idx);
      const isCorrect =
        clickedOpt.isCorrect === true ||
        String(clickedOpt.isCorrect).toLowerCase() === 'true';

      if (isCorrect) {
        if (attempts === 0) {
          localRemoveFromRetryBag(currentQuestion.audioScript);
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
          safeShowToast(`Chưa đúng! Còn ${2 - newAttempts} lượt.`, 'warning');
          setTimeout(() => {
            setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p));
          }, 1000);
        }
      }

      setTimeout(() => triggerAutoSave(), 150);
    },
    [
      checkStatus,
      isGenerating,
      currentQuestion,
      stopAudio,
      attempts,
      localRemoveFromRetryBag,
      combo,
      safeShowToast,
      proceedToNext,
      localPushToRetryBag,
      logMistake,
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

    stopAudio();
    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(10);
    setTimeout(() => triggerAutoSave(), 150);
  }, [
    checkStatus,
    isGenerating,
    currentQuestion,
    stopAudio,
    localPushToRetryBag,
    safeShowToast,
    logMistake,
    proceedToNext,
    triggerAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN CHO TỪNG CÂU
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
        stopAudio();
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(2);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(10);
        triggerAutoSave();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [
    timeLeft,
    timerMode,
    checkStatus,
    currentQuestion,
    stopAudio,
    localPushToRetryBag,
    safeShowToast,
    logMistake,
    proceedToNext,
    triggerAutoSave
  ]);

  // ĐỒNG HỒ TỰ ĐỘNG CHUYỂN CÂU SAU KHI HIỆN KẾT QUẢ
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
      const nextId = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(nextId);
    }
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

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
    isAudioPlaying,
    playCount,
    handlePlayAudio,
    maxPlays,
    aiWaitTime
  };
};

// ============================================================================
// 2. COMPONENT BỌC NGOÀI (ListeningGame Wrapper)
// ============================================================================
export const ListeningGame = ({
  t,
  onFinish,
  onEndGame,
  onQuit,
  onBack,
  mainColor = 'cyan',
  lang = 'en',
  apiKey,
  onBookmark,
  notebook,
  onLogWrong,
  settings,
  config,
  onSaveToHarvest,
  savedState,
  onAutoSave,
  onPlay,
  speak,
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag
}) => {
  const safeConfig = config || {
    level: 'level_4_discovery_basic',
    sourceMode: 'ai_pure',
    maxPlays: 3
  };

  const handleEndGameAction = useCallback(
    (stats = { correct: 0, time: 0, wrong: 0 }) => {
      if (onFinish) {
        onFinish(stats.correct || 0, stats.time || 0, stats.wrong || 0);
      } else if (onEndGame) {
        onEndGame(stats);
      }
    },
    [onFinish, onEndGame]
  );

  const hookCallbacks = {
    showToast:
      typeof window !== 'undefined' ? window.globalShowToast : undefined,
    onLogWrong,
    onSaveToHarvest,
    onAutoSave,
    onBack: onQuit || onBack,
    addToRetryBag,
    removeFromRetryBag,
    onEndGame: handleEndGameAction,
    onPlay: onPlay || speak
  };

  const logic = useListeningLogic(
    {
      ...safeConfig,
      isAiMode:
        safeConfig.sourceMode === 'ai_pure' || safeConfig.aiMode || false,
      apiKey,
      lang,
      timeLimit: safeConfig.timeLimit || 45,
      savedState,
      globalRetryBag
    },
    hookCallbacks
  );

  const handleSaveToNotebook = useCallback(
    (payload) => {
      if (onBookmark) {
        onBookmark(payload);
      } else if (typeof window !== 'undefined' && window.handleSaveToNotebook) {
        window.handleSaveToNotebook(payload);
      } else if (typeof window !== 'undefined' && window.globalShowToast) {
        window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    },
    [onBookmark]
  );

  const isBookmarked = Boolean(
    logic.currentQuestion?.term &&
      notebook?.some((n) => n.term && n.term.includes(logic.currentQuestion.term))
  );

  return (
    <ListeningPlayScreen
      t={t}
      mainColor={mainColor}
      config={safeConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={handleEndGameAction}
      onSaveToNotebook={handleSaveToNotebook}
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