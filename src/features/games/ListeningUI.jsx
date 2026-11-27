// ============================================================================
// FILE 68/85: src/features/games/ListeningUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.21 - Listening Setup & PlayScreen UI V1.06)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 21:46 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (ListeningSetup) và Màn hình chơi chính
//           (ListeningPlayScreen) cho trò chơi Đôi Tai Vàng (Listening).
//           Nâng cấp Ver 1.0 (Lượt 4.3 - Diệt 1H Radar & 0 Problems tsc):
//           1. Diệt 1/1 HIGH Radar (R05): Thay localStorage trần của
//              fc_listening_config sang Utils.safeJsonParse +
//              Utils.safeLocalStorageSet kèm kiểm duyệt whitelist.
//           2. Diệt C25 & S13: Khóa nút Bookmark Header khi chưa chốt đáp án
//              (chống lộ đáp án/Transcript) và đồng bộ khóa lưu theo đáp án đúng.
//           3. Diệt C26: Vá lỗi "LEVEL LEVEL" qua extractLevelBadge; bổ sung
//              HUD Đúng/Sai/Time/TimeLeft, hiện Phanh AI (aiWaitTime) trên cả
//              Mobile và áp font cấu hình settings cho câu hỏi/Transcript.
//           4. Diệt C27 & S15: Mở khóa nghe lại & nút Dừng phát (stopAudio)
//              sau khi chốt kết quả + ngay trong khung Transcript; kẹp biên
//              thanh timer 0..100%; truyền đủ stats khi thoát lỗi nạp dữ liệu.
//           5. Diệt C28 & 0 Problems tsc: Bảng màu tĩnh LISTENING_COLOR_THEMES,
//              mở khóa nút Bỏ qua khỏi Phanh AI, Footer Flex chống đè nút,
//              truyền đủ disabled={false} cho MenuToggle & 8/8 prop cho
//              GlobalLoadingScreen, Modal A11y Backdrop 2 nhịp + phím Escape
//              bảo vệ bộ gõ IME.
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Utils } from '@/utils/helpers';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

// ============================================================================
// BẢNG MÀU TĨNH (CHỐNG TAILWIND JIT PURGE) & HÀM TIỆN ÍCH THUẦN
// ============================================================================

