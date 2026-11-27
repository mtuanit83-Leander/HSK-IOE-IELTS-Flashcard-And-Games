// ============================================================================
// FILE 54/85: src/features/games/ScrambleUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.3 - Scramble UI V1.10)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 17:42 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (ScrambleSetup) và Màn hình chơi chính
//           (ScramblePlayScreen) cho trò chơi Ghép Câu (Scramble Game).
//           Nâng cấp Ver 1.0 (Lượt 4.3 — Diệt 1H Radar & 0 Problems tsc):
//           1. Diệt 1/1 HIGH Radar (R05): Thay localStorage.setItem trần bằng
//              Utils.safeLocalStorageSet & Utils.safeJsonParse có kiểm duyệt
//              whitelist cấu hình; bảo lưu 100% chữ ký onStart('scramble', config).
//           2. Diệt C2, S1, S2 & S5: Chống Double-Submit (khóa nút Kiểm tra,
//              phím Enter & chạm/kéo thẻ khi gameState.isCorrect !== null);
//              thêm onDragOver chống biểu tượng cấm Desktop; tách side-effect
//              triggerAutoSave khỏi setGameState updater; sửa Bookmark sạch
//              không lưu nhầm từ nhiễu Hard Mode.
//           3. Diệt S6 & F1..F5: Hủy Loading quay về Menu (không vào Tổng kết
//              0 điểm); mở khóa nút Kiểm tra & Bỏ qua khỏi Phanh AI (aiWaitTime);
//              bảng màu tĩnh SCRAMBLE_COLOR_THEMES chống Tailwind JIT purge;
//              Footer Flex chống đè nút trên Mobile; phím Enter/Escape bảo vệ
//              bộ gõ IME; Modal A11y (Backdrop 2 nhịp, role="dialog", aria-modal).
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString } from './common/gameHelpers';

// ============================================================================
// BẢNG MÀU TĨNH CHỐNG TAILWIND JIT PURGE (10 BẢNG MÀU HỆ THỐNG)
// ============================================================================
const SCRAMBLE_COLOR_THEMES = {
  orange: {
    activeCard: 'border-orange-500 bg-orange-50 shadow-sm',
    activeIcon: 'text-orange-600',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700',
    chunkSelected: 'bg-orange-500 text-white',
    pageBg: 'bg-orange-50',
    headerTitle: 'text-orange-700',
    defBox: 'bg-orange-50 border-orange-400',
    spinnerBorder: 'border-orange-200 border-t-orange-600',
    spinnerBox: 'border-orange-100',
    spinnerText: 'text-orange-700',
    pauseBtn: 'bg-orange-600'
  },
  sky: {
    activeCard: 'border-sky-500 bg-sky-50 shadow-sm',
    activeIcon: 'text-sky-600',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700',
    chunkSelected: 'bg-sky-500 text-white',
    pageBg: 'bg-sky-50',
    headerTitle: 'text-sky-700',
    defBox: 'bg-sky-50 border-sky-400',
    spinnerBorder: 'border-sky-200 border-t-sky-600',
    spinnerBox: 'border-sky-100',
    spinnerText: 'text-sky-700',
    pauseBtn: 'bg-sky-600'
  },
  red: {
    activeCard: 'border-red-500 bg-red-50 shadow-sm',
    activeIcon: 'text-red-600',
    primaryBtn: 'bg-red-600 hover:bg-red-700',
    chunkSelected: 'bg-red-500 text-white',
    pageBg: 'bg-red-50',
    headerTitle: 'text-red-700',
    defBox: 'bg-red-50 border-red-400',
    spinnerBorder: 'border-red-200 border-t-red-600',
    spinnerBox: 'border-red-100',
    spinnerText: 'text-red-700',
    pauseBtn: 'bg-red-600'
  },
  indigo: {
    activeCard: 'border-indigo-500 bg-indigo-50 shadow-sm',
    activeIcon: 'text-indigo-600',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700',
    chunkSelected: 'bg-indigo-500 text-white',
    pageBg: 'bg-indigo-50',
    headerTitle: 'text-indigo-700',
    defBox: 'bg-indigo-50 border-indigo-400',
    spinnerBorder: 'border-indigo-200 border-t-indigo-600',
    spinnerBox: 'border-indigo-100',
    spinnerText: 'text-indigo-700',
    pauseBtn: 'bg-indigo-600'
  },
  emerald: {
    activeCard: 'border-emerald-500 bg-emerald-50 shadow-sm',
    activeIcon: 'text-emerald-600',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    chunkSelected: 'bg-emerald-500 text-white',
    pageBg: 'bg-emerald-50',
    headerTitle: 'text-emerald-700',
    defBox: 'bg-emerald-50 border-emerald-400',
    spinnerBorder: 'border-emerald-200 border-t-emerald-600',
    spinnerBox: 'border-emerald-100',
    spinnerText: 'text-emerald-700',
    pauseBtn: 'bg-emerald-600'
  },
  purple: {
    activeCard: 'border-purple-500 bg-purple-50 shadow-sm',
    activeIcon: 'text-purple-600',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700',
    chunkSelected: 'bg-purple-500 text-white',
    pageBg: 'bg-purple-50',
    headerTitle: 'text-purple-700',
    defBox: 'bg-purple-50 border-purple-400',
    spinnerBorder: 'border-purple-200 border-t-purple-600',
    spinnerBox: 'border-purple-100',
    spinnerText: 'text-purple-700',
    pauseBtn: 'bg-purple-600'
  },
  pink: {
    activeCard: 'border-pink-500 bg-pink-50 shadow-sm',
    activeIcon: 'text-pink-600',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700',
    chunkSelected: 'bg-pink-500 text-white',
    pageBg: 'bg-pink-50',
    headerTitle: 'text-pink-700',
    defBox: 'bg-pink-50 border-pink-400',
    spinnerBorder: 'border-pink-200 border-t-pink-600',
    spinnerBox: 'border-pink-100',
    spinnerText: 'text-pink-700',
    pauseBtn: 'bg-pink-600'
  },
  cyan: {
    activeCard: 'border-cyan-500 bg-cyan-50 shadow-sm',
    activeIcon: 'text-cyan-600',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700',
    chunkSelected: 'bg-cyan-500 text-white',
    pageBg: 'bg-cyan-50',
    headerTitle: 'text-cyan-700',
    defBox: 'bg-cyan-50 border-cyan-400',
    spinnerBorder: 'border-cyan-200 border-t-cyan-600',
    spinnerBox: 'border-cyan-100',
    spinnerText: 'text-cyan-700',
    pauseBtn: 'bg-cyan-600'
  },
  blue: {
    activeCard: 'border-blue-500 bg-blue-50 shadow-sm',
    activeIcon: 'text-blue-600',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700',
    chunkSelected: 'bg-blue-500 text-white',
    pageBg: 'bg-blue-50',
    headerTitle: 'text-blue-700',
    defBox: 'bg-blue-50 border-blue-400',
    spinnerBorder: 'border-blue-200 border-t-blue-600',
    spinnerBox: 'border-blue-100',
    spinnerText: 'text-blue-700',
    pauseBtn: 'bg-blue-600'
  },
  slate: {
    activeCard: 'border-slate-500 bg-slate-50 shadow-sm',
    activeIcon: 'text-slate-600',
    primaryBtn: 'bg-slate-700 hover:bg-slate-800',
    chunkSelected: 'bg-slate-600 text-white',
    pageBg: 'bg-slate-50',
    headerTitle: 'text-slate-700',
    defBox: 'bg-slate-50 border-slate-400',
    spinnerBorder: 'border-slate-200 border-t-slate-600',
    spinnerBox: 'border-slate-100',
    spinnerText: 'text-slate-700',
    pauseBtn: 'bg-slate-700'
  }
};

