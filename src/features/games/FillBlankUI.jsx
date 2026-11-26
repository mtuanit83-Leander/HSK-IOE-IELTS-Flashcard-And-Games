// ============================================================================
// FILE 58/85: src/features/games/FillBlankUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.8 - Fill Blank Game UI)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 22:36 (GMT+7)
// NHIỆM VỤ: Giao diện Cấu hình (FillBlankSetup) và Màn hình chơi chính
//           (FillBlankPlayScreen) cho Game Điền Từ (Hỗ trợ Dễ, Khó, Địa Ngục,
//           khóa chống gian lận Bookmark & hiển thị đầy đủ nghĩa/giải thích).
//           Nâng cấp Ver 1.1 (Vá dứt điểm 1/1 lỗi tsc(2339) React SyntheticEvent):
//           - Sửa !e.isComposing -> !e.nativeEvent?.isComposing trong onKeyDown
//             của <input> (React.KeyboardEvent<HTMLInputElement>).
//           - Giữ nguyên toàn bộ nâng cấp Ver 1.0 (0/0/0 Radar, BLANK_TOKEN_REGEX,
//             Hell Mode bar, hiện hint/explanation, FILL_COLOR_THEMES & A11y).
// ============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

const CONFIG_STORAGE_KEY = 'fc_fillblank_config';
const VALID_TIME_LIMITS = [15, 30, 45, 60];
const VALID_DIFFICULTIES = ['easy', 'hard', 'hell'];
const BLANK_TOKEN_REGEX = /\[_{2,}\]/g;
const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const NOOP = () => {};

/**
 * Bảng màu tĩnh bảo vệ khỏi Tailwind JIT purge ở bản build Production
 * @type {Record<string, {
 *   cardActive: string,
 *   iconActive: string,
 *   titleActive: string,
 *   checkIcon: string,
 *   primaryBtn: string,
 *   awardBg: string,
 *   accentText: string,
 *   progressBar: string,
 *   inputBorder: string,
 *   submitBtn: string
 * }>}
 */
const FILL_COLOR_THEMES = {
  blue: {
    cardActive: 'border-blue-500 bg-blue-50 shadow-md',
    iconActive: 'bg-blue-500 text-white',
    titleActive: 'text-blue-700',
    checkIcon: 'text-blue-500',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
    awardBg: 'bg-blue-100 text-blue-500',
    accentText: 'text-blue-600',
    progressBar: 'bg-blue-500',
    inputBorder: 'border-blue-200 focus:border-blue-500 bg-white text-gray-800',
    submitBtn: 'bg-blue-600 hover:bg-blue-700'
  },
  sky: {
    cardActive: 'border-sky-500 bg-sky-50 shadow-md',
    iconActive: 'bg-sky-500 text-white',
    titleActive: 'text-sky-700',
    checkIcon: 'text-sky-500',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700 shadow-sky-200',
    awardBg: 'bg-sky-100 text-sky-500',
    accentText: 'text-sky-600',
    progressBar: 'bg-sky-500',
    inputBorder: 'border-sky-200 focus:border-sky-500 bg-white text-gray-800',
    submitBtn: 'bg-sky-600 hover:bg-sky-700'
  },
  red: {
    cardActive: 'border-red-500 bg-red-50 shadow-md',
    iconActive: 'bg-red-500 text-white',
    titleActive: 'text-red-700',
    checkIcon: 'text-red-500',
    primaryBtn: 'bg-red-600 hover:bg-red-700 shadow-red-200',
    awardBg: 'bg-red-100 text-red-500',
    accentText: 'text-red-600',
    progressBar: 'bg-red-500',
    inputBorder: 'border-red-200 focus:border-red-500 bg-white text-gray-800',
    submitBtn: 'bg-red-600 hover:bg-red-700'
  },
  emerald: {
    cardActive: 'border-emerald-500 bg-emerald-50 shadow-md',
    iconActive: 'bg-emerald-500 text-white',
    titleActive: 'text-emerald-700',
    checkIcon: 'text-emerald-500',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
    awardBg: 'bg-emerald-100 text-emerald-500',
    accentText: 'text-emerald-600',
    progressBar: 'bg-emerald-500',
    inputBorder: 'border-emerald-200 focus:border-emerald-500 bg-white text-gray-800',
    submitBtn: 'bg-emerald-600 hover:bg-emerald-700'
  },
  indigo: {
    cardActive: 'border-indigo-500 bg-indigo-50 shadow-md',
    iconActive: 'bg-indigo-500 text-white',
    titleActive: 'text-indigo-700',
    checkIcon: 'text-indigo-500',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200',
    awardBg: 'bg-indigo-100 text-indigo-500',
    accentText: 'text-indigo-600',
    progressBar: 'bg-indigo-500',
    inputBorder: 'border-indigo-200 focus:border-indigo-500 bg-white text-gray-800',
    submitBtn: 'bg-indigo-600 hover:bg-indigo-700'
  },
  purple: {
    cardActive: 'border-purple-500 bg-purple-50 shadow-md',
    iconActive: 'bg-purple-500 text-white',
    titleActive: 'text-purple-700',
    checkIcon: 'text-purple-500',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700 shadow-purple-200',
    awardBg: 'bg-purple-100 text-purple-500',
    accentText: 'text-purple-600',
    progressBar: 'bg-purple-500',
    inputBorder: 'border-purple-200 focus:border-purple-500 bg-white text-gray-800',
    submitBtn: 'bg-purple-600 hover:bg-purple-700'
  },
  pink: {
    cardActive: 'border-pink-500 bg-pink-50 shadow-md',
    iconActive: 'bg-pink-500 text-white',
    titleActive: 'text-pink-700',
    checkIcon: 'text-pink-500',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700 shadow-pink-200',
    awardBg: 'bg-pink-100 text-pink-500',
    accentText: 'text-pink-600',
    progressBar: 'bg-pink-500',
    inputBorder: 'border-pink-200 focus:border-pink-500 bg-white text-gray-800',
    submitBtn: 'bg-pink-600 hover:bg-pink-700'
  },
  orange: {
    cardActive: 'border-orange-500 bg-orange-50 shadow-md',
    iconActive: 'bg-orange-500 text-white',
    titleActive: 'text-orange-700',
    checkIcon: 'text-orange-500',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700 shadow-orange-200',
    awardBg: 'bg-orange-100 text-orange-500',
    accentText: 'text-orange-600',
    progressBar: 'bg-orange-500',
    inputBorder: 'border-orange-200 focus:border-orange-500 bg-white text-gray-800',
    submitBtn: 'bg-orange-600 hover:bg-orange-700'
  },
  cyan: {
    cardActive: 'border-cyan-500 bg-cyan-50 shadow-md',
    iconActive: 'bg-cyan-500 text-white',
    titleActive: 'text-cyan-700',
    checkIcon: 'text-cyan-500',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-200',
    awardBg: 'bg-cyan-100 text-cyan-500',
    accentText: 'text-cyan-600',
    progressBar: 'bg-cyan-500',
    inputBorder: 'border-cyan-200 focus:border-cyan-500 bg-white text-gray-800',
    submitBtn: 'bg-cyan-600 hover:bg-cyan-700'
  },
  teal: {
    cardActive: 'border-teal-500 bg-teal-50 shadow-md',
    iconActive: 'bg-teal-500 text-white',
    titleActive: 'text-teal-700',
    checkIcon: 'text-teal-500',
    primaryBtn: 'bg-teal-600 hover:bg-teal-700 shadow-teal-200',
    awardBg: 'bg-teal-100 text-teal-500',
    accentText: 'text-teal-600',
    progressBar: 'bg-teal-500',
    inputBorder: 'border-teal-200 focus:border-teal-500 bg-white text-gray-800',
    submitBtn: 'bg-teal-600 hover:bg-teal-700'
  }
};

