/**
 * @file src/features/games/SpotMistakeGame.jsx
 * @description Controller điều phối Mini-game Tìm Lỗi Sai (Spot Mistake) với QueueEngine & Fallback.
 * @origin Tầng 5 - Block 5.11 (Spot Mistake Game Logic)
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
import { SpotMistakeSetup, SpotMistakeBoard } from './SpotMistakeUI';

export const SpotMistakeGame = ({
  cards = [],
  lang = 'en',
  apiKey = '',
  settings = {},
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  dataMode = 'sentence', // Mặc định Tìm lỗi sai dùng câu văn
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
    const saved = Utils.safeJsonParse('fc_spotmistake_config', {});
    return {
      sourceMode: cards.length >= 1 ? (saved.sourceMode || 'local') : 'ai',
      difficulty: saved.difficulty || 'normal',
      grammarId: saved.grammarId || '',
      isEndless: saved.isEndless || false,
      totalQuestions: saved.totalQuestions || 20,
      timerEnabled: saved.timerEnabled !== false,
      timeLimit: saved.timeLimit || 45
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
  const [sentenceWords, setSentenceWords] = useState([]);
  const [selectedWordIndex, setSelectedWordIndex] = useState(null);
  
  const [isChecked, setIsChecked] = useState(false);
  const [answerStatus, setAnswerStatus] = useState(null); // null | 'correct' | 'wrong'
  const [grammarExplanation, setGrammarExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);

  // Refs điều phối đa luồng & logic game
  const coordinatorRef = useRef(null);
  const usedTermsRef = useRef(new Set());
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);

  // Lưu cấu hình khi thay đổi
  useEffect(() => {
    Utils.safeLocalStorageSet('fc_spotmistake_config', config);
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
    const retryCard = pullRetryCardWithLock('spotmistake', globalRetryBag, lang);
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
      const fallbackList = FallbackDataEngine.getGameReadyFallback('spotmistake', lang, pickedLevel, { dataMode });
      return fallbackList;
    }

    usedTermsRef.current.add(selectedItem.term || '');

    const type = Utils.detectSentence(selectedItem.term) ? 'sentence' : 'word';
    let distortedResult = null;

    // Động cơ bóp méo Offline (Sử dụng GameAlgoEngine)
    if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
      try {
        distortedResult = GameAlgoEngine.DistortionEngine.offline_distort(selectedItem.term, lang, type);
      } catch (e) {
        console.warn("SpotMistake Offline Distortion Error:", e);
      }
    }
    
    // Fallback nếu thuật toán trên thất bại
    if (!distortedResult) {
      distortedResult = {
        wrongSentence: selectedItem.term + "x",
        wrongWord: selectedItem.term + "x",
        correction: selectedItem.term,
        explanation: "Lỗi hình thái (Dự phòng)"
      };
    }

    return {
      wrongSentence: distortedResult.wrongSentence,
      wrongWord: distortedResult.wrongWord,
      correction: distortedResult.correction,
      explanation: distortedResult.explanation || selectedItem.definition,
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
      id: `spotmistake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'spot_mistake', // Sẽ được ánh xạ thành 'ioe_spot_mistake' trong ExamEngine
      mode: 'minigame',
      lang,
      level: pickedLevel,
      topic: pickedTopic,
      difficulty: config.difficulty,
      grammarId: config.grammarId,
      dataMode
    };

    const hydrated = await ExamEngine.hydrateQuestion(meta, apiKey);
    if (hydrated && hydrated.content) {
      if (onSaveToHarvest && hydrated.isNewHarvest) {
        onSaveToHarvest(pickedLevel, hydrated.content.origin || hydrated.content);
      }
      return hydrated;
    }
    throw new Error('Dữ liệu SpotMistake AI trả về rỗng.');
  }, [apiKey, config.difficulty, config.grammarId, currentLevel, currentTopic, dataMode, lang, onSaveToHarvest]);

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

  const parseSentenceToWords = (sentenceStr, targetLang) => {
    if (!sentenceStr) return [];
    
    if (targetLang === 'zh') {
      // Tiếng Trung: băm theo từng ký tự, lọc bỏ khoảng trắng
      return Array.from(sentenceStr).map((char, idx) => ({
        id: `w_${idx}`,
        original: char,
        display: char
      })).filter(item => item.original.trim() !== '');
    } else {
      // Tiếng Anh: băm theo khoảng trắng
      return sentenceStr.split(' ').map((word, idx) => ({
        id: `w_${idx}`,
        original: word,
        display: word
      })).filter(item => item.original.trim() !== '');
    }
  };

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

      setCurrentCard(qContent);
      
      // Phân tách câu sai thành các mảnh chữ có thể click
      const words = parseSentenceToWords(qContent.wrongSentence, lang);
      setSentenceWords(words);
      
      setSelectedWordIndex(null);
      setIsChecked(false);
      setAnswerStatus(null);
      setGrammarExplanation('');
      setIsExplaining(false);
      
      setTimeLeft(config.timerEnabled ? config.timeLimit : null);
      startCooldownIfNeeded(config.sourceMode === 'ai');
    },
    [buildLocalBoard, config.sourceMode, config.timeLimit, config.timerEnabled, lang, startCooldownIfNeeded]
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
          setAnswerStatus('wrong');
          
          if (currentCard?.origin) {
            if (onLogWrong) onLogWrong(currentCard.origin);
            if (addToRetryBag) addToRetryBag('spotmistake', currentCard.origin);
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
    const saved = gameSessions?.spotmistake;
    if (!saved) return;

    if (saved.config) setConfig(saved.config);
    setCurrentIndex(saved.currentIndex || 0);
    setScore(saved.score || 0);
    setStreak(saved.streak || 0);
    setCorrectCount(saved.correctCount || 0);

    if (saved.currentCard) {
      setCurrentCard(saved.currentCard);
      setSentenceWords(saved.sentenceWords || []);
      setSelectedWordIndex(saved.selectedWordIndex ?? null);
      setIsChecked(saved.isChecked || false);
      setAnswerStatus(saved.answerStatus || null);
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
        delete next.spotmistake;
        return next;
      });
    }
  };

  // ============================================================================
  // 6. XỬ LÝ TƯƠNG TÁC (CHỌN TỪ & KIỂM TRA)
  // ============================================================================
  const handleSelectWord = (index) => {
    if (isChecked) return;
    playGameSFX('click', isMuted);
    setSelectedWordIndex(index);
  };

  const handleCheckAnswer = () => {
    if (isChecked || selectedWordIndex === null || !currentCard) return;

    setIsChecked(true);
    
    const selectedWordObj = sentenceWords[selectedWordIndex];
    if (!selectedWordObj) return;

    const targetWrongWord = currentCard.wrongWord || '';
    
    // Kiểm tra xem từ được chọn có chứa từ bị sai không (Fuzzy match nhẹ)
    const isCorrect = targetWrongWord && selectedWordObj.original.toLowerCase().includes(targetWrongWord.toLowerCase());

    if (isCorrect) {
      playGameSFX('correct', isMuted);
      setAnswerStatus('correct');
      const nextStreak = streak + 1;
      const points = calculateGameScore(100, timeLeft || 0, nextStreak, config.difficulty);
      setStreak(nextStreak);
      setScore(prev => prev + points);
      setCorrectCount(prev => prev + 1);
      
      const targetTerm = currentCard.origin?.term || currentCard.wrongSentence || '';
      if (removeFromRetryBag) removeFromRetryBag('spotmistake', targetTerm);
      
    } else {
      playGameSFX('wrong', isMuted);
      setAnswerStatus('wrong');
      setStreak(0);
      if (currentCard.origin) {
        if (onLogWrong) onLogWrong(currentCard.origin);
        if (addToRetryBag) addToRetryBag('spotmistake', currentCard.origin);
      }
    }
  };

  const handleExplainGrammar = async () => {
    if (isExplaining || grammarExplanation) return;
    if (!apiKey) {
      if (window.globalShowToast) window.globalShowToast("Cần API Key để phân tích!", "warning");
      return;
    }

    setIsExplaining(true);
    try {
      const { pickedLevel } = normalizeLevelAndTopic(currentLevel, currentTopic, lang);
      const targetTerm = currentCard.correction ? currentCard.wrongSentence.replace(currentCard.wrongWord, currentCard.correction) : (currentCard.origin?.term || currentCard.wrongSentence);
      
      const res = await Utils.fillCardWithAi(targetTerm, lang, apiKey, ['analysis'], dataMode, [pickedLevel]);
      if (res && res.analysis) {
        setGrammarExplanation(res.analysis);
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
        gameType: 'spotmistake',
        onLogWrong,
        addToRetryBag
      });

      if (setGameSessions) {
        setGameSessions((prev) => ({
          ...prev,
          spotmistake: {
            config,
            currentIndex,
            score,
            streak,
            correctCount,
            currentCard,
            sentenceWords,
            selectedWordIndex,
            isChecked,
            answerStatus,
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
    const targetTerm = currentCard.origin?.term || currentCard.wrongSentence;
    if (targetTerm) onOpenWordSelector(targetTerm);
  };

  const handleOpenHanziCurrent = () => {
    if (!onOpenHanzi || !currentCard) return;
    const targetTerm = currentCard.wrongSentence || currentCard.origin?.term;
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
        text="AI Đang Tạo Câu Hỏi Tìm Lỗi Sai..."
        subText="Đang chọn vị trí đục lỗ và cấy ghép lỗi ngữ pháp"
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
      <SpotMistakeBoard
        currentIndex={currentIndex}
        totalQuestions={config.totalQuestions}
        isEndless={config.isEndless}
        score={score}
        streak={streak}
        timeLeft={timeLeft}
        ammoCount={ammoCount}
        isAiSource={config.sourceMode === 'ai'}
        currentCard={currentCard}
        sentenceWords={sentenceWords}
        selectedWordIndex={selectedWordIndex}
        isChecked={isChecked}
        answerStatus={answerStatus}
        grammarExplanation={grammarExplanation}
        isExplaining={isExplaining}
        cooldownLeft={cooldownLeft}
        onSelectWord={handleSelectWord}
        onCheckAnswer={handleCheckAnswer}
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
    <SpotMistakeSetup
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
      savedSession={gameSessions?.spotmistake}
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