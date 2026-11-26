// ============================================================================
// FILE 62/85: src/features/games/OddOneOutUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.12 - OddOneOut Setup & PlayScreen UI)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 23:43 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (OddOneOutSetup) và Màn hình chơi chính
//           (OddOneOutPlayScreen) của trò chơi Tìm Từ Khác Loại (Odd One Out).
//           Nâng cấp Ver 1.0 (Lượt 4.2 — Diệt 1H Radar & 0 Problems tsc):
//           1. Diệt 1H Radar (R05): Đọc/ghi fc_oddoneout_config qua
//              Utils.safeJsonParse & Utils.safeLocalStorageSet + whitelist.
//           2. Diệt C12: Khóa nút Bookmark trên Header trước khi chốt đáp án
//              (chống lộ oddWord); tách nút loa <button> độc lập khỏi nút chọn
//              từ (đạt chuẩn HTML5 & điều khiển bàn phím).
//           3. Diệt S10, S13, S15 & F12: Tách bạch hybridAiMode khỏi ai_pure;
//              so sánh oddWord chuẩn NFC; hiện badge aiWaitTime trên Mobile;
//              mở khóa nút Bỏ qua; bảng màu tĩnh ODD_COLOR_THEMES; Footer Flex
//              & Modal A11y (Backdrop 2 nhịp + Escape bảo vệ bộ gõ IME).
// ============================================================================

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Icons, SafeIcon } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

const VALID_TIME_LIMITS = [10, 15, 20, 30];

/**
 * Bảng màu tĩnh 100% chống Tailwind JIT Purge (Diệt F12)
 * @type {Record<string, Record<string, string>>}
 */
