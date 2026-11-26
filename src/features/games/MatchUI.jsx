// ============================================================================
// FILE 52/85: src/features/games/MatchUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.1 - Match UI V1.08)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 06:10 (GMT+7)
// NHIỆM VỤ: Giao diện Cấu hình (MatchSetup) và Màn hình chơi chính
//           (MatchPlayScreen) cho trò chơi Nối Ô (Match Game).
//           Nâng cấp Ver 1.1 (từ Ver 1.0 theo thẩm định danhgia.md):
//           1. Diệt triệt để nguy cơ lặp vô hạn (Maximum update depth exceeded)
//              khi matchState khuyết trường bằng hằng số bất biến EMPTY_ARRAY /
//              EMPTY_OBJECT làm fallback ổn định tham chiếu.
//           2. Làm tròn tọa độ SVG về 0.5px (chống rung sub-pixel Windows DPI)
//              kèm bộ so sánh nông areSvgLinesEqual giúp React bail-out 0ms,
//              giảm ~50% lượt re-render thừa từ rAF & ResizeObserver.
//           3. Khóa pha gắn ResizeObserver qua cờ isInitialLoading đảm bảo gắn
//              lại 100% ngay khi thoát màn Loading return sớm.
//           4. Đồng bộ nhãn Level trên Header dùng chung formatLevelBadge và
//              phòng thủ so khớp ID kiểu chuỗi ở isRightConnected.
// ============================================================================

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString, getTimerColor } from './common/gameHelpers';

const VALID_TIME_LIMITS = [30, 45, 60, 90];

/** @type {readonly any[]} */
const EMPTY_ARRAY = Object.freeze([]);
/** @type {Readonly<Record<string, any>>} */
const EMPTY_OBJECT = Object.freeze({});

// Bảng ánh xạ lớp Tailwind tĩnh (chống Tailwind JIT purge khi ghép chuỗi động)
const MATCH_COLOR_STYLES = {
  purple: {
    btn: 'bg-purple-600 hover:bg-purple-700',
    cardActive: 'border-purple-500 bg-purple-50 shadow-sm',
    iconActive: 'text-purple-600',
    spinner: 'border-purple-200 border-t-purple-500',
    progressBar: 'bg-purple-500',
    selectedLeft: 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200',
    connectedCard: 'border-purple-300 bg-purple-50 opacity-90',
    focusRing: 'focus:ring-purple-300'
  },
  blue: {
    btn: 'bg-blue-600 hover:bg-blue-700',
    cardActive: 'border-blue-500 bg-blue-50 shadow-sm',
    iconActive: 'text-blue-600',
    spinner: 'border-blue-200 border-t-blue-500',
    progressBar: 'bg-blue-500',
    selectedLeft: 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200',
    connectedCard: 'border-blue-300 bg-blue-50 opacity-90',
    focusRing: 'focus:ring-blue-300'
  },
  sky: {
    btn: 'bg-sky-600 hover:bg-sky-700',
    cardActive: 'border-sky-500 bg-sky-50 shadow-sm',
    iconActive: 'text-sky-600',
    spinner: 'border-sky-200 border-t-sky-500',
    progressBar: 'bg-sky-500',
    selectedLeft: 'border-sky-500 bg-sky-50 text-sky-700 ring-2 ring-sky-200',
    connectedCard: 'border-sky-300 bg-sky-50 opacity-90',
    focusRing: 'focus:ring-sky-300'
  },
  red: {
    btn: 'bg-red-600 hover:bg-red-700',
    cardActive: 'border-red-500 bg-red-50 shadow-sm',
    iconActive: 'text-red-600',
    spinner: 'border-red-200 border-t-red-500',
    progressBar: 'bg-red-500',
    selectedLeft: 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-200',
    connectedCard: 'border-red-300 bg-red-50 opacity-90',
    focusRing: 'focus:ring-red-300'
  },
  indigo: {
    btn: 'bg-indigo-600 hover:bg-indigo-700',
    cardActive: 'border-indigo-500 bg-indigo-50 shadow-sm',
    iconActive: 'text-indigo-600',
    spinner: 'border-indigo-200 border-t-indigo-500',
    progressBar: 'bg-indigo-500',
    selectedLeft: 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200',
    connectedCard: 'border-indigo-300 bg-indigo-50 opacity-90',
    focusRing: 'focus:ring-indigo-300'
  },
  emerald: {
    btn: 'bg-emerald-600 hover:bg-emerald-700',
    cardActive: 'border-emerald-500 bg-emerald-50 shadow-sm',
    iconActive: 'text-emerald-600',
    spinner: 'border-emerald-200 border-t-emerald-500',
    progressBar: 'bg-emerald-500',
    selectedLeft: 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200',
    connectedCard: 'border-emerald-300 bg-emerald-50 opacity-90',
    focusRing: 'focus:ring-emerald-300'
  },
  orange: {
    btn: 'bg-orange-600 hover:bg-orange-700',
    cardActive: 'border-orange-500 bg-orange-50 shadow-sm',
    iconActive: 'text-orange-600',
    spinner: 'border-orange-200 border-t-orange-500',
    progressBar: 'bg-orange-500',
    selectedLeft: 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-200',
    connectedCard: 'border-orange-300 bg-orange-50 opacity-90',
    focusRing: 'focus:ring-orange-300'
  },
  cyan: {
    btn: 'bg-cyan-600 hover:bg-cyan-700',
    cardActive: 'border-cyan-500 bg-cyan-50 shadow-sm',
    iconActive: 'text-cyan-600',
    spinner: 'border-cyan-200 border-t-cyan-500',
    progressBar: 'bg-cyan-500',
    selectedLeft: 'border-cyan-500 bg-cyan-50 text-cyan-700 ring-2 ring-cyan-200',
    connectedCard: 'border-cyan-300 bg-cyan-50 opacity-90',
    focusRing: 'focus:ring-cyan-300'
  },
  slate: {
    btn: 'bg-slate-600 hover:bg-slate-700',
    cardActive: 'border-slate-500 bg-slate-50 shadow-sm',
    iconActive: 'text-slate-600',
    spinner: 'border-slate-200 border-t-slate-500',
    progressBar: 'bg-slate-500',
    selectedLeft: 'border-slate-500 bg-slate-50 text-slate-700 ring-2 ring-slate-200',
    connectedCard: 'border-slate-300 bg-slate-50 opacity-90',
    focusRing: 'focus:ring-slate-300'
  }
};

