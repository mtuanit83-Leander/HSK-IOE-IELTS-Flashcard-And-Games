// ============================================================================
// FILE 64/85: src/features/games/ImageQuizUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.17 - Image Quiz Setup & PlayScreen UI)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 23:13 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (ImageQuizSetup) và Màn hình chơi chính
//           (ImageQuizPlayScreen) cho trò chơi Đoán Hình Ảnh (Image Quiz).
//           Nâng cấp Ver 1.0 (Lượt 4.2 – Diệt 1H Radar, C5, C6, S10 & 0 tsc):
//           1. Diệt 1H Radar (R05): Thay localStorage.setItem('fc_imagequiz_config')
//              bằng Utils.safeLocalStorageSet & Utils.safeJsonParse có whitelist.
//           2. Diệt C5 (Mất ảnh vĩnh viễn): Xóa bỏ hoàn toàn DOM mutation
//              (style.display='none'), quản lý ảnh lỗi bằng React state
//              failedImgIndices tự reset theo câu hỏi + Utils.buildSmartImageUrl.
//           3. Diệt C6 (NaN:NaN tổng kết): Tiếp nhận prop time và truyền đủ
//              { correct, time, wrong } cho onEndGame ở mọi điểm thoát/kết thúc.
//           4. Diệt S10 & F9: Bổ sung nút loa phát âm onPlay, hiển thị rõ đồng
//              hồ Phanh AI (aiWaitTime) trên Mobile, mở khóa nút Bỏ qua, bảng
//              màu tĩnh IMAGE_QUIZ_THEMES (chống Tailwind purge), A11y Modal
//              (Backdrop 2 nhịp + Escape chống IME) & 0 Problems tsc/checkJs.
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

const ALLOWED_TIME_LIMITS = [10, 15, 20, 30];

/**
 * Bảng màu tĩnh đầy đủ chống Tailwind JIT purge ở bản build Production
 * @type {Record<string, Record<string, string>>}
 */
