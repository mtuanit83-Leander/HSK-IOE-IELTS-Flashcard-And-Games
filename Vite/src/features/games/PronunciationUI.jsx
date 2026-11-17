// ============================================================================
// FILE 66/85: src/features/games/PronunciationUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.19 - Pronunciation Setup & PlayScreen UI V1.09)
// NHIỆM VỤ: Giao diện Cài đặt (PronunciationSetup) và Màn hình chơi chính
//           (PronunciationPlayScreen) của trò chơi Vua Ngữ Âm (Pronunciation).
// ============================================================================

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString } from './common/gameHelpers';

// ============================================================================
// 1. MÀN HÌNH CẤU HÌNH (PronunciationSetup)
// ============================================================================
export const PronunciationSetup = ({
  mainColor = 'indigo',
  onStart,
  onBack
}) => {
  const initialConfig = (() => {
    try {
      const savedConfig = localStorage.getItem('fc_pronunciation_config');
      if (savedConfig) {
        return JSON.parse(savedConfig);
      }
    } catch (e) {
      console.warn('Load fc_pronunciation_config failed:', e);
    }
    return {};
  })();

  const [sourceMode, setSourceMode] = useState(
    () => initialConfig.sourceMode ?? 'ai_pure'
  );
  const [timerMode, setTimerMode] = useState(
    () => initialConfig.timerMode ?? false
  );
  const [timeLimit, setTimeLimit] = useState(
    () => initialConfig.timeLimit ?? 20
  );

  const handleStart = () => {
    // Ngữ âm mặc định sử dụng AI để phân tích IPA chính xác
    const config = { sourceMode, aiMode: true, timerMode, timeLimit };
    try {
      localStorage.setItem('fc_pronunciation_config', JSON.stringify(config));
    } catch (e) {
      console.warn('Save fc_pronunciation_config failed:', e);
    }
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
            Cấu hình Vua Ngữ Âm
          </h2>
          <div className="w-10"></div>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {/* Nguồn dữ liệu */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
              Nguồn câu hỏi
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode('ai_pure')}
                className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  sourceMode === 'ai_pure'
                    ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm`
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
                } hover:scale-105`}
              >
                <Icons.Sparkles
                  size={28}
                  className={
                    sourceMode === 'ai_pure'
                      ? `text-${mainColor}-600`
                      : 'text-gray-400'
                  }
                />
                <div className="text-center">
                  <div className="font-bold text-gray-800 text-sm">
                    AI Tự Sinh
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Tạo câu đố phát âm vô tận
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('card')}
                className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  sourceMode === 'card'
                    ? 'border-gray-800 bg-gray-50 shadow-sm'
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
                } hover:scale-105`}
              >
                <Icons.Layers
                  size={28}
                  className={
                    sourceMode === 'card' ? 'text-gray-800' : 'text-gray-400'
                  }
                />
                <div className="text-center">
                  <div className="font-bold text-gray-800 text-sm">
                    Thẻ của tôi
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Dùng từ trong Sổ tay làm gốc
                  </div>
                </div>
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 italic text-center">
              * Dạng bài Ngữ Âm bắt buộc sử dụng API Key để hoạt động tốt nhất.
            </p>
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
                  {[10, 15, 20, 30].map((sec) => (
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
            <Icons.Play size={24} fill="currentColor" /> LUYỆN PHÁT ÂM
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI GAME (PronunciationPlayScreen)
// ============================================================================
export const PronunciationPlayScreen = ({
  mainColor = 'indigo',
  config,
  currentQuestion,
  checkStatus,
  selectedIndex,
  attempts = 0,
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
  onPlay,
  aiWaitTime = 0,
  settings
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const safeLevelStr = getSafeLevelString(config?.level, '');

  const onBackAction = onBack || handleSaveAndBack;
  const onNextAction = nextRound || handleNext;

  const handleBookmark = (e) => {
    e.stopPropagation();
    if (!onSaveToNotebook || !currentQuestion) return;
    const correctOpt = currentQuestion.options?.find((o) => o.isCorrect);
    const cleanWord = correctOpt ? correctOpt.text : 'Từ vựng';
    onSaveToNotebook({
      isSmartTarget: true,
      save: cleanWord,
      display: cleanWord,
      analysis:
        currentQuestion.definition || currentQuestion.explanation || ''
    });
  };

  // MÀN HÌNH CHỜ (LOADING) KHI KHỞI TẠO
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
            ? 'AI đang phân tích ngữ âm...'
            : config?.sourceMode === 'ai_pure'
            ? 'Đang tạo câu hỏi ngữ âm...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={
          aiCountdown > 0
            ? '(Đang tìm kiếm các từ có chung mặt chữ nhưng khác cách đọc)'
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

  // Fallback khi lỗi không nạp được
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
          onClick={() => onEndGame && onEndGame({ correct: 0, time: 0, wrong: 0 })}
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
          <Icons.Volume2 size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Tuyệt vời!</h2>
        <p className="text-gray-500 mb-8 text-center">
          Bạn đã vượt qua bài test phát âm.
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

  if (!currentQuestion || !currentQuestion.options) return null;

  const isFinishedState =
    checkStatus === 'correct' || checkStatus === 'failed';

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      {/* Thanh Tiến Trình Thời Gian */}
      {config?.timerMode &&
        checkStatus !== 'correct' &&
        checkStatus !== 'failed' &&
        !isGenerating && (
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                timeLeft <= 5 ? 'bg-red-500' : `bg-${mainColor}-500`
              }`}
              style={{ width: `${(timeLeft / config.timeLimit) * 100}%` }}
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
                  onEndGame({
                    correct: correctCount,
                    score: score,
                    time: time,
                    wrong: wrongCount
                  });
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay chuyển vòng */}
      {isGenerating &&
        currentQuestion &&
        (config?.sourceMode === 'card' && !config?.aiMode ? (
          <div className="absolute inset-0 z-[150] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            duration={0}
            queueLength={queueLength}
            text="Đang tải câu tiếp theo..."
            mainColor={mainColor}
          />
        ))}

      {/* HEADER */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={onBackAction}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          title="Tạm dừng / Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL {safeLevelStr.split('_')[1]?.toUpperCase() || '4'}
          </div>
          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
            Câu {playedCount + 1}{' '}
            <Icons.InfinityIcon size={14} className="text-gray-400 ml-0.5" />
          </div>
          <div className="flex items-center gap-2 bg-white border px-3 py-1 rounded-full shadow-sm">
            <span className="text-xs sm:text-sm font-bold text-green-600 flex items-center gap-1">
              <Icons.Check size={14} /> {correctCount || 0}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-xs sm:text-sm font-bold text-red-500 flex items-center gap-1">
              <Icons.X size={14} /> {wrongCount || 0}
            </span>
          </div>
          <div
            className={`hidden sm:flex items-center gap-1 font-bold ${
              combo > 1 ? 'text-orange-500 scale-110' : 'text-gray-400'
            } transition-all`}
          >
            🔥 x{combo}
          </div>
          <div
            className={`text-lg sm:text-xl font-mono font-bold text-${mainColor}-600 w-12 text-right hidden sm:block`}
          >
            {time}s
          </div>
        </div>

        <div className="flex items-center gap-1">
          {currentQuestion?.origin?._isRescued || currentQuestion?._isRescued ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm hidden sm:flex"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn:
              Dự phòng
            </span>
          ) : currentQuestion?.isAiGenerated ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm hidden sm:flex"
              title="Câu hỏi được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm hidden sm:flex"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ
              gốc
            </span>
          )}

          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200 hidden sm:flex"
                title={`Đã nạp sẵn ${queueLength} câu`}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse hidden sm:flex"
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col items-center justify-center relative">
        {/* Câu hỏi */}
        <div className="w-full max-w-lg mb-8 text-center animate-in slide-in-from-top-4">
          <div
            className={`inline-flex items-center gap-2 bg-${mainColor}-50 text-${mainColor}-600 px-4 py-2 rounded-full border border-${mainColor}-200 text-sm font-bold uppercase tracking-widest mb-4`}
          >
            <Icons.Volume2 size={18} /> Phân biệt phát âm
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700">
            Chọn từ có <span className="text-red-500 font-black">phát âm</span>{' '}
            khác biệt
          </h2>
          {attempts > 0 && !isFinishedState && (
            <p className="text-sm text-orange-500 font-bold mt-2 animate-pulse">
              Chú ý: Bạn còn {2 - attempts} lượt chọn.
            </p>
          )}
        </div>

        {/* Lưới 4 từ (2x2) */}
        <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
          {currentQuestion.options.map((opt, idx) => {
            const isSelected = selectedIndex === idx;
            const isCorrect =
              opt.isCorrect === true ||
              String(opt.isCorrect).toLowerCase() === 'true';

            let btnClass =
              'bg-white border-2 border-gray-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all duration-300';

            if (isFinishedState) {
              if (isCorrect) {
                btnClass =
                  'bg-green-50 border-2 border-green-500 ring-4 ring-green-100 z-20 scale-105 shadow-xl';
              } else if (isSelected && !isCorrect) {
                btnClass =
                  'bg-red-50 border-2 border-red-500 opacity-80 animate-[shake_0.4s_ease-in-out]';
              } else {
                btnClass =
                  'bg-gray-100 border-2 border-gray-100 opacity-50 cursor-not-allowed';
              }
            } else if (isSelected) {
              btnClass = `bg-${mainColor}-50 border-2 border-${mainColor}-500 scale-105 shadow-lg`;
            }

            return (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                onClick={() => !isFinishedState && handleOptionClick(idx)}
                onKeyDown={(e) => {
                  if (
                    !isFinishedState &&
                    (e.key === 'Enter' || e.key === ' ')
                  ) {
                    e.preventDefault();
                    handleOptionClick(idx);
                  }
                }}
                className={`relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl overflow-hidden group ${btnClass}`}
              >
                <span
                  className="text-3xl sm:text-4xl font-black tracking-wide text-gray-800 pointer-events-none"
                  style={{
                    fontFamily: Utils?.getFontFamily(settings) || 'inherit'
                  }}
                >
                  {opt.text}
                </span>

                {/* Loa phát âm (Chỉ hiện khi đã chọn xong) */}
                {isFinishedState && (
                  <button
                    type="button"
                    className={`absolute top-2 right-2 p-2 rounded-full z-30 transition-colors ${
                      isCorrect
                        ? 'text-green-600 bg-green-100 hover:bg-green-200'
                        : 'text-gray-400 bg-gray-100 hover:bg-gray-200 hover:text-blue-500'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPlay) onPlay(opt.text);
                    }}
                    title="Nghe phát âm"
                  >
                    <Icons.Volume2 size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* FEEDBACK BẢNG TÓM TẮT KIẾN THỨC (Chỉ hiện khi đã chọn xong) */}
        {isFinishedState && (
          <div
            className={`mt-8 w-full max-w-xl rounded-2xl p-5 border-2 animate-in slide-in-from-bottom-4 shadow-lg bg-white ${
              checkStatus === 'correct' ? 'border-green-200' : 'border-red-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md shrink-0 ${
                    checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                >
                  {checkStatus === 'correct' ? (
                    <Icons.Check size={28} />
                  ) : (
                    <Icons.X size={28} />
                  )}
                </div>
                <div>
                  <h3
                    className={`text-xl font-black ${
                      checkStatus === 'correct'
                        ? 'text-green-700'
                        : 'text-red-700'
                    }`}
                  >
                    {checkStatus === 'correct' ? 'CHÍNH XÁC!' : 'SAI RỒI!'}
                  </h3>
                  <div className="flex items-center gap-1 text-gray-500 mt-1">
                    <Icons.Sparkles size={14} className="text-purple-500" />
                    <span className="text-sm font-bold">Giải thích:</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 text-sm font-medium leading-relaxed">
              {currentQuestion.definition ||
                currentQuestion.explanation ||
                'Từ này có phiên âm quốc tế (IPA) khác với các từ còn lại.'}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER CHUẨN MỰC */}
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
          {isFinishedState ? (
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

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_19_PronunciationSetup = PronunciationSetup;
  window.PronunciationSetup = PronunciationSetup;
  window.Block5_19_PronunciationPlayScreen = PronunciationPlayScreen;
  window.PronunciationPlayScreen = PronunciationPlayScreen;
}

export default PronunciationPlayScreen;