const VALID_TIME_LIMITS = [20, 30, 60, 90, 120];
const VALID_INPUT_METHODS = ['tap', 'type', 'voice'];

/**
 * Lấy bảng màu tĩnh an toàn theo mainColor
 * @param {string} mainColor
 */
const getScrambleTheme = (mainColor) => {
  return SCRAMBLE_COLOR_THEMES[mainColor] || SCRAMBLE_COLOR_THEMES.orange;
};

/**
 * Đọc và kiểm duyệt whitelist cấu hình Ghép Câu an toàn từ LocalStorage
 * @returns {{
 *   sourceMode: 'card' | 'ai_pure',
 *   timerMode: boolean,
 *   hardMode: boolean,
 *   aiMode: boolean,
 *   timeLimit: number,
 *   inputMethod: 'tap' | 'type' | 'voice',
 *   autoReadAnswer: boolean,
 *   suddenDeath: boolean
 * }}
 */
const getSavedScrambleConfig = () => {
  const raw =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_scramble_config', {})
      : {};
  const safeObj = raw && typeof raw === 'object' ? raw : {};

  /** @type {'card' | 'ai_pure'} */
  const sourceMode = safeObj.sourceMode === 'ai_pure' ? 'ai_pure' : 'card';
  /** @type {'tap' | 'type' | 'voice'} */
  const rawInput = VALID_INPUT_METHODS.includes(safeObj.inputMethod)
    ? safeObj.inputMethod
    : 'tap';
  const inputMethod = sourceMode === 'ai_pure' ? 'tap' : rawInput;
  const hardMode = Boolean(safeObj.hardMode);
  const aiMode =
    sourceMode === 'card' && hardMode && inputMethod === 'tap'
      ? Boolean(safeObj.aiMode)
      : false;
  const parsedTime = Number(safeObj.timeLimit);
  const timeLimit = VALID_TIME_LIMITS.includes(parsedTime) ? parsedTime : 60;

  return {
    sourceMode,
    timerMode: Boolean(safeObj.timerMode),
    hardMode,
    aiMode,
    timeLimit,
    inputMethod,
    autoReadAnswer: Boolean(safeObj.autoReadAnswer),
    suddenDeath: Boolean(safeObj.suddenDeath)
  };
};

/**
 * Tính màu đồng hồ đếm ngược câu hỏi
 * @param {number} timeLeft
 * @param {number} totalLimit
 * @returns {string}
 */