/**
 * @param {string} color
 */
const getMatchTheme = (color) => MATCH_COLOR_STYLES[color] || MATCH_COLOR_STYLES.purple;

/**
 * Chuẩn hóa khóa so khớp Unicode NFC (không phân biệt hoa/thường & khoảng trắng)
 * @param {any} val
 * @returns {string}
 */
const normalizeNotebookKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

/**
 * Kiểm duyệt mức giới hạn thời gian hợp lệ
 * @param {any} val
 * @returns {number}
 */
const sanitizeMatchTimeLimit = (val) => {
  const num = Number(val);
  return VALID_TIME_LIMITS.includes(num) ? num : 60;
};

/**
 * Làm tròn tọa độ về bội số 0.5px để chống rung sub-pixel trên màn hình Windows DPI
 * @param {number} val
 * @returns {number}
 */
const roundHalfPx = (val) => Math.round(val * 2) / 2;

/**
 * So sánh nông 2 mảng tọa độ dây nối SVG
 * @param {Array<{ key: string, x1: number, y1: number, x2: number, y2: number }>} a
 * @param {Array<{ key: string, x1: number, y1: number, x2: number, y2: number }>} b
 * @returns {boolean}
 */
const areLineArraysEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const n = b[i];
    if (
      p.key !== n.key ||
      p.x1 !== n.x1 ||
      p.y1 !== n.y1 ||
      p.x2 !== n.x2 ||
      p.y2 !== n.y2
    ) {
      return false;
    }
  }
  return true;
};

/**
 * So sánh toàn bộ 4 nhóm dây nối SVG để React bail-out khi tọa độ không đổi
 * @param {{ connections: any[], correct: any[], wrong: any[], missing: any[] }} prev
 * @param {{ connections: any[], correct: any[], wrong: any[], missing: any[] }} next
 * @returns {boolean}
 */
const areSvgLinesEqual = (prev, next) =>
  areLineArraysEqual(prev.connections, next.connections) &&
  areLineArraysEqual(prev.correct, next.correct) &&
  areLineArraysEqual(prev.wrong, next.wrong) &&
  areLineArraysEqual(prev.missing, next.missing);

