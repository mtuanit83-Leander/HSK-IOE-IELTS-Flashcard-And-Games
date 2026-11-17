// ============================================================================
// FILE 54/85: src/features/games/ScrambleUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.3 - Scramble UI V1.10)
// NHIỆM VỤ: Giao diện Cài đặt (ScrambleSetup) và Màn hình chơi chính
//           (ScramblePlayScreen) cho trò chơi Ghép Câu (Scramble Game).
// ============================================================================

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString } from './common/gameHelpers';

// Đọc cấu hình đã lưu từ LocalStorage một cách an toàn
const getSavedScrambleConfig = () => {
  try {
    const saved = localStorage.getItem('fc_scramble_config');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.warn('Load scramble config failed:', e);
    return {};
  }
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (SCRAMBLE SETUP)
// ============================================================================
export const ScrambleSetup = ({ t, mainColor = 'orange', onStart, onBack }) => {
  const initialConfig = getSavedScrambleConfig();

  const [sourceMode, setSourceMode] = useState(() => initialConfig.sourceMode ?? 'card');
  const [timerMode, setTimerMode] = useState(() => initialConfig.timerMode ?? false);
  const [hardMode, setHardMode] = useState(() => initialConfig.hardMode ?? false);
  const [aiMode, setAiMode] = useState(() => initialConfig.aiMode ?? false);
  const [timeLimit, setTimeLimit] = useState(() => initialConfig.timeLimit ?? 60);
  const [inputMethod, setInputMethod] = useState(() => initialConfig.inputMethod ?? 'tap');
  const [autoReadAnswer, setAutoReadAnswer] = useState(() => initialConfig.autoReadAnswer ?? false);
  const [suddenDeath, setSuddenDeath] = useState(() => initialConfig.suddenDeath ?? false);

  const handleStart = () => {
    const config = {
      timerMode,
      hardMode,
      aiMode,
      timeLimit,
      inputMethod,
      autoReadAnswer,
      sourceMode,
      suddenDeath
    };
    localStorage.setItem('fc_scramble_config', JSON.stringify(config));
    if (onStart) onStart('scramble', config);
  };

  const handleHardModeChange = (val) => {
    setHardMode(val);
    if (!val) setAiMode(false);
  };

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-sm h-full animate-in slide-in-from-right-8">
      <div className="w-full flex items-center justify-between mb-6 shrink-0 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
          title={t ? t('backMenu') : 'Quay lại'}
        >
          <Icons.ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Cấu hình Ghép Câu</h2>
        <div className="w-10"></div>
      </div>

      <div className="w-full space-y-3 flex-1 overflow-y-auto custom-scrollbar p-1 pb-4">
        {/* Bảng chọn Nguồn dữ liệu */}
        <div className="mb-2">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                className={sourceMode === 'card' ? `text-${mainColor}-600` : 'text-gray-400'}
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">Thẻ của tôi</div>
                <div className="text-[10px] text-gray-500">Ghép câu/từ có sẵn</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceMode('ai_pure');
                setInputMethod('tap');
                setAiMode(false);
              }}
              className={`p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
                sourceMode === 'ai_pure'
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
              } hover:scale-105`}
            >
              <Icons.Sparkles
                size={24}
                className={sourceMode === 'ai_pure' ? 'text-blue-600' : 'text-gray-400'}
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">AI Tự Sinh</div>
                <div className="text-[10px] text-gray-500">Tạo câu đố mới vô tận</div>
              </div>
            </button>
          </div>
        </div>

        {/* Phương thức trả lời */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 mt-2">
            Cách trả lời (Chốt khi bắt đầu)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
            <button
              type="button"
              onClick={() => setInputMethod('tap')}
              className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                inputMethod === 'tap'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-blue-300 bg-white text-gray-500'
              }`}
            >
              <span className="text-2xl mb-1">🖱️</span>
              <span className="font-bold text-xs">Chạm thẻ</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputMethod('type');
                setAiMode(false);
              }}
              className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                inputMethod === 'type'
                  ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-200'
                  : 'border-gray-200 hover:border-green-300 bg-white text-gray-500'
              }`}
            >
              <span className="text-2xl mb-1">⌨️</span>
              <span className="font-bold text-xs">Gõ phím</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputMethod('voice');
                setAiMode(false);
              }}
              className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                inputMethod === 'voice'
                  ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                  : 'border-gray-200 hover:border-purple-300 bg-white text-gray-500'
              }`}
            >
              <span className="text-2xl mb-1">🎙️</span>
              <span className="font-bold text-xs">Giọng nói</span>
            </button>
          </div>
        </div>

        <MenuToggle
          active={autoReadAnswer}
          setActive={setAutoReadAnswer}
          icon={Icons.Volume2}
          color="pink"
          title="Đọc lại đáp án"
          subtitle="Tự động đọc to khi ghép đúng"
        />

        <MenuToggle
          active={hardMode}
          setActive={handleHardModeChange}
          icon={Icons.Layers}
          color="red"
          title="Chế độ Khó (Hard Mode)"
          subtitle={
            hardMode
              ? inputMethod === 'tap'
                ? 'Có từ nhiễu & Khóa trợ giúp'
                : 'Khóa trợ giúp (Không tự đọc)'
              : inputMethod === 'tap'
              ? 'Chỉ gồm từ trong câu'
              : 'Cơ bản (Có hỗ trợ âm thanh)'
          }
        />

        <MenuToggle
          active={aiMode}
          setActive={setAiMode}
          icon={Icons.Sparkles}
          color="purple"
          title="Thử thách AI"
          subtitle={
            !hardMode
              ? '(Yêu cầu bật Chế độ Khó)'
              : inputMethod !== 'tap'
              ? '(Chỉ hỗ trợ Chạm thẻ)'
              : 'AI tạo bẫy ngữ pháp (cho câu văn)'
          }
          disabled={!hardMode || inputMethod !== 'tap'}
        />

        <MenuToggle
          active={suddenDeath}
          setActive={setSuddenDeath}
          icon={Icons.AlertCircle}
          color="slate"
          title="Chế độ Địa ngục"
          subtitle="Sai 1 lần là mất điểm ngay lập tức"
        />

        <MenuToggle
          active={timerMode}
          setActive={setTimerMode}
          icon={Icons.Clock}
          color="orange"
          title="Giới hạn thời gian"
          subtitle={timerMode ? `${timeLimit} giây / câu` : 'Thoải mái thời gian'}
          extra={
            <div className="mt-3 pt-2 border-t border-orange-100 flex justify-between items-center animate-in fade-in">
              <span className="text-[10px] font-bold text-orange-400 uppercase">
                Chọn thời gian:
              </span>
              <div className="flex gap-1">
                {[20, 30, 60, 90, 120].map((sec) => (
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

      <div className="w-full mt-2 pt-4 border-t border-gray-100 space-y-3 bg-white pb-safe shrink-0">
        <button
          type="button"
          onClick={handleStart}
          className={`w-full py-4 bg-${mainColor}-600 text-white rounded-xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-2 active:scale-95 transition-transform`}
        >
          <Icons.Play size={24} /> BẮT ĐẦU NGAY
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (SCRAMBLE PLAY SCREEN)
// ============================================================================
export const ScramblePlayScreen = ({
  t,
  mainColor = 'orange',
  lang = 'en',
  settings,
  config,
  isPaused,
  timerMode,
  timeLimit,
  timeLeft,
  inputMethod,
  isGenerating,
  aiCountdown,
  gameState,
  setGameState,
  stats,
  difficulty,
  inputBuffer,
  setInputBuffer,
  typeInputRef,
  isListening,
  showExplainModal,
  setShowExplainModal,
  aiExplanation,
  isAiExplaining,
  onBack,
  onEndGame,
  onPause,
  onPlay,
  onBookmark,
  triggerAutoSave,
  checkAnswer,
  toggleMic,
  handleSkip,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  handleExplain,
  nextRound,
  isBookmarked,
  handleAddPunctuation,
  resultTimer,
  isResultPaused,
  toggleResultPause,
  queueLength,
  aiWaitTime
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  const totalPlayed = (stats?.correct || 0) + (stats?.wrong || 0);
  const accuracy =
    totalPlayed > 0 ? Math.round(((stats?.correct || 0) / totalPlayed) * 100) : 0;

  const getTimerColor = (time, total) => {
    const ratio = time / (total || 60);
    if (ratio > 0.6) return 'text-green-600';
    if (ratio > 0.3) return 'text-orange-500';
    return 'text-red-600 animate-pulse';
  };

  const containerWidthClass = 'max-w-5xl';
  const safeLevelStr = getSafeLevelString(config?.level, '');

  const renderChunk = (chunk, isFromPool) => {
    const isSpace = chunk.text === ' ';
    const isPunct = chunk.isPunct;
    return (
      <div
        style={{
          touchAction: 'none',
          fontFamily: Utils.getFontFamily(settings),
          fontWeight: settings?.fontWeight || 'bold',
          fontSize: settings?.fontSize ? `${settings.fontSize}rem` : '1.5rem'
        }}
        className={`px-3 py-1.5 rounded-lg shadow transition-all select-none ${
          isSpace
            ? 'bg-gray-200 border-2 border-dashed border-gray-400 text-transparent min-w-[30px] flex justify-center items-center'
            : isFromPool
            ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer'
            : isPunct
            ? 'bg-gray-700 text-white cursor-grab active:cursor-grabbing'
            : `bg-${mainColor}-500 text-white cursor-grab active:cursor-grabbing`
        }`}
      >
        {isSpace ? '␣' : chunk.text}
      </div>
    );
  };

  if (isGenerating && (!gameState?.origin || aiCountdown > 0)) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }
    return (
      <GlobalLoadingScreen
        onCancel={() => onEndGame && onEndGame(stats)}
        queueLength={queueLength}
        text={
          config?.sourceMode === 'ai_pure'
            ? 'AI đang sáng tác câu đố...'
            : 'Đang thiết lập trò chơi...'
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

  if (!isGenerating && !gameState?.origin) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 items-center justify-center animate-in fade-in p-6 text-center">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">Lỗi nạp dữ liệu</h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được câu hỏi. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.
        </p>
        <button
          type="button"
          onClick={() => onEndGame && onEndGame(stats)}
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full flex flex-col items-center bg-${mainColor}-50 rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden relative animate-in`}
    >
      {/* POPUP Xác nhận thoát Game */}
      {showConfirmEnd && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">Kết thúc sớm?</h3>
            <p className="text-gray-600 text-sm mb-6">
              Tiến trình của câu hỏi hiện tại sẽ không được lưu lại. Bạn có chắc chắn muốn thoát?
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
                  if (onEndGame) onEndGame(stats);
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Thoát ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cơ chế JIT/Lazy Load mượt mà */}
      {isGenerating && gameState.origin && (
        <div className="absolute inset-0 z-[150] bg-white/30 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
          <div
            className={`px-5 py-3 bg-white rounded-2xl shadow-xl border-2 border-${mainColor}-100 flex items-center gap-3`}
          >
            <div
              className={`w-5 h-5 border-4 border-${mainColor}-200 border-t-${mainColor}-600 rounded-full animate-spin`}
            ></div>
            <span className={`font-bold text-${mainColor}-700 text-sm`}>
              AI đang dịch câu mới...
            </span>
          </div>
        </div>
      )}

      {/* Màn hình Tạm dừng */}
      {isPaused && (
        <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border-2 border-gray-100 flex flex-col items-center gap-4">
            <h3 className="text-2xl font-black text-gray-700 tracking-widest uppercase">
              TẠM DỪNG
            </h3>
            <button
              type="button"
              onClick={onPause}
              className={`w-16 h-16 rounded-full bg-${mainColor}-600 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform`}
            >
              <Icons.Play size={32} fill="currentColor" />
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="w-full bg-white border-b p-3 flex justify-between items-center z-10 shadow-sm">
        <div className="flex items-center gap-2 w-1/4">
          <button
            type="button"
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 font-bold text-sm bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            <Icons.ChevronLeft size={18} />
            <span className="hidden sm:inline">{t ? t('backMenu') : 'Menu'}</span>
          </button>
        </div>

        <div className="flex-1 text-center flex flex-col items-center">
          <h2 className={`font-black text-${mainColor}-700 text-lg tracking-tight uppercase`}>
            {t ? t('modeScramble') : 'Ghép Câu'}
          </h2>
          {timerMode && (
            <span
              className={`text-[11px] font-mono font-bold ${getTimerColor(
                timeLeft,
                timeLimit
              )} flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full mt-0.5 border border-gray-200`}
            >
              <Icons.Clock size={12} /> {timeLeft}s
            </span>
          )}
        </div>

        <div className="w-1/4 flex justify-end"></div>
      </div>

      {/* KHU VỰC THÔNG TIN & THỐNG KÊ */}
      <div className="flex-1 w-full overflow-y-auto custom-scrollbar p-4 flex flex-col items-center gap-4">
        <div
          className={`w-full flex justify-between items-center transition-all duration-300 ${containerWidthClass}`}
        >
          <div className="flex gap-2 text-xs font-bold items-center">
            <span className="text-green-600 bg-green-100 px-2 py-1 rounded border border-green-200 flex items-center gap-1">
              <Icons.CheckCircle size={14} /> {stats.correct}
            </span>
            <span className="text-red-500 bg-red-100 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
              <Icons.X size={14} /> {stats.wrong}
            </span>
            <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
              🎯 {accuracy}%
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Nhãn nguồn gốc */}
            {gameState.origin?._isRescued ? (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-orange-100 text-orange-700 border border-orange-200"
                title="Sử dụng dữ liệu dự phòng do mất kết nối"
              >
                <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
              </span>
            ) : gameState.isAiGenerated ? (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-100 text-indigo-700 border border-indigo-200"
                title="Câu hỏi được tạo bởi AI"
              >
                <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
              </span>
            ) : (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-slate-100 text-slate-600 border border-slate-200"
                title="Trích xuất từ Bộ thẻ"
              >
                <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
              </span>
            )}

            {/* Băng đạn AI */}
            {(config?.aiMode || config?.sourceMode === 'ai_pure') && queueLength > 0 && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                title={`Đã nạp sẵn ${queueLength} vòng`}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp: {queueLength}
              </span>
            )}

            {/* Phanh AI */}
            {aiWaitTime > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
                title="Thời gian chờ an toàn"
              >
                <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
              </span>
            )}

            {/* Huy hiệu Sudden Death */}
            {config?.suddenDeath && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-slate-100 text-slate-700 border border-slate-300"
                title="Chế độ Địa ngục: Sai 1 lần mất điểm"
              >
                <Icons.AlertCircle size={12} className="text-slate-600" /> Địa ngục
              </span>
            )}

            <span
              className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider shadow-sm cursor-default ${
                inputMethod === 'tap'
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : inputMethod === 'type'
                  ? 'bg-green-100 text-green-700 border border-green-200'
                  : 'bg-purple-100 text-purple-700 border border-purple-200'
              }`}
            >
              {inputMethod === 'tap'
                ? '🖱️ Chạm & Ghép'
                : inputMethod === 'type'
                ? '⌨️ Gõ phím'
                : '🎙️ Giọng nói'}
            </span>
          </div>
        </div>

        {/* KHUNG CHÍNH */}
        <div
          className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 transition-all duration-300 ${containerWidthClass}`}
        >
          <div
            className={`p-4 bg-${mainColor}-50 border-l-4 border-${mainColor}-400 mb-6 rounded-xl italic text-gray-700 text-center shadow-inner`}
            style={{
              fontSize: settings?.backFontSize ? `${settings.backFontSize}rem` : '0.875rem',
              fontWeight: settings?.fontWeight || 'normal',
              fontFamily: 'inherit'
            }}
          >
            "{gameState.origin?.definition}"
          </div>

          {gameState.isCorrect === false && gameState.attempts >= 3 && (
            <div className="w-full mb-6 p-5 border-2 border-green-400 bg-green-50 rounded-2xl flex flex-col items-center justify-center animate-in zoom-in shadow-sm">
              <span className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Icons.CheckCircle size={14} /> Đáp án chính xác
              </span>
              <span
                className="text-xl md:text-2xl font-bold text-green-900 text-center leading-relaxed"
                style={{ fontFamily: Utils.getFontFamily(settings) }}
              >
                {gameState.origin?.term}
              </span>
            </div>
          )}

          {/* Phương thức 1: Chạm & Kéo thả thẻ từ */}
          {inputMethod === 'tap' && (
            <div className="w-full flex flex-col gap-5">
              {/* Khu vực Nhận Đáp Án */}
              <div
                className={`min-h-[120px] border-2 border-dashed rounded-2xl p-4 flex flex-wrap items-center gap-2 transition-colors ${
                  gameState.isCorrect === true
                    ? 'bg-green-50 border-green-400 shadow-inner'
                    : gameState.isCorrect === false
                    ? 'bg-red-50 border-red-400 shadow-inner'
                    : 'bg-gray-50 border-gray-300'
                }`}
              >
                {gameState.userAnswer.map((chunk, idx) => (
                  <div
                    key={chunk.id}
                    data-drag-index={idx}
                    draggable
                    onDragStart={(e) => onDragStart(e, idx)}
                    onDragEnter={(e) => onDragEnter(e, idx)}
                    onDragEnd={onDragEnd}
                    onTouchStart={(e) => onTouchStart(e, idx)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onClick={() =>
                      !isPaused &&
                      setGameState((p) => {
                        const st = {
                          ...p,
                          userAnswer: p.userAnswer.filter((c) => c.id !== chunk.id),
                          chunks: chunk.isPunct ? p.chunks : [...p.chunks, chunk]
                        };
                        setTimeout(() => triggerAutoSave && triggerAutoSave(), 150);
                        return st;
                      })
                    }
                  >
                    {renderChunk(chunk, false)}
                  </div>
                ))}
                {gameState.userAnswer.length === 0 && (
                  <span className="w-full text-center text-gray-300 font-bold uppercase tracking-widest text-sm pointer-events-none">
                    Khu vực ghép câu
                  </span>
                )}
              </div>

              {/* Thanh Dấu Câu */}
              <div className="flex justify-center items-center gap-2 bg-white border border-gray-100 p-2 rounded-xl shadow-sm">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">
                  Dấu câu:
                </span>
                {['.', ',', ':', '?', '!'].map((punct) => (
                  <button
                    key={punct}
                    type="button"
                    onClick={() => handleAddPunctuation && handleAddPunctuation(punct)}
                    disabled={isPaused || gameState.isCorrect !== null}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 text-gray-700 font-bold border border-gray-200 hover:bg-gray-100 hover:border-gray-300 shadow-sm disabled:opacity-50 transition-colors"
                    style={{
                      fontFamily: Utils.getFontFamily(settings),
                      fontSize: '1.25rem'
                    }}
                  >
                    {punct}
                  </button>
                ))}
              </div>

              {/* Khu vực Chọn Từ */}
              <div className="flex flex-wrap justify-center gap-2.5 min-h-[80px] p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">
                {gameState.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    onClick={() =>
                      !isPaused &&
                      setGameState((p) => {
                        const st = {
                          ...p,
                          userAnswer: [...p.userAnswer, chunk],
                          chunks: p.chunks.filter((c) => c.id !== chunk.id)
                        };
                        setTimeout(() => triggerAutoSave && triggerAutoSave(), 150);
                        return st;
                      })
                    }
                  >
                    {renderChunk(chunk, true)}
                  </div>
                ))}
                {gameState.chunks.length === 0 && (
                  <span className="w-full text-center text-gray-300 font-medium italic text-sm pt-2">
                    Đã dùng hết từ
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Phương thức 2: Gõ bàn phím */}
          {inputMethod === 'type' && (
            <div className="w-full flex flex-col items-center gap-4 animate-in slide-in-from-bottom-4">
              <input
                ref={typeInputRef}
                type="text"
                autoFocus
                value={inputBuffer}
                onChange={(e) => setInputBuffer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isPaused && checkAnswer()}
                className={`w-full p-6 text-center border-4 rounded-2xl outline-none transition-colors shadow-inner ${
                  gameState.isCorrect === true
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : gameState.isCorrect === false
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : 'bg-gray-50 border-blue-200 focus:border-blue-500 text-gray-800'
                }`}
                placeholder="Gõ lại câu bằng bàn phím..."
                style={{
                  fontFamily: Utils.getFontFamily(settings),
                  fontWeight: settings?.fontWeight || 'bold',
                  fontSize: settings?.fontSize ? `${settings.fontSize}rem` : '1.875rem'
                }}
                disabled={gameState.isCorrect !== null || isPaused}
              />
              <p className="text-xs text-gray-400">
                Ấn phím <kbd className="bg-gray-100 px-2 py-1 rounded border shadow-sm">Enter</kbd>{' '}
                để kiểm tra
              </p>
            </div>
          )}

          {/* Phương thức 3: Nhận diện giọng nói */}
          {inputMethod === 'voice' && (
            <div className="w-full flex flex-col items-center gap-4 animate-in zoom-in">
              <div
                className={`w-full min-h-[120px] border-4 rounded-2xl outline-none transition-colors shadow-inner flex flex-col items-center justify-center p-6 text-center ${
                  gameState.isCorrect === true
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : gameState.isCorrect === false
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : 'bg-gray-50 border-purple-200 text-gray-800'
                }`}
              >
                <span
                  style={{
                    fontFamily: Utils.getFontFamily(settings),
                    fontWeight: settings?.fontWeight || 'bold',
                    fontSize: settings?.fontSize ? `${settings.fontSize}rem` : '1.5rem'
                  }}
                >
                  {inputBuffer || (
                    <span className="text-gray-400 italic text-base">
                      Nhấn Micro và bắt đầu đọc...
                    </span>
                  )}
                </span>
              </div>
              <div className="flex flex-col items-center w-full mt-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={isPaused || gameState.isCorrect !== null}
                  className={`w-20 h-20 rounded-full border-4 flex items-center justify-center shadow-lg outline-none transition-all duration-300 ${
                    isListening
                      ? 'bg-red-50 border-red-200 text-red-500 animate-pulse scale-110 shadow-red-200'
                      : 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 hover:scale-105 hover:shadow-purple-200'
                  }`}
                >
                  {isListening ? (
                    <Icons.Square size={32} fill="currentColor" />
                  ) : (
                    <Icons.Mic size={32} />
                  )}
                </button>
                <p
                  className={`font-bold mt-3 text-center text-sm ${
                    isListening ? 'text-red-500 animate-pulse' : 'text-gray-500'
                  }`}
                >
                  {isListening ? 'Đang lắng nghe (Chạm để Dừng)...' : 'Chạm Micro để đọc'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Nút nghe gợi ý sau 2 lần sai (Ở chế độ thường) */}
        {gameState.attempts >= 2 && difficulty !== 'hard' && (
          <div
            className={`flex w-full justify-center mt-2 animate-in slide-in-from-top-2 transition-all duration-300 ${containerWidthClass}`}
          >
            <button
              type="button"
              onClick={() => onPlay && onPlay(gameState.origin.term)}
              className="px-6 py-2.5 flex items-center gap-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full shadow-sm hover:bg-yellow-100 font-bold transition-transform hover:scale-105"
              disabled={isPaused}
            >
              <Icons.Volume2 size={20} /> Nghe lại đáp án
            </button>
          </div>
        )}
      </div>

      {/* FOOTER ĐIỀU KHIỂN */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-30 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        {/* Nút Kết thúc */}
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        {/* Khu vực điều khiển chính */}
        <div className="flex-1 flex justify-center sm:justify-end max-w-lg ml-auto">
          {gameState.isCorrect === true ||
          (gameState.isCorrect === false && gameState.attempts >= 3) ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleExplain}
                disabled={isPaused || isGenerating}
                className="flex-1 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs sm:text-sm hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 shadow-sm"
              >
                <Icons.BookOpen size={16} className="sm:w-[18px] sm:h-[18px]" /> Giải thích
              </button>

              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
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
                    <Icons.Pause size={16} fill="currentColor" /> Đợi ({resultTimer}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onBookmark && gameState.origin) {
                    let scrambledDisplay = '';
                    if (gameState.chunks && gameState.chunks.length > 0) {
                      scrambledDisplay = gameState.chunks
                        .map((c) => c.text)
                        .join(lang === 'zh' ? '' : ' ');
                    } else {
                      scrambledDisplay = gameState.origin.term
                        .split(lang === 'zh' ? '' : ' ')
                        .sort(() => Math.random() - 0.5)
                        .join(lang === 'zh' ? '' : ' ');
                    }
                    onBookmark({
                      isSmartTarget: true,
                      display: scrambledDisplay,
                      save: gameState.origin.term,
                      analysis: gameState.origin.definition
                    });
                  }
                }}
                disabled={isPaused || isGenerating}
                className={`flex-1 py-3 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                  isBookmarked
                    ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
                title={t ? t('addToNotebook') : 'Lưu Sổ tay'}
              >
                <Icons.Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} /> Lưu Sổ
                tay
              </button>

              <button
                type="button"
                onClick={() => nextRound()}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[1.5] sm:flex-[2] py-3 bg-${mainColor}-600 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1 sm:gap-1.5 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${mainColor}-700`
                }`}
              >
                {isGenerating ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    Tiếp theo <Icons.ChevronRight size={20} />
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => handleSkip(false)}
                disabled={isPaused || isGenerating || aiWaitTime > 0}
                className={`flex-1 py-3 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 ${
                  isPaused || isGenerating || aiWaitTime > 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'active:scale-95'
                }`}
              >
                Bỏ qua
              </button>
              <button
                type="button"
                onClick={checkAnswer}
                disabled={
                  isPaused ||
                  isGenerating ||
                  aiWaitTime > 0 ||
                  (!gameState.userAnswer?.length && !inputBuffer.trim())
                }
                className={`flex-[1.5] sm:flex-[2] py-3 bg-${mainColor}-600 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg hover:bg-${mainColor}-700 transition-all ${
                  isPaused ||
                  isGenerating ||
                  aiWaitTime > 0 ||
                  (!gameState.userAnswer?.length && !inputBuffer.trim())
                    ? 'opacity-50 cursor-not-allowed'
                    : 'active:scale-95'
                }`}
              >
                Kiểm tra
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Giải thích Ngữ pháp */}
      {showExplainModal && gameState.origin && (
        <div className="absolute inset-0 z-[60] bg-white flex flex-col animate-in slide-in-from-bottom-10 duration-300">
          <div className="bg-blue-600 p-4 flex justify-between items-center text-white shadow-md shrink-0">
            <h3 className="font-bold flex items-center gap-2 text-lg">
              <Icons.BookOpen size={24} /> {t ? t('explainTitle') : 'Phân tích Ngữ pháp'}
            </h3>
            <button
              type="button"
              onClick={() => setShowExplainModal(false)}
              className="hover:bg-blue-700 p-2 rounded-full transition-colors"
            >
              <Icons.X size={24} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100 mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              <label className="text-xs font-bold text-blue-500 uppercase tracking-wider block mb-2">
                {t ? t('sentence') : 'Câu văn'}
              </label>
              <p className="text-xl sm:text-2xl font-medium text-gray-800 leading-relaxed">
                {gameState.origin.term}
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-gray-400"></div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                {t ? t('meaning') : 'Ý nghĩa'}
              </label>
              <p className="text-lg text-gray-600 italic">{gameState.origin.definition}</p>
            </div>

            {isAiExplaining ? (
              <div className="flex flex-col items-center justify-center py-10 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <span className="text-sm text-blue-600 font-bold animate-pulse">
                  AI đang phân tích ngữ pháp...
                </span>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 prose prose-sm max-w-none">
                <h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-lg border-b pb-2">
                  <Icons.Sparkles size={20} className="text-purple-500" /> Phân tích chi tiết:
                </h4>
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                  {aiExplanation ? (
                    aiExplanation
                      .split('\n')
                      .map((line, i) => <p key={i} className="mb-2">{line}</p>)
                  ) : (
                    <span className="text-gray-400 italic">Chưa có dữ liệu phân tích.</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] shrink-0">
            <button
              type="button"
              onClick={() => onPlay && onPlay(gameState.origin.term)}
              className="flex-1 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors shadow-sm active:scale-95"
            >
              <Icons.Volume2 size={20} /> {t ? t('listenAgain') : 'Nghe lại'}
            </button>
            <button
              type="button"
              onClick={() => setShowExplainModal(false)}
              className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-900 transition-colors shadow-md active:scale-95"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.ScrambleSetup = ScrambleSetup;
  window.ScramblePlayScreen = ScramblePlayScreen;
  window.Block5_3_ScrambleSetup = ScrambleSetup;
  window.Block5_3_ScramblePlayScreen = ScramblePlayScreen;
}

export default ScramblePlayScreen;