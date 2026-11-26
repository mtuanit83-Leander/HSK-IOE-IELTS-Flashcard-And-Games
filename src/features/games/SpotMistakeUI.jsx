// ============================================================================
// FILE 60/85: src/features/games/SpotMistakeUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.10 - SpotMistake Setup & PlayScreen UI V3.6)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 06:18 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (SpotMistakeSetup) và Màn hình chơi chính
//           (SpotMistakePlayScreen) cho trò chơi Tìm Lỗi Sai (Spot Mistake).
//           Nâng cấp Ver 1.0 theo Báo cáo Chẩn đoán V2.0 (report1.md):
//           1. Diệt 1/1 MEDIUM Radar: chuyển fc_spotmistake_config sang
//              Utils.safeJsonParse & Utils.safeLocalStorageSet + kiểm duyệt whitelist.
//           2. Diệt C6 (Gãy tô màu Tiếng Trung & Bookmark): displayChunks ưu tiên
//              tuyệt đối cờ tọa độ chunk.isTarget từ buildQuestionChunks; đồng bộ
//              Bookmark theo tọa độ chunks (hỗ trợ CJK 100%) & khóa chống lộ đáp án
//              khi chưa hoàn thành câu.
//           3. Diệt F16: thay toàn bộ 20+ class Tailwind động sang bảng màu tĩnh
//              SPOT_COLOR_STYLES, sửa handleCorrectionSubmit() đúng 0 tham số (ts2554),
//              nút gạt timerMode chuẩn A11y role="switch", Footer Flex chống đè nút
//              trên Mobile, Modal A11y (role="dialog", Backdrop, Escape).
//           4. Đạt chuẩn 0 Problems tsc/checkJs với đầy đủ JSDoc & default props.
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons, SafeIcon } from '@/components/common/Icons';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import {
  getSafeLevelString,
  formatGameTime,
  getTimerColor
} from './common/gameHelpers';

const VALID_TIME_LIMITS = [15, 30, 45, 60];
const CJK_REGEX = /[\u4e00-\u9fff]/;

/** @type {readonly any[]} */
const EMPTY_ARRAY = Object.freeze([]);
/** @type {Readonly<Record<string, any>>} */
const EMPTY_OBJECT = Object.freeze({});

