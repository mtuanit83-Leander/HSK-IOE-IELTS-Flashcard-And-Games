// ============================================================================
// FILE 51/85: src/features/games/GameView.jsx
// NGUỒN GỐC: tang_5.js (Block 5.7 - GameView V1.09) + transshipment-05.js
// NHIỆM VỤ: Bộ định tuyến trung tâm điều hướng giữa GameMenu, các màn hình
//           Setup, 10 Mini-games PlayScreen, GameResult và ExamUIShell.
//           Hợp nhất cơ chế lưu phiên (AutoSave/Resume), hỗ trợ cả Props phẳng
//           lẫn { state, actions, setters } và đạt chuẩn 0 Problems.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS } from '../../config/constants';
import { AiModeSwitch } from '../../components/common/Controls';

// Menu chính
import { GameMenu } from './GameMenu';

// 10 Mini-Games: Giao diện Setup & Result
import { MatchSetup } from './MatchUI';
import { ScrambleSetup } from './ScrambleUI';
import { QuizSetup, GameResult } from './QuizUI';
import { FillBlankSetup } from './FillBlankUI';
import { SpotMistakeSetup } from './SpotMistakeUI';
import { OddOneOutSetup } from './OddOneOutUI';
import { ImageQuizSetup } from './ImageQuizUI';
import { PronunciationSetup } from './PronunciationUI';
import { ListeningSetup } from './ListeningUI';
import { ReadingSetup } from './ReadingUI';

// 10 Mini-Games: Động cơ Logic & Containers
import { MatchGame } from './MatchGame';
import { ScrambleGame } from './ScrambleGame';
import { QuizGame } from './QuizGame';
import { FillBlankGame } from './FillBlankGame';
import { SpotMistakeGame } from './SpotMistakeGame';
import { OddOneOutGame } from './OddOneOutGame';
import { ImageQuizGame } from './ImageQuizGame';
import { PronunciationGame } from './PronunciationGame';
import { ListeningGame } from './ListeningGame';
import { ReadingGame } from './ReadingGame';

// Phân hệ Khảo thí Tổng hợp (Mock Test)
import { ExamUIShell } from '../exam/ExamUIShell';

/**
 * Chuẩn hóa tham số trả về từ các màn hình Setup
 * Hỗ trợ cả 2 chuẩn gọi: onStart('quiz', config) và onStart(config)
 */
const resolveSetupStartArgs = (defaultType, arg1, arg2) => {
  if (typeof arg1 === 'string') {
    return { type: arg1, config: arg2 || {} };
  }
  return { type: defaultType, config: arg1 || {} };
};