/** @type {Record<string, Record<string, string>>} */
const LISTENING_COLOR_THEMES = {
  cyan: {
    cardActive: 'border-cyan-500 bg-cyan-50 shadow-md',
    iconActive: 'bg-cyan-500 text-white',
    titleActive: 'text-cyan-700',
    checkIcon: 'text-cyan-500',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700 text-white',
    discBox: 'bg-cyan-50/70 border-cyan-100',
    discPing1: 'bg-cyan-500',
    discPing2: 'bg-cyan-400',
    discBtnActive: 'bg-cyan-400 text-white scale-110 shadow-cyan-300/50',
    discBtnReady: 'bg-cyan-600 text-white hover:bg-cyan-700',
    discBadge: 'bg-white text-cyan-800 border-cyan-200',
    progressBar: 'bg-cyan-500',
    finishBadge: 'bg-cyan-100 text-cyan-600',
    finishScore: 'text-cyan-600',
    replayBtn: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200 border-cyan-200'
  },
  sky: {
    cardActive: 'border-sky-500 bg-sky-50 shadow-md',
    iconActive: 'bg-sky-500 text-white',
    titleActive: 'text-sky-700',
    checkIcon: 'text-sky-500',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700 text-white',
    discBox: 'bg-sky-50/70 border-sky-100',
    discPing1: 'bg-sky-500',
    discPing2: 'bg-sky-400',
    discBtnActive: 'bg-sky-400 text-white scale-110 shadow-sky-300/50',
    discBtnReady: 'bg-sky-600 text-white hover:bg-sky-700',
    discBadge: 'bg-white text-sky-800 border-sky-200',
    progressBar: 'bg-sky-500',
    finishBadge: 'bg-sky-100 text-sky-600',
    finishScore: 'text-sky-600',
    replayBtn: 'bg-sky-100 text-sky-700 hover:bg-sky-200 border-sky-200'
  },
  indigo: {
    cardActive: 'border-indigo-500 bg-indigo-50 shadow-md',
    iconActive: 'bg-indigo-500 text-white',
    titleActive: 'text-indigo-700',
    checkIcon: 'text-indigo-500',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    discBox: 'bg-indigo-50/70 border-indigo-100',
    discPing1: 'bg-indigo-500',
    discPing2: 'bg-indigo-400',
    discBtnActive: 'bg-indigo-400 text-white scale-110 shadow-indigo-300/50',
    discBtnReady: 'bg-indigo-600 text-white hover:bg-indigo-700',
    discBadge: 'bg-white text-indigo-800 border-indigo-200',
    progressBar: 'bg-indigo-500',
    finishBadge: 'bg-indigo-100 text-indigo-600',
    finishScore: 'text-indigo-600',
    replayBtn: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200'
  },
  blue: {
    cardActive: 'border-blue-500 bg-blue-50 shadow-md',
    iconActive: 'bg-blue-500 text-white',
    titleActive: 'text-blue-700',
    checkIcon: 'text-blue-500',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    discBox: 'bg-blue-50/70 border-blue-100',
    discPing1: 'bg-blue-500',
    discPing2: 'bg-blue-400',
    discBtnActive: 'bg-blue-400 text-white scale-110 shadow-blue-300/50',
    discBtnReady: 'bg-blue-600 text-white hover:bg-blue-700',
    discBadge: 'bg-white text-blue-800 border-blue-200',
    progressBar: 'bg-blue-500',
    finishBadge: 'bg-blue-100 text-blue-600',
    finishScore: 'text-blue-600',
    replayBtn: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200'
  },
  red: {
    cardActive: 'border-red-500 bg-red-50 shadow-md',
    iconActive: 'bg-red-500 text-white',
    titleActive: 'text-red-700',
    checkIcon: 'text-red-500',
    primaryBtn: 'bg-red-600 hover:bg-red-700 text-white',
    discBox: 'bg-red-50/70 border-red-100',
    discPing1: 'bg-red-500',
    discPing2: 'bg-red-400',
    discBtnActive: 'bg-red-400 text-white scale-110 shadow-red-300/50',
    discBtnReady: 'bg-red-600 text-white hover:bg-red-700',
    discBadge: 'bg-white text-red-800 border-red-200',
    progressBar: 'bg-red-500',
    finishBadge: 'bg-red-100 text-red-600',
    finishScore: 'text-red-600',
    replayBtn: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200'
  },
  emerald: {
    cardActive: 'border-emerald-500 bg-emerald-50 shadow-md',
    iconActive: 'bg-emerald-500 text-white',
    titleActive: 'text-emerald-700',
    checkIcon: 'text-emerald-500',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    discBox: 'bg-emerald-50/70 border-emerald-100',
    discPing1: 'bg-emerald-500',
    discPing2: 'bg-emerald-400',
    discBtnActive: 'bg-emerald-400 text-white scale-110 shadow-emerald-300/50',
    discBtnReady: 'bg-emerald-600 text-white hover:bg-emerald-700',
    discBadge: 'bg-white text-emerald-800 border-emerald-200',
    progressBar: 'bg-emerald-500',
    finishBadge: 'bg-emerald-100 text-emerald-600',
    finishScore: 'text-emerald-600',
    replayBtn: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200'
  },
  green: {
    cardActive: 'border-green-500 bg-green-50 shadow-md',
    iconActive: 'bg-green-500 text-white',
    titleActive: 'text-green-700',
    checkIcon: 'text-green-500',
    primaryBtn: 'bg-green-600 hover:bg-green-700 text-white',
    discBox: 'bg-green-50/70 border-green-100',
    discPing1: 'bg-green-500',
    discPing2: 'bg-green-400',
    discBtnActive: 'bg-green-400 text-white scale-110 shadow-green-300/50',
    discBtnReady: 'bg-green-600 text-white hover:bg-green-700',
    discBadge: 'bg-white text-green-800 border-green-200',
    progressBar: 'bg-green-500',
    finishBadge: 'bg-green-100 text-green-600',
    finishScore: 'text-green-600',
    replayBtn: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200'
  },
  orange: {
    cardActive: 'border-orange-500 bg-orange-50 shadow-md',
    iconActive: 'bg-orange-500 text-white',
    titleActive: 'text-orange-700',
    checkIcon: 'text-orange-500',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700 text-white',
    discBox: 'bg-orange-50/70 border-orange-100',
    discPing1: 'bg-orange-500',
    discPing2: 'bg-orange-400',
    discBtnActive: 'bg-orange-400 text-white scale-110 shadow-orange-300/50',
    discBtnReady: 'bg-orange-600 text-white hover:bg-orange-700',
    discBadge: 'bg-white text-orange-800 border-orange-200',
    progressBar: 'bg-orange-500',
    finishBadge: 'bg-orange-100 text-orange-600',
    finishScore: 'text-orange-600',
    replayBtn: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200'
  },
  purple: {
    cardActive: 'border-purple-500 bg-purple-50 shadow-md',
    iconActive: 'bg-purple-500 text-white',
    titleActive: 'text-purple-700',
    checkIcon: 'text-purple-500',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700 text-white',
    discBox: 'bg-purple-50/70 border-purple-100',
    discPing1: 'bg-purple-500',
    discPing2: 'bg-purple-400',
    discBtnActive: 'bg-purple-400 text-white scale-110 shadow-purple-300/50',
    discBtnReady: 'bg-purple-600 text-white hover:bg-purple-700',
    discBadge: 'bg-white text-purple-800 border-purple-200',
    progressBar: 'bg-purple-500',
    finishBadge: 'bg-purple-100 text-purple-600',
    finishScore: 'text-purple-600',
    replayBtn: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200'
  },
  pink: {
    cardActive: 'border-pink-500 bg-pink-50 shadow-md',
    iconActive: 'bg-pink-500 text-white',
    titleActive: 'text-pink-700',
    checkIcon: 'text-pink-500',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700 text-white',
    discBox: 'bg-pink-50/70 border-pink-100',
    discPing1: 'bg-pink-500',
    discPing2: 'bg-pink-400',
    discBtnActive: 'bg-pink-400 text-white scale-110 shadow-pink-300/50',
    discBtnReady: 'bg-pink-600 text-white hover:bg-pink-700',
    discBadge: 'bg-white text-pink-800 border-pink-200',
    progressBar: 'bg-pink-500',
    finishBadge: 'bg-pink-100 text-pink-600',
    finishScore: 'text-pink-600',
    replayBtn: 'bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200'
  }
};

