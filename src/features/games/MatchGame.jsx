/**
 * @file src/features/games/MatchGame.jsx
 * @description Controller điều phối Mini-game Nối Ô (Match Game) với Batch Queue Coordinator & Offline/AI Hybrid Fallback.
 * @origin Tầng 5 - Block 5.2 (Match Game Logic)
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
import { MatchSetup, MatchBoard } from './MatchUI';

export const MatchGame = ({
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
    const saved = Utils.safeJsonParse('fc_match_config', {});
    return {
      sourceMode: cards.length >= 4 ? (saved.sourceMode || 'local') : 'ai',
      difficulty: saved.difficulty || 'easy',
      isEndless: saved.isEndless || false,
      maxRounds: saved.maxRounds || 5,
      timerEnabled: saved.timerEnabled !== false,
      timeLimit: saved.timeLimit || 60,
      autoSpeak: saved.autoSpeak !== false
    };
  });

  const [status, setStatus] = useState('setup'); // 'setup' | 'loading' | 'playing' | 'summary'
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [ammoCount, setAmmoCount] = useState(0);

  // State Bàn chơi hiện tại
  const [boardData, setBoardData] = useState({
    pairs: [],
    leftItems: [],
    rightItems: [],
    isAiGenerated: false
  });
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [matchedLeftIds, setMatchedLeftIds] = useState([]);
  const [matchedRightIds, setMatchedRightIds] = useState([]);
  const [wrongPair, setWrongPair] = useState(null);
  const [trapFeedback, setTrapFeedback] = useState(null);
  const [isRoundComplete, setIsRoundComplete] = useState(false);

  // Refs điều phối đa luồng
  const coordinatorRef = useRef(null);
  const usedTermsRef = useRef(new Set());
  const timerRef = useRef(null);
  const cooldownRef = useRef(null);

  // Lưu cấu hình khi thay đổi
  useEffect(() => {
    Utils.safeLocalStorageSet('fc_match_config', config);
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
        const aiItems = coordinatorRef.current.queue.filter((b) => b && b.isAiGenerated);
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
    const targetCount = config.difficulty === 'hard' ? 4 : 5;
    const validDeck = cards.filter((c) => c && c.term && c.definition);

    let selectedCards = [];

    // 1. Ưu tiên rút 1 thẻ từ Túi nháp lỗi sai (Atomic Retry Puller)
    const retryCard = pullRetryCardWithLock('match', globalRetryBag, lang);
    if (retryCard && retryCard.term && retryCard.definition) {
      selectedCards.push(retryCard);
      usedTermsRef.current.add(retryCard.term);
    }

    // 2. Lấy các thẻ chưa dùng trong bộ bài hiện tại
    let unusedPool = validDeck.filter((c) => !usedTermsRef.current.has(c.term));
    if (unusedPool.length < targetCount - selectedCards.length) {
      usedTermsRef.current.clear();
      unusedPool = validDeck.filter(
        (c) => !selectedCards.some((s) => s.term === c.term)
      );
    }

    const shuffledPool = Utils.shuffleArray(unusedPool);
    for (const c of shuffledPool) {
      if (selectedCards.length >= targetCount) break;
      selectedCards.push(c);
      usedTermsRef.current.add(c.term);
    }

    // 3. Nếu bộ bài không đủ thẻ -> Gọi FallbackDataEngine cứu hộ
    if (selectedCards.length < targetCount) {
      const { pickedLevel } = normalizeLevelAndTopic(currentLevel, currentTopic, lang);
      return FallbackDataEngine.getGameReadyFallback('match', lang, pickedLevel, {
        difficulty: config.difficulty,
        dataMode
      });
    }

    // 4. Tạo 2 ô bẫy nếu ở chế độ Khó (Hard Mode)
    const trapCards = [];
    if (config.difficulty === 'hard') {
      const trapSources = Utils.shuffleArray([...selectedCards]).slice(0, 2);
      trapSources.forEach((src) => {
        const type = Utils.detectSentence(src.term) ? 'sentence' : 'word';
        const distRes = GameAlgoEngine.DistortionEngine.offline_distort(
          src.term,
          lang,
          type
        );
        const distorted =
          (type === 'word' ? distRes.wrongWord : distRes.wrongSentence) ||
          src.term + 's';
        trapCards.push({
          term: distorted,
          distortedTerm: distorted,
          definition: src.definition,
          originalTerm: src.term,
          explanation: distRes.explanation || 'Bẫy chính tả / ngữ pháp.'
        });
      });
    }

    const leftItems = Utils.shuffleArray(
      selectedCards.map((c, idx) => ({
        id: `left_${idx}_${Date.now()}`,
        term: c.term,
        definition: c.definition,
        isTrap: false,
        origin: c
      }))
    );

    const rightRaw = [
      ...selectedCards.map((c, idx) => ({
        id: `right_real_${idx}_${Date.now()}`,
        term: c.term,
        isTrap: false,
        origin: c
      })),
      ...trapCards.map((tItem, idx) => ({
        id: `right_trap_${idx}_${Date.now()}`,
        term: tItem.distortedTerm,
        isTrap: true,
        originalTerm: tItem.originalTerm,
        explanation: tItem.explanation
      }))
    ];

    return {
      pairs: selectedCards,
      leftItems,
      rightItems: Utils.shuffleArray(rightRaw),
      isAiGenerated: false
    };
  }, [cards, config.difficulty, currentLevel, currentTopic, dataMode, globalRetryBag, lang]);

  // ============================================================================
  // 3. HÀM TẢI ĐẠN AI CHO BATCH QUEUE COORDINATOR
  // ============================================================================
  const fetchAiBatchBoard = useCallback(async () => {
    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(
      currentLevel,
      currentTopic,
      lang
    );

    const meta = {
      id: `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'match',
      mode: 'minigame',
      lang,
      level: pickedLevel,
      topic: pickedTopic,
      difficulty: config.difficulty,
      hardMode: config.difficulty === 'hard',
      dataMode
    };

    const hydrated = await ExamEngine.hydrateQuestion(meta, apiKey);
    if (hydrated && hydrated.content) {
      // Lưu vào Kho thu hoạch AI nếu có
      if (onSaveToHarvest && Array.isArray(hydrated.content.pairs)) {
        hydrated.content.pairs.forEach((p) => {
          onSaveToHarvest(pickedLevel, p);
        });
      }
      return hydrated.content;
    }
    throw new Error('Dữ liệu bàn chơi Nối ô AI trả về rỗng.');
  }, [apiKey, config.difficulty, currentLevel, currentTopic, dataMode, lang, onSaveToHarvest]);

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

  const loadRoundBoard = useCallback(
    (targetRound) => {
      let nextBoard = null;

      if (config.sourceMode === 'ai' && coordinatorRef.current) {
        nextBoard = coordinatorRef.current.pop();
      }

      if (!nextBoard || !Array.isArray(nextBoard.leftItems) || nextBoard.leftItems.length === 0) {
        if (config.sourceMode === 'ai' && window.globalShowToast && targetRound > 1) {
          window.globalShowToast('Đang dùng bàn chơi dự phòng trong lúc đợi AI nạp đạn...', 'warning');
        }
        nextBoard = buildLocalBoard();
      }

      setBoardData(nextBoard);
      setSelectedLeft(null);
      setSelectedRight(null);
      setMatchedLeftIds([]);
      setMatchedRightIds([]);
      setWrongPair(null);
      setTrapFeedback(null);
      setIsRoundComplete(false);
      setTimeLeft(config.timerEnabled ? config.timeLimit : null);
      startCooldownIfNeeded(config.sourceMode === 'ai');
    },
    [buildLocalBoard, config.sourceMode, config.timeLimit, config.timerEnabled, startCooldownIfNeeded]
  );

  // Đồng hồ đếm ngược mỗi màn
  useEffect(() => {
    if (status !== 'playing' || !config.timerEnabled || isRoundComplete || timeLeft === null) {
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
          setIsRoundComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, config.timerEnabled, isRoundComplete, timeLeft, isMuted]);

  // ============================================================================
  // 5. KHỞI ĐỘNG GAME & KHÔI PHỤC PHIÊN CHƠI
  // ============================================================================
  const handleStartGame = async () => {
    usedTermsRef.current.clear();
    setRound(1);
    setScore(0);
    setStreak(0);
    setCorrectCount(0);
    setTotalAnswered(0);

    if (coordinatorRef.current) coordinatorRef.current.destroy();

    if (config.sourceMode === 'ai') {
      coordinatorRef.current = QueueEngine.createBatchQueueCoordinator(fetchAiBatchBoard, 2);
      setStatus('loading');
      coordinatorRef.current.maintain(true, 22000, false);
    } else {
      loadRoundBoard(1);
      setStatus('playing');
    }
  };

  const handleLoadingComplete = useCallback(() => {
    loadRoundBoard(1);
    setStatus('playing');
  }, [loadRoundBoard]);

  const handleResumeSession = () => {
    const saved = gameSessions?.match;
    if (!saved) return;

    if (saved.config) setConfig(saved.config);
    setRound(saved.round || 1);
    setScore(saved.score || 0);
    setStreak(saved.streak || 0);
    setCorrectCount(saved.correctCount || 0);
    setTotalAnswered(saved.totalAnswered || 0);

    if (saved.boardData && Array.isArray(saved.boardData.leftItems)) {
      setBoardData(saved.boardData);
      setMatchedLeftIds(saved.matchedLeftIds || []);
      setMatchedRightIds(saved.matchedRightIds || []);
      setIsRoundComplete(false);
      setTimeLeft(saved.timeLeft ?? (config.timerEnabled ? config.timeLimit : null));
      setStatus('playing');
    } else {
      loadRoundBoard(saved.round || 1);
      setStatus('playing');
    }
  };

  const handleClearSession = () => {
    if (setGameSessions) {
      setGameSessions((prev) => {
        const next = { ...prev };
        delete next.match;
        return next;
      });
    }
  };

  // ============================================================================
  // 6. XỬ LÝ TƯƠNG TÁC CHỌN & NỐI Ô
  // ============================================================================
  const evaluateMatch = useCallback(
    (leftItem, rightItem) => {
      if (!leftItem || !rightItem) return;

      setTotalAnswered((prev) => prev + 1);

      // Kiểm tra nếu chọn trúng Ô Bẫy (Hard Mode)
      if (rightItem.isTrap) {
        playGameSFX('wrong', isMuted);
        setStreak(0);
        setWrongPair({ leftId: leftItem.id, rightId: rightItem.id });
        setTrapFeedback({
          term: rightItem.term,
          originalTerm: rightItem.originalTerm || leftItem.term,
          explanation: rightItem.explanation
        });

        if (leftItem.origin) {
          if (onLogWrong) onLogWrong(leftItem.origin);
          if (addToRetryBag) addToRetryBag('match', leftItem.origin);
        }

        setTimeout(() => {
          setWrongPair(null);
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 750);
        return;
      }

      // Kiểm tra khớp từ vựng
      const isCorrectMatch =
        leftItem.term.trim().toLowerCase() === rightItem.term.trim().toLowerCase();

      if (isCorrectMatch) {
        playGameSFX('correct', isMuted);
        setTrapFeedback(null);

        if (config.autoSpeak && speak) {
          speak(rightItem.term);
        }

        if (removeFromRetryBag) {
          removeFromRetryBag('match', leftItem.term);
        }

        const nextStreak = streak + 1;
        const pointsEarned = calculateGameScore(
          25,
          timeLeft || 0,
          nextStreak,
          config.difficulty
        );

        setStreak(nextStreak);
        setScore((prev) => prev + pointsEarned);
        setCorrectCount((prev) => prev + 1);

        const nextMatchedLeft = [...matchedLeftIds, leftItem.id];
        const nextMatchedRight = [...matchedRightIds, rightItem.id];
        setMatchedLeftIds(nextMatchedLeft);
        setMatchedRightIds(nextMatchedRight);
        setSelectedLeft(null);
        setSelectedRight(null);

        const totalValidLeft = boardData.leftItems.filter((i) => !i.isTrap).length;
        if (nextMatchedLeft.length >= totalValidLeft) {
          playGameSFX('finish', isMuted);
          setIsRoundComplete(true);
        }
      } else {
        playGameSFX('wrong', isMuted);
        setStreak(0);
        setWrongPair({ leftId: leftItem.id, rightId: rightItem.id });

        if (leftItem.origin) {
          if (onLogWrong) onLogWrong(leftItem.origin);
          if (addToRetryBag) addToRetryBag('match', leftItem.origin);
        }

        setTimeout(() => {
          setWrongPair(null);
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 650);
      }
    },
    [
      addToRetryBag,
      boardData.leftItems,
      config.autoSpeak,
      config.difficulty,
      isMuted,
      matchedLeftIds,
      matchedRightIds,
      onLogWrong,
      removeFromRetryBag,
      speak,
      streak,
      timeLeft
    ]
  );

  const handleSelectLeft = (item) => {
    if (matchedLeftIds.includes(item.id) || wrongPair) return;
    playGameSFX('click', isMuted);
    setSelectedLeft(item);
    if (selectedRight) {
      evaluateMatch(item, selectedRight);
    }
  };

  const handleSelectRight = (item) => {
    if (matchedRightIds.includes(item.id) || wrongPair) return;
    playGameSFX('click', isMuted);
    setSelectedRight(item);
    if (selectedLeft) {
      evaluateMatch(selectedLeft, item);
    }
  };

  // ============================================================================
  // 7. CHUYỂN MÀN & THOÁT GAME (LƯU SESSION / KỶ LUẬT THOÁT NGANG)
  // ============================================================================
  const handleNextRound = () => {
    if (cooldownLeft > 0) return;

    if (!config.isEndless && round >= config.maxRounds) {
      handleClearSession();
      if (coordinatorRef.current) coordinatorRef.current.destroy();
      setStatus('summary');
      return;
    }

    const nextRound = round + 1;
    setRound(nextRound);
    loadRoundBoard(nextRound);
  };

  const handleExitGame = () => {
    // Nếu đang chơi dở bàn mà thoát -> áp dụng kỷ luật cho các cặp chưa nối
    if (status === 'playing' && !isRoundComplete) {
      const remainingItem = boardData.leftItems.find(
        (i) => !i.isTrap && !matchedLeftIds.includes(i.id)
      );
      if (remainingItem) {
        handleExitDiscipline({
          isPlaying: true,
          isAnswered: false,
          currentCard: remainingItem.origin || remainingItem,
          gameType: 'match',
          onLogWrong,
          addToRetryBag
        });
      }

      // Lưu phiên chơi dở vào gameSessions
      if (setGameSessions) {
        setGameSessions((prev) => ({
          ...prev,
          match: {
            config,
            round,
            maxRounds: config.maxRounds,
            score,
            streak,
            correctCount,
            totalAnswered,
            boardData,
            matchedLeftIds,
            matchedRightIds,
            timeLeft,
            timestamp: Date.now()
          }
        }));
      }
    }

    if (coordinatorRef.current) coordinatorRef.current.destroy();
    setStatus('setup');
  };

  const handleSaveCurrentWords = () => {
    if (!onOpenWordSelector) return;
    const allTerms = boardData.pairs.map((p) => p.term).join(' ');
    onOpenWordSelector(allTerms);
  };

  const handleOpenHanziCurrent = () => {
    if (!onOpenHanzi) return;
    const allTerms = boardData.pairs.map((p) => p.term).join('');
    onOpenHanzi(allTerms);
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
        text="AI Đang Thiết Kế Bàn Chơi Nối Ô..."
        subText="Đang tổng hợp cặp từ vựng và cài đặt bẫy ngữ pháp"
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
        totalQuestions={Math.max(correctCount, totalAnswered)}
        onRestart={handleStartGame}
        onBack={onBack}
        mainColor={mainColor}
        t={t}
      />
    );
  }

  if (status === 'playing') {
    return (
      <MatchBoard
        round={round}
        maxRounds={config.maxRounds}
        isEndless={config.isEndless}
        score={score}
        streak={streak}
        timeLeft={timeLeft}
        ammoCount={ammoCount}
        isAiSource={config.sourceMode === 'ai'}
        leftItems={boardData.leftItems}
        rightItems={boardData.rightItems}
        selectedLeft={selectedLeft}
        selectedRight={selectedRight}
        matchedLeftIds={matchedLeftIds}
        matchedRightIds={matchedRightIds}
        wrongPair={wrongPair}
        trapFeedback={trapFeedback}
        isRoundComplete={isRoundComplete}
        cooldownLeft={cooldownLeft}
        onSelectLeft={handleSelectLeft}
        onSelectRight={handleSelectRight}
        onNextRound={handleNextRound}
        onExit={handleExitGame}
        onSaveWord={handleSaveCurrentWords}
        onOpenHanzi={handleOpenHanziCurrent}
        onSpeak={speak}
        fontFamily={Utils.getFontFamily(settings)}
        lang={lang}
        mainColor={mainColor}
        t={t}
      />
    );
  }

  return (
    <MatchSetup
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
      savedSession={gameSessions?.match}
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