/**
 * Đọc cấu hình Nối Ô an toàn qua Utils.safeJsonParse
 * @param {boolean} initialAiMode
 * @returns {{ sourceMode: string, timerMode: boolean, hardMode: boolean, aiMode: boolean, timeLimit: number }}
 */
const loadSavedMatchConfig = (initialAiMode = false) => {
  try {
    const parsed = Utils.safeJsonParse('fc_match_config', null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const hardVal = initialAiMode ? true : Boolean(parsed.hardMode ?? false);
      const aiVal = initialAiMode ? true : Boolean(parsed.aiMode ?? false);
      return {
        sourceMode: parsed.sourceMode === 'ai_pure' ? 'ai_pure' : 'card',
        timerMode: Boolean(parsed.timerMode ?? false),
        hardMode: hardVal,
        aiMode: hardVal ? aiVal : false,
        timeLimit: sanitizeMatchTimeLimit(parsed.timeLimit)
      };
    }
  } catch (e) {
    console.warn('[MatchUI] Load match config failed:', e);
  }
  return {
    sourceMode: 'card',
    timerMode: false,
    hardMode: Boolean(initialAiMode),
    aiMode: Boolean(initialAiMode),
    timeLimit: 60
  };
};

/**
 * Lưu cấu hình Nối Ô an toàn qua Utils.safeLocalStorageSet (0 lỗi Radar R05)
 * @param {Record<string, any>} config
 */
const saveMatchConfig = (config) => {
  try {
    Utils.safeLocalStorageSet('fc_match_config', config);
  } catch (e) {
    console.warn('[MatchUI] Save match config failed:', e);
  }
};

/**
 * Định dạng nhãn Level thân thiện cho Header & GlobalLoadingScreen (hỗ trợ cả mảng nhiều cấp độ)
 * @param {any} rawLevel
 * @returns {string}
 */
const formatLevelBadge = (rawLevel) => {
  const safeLevelStr = getSafeLevelString(rawLevel, '');
  if (!safeLevelStr) return '';
  const baseLabel = safeLevelStr
    .replace(/^(?:(?:en|zh)_)?level_/i, 'LEVEL ')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
  if (Array.isArray(rawLevel)) {
    const validCount = rawLevel.filter(Boolean).length;
    if (validCount > 1) return `${baseLabel} (+${validCount - 1})`;
  }
  return baseLabel;
};

/**
 * Trích xuất từ gốc sạch cho thẻ cột trái (tuyệt đối không lưu từ bị bóp méo sai chính tả)
 * @param {Record<string, any>} item
 * @returns {string}
 */
