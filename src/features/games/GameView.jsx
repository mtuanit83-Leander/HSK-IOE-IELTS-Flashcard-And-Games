// ============================================================================
// FILE 51/85: src/features/games/GameView.jsx
// NGUỒN GỐC: tang_5.js (Block 5.7 - GameView V1.09)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 20/11/2026 - 22:24 (GMT+7)
// NHIỆM VỤ: Bộ định tuyến trung tâm điều hướng giữa GameMenu, 10 màn hình Setup,
//           10 Mini-games PlayScreen, GameResult và ExamUIShell.
//           Nâng cấp Ver 1.1: Tách restoredSession chống re-render mỗi 5s,
//           chốt chặn đồng bộ activeSessionIdRef + stopAllSpeech, tách unmount
//           cleanup cho setIsGamePlaying, chuẩn hóa ngưỡng thẻ tối thiểu chống
//           0 thẻ, hợp nhất sharedGameProps cho 10 Mini-games và gia cố
//           VALID_GAME_ROUTES / fallback id-first cho onUpdateCards.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AiModeSwitch } from '../../components/common/Controls';
import { resolveActiveApiKey } from './common/gameHelpers';

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

// Danh sách trắng các Route hợp lệ được phép điều hướng từ bên ngoài (Sổ tay / Lỗi sai)
const VALID_GAME_ROUTES = new Set([
  'menu',
  'mock_test',
  'result',
  'quiz_setup',
  'scramble_setup',
  'match_setup',
  'fillblank_setup',
  'spotmistake_setup',
  'oddoneout_setup',
  'imagequiz_setup',
  'pronunciation_setup',
  'listening_setup',
  'reading_setup'
]);

// Nhóm game ngữ cảnh AI (có thể tự chạy mà không cần thẻ nếu không chọn tường minh sourceMode === 'card')
const CONTEXT_AI_GAMES = new Set(['pronunciation', 'listening', 'reading']);

// Nhóm game cần tối thiểu 1 thẻ khi chơi nguồn Thẻ cá nhân
const SINGLE_CARD_GAMES = new Set(['fillblank', 'spotmistake', 'imagequiz']);

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

/**
 * Kiểm tra cấu hình có thuộc chế độ AI Tự sinh (Pure AI) hay không
 */
const isPureAiSource = (config) => {
  const src = config?.sourceMode;
  return src === 'ai_pure' || src === 'ai';
};

/**
 * Chuẩn hóa cờ isAiMode nhất quán cho từng Mini-Game
 */
const resolveConfigAiMode = (config, fallbackAiMode = false) => {
  if (isPureAiSource(config)) return true;
  if (config?.isAiMode !== undefined) return Boolean(config.isAiMode);
  if (config?.aiMode !== undefined) return Boolean(config.aiMode);
  return Boolean(fallbackAiMode);
};

/**
 * Tính ngưỡng số thẻ tối thiểu an toàn theo từng loại game & nguồn câu hỏi
 * - Chặn lỗ hổng lọt 0 thẻ ở chế độ Thẻ cá nhân
 * - Không chặn oan 3 game ngữ cảnh AI (pronunciation, listening, reading) khi không ép sourceMode === 'card'
 */
const getMinRequiredCards = (type, config = {}) => {
  if (isPureAiSource(config)) return 0;

  if (CONTEXT_AI_GAMES.has(type)) {
    return config?.sourceMode === 'card' ? 1 : 0;
  }

  if (type === 'oddoneout') {
    return !config?.sourceMode || config.sourceMode === 'card' ? 4 : 0;
  }

  if (SINGLE_CARD_GAMES.has(type)) {
    return !config?.sourceMode || config.sourceMode === 'card' ? 1 : 0;
  }

  return 2;
};

/**
 * Đánh thức luồng âm thanh & Web Audio Context trên iOS/Safari/Mobile
 */
