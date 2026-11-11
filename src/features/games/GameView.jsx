/**
 * @file src/features/games/GameView.jsx
 * @description Trạm Switchboard điều hướng trung tâm của Tầng 5. Quản lý việc hiển thị Game Menu, 10 Mini-games và Môi trường Khảo thí (Mock Test).
 * @origin Tầng 5 - Block 5.7b (Game View Router)
 */

import React, { useState, useEffect } from 'react';
import { Utils } from '@/utils/helpers';

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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Phân rã State và Logic
  const { lang, cards, mainColor, examLogic, gameSessions, settings } = state;

  // Lắng nghe tín hiệu Điều hướng Ẩn (từ Màn hình Sổ tay Lỗi sai muốn ôn tập bằng Game)
  useEffect(() => {
    if (window.__pendingGameRoute) {
      const route = window.__pendingGameRoute;
      window.__pendingGameRoute = null; // Consume route
      
      const gameType = route.split('_')[0];
      if (gameType) {
        setActiveGame(gameType);
      }
    }
  }, [activeGame]);

  // ============================================================================
  // 1. NHÁNH RENDER MÔI TRƯỜNG KHẢO THÍ (MOCK TEST ERA)
  // ============================================================================
  if (examLogic && examLogic.examState) {
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
            totalQuestions={examState.blueprint.length}
            timeLeft={examState.timeRemaining}
            onAnswerSubmit={examLogic.submitAnswer}
            onSpeak={actions.speak}
            isReviewMode={false}
            fontFamily={Utils.getFontFamily(settings)}
            lang={lang}
          />
          
          {/* Nút nộp bài khẩn cấp */}
          <div className="absolute top-3 left-4 z-[60]">
            <button 
              onClick={() => {
                if(window.confirm('Bạn có chắc chắn muốn nộp bài sớm? Các câu chưa làm sẽ bị tính là sai.')) {
                  examLogic.forceSubmitExam();
                }
              }} 
              className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-bold shadow-sm hover:bg-red-100 transition-colors"
            >
              Nộp bài
            </button>
          </div>
          
          {/* Màn che bảo vệ khi chờ chuyển câu (Cooldown) */}
          {examCooldown > 0 && (
            <div className="absolute inset-0 z-[100] bg-white/70 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
              <div className="bg-white px-6 py-4 rounded-2xl shadow-xl font-bold text-indigo-600 flex flex-col items-center gap-3 border border-indigo-100">
                <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <div className="animate-pulse tracking-wide">Chuẩn bị câu tiếp theo ({examCooldown}s)...</div>
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
            onRestart={() => examLogic.startExam(examState.profile?.id, examState.blueprint[0]?.level, '')}
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
            <h2 className="text-xl font-bold text-red-700 mb-2">Lỗi Khởi tạo Kỳ thi</h2>
            <p className="text-sm text-red-600 mb-6">Mạng không ổn định hoặc dữ liệu kỳ thi bị hỏng.</p>
            <button onClick={examLogic.quitExam} className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl shadow-md hover:bg-red-700">Quay lại Menu</button>
         </div>
       );
    }
  }

  // ============================================================================
  // 2. NHÁNH RENDER MINI-GAMES & BỘ ĐỊNH TUYẾN
  // ============================================================================
  
  // Đóng gói toàn bộ Props khổng lồ dùng chung cho 10 games
  const commonGameProps = {
    cards: cards,
    lang: lang,
    apiKey: state.apiKey,
    settings: settings,
    currentLevel: state.currentLevel,
    setCurrentLevel: setters.setCurrentLevel,
    currentTopic: state.currentTopic,
    setCurrentTopic: setters.setCurrentTopic,
    dataMode: state.dataMode,
    setDataMode: setters.setDataMode,
    gameSessions: gameSessions,
    setGameSessions: setters.setGameSessions,
    globalRetryBag: state.globalRetryBag,
    addToRetryBag: actions.addToRetryBag,
    removeFromRetryBag: actions.removeFromRetryBag,
    onLogWrong: actions.handleLogWrong,
    onSaveToHarvest: actions.handleSaveToHarvest,
    onOpenWordSelector: actions.handleOpenWordSelector,
    onOpenHanzi: actions.handleOpenHanzi,
    speak: actions.speak,
    isMuted: state.isMuted,
    onBack: () => setActiveGame(null),
    onMissingKey: actions.onMissingKey,
    setIsGamePlaying: actions.setIsGamePlaying,
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
      return <ImageQuizGame {...commonGameProps} />;
    case 'pronunciation':
      return <PronunciationGame {...commonGameProps} />;
    case 'listening':
      return <ListeningGame {...commonGameProps} />;
    case 'reading':
      return <ReadingGame {...commonGameProps} />;
      
    default:
      // Màn hình Mặc định: Game Menu
      return (
        <GameMenu
          onSelectGame={(gameId) => setActiveGame(gameId)}
          onStartExam={examLogic?.startExam}
          onResumeExam={examLogic?.resumeExam}
          onOpenExamPoolManager={actions.handleOpenExamPoolManager}
          onOpenAiConfig={actions.handleOpenAiConfig}
          cardsCount={cards.length}
          lang={lang}
          currentLevel={state.currentLevel}
          setCurrentLevel={setters.setCurrentLevel}
          currentTopic={state.currentTopic}
          setCurrentTopic={setters.setCurrentTopic}
          gameSessions={gameSessions}
          mainColor={mainColor}
          t={actions.t}
        />
      );
  }
};

export default GameView;