const ODD_COLOR_THEMES = {
  pink: {
    sourceActive: 'border-pink-500 bg-pink-50 shadow-sm',
    sourceIcon: 'text-pink-600',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700',
    primaryShadow: 'shadow-pink-200',
    awardBg: 'bg-pink-100 text-pink-500',
    textAccent: 'text-pink-600',
    textDark: 'text-pink-700',
    barBg: 'bg-pink-500',
    overlayBorder: 'border-pink-100',
    spinner: 'border-pink-200 border-t-pink-600',
    optionHover: 'hover:border-pink-400'
  },
  sky: {
    sourceActive: 'border-sky-500 bg-sky-50 shadow-sm',
    sourceIcon: 'text-sky-600',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700',
    primaryShadow: 'shadow-sky-200',
    awardBg: 'bg-sky-100 text-sky-500',
    textAccent: 'text-sky-600',
    textDark: 'text-sky-700',
    barBg: 'bg-sky-500',
    overlayBorder: 'border-sky-100',
    spinner: 'border-sky-200 border-t-sky-600',
    optionHover: 'hover:border-sky-400'
  },
  red: {
    sourceActive: 'border-red-500 bg-red-50 shadow-sm',
    sourceIcon: 'text-red-600',
    primaryBtn: 'bg-red-600 hover:bg-red-700',
    primaryShadow: 'shadow-red-200',
    awardBg: 'bg-red-100 text-red-500',
    textAccent: 'text-red-600',
    textDark: 'text-red-700',
    barBg: 'bg-red-500',
    overlayBorder: 'border-red-100',
    spinner: 'border-red-200 border-t-red-600',
    optionHover: 'hover:border-red-400'
  },
  indigo: {
    sourceActive: 'border-indigo-500 bg-indigo-50 shadow-sm',
    sourceIcon: 'text-indigo-600',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700',
    primaryShadow: 'shadow-indigo-200',
    awardBg: 'bg-indigo-100 text-indigo-500',
    textAccent: 'text-indigo-600',
    textDark: 'text-indigo-700',
    barBg: 'bg-indigo-500',
    overlayBorder: 'border-indigo-100',
    spinner: 'border-indigo-200 border-t-indigo-600',
    optionHover: 'hover:border-indigo-400'
  },
  emerald: {
    sourceActive: 'border-emerald-500 bg-emerald-50 shadow-sm',
    sourceIcon: 'text-emerald-600',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    primaryShadow: 'shadow-emerald-200',
    awardBg: 'bg-emerald-100 text-emerald-500',
    textAccent: 'text-emerald-600',
    textDark: 'text-emerald-700',
    barBg: 'bg-emerald-500',
    overlayBorder: 'border-emerald-100',
    spinner: 'border-emerald-200 border-t-emerald-600',
    optionHover: 'hover:border-emerald-400'
  },
  orange: {
    sourceActive: 'border-orange-500 bg-orange-50 shadow-sm',
    sourceIcon: 'text-orange-600',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700',
    primaryShadow: 'shadow-orange-200',
    awardBg: 'bg-orange-100 text-orange-500',
    textAccent: 'text-orange-600',
    textDark: 'text-orange-700',
    barBg: 'bg-orange-500',
    overlayBorder: 'border-orange-100',
    spinner: 'border-orange-200 border-t-orange-600',
    optionHover: 'hover:border-orange-400'
  },
  purple: {
    sourceActive: 'border-purple-500 bg-purple-50 shadow-sm',
    sourceIcon: 'text-purple-600',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700',
    primaryShadow: 'shadow-purple-200',
    awardBg: 'bg-purple-100 text-purple-500',
    textAccent: 'text-purple-600',
    textDark: 'text-purple-700',
    barBg: 'bg-purple-500',
    overlayBorder: 'border-purple-100',
    spinner: 'border-purple-200 border-t-purple-600',
    optionHover: 'hover:border-purple-400'
  },
  cyan: {
    sourceActive: 'border-cyan-500 bg-cyan-50 shadow-sm',
    sourceIcon: 'text-cyan-600',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700',
    primaryShadow: 'shadow-cyan-200',
    awardBg: 'bg-cyan-100 text-cyan-500',
    textAccent: 'text-cyan-600',
    textDark: 'text-cyan-700',
    barBg: 'bg-cyan-500',
    overlayBorder: 'border-cyan-100',
    spinner: 'border-cyan-200 border-t-cyan-600',
    optionHover: 'hover:border-cyan-400'
  },
  teal: {
    sourceActive: 'border-teal-500 bg-teal-50 shadow-sm',
    sourceIcon: 'text-teal-600',
    primaryBtn: 'bg-teal-600 hover:bg-teal-700',
    primaryShadow: 'shadow-teal-200',
    awardBg: 'bg-teal-100 text-teal-500',
    textAccent: 'text-teal-600',
    textDark: 'text-teal-700',
    barBg: 'bg-teal-500',
    overlayBorder: 'border-teal-100',
    spinner: 'border-teal-200 border-t-teal-600',
    optionHover: 'hover:border-teal-400'
  },
  blue: {
    sourceActive: 'border-blue-500 bg-blue-50 shadow-sm',
    sourceIcon: 'text-blue-600',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700',
    primaryShadow: 'shadow-blue-200',
    awardBg: 'bg-blue-100 text-blue-500',
    textAccent: 'text-blue-600',
    textDark: 'text-blue-700',
    barBg: 'bg-blue-500',
    overlayBorder: 'border-blue-100',
    spinner: 'border-blue-200 border-t-blue-600',
    optionHover: 'hover:border-blue-400'
  },
  slate: {
    sourceActive: 'border-slate-500 bg-slate-50 shadow-sm',
    sourceIcon: 'text-slate-600',
    primaryBtn: 'bg-slate-600 hover:bg-slate-700',
    primaryShadow: 'shadow-slate-200',
    awardBg: 'bg-slate-100 text-slate-500',
    textAccent: 'text-slate-600',
    textDark: 'text-slate-700',
    barBg: 'bg-slate-500',
    overlayBorder: 'border-slate-100',
    spinner: 'border-slate-200 border-t-slate-600',
    optionHover: 'hover:border-slate-400'
  }
};

/**
 * Chuẩn hóa chuỗi so khớp từ khác loại theo Unicode NFC (Diệt S13)
 * @param {any} raw
 * @returns {string}
 */
const normalizeOddWordKey = (raw) => {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/\u0332/g, '').trim().toLowerCase();
};