const IMAGE_QUIZ_THEMES = {
  emerald: {
    cardActive: 'border-emerald-500 bg-emerald-50 shadow-sm',
    iconActive: 'text-emerald-600',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    primaryBtnStatic: 'bg-emerald-600',
    accentBg: 'bg-emerald-100',
    accentText: 'text-emerald-600',
    accentTextDark: 'text-emerald-700',
    accentBorder: 'border-emerald-100',
    spinnerBorder: 'border-emerald-200 border-t-emerald-600',
    progressBar: 'bg-emerald-500',
    optionSelected: 'bg-emerald-50 border-4 border-emerald-500 scale-105 shadow-lg'
  },
  sky: {
    cardActive: 'border-sky-500 bg-sky-50 shadow-sm',
    iconActive: 'text-sky-600',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700',
    primaryBtnStatic: 'bg-sky-600',
    accentBg: 'bg-sky-100',
    accentText: 'text-sky-600',
    accentTextDark: 'text-sky-700',
    accentBorder: 'border-sky-100',
    spinnerBorder: 'border-sky-200 border-t-sky-600',
    progressBar: 'bg-sky-500',
    optionSelected: 'bg-sky-50 border-4 border-sky-500 scale-105 shadow-lg'
  },
  blue: {
    cardActive: 'border-blue-500 bg-blue-50 shadow-sm',
    iconActive: 'text-blue-600',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700',
    primaryBtnStatic: 'bg-blue-600',
    accentBg: 'bg-blue-100',
    accentText: 'text-blue-600',
    accentTextDark: 'text-blue-700',
    accentBorder: 'border-blue-100',
    spinnerBorder: 'border-blue-200 border-t-blue-600',
    progressBar: 'bg-blue-500',
    optionSelected: 'bg-blue-50 border-4 border-blue-500 scale-105 shadow-lg'
  },
  red: {
    cardActive: 'border-red-500 bg-red-50 shadow-sm',
    iconActive: 'text-red-600',
    primaryBtn: 'bg-red-600 hover:bg-red-700',
    primaryBtnStatic: 'bg-red-600',
    accentBg: 'bg-red-100',
    accentText: 'text-red-600',
    accentTextDark: 'text-red-700',
    accentBorder: 'border-red-100',
    spinnerBorder: 'border-red-200 border-t-red-600',
    progressBar: 'bg-red-500',
    optionSelected: 'bg-red-50 border-4 border-red-500 scale-105 shadow-lg'
  },
  indigo: {
    cardActive: 'border-indigo-500 bg-indigo-50 shadow-sm',
    iconActive: 'text-indigo-600',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700',
    primaryBtnStatic: 'bg-indigo-600',
    accentBg: 'bg-indigo-100',
    accentText: 'text-indigo-600',
    accentTextDark: 'text-indigo-700',
    accentBorder: 'border-indigo-100',
    spinnerBorder: 'border-indigo-200 border-t-indigo-600',
    progressBar: 'bg-indigo-500',
    optionSelected: 'bg-indigo-50 border-4 border-indigo-500 scale-105 shadow-lg'
  },
  purple: {
    cardActive: 'border-purple-500 bg-purple-50 shadow-sm',
    iconActive: 'text-purple-600',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700',
    primaryBtnStatic: 'bg-purple-600',
    accentBg: 'bg-purple-100',
    accentText: 'text-purple-600',
    accentTextDark: 'text-purple-700',
    accentBorder: 'border-purple-100',
    spinnerBorder: 'border-purple-200 border-t-purple-600',
    progressBar: 'bg-purple-500',
    optionSelected: 'bg-purple-50 border-4 border-purple-500 scale-105 shadow-lg'
  },
  pink: {
    cardActive: 'border-pink-500 bg-pink-50 shadow-sm',
    iconActive: 'text-pink-600',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700',
    primaryBtnStatic: 'bg-pink-600',
    accentBg: 'bg-pink-100',
    accentText: 'text-pink-600',
    accentTextDark: 'text-pink-700',
    accentBorder: 'border-pink-100',
    spinnerBorder: 'border-pink-200 border-t-pink-600',
    progressBar: 'bg-pink-500',
    optionSelected: 'bg-pink-50 border-4 border-pink-500 scale-105 shadow-lg'
  },
  orange: {
    cardActive: 'border-orange-500 bg-orange-50 shadow-sm',
    iconActive: 'text-orange-600',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700',
    primaryBtnStatic: 'bg-orange-600',
    accentBg: 'bg-orange-100',
    accentText: 'text-orange-600',
    accentTextDark: 'text-orange-700',
    accentBorder: 'border-orange-100',
    spinnerBorder: 'border-orange-200 border-t-orange-600',
    progressBar: 'bg-orange-500',
    optionSelected: 'bg-orange-50 border-4 border-orange-500 scale-105 shadow-lg'
  },
  teal: {
    cardActive: 'border-teal-500 bg-teal-50 shadow-sm',
    iconActive: 'text-teal-600',
    primaryBtn: 'bg-teal-600 hover:bg-teal-700',
    primaryBtnStatic: 'bg-teal-600',
    accentBg: 'bg-teal-100',
    accentText: 'text-teal-600',
    accentTextDark: 'text-teal-700',
    accentBorder: 'border-teal-100',
    spinnerBorder: 'border-teal-200 border-t-teal-600',
    progressBar: 'bg-teal-500',
    optionSelected: 'bg-teal-50 border-4 border-teal-500 scale-105 shadow-lg'
  },
  cyan: {
    cardActive: 'border-cyan-500 bg-cyan-50 shadow-sm',
    iconActive: 'text-cyan-600',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700',
    primaryBtnStatic: 'bg-cyan-600',
    accentBg: 'bg-cyan-100',
    accentText: 'text-cyan-600',
    accentTextDark: 'text-cyan-700',
    accentBorder: 'border-cyan-100',
    spinnerBorder: 'border-cyan-200 border-t-cyan-600',
    progressBar: 'bg-cyan-500',
    optionSelected: 'bg-cyan-50 border-4 border-cyan-500 scale-105 shadow-lg'
  }
};

