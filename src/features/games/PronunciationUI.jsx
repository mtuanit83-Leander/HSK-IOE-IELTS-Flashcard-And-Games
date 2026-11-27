// ============================================================================
// FILE 66/85: src/features/games/PronunciationUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.19 - Pronunciation Setup & PlayScreen UI)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 21:13 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (PronunciationSetup) và Màn hình chơi chính
//           (PronunciationPlayScreen) của trò chơi Vua Ngữ Âm (Pronunciation).
//           Nâng cấp Ver 1.0 (Lượt 4.3 — Diệt 1M Radar & 0 Problems tsc):
//           1. Diệt 1M Radar (R05): Lưu/đọc fc_pronunciation_config an toàn
//              qua Utils.safeJsonParse & Utils.safeLocalStorageSet có whitelist.
//           2. Diệt C16: Render chuẩn gạch chân âm vị (*...* / <u>...</u>),
//              tự động strip dấu đánh dấu trước khi đọc TTS / lưu Sổ tay và
//              hiển thị phiên âm IPA/Pinyin của từng từ sau khi chốt kết quả.
//           3. Diệt C17, C18, S9, S10 & F7: Khóa nút Bookmark khi chưa trả lời
//              (chống lộ đáp án); tách nút loa thành <button> anh em đúng chuẩn
//              HTML5; vá lỗi "LEVEL LEVEL"; kẹp biên thanh timer 0..100% & hiện
//              timeLeft/aiWaitTime trên Mobile; giải thích dự phòng theo ngôn
//              ngữ (EN/ZH); mở khóa nút Bỏ qua khỏi Phanh AI; bảng màu tĩnh
//              chống Tailwind purge; Footer Flex & Modal A11y (Backdrop 2 nhịp
//              + Escape bảo vệ bộ gõ IME).
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString } from './common/gameHelpers';

// ============================================================================
// CẤU HÌNH TĨNH & HÀM TIỆN ÍCH (CHỐNG TAILWIND PURGE & CHUẨN HÓA NGỮ ÂM)
// ============================================================================

const ALLOWED_TIME_LIMITS = [10, 15, 20, 30];

/**
 * Bảng màu tĩnh 100% chống Tailwind JIT purge ở bản build Production
 * @type {Record<string, Record<string, string>>}
 */