const VALID_LISTENING_TIME_LIMITS = [30, 45, 60, 90];
const VALID_LISTENING_MAX_PLAYS = [1, 2, 3, 5];
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Lấy bảng màu tĩnh an toàn theo mainColor.
 * @param {string} mainColor
 * @returns {Record<string, string>}
 */
const getListeningTheme = (mainColor) => {
  const key = typeof mainColor === 'string' ? mainColor.trim().toLowerCase() : '';
  return LISTENING_COLOR_THEMES[key] || LISTENING_COLOR_THEMES.cyan;
};

/**
 * Trích xuất nhãn cấp độ sạch (diệt lỗi "LEVEL LEVEL").
 * @param {string} rawLevelStr
 * @param {'en' | 'zh'} lang
 * @returns {string}
 */
const extractLevelBadge = (rawLevelStr, lang) => {
  const raw = String(rawLevelStr || '').trim();
  const numMatch = raw.match(/(\d+)/);
  if (numMatch && numMatch[1]) {
    return (lang === 'zh' ? 'HSK ' : 'LEVEL ') + numMatch[1];
  }
  return lang === 'zh' ? 'HSK 1' : 'LEVEL 4';
};

/**
 * Định dạng thời gian an toàn (MM:SS).
 * @param {number} seconds
 * @returns {string}
 */
const safeFormatTime = (seconds) => {
  if (typeof formatGameTime === 'function') {
    return formatGameTime(seconds);
  }
  const safeSec = Number.isFinite(Number(seconds))
    ? Math.max(0, Math.floor(Number(seconds)))
    : 0;
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return (
    String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0')
  );
};

/**
 * Đọc cấu hình Đôi Tai Vàng an toàn từ localStorage với whitelist.
 * @returns {{ sourceMode: string, timerMode: boolean, timeLimit: number, maxPlays: number }}
 */