/**
 * Lấy bảng màu tĩnh an toàn theo mainColor
 * @param {string} mainColor
 * @returns {Record<string, string>}
 */
const getTheme = (mainColor) => {
  const key = typeof mainColor === 'string' ? mainColor.toLowerCase() : 'emerald';
  return IMAGE_QUIZ_THEMES[key] || IMAGE_QUIZ_THEMES.emerald;
};

/**
 * Định dạng nhãn Level ngắn gọn cho màn hình tải
 * @param {string} levelStr
 * @returns {string}
 */
const formatLevelBadge = (levelStr) => {
  if (!levelStr) return '';
  return String(levelStr)
    .replace(/^(en|zh)_/i, '')
    .replace(/level_/gi, 'LEVEL ')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
};

/**
 * Giải mã URL hình ảnh sạch cho mỗi lựa chọn (ưu tiên URL hợp lệ -> buildSmartImageUrl)
 * @param {Record<string, any>} opt
 * @returns {string}
 */
const resolveOptionImageSrc = (opt) => {
  if (!opt || typeof opt !== 'object') return '';
  const rawImg = typeof opt.image === 'string' ? opt.image.trim() : '';
  if (rawImg) {
    if (Utils && typeof Utils.isValidImageUrl === 'function') {
      if (Utils.isValidImageUrl(rawImg)) return rawImg;
    } else if (/^(https?:\/\/|data:image\/)/i.test(rawImg)) {
      return rawImg;
    }
  }

  const keyword = String(
    opt.imageKeyword || opt.image_keyword || opt.text || ''
  ).trim();
  if (!keyword) return '';

  if (Utils && typeof Utils.buildSmartImageUrl === 'function') {
    const built = Utils.buildSmartImageUrl(keyword);
    if (built) return built;
  }

  return (
    'https://tse4.mm.bing.net/th?q=' +
    encodeURIComponent(keyword + ' clean illustration no text') +
    '&w=400&h=300&c=7&rs=1&p=0'
  );
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (IMAGE QUIZ SETUP)
// ============================================================================
/**
 * @param {{
 *   mainColor?: string,
 *   onStart?: (config: Record<string, any>) => void,
 *   onBack?: () => void
 * }} props
 */
export const ImageQuizSetup = ({
  mainColor = 'emerald',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getTheme(mainColor);

  const savedConfig = useMemo(() => {
    /** @type {Record<string, any> | null} */
    const raw =
      Utils && typeof Utils.safeJsonParse === 'function'
        ? Utils.safeJsonParse('fc_imagequiz_config', null)
        : null;
    if (!raw || typeof raw !== 'object') return null;

    const validSource =
      raw.sourceMode === 'card' || raw.sourceMode === 'ai_pure'
        ? raw.sourceMode
        : 'ai_pure';
    const parsedLimit = Number(raw.timeLimit);
    const validLimit = ALLOWED_TIME_LIMITS.includes(parsedLimit)
      ? parsedLimit
      : 15;

    return {
      sourceMode: validSource,
      timerMode: Boolean(raw.timerMode),
      timeLimit: validLimit
    };
  }, []);

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
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_imagequiz_config', config);
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
            onClick={() => typeof onBack === 'function' && onBack()}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Quay lại sảnh trò chơi"
            title="Quay lại"
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
                aria-pressed={sourceMode === 'ai_pure'}
                onClick={() => setSourceMode('ai_pure')}
                className={
                  'p-3 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all hover:scale-105 ' +
                  (sourceMode === 'ai_pure'
                    ? theme.cardActive
                    : 'border-gray-100 bg-white opacity-60 hover:opacity-100')
                }
              >
                <Icons.Sparkles
                  size={28}
                  className={
                    sourceMode === 'ai_pure' ? theme.iconActive : 'text-gray-400'
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
                timerMode ? timeLimit + ' giây / câu' : 'Thoải mái thời gian'
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
                        aria-pressed={timeLimit === sec}
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
          )}
        </div>

        <div className="w-full mt-4 pt-4 border-t border-gray-100 shrink-0 bg-white pb-safe">
          <button
            type="button"
            onClick={handleStart}
            className={
              'w-full py-4 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg ' +
              theme.primaryBtn
            }
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
/**
 * @param {{
 *   t?: Record<string, any>,
 *   mainColor?: string,
 *   config?: Record<string, any>,
 *   currentQuestion?: Record<string, any> | null,
 *   checkStatus?: string,
 *   selectedIndex?: number | null,
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
 *   aiWaitTime?: number,
 *   handleOptionClick?: (idx: number) => void,
 *   handleNext?: () => void,
 *   nextRound?: () => void,
 *   handleSkip?: () => void,
 *   handleSaveAndBack?: () => void,
 *   onBack?: () => void,
 *   onPlay?: (text: string) => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   isBookmarked?: boolean,
 *   toggleResultPause?: () => void,
 *   onEndGame?: (stats: { correct: number, time: number, wrong: number }) => void,
 *   settings?: Record<string, any>
 * }} props
 */
export const ImageQuizPlayScreen = ({
  mainColor = 'emerald',
  config = undefined,
  currentQuestion = null,
  checkStatus = 'idle',
  selectedIndex = null,
  score = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  timeLeft = 15,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  queueLength = 0,
  correctCount = 0,
  wrongCount = 0,
  resultTimer = 0,
  isResultPaused = false,
  aiWaitTime = 0,
  handleOptionClick = undefined,
  handleNext = undefined,
  nextRound = undefined,
  handleSkip = undefined,
  handleSaveAndBack = undefined,
  onBack = undefined,
  onPlay = undefined,
  onSaveToNotebook = undefined,
  isBookmarked = false,
  toggleResultPause = undefined,
  onEndGame = undefined,
  settings = undefined
}) => {
  const theme = getTheme(mainColor);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  /** @type {[Record<number, boolean>, React.Dispatch<React.SetStateAction<Record<number, boolean>>>]} */
  const [failedImgIndices, setFailedImgIndices] = useState({});
  const backdropMouseDownRef = useRef(false);

  const safeLevelStr = getSafeLevelString(config?.level, '');
  const onNextRound = handleNext || nextRound;
  const onBackClick = onBack || handleSaveAndBack;

  // Reset trạng thái ảnh lỗi sạch sẽ mỗi khi sang câu mới (diệt tận gốc C5 DOM mutation)
  const questionKey = useMemo(() => {
    if (!currentQuestion) return '';
    const optKey = Array.isArray(currentQuestion.options)
      ? currentQuestion.options.map((o) => String(o?.image || o?.text || '')).join('|')
      : '';
    return String(playedCount) + '::' + String(currentQuestion.term || '') + '::' + optKey;
  }, [currentQuestion, playedCount]);

  useEffect(() => {
    setFailedImgIndices({});
  }, [questionKey]);

  // Hỗ trợ đóng Modal xác nhận bằng phím Escape (bảo vệ bộ gõ IME)
  useEffect(() => {
    if (!showConfirmEnd) return undefined;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        setShowConfirmEnd(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmEnd]);

  const markImageFailed = (idx) => {
    setFailedImgIndices((prev) => {
      if (prev[idx]) return prev;
      return { ...prev, [idx]: true };
    });
  };

  const emitEndGame = () => {
    if (typeof onEndGame === 'function') {
      onEndGame({
        correct: Number(correctCount) || 0,
        time: Number(time) || 0,
        wrong: Number(wrongCount) || 0
      });
    }
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    if (typeof onSaveToNotebook !== 'function' || !currentQuestion) return;
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
        onComplete={() => {}}
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
            ? formatLevelBadge(safeLevelStr)
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
          onClick={emitEndGame}
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
          className={
            'w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner ' +
            theme.accentBg +
            ' ' +
            theme.accentText
          }
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
              Thời gian
            </div>
            <div className={'text-xl font-bold ' + theme.accentText}>
              {formatGameTime(Number(time) || 0)}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 font-semibold">
              {score || 0} điểm
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
          onClick={emitEndGame}
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

  const isFinishedState =
    checkStatus === 'correct' ||
    checkStatus === 'wrong' ||
    checkStatus === 'failed';

  const safeTimeLimit =
    Number(config?.timeLimit) > 0 ? Number(config.timeLimit) : 15;
  const safeTimeLeft = Math.max(0, Number(timeLeft) || 0);
  const progressPct = Math.max(
    0,
    Math.min(100, (safeTimeLeft / safeTimeLimit) * 100)
  );

  const fontFamily =
    Utils && typeof Utils.getFontFamily === 'function'
      ? Utils.getFontFamily(settings)
      : 'inherit';

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      {/* Thanh Tiến Trình Thời Gian */}
      {config?.timerMode && !isFinishedState && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={
              'h-full transition-all duration-1000 ease-linear ' +
              (safeTimeLeft <= 3 ? 'bg-red-500' : theme.progressBar)
            }
            style={{ width: progressPct + '%' }}
          ></div>
        </div>
      )}

      {/* POPUP Xác nhận thoát (A11y + Backdrop 2 nhịp) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="imagequiz-confirm-end-title"
          onMouseDown={(e) => {
            backdropMouseDownRef.current =
              e.button === 0 && e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (backdropMouseDownRef.current && e.target === e.currentTarget) {
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
              id="imagequiz-confirm-end-title"
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
                  emitEndGame();
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
            className={
              'px-6 py-4 bg-white/90 rounded-2xl shadow-2xl border-2 flex items-center gap-4 ' +
              theme.accentBorder
            }
          >
            <div
              className={
                'w-6 h-6 border-4 rounded-full animate-spin ' +
                theme.spinnerBorder
              }
            ></div>
            <span className={'font-bold text-base ' + theme.accentTextDark}>
              AI đang tải ảnh tiếp theo...
            </span>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative gap-2">
        <button
          type="button"
          onClick={() => typeof onBackClick === 'function' && onBackClick()}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          aria-label="Quay lại"
          title="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
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
          {config?.timerMode && !isFinishedState && (
            <div
              className={
                'text-xs font-mono font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ' +
                (safeTimeLeft <= 3
                  ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                  : 'bg-gray-50 text-gray-600 border-gray-200')
              }
            >
              <Icons.Clock size={12} /> {safeTimeLeft}s
            </div>
          )}
          <div
            className={
              'hidden sm:flex items-center gap-1 font-bold ' +
              (combo > 1 ? 'text-orange-500' : 'text-gray-400')
            }
          >
            🔥 x{combo}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Nguồn Badge */}
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
                title={'Đã nạp sẵn ' + queueLength + ' câu'}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {/* Đồng hồ Phanh AI (Luôn hiện trên cả Mobile lẫn PC) */}
          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          <button
            type="button"
            onClick={handleBookmark}
            aria-label={isBookmarked ? 'Đã lưu vào Sổ tay' : 'Lưu vào Sổ tay'}
            aria-pressed={Boolean(isBookmarked)}
            className={
              'p-2 rounded-lg transition-colors ' +
              (isBookmarked
                ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                : 'text-gray-400 hover:bg-gray-100')
            }
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
        {/* Câu hỏi (Từ vựng + Loa phát âm) */}
        <div className="w-full max-w-lg mb-6 text-center animate-in slide-in-from-top-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h2
              className="text-4xl md:text-5xl font-black text-gray-800 drop-shadow-sm break-words"
              style={{ fontFamily }}
            >
              {currentQuestion.term}
            </h2>
            {typeof onPlay === 'function' && currentQuestion.term && (
              <button
                type="button"
                onClick={() => onPlay(String(currentQuestion.term))}
                className={
                  'p-2.5 rounded-full transition-colors shrink-0 shadow-sm border border-gray-200 bg-white hover:bg-gray-50 ' +
                  theme.accentText
                }
                aria-label="Nghe phát âm"
                title="Nghe phát âm"
              >
                <Icons.Volume2 size={22} />
              </button>
            )}
          </div>
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
            const imgSrc = resolveOptionImageSrc(opt);
            const showFallback = !imgSrc || Boolean(failedImgIndices[idx]);

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
              btnClass = theme.optionSelected;
            }

            return (
              <button
                key={idx}
                type="button"
                disabled={isFinishedState || isGenerating}
                aria-label={'Lựa chọn hình ảnh ' + (idx + 1)}
                onClick={() =>
                  !isFinishedState &&
                  typeof handleOptionClick === 'function' &&
                  handleOptionClick(idx)
                }
                className={
                  'relative aspect-square sm:aspect-[4/3] rounded-2xl overflow-hidden flex flex-col items-center justify-center p-2 group focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ' +
                  btnClass
                }
              >
                {/* Image Container */}
                <div className="w-full h-full relative rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center">
                  {!showFallback ? (
                    <img
                      src={imgSrc}
                      alt={'Hình minh họa ' + (idx + 1)}
                      referrerPolicy="no-referrer"
                      loading="eager"
                      onError={() => markImageFailed(idx)}
                      className="w-full h-full object-contain p-2 mix-blend-multiply group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-100 p-2 text-center">
                      <Icons.Image size={38} className="text-gray-300" />
                      <span className="text-xs font-bold uppercase mt-2 text-gray-500 break-words line-clamp-2">
                        {opt.text || 'Hình ' + (idx + 1)}
                      </span>
                    </div>
                  )}
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
              </button>
            );
          })}
        </div>

        {/* FEEDBACK BẢNG TÓM TẮT (Chỉ hiện khi đã chọn) */}
        {isFinishedState && (
          <div
            className={
              'mt-8 w-full max-w-2xl rounded-2xl p-5 border-2 animate-in slide-in-from-bottom-4 shadow-lg ' +
              (checkStatus === 'correct'
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200')
            }
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
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
                  <p className="text-gray-600 text-sm mt-1">
                    Ý nghĩa:{' '}
                    <span className="font-bold">
                      {currentQuestion.definition || currentQuestion.term}
                    </span>
                  </p>
                </div>
              </div>
              {typeof onPlay === 'function' && currentQuestion.term && (
                <button
                  type="button"
                  onClick={() => onPlay(String(currentQuestion.term))}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 shadow-sm shrink-0"
                >
                  <Icons.Volume2 size={16} /> Nghe lại
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER CHUẨN MỰC (Flex chống đè nút trên Mobile) */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-4 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {/* Nút Kết thúc (Bên trái) */}
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2.5 py-2 hover:bg-red-50 rounded-lg shrink-0"
          aria-label="Kết thúc phiên chơi"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        {/* Khu vực điều khiển chính */}
        <div className="flex-1 flex justify-end max-w-md ml-auto">
          {isFinishedState ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() =>
                  typeof toggleResultPause === 'function' && toggleResultPause()
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
                onClick={() => typeof onNextRound === 'function' && onNextRound()}
                disabled={isGenerating || aiWaitTime > 0}
                className={
                  'flex-[2] py-3 sm:py-4 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ' +
                  (checkStatus === 'correct'
                    ? isGenerating || aiWaitTime > 0
                      ? 'bg-green-500 opacity-70 cursor-not-allowed'
                      : 'bg-green-500 hover:bg-green-600 active:scale-95'
                    : isGenerating || aiWaitTime > 0
                      ? theme.primaryBtnStatic + ' opacity-70 cursor-not-allowed'
                      : theme.primaryBtn + ' active:scale-95')
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
  window.Block5_17_ImageQuizSetup = ImageQuizSetup;
  window.ImageQuizSetup = ImageQuizSetup;
  window.Block5_17_ImageQuizPlayScreen = ImageQuizPlayScreen;
  window.ImageQuizPlayScreen = ImageQuizPlayScreen;
}

export default ImageQuizPlayScreen;