const getScrambleTimerColor = (timeLeft, totalLimit) => {
  const safeTotal = Number(totalLimit) > 0 ? Number(totalLimit) : 60;
  const safeTime = Number(timeLeft) >= 0 ? Number(timeLeft) : 0;
  const ratio = safeTime / safeTotal;
  if (ratio > 0.6) return 'text-green-600';
  if (ratio > 0.3) return 'text-orange-500';
  return 'text-red-600 animate-pulse';
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (SCRAMBLE SETUP)
// ============================================================================
/**
 * @param {{
 *   t?: (key: string) => string,
 *   mainColor?: string,
 *   onStart?: (gameType: string, config: Record<string, any>) => void,
 *   onBack?: () => void
 * }} props
 */
export const ScrambleSetup = ({
  t = undefined,
  mainColor = 'orange',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getScrambleTheme(mainColor);
  const [initialConfig] = useState(() => getSavedScrambleConfig());

  const [sourceMode, setSourceMode] = useState(() => initialConfig.sourceMode);
  const [timerMode, setTimerMode] = useState(() => initialConfig.timerMode);
  const [hardMode, setHardMode] = useState(() => initialConfig.hardMode);
  const [aiMode, setAiMode] = useState(() => initialConfig.aiMode);
  const [timeLimit, setTimeLimit] = useState(() => initialConfig.timeLimit);
  const [inputMethod, setInputMethod] = useState(
    () => initialConfig.inputMethod
  );
  const [autoReadAnswer, setAutoReadAnswer] = useState(
    () => initialConfig.autoReadAnswer
  );
  const [suddenDeath, setSuddenDeath] = useState(
    () => initialConfig.suddenDeath
  );

  const handleStart = () => {
    const config = {
      timerMode,
      hardMode,
      aiMode:
        sourceMode === 'card' && hardMode && inputMethod === 'tap'
          ? aiMode
          : false,
      timeLimit,
      inputMethod,
      autoReadAnswer,
      sourceMode,
      suddenDeath
    };
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_scramble_config', config);
    }
    // Bảo lưu 100% hợp đồng 2 tham số với GameView.jsx (Ver 1.4)
    if (typeof onStart === 'function') {
      onStart('scramble', config);
    }
  };

  /**
   * @param {boolean} val
   */
  const handleHardModeChange = (val) => {
    setHardMode(val);
    if (!val) setAiMode(false);
  };

  const isAiChallengeDisabled =
    !hardMode || inputMethod !== 'tap' || sourceMode === 'ai_pure';

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-sm h-full animate-in slide-in-from-right-8">
      <div className="w-full flex items-center justify-between mb-6 shrink-0 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          title={typeof t === 'function' ? t('backMenu') : 'Quay lại'}
          aria-label="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Cấu hình Ghép Câu</h2>
        <div className="w-10" />
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
              className={
                'p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all hover:scale-105 ' +
                (sourceMode === 'card'
                  ? theme.activeCard
                  : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
              }
            >
              <Icons.Layers
                size={24}
                className={
                  sourceMode === 'card' ? theme.activeIcon : 'text-gray-400'
                }
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">
                  Thẻ của tôi
                </div>
                <div className="text-[10px] text-gray-500">
                  Ghép câu/từ có sẵn
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceMode('ai_pure');
                setInputMethod('tap');
                setAiMode(false);
              }}
              className={
                'p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all hover:scale-105 ' +
                (sourceMode === 'ai_pure'
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
              }
            >
              <Icons.Sparkles
                size={24}
                className={
                  sourceMode === 'ai_pure' ? 'text-blue-600' : 'text-gray-400'
                }
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">
                  AI Tự Sinh
                </div>
                <div className="text-[10px] text-gray-500">
                  Tạo câu đố mới vô tận
                </div>
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
              className={
                'p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ' +
                (inputMethod === 'tap'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-blue-300 bg-white text-gray-500')
              }
            >
              <span className="text-2xl mb-1" aria-hidden="true">
                🖱️
              </span>
              <span className="font-bold text-xs">Chạm thẻ</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputMethod('type');
                setAiMode(false);
              }}
              className={
                'p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ' +
                (inputMethod === 'type'
                  ? 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-200'
                  : 'border-gray-200 hover:border-green-300 bg-white text-gray-500')
              }
            >
              <span className="text-2xl mb-1" aria-hidden="true">
                ⌨️
              </span>
              <span className="font-bold text-xs">Gõ phím</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setInputMethod('voice');
                setAiMode(false);
              }}
              className={
                'p-3 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ' +
                (inputMethod === 'voice'
                  ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                  : 'border-gray-200 hover:border-purple-300 bg-white text-gray-500')
              }
            >
              <span className="text-2xl mb-1" aria-hidden="true">
                🎙️
              </span>
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
          disabled={false}
          extra={null}
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
          disabled={false}
          extra={null}
        />

        <MenuToggle
          active={aiMode}
          setActive={setAiMode}
          icon={Icons.Sparkles}
          color="purple"
          title="Thử thách AI"
          subtitle={
            sourceMode === 'ai_pure'
              ? '(AI Tự Sinh đã bao gồm bẫy AI)'
              : !hardMode
                ? '(Yêu cầu bật Chế độ Khó)'
                : inputMethod !== 'tap'
                  ? '(Chỉ hỗ trợ Chạm thẻ)'
                  : 'AI tạo bẫy ngữ pháp (cho câu văn)'
          }
          disabled={isAiChallengeDisabled}
          extra={null}
        />

        <MenuToggle
          active={suddenDeath}
          setActive={setSuddenDeath}
          icon={Icons.AlertCircle}
          color="slate"
          title="Chế độ Địa ngục"
          subtitle="Sai 1 lần là mất điểm ngay lập tức"
          disabled={false}
          extra={null}
        />

        <MenuToggle
          active={timerMode}
          setActive={setTimerMode}
          icon={Icons.Clock}
          color="orange"
          title="Giới hạn thời gian"
          subtitle={
            timerMode
              ? String(timeLimit) + ' giây / câu'
              : 'Thoải mái thời gian'
          }
          disabled={false}
          extra={
            <div className="mt-3 pt-2 border-t border-orange-100 flex justify-between items-center animate-in fade-in">
              <span className="text-[10px] font-bold text-orange-400 uppercase">
                Chọn thời gian:
              </span>
              <div className="flex gap-1">
                {VALID_TIME_LIMITS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTimeLimit(sec);
                    }}
                    className={
                      'px-3 py-1 text-xs font-bold rounded-lg border transition-all ' +
                      (timeLimit === sec
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50')
                    }
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
          className={
            'w-full py-4 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform ' +
            theme.primaryBtn
          }
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
/**
 * @param {{
 *   t?: (key: string) => string,
 *   mainColor?: string,
 *   lang?: string,
 *   settings?: Record<string, any>,
 *   config?: Record<string, any>,
 *   isPaused?: boolean,
 *   timerMode?: boolean,
 *   timeLimit?: number,
 *   timeLeft?: number,
 *   time?: number,
 *   inputMethod?: string,
 *   isGenerating?: boolean,
 *   aiCountdown?: number,
 *   gameState?: Record<string, any>,
 *   setGameState?: (updater: any) => void,
 *   onPickChunk?: (chunk: Record<string, any>) => void,
 *   onUnpickChunk?: (chunk: Record<string, any>) => void,
 *   stats?: { correct: number, wrong: number },
 *   difficulty?: string,
 *   inputBuffer?: string,
 *   setInputBuffer?: (val: string) => void,
 *   typeInputRef?: React.RefObject<HTMLInputElement>,
 *   isListening?: boolean,
 *   showExplainModal?: boolean,
 *   setShowExplainModal?: (val: boolean) => void,
 *   aiExplanation?: string | null,
 *   isAiExplaining?: boolean,
 *   onBack?: () => void,
 *   onEndGame?: (stats?: Record<string, any>) => void,
 *   onPause?: () => void,
 *   onPlay?: (text: string) => void,
 *   onBookmark?: (payload: Record<string, any>) => void,
 *   triggerAutoSave?: () => void,
 *   checkAnswer?: () => void,
 *   toggleMic?: () => void,
 *   handleSkip?: (isTimeout?: boolean) => void,
 *   onDragStart?: (e: any, idx: number) => void,
 *   onDragEnter?: (e: any, idx: number) => void,
 *   onDragEnd?: (e: any) => void,
 *   onTouchStart?: (e: any, idx: number) => void,
 *   onTouchMove?: (e: any) => void,
 *   onTouchEnd?: (e: any) => void,
 *   handleExplain?: () => void,
 *   nextRound?: () => void,
 *   isBookmarked?: boolean,
 *   handleAddPunctuation?: (punct: string) => void,
 *   resultTimer?: number,
 *   isResultPaused?: boolean,
 *   toggleResultPause?: () => void,
 *   queueLength?: number,
 *   aiWaitTime?: number
 * }} props
 */
export const ScramblePlayScreen = ({
  t = undefined,
  mainColor = 'orange',
  lang = 'en',
  settings = undefined,
  config = undefined,
  isPaused = false,
  timerMode = false,
  timeLimit = 60,
  timeLeft = 60,
  time = 0,
  inputMethod = 'tap',
  isGenerating = false,
  aiCountdown = 0,
  gameState = undefined,
  setGameState = undefined,
  onPickChunk = undefined,
  onUnpickChunk = undefined,
  stats = { correct: 0, wrong: 0 },
  difficulty = 'easy',
  inputBuffer = '',
  setInputBuffer = undefined,
  typeInputRef = undefined,
  isListening = false,
  showExplainModal = false,
  setShowExplainModal = undefined,
  aiExplanation = null,
  isAiExplaining = false,
  onBack = undefined,
  onEndGame = undefined,
  onPause = undefined,
  onPlay = undefined,
  onBookmark = undefined,
  triggerAutoSave = undefined,
  checkAnswer = undefined,
  toggleMic = undefined,
  handleSkip = undefined,
  onDragStart = undefined,
  onDragEnter = undefined,
  onDragEnd = undefined,
  onTouchStart = undefined,
  onTouchMove = undefined,
  onTouchEnd = undefined,
  handleExplain = undefined,
  nextRound = undefined,
  isBookmarked = false,
  handleAddPunctuation = undefined,
  resultTimer = 0,
  isResultPaused = false,
  toggleResultPause = undefined,
  queueLength = 0,
  aiWaitTime = 0
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const backdropMouseDownRef = useRef(false);
  /** @type {React.MutableRefObject<any>} */
  const fallbackSaveTimerRef = useRef(null);

  const theme = getScrambleTheme(mainColor);
  const safeGameState = gameState || {
    origin: null,
    chunks: [],
    userAnswer: [],
    isCorrect: null,
    attempts: 0,
    isAiGenerated: false
  };
  const safeStats = {
    correct: Number(stats?.correct) || 0,
    wrong: Number(stats?.wrong) || 0
  };
  const safeTime = Number(time) || 0;
  const safeQueueLen = Number(queueLength) || 0;
  const safeAiWait = Number(aiWaitTime) || 0;
  const safeBuffer = typeof inputBuffer === 'string' ? inputBuffer : '';
  const safeUserAnswer = Array.isArray(safeGameState.userAnswer)
    ? safeGameState.userAnswer
    : [];
  const safeChunks = Array.isArray(safeGameState.chunks)
    ? safeGameState.chunks
    : [];

  const totalPlayed = safeStats.correct + safeStats.wrong;
  const accuracy =
    totalPlayed > 0 ? Math.round((safeStats.correct / totalPlayed) * 100) : 0;

  const isRoundSettled =
    safeGameState.isCorrect === true ||
    (safeGameState.isCorrect === false &&
      (Number(safeGameState.attempts) || 0) >= 3);
  const isInteractionLocked =
    isPaused || isGenerating || safeGameState.isCorrect !== null;

  const containerWidthClass = 'max-w-5xl';
  const safeLevelStr = getSafeLevelString(config?.level, '');
  const formattedLevelLabel =
    config?.sourceMode === 'ai_pure' && safeLevelStr
      ? safeLevelStr.replace(/^(en|zh)_/i, '').replace(/level_/i, 'LEVEL ').replace(/_/g, ' ').toUpperCase()
      : '';

  // Dọn timer auto-save dự phòng khi unmount
  useEffect(() => {
    return () => {
      if (fallbackSaveTimerRef.current) {
        clearTimeout(fallbackSaveTimerRef.current);
        fallbackSaveTimerRef.current = null;
      }
    };
  }, []);

  // Phím Escape đóng Modal Xác nhận hoặc Modal Giải thích (bảo vệ bộ gõ IME)
  useEffect(() => {
    if (!showConfirmEnd && !showExplainModal) return undefined;
    /**
     * @param {KeyboardEvent} e
     */
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (showConfirmEnd) {
        setShowConfirmEnd(false);
      } else if (showExplainModal && typeof setShowExplainModal === 'function') {
        setShowExplainModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmEnd, showExplainModal, setShowExplainModal]);

  const scheduleFallbackSave = () => {
    if (typeof triggerAutoSave !== 'function') return;
    if (fallbackSaveTimerRef.current) {
      clearTimeout(fallbackSaveTimerRef.current);
    }
    fallbackSaveTimerRef.current = setTimeout(() => {
      fallbackSaveTimerRef.current = null;
      triggerAutoSave();
    }, 150);
  };

  /**
   * Bấm chọn mảnh từ ở kho dưới đưa lên ô ghép (Diệt C2 — không side-effect trong updater)
   * @param {Record<string, any>} chunk
   */
  const handleSelectChunkFromPool = (chunk) => {
    if (isInteractionLocked || !chunk) return;
    if (typeof onPickChunk === 'function') {
      onPickChunk(chunk);
      return;
    }
    if (typeof setGameState === 'function') {
      setGameState((p) => ({
        ...p,
        userAnswer: [...(Array.isArray(p.userAnswer) ? p.userAnswer : []), chunk],
        chunks: (Array.isArray(p.chunks) ? p.chunks : []).filter(
          (c) => c.id !== chunk.id
        )
      }));
      scheduleFallbackSave();
    }
  };

  /**
   * Bấm gỡ mảnh từ từ ô ghép trả về kho dưới (Diệt C2 — khóa khi chốt kết quả)
   * @param {Record<string, any>} chunk
   */
  const handleRemoveChunkFromAnswer = (chunk) => {
    if (isInteractionLocked || !chunk) return;
    if (typeof onUnpickChunk === 'function') {
      onUnpickChunk(chunk);
      return;
    }
    if (typeof setGameState === 'function') {
      setGameState((p) => ({
        ...p,
        userAnswer: (Array.isArray(p.userAnswer) ? p.userAnswer : []).filter(
          (c) => c.id !== chunk.id
        ),
        chunks: chunk.isPunct
          ? Array.isArray(p.chunks)
            ? p.chunks
            : []
          : [...(Array.isArray(p.chunks) ? p.chunks : []), chunk]
      }));
      scheduleFallbackSave();
    }
  };

  /**
   * Lưu Sổ tay sạch: dùng đúng câu gốc thay vì nhặt từ nhiễu Hard Mode (Diệt S5)
   * @param {React.MouseEvent} e
   */
  const handleCleanBookmark = (e) => {
    e.stopPropagation();
    if (typeof onBookmark !== 'function' || !safeGameState.origin?.term) return;
    const cleanTerm = String(safeGameState.origin.term).trim();
    const cleanDef = String(safeGameState.origin.definition || '').trim();
    onBookmark({
      isSmartTarget: true,
      display: cleanTerm,
      save: cleanTerm,
      analysis: cleanDef,
      lang: lang === 'zh' ? 'zh' : 'en'
    });
  };

  /**
   * Render từng mảnh từ (chống Tailwind JIT purge)
   * @param {Record<string, any>} chunk
   * @param {boolean} isFromPool
   */
  const renderChunk = (chunk, isFromPool) => {
    const isSpace = chunk.text === ' ';
    const isPunct = Boolean(chunk.isPunct);
    const fontFamily =
      Utils && typeof Utils.getFontFamily === 'function'
        ? Utils.getFontFamily(settings)
        : 'inherit';

    return (
      <div
        style={{
          touchAction: 'none',
          fontFamily,
          fontWeight: settings?.fontWeight || 'bold',
          fontSize: settings?.fontSize
            ? String(settings.fontSize) + 'rem'
            : '1.5rem'
        }}
        className={
          'px-3 py-1.5 rounded-lg shadow transition-all select-none ' +
          (isSpace
            ? 'bg-gray-200 border-2 border-dashed border-gray-400 text-transparent min-w-[30px] flex justify-center items-center'
            : isFromPool
              ? 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 ' +
                (isInteractionLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer')
              : isPunct
                ? 'bg-gray-700 text-white ' +
                  (isInteractionLocked
                    ? 'cursor-default opacity-80'
                    : 'cursor-grab active:cursor-grabbing')
                : theme.chunkSelected +
                  ' ' +
                  (isInteractionLocked
                    ? 'cursor-default opacity-85'
                    : 'cursor-grab active:cursor-grabbing'))
        }
      >
        {isSpace ? '␣' : chunk.text}
      </div>
    );
  };

  // Màn hình chờ khởi tạo (Diệt S6: Bấm Hủy quay về Menu thay vì Tổng kết 0 điểm)
  if (isGenerating && (!safeGameState.origin || aiCountdown > 0)) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none" />
      );
    }
    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onComplete={() => {}}
        onCancel={() => {
          if (typeof onBack === 'function') {
            onBack();
          } else if (typeof onEndGame === 'function') {
            onEndGame({ ...safeStats, time: safeTime });
          }
        }}
        queueLength={safeQueueLen}
        text={
          config?.sourceMode === 'ai_pure'
            ? 'AI đang sáng tác câu đố...'
            : 'Đang thiết lập trò chơi...'
        }
        subText=""
        mainColor={mainColor}
        levelStr={formattedLevelLabel}
      />
    );
  }

  // Fallback khẩn cấp khi không tải được dữ liệu
  if (!isGenerating && !safeGameState.origin) {
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
          onClick={() => {
            if (typeof onEndGame === 'function') {
              onEndGame({ ...safeStats, time: safeTime });
            } else if (typeof onBack === 'function') {
              onBack();
            }
          }}
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  const fontFamily =
    Utils && typeof Utils.getFontFamily === 'function'
      ? Utils.getFontFamily(settings)
      : 'inherit';
  const canCheckAnswer =
    !isInteractionLocked &&
    (safeUserAnswer.length > 0 || safeBuffer.trim().length > 0);
  const canSkipQuestion = !isInteractionLocked;

  return (
    <div
      className={
        'w-full h-full flex flex-col items-center rounded-2xl shadow-xl border-2 border-gray-200 overflow-hidden relative animate-in ' +
        theme.pageBg
      }
    >
      {/* POPUP Xác nhận thoát Game (A11y + Backdrop 2 nhịp) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scramble-confirm-end-title"
          onMouseDown={(e) => {
            backdropMouseDownRef.current =
              e.button === 0 && e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (
              backdropMouseDownRef.current &&
              e.target === e.currentTarget
            ) {
              setShowConfirmEnd(false);
            }
            backdropMouseDownRef.current = false;
          }}
          className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4"
        >
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3
              id="scramble-confirm-end-title"
              className="text-xl font-black text-gray-800 mb-2"
            >
              Kết thúc sớm?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Tiến trình của câu hỏi hiện tại sẽ không được lưu lại. Bạn có chắc
              chắn muốn thoát?
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
                  if (typeof onEndGame === 'function') {
                    onEndGame({ ...safeStats, time: safeTime });
                  }
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
      {isGenerating && safeGameState.origin && (
        <div className="absolute inset-0 z-[150] bg-white/30 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
          <div
            className={
              'px-5 py-3 bg-white rounded-2xl shadow-xl border-2 flex items-center gap-3 ' +
              theme.spinnerBox
            }
          >
            <div
              className={
                'w-5 h-5 border-4 rounded-full animate-spin ' +
                theme.spinnerBorder
              }
            />
            <span className={'font-bold text-sm ' + theme.spinnerText}>
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
              aria-label="Tiếp tục chơi"
              className={
                'w-16 h-16 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform ' +
                theme.pauseBtn
              }
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
            title={typeof t === 'function' ? t('backMenu') : 'Quay lại Menu'}
          >
            <Icons.ChevronLeft size={18} />
            <span className="hidden sm:inline">
              {typeof t === 'function' ? t('backMenu') : 'Menu'}
            </span>
          </button>
        </div>

        <div className="flex-1 text-center flex flex-col items-center">
          <h2
            className={
              'font-black text-lg tracking-tight uppercase ' + theme.headerTitle
            }
          >
            {typeof t === 'function' ? t('modeScramble') : 'Ghép Câu'}
          </h2>
          {timerMode && (
            <span
              className={
                'text-[11px] font-mono font-bold flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full mt-0.5 border border-gray-200 ' +
                getScrambleTimerColor(timeLeft, timeLimit)
              }
            >
              <Icons.Clock size={12} /> {timeLeft}s
            </span>
          )}
        </div>

        <div className="w-1/4 flex justify-end items-center gap-2">
          {safeTime > 0 && (
            <span className="hidden sm:inline-block text-xs font-mono font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">
              {safeTime}s
            </span>
          )}
        </div>
      </div>

      {/* KHU VỰC THÔNG TIN & THỐNG KÊ */}
      <div className="flex-1 w-full overflow-y-auto custom-scrollbar p-4 flex flex-col items-center gap-4">
        <div
          className={
            'w-full flex justify-between items-center gap-2 flex-wrap transition-all duration-300 ' +
            containerWidthClass
          }
        >
          <div className="flex gap-2 text-xs font-bold items-center">
            <span className="text-green-600 bg-green-100 px-2 py-1 rounded border border-green-200 flex items-center gap-1">
              <Icons.CheckCircle size={14} /> {safeStats.correct}
            </span>
            <span className="text-red-500 bg-red-100 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
              <Icons.X size={14} /> {safeStats.wrong}
            </span>
            <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
              🎯 {accuracy}%
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Nhãn nguồn gốc */}
            {safeGameState.origin?._isRescued || safeGameState._isRescued ? (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-orange-100 text-orange-700 border border-orange-200"
                title="Sử dụng dữ liệu dự phòng do mất kết nối"
              >
                <Icons.AlertCircle size={12} className="text-orange-500" />{' '}
                Nguồn: Dự phòng
              </span>
            ) : safeGameState.isAiGenerated ? (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-100 text-indigo-700 border border-indigo-200"
                title="Câu hỏi được tạo bởi AI"
              >
                <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn:
                AI
              </span>
            ) : (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-slate-100 text-slate-600 border border-slate-200"
                title="Trích xuất từ Bộ thẻ"
              >
                <Icons.Layers size={12} className="text-slate-400" /> Nguồn:
                Thẻ gốc
              </span>
            )}

            {/* Băng đạn AI */}
            {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
              safeQueueLen > 0 && (
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                  title={'Đã nạp sẵn ' + String(safeQueueLen) + ' vòng'}
                >
                  <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                  {safeQueueLen}
                </span>
              )}

            {/* Phanh AI (Hiển thị cả trên Mobile) */}
            {safeAiWait > 0 && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
                title="Thời gian chờ an toàn cho câu tiếp theo"
              >
                <Icons.Clock size={12} className="text-indigo-500" />{' '}
                {safeAiWait}s
              </span>
            )}

            {/* Huy hiệu Sudden Death */}
            {config?.suddenDeath && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-slate-100 text-slate-700 border border-slate-300"
                title="Chế độ Địa ngục: Sai 1 lần mất điểm"
              >
                <Icons.AlertCircle size={12} className="text-slate-600" /> Địa
                ngục
              </span>
            )}

            <span
              className={
                'text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider shadow-sm cursor-default ' +
                (inputMethod === 'tap'
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : inputMethod === 'type'
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-purple-100 text-purple-700 border border-purple-200')
              }
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
          className={
            'w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 transition-all duration-300 ' +
            containerWidthClass
          }
        >
          <div
            className={
              'p-4 border-l-4 mb-6 rounded-xl italic text-gray-700 text-center shadow-inner ' +
              theme.defBox
            }
            style={{
              fontSize: settings?.backFontSize
                ? String(settings.backFontSize) + 'rem'
                : '0.875rem',
              fontWeight: settings?.fontWeight || 'normal',
              fontFamily: 'inherit'
            }}
          >
            &ldquo;{safeGameState.origin?.definition || ''}&rdquo;
          </div>

          {safeGameState.isCorrect === false &&
            (Number(safeGameState.attempts) || 0) >= 3 && (
              <div className="w-full mb-6 p-5 border-2 border-green-400 bg-green-50 rounded-2xl flex flex-col items-center justify-center animate-in zoom-in shadow-sm">
                <span className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icons.CheckCircle size={14} /> Đáp án chính xác
                </span>
                <span
                  className="text-xl md:text-2xl font-bold text-green-900 text-center leading-relaxed"
                  style={{ fontFamily }}
                >
                  {safeGameState.origin?.term}
                </span>
              </div>
            )}

          {/* Phương thức 1: Chạm & Kéo thả thẻ từ */}
          {inputMethod === 'tap' && (
            <div className="w-full flex flex-col gap-5">
              {/* Khu vực Nhận Đáp Án */}
              <div
                onDragOver={(e) => {
                  if (!isInteractionLocked) e.preventDefault();
                }}
                className={
                  'min-h-[120px] border-2 border-dashed rounded-2xl p-4 flex flex-wrap items-center gap-2 transition-colors ' +
                  (safeGameState.isCorrect === true
                    ? 'bg-green-50 border-green-400 shadow-inner'
                    : safeGameState.isCorrect === false
                      ? 'bg-red-50 border-red-400 shadow-inner'
                      : 'bg-gray-50 border-gray-300')
                }
              >
                {safeUserAnswer.map((chunk, idx) => (
                  <div
                    key={chunk.id}
                    data-drag-index={idx}
                    draggable={!isInteractionLocked}
                    onDragStart={(e) =>
                      !isInteractionLocked &&
                      typeof onDragStart === 'function' &&
                      onDragStart(e, idx)
                    }
                    onDragOver={(e) => {
                      if (!isInteractionLocked) e.preventDefault();
                    }}
                    onDragEnter={(e) =>
                      !isInteractionLocked &&
                      typeof onDragEnter === 'function' &&
                      onDragEnter(e, idx)
                    }
                    onDragEnd={(e) =>
                      typeof onDragEnd === 'function' && onDragEnd(e)
                    }
                    onTouchStart={(e) =>
                      !isInteractionLocked &&
                      typeof onTouchStart === 'function' &&
                      onTouchStart(e, idx)
                    }
                    onTouchMove={(e) =>
                      !isInteractionLocked &&
                      typeof onTouchMove === 'function' &&
                      onTouchMove(e)
                    }
                    onTouchEnd={(e) =>
                      typeof onTouchEnd === 'function' && onTouchEnd(e)
                    }
                    onClick={() => handleRemoveChunkFromAnswer(chunk)}
                  >
                    {renderChunk(chunk, false)}
                  </div>
                ))}
                {safeUserAnswer.length === 0 && (
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
                    onClick={() =>
                      !isInteractionLocked &&
                      typeof handleAddPunctuation === 'function' &&
                      handleAddPunctuation(punct)
                    }
                    disabled={isInteractionLocked}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 text-gray-700 font-bold border border-gray-200 hover:bg-gray-100 hover:border-gray-300 shadow-sm disabled:opacity-50 transition-colors"
                    style={{
                      fontFamily,
                      fontSize: '1.25rem'
                    }}
                  >
                    {punct}
                  </button>
                ))}
              </div>

              {/* Khu vực Chọn Từ */}
              <div className="flex flex-wrap justify-center gap-2.5 min-h-[80px] p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">
                {safeChunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    onClick={() => handleSelectChunkFromPool(chunk)}
                  >
                    {renderChunk(chunk, true)}
                  </div>
                ))}
                {safeChunks.length === 0 && (
                  <span className="w-full text-center text-gray-300 font-medium italic text-sm pt-2">
                    Đã dùng hết từ
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Phương thức 2: Gõ bàn phím (bảo vệ bộ gõ IME & chống Double-Submit S1) */}
          {inputMethod === 'type' && (
            <div className="w-full flex flex-col items-center gap-4 animate-in slide-in-from-bottom-4">
              <input
                ref={typeInputRef}
                type="text"
                autoFocus
                value={safeBuffer}
                onChange={(e) =>
                  typeof setInputBuffer === 'function' &&
                  setInputBuffer(e.target.value)
                }
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.nativeEvent?.isComposing &&
                    canCheckAnswer &&
                    typeof checkAnswer === 'function'
                  ) {
                    e.preventDefault();
                    checkAnswer();
                  }
                }}
                className={
                  'w-full p-6 text-center border-4 rounded-2xl outline-none transition-colors shadow-inner ' +
                  (safeGameState.isCorrect === true
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : safeGameState.isCorrect === false
                      ? 'bg-red-50 border-red-400 text-red-700'
                      : 'bg-gray-50 border-blue-200 focus:border-blue-500 text-gray-800')
                }
                placeholder="Gõ lại câu bằng bàn phím..."
                style={{
                  fontFamily,
                  fontWeight: settings?.fontWeight || 'bold',
                  fontSize: settings?.fontSize
                    ? String(settings.fontSize) + 'rem'
                    : '1.875rem'
                }}
                disabled={isInteractionLocked}
              />
              <p className="text-xs text-gray-400">
                Ấn phím{' '}
                <kbd className="bg-gray-100 px-2 py-1 rounded border shadow-sm">
                  Enter
                </kbd>{' '}
                để kiểm tra
              </p>
            </div>
          )}

          {/* Phương thức 3: Nhận diện giọng nói */}
          {inputMethod === 'voice' && (
            <div className="w-full flex flex-col items-center gap-4 animate-in zoom-in">
              <div
                className={
                  'w-full min-h-[120px] border-4 rounded-2xl outline-none transition-colors shadow-inner flex flex-col items-center justify-center p-6 text-center ' +
                  (safeGameState.isCorrect === true
                    ? 'bg-green-50 border-green-400 text-green-700'
                    : safeGameState.isCorrect === false
                      ? 'bg-red-50 border-red-400 text-red-700'
                      : 'bg-gray-50 border-purple-200 text-gray-800')
                }
              >
                <span
                  style={{
                    fontFamily,
                    fontWeight: settings?.fontWeight || 'bold',
                    fontSize: settings?.fontSize
                      ? String(settings.fontSize) + 'rem'
                      : '1.5rem'
                  }}
                >
                  {safeBuffer || (
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
                  disabled={isInteractionLocked}
                  aria-label={isListening ? 'Dừng thu âm' : 'Bắt đầu thu âm'}
                  className={
                    'w-20 h-20 rounded-full border-4 flex items-center justify-center shadow-lg outline-none transition-all duration-300 disabled:opacity-50 ' +
                    (isListening
                      ? 'bg-red-50 border-red-200 text-red-500 animate-pulse scale-110 shadow-red-200'
                      : 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 hover:scale-105 hover:shadow-purple-200')
                  }
                >
                  {isListening ? (
                    <Icons.Square size={32} fill="currentColor" />
                  ) : (
                    <Icons.Mic size={32} />
                  )}
                </button>
                <p
                  className={
                    'font-bold mt-3 text-center text-sm ' +
                    (isListening
                      ? 'text-red-500 animate-pulse'
                      : 'text-gray-500')
                  }
                >
                  {isListening
                    ? 'Đang lắng nghe (Chạm để Dừng)...'
                    : 'Chạm Micro để đọc'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Nút nghe gợi ý sau 2 lần sai (Ở chế độ thường) */}
        {(Number(safeGameState.attempts) || 0) >= 2 &&
          difficulty !== 'hard' &&
          safeGameState.origin?.term && (
            <div
              className={
                'flex w-full justify-center mt-2 animate-in slide-in-from-top-2 transition-all duration-300 ' +
                containerWidthClass
              }
            >
              <button
                type="button"
                onClick={() =>
                  typeof onPlay === 'function' &&
                  onPlay(safeGameState.origin.term)
                }
                className="px-6 py-2.5 flex items-center gap-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full shadow-sm hover:bg-yellow-100 font-bold transition-transform hover:scale-105 disabled:opacity-50"
                disabled={isPaused}
              >
                <Icons.Volume2 size={20} /> Nghe lại đáp án
              </button>
            </div>
          )}
      </div>

      {/* FOOTER ĐIỀU KHIỂN (Flex chuẩn chống đè nút trên Mobile) */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-3 z-30 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {/* Nút Kết thúc */}
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="shrink-0 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
          aria-label="Kết thúc ván chơi"
        >
          <Icons.X size={16} />{' '}
          <span className="hidden sm:inline">Kết thúc</span>
        </button>

        {/* Khu vực điều khiển chính */}
        <div className="flex-1 flex justify-end max-w-xl">
          {isRoundSettled ? (
            <div className="w-full flex gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={handleExplain}
                disabled={isPaused || isGenerating}
                className="flex-1 py-3 px-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs sm:text-sm hover:bg-blue-100 transition-colors flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
                title="Phân tích ngữ pháp"
              >
                <Icons.BookOpen size={16} className="shrink-0" />
                <span className="hidden sm:inline">Giải thích</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  typeof toggleResultPause === 'function' && toggleResultPause()
                }
                className={
                  'flex-1 py-3 px-2 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1 ' +
                  (isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')
                }
              >
                {isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" />{' '}
                    <span>Dừng</span>
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" />{' '}
                    <span>({resultTimer}s)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCleanBookmark}
                disabled={isPaused || isGenerating}
                className={
                  'flex-1 py-3 px-2 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1 disabled:opacity-50 ' +
                  (isBookmarked
                    ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')
                }
                title={typeof t === 'function' ? t('addToNotebook') : 'Lưu Sổ tay'}
              >
                <Icons.Bookmark
                  size={16}
                  fill={isBookmarked ? 'currentColor' : 'none'}
                  className="shrink-0"
                />
                <span className="hidden sm:inline">Lưu Sổ tay</span>
              </button>

              <button
                type="button"
                onClick={() => typeof nextRound === 'function' && nextRound()}
                disabled={isGenerating || safeAiWait > 0}
                className={
                  'flex-[1.5] sm:flex-[2] py-3 px-3 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1 transition-transform ' +
                  theme.primaryBtn +
                  ' ' +
                  (isGenerating || safeAiWait > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : 'active:scale-95')
                }
              >
                {isGenerating ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Tiếp theo <Icons.ChevronRight size={20} />
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="w-full flex gap-2 sm:gap-3">
              {/* Mở khóa nút Bỏ qua khỏi Phanh AI (aiWaitTime) */}
              <button
                type="button"
                onClick={() =>
                  typeof handleSkip === 'function' && handleSkip(false)
                }
                disabled={!canSkipQuestion}
                className={
                  'flex-1 py-3 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 ' +
                  (!canSkipQuestion
                    ? 'opacity-50 cursor-not-allowed'
                    : 'active:scale-95')
                }
              >
                Bỏ qua
              </button>

              {/* Mở khóa Kiểm tra khỏi Phanh AI & chống Double-Submit (S1) */}
              <button
                type="button"
                onClick={() =>
                  canCheckAnswer &&
                  typeof checkAnswer === 'function' &&
                  checkAnswer()
                }
                disabled={!canCheckAnswer}
                className={
                  'flex-[1.5] sm:flex-[2] py-3 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg transition-all ' +
                  theme.primaryBtn +
                  ' ' +
                  (!canCheckAnswer
                    ? 'opacity-50 cursor-not-allowed'
                    : 'active:scale-95')
                }
              >
                Kiểm tra
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Giải thích Ngữ pháp (Chuẩn A11y) */}
      {showExplainModal && safeGameState.origin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scramble-explain-title"
          className="absolute inset-0 z-[60] bg-white flex flex-col animate-in slide-in-from-bottom-10 duration-300"
        >
          <div className="bg-blue-600 p-4 flex justify-between items-center text-white shadow-md shrink-0">
            <h3
              id="scramble-explain-title"
              className="font-bold flex items-center gap-2 text-lg"
            >
              <Icons.BookOpen size={24} />{' '}
              {typeof t === 'function' ? t('explainTitle') : 'Phân tích Ngữ pháp'}
            </h3>
            <button
              type="button"
              onClick={() =>
                typeof setShowExplainModal === 'function' &&
                setShowExplainModal(false)
              }
              aria-label="Đóng phân tích"
              className="hover:bg-blue-700 p-2 rounded-full transition-colors"
            >
              <Icons.X size={24} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100 mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
              <label className="text-xs font-bold text-blue-500 uppercase tracking-wider block mb-2">
                {typeof t === 'function' ? t('sentence') : 'Câu văn'}
              </label>
              <p
                className="text-xl sm:text-2xl font-medium text-gray-800 leading-relaxed"
                style={{ fontFamily }}
              >
                {safeGameState.origin.term}
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-gray-400" />
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                {typeof t === 'function' ? t('meaning') : 'Ý nghĩa'}
              </label>
              <p className="text-lg text-gray-600 italic">
                {safeGameState.origin.definition}
              </p>
            </div>

            {isAiExplaining ? (
              <div className="flex flex-col items-center justify-center py-10 bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                <span className="text-sm text-blue-600 font-bold animate-pulse">
                  AI đang phân tích ngữ pháp...
                </span>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 prose prose-sm max-w-none">
                <h4 className="font-bold text-gray-700 mb-4 flex items-center gap-2 text-lg border-b pb-2">
                  <Icons.Sparkles size={20} className="text-purple-500" /> Phân
                  tích chi tiết:
                </h4>
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm sm:text-base">
                  {aiExplanation ? (
                    String(aiExplanation)
                      .split('\n')
                      .map((line, i) => (
                        <p key={i} className="mb-2">
                          {line}
                        </p>
                      ))
                  ) : (
                    <span className="text-gray-400 italic">
                      Chưa có dữ liệu phân tích.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] shrink-0">
            <button
              type="button"
              onClick={() =>
                typeof onPlay === 'function' &&
                onPlay(safeGameState.origin.term)
              }
              className="flex-1 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors shadow-sm active:scale-95"
            >
              <Icons.Volume2 size={20} />{' '}
              {typeof t === 'function' ? t('listenAgain') : 'Nghe lại'}
            </button>
            <button
              type="button"
              onClick={() =>
                typeof setShowExplainModal === 'function' &&
                setShowExplainModal(false)
              }
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