const PRONUNCIATION_COLOR_THEMES = {
  indigo: {
    activeCard: 'border-indigo-500 bg-indigo-50 shadow-sm',
    activeIcon: 'text-indigo-600',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700',
    timerBar: 'bg-indigo-500',
    finishBadge: 'bg-indigo-100 text-indigo-500',
    scoreText: 'text-indigo-600',
    headerPill: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    selectedOption: 'bg-indigo-50 border-indigo-500'
  },
  sky: {
    activeCard: 'border-sky-500 bg-sky-50 shadow-sm',
    activeIcon: 'text-sky-600',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700',
    timerBar: 'bg-sky-500',
    finishBadge: 'bg-sky-100 text-sky-500',
    scoreText: 'text-sky-600',
    headerPill: 'bg-sky-50 text-sky-600 border-sky-200',
    selectedOption: 'bg-sky-50 border-sky-500'
  },
  blue: {
    activeCard: 'border-blue-500 bg-blue-50 shadow-sm',
    activeIcon: 'text-blue-600',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700',
    timerBar: 'bg-blue-500',
    finishBadge: 'bg-blue-100 text-blue-500',
    scoreText: 'text-blue-600',
    headerPill: 'bg-blue-50 text-blue-600 border-blue-200',
    selectedOption: 'bg-blue-50 border-blue-500'
  },
  red: {
    activeCard: 'border-red-500 bg-red-50 shadow-sm',
    activeIcon: 'text-red-600',
    primaryBtn: 'bg-red-600 hover:bg-red-700',
    timerBar: 'bg-red-500',
    finishBadge: 'bg-red-100 text-red-500',
    scoreText: 'text-red-600',
    headerPill: 'bg-red-50 text-red-600 border-red-200',
    selectedOption: 'bg-red-50 border-red-500'
  },
  pink: {
    activeCard: 'border-pink-500 bg-pink-50 shadow-sm',
    activeIcon: 'text-pink-600',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700',
    timerBar: 'bg-pink-500',
    finishBadge: 'bg-pink-100 text-pink-500',
    scoreText: 'text-pink-600',
    headerPill: 'bg-pink-50 text-pink-600 border-pink-200',
    selectedOption: 'bg-pink-50 border-pink-500'
  },
  emerald: {
    activeCard: 'border-emerald-500 bg-emerald-50 shadow-sm',
    activeIcon: 'text-emerald-600',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    timerBar: 'bg-emerald-500',
    finishBadge: 'bg-emerald-100 text-emerald-500',
    scoreText: 'text-emerald-600',
    headerPill: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    selectedOption: 'bg-emerald-50 border-emerald-500'
  },
  green: {
    activeCard: 'border-green-500 bg-green-50 shadow-sm',
    activeIcon: 'text-green-600',
    primaryBtn: 'bg-green-600 hover:bg-green-700',
    timerBar: 'bg-green-500',
    finishBadge: 'bg-green-100 text-green-500',
    scoreText: 'text-green-600',
    headerPill: 'bg-green-50 text-green-600 border-green-200',
    selectedOption: 'bg-green-50 border-green-500'
  },
  orange: {
    activeCard: 'border-orange-500 bg-orange-50 shadow-sm',
    activeIcon: 'text-orange-600',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700',
    timerBar: 'bg-orange-500',
    finishBadge: 'bg-orange-100 text-orange-500',
    scoreText: 'text-orange-600',
    headerPill: 'bg-orange-50 text-orange-600 border-orange-200',
    selectedOption: 'bg-orange-50 border-orange-500'
  },
  purple: {
    activeCard: 'border-purple-500 bg-purple-50 shadow-sm',
    activeIcon: 'text-purple-600',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700',
    timerBar: 'bg-purple-500',
    finishBadge: 'bg-purple-100 text-purple-500',
    scoreText: 'text-purple-600',
    headerPill: 'bg-purple-50 text-purple-600 border-purple-200',
    selectedOption: 'bg-purple-50 border-purple-500'
  },
  cyan: {
    activeCard: 'border-cyan-500 bg-cyan-50 shadow-sm',
    activeIcon: 'text-cyan-600',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700',
    timerBar: 'bg-cyan-500',
    finishBadge: 'bg-cyan-100 text-cyan-500',
    scoreText: 'text-cyan-600',
    headerPill: 'bg-cyan-50 text-cyan-600 border-cyan-200',
    selectedOption: 'bg-cyan-50 border-cyan-500'
  },
  slate: {
    activeCard: 'border-slate-500 bg-slate-50 shadow-sm',
    activeIcon: 'text-slate-600',
    primaryBtn: 'bg-slate-700 hover:bg-slate-800',
    timerBar: 'bg-slate-500',
    finishBadge: 'bg-slate-100 text-slate-600',
    scoreText: 'text-slate-700',
    headerPill: 'bg-slate-100 text-slate-700 border-slate-300',
    selectedOption: 'bg-slate-100 border-slate-500'
  }
};

/**
 * Lấy bảng màu tĩnh an toàn theo mainColor
 * @param {string} mainColor
 * @returns {Record<string, string>}
 */
const getColorTheme = (mainColor) => {
  const key = typeof mainColor === 'string' ? mainColor.toLowerCase() : 'indigo';
  return PRONUNCIATION_COLOR_THEMES[key] || PRONUNCIATION_COLOR_THEMES.indigo;
};

/**
 * Trích xuất nhãn cấp độ sạch chống lặp "LEVEL LEVEL" (Diệt C18)
 * @param {any} levelInput
 * @returns {string}
 */
const extractLevelBadge = (levelInput) => {
  const safeStr = getSafeLevelString(levelInput, '');
  if (!safeStr) return 'LEVEL 4';
  const match = String(safeStr).match(/(\d+)/);
  if (match && match[1]) {
    return 'LEVEL ' + match[1];
  }
  const cleaned = String(safeStr)
    .replace(/^(en|zh)_/i, '')
    .replace(/level_/gi, '')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
  return cleaned ? 'LEVEL ' + cleaned : 'LEVEL 4';
};

