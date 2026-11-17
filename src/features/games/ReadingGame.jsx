// ============================================================================
// FILE 71/85: src/features/games/ReadingGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.24 - Reading Logic & Wrapper V1.08)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Thám Tử Đọc Hiểu (useReadingLogic & ReadingGame).
//           Vận hành kiến trúc "Tổ kén" (1 đoạn văn lớn - nhiều câu hỏi con),
//           đồng hồ canh giờ tổng cho cả đoạn văn và thu hoạch dữ liệu AI.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { ReadingSetup, ReadingPlayScreen } from './ReadingUI';
import { getSafeLevelString } from './common/gameHelpers';

// ============================================================================
// 1. CUSTOM HOOK: ĐỘNG CƠ LOGIC ĐỌC HIỂU (useReadingLogic)
// ============================================================================
export const useReadingLogic = ({
  config,
  onBack,
  onAutoSave,
  savedState,
  onSaveToNotebook,
  notebook,
  showToast,
  onLogWrong,
  globalRetryBag,
  addToRetryBag,
  removeFromRetryBag,
  onSaveToHarvest
}) => {
  // Đọc cấu hình Lõi AI từ LocalStorage
  const aiConfig = useMemo(() => Utils.safeJsonParse('fc_ai_config', {}), []);
  const configuredCooldown =
    aiConfig.uiCooldown !== undefined ? parseInt(aiConfig.uiCooldown, 10) : 9;
  const configuredInitWait =
    aiConfig.initWait !== undefined ? parseInt(aiConfig.initWait, 10) : 15;

  const hasSavedPassage = Boolean(savedState?.readingState?.passageData);

  // State quản lý Tổ kén (Đoạn văn & Danh sách câu hỏi con)
  const [passageData, setPassageData] = useState(
    () => savedState?.readingState?.passageData || null
  );
  const [subIndex, setSubIndex] = useState(
    () => savedState?.readingState?.subIndex || 0
  );

  // State tương tác của câu hỏi con hiện tại
  const [inputBuffer, setInputBuffer] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [checkStatus, setCheckStatus] = useState('idle'); // 'idle' | 'wrong_retry' | 'correct' | 'failed'
  const [attempts, setAttempts] = useState(0);

  // State thống kê & Thời gian
  const [score, setScore] = useState(() => savedState?.score || 0);
  const [combo, setCombo] = useState(() => savedState?.readingState?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => savedState?.readingState?.playedCount || 0
  );
  const [time, setTime] = useState(() => savedState?.time || 0);
  const [timeLeft, setTimeLeft] = useState(() =>
    savedState?.readingState?.timeLeft !== undefined
      ? savedState.readingState.timeLeft
      : config?.timeLimit || 300
  );
  const [isFinished, setIsFinished] = useState(false);

  // State điều phối Hàng đợi AI
  const [isGenerating, setIsGenerating] = useState(() => !hasSavedPassage);
  const [aiCountdown, setAiCountdown] = useState(() =>
    !hasSavedPassage ? configuredInitWait : 0
  );
  const [queueLength, setQueueLength] = useState(0);
  const [correctCount, setCorrectCount] = useState(
    () => savedState?.readingState?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => savedState?.readingState?.wrongCount || 0
  );

  // State đếm ngược chuyển câu & Phanh AI
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [aiWaitTime, setAiWaitTime] = useState(0);

  // Refs quản lý bất đồng bộ
  const queueCoordinatorRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const typeInputRef = useRef(null);
  const seenSignaturesRef = useRef(new Set());
  const latestStateRef = useRef({});
  const timeoutIdsRef = useRef([]);

  const safeSetTimeout = useCallback((fn, delay) => {
    const id = setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((t) => t !== id);
      if (isMountedRef.current) fn();
    }, delay);
    timeoutIdsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach(clearTimeout);
    timeoutIdsRef.current = [];
  }, []);

  // Trích xuất câu hỏi con hiện tại từ Tổ kén
  const currentSubQuestion = useMemo(() => {
    return passageData && Array.isArray(passageData.questions)
      ? passageData.questions[subIndex] || null
      : null;
  }, [passageData, subIndex]);

  const totalSubQuestions = useMemo(() => {
    return passageData && Array.isArray(passageData.questions)
      ? passageData.questions.length
      : 0;
  }, [passageData]);

  // Kiểm tra trạng thái đã lưu Sổ tay của câu hỏi con hiện tại
  const isBookmarked = useMemo(() => {
    if (!currentSubQuestion || !Array.isArray(notebook)) return false;
    const targetTerm = (currentSubQuestion.correctAnswer || '')
      .toLowerCase()
      .trim();
    return notebook.some(
      (item) => (item.term || '').toLowerCase().trim() === targetTerm
    );
  }, [currentSubQuestion, notebook]);

  // Đồng hồ đếm ngược chờ AI khởi tạo lần đầu
  useEffect(() => {
    let timer;
    if (isGenerating && aiCountdown > 0) {
      timer = setInterval(() => {
        setAiCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isGenerating, aiCountdown]);

  // Đồng hồ đếm ngược Phanh AI (Cooldown)
  useEffect(() => {
    let timer;
    if (aiWaitTime > 0) {
      timer = setInterval(() => {
        setAiWaitTime((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [aiWaitTime]);

  // ==========================================================================
  // HÀM NẠP ĐẠN TỔ KÉN ĐỌC HIỂU (FETCH TASK)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    // 1. Ưu tiên bốc từ Túi nháp lỗi sai (Xác suất 30%)
    if (
      globalRetryBag &&
      Array.isArray(globalRetryBag.reading) &&
      globalRetryBag.reading.length > 0 &&
      Math.random() < 0.3
    ) {
      const retryCandidate = globalRetryBag.reading[0];
      const sig = retryCandidate?.passageData?.passage?.substring(0, 30);

      if (sig && !seenSignaturesRef.current.has(sig)) {
        const retryItem = await pullRetryCardWithLock(
          globalRetryBag,
          'reading',
          removeFromRetryBag
        );
        if (retryItem && retryItem.passageData) {
          seenSignaturesRef.current.add(sig);
          return {
            passageData: retryItem.passageData,
            isRetry: true
          };
        }
      }
    }

    // 2. Gọi ExamEngine đúc Tổ kén Đọc hiểu mới
    if (ExamEngine && typeof ExamEngine.hydrateQuestion === 'function') {
      try {
        const blueprintItem = {
          type: 'reading',
          level: config?.level || 'level_8_academic',
          topic: config?.topic || 'general',
          isCocoon: true
        };

        const rawAiData = await ExamEngine.hydrateQuestion(
          blueprintItem,
          config?.lang || 'en',
          null,
          null
        );

        if (
          rawAiData &&
          Array.isArray(rawAiData.subQuestions) &&
          rawAiData.subQuestions.length > 0 &&
          !rawAiData._isFallback
        ) {
          // Tự động thu hoạch Tổ kén vào Kho AI
          if (onSaveToHarvest && !rawAiData._isRescued) {
            const subQStr = rawAiData.subQuestions
              .map(
                (sq, idx) =>
                  `Q${idx + 1}: ${sq.questionText} (Ans: ${sq.correctAnswer})`
              )
              .join(' | ');
            const safeHarvestLevel = getSafeLevelString(
              config?.level,
              'level_1'
            );

            onSaveToHarvest({
              term: `[Reading] ${(rawAiData.passage || '').substring(0, 60)}...`,
              meaning: subQStr,
              note: 'Trò chơi: Đọc Hiểu (Tổ kén)',
              level: safeHarvestLevel,
              lang: config?.lang || 'en'
            });
          }

          const formattedQuestions = rawAiData.subQuestions.map((sq) => {
            let finalOptions = Array.isArray(sq.options) ? sq.options : [];
            if (sq.subType === 'tfng') {
              finalOptions = ['True', 'False', 'Not Given'];
            }
            return {
              type: sq.subType || 'mcq',
              questionText: sq.questionText,
              options: finalOptions,
              correctAnswer: sq.correctAnswer,
              explanation: sq.explanation
            };
          });

          const sig = (rawAiData.passage || '').substring(0, 30);
          if (sig) seenSignaturesRef.current.add(sig);

          return {
            passageData: {
              passage: rawAiData.passage,
              questions: formattedQuestions,
              isAiGenerated: !rawAiData._isRescued,
              _isRescued: Boolean(rawAiData._isRescued)
            }
          };
        }
      } catch (e) {
        console.warn('[Reading] ExamEngine hydrate failed:', e);
      }
    }

    // 3. Cứu hộ khẩn cấp từ FallbackDataEngine nếu đứt mạng hoàn toàn
    if (
      FallbackDataEngine &&
      typeof FallbackDataEngine.getGameReadyFallback === 'function'
    ) {
      const fb = FallbackDataEngine.getGameReadyFallback(
        'reading',
        config?.lang || 'en',
        config?.level
      );
      if (fb) return fb;
    }

    throw new Error('Không thể tạo đoạn văn Đọc hiểu.');
  }, [config, globalRetryBag, removeFromRetryBag, onSaveToHarvest]);

  // ==========================================================================
  // CHUYỂN SANG TỔ KÉN (ĐOẠN VĂN) TIẾP THEO
  // ==========================================================================
  const loadNextPassage = useCallback(
    async (isFirst = false) => {
      if (!queueCoordinatorRef.current) return;
      clearAllTimeouts();
      setIsGenerating(true);

      if (isFirst) {
        setAiCountdown(configuredInitWait);
      } else {
        setAiCountdown(0);
      }

      try {
        const nextData = await queueCoordinatorRef.current.getNext();
        if (!isMountedRef.current) return;

        if (!nextData || !nextData.passageData) {
          setIsFinished(true);
        } else {
          setPassageData(nextData.passageData);
          setSubIndex(0);
          setCheckStatus('idle');
          setSelectedOptionIndex(null);
          setInputBuffer('');
          setAttempts(0);
          isSubmittingRef.current = false;

          // Reset đồng hồ tổng cho đoạn văn mới
          setTimeLeft(config?.timeLimit || 300);

          // Kích hoạt Phanh AI làm nguội giao diện
          setAiWaitTime(configuredCooldown);

          // Nếu câu đầu tiên là Điền từ, tự động focus ô nhập
          if (
            nextData.passageData.questions &&
            nextData.passageData.questions[0]?.type === 'fill_blank'
          ) {
            safeSetTimeout(() => {
              if (typeInputRef.current) typeInputRef.current.focus();
            }, 100);
          }
        }
      } catch (err) {
        console.error('[Reading] Load passage error:', err);
        if (!isMountedRef.current) return;
        if (showToast) {
          showToast('Hệ thống AI đang quá tải! Vui lòng thử lại sau.', 'error');
        }
        setPassageData(null);
      } finally {
        if (isMountedRef.current) {
          setIsGenerating(false);
        }
      }
    },
    [
      config,
      configuredCooldown,
      configuredInitWait,
      showToast,
      clearAllTimeouts,
      safeSetTimeout
    ]
  );

  // Khởi tạo QueueCoordinator khi vào màn chơi
  useEffect(() => {
    isMountedRef.current = true;

    // Tổ kén có dung lượng lớn nên chỉ trữ sẵn 1 tổ kén trong RAM
    const coordinator = QueueEngine.createQueueCoordinator(fetchTask, 1);
    queueCoordinatorRef.current = coordinator;

    const unsubscribe = coordinator.onQueueChange(() => {
      if (isMountedRef.current && coordinator._rawQueue) {
        const realAiCount = coordinator._rawQueue.filter(
          (item) =>
            item &&
            item.passageData &&
            !item.passageData._isRescued &&
            item.passageData.isAiGenerated
        ).length;
        setQueueLength(realAiCount);
      }
    });

    if (hasSavedPassage) {
      coordinator.init();
    } else {
      coordinator.init();
      loadNextPassage(true);
    }

    return () => {
      isMountedRef.current = false;
      unsubscribe();
      clearAllTimeouts();
      if (queueCoordinatorRef.current) {
        queueCoordinatorRef.current.clear();
      }
    };
  }, [fetchTask, hasSavedPassage, loadNextPassage, clearAllTimeouts]);

  // ==========================================================================
  // CHUYỂN CÂU HỎI CON HOẶC SANG ĐOẠN VĂN MỚI (NEXT ROUND)
  // ==========================================================================
  const nextRound = useCallback(() => {
    clearAllTimeouts();
    setResultTimer(0);
    setIsResultPaused(false);

    if (subIndex + 1 < totalSubQuestions) {
      const nextIdx = subIndex + 1;
      setSubIndex(nextIdx);
      setCheckStatus('idle');
      setSelectedOptionIndex(null);
      setInputBuffer('');
      setAttempts(0);
      isSubmittingRef.current = false;

      if (passageData?.questions?.[nextIdx]?.type === 'fill_blank') {
        safeSetTimeout(() => {
          if (typeInputRef.current) typeInputRef.current.focus();
        }, 100);
      }
    } else {
      setPlayedCount((c) => c + 1);
      loadNextPassage(false);
    }
  }, [
    subIndex,
    totalSubQuestions,
    passageData,
    loadNextPassage,
    clearAllTimeouts,
    safeSetTimeout
  ]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((prev) => !prev);
  }, []);

  // Tự động đếm ngược chuyển câu sau khi hiện giải thích
  useEffect(() => {
    if (checkStatus === 'correct' || checkStatus === 'failed') {
      const savedDelay = localStorage.getItem('fc_mock_delay');
      const delaySec = savedDelay !== null ? parseInt(savedDelay, 10) : 4;
      setResultTimer(delaySec);
      setIsResultPaused(false);
    }
  }, [checkStatus]);

  useEffect(() => {
    let timer;
    if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      !isResultPaused
    ) {
      if (resultTimer > 0) {
        timer = setTimeout(() => setResultTimer((prev) => prev - 1), 1000);
      } else if (resultTimer === 0 && aiWaitTime <= 0 && !isGenerating) {
        nextRound();
      }
    }
    return () => clearTimeout(timer);
  }, [
    checkStatus,
    isResultPaused,
    resultTimer,
    aiWaitTime,
    isGenerating,
    nextRound
  ]);

  // Xử lý khi hết giờ đọc cả đoạn văn
  const handlePassageTimeUp = useCallback(() => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    clearAllTimeouts();

    const remainingQuestions = Math.max(1, totalSubQuestions - subIndex);
    setWrongCount((w) => w + remainingQuestions);
    setCombo(1);
    setCheckStatus('failed');

    if (onLogWrong && currentSubQuestion) {
      onLogWrong({
        id: `reading_timeout_${Date.now()}`,
        term: currentSubQuestion.correctAnswer || 'Reading Timeout',
        meaning: currentSubQuestion.questionText || 'Hết giờ đọc bài'
      });
    }

    if (addToRetryBag && passageData) {
      addToRetryBag('reading', { passageData });
    }

    if (showToast) {
      showToast('Hết giờ đọc bài! Đang chuyển sang đoạn văn mới...', 'error');
    }

    safeSetTimeout(() => {
      if (isMountedRef.current) {
        setPlayedCount((c) => c + 1);
        loadNextPassage(false);
      }
    }, 3000);
  }, [
    totalSubQuestions,
    subIndex,
    currentSubQuestion,
    passageData,
    onLogWrong,
    addToRetryBag,
    showToast,
    loadNextPassage,
    clearAllTimeouts,
    safeSetTimeout
  ]);

  // Đồng hồ đếm thời gian tổng của Đoạn văn
  useEffect(() => {
    if (isFinished || !passageData || isGenerating) return;

    const timer = setInterval(() => {
      setTime((t) => t + 1);
      if (config?.timerMode) {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handlePassageTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    isFinished,
    passageData,
    isGenerating,
    config?.timerMode,
    handlePassageTimeUp
  ]);

  // ==========================================================================
  // XỬ LÝ CHẤM ĐIỂM CÂU HỎI CON (TRẮC NGHIỆM / TFNG / ĐIỀN TỪ)
  // ==========================================================================
  const handleSuccess = useCallback(() => {
    clearAllTimeouts();
    setCheckStatus('correct');
    setCorrectCount((c) => c + 1);
    setScore((s) => s + 15 * combo);
    setCombo((c) => c + 1);
    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 200);
  }, [combo, clearAllTimeouts]);

  const handleFailure = useCallback(() => {
    clearAllTimeouts();
    setCheckStatus('failed');
    setWrongCount((w) => w + 1);
    setCombo(1);

    if (onLogWrong && currentSubQuestion) {
      onLogWrong({
        id: `reading_${Date.now()}`,
        term: currentSubQuestion.correctAnswer || 'Reading',
        meaning: `${currentSubQuestion.questionText || ''} -> Giải thích: ${
          currentSubQuestion.explanation || ''
        }`
      });
    }

    if (addToRetryBag && passageData) {
      addToRetryBag('reading', { passageData });
    }

    setTimeout(() => {
      isSubmittingRef.current = false;
    }, 200);
  }, [
    currentSubQuestion,
    passageData,
    onLogWrong,
    addToRetryBag,
    clearAllTimeouts
  ]);

  const handleOptionClick = useCallback(
    (index, isCorrect) => {
      if (
        checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        isGenerating ||
        isSubmittingRef.current
      ) {
        return;
      }
      isSubmittingRef.current = true;
      setSelectedOptionIndex(index);

      if (isCorrect) {
        handleSuccess();
      } else {
        if (attempts === 0) {
          setCheckStatus('wrong_retry');
          setAttempts(1);
          setCombo(1);
          if (showToast) {
            showToast('Chưa đúng! Đọc kỹ lại bài xem sao.', 'warning');
          }
          safeSetTimeout(() => {
            if (isMountedRef.current) {
              setSelectedOptionIndex(null);
              setCheckStatus('idle');
            }
            isSubmittingRef.current = false;
          }, 800);
        } else {
          handleFailure();
        }
      }
    },
    [
      checkStatus,
      isGenerating,
      attempts,
      handleSuccess,
      handleFailure,
      showToast,
      safeSetTimeout
    ]
  );

  const handleFillSubmit = useCallback(() => {
    if (
      !inputBuffer.trim() ||
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      isSubmittingRef.current ||
      !currentSubQuestion
    ) {
      return;
    }
    isSubmittingRef.current = true;

    const cleanUser = Utils.advancedNormalize(inputBuffer, config?.lang);
    const cleanTarget = Utils.advancedNormalize(
      currentSubQuestion.correctAnswer,
      config?.lang
    );

    if (cleanUser === cleanTarget) {
      handleSuccess();
    } else {
      if (attempts < 2) {
        setCheckStatus('wrong_retry');
        setAttempts((a) => a + 1);
        setCombo(1);
        if (showToast) {
          showToast(`Sai rồi! Còn ${2 - attempts} lượt thử.`, 'warning');
        }
        safeSetTimeout(() => {
          if (isMountedRef.current) {
            setCheckStatus('idle');
            if (typeInputRef.current) typeInputRef.current.focus();
          }
          isSubmittingRef.current = false;
        }, 500);
      } else {
        handleFailure();
      }
    }
  }, [
    inputBuffer,
    checkStatus,
    isGenerating,
    currentSubQuestion,
    config?.lang,
    attempts,
    handleSuccess,
    handleFailure,
    showToast,
    safeSetTimeout
  ]);

  const handleSkip = useCallback(() => {
    if (
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      isSubmittingRef.current
    ) {
      return;
    }
    isSubmittingRef.current = true;
    handleFailure();
  }, [checkStatus, isGenerating, handleFailure]);

  // ==========================================================================
  // TỰ ĐỘNG LƯU PHIÊN CHƠI (AUTOSAVE) & THU HỒI ĐẠN KHI THOÁT
  // ==========================================================================
  useEffect(() => {
    latestStateRef.current = {
      score,
      time,
      config,
      isFinished,
      isGenerating,
      passageData,
      subIndex,
      combo,
      playedCount,
      timeLeft,
      correctCount,
      wrongCount
    };
  }, [
    score,
    time,
    config,
    isFinished,
    isGenerating,
    passageData,
    subIndex,
    combo,
    playedCount,
    timeLeft,
    correctCount,
    wrongCount
  ]);

  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      const st = latestStateRef.current;
      if (
        !st.isFinished &&
        st.passageData &&
        onAutoSave &&
        !st.isGenerating
      ) {
        onAutoSave({
          gameType: 'reading',
          score: st.score,
          time: st.time,
          config: st.config,
          readingState: {
            passageData: st.passageData,
            subIndex: st.subIndex,
            combo: st.combo,
            playedCount: st.playedCount,
            timeLeft: st.timeLeft,
            correctCount: st.correctCount,
            wrongCount: st.wrongCount
          }
        });
      }
    }, 5000);

    return () => clearInterval(autoSaveInterval);
  }, [onAutoSave]);

  const handleSaveAndBack = useCallback(() => {
    clearAllTimeouts();

    // Thu hồi tổ kén chưa dùng trong hàng đợi về Túi nháp
    if (queueCoordinatorRef.current && addToRetryBag) {
      const remainingItems = queueCoordinatorRef.current.Drain();
      remainingItems.forEach((item) => {
        if (item && item.passageData) {
          addToRetryBag('reading', item);
        }
      });
    }

    if (!isFinished && passageData && onBack) {
      onBack({
        gameType: 'reading',
        score,
        time,
        config,
        readingState: {
          passageData,
          subIndex,
          combo,
          playedCount,
          timeLeft,
          correctCount,
          wrongCount
        }
      });
    } else if (onBack) {
      onBack(null);
    }
  }, [
    clearAllTimeouts,
    addToRetryBag,
    isFinished,
    passageData,
    onBack,
    score,
    time,
    config,
    subIndex,
    combo,
    playedCount,
    timeLeft,
    correctCount,
    wrongCount
  ]);

  return {
    passageData,
    currentSubQuestion,
    subIndex,
    totalSubQuestions,
    inputBuffer,
    setInputBuffer,
    typeInputRef,
    checkStatus,
    selectedOptionIndex,
    attempts,
    score,
    combo,
    playedCount,
    time,
    timeLeft,
    isFinished,
    isGenerating,
    aiCountdown,
    queueLength,
    correctCount,
    wrongCount,
    resultTimer,
    isResultPaused,
    aiWaitTime,
    handleOptionClick,
    handleFillSubmit,
    handleSkip,
    nextRound,
    handleSaveAndBack,
    onSaveToNotebook,
    isBookmarked,
    toggleResultPause
  };
};

// ============================================================================
// 2. COMPONENT ĐIỀU PHỐI TRÒ CHƠI ĐỌC HIỂU (ReadingGame Wrapper)
// ============================================================================
const ReadingPlayWrapper = (props) => {
  const logic = useReadingLogic(props);
  return (
    <ReadingPlayScreen
      {...logic}
      mainColor={props.mainColor || 'slate'}
      config={props.config}
      onEndGame={props.onEndGame || props.onFinish}
      onBack={logic.handleSaveAndBack}
    />
  );
};

export const ReadingGame = (props) => {
  const [internalConfig, setInternalConfig] = useState(
    () => props.config || props.savedState?.config || null
  );

  const activeConfig = props.config || internalConfig;

  // Nếu chưa có config (chạy độc lập không qua bước Setup của GameView), hiển thị ReadingSetup
  if (!activeConfig && !props.autoResume) {
    return (
      <ReadingSetup
        mainColor={props.mainColor || 'slate'}
        onStart={(newCfg) =>
          setInternalConfig({
            ...newCfg,
            lang: props.lang || 'en',
            level: props.currentLevel || 'level_8_academic',
            topic: props.currentTopic || 'general'
          })
        }
        onBack={() => props.onBack && props.onBack(null)}
      />
    );
  }

  const mergedConfig = {
    sourceMode: 'ai_pure',
    aiMode: true,
    timerMode: true,
    timeLimit: 300,
    lang: props.lang || 'en',
    level: props.currentLevel || 'level_8_academic',
    topic: props.currentTopic || 'general',
    ...(activeConfig || {})
  };

  return <ReadingPlayWrapper {...props} config={mergedConfig} />;
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_24_useReadingLogic = useReadingLogic;
  window.useReadingLogic = useReadingLogic;
  window.Block5_24_ReadingGame = ReadingGame;
  window.ReadingGame = ReadingGame;
}

export default ReadingGame;