// Bảng ánh xạ lớp Tailwind tĩnh (chống Tailwind JIT purge khi ghép chuỗi động)
const SPOT_COLOR_STYLES = {
  red: {
    cardActive: 'border-red-500 bg-red-50 shadow-sm text-red-700',
    titleText: 'text-red-700',
    switchActive: 'bg-red-500',
    chipActive: 'bg-red-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-red-600 hover:bg-red-700',
    btnPrimaryIdle: 'bg-red-600 text-white hover:bg-red-700 active:scale-95',
    spinner: 'border-red-200 border-t-red-500',
    resultIcon: 'bg-red-100 text-red-500',
    statText: 'text-red-600',
    progressBar: 'bg-red-500',
    hoverText: 'hover:text-red-500',
    hoverBorder: 'hover:border-red-400',
    inputFocus: 'border-red-200 focus:border-red-500 focus:ring-4 focus:ring-red-100',
    explainTitle: 'text-red-400',
    explainBtn: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    explainSpinner: 'border-red-600 border-t-transparent'
  },
  sky: {
    cardActive: 'border-sky-500 bg-sky-50 shadow-sm text-sky-700',
    titleText: 'text-sky-700',
    switchActive: 'bg-sky-500',
    chipActive: 'bg-sky-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-sky-600 hover:bg-sky-700',
    btnPrimaryIdle: 'bg-sky-600 text-white hover:bg-sky-700 active:scale-95',
    spinner: 'border-sky-200 border-t-sky-500',
    resultIcon: 'bg-sky-100 text-sky-500',
    statText: 'text-sky-600',
    progressBar: 'bg-sky-500',
    hoverText: 'hover:text-sky-500',
    hoverBorder: 'hover:border-sky-400',
    inputFocus: 'border-sky-200 focus:border-sky-500 focus:ring-4 focus:ring-sky-100',
    explainTitle: 'text-sky-400',
    explainBtn: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
    explainSpinner: 'border-sky-600 border-t-transparent'
  },
  blue: {
    cardActive: 'border-blue-500 bg-blue-50 shadow-sm text-blue-700',
    titleText: 'text-blue-700',
    switchActive: 'bg-blue-500',
    chipActive: 'bg-blue-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-blue-600 hover:bg-blue-700',
    btnPrimaryIdle: 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95',
    spinner: 'border-blue-200 border-t-blue-500',
    resultIcon: 'bg-blue-100 text-blue-500',
    statText: 'text-blue-600',
    progressBar: 'bg-blue-500',
    hoverText: 'hover:text-blue-500',
    hoverBorder: 'hover:border-blue-400',
    inputFocus: 'border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100',
    explainTitle: 'text-blue-400',
    explainBtn: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    explainSpinner: 'border-blue-600 border-t-transparent'
  },
  indigo: {
    cardActive: 'border-indigo-500 bg-indigo-50 shadow-sm text-indigo-700',
    titleText: 'text-indigo-700',
    switchActive: 'bg-indigo-500',
    chipActive: 'bg-indigo-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-indigo-600 hover:bg-indigo-700',
    btnPrimaryIdle: 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95',
    spinner: 'border-indigo-200 border-t-indigo-500',
    resultIcon: 'bg-indigo-100 text-indigo-500',
    statText: 'text-indigo-600',
    progressBar: 'bg-indigo-500',
    hoverText: 'hover:text-indigo-500',
    hoverBorder: 'hover:border-indigo-400',
    inputFocus: 'border-indigo-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100',
    explainTitle: 'text-indigo-400',
    explainBtn: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    explainSpinner: 'border-indigo-600 border-t-transparent'
  },
  emerald: {
    cardActive: 'border-emerald-500 bg-emerald-50 shadow-sm text-emerald-700',
    titleText: 'text-emerald-700',
    switchActive: 'bg-emerald-500',
    chipActive: 'bg-emerald-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-emerald-600 hover:bg-emerald-700',
    btnPrimaryIdle: 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95',
    spinner: 'border-emerald-200 border-t-emerald-500',
    resultIcon: 'bg-emerald-100 text-emerald-500',
    statText: 'text-emerald-600',
    progressBar: 'bg-emerald-500',
    hoverText: 'hover:text-emerald-500',
    hoverBorder: 'hover:border-emerald-400',
    inputFocus: 'border-emerald-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100',
    explainTitle: 'text-emerald-400',
    explainBtn: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    explainSpinner: 'border-emerald-600 border-t-transparent'
  },
  orange: {
    cardActive: 'border-orange-500 bg-orange-50 shadow-sm text-orange-700',
    titleText: 'text-orange-700',
    switchActive: 'bg-orange-500',
    chipActive: 'bg-orange-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-orange-600 hover:bg-orange-700',
    btnPrimaryIdle: 'bg-orange-600 text-white hover:bg-orange-700 active:scale-95',
    spinner: 'border-orange-200 border-t-orange-500',
    resultIcon: 'bg-orange-100 text-orange-500',
    statText: 'text-orange-600',
    progressBar: 'bg-orange-500',
    hoverText: 'hover:text-orange-500',
    hoverBorder: 'hover:border-orange-400',
    inputFocus: 'border-orange-200 focus:border-orange-500 focus:ring-4 focus:ring-orange-100',
    explainTitle: 'text-orange-400',
    explainBtn: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
    explainSpinner: 'border-orange-600 border-t-transparent'
  },
  purple: {
    cardActive: 'border-purple-500 bg-purple-50 shadow-sm text-purple-700',
    titleText: 'text-purple-700',
    switchActive: 'bg-purple-500',
    chipActive: 'bg-purple-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-purple-600 hover:bg-purple-700',
    btnPrimaryIdle: 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95',
    spinner: 'border-purple-200 border-t-purple-500',
    resultIcon: 'bg-purple-100 text-purple-500',
    statText: 'text-purple-600',
    progressBar: 'bg-purple-500',
    hoverText: 'hover:text-purple-500',
    hoverBorder: 'hover:border-purple-400',
    inputFocus: 'border-purple-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100',
    explainTitle: 'text-purple-400',
    explainBtn: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    explainSpinner: 'border-purple-600 border-t-transparent'
  },
  cyan: {
    cardActive: 'border-cyan-500 bg-cyan-50 shadow-sm text-cyan-700',
    titleText: 'text-cyan-700',
    switchActive: 'bg-cyan-500',
    chipActive: 'bg-cyan-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-cyan-600 hover:bg-cyan-700',
    btnPrimaryIdle: 'bg-cyan-600 text-white hover:bg-cyan-700 active:scale-95',
    spinner: 'border-cyan-200 border-t-cyan-500',
    resultIcon: 'bg-cyan-100 text-cyan-500',
    statText: 'text-cyan-600',
    progressBar: 'bg-cyan-500',
    hoverText: 'hover:text-cyan-500',
    hoverBorder: 'hover:border-cyan-400',
    inputFocus: 'border-cyan-200 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100',
    explainTitle: 'text-cyan-400',
    explainBtn: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
    explainSpinner: 'border-cyan-600 border-t-transparent'
  },
  slate: {
    cardActive: 'border-slate-500 bg-slate-50 shadow-sm text-slate-700',
    titleText: 'text-slate-700',
    switchActive: 'bg-slate-500',
    chipActive: 'bg-slate-500 text-white shadow-md scale-105',
    btnPrimary: 'bg-slate-600 hover:bg-slate-700',
    btnPrimaryIdle: 'bg-slate-600 text-white hover:bg-slate-700 active:scale-95',
    spinner: 'border-slate-200 border-t-slate-500',
    resultIcon: 'bg-slate-100 text-slate-500',
    statText: 'text-slate-600',
    progressBar: 'bg-slate-500',
    hoverText: 'hover:text-slate-500',
    hoverBorder: 'hover:border-slate-400',
    inputFocus: 'border-slate-200 focus:border-slate-500 focus:ring-4 focus:ring-slate-100',
    explainTitle: 'text-slate-400',
    explainBtn: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
    explainSpinner: 'border-slate-600 border-t-transparent'
  }
};

/**
 * @param {string} color
 */
const getSpotTheme = (color) => SPOT_COLOR_STYLES[color] || SPOT_COLOR_STYLES.red;

/**
 * Kiểm duyệt giới hạn thời gian hợp lệ
 * @param {any} val
 * @returns {number}
 */
const sanitizeSpotTimeLimit = (val) => {
  const num = Number(val);
  return VALID_TIME_LIMITS.includes(num) ? num : 30;
};

/**
 * Đọc cấu hình Tìm Lỗi Sai an toàn qua Utils.safeJsonParse
 * @returns {{ sourceMode: string, difficulty: string, timerMode: boolean, timeLimit: number }}
 */
const getSavedSpotMistakeConfig = () => {
  try {
    const parsed = Utils.safeJsonParse('fc_spotmistake_config', null);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        sourceMode: parsed.sourceMode === 'ai_pure' ? 'ai_pure' : 'card',
        difficulty: parsed.difficulty === 'hard' ? 'hard' : 'easy',
        timerMode: Boolean(parsed.timerMode ?? false),
        timeLimit: sanitizeSpotTimeLimit(parsed.timeLimit)
      };
    }
  } catch (e) {
    console.warn('[SpotMistakeUI] Load config failed:', e);
  }
  return {
    sourceMode: 'card',
    difficulty: 'easy',
    timerMode: false,
    timeLimit: 30
  };
};