/**
 * Bóc sạch dấu đánh dấu gạch chân âm vị (*...*, <u>...</u>, \u0332) trước TTS & Bookmark (Diệt C16)
 * @param {any} rawText
 * @returns {string}
 */
export const stripPronunciationMarkers = (rawText) => {
  if (typeof rawText !== 'string') return '';
  return rawText
    .replace(/<\/?(?:u|b|strong|em|mark)\b[^>]*>/gi, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\u0332/g, '')
    .replace(/\*/g, '')
    .trim();
};

/**
 * Render từ vựng có phần gạch chân âm vị chuẩn React JSX (hỗ trợ cả *...* lẫn <u>...</u> — Diệt C16)
 * @param {any} rawText
 * @returns {React.ReactNode}
 */
const renderMarkedPronunciationWord = (rawText) => {
  const text = typeof rawText === 'string' ? rawText : String(rawText || '');
  if (!text) return '';

  const tokenRegex = /(<u>[\s\S]*?<\/u>|\*[^*]+\*|__[^_]+__)/gi;
  const parts = text.split(tokenRegex);

  if (parts.length <= 1) {
    return stripPronunciationMarkers(text);
  }

  return parts.map((segment, segIdx) => {
    if (!segment) return null;

    const uMatch = segment.match(/^<u>([\s\S]*?)<\/u>$/i);
    if (uMatch) {
      return (
        <span
          key={segIdx}
          className="underline decoration-2 decoration-red-500 underline-offset-4 text-red-600"
        >
          {stripPronunciationMarkers(uMatch[1])}
        </span>
      );
    }

    const starMatch = segment.match(/^\*([^*]+)\*$/);
    if (starMatch) {
      return (
        <span
          key={segIdx}
          className="underline decoration-2 decoration-red-500 underline-offset-4 text-red-600"
        >
          {stripPronunciationMarkers(starMatch[1])}
        </span>
      );
    }

    const doubleUnderMatch = segment.match(/^__([^_]+)__$/);
    if (doubleUnderMatch) {
      return (
        <span
          key={segIdx}
          className="underline decoration-2 decoration-red-500 underline-offset-4 text-red-600"
        >
          {stripPronunciationMarkers(doubleUnderMatch[1])}
        </span>
      );
    }

    return (
      <React.Fragment key={segIdx}>
        {stripPronunciationMarkers(segment)}
      </React.Fragment>
    );
  });
};

/**
 * Đọc cấu hình PronunciationSetup an toàn có kiểm duyệt whitelist (Diệt R05)
 * @returns {{ sourceMode: 'ai_pure' | 'card', timerMode: boolean, timeLimit: number }}
 */
const loadSavedPronunciationConfig = () => {
  const parsed =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_pronunciation_config', {})
      : {};
  const raw = parsed && typeof parsed === 'object' ? parsed : {};
  const safeSource = raw.sourceMode === 'card' ? 'card' : 'ai_pure';
  const safeTimer = Boolean(raw.timerMode);
  const parsedLimit = Number(raw.timeLimit);
  const safeLimit = ALLOWED_TIME_LIMITS.includes(parsedLimit)
    ? parsedLimit
    : 20;

  return {
    sourceMode: safeSource,
    timerMode: safeTimer,
    timeLimit: safeLimit
  };
};

// ============================================================================
// 1. MÀN HÌNH CẤU HÌNH (PronunciationSetup)
// ============================================================================
/**
 * @param {{
 *   mainColor?: string,
 *   onStart?: (config: { sourceMode: string, aiMode: boolean, timerMode: boolean, timeLimit: number }) => void,
 *   onBack?: () => void
 * }} props
 */
