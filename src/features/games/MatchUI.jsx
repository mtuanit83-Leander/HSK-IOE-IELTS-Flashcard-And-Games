// ============================================================================
// FILE 52/85: src/features/games/MatchUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.1 - Match UI V1.08)
// NHIỆM VỤ: Giao diện Cấu hình (MatchSetup) và Màn hình chơi chính
//           (MatchPlayScreen) của Game Nối Ô. Bảo toàn 100% hệ thống vẽ dây
//           nối SVG, cảnh báo bẫy vô nghiệm và đạt chuẩn 0 Problems.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { Icons } from '../../components/common/Icons';
import { MenuToggle } from '../../components/common/Controls';
import { GlobalLoadingScreen } from '../../components/common/GlobalLoadingScreen';
import { Utils } from '../../utils/helpers';
import { getSafeLevelString } from './common/gameHelpers';

/**
 * Đọc cấu hình Nối Ô đã lưu từ LocalStorage an toàn
 */
const loadSavedMatchConfig = (initialAiMode = false) => {
  try {
    const savedConfig = localStorage.getItem('fc_match_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      const hardVal = initialAiMode ? true : (parsed.hardMode ?? false);
      const aiVal = initialAiMode ? true : (parsed.aiMode ?? false);
      return {
        sourceMode: parsed.sourceMode ?? 'card',
        timerMode: parsed.timerMode ?? false,
        hardMode: hardVal,
        aiMode: hardVal ? aiVal : false,
        timeLimit: parsed.timeLimit ?? 60
      };
    }
  } catch (e) {
    console.warn('Load match config failed:', e);
  }
  return {
    sourceMode: 'card',
    timerMode: false,
    hardMode: Boolean(initialAiMode),
    aiMode: Boolean(initialAiMode),
    timeLimit: 60
  };
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (MATCH SETUP)
// ============================================================================
export const MatchSetup = ({ mainColor = 'purple', initialAiMode = false, onStart, onBack }) => {
  const initialCfg = loadSavedMatchConfig(initialAiMode);

  const [sourceMode, setSourceMode] = useState(initialCfg.sourceMode);
  const [timerMode, setTimerMode] = useState(initialCfg.timerMode);
  const [hardMode, setHardMode] = useState(initialCfg.hardMode);
  const [aiMode, setAiMode] = useState(initialCfg.aiMode);
  const [timeLimit, setTimeLimit] = useState(initialCfg.timeLimit);

  const handleStart = () => {
    const config = { timerMode, hardMode, aiMode, timeLimit, sourceMode };
    localStorage.setItem('fc_match_config', JSON.stringify(config));
    if (onStart) onStart('match', config);
  };

  const handleHardModeChange = (val) => {
    setHardMode(val);
    if (!val) setAiMode(false);
  };

  return (
    <div className="relative z-10 flex flex-col items-center mx-auto w-full max-w-sm animate-in slide-in-from-right-8 py-4 h-full">
      <div className="w-full flex items-center justify-between mb-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Icons.ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Cấu hình Nối Ô</h2>
        <div className="w-10"></div>
      </div>

      <div className="w-full space-y-3 p-1 flex-1 overflow-y-auto custom-scrollbar pb-4">
        {/* Bảng chọn Nguồn dữ liệu */}
        <div className="mb-4">
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
                className={sourceMode === 'card' ? `text-${mainColor}-600` : 'text-gray-400'}
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">Thẻ của tôi</div>
                <div className="text-[10px] text-gray-500">Nối từ trong Flashcard</div>
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
                <div className="text-[10px] text-gray-500">Tạo cặp từ mới vô tận</div>
              </div>
            </button>
          </div>
        </div>

        <MenuToggle
          active={hardMode}
          setActive={handleHardModeChange}
          icon={Icons.Layers}
          color="red"
          title="Chế độ Khó (Hard Mode)"
          subtitle={hardMode ? 'Có từ nhiễu (Distractors)' : 'Chỉ gồm các cặp đúng'}
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
              : aiMode
              ? 'AI tạo nhiễu thông minh'
              : 'Thuật toán nội bộ'
          }
          disabled={!hardMode || sourceMode === 'ai_pure'}
        />

        <MenuToggle
          active={timerMode}
          setActive={setTimerMode}
          icon={Icons.Clock}
          color="orange"
          title="Giới hạn thời gian"
          subtitle={timerMode ? `${timeLimit} giây / vòng` : 'Thoải mái thời gian'}
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

      <div className="w-full mt-2 pt-4 border-t border-gray-100 space-y-3 pb-safe shrink-0">
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
// 2. MÀN HÌNH CHƠI (MATCH PLAY SCREEN)
// ============================================================================
export const MatchPlayScreen = ({
  t,
  mainColor = 'purple',
  isLoading,
  isPaused,
  onPause,
  handleSaveAndBack,
  onEndGame,
  timerMode,
  timeLeft,
  timeLimit,
  gameStats = { correct: 0, wrong: 0 },
  accuracy = 0,
  difficulty = 'easy',
  isAiMode,
  matchState = {
    pairs: [],
    leftItems: [],
    rightItems: [],
    connections: {},
    selectedLeft: null,
    isChecked: false,
    correctLines: [],
    wrongLines: [],
    missingLines: [],
    timer: 10
  },
  settings,
  notebook,
  onBookmark,
  handleMatchClick,
  checkMatch,
  generateMatch,
  toggleResultPause,
  isGenerating,
  config,
  queueLength = 0,
  aiWaitTime = 0
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [, setLayoutTick] = useState(0);

  // Lắng nghe sự kiện thay đổi kích thước cửa sổ để vẽ lại tọa độ đường nối SVG chuẩn xác
  useEffect(() => {
    const handleResize = () => setLayoutTick((n) => n + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ép kiểu an toàn cho chuỗi Level khi nhận mảng Multi-select
  const safeLevelStr = getSafeLevelString(config?.level, '');

  const getTimerColor = (time, total) => {
    const ratio = time / (total || 60);
    if (ratio > 0.6) return 'text-green-600';
    if (ratio > 0.3) return 'text-orange-500';
    return 'text-red-600 animate-pulse';
  };

  const getLineCoords = (startId, endId) => {
    if (typeof document === 'undefined') return null;
    const startEl = document.getElementById(`match-left-${startId}`);
    const endEl = document.getElementById(`match-right-${endId}`);
    const container = document.getElementById('match-container');
    if (!startEl || !endEl || !container) return null;

    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    return {
      x1: startRect.right - containerRect.left,
      y1: startRect.top + startRect.height / 2 - containerRect.top,
      x2: endRect.left - containerRect.left,
      y2: endRect.top + endRect.height / 2 - containerRect.top
    };
  };

  // Tránh chớp màn hình khi load thẻ Offline lần đầu
  if (isGenerating && (!matchState.pairs || matchState.pairs.length === 0)) {
    if (config?.sourceMode === 'card' && !isAiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none animate-pulse">
          <div
            className={`w-8 h-8 border-4 border-${mainColor}-200 border-t-${mainColor}-500 rounded-full animate-spin`}
          ></div>
        </div>
      );
    }
    return (
      <GlobalLoadingScreen
        onCancel={() => onEndGame && onEndGame(gameStats)}
        queueLength={queueLength}
        text={
          config?.sourceMode === 'ai_pure'
            ? 'AI đang tạo các cặp từ...'
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

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 relative overflow-hidden">
      {/* --- POPUPS & OVERLAYS --- */}
      {/* Thanh Tiến Trình Thời Gian */}
      {timerMode && !matchState.isChecked && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 5 ? 'bg-red-500' : `bg-${mainColor}-500`
            }`}
            style={{ width: `${(timeLeft / (timeLimit || 60)) * 100}%` }}
          ></div>
        </div>
      )}

      {/* Popup xác nhận thoát sớm */}
      {showConfirmEnd && (
        <div className="absolute inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">Kết thúc sớm?</h3>
            <p className="text-gray-600 text-sm mb-6">
              Tiến trình của vòng chơi hiện tại sẽ không được lưu lại. Bạn có chắc chắn muốn thoát?
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
                  if (onEndGame) onEndGame(gameStats);
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Thoát ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay chuyển vòng */}
      {isGenerating && matchState.pairs && matchState.pairs.length > 0 && (
        config?.sourceMode === 'card' && !isAiMode ? (
          <div className="absolute inset-0 z-[150] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            queueLength={queueLength}
            text="Đang thiết lập..."
            mainColor={mainColor}
          />
        )
      )}

      {/* Loading chung */}
      {isLoading && !isGenerating && (
        <GlobalLoadingScreen
          queueLength={queueLength}
          text="Đang thiết lập..."
          mainColor={mainColor}
        />
      )}

      {/* Màn che Tạm dừng */}
      {isPaused && (
        <div className="absolute inset-0 z-[150] bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
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

      {/* --- HEADER CHUẨN MỰC --- */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={handleSaveAndBack}
          className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors hover:bg-gray-100"
          title="Tạm dừng / Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL {safeLevelStr.match(/\d+/)?.[0] || '4'}
          </div>
          <div
            className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1"
            title="Chế độ Nối Ô"
          >
            Nối Ô <Icons.InfinityIcon size={14} className="text-gray-400 ml-0.5" />
          </div>
          {timerMode && !matchState.isChecked && (
            <div
              className={`text-lg sm:text-xl font-mono font-bold ${getTimerColor(
                timeLeft,
                timeLimit
              )} w-12 text-right hidden sm:block`}
            >
              {timeLeft}s
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {matchState._isRescued ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
            </span>
          ) : matchState.isAiGenerated ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
              title="Vòng đấu được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shadow-sm"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(isAiMode || config?.sourceMode === 'ai_pure') && queueLength > 0 && (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
              title={`Đã nạp sẵn ${queueLength} vòng`}
            >
              <Icons.Database size={12} className="text-blue-500" /> Đã nạp: {queueLength}
            </span>
          )}

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

      {/* --- THÂN GAME CHÍNH TẬP TRUNG SCROLL --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-4 flex flex-col items-center relative z-0">
        {/* KHU VỰC THỐNG KÊ */}
        <div className="w-full max-w-5xl flex justify-between items-center mb-4 transition-all duration-300 px-2">
          <div className="flex gap-2 text-xs font-bold items-center">
            <span className="text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 flex items-center gap-1">
              <Icons.CheckCircle size={14} /> {gameStats.correct}
            </span>
            <span className="text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center gap-1">
              <Icons.X size={14} /> {gameStats.wrong}
            </span>
            <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
              🎯 {accuracy}%
            </span>
          </div>
          <span
            className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider cursor-default ${
              difficulty === 'hard'
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-green-100 text-green-700 border border-green-200'
            }`}
          >
            {difficulty === 'hard'
              ? t
                ? t('matchHard')
                : 'Khó'
              : t
              ? t('matchEasy')
              : 'Dễ'}
          </span>
        </div>

        {difficulty === 'hard' && (
          <div className="w-full max-w-5xl mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 animate-pulse shadow-sm text-center">
            <Icons.AlertCircle size={18} className="shrink-0" /> ⚠️ Chú ý: Chỉ có 4 cặp đúng. Có 2 ô là bẫy vô nghiệm!
          </div>
        )}

        {/* KHU VỰC THẺ NỐI */}
        <div
          id="match-container"
          className="relative w-full max-w-5xl grid grid-cols-2 gap-3 sm:gap-6 md:gap-16 select-none transition-all duration-300 flex-1 min-h-[400px]"
        >
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            style={{ overflow: 'visible' }}
          >
            {Object.entries(matchState.connections || {}).map(([leftId, rightId]) => {
              const coords = getLineCoords(leftId, rightId);
              if (!coords) return null;
              return (
                <line
                  key={`conn-${leftId}`}
                  x1={coords.x1}
                  y1={coords.y1}
                  x2={coords.x2}
                  y2={coords.y2}
                  stroke={matchState.isChecked ? '#9ca3af' : '#6366f1'}
                  strokeWidth="2"
                  strokeDasharray={matchState.isChecked ? '4' : ''}
                />
              );
            })}

            {matchState.isChecked && (
              <>
                {(matchState.correctLines || []).map((line, i) => {
                  const c = getLineCoords(line.start, line.end);
                  return c ? (
                    <line
                      key={`c-${i}`}
                      x1={c.x1}
                      y1={c.y1}
                      x2={c.x2}
                      y2={c.y2}
                      stroke="#22c55e"
                      strokeWidth="3"
                    />
                  ) : null;
                })}
                {(matchState.wrongLines || []).map((line, i) => {
                  const c = getLineCoords(line.start, line.end);
                  return c ? (
                    <line
                      key={`w-${i}`}
                      x1={c.x1}
                      y1={c.y1}
                      x2={c.x2}
                      y2={c.y2}
                      stroke="#ef4444"
                      strokeWidth="3"
                    />
                  ) : null;
                })}
                {(matchState.missingLines || []).map((line, i) => {
                  const c = getLineCoords(line.start, line.end);
                  return c ? (
                    <line
                      key={`m-${i}`}
                      x1={c.x1}
                      y1={c.y1}
                      x2={c.x2}
                      y2={c.y2}
                      stroke="#22c55e"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                      opacity="0.6"
                    />
                  ) : null;
                })}
              </>
            )}
          </svg>

          {/* CỘT TRÁI (Nghĩa Tiếng Việt) */}
          <div className="flex flex-col gap-3 md:gap-4 z-20 justify-center h-full w-full">
            {(matchState.leftItems || []).map((item) => {
              const isBookmarked = notebook?.some((n) => n.term === item.term);
              let leftFeedbackUI = null;
              let errorStyle = '';

              if (matchState.isChecked) {
                const isWrong = (matchState.wrongLines || []).some(
                  (line) => line.start === item.id
                );
                const isMissing = (matchState.missingLines || []).some(
                  (line) => line.start === item.id
                );
                if (isWrong || isMissing) {
                  if (item.isTrap) {
                    leftFeedbackUI = (
                      <div className="mt-3 text-[11px] sm:text-xs font-bold text-red-600 bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg animate-in slide-in-from-top-2 shadow-sm w-full max-w-[90%] z-20 relative">
                        ⚠️ Bẫy vô nghiệm!
                      </div>
                    );
                    errorStyle = 'border-red-400 bg-red-50 ring-2 ring-red-100';
                  } else {
                    errorStyle = isWrong
                      ? 'border-red-400 bg-red-50 ring-2 ring-red-100'
                      : 'border-orange-300 bg-orange-50 ring-2 ring-orange-100';
                  }
                }
              }

              const baseStyle =
                matchState.selectedLeft === item.id
                  ? `border-${mainColor}-500 bg-${mainColor}-50 text-${mainColor}-700 ring-2 ring-${mainColor}-200`
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300';

              const connectedStyle =
                !matchState.isChecked && matchState.connections?.[item.id] !== undefined
                  ? `border-${mainColor}-300 bg-${mainColor}-50 opacity-90`
                  : '';

              const finalClassName = `relative flex-1 flex flex-col justify-center items-center w-full p-3 md:p-4 pt-8 md:pt-10 rounded-xl border-2 text-center text-sm md:text-base lg:text-lg font-bold transition-all shadow-sm ${
                errorStyle || baseStyle
              } ${connectedStyle}`;

              return (
                <button
                  key={item.id}
                  id={`match-left-${item.id}`}
                  type="button"
                  onClick={() => handleMatchClick && handleMatchClick('left', item.id)}
                  disabled={matchState.isChecked || isPaused}
                  style={{ fontFamily: 'inherit' }}
                  className={finalClassName}
                >
                  <div
                    className={`absolute top-2 left-2 p-1.5 rounded-full transition-colors z-30 shrink-0 ${
                      isBookmarked
                        ? 'text-yellow-500 bg-yellow-50 shadow-sm'
                        : 'text-gray-300 hover:text-yellow-500 hover:bg-gray-100'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onBookmark) onBookmark(item.term);
                    }}
                    title={t ? t('addToNotebook') : 'Lưu vào sổ tay'}
                  >
                    <Icons.Bookmark
                      size={18}
                      fill={isBookmarked ? 'currentColor' : 'none'}
                    />
                  </div>
                  <span className="w-full break-words leading-tight z-10">
                    {item.definition}
                  </span>
                  {leftFeedbackUI}
                </button>
              );
            })}
          </div>

          {/* CỘT PHẢI (Từ vựng Ngoại ngữ) */}
          <div className="flex flex-col gap-3 md:gap-4 z-20 justify-center h-full w-full">
            {(matchState.rightItems || []).map((item) => {
              let rightFeedbackUI = null;
              if (matchState.isChecked && item.isTrap) {
                rightFeedbackUI = (
                  <div className="mt-3 w-full border-t border-gray-200 pt-2 animate-in slide-in-from-top-2 flex flex-col items-center justify-center relative z-20">
                    <span className="text-red-500 block mb-1" style={{ fontSize: '0.7em' }}>
                      Câu/từ đúng là:
                    </span>
                    <span
                      className="text-gray-800 font-bold leading-tight w-full break-words"
                      style={{ fontSize: '0.9em' }}
                    >
                      {item.originalTerm || 'Chưa có thông tin từ gốc'}
                    </span>
                    {item.explanation && (
                      <div className="mt-2 w-full bg-blue-50 border border-blue-100 rounded-lg p-2 flex flex-col items-center text-center shadow-inner">
                        <span
                          className="text-blue-500 font-bold mb-1 flex items-center gap-1 uppercase tracking-wider"
                          style={{ fontSize: '0.65em' }}
                        >
                          <Icons.Sparkles size={10} /> Phân tích lỗi
                        </span>
                        <span
                          className="text-blue-800 leading-snug w-full break-words font-medium"
                          style={{ fontSize: '0.75em' }}
                        >
                          {item.explanation}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }

              const isRightConnected = Object.values(matchState.connections || {}).includes(
                item.id
              );

              return (
                <button
                  key={item.id}
                  id={`match-right-${item.id}`}
                  type="button"
                  onClick={() => handleMatchClick && handleMatchClick('right', item.id)}
                  disabled={matchState.isChecked || isPaused}
                  style={{
                    fontFamily: Utils.getFontFamily(settings),
                    fontWeight: settings?.fontWeight || 'bold',
                    fontSize: settings?.fontSize
                      ? `${settings.fontSize * 0.8}rem`
                      : '1.1rem'
                  }}
                  className={`relative flex-1 flex flex-col justify-center items-center w-full p-3 md:p-4 rounded-xl border-2 text-center text-sm md:text-base lg:text-lg transition-all shadow-sm ${
                    isRightConnected
                      ? `border-${mainColor}-300 bg-${mainColor}-50 opacity-90`
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <span className="w-full break-words leading-tight z-10">{item.term}</span>
                  {rightFeedbackUI}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- FOOTER CHUẨN VÀNG --- */}
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
          {!matchState.isChecked ? (
            <button
              type="button"
              onClick={() => checkMatch && checkMatch()}
              disabled={
                Object.keys(matchState.connections || {}).length === 0 || aiWaitTime > 0
              }
              className={`w-full py-3 sm:py-4 bg-${mainColor}-600 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg hover:bg-${mainColor}-700 transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Icons.Check size={20} className="sm:w-6 sm:h-6" /> Kiểm tra
            </button>
          ) : (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                  matchState.isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {matchState.isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Xem ({matchState.timer}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={generateMatch}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 bg-${mainColor}-600 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${mainColor}-700`
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                    Đang tải...
                  </>
                ) : (
                  <>
                    Tiếp theo <Icons.ChevronRight size={20} className="sm:w-6 sm:h-6" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược
if (typeof window !== 'undefined') {
  window.MatchSetup = MatchSetup;
  window.MatchPlayScreen = MatchPlayScreen;
  window.Block5_1_MatchSetup = MatchSetup;
  window.Block5_1_MatchPlayScreen = MatchPlayScreen;
}

export default MatchPlayScreen;