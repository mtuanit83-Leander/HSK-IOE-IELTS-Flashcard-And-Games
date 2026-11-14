/**
 * @file src/features/games/GameView.jsx
 * @description Trạm Switchboard điều hướng trung tâm của Tầng 5. Quản lý việc hiển thị Game Menu, 10 Mini-games và Môi trường Khảo thí (Mock Test).
 * Đồng bộ 100% với GameMenu nguyên bản (Block 5.7 V1.09) và kiến trúc 10 Mini-games độc lập.
 * @origin Tầng 5 - Block 5.7b (Game View Router)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Utils } from '@/utils/helpers';
import { STORAGE_KEYS } from '@/config/constants';
import { Icons } from '@/components/common/Icons';

// Giao diện Menu & Loader
import { GameMenu } from './GameMenu';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';

// 10 Mini-games Controllers
import { MatchGame } from './MatchGame';
import { QuizGame } from './QuizGame';
import { ScrambleGame } from './ScrambleGame';
import { FillBlankGame } from './FillBlankGame';
import { SpotMistakeGame } from './SpotMistakeGame';
import { OddOneOutGame } from './OddOneOutGame';
import { ImageQuizGame } from './ImageQuizGame';
import { PronunciationGame } from './PronunciationGame';
import { ListeningGame } from './ListeningGame';
import { ReadingGame } from './ReadingGame';

// Môi trường Khảo thí (Mock Test)
import { ExamUIShell } from '../exam/ExamUIShell';
import { ExamReportUI } from '../exam/ExamReportUI';
import { ExamReviewModal } from '../exam/ExamReviewModal';

export const GameView = ({ state, actions, setters }) => {
  const [activeGame, setActiveGame] = useState(null);
  const [gameLaunchOptions, setGameLaunchOptions] = useState({});
  const [gameInstanceKey, setGameInstanceKey] = useState(() => Date.now());
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [showForceSubmitConfirm, setShowForceSubmitConfirm] = useState(false);

  // Phân rã State và Logic từ Tầng 6
  const {
    lang,
    cards,
    mainColor,
    examLogic,
    gameSessions,
    settings,
    dataMode,
    currentLevel,
    currentTopic
  } = state;

  const currentExamStatus = examLogic?.examState?.status || 'idle';
  const isExamActive =
    currentExamStatus === 'loading' ||
    currentExamStatus === 'playing' ||
    currentExamStatus === 'completed' ||
    currentExamStatus === 'error';

  // Đồng bộ cờ isGamePlaying lên App khi đang ở trong Phòng thi Khảo thí (để ẩn BottomNav)
  useEffect(() => {
    const setPlayingFn = actions?.setIsGamePlaying || setters?.setIsGamePlaying;
    if (!setPlayingFn) return;

    if (currentExamStatus === 'loading' || currentExamStatus === 'playing') {
      setPlayingFn(true);
    } else if (!activeGame) {
      setPlayingFn(false);
    }
  }, [currentExamStatus, activeGame, actions, setters]);

  // Lắng nghe tín hiệu Điều hướng Ẩn (từ Màn hình Sổ tay / Lỗi sai muốn ôn tập bằng Game)
  useEffect(() => {
    if (window.__pendingGameRoute) {
      const route = window.__pendingGameRoute;
      window.__pendingGameRoute = null; // Consume route

      const gameType = route.split('_')[0];
      if (gameType) {
        setGameLaunchOptions({ fromNotebookReview: true });
        setGameInstanceKey(Date.now());
        setActiveGame(gameType);
      }
    }
  }, [activeGame, state.viewMode]);

  // Xóa phiên lưu dở của 1 game cụ thể (Khi người dùng chọn "Bắt đầu ván mới" từ Popup GameMenu)
  const handleClearGameSession = useCallback(
    (gameType) => {
      if (!gameType || !setters?.setGameSessions) return;
      setters.setGameSessions((prev) => {
        const next = { ...(prev || {}) };
        if (next[gameType]) {
          delete next[gameType];
        }
        return next;
      });
    },
    [setters]
  );

  // Điều phối mở Mini-game (Hỗ trợ cả mở mới lẫn khôi phục ván đang dở)
  const handleLaunchGame = useCallback(
    (gameType, options = {}) => {
      if (!gameType) return;

      // Đánh thức AudioContext & SpeechSynthesis trên trình duyệt di động (iOS/Android)
      try {
        if (window.speechSynthesis) {
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
        if (window.fc_audioCtx && window.fc_audioCtx.state === 'suspended') {
          window.fc_audioCtx.resume();
        }
      } catch (e) {}

      if (options.clearOldSession) {
        handleClearGameSession(gameType);
      }

      setGameLaunchOptions({
        autoResume: Boolean(options.autoResume),
        matchAiMode: Boolean(options.matchAiMode),
        ...options
      });
      setGameInstanceKey(Date.now());
      setActiveGame(gameType);
    },
    [handleClearGameSession]
  );

  // Điều phối bắt đầu bài thi Khảo thí (IOE / HSK / IELTS)
  const handleStartMockTest = useCallback(
    (profileId) => {
      const currentKey =
        state.apiKey ||
        localStorage.getItem(STORAGE_KEYS.API_KEY || 'fc_gemini_api_key') ||
        '';
      if (!currentKey || currentKey.trim().length < 10) {
        if (actions?.onMissingKey) actions.onMissingKey();
        else if (setters?.setShowApiKeyModal) setters.setShowApiKeyModal(true);
        return;
      }

      if (examLogic && typeof examLogic.startExam === 'function') {
        examLogic.startExam(profileId, currentLevel, currentTopic);
      } else if (actions?.showToast) {
        actions.showToast('Hệ thống khảo thí chưa sẵn sàng!', 'error');
      }
    },
    [state.apiKey, actions, setters, examLogic, currentLevel, currentTopic]
  );

  // Điều phối khôi phục bài thi Khảo thí đang dang dở
  const handleResumeMockTest = useCallback(
    (sessionId) => {
      const currentKey =
        state.apiKey ||
        localStorage.getItem(STORAGE_KEYS.API_KEY || 'fc_gemini_api_key') ||
        '';
      if (!currentKey || currentKey.trim().length < 10) {
        if (actions?.onMissingKey) actions.onMissingKey();
        else if (setters?.setShowApiKeyModal) setters.setShowApiKeyModal(true);
        return;
      }

      if (examLogic && typeof examLogic.resumeExam === 'function') {
        examLogic.resumeExam(sessionId);
      } else if (actions?.showToast) {
        actions.showToast('Hệ thống phục hồi bài thi chưa sẵn sàng!', 'error');
      }
    },
    [state.apiKey, actions, setters, examLogic]
  );

  // Quay lại Menu chính từ Mini-game
  const handleBackToMenu = useCallback(() => {
    setActiveGame(null);
    setGameLaunchOptions({});
    const setPlayingFn = actions?.setIsGamePlaying || setters?.setIsGamePlaying;
    if (setPlayingFn) setPlayingFn(false);
  }, [actions, setters]);

  // ============================================================================
  // 1. NHÁNH RENDER MÔI TRƯỜNG KHẢO THÍ (MOCK TEST ERA)
  // ============================================================================
  if (isExamActive && examLogic && examLogic.examState) {
    const { examState, currentQuestion, cachedCount, examCooldown } = examLogic;

    if (examState.status === 'loading') {
      return (
        <GlobalLoadingScreen
          duration={examState.preloadCountdown || 30}
          queueLength={cachedCount}
          text="Phòng Thi Đang Khởi Tạo..."
          subText="Đang nạp ngân hàng đề và phân bổ tổ kén câu hỏi"
          mainColor="indigo"
          onCancel={examLogic.quitExam}
        />
      );
    }

    if (examState.status === 'playing') {
      return (
        <div className="w-full h-full relative animate-in fade-in">
          <ExamUIShell
            question={currentQuestion}
            currentIndex={examState.currentIndex}
            totalQuestions={examState.blueprint?.length || 0}
            timeLeft={examState.timeRemaining}
            onAnswerSubmit={examLogic.submitAnswer}
            onSpeak={actions.speak}
            isReviewMode={false}
            fontFamily={Utils.getFontFamily(settings)}
            lang={lang}
            examLogic={examLogic}
            mainColor={mainColor}
            onExit={() => {
              if (examLogic.quitExam) examLogic.quitExam();
            }}
            onLogWrong={actions.handleLogWrong}
            onOpenIncorrect={actions.handleOpenIncorrect}
            onBookmark={actions.handleNotebookSave}
            notebook={state.notebook}
            onPlay={actions.speak}
          />

          {/* Nút nộp bài sớm */}
          <div className="absolute top-3 left-4 z-[60]">
            <button
              type="button"
              onClick={() => setShowForceSubmitConfirm(true)}
              className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-bold shadow-sm hover:bg-red-100 transition-colors active:scale-95"
            >
              Nộp bài
            </button>
          </div>

          {/* Modal xác nhận nộp bài sớm (Thay thế window.confirm) */}
          {showForceSubmitConfirm && (
            <div
              className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
              onClick={() => setShowForceSubmitConfirm(false)}
            >
              <div
                className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-gray-100 flex flex-col items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                  {Icons.AlertCircle ? <Icons.AlertCircle size={28} /> : '⚠️'}
                </div>
                <h3 className="text-lg font-black text-gray-800 mb-2">
                  Nộp bài thi sớm?
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed">
                  Bạn có chắc chắn muốn nộp bài sớm? Các câu chưa hoàn thành sẽ được tính là chưa trả lời.
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setShowForceSubmitConfirm(false)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
                  >
                    Làm tiếp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForceSubmitConfirm(false);
                      if (examLogic.forceSubmitExam) {
                        examLogic.forceSubmitExam();
                      }
                    }}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors"
                  >
                    Nộp bài ngay
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Màn che bảo vệ khi chờ chuyển câu (Cooldown) */}
          {examCooldown > 0 && (
            <div className="absolute inset-0 z-[100] bg-white/70 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
              <div className="bg-white px-6 py-4 rounded-2xl shadow-xl font-bold text-indigo-600 flex flex-col items-center gap-3 border border-indigo-100">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="animate-pulse tracking-wide">
                  Chuẩn bị câu tiếp theo ({examCooldown}s)...
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (examState.status === 'completed') {
      return (
        <>
          <ExamReportUI
            examState={examState}
            onReview={() => setIsReviewModalOpen(true)}
            onRestart={() =>
              examLogic.startExam(
                examState.profile?.id,
                examState.blueprint?.[0]?.level || currentLevel,
                ''
              )
            }
            onBackToMenu={examLogic.quitExam}
            onExportExcel={examLogic.exportExamToExcel}
            mainColor="indigo"
          />
          <ExamReviewModal
            isOpen={isReviewModalOpen}
            onClose={() => setIsReviewModalOpen(false)}
            examState={examState}
            mainColor="indigo"
          />
        </>
      );
    }

    if (examState.status === 'error') {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 rounded-2xl border-2 border-red-200 p-6 text-center">
          <h2 className="text-xl font-bold text-red-700 mb-2">
            Lỗi Khởi tạo Kỳ thi
          </h2>
          <p className="text-sm text-red-600 mb-6">
            Mạng không ổn định hoặc dữ liệu kỳ thi bị hỏng.
          </p>
          <button
            type="button"
            onClick={examLogic.quitExam}
            className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl shadow-md hover:bg-red-700"
          >
            Quay lại Menu
          </button>
        </div>
      );
    }
  }

  // ============================================================================
  // 2. NHÁNH RENDER 10 MINI-GAMES & BỘ ĐỊNH TUYẾN TRUNG TÂM
  // ============================================================================
  const commonGameProps = {
    key: gameInstanceKey,
    cards: cards,
    lang: lang,
    apiKey: state.apiKey,
    settings: settings,
    currentLevel: currentLevel,
    setCurrentLevel: setters.setCurrentLevel,
    currentTopic: currentTopic,
    setCurrentTopic: setters.setCurrentTopic,
    dataMode: dataMode,
    setDataMode: setters.setDataMode,
    gameSessions: gameSessions,
    setGameSessions: setters.setGameSessions,
    savedState: activeGame ? gameSessions?.[activeGame] : null,
    autoResume: Boolean(gameLaunchOptions.autoResume),
    initialAiMode: Boolean(gameLaunchOptions.matchAiMode),
    globalRetryBag: state.globalRetryBag,
    addToRetryBag: actions.addToRetryBag,
    removeFromRetryBag: actions.removeFromRetryBag,
    onLogWrong: actions.handleLogWrong,
    onSaveToHarvest: actions.handleSaveToHarvest,
    onOpenWordSelector: actions.handleOpenWordSelector,
    onOpenHanzi: actions.handleOpenHanziStudy || actions.handleOpenHanzi,
    onBookmark: actions.handleNotebookSave,
    notebook: state.notebook,
    speak: actions.speak,
    onPlay: actions.speak,
    showToast: actions.showToast,
    isMuted: state.isMuted,
    onBack: handleBackToMenu,
    onMissingKey: actions.onMissingKey,
    setIsGamePlaying: actions.setIsGamePlaying || setters.setIsGamePlaying,
    mainColor: mainColor,
    t: actions.t
  };

  switch (activeGame) {
    case 'quiz':
      return <QuizGame {...commonGameProps} />;
    case 'match':
      return <MatchGame {...commonGameProps} />;
    case 'scramble':
      return <ScrambleGame {...commonGameProps} />;
    case 'fillblank':
      return <FillBlankGame {...commonGameProps} />;
    case 'spotmistake':
      return <SpotMistakeGame {...commonGameProps} />;
    case 'oddoneout':
      return <OddOneOutGame {...commonGameProps} />;
    case 'imagequiz':
      return <ImageQuizGame {...commonGameProps} mainColor="emerald" />;
    case 'pronunciation':
      return <PronunciationGame {...commonGameProps} mainColor="indigo" />;
    case 'listening':
      return <ListeningGame {...commonGameProps} mainColor="cyan" />;
    case 'reading':
      return <ReadingGame {...commonGameProps} mainColor="slate" />;

    default:
      // Màn hình Mặc định: Game Menu (Cuộn mượt, căn giữa chuẩn xác như bản Original)
      return (
        <div className="relative w-full h-full flex-1 flex flex-col bg-gray-50 overflow-hidden">
          <div className="w-full h-full flex flex-col items-center p-2 sm:p-6 overflow-y-auto custom-scrollbar z-10">
            <GameMenu
              t={actions.t}
              mainColor={mainColor}
              lang={lang}
              cards={cards}
              dataMode={dataMode}
              gameSessions={gameSessions}
              // Bộ callback chuẩn Block 5.7 Original
              onSelectQuiz={(opts) => handleLaunchGame('quiz', opts)}
              onStartMatch={(aiMode, opts) =>
                handleLaunchGame('match', { matchAiMode: aiMode, ...opts })
              }
              onStartScramble={(opts) => handleLaunchGame('scramble', opts)}
              onStartFillBlank={(opts) => handleLaunchGame('fillblank', opts)}
              onStartSpotMistake={(opts) => handleLaunchGame('spotmistake', opts)}
              onStartOddOneOut={(opts) => handleLaunchGame('oddoneout', opts)}
              onStartImageQuiz={(opts) => handleLaunchGame('imagequiz', opts)}
              onStartPronunciation={(opts) =>
                handleLaunchGame('pronunciation', opts)
              }
              onStartListening={(opts) => handleLaunchGame('listening', opts)}
              onStartReading={(opts) => handleLaunchGame('reading', opts)}
              onResume={(type) => handleLaunchGame(type, { autoResume: true })}
              onStartMockTest={handleStartMockTest}
              onResumeMockTest={handleResumeMockTest}
              // Bộ callback mở rộng
              onSelectGame={(type, opts) => handleLaunchGame(type, opts)}
              onStartExam={handleStartMockTest}
              onResumeExam={handleResumeMockTest}
              onClearSession={handleClearGameSession}
              onOpenExamPoolManager={
                actions.handleOpenExamPoolManager ||
                (() => setters.setShowExamPoolManager(true))
              }
              onOpenAiConfig={
                actions.handleOpenAiConfig ||
                (() => setters.setShowAiConfigModal(true))
              }
            />
          </div>
        </div>
      );
  }
};

export default GameView;