/**
 * Rút trích nhãn hiển thị Level an toàn
 * @param {string} safeLevelStr
 * @returns {string}
 */
const formatLevelBadge = (safeLevelStr) => {
  const clean = String(safeLevelStr || '');
  const match = clean.match(/(\d+)/);
  return match ? match[1] : '4';
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (ODD ONE OUT SETUP)
// ============================================================================
/**
 * @param {{
 *   mainColor?: string,
 *   onStart?: (config: Record<string, any>) => void,
 *   onBack?: () => void
 * }} props
 */
export const OddOneOutSetup = ({
  mainColor = 'pink',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = ODD_COLOR_THEMES[mainColor] || ODD_COLOR_THEMES.pink;

  const initialConfig = useMemo(() => {
    const parsed =
      Utils && typeof Utils.safeJsonParse === 'function'
        ? Utils.safeJsonParse('fc_oddoneout_config', {})
        : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  }, []);

  const [sourceMode, setSourceMode] = useState(() =>
    initialConfig.sourceMode === 'ai_pure' ? 'ai_pure' : 'card'
  );
  const [timerMode, setTimerMode] = useState(() =>
    Boolean(initialConfig.timerMode)
  );
  const [timeLimit, setTimeLimit] = useState(() => {
    const savedSec = Number(initialConfig.timeLimit);
    return VALID_TIME_LIMITS.includes(savedSec) ? savedSec : 15;
  });
  // Tách bạch hybridAiMode (dành riêng cho chế độ 'card') khỏi ai_pure (Diệt S15)
  const [hybridAiMode, setHybridAiMode] = useState(() => {
    if (typeof initialConfig.hybridAiMode === 'boolean') {
      return initialConfig.hybridAiMode;
    }
    return initialConfig.sourceMode === 'card'
      ? Boolean(initialConfig.aiMode)
      : false;
  });

  const handleStart = () => {
    const safeSec = VALID_TIME_LIMITS.includes(Number(timeLimit))
      ? Number(timeLimit)
      : 15;
    const config = {
      sourceMode,
      timerMode: Boolean(timerMode),
      timeLimit: safeSec,
      hybridAiMode: Boolean(hybridAiMode),
      aiMode: sourceMode === 'ai_pure' || Boolean(hybridAiMode)
    };
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_oddoneout_config', config);
    }
    if (typeof onStart === 'function') {
      onStart(config);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-6 shrink-0 mt-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Quay lại sảnh trò chơi"
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            Cấu hình: Từ Khác Loại
          </h2>
          <div className="w-10" />
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
                aria-pressed={sourceMode === 'card'}
                onClick={() => setSourceMode('card')}
                className={
                  'p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all hover:scale-105 ' +
                  (sourceMode === 'card'
                    ? theme.sourceActive
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
                }
              >
                <Icons.Layers
                  size={24}
                  className={
                    sourceMode === 'card' ? theme.sourceIcon : 'text-gray-400'
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
                aria-pressed={sourceMode === 'ai_pure'}
                onClick={() => setSourceMode('ai_pure')}
                className={
                  'p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all hover:scale-105 ' +
                  (sourceMode === 'ai_pure'
                    ? theme.sourceActive
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
                }
              >
                <Icons.Sparkles
                  size={24}
                  className={
                    sourceMode === 'ai_pure'
                      ? theme.sourceIcon
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

          {/* Công tắc Thử thách AI (tách bạch với ai_pure) */}
          <MenuToggle
            active={sourceMode === 'ai_pure' ? true : hybridAiMode}
            setActive={setHybridAiMode}
            icon={Icons.Sparkles}
            color="purple"
            title="Thử thách AI"
            subtitle={
              sourceMode === 'ai_pure'
                ? '(Chế độ Tự sinh đã bao gồm AI)'
                : hybridAiMode
                  ? 'AI nhào nặn nhóm từ tinh vi'
                  : 'Thuật toán phân loại nội bộ'
            }
            disabled={sourceMode === 'ai_pure'}
            extra={null}
          />

          {/* Cấu hình Thời gian */}
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

        <div className="w-full mt-4 pt-4 border-t border-gray-100 bg-white pb-safe shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className={
              'w-full py-4 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg ' +
              theme.primaryBtn
            }
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
/**
 * @param {{
 *   t?: Record<string, any>,
 *   mainColor?: string,
 *   config?: Record<string, any>,
 *   currentQuestion?: Record<string, any> | null,
 *   selectedIndex?: number | null,
 *   checkStatus?: string,
 *   attempts?: number,
 *   combo?: number,
 *   playedCount?: number,
 *   time?: number,
 *   isFinished?: boolean,
 *   isGenerating?: boolean,
 *   aiCountdown?: number,
 *   correctCount?: number,
 *   wrongCount?: number,
 *   handleOptionClick?: (idx: number) => void,
 *   handleSkip?: () => void,
 *   nextRound?: () => void,
 *   onBack?: () => void,
 *   onEndGame?: (stats: { correct: number, time: number, wrong: number }) => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   isBookmarked?: boolean,
 *   resultTimer?: number,
 *   isResultPaused?: boolean,
 *   toggleResultPause?: () => void,
 *   timeLeft?: number,
 *   settings?: Record<string, any>,
 *   onPlay?: (text: string) => void,
 *   queueLength?: number,
 *   aiWaitTime?: number
 * }} props
 */
export const OddOneOutPlayScreen = ({
  mainColor = 'pink',
  config = undefined,
  currentQuestion = null,
  selectedIndex = null,
  checkStatus = 'idle',
  attempts = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  correctCount = 0,
  wrongCount = 0,
  handleOptionClick = undefined,
  handleSkip = undefined,
  nextRound = undefined,
  onBack = undefined,
  onEndGame = undefined,
  onSaveToNotebook = undefined,
  isBookmarked = false,
  resultTimer = 0,
  isResultPaused = false,
  toggleResultPause = undefined,
  timeLeft = 15,
  settings = undefined,
  onPlay = undefined,
  queueLength = 0,
  aiWaitTime = 0
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const backdropMouseDownRef = useRef(false);

  const theme = ODD_COLOR_THEMES[mainColor] || ODD_COLOR_THEMES.pink;

  // Bảo vệ chuỗi Level an toàn khỏi mảng Multi-select
  const safeLevelStr = getSafeLevelString(config?.level, 'level_4');
  const safeTimeLimit =
    Number(config?.timeLimit) > 0 ? Number(config?.timeLimit) : 15;
  const safeTimeLeft = Math.max(0, Number(timeLeft) || 0);
  const isSettled = checkStatus === 'success' || checkStatus === 'failed';

  // Đóng Modal xác nhận bằng phím Escape (bảo vệ bộ gõ IME)
  useEffect(() => {
    if (!showConfirmEnd) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        setShowConfirmEnd(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmEnd]);

  // Chặn màn hình lúc khởi tạo câu đầu tiên
  if (isGenerating && !currentQuestion) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none" />
      );
    }
    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onComplete={undefined}
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
          className={
            'w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner ' +
            theme.awardBg
          }
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
            <div className={'text-xl font-bold ' + theme.textAccent}>
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
          onClick={() => {
            if (typeof onEndGame === 'function') {
              onEndGame({
                correct: Number(correctCount) || 0,
                time: Number(time) || 0,
                wrong: Number(wrongCount) || 0
              });
            }
          }}
          className={
            'w-full max-w-xs py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ' +
            theme.primaryBtn +
            ' ' +
            theme.primaryShadow
          }
        >
          <Icons.CheckCircle size={24} /> Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const wordsList = Array.isArray(currentQuestion.words)
    ? currentQuestion.words
    : [];
  const oddWordNorm = normalizeOddWordKey(currentQuestion.oddWord);

  // Chỉ cho phép Bookmark sau khi đã chốt đáp án để chống lộ oddWord (Diệt C12)
  const handleBookmarkClick = (e) => {
    e.stopPropagation();
    if (!isSettled) return;
    if (currentQuestion && typeof onSaveToNotebook === 'function') {
      onSaveToNotebook({
        isSmartTarget: true,
        display: wordsList.join(' • '),
        save: currentQuestion.oddWord || '',
        analysis: currentQuestion.explanation || ''
      });
    }
  };

  const progressPct = Math.max(
    0,
    Math.min(100, (safeTimeLeft / safeTimeLimit) * 100)
  );

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
      {config?.timerMode && !isSettled && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={
              'h-full transition-all duration-1000 ease-linear ' +
              (safeTimeLeft <= 5 ? 'bg-red-500' : theme.barBg)
            }
            style={{ width: String(progressPct) + '%' }}
          />
        </div>
      )}

      {/* POPUP XÁC NHẬN THOÁT GAME (Chuẩn A11y + Backdrop 2 nhịp) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="odd-confirm-end-title"
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
              id="odd-confirm-end-title"
              className="text-xl font-black text-gray-800 mb-2"
            >
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
                  if (typeof onEndGame === 'function') {
                    onEndGame({
                      correct: Number(correctCount) || 0,
                      time: Number(time) || 0,
                      wrong: Number(wrongCount) || 0
                    });
                  }
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
            className={
              'px-6 py-4 bg-white/90 rounded-2xl shadow-2xl border-2 flex items-center gap-4 ' +
              theme.overlayBorder
            }
          >
            <div
              className={
                'w-6 h-6 border-4 rounded-full animate-spin ' + theme.spinner
              }
            />
            <span className={'font-bold text-base ' + theme.textDark}>
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
          aria-label="Tạm dừng và quay lại"
          className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors hover:bg-gray-100"
          title="Tạm dừng / Quay lại"
        >
          <SafeIcon name="ChevronLeft" size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL {formatLevelBadge(safeLevelStr)}
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
            className={
              'hidden sm:flex items-center gap-1 font-bold transition-all ' +
              (combo > 1 ? 'text-orange-500 scale-110' : 'text-gray-400')
            }
          >
            🔥 x{combo}
          </div>
          <div
            className={
              'text-lg sm:text-xl font-mono font-bold w-12 text-right hidden sm:block ' +
              theme.textAccent
            }
          >
            {config?.timerMode && !isSettled ? safeTimeLeft : time}s
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
                title={'Đã nạp sẵn ' + String(queueLength) + ' vòng'}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {/* Hiển thị aiWaitTime trên cả Mobile lẫn Desktop (Diệt S10) */}
          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          {/* Khóa Bookmark cho tới khi đã trả lời xong (Diệt C12 chống lộ đáp án) */}
          <button
            type="button"
            onClick={handleBookmarkClick}
            disabled={!isSettled}
            aria-label={
              isSettled
                ? 'Lưu từ khác loại vào Sổ tay'
                : 'Hoàn thành câu để lưu vào Sổ tay'
            }
            className={
              'p-2 rounded-lg transition-colors ' +
              (!isSettled
                ? 'text-gray-300 cursor-not-allowed opacity-50'
                : isBookmarked
                  ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                  : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100')
            }
            title={
              isSettled
                ? 'Lưu vào Sổ tay'
                : 'Trả lời xong câu hỏi để lưu vào Sổ tay'
            }
          >
            <SafeIcon
              name="Bookmark"
              size={20}
              fill={isSettled && isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      {/* Body: Khu vực nội dung chính */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center gap-8 relative">
        {/* Câu hỏi Hướng dẫn */}
        {!isSettled && (
          <div className="w-full max-w-3xl text-center animate-in slide-in-from-top-4">
            <h3 className="text-xl md:text-2xl font-bold text-gray-700 leading-relaxed drop-shadow-sm">
              Chọn từ{' '}
              <span className={theme.textAccent}>không cùng nhóm</span> với các
              từ còn lại
            </h3>
            {attempts > 0 && (
              <p className="text-sm text-orange-500 font-bold mt-2 animate-pulse">
                Chú ý: Bạn còn {Math.max(0, 2 - attempts)} lượt chọn.
              </p>
            )}
          </div>
        )}

        {/* Lưới 4 từ (Grid 2x2) — Tách nút loa khỏi nút chọn từ đúng chuẩn HTML5 (Diệt C12) */}
        {!isSettled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mt-4 z-10 animate-in zoom-in">
            {wordsList.map((word, idx) => {
              const isSelected = selectedIndex === idx;
              const cardBorderClass =
                isSelected && checkStatus === 'wrong_retry'
                  ? 'bg-red-50 border-red-500 text-red-700 shadow-sm animate-[shake_0.4s_ease-in-out]'
                  : 'bg-white border-gray-200 text-gray-800 hover:shadow-md ' +
                    theme.optionHover;

              return (
                <div
                  key={idx}
                  className={
                    'relative rounded-2xl border-2 transition-all duration-200 shadow-sm overflow-hidden ' +
                    cardBorderClass
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof handleOptionClick === 'function') {
                        handleOptionClick(idx);
                      }
                    }}
                    disabled={isSettled || isGenerating}
                    className="w-full h-full p-6 md:p-8 pr-12 text-xl md:text-2xl font-bold flex items-center justify-center break-words active:scale-95 transition-transform text-center disabled:cursor-not-allowed"
                    style={{
                      fontFamily:
                        (Utils &&
                          typeof Utils.getFontFamily === 'function' &&
                          Utils.getFontFamily(settings)) ||
                        'inherit'
                    }}
                  >
                    <span className="z-10">{word}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof onPlay === 'function') onPlay(String(word));
                    }}
                    aria-label={'Nghe phát âm ' + String(word)}
                    className="absolute top-2 right-2 p-2 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-full z-20 transition-colors"
                    title="Nghe phát âm"
                  >
                    <Icons.Volume2 size={20} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* KNOWLEDGE MINING PANEL (Bảng Tóm tắt Kiến thức) */}
        {isSettled && (
          <div
            className={
              'w-full max-w-3xl mt-2 bg-white rounded-2xl shadow-lg border-2 overflow-visible animate-in slide-in-from-bottom-4 z-20 ' +
              (checkStatus === 'success'
                ? 'border-green-200'
                : 'border-red-200')
            }
          >
            <div
              className={
                'p-3 text-white flex items-center justify-between px-6 font-bold rounded-t-xl relative ' +
                (checkStatus === 'success' ? 'bg-green-500' : 'bg-red-500')
              }
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
                {wordsList.map((w, i) => {
                  const isOdd =
                    oddWordNorm !== '' &&
                    normalizeOddWordKey(w) === oddWordNorm;
                  return (
                    <span
                      key={i}
                      className={
                        'px-4 py-2 rounded-xl border-2 text-lg font-bold flex items-center gap-2 ' +
                        (isOdd
                          ? 'bg-red-100 border-red-400 text-red-700 shadow-sm scale-110 z-10'
                          : 'bg-gray-50 border-gray-200 text-gray-500')
                      }
                    >
                      {w}
                    </span>
                  );
                })}
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
                    onClick={() => {
                      if (
                        typeof onPlay === 'function' &&
                        currentQuestion.oddWord
                      ) {
                        onPlay(String(currentQuestion.oddWord));
                      }
                    }}
                    aria-label="Nghe đáp án"
                    className="p-2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 rounded-full transition-colors"
                    title="Nghe đáp án"
                  >
                    <Icons.Volume2 size={24} />
                  </button>
                </div>
              </div>

              {currentQuestion.explanation && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left">
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Icons.Sparkles size={14} /> Giải thích logic
                  </span>
                  <p className="text-blue-800 text-sm leading-relaxed font-medium">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER FLEX CHUẨN MỰC (Chống đè nút trên Mobile) */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-4 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="shrink-0 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} />{' '}
          <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 flex justify-end max-w-md ml-auto">
          {isSettled ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  if (typeof toggleResultPause === 'function') {
                    toggleResultPause();
                  }
                }}
                className={
                  'flex-1 py-3 sm:py-4 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ' +
                  (isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')
                }
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
                className={
                  'flex-[2] py-3 sm:py-4 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ' +
                  (checkStatus === 'success'
                    ? 'bg-green-500 hover:bg-green-600'
                    : theme.primaryBtn) +
                  ' ' +
                  (isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : 'active:scale-95')
                }
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />{' '}
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
              disabled={isGenerating}
              className={
                'w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ' +
                (isGenerating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95')
              }
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