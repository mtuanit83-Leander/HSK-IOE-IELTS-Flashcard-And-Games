// ============================================================================
// FILE 56/85: src/features/games/QuizUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.5 - Quiz UI V1.35)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 05:53 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (QuizSetup), Màn hình chơi (GamePlayScreen) và
//           Màn hình kết quả (GameResult) cho trò chơi Trắc Nghiệm (Multiple Choice).
//           Nâng cấp Ver 1.2:
//           1. Diệt sạch 4/4 MEDIUM Radar: chuyển fc_quiz_config sang
//              Utils.safeLocalStorageSet + Utils.safeJsonParse; gỡ bỏ 3 nhánh
//              window.IoeDataEngine legacy (dùng ES Module getGrammarTopics).
//           2. Dập sạch 9/9 lỗi tsc/checkJs trên VS Code: truyền đủ props cho
//              8 thẻ MenuToggle & GlobalLoadingScreen, gán mặc định an toàn +
//              JSDoc cho các prop/object tùy chọn và bảo vệ match.index.
//           3. Nâng cấp A11y cho Modal xác nhận thoát (role="dialog",
//              aria-modal="true", đóng bằng Backdrop/Escape) & bọc an toàn TTS.
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getGrammarTopics } from '@/engines/microPrompts';
import { getSafeLevelString, getTimerColor } from './common/gameHelpers';

const VALID_TIME_LIMITS = [15, 30, 45, 60];

// Bảng ánh xạ lớp Tailwind tĩnh (chống Tailwind JIT bỏ sót khi ghép chuỗi động)
const MAIN_COLOR_STYLES = {
  blue: {
    btn: 'bg-blue-600 hover:bg-blue-700',
    iconBtn: 'hover:bg-blue-50 text-blue-600 border-blue-100',
    cardActive: 'border-blue-500 bg-blue-50 shadow-sm',
    iconActive: 'text-blue-600',
    startRing: 'bg-blue-600 ring-blue-200',
    speaker: 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200',
    listenBtn: 'bg-white border-blue-100 hover:bg-blue-50 text-blue-600',
    focusRing: 'focus:ring-blue-300'
  },
  sky: {
    btn: 'bg-sky-600 hover:bg-sky-700',
    iconBtn: 'hover:bg-sky-50 text-sky-600 border-sky-100',
    cardActive: 'border-sky-500 bg-sky-50 shadow-sm',
    iconActive: 'text-sky-600',
    startRing: 'bg-sky-600 ring-sky-200',
    speaker: 'text-sky-600 bg-sky-50 hover:bg-sky-100 border-sky-200',
    listenBtn: 'bg-white border-sky-100 hover:bg-sky-50 text-sky-600',
    focusRing: 'focus:ring-sky-300'
  },
  red: {
    btn: 'bg-red-600 hover:bg-red-700',
    iconBtn: 'hover:bg-red-50 text-red-600 border-red-100',
    cardActive: 'border-red-500 bg-red-50 shadow-sm',
    iconActive: 'text-red-600',
    startRing: 'bg-red-600 ring-red-200',
    speaker: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200',
    listenBtn: 'bg-white border-red-100 hover:bg-red-50 text-red-600',
    focusRing: 'focus:ring-red-300'
  },
  indigo: {
    btn: 'bg-indigo-600 hover:bg-indigo-700',
    iconBtn: 'hover:bg-indigo-50 text-indigo-600 border-indigo-100',
    cardActive: 'border-indigo-500 bg-indigo-50 shadow-sm',
    iconActive: 'text-indigo-600',
    startRing: 'bg-indigo-600 ring-indigo-200',
    speaker: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
    listenBtn: 'bg-white border-indigo-100 hover:bg-indigo-50 text-indigo-600',
    focusRing: 'focus:ring-indigo-300'
  },
  emerald: {
    btn: 'bg-emerald-600 hover:bg-emerald-700',
    iconBtn: 'hover:bg-emerald-50 text-emerald-600 border-emerald-100',
    cardActive: 'border-emerald-500 bg-emerald-50 shadow-sm',
    iconActive: 'text-emerald-600',
    startRing: 'bg-emerald-600 ring-emerald-200',
    speaker: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200',
    listenBtn: 'bg-white border-emerald-100 hover:bg-emerald-50 text-emerald-600',
    focusRing: 'focus:ring-emerald-300'
  },
  purple: {
    btn: 'bg-purple-600 hover:bg-purple-700',
    iconBtn: 'hover:bg-purple-50 text-purple-600 border-purple-100',
    cardActive: 'border-purple-500 bg-purple-50 shadow-sm',
    iconActive: 'text-purple-600',
    startRing: 'bg-purple-600 ring-purple-200',
    speaker: 'text-purple-600 bg-purple-50 hover:bg-purple-100 border-purple-200',
    listenBtn: 'bg-white border-purple-100 hover:bg-purple-50 text-purple-600',
    focusRing: 'focus:ring-purple-300'
  },
  orange: {
    btn: 'bg-orange-600 hover:bg-orange-700',
    iconBtn: 'hover:bg-orange-50 text-orange-600 border-orange-100',
    cardActive: 'border-orange-500 bg-orange-50 shadow-sm',
    iconActive: 'text-orange-600',
    startRing: 'bg-orange-600 ring-orange-200',
    speaker: 'text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-200',
    listenBtn: 'bg-white border-orange-100 hover:bg-orange-50 text-orange-600',
    focusRing: 'focus:ring-orange-300'
  },
  cyan: {
    btn: 'bg-cyan-600 hover:bg-cyan-700',
    iconBtn: 'hover:bg-cyan-50 text-cyan-600 border-cyan-100',
    cardActive: 'border-cyan-500 bg-cyan-50 shadow-sm',
    iconActive: 'text-cyan-600',
    startRing: 'bg-cyan-600 ring-cyan-200',
    speaker: 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100 border-cyan-200',
    listenBtn: 'bg-white border-cyan-100 hover:bg-cyan-50 text-cyan-600',
    focusRing: 'focus:ring-cyan-300'
  },
  slate: {
    btn: 'bg-slate-600 hover:bg-slate-700',
    iconBtn: 'hover:bg-slate-50 text-slate-600 border-slate-100',
    cardActive: 'border-slate-500 bg-slate-50 shadow-sm',
    iconActive: 'text-slate-600',
    startRing: 'bg-slate-600 ring-slate-200',
    speaker: 'text-slate-600 bg-slate-50 hover:bg-slate-100 border-slate-200',
    listenBtn: 'bg-white border-slate-100 hover:bg-slate-50 text-slate-600',
    focusRing: 'focus:ring-slate-300'
  }
};