const loadListeningConfig = () => {
  const raw =
    typeof Utils?.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_listening_config', {})
      : {};
  const safeObj = raw && typeof raw === 'object' ? raw : {};

  const parsedLimit = Number(safeObj.timeLimit);
  const timeLimit = VALID_LISTENING_TIME_LIMITS.includes(parsedLimit)
    ? parsedLimit
    : 45;

  const parsedMaxPlays = Number(safeObj.maxPlays);
  const maxPlays = VALID_LISTENING_MAX_PLAYS.includes(parsedMaxPlays)
    ? parsedMaxPlays
    : 3;

  return {
    sourceMode: 'ai_pure',
    timerMode: Boolean(safeObj.timerMode),
    timeLimit,
    maxPlays
  };
};

// ============================================================================
// 1. COMPONENT SETUP (Màn hình cấu hình Đôi Tai Vàng)
// ============================================================================
/**
 * Màn hình cấu hình cho trò chơi Đôi Tai Vàng.
 * @param {Record<string, any>} props
 */
export const ListeningSetup = ({
  mainColor = 'cyan',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getListeningTheme(mainColor);
  const [initialConfig] = useState(() => loadListeningConfig());

  const [sourceMode, setSourceMode] = useState(
    () => initialConfig.sourceMode || 'ai_pure'
  );
  const [timerMode, setTimerMode] = useState(() =>
    Boolean(initialConfig.timerMode)
  );
  const [timeLimit, setTimeLimit] = useState(() => initialConfig.timeLimit);
  const [maxPlays, setMaxPlays] = useState(() => initialConfig.maxPlays);

  const handleStart = () => {
    const config = {
      sourceMode: sourceMode === 'ai_pure' ? 'ai_pure' : 'ai_pure',
      aiMode: true,
      timerMode: Boolean(timerMode),
      timeLimit: VALID_LISTENING_TIME_LIMITS.includes(Number(timeLimit))
        ? Number(timeLimit)
        : 45,
      maxPlays: VALID_LISTENING_MAX_PLAYS.includes(Number(maxPlays))
        ? Number(maxPlays)
        : 3
    };
    if (typeof Utils?.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_listening_config', JSON.stringify(config));
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
            aria-label="Quay lại"
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
                className={
                  'p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ' +
                  (sourceMode === 'ai_pure'
                    ? theme.cardActive
                    : 'border-gray-100 bg-white hover:border-gray-300')
                }
              >
                <div
                  className={
                    'p-3 rounded-xl ' +
                    (sourceMode === 'ai_pure'
                      ? theme.iconActive
                      : 'bg-gray-100 text-gray-500')
                  }
                >
                  <Icons.Sparkles size={24} />
                </div>
                <div className="text-left flex-1">
                  <div
                    className={
                      'font-bold text-lg ' +
                      (sourceMode === 'ai_pure'
                        ? theme.titleActive
                        : 'text-gray-700')
                    }
                  >
                    AI Sáng Tác Kịch Bản
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Tạo đoạn hội thoại & câu hỏi nghe hiểu vô tận (tự chuyển kho
                    mẫu dự phòng khi mất mạng)
                  </div>
                </div>
                {sourceMode === 'ai_pure' && (
                  <Icons.CheckCircle size={20} className={theme.checkIcon} />
                )}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 italic text-center">
              * Khuyên dùng API Key để AI tạo kịch bản vô tận; hệ thống vẫn có
              sẵn bộ kịch bản dự phòng song ngữ EN/ZH.
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
                  Tối đa {maxPlays} lần / câu (nghe lại tự do sau khi trả lời)
                </span>
              </div>
            </div>
            <div className="flex justify-center flex-wrap gap-2 mt-4 pt-3 border-t border-purple-200/50 animate-in fade-in">
              <span className="text-xs font-bold text-gray-500 self-center mr-1 uppercase">
                Chọn:
              </span>
              {VALID_LISTENING_MAX_PLAYS.map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMaxPlays(cnt);
                  }}
                  className={
                    'px-4 py-1.5 rounded-lg text-sm font-bold transition-all ' +
                    (maxPlays === cnt
                      ? 'bg-purple-500 text-white shadow-md scale-105'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50')
                  }
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
                  {VALID_LISTENING_TIME_LIMITS.map((sec) => (
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
              'w-full py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg ' +
              theme.primaryBtn
            }
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
/**
 * Màn hình chơi chính cho trò chơi Đôi Tai Vàng.
 * @param {Record<string, any>} props
 */
export const ListeningPlayScreen = ({
  mainColor = 'cyan',
  lang = 'en',
  config = undefined,
  currentQuestion = null,
  checkStatus = 'idle',
  selectedOptionIndex = null,
  score = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  timeLeft = 45,
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
  isAudioPlaying = false,
  playCount = 0,
  handlePlayAudio = undefined,
  stopAudio = undefined,
  maxPlays = 3,
  aiWaitTime = 0,
  settings = undefined
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const backdropMouseDownRef = useRef(false);

  const theme = getListeningTheme(mainColor);
  /** @type {'en' | 'zh'} */
  const safeLang = lang === 'zh' ? 'zh' : 'en';
  const safeLevelStr = getSafeLevelString(config?.level, '');
  const levelBadgeText = extractLevelBadge(safeLevelStr, safeLang);
  const onBackAction = handleSaveAndBack || onBack;
  const onNextAction = nextRound || handleNext;
  const isFinishedState = checkStatus === 'correct' || checkStatus === 'failed';
  const safeMaxPlays = Number(maxPlays) > 0 ? Number(maxPlays) : 3;
  const safeTimeLimit =
    Number(config?.timeLimit) > 0 ? Number(config.timeLimit) : 45;
  const safeTimeLeft = Number.isFinite(Number(timeLeft))
    ? Math.max(0, Number(timeLeft))
    : safeTimeLimit;
  const timerPercent = Math.min(
    100,
    Math.max(0, (safeTimeLeft / safeTimeLimit) * 100)
  );
  const canStopAudio = typeof stopAudio === 'function';

  // Phông chữ người học từ cài đặt (đặc biệt tối ưu cho Tiếng Trung)
  const contentFontFamily =
    typeof Utils?.getFontFamily === 'function' &&
    (settings?.font || settings?.fontFamily)
      ? Utils.getFontFamily(settings?.font || settings?.fontFamily)
      : undefined;
  const contentFontStyle = contentFontFamily
    ? { fontFamily: contentFontFamily }
    : undefined;

  // Đóng Modal xác nhận thoát bằng phím Escape (bảo vệ bộ gõ IME)
  useEffect(() => {
    if (!showConfirmEnd) return;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        setShowConfirmEnd(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmEnd]);

  // Xử lý bấm nút đĩa âm thanh (nghe mới / nghe lại sau khi chốt / dừng phát)
  const handleDiscButtonClick = () => {
    if (isAudioPlaying) {
      if (canStopAudio) {
        stopAudio();
      }
      return;
    }
    if (!isFinishedState && playCount >= safeMaxPlays) return;
    if (typeof handlePlayAudio === 'function') {
      handlePlayAudio();
    }
  };

  // Khóa nút Bookmark khi chưa chốt đáp án để chống lộ đáp án & Transcript
  const handleBookmark = (e) => {
    e.stopPropagation();
    if (!isFinishedState || !onSaveToNotebook || !currentQuestion) return;

    const options = Array.isArray(currentQuestion.options)
      ? currentQuestion.options
      : [];
    const correctOpt = options.find((o) => o && o.isCorrect);
    const ansText =
      String(correctOpt?.text || '').trim() ||
      String(currentQuestion.term || '').trim();
    if (!ansText) return;

    const scriptText = String(currentQuestion.audioScript || '').trim();
    const explainText = String(currentQuestion.explanation || '').trim();
    const analysisCombined =
      'Transcript: ' +
      scriptText +
      (explainText ? '\n\nGiải thích: ' + explainText : '');

    onSaveToNotebook({
      isSmartTarget: true,
      save: ansText,
      display: String(currentQuestion.term || 'Câu hỏi nghe hiểu'),
      analysis: analysisCombined
    });
  };

  const getOptionClass = (opt, i) => {
    if (isFinishedState) {
      if (opt.isCorrect) {
        return 'bg-green-100 border-green-500 text-green-900 shadow-md transform scale-[1.01] font-bold z-10';
      }
      if (i === selectedOptionIndex && !opt.isCorrect) {
        return 'bg-red-100 border-red-500 text-red-900 font-bold opacity-85 animate-[shake_0.4s_ease-in-out]';
      }
      return 'bg-gray-50 border-gray-100 text-gray-400 opacity-65';
    }
    if (checkStatus === 'wrong_retry' && i === selectedOptionIndex) {
      return 'bg-red-50 border-red-300 text-red-400 opacity-80 cursor-not-allowed animate-[shake_0.4s_ease-in-out]';
    }
    return 'bg-white border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:shadow-md active:scale-[0.99]';
  };

  const getLabelClass = (opt, i) => {
    if (isFinishedState && opt.isCorrect) {
      return 'bg-green-200 text-green-800';
    }
    if (
      (isFinishedState || checkStatus === 'wrong_retry') &&
      i === selectedOptionIndex &&
      !opt.isCorrect
    ) {
      return 'bg-red-200 text-red-800';
    }
    return 'bg-white text-gray-500 border border-gray-200';
  };

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
        onComplete={() => {}}
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
            : 'Đang chuẩn bị âm thanh và câu hỏi nghe hiểu...'
        }
        mainColor={mainColor}
        levelStr={config?.sourceMode === 'ai_pure' ? levelBadgeText : ''}
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
          onClick={() =>
            typeof onEndGame === 'function'
              ? onEndGame({
                  correct: correctCount || 0,
                  score: score || 0,
                  time: time || 0,
                  wrong: wrongCount || 0
                })
              : typeof onBackAction === 'function' && onBackAction()
          }
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
            <div className={'text-xl font-bold ' + theme.finishScore}>
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
            typeof onEndGame === 'function' &&
            onEndGame({
              correct: correctCount || 0,
              score: score || 0,
              time: time || 0,
              wrong: wrongCount || 0
            })
          }
          className={
            'w-full max-w-xs py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-all ' +
            theme.primaryBtn
          }
        >
          Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion || !Array.isArray(currentQuestion.options)) return null;

  const isDiscDisabled = isAudioPlaying
    ? !canStopAudio
    : !isFinishedState && playCount >= safeMaxPlays;

  const isRescuedSource = Boolean(
    currentQuestion?.origin?._isRescued || currentQuestion?._isRescued
  );

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
      {config?.timerMode && !isFinishedState && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-200 z-50">
          <div
            className={
              'h-full transition-all duration-1000 ease-linear ' +
              (safeTimeLeft <= 10 ? 'bg-red-500' : theme.progressBar)
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
          aria-labelledby="listening-exit-modal-title"
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
              id="listening-exit-modal-title"
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
                  if (typeof onEndGame === 'function') {
                    onEndGame({
                      correct: correctCount || 0,
                      score: score || 0,
                      time: time || 0,
                      wrong: wrongCount || 0
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
            onComplete={() => {}}
            onCancel={onBackAction}
            queueLength={queueLength}
            text="Đang tải kịch bản tiếp theo..."
            subText="Đang nạp âm thanh & câu hỏi mới..."
            mainColor={mainColor}
            levelStr={levelBadgeText}
          />
        ))}

      {/* HEADER */}
      <div className="flex justify-between items-center gap-2 p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10">
        <button
          type="button"
          onClick={() => typeof onBackAction === 'function' && onBackAction()}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          title="Quay lại"
          aria-label="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded hidden md:block">
            {levelBadgeText}
          </div>
          <div className="text-xs sm:text-sm font-bold text-gray-600 bg-gray-100 px-2.5 sm:px-3 py-1 rounded-full flex items-center gap-1">
            Câu {playedCount + 1} <Icons.InfinityIcon size={14} />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
            <span className="text-green-600 flex items-center gap-0.5">
              <Icons.Check size={12} /> {correctCount || 0}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-red-500 flex items-center gap-0.5">
              <Icons.X size={12} /> {wrongCount || 0}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
            <Icons.Clock size={12} /> {safeFormatTime(time)}
          </div>
          {config?.timerMode && !isFinishedState && (
            <div
              className={
                'flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full border ' +
                (safeTimeLeft <= 10
                  ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                  : 'bg-orange-50 text-orange-600 border-orange-200')
              }
            >
              <Icons.Clock size={12} /> {safeTimeLeft}s
            </div>
          )}
          <div
            className={
              'hidden sm:flex items-center gap-1 text-xs font-bold ' +
              (combo > 1 ? 'text-orange-500' : 'text-gray-400')
            }
          >
            🔥 x{combo}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isRescuedSource ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden lg:flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Dự
              phòng
            </span>
          ) : currentQuestion?.isAiGenerated ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden lg:flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
              title="Câu hỏi được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> AI
            </span>
          ) : (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden lg:flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Thẻ gốc
            </span>
          )}

          {/* Băng đạn AI */}
          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden md:flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                title={'Đã nạp sẵn ' + String(queueLength) + ' câu'}
              >
                <Icons.Database size={12} className="text-blue-500" />{' '}
                {queueLength}
              </span>
            )}

          {/* Đồng hồ Phanh AI (Hiện rõ trên cả Mobile & Desktop) */}
          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn cho câu tiếp theo"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          <button
            type="button"
            onClick={handleBookmark}
            disabled={!isFinishedState}
            className={
              'p-2 rounded-lg transition-colors ' +
              (!isFinishedState
                ? 'text-gray-300 cursor-not-allowed opacity-60'
                : isBookmarked
                ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                : 'text-gray-400 hover:bg-gray-100')
            }
            title={
              isFinishedState
                ? 'Lưu đáp án & kịch bản vào Sổ tay'
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
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col items-center relative">
        {/* Đĩa Âm thanh khổng lồ */}
        <div className="w-full flex justify-center my-4 sm:my-6 animate-in slide-in-from-top-4">
          <div
            className={
              'w-full max-w-sm border-2 rounded-[2rem] p-6 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden ' +
              theme.discBox
            }
          >
            {isAudioPlaying && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                <div
                  className={
                    'w-32 h-32 rounded-full animate-ping absolute ' +
                    theme.discPing1
                  }
                ></div>
                <div
                  className={
                    'w-48 h-48 rounded-full animate-ping absolute ' +
                    theme.discPing2
                  }
                  style={{ animationDelay: '0.2s' }}
                ></div>
              </div>
            )}

            <button
              type="button"
              onClick={handleDiscButtonClick}
              disabled={isDiscDisabled}
              aria-label={
                isAudioPlaying
                  ? canStopAudio
                    ? 'Dừng phát âm thanh'
                    : 'Đang phát âm thanh'
                  : isFinishedState
                  ? 'Nghe lại đoạn băng'
                  : 'Phát âm thanh câu hỏi'
              }
              className={
                'relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ' +
                (isAudioPlaying
                  ? theme.discBtnActive + (canStopAudio ? ' cursor-pointer' : '')
                  : !isFinishedState && playCount >= safeMaxPlays
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : theme.discBtnReady + ' hover:scale-105 active:scale-95')
              }
            >
              {isAudioPlaying && canStopAudio ? (
                <Icons.Square size={36} fill="currentColor" />
              ) : (
                <Icons.Volume2
                  size={46}
                  className={isAudioPlaying ? 'animate-pulse' : ''}
                />
              )}
            </button>

            <div
              className={
                'mt-5 text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full border shadow-sm text-center ' +
                (!isFinishedState && playCount >= safeMaxPlays
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : theme.discBadge)
              }
            >
              {isAudioPlaying
                ? canStopAudio
                  ? 'Đang phát... (Bấm để dừng)'
                  : 'Đang phát âm thanh...'
                : isFinishedState
                ? 'Bấm để nghe lại tự do'
                : playCount >= safeMaxPlays
                ? 'Đã hết lượt nghe!'
                : 'Bấm để nghe (Lượt: ' +
                  String(playCount) +
                  '/' +
                  String(safeMaxPlays) +
                  ')'}
            </div>
          </div>
        </div>

        {/* Nội dung câu hỏi Text */}
        <div className="w-full max-w-2xl text-center mb-5 px-1 sm:px-4">
          <h2
            style={contentFontStyle}
            className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 leading-relaxed shadow-sm p-4 bg-white rounded-2xl border border-gray-100"
          >
            {currentQuestion.term}
          </h2>
        </div>

        {/* 4 Lựa chọn Đáp án */}
        <div className="w-full max-w-2xl flex flex-col gap-3 z-10 relative">
          {currentQuestion.options.map((opt, i) => {
            const btnClass = getOptionClass(opt, i);
            const lblClass = getLabelClass(opt, i);
            const isClickable =
              !isFinishedState &&
              checkStatus !== 'wrong_retry' &&
              !isGenerating;

            return (
              <button
                key={i}
                type="button"
                onClick={() =>
                  isClickable &&
                  typeof handleOptionClick === 'function' &&
                  handleOptionClick(i)
                }
                disabled={!isClickable}
                className={
                  'w-full p-4 border-2 rounded-xl transition-all text-left flex items-center gap-4 ' +
                  btnClass
                }
              >
                <span
                  className={
                    'w-10 h-10 rounded-xl flex items-center justify-center font-black flex-none shadow-sm transition-colors ' +
                    lblClass
                  }
                >
                  {OPTION_LABELS[i] || String(i + 1)}
                </span>
                <span
                  style={contentFontStyle}
                  className="flex-1 text-base sm:text-lg font-bold leading-snug"
                >
                  {opt.text}
                </span>
                {isFinishedState ? (
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
        {isFinishedState && (
          <div
            className={
              'mt-8 w-full max-w-2xl rounded-2xl border-2 animate-in slide-in-from-bottom-8 shadow-xl bg-white overflow-hidden ' +
              (checkStatus === 'correct'
                ? 'border-green-200'
                : 'border-red-200')
            }
          >
            <div
              className={
                'p-4 text-white flex items-center justify-between px-6 font-bold ' +
                (checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500')
              }
            >
              <div className="flex items-center gap-2 text-lg">
                {checkStatus === 'correct' ? (
                  <Icons.CheckCircle size={24} />
                ) : (
                  <Icons.X size={24} />
                )}
                {checkStatus === 'correct' ? 'CHÍNH XÁC!' : 'HẾT LƯỢT!'}
              </div>
              <button
                type="button"
                onClick={handleDiscButtonClick}
                disabled={isAudioPlaying && !canStopAudio}
                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors"
              >
                {isAudioPlaying ? (
                  <>
                    <Icons.Square size={14} fill="currentColor" />{' '}
                    {canStopAudio ? 'Dừng nghe' : 'Đang phát...'}
                  </>
                ) : (
                  <>
                    <Icons.Volume2 size={16} /> Nghe lại băng
                  </>
                )}
              </button>
            </div>

            <div className="p-5 sm:p-6 flex flex-col gap-5">
              {/* Transcript */}
              <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-left">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-purple-600 uppercase tracking-wider flex items-center gap-1">
                    <Icons.Headphones size={14} /> Kịch bản Nghe (Transcript)
                  </span>
                  <button
                    type="button"
                    onClick={handleDiscButtonClick}
                    disabled={isAudioPlaying && !canStopAudio}
                    className={
                      'text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-colors ' +
                      theme.replayBtn
                    }
                  >
                    {isAudioPlaying ? (
                      <>
                        <Icons.Square size={12} fill="currentColor" /> Dừng
                      </>
                    ) : (
                      <>
                        <Icons.Volume2 size={14} /> Nghe đối chiếu
                      </>
                    )}
                  </button>
                </div>
                <p
                  style={contentFontStyle}
                  className="text-purple-900 text-sm sm:text-base leading-relaxed font-medium whitespace-pre-wrap"
                >
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

      {/* FOOTER (Flexbox sạch chống đè nút trên Mobile) */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-4 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2.5 py-2.5 hover:bg-red-50 rounded-lg shrink-0"
          title="Kết thúc"
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
                  typeof toggleResultPause === 'function' && toggleResultPause()
                }
                className={
                  'flex-1 py-3 sm:py-3.5 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ' +
                  (isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')
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
                  'flex-[2] py-3 sm:py-3.5 font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ' +
                  (checkStatus === 'correct'
                    ? 'bg-green-500 hover:bg-green-600 text-white '
                    : theme.primaryBtn + ' ') +
                  (isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : 'active:scale-95')
                }
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                    Đang tải...
                  </>
                ) : aiWaitTime > 0 ? (
                  <>Tiếp theo ({aiWaitTime}s)</>
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
                'w-full py-3 sm:py-3.5 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ' +
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
  window.Block5_21_ListeningSetup = ListeningSetup;
  window.ListeningSetup = ListeningSetup;
  window.Block5_21_ListeningPlayScreen = ListeningPlayScreen;
  window.ListeningPlayScreen = ListeningPlayScreen;
}

export default ListeningPlayScreen;