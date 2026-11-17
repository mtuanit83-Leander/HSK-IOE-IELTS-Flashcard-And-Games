// ============================================================================
// FILE 68/85: src/features/games/ListeningUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.21 - Listening Setup & PlayScreen UI V1.06)
// NHIỆM VỤ: Giao diện Cài đặt (ListeningSetup) và Màn hình chơi chính
//           (ListeningPlayScreen) cho trò chơi Đôi Tai Vàng (Listening).
// ============================================================================


import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { getSafeLevelString } from './common/gameHelpers';


// ============================================================================
// 1. COMPONENT SETUP (Màn hình cấu hình Đôi Tai Vàng)
// ============================================================================
export const ListeningSetup = ({ mainColor = 'cyan', onStart, onBack }) => {
  const [initialConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('fc_listening_config');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('Load fc_listening_config failed:', e);
      return {};
    }
  });


  const [sourceMode, setSourceMode] = useState(
    () => initialConfig.sourceMode ?? 'ai_pure'
  );
  const [timerMode, setTimerMode] = useState(
    () => initialConfig.timerMode ?? false
  );
  const [timeLimit, setTimeLimit] = useState(
    () => initialConfig.timeLimit ?? 45
  );
  const [maxPlays, setMaxPlays] = useState(() => initialConfig.maxPlays ?? 3);


  const handleStart = () => {
    const config = {
      sourceMode,
      aiMode: true,
      timerMode,
      timeLimit,
      maxPlays
    };
    localStorage.setItem('fc_listening_config', JSON.stringify(config));
    onStart(config);
  };


  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-6 shrink-0 mt-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            Cấu hình: Đôi Tai Vàng
          </h2>
          <div className="w-10"></div>
        </div>


        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {/* Nguồn dữ liệu */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
              Nguồn câu hỏi
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
                    AI Sáng Tác Kịch Bản
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Tạo đoạn hội thoại & câu hỏi nghe hiểu vô tận
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
              * Dạng bài Nghe Hiểu (Listening) bắt buộc sử dụng API Key để hoạt
              động.
            </p>
          </div>


          {/* Cấu hình Lượt Nghe */}
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 transition-all mb-4">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="font-bold flex items-center gap-2 text-purple-700">
                  <Icons.Headphones size={18} /> Giới hạn lượt nghe
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  Tối đa {maxPlays} lần / câu
                </span>
              </div>
            </div>
            <div className="flex justify-center gap-2 mt-4 pt-3 border-t border-purple-200/50 animate-in fade-in">
              <span className="text-xs font-bold text-gray-500 self-center mr-2 uppercase">
                Chọn:
              </span>
              {[1, 2, 3, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMaxPlays(cnt);
                  }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    maxPlays === cnt
                      ? 'bg-purple-500 text-white shadow-md scale-105'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {cnt} lần
                </button>
              ))}
            </div>
          </div>


          {/* Cấu hình Timer */}
          <MenuToggle
            active={timerMode}
            setActive={setTimerMode}
            icon={Icons.Clock}
            color="orange"
            title="Giới hạn thời gian"
            subtitle={
              timerMode ? `${timeLimit} giây / câu` : 'Thoải mái thời gian'
            }
            extra={
              <div className="mt-3 pt-2 border-t border-orange-100 flex justify-between items-center animate-in fade-in">
                <span className="text-[10px] font-bold text-orange-400 uppercase">
                  Chọn thời gian:
                </span>
                <div className="flex gap-1">
                  {[30, 45, 60, 90].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimeLimit(sec);
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                        timeLimit === sec
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            }
          />
        </div>


        <div className="w-full mt-4 pt-4 border-t border-gray-100 bg-white pb-safe shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 bg-${mainColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg`}
          >
            <Icons.Play size={24} fill="currentColor" /> LUYỆN NGHE NGAY
          </button>
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// 2. COMPONENT PLAY SCREEN (Màn hình chơi game Đôi Tai Vàng)
// ============================================================================
export const ListeningPlayScreen = ({
  mainColor = 'cyan',
  config,
  currentQuestion,
  checkStatus,
  selectedOptionIndex,
  score,
  combo,
  playedCount,
  time,
  timeLeft,
  isFinished,
  isGenerating,
  aiCountdown,
  queueLength,
  correctCount,
  wrongCount,
  resultTimer,
  isResultPaused,
  handleOptionClick,
  handleSkip,
  nextRound,
  handleNext,
  handleSaveAndBack,
  onBack,
  onSaveToNotebook,
  isBookmarked,
  toggleResultPause,
  onEndGame,
  isAudioPlaying,
  playCount,
  handlePlayAudio,
  maxPlays = 3,
  aiWaitTime = 0
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);


  const safeLevelStr = getSafeLevelString(config?.level, '');
  const onBackAction = handleSaveAndBack || onBack;
  const onNextAction = nextRound || handleNext;


  const handleBookmark = (e) => {
    e.stopPropagation();
    if (!onSaveToNotebook || !currentQuestion) return;
    const correctOpt = currentQuestion.options?.find((o) => o.isCorrect);
    const ansText = correctOpt ? correctOpt.text : 'Chưa rõ';
    onSaveToNotebook({
      isSmartTarget: true,
      save: ansText,
      display: currentQuestion.term || 'Câu hỏi nghe hiểu',
      analysis: `Transcript: ${currentQuestion.audioScript}\n\nGiải thích: ${
        currentQuestion.explanation || ''
      }`
    });
  };


  const getOptionClass = (opt, i) => {
    if (checkStatus === 'correct' || checkStatus === 'failed') {
      if (opt.isCorrect) {
        return 'bg-green-100 border-green-500 text-green-900 shadow-md transform scale-[1.02] font-bold z-10';
      }
      if (i === selectedOptionIndex && !opt.isCorrect) {
        return 'bg-red-100 border-red-500 text-red-900 font-bold opacity-80 animate-[shake_0.4s_ease-in-out]';
      }
      return 'bg-gray-50 border-gray-100 text-gray-300 opacity-60';
    }
    if (checkStatus === 'wrong_retry' && i === selectedOptionIndex) {
      return 'bg-red-50 border-red-300 text-red-400 opacity-80 cursor-not-allowed animate-[shake_0.4s_ease-in-out]';
    }
    return 'bg-white border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:shadow-md active:scale-95';
  };


  const getLabelClass = (opt, i) => {
    if ((checkStatus === 'correct' || checkStatus === 'failed') && opt.isCorrect) {
      return 'bg-green-200 text-green-800';
    }
    if (
      (checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        checkStatus === 'wrong_retry') &&
      i === selectedOptionIndex &&
      !opt.isCorrect
    ) {
      return 'bg-red-200 text-red-800';
    }
    return 'bg-white text-gray-500 border border-gray-100';
  };


  const labels = ['A', 'B', 'C', 'D'];


  // MÀN HÌNH CHỜ (LOADING) ĐÃ ĐƯỢC SILENT OFFLINE
  if (isGenerating && !currentQuestion) {
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
            ? 'AI đang soạn kịch bản nghe...'
            : config?.sourceMode === 'ai_pure'
            ? 'Đang khởi tạo vòng đấu...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={
          aiCountdown > 0
            ? '(Vui lòng đợi giây lát, đoạn hội thoại có thể khá dài)'
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


  // FALLBACK KHẨN CẤP KHI KHÔNG TẢI ĐƯỢC CÂU HỎI
  if (!isGenerating && !currentQuestion) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 items-center justify-center animate-in fade-in p-6 text-center">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          Lỗi nạp dữ liệu
        </h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được câu hỏi. Vui lòng kiểm tra lại kết nối
          mạng hoặc thử lại.
        </p>
        <button
          type="button"
          onClick={() => onEndGame && onEndGame()}
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
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-500 rounded-full flex items-center justify-center mb-6 shadow-inner`}
        >
          <Icons.Headphones size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Tuyệt vời!</h2>
        <p className="text-gray-500 mb-8 text-center">
          Bạn đã hoàn thành bài luyện nghe hiểu.
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
              time: time || 0,
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


  if (!currentQuestion || !currentQuestion.options) return null;


  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>


      {/* Thanh Tiến Trình Thời Gian */}
      {config?.timerMode &&
        checkStatus !== 'correct' &&
        checkStatus !== 'failed' &&
        !isGenerating && (
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                timeLeft <= 10 ? 'bg-red-500' : `bg-${mainColor}-500`
              }`}
              style={{
                width: `${(timeLeft / (config.timeLimit || 45)) * 100}%`
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
              Kết quả sẽ được ghi nhận. Bạn có chắc không?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
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
                      time: time || 0,
                      wrong: wrongCount
                    });
                  }
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Overlay chuyển vòng mỏng */}
      {isGenerating &&
        currentQuestion &&
        (config?.sourceMode === 'card' && !config?.aiMode ? (
          <div className="absolute inset-0 z-[150] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            duration={0}
            queueLength={queueLength}
            text="Đang tải kịch bản tiếp theo..."
            mainColor={mainColor}
          />
        ))}


      {/* HEADER */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10">
        <button
          type="button"
          onClick={onBackAction}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          title="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>


        <div className="flex items-center gap-3">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL {safeLevelStr.split('_')[1]?.toUpperCase() || '4'}
          </div>
          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1">
            Câu {playedCount + 1} <Icons.InfinityIcon size={14} />
          </div>
          <div
            className={`hidden sm:flex items-center gap-1 font-bold ${
              combo > 1 ? 'text-orange-500' : 'text-gray-400'
            }`}
          >
            🔥 x{combo}
          </div>
        </div>


        <div className="flex items-center gap-1">
          {currentQuestion?.origin?._isRescued || currentQuestion?._isRescued ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn:
              Dự phòng
            </span>
          ) : currentQuestion?.isAiGenerated ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
              title="Câu hỏi được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ
              gốc
            </span>
          )}


          {/* Băng đạn AI */}
          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                title={`Đã nạp sẵn ${queueLength} câu`}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}


          {/* Đồng hồ Phanh AI */}
          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}


          <button
            type="button"
            onClick={handleBookmark}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                : 'text-gray-400 hover:bg-gray-100'
            }`}
            title="Lưu vào Sổ tay"
          >
            <Icons.Bookmark
              size={20}
              fill={isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>


      {/* KHU VỰC CHÍNH */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col items-center relative">
        {/* Đĩa Âm thanh khổng lồ */}
        <div className="w-full flex justify-center my-6 animate-in slide-in-from-top-4">
          <div
            className={`w-full max-w-sm bg-${mainColor}-50/50 border-2 border-${mainColor}-100 rounded-[2rem] p-8 flex flex-col items-center justify-center relative overflow-hidden`}
          >
            {isAudioPlaying && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                <div
                  className={`w-32 h-32 bg-${mainColor}-500 rounded-full animate-ping absolute`}
                ></div>
                <div
                  className={`w-48 h-48 bg-${mainColor}-400 rounded-full animate-ping absolute`}
                  style={{ animationDelay: '0.2s' }}
                ></div>
              </div>
            )}


            <button
              type="button"
              onClick={handlePlayAudio}
              disabled={isAudioPlaying || playCount >= maxPlays}
              className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
                isAudioPlaying
                  ? `bg-${mainColor}-400 text-white scale-110 shadow-${mainColor}-300/50`
                  : playCount >= maxPlays
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : `bg-${mainColor}-600 text-white hover:bg-${mainColor}-700 hover:scale-105 active:scale-95`
              }`}
            >
              <Icons.Volume2
                size={48}
                className={isAudioPlaying ? 'animate-pulse' : ''}
              />
            </button>


            <div
              className={`mt-6 text-sm font-bold px-4 py-1.5 rounded-full border ${
                playCount >= maxPlays
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : `bg-white text-${mainColor}-800 border-${mainColor}-200 shadow-sm`
              }`}
            >
              {isAudioPlaying
                ? 'Đang phát âm thanh...'
                : playCount >= maxPlays
                ? 'Đã hết lượt nghe!'
                : `Bấm để nghe (Lượt: ${playCount}/${maxPlays})`}
            </div>
          </div>
        </div>


        {/* Nội dung câu hỏi Text */}
        <div className="w-full max-w-2xl text-center mb-6 px-4">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 leading-relaxed shadow-sm p-4 bg-white rounded-2xl border border-gray-100">
            {currentQuestion.term}
          </h2>
        </div>


        {/* 4 Lựa chọn Đáp án */}
        <div className="w-full max-w-2xl flex flex-col gap-3 z-10 relative">
          {currentQuestion.options.map((opt, i) => {
            const btnClass = getOptionClass(opt, i);
            const lblClass = getLabelClass(opt, i);
            const isClickable =
              checkStatus !== 'correct' &&
              checkStatus !== 'failed' &&
              !isGenerating;


            return (
              <button
                key={i}
                type="button"
                onClick={() => isClickable && handleOptionClick(i)}
                disabled={!isClickable}
                className={`w-full p-4 border-2 rounded-xl transition-all text-left flex items-center gap-4 ${btnClass}`}
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black flex-none shadow-sm transition-colors ${lblClass}`}
                >
                  {labels[i]}
                </span>
                <span className="flex-1 text-base sm:text-lg font-bold leading-snug">
                  {opt.text}
                </span>
                {checkStatus === 'correct' || checkStatus === 'failed' ? (
                  opt.isCorrect ? (
                    <Icons.CheckCircle
                      size={24}
                      className="text-green-600 flex-none"
                    />
                  ) : i === selectedOptionIndex ? (
                    <Icons.X size={24} className="text-red-500 flex-none" />
                  ) : null
                ) : null}
              </button>
            );
          })}
        </div>


        {/* FEEDBACK BẢNG TÓM TẮT KIẾN THỨC (Chỉ hiện sau khi trả lời) */}
        {(checkStatus === 'correct' || checkStatus === 'failed') && (
          <div
            className={`mt-8 w-full max-w-2xl rounded-2xl border-2 animate-in slide-in-from-bottom-8 shadow-xl bg-white overflow-hidden ${
              checkStatus === 'correct' ? 'border-green-200' : 'border-red-200'
            }`}
          >
            <div
              className={`p-4 ${
                checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500'
              } text-white flex items-center justify-between px-6 font-bold`}
            >
              <div className="flex items-center gap-2 text-lg">
                {checkStatus === 'correct' ? (
                  <Icons.CheckCircle size={24} />
                ) : (
                  <Icons.X size={24} />
                )}
                {checkStatus === 'correct' ? 'CHÍNH XÁC!' : 'HẾT LƯỢT!'}
              </div>
            </div>


            <div className="p-6 flex flex-col gap-5">
              {/* Transcript */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-left">
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icons.Headphones size={14} /> Kịch bản Nghe (Transcript)
                </span>
                <p className="text-purple-900 text-sm sm:text-base leading-relaxed font-medium whitespace-pre-wrap">
                  {currentQuestion.audioScript}
                </p>
              </div>


              {/* Giải thích AI */}
              {currentQuestion.explanation && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Icons.Sparkles size={14} /> Phân tích & Giải thích
                  </span>
                  <p className="text-blue-900 text-sm leading-relaxed font-medium whitespace-pre-wrap">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}


        {/* Spacer */}
        <div className="h-8 w-full shrink-0"></div>
      </div>


      {/* FOOTER */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>


        <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
          {checkStatus === 'correct' || checkStatus === 'failed' ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                  isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Xem (
                    {resultTimer}s)
                  </>
                )}
              </button>


              <button
                type="button"
                onClick={onNextAction}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 bg-${
                  checkStatus === 'correct' ? 'green-500' : mainColor + '-600'
                } text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${
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
                    Tiếp theo{' '}
                    <Icons.ChevronRight size={20} className="sm:w-6 sm:h-6" />
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSkip}
              disabled={aiWaitTime > 0 || isGenerating}
              className={`w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ${
                aiWaitTime > 0 || isGenerating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95'
              }`}
            >
              Bỏ qua câu này{' '}
              <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_21_ListeningSetup = ListeningSetup;
  window.ListeningSetup = ListeningSetup;
  window.Block5_21_ListeningPlayScreen = ListeningPlayScreen;
  window.ListeningPlayScreen = ListeningPlayScreen;
}


export default ListeningPlayScreen;