/**
 * @param {string} color
 */
const getThemeStyle = (color) => MAIN_COLOR_STYLES[color] || MAIN_COLOR_STYLES.blue;

/**
 * Chuẩn hóa khóa so khớp Unicode NFC (không phân biệt hoa/thường và khoảng trắng thừa)
 * @param {any} val
 * @returns {string}
 */
const normalizeNotebookKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

/**
 * Kiểm tra an toàn chỉ số sai (hỗ trợ cả Set lẫn Array khi khôi phục phiên)
 * @param {Set<number> | number[] | null | undefined} wrongCollection
 * @param {number} idx
 * @returns {boolean}
 */
const hasWrongIndex = (wrongCollection, idx) => {
  if (!wrongCollection) return false;
  if (wrongCollection instanceof Set || typeof (/** @type {any} */ (wrongCollection).has) === 'function') {
    return /** @type {Set<number>} */ (wrongCollection).has(idx);
  }
  if (Array.isArray(wrongCollection)) {
    return wrongCollection.includes(idx);
  }
  return false;
};

/**
 * Chuẩn hóa giá trị thời gian giới hạn từ LocalStorage
 * @param {any} val
 * @returns {number}
 */
const sanitizeTimeLimit = (val) => {
  const num = Number(val);
  return VALID_TIME_LIMITS.includes(num) ? num : 30;
};

/**
 * Đọc cấu hình đã lưu từ LocalStorage qua Utils.safeJsonParse
 * @returns {Record<string, any>}
 */
