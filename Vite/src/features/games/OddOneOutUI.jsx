// ============================================================================
// FILE 62/85: src/features/games/OddOneOutUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.12 - OddOneOut Setup & PlayScreen UI V1.08)
// NHIỆM VỤ: Giao diện Cài đặt (OddOneOutSetup) và Màn hình chơi chính
//           (OddOneOutPlayScreen) của trò chơi Tìm Từ Khác Loại (Odd One Out).
// ============================================================================

import React, { useState, useMemo } from 'react';
import { Icons, SafeIcon } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (ODD ONE OUT SETUP)
// ============================================================================
export const OddOneOutSetup = ({ mainColor = 'pink', onStart, onBack }) => {
  const initialConfig = useMemo(() => {
    try {
      const saved = localStorage.getItem('fc_oddoneout_config');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn('Load fc_oddoneout_config failed:', e);
      return {};
    }
  }, []);

  const [sourceMode, setSourceMode] = useState(
    () => initialConfig.sourceMode ?? 'card'
  );
  const [timerMode, setTimerMode] = useState(
    () => initialConfig.timerMode ?? false
  );
  const [timeLimit, setTimeLimit] = useState(
    () => initialConfig.timeLimit ?? 15
  );
  const [aiMode, setAiMode] = useState(() => initialConfig.aiMode ?? false);

  const handleStart = () => {
    const config = {
      sourceMode,
      timerMode,
      timeLimit,
      aiMode: sourceMode === 'ai_pure' || aiMode
    };
    localStorage.setItem('fc_oddoneout_config', JSON.stringify(config));
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
            Cấu hình: Từ Khác Loại
          </h2>
          <div className="w-10"></div>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-3">
          {/* Chọn Nguồn Dữ Liệu */}
          <div className="mb-2">
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
              Nguồn câu hỏi
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode('card')}
                className={`p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
                  sourceMode === 'card'
                    ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm`
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
                } hover:scale-105`}
              >
                <Icons.Layers
                  size={24}
                  className={
                    sourceMode === 'card'
                      ? `text-${mainColor}-600`
                      : 'text-gray-400'
                  }
                />
                <div className="text-center">
                  <div className="font-bold text-gray-800 text-sm">
                    Thẻ của tôi
                  </div>
                  <div className="text-[10px] text-gray-500">
                    Tìm từ khác nhóm từ vựng
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourceMode('ai_pure');
                  setAiMode(false);
                }}
                className={`p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
                  sourceMode === 'ai_pure'
                    ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm`
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
                } hover:scale-105`}
              >
                <Icons.Sparkles
                  size={24}
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
                    Tạo thử thách mới vô tận
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Công tắc Thử thách AI */}
          <MenuToggle
            active={aiMode}
            setActive={setAiMode}
            icon={Icons.Sparkles}
            color="purple"
            title="Thử thách AI"
            subtitle={
              sourceMode === 'ai_pure'
                ? '(Chế độ Tự sinh đã bao gồm AI)'
                : aiMode
                  ? 'AI nhào nặn nhóm từ tinh vi'
                  : 'Thuật toán phân loại nội bộ'
            }
            disabled={sourceMode === 'ai_pure'}
          />

          {/* Cấu hình Thời gian */}
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
            className={`w-full py-4 bg-${mainColor}-600 text-white rounded-xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg`}
          >
            <Icons.Play size={24} fill="currentColor" /> TÌM TỪ KHÁC LOẠI
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (ODD ONE OUT PLAY SCREEN)
// ============================================================================
export const OddOneOutPlayScreen = ({
  mainColor = 'pink',
  config,
  currentQuestion,
  selectedIndex,
  checkStatus,
  attempts,
  combo,
  playedCount,
  time,
  isFinished,
  isGenerating,
  aiCountdown,
  correctCount,
  wrongCount,
  handleOptionClick,
  handleSkip,
  nextRound,
  onBack,
  onEndGame,
  onSaveToNotebook,
  isBookmarked,
  resultTimer,
  isResultPaused,
  toggleResultPause,
  timeLeft,
  settings,
  onPlay,
  queueLength,
  aiWaitTime
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  // Bảo vệ chuỗi Level an toàn khỏi mảng Multi-select
  const safeLevelStr = getSafeLevelString(config?.level, 'level_4');

  // Chặn màn hình lúc khởi tạo câu đầu tiên
  if (isGenerating && !currentQuestion) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }
    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onCancel={onBack}
        queueLength={queueLength}
        text={
          aiCountdown > 0
            ? 'AI đang phân tích dữ liệu...'
            : config?.sourceMode === 'ai_pure'
              ? 'AI đang tạo nhóm từ vựng...'
              : 'Đang thiết lập trò chơi...'
        }
        subText={
          aiCountdown > 0
            ? '(Vui lòng đợi giây lát để có thử thách hay)'
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

  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-500 rounded-full flex items-center justify-center mb-6 shadow-inner`}
        >
          <Icons.Award size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Hoàn thành!</h2>
        <p className="text-gray-500 mb-8 text-center max-w-xs">
          Bạn đã hoàn thành xuất sắc các nhóm từ vựng!
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Thời gian
            </div>
            <div className={`text-xl font-bold text-${mainColor}-600`}>
              {formatGameTime(time)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm text-center">
            <div className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.Check size={12} /> Đúng
            </div>
            <div className="text-xl font-bold text-green-600">
              {correctCount}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm text-center">
            <div className="text-[10px] text-red-400 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.X size={12} /> Sai
            </div>
            <div className="text-xl font-bold text-red-500">{wrongCount}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onEndGame({ correct: correctCount, time: time, wrong: wrongCount })
          }
          className={`w-full max-w-xs py-4 rounded-xl bg-${mainColor}-600 text-white font-bold text-lg hover:bg-${mainColor}-700 shadow-lg shadow-${mainColor}-200 transition-all active:scale-95 flex items-center justify-center gap-2`}
        >
          <Icons.CheckCircle size={24} /> Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const handleBookmarkClick = (e) => {
    e.stopPropagation();
    if (currentQuestion && onSaveToNotebook) {
      onSaveToNotebook({
        isSmartTarget: true,
        display: Array.isArray(currentQuestion.words)
          ? currentQuestion.words.join(' • ')
          : '',
        save: currentQuestion.oddWord,
        analysis: currentQuestion.explanation
      });
    }
  };

  return (
    <div className="w-full flex flex-col h-full bg-gray-50 relative overflow-hidden">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>

      {/* Thanh đếm ngược thời gian */}
      {config?.timerMode &&
        checkStatus !== 'success' &&
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

      {/* POPUP XÁC NHẬN THOÁT GAME */}
      {showConfirmEnd && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">
              Kết thúc phiên học?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Bạn đang ở chế độ vô tận. Bấm Kết thúc để xem tổng hợp kết quả của
              phiên này.
            </p>
            <div className="flex w-full gap-3">
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
                    time: time,
                    wrong: wrongCount
                  });
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Kết thúc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay chuyển vòng thanh lịch */}
      {isGenerating && currentQuestion && (
        <div className="absolute inset-0 z-[150] bg-white/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
          <div
            className={`px-6 py-4 bg-white/90 rounded-2xl shadow-2xl border-2 border-${mainColor}-100 flex items-center gap-4`}
          >
            <div
              className={`w-6 h-6 border-4 border-${mainColor}-200 border-t-${mainColor}-600 rounded-full animate-spin`}
            ></div>
            <span className={`font-bold text-${mainColor}-700 text-base`}>
              AI đang chuẩn bị nhóm từ...
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={onBack}
          className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors hover:bg-gray-100"
          title="Tạm dừng / Quay lại"
        >
          <SafeIcon name="ChevronLeft" size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL {safeLevelStr.match(/\d+/)?.[0] || '4'}
          </div>
          <div
            className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1"
            title="Chế độ Vô tận"
          >
            Câu {playedCount + 1}{' '}
            <Icons.InfinityIcon size={14} className="text-gray-400 ml-0.5" />
          </div>
          <div className="flex items-center gap-2 bg-white border px-3 py-1 rounded-full shadow-sm">
            <span
              className="text-xs sm:text-sm font-bold text-green-600 flex items-center gap-1"
              title="Số câu Đúng"
            >
              <Icons.Check size={14} /> {correctCount || 0}
            </span>
            <span className="text-gray-300">|</span>
            <span
              className="text-xs sm:text-sm font-bold text-red-500 flex items-center gap-1"
              title="Số câu Sai"
            >
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

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Nguồn Badge KÈM QUEUE COUNTER */}
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

          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                title={`Đã nạp sẵn ${queueLength} vòng`}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

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
            onClick={handleBookmarkClick}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
            }`}
            title="Lưu vào Sổ tay"
          >
            <SafeIcon
              name="Bookmark"
              size={20}
              fill={isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      {/* Body: Khu vực nội dung chính */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center gap-8 relative">
        {/* Câu hỏi Hướng dẫn */}
        {checkStatus !== 'success' && checkStatus !== 'failed' && (
          <div className="w-full max-w-3xl text-center animate-in slide-in-from-top-4">
            <h3 className="text-xl md:text-2xl font-bold text-gray-700 leading-relaxed drop-shadow-sm">
              Chọn từ{' '}
              <span className={`text-${mainColor}-600`}>không cùng nhóm</span>{' '}
              với các từ còn lại
            </h3>
            {attempts > 0 && (
              <p className="text-sm text-orange-500 font-bold mt-2 animate-pulse">
                Chú ý: Bạn còn {2 - attempts} lượt chọn.
              </p>
            )}
          </div>
        )}

        {/* Lưới 4 từ (Grid 2x2) */}
        {checkStatus !== 'success' && checkStatus !== 'failed' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mt-4 z-10 animate-in zoom-in">
            {(currentQuestion.words || []).map((word, idx) => {
              const isSelected = selectedIndex === idx;
              let btnClass = `bg-white border-gray-200 text-gray-800 hover:border-${mainColor}-400 hover:shadow-md active:scale-95`;
              if (isSelected && checkStatus === 'wrong_retry') {
                btnClass =
                  'bg-red-50 border-red-500 text-red-700 shadow-sm animate-[shake_0.4s_ease-in-out]';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleOptionClick(idx)}
                  disabled={
                    checkStatus === 'success' ||
                    checkStatus === 'failed' ||
                    isGenerating
                  }
                  className={`relative p-6 md:p-8 rounded-2xl border-2 text-xl md:text-2xl font-bold transition-all duration-200 flex items-center justify-center break-words shadow-sm ${btnClass}`}
                  style={{
                    fontFamily: Utils?.getFontFamily(settings) || 'inherit'
                  }}
                >
                  <span className="z-10">{word}</span>
                  <div
                    className="absolute top-2 right-2 p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full z-20 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPlay) onPlay(word);
                    }}
                    title="Nghe phát âm"
                  >
                    <Icons.Volume2 size={20} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* KNOWLEDGE MINING PANEL (Bảng Tóm tắt Kiến thức) */}
        {(checkStatus === 'success' || checkStatus === 'failed') && (
          <div
            className={`w-full max-w-3xl mt-2 bg-white rounded-2xl shadow-lg border-2 ${
              checkStatus === 'success' ? 'border-green-200' : 'border-red-200'
            } overflow-visible animate-in slide-in-from-bottom-4 z-20`}
          >
            <div
              className={`p-3 ${
                checkStatus === 'success' ? 'bg-green-500' : 'bg-red-500'
              } text-white flex items-center justify-between px-6 font-bold rounded-t-xl relative`}
            >
              <div className="flex items-center gap-2">
                {checkStatus === 'success' ? (
                  <Icons.CheckCircle />
                ) : (
                  <Icons.X />
                )}
                {checkStatus === 'success' ? 'CHÍNH XÁC!' : 'HẾT LƯỢT!'}
              </div>
              <button
                type="button"
                onClick={handleBookmarkClick}
                className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors shadow-sm"
              >
                <Icons.Bookmark
                  size={14}
                  fill={isBookmarked ? 'white' : 'none'}
                />{' '}
                {isBookmarked ? 'Đã lưu' : 'Lưu vào Sổ tay'}
              </button>
            </div>

            <div className="p-6 bg-white rounded-b-xl flex flex-col gap-6">
              <div className="flex flex-wrap justify-center gap-3">
                {(currentQuestion.words || []).map((w, i) => (
                  <span
                    key={i}
                    className={`px-4 py-2 rounded-xl border-2 text-lg font-bold flex items-center gap-2 ${
                      w === currentQuestion.oddWord
                        ? 'bg-red-100 border-red-400 text-red-700 shadow-sm scale-110 z-10'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}
                  >
                    {w}
                  </span>
                ))}
              </div>

              <div className="text-center pt-4 border-t border-gray-100 relative">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                  Đáp án đúng
                </span>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-2xl font-black text-red-600 tracking-wide">
                    {currentQuestion.oddWord}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlay && onPlay(currentQuestion.oddWord)}
                    className="p-2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                    title="Nghe đáp án"
                  >
                    <Icons.Volume2 size={24} />
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left">
                <span className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Icons.Sparkles size={14} /> Giải thích logic
                </span>
                <p className="text-blue-800 text-sm leading-relaxed font-medium">
                  {currentQuestion.explanation}
                </p>
              </div>
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
          {checkStatus === 'success' || checkStatus === 'failed' ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                  isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
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
                onClick={nextRound}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 bg-${
                  checkStatus === 'success' ? 'green-500' : mainColor + '-600'
                } text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${
                        checkStatus === 'success'
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
  window.Block5_12_OddOneOutSetup = OddOneOutSetup;
  window.OddOneOutSetup = OddOneOutSetup;
  window.Block5_12_OddOneOutPlayScreen = OddOneOutPlayScreen;
  window.OddOneOutPlayScreen = OddOneOutPlayScreen;
}

export default OddOneOutPlayScreen;