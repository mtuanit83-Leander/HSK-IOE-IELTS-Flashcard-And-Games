/**
 * @file src/features/games/ScrambleGame.jsx
 * @description Controller điều phối Mini-game Ghép Câu (Scramble Game) tích hợp QueueEngine & Fallback.
 * @origin Tầng 5 - Block 5.4 (Scramble Game Logic)
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
import { ScrambleSetup, ScrambleBoard } from './ScrambleUI';

export const ScrambleGame = ({
  cards = [],
  lang = 'en',
  apiKey = '',
  settings = {},
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  dataMode = 'sentence', // Mặc định là câu văn cho game này
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
    const saved = Utils.safeJsonParse('fc_scramble_config', {});
    return {
      sourceMode: cards.length >= 1 ? (saved.sourceMode || 'local') : 'ai',
      difficulty: saved.difficulty || 'easy',
      inputMethod: saved.inputMethod || 'tap', // 'tap' | 'type'
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
  const [poolTokens, setPoolTokens] = useState([]);
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  
  const [answerStatus, setAnswerStatus] = useState(null); // null | 'correct' | 'wrong'
  const [grammarExplanation, setGrammarExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);

  // Refs điều phối đa luồng
  const coordinatorRef = useRef(null);
  const usedTermsRef = useRef(new Set());
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);

  // Lưu cấu hình khi thay đổi
  useEffect(() => {
    Utils.safeLocalStorageSet('fc_scramble_config', config);
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
    const retryCard = pullRetryCardWithLock('scramble', globalRetryBag, lang);
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
      const fallbackList = FallbackDataEngine.getGameReadyFallback('scramble', lang, pickedLevel, { dataMode });
      selectedItem = fallbackList?.origin || { term: "Error fallback", definition: "Lỗi dữ liệu", _isRescued: true };
    }

    usedTermsRef.current.add(selectedItem.term || '');

    // Tạo mảnh ghép (Parts)
    let parts = [];
    const isChinese = lang === 'zh';
    const isSentence = Utils.detectSentence(selectedItem.term);
    const type = isSentence ? 'sentence' : 'word';
    
    const cleanAndLower = (textArr) => textArr.map(p => { 
      let cleaned = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); 
      if (!isChinese) cleaned = cleaned.toLowerCase(); 
      return cleaned; 
    }).filter(p => p.trim() !== "");
    
    if (isChinese) {
      parts = (selectedItem.term || '').split('');
    } else {
      parts = isSentence ? (selectedItem.term || '').split(' ') : (selectedItem.term || '').split('');
    }
    
    parts = cleanAndLower(parts);

    // Bơm rác (Noise) nếu ở chế độ Hard
    if (config.difficulty === 'hard') {
      let targetCount = 2;
      const len = parts.length;
      if (len >= 5 && len <= 10) targetCount = Math.floor(Math.random() * 2) + 4;
      else if (len > 10) targetCount = Math.floor(Math.random() * 3) + 5;
      
      const noiseWords = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(selectedItem.term, validDeck, lang, type, targetCount);
      if (noiseWords && noiseWords.length > 0) {
        let finalNoiseWords = [];
        if (isChinese || type === 'word') {
          noiseWords.forEach(w => { const cleanW = String(w).replace(/\s/g, ''); finalNoiseWords.push(...cleanW.split('')); });
        } else {
          finalNoiseWords = noiseWords;
        }
        finalNoiseWords = cleanAndLower(finalNoiseWords).slice(0, targetCount);
        parts.push(...finalNoiseWords);
      }
    }

    return {
      origin: selectedItem,
      parts: Utils.shuffleArray(parts),
      isAiGenerated: false
    };
  }, [cards, config.difficulty, currentLevel, currentTopic, dataMode, globalRetryBag, lang]);

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
      id: `scramble_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'scramble',
      mode: 'minigame',
      lang,
      level: pickedLevel,
      topic: pickedTopic,
      difficulty: config.difficulty,
      inputMethod: config.inputMethod,
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
    throw new Error('Dữ liệu Scramble AI trả về rỗng.');
  }, [apiKey, config.difficulty, config.grammarId, config.inputMethod, currentLevel, currentTopic, dataMode, lang, onSaveToHarvest]);

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

      setCurrentCard(qContent);
      
      // Khởi tạo mảng poolTokens (có ID duy nhất để React render đúng key)
      if (qContent && qContent.parts) {
        setPoolTokens(qContent.parts.map((t, idx) => ({ id: `pt_${idx}_${Date.now()}`, text: t })));
      } else {
        setPoolTokens([]);
      }
      
      setSelectedTokens([]);
      setTypedAnswer('');
      setAnswerStatus(null);
      setGrammarExplanation('');
      setIsExplaining(false);
      
      setTimeLeft(config.timerEnabled ? config.timeLimit : null);
      startCooldownIfNeeded(config.sourceMode === 'ai');
    },
    [buildLocalBoard, config.sourceMode, config.timeLimit, config.timerEnabled, startCooldownIfNeeded]
  );

  // Đồng hồ đếm ngược
  useEffect(() => {
    if (status !== 'playing' || !config.timerEnabled || answerStatus !== null || timeLeft === null) {
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
          setAnswerStatus('wrong');
          
          if (currentCard?.origin) {
            if (onLogWrong) onLogWrong(currentCard.origin);
            if (addToRetryBag) addToRetryBag('scramble', currentCard.origin);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, config.timerEnabled, answerStatus, timeLeft, isMuted, currentCard, onLogWrong, addToRetryBag]);

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
    const saved = gameSessions?.scramble;
    if (!saved) return;

    if (saved.config) setConfig(saved.config);
    setCurrentIndex(saved.currentIndex || 0);
    setScore(saved.score || 0);
    setStreak(saved.streak || 0);
    setCorrectCount(saved.correctCount || 0);

    if (saved.currentCard) {
      setCurrentCard(saved.currentCard);
      setPoolTokens(saved.poolTokens || []);
      setSelectedTokens(saved.selectedTokens || []);
      setTypedAnswer(saved.typedAnswer || '');
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
        delete next.scramble;
        return next;
      });
    }
  };

  // ============================================================================
  // 6. XỬ LÝ TƯƠNG TÁC (SCRAMBLE LOGIC)
  // ============================================================================
  const handleSelectPoolToken = (token) => {
    if (answerStatus !== null) return;
    playGameSFX('click', isMuted);
    setSelectedTokens(prev => [...prev, token]);
  };

  const handleRemoveSelectedToken = (token, indexToRemove) => {
    if (answerStatus !== null) return;
    playGameSFX('click', isMuted);
    setSelectedTokens(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleClearSelected = () => {
    if (answerStatus !== null) return;
    setSelectedTokens([]);
  };

  const cleanStringForComparison = (str) => {
    if (!str) return "";
    return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").trim();
  };

  const handleCheckAnswer = () => {
    if (answerStatus !== null || !currentCard) return;

    let userAnswer = '';
    if (config.inputMethod === 'type') {
      userAnswer = typedAnswer;
    } else {
      userAnswer = selectedTokens.map(t => t.text).join(lang === 'zh' ? '' : ' ');
    }

    const targetTerm = currentCard.origin?.term || currentCard.term || '';
    
    const isCorrect = cleanStringForComparison(userAnswer) === cleanStringForComparison(targetTerm);

    if (isCorrect) {
      playGameSFX('correct', isMuted);
      setAnswerStatus('correct');
      const nextStreak = streak + 1;
      const points = calculateGameScore(100, timeLeft || 0, nextStreak, config.difficulty);
      setStreak(nextStreak);
      setScore(prev => prev + points);
      setCorrectCount(prev => prev + 1);

      if (removeFromRetryBag) removeFromRetryBag('scramble', targetTerm);
    } else {
      playGameSFX('wrong', isMuted);
      setAnswerStatus('wrong');
      setStreak(0);
      if (currentCard.origin) {
        if (onLogWrong) onLogWrong(currentCard.origin);
        if (addToRetryBag) addToRetryBag('scramble', currentCard.origin);
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
      const targetTerm = currentCard.origin?.term || currentCard.term;
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
    if (status === 'playing' && answerStatus === null) {
      handleExitDiscipline({
        isPlaying: true,
        isAnswered: false,
        currentCard: currentCard?.origin || currentCard,
        gameType: 'scramble',
        onLogWrong,
        addToRetryBag
      });

      if (setGameSessions) {
        setGameSessions((prev) => ({
          ...prev,
          scramble: {
            config,
            currentIndex,
            score,
            streak,
            correctCount,
            currentCard,
            poolTokens,
            selectedTokens,
            typedAnswer,
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
        text="AI Đang Tạo Câu Hỏi Ghép Câu..."
        subText="Đang trộn mảnh ghép và cài đặt bẫy ngữ pháp"
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
      <ScrambleBoard
        currentIndex={currentIndex}
        totalQuestions={config.totalQuestions}
        isEndless={config.isEndless}
        score={score}
        streak={streak}
        timeLeft={timeLeft}
        ammoCount={ammoCount}
        isAiSource={config.sourceMode === 'ai'}
        currentCard={currentCard}
        inputMethod={config.inputMethod}
        poolTokens={poolTokens}
        selectedTokens={selectedTokens}
        typedAnswer={typedAnswer}
        setTypedAnswer={setTypedAnswer}
        answerStatus={answerStatus}
        grammarExplanation={grammarExplanation}
        isExplaining={isExplaining}
        cooldownLeft={cooldownLeft}
        onSelectPoolToken={handleSelectPoolToken}
        onRemoveSelectedToken={handleRemoveSelectedToken}
        onClearSelected={handleClearSelected}
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
    <ScrambleSetup
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
      savedSession={gameSessions?.scramble}
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