/**
 * Lưu cấu hình Tìm Lỗi Sai an toàn qua Utils.safeLocalStorageSet (0 lỗi Radar R05)
 * @param {Record<string, any>} config
 */
const saveSpotMistakeConfig = (config) => {
  try {
    Utils.safeLocalStorageSet('fc_spotmistake_config', config);
  } catch (e) {
    console.warn('[SpotMistakeUI] Save config failed:', e);
  }
};

/**
 * Định dạng nhãn Level thống nhất (hỗ trợ cả mảng Multi-select)
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
 * Gạch chân từng ký tự bằng combining low line (tránh gạch chân khoảng trắng thừa)
 * @param {string} text
 * @returns {string}
 */
const underlineText = (text) => {
  if (!text) return '';
  return Array.from(String(text))
    .map((ch) => (ch.trim() ? `${ch}\u0332` : ch))
    .join('');
};

/**
 * Dựng câu chuẩn sạch & câu gạch chân đáp án chính xác theo tọa độ chunks (hỗ trợ 100% EN & CJK)
 * @param {Record<string, any>} currentQuestion
 * @param {readonly any[]} chunks
 * @param {boolean} isChinese
 * @returns {{ save: string, display: string }}
 */
const buildBookmarkTexts = (currentQuestion, chunks, isChinese) => {
  const wrongSentence = String(currentQuestion?.wrongSentence || '').trim();
  const wrongWord = String(currentQuestion?.wrongWord || '').trim();
  const correction = String(currentQuestion?.correction || '').trim();
  const originTerm = String(currentQuestion?.origin?.term || '').trim();
  const underlinedCorrection = underlineText(correction);

  // Ưu tiên 1: Tái dựng trực tiếp từ tọa độ chunk.isTarget (chính xác tuyệt đối cho cả EN & CJK)
  if (Array.isArray(chunks) && chunks.length > 0 && correction) {
    const targetIndexes = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i]?.isTarget) targetIndexes.push(i);
    }

    if (targetIndexes.length > 0) {
      const firstTarget = targetIndexes[0];
      const targetSet = new Set(targetIndexes);
      const separator = isChinese ? '' : ' ';
      const cleanParts = [];
      const displayParts = [];

      for (let i = 0; i < chunks.length; i++) {
        if (i === firstTarget) {
          cleanParts.push(correction);
          displayParts.push(underlinedCorrection);
        } else if (!targetSet.has(i)) {
          cleanParts.push(String(chunks[i]?.text || ''));
          displayParts.push(String(chunks[i]?.text || ''));
        }
      }

      const rebuiltClean = cleanParts.join(separator).trim();
      const rebuiltDisplay = displayParts.join(separator).trim();
      if (rebuiltClean) {
        return {
          save: originTerm || rebuiltClean,
          display: rebuiltDisplay || rebuiltClean
        };
      }
    }
  }

  // Ưu tiên 2: Thay thế an toàn (không dùng \b cho CJK)
  if (wrongSentence && wrongWord && correction) {
    const escapedWrong = wrongWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let regex = null;
    if (!isChinese && /^[a-z0-9]/i.test(wrongWord) && /[a-z0-9]$/i.test(wrongWord)) {
      try {
        regex = new RegExp(`\\b${escapedWrong}\\b`, 'i');
      } catch {
        regex = null;
      }
    }
    if (!regex || !regex.test(wrongSentence)) {
      regex = new RegExp(escapedWrong, 'i');
    }

    const cleanSentence = wrongSentence.replace(regex, correction);
    const displaySentence = wrongSentence.replace(regex, underlinedCorrection);
    return {
      save: originTerm || cleanSentence || wrongSentence,
      display: displaySentence || originTerm || wrongSentence
    };
  }

  return {
    save: originTerm || wrongSentence,
    display: originTerm || wrongSentence
  };
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (SPOT MISTAKE SETUP)
// ============================================================================
export const SpotMistakeSetup = ({
  mainColor = 'red',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = getSpotTheme(mainColor);
  const initialCfg = useMemo(() => getSavedSpotMistakeConfig(), []);

  const [sourceMode, setSourceMode] = useState(() => initialCfg.sourceMode);
  const [difficulty, setDifficulty] = useState(() => initialCfg.difficulty); // 'easy' | 'hard'
  const [timerMode, setTimerMode] = useState(() => initialCfg.timerMode);
  const [timeLimit, setTimeLimit] = useState(() => initialCfg.timeLimit);

  const handleStart = () => {
    const config = {
      sourceMode,
      difficulty,
      timerMode,
      timeLimit: sanitizeSpotTimeLimit(timeLimit)
    };
    saveSpotMistakeConfig(config);
    if (typeof onStart === 'function') {
      onStart(config);
    }
  };

  // Vô hiệu hóa chọn độ khó nếu đang bật AI Tự Sinh (mặc định AI tạo lỗi)
  const isAiPure = sourceMode === 'ai_pure';

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-6 shrink-0 mt-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            title="Quay lại"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">Cấu hình Tìm Lỗi Sai</h2>
          <div className="w-10"></div>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {/* NGUỒN CÂU HỎI */}
          <div className="mb-6">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Nguồn câu hỏi
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                aria-pressed={sourceMode === 'card'}
                onClick={() => setSourceMode('card')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  sourceMode === 'card'
                    ? theme.cardActive
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } active:scale-95`}
              >
                <Icons.Layers size={28} />
                <div className="text-center">
                  <div className="font-bold text-sm">Thẻ của tôi</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Dựa trên Flashcard có sẵn
                  </div>
                </div>
              </button>

              <button
                type="button"
                aria-pressed={sourceMode === 'ai_pure'}
                onClick={() => setSourceMode('ai_pure')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  sourceMode === 'ai_pure'
                    ? theme.cardActive
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } active:scale-95`}
              >
                <Icons.Sparkles size={28} />
                <div className="text-center">
                  <div className="font-bold text-sm">AI Tự Sinh</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Tạo lỗi sai mới vô tận
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* CHẾ ĐỘ ĐỘ KHÓ */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Độ khó
              </label>
              {isAiPure && (
                <span className="text-[10px] font-semibold text-indigo-500">
                  (AI Tự Sinh mặc định dùng AI tạo lỗi)
                </span>
              )}
            </div>
            <div
              className={`grid grid-cols-2 gap-3 transition-all duration-300 ${
                isAiPure ? 'opacity-45 grayscale' : 'opacity-100'
              }`}
            >
              <button
                type="button"
                disabled={isAiPure}
                aria-pressed={difficulty === 'easy'}
                onClick={() => setDifficulty('easy')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  difficulty === 'easy'
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm text-emerald-700'
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } ${isAiPure ? 'cursor-not-allowed' : 'active:scale-95'}`}
              >
                <Icons.CheckCircle size={24} />
                <div className="text-center">
                  <div className="font-bold text-sm">Chế độ Dễ</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Mở gợi ý & Bóp méo cơ bản
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={isAiPure}
                aria-pressed={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  difficulty === 'hard'
                    ? 'border-red-500 bg-red-50 shadow-sm text-red-600'
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } ${isAiPure ? 'cursor-not-allowed' : 'active:scale-95'}`}
              >
                <Icons.AlertCircle size={24} />
                <div className="text-center">
                  <div className="font-bold text-sm">Chế độ Khó</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Khóa gợi ý & Thử thách AI
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* CẤU HÌNH THỜI GIAN (Nút gạt chuẩn A11y role="switch") */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 transition-all mb-6">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className={`font-bold flex items-center gap-2 ${theme.titleText}`}>
                  <Icons.Clock size={18} /> Giới hạn thời gian
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  {timerMode ? `${timeLimit} giây / câu` : 'Không giới hạn'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={timerMode}
                aria-label="Bật hoặc tắt giới hạn thời gian"
                onClick={() => setTimerMode((prev) => !prev)}
                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors relative flex items-center focus:outline-none focus:ring-2 focus:ring-gray-300 ${
                  timerMode ? theme.switchActive : 'bg-gray-300'
                }`}
              >
                <span
                  className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                    timerMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                ></span>
              </button>
            </div>

            {timerMode && (
              <div className="flex justify-center flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200/60 animate-in fade-in">
                <span className="text-xs font-bold text-gray-400 self-center mr-1 uppercase tracking-wide">
                  Chọn mức:
                </span>
                {VALID_TIME_LIMITS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={timeLimit === sec}
                    onClick={() => setTimeLimit(sec)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      timeLimit === sec
                        ? theme.chipActive
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full pt-4 shrink-0 bg-white pb-safe mt-auto">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg ${theme.btnPrimary}`}
          >
            <Icons.Play size={24} fill="currentColor" /> BẮT ĐẦU SĂN LỖI
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (SPOT MISTAKE PLAY SCREEN)
// ============================================================================
export const SpotMistakePlayScreen = ({
  t = undefined,
  mainColor = 'red',
  config = /** @type {Record<string, any>} */ (EMPTY_OBJECT),
  currentQuestion = /** @type {Record<string, any> | null} */ (null),
  chunks = EMPTY_ARRAY,
  stage = 'spot',
  selectedIndices = EMPTY_ARRAY,
  inputBuffer = '',
  setInputBuffer = undefined,
  checkStatus = 'idle',
  attempts = 0,
  score = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  correctCount = 0,
  wrongCount = 0,
  handleSpotClick = undefined,
  handleCheckSpot = undefined,
  handleCorrectionSubmit = undefined,
  handleSkip = undefined,
  nextRound = undefined,
  handleSaveAndBack = undefined,
  onBack = undefined,
  onEndGame = undefined,
  onSaveToNotebook = undefined,
  isBookmarked = false,
  resultTimer = 0,
  isResultPaused = false,
  toggleResultPause = undefined,
  timeLeft = 30,
  queueLength = 0,
  aiWaitTime = 0,
  onRequestExplanation = undefined,
  isExplaining = false,
  handleRequestHint = undefined,
  isTranslating = false,
  isHardMode: propIsHardMode = undefined,
  settings = /** @type {Record<string, any>} */ (EMPTY_OBJECT)
}) => {
  // Khai báo tránh cảnh báo biến không dùng đối với các prop tùy chọn spread từ {...logic}
  void t;
  void score;
  void aiCountdown;

  const theme = getSpotTheme(mainColor);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  // Trạng thái mở Gợi ý gắn liền với câu hỏi hiện tại -> tự đóng tức thì 0ms khi sang câu mới
  const [hintState, setHintState] = useState(
    /** @type {{ question: any, open: boolean }} */ ({ question: null, open: false })
  );
  const showHint = hintState.question === currentQuestion && hintState.open;

  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));

  const safeChunks = Array.isArray(chunks) ? chunks : EMPTY_ARRAY;
  const safeSelectedIndices = Array.isArray(selectedIndices) ? selectedIndices : EMPTY_ARRAY;
  const isRoundDone = checkStatus === 'success' || checkStatus === 'failed';
  const isHardMode =
    propIsHardMode !== undefined ? Boolean(propIsHardMode) : config?.difficulty === 'hard';

  // Đồng bộ nhãn Level dùng chung formatLevelBadge cho Header & GlobalLoadingScreen
  const formattedLevelBadge = formatLevelBadge(config?.level);
  const headerLevelBadge = formattedLevelBadge || 'LEVEL 4';

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

  // Auto-focus ô nhập liệu khi bước sang Giai đoạn 2 (Sửa lỗi)
  useEffect(() => {
    if (stage === 'correct' && inputRef.current && !isRoundDone) {
      inputRef.current.focus();
    }
  }, [stage, isRoundDone]);

  // THUẬT TOÁN SHADOW CHUNKING ĐA HÌNH (DIỆT C6: ƯU TIÊN TUYỆT ĐỐI chunk.isTarget)
  const isChinese = CJK_REGEX.test(String(currentQuestion?.wrongSentence || ''));

  const displayChunks = useMemo(() => {
    if (!currentQuestion || safeChunks.length === 0) return EMPTY_ARRAY;

    const wrongWordStr = String(currentQuestion.wrongWord || '').trim();
    const wrongWordLower = wrongWordStr.toLowerCase();
    const hasExplicitTarget = safeChunks.some((chunk) => Boolean(chunk?.isTarget));

    if (isChinese) {
      const charArray = [];
      safeChunks.forEach((chunk, chunkIdx) => {
        const chunkText = String(chunk?.text || '');
        const chars = Array.from(chunkText);
        const chunkIsTarget = hasExplicitTarget
          ? Boolean(chunk?.isTarget)
          : Boolean(
              wrongWordStr &&
                (chunkText === wrongWordStr ||
                  (chunkText.length > 1 && chunkText.includes(wrongWordStr)))
            );

        chars.forEach((char, charIdx) => {
          charArray.push({
            id: `char_${chunkIdx}_${charIdx}`,
            text: char,
            parentChunkIndex: chunkIdx,
            isTargetMatch: chunkIsTarget
          });
        });
      });
      return charArray;
    }

    return safeChunks.map((chunk, idx) => {
      const chunkText = String(chunk?.text || '');
      const cleanToken = chunkText.replace(/[.,?!;:'"()[\]{}]/g, '').toLowerCase();
      const cleanWrong = wrongWordLower.replace(/[.,?!;:'"()[\]{}]/g, '');
      const isTargetMatch = hasExplicitTarget
        ? Boolean(chunk?.isTarget)
        : Boolean(cleanWrong && cleanToken === cleanWrong);

      return {
        ...chunk,
        id: chunk?.id || `chunk_${idx}`,
        text: chunkText,
        parentChunkIndex: idx,
        isTargetMatch
      };
    });
  }, [currentQuestion, safeChunks, isChinese]);

  // Tính chuỗi văn bản đang được chọn để hiển thị ở Giai đoạn 2
  const textToFix = useMemo(() => {
    if (safeChunks.length === 0 || safeSelectedIndices.length === 0) return '';
    const sortedIndices = [...safeSelectedIndices].sort((a, b) => a - b);
    return sortedIndices
      .map((idx) => safeChunks[idx]?.text)
      .filter(Boolean)
      .join(isChinese ? '' : ' ');
  }, [safeSelectedIndices, safeChunks, isChinese]);

  // Xử lý phím Enter trong ô sửa lỗi (Gọi chuẩn handleCorrectionSubmit() 0 tham số — diệt ts2554)
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (
      stage === 'correct' &&
      (checkStatus === 'correct_spot' || checkStatus === 'wrong_correct')
    ) {
      if (typeof handleCorrectionSubmit === 'function') {
        handleCorrectionSubmit();
      }
    } else if (isRoundDone && !isGenerating && !(aiWaitTime > 0)) {
      if (typeof nextRound === 'function') {
        nextRound();
      }
    }
  };

  // Xử lý Bookmark thông minh (ưu tiên tọa độ chunks, hỗ trợ CJK 100%, khóa chống lộ đáp án)
  const handleBookmarkClick = (e) => {
    e.stopPropagation();
    if (!currentQuestion || !isRoundDone || typeof onSaveToNotebook !== 'function') return;

    const { save, display } = buildBookmarkTexts(currentQuestion, safeChunks, isChinese);

    onSaveToNotebook({
      isSmartTarget: true,
      display: display || currentQuestion.wrongSentence,
      save: save || currentQuestion.wrongSentence,
      analysis: currentQuestion.explanation || ''
    });
  };

  // Thoát từ màn hình Loading: nếu chưa trả lời câu nào (0/0) thì quay thẳng về Menu
  const handleBackAction = onBack || handleSaveAndBack;
  const handleAbortLoading = () => {
    const totalAnswered = (Number(correctCount) || 0) + (Number(wrongCount) || 0);
    if (totalAnswered === 0 && typeof handleBackAction === 'function') {
      handleBackAction();
      return;
    }
    if (typeof onEndGame === 'function') {
      onEndGame({
        correct: Number(correctCount) || 0,
        time: Number(time) || 0,
        wrong: Number(wrongCount) || 0
      });
    }
  };

  if (isGenerating && !currentQuestion) {
    if (config?.sourceMode === 'card' && !isHardMode) {
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
            ? 'AI đang sáng tác thử thách...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={
          config?.sourceMode === 'ai_pure'
            ? 'Đang nạp câu hỏi tìm lỗi sai từ động cơ AI...'
            : 'Vui lòng chờ trong giây lát...'
        }
        mainColor={mainColor}
        levelStr={config?.sourceMode === 'ai_pure' ? formattedLevelBadge : ''}
      />
    );
  }

  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300">
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner ${theme.resultIcon}`}
        >
          <SafeIcon name="Brain" size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Thử thách kết thúc!</h2>
        <p className="text-gray-500 mb-8 text-center max-w-xs">
          Bạn đã hoàn thành việc rà soát lỗi sai xuất sắc!
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Thời gian
            </div>
            <div className={`text-xl font-bold ${theme.statText}`}>
              {formatGameTime(time)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm text-center">
            <div className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.Check size={12} /> Đúng
            </div>
            <div className="text-xl font-bold text-green-600">{correctCount}</div>
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
          onClick={() =>
            typeof onEndGame === 'function' &&
            onEndGame({ correct: correctCount, time, wrong: wrongCount })
          }
          className={`w-full max-w-xs py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all active:scale-95 ${theme.btnPrimary}`}
        >
          Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const safeTimeLimit = Number(config?.timeLimit) > 0 ? Number(config.timeLimit) : 30;
  const safeTimeLeft = Math.max(0, Number(timeLeft) || 0);
  const progressPercent = Math.max(0, Math.min(100, (safeTimeLeft / safeTimeLimit) * 100));
  const safeResultTimer = Math.max(0, Number(resultTimer) || 0);
  const brickFontFamily = Utils.getFontFamily(settings);

  const nextBtnColorClass =
    checkStatus === 'success'
      ? 'bg-green-500 hover:bg-green-600'
      : theme.btnPrimary;

  return (
    <div className="w-full flex flex-col h-full bg-gray-50 relative overflow-hidden">
      {/* Popup xác nhận thoát sớm (A11y Dialog + Backdrop + Escape) */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="spot-confirm-end-title"
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
            <h3 id="spot-confirm-end-title" className="text-xl font-black text-gray-800 mb-2">
              Kết thúc phiên học?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Bạn đang ở chế độ vô tận. Bấm Kết thúc để xem tổng hợp kết quả của phiên này.
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
                      correct: correctCount,
                      time,
                      wrong: wrongCount
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

      {/* Overlay chuyển câu khi đang nạp đạn AI */}
      {isGenerating &&
        currentQuestion &&
        (config?.sourceMode === 'card' && !isHardMode ? (
          <div className="absolute inset-0 z-[90] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            duration={0}
            onComplete={undefined}
            onCancel={handleAbortLoading}
            queueLength={queueLength}
            text="Đang chuyển sang thử thách mới..."
            subText="Đang nạp câu hỏi tìm lỗi sai tiếp theo..."
            mainColor={mainColor}
            levelStr=""
          />
        ))}

      {/* HEADER */}
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shrink-0 z-10 shadow-sm relative">
        <button
          type="button"
          onClick={handleBackAction}
          className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors hover:bg-gray-100"
          title="Tạm dừng / Quay lại"
        >
          <SafeIcon name="ChevronLeft" size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            {headerLevelBadge}
          </div>
          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
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
          <div
            className={`hidden sm:flex items-center gap-1 font-bold ${
              combo > 1 ? 'text-orange-500 scale-110' : 'text-gray-400'
            } transition-all`}
          >
            🔥 x{combo}
          </div>
          {config?.timerMode && !isRoundDone ? (
            <div
              className={`text-base sm:text-xl font-mono font-bold ${getTimerColor(
                safeTimeLeft,
                safeTimeLimit
              )} min-w-[2.75rem] text-right`}
              title="Thời gian còn lại cho câu này"
            >
              {safeTimeLeft}s
            </div>
          ) : (
            <div
              className={`text-base sm:text-xl font-mono font-bold w-12 text-right hidden sm:block ${theme.statText}`}
              title="Tổng thời gian phiên chơi"
            >
              {time}s
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {currentQuestion?.origin?._isRescued || currentQuestion?._isRescued ? (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 shadow-sm">
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
            </span>
          ) : currentQuestion?.isAiGenerated ? (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm">
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(config?.aiMode || config?.sourceMode === 'ai_pure') && queueLength > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-blue-50 text-blue-600 border border-blue-200">
              <Icons.Database size={12} className="text-blue-500" /> Đã nạp: {queueLength}
            </span>
          )}

          {aiWaitTime > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse">
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          <button
            type="button"
            onClick={handleBookmarkClick}
            disabled={!isRoundDone}
            className={`p-2 rounded-lg transition-colors ${
              !isRoundDone
                ? 'text-gray-300 opacity-50 cursor-not-allowed'
                : isBookmarked
                ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
            }`}
            title={
              !isRoundDone
                ? 'Hoàn thành câu để lưu vào Sổ tay!'
                : isBookmarked
                ? 'Đã lưu trong Sổ tay'
                : 'Lưu câu đúng vào Sổ tay'
            }
          >
            <Icons.Bookmark
              size={20}
              fill={isRoundDone && isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      {/* BODY: KHU VỰC NỘI DUNG CHÍNH */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center gap-6 sm:gap-8 relative">
        {config?.timerMode && !isRoundDone && !isGenerating && (
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                safeTimeLeft <= 5 ? 'bg-red-500' : theme.progressBar
              }`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        )}

        {/* 1. KHU VỰC BÓNG ĐÈN GỢI Ý & DỊCH THUẬT ON-DEMAND */}
        <div className="flex flex-col items-center gap-2 w-full mb-1 mt-2 relative">
          <button
            type="button"
            onClick={() => {
              if (!isHardMode) {
                setHintState({ question: currentQuestion, open: !showHint });
              }
            }}
            disabled={isHardMode}
            className={`p-3 rounded-full flex items-center justify-center transition-all shadow-sm border ${
              isHardMode
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed border-gray-200'
                : showHint
                ? 'bg-yellow-100 text-yellow-600 border-yellow-300'
                : 'bg-white border-gray-200 text-gray-400 hover:text-yellow-500 hover:border-yellow-300 hover:shadow-md active:scale-95'
            }`}
            title={
              isHardMode
                ? 'Gợi ý bị khóa ở chế độ Khó'
                : 'Bật/Tắt gợi ý dịch nghĩa'
            }
          >
            <Icons.Info
              size={24}
              className={showHint && !isHardMode ? 'animate-pulse' : ''}
            />
          </button>

          {showHint && !isHardMode && (
            <div className="absolute top-14 z-20 px-6 py-3 bg-yellow-50 rounded-2xl text-sm md:text-base text-yellow-800 italic font-medium border border-yellow-200 text-center shadow-lg max-w-2xl w-full animate-in slide-in-from-top-2">
              {currentQuestion.origin?.definition || currentQuestion.hint ? (
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-1">
                    — Ý NGHĨA CÂU VĂN —
                  </span>
                  {currentQuestion.origin?.definition || currentQuestion.hint}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-gray-500 text-sm">Câu này chưa có bản dịch.</span>
                  <button
                    type="button"
                    onClick={() => handleRequestHint && handleRequestHint()}
                    disabled={isTranslating}
                    className="px-4 py-2 bg-yellow-400 text-yellow-900 font-bold rounded-lg shadow-sm hover:bg-yellow-500 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isTranslating ? (
                      <div className="w-4 h-4 border-2 border-yellow-900 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Icons.Sparkles size={16} />
                    )}
                    Nhờ AI dịch nghĩa
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. KHU VỰC WORD BRICKS ĐA HÌNH (Language-Aware & Multi-Select Chunking) */}
        <div
          style={{ fontFamily: brickFontFamily }}
          className={`w-full max-w-4xl flex flex-wrap justify-center relative z-10 ${
            isChinese ? 'gap-0 md:gap-0.5' : 'gap-2.5 sm:gap-3'
          }`}
        >
          {displayChunks.map((chunkObj) => {
            const isSelected = safeSelectedIndices.includes(chunkObj.parentChunkIndex);
            const isFailed = checkStatus === 'failed';
            const isSuccess = checkStatus === 'success';
            let brickClass = '';

            if (isChinese) {
              // --- Giao diện Tiếng Trung ---
              brickClass = `text-2xl md:text-3xl lg:text-4xl font-bold transition-all duration-200 border-b-[3px] border-transparent ${theme.hoverText} px-0.5 cursor-pointer leading-loose`;
              if (stage === 'spot') {
                if (isSelected) {
                  if (checkStatus === 'wrong_spot') {
                    brickClass =
                      'text-2xl md:text-3xl lg:text-4xl font-bold text-red-500 bg-red-50 rounded animate-[shake_0.4s_ease-in-out] border-b-[3px] border-red-500 px-1 mx-0.5 z-20 relative leading-loose';
                  } else {
                    brickClass =
                      'text-2xl md:text-3xl lg:text-4xl font-bold text-yellow-600 bg-yellow-100 rounded scale-110 shadow-sm border-b-[3px] border-yellow-400 z-20 relative px-1 mx-0.5 leading-loose';
                  }
                }
              } else if (stage === 'correct') {
                if (isSelected) {
                  brickClass =
                    'text-2xl md:text-3xl lg:text-4xl font-bold text-yellow-600 bg-yellow-100 rounded scale-110 shadow-sm border-b-[3px] border-yellow-400 z-20 relative px-1 mx-0.5 leading-loose';
                } else {
                  brickClass =
                    'text-2xl md:text-3xl lg:text-4xl font-bold text-gray-300 opacity-40 blur-[1px] cursor-not-allowed leading-loose';
                }
              }
              if (isFailed || isSuccess) {
                if (chunkObj.isTargetMatch) {
                  brickClass = isSuccess
                    ? 'text-2xl md:text-3xl lg:text-4xl font-bold text-green-600 bg-green-100 rounded border-b-[3px] border-green-500 px-1 mx-0.5 leading-loose'
                    : 'text-2xl md:text-3xl lg:text-4xl font-bold text-red-500 bg-red-100 rounded border-b-[3px] border-red-500 line-through px-1 mx-0.5 leading-loose';
                } else {
                  brickClass =
                    'text-2xl md:text-3xl lg:text-4xl font-bold text-gray-300 opacity-50 blur-[1px] leading-loose';
                }
              }
            } else {
              // --- Giao diện Tiếng Anh ---
              brickClass = `px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-white border-gray-200 text-gray-800 ${theme.hoverBorder} hover:shadow-md`;
              if (stage === 'spot') {
                if (isSelected) {
                  if (checkStatus === 'wrong_spot') {
                    brickClass =
                      'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-red-50 border-red-500 text-red-700 animate-[shake_0.4s_ease-in-out] z-20 relative';
                  } else {
                    brickClass =
                      'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-yellow-50 border-yellow-400 text-yellow-700 scale-105 shadow-md font-bold ring-2 ring-yellow-200 z-20 relative';
                  }
                }
              } else if (stage === 'correct') {
                if (isSelected) {
                  brickClass =
                    'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-yellow-50 border-yellow-400 text-yellow-700 scale-105 shadow-md font-bold ring-2 ring-yellow-200 z-20 relative';
                } else {
                  brickClass =
                    'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-gray-100 border-gray-200 text-gray-400 opacity-30 blur-[1px] cursor-not-allowed';
                }
              }
              if (isFailed || isSuccess) {
                if (chunkObj.isTargetMatch) {
                  brickClass = isSuccess
                    ? 'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-green-500 border-green-600 text-white shadow-md font-bold'
                    : 'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-red-500 border-red-600 text-white line-through font-bold shadow-md';
                } else {
                  brickClass =
                    'px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 text-lg sm:text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-gray-100 border-gray-200 text-gray-400 opacity-50 blur-[1px]';
                }
              }
            }

            return (
              <button
                key={chunkObj.id}
                type="button"
                onClick={() =>
                  typeof handleSpotClick === 'function' &&
                  handleSpotClick(chunkObj.parentChunkIndex)
                }
                disabled={stage !== 'spot' || isRoundDone}
                className={brickClass}
              >
                {chunkObj.text}
              </button>
            );
          })}
        </div>

        {/* 2.5 NÚT KIỂM TRA THỦ CÔNG (MANUAL CHECK) */}
        {stage === 'spot' && !isRoundDone && (
          <div className="w-full flex justify-center mt-4 animate-in slide-in-from-bottom-4 z-20">
            <button
              type="button"
              onClick={() => typeof handleCheckSpot === 'function' && handleCheckSpot()}
              disabled={
                safeSelectedIndices.length === 0 || checkStatus === 'wrong_spot'
              }
              className={`px-8 py-4 rounded-2xl font-bold text-xl flex items-center gap-2 shadow-lg transition-all ${
                safeSelectedIndices.length > 0 && checkStatus !== 'wrong_spot'
                  ? theme.btnPrimaryIdle
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Icons.CheckCircle size={28} /> Kiểm tra
            </button>
          </div>
        )}

        {stage === 'spot' && !isRoundDone && (
          <p className="text-xs text-gray-400 italic">
            Chạm để chọn các từ bị sai. Bấm lần nữa để hủy chọn.
          </p>
        )}

        {/* 3. KHU VỰC NHẬP LIỆU (GIAI ĐOẠN 2) */}
        {stage === 'correct' && !isRoundDone && (
          <div className="w-full max-w-lg mt-2 animate-in zoom-in relative z-20">
            <div className="flex flex-col items-center gap-4">
              <div className="text-center mb-1">
                <span className="text-gray-500 text-sm font-bold uppercase tracking-widest block mb-1">
                  Sửa lại cụm:
                </span>
                <div className="text-2xl font-black text-red-500 line-through bg-red-50 px-4 py-2 rounded-xl border border-red-100">
                  {textToFix}
                </div>
              </div>
              <div className="flex w-full gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputBuffer}
                  onChange={(e) =>
                    typeof setInputBuffer === 'function' && setInputBuffer(e.target.value)
                  }
                  onKeyDown={handleKeyDown}
                  className={`flex-1 min-w-0 p-4 text-center text-xl sm:text-2xl font-bold border-4 rounded-2xl outline-none transition-all ${
                    checkStatus === 'wrong_correct'
                      ? 'border-orange-400 bg-orange-50 text-orange-700 animate-[shake_0.4s_ease-in-out]'
                      : `${theme.inputFocus} bg-white text-gray-800 shadow-xl`
                  }`}
                  placeholder="Nhập từ đúng..."
                  autoComplete="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  onClick={() =>
                    typeof handleCorrectionSubmit === 'function' && handleCorrectionSubmit()
                  }
                  className={`px-5 sm:px-6 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95 shrink-0 ${theme.btnPrimary}`}
                  title="Xác nhận sửa lỗi"
                >
                  <Icons.Check size={28} />
                </button>
              </div>
              <p className="text-xs text-gray-400 italic">
                Gợi ý: Bạn còn {Math.max(0, 3 - (Number(attempts) || 0))} lượt thử sửa lỗi.
              </p>
            </div>
          </div>
        )}

        {/* 4. HIỂN THỊ GIẢI THÍCH & NÚT LƯU THẺ */}
        {isRoundDone && (
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-gray-100 overflow-visible animate-in slide-in-from-bottom-6 z-30 mt-4">
            <div
              className={`p-4 ${
                checkStatus === 'success' ? 'bg-green-500' : 'bg-red-500'
              } text-white flex items-center justify-between px-4 sm:px-6 font-bold rounded-t-2xl relative gap-2`}
            >
              <div className="flex items-center gap-2 text-sm sm:text-base">
                {checkStatus === 'success' ? <Icons.CheckCircle /> : <Icons.X />}
                {checkStatus === 'success' ? 'SỬA LỖI XUẤT SẮC!' : 'HẾT LƯỢT!'}
              </div>
              <button
                type="button"
                onClick={handleBookmarkClick}
                className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors shadow-sm shrink-0"
              >
                <Icons.Bookmark
                  size={14}
                  fill={isBookmarked ? 'white' : 'none'}
                />{' '}
                {isBookmarked ? 'Đã lưu' : 'Lưu vào Sổ tay'}
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 bg-white rounded-b-2xl">
              <div className="flex justify-between items-center border-b pb-4">
                <div className="text-center flex-1 border-r px-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                    Bị sai
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-red-500 line-through break-words">
                    {currentQuestion.wrongWord}
                  </div>
                </div>
                <div className="text-center flex-1 px-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                    Sửa đúng
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-green-600 break-words">
                    {currentQuestion.correction}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {currentQuestion.explanation &&
                String(currentQuestion.explanation).trim().length > 10 ? (
                  <div>
                    <div
                      className={`text-xs font-bold uppercase mb-1 flex items-center gap-1 ${theme.explainTitle}`}
                    >
                      <Icons.Sparkles size={14} /> Phân tích ngữ pháp
                    </div>
                    <p className="text-gray-700 leading-relaxed italic text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                ) : (
                  <div className="flex justify-center w-full mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        typeof onRequestExplanation === 'function' && onRequestExplanation()
                      }
                      disabled={isExplaining}
                      className={`w-full py-3 rounded-xl text-sm font-bold border flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50 ${theme.explainBtn}`}
                    >
                      {isExplaining ? (
                        <>
                          <div
                            className={`w-4 h-4 border-2 rounded-full animate-spin ${theme.explainSpinner}`}
                          ></div>{' '}
                          Đang nhờ AI phân tích...
                        </>
                      ) : (
                        <>
                          <Icons.Sparkles size={18} /> Gọi AI phân tích lỗi sai này
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER FLEX CHUẨN (CHỐNG ĐÈ NÚT TRÊN MOBILE) */}
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
          {isRoundDone ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() =>
                  typeof toggleResultPause === 'function' && toggleResultPause()
                }
                className={`flex-1 py-3 sm:py-4 px-2 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                  isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Xem ({safeResultTimer}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => typeof nextRound === 'function' && nextRound()}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 px-3 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${nextBtnColorClass} ${
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
          ) : (
            <button
              type="button"
              onClick={() => typeof handleSkip === 'function' && handleSkip()}
              disabled={aiWaitTime > 0 || isGenerating}
              className={`w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold text-sm sm:text-base rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ${
                aiWaitTime > 0 || isGenerating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95'
              }`}
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
  window.Block5_10_SpotMistakeSetup = SpotMistakeSetup;
  window.SpotMistakeSetup = SpotMistakeSetup;
  window.Block5_10_SpotMistakePlayScreen = SpotMistakePlayScreen;
  window.SpotMistakePlayScreen = SpotMistakePlayScreen;
}

export default SpotMistakePlayScreen;