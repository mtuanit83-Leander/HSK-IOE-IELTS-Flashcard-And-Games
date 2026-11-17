// ============================================================================
// FILE 64/85: src/features/games/ImageQuizUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.17 - Image Quiz Setup & PlayScreen UI V1.08)
// NHIỆM VỤ: Giao diện Cài đặt (ImageQuizSetup) và Màn hình chơi chính
//           (ImageQuizPlayScreen) cho trò chơi Đoán Hình Ảnh (Image Quiz).
// ============================================================================

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString } from './common/gameHelpers';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (IMAGE QUIZ SETUP)
// ============================================================================
export const ImageQuizSetup = ({ mainColor = 'emerald', onStart, onBack }) => {
  const savedConfig = (() => {
    try {
      const raw = localStorage.getItem('fc_imagequiz_config');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Load fc_imagequiz_config failed:', e);
      return null;
    }
  })();

  const [sourceMode, setSourceMode] = useState(
    () => savedConfig?.sourceMode ?? 'ai_pure'
  );
  const [timerMode, setTimerMode] = useState(
    () => savedConfig?.timerMode ?? false
  );
  const [timeLimit, setTimeLimit] = useState(
    () => savedConfig?.timeLimit ?? 15
  );

  const handleStart = () => {
    const config = {
      sourceMode,
      aiMode: sourceMode === 'ai_pure',
      timerMode,
      timeLimit
    };
    localStorage.setItem('fc_imagequiz_config', JSON.stringify(config));
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
            Cấu hình Đoán Hình Ảnh
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
                    Vô hạn hình ảnh mới
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
                    Tìm ảnh cho từ đã lưu
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Cấu hình Timer */}
          {MenuToggle && (
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
          )}
        </div>

        <div className="w-full mt-4 pt-4 border-t border-gray-100 shrink-0 bg-white pb-safe">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 bg-${mainColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg`}
          >
            <Icons.Play size={24} fill="currentColor" /> BẮT ĐẦU CHƠI
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI (IMAGE QUIZ PLAY SCREEN)
// ============================================================================
export const ImageQuizPlayScreen = ({
  mainColor = 'emerald',
  config,
  currentQuestion,
  checkStatus,
  selectedIndex,
  score,
  combo,
  playedCount,
  timeLeft,
  isFinished,
  isGenerating,
  aiCountdown,
  queueLength,
  correctCount,
  wrongCount,
  resultTimer,
  isResultPaused,
  aiWaitTime,
  handleOptionClick,
  handleNext,
  nextRound,
  handleSkip,
  handleSaveAndBack,
  onBack,
  onSaveToNotebook,
  isBookmarked,
  toggleResultPause,
  onEndGame,
  settings
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const safeLevelStr = getSafeLevelString(config?.level, '');

  const onNextRound = handleNext || nextRound;
  const onBackClick = onBack || handleSaveAndBack;

  // Fallback khi ảnh bị lỗi tải từ Bing
  const handleImageError = (e) => {
    e.target.style.display = 'none';
    if (e.target.nextSibling) {
      e.target.nextSibling.style.display = 'flex';
    }
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    if (!onSaveToNotebook || !currentQuestion) return;
    onSaveToNotebook({
      isSmartTarget: false,
      save: currentQuestion.term,
      display: currentQuestion.term,
      analysis: currentQuestion.definition || currentQuestion.explanation || ''
    });
  };

  // Màn hình chờ lúc khởi tạo câu đầu tiên
  if (isGenerating && !currentQuestion) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }
    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onCancel={onBackClick}
        queueLength={queueLength}
        text={
          aiCountdown > 0
            ? 'AI đang tìm kiếm hình ảnh...'
            : config?.sourceMode === 'ai_pure'
            ? 'Đang ráp hình...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={aiCountdown > 0 ? '(Hệ thống đang duyệt kho Bing Images)' : ''}
        mainColor={mainColor}
        levelStr={
          config?.sourceMode === 'ai_pure' && safeLevelStr
            ? safeLevelStr.replace('level_', '').replace(/_/g, ' ').toUpperCase()
            : ''
        }
      />
    );
  }

  // Fallback khi lỗi không nạp được câu hỏi
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
          onClick={() =>
            onEndGame &&
            onEndGame({
              correct: correctCount || 0,
              score: score || 0,
              wrong: wrongCount || 0
            })
          }
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  // Màn hình hoàn thành
  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-500 rounded-full flex items-center justify-center mb-6 shadow-inner`}
        >
          <Icons.Image size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Tuyệt vời!</h2>
        <p className="text-gray-500 mb-8 text-center">
          Bạn đã vượt qua bài test khả năng nhận diện hình ảnh.
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
    checkStatus === 'correct' ||
    checkStatus === 'wrong' ||
    checkStatus === 'failed';

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      {/* Thanh Tiến Trình Thời Gian */}
      {config?.timerMode && !isFinishedState && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 3 ? 'bg-red-500' : `bg-${mainColor}-500`
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
                  if (onEndGame) {
                    onEndGame({
                      correct: correctCount,
                      score: score,
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

      {/* Khóa màn hình nhẹ nhàng khi chuyển vòng */}
      {isGenerating && currentQuestion && (
        <div className="absolute inset-0 z-[150] bg-white/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
          <div
            className={`px-6 py-4 bg-white/90 rounded-2xl shadow-2xl border-2 border-${mainColor}-100 flex items-center gap-4`}
          >
            <div
              className={`w-6 h-6 border-4 border-${mainColor}-200 border-t-${mainColor}-600 rounded-full animate-spin`}
            ></div>
            <span className={`font-bold text-${mainColor}-700 text-base`}>
              AI đang tải ảnh tiếp theo...
            </span>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={onBackClick}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          title="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-3">
          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1">
            Câu {playedCount + 1} <Icons.InfinityIcon size={14} />
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
              combo > 1 ? 'text-orange-500' : 'text-gray-400'
            }`}
          >
            🔥 x{combo}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Nguồn Badge */}
          {currentQuestion?.origin?._isRescued ||
          currentQuestion?._isRescued ? (
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
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}
              s
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col items-center">
        {/* Câu hỏi (Từ vựng) */}
        <div className="w-full max-w-lg mb-6 text-center animate-in slide-in-from-top-4">
          <h2
            className="text-4xl md:text-5xl font-black text-gray-800 drop-shadow-sm mb-2"
            style={{
              fontFamily: Utils?.getFontFamily
                ? Utils.getFontFamily(settings)
                : 'inherit'
            }}
          >
            {currentQuestion.term}
          </h2>
          <p className="text-gray-500 font-medium italic">
            Hãy chọn hình ảnh mô tả chính xác nhất
          </p>
        </div>

        {/* Lưới Hình ảnh (2x2) */}
        <div className="w-full max-w-2xl grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 relative z-10">
          {currentQuestion.options.map((opt, idx) => {
            const isSelected = selectedIndex === idx;
            const isCorrect =
              opt.isCorrect === true ||
              String(opt.isCorrect).toLowerCase() === 'true';

            let btnClass =
              'bg-white border-2 border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all duration-300';

            if (isFinishedState) {
              if (isCorrect) {
                btnClass =
                  'bg-green-50 border-4 border-green-500 ring-4 ring-green-100 z-20 scale-105 shadow-xl';
              } else if (isSelected && !isCorrect) {
                btnClass =
                  'bg-red-50 border-4 border-red-500 opacity-60 grayscale-[50%] animate-[shake_0.4s_ease-in-out]';
              } else {
                btnClass =
                  'bg-gray-100 border-gray-200 opacity-40 grayscale blur-[1px] cursor-not-allowed';
              }
            } else if (isSelected) {
              btnClass = `bg-${mainColor}-50 border-4 border-${mainColor}-500 scale-105 shadow-lg`;
            }

            return (
              <div
                key={idx}
                onClick={() => !isFinishedState && handleOptionClick(idx)}
                className={`relative aspect-square sm:aspect-[4/3] rounded-2xl overflow-hidden flex flex-col items-center justify-center p-2 group ${btnClass}`}
              >
                {/* Image Container */}
                <div className="w-full h-full relative rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
                  <img
                    src={
                      opt.image ||
                      `https://tse4.mm.bing.net/th?q=${encodeURIComponent(
                        opt.text + ' clipart illustration kids'
                      )}&w=300&h=300&c=7&rs=1&p=0`
                    }
                    alt={opt.text}
                    onError={handleImageError}
                    className="w-full h-full object-contain p-2 mix-blend-multiply group-hover:scale-110 transition-transform duration-500"
                  />
                  {/* Fallback Icon (Ẩn mặc định, hiện khi img lỗi) */}
                  <div
                    style={{ display: 'none' }}
                    className="absolute inset-0 flex-col items-center justify-center text-gray-300 bg-gray-100 p-2 text-center"
                  >
                    <Icons.Image size={40} />
                    <span className="text-xs font-bold uppercase mt-2 opacity-60 break-words">
                      {opt.text}
                    </span>
                  </div>
                </div>

                {/* Kết quả Icon Overlay */}
                {isFinishedState && isCorrect && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg animate-in zoom-in">
                    <Icons.Check size={20} />
                  </div>
                )}
                {isFinishedState && isSelected && !isCorrect && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full shadow-lg animate-in zoom-in">
                    <Icons.X size={20} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FEEDBACK BẢNG TÓM TẮT (Chỉ hiện khi đã chọn) */}
        {isFinishedState && (
          <div
            className={`mt-8 w-full max-w-2xl rounded-2xl p-5 border-2 animate-in slide-in-from-bottom-4 shadow-lg ${
              checkStatus === 'correct'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md ${
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
                  <p className="text-gray-600 text-sm mt-1">
                    Ý nghĩa:{' '}
                    <span className="font-bold">
                      {currentQuestion.definition}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER CHUẨN MỰC */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        {/* Nút Kết thúc (Bên trái) */}
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        {/* Khu vực điều khiển chính (Căn giữa/phải) */}
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
                onClick={onNextRound}
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
  window.Block5_17_ImageQuizSetup = ImageQuizSetup;
  window.ImageQuizSetup = ImageQuizSetup;
  window.Block5_17_ImageQuizPlayScreen = ImageQuizPlayScreen;
  window.ImageQuizPlayScreen = ImageQuizPlayScreen;
}

export default ImageQuizPlayScreen;