export const GameView = (props) => {
  // ==========================================================================
  // 1. LỚP ĐỆM TƯƠNG THÍCH KÉP (FLAT PROPS & { state, actions, setters })
  // ==========================================================================
  const stateObj = props.state || {};
  const actionsObj = props.actions || {};
  const settersObj = props.setters || {};

  const t = props.t || actionsObj.t || ((k) => k);
  const mainColor = props.mainColor || stateObj.mainColor || 'indigo';
  const isAiMode = props.isAiMode ?? stateObj.isAiModeGame ?? false;
  const setAiMode = props.setAiMode || settersObj.setIsAiModeGame || (() => {});
  const onMissingKey =
    props.onMissingKey ||
    actionsObj.onMissingKey ||
    (() => settersObj.setShowApiKeyModal && settersObj.setShowApiKeyModal(true));
  const isLoading = props.isLoading ?? stateObj.isAiLoading ?? false;
  const cards = props.cards || stateObj.cards || [];
  const lang = props.lang || stateObj.lang || 'en';
  const onPlay = props.onPlay || props.speak || actionsObj.speak;
  const onBookmark = props.onBookmark || actionsObj.handleNotebookSave;
  const notebook = props.notebook || stateObj.notebook || [];
  const showToast = props.showToast || actionsObj.showToast;
  const onLogWrong = props.onLogWrong || actionsObj.handleLogWrong;
  const setIsGamePlaying =
    props.setIsGamePlaying || actionsObj.setIsGamePlaying || settersObj.setIsGamePlaying;
  const gameSessions = props.gameSessions || stateObj.gameSessions || {};
  const setGameSessions = props.setGameSessions || settersObj.setGameSessions;
  const settings = props.settings || stateObj.settings || {};
  const onUpdateCards = props.onUpdateCards || settersObj.setCards;
  const onSaveToHarvest = props.onSaveToHarvest || actionsObj.handleSaveToHarvest;
  const dataMode = props.dataMode || stateObj.dataMode || 'vocab';
  const currentLevel = props.currentLevel || stateObj.currentLevel;
  const currentTopic = props.currentTopic || stateObj.currentTopic;
  const globalRetryBag = props.globalRetryBag || stateObj.globalRetryBag || {};
  const addToRetryBag = props.addToRetryBag || actionsObj.addToRetryBag;
  const removeFromRetryBag = props.removeFromRetryBag || actionsObj.removeFromRetryBag;
  const onOpenIncorrect = props.onOpenIncorrect || actionsObj.handleOpenIncorrect;
  const onOpenExamPoolManager =
    props.onOpenExamPoolManager ||
    actionsObj.handleOpenExamPoolManager ||
    (() => settersObj.setShowExamPoolManager && settersObj.setShowExamPoolManager(true));
  const onOpenAiConfig =
    props.onOpenAiConfig ||
    actionsObj.handleOpenAiConfig ||
    (() => settersObj.setShowAiConfigModal && settersObj.setShowAiConfigModal(true));
  const examLogic = props.examLogic || stateObj.examLogic;

  // ==========================================================================
  // 2. STATE QUẢN LÝ VÒNG ĐỜI ĐIỀU HƯỚNG (MENU ➔ SETUP ➔ PLAYING ➔ RESULT)
  // ==========================================================================
  const [gameState, setGameState] = useState(() => {
    if (typeof window !== 'undefined' && window.__pendingGameRoute) {
      const pending = window.__pendingGameRoute;
      window.__pendingGameRoute = null;
      return pending;
    }
    return 'menu';
  });
  const [gameType, setGameType] = useState(null);
  const [gameConfig, setGameConfig] = useState({});
  const [gameSessionId, setGameSessionId] = useState(() => Date.now());
  const [finalStats, setFinalStats] = useState({ score: 0, wrong: 0, total: 0 });
  const [matchAiPreset, setMatchAiPreset] = useState(false);

  const activeSessionIdRef = useRef(null);
  const gameTypeRef = useRef(null);

  const apiKey =
    props.apiKey ||
    stateObj.apiKey ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')
      : '') ||
    '';

  const activeExamLogic = examLogic || {
    examState: { status: 'idle' },
    startExam: () => {},
    resumeExam: () => {},
    submitAnswer: () => {},
    quitExam: () => {},
    exportExamToExcel: () => {}
  };

  // Đồng bộ window.globalShowToast
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const originalToast = window.globalShowToast;
    window.globalShowToast = (msg, type = 'success') => {
      if (typeof msg === 'object' && msg !== null) {
        if (showToast) {
          showToast({ text: msg.text || msg.message || '', type: msg.type || type, id: Date.now() });
        }
      } else if (showToast) {
        showToast({ text: String(msg), type, id: Date.now() });
      }
    };
    return () => {
      window.globalShowToast = originalToast;
    };
  }, [showToast]);

  // Lắng nghe tín hiệu chuyển hướng từ Sổ tay / Lỗi sai (nếu phát sinh khi đang ở trong GameView)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__pendingGameRoute) {
      const targetRoute = window.__pendingGameRoute;
      window.__pendingGameRoute = null;
      const timer = setTimeout(() => {
        setGameState(targetRoute);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  // Lưu tham chiếu loại game hiện tại
  useEffect(() => {
    if (gameType) {
      gameTypeRef.current = gameType;
    }
  }, [gameType]);

  // Báo trạng thái đang chơi lên App để ẩn BottomNav
  useEffect(() => {
    const isExamRunning =
      activeExamLogic?.examState?.status && activeExamLogic.examState.status !== 'idle';
    const isPlayingNow = gameState === 'playing' || gameState === 'mock_test' || Boolean(isExamRunning);
    if (setIsGamePlaying) {
      setIsGamePlaying(isPlayingNow);
    }
    return () => {
      if (setIsGamePlaying) setIsGamePlaying(false);
    };
  }, [gameState, activeExamLogic?.examState?.status, setIsGamePlaying]);

  // Xóa khóa phiên khi rời trạng thái chơi
  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'mock_test') {
      activeSessionIdRef.current = null;
    }
  }, [gameState]);

  // ==========================================================================
  // 3. CÁC HÀM ĐIỀU PHỐI MENU, SETUP, AUTO-SAVE, RESUME & MOCK TEST
  // ==========================================================================
  const notifyToast = useCallback(
    (msg, type = 'info') => {
      if (showToast) {
        showToast({ text: String(msg), type, id: Date.now() });
      } else if (typeof window !== 'undefined' && window.globalShowToast) {
        window.globalShowToast(String(msg), type);
      }
    },
    [showToast]
  );

  // Xóa phiên lưu cũ của 1 game
  const handleClearSession = useCallback(
    (type) => {
      if (!type || !setGameSessions) return;
      setGameSessions((prev) => {
        const next = { ...(prev || {}) };
        if (next[type]) delete next[type];
        return next;
      });
    },
    [setGameSessions]
  );

  // Mở các màn hình Setup
  const handleSelectQuiz = () => setGameState('quiz_setup');
  const handleStartMatch = (aiModeFlag = false) => {
    setMatchAiPreset(Boolean(aiModeFlag));
    setGameState('match_setup');
  };
  const handleStartScramble = () => setGameState('scramble_setup');
  const handleStartFillBlank = () => setGameState('fillblank_setup');
  const handleStartSpotMistake = () => setGameState('spotmistake_setup');
  const handleStartOddOneOut = () => setGameState('oddoneout_setup');
  const handleStartImageQuiz = () => setGameState('imagequiz_setup');
  const handleStartPronunciation = () => setGameState('pronunciation_setup');
  const handleStartListening = () => setGameState('listening_setup');
  const handleStartReading = () => setGameState('reading_setup');

  // Khởi chạy bài thi Khảo thí
  const handleStartMockTest = (profileId) => {
    const currentKey =
      apiKey ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')
        : '');
    if (!currentKey) {
      onMissingKey();
      return;
    }
    if (activeExamLogic && typeof activeExamLogic.startExam === 'function') {
      activeExamLogic.startExam(profileId, currentLevel, currentTopic);
      setGameState('mock_test');
    } else {
      notifyToast('Hệ thống thi chưa sẵn sàng!', 'error');
    }
  };

  // Khôi phục bài thi Khảo thí đang dang dở
  const handleResumeMockTest = (sessionId) => {
    const currentKey =
      apiKey ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')
        : '');
    if (!currentKey) {
      onMissingKey();
      return;
    }
    if (activeExamLogic && typeof activeExamLogic.resumeExam === 'function') {
      activeExamLogic.resumeExam(sessionId);
      setGameState('mock_test');
    } else {
      notifyToast('Hệ thống phục hồi dữ liệu chưa sẵn sàng!', 'error');
    }
  };

  // Bắt đầu ván chơi mới từ màn hình Setup
  const handleStartGame = (type, config = {}) => {
    // Đánh thức luồng âm thanh trên thiết bị di động
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      if (typeof window !== 'undefined' && window.fc_audioCtx && window.fc_audioCtx.state === 'suspended') {
        window.fc_audioCtx.resume();
      }
    } catch (e) {
      console.warn('Audio unlock warning:', e);
    }

    const isPureMode = config.sourceMode === 'ai_pure' || config.sourceMode === 'ai';
    if (!isPureMode) {
      const nonStrictTypes = [
        'fillblank',
        'spotmistake',
        'oddoneout',
        'imagequiz',
        'pronunciation',
        'listening',
        'reading'
      ];
      const needsAtLeastTwo = !cards || (cards.length < 2 && !nonStrictTypes.includes(type));
      const needsAtLeastFourForOdd =
        (!cards || cards.length < 4) && type === 'oddoneout' && config.sourceMode === 'card';

      if (needsAtLeastTwo || needsAtLeastFourForOdd) {
        const msg =
          type === 'oddoneout'
            ? 'Cần ít nhất 4 thẻ để chơi Tìm Từ Khác Loại'
            : t('needMoreCards', { n: 2 }) || 'Cần ít nhất 2 thẻ để chơi';
        notifyToast(msg, 'error');
        return;
      }
    }

    const currentKey =
      apiKey ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')
        : '');
    if ((config.isAiMode || config.aiMode || isPureMode) && !currentKey) {
      onMissingKey();
      return;
    }

    activeSessionIdRef.current = `sess_${Date.now()}`;
    setGameType(type);
    gameTypeRef.current = type;

    const snapshotConfig = {
      ...config,
      level: config.level || currentLevel,
      dataMode: config.dataMode || dataMode,
      topic: config.topic || currentTopic
    };
    setGameConfig(snapshotConfig);

    if (setGameSessions) {
      setGameSessions((prev) => {
        const next = { ...(prev || {}) };
        if (next[type]) delete next[type];
        return next;
      });
    }

    setGameSessionId(Date.now());
    setGameState('playing');
  };

  // Lưu phiên chơi và quay về Menu khi người chơi bấm nút Back
  const handleBack = useCallback(
    (childData = null) => {
      if (!activeSessionIdRef.current) {
        setGameState('menu');
        return;
      }
      if (gameState === 'playing' && childData && setGameSessions) {
        const currentType = gameType || gameTypeRef.current;
        if (currentType) {
          const currentSessionData = {
            type: currentType,
            timestamp: Date.now(),
            config: gameConfig,
            ...childData
          };
          setGameSessions((prev) => ({ ...(prev || {}), [currentType]: currentSessionData }));
        }
      }
      setGameState('menu');
    },
    [gameState, gameType, gameConfig, setGameSessions]
  );

  // Tự động lưu phiên chơi định kỳ mỗi 5s
  const handleAutoSave = useCallback(
    (childData) => {
      if (!activeSessionIdRef.current || gameState !== 'playing') return;
      if (setGameSessions && childData) {
        const currentType = gameType || gameTypeRef.current;
        if (currentType) {
          const currentSessionData = {
            type: currentType,
            timestamp: Date.now(),
            config: gameConfig,
            ...childData
          };
          setGameSessions((prev) => ({ ...(prev || {}), [currentType]: currentSessionData }));
        }
      }
    },
    [gameState, gameType, gameConfig, setGameSessions]
  );

  // Khôi phục ván chơi đang dang dở từ Menu
  const handleResumeSession = useCallback(
    (type) => {
      const session = gameSessions?.[type];
      if (!session) return;
      activeSessionIdRef.current = `sess_${Date.now()}`;
      setGameType(session.type || type);
      gameTypeRef.current = session.type || type;
      setGameConfig(session.config || {});
      setGameSessionId(Date.now());
      setGameState('playing');
    },
    [gameSessions]
  );

  // Kết thúc ván chơi và chuyển sang màn hình Tổng kết (GameResult)
  const handleEndGame = useCallback(
    (stats = { correct: 0, wrong: 0 }) => {
      activeSessionIdRef.current = null;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      const correctVal = stats?.correct ?? stats?.score ?? 0;
      const wrongVal = stats?.wrong ?? 0;
      setFinalStats({
        score: correctVal,
        wrong: wrongVal,
        total: correctVal + wrongVal
      });

      const typeToDelete = gameType || gameTypeRef.current;
      if (setGameSessions && typeToDelete) {
        setGameSessions((prev) => {
          const next = { ...(prev || {}) };
          if (next[typeToDelete]) delete next[typeToDelete];
          return next;
        });
      }

      setGameType(null);
      gameTypeRef.current = null;
      setGameState('result');
    },
    [gameType, setGameSessions]
  );

  // Kiểm tra nếu bài thi Khảo thí được kích hoạt trực tiếp từ state bên ngoài
  const isExternalExamActive =
    activeExamLogic?.examState?.status &&
    activeExamLogic.examState.status !== 'idle' &&
    gameState !== 'mock_test';

  // ==========================================================================
  // 4. RENDER GIAO DIỆN THEO TRẠNG THÁI
  // ==========================================================================
  return (
    <div className="relative w-full h-full flex-1 flex flex-col bg-gray-50">
      {/* 4.1. MÀN HÌNH MENU CHÍNH */}
      {gameState === 'menu' && !isExternalExamActive && (
        <div className="w-full h-full flex flex-col items-center p-4 sm:p-6 overflow-y-auto custom-scrollbar z-50">
          <GameMenu
            t={t}
            mainColor={mainColor}
            lang={lang}
            dataMode={dataMode}
            gameSessions={gameSessions}
            onSelectQuiz={handleSelectQuiz}
            onStartMatch={handleStartMatch}
            onStartScramble={handleStartScramble}
            onStartFillBlank={handleStartFillBlank}
            onStartSpotMistake={handleStartSpotMistake}
            onStartOddOneOut={handleStartOddOneOut}
            onStartImageQuiz={handleStartImageQuiz}
            onStartPronunciation={handleStartPronunciation}
            onStartListening={handleStartListening}
            onStartReading={handleStartReading}
            onResume={handleResumeSession}
            onClearSession={handleClearSession}
            onStartMockTest={handleStartMockTest}
            onResumeMockTest={handleResumeMockTest}
            onOpenExamPoolManager={onOpenExamPoolManager}
            onOpenAiConfig={onOpenAiConfig}
          />
        </div>
      )}

      {/* 4.2. MÔI TRƯỜNG KHẢO THÍ TỔNG HỢP (MOCK TEST) */}
      {(gameState === 'mock_test' || isExternalExamActive) && ExamUIShell && (
        <div className="absolute inset-0 z-[100] bg-white">
          <ExamUIShell
            examLogic={activeExamLogic}
            mainColor={mainColor}
            onExit={() => {
              if (activeExamLogic.quitExam) activeExamLogic.quitExam();
              setGameState('menu');
            }}
            onLogWrong={onLogWrong}
            onOpenIncorrect={onOpenIncorrect}
            onBookmark={onBookmark}
            notebook={notebook}
            onPlay={onPlay}
            lang={lang}
          />
        </div>
      )}

      {/* 4.3. CÁC MÀN HÌNH CÀI ĐẶT TRƯỚC VÁN CHƠI (10 SETUP SCREENS) */}
      {gameState === 'quiz_setup' && QuizSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <QuizSetup
            t={t}
            mainColor={mainColor}
            lang={lang}
            dataMode={dataMode}
            currentLevel={currentLevel}
            onOpenAiConfig={onOpenAiConfig}
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('quiz', arg1, arg2);
              handleStartGame('quiz', { ...config, isAiMode: config.aiMode ?? config.isAiMode });
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'scramble_setup' && ScrambleSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <ScrambleSetup
            t={t}
            mainColor={mainColor}
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('scramble', arg1, arg2);
              handleStartGame('scramble', { ...config, lang });
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'match_setup' && MatchSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <MatchSetup
            t={t}
            mainColor={mainColor}
            initialAiMode={matchAiPreset}
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('match', arg1, arg2);
              handleStartGame('match', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'fillblank_setup' && FillBlankSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <FillBlankSetup
            t={t}
            mainColor={mainColor}
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('fillblank', arg1, arg2);
              handleStartGame('fillblank', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'spotmistake_setup' && SpotMistakeSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <SpotMistakeSetup
            t={t}
            mainColor={mainColor}
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('spotmistake', arg1, arg2);
              handleStartGame('spotmistake', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'oddoneout_setup' && OddOneOutSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <OddOneOutSetup
            t={t}
            mainColor={mainColor}
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('oddoneout', arg1, arg2);
              handleStartGame('oddoneout', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'imagequiz_setup' && ImageQuizSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <ImageQuizSetup
            t={t}
            mainColor="emerald"
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('imagequiz', arg1, arg2);
              handleStartGame('imagequiz', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'pronunciation_setup' && PronunciationSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <PronunciationSetup
            t={t}
            mainColor="indigo"
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('pronunciation', arg1, arg2);
              handleStartGame('pronunciation', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'listening_setup' && ListeningSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <ListeningSetup
            t={t}
            mainColor="cyan"
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('listening', arg1, arg2);
              handleStartGame('listening', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {gameState === 'reading_setup' && ReadingSetup && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <ReadingSetup
            t={t}
            mainColor="slate"
            onStart={(arg1, arg2) => {
              const { config } = resolveSetupStartArgs('reading', arg1, arg2);
              handleStartGame('reading', config);
            }}
            onBack={() => setGameState('menu')}
          />
        </div>
      )}

      {/* 4.4. MÀN HÌNH KẾT QUẢ TỔNG KẾT (GAME RESULT) */}
      {gameState === 'result' && GameResult && (
        <div className="w-full h-full bg-white flex flex-col items-center justify-center p-6 overflow-hidden z-50">
          <div className="w-full h-full bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center p-6 border-2 border-gray-100 animate-in relative overflow-hidden">
            <div className="absolute top-[-50px] right-[-50px] w-32 h-32 bg-indigo-100 rounded-full opacity-50"></div>
            <div className="absolute bottom-[-20px] left-[-20px] w-24 h-24 bg-indigo-100 rounded-full opacity-50"></div>
            <GameResult
              t={t}
              mainColor={mainColor}
              score={finalStats.score}
              sessionTotal={finalStats.total}
              correctCount={finalStats.score}
              wrongCount={finalStats.wrong}
              onBack={() => setGameState('menu')}
            />
          </div>
        </div>
      )}

      {/* 4.5. MÀN HÌNH ĐANG CHƠI (10 MINI-GAMES PLAY CONTAINERS) */}
      {gameState === 'playing' && (
        <div className="block w-full h-full">
          {gameType === 'match' && MatchGame && (
            <MatchGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor={mainColor}
              isAiMode={gameConfig.isAiMode ?? gameConfig.aiMode ?? isAiMode}
              timerMode={gameConfig.timerMode}
              timeLimit={gameConfig.timeLimit}
              initialDifficulty={gameConfig.hardMode ? 'hard' : 'easy'}
              level={gameConfig.level}
              config={gameConfig}
              lang={lang}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onAutoSave={handleAutoSave}
              onUpdateCards={onUpdateCards}
              savedState={gameSessions?.['match']}
              settings={settings}
              onSaveToHarvest={onSaveToHarvest}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'scramble' && ScrambleGame && (
            <ScrambleGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor={mainColor}
              lang={lang}
              level={gameConfig.level}
              apiKey={apiKey}
              config={gameConfig}
              onPlay={onPlay}
              onBookmark={onBookmark}
              notebook={notebook}
              showToast={showToast}
              onLogWrong={onLogWrong}
              timerMode={gameConfig.timerMode}
              timeLimit={gameConfig.timeLimit}
              initialDifficulty={gameConfig.hardMode ? 'hard' : 'easy'}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['scramble']}
              settings={settings}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'quiz' && QuizGame && (
            <QuizGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor={mainColor}
              lang={lang}
              level={gameConfig.level}
              timerMode={gameConfig.timerMode}
              listenMode={gameConfig.listenMode}
              isAiMode={gameConfig.isAiMode ?? gameConfig.aiMode ?? isAiMode}
              timeLimit={gameConfig.timeLimit}
              hardMode={gameConfig.hardMode}
              config={gameConfig}
              onPlay={onPlay}
              onBookmark={onBookmark}
              notebook={notebook}
              showToast={showToast}
              onLogWrong={onLogWrong}
              onMissingKey={onMissingKey}
              isLoading={isLoading}
              AiModeSwitch={AiModeSwitch}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['quiz']}
              settings={settings}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'fillblank' && FillBlankGame && (
            <FillBlankGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor={mainColor}
              lang={lang}
              isAiMode={gameConfig.aiMode || false}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['fillblank']}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'spotmistake' && SpotMistakeGame && (
            <SpotMistakeGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor={mainColor}
              lang={lang}
              isAiMode={gameConfig.aiMode || false}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['spotmistake']}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'oddoneout' && OddOneOutGame && (
            <OddOneOutGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor={mainColor}
              lang={lang}
              isAiMode={gameConfig.aiMode || false}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['oddoneout']}
              onPlay={onPlay}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'imagequiz' && ImageQuizGame && (
            <ImageQuizGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor="emerald"
              lang={lang}
              isAiMode={gameConfig.aiMode || false}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['imagequiz']}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'pronunciation' && PronunciationGame && (
            <PronunciationGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor="indigo"
              lang={lang}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onUpdateCards={onUpdateCards}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['pronunciation']}
              onPlay={onPlay}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'listening' && ListeningGame && (
            <ListeningGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor="cyan"
              lang={lang}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['listening']}
              onPlay={onPlay}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}

          {gameType === 'reading' && ReadingGame && (
            <ReadingGame
              key={gameSessionId}
              cards={cards}
              t={t}
              mainColor="slate"
              lang={lang}
              apiKey={apiKey}
              onFinish={(score, time, wrongCount) =>
                handleEndGame({ correct: score, wrong: wrongCount || 0 })
              }
              onQuit={() => handleBack(null)}
              onBack={handleBack}
              onEndGame={handleEndGame}
              onBookmark={onBookmark}
              notebook={notebook}
              onLogWrong={onLogWrong}
              settings={settings}
              config={gameConfig}
              onSaveToHarvest={onSaveToHarvest}
              onAutoSave={handleAutoSave}
              savedState={gameSessions?.['reading']}
              globalRetryBag={globalRetryBag}
              addToRetryBag={addToRetryBag}
              removeFromRetryBag={removeFromRetryBag}
            />
          )}
        </div>
      )}
    </div>
  );
};

if (typeof window !== 'undefined') {
  window.GameView = GameView;
  window.Block5_7_GameView = GameView;
}

export default GameView;