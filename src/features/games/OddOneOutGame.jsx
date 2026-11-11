/**
 * @file src/features/games/OddOneOutGame.jsx
 * @description Controller điều phối Mini-game Từ Khác Loại (Odd One Out) với QueueEngine & Fallback.
 * @origin Tầng 5 - Block 5.13 (Odd One Out Game Logic)
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
  getConfiguredUiCooldown
} from './common/gameHelpers';
import { GameSummaryScreen } from './common/GameSharedUI';
import { OddOneOutSetup, OddOneOutBoard } from './OddOneOutUI';

export const OddOneOutGame = ({
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
    const saved = Utils.safeJsonParse('fc_oddoneout_config', {});
    return {
      sourceMode: cards.length >= 4 ? (saved.sourceMode || 'local') : 'ai',
      isEndless: saved.isEndless || false,
      totalQuestions: saved.totalQuestions || 20,
      timerEnabled: saved.timerEnabled !== false,
      timeLimit: saved.timeLimit || 20
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

  // Refs điều phối đa luồng & logic game
  const coordinatorRef = useRef(null);
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);

  // Lưu cấu hình khi thay đổi
  useEffect(() => {
    Utils.safeLocalStorageSet('fc_oddoneout_config', config);
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
    let result = null;

    // 1. Thử sinh bằng Thuật toán Offline từ GameAlgoEngine
    if (GameAlgoEngine?.OddOneOutEngine?.offline_generate) {
      result = GameAlgoEngine.OddOneOutEngine.offline_generate(cards, lang);
    }

    // 2. Nếu thuật toán Offline thất bại (không đủ dữ liệu), dùng Fallback
    if (!result || result.isFallback) {
      const { pickedLevel } = normalizeLevelAndTopic(currentLevel, currentTopic, lang);
      const fallbackData = FallbackDataEngine.getGameReadyFallback('oddoneout', lang, pickedLevel);
      if (fallbackData && fallbackData.words && fallbackData.oddWord) {
        result = fallbackData;
      }
    }

    // 3. Cứu hộ tối thiểu nếu mọi thứ đều hỏng
    if (!result) {
      result = {
        words: ["apple", "banana", "orange", "cat"],
        oddWord: "cat",
        explanation: "Hệ thống dự phòng.",
        isAiGenerated: false
      };
    }

    // Đảm bảo mảng luôn được xáo trộn
    if (result.words && Array.isArray(result.words)) {
       result.words = Utils.shuffleArray([...result.words]);
    }

    return { ...result, isAiGenerated: false };
  }, [cards, currentLevel, currentTopic, lang]);

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
      id: `oddoneout_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'odd_one_out', // ExamEngine sẽ ánh xạ sang 'ioe_odd_one_out'
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
    throw new Error('Dữ liệu OddOneOut AI trả về rỗng.');
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

      // Xáo trộn vị trí hiển thị để chống ghi nhớ vị trí
      if (qContent && Array.isArray(qContent.words)) {
         qContent.words = Utils.shuffleArray([...qContent.words]);
      }

      setCurrentCard(qContent);
      setSelectedOption(null);
      setIsChecked(false);
      
      setTimeLeft(config.timerEnabled ? config.timeLimit : null);
      startCooldownIfNeeded(config.sourceMode === 'ai');
    },
    [buildLocalBoard, config.sourceMode, config.timeLimit, config.timerEnabled, startCooldownIfNeeded]
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
          
          if (currentCard?.originCards && Array.isArray(currentCard.originCards)) {
             currentCard.originCards.forEach(c => {
                 if (onLogWrong) onLogWrong(c);
             });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, config.timerEnabled, isChecked, timeLeft, isMuted, currentCard, onLogWrong]);

  // ============================================================================
  // 5. KHỞI ĐỘNG GAME & KHÔI PHỤC PHIÊN CHƠI
  // ============================================================================
  const handleStartGame = () => {
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
    const saved = gameSessions?.oddoneout;
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
        delete next.oddoneout;
        return next;
      });
    }
  };

  // ============================================================================
  // 6. XỬ LÝ TƯƠNG TÁC (CHỌN ĐÁP ÁN)
  // ============================================================================
  const handleSelectOption = (wordStr) => {
    if (isChecked || !currentCard) return;

    setSelectedOption(wordStr);
    setIsChecked(true);

    const isCorrect = wordStr === currentCard.oddWord;

    if (isCorrect) {
      playGameSFX('correct', isMuted);
      const nextStreak = streak + 1;
      const points = calculateGameScore(100, timeLeft || 0, nextStreak, 'normal');
      setStreak(nextStreak);
      setScore(prev => prev + points);
      setCorrectCount(prev => prev + 1);
      
    } else {
      playGameSFX('wrong', isMuted);
      setStreak(0);
      // Áp dụng phạt kỷ luật cho tất cả các thẻ trong câu này nếu sai
      if (currentCard.originCards && Array.isArray(currentCard.originCards)) {
          currentCard.originCards.forEach(c => {
             if (onLogWrong) onLogWrong(c);
          });
      }
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
        gameType: 'oddoneout',
        onLogWrong,
        addToRetryBag
      });

      if (setGameSessions) {
        setGameSessions((prev) => ({
          ...prev,
          oddoneout: {
            config,
            currentIndex,
            score,
            streak,
            correctCount,
            currentCard,
            selectedOption,
            isChecked,
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
    const targetTerm = Array.isArray(currentCard.words) ? currentCard.words.join(' ') : "";
    if (targetTerm) onOpenWordSelector(targetTerm);
  };

  const handleOpenHanziCurrent = () => {
    if (!onOpenHanzi || !currentCard) return;
    const targetTerm = Array.isArray(currentCard.words) ? currentCard.words.join('') : "";
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
        text="AI Đang Phân Tích Logic Từ Vựng..."
        subText="Đang gom nhóm và tạo lập từ khác loại"
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
      <OddOneOutBoard
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
        cooldownLeft={cooldownLeft}
        onSelectOption={handleSelectOption}
        onNextQuestion={handleNextQuestion}
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
    <OddOneOutSetup
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
      savedSession={gameSessions?.oddoneout}
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