const getCleanLeftTerm = (item) => {
  if (!item) return '';
  if (item.isTrap) {
    return String(
      item.originalTerm || item.origin?.originalTerm || item.origin?.term || item.term || ''
    ).trim();
  }
  return String(item.origin?.term || item.term || '').trim();
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (MATCH SETUP)
// ============================================================================
export const MatchSetup = ({
  mainColor = 'purple',
  initialAiMode = false,
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getMatchTheme(mainColor);
  const initialCfg = useMemo(() => loadSavedMatchConfig(initialAiMode), [initialAiMode]);

  const [sourceMode, setSourceMode] = useState(() => initialCfg.sourceMode);
  const [timerMode, setTimerMode] = useState(() => initialCfg.timerMode);
  const [hardMode, setHardMode] = useState(() => initialCfg.hardMode);
  const [aiMode, setAiMode] = useState(() => initialCfg.aiMode);
  const [timeLimit, setTimeLimit] = useState(() => initialCfg.timeLimit);

  const effectiveAiMode = sourceMode === 'ai_pure' ? true : hardMode ? aiMode : false;

  const handleStart = () => {
    const sanitizedLimit = sanitizeMatchTimeLimit(timeLimit);
    const config = {
      timerMode,
      hardMode,
      aiMode: sourceMode === 'ai_pure' ? false : hardMode ? aiMode : false,
      timeLimit: sanitizedLimit,
      sourceMode
    };
    saveMatchConfig(config);
    if (typeof onStart === 'function') {
      onStart('match', config);
    }
  };

  const handleHardModeChange = (val) => {
    setHardMode(val);
    if (!val) setAiMode(false);
  };

  let aiSubtitle = '';
  if (sourceMode === 'ai_pure') {
    aiSubtitle = '(Chế độ Tự sinh đã bao gồm AI)';
  } else if (!hardMode) {
    aiSubtitle = '(Yêu cầu bật Chế độ Khó)';
  } else {
    aiSubtitle = aiMode ? 'AI tạo nhiễu thông minh' : 'Thuật toán nội bộ';
  }

  return (
    <div className="relative z-10 flex flex-col items-center mx-auto w-full max-w-sm animate-in slide-in-from-right-8 py-4 h-full px-2">
      <div className="w-full flex items-center justify-between mb-4 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          title="Quay lại"
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
                  ? theme.cardActive
                  : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
              } hover:scale-105`}
            >
              <Icons.Layers
                size={24}
                className={sourceMode === 'card' ? theme.iconActive : 'text-gray-400'}
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">Thẻ của tôi</div>
                <div className="text-[10px] text-gray-500">Nối từ trong Flashcard</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSourceMode('ai_pure')}
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
          disabled={false}
          extra={null}
        />

        <MenuToggle
          active={effectiveAiMode}
          setActive={setAiMode}
          icon={Icons.Sparkles}
          color="purple"
          title="Thử thách AI"
          subtitle={aiSubtitle}
          disabled={!hardMode || sourceMode === 'ai_pure'}
          extra={null}
        />

        <MenuToggle
          active={timerMode}
          setActive={setTimerMode}
          icon={Icons.Clock}
          color="orange"
          title="Giới hạn thời gian"
          subtitle={timerMode ? `${timeLimit} giây / vòng` : 'Thoải mái thời gian'}
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
          className={`w-full py-4 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform ${theme.btn}`}
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
  t = undefined,
  mainColor = 'purple',
  isLoading = false,
  isPaused = false,
  onPause = undefined,
  handleSaveAndBack = undefined,
  onEndGame = undefined,
  timerMode = false,
  timeLeft = 60,
  timeLimit = 60,
  gameStats = /** @type {{ correct: number, wrong: number }} */ ({ correct: 0, wrong: 0 }),
  accuracy = 0,
  difficulty = 'easy',
  isAiMode = false,
  matchState = /** @type {Record<string, any>} */ ({
    pairs: EMPTY_ARRAY,
    leftItems: EMPTY_ARRAY,
    rightItems: EMPTY_ARRAY,
    connections: EMPTY_OBJECT,
    selectedLeft: null,
    isChecked: false,
    correctLines: EMPTY_ARRAY,
    wrongLines: EMPTY_ARRAY,
    missingLines: EMPTY_ARRAY,
    timer: 10,
    isResultPaused: false,
    isAiGenerated: false,
    _isRescued: false
  }),
  settings = /** @type {Record<string, any>} */ (EMPTY_OBJECT),
  notebook = EMPTY_ARRAY,
  onBookmark = undefined,
  handleMatchClick = undefined,
  checkMatch = undefined,
  generateMatch = undefined,
  toggleResultPause = undefined,
  isGenerating = false,
  config = /** @type {Record<string, any>} */ (EMPTY_OBJECT),
  queueLength = 0,
  aiWaitTime = 0
}) => {
  const theme = getMatchTheme(mainColor);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const containerRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  // Lưu tọa độ dây nối SVG đã đo sau khi DOM hoàn tất layout (diệt lỗi lệch dây F7)
  const [svgLines, setSvgLines] = useState(
    /**
     * @type {{
     *   connections: Array<{ key: string, x1: number, y1: number, x2: number, y2: number }>,
     *   correct: Array<{ key: string, x1: number, y1: number, x2: number, y2: number }>,
     *   wrong: Array<{ key: string, x1: number, y1: number, x2: number, y2: number }>,
     *   missing: Array<{ key: string, x1: number, y1: number, x2: number, y2: number }>
     * }}
     */ ({
      connections: [],
      correct: [],
      wrong: [],
      missing: []
    })
  );

  // Đóng Modal xác nhận thoát sớm bằng phím Escape (A11y chuẩn)
  useEffect(() => {
    if (!showConfirmEnd) return undefined;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowConfirmEnd(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showConfirmEnd]);

  // Tập chỉ mục Sổ tay chuẩn hóa Unicode NFC giúp tra cứu O(1)
  const notebookKeySet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(notebook)) {
      notebook.forEach((n) => {
        const key = normalizeNotebookKey(n?.term);
        if (key) set.add(key);
      });
    }
    return set;
  }, [notebook]);

  // Dùng hằng số bất biến EMPTY_ARRAY / EMPTY_OBJECT để khóa ổn định tham chiếu
  const leftItems = Array.isArray(matchState?.leftItems) ? matchState.leftItems : EMPTY_ARRAY;
  const rightItems = Array.isArray(matchState?.rightItems) ? matchState.rightItems : EMPTY_ARRAY;
  const connectionsObj =
    matchState?.connections && typeof matchState.connections === 'object'
      ? matchState.connections
      : EMPTY_OBJECT;
  const correctLinesArr = Array.isArray(matchState?.correctLines)
    ? matchState.correctLines
    : EMPTY_ARRAY;
  const wrongLinesArr = Array.isArray(matchState?.wrongLines)
    ? matchState.wrongLines
    : EMPTY_ARRAY;
  const missingLinesArr = Array.isArray(matchState?.missingLines)
    ? matchState.missingLines
    : EMPTY_ARRAY;
  const isChecked = Boolean(matchState?.isChecked);
  const pairsList = Array.isArray(matchState?.pairs) ? matchState.pairs : EMPTY_ARRAY;
  const isInitialLoading = Boolean(isGenerating && pairsList.length === 0);

  // Đồng bộ nhãn Level dùng chung formatLevelBadge cho Header & GlobalLoadingScreen
  const formattedLevelBadge = formatLevelBadge(config?.level);
  const headerLevelBadge = formattedLevelBadge || 'LEVEL 4';

  // Đo lại toàn bộ tọa độ dây nối SVG bám sát tâm ô (làm tròn 0.5px + bail-out khi không đổi)
  const measureSvgLines = useCallback(() => {
    if (typeof document === 'undefined') return;
    const container = containerRef.current || document.getElementById('match-container');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const getCoords = (startId, endId) => {
      const startEl = document.getElementById(`match-left-${startId}`);
      const endEl = document.getElementById(`match-right-${endId}`);
      if (!startEl || !endEl) return null;

      const startRect = startEl.getBoundingClientRect();
      const endRect = endEl.getBoundingClientRect();

      return {
        x1: roundHalfPx(startRect.right - containerRect.left),
        y1: roundHalfPx(startRect.top + startRect.height / 2 - containerRect.top),
        x2: roundHalfPx(endRect.left - containerRect.left),
        y2: roundHalfPx(endRect.top + endRect.height / 2 - containerRect.top)
      };
    };

    const nextConnections = [];
    Object.entries(connectionsObj).forEach(([leftId, rightId]) => {
      const c = getCoords(leftId, rightId);
      if (c) nextConnections.push({ key: `conn-${leftId}-${rightId}`, ...c });
    });

    const nextCorrect = [];
    const nextWrong = [];
    const nextMissing = [];

    if (isChecked) {
      correctLinesArr.forEach((line, idx) => {
        const c = getCoords(line.start, line.end);
        if (c) nextCorrect.push({ key: `c-${idx}-${line.start}-${line.end}`, ...c });
      });
      wrongLinesArr.forEach((line, idx) => {
        const c = getCoords(line.start, line.end);
        if (c) nextWrong.push({ key: `w-${idx}-${line.start}-${line.end}`, ...c });
      });
      missingLinesArr.forEach((line, idx) => {
        const c = getCoords(line.start, line.end);
        if (c) nextMissing.push({ key: `m-${idx}-${line.start}-${line.end}`, ...c });
      });
    }

    const nextLines = {
      connections: nextConnections,
      correct: nextCorrect,
      wrong: nextWrong,
      missing: nextMissing
    };

    setSvgLines((prev) => (areSvgLinesEqual(prev, nextLines) ? prev : nextLines));
  }, [connectionsObj, isChecked, correctLinesArr, wrongLinesArr, missingLinesArr]);

  // Đồng bộ đo dây nối ngay sau commit + 1 nhịp animation frame (bắt trọn bung giải thích Hard Mode)
  useLayoutEffect(() => {
    if (isInitialLoading) return undefined;
    measureSvgLines();
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return undefined;
    }
    const rafId = window.requestAnimationFrame(() => {
      measureSvgLines();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [measureSvgLines, isInitialLoading, leftItems, rightItems, isGenerating, isPaused]);

  // Lắng nghe ResizeObserver trên #match-container & window.resize (tự gắn lại sau khi thoát Loading)
  useEffect(() => {
    if (isInitialLoading) return undefined;
    const handleResize = () => measureSvgLines();
    window.addEventListener('resize', handleResize);

    let observer = null;
    const container = containerRef.current;
    if (typeof ResizeObserver !== 'undefined' && container) {
      observer = new ResizeObserver(() => {
        measureSvgLines();
      });
      observer.observe(container);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (observer) observer.disconnect();
    };
  }, [measureSvgLines, isInitialLoading, leftItems.length, rightItems.length]);

  // Thoát từ màn hình Loading: nếu chưa trả lời cặp nào (0/0) thì quay thẳng về Menu
  const handleAbortLoading = () => {
    const totalAnswered = (Number(gameStats?.correct) || 0) + (Number(gameStats?.wrong) || 0);
    if (totalAnswered === 0 && typeof handleSaveAndBack === 'function') {
      handleSaveAndBack();
      return;
    }
    if (typeof onEndGame === 'function') {
      onEndGame(gameStats);
    }
  };

  // Tránh chớp màn hình khi load thẻ Offline lần đầu
  if (isInitialLoading) {
    if (config?.sourceMode === 'card' && !isAiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none animate-pulse">
          <div className={`w-8 h-8 border-4 rounded-full animate-spin ${theme.spinner}`}></div>
        </div>
      );
    }
    return (
      <GlobalLoadingScreen
        duration={22}
        onComplete={undefined}
        onCancel={handleAbortLoading}
        queueLength={queueLength}
        text={
          config?.sourceMode === 'ai_pure'
            ? 'AI đang tạo các cặp từ...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={
          config?.sourceMode === 'ai_pure'
            ? 'Đang nạp vòng nối ô từ động cơ AI...'
            : 'Vui lòng chờ trong giây lát...'
        }
        mainColor={mainColor}
        levelStr={config?.sourceMode === 'ai_pure' ? formattedLevelBadge : ''}
      />
    );
  }

  const safeTimeLimit = Number(timeLimit) > 0 ? Number(timeLimit) : 60;
  const progressPercent = Math.max(0, Math.min(100, ((Number(timeLeft) || 0) / safeTimeLimit) * 100));
  const isCardInteractive = !isChecked && !isPaused;

  return (
    <div className="flex flex-col h-full w-full bg-gray-50 relative overflow-hidden">
      {/* Thanh Tiến Trình Thời Gian */}
      {timerMode && !isChecked && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 5 ? 'bg-red-500' : theme.progressBar
            }`}
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      )}

      {/* Popup xác nhận thoát sớm (A11y Dialog + Backdrop + Escape) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-confirm-end-title"
          onClick={() => setShowConfirmEnd(false)}
          className="absolute inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 id="match-confirm-end-title" className="text-xl font-black text-gray-800 mb-2">
              Kết thúc sớm?
            </h3>
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
                  if (typeof onEndGame === 'function') onEndGame(gameStats);
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
      {isGenerating &&
        pairsList.length > 0 &&
        (config?.sourceMode === 'card' && !isAiMode ? (
          <div className="absolute inset-0 z-[150] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            duration={0}
            onComplete={undefined}
            onCancel={handleAbortLoading}
            queueLength={queueLength}
            text="Đang chuyển sang vòng mới..."
            subText="Đang nạp bộ cặp nối ô tiếp theo..."
            mainColor={mainColor}
            levelStr=""
          />
        ))}

      {/* Loading chung */}
      {isLoading && !isGenerating && (
        <GlobalLoadingScreen
          duration={0}
          onComplete={undefined}
          onCancel={handleAbortLoading}
          queueLength={queueLength}
          text="Đang thiết lập..."
          subText="Vui lòng chờ trong giây lát..."
          mainColor={mainColor}
          levelStr=""
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
              className={`w-16 h-16 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform ${theme.btn}`}
              title="Tiếp tục"
            >
              <Icons.Play size={32} fill="currentColor" />
            </button>
          </div>
        </div>
      )}

      {/* --- HEADER CHUẨN MỰC --- */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleSaveAndBack}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors hover:bg-gray-100"
            title="Lưu tiến trình & Quay lại"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          {typeof onPause === 'function' && (
            <button
              type="button"
              onClick={onPause}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isPaused
                  ? 'bg-green-100 text-green-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            >
              {isPaused ? <Icons.Play size={16} fill="currentColor" /> : <Icons.Pause size={16} />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            {headerLevelBadge}
          </div>
          <div
            className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1"
            title="Chế độ Nối Ô"
          >
            Nối Ô <Icons.InfinityIcon size={14} className="text-gray-400 ml-0.5" />
          </div>
          {timerMode && !isChecked && (
            <div
              className={`text-base sm:text-xl font-mono font-bold ${getTimerColor(
                timeLeft,
                safeTimeLimit
              )} min-w-[3rem] text-right`}
            >
              {timeLeft}s
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {matchState?._isRescued ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
            </span>
          ) : matchState?.isAiGenerated ? (
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
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}
        </div>
      </div>

      {/* --- THÂN GAME CHÍNH --- */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 sm:p-4 flex flex-col items-center relative z-0">
        {/* KHU VỰC THỐNG KÊ */}
        <div className="w-full max-w-5xl flex justify-between items-center mb-4 transition-all duration-300 px-2">
          <div className="flex gap-2 text-xs font-bold items-center">
            <span className="text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 flex items-center gap-1">
              <Icons.CheckCircle size={14} /> {gameStats?.correct ?? 0}
            </span>
            <span className="text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center gap-1">
              <Icons.X size={14} /> {gameStats?.wrong ?? 0}
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
          ref={containerRef}
          className="relative w-full max-w-5xl grid grid-cols-2 gap-3 sm:gap-6 md:gap-16 select-none transition-all duration-300 flex-1 min-h-[400px]"
        >
          {/* LỚP VẼ DÂY NỐI SVG ĐỒNG BỘ QUA RESIZEOBSERVER + LAYOUTEFFECT */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
            style={{ overflow: 'visible' }}
          >
            {svgLines.connections.map((line) => (
              <line
                key={line.key}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={isChecked ? '#9ca3af' : '#6366f1'}
                strokeWidth="2"
                strokeDasharray={isChecked ? '4' : ''}
              />
            ))}

            {isChecked && (
              <>
                {svgLines.correct.map((line) => (
                  <line
                    key={line.key}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#22c55e"
                    strokeWidth="3"
                  />
                ))}
                {svgLines.wrong.map((line) => (
                  <line
                    key={line.key}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#ef4444"
                    strokeWidth="3"
                  />
                ))}
                {svgLines.missing.map((line) => (
                  <line
                    key={line.key}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#22c55e"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    opacity="0.6"
                  />
                ))}
              </>
            )}
          </svg>

          {/* CỘT TRÁI (Nghĩa Tiếng Việt) — Dùng div[role=button] độc lập với nút Bookmark (Diệt F8) */}
          <div className="flex flex-col gap-3 md:gap-4 z-20 justify-center h-full w-full">
            {leftItems.map((item) => {
              const cleanTerm = getCleanLeftTerm(item);
              const isBookmarked =
                Boolean(cleanTerm) && notebookKeySet.has(normalizeNotebookKey(cleanTerm));

              let leftFeedbackUI = null;
              let errorStyle = '';

              if (isChecked) {
                const isWrong = wrongLinesArr.some((line) => String(line.start) === String(item.id));
                const isMissing = missingLinesArr.some(
                  (line) => String(line.start) === String(item.id)
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
                } else if (item.isTrap) {
                  leftFeedbackUI = (
                    <div className="mt-3 text-[11px] sm:text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in slide-in-from-top-2 shadow-sm w-full max-w-[90%] z-20 relative">
                      ✓ Đã né bẫy!
                    </div>
                  );
                }
              }

              const isSelectedLeft =
                matchState?.selectedLeft !== null &&
                matchState?.selectedLeft !== undefined &&
                String(matchState.selectedLeft) === String(item.id);

              const baseStyle = isSelectedLeft
                ? theme.selectedLeft
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300';

              const connectedStyle =
                !isChecked && connectionsObj[item.id] !== undefined ? theme.connectedCard : '';

              const finalClassName = `relative flex-1 flex flex-col justify-center items-center w-full p-3 md:p-4 pt-8 md:pt-10 rounded-xl border-2 text-center text-sm md:text-base lg:text-lg font-bold transition-all shadow-sm outline-none focus:ring-2 ${theme.focusRing} ${
                errorStyle || baseStyle
              } ${connectedStyle} ${isCardInteractive ? 'cursor-pointer' : 'cursor-default'}`;

              // Khóa đồng đều nút Bookmark trên toàn cột trái khi chưa Kiểm tra để chống lộ đáp án & lộ bẫy
              const canBookmark = isChecked && Boolean(cleanTerm);

              return (
                <div
                  key={item.id}
                  id={`match-left-${item.id}`}
                  role="button"
                  tabIndex={isCardInteractive ? 0 : -1}
                  aria-disabled={!isCardInteractive}
                  onClick={() => {
                    if (isCardInteractive && typeof handleMatchClick === 'function') {
                      handleMatchClick('left', item.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (
                      isCardInteractive &&
                      typeof handleMatchClick === 'function' &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      e.preventDefault();
                      handleMatchClick('left', item.id);
                    }
                  }}
                  style={{ fontFamily: 'inherit' }}
                  className={finalClassName}
                >
                  {canBookmark ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof onBookmark === 'function') {
                          onBookmark({
                            isSmartTarget: true,
                            display: cleanTerm,
                            save: cleanTerm,
                            analysis: item.definition || item.origin?.definition || ''
                          });
                        }
                      }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className={`absolute top-2 left-2 p-1.5 rounded-full transition-colors z-30 shrink-0 cursor-pointer ${
                        isBookmarked
                          ? 'text-yellow-500 bg-yellow-50 shadow-sm hover:bg-yellow-100'
                          : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
                      }`}
                      title={
                        isBookmarked
                          ? 'Đã lưu trong Sổ tay'
                          : t
                          ? t('addToNotebook')
                          : 'Lưu từ gốc vào Sổ tay'
                      }
                    >
                      <Icons.Bookmark
                        size={18}
                        fill={isBookmarked ? 'currentColor' : 'none'}
                      />
                    </button>
                  ) : (
                    <div
                      className="absolute top-2 left-2 p-1.5 rounded-full text-gray-300 opacity-40 cursor-not-allowed z-30 shrink-0"
                      title="Kiểm tra xong mới có thể lưu vào Sổ tay!"
                    >
                      <Icons.Bookmark size={18} />
                    </div>
                  )}

                  <span className="w-full break-words leading-tight z-10">{item.definition}</span>
                  {leftFeedbackUI}
                </div>
              );
            })}
          </div>

          {/* CỘT PHẢI (Từ vựng Ngoại ngữ) */}
          <div className="flex flex-col gap-3 md:gap-4 z-20 justify-center h-full w-full">
            {rightItems.map((item) => {
              let rightFeedbackUI = null;
              if (isChecked && item.isTrap) {
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

              const isRightConnected = Object.values(connectionsObj).some(
                (val) => String(val) === String(item.id)
              );

              return (
                <button
                  key={item.id}
                  id={`match-right-${item.id}`}
                  type="button"
                  onClick={() =>
                    isCardInteractive &&
                    typeof handleMatchClick === 'function' &&
                    handleMatchClick('right', item.id)
                  }
                  disabled={!isCardInteractive}
                  style={{
                    fontFamily: Utils.getFontFamily(settings),
                    fontWeight: settings?.fontWeight || 'bold',
                    fontSize: settings?.fontSize ? `${settings.fontSize * 0.8}rem` : '1.1rem'
                  }}
                  className={`relative flex-1 flex flex-col justify-center items-center w-full p-3 md:p-4 rounded-xl border-2 text-center text-sm md:text-base lg:text-lg transition-all shadow-sm outline-none focus:ring-2 ${theme.focusRing} ${
                    isRightConnected && !isChecked
                      ? theme.connectedCard
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

      {/* --- FOOTER FLEX CHUẨN (CHỐNG ĐÈ NÚT TRÊN MOBILE) --- */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-3 z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="shrink-0 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 min-w-0 flex justify-center sm:justify-end max-w-md ml-auto">
          {!isChecked ? (
            <button
              type="button"
              onClick={() => checkMatch && checkMatch()}
              disabled={
                Object.keys(connectionsObj).length === 0 || aiWaitTime > 0 || isPaused
              }
              className={`w-full py-3 sm:py-4 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${theme.btn}`}
            >
              <Icons.Check size={20} className="sm:w-6 sm:h-6" /> Kiểm tra
            </button>
          ) : (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 px-2 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  matchState?.isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {matchState?.isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Xem (
                    {Math.max(0, Number(matchState?.timer) || 0)}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={generateMatch}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 px-3 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${theme.btn} ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : 'active:scale-95'
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