export const PronunciationSetup = ({
  mainColor = 'indigo',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getColorTheme(mainColor);
  const [initialConfig] = useState(() => loadSavedPronunciationConfig());

  const [sourceMode, setSourceMode] = useState(() => initialConfig.sourceMode);
  const [timerMode, setTimerMode] = useState(() => initialConfig.timerMode);
  const [timeLimit, setTimeLimit] = useState(() => initialConfig.timeLimit);

  const handleStart = () => {
    // Ngữ âm mặc định sử dụng AI để phân tích IPA / Pinyin chính xác
    const nextConfig = {
      sourceMode: sourceMode === 'card' ? 'card' : 'ai_pure',
      aiMode: true,
      timerMode: Boolean(timerMode),
      timeLimit: ALLOWED_TIME_LIMITS.includes(Number(timeLimit))
        ? Number(timeLimit)
        : 20
    };
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_pronunciation_config', nextConfig);
    }
    if (typeof onStart === 'function') {
      onStart(nextConfig);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-6 shrink-0 mt-2">
          <button
            type="button"
            onClick={() => typeof onBack === 'function' && onBack()}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Quay lại sảnh trò chơi"
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
                aria-pressed={sourceMode === 'ai_pure'}
                onClick={() => setSourceMode('ai_pure')}
                className={
                  'p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all hover:scale-105 ' +
                  (sourceMode === 'ai_pure'
                    ? theme.activeCard
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
                }
              >
                <Icons.Sparkles
                  size={28}
                  className={
                    sourceMode === 'ai_pure'
                      ? theme.activeIcon
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
                aria-pressed={sourceMode === 'card'}
                onClick={() => setSourceMode('card')}
                className={
                  'p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all hover:scale-105 ' +
                  (sourceMode === 'card'
                    ? 'border-gray-800 bg-gray-50 shadow-sm'
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
                }
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
              * Dạng bài Ngữ Âm hoạt động tối ưu khi đã cấu hình API Key.
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
                  {ALLOWED_TIME_LIMITS.map((sec) => (
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
              'w-full py-4 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg ' +
              theme.primaryBtn
            }
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
/**
 * @param {{
 *   t?: Record<string, any>,
 *   mainColor?: string,
 *   lang?: string,
 *   config?: Record<string, any>,
 *   currentQuestion?: Record<string, any> | null,
 *   checkStatus?: string,
 *   selectedIndex?: number | null,
 *   attempts?: number,
 *   score?: number,
 *   combo?: number,
 *   playedCount?: number,
 *   time?: number,
 *   timeLeft?: number,
 *   isFinished?: boolean,
 *   isGenerating?: boolean,
 *   aiCountdown?: number,
 *   queueLength?: number,
 *   correctCount?: number,
 *   wrongCount?: number,
 *   resultTimer?: number,
 *   isResultPaused?: boolean,
 *   handleOptionClick?: (idx: number) => void,
 *   handleSkip?: () => void,
 *   nextRound?: () => void,
 *   handleNext?: () => void,
 *   handleSaveAndBack?: () => void,
 *   onBack?: () => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   isBookmarked?: boolean,
 *   toggleResultPause?: () => void,
 *   onEndGame?: (stats: { correct: number, score?: number, time: number, wrong: number }) => void,
 *   onPlay?: (text: string) => void,
 *   aiWaitTime?: number,
 *   settings?: Record<string, any>
 * }} props
 */
export const PronunciationPlayScreen = ({
  mainColor = 'indigo',
  lang = 'en',
  config = undefined,
  currentQuestion = null,
  checkStatus = 'idle',
  selectedIndex = null,
  attempts = 0,
  score = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  timeLeft = 20,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  queueLength = 0,
  correctCount = 0,
  wrongCount = 0,
  resultTimer = 0,
  isResultPaused = false,
  handleOptionClick = undefined,
  handleSkip = undefined,
  nextRound = undefined,
  handleNext = undefined,
  handleSaveAndBack = undefined,
  onBack = undefined,
  onSaveToNotebook = undefined,
  isBookmarked = false,
  toggleResultPause = undefined,
  onEndGame = undefined,
  onPlay = undefined,
  aiWaitTime = 0,
  settings = undefined
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const backdropMouseDownRef = useRef(false);

  const theme = getColorTheme(mainColor);
  const activeLang =
    config?.lang === 'zh' || lang === 'zh' ? 'zh' : 'en';
  const safeLevelBadge = extractLevelBadge(config?.level);
  const safeLevelLoadingStr = safeLevelBadge.replace(/^LEVEL\s+/i, '');
  const safeTimeLimit = Math.max(1, Number(config?.timeLimit) || 20);
  const safeTimeLeft = Math.max(0, Number(timeLeft) || 0);
  const timerPercent = Math.min(
    100,
    Math.max(0, (safeTimeLeft / safeTimeLimit) * 100)
  );

  const onBackAction = onBack || handleSaveAndBack;
  const onNextAction = nextRound || handleNext;
  const isFinishedState =
    checkStatus === 'correct' || checkStatus === 'failed';

  // Đóng Modal xác nhận thoát bằng phím Escape (bảo vệ bộ gõ IME)
  useEffect(() => {
    if (!showConfirmEnd || typeof window === 'undefined') return undefined;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault();
        setShowConfirmEnd(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmEnd]);

  const handleFinishWithStats = () => {
    if (typeof onEndGame === 'function') {
      onEndGame({
        correct: Number(correctCount) || 0,
        score: Number(score) || 0,
        time: Number(time) || 0,
        wrong: Number(wrongCount) || 0
      });
    }
  };

  /** @param {React.MouseEvent<HTMLButtonElement>} e */
  const handleBookmark = (e) => {
    e.stopPropagation();
    // Khóa Bookmark trước khi trả lời xong để chống lộ đáp án (Diệt C17)
    if (!isFinishedState || typeof onSaveToNotebook !== 'function' || !currentQuestion) {
      return;
    }
    const optionsList = Array.isArray(currentQuestion.options)
      ? currentQuestion.options
      : [];
    const correctOpt = optionsList.find(
      (o) =>
        o &&
        (o.isCorrect === true ||
          String(o.isCorrect).toLowerCase() === 'true')
    );
    const cleanWord = stripPronunciationMarkers(
      correctOpt?.text || currentQuestion.term || ''
    );
    if (!cleanWord) return;

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
        onComplete={() => {}}
        onCancel={() => typeof onBackAction === 'function' && onBackAction()}
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
        levelStr={config?.sourceMode === 'ai_pure' ? safeLevelLoadingStr : ''}
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
          onClick={handleFinishWithStats}
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
          className={
            'w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner ' +
            theme.finishBadge
          }
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
            <div className={'text-xl font-bold ' + theme.scoreText}>
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
          onClick={handleFinishWithStats}
          className={
            'w-full max-w-xs py-4 rounded-xl text-white font-bold text-lg shadow-lg active:scale-95 transition-all ' +
            theme.primaryBtn
          }
        >
          Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion || !Array.isArray(currentQuestion.options)) return null;

  const fallbackExplanation =
    activeLang === 'zh'
      ? 'Từ này có phiên âm (Pinyin) hoặc thanh điệu khác với các từ còn lại.'
      : 'Từ này có phiên âm quốc tế (IPA) khác với các từ còn lại.';

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      {/* Thanh Tiến Trình Thời Gian (Kẹp biên an toàn 0..100%) */}
      {config?.timerMode && !isFinishedState && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={
              'h-full transition-all duration-1000 ease-linear ' +
              (safeTimeLeft <= 5 ? 'bg-red-500' : theme.timerBar)
            }
            style={{ width: String(timerPercent) + '%' }}
          ></div>
        </div>
      )}

      {/* POPUP Xác nhận thoát (A11y + Backdrop 2 nhịp + Escape) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pronunciation-exit-title"
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
          className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3
              id="pronunciation-exit-title"
              className="text-xl font-black text-gray-800 mb-2"
            >
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
                  handleFinishWithStats();
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
            onComplete={() => {}}
            onCancel={() => typeof onBackAction === 'function' && onBackAction()}
            queueLength={queueLength}
            text="Đang tải câu tiếp theo..."
            subText=""
            mainColor={mainColor}
            levelStr=""
          />
        ))}

      {/* HEADER */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={() => typeof onBackAction === 'function' && onBackAction()}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          title="Tạm dừng / Quay lại"
          aria-label="Tạm dừng hoặc quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            {safeLevelBadge}
          </div>
          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-2.5 sm:px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
            Câu {playedCount + 1}{' '}
            <Icons.InfinityIcon size={14} className="text-gray-400 ml-0.5" />
          </div>
          <div className="flex items-center gap-2 bg-white border px-2.5 sm:px-3 py-1 rounded-full shadow-sm">
            <span className="text-xs sm:text-sm font-bold text-green-600 flex items-center gap-1">
              <Icons.Check size={14} /> {correctCount || 0}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-xs sm:text-sm font-bold text-red-500 flex items-center gap-1">
              <Icons.X size={14} /> {wrongCount || 0}
            </span>
          </div>

          {config?.timerMode && !isFinishedState && (
            <div
              className={
                'flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded-full border ' +
                (safeTimeLeft <= 5
                  ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                  : 'bg-orange-50 text-orange-600 border-orange-200')
              }
              title="Thời gian còn lại cho câu này"
            >
              <Icons.Clock size={12} /> {safeTimeLeft}s
            </div>
          )}

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
              'text-base sm:text-lg font-mono font-bold w-12 text-right hidden md:block ' +
              theme.scoreText
            }
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
                title={'Đã nạp sẵn ' + String(queueLength) + ' câu'}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {/* Hiển thị đồng hồ Phanh AI trên cả Mobile lẫn Desktop */}
          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse flex"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          {/* Khóa Bookmark trước khi trả lời xong để chống lộ đáp án (Diệt C17) */}
          <button
            type="button"
            onClick={handleBookmark}
            disabled={!isFinishedState}
            className={
              'p-2 rounded-lg transition-colors ' +
              (!isFinishedState
                ? 'text-gray-300 opacity-50 cursor-not-allowed'
                : isBookmarked
                  ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                  : 'text-gray-400 hover:bg-gray-100')
            }
            title={
              isFinishedState
                ? 'Lưu đáp án vào Sổ tay'
                : 'Hoàn thành câu hỏi để lưu vào Sổ tay'
            }
            aria-label="Lưu vào Sổ tay"
          >
            <Icons.Bookmark
              size={20}
              fill={isFinishedState && isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      {/* KHU VỰC CHÍNH */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col items-center justify-center relative">
        {/* Câu hỏi */}
        <div className="w-full max-w-lg mb-8 text-center animate-in slide-in-from-top-4">
          <div
            className={
              'inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold uppercase tracking-widest mb-4 ' +
              theme.headerPill
            }
          >
            <Icons.Volume2 size={18} /> Phân biệt phát âm
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700">
            Chọn từ có <span className="text-red-500 font-black">phát âm</span>{' '}
            khác biệt
          </h2>
          {attempts > 0 && !isFinishedState && (
            <p className="text-sm text-orange-500 font-bold mt-2 animate-pulse">
              Chú ý: Bạn còn {Math.max(1, 2 - attempts)} lượt chọn.
            </p>
          )}
        </div>

        {/* Lưới 4 từ (2x2) — Nút chọn đáp án & Nút loa là 2 <button> anh em đúng chuẩn HTML5 (Diệt S10) */}
        <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
          {currentQuestion.options.map((opt, idx) => {
            const isSelected = selectedIndex === idx;
            const isCorrect =
              opt &&
              (opt.isCorrect === true ||
                String(opt.isCorrect).toLowerCase() === 'true');
            const rawWordText = opt?.text || '';
            const cleanWordForSpeech = stripPronunciationMarkers(rawWordText);
            const phoneticHint =
              opt?.ipa || opt?.phonetic || opt?.pronunciation || '';

            let btnClass =
              'bg-white border-2 border-gray-200 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all duration-300';

            if (isFinishedState) {
              if (isCorrect) {
                btnClass =
                  'bg-green-50 border-2 border-green-500 ring-4 ring-green-100 z-20 scale-105 shadow-xl cursor-default';
              } else if (isSelected && !isCorrect) {
                btnClass =
                  'bg-red-50 border-2 border-red-500 opacity-80 animate-[shake_0.4s_ease-in-out] cursor-default';
              } else {
                btnClass =
                  'bg-gray-100 border-2 border-gray-100 opacity-55 cursor-default';
              }
            } else if (isSelected && checkStatus === 'wrong_retry') {
              btnClass =
                'bg-red-50 border-2 border-red-400 animate-[shake_0.4s_ease-in-out]';
            } else if (isSelected) {
              btnClass =
                'border-2 scale-105 shadow-lg ' + theme.selectedOption;
            }

            return (
              <div key={idx} className="relative group">
                <button
                  type="button"
                  disabled={isFinishedState || isGenerating}
                  onClick={() =>
                    !isFinishedState &&
                    typeof handleOptionClick === 'function' &&
                    handleOptionClick(idx)
                  }
                  className={
                    'w-full h-full min-h-[110px] flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl overflow-hidden text-center ' +
                    btnClass
                  }
                >
                  <span
                    className="text-3xl sm:text-4xl font-black tracking-wide text-gray-800 pointer-events-none"
                    style={{
                      fontFamily:
                        (Utils &&
                          typeof Utils.getFontFamily === 'function' &&
                          Utils.getFontFamily(settings)) ||
                        'inherit'
                    }}
                  >
                    {renderMarkedPronunciationWord(rawWordText)}
                  </span>

                  {/* Hiển thị phiên âm IPA / Pinyin sau khi chốt kết quả (nếu có) */}
                  {isFinishedState && phoneticHint && (
                    <span className="mt-2 text-xs sm:text-sm font-mono font-semibold text-indigo-700 bg-white/80 px-2.5 py-0.5 rounded-full border border-indigo-100">
                      {phoneticHint}
                    </span>
                  )}
                </button>

                {/* Loa phát âm độc lập (Chỉ hiện khi đã chọn xong) */}
                {isFinishedState && cleanWordForSpeech && (
                  <button
                    type="button"
                    className={
                      'absolute top-2 right-2 p-2 rounded-full z-30 transition-colors ' +
                      (isCorrect
                        ? 'text-green-600 bg-green-100 hover:bg-green-200'
                        : 'text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-blue-600')
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof onPlay === 'function') {
                        onPlay(cleanWordForSpeech);
                      }
                    }}
                    title={'Nghe phát âm: ' + cleanWordForSpeech}
                    aria-label={'Nghe phát âm ' + cleanWordForSpeech}
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
            className={
              'mt-8 w-full max-w-xl rounded-2xl p-5 border-2 animate-in slide-in-from-bottom-4 shadow-lg bg-white ' +
              (checkStatus === 'correct' ? 'border-green-200' : 'border-red-200')
            }
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={
                    'w-12 h-12 rounded-full flex items-center justify-center text-white shadow-md shrink-0 ' +
                    (checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500')
                  }
                >
                  {checkStatus === 'correct' ? (
                    <Icons.Check size={28} />
                  ) : (
                    <Icons.X size={28} />
                  )}
                </div>
                <div>
                  <h3
                    className={
                      'text-xl font-black ' +
                      (checkStatus === 'correct'
                        ? 'text-green-700'
                        : 'text-red-700')
                    }
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
            <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 text-sm font-medium leading-relaxed whitespace-pre-wrap">
              {currentQuestion.definition ||
                currentQuestion.explanation ||
                fallbackExplanation}
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
          aria-label="Kết thúc trò chơi"
        >
          <Icons.X size={16} />{' '}
          <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 flex justify-end max-w-md ml-auto">
          {isFinishedState ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() =>
                  typeof toggleResultPause === 'function' &&
                  toggleResultPause()
                }
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
                onClick={() =>
                  typeof onNextAction === 'function' && onNextAction()
                }
                disabled={isGenerating || aiWaitTime > 0}
                className={
                  'flex-[2] py-3 sm:py-4 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ' +
                  (checkStatus === 'correct'
                    ? 'bg-green-500 '
                    : theme.primaryBtn + ' ') +
                  (isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : checkStatus === 'correct'
                      ? 'active:scale-95 hover:bg-green-600'
                      : 'active:scale-95')
                }
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                    Đang tải...
                  </>
                ) : aiWaitTime > 0 ? (
                  <>
                    <Icons.Clock size={18} /> Đợi ({aiWaitTime}s)
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
            /* Mở khóa nút Bỏ qua khỏi Phanh AI (chỉ khóa khi isGenerating) */
            <button
              type="button"
              onClick={() => typeof handleSkip === 'function' && handleSkip()}
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