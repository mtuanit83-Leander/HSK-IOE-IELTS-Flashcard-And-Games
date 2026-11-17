// ============================================================================
// FILE 70/85: src/features/games/ReadingUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.23 - Reading Setup & PlayScreen UI V1.05)
// NHIỆM VỤ: Giao diện Cài đặt (ReadingSetup) và Màn hình chơi chia đôi
//           (ReadingPlayScreen - Split View) cho trò chơi Thám Tử Đọc Hiểu.
// ============================================================================

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (READING SETUP)
// ============================================================================
export const ReadingSetup = ({ mainColor = 'slate', onStart, onBack }) => {
  const savedConfig = (() => {
    try {
      const raw = localStorage.getItem('fc_reading_config');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Load fc_reading_config failed:', e);
      return null;
    }
  })();

  const [sourceMode, setSourceMode] = useState(
    () => savedConfig?.sourceMode ?? 'ai_pure'
  );
  // Đọc hiểu thường cần canh giờ tổng cho cả đoạn văn (Mặc định: 5 phút = 300s)
  const [timerMode, setTimerMode] = useState(
    () => savedConfig?.timerMode ?? true
  );
  const [timeLimit, setTimeLimit] = useState(
    () => savedConfig?.timeLimit ?? 300
  );

  const handleStart = () => {
    const config = { sourceMode, aiMode: true, timerMode, timeLimit };
    try {
      localStorage.setItem('fc_reading_config', JSON.stringify(config));
    } catch (e) {
      console.warn('Save fc_reading_config failed:', e);
    }
    if (onStart) onStart(config);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-6 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            Cấu hình: Thám Tử Đọc Hiểu
          </h2>
          <div className="w-10"></div>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {/* Nguồn dữ liệu */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
              Nguồn dữ liệu
            </label>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode('ai_pure')}
                className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
                  sourceMode === 'ai_pure'
                    ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-md`
                    : 'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <div
                  className={`p-3 rounded-xl ${
                    sourceMode === 'ai_pure'
                      ? `bg-${mainColor}-500 text-white`
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <Icons.Sparkles size={24} />
                </div>
                <div className="text-left flex-1">
                  <div
                    className={`font-bold text-lg ${
                      sourceMode === 'ai_pure'
                        ? `text-${mainColor}-700`
                        : 'text-gray-700'
                    }`}
                  >
                    AI Sáng Tác Đoạn Văn
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Tạo bài đọc học thuật & câu hỏi (TFNG, MCQ, Điền từ) vô tận
                  </div>
                </div>
                {sourceMode === 'ai_pure' && (
                  <Icons.CheckCircle
                    size={20}
                    className={`text-${mainColor}-500`}
                  />
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 italic text-center">
              * Dạng bài Đọc Hiểu đòi hỏi xử lý văn bản lớn, cần API Key để hoạt
              động.
            </p>
          </div>

          {/* Cấu hình Timer (Canh giờ tổng cho nguyên đoạn văn) */}
          {MenuToggle && (
            <MenuToggle
              active={timerMode}
              setActive={setTimerMode}
              icon={Icons.Clock}
              color="orange"
              title="Canh giờ (Cho 1 Đoạn Văn)"
              subtitle={
                timerMode
                  ? `${timeLimit / 60} phút / đoạn`
                  : 'Thoải mái thời gian'
              }
              extra={
                <div className="mt-3 pt-2 border-t border-orange-100 flex flex-col gap-2 animate-in fade-in">
                  <span className="text-[10px] font-bold text-orange-400 uppercase">
                    Khuyến nghị: 5 phút/đoạn (IELTS)
                  </span>
                  <div className="flex gap-2 w-full">
                    {[180, 300, 420, 600].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimeLimit(sec);
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                          timeLimit === sec
                            ? 'bg-orange-500 text-white border-orange-500 shadow-md scale-105'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50'
                        }`}
                      >
                        {sec / 60} phút
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
          )}
        </div>

        <div className="w-full mt-4 pt-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 bg-${mainColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg`}
          >
            <Icons.BookOpen size={24} fill="currentColor" /> LUYỆN ĐỌC NGAY
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (READING PLAY SCREEN - SPLIT VIEW)
// ============================================================================
export const ReadingPlayScreen = ({
  mainColor = 'slate',
  config,
  passageData,
  currentSubQuestion,
  subIndex = 0,
  totalSubQuestions = 0,
  inputBuffer = '',
  setInputBuffer,
  typeInputRef,
  checkStatus = 'idle',
  selectedOptionIndex = null,
  attempts = 0,
  score = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  timeLeft = 300,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  queueLength = 0,
  correctCount = 0,
  wrongCount = 0,
  resultTimer = 0,
  isResultPaused = false,
  aiWaitTime = 0,
  handleOptionClick,
  handleFillSubmit,
  handleSkip,
  nextRound,
  handleNext,
  handleSaveAndBack,
  onBack,
  onSaveToNotebook,
  isBookmarked = false,
  toggleResultPause,
  onEndGame
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  const safeLevelStr = getSafeLevelString(config?.level, 'level_8_academic');
  const onBackAction = onBack || handleSaveAndBack;
  const onNextAction = nextRound || handleNext;

  const handleBookmark = (e) => {
    e.stopPropagation();
    if (!onSaveToNotebook || !currentSubQuestion) return;
    onSaveToNotebook({
      isSmartTarget: true,
      save: currentSubQuestion.correctAnswer || 'Đọc hiểu',
      display: currentSubQuestion.questionText || 'Câu hỏi đọc hiểu',
      analysis: `Trích dẫn trong bài: "${currentSubQuestion.explanation || ''}"`
    });
  };

  const getOptionClass = (opt, i) => {
    if (checkStatus === 'correct' || checkStatus === 'failed') {
      const isCorrectOpt =
        String(opt).toLowerCase().trim() ===
        String(currentSubQuestion?.correctAnswer || '')
          .toLowerCase()
          .trim();
      if (isCorrectOpt) {
        return 'bg-green-100 border-green-500 text-green-900 shadow-md transform scale-[1.02] font-bold z-10';
      }
      if (i === selectedOptionIndex && !isCorrectOpt) {
        return 'bg-red-100 border-red-500 text-red-900 font-bold opacity-80 animate-[shake_0.4s_ease-in-out]';
      }
      return 'bg-gray-50 border-gray-100 text-gray-300 opacity-60';
    }
    if (checkStatus === 'wrong_retry' && i === selectedOptionIndex) {
      return 'bg-red-50 border-red-300 text-red-400 opacity-80 cursor-not-allowed animate-[shake_0.4s_ease-in-out]';
    }
    return `bg-white border-gray-200 text-gray-700 hover:bg-${mainColor}-50 hover:border-${mainColor}-300 hover:shadow-md active:scale-95`;
  };

  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];

  // MÀN HÌNH CHỜ (LOADING) ĐẦU GAME
  if (isGenerating && !passageData) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }
    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onCancel={onBackAction}
        queueLength={queueLength}
        text={
          aiCountdown > 0
            ? 'AI đang soạn thảo văn bản...'
            : config?.sourceMode === 'ai_pure'
            ? 'Đang trích xuất câu hỏi...'
            : 'Đang tải đoạn văn...'
        }
        subText={
          aiCountdown > 0
            ? '(Việc tạo một tổ kén học thuật cần một chút thời gian)'
            : ''
        }
        mainColor={mainColor}
        levelStr={
          config?.sourceMode === 'ai_pure' && safeLevelStr
            ? safeLevelStr.replace('level_', '').replace(/_/g, ' ').toUpperCase()
            : ''
        }
      />
    );
  }

  // FALLBACK KHI LỖI KHÔNG NẠP ĐƯỢC TỔ KÉN
  if (!isGenerating && !passageData) {
    return (
      <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center animate-in fade-in p-6 text-center absolute inset-0 z-50">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          Lỗi nạp dữ liệu
        </h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được tổ kén đọc hiểu. Vui lòng kiểm tra lại kết
          nối mạng hoặc thử lại.
        </p>
        <button
          type="button"
          onClick={() =>
            onEndGame &&
            onEndGame({
              correct: correctCount,
              score: score,
              time: time,
              wrong: wrongCount
            })
          }
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  // MÀN HÌNH HOÀN THÀNH
  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300 absolute inset-0 z-50">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-500 rounded-full flex items-center justify-center mb-6 shadow-inner`}
        >
          <Icons.Award size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Tuyệt vời!</h2>
        <p className="text-gray-500 mb-8 text-center">
          Bạn đã hoàn thành chặng đọc hiểu.
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Điểm
            </div>
            <div className={`text-xl font-bold text-${mainColor}-600`}>
              {score || 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm text-center">
            <div className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.Check size={12} /> Đúng
            </div>
            <div className="text-xl font-bold text-green-600">
              {correctCount || 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm text-center">
            <div className="text-[10px] text-red-400 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.X size={12} /> Sai
            </div>
            <div className="text-xl font-bold text-red-500">
              {wrongCount || 0}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onEndGame &&
            onEndGame({
              correct: correctCount,
              score: score,
              time: time,
              wrong: wrongCount
            })
          }
          className={`w-full max-w-xs py-4 rounded-xl bg-${mainColor}-600 text-white font-bold text-lg hover:bg-${mainColor}-700 shadow-lg active:scale-95 transition-all`}
        >
          Hoàn tất
        </button>
      </div>
    );
  }

  if (!passageData || !currentSubQuestion) return null;

  const isFillBlank = currentSubQuestion.type === 'fill_blank';
  const isInteractive =
    checkStatus !== 'correct' && checkStatus !== 'failed' && !isGenerating;

  return (
    <div className="flex flex-col h-full w-full mx-auto bg-gray-100 relative overflow-hidden">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>

      {/* Thanh Tiến Trình Thời Gian Tổng */}
      {config?.timerMode && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-200 z-50">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 30 ? 'bg-red-500' : `bg-${mainColor}-500`
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, (timeLeft / (config.timeLimit || 300)) * 100))}%`
            }}
          ></div>
        </div>
      )}

      {/* POPUP Xác nhận thoát */}
      {showConfirmEnd && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">
              Thoát ngay?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Bạn sẽ mất điểm của câu này. Bạn có chắc không?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200"
              >
                Chơi tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmEnd(false);
                  if (onEndGame) {
                    onEndGame({
                      correct: correctCount,
                      score: score,
                      time: time,
                      wrong: wrongCount
                    });
                  }
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay chuyển tổ kén */}
      {isGenerating &&
        passageData &&
        (config?.sourceMode === 'card' && !config?.aiMode ? (
          <div className="absolute inset-0 z-[150] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            duration={0}
            queueLength={queueLength}
            text="Đang chuyển sang tổ kén mới..."
            mainColor={mainColor}
          />
        ))}

      {/* HEADER TỔNG */}
      <div className="flex justify-between items-center p-2 sm:p-3 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10">
        <button
          type="button"
          onClick={onBackAction}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          title="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-3">
          <div
            className={`text-sm font-black text-${mainColor}-700 uppercase tracking-widest hidden sm:block`}
          >
            Reading Passage
          </div>
          <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full shadow-inner">
            <span className="text-xs font-bold text-gray-600">
              Đoạn {playedCount + 1}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-xs font-bold text-green-600 flex items-center gap-1">
              <Icons.Check size={12} /> {correctCount}
            </span>
            <span className="text-xs font-bold text-red-500 flex items-center gap-1">
              <Icons.X size={12} /> {wrongCount}
            </span>
          </div>
          {combo > 1 && (
            <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-orange-500">
              🔥 x{combo}
            </div>
          )}
          {config?.timerMode && (
            <div
              className={`text-sm font-mono font-bold ${
                timeLeft <= 30
                  ? 'text-red-500 animate-pulse'
                  : `text-${mainColor}-700`
              } flex items-center gap-1`}
            >
              <Icons.Clock size={16} /> {formatGameTime(timeLeft)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {passageData._isRescued ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn:
              Dự phòng
            </span>
          ) : passageData.isAiGenerated ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 shadow-sm"
              title="Câu hỏi được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600 shadow-sm"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {/* Chỉ hiện băng đạn nếu có dùng AI */}
          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span
                className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                title={`Đã nạp sẵn ${queueLength} đoạn văn`}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {/* ĐỒNG HỒ PHANH AI GÓC PHẢI */}
          {aiWaitTime > 0 && (
            <span
              className="hidden sm:flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}
        </div>
      </div>

      {/* KIẾN TRÚC SPLIT VIEW */}
      <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden relative">
        {/* NỬA TRÁI: ĐOẠN VĂN (SCROLLABLE) */}
        <div className="flex-1 lg:w-1/2 h-1/2 lg:h-full bg-white border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto custom-scrollbar p-5 md:p-8">
          <div className="w-full max-w-2xl mx-auto pb-safe">
            <h2 className="text-xl md:text-2xl font-serif font-black text-gray-800 mb-6 pb-4 border-b-2 border-gray-100 leading-tight">
              {(passageData.passage || '').split('\n')[0].substring(0, 50)}...
            </h2>
            <div className="text-base md:text-lg text-gray-700 font-serif leading-loose text-justify whitespace-pre-wrap">
              {passageData.passage}
            </div>
          </div>
        </div>

        {/* NỬA PHẢI: CÂU HỎI CON VÀ CONTROL (SCROLLABLE) */}
        <div className="flex-1 lg:w-1/2 h-1/2 lg:h-full bg-gray-50 flex flex-col relative overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-24">
            <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
              {/* Header câu hỏi con */}
              <div className="flex items-center justify-between bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                <span
                  className={`text-xs font-bold uppercase text-${mainColor}-600 tracking-widest`}
                >
                  {currentSubQuestion.type === 'tfng'
                    ? 'True / False / Not Given'
                    : currentSubQuestion.type === 'fill_blank'
                    ? 'Điền từ khuyết'
                    : 'Trắc nghiệm'}
                </span>
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Câu {subIndex + 1} / {totalSubQuestions}
                </span>
              </div>

              {/* Nội dung câu hỏi */}
              <div className="text-lg md:text-xl font-bold text-gray-800 leading-snug">
                {isFillBlank
                  ? (currentSubQuestion.questionText || '')
                      .split('[__________]')
                      .map((part, i, arr) => (
                        <React.Fragment key={i}>
                          {part}
                          {i < arr.length - 1 && (
                            <span
                              className={`inline-block w-20 border-b-4 mx-1 ${
                                checkStatus === 'correct'
                                  ? 'border-green-400'
                                  : checkStatus === 'failed'
                                  ? 'border-red-400'
                                  : `border-${mainColor}-300`
                              }`}
                            ></span>
                          )}
                        </React.Fragment>
                      ))
                  : currentSubQuestion.questionText}
              </div>

              {/* Khu vực tương tác */}
              {isFillBlank ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2 w-full animate-in slide-in-from-bottom-2">
                    <input
                      ref={typeInputRef}
                      type="text"
                      value={inputBuffer}
                      onChange={(e) =>
                        setInputBuffer && setInputBuffer(e.target.value)
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        handleFillSubmit &&
                        handleFillSubmit()
                      }
                      disabled={!isInteractive}
                      className={`flex-1 p-4 text-center text-lg font-bold border-4 rounded-xl outline-none shadow-inner transition-colors ${
                        checkStatus === 'correct'
                          ? 'border-green-400 bg-green-50 text-green-700'
                          : checkStatus === 'failed'
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : checkStatus === 'wrong_retry'
                          ? 'border-orange-400 bg-orange-50 text-orange-700 animate-[shake_0.4s_ease-in-out]'
                          : `border-${mainColor}-200 focus:border-${mainColor}-500 bg-white text-gray-800`
                      }`}
                      placeholder="Gõ đáp án..."
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={handleFillSubmit}
                      disabled={!inputBuffer.trim() || !isInteractive}
                      className={`px-5 bg-${mainColor}-600 text-white rounded-xl font-bold shadow-md hover:bg-${mainColor}-700 disabled:opacity-50 active:scale-95 transition-transform shrink-0`}
                    >
                      <Icons.Check size={24} />
                    </button>
                  </div>
                  {attempts > 0 && isInteractive && (
                    <p className="text-xs text-orange-500 font-bold text-center">
                      Còn {3 - attempts} lượt sửa.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(currentSubQuestion.options || []).map((optText, i) => {
                    const btnClass = getOptionClass(optText, i);
                    const isCorrectOpt =
                      checkStatus !== 'idle' &&
                      String(optText).toLowerCase().trim() ===
                        String(currentSubQuestion.correctAnswer || '')
                          .toLowerCase()
                          .trim();
                    const isSelectedWrong =
                      checkStatus !== 'idle' &&
                      i === selectedOptionIndex &&
                      !isCorrectOpt;

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          isInteractive &&
                          handleOptionClick &&
                          handleOptionClick(
                            i,
                            String(optText).toLowerCase().trim() ===
                              String(currentSubQuestion.correctAnswer || '')
                                .toLowerCase()
                                .trim()
                          )
                        }
                        disabled={!isInteractive}
                        className={`w-full p-4 border-2 rounded-xl transition-all text-left flex items-center justify-between shadow-sm ${btnClass}`}
                      >
                        <div className="flex items-center gap-3">
                          {currentSubQuestion.type !== 'tfng' && (
                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold flex-none ${
                                isCorrectOpt
                                  ? 'bg-green-200 text-green-800'
                                  : isSelectedWrong
                                  ? 'bg-red-200 text-red-800'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {labels[i]}
                            </span>
                          )}
                          <span className="text-base font-bold leading-snug">
                            {optText}
                          </span>
                        </div>
                        {(checkStatus === 'correct' ||
                          checkStatus === 'failed') &&
                          (isCorrectOpt ? (
                            <Icons.CheckCircle
                              size={20}
                              className="text-green-600 flex-none"
                            />
                          ) : isSelectedWrong ? (
                            <Icons.X
                              size={20}
                              className="text-red-500 flex-none"
                            />
                          ) : null)}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* BẢNG GIẢI THÍCH KIẾN THỨC (Hiện khi trả lời xong) */}
              {(checkStatus === 'correct' || checkStatus === 'failed') && (
                <div
                  className={`mt-4 w-full rounded-2xl border-2 animate-in slide-in-from-bottom-4 shadow-md bg-white overflow-hidden ${
                    checkStatus === 'correct'
                      ? 'border-green-200'
                      : 'border-red-200'
                  }`}
                >
                  <div
                    className={`p-3 ${
                      checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500'
                    } text-white flex items-center justify-between px-5 font-bold`}
                  >
                    <div className="flex items-center gap-2 text-base">
                      {checkStatus === 'correct' ? (
                        <Icons.CheckCircle size={20} />
                      ) : (
                        <Icons.X size={20} />
                      )}
                      {checkStatus === 'correct' ? 'CHÍNH XÁC!' : 'SAI RỒI!'}
                    </div>
                    <button
                      type="button"
                      onClick={handleBookmark}
                      className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs transition-colors shadow-sm"
                    >
                      <Icons.Bookmark
                        size={12}
                        fill={isBookmarked ? 'white' : 'none'}
                      />{' '}
                      {isBookmarked ? 'Đã lưu' : 'Lưu'}
                    </button>
                  </div>

                  <div className="p-5 flex flex-col gap-4">
                    {checkStatus === 'failed' && (
                      <div className="text-center pb-3 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                          Đáp án đúng là
                        </span>
                        <span className="text-xl font-black text-green-600">
                          {currentSubQuestion.correctAnswer}
                        </span>
                      </div>
                    )}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left">
                      <span className="flex items-center gap-1 text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                        <Icons.Sparkles size={14} /> Trích dẫn trong bài
                      </span>
                      <p className="text-blue-900 text-sm leading-relaxed font-medium">
                        {currentSubQuestion.explanation}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="h-10 w-full shrink-0"></div>
            </div>
          </div>

          {/* FOOTER CỦA CỘT PHẢI */}
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 flex items-center justify-between z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            {/* Nút Kết thúc (Bên trái) */}
            <button
              type="button"
              onClick={() => setShowConfirmEnd(true)}
              className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
              title="Kết thúc"
            >
              <Icons.X size={16} />{' '}
              <span className="hidden sm:inline">Kết thúc</span>
            </button>

            {/* Khu vực điều khiển chính (Căn giữa/phải) */}
            <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
              {checkStatus === 'correct' || checkStatus === 'failed' ? (
                <div className="w-full flex gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => toggleResultPause && toggleResultPause()}
                    className={`flex-1 py-3 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                      isResultPaused
                        ? 'bg-orange-50 text-orange-600 border-orange-200'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {isResultPaused ? (
                      <>
                        <Icons.Play size={16} /> Đã dừng
                      </>
                    ) : (
                      <>
                        <Icons.Pause size={16} /> Đợi ({resultTimer}s)
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onNextAction}
                    disabled={isGenerating || aiWaitTime > 0}
                    className={`flex-[2] py-3 bg-${
                      checkStatus === 'correct'
                        ? 'green-500'
                        : mainColor + '-600'
                    } text-white font-bold text-sm sm:text-base rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 active:scale-95 transition-transform ${
                      isGenerating || aiWaitTime > 0
                        ? 'opacity-70 cursor-not-allowed'
                        : `hover:bg-${
                            checkStatus === 'correct'
                              ? 'green-600'
                              : mainColor + '-700'
                          }`
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                        Đang tải...
                      </>
                    ) : (
                      <>
                        {subIndex === totalSubQuestions - 1
                          ? 'Hoàn thành Đoạn văn'
                          : 'Câu tiếp theo'}{' '}
                        <Icons.ChevronRight size={20} />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={isGenerating || aiWaitTime > 0}
                  className={`w-full py-3 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 border border-gray-200 flex items-center justify-center gap-2 ${
                    isGenerating || aiWaitTime > 0
                      ? 'opacity-50 cursor-not-allowed'
                      : 'active:scale-95'
                  }`}
                >
                  Bỏ qua câu này <Icons.SkipForward size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_23_ReadingSetup = ReadingSetup;
  window.ReadingSetup = ReadingSetup;
  window.Block5_23_ReadingPlayScreen = ReadingPlayScreen;
  window.ReadingPlayScreen = ReadingPlayScreen;
}

export default {
  ReadingSetup,
  ReadingPlayScreen
};