const unlockMobileAudio = () => {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    if (
      typeof window !== 'undefined' &&
      window.fc_audioCtx &&
      window.fc_audioCtx.state === 'suspended' &&
      typeof window.fc_audioCtx.resume === 'function'
    ) {
      Promise.resolve(window.fc_audioCtx.resume()).catch(() => {});
    }
  } catch (e) {
    console.warn('[GameView] Audio unlock warning:', e);
  }
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
  const onMissingKey =
    props.onMissingKey ||
    actionsObj.onMissingKey ||
    (() => settersObj.setShowApiKeyModal && settersObj.setShowApiKeyModal(true));
  const isLoading = props.isLoading ?? stateObj.isAiLoading ?? false;
  const cards = props.cards || stateObj.cards || [];
  const lang = props.lang || stateObj.lang || 'en';
  const onPlay = props.onPlay || props.speak || actionsObj.speak;
  const stopSpeakingAction = props.stopSpeaking || actionsObj.stopSpeaking;
  const notebook = props.notebook || stateObj.notebook || [];
  const showToast = props.showToast || actionsObj.showToast;
  const onLogWrong = props.onLogWrong || actionsObj.handleLogWrong;
  const setIsGamePlaying =
    props.setIsGamePlaying || actionsObj.setIsGamePlaying || settersObj.setIsGamePlaying;
  const gameSessions = props.gameSessions || stateObj.gameSessions || {};
  const setGameSessions = props.setGameSessions || settersObj.setGameSessions;
  const settings = props.settings || stateObj.settings || {};
  const onSaveToHarvest = props.onSaveToHarvest || actionsObj.handleSaveToHarvest;
  const dataMode = props.dataMode || stateObj.dataMode || 'vocab';
  const currentLevel = props.currentLevel ?? stateObj.currentLevel;
  const currentTopic = props.currentTopic ?? stateObj.currentTopic;
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

  // Helper ngắt hoàn toàn âm thanh TTS & đồng bộ Khiên Bluetooth của useAppLogic
  const stopAllSpeech = useCallback(() => {
    try {
      if (typeof stopSpeakingAction === 'function') {
        stopSpeakingAction();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {
      console.warn('[GameView] Stop speech warning:', e);
    }
  }, [stopSpeakingAction]);

  // [VÁ BUG 03] Ánh xạ chuẩn onBookmark -> handleSmartBookmark (KHÔNG fallback sang handleNotebookSave)
  const onBookmark = useCallback(
    (payload) => {
      if (typeof props.onBookmark === 'function') {
        return props.onBookmark(payload);
      }
      if (typeof actionsObj.handleSmartBookmark === 'function') {
        return actionsObj.handleSmartBookmark(payload);
      }
      if (typeof actionsObj.handleSaveWords === 'function' && payload) {
        const wordToSave =
          typeof payload === 'string'
            ? payload
            : payload.save || payload.term || payload.display || '';
        if (wordToSave) {
          return actionsObj.handleSaveWords([wordToSave]);
        }
      }
      console.warn('[GameView] Thiếu handler onBookmark / handleSmartBookmark.');
      return undefined;
    },
    [props.onBookmark, actionsObj.handleSmartBookmark, actionsObj.handleSaveWords]
  );

  // [VÁ BUG 02 + Ver 1.1] Ánh xạ chuẩn onUpdateCards -> handleUpdateCards
  // Fallback merge an toàn ưu tiên khớp theo card.id trước, sau đó dự phòng theo term chuẩn hóa
  const onUpdateCards = useCallback(
    (updatedPayload) => {
      if (typeof props.onUpdateCards === 'function') {
        return props.onUpdateCards(updatedPayload);
      }
      if (typeof actionsObj.handleUpdateCards === 'function') {
        return actionsObj.handleUpdateCards(updatedPayload);
      }
      if (typeof settersObj.setCards === 'function' && updatedPayload) {
        const updatesList = Array.isArray(updatedPayload) ? updatedPayload : [updatedPayload];
        const hasValidId = (val) => val !== undefined && val !== null && String(val).trim() !== '';
        const validUpdates = updatesList.filter(
          (item) => item && typeof item === 'object' && (hasValidId(item.id) || item.term)
        );
        if (validUpdates.length === 0) return undefined;

        const normalizeKey = (val) => String(val || '').trim().toLowerCase();
        settersObj.setCards((prevCards) => {
          if (!Array.isArray(prevCards) || prevCards.length === 0) return prevCards;

          const idMap = new Map();
          const termMap = new Map();
          validUpdates.forEach((item) => {
            if (hasValidId(item.id)) idMap.set(String(item.id), item);
            if (item.term) termMap.set(normalizeKey(item.term), item);
          });

          let hasChanged = false;
          const merged = prevCards.map((card) => {
            if (!card) return card;
            const patchById = hasValidId(card.id) ? idMap.get(String(card.id)) : undefined;
            const patchByTerm = card.term ? termMap.get(normalizeKey(card.term)) : undefined;
            const patch = patchById || patchByTerm;
            if (!patch) return card;
            hasChanged = true;
            return { ...card, ...patch };
          });
          return hasChanged ? merged : prevCards;
        });
      }
      return undefined;
    },
    [props.onUpdateCards, actionsObj.handleUpdateCards, settersObj.setCards]
  );

  // ==========================================================================
  // 2. STATE QUẢN LÝ VÒNG ĐỜI ĐIỀU HƯỚNG (MENU -> SETUP -> PLAYING -> RESULT)
  // ==========================================================================
  const [gameState, setGameState] = useState(() => {
    if (typeof window !== 'undefined' && window.__pendingGameRoute) {
      const pending = window.__pendingGameRoute;
      window.__pendingGameRoute = null;
      if (VALID_GAME_ROUTES.has(pending)) {
        return pending;
      }
      console.warn('[GameView] Bỏ qua pending route khởi tạo không hợp lệ:', pending);
    }
    return 'menu';
  });
  const [gameType, setGameType] = useState(null);
  const [gameConfig, setGameConfig] = useState({});
  const [restoredSession, setRestoredSession] = useState(null);
  const [gameSessionId, setGameSessionId] = useState(() => `${Date.now()}_0`);
  const [finalStats, setFinalStats] = useState({ score: 0, wrong: 0, total: 0 });
  const [matchAiPreset, setMatchAiPreset] = useState(false);

  const sessionSeqRef = useRef(0);
  const activeSessionIdRef = useRef(null);
  const gameTypeRef = useRef(null);
  const gameConfigRef = useRef({});

  const nextSessionKey = useCallback(() => {
    sessionSeqRef.current += 1;
    return `${Date.now()}_${sessionSeqRef.current}`;
  }, []);

  // [VÁ BUG 06] Quét đủ 4 tầng API Key (props/state -> fc_apikey -> fc_paid_apikey -> fc_apikey_pool)
  const preferredApiKey = props.apiKey || stateObj.apiKey || '';
  const activeApiKey = resolveActiveApiKey(preferredApiKey);

  const activeExamLogic = examLogic || {
    examState: { status: 'idle' },
    startExam: () => {},
    resumeExam: () => {},
    submitAnswer: () => {},
    quitExam: () => {},
    exportExamToExcel: () => {}
  };

  // Đồng bộ window.globalShowToast (an toàn khi unmount)
  useEffect(() => {
    if (typeof window === 'undefined' || !showToast) return undefined;
    const originalToast = window.globalShowToast;
    const bridgedToast = (msg, type = 'success') => {
      if (typeof msg === 'object' && msg !== null) {
        showToast({ text: msg.text || msg.message || '', type: msg.type || type, id: Date.now() });
      } else {
        showToast({ text: String(msg), type, id: Date.now() });
      }
    };
    window.globalShowToast = bridgedToast;
    return () => {
      if (window.globalShowToast === bridgedToast) {
        window.globalShowToast = originalToast;
      }
    };
  }, [showToast]);

  // Tiêu thụ route chờ an toàn theo danh sách trắng VALID_GAME_ROUTES
  const consumePendingRoute = useCallback(() => {
    if (typeof window === 'undefined' || !window.__pendingGameRoute) return;
    const targetRoute = window.__pendingGameRoute;
    window.__pendingGameRoute = null;
    if (!VALID_GAME_ROUTES.has(targetRoute)) {
      console.warn('[GameView] Bỏ qua pending route không hợp lệ:', targetRoute);
      return;
    }
    activeSessionIdRef.current = null;
    stopAllSpeech();
    setRestoredSession(null);
    setGameState(targetRoute);
  }, [stopAllSpeech]);

  // [Ver 1.1] Đăng ký custom event 1 lần duy nhất (không tháo/gắn lại mỗi khi mảng cards thay đổi)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('fc-pending-game-route', consumePendingRoute);
    return () => {
      window.removeEventListener('fc-pending-game-route', consumePendingRoute);
    };
  }, [consumePendingRoute]);

  // Tương thích ngược 100% với useAppLogic.handleReviewWithGame (chỉ gán window.__pendingGameRoute + cập nhật cards)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.__pendingGameRoute) return undefined;
    const timer = setTimeout(consumePendingRoute, 0);
    return () => clearTimeout(timer);
  }, [cards, lang, dataMode, consumePendingRoute]);

  // Đồng bộ tham chiếu loại game & cấu hình hiện tại (chống stale closure)
  useEffect(() => {
    if (gameType) {
      gameTypeRef.current = gameType;
    }
  }, [gameType]);

  useEffect(() => {
    gameConfigRef.current = gameConfig || {};
  }, [gameConfig]);

  // Báo trạng thái đang chơi lên App để ẩn BottomNav (không có cleanup để tránh nhấp nháy khi đổi chặng thi)
  useEffect(() => {
    const isExamRunning =
      activeExamLogic?.examState?.status && activeExamLogic.examState.status !== 'idle';
    const isPlayingNow =
      gameState === 'playing' || gameState === 'mock_test' || Boolean(isExamRunning);
    if (setIsGamePlaying) {
      setIsGamePlaying(isPlayingNow);
    }
  }, [gameState, activeExamLogic?.examState?.status, setIsGamePlaying]);

  // Cleanup độc lập khi unmount GameView: hiện lại BottomNav và ngắt giọng đọc TTS
  useEffect(() => {
    return () => {
      if (setIsGamePlaying) setIsGamePlaying(false);
    };
  }, [setIsGamePlaying]);

  useEffect(() => {
    return () => {
      stopAllSpeech();
    };
  }, [stopAllSpeech]);

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
    const liveKey = resolveActiveApiKey(preferredApiKey);
    if (!liveKey) {
      onMissingKey();
      return;
    }
    unlockMobileAudio();
    setRestoredSession(null);
    if (activeExamLogic && typeof activeExamLogic.startExam === 'function') {
      activeExamLogic.startExam(profileId, currentLevel, currentTopic);
      setGameState('mock_test');
    } else {
      notifyToast('Hệ thống thi chưa sẵn sàng!', 'error');
    }
  };

  // Khôi phục bài thi Khảo thí đang dang dở
  const handleResumeMockTest = (sessionId) => {
    const liveKey = resolveActiveApiKey(preferredApiKey);
    if (!liveKey) {
      onMissingKey();
      return;
    }
    unlockMobileAudio();
    setRestoredSession(null);
    if (activeExamLogic && typeof activeExamLogic.resumeExam === 'function') {
      activeExamLogic.resumeExam(sessionId);
      setGameState('mock_test');
    } else {
      notifyToast('Hệ thống phục hồi dữ liệu chưa sẵn sàng!', 'error');
    }
  };

  // Bắt đầu ván chơi mới từ màn hình Setup
  const handleStartGame = (type, config = {}) => {
    unlockMobileAudio();

    const isPureMode = isPureAiSource(config);
    const minCards = getMinRequiredCards(type, config);
    const cardCount = Array.isArray(cards) ? cards.length : 0;

    if (minCards > 0 && cardCount < minCards) {
      let msg = t('needMoreCards', { n: minCards }) || `Cần ít nhất ${minCards} thẻ để chơi`;
      if (type === 'oddoneout') {
        msg = 'Cần ít nhất 4 thẻ để chơi Tìm Từ Khác Loại';
      } else if (minCards === 1) {
        msg = 'Cần ít nhất 1 thẻ để chơi chế độ Thẻ cá nhân';
      }
      notifyToast(msg, 'error');
      return;
    }

    const effectiveAiMode = resolveConfigAiMode(config, false);
    const liveKey = resolveActiveApiKey(preferredApiKey);
    if ((effectiveAiMode || isPureMode) && !liveKey) {
      onMissingKey();
      return;
    }

    const sessionKey = nextSessionKey();
    activeSessionIdRef.current = `sess_${sessionKey}`;
    setGameType(type);
    gameTypeRef.current = type;

    const snapshotConfig = {
      ...config,
      isAiMode: effectiveAiMode,
      aiMode: isPureMode ? true : Boolean(config.aiMode ?? effectiveAiMode),
      level: config.level !== undefined ? config.level : currentLevel,
      dataMode: config.dataMode || dataMode,
      topic: config.topic !== undefined ? config.topic : currentTopic
    };
    setGameConfig(snapshotConfig);
    gameConfigRef.current = snapshotConfig;
    setRestoredSession(null);

    if (setGameSessions) {
      setGameSessions((prev) => {
        const next = { ...(prev || {}) };
        if (next[type]) delete next[type];
        return next;
      });
    }

    setGameSessionId(sessionKey);
    setGameState('playing');
  };

  // Lưu phiên chơi và quay về Menu khi người chơi bấm nút Back
  const handleBack = useCallback(
    (childData = null) => {
      const hadActiveSession = Boolean(activeSessionIdRef.current);
      // Xóa khóa phiên đồng bộ ngay lập tức để chống bấm đúp hoặc AutoSave chen ngang
      activeSessionIdRef.current = null;
      stopAllSpeech();
      setRestoredSession(null);

      if (hadActiveSession && gameState === 'playing' && childData && setGameSessions) {
        const currentType = gameType || gameTypeRef.current;
        if (currentType) {
          const currentSessionData = {
            type: currentType,
            timestamp: Date.now(),
            config: gameConfigRef.current,
            ...childData
          };
          setGameSessions((prev) => ({ ...(prev || {}), [currentType]: currentSessionData }));
        }
      }

      setGameState('menu');
    },
    [gameState, gameType, setGameSessions, stopAllSpeech]
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
            config: gameConfigRef.current,
            ...childData
          };
          setGameSessions((prev) => ({ ...(prev || {}), [currentType]: currentSessionData }));
        }
      }
    },
    [gameState, gameType, setGameSessions]
  );

  // Khôi phục ván chơi đang dang dở từ Menu
  const handleResumeSession = useCallback(
    (type) => {
      const session = gameSessions?.[type];
      if (!session) return;

      const restoredConfig = session.config || {};
      const needsAiKey =
        resolveConfigAiMode(restoredConfig, false) || isPureAiSource(restoredConfig);
      if (needsAiKey && !resolveActiveApiKey(preferredApiKey)) {
        onMissingKey();
        return;
      }

      unlockMobileAudio();

      const normalizedConfig = {
        ...restoredConfig,
        isAiMode: resolveConfigAiMode(restoredConfig, false),
        aiMode: isPureAiSource(restoredConfig)
          ? true
          : Boolean(restoredConfig.aiMode ?? restoredConfig.isAiMode),
        level: restoredConfig.level !== undefined ? restoredConfig.level : currentLevel,
        dataMode: restoredConfig.dataMode || dataMode,
        topic: restoredConfig.topic !== undefined ? restoredConfig.topic : currentTopic
      };

      const sessionKey = nextSessionKey();
      activeSessionIdRef.current = `sess_${sessionKey}`;
      setGameType(session.type || type);
      gameTypeRef.current = session.type || type;
      setGameConfig(normalizedConfig);
      gameConfigRef.current = normalizedConfig;
      setRestoredSession(session);
      setGameSessionId(sessionKey);
      setGameState('playing');
    },
    [gameSessions, preferredApiKey, onMissingKey, currentLevel, dataMode, currentTopic, nextSessionKey]
  );

  // Kết thúc ván chơi và chuyển sang màn hình Tổng kết (GameResult)
  const handleEndGame = useCallback(
    (stats = { correct: 0, wrong: 0 }) => {
      activeSessionIdRef.current = null;
      stopAllSpeech();
      setRestoredSession(null);

      const isPlainStats = stats && typeof stats === 'object' && !stats.nativeEvent;
      const correctVal = Math.max(0, Number(isPlainStats ? stats.correct ?? stats.score : 0) || 0);
      const wrongVal = Math.max(0, Number(isPlainStats ? stats.wrong : 0) || 0);
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
    [gameType, setGameSessions, stopAllSpeech]
  );

  // Bộ chuyển đổi chuẩn hóa cho các game gọi onFinish(score, time, wrongCount) hoặc onFinish(statsObj)
  const handleFinishGame = useCallback(
    (arg1, _time, wrongCount) => {
      if (arg1 && typeof arg1 === 'object' && !arg1.nativeEvent) {
        handleEndGame(arg1);
        return;
      }
      handleEndGame({ correct: arg1, wrong: wrongCount || 0 });
    },
    [handleEndGame]
  );

  // Callback thoát gọn dùng chung (ổn định tham chiếu)
  const handleQuitGame = useCallback(() => {
    handleBack(null);
  }, [handleBack]);

  // Kiểm tra nếu bài thi Khảo thí được kích hoạt trực tiếp từ state bên ngoài
  const isExternalExamActive =
    activeExamLogic?.examState?.status &&
    activeExamLogic.examState.status !== 'idle' &&
    gameState !== 'mock_test';

  // Tính cờ AI thống nhất cho phiên đang chạy
  const activeGameAiMode = resolveConfigAiMode(gameConfig, isAiMode);

  // Gói props dùng chung đồng bộ cho toàn bộ 10 Mini-Games (dùng restoredSession chống re-render mỗi 5s)
  const sharedGameProps = useMemo(
    () => ({
      cards,
      t,
      mainColor,
      lang,
      level: gameConfig.level,
      isAiMode: activeGameAiMode,
      apiKey: activeApiKey,
      config: gameConfig,
      onPlay,
      onBookmark,
      notebook,
      showToast,
      onLogWrong,
      onMissingKey,
      onBack: handleBack,
      onEndGame: handleEndGame,
      onFinish: handleFinishGame,
      onQuit: handleQuitGame,
      onAutoSave: handleAutoSave,
      onUpdateCards,
      onSaveToHarvest,
      savedState: restoredSession,
      settings,
      globalRetryBag,
      addToRetryBag,
      removeFromRetryBag
    }),
    [
      cards,
      t,
      mainColor,
      lang,
      gameConfig,
      activeGameAiMode,
      activeApiKey,
      onPlay,
      onBookmark,
      notebook,
      showToast,
      onLogWrong,
      onMissingKey,
      handleBack,
      handleEndGame,
      handleFinishGame,
      handleQuitGame,
      handleAutoSave,
      onUpdateCards,
      onSaveToHarvest,
      restoredSession,
      settings,
      globalRetryBag,
      addToRetryBag,
      removeFromRetryBag
    ]
  );

  const handleReturnToMenu = useCallback(() => {
    stopAllSpeech();
    setRestoredSession(null);
    setGameState('menu');
  }, [stopAllSpeech]);

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
              stopAllSpeech();
              if (activeExamLogic.quitExam) activeExamLogic.quitExam();
              setRestoredSession(null);
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
              const resolvedAi = resolveConfigAiMode(config, false);
              handleStartGame('quiz', { ...config, isAiMode: resolvedAi, aiMode: resolvedAi });
            }}
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
            onBack={handleReturnToMenu}
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
              onBack={handleReturnToMenu}
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
              {...sharedGameProps}
              timerMode={gameConfig.timerMode}
              timeLimit={gameConfig.timeLimit}
              initialDifficulty={gameConfig.hardMode ? 'hard' : 'easy'}
            />
          )}

          {gameType === 'scramble' && ScrambleGame && (
            <ScrambleGame
              key={gameSessionId}
              {...sharedGameProps}
              timerMode={gameConfig.timerMode}
              timeLimit={gameConfig.timeLimit}
              initialDifficulty={gameConfig.hardMode ? 'hard' : 'easy'}
            />
          )}

          {gameType === 'quiz' && QuizGame && (
            <QuizGame
              key={gameSessionId}
              {...sharedGameProps}
              timerMode={gameConfig.timerMode}
              listenMode={gameConfig.listenMode}
              timeLimit={gameConfig.timeLimit}
              hardMode={gameConfig.hardMode}
              isLoading={isLoading}
              AiModeSwitch={AiModeSwitch}
            />
          )}

          {gameType === 'fillblank' && FillBlankGame && (
            <FillBlankGame key={gameSessionId} {...sharedGameProps} />
          )}

          {gameType === 'spotmistake' && SpotMistakeGame && (
            <SpotMistakeGame key={gameSessionId} {...sharedGameProps} />
          )}

          {gameType === 'oddoneout' && OddOneOutGame && (
            <OddOneOutGame key={gameSessionId} {...sharedGameProps} />
          )}

          {gameType === 'imagequiz' && ImageQuizGame && (
            <ImageQuizGame key={gameSessionId} {...sharedGameProps} mainColor="emerald" />
          )}

          {gameType === 'pronunciation' && PronunciationGame && (
            <PronunciationGame key={gameSessionId} {...sharedGameProps} mainColor="indigo" />
          )}

          {gameType === 'listening' && ListeningGame && (
            <ListeningGame key={gameSessionId} {...sharedGameProps} mainColor="cyan" />
          )}

          {gameType === 'reading' && ReadingGame && (
            <ReadingGame key={gameSessionId} {...sharedGameProps} mainColor="slate" />
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