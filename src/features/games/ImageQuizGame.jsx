/**
 * @file src/features/games/ImageQuizGame.jsx
 * @description Controller điều phối Mini-game Đoán Hình (Image Quiz) với QueueEngine, 2D Gatekeeper & Fallback.
 * @origin Tầng 5 - Block 5.18 (Image Quiz Game Logic)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Utils } from '@/utils/helpers';
import { pullRetryCardWithLock } from '@/services/db';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';

import {
  calculateGameScore,
  playGameSFX,
  handleExitDiscipline,
  normalizeLevelAndTopic,
  getConfiguredUiCooldown,
  applyAntiStreakShuffle
} from './common/gameHelpers';
import { GameSummaryScreen } from './common/GameSharedUI';
import { ImageQuizSetup, ImageQuizBoard } from './ImageQuizUI';

export const ImageQuizGame = ({
  cards = [],
  lang = 'en',
  apiKey = '',
  settings = {},
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  dataMode = 'vocab',
  setDataMode,
  gameSessions = {},
  setGameSessions,
  globalRetryBag = {},
  addToRetryBag,
  removeFromRetryBag,
  onLogWrong,
  onSaveToHarvest,
  onOpenWordSelector,
  onOpenHanzi,
  speak,
  isMuted = false,
  onBack,
  onMissingKey,
  setIsGamePlaying,
  mainColor = 'blue',
  t
}) => {
  // ============================================================================
  // 1. STATE CẤU HÌNH & TRẠNG THÁI VÒNG ĐỜI GAME
  // ============================================================================
  const [config, setConfig] = useState(() => {
    const saved = Utils.safeJsonParse('fc_imagequiz_config', {});
    return {
      sourceMode: cards.length >= 4 ? (saved.sourceMode || 'local') : 'ai',
      isEndless: saved.isEndless || false,
      totalQuestions: saved.totalQuestions || 20,
      timerEnabled: saved.timerEnabled !== false,
      timeLimit: saved.timeLimit || 20,
      autoSpeak: saved.autoSpeak !== false
    };
  });

  const [status, setStatus] = useState('setup'); // 'setup' | 'loading' | 'playing' | 'summary'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [ammoCount, setAmmoCount] = useState(0);

  // State Bàn chơi hiện tại
  const [currentCard, setCurrentCard] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isChecked, setIsChecked] = useState(false);
  const [wrongFeedback, setWrongFeedback] = useState(null);
  
  const [isExplaining, setIsExplaining] = useState(false);

  // Refs điều phối đa luồng & logic game
  const coordinatorRef = useRef(null);
  const usedTermsRef = useRef(new Set());
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);
  const streakTrackerRef = useRef([]); // Chống lặp vị trí đáp án

  // Lưu cấu hình khi thay đổi
  useEffect(() => {
    Utils.safeLocalStorageSet('fc_imagequiz_config', config);
  }, [config]);

  // Đồng bộ cờ đang chơi lên App
  useEffect(() => {
    if (setIsGamePlaying) {
      setIsGamePlaying(status === 'playing' || status === 'loading');
    }
    return () => {
      if (setIsGamePlaying) setIsGamePlaying(false);
    };
  }, [status, setIsGamePlaying]);

  // Quét số lượng đạn AI dự trữ mỗi 500ms
  useEffect(() => {
    const id = setInterval(() => {
      if (coordinatorRef.current && coordinatorRef.current.queue) {
        const aiItems = coordinatorRef.current.queue.filter((b) => b && b.content && b.content.isAiGenerated);
        setAmmoCount(aiItems.length);
      } else {
        setAmmoCount(0);
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Dọn dẹp khi unmount
  useEffect(() => {
    return () => {
      if (coordinatorRef.current) coordinatorRef.current.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ============================================================================
  // 2. HÀM ĐÓNG GÓI BÀN CHƠI NGOẠI TUYẾN (LOCAL / FALLBACK BOARD BUILDER)
  // ============================================================================
  const buildLocalBoard = useCallback(() => {
    const validDeck = cards.filter((c) => c && c.term && c.definition);
    let selectedItem = null;

    // 1. Rút 1 thẻ từ Túi nháp lỗi sai
    const retryCard = pullRetryCardWithLock('imagequiz', globalRetryBag, lang);
    if (retryCard && retryCard.term && retryCard.definition) {
      selectedItem = retryCard;
    }

    // 2. Lấy thẻ chưa dùng trong bộ bài hiện tại
    if (!selectedItem) {
      let unusedPool = validDeck.filter((c) => !usedTermsRef.current.has(c.term));
      if (unusedPool.length === 0 && validDeck.length > 0) {
        usedTermsRef.current.clear();
        unusedPool = validDeck;
      }
      
      if (unusedPool.length > 0) {
        selectedItem = unusedPool[Math.floor(Math.random() * unusedPool.length)];
      }
    }

    // 3. Fallback cứu hộ
    if (!selectedItem) {
      const { pickedLevel } = normalizeLevelAndTopic(currentLevel, currentTopic, lang);
      const fallbackList = FallbackDataEngine.getGameReadyFallback('imagequiz', lang, pickedLevel, { dataMode });
      return fallbackList;
    }

    usedTermsRef.current.add(selectedItem.term || '');

    const type = Utils.detectSentence(selectedItem.term) ? 'sentence' : 'word';
    const correctOptText = selectedItem.definition;
    
    // Động cơ sinh đáp án nhiễu Offline
    let distTexts = [];
    if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
      try {
        distTexts = GameAlgoEngine.OptionsEngine.offline_generateOptions(correctOptText, validDeck, lang, type, 3, false);
      } catch (e) {
        console.warn("ImageQuiz Offline Option Generation Error:", e);
      }
    }
    
    if (!distTexts || distTexts.length < 3) {
      distTexts = ["Hình ảnh nhiễu 1", "Hình ảnh nhiễu 2", "Hình ảnh nhiễu 3"];
    }

    const correctOpt = { text: correctOptText, isCorrect: true };
    const distractors = distTexts.slice(0, 3).map(d => ({ text: d, isCorrect: false }));
    
    // Áp dụng thuật toán xáo trộn chống Streak
    let shuffledOptions = applyAntiStreakShuffle([...distractors, correctOpt], streakTrackerRef);
    
    // Gắn đường dẫn hình ảnh tìm kiếm từ Bing Image
    shuffledOptions = shuffledOptions.map(opt => {
        let query = opt.text + " isolated clipart";
        if (opt.isCorrect && selectedItem.image_keyword) {
            query = selectedItem.image_keyword + " isolated white background clipart";
        }
        return {
            ...opt,
            image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(query)}&w=300&h=300&c=7&rs=1&p=0`
        };
    });

    return {
      term: selectedItem.term,
      options: shuffledOptions,
      origin: selectedItem,
      isAiGenerated: false
    };
  }, [cards, currentLevel, currentTopic, dataMode, globalRetryBag, lang]);

  // ============================================================================
  // 3. HÀM TẢI ĐẠN AI CHO QUEUE COORDINATOR
  // ============================================================================
  const fetchAiQuestion = useCallback(async () => {
    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(
      currentLevel,
      currentTopic,
      lang
    );

    const meta = {
      id: `imagequiz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'image_quiz', // ExamEngine sẽ ánh xạ sang 'ioe_image_quiz'
      mode: 'minigame',
      lang,
      level: pickedLevel,
      topic: pickedTopic,
      dataMode
    };

    const hydrated = await ExamEngine.hydrateQuestion(meta, apiKey);
    if (hydrated && hydrated.content) {
      if (onSaveToHarvest && hydrated.isNewHarvest) {
        onSaveToHarvest(pickedLevel, hydrated.content.origin || hydrated.content);
      }
      return hydrated;
    }
    throw new Error('Dữ liệu ImageQuiz AI trả về rỗng.');
  }, [apiKey, currentLevel, currentTopic, dataMode, lang, onSaveToHarvest]);

  // ============================================================================
  // 4. NẠP BÀN CHƠI MỚI & ĐỒNG HỒ ĐẾM NGƯỢC
  // ============================================================================
  const startCooldownIfNeeded = useCallback((isAiRound) => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    if (!isAiRound) {
      setCooldownLeft(0);
      return;
    }
    const cdSec = getConfiguredUiCooldown(9);
    setCooldownLeft(cdSec);
    cooldownRef.current = setInterval(() => {
      setCooldownLeft((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const loadQuestionBoard = useCallback(
    (targetIndex) => {
      let nextData = null;

      if (config.sourceMode === 'ai' && coordinatorRef.current) {
        nextData = coordinatorRef.current.pop();
      }

      let qContent = null;
      if (nextData && nextData.content) {
        qContent = nextData.content;
      } else {
        if (config.sourceMode === 'ai' && window.globalShowToast && targetIndex > 0) {
          window.globalShowToast('Đang dùng dữ liệu dự phòng trong lúc đợi AI nạp đạn...', 'warning');
        }
        qContent = buildLocalBoard();
      }
      
      // Đảm bảo Options được xáo trộn chuẩn chống Streak
      if (qContent && Array.isArray(qContent.options)) {
        qContent.options = applyAntiStreakShuffle(qContent.options, streakTrackerRef);
      }

      setCurrentCard(qContent);
      setSelectedOption(null);
      setIsChecked(false);
      setWrongFeedback(null);
      setIsExplaining(false);
      
      if (config.autoSpeak && qContent && qContent.term && speak) {
        speak(qContent.term);
      }
      
      setTimeLeft(config.timerEnabled ? config.timeLimit : null);
      startCooldownIfNeeded(config.sourceMode === 'ai');
    },
    [buildLocalBoard, config.autoSpeak, config.sourceMode, config.timeLimit, config.timerEnabled, speak, startCooldownIfNeeded]
  );

  // Đồng hồ đếm ngược
  useEffect(() => {
    if (status !== 'playing' || !config.timerEnabled || isChecked || timeLeft === null) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timerRef.current);
          playGameSFX('wrong', isMuted);
          setStreak(0);
          setIsChecked(true);
          
          if (currentCard?.origin) {
            if (onLogWrong) onLogWrong(currentCard.origin);
            if (addToRetryBag) addToRetryBag('imagequiz', currentCard.origin);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, config.timerEnabled, isChecked, timeLeft, isMuted, currentCard, onLogWrong, addToRetryBag]);

  // ============================================================================
  // 5. KHỞI ĐỘNG GAME & KHÔI PHỤC PHIÊN CHƠI
  // ============================================================================
  const handleStartGame = () => {
    usedTermsRef.current.clear();
    streakTrackerRef.current = [];
    setCurrentIndex(0);
    setScore(0);
    setStreak(0);
    setCorrectCount(0);

    if (coordinatorRef.current) coordinatorRef.current.destroy();

    if (config.sourceMode === 'ai') {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchAiQuestion, 4);
      setStatus('loading');
      coordinatorRef.current.maintain(true, 22000, false);
    } else {
      loadQuestionBoard(0);
      setStatus('playing');
    }
  };

  const handleLoadingComplete = useCallback(() => {
    loadQuestionBoard(0);
    setStatus('playing');
  }, [loadQuestionBoard]);

  const handleResumeSession = () => {
    const saved = gameSessions?.imagequiz;
    if (!saved) return;

    if (saved.config) setConfig(saved.config);
    setCurrentIndex(saved.currentIndex || 0);
    setScore(saved.score || 0);
    setStreak(saved.streak || 0);
    setCorrectCount(saved.correctCount || 0);

    if (saved.currentCard) {
      setCurrentCard(saved.currentCard);
      setSelectedOption(saved.selectedOption || null);
      setIsChecked(saved.isChecked || false);
      setWrongFeedback(saved.wrongFeedback || null);
      setTimeLeft(saved.timeLeft ?? (config.timerEnabled ? config.timeLimit : null));
      setStatus('playing');
    } else {
      loadQuestionBoard(saved.currentIndex || 0);
      setStatus('playing');
    }
  };

  const handleClearSession = () => {
    if (setGameSessions) {
      setGameSessions((prev) => {
        const next = { ...prev };
        delete next.imagequiz;
        return next;
      });
    }
  };

  // ============================================================================
  // 6. XỬ LÝ TƯƠNG TÁC (CHỌN ĐÁP ÁN)
  // ============================================================================
  const handleSelectOption = (opt) => {
    if (isChecked || !currentCard) return;

    setSelectedOption(opt);
    setIsChecked(true);

    const isCorrect = opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true';

    if (isCorrect) {
      playGameSFX('correct', isMuted);
      const nextStreak = streak + 1;
      const points = calculateGameScore(100, timeLeft || 0, nextStreak, 'normal');
      setStreak(nextStreak);
      setScore(prev => prev + points);
      setCorrectCount(prev => prev + 1);
      
      const targetTerm = currentCard.origin?.term || currentCard.term || '';
      if (removeFromRetryBag) removeFromRetryBag('imagequiz', targetTerm);
      
    } else {
      playGameSFX('wrong', isMuted);
      setStreak(0);
      if (currentCard.origin) {
        if (onLogWrong) onLogWrong(currentCard.origin);
        if (addToRetryBag) addToRetryBag('imagequiz', currentCard.origin);
      }
      setWrongFeedback(currentCard.origin?.explanation || "Vui lòng xem lại nghĩa của từ vựng này.");
    }
  };

  const handleExplainGrammar = async () => {
    if (isExplaining) return;
    if (!apiKey) {
      if (window.globalShowToast) window.globalShowToast("Cần API Key để phân tích!", "warning");
      return;
    }

    setIsExplaining(true);
    try {
      const { pickedLevel } = normalizeLevelAndTopic(currentLevel, currentTopic, lang);
      const targetTerm = currentCard.origin?.term || currentCard.term;
      const res = await Utils.fillCardWithAi(targetTerm, lang, apiKey, ['analysis'], dataMode, [pickedLevel]);
      if (res && res.analysis) {
        setWrongFeedback(res.analysis);
      }
    } catch (e) {
      console.error(e);
      if (window.globalShowToast) window.globalShowToast("Lỗi phân tích: " + e.message, "error");
    } finally {
      setIsExplaining(false);
    }
  };

  // ============================================================================
  // 7. CHUYỂN CÂU & THOÁT GAME
  // ============================================================================
  const handleNextQuestion = () => {
    if (cooldownLeft > 0) return;

    if (!config.isEndless && currentIndex >= config.totalQuestions - 1) {
      handleClearSession();
      if (coordinatorRef.current) coordinatorRef.current.destroy();
      setStatus('summary');
      return;
    }

    const nextIdx = currentIndex + 1;
    setCurrentIndex(nextIdx);
    loadQuestionBoard(nextIdx);
  };

  const handleExitGame = () => {
    if (status === 'playing' && !isChecked) {
      handleExitDiscipline({
        isPlaying: true,
        isAnswered: false,
        currentCard: currentCard?.origin || currentCard,
        gameType: 'imagequiz',
        onLogWrong,
        addToRetryBag
      });

      if (setGameSessions) {
        setGameSessions((prev) => ({
          ...prev,
          imagequiz: {
            config,
            currentIndex,
            score,
            streak,
            correctCount,
            currentCard,
            selectedOption,
            isChecked,
            wrongFeedback,
            timeLeft,
            timestamp: Date.now()
          }
        }));
      }
    }

    if (coordinatorRef.current) coordinatorRef.current.destroy();
    setStatus('setup');
  };

  const handleSaveCurrentWord = () => {
    if (!onOpenWordSelector || !currentCard) return;
    const targetTerm = currentCard.origin?.term || currentCard.term;
    if (targetTerm) onOpenWordSelector(targetTerm);
  };

  const handleOpenHanziCurrent = () => {
    if (!onOpenHanzi || !currentCard) return;
    const targetTerm = currentCard.origin?.term || currentCard.term;
    if (targetTerm) onOpenHanzi(targetTerm);
  };

  // ============================================================================
  // 8. RENDER THEO TRẠNG THÁI
  // ============================================================================
  if (status === 'loading') {
    const { levelLabel } = normalizeLevelAndTopic(currentLevel, currentTopic, lang);
    return (
      <GlobalLoadingScreen
        engine={coordinatorRef.current}
        onComplete={handleLoadingComplete}
        onCancel={() => {
          if (coordinatorRef.current) coordinatorRef.current.destroy();
          setStatus('setup');
        }}
        text="AI Đang Tạo Bàn Chơi Trực Quan..."
        subText="Đang tìm kiếm hình ảnh minh họa cho các đáp án nhiễu"
        mainColor={mainColor}
        levelStr={levelLabel}
      />
    );
  }

  if (status === 'summary') {
    return (
      <GameSummaryScreen
        score={score}
        correctCount={correctCount}
        totalQuestions={currentIndex + 1}
        onRestart={handleStartGame}
        onBack={onBack}
        mainColor={mainColor}
        t={t}
      />
    );
  }

  if (status === 'playing') {
    return (
      <ImageQuizBoard
        currentIndex={currentIndex}
        totalQuestions={config.totalQuestions}
        isEndless={config.isEndless}
        score={score}
        streak={streak}
        timeLeft={timeLeft}
        ammoCount={ammoCount}
        isAiSource={config.sourceMode === 'ai'}
        currentCard={currentCard}
        selectedOption={selectedOption}
        isChecked={isChecked}
        wrongFeedback={wrongFeedback}
        cooldownLeft={cooldownLeft}
        onSelectOption={handleSelectOption}
        onNextQuestion={handleNextQuestion}
        onExplainGrammar={handleExplainGrammar}
        onSpeak={speak}
        onSaveWord={handleSaveCurrentWord}
        onOpenHanzi={handleOpenHanziCurrent}
        onExit={handleExitGame}
        fontFamily={Utils.getFontFamily(settings)}
        lang={lang}
        mainColor={mainColor}
        t={t}
      />
    );
  }

  return (
    <ImageQuizSetup
      config={config}
      setConfig={setConfig}
      cardsCount={cards.length}
      lang={lang}
      currentLevel={currentLevel}
      setCurrentLevel={setCurrentLevel}
      currentTopic={currentTopic}
      setCurrentTopic={setCurrentTopic}
      dataMode={dataMode}
      setDataMode={setDataMode}
      savedSession={gameSessions?.imagequiz}
      onResumeSession={handleResumeSession}
      onClearSession={handleClearSession}
      onStartGame={handleStartGame}
      onBack={onBack}
      onMissingKey={onMissingKey}
      mainColor={mainColor}
      t={t}
    />
  );
};