/**
 * Lấy bảng màu tĩnh an toàn theo mainColor
 * @param {string} mainColor
 */
const getTheme = (mainColor) => {
  return FILL_COLOR_THEMES[mainColor] || FILL_COLOR_THEMES.blue;
};

/**
 * Đọc cấu hình đã lưu từ LocalStorage qua Utils.safeJsonParse kèm kiểm duyệt whitelist
 * @returns {{
 *   sourceMode: 'card' | 'ai_pure',
 *   timerMode: boolean,
 *   timeLimit: number,
 *   difficulty: 'easy' | 'hard' | 'hell',
 *   aiChallenge: boolean
 * }}
 */
const getSavedFillBlankConfig = () => {
  /** @type {Record<string, any>} */
  const raw =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse(CONFIG_STORAGE_KEY, {})
      : {};
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  const parsedLimit = Number(cfg.timeLimit);
  const safeLimit = VALID_TIME_LIMITS.includes(parsedLimit) ? parsedLimit : 30;
  const safeDifficulty = VALID_DIFFICULTIES.includes(cfg.difficulty)
    ? cfg.difficulty
    : 'easy';

  return {
    sourceMode: cfg.sourceMode === 'card' ? 'card' : 'ai_pure',
    timerMode: Boolean(cfg.timerMode),
    timeLimit: safeLimit,
    difficulty: /** @type {'easy' | 'hard' | 'hell'} */ (safeDifficulty),
    aiChallenge: Boolean(cfg.aiChallenge)
  };
};

/**
 * Chuẩn hóa nhãn cấp độ hiển thị trên Header & LoadingScreen
 * @param {string | string[] | undefined} levelInput
 * @returns {string}
 */
const formatLevelBadge = (levelInput) => {
  if (Array.isArray(levelInput)) {
    const clean = levelInput.filter(Boolean);
    if (clean.length > 1) {
      return clean.length + ' CẤP ĐỘ';
    }
    if (clean.length === 1) {
      return formatLevelBadge(clean[0]);
    }
    return 'LEVEL 4';
  }
  const safeStr = getSafeLevelString(levelInput, 'level_4');
  const numMatch = safeStr.match(/\d+/);
  if (safeStr.toLowerCase().includes('zh') || safeStr.toLowerCase().includes('hsk')) {
    return 'HSK ' + (numMatch ? numMatch[0] : '1');
  }
  return 'LEVEL ' + (numMatch ? numMatch[0] : '4');
};