const getSavedQuizConfig = () => {
  try {
    const parsed = Utils.safeJsonParse('fc_quiz_config', {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.warn('[QuizUI] Load quiz config failed:', e);
    return {};
  }
};

/**
 * Lưu cấu hình an toàn qua Utils.safeLocalStorageSet (0 lỗi Radar R05)
 * @param {Record<string, any>} config
 */
const saveQuizConfig = (config) => {
  try {
    Utils.safeLocalStorageSet('fc_quiz_config', config);
  } catch (e) {
    console.warn('[QuizUI] Save quiz config failed:', e);
  }
};

/**
 * Định dạng nhãn Level thân thiện cho GlobalLoadingScreen (hỗ trợ cả mảng nhiều cấp độ)
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

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (QUIZ SETUP)
// ============================================================================
export const QuizSetup = ({
  mainColor = 'blue',
  lang = 'en',
  currentLevel = undefined,
  onStart = undefined,
  onBack = undefined,
  onOpenAiConfig = undefined
}) => {
  const theme = getThemeStyle(mainColor);
  const initialCfg = useMemo(() => getSavedQuizConfig(), []);

  const [sourceMode, setSourceMode] = useState(() => initialCfg.sourceMode ?? 'card');
  const [timerMode, setTimerMode] = useState(() => Boolean(initialCfg.timerMode ?? false));
  const [listenMode, setListenMode] = useState(() => Boolean(initialCfg.listenMode ?? false));
  const [hardMode, setHardMode] = useState(() => Boolean(initialCfg.hardMode ?? false));
  const [aiMode, setAiMode] = useState(() => Boolean(initialCfg.aiMode ?? false));
  const [timeLimit, setTimeLimit] = useState(() => sanitizeTimeLimit(initialCfg.timeLimit));
  const [askMode, setAskMode] = useState(() => initialCfg.askMode ?? 'term');
  const [showPronun, setShowPronun] = useState(() => Boolean(initialCfg.showPronun ?? false));
  const [autoReadAnswer, setAutoReadAnswer] = useState(() =>
    Boolean(initialCfg.autoReadAnswer ?? false)
  );
  const [suddenDeath, setSuddenDeath] = useState(() => Boolean(initialCfg.suddenDeath ?? false));
  const [grammarFocus, setGrammarFocus] = useState(() => initialCfg.grammarFocus ?? 'random');

  // Lấy danh sách chuyên đề ngữ pháp theo ngôn ngữ & trình độ hiện tại (ES Module chuẩn)
  const grammarTopics = useMemo(() => {
    const repLevel = getSafeLevelString(
      currentLevel,
      lang === 'zh' ? 'zh_level_1' : 'en_level_4'
    );
    if (typeof getGrammarTopics === 'function') {
      const list = getGrammarTopics('quiz', lang, repLevel);
      return Array.isArray(list) ? list : [];
    }
    return [];
  }, [lang, currentLevel]);

  // Kiểm duyệt grammarFocus theo danh sách chuyên đề hiện hành
  const effectiveGrammarFocus = useMemo(() => {
    if (!grammarFocus || grammarFocus === 'random') return 'random';
    const isValid = grammarTopics.some((topic) => topic && topic.id === grammarFocus);
    return isValid ? grammarFocus : 'random';
  }, [grammarFocus, grammarTopics]);

  useEffect(() => {
    if (grammarFocus !== effectiveGrammarFocus) {
      setGrammarFocus(effectiveGrammarFocus);
    }
  }, [grammarFocus, effectiveGrammarFocus]);

  const groupedTopics = useMemo(() => {
    return grammarTopics.reduce(
      /** @param {Record<string, Array<any>>} acc */
      (acc, topic) => {
        const grp = topic?.group || 'Chuyên đề Khác';
        if (!acc[grp]) acc[grp] = [];
        acc[grp].push(topic);
        return acc;
      },
      /** @type {Record<string, Array<any>>} */ ({})
    );
  }, [grammarTopics]);

  // Ép bật AI khi dùng nguồn AI Tự Sinh hoặc chọn Khó + Hỏi Từ ở chế độ Thẻ cá nhân
  const isAiForced = hardMode && askMode === 'term' && sourceMode === 'card';
  const effectiveAiMode = sourceMode === 'ai_pure' ? true : isAiForced ? true : aiMode;

  const handleStart = () => {
    const baseConfig = {
      timerMode,
      listenMode,
      hardMode,
      aiMode: effectiveAiMode,
      isAiMode: effectiveAiMode,
      timeLimit: sanitizeTimeLimit(timeLimit),
      askMode,
      showPronun,
      autoReadAnswer,
      sourceMode,
      suddenDeath
    };

    // Bảo lưu effectiveGrammarFocus qua Utils.safeLocalStorageSet
    saveQuizConfig({
      ...baseConfig,
      grammarFocus: effectiveGrammarFocus
    });

    // Chỉ kích hoạt bẫy ngữ pháp ở payload chạy game khi dùng AI Tự Sinh + Chế độ Đảo ngược
    const startPayload = {
      ...baseConfig,
      grammarFocus:
        sourceMode === 'ai_pure' && askMode === 'def' ? effectiveGrammarFocus : 'random'
    };

    if (typeof onStart === 'function') {
      onStart('quiz', startPayload);
    }
  };

  const handleHardModeChange = (val) => {
    setHardMode(val);
    if (!val) {
      setAiMode(false);
    } else if (askMode === 'term' && sourceMode === 'card') {
      setAiMode(true);
    }
  };

  const handleAskModeToggle = (isDefMode) => {
    const nextAskMode = isDefMode ? 'def' : 'term';
    setAskMode(nextAskMode);
    if (hardMode && nextAskMode === 'term' && sourceMode === 'card') {
      setAiMode(true);
    }
  };

  // Chỉ hiển thị Dropdown Ngữ pháp khi dùng nguồn AI Tự sinh và có chuyên đề
  const showGrammarSection = sourceMode === 'ai_pure';
  const isGrammarDisabled = askMode !== 'def';

  let aiSubtitle = '';
  if (sourceMode === 'ai_pure') {
    aiSubtitle = '(Chế độ Tự sinh đã bao gồm AI)';
  } else if (!hardMode) {
    aiSubtitle = '(Yêu cầu bật Chế độ Khó)';
  } else if (isAiForced) {
    aiSubtitle = 'Bắt buộc dùng AI để chặn lỗi chính tả tiếng Việt';
  } else {
    aiSubtitle = effectiveAiMode ? 'AI tạo nhiễu thông minh' : 'Thuật toán nội bộ';
  }

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-3xl h-full animate-in slide-in-from-right-8 px-2 sm:px-4">
      <div className="w-full flex items-center justify-between mb-4 mt-2 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          title="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Cấu hình Trắc Nghiệm</h2>
        {onOpenAiConfig ? (
          <button
            type="button"
            onClick={onOpenAiConfig}
            className={`p-2 rounded-full transition-colors shadow-sm border ${theme.iconBtn}`}
            title="Cài đặt Lõi AI (Tốc độ, Băng đạn)"
          >
            <Icons.Sparkles size={20} />
          </button>
        ) : (
          <div className="w-10"></div>
        )}
      </div>

      <div className="w-full space-y-4 flex-1 overflow-y-auto custom-scrollbar p-1 pb-4">
        {/* Bảng chọn Nguồn câu hỏi */}
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
                <div className="text-[10px] text-gray-500">Trắc nghiệm Flashcard</div>
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
                <div className="text-[10px] text-gray-500">Tạo câu đố mới vô tận</div>
              </div>
            </button>
          </div>
        </div>

        {/* Bảng chọn Ngữ pháp */}
        {showGrammarSection && grammarTopics.length > 0 && (
          <div className="mb-2 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in fade-in">
            <label className="flex items-center gap-1.5 text-sm font-bold text-indigo-800 mb-2">
              <Icons.Target size={16} /> Chuyên đề Ngữ pháp (Bẫy AI)
            </label>
            <select
              value={effectiveGrammarFocus}
              onChange={(e) => setGrammarFocus(e.target.value)}
              disabled={isGrammarDisabled}
              className={`w-full p-3 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all ${
                isGrammarDisabled
                  ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-70 cursor-not-allowed'
                  : 'bg-white border-indigo-200 text-gray-700'
              }`}
            >
              <option value="random">🎲 Trộn ngẫu nhiên toàn bộ</option>
              {Object.keys(groupedTopics).map((group) => (
                <optgroup key={group} label={`--- ${group} ---`}>
                  {groupedTopics[group].map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {isGrammarDisabled ? (
              <p className="text-[10px] text-red-500 mt-1.5 italic font-bold">
                ⚠️ Bẫy ngữ pháp chỉ hoạt động khi bạn bật Chế độ Đảo ngược (Đáp án là ngoại ngữ).
              </p>
            ) : (
              <p className="text-[10px] text-indigo-500 mt-1.5 italic">
                * AI sẽ cố tình tạo đáp án sai xoay quanh ngữ pháp này.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          <div className="space-y-3">
            <MenuToggle
              active={askMode === 'def'}
              setActive={handleAskModeToggle}
              icon={Icons.RefreshCw}
              color="teal"
              title="Chế độ Đảo ngược"
              subtitle={askMode === 'def' ? 'Hỏi Nghĩa ➔ Chọn Từ' : 'Hỏi Từ ➔ Chọn Nghĩa'}
              disabled={false}
              extra={null}
            />
            <MenuToggle
              active={hardMode}
              setActive={handleHardModeChange}
              icon={Icons.Layers}
              color="red"
              title="Chế độ Khó (Hard Mode)"
              subtitle={hardMode ? 'Bẫy thông minh, bóp méo từ' : 'Bẫy cơ bản'}
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
              disabled={!hardMode || sourceMode === 'ai_pure' || isAiForced}
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
          </div>

          <div className="space-y-3">
            <MenuToggle
              active={listenMode}
              setActive={setListenMode}
              icon={Icons.Headphones}
              color="blue"
              title="Luyện Nghe"
              subtitle="Nghe âm thanh chọn đáp án"
              disabled={false}
              extra={null}
            />
            <MenuToggle
              active={showPronun}
              setActive={setShowPronun}
              icon={Icons.Eye}
              color="indigo"
              title="Hiển thị phiên âm"
              subtitle="Gợi ý cách đọc (Tắt khi Luyện nghe)"
              disabled={askMode === 'def' || listenMode}
              extra={null}
            />
            <MenuToggle
              active={autoReadAnswer}
              setActive={setAutoReadAnswer}
              icon={Icons.Volume2}
              color="pink"
              title="Đọc lại đáp án"
              subtitle="Chờ đọc xong đáp án mới chuyển câu"
              disabled={false}
              extra={null}
            />
            <MenuToggle
              active={timerMode}
              setActive={setTimerMode}
              icon={Icons.Clock}
              color="orange"
              title="Giới hạn thời gian"
              subtitle={timerMode ? `${timeLimit} giây / câu` : 'Thoải mái thời gian'}
              disabled={false}
              extra={
                <div className="mt-3 pt-2 border-t border-orange-100 flex justify-between items-center animate-in fade-in">
                  <span className="text-[10px] font-bold text-orange-400 uppercase">
                    Chọn thời gian:
                  </span>
                  <div className="flex gap-1">
                    {VALID_TIME_LIMITS.map((sec) => (
                      <button
                        type="button"
                        key={sec}
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
        </div>
      </div>

      <div className="w-full mt-2 pt-4 border-t border-gray-100 bg-white pb-safe shrink-0 flex justify-center">
        <button
          type="button"
          onClick={handleStart}
          className={`w-full max-w-sm py-4 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform ${theme.btn}`}
        >
          <Icons.Play size={24} /> BẮT ĐẦU CHƠI
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH KẾT QUẢ (GAME RESULT)
// ============================================================================
export const GameResult = ({
  mainColor = 'blue',
  onBack = undefined,
  correctCount = 0,
  wrongCount = 0
}) => {
  const theme = getThemeStyle(mainColor);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Bỏ qua an toàn
    }
  }, []);

  const safeCorrect = Math.max(0, Number(correctCount) || 0);
  const safeWrong = Math.max(0, Number(wrongCount) || 0);
  const totalPlayed = safeCorrect + safeWrong;
  const accuracy = totalPlayed > 0 ? Math.round((safeCorrect / totalPlayed) * 100) : 0;

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-sm text-center animate-in zoom-in">
      <div className="text-6xl mb-4">🎯</div>
      <h2 className="text-2xl font-black text-gray-800 mb-6">Kết quả</h2>
      <div className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 flex justify-around mb-8 shadow-sm">
        <div className="text-center">
          <div className="text-xs text-green-500 uppercase font-bold tracking-wider mb-1">
            Đúng
          </div>
          <div className="text-3xl font-black text-green-600">{safeCorrect}</div>
        </div>
        <div className="text-center border-l border-gray-300 pl-4">
          <div className="text-xs text-red-500 uppercase font-bold tracking-wider mb-1">
            Sai
          </div>
          <div className="text-3xl font-black text-red-500">{safeWrong}</div>
        </div>
        <div className="text-center border-l border-gray-300 pl-4">
          <div className="text-xs text-blue-500 uppercase font-bold tracking-wider mb-1">
            Tỷ lệ
          </div>
          <div className="text-3xl font-black text-blue-600">{accuracy}%</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onBack}
        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-all ${theme.btn}`}
      >
        Hoàn tất
      </button>
    </div>
  );
};

// ============================================================================
// 3. MÀN HÌNH CHƠI (GAME PLAY SCREEN)
// ============================================================================
export const GamePlayScreen = ({
  t = undefined,
  mainColor = 'blue',
  currentQuestionData = null,
  streak = 0,
  gameMode = 'read',
  // Giữ prop setGameMode để tương thích ngược chữ ký (không gọi tắt vĩnh viễn chế độ Luyện nghe)
  setGameMode: _setGameMode = undefined,
  isAudioPlaying = false,
  playSequence = undefined,
  onBookmark = undefined,
  isInNotebook = false,
  onPlay = undefined,
  onPlayOption = undefined,
  selectedOptionIndex = null,
  isChecking = false,
  clickedWrongIndices = new Set(),
  hasStartedListening = true,
  handleAnswer = undefined,
  isAiMode = false,
  showChanceToast = false,
  isGenerating = false,
  timerMode = false,
  timeLeft = 30,
  totalTime = 30,
  isRoundStarted = true,
  onStartRound = undefined,
  onEndGame = undefined,
  onPause = undefined,
  onBack = undefined,
  feedbackType = null,
  isPaused = false,
  correctCount = 0,
  wrongCount = 0,
  onSkip = undefined,
  settings = /** @type {Record<string, any>} */ ({}),
  askMode = 'term',
  showPronun = false,
  hardMode = false,
  listenPlayCount = 0,
  sourceMode = undefined,
  config = /** @type {Record<string, any>} */ ({}),
  aiWaitTime = 0,
  resultTimer = 0,
  isResultPaused = false,
  toggleResultPause = undefined,
  onNext = undefined,
  aiAmmoCount = 0,
  notebook = []
}) => {
  const theme = getThemeStyle(mainColor);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  // Đóng Modal xác nhận thoát bằng phím Escape (A11y chuẩn)
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

  // Thống nhất nguồn sourceMode dùng xuyên suốt màn hình chơi
  const effectiveSourceMode = sourceMode || config?.sourceMode || 'card';

  // Tập chỉ mục Sổ tay chuẩn hóa Unicode NFC giúp tra cứu O(1) chính xác
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

  const stopBrowserSpeech = () => {
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // Bỏ qua an toàn
    }
  };

  // Thoát từ Loading / Lỗi nạp dữ liệu: nếu chưa trả lời câu nào (0/0) thì quay thẳng về Menu
  const handleExitOrAbort = () => {
    stopBrowserSpeech();
    const totalAnswered = (Number(correctCount) || 0) + (Number(wrongCount) || 0);
    if (totalAnswered === 0 && typeof onBack === 'function') {
      onBack();
      return;
    }
    if (typeof onEndGame === 'function') {
      onEndGame({ correct: correctCount, wrong: wrongCount });
    }
  };

  const handleConfirmExit = () => {
    setShowConfirmEnd(false);
    stopBrowserSpeech();
    if (typeof onEndGame === 'function') {
      onEndGame({ correct: correctCount, wrong: wrongCount });
    }
  };

  // [SILENT OFFLINE] Chặn đứng GlobalLoadingScreen nếu là thẻ offline
  if (isGenerating && !currentQuestionData) {
    if (effectiveSourceMode === 'card' && !isAiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }

    return (
      <GlobalLoadingScreen
        duration={22}
        onComplete={undefined}
        onCancel={handleExitOrAbort}
        queueLength={aiAmmoCount}
        text={
          effectiveSourceMode === 'ai_pure'
            ? 'AI đang sáng tác câu đố...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={
          effectiveSourceMode === 'ai_pure'
            ? 'Đang nạp câu hỏi từ động cơ AI...'
            : 'Vui lòng chờ trong giây lát...'
        }
        mainColor={mainColor}
        levelStr={effectiveSourceMode === 'ai_pure' ? formatLevelBadge(config?.level) : ''}
      />
    );
  }

  if (!isGenerating && !currentQuestionData) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 items-center justify-center animate-in fade-in p-6 text-center">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">Lỗi nạp dữ liệu</h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được câu hỏi. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.
        </p>
        <button
          type="button"
          onClick={handleExitOrAbort}
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  const isLocked = (timerMode && !isRoundStarted) || isPaused;
  const contentBlurClass = isLocked ? 'blur-sm opacity-50 pointer-events-none select-none' : '';
  const isReverse = askMode === 'def';
  const isReverseListen = gameMode === 'listen' && isReverse;

  // Khóa Bookmark nếu chưa trả lời (isChecking = false) VÀ đang ở chế độ rủi ro lộ đáp án
  const isBookmarkLocked = !isChecking && (askMode === 'def' || gameMode === 'listen');

  // Đồng bộ trạng thái Bookmark của câu hỏi chính theo chuẩn Unicode NFC
  const isQuestionInNotebook = Boolean(
    isInNotebook || notebookKeySet.has(normalizeNotebookKey(currentQuestionData?.question?.term))
  );

  const isLimitedListen = gameMode === 'listen' && hardMode && !timerMode;
  const remainingListens = Math.max(0, 2 - (Number(listenPlayCount) || 0));
  const isListenExhausted = isLimitedListen && remainingListens <= 0;

  const getOptionClass = (opt, i) => {
    const isListenLocked = gameMode === 'listen' && !hasStartedListening && !isReverseListen;
    if (isListenLocked) {
      return 'bg-gray-50 border-gray-200 text-gray-400 opacity-80 cursor-not-allowed select-none';
    }
    if (isChecking) {
      if (opt.isCorrect) {
        return 'bg-green-100 border-green-500 text-green-900 shadow-md transform scale-[1.02] font-bold cursor-default';
      }
      if (i === selectedOptionIndex && !opt.isCorrect) {
        return 'bg-red-100 border-red-500 text-red-900 font-bold cursor-default';
      }
      return 'bg-gray-50 border-gray-100 text-gray-300 opacity-60 cursor-default';
    }
    if (hasWrongIndex(clickedWrongIndices, i)) {
      return 'bg-red-50 border-red-200 text-red-300 opacity-80 cursor-not-allowed';
    }
    return 'bg-white border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:shadow-md active:scale-95 cursor-pointer';
  };

  const getLabelClass = (opt, i) => {
    if (isChecking && opt.isCorrect) return 'bg-green-200 text-green-800';
    if (isChecking && i === selectedOptionIndex && !opt.isCorrect) return 'bg-red-200 text-red-800';
    return 'bg-white text-gray-500';
  };

  const optionsList = Array.isArray(currentQuestionData?.options)
    ? currentQuestionData.options
    : [];
  const totalOptions = optionsList.length;
  const isOddOptions = totalOptions % 2 !== 0;

  const isSentenceMode = config?.dataMode === 'sentence';
  const questionText = isReverse
    ? currentQuestionData?.question?.definition || currentQuestionData?.question?.term || '...'
    : isSentenceMode && currentQuestionData?.question?.displaySentence
    ? currentQuestionData.question.displaySentence
    : currentQuestionData?.question?.term || '...';

  const showPronunciation =
    !isReverse && showPronun && currentQuestionData?.question?.pronunciation;

  // Chỉ cắt tỉa phần nghĩa phụ ở chiều xuôi (!isReverse) để bảo vệ đáp án ngoại ngữ
  let delimCount = 0;
  if (!isReverse && !isSentenceMode) {
    optionsList.forEach((opt) => {
      if (opt && opt.text && /[,/;]/.test(opt.text)) delimCount++;
    });
  }
  const isImbalanced = !isReverse && !isSentenceMode && delimCount > 0 && delimCount < totalOptions;

  // Lớp nút "Tiếp theo" hoàn toàn tĩnh (an toàn 100% với Tailwind JIT)
  const nextBtnColorClass =
    feedbackType === 'correct' ? 'bg-green-500 hover:bg-green-600' : theme.btn;

  // Xử lý nút phát âm thanh trên từng đáp án
  const handleOptionSpeak = (e, textToSpeak, optIndex) => {
    e.stopPropagation();
    if (isLocked || !textToSpeak) return;
    // Khi đang ở chế độ Đảo ngược + Nghe (Hard Mode) và chưa trả lời: chặn bẻ khóa lượt nghe
    if (isReverseListen && !isChecking && isListenExhausted) return;

    if (typeof onPlayOption === 'function') {
      onPlayOption(textToSpeak, optIndex, { isChecking, isReverseListen });
    } else if (typeof onPlay === 'function') {
      onPlay(textToSpeak);
    }
  };

  // Xử lý bấm "Không nghe được? (Chấp nhận sai để xem chữ)" - KHÔNG tắt vĩnh viễn chế độ Luyện nghe
  const handleGiveUpListen = (e) => {
    e.stopPropagation();
    if (isLocked || isChecking) return;
    if (typeof handleAnswer === 'function') {
      handleAnswer(999, false, false, true);
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 animate-in overflow-hidden relative">
      {/* POPUP XÁC NHẬN THOÁT GAME (A11y Dialog + Backdrop + Escape) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quiz-confirm-end-title"
          onClick={() => setShowConfirmEnd(false)}
          className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center"
          >
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 id="quiz-confirm-end-title" className="text-xl font-black text-gray-800 mb-2">
              Kết thúc sớm?
            </h3>
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
                onClick={handleConfirmExit}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Thoát ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {showChanceToast && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-in fade-in pointer-events-none">
          <div className="bg-orange-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border-2 border-white">
            <Icons.AlertCircle size={20} /> {t ? t('secondChance') : 'Cơ hội thứ 2!'}
          </div>
        </div>
      )}

      {feedbackType === 'timeout' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-in fade-in pointer-events-none">
          <div className="bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border-2 border-white">
            <Icons.Clock size={20} /> HẾT GIỜ!
          </div>
        </div>
      )}

      {isPaused && (
        <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
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

      {/* HEADER */}
      <div className="flex flex-col bg-white border-b shadow-sm z-10 shrink-0">
        <div className="flex justify-between items-center p-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="text-gray-500 hover:text-gray-700 p-1"
              title={t ? t('backMenu') : 'Quay lại'}
            >
              <Icons.ChevronLeft size={24} />
            </button>
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
          </div>

          <div className="flex items-center gap-3 bg-gray-100 px-3 py-1.5 rounded-full shadow-inner">
            <div className="flex items-center gap-1">
              <span className="text-orange-500 font-bold">🔥 {streak}</span>
            </div>
            <span className="text-gray-300 text-xs">|</span>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="text-green-600">{correctCount}</span>
              <span className="text-gray-300">/</span>
              <span className="text-red-500">{wrongCount}</span>
            </div>
            {timerMode && (
              <>
                <span className="text-gray-300 text-xs">|</span>
                <div
                  className={`flex items-center gap-1 font-mono font-bold ${getTimerColor(
                    timeLeft,
                    totalTime
                  )}`}
                >
                  <Icons.Clock size={16} /> {timeLeft}s
                </div>
              </>
            )}
          </div>

          {/* Nút Bookmark duy nhất cho câu hỏi chính (đồng bộ trạng thái qua notebookKeySet NFC) */}
          <div className="flex items-center gap-1 sm:gap-2">
            {!isBookmarkLocked ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentQuestionData?.question && onBookmark) {
                    onBookmark({
                      isSmartTarget: true,
                      display: currentQuestionData.question.term,
                      save: currentQuestionData.question.term,
                      analysis: currentQuestionData.question.definition
                    });
                  }
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isQuestionInNotebook
                    ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                    : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
                }`}
                title={
                  isQuestionInNotebook
                    ? 'Đã lưu trong Sổ tay'
                    : t
                    ? t('addToNotebook')
                    : 'Lưu vào Sổ tay'
                }
              >
                <Icons.Bookmark size={20} fill={isQuestionInNotebook ? 'currentColor' : 'none'} />
              </button>
            ) : (
              <div
                className="p-2 text-gray-300 opacity-50 cursor-not-allowed"
                title={
                  gameMode === 'listen'
                    ? 'Đang ở chế độ Nghe. Trả lời xong mới được lưu!'
                    : 'Đang ở chế độ hỏi Nghĩa. Trả lời xong mới được lưu!'
                }
              >
                <Icons.Bookmark size={20} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-4 gap-2 relative">
        {isLocked && !isPaused && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/10 backdrop-blur-[2px]">
            <button
              type="button"
              onClick={onStartRound}
              className={`group relative flex items-center justify-center w-24 h-24 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 border-4 border-white ring-4 animate-in zoom-in ${theme.startRing}`}
            >
              <Icons.Play size={40} fill="currentColor" className="ml-1" />
              <span className="absolute -bottom-8 font-bold text-gray-600 bg-white px-3 py-1 rounded-full shadow text-sm">
                BẮT ĐẦU
              </span>
            </button>
          </div>
        )}

        <div className="w-full flex flex-wrap justify-end items-center mb-1 gap-2">
          {/* Nhãn diện nguồn gốc AI và Đồng hồ Throttling KÈM AMMO COUNTER */}
          {currentQuestionData?.question?._isRescued || currentQuestionData?._isRescued ? (
            <span
              className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
            </span>
          ) : currentQuestionData?.isAiGenerated ? (
            <span
              className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
              title="Câu hỏi hoặc đáp án được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm"
              title="Trích xuất từ Bộ thẻ của bạn"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(isAiMode || effectiveSourceMode === 'ai_pure') && aiAmmoCount > 0 && (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
              title={`Đã nạp sẵn ${aiAmmoCount} câu AI`}
            >
              <Icons.Database size={12} className="text-blue-500" /> Đã nạp: {aiAmmoCount}
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

          <span
            className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider cursor-default ${
              hardMode
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-green-100 text-green-700 border border-green-200'
            }`}
          >
            {hardMode ? 'Khó' : 'Cơ bản'}
          </span>
        </div>

        {/* KHUNG CÂU HỎI CHÍNH */}
        <div
          className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative min-h-[160px] flex items-center justify-center animate-in transition-all duration-300 ${
            isLocked ? 'blur-md pointer-events-none select-none' : ''
          }`}
        >
          <div className="text-center w-full px-2 sm:px-6">
            {gameMode === 'read' || isChecking || isReverseListen ? (
              <div className="flex flex-col gap-2 animate-in fade-in items-center">
                <div
                  className="text-gray-800 break-words leading-tight"
                  style={{
                    fontWeight: settings?.fontWeight || 'bold',
                    fontFamily: isReverse ? 'inherit' : Utils.getFontFamily(settings),
                    fontSize: settings?.fontSize ? `${settings.fontSize}rem` : '1.875rem'
                  }}
                >
                  {questionText}
                </div>
                {showPronunciation && (
                  <div className="text-lg text-gray-500 font-medium">
                    {currentQuestionData.question.pronunciation}
                  </div>
                )}

                {/* Thanh điều khiển nghe & đếm lượt cho chế độ Đảo ngược + Luyện Nghe */}
                {isReverseListen && !isChecking && (
                  <div className="flex flex-col items-center gap-2 mt-2 pt-2 border-t border-gray-100 w-full max-w-sm">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => !isLocked && playSequence && playSequence()}
                        disabled={isAudioPlaying || isListenExhausted || isLocked}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold shadow-sm transition-all ${
                          isListenExhausted || isLocked
                            ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed'
                            : isAudioPlaying
                            ? 'opacity-60 cursor-not-allowed bg-blue-50 border-blue-200 text-blue-600'
                            : `${theme.listenBtn} hover:scale-105 active:scale-95`
                        }`}
                      >
                        <Icons.Volume2
                          size={16}
                          className={isAudioPlaying ? 'animate-pulse' : ''}
                        />
                        <span>{isAudioPlaying ? 'Đang phát...' : 'Nghe tất cả đáp án'}</span>
                      </button>

                      {isLimitedListen && (
                        <span className="text-xs text-gray-500 font-bold bg-gray-100 px-2.5 py-1 rounded-full">
                          Lượt nghe: {remainingListens}/2
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleGiveUpListen}
                      className="text-[10px] sm:text-xs text-gray-400 hover:text-red-500 underline font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={isLocked || isChecking}
                    >
                      Không nghe được? (Chấp nhận sai để xem chữ)
                    </button>
                  </div>
                )}

                {gameMode === 'listen' && isChecking && (
                  <div className="text-xs text-gray-400 italic mt-1">
                    (Đáp án của âm thanh vừa nghe)
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in">
                <button
                  type="button"
                  onClick={() => !isLocked && playSequence && playSequence()}
                  disabled={isAudioPlaying || isListenExhausted || isLocked}
                  className={`flex flex-col items-center gap-1 p-5 rounded-full border-4 shadow-md transition-all ${
                    isListenExhausted || isLocked
                      ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed'
                      : isAudioPlaying
                      ? 'opacity-50 cursor-not-allowed bg-blue-50 border-blue-200 text-blue-500'
                      : `${theme.listenBtn} hover:scale-105 active:scale-95`
                  }`}
                >
                  <Icons.Volume2 size={40} className={isAudioPlaying ? 'animate-pulse' : ''} />
                  <span className="text-xs font-bold uppercase">
                    {t ? t('startListen') : 'Nghe'}
                  </span>
                </button>
                {isLimitedListen && (
                  <div className="text-xs text-gray-500 font-bold mt-1">
                    Lượt nghe: {remainingListens}/2
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleGiveUpListen}
                  className="text-[10px] sm:text-xs text-gray-400 hover:text-red-500 underline mt-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={isLocked || isChecking}
                >
                  Không nghe được? (Chấp nhận sai để xem chữ)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* LƯỚI ĐÁP ÁN */}
        <div
          className={`flex flex-col gap-3 w-full mt-2 transition-all duration-300 ${contentBlurClass}`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {optionsList.map((opt, i) => {
              const labelChar = String.fromCharCode(65 + i);
              const isClickedWrong = hasWrongIndex(clickedWrongIndices, i);
              const btnClass = getOptionClass(opt, i);
              const isLastAndOdd = isOddOptions && i === totalOptions - 1;
              const icon =
                isChecking && opt.isCorrect ? (
                  <Icons.CheckCircle size={20} className="text-green-700" />
                ) : (isChecking && i === selectedOptionIndex && !opt.isCorrect) ||
                  isClickedWrong ? (
                  <Icons.X
                    size={20}
                    className={isClickedWrong ? 'text-red-300' : 'text-red-700'}
                  />
                ) : null;

              const optionDisplayText =
                isReverseListen && !isChecking ? `Đáp án ${labelChar}` : opt.text || '';

              // Chỉ tách phần nghĩa phụ khi chiều xuôi (!isReverse)
              let mainText = optionDisplayText;
              let subText = '';
              if (isImbalanced && !isReverse && !isReverseListen && optionDisplayText) {
                const match = optionDisplayText.match(/([,/;])/);
                if (match && typeof match.index === 'number' && match.index > 0) {
                  mainText = optionDisplayText.substring(0, match.index).trim();
                  subText = optionDisplayText.substring(match.index).trim();
                }
              }

              // Tính toán hiển thị và trạng thái loa tại đáp án
              const textToSpeak = isReverse ? opt.text : opt.meaning;
              const showOptionSpeaker =
                Boolean(textToSpeak) && ((isReverseListen && !isChecking) || isChecking);
              const isOptionSpeakerDisabled =
                isLocked || (isReverseListen && !isChecking && isListenExhausted);

              let speakerColorClass = theme.speaker;
              if (isOptionSpeakerDisabled) {
                speakerColorClass =
                  'text-gray-400 bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed';
              } else if (isChecking) {
                if (opt.isCorrect) {
                  speakerColorClass =
                    'text-green-700 bg-green-200 hover:bg-green-300 border-green-300';
                } else if (i === selectedOptionIndex && !opt.isCorrect) {
                  speakerColorClass = 'text-red-700 bg-red-200 hover:bg-red-300 border-red-300';
                } else {
                  speakerColorClass =
                    'text-gray-500 bg-gray-100 hover:bg-gray-200 border-gray-200 opacity-80';
                }
              }

              // Tra cứu Sổ tay chuẩn Unicode NFC
              const foreignWord = isReverse ? opt.text : opt.meaning;
              const vietnameseMeaning = isReverse ? opt.meaning : opt.text;
              const isOptInNotebook = notebookKeySet.has(normalizeNotebookKey(foreignWord));

              const isListenLocked =
                gameMode === 'listen' && !hasStartedListening && !isReverseListen;
              const isDisabled = isChecking || isClickedWrong || isListenLocked || isLocked;

              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={isDisabled ? -1 : 0}
                  aria-disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled && handleAnswer) {
                      handleAnswer(i, opt.isCorrect);
                    }
                  }}
                  onKeyDown={(e) => {
                    // Chặn nổi bọt bàn phím từ các nút con (Loa / Bookmark) bên trong thẻ đáp án
                    if (e.target !== e.currentTarget) return;
                    if (!isDisabled && handleAnswer && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleAnswer(i, opt.isCorrect);
                    }
                  }}
                  className={`w-full p-4 border-2 rounded-xl shadow-sm transition-all text-left flex items-center justify-between outline-none focus:ring-2 ${theme.focusRing} ${btnClass} ${
                    isLastAndOdd ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="flex items-center w-full min-w-0">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold mr-3 flex-none shadow-inner ${getLabelClass(
                        opt,
                        i
                      )}`}
                    >
                      {labelChar}
                    </span>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span
                        className={`break-words ${isClickedWrong ? 'line-through' : ''} ${
                          isReverse ? 'text-gray-800' : ''
                        } ${isReverseListen && !isChecking ? 'italic text-gray-500' : ''}`}
                        style={{
                          fontWeight: settings?.fontWeight || 'normal',
                          fontSize: settings?.backFontSize
                            ? `${settings.backFontSize}rem`
                            : '1.125rem',
                          fontFamily:
                            isReverse && !isReverseListen
                              ? Utils.getFontFamily(settings)
                              : 'inherit'
                        }}
                      >
                        {mainText}
                      </span>
                      {subText && isChecking && (
                        <span
                          className={`text-[11px] mt-0.5 font-medium opacity-70 animate-in fade-in slide-in-from-top-1 ${
                            isClickedWrong ? 'line-through' : ''
                          }`}
                        >
                          {subText}
                        </span>
                      )}
                      {isChecking && opt.meaning && (
                        <span className="text-sm text-gray-500 italic mt-0.5 animate-in fade-in slide-in-from-top-1 font-medium break-words">
                          {opt.meaning}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center shrink-0 gap-1.5 ml-2">
                    {showOptionSpeaker && (
                      <button
                        type="button"
                        disabled={isOptionSpeakerDisabled}
                        onClick={(e) => handleOptionSpeak(e, textToSpeak, i)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={`p-2 rounded-full flex-none transition-transform border shadow-sm ${
                          isOptionSpeakerDisabled ? '' : 'active:scale-90 cursor-pointer'
                        } ${speakerColorClass}`}
                        title={
                          isOptionSpeakerDisabled
                            ? 'Đã hết lượt nghe ở Chế độ Khó'
                            : 'Nghe phát âm'
                        }
                      >
                        <Icons.Volume2 size={20} />
                      </button>
                    )}
                    {isChecking && foreignWord && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onBookmark) {
                            onBookmark({
                              isSmartTarget: true,
                              display: foreignWord,
                              save: foreignWord,
                              analysis: vietnameseMeaning
                            });
                          }
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={`p-2 rounded-full flex-none transition-transform active:scale-90 border shadow-sm cursor-pointer ${
                          isOptInNotebook
                            ? 'text-yellow-600 bg-yellow-100 hover:bg-yellow-200 border-yellow-300'
                            : 'text-gray-400 bg-gray-50 hover:bg-gray-100 border-gray-200 hover:text-yellow-500'
                        }`}
                        title={isOptInNotebook ? 'Đã lưu trong Sổ tay' : 'Lưu vào Sổ tay'}
                      >
                        <Icons.Bookmark
                          size={20}
                          fill={isOptInNotebook ? 'currentColor' : 'none'}
                        />
                      </button>
                    )}
                    {icon && <div className="flex-none">{icon}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FOOTER (Bố cục Flex chống chồng lấn trên mọi kích thước màn hình) */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between gap-2 sm:gap-3 z-10 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="shrink-0 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 min-w-0 flex justify-center sm:justify-end max-w-md ml-auto">
          {isChecking ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 px-2 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 hover:bg-gray-50 border-gray-200'
                }`}
              >
                {isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : resultTimer < 0 ? (
                  <>
                    <Icons.Volume2 size={16} className="animate-pulse text-blue-500" /> Đang đọc...
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Đợi ({Math.max(0, resultTimer)}s)
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 px-3 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${nextBtnColorClass} ${
                  isGenerating || aiWaitTime > 0 ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'
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
          ) : (
            <button
              type="button"
              onClick={onSkip}
              disabled={aiWaitTime > 0 || isGenerating || isLocked}
              className={`w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ${
                aiWaitTime > 0 || isGenerating || isLocked
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95'
              }`}
            >
              Bỏ qua câu này <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_5_QuizSetup = QuizSetup;
  window.QuizSetup = QuizSetup;
  window.Block5_5_GameResult = GameResult;
  window.GameResult = GameResult;
  window.Block5_5_GamePlayScreen = GamePlayScreen;
  window.GamePlayScreen = GamePlayScreen;
}

export default GamePlayScreen;