/**
 * Thay thế mọi mẫu đục lỗ [________] / [__________] bằng từ đích an toàn
 * @param {string} sentence
 * @param {string} replacement
 * @returns {string}
 */
const replaceBlankTokens = (sentence, replacement) => {
  const safeSentence = typeof sentence === 'string' ? sentence : '';
  const safeReplacement = typeof replacement === 'string' ? replacement : '';
  if (!safeSentence) return safeReplacement;
  if (!BLANK_TOKEN_REGEX.test(safeSentence)) {
    BLANK_TOKEN_REGEX.lastIndex = 0;
    return safeSentence;
  }
  BLANK_TOKEN_REGEX.lastIndex = 0;
  return safeSentence.replace(BLANK_TOKEN_REGEX, () => safeReplacement);
};

/**
 * Chuẩn hóa chuỗi phục vụ khử trùng các từ gợi ý
 * @param {string} value
 * @returns {string}
 */
const normalizeOptionKey = (value) => {
  return String(value || '')
    .normalize('NFC')
    .trim()
    .toLowerCase();
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (FILL BLANK SETUP)
// ============================================================================
/**
 * @param {{
 *   mainColor?: string,
 *   onStart?: (config: Record<string, any>) => void,
 *   onBack?: () => void
 * }} props
 */
export const FillBlankSetup = ({
  mainColor = 'blue',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getTheme(mainColor);
  const initialCfg = useMemo(() => getSavedFillBlankConfig(), []);

  const [mode, setMode] = useState(() =>
    initialCfg.sourceMode === 'card' ? 'cards' : 'ai'
  );
  const [timerMode, setTimerMode] = useState(() => initialCfg.timerMode);
  const [timeLimit, setTimeLimit] = useState(() => initialCfg.timeLimit);
  const [difficulty, setDifficulty] = useState(() => initialCfg.difficulty);
  const [aiChallenge, setAiChallenge] = useState(() => initialCfg.aiChallenge);

  const effectiveLimitPreview =
    difficulty === 'hell' ? Math.min(15, timeLimit) : timeLimit;

  const handleStart = () => {
    const config = {
      sourceMode: mode === 'ai' ? 'ai_pure' : 'card',
      aiMode: mode === 'ai' || (mode === 'cards' && aiChallenge),
      timerMode: Boolean(timerMode),
      timeLimit: VALID_TIME_LIMITS.includes(timeLimit) ? timeLimit : 30,
      difficulty: VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'easy',
      aiChallenge: Boolean(aiChallenge)
    };
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet(CONFIG_STORAGE_KEY, config);
    }
    if (typeof onStart === 'function') {
      onStart(config);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div className="w-full max-w-md mx-auto bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center animate-in zoom-in duration-300 h-full max-h-screen">
        <div className="w-full flex items-center justify-between mb-4 shrink-0">
          <button
            type="button"
            onClick={() => typeof onBack === 'function' && onBack()}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="Quay lại menu trò chơi"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <div className="w-10" />
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-gray-800 mb-2 text-center shrink-0">
          Luyện Điền Từ
        </h2>
        <p className="text-gray-500 text-sm mb-6 text-center px-4 shrink-0">
          Luyện tập gõ chính xác từ vựng trong ngữ cảnh câu hoàn chỉnh.
        </p>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar space-y-4 px-1 pb-4">
          <button
            type="button"
            onClick={() => setMode('ai')}
            aria-pressed={mode === 'ai'}
            className={
              'w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ' +
              (mode === 'ai'
                ? theme.cardActive
                : 'border-gray-200 hover:border-gray-300 bg-white')
            }
          >
            <div
              className={
                'p-3 rounded-xl ' +
                (mode === 'ai'
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
                  (mode === 'ai' ? theme.titleActive : 'text-gray-700')
                }
              >
                AI Sinh Câu Hỏi
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Vô hạn ngữ cảnh thông minh
              </div>
            </div>
            {mode === 'ai' && (
              <Icons.CheckCircle size={20} className={theme.checkIcon} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMode('cards')}
            aria-pressed={mode === 'cards'}
            className={
              'w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ' +
              (mode === 'cards'
                ? 'border-gray-800 bg-gray-50 shadow-md'
                : 'border-gray-200 hover:border-gray-300 bg-white')
            }
          >
            <div
              className={
                'p-3 rounded-xl ' +
                (mode === 'cards'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500')
              }
            >
              <Icons.Layers size={24} />
            </div>
            <div className="text-left flex-1">
              <div
                className={
                  'font-bold text-lg ' +
                  (mode === 'cards' ? 'text-gray-800' : 'text-gray-700')
                }
              >
                Dùng Bộ Thẻ Gốc
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Ôn tập chính xác từ đã lưu
              </div>
            </div>
            {mode === 'cards' && (
              <Icons.CheckCircle size={20} className="text-gray-800" />
            )}
          </button>

          {mode === 'cards' && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <MenuToggle
                active={aiChallenge}
                setActive={setAiChallenge}
                icon={Icons.Sparkles}
                color="indigo"
                title="Thử Thách AI Đục Lỗ"
                subtitle="AI tự chọn từ cốt lõi để đục lỗ thay vì chọn ngẫu nhiên."
                disabled={false}
                extra={null}
              />
            </div>
          )}

          {/* Chọn Độ Khó: Dễ / Khó / Địa Ngục */}
          <div className="w-full flex gap-2 pt-2" role="group" aria-label="Chọn độ khó">
            <button
              type="button"
              onClick={() => setDifficulty('easy')}
              aria-pressed={difficulty === 'easy'}
              className={
                'flex-1 py-3 px-1 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ' +
                (difficulty === 'easy'
                  ? 'border-green-500 bg-green-50 shadow-md text-green-700'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500')
              }
            >
              <Icons.CheckCircle size={20} className="mb-1" />
              <span className="font-bold text-sm">Dễ</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">Có gợi ý</span>
            </button>

            <button
              type="button"
              onClick={() => setDifficulty('hard')}
              aria-pressed={difficulty === 'hard'}
              className={
                'flex-1 py-3 px-1 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ' +
                (difficulty === 'hard'
                  ? 'border-red-500 bg-red-50 shadow-md text-red-700'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500')
              }
            >
              <Icons.AlertCircle size={20} className="mb-1" />
              <span className="font-bold text-sm">Khó</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">Khóa gợi ý</span>
            </button>

            <button
              type="button"
              onClick={() => setDifficulty('hell')}
              aria-pressed={difficulty === 'hell'}
              className={
                'flex-1 py-3 px-1 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ' +
                (difficulty === 'hell'
                  ? 'border-purple-600 bg-purple-50 shadow-md text-purple-800'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500')
              }
            >
              <Icons.Zap size={20} className="mb-1" />
              <span className="font-bold text-sm">Địa Ngục</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">Ẩn đáp án • x3</span>
            </button>
          </div>

          <MenuToggle
            active={timerMode}
            setActive={setTimerMode}
            icon={Icons.Clock}
            color="orange"
            title="Giới hạn thời gian"
            subtitle={
              timerMode
                ? difficulty === 'hell'
                  ? effectiveLimitPreview + ' giây / câu (Cưỡng chế Địa Ngục)'
                  : timeLimit + ' giây / câu'
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

        <div className="w-full pt-4 shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className={
              'w-full py-4 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-lg ' +
              theme.primaryBtn
            }
          >
            <Icons.Play size={24} fill="currentColor" /> Bắt đầu
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (FILL BLANK PLAY SCREEN)
// ============================================================================
/**
 * @param {{
 *   t?: Record<string, any>,
 *   currentQuestion?: Record<string, any> | null,
 *   inputBuffer?: string,
 *   setInputBuffer?: (val: string) => void,
 *   checkStatus?: string,
 *   attempts?: number,
 *   time?: number,
 *   score?: number,
 *   combo?: number,
 *   playedCount?: number,
 *   isFinished?: boolean,
 *   isGenerating?: boolean,
 *   aiCountdown?: number,
 *   correctCount?: number,
 *   wrongCount?: number,
 *   resultTimer?: number,
 *   isResultPaused?: boolean,
 *   toggleResultPause?: () => void,
 *   timeLeft?: number,
 *   aiAmmoCount?: number,
 *   aiWaitTime?: number,
 *   checkAnswer?: () => void,
 *   handleNext?: () => void,
 *   handleSkip?: () => void,
 *   handleSaveAndBack?: () => void,
 *   onBack?: () => void,
 *   onSaveToNotebook?: (payload: Record<string, any>) => void,
 *   isBookmarked?: boolean,
 *   settings?: Record<string, any>,
 *   onEndGame?: (stats: { correct: number, time: number, wrong: number }) => void,
 *   onPlay?: (text: string) => void,
 *   mainColor?: string,
 *   config?: Record<string, any>
 * }} props
 */
export const FillBlankPlayScreen = ({
  currentQuestion = null,
  inputBuffer = '',
  setInputBuffer = undefined,
  checkStatus = 'idle',
  attempts = 0,
  time = 0,
  combo = 1,
  playedCount = 0,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  correctCount = 0,
  wrongCount = 0,
  resultTimer = 0,
  isResultPaused = false,
  toggleResultPause = undefined,
  timeLeft = 30,
  aiAmmoCount = 0,
  aiWaitTime = 0,
  checkAnswer = undefined,
  handleNext = undefined,
  handleSkip = undefined,
  handleSaveAndBack = undefined,
  onBack = undefined,
  onSaveToNotebook = undefined,
  isBookmarked = false,
  settings = undefined,
  onEndGame = undefined,
  onPlay = undefined,
  mainColor = 'blue',
  config = undefined
}) => {
  const theme = getTheme(mainColor);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const backdropMouseDownRef = useRef(false);

  const onBackClick = onBack || handleSaveAndBack;
  const isResultState = checkStatus === 'correct' || checkStatus === 'wrong';
  const isHellMode = config?.difficulty === 'hell';
  const isHintDisabled = config?.difficulty === 'hard' || isHellMode;

  const baseLimit = Number(config?.timeLimit);
  const safeBaseLimit =
    Number.isFinite(baseLimit) && baseLimit > 0 ? baseLimit : 30;
  const effectiveTimeLimit = isHellMode
    ? Math.min(15, safeBaseLimit)
    : safeBaseLimit;
  const progressPct = Math.max(
    0,
    Math.min(100, (Math.max(0, Number(timeLeft) || 0) / effectiveTimeLimit) * 100)
  );

  // Tự động đóng gợi ý và focus ô nhập liệu khi sang câu mới
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      setShowHint(false);
      if (checkStatus === 'idle' && inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(focusTimer);
  }, [currentQuestion, checkStatus]);

  // Đóng Modal xác nhận thoát bằng phím Escape (bảo vệ bộ gõ IME)
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

  // Tổng hợp tối đa 4 từ gợi ý (khử trùng NFC + trộn ngẫu nhiên 1 lần mỗi câu hỏi)
  const displayOptions = useMemo(() => {
    if (!currentQuestion || !currentQuestion.targetWord) return [];
    /** @type {string[]} */
    const candidates = [String(currentQuestion.targetWord).trim()];

    if (Array.isArray(currentQuestion.distractors)) {
      currentQuestion.distractors.forEach((d) => {
        if (typeof d === 'string' && d.trim()) {
          candidates.push(d.trim());
        } else if (d && typeof d === 'object' && typeof d.text === 'string' && d.text.trim()) {
          candidates.push(d.text.trim());
        }
      });
    } else if (Array.isArray(currentQuestion.options)) {
      currentQuestion.options.forEach((o) => {
        if (typeof o === 'string' && o.trim()) {
          candidates.push(o.trim());
        } else if (o && typeof o === 'object' && typeof o.text === 'string' && o.text.trim()) {
          candidates.push(o.text.trim());
        }
      });
    }

    const seen = new Set();
    /** @type {string[]} */
    const uniqueOpts = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const text = candidates[i];
      const key = normalizeOptionKey(text);
      if (key && !seen.has(key)) {
        seen.add(key);
        uniqueOpts.push(text);
      }
      if (uniqueOpts.length >= 4) break;
    }

    if (uniqueOpts.length === 0) return [];
    return Utils && typeof Utils.shuffleArray === 'function'
      ? Utils.shuffleArray(uniqueOpts)
      : uniqueOpts;
  }, [currentQuestion]);

  const resolvedHint = useMemo(() => {
    if (!currentQuestion) return '';
    return String(
      currentQuestion.hint ||
        currentQuestion.origin?.definition ||
        ''
    ).trim();
  }, [currentQuestion]);

  const resolvedExplanation = useMemo(() => {
    if (!currentQuestion) return '';
    const exp = String(
      currentQuestion.explanation ||
        currentQuestion.origin?.analysis ||
        ''
    ).trim();
    if (!exp || exp === resolvedHint) return '';
    return exp;
  }, [currentQuestion, resolvedHint]);

  const completedSentence = useMemo(() => {
    if (!currentQuestion) return '';
    const target = String(currentQuestion.targetWord || '').trim();
    const display = String(currentQuestion.displaySentence || '').trim();
    if (!display) return target;
    return replaceBlankTokens(display, target);
  }, [currentQuestion]);

  const sentenceParts = useMemo(() => {
    const raw = String(currentQuestion?.displaySentence || '');
    BLANK_TOKEN_REGEX.lastIndex = 0;
    return raw.split(BLANK_TOKEN_REGEX);
  }, [currentQuestion]);

  const handleBookmark = useCallback(
    (e) => {
      e.stopPropagation();
      if (typeof onSaveToNotebook !== 'function' || !currentQuestion) return;

      const target = String(currentQuestion.targetWord || '').trim();
      const rawSentence = String(currentQuestion.displaySentence || '');
      const cleanSentence = rawSentence
        ? replaceBlankTokens(rawSentence, target)
        : target;

      const underlinedTarget = target
        ? target
            .split('')
            .map((c) => c + '\u0332')
            .join('')
        : '';

      const displayWithUnderline = rawSentence
        ? replaceBlankTokens(rawSentence, underlinedTarget)
        : target;

      onSaveToNotebook({
        isSmartTarget: true,
        display: displayWithUnderline,
        save: cleanSentence,
        analysis: resolvedExplanation || resolvedHint || ''
      });
    },
    [currentQuestion, onSaveToNotebook, resolvedExplanation, resolvedHint]
  );

  // Màn hình chờ khi đang khởi tạo câu hỏi đầu tiên
  if (isGenerating && !currentQuestion) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none" />
      );
    }

    const levelBadgeStr = formatLevelBadge(config?.level);

    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onComplete={NOOP}
        onCancel={onBackClick || NOOP}
        queueLength={aiAmmoCount}
        text={
          aiCountdown > 0
            ? 'AI đang phân tích dữ liệu...'
            : config?.sourceMode === 'ai_pure'
              ? 'AI đang tạo câu đố...'
              : 'Đang thiết lập trò chơi...'
        }
        subText={
          aiCountdown > 0 ? '(Vui lòng đợi giây lát để có câu hỏi hay)' : ''
        }
        mainColor={mainColor}
        levelStr={config?.sourceMode === 'ai_pure' ? levelBadgeStr : ''}
      />
    );
  }

  // Fallback an toàn nếu không nạp được câu hỏi
  if (!isGenerating && !currentQuestion && !isFinished) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 items-center justify-center animate-in fade-in p-6 text-center">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          Lỗi nạp dữ liệu
        </h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được câu hỏi điền từ. Vui lòng thử lại sau.
        </p>
        <button
          type="button"
          onClick={() =>
            typeof onEndGame === 'function' &&
            onEndGame({
              correct: correctCount || 0,
              time: time || 0,
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

  // Màn hình tổng kết khi hoàn thành
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
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8 mt-6">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Thời gian
            </div>
            <div className={'text-xl font-bold ' + theme.accentText}>
              {formatGameTime(time || 0)}
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
              time: time || 0,
              wrong: wrongCount || 0
            })
          }
          className={
            'w-full max-w-xs py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ' +
            theme.primaryBtn
          }
        >
          <Icons.CheckCircle size={24} /> Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const fontFamilyStyle =
    Utils && typeof Utils.getFontFamily === 'function'
      ? Utils.getFontFamily(settings)
      : 'inherit';

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      {/* Thanh đếm ngược thời gian chuẩn Hell Mode */}
      {config?.timerMode && !isResultState && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={
              'h-full transition-all duration-1000 ease-linear ' +
              (timeLeft <= 5 ? 'bg-red-500' : theme.progressBar)
            }
            style={{ width: progressPct + '%' }}
          />
        </div>
      )}

      {/* Popup xác nhận kết thúc sớm (A11y + Backdrop 2 nhịp + Escape) */}
      {showConfirmEnd && (
        <div
          className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fillblank-confirm-end-title"
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
        >
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3
              id="fillblank-confirm-end-title"
              className="text-xl font-black text-gray-800 mb-2"
            >
              Kết thúc phiên học?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Tiến trình của câu hiện tại sẽ không được lưu tiếp. Bạn có chắc chắn muốn thoát?
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
                      correct: correctCount || 0,
                      time: time || 0,
                      wrong: wrongCount || 0
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

      {/* Overlay nhẹ khi đang tải vòng tiếp theo */}
      {isGenerating && currentQuestion && (
        <div className="absolute inset-0 z-[90] bg-white/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="px-6 py-4 bg-white/95 rounded-2xl shadow-2xl border-2 border-gray-200 flex items-center gap-4">
            <div className="w-6 h-6 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
            <span className="font-bold text-gray-700 text-base">
              Đang chuẩn bị câu tiếp theo...
            </span>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={() => typeof onBackClick === 'function' && onBackClick()}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Tạm dừng / Quay lại"
          aria-label="Tạm dừng và quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            {formatLevelBadge(config?.level)}
          </div>

          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
            Câu {playedCount + 1}{' '}
            <span className="font-serif text-lg leading-none text-gray-400 ml-0.5">
              ∞
            </span>
          </div>

          {isHellMode && (
            <div className="text-[10px] font-bold text-purple-100 bg-purple-600 border border-purple-800 px-2 py-1 rounded hidden sm:flex items-center gap-1 animate-pulse shadow-sm">
              <Icons.Zap size={12} /> ĐỊA NGỤC
            </div>
          )}

          <div className="flex items-center gap-2 bg-white border px-3 py-1 rounded-full shadow-sm">
            <span className="text-xs sm:text-sm font-bold text-green-600 flex items-center gap-1">
              <Icons.Check size={14} /> {correctCount || 0}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-xs sm:text-sm font-bold text-red-500 flex items-center gap-1">
              <Icons.X size={14} /> {wrongCount || 0}
            </span>
          </div>

          {config?.timerMode && !isResultState && (
            <div
              className={
                'text-xs sm:text-sm font-mono font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ' +
                (timeLeft <= 5
                  ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                  : 'bg-orange-50 text-orange-600 border-orange-200')
              }
              title="Thời gian còn lại của câu hiện tại"
            >
              <Icons.Clock size={12} /> {timeLeft}s
            </div>
          )}

          <div
            className={
              'hidden sm:flex items-center gap-1 font-bold transition-all ' +
              (combo > 1 ? 'text-orange-500 scale-110' : 'text-gray-400')
            }
          >
            <Icons.Sparkles size={18} /> x{combo}
          </div>

          <div
            className={
              'text-lg sm:text-xl font-mono font-bold w-12 text-right hidden sm:block ' +
              theme.accentText
            }
          >
            {time}s
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {currentQuestion?.origin?._isRescued || currentQuestion?._isRescued ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
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
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(config?.aiMode || config?.sourceMode === 'ai_pure') && aiAmmoCount > 0 && (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
              title={'Có ' + aiAmmoCount + ' câu AI đã sẵn sàng'}
            >
              <Icons.Database size={12} className="text-blue-500" /> Đạn AI: {aiAmmoCount}
            </span>
          )}

          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          {/* [ANTI-CHEAT LOCK]: Chỉ hiển thị nút Bookmark khi đã chốt đáp án để chống lộ từ */}
          {isResultState && (
            <button
              type="button"
              onClick={handleBookmark}
              className={
                'p-2 rounded-lg transition-colors ' +
                (isBookmarked
                  ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                  : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100')
              }
              title={isBookmarked ? 'Đã lưu trong Sổ tay' : 'Lưu vào Sổ tay'}
              aria-label="Lưu vào Sổ tay"
            >
              <Icons.Bookmark
                size={20}
                fill={isBookmarked ? 'currentColor' : 'none'}
              />
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 flex flex-col items-center justify-center relative">
        <div className="w-full max-w-3xl bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center gap-2 w-full mb-6 relative">
            <button
              type="button"
              onClick={() => !isHintDisabled && setShowHint((prev) => !prev)}
              disabled={isHintDisabled}
              aria-label={
                isHintDisabled
                  ? 'Gợi ý bị khóa ở chế độ Khó hoặc Địa Ngục'
                  : 'Bật hoặc tắt gợi ý dịch nghĩa'
              }
              className={
                'p-3 rounded-full flex items-center justify-center transition-all shadow-sm ' +
                (isHintDisabled
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'
                  : showHint
                    ? 'bg-yellow-100 text-yellow-600 border border-yellow-300'
                    : 'bg-white border border-gray-200 text-gray-400 hover:text-yellow-500 hover:border-yellow-300 hover:shadow-md active:scale-95')
              }
              title={
                isHintDisabled
                  ? 'Gợi ý bị khóa ở chế độ Khó/Địa Ngục'
                  : 'Bật/Tắt gợi ý dịch nghĩa'
              }
            >
              <Icons.Info
                size={24}
                className={showHint && !isHintDisabled ? 'animate-pulse' : ''}
              />
            </button>

            {showHint && !isHintDisabled && resolvedHint && (
              <div className="mt-2 z-20 px-5 py-3 bg-yellow-50 rounded-2xl text-sm md:text-base text-yellow-800 italic font-medium border border-yellow-200 text-center shadow-sm max-w-2xl w-full animate-in slide-in-from-top-2">
                {resolvedHint}
              </div>
            )}

            <div className="mt-4 text-2xl md:text-3xl font-bold text-gray-800 text-center leading-relaxed w-full break-words">
              {sentenceParts.map((part, i) => (
                <React.Fragment key={i}>
                  <span
                    style={{
                      fontFamily: fontFamilyStyle,
                      fontWeight: settings?.fontWeight || 'bold'
                    }}
                  >
                    {part}
                  </span>
                  {i < sentenceParts.length - 1 && (
                    <span className="inline-block w-28 sm:w-32 border-b-4 border-gray-300 mx-2 mb-1 align-middle" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 4 Từ gợi ý (Ẩn khi ở chế độ Địa Ngục) */}
          {displayOptions.length > 0 && !isHellMode && (
            <div className="w-full max-w-xl mx-auto mt-2 grid grid-cols-2 gap-3 px-2 sm:px-4 animate-in fade-in">
              {displayOptions.map((opt, i) => (
                <div
                  key={opt + '_' + i}
                  className="bg-gray-50 border-2 border-dashed border-gray-200 text-gray-600 font-bold py-3 px-4 rounded-xl text-center flex items-center justify-center min-h-[3.5rem] break-words shadow-sm opacity-90 cursor-not-allowed select-none"
                  title="Chỉ để nhìn, hãy gõ đáp án vào ô bên dưới"
                >
                  <span className="opacity-40 mr-2 text-xs bg-gray-200 px-1.5 py-0.5 rounded-md font-black">
                    {OPTION_LABELS[i] || String(i + 1)}
                  </span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ô gõ đáp án */}
          <div className="mt-8 flex gap-3 w-full max-w-md animate-in slide-in-from-bottom-4">
            <input
              ref={inputRef}
              type="text"
              value={inputBuffer}
              onChange={(e) =>
                typeof setInputBuffer === 'function' &&
                setInputBuffer(e.target.value)
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.nativeEvent?.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  if (typeof checkAnswer === 'function') checkAnswer();
                }
              }}
              disabled={isResultState}
              className={
                'flex-1 p-4 sm:p-5 text-center text-xl md:text-2xl font-bold border-4 rounded-2xl outline-none shadow-inner transition-colors ' +
                (checkStatus === 'correct'
                  ? 'border-green-400 bg-green-50 text-green-700'
                  : checkStatus === 'wrong'
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : checkStatus === 'wrong_retry'
                      ? 'border-orange-400 bg-orange-50 text-orange-700 animate-[shake_0.4s_ease-in-out]'
                      : isHellMode
                        ? 'border-purple-500 focus:border-purple-600 bg-purple-50 text-purple-900 placeholder-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                        : theme.inputBorder)
              }
              placeholder={
                isHellMode
                  ? 'ĐỊA NGỤC: Gõ đáp án...'
                  : 'Gõ đáp án (hoặc Pinyin: xiangzi)...'
              }
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => typeof checkAnswer === 'function' && checkAnswer()}
              disabled={!String(inputBuffer || '').trim() || isResultState}
              aria-label="Kiểm tra đáp án"
              className={
                'px-5 sm:px-6 text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-all ' +
                (isHellMode && !isResultState
                  ? 'bg-purple-600 hover:bg-purple-700'
                  : theme.submitBtn)
              }
            >
              <Icons.Check size={32} />
            </button>
          </div>

          {!isResultState && (
            <p
              className={
                'text-xs text-center font-medium mt-4 ' +
                (isHellMode ? 'text-purple-400' : 'text-gray-400')
              }
            >
              Bạn có {Math.max(0, 3 - attempts)} lượt thử. Bấm Enter để kiểm tra.
            </p>
          )}

          {/* Bảng Kết Quả + Nghĩa + Giải thích + Loa đọc lại */}
          {isResultState && (
            <div
              className={
                'mt-8 w-full rounded-2xl animate-in slide-in-from-bottom-4 flex flex-col shadow-lg border-2 ' +
                (checkStatus === 'correct'
                  ? 'border-green-200'
                  : 'border-red-200')
              }
            >
              <div
                className={
                  'p-4 text-white flex items-center justify-between px-6 font-bold rounded-t-xl relative ' +
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

                {typeof onPlay === 'function' && completedSentence && (
                  <button
                    type="button"
                    onClick={() => onPlay(completedSentence)}
                    className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors"
                    title="Nghe phát âm câu hoàn chỉnh"
                  >
                    <Icons.Volume2 size={16} /> Nghe lại
                  </button>
                )}
              </div>

              <div className="p-5 sm:p-6 bg-white rounded-b-xl flex flex-col items-center gap-4 text-center">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Đáp án đúng là
                </span>
                <span className="text-2xl sm:text-3xl font-black text-green-600 tracking-wider bg-green-50 px-6 py-2 rounded-2xl border border-green-100 break-words">
                  {currentQuestion.targetWord}
                </span>

                {completedSentence &&
                  completedSentence !== currentQuestion.targetWord && (
                    <p
                      className="text-sm sm:text-base font-semibold text-gray-700 leading-relaxed max-w-2xl"
                      style={{ fontFamily: fontFamilyStyle }}
                    >
                      {completedSentence}
                    </p>
                  )}

                {resolvedHint && (
                  <div className="w-full max-w-2xl bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900 text-left">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
                      Dịch nghĩa / Gợi ý
                    </span>
                    <p className="font-medium leading-relaxed">{resolvedHint}</p>
                  </div>
                )}

                {resolvedExplanation && (
                  <div className="w-full max-w-2xl bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-900 text-left">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1 mb-1">
                      <Icons.Sparkles size={13} /> Giải thích ngữ pháp
                    </span>
                    <p className="font-medium leading-relaxed">
                      {resolvedExplanation}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER FLEX CHỐNG ĐÈ NÚT TRÊN MOBILE */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-4 z-10 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="shrink-0 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2.5 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
          aria-label="Kết thúc phiên học"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 flex justify-end max-w-md ml-auto">
          {isResultState ? (
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
                    <Icons.Pause size={16} fill="currentColor" /> Xem ({resultTimer}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => typeof handleNext === 'function' && handleNext()}
                disabled={isGenerating || aiWaitTime > 0}
                className={
                  'flex-[2] py-3 sm:py-4 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ' +
                  (checkStatus === 'correct'
                    ? 'bg-green-500 hover:bg-green-600'
                    : theme.submitBtn) +
                  (isGenerating || aiWaitTime > 0
                    ? ' opacity-70 cursor-not-allowed'
                    : ' active:scale-95')
                }
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />{' '}
                    Đang tải...
                  </>
                ) : (
                  <>
                    Tiếp theo <Icons.ChevronRight size={20} className="sm:w-6 sm:h-6" />
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
                'w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ' +
                (isGenerating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95')
              }
            >
              Bỏ qua <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
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
  window.Block5_8_FillBlankSetup = FillBlankSetup;
  window.FillBlankSetup = FillBlankSetup;
  window.Block5_8_FillBlankPlayScreen = FillBlankPlayScreen;
  window.FillBlankPlayScreen = FillBlankPlayScreen;
}

export default FillBlankPlayScreen;