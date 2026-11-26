// ============================================================================
// FILE 53/85: src/features/games/MatchGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.2 - Match Logic V1.15)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 21:26 (GMT+7)
// NHIỆM VỤ: Động cơ xử lý Logic, quản lý dữ liệu, Batch Queue, tạo bẫy vô nghiệm
//           (Hard Mode), State và Timer của Game Nối Ô (Match Game).
//           Nâng cấp Ver 1.1 (Diệt sạch 2/2 lỗi ts(2345) & vá lỗi Runtime ngầm):
//           1. Diệt ts(2345) #1 tại `safeShowToast`: Gọi chuẩn chữ ký
//              `window.globalShowToast(text, type)` khớp `globals.d.ts`.
//           2. Diệt ts(2345) #2 tại `toCanonicalHarvestLevelKey`: Khóa JSDoc
//              `'en' | 'zh'` cho `safeLang`/`langRef` và nới an toàn `@param {string}`
//              kèm chuẩn hóa nội bộ.
//           3. Vá lỗi Runtime ngầm ở nhánh bẫy dự phòng Hard Mode: Dùng phép nối
//              chuỗi tường minh `String(trapCard.term) + '的'` / `+ 'x'` (chống
//              mất ký tự `$` gây hiển thị sai tên từ vựng).
//           4. Bảo toàn 100% chuẩn Ver 1.0: StrictMode-safe (bootTimer 50ms),
//              0/0/0 Radar, khóa double-check, lưu `originalTerm` sạch & hợp đồng
//              2 tham số `onSaveToHarvest(harvestLevelKey, harvestData)`.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { callGeminiApi } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import {
  normalizeLevelAndTopic,
  getConfiguredUiCooldown,
  playGameSFX,
  mergePendingAmmoToDeck,
  resolveActiveApiKey
} from './common/gameHelpers';
import { MatchPlayScreen } from './MatchUI';

/**
 * @typedef {{ id: string, term: string, definition: string, isTrap: boolean, originalTerm?: string, explanation?: string, origin?: Record<string, any> }} MatchLeftItem
 * @typedef {{ id: string, term: string, isTrap: boolean, originalTerm?: string, explanation?: string }} MatchRightItem
 * @typedef {{ start: string, end: string }} MatchLine
 * @typedef {{ pairs: any[], leftItems: MatchLeftItem[], rightItems: MatchRightItem[], connections: Record<string, string>, selectedLeft: string | null, isChecked: boolean, score: number, correctLines: MatchLine[], wrongLines: MatchLine[], missingLines: MatchLine[], timer: number, isAiGenerated: boolean, isResultPaused: boolean, _isRescued: boolean }} MatchState
 */

// Bộ đếm ID đơn điệu toàn cục (chống trùng ID khi tạo nhiều ô trong cùng 1ms)
let matchUidSeq = 0;
/**
 * @param {string} prefix
 * @returns {string}
 */
const nextMatchUid = (prefix) => {
  matchUidSeq = (matchUidSeq + 1) % 1000000000;
  return `${prefix}_${matchUidSeq}_${Date.now()}`;
};

// Kho chốt chặn cứng song ngữ bất tử (EN & ZH) đảm bảo 0% kẹt dữ liệu Offline
const HARD_MATCH_FALLBACK = {
  en: [
    { term: 'Apple', definition: 'Quả táo', pronunciation: '/ˈæp.əl/' },
    { term: 'Banana', definition: 'Quả chuối', pronunciation: '/bəˈnɑː.nə/' },
    { term: 'Cat', definition: 'Con mèo', pronunciation: '/kæt/' },
    { term: 'Dog', definition: 'Con chó', pronunciation: '/dɒɡ/' },
    { term: 'Bird', definition: 'Con chim', pronunciation: '/bɜːd/' },
    { term: 'Book', definition: 'Quyển sách', pronunciation: '/bʊk/' },
    { term: 'Water', definition: 'Nước uống', pronunciation: '/ˈwɔː.tər/' }
  ],
  zh: [
    { term: '苹果', definition: 'Quả táo', pronunciation: 'píngguǒ' },
    { term: '香蕉', definition: 'Quả chuối', pronunciation: 'xiāngjiāo' },
    { term: '小猫', definition: 'Con mèo', pronunciation: 'xiǎomāo' },
    { term: '小狗', definition: 'Con chó', pronunciation: 'xiǎogǒu' },
    { term: '小鸟', definition: 'Con chim', pronunciation: 'xiǎoniǎo' },
    { term: '书本', definition: 'Quyển sách', pronunciation: 'shūběn' },
    { term: '喝水', definition: 'Uống nước', pronunciation: 'hē shuǐ' }
  ]
};

/** @type {MatchState} */
const DEFAULT_MATCH_STATE = {
  pairs: [],
  leftItems: [],
  rightItems: [],
  connections: {},
  selectedLeft: null,
  isChecked: false,
  score: 0,
  correctLines: [],
  wrongLines: [],
  missingLines: [],
  timer: 10,
  isAiGenerated: false,
  isResultPaused: false,
  _isRescued: false
};

/**
 * Chuẩn hóa khóa so khớp Unicode NFC (không phân biệt hoa/thường & khoảng trắng)
 * @param {any} val
 * @returns {string}
 */
const normalizeKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

/**
 * Đọc cấu hình đã lưu an toàn qua Utils.safeJsonParse
 * @returns {Record<string, any>}
 */
const readStoredMatchConfig = () => {
  try {
    const parsed = Utils.safeJsonParse('fc_match_config', {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Đọc cấu hình Lõi AI an toàn
 * @returns {{ maxAmmo: number, loadingTime: number }}
 */
const readAiCoreConfig = () => {
  try {
    const cfg = Utils.safeJsonParse('fc_ai_config', {});
    return {
      maxAmmo: Math.max(1, Math.min(10, Number(cfg?.maxAmmo) || 4)),
      loadingTime: Math.max(5, Math.min(60, Number(cfg?.loadingTime) || 22))
    };
  } catch {
    return { maxAmmo: 4, loadingTime: 22 };
  }
};

/**
 * Cộng dồn token AI an toàn qua Utils.safeLocalStorageSet (Diệt 1/1 HIGH Radar & chống NaN)
 * @param {number} delta
 */
const safeAddTotalTokens = (delta) => {
  const safeDelta = Number(delta);
  if (!Number.isFinite(safeDelta) || safeDelta <= 0) return;
  try {
    const raw =
      typeof localStorage !== 'undefined' ? localStorage.getItem('fc_total_tokens') : '0';
    const parsed = parseInt(String(raw || '0'), 10);
    const prevSafe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    Utils.safeLocalStorageSet('fc_total_tokens', String(prevSafe + Math.round(safeDelta)));
  } catch {
    // Bỏ qua an toàn nếu trình duyệt chặn Storage
  }
};

/**
 * Đọc bộ nhớ chống lặp 400 từ (AiMemoryManager -> fallback fc_ai_memory)
 * @returns {string[]}
 */
const readFreshAiMemory = () => {
  try {
    if (AiMemoryManager && typeof AiMemoryManager.get === 'function') {
      const mem = AiMemoryManager.get();
      if (Array.isArray(mem) && mem.length > 0) return [...mem];
    }
  } catch {
    // Fallback an toàn
  }
  const saved = Utils.safeJsonParse('fc_ai_memory', []);
  return Array.isArray(saved) ? saved : [];
};

/**
 * Ghi nhận từ đã gặp vào bộ nhớ chống lặp 400 từ (0 Radar R05)
 * @param {any} term
 */
const pushTermToAiMemory = (term) => {
  const cleanTerm = term ? String(term).trim() : '';
  if (!cleanTerm) return;
  try {
    if (AiMemoryManager) {
      const mgr = /** @type {any} */ (AiMemoryManager);
      if (typeof mgr.add === 'function') {
        mgr.add(cleanTerm);
        return;
      }
      if (typeof mgr.push === 'function') {
        mgr.push(cleanTerm);
        return;
      }
    }
  } catch {
    // Fallback sang safeLocalStorageSet
  }
  const list = readFreshAiMemory();
  const key = normalizeKey(cleanTerm);
  const nextList = [...list.filter((item) => normalizeKey(item) !== key), cleanTerm].slice(-400);
  Utils.safeLocalStorageSet('fc_ai_memory', nextList);
};

/**
 * Chuẩn hóa khóa cấp độ cho Kho AI Harvest (luôn có tiền tố `${prefix}_`)
 * Khớp 100% hợp đồng `useAiCurator.handleExportHarvestToExcel` (report2.md).
 * @param {any} rawLevel
 * @param {string} safeLang
 * @returns {string}
 */
const toCanonicalHarvestLevelKey = (rawLevel, safeLang) => {
  const prefix = safeLang === 'zh' ? 'zh' : 'en';
  const fallbackKey = prefix + '_level_4';
  const picked = Array.isArray(rawLevel) ? rawLevel.find(Boolean) : rawLevel;
  const rawStr = String(picked || '').trim().toLowerCase();
  if (!rawStr) return fallbackKey;

  if (/^(en|zh)_level_\d+$/.test(rawStr)) {
    return rawStr.replace(/^(en|zh)_/, prefix + '_');
  }
  const numMatch = rawStr.match(/\d+/);
  if (numMatch) {
    const levelNum = Math.max(1, Math.min(9, parseInt(numMatch[0], 10)));
    return prefix + '_level_' + String(levelNum);
  }
  if (rawStr.startsWith(prefix + '_')) return rawStr;
  return prefix + '_' + rawStr.replace(/^(en|zh)_/, '');
};

/**
 * Xáo trộn mảng đảm bảo 2 thẻ bẫy (isTrap) không đứng kề nhau
 * @template {{ isTrap?: boolean }} T
 * @param {T[]} arr
 * @returns {T[]}
 */
const shuffleNoAdjacentTraps = (arr) => {
  if (!Array.isArray(arr) || arr.length <= 2) return Utils.shuffleArray([...(arr || [])]);
  let res = [...arr];
  let valid = false;
  let tries = 0;
  while (!valid && tries < 50) {
    res = Utils.shuffleArray(res);
    valid = true;
    for (let j = 0; j < res.length - 1; j++) {
      if (res[j]?.isTrap && res[j + 1]?.isTrap) {
        valid = false;
        break;
      }
    }
    tries++;
  }
  return res;
};

/**
 * Trích xuất thẻ gốc sạch (từ đúng chính tả) từ một ô cột trái
 * Diệt F9: Tuyệt đối không ghi từ bị bóp méo sai chính tả vào Sổ Lỗi Sai hay Túi Nháp.
 * @param {MatchLeftItem | Record<string, any> | null | undefined} item
 * @returns {Record<string, any> | null}
 */
const extractCleanOriginCard = (item) => {
  if (!item || typeof item !== 'object') return null;
  const baseOrigin =
    item.origin && typeof item.origin === 'object' ? { ...item.origin } : {};
  const cleanTerm = String(
    item.originalTerm ||
      baseOrigin.originalTerm ||
      (item.isTrap ? '' : item.term) ||
      baseOrigin.term ||
      item.term ||
      ''
  ).trim();
  if (!cleanTerm) return null;

  const cleanDef = String(baseOrigin.definition || item.definition || '').trim();
  const cleanExplanation = String(
    item.explanation || baseOrigin.explanation || baseOrigin.analysis || ''
  ).trim();

  // Gỡ trường bóp méo khỏi thẻ sạch trước khi lưu Sổ Lỗi Sai / Túi Nháp
  const sanitized = { ...baseOrigin };
  delete sanitized.distortedTerm;

  return {
    ...sanitized,
    term: cleanTerm,
    definition: cleanDef || cleanTerm,
    analysis: sanitized.analysis || cleanExplanation
  };
};

/**
 * Đóng gói payload chuẩn cho Túi Nháp (có đủ top-level `term` & `origin`)
 * @param {Record<string, any> | null} cleanCard
 * @returns {Record<string, any> | null}
 */
const buildMatchRetryPayload = (cleanCard) => {
  if (!cleanCard || !cleanCard.term) return null;
  const cleanTerm = String(cleanCard.term).trim();
  if (!cleanTerm) return null;
  return {
    ...cleanCard,
    term: cleanTerm,
    origin: cleanCard
  };
};

/**
 * BỘ CHUẨN HÓA BỌC THÉP (DIỆT F10): Chuẩn hóa mọi payload từ ExamEngine (`ioe_match`),
 * FallbackDataEngine hoặc Card Mode sang cấu trúc vòng chơi Match nhất quán 100%.
 * @param {any} rawData
 * @param {{ fallbackIsAi?: boolean, isRescued?: boolean }} [opts]
 * @returns {{ pairs: any[], leftItems: MatchLeftItem[], rightItems: MatchRightItem[], isAiGenerated: boolean, _isRescued: boolean } | null}
 */
const normalizeMatchRoundData = (
  rawData,
  { fallbackIsAi = false, isRescued = false } = {}
) => {
  if (!rawData || typeof rawData !== 'object') return null;
  const content =
    rawData.content && typeof rawData.content === 'object' ? rawData.content : rawData;

  const resolvedRescued = Boolean(isRescued || content._isRescued || rawData._isRescued);
  const resolvedAi = Boolean(
    !resolvedRescued && (content.isAiGenerated ?? rawData.isAiGenerated ?? fallbackIsAi)
  );

  const rawLeft = Array.isArray(content.leftItems) ? content.leftItems : [];
  const rawRight = Array.isArray(content.rightItems) ? content.rightItems : [];
  const rawPairs = Array.isArray(content.pairs) ? content.pairs : [];

  // Trường hợp 1: Đã có đủ leftItems và rightItems -> chuẩn hóa ID duy nhất & sạch origin
  if (rawLeft.length > 0 && rawRight.length > 0) {
    const usedLeftIds = new Set();
    const usedRightIds = new Set();

    /** @type {MatchLeftItem[]} */
    const leftItems = rawLeft
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        let safeId = item.id ? String(item.id) : nextMatchUid('left');
        if (usedLeftIds.has(safeId)) safeId = nextMatchUid('left');
        usedLeftIds.add(safeId);

        const isTrap = Boolean(item.isTrap);
        const origObj =
          item.origin && typeof item.origin === 'object' ? { ...item.origin } : {};
        const originalTerm = String(
          item.originalTerm ||
            origObj.originalTerm ||
            (!isTrap ? item.term || origObj.term : origObj.term || '') ||
            ''
        ).trim();
        const displayTerm = String(item.term || originalTerm || '').trim();
        const definition = String(
          item.definition || origObj.definition || 'Không có định nghĩa'
        ).trim();
        const explanation = String(
          item.explanation || origObj.explanation || origObj.analysis || ''
        ).trim();

        const cleanOrigin = {
          ...origObj,
          term: originalTerm || displayTerm,
          definition,
          explanation: origObj.explanation || explanation
        };
        delete cleanOrigin.distortedTerm;

        return {
          id: safeId,
          term: displayTerm || originalTerm,
          definition,
          isTrap,
          originalTerm: originalTerm || displayTerm,
          explanation,
          origin: cleanOrigin
        };
      })
      .filter((item) => item.term || item.definition);

    /** @type {MatchRightItem[]} */
    const rightItems = rawRight
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        let safeId = item.id ? String(item.id) : nextMatchUid('right');
        if (usedRightIds.has(safeId)) safeId = nextMatchUid('right');
        usedRightIds.add(safeId);

        const isTrap = Boolean(item.isTrap);
        const term = String(item.term || item.distortedTerm || '').trim();
        const originalTerm = String(
          item.originalTerm || (!isTrap ? term : '') || ''
        ).trim();
        const explanation = String(item.explanation || '').trim();

        return {
          id: safeId,
          term,
          isTrap,
          originalTerm,
          explanation
        };
      })
      .filter((item) => item.term);

    if (leftItems.length === 0 || rightItems.length === 0) return null;

    const pairs =
      rawPairs.length > 0
        ? rawPairs.filter((p) => p && p.term)
        : leftItems
            .filter((item) => !item.isTrap)
            .map(
              (item) =>
                item.origin || {
                  term: item.originalTerm || item.term,
                  definition: item.definition
                }
            );

    return {
      pairs,
      leftItems,
      rightItems,
      isAiGenerated: resolvedAi,
      _isRescued: resolvedRescued
    };
  }

  // Trường hợp 2: ExamEngine chỉ trả về mảng `pairs` -> tự dựng cột Trái/Phải chuẩn
  const cleanPairs = rawPairs
    .filter((p) => p && typeof p === 'object' && p.term && String(p.term).trim())
    .map((p) => ({
      ...p,
      term: String(p.term).trim(),
      definition: String(p.definition || p.meaning || '').trim() || String(p.term).trim()
    }));

  if (cleanPairs.length === 0) return null;

  /** @type {MatchLeftItem[]} */
  const leftFromPairs = cleanPairs.map((c) => ({
    id: nextMatchUid('left'),
    term: c.term,
    definition: c.definition,
    isTrap: false,
    originalTerm: c.term,
    explanation: String(c.explanation || c.analysis || '').trim(),
    origin: c
  }));

  /** @type {MatchRightItem[]} */
  const rightFromPairs = cleanPairs.map((c) => ({
    id: nextMatchUid('right'),
    term: c.term,
    isTrap: false,
    originalTerm: c.term,
    explanation: ''
  }));

  return {
    pairs: cleanPairs,
    leftItems: shuffleNoAdjacentTraps(leftFromPairs),
    rightItems: shuffleNoAdjacentTraps(rightFromPairs),
    isAiGenerated: resolvedAi,
    _isRescued: resolvedRescued
  };
};

// ============================================================================
// COMPONENT CHÍNH: MATCH GAME
// ============================================================================
export const MatchGame = ({
  cards = /** @type {any[]} */ ([]),
  t = undefined,
  onBack = undefined,
  onEndGame = undefined,
  onPause = undefined,
  stopSpeaking = undefined,
  mainColor = 'purple',
  isAiMode: propAiMode = undefined,
  lang = 'en',
  apiKey = '',
  currentLevel = undefined,
  currentTopic = undefined,
  dataMode: propDataMode = undefined,
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = /** @type {any[]} */ ([]),
  isPaused: propIsPaused = false,
  onLogWrong = undefined,
  onMissingKey = undefined,
  showToast = undefined,
  savedState = /** @type {Record<string, any> | null} */ (null),
  settings = /** @type {Record<string, any>} */ ({}),
  timerMode: propTimerMode = undefined,
  timeLimit: propTimeLimit = undefined,
  initialDifficulty: propDifficulty = undefined,
  onAutoSave = undefined,
  onUpdateCards = undefined,
  level = undefined,
  onSaveToHarvest = undefined,
  config = /** @type {Record<string, any>} */ ({}),
  globalRetryBag = /** @type {Record<string, any>} */ ({}),
  addToRetryBag = undefined,
  removeFromRetryBag = undefined,
  isMuted = false
}) => {
  const safeLang = /** @type {'en' | 'zh'} */ (lang === 'zh' ? 'zh' : 'en');
  const effectiveMuted = Boolean(isMuted || settings?.isMuted);
  const effectiveBookmarkFn = onBookmark || onSaveToNotebook;

  // ==========================================================================
  // 1. HỢP NHẤT CẤU HÌNH THEO THỨ TỰ ƯU TIÊN CHUẨN (CHỐNG GHI ĐÈ KHI RESUME)
  //    Ưu tiên: savedState.config -> config -> props phẳng -> localStorage
  // ==========================================================================
  const resolvedConfig = useMemo(() => {
    const stored = readStoredMatchConfig();
    const resumeCfg =
      savedState?.config && typeof savedState.config === 'object' ? savedState.config : {};
    const incomingCfg = config && typeof config === 'object' ? config : {};

    const sourceMode =
      resumeCfg.sourceMode ?? incomingCfg.sourceMode ?? stored.sourceMode ?? 'card';

    const rawAiMode =
      resumeCfg.aiMode ??
      resumeCfg.isAiMode ??
      incomingCfg.aiMode ??
      incomingCfg.isAiMode ??
      propAiMode ??
      stored.aiMode ??
      false;
    const isAiMode = Boolean(rawAiMode);

    let difficulty = 'easy';
    if (savedState?.difficulty === 'hard' || savedState?.difficulty === 'easy') {
      difficulty = savedState.difficulty;
    } else if (resumeCfg.hardMode !== undefined) {
      difficulty = resumeCfg.hardMode ? 'hard' : 'easy';
    } else if (incomingCfg.hardMode !== undefined) {
      difficulty = incomingCfg.hardMode ? 'hard' : 'easy';
    } else if (stored.hardMode !== undefined) {
      difficulty = stored.hardMode ? 'hard' : 'easy';
    } else if (propDifficulty === 'hard' || propDifficulty === 'easy') {
      difficulty = propDifficulty;
    } else {
      difficulty = isAiMode ? 'hard' : 'easy';
    }

    const timerMode = Boolean(
      resumeCfg.timerMode ?? incomingCfg.timerMode ?? propTimerMode ?? stored.timerMode ?? false
    );
    const rawLimit = Number(
      resumeCfg.timeLimit ?? incomingCfg.timeLimit ?? propTimeLimit ?? stored.timeLimit ?? 60
    );
    const timeLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 60;

    const dataMode =
      resumeCfg.dataMode ?? incomingCfg.dataMode ?? propDataMode ?? stored.dataMode ?? 'vocab';

    const resolvedLevel =
      resumeCfg.level ??
      incomingCfg.level ??
      level ??
      currentLevel ??
      (safeLang === 'zh' ? 'zh_level_1' : 'en_level_4');

    const resolvedTopic = resumeCfg.topic ?? incomingCfg.topic ?? currentTopic ?? [];

    return {
      sourceMode,
      isAiMode,
      aiMode: isAiMode,
      difficulty,
      hardMode: difficulty === 'hard',
      timerMode,
      timeLimit,
      dataMode,
      level: resolvedLevel,
      topic: resolvedTopic
    };
  }, [
    savedState,
    config,
    propAiMode,
    propDifficulty,
    propTimerMode,
    propTimeLimit,
    propDataMode,
    level,
    currentLevel,
    currentTopic,
    safeLang
  ]);

  const {
    isAiMode,
    difficulty,
    timerMode: effectiveTimerMode,
    timeLimit: effectiveTimeLimit
  } = resolvedConfig;

  // ==========================================================================
  // 2. STATE & REFS ĐỒNG BỘ (KHÔNG STALE CLOSURE)
  // ==========================================================================
  const hasRestoredActiveRound = Boolean(
    savedState?.matchState &&
      !savedState._needsNextOnResume &&
      !savedState.matchState.isChecked &&
      Array.isArray(savedState.matchState.leftItems) &&
      savedState.matchState.leftItems.length > 0
  );

  const [matchState, setMatchState] = useState(
    /** @type {() => MatchState} */ (() => {
      if (hasRestoredActiveRound && savedState?.matchState) {
        return {
          ...DEFAULT_MATCH_STATE,
          ...JSON.parse(JSON.stringify(savedState.matchState))
        };
      }
      return { ...DEFAULT_MATCH_STATE };
    })
  );

  const [timeLeft, setTimeLeft] = useState(() => {
    const savedT = Number(savedState?.timeLeft);
    if (hasRestoredActiveRound && Number.isFinite(savedT) && savedT > 0) {
      return savedT;
    }
    return effectiveTimeLimit;
  });

  const [gameStats, setGameStats] = useState(() => ({
    correct: Number(savedState?.gameStats?.correct) || 0,
    wrong: Number(savedState?.gameStats?.wrong) || 0
  }));

  const [internalPaused, setInternalPaused] = useState(false);
  const effectivePaused = Boolean(propIsPaused || internalPaused);

  const [isLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(() => !hasRestoredActiveRound);
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() => {
    const savedWait = Number(savedState?.aiWaitTime);
    if (hasRestoredActiveRound && Number.isFinite(savedWait) && savedWait >= 0) {
      return savedWait;
    }
    return 0;
  });

  // Refs đồng bộ tức thời (0ms trong thân render)
  const isGameActiveRef = useRef(true);
  const configRef = useRef(resolvedConfig);
  const cardsRef = useRef(cards);
  const langRef = useRef(/** @type {'en' | 'zh'} */ (safeLang));
  const apiKeyRef = useRef(apiKey);
  const globalRetryBagRef = useRef(globalRetryBag);
  const onSaveToHarvestRef = useRef(onSaveToHarvest);
  const onUpdateCardsRef = useRef(onUpdateCards);
  const onLogWrongRef = useRef(onLogWrong);
  const showToastRef = useRef(showToast);
  const onPauseRef = useRef(onPause);
  const stopSpeakingRef = useRef(stopSpeaking);
  const effectiveMutedRef = useRef(effectiveMuted);
  const addToRetryBagRef = useRef(addToRetryBag);
  const removeFromRetryBagRef = useRef(removeFromRetryBag);

  const matchStateRef = useRef(matchState);
  const gameStatsRef = useRef(gameStats);
  const timeLeftRef = useRef(timeLeft);
  const aiWaitTimeRef = useRef(aiWaitTime);
  const effectivePausedRef = useRef(effectivePaused);
  const resultCountdownRef = useRef(matchState.timer);

  const deckRef = useRef(
    /** @type {any[]} */ (Array.isArray(savedState?.deck) ? [...savedState.deck] : [])
  );
  const coordinatorRef = useRef(/** @type {any} */ (null));
  const timerIntervalRef = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const resultIntervalRef = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const autoSaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const isCheckingLockRef = useRef(false);
  const isTransitioningRoundRef = useRef(false);

  // Đồng bộ Ref 0ms
  configRef.current = resolvedConfig;
  cardsRef.current = cards;
  langRef.current = safeLang;
  apiKeyRef.current = apiKey;
  globalRetryBagRef.current = globalRetryBag;
  onSaveToHarvestRef.current = onSaveToHarvest;
  onUpdateCardsRef.current = onUpdateCards;
  onLogWrongRef.current = onLogWrong;
  showToastRef.current = showToast;
  onPauseRef.current = onPause;
  stopSpeakingRef.current = stopSpeaking;
  effectiveMutedRef.current = effectiveMuted;
  addToRetryBagRef.current = addToRetryBag;
  removeFromRetryBagRef.current = removeFromRetryBag;

  matchStateRef.current = matchState;
  gameStatsRef.current = gameStats;
  aiWaitTimeRef.current = aiWaitTime;
  effectivePausedRef.current = effectivePaused;

  // Toast an toàn: ưu tiên prop showToast từ GameView (Ver 1.4), fallback đúng chữ ký globals.d.ts
  const safeShowToast = useCallback((msg, type = 'success') => {
    const text = typeof msg === 'string' ? msg : String(msg?.text || '');
    if (!text) return;
    if (typeof showToastRef.current === 'function') {
      showToastRef.current(text, type);
      return;
    }
    if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
      window.globalShowToast(text, type);
    }
  }, []);

  const cleanupTimers = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (resultIntervalRef.current) {
      clearInterval(resultIntervalRef.current);
      resultIntervalRef.current = null;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const syncQueueLength = useCallback(() => {
    if (!isGameActiveRef.current) return;
    const len =
      coordinatorRef.current && typeof coordinatorRef.current.length === 'function'
        ? coordinatorRef.current.length()
        : 0;
    setQueueLength(len);
  }, []);

  // ==========================================================================
  // 3. AUTO-SAVE & BẢN CHỤP PHIÊN CHƠI (CHỐNG CÀY ĐIỂM KHI RESUME)
  // ==========================================================================
  const buildSessionSnapshot = useCallback((overrides = /** @type {Record<string, any>} */ ({})) => {
    const curMatch = matchStateRef.current;
    const curStats = overrides.gameStats || gameStatsRef.current;
    const mergedDeck = mergePendingAmmoToDeck(coordinatorRef.current, deckRef.current);
    const needsNext =
      overrides._needsNextOnResume !== undefined
        ? Boolean(overrides._needsNextOnResume)
        : Boolean(curMatch?.isChecked);

    return {
      matchState: needsNext ? { ...DEFAULT_MATCH_STATE } : curMatch,
      gameStats: curStats,
      difficulty: configRef.current.difficulty,
      deck: mergedDeck,
      timeLeft: needsNext ? configRef.current.timeLimit : timeLeftRef.current,
      aiWaitTime: needsNext ? 0 : aiWaitTimeRef.current,
      _needsNextOnResume: needsNext,
      config: configRef.current
    };
  }, []);

  const triggerAutoSave = useCallback(() => {
    if (
      !isGameActiveRef.current ||
      typeof onAutoSave !== 'function' ||
      !matchStateRef.current?.leftItems?.length
    ) {
      return;
    }
    onAutoSave(buildSessionSnapshot());
  }, [buildSessionSnapshot, onAutoSave]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      triggerAutoSave();
    }, 150);
  }, [triggerAutoSave]);

  useEffect(() => {
    if (typeof onAutoSave !== 'function') return undefined;
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
    return () => {
      clearInterval(intervalTimer);
    };
  }, [onAutoSave, triggerAutoSave]);

  // Quét số lượng đạn đã nạp trong BatchQueueCoordinator
  useEffect(() => {
    const queueScanner = setInterval(syncQueueLength, 500);
    return () => clearInterval(queueScanner);
  }, [syncQueueLength]);

  // Đồng hồ đếm ngược làm nguội UI (AI Cooldown)
  useEffect(() => {
    if (aiWaitTime <= 0 || effectivePaused || isGenerating || matchState.isResultPaused) {
      return undefined;
    }
    const cdTimer = setTimeout(() => {
      setAiWaitTime((prev) => {
        const next = Math.max(0, prev - 1);
        aiWaitTimeRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearTimeout(cdTimer);
  }, [aiWaitTime, effectivePaused, isGenerating, matchState.isResultPaused]);

  // ==========================================================================
  // 4. QUẢN LÝ TÚI NHÁP & GHI SỔ LỖI SAI (DIỆT F9: CHỈ LƯU TỪ SẠCH)
  // ==========================================================================
  const localPushToRetryBag = useCallback((cardOrItem) => {
    if (typeof addToRetryBagRef.current !== 'function' || !cardOrItem) return;
    const cleanCard =
      cardOrItem.origin || cardOrItem.isTrap !== undefined
        ? extractCleanOriginCard(cardOrItem)
        : cardOrItem;
    const payload = buildMatchRetryPayload(cleanCard);
    if (payload) {
      try {
        addToRetryBagRef.current('match', payload);
      } catch {
        // Bỏ qua an toàn
      }
    }
  }, []);

  const localRemoveFromRetryBag = useCallback((termToCheck) => {
    if (typeof removeFromRetryBagRef.current !== 'function' || !termToCheck) return;
    try {
      removeFromRetryBagRef.current('match', String(termToCheck).trim());
    } catch {
      // Bỏ qua an toàn
    }
  }, []);

  const logMistake = useCallback((cardOrItem) => {
    if (typeof onLogWrongRef.current !== 'function' || !cardOrItem) return;
    const cleanCard =
      cardOrItem.origin || cardOrItem.isTrap !== undefined
        ? extractCleanOriginCard(cardOrItem)
        : cardOrItem;
    if (!cleanCard || !cleanCard.term) return;

    const mistakeCard = {
      ...cleanCard,
      id: `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type: 'mistake',
      tags: ['match', configRef.current.difficulty, configRef.current.sourceMode],
      timestamp: Date.now()
    };
    try {
      onLogWrongRef.current(mistakeCard);
    } catch {
      // Bỏ qua an toàn
    }
  }, []);

  // ==========================================================================
  // 5. CỨU HỘ KHẨN CẤP SONG NGỮ BẤT TỬ (0% TRẢ NULL)
  // ==========================================================================
  const buildHardFallbackMatchRound = useCallback(() => {
    const cfg = configRef.current;
    const curLang = langRef.current === 'zh' ? 'zh' : 'en';
    const { pickedLevel } = normalizeLevelAndTopic(cfg.level, cfg.topic, curLang);

    // Tầng 1: FallbackDataEngine.getGameReadyFallback('match', ...)
    try {
      if (FallbackDataEngine && typeof FallbackDataEngine.getGameReadyFallback === 'function') {
        const fbRaw = FallbackDataEngine.getGameReadyFallback('match', curLang, pickedLevel, {
          difficulty: cfg.difficulty,
          hardMode: cfg.difficulty === 'hard',
          dataMode: cfg.dataMode
        });
        const normalized = normalizeMatchRoundData(fbRaw, {
          fallbackIsAi: false,
          isRescued: true
        });
        if (normalized) return normalized;
      }
    } catch (e) {
      console.warn('[MatchGame] FallbackDataEngine.getGameReadyFallback error:', e);
    }

    // Tầng 2: Chốt chặn cứng song ngữ EN/ZH
    const hardList = HARD_MATCH_FALLBACK[curLang] || HARD_MATCH_FALLBACK.en;
    const targetCount = cfg.difficulty === 'hard' ? 4 : 5;
    const picked = Utils.shuffleArray([...hardList]).slice(0, targetCount);
    return normalizeMatchRoundData(
      { pairs: picked, isAiGenerated: false, _isRescued: true },
      { fallbackIsAi: false, isRescued: true }
    );
  }, []);

  // ==========================================================================
  // 6. HÀM TẢI DỮ LIỆU ĐƯỜNG ỐNG (FETCH TASK CHO BATCH QUEUE)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    const cfg = configRef.current;
    const curLang = /** @type {'en' | 'zh'} */ (langRef.current === 'zh' ? 'zh' : 'en');
    const currentDiff = cfg.difficulty;
    const currentSourceMode = cfg.sourceMode;
    const currentDataMode = cfg.dataMode === 'sentence' ? 'sentence' : 'vocab';
    const currentApiKey = resolveActiveApiKey(apiKeyRef.current);
    const targetCount = currentDiff === 'hard' ? 4 : 5;

    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(cfg.level, cfg.topic, curLang);
    const safeTopicStr = Array.isArray(pickedTopic)
      ? pickedTopic.find(Boolean) || ''
      : String(pickedTopic || '');

    /** @type {any[]} */
    const retryCards = [];
    try {
      if (typeof pullRetryCardWithLock === 'function' && globalRetryBagRef.current) {
        const pulledCard = pullRetryCardWithLock('match', globalRetryBagRef.current, curLang);
        if (pulledCard) {
          const cleanPulled = extractCleanOriginCard(pulledCard);
          if (cleanPulled) retryCards.push(cleanPulled);
        }
      }
    } catch (e) {
      console.warn('[MatchGame] Retry bag pull warning:', e);
    }

    // 1. Nhánh AI Tự Sinh (AI Pure Mode)
    if (currentSourceMode === 'ai_pure' && currentApiKey && ExamEngine?.hydrateQuestion) {
      try {
        const meta = {
          id: nextMatchUid('match_pure'),
          type: 'ioe_match',
          level: pickedLevel,
          topic: safeTopicStr,
          dataMode: currentDataMode,
          difficulty: currentDiff,
          hardMode: currentDiff === 'hard',
          mode: 'minigame',
          lang: curLang
        };
        const freshHistory = readFreshAiMemory();
        const qData = await ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory);
        const normalized = normalizeMatchRoundData(qData, {
          fallbackIsAi: true,
          isRescued: Boolean(qData?.content?._isRescued)
        });

        if (normalized) {
          // Đồng bộ trí nhớ chống lặp 400 từ
          normalized.pairs.forEach((p) => pushTermToAiMemory(p?.term));

          // KHÓA HỢP ĐỒNG useAiCurator.js (report2.md): Đúng 2 tham số (harvestLevelKey, harvestData)
          // Chỉ thu hoạch nguồn AI sinh thật (!normalized._isRescued && normalized.isAiGenerated !== false)
          if (
            !normalized._isRescued &&
            normalized.isAiGenerated !== false &&
            typeof onSaveToHarvestRef.current === 'function'
          ) {
            const harvestLevelKey = toCanonicalHarvestLevelKey(pickedLevel, curLang);
            normalized.pairs.forEach((c) => {
              if (!c || !c.term) return;
              try {
                onSaveToHarvestRef.current(harvestLevelKey, {
                  term: c.term,
                  pronunciation: c.pronunciation || '',
                  definition: c.definition || '',
                  analysis: c.analysis || c.explanation || '',
                  sinoViet: c.sinoViet || '',
                  example: c.example || '',
                  image: c.image || '',
                  topic: c.topic || safeTopicStr || 'AI Harvested',
                  grammar_type: c.grammar_type || ''
                });
              } catch {
                // Không chặn luồng game nếu harvest gặp lỗi
              }
            });
          }
          return normalized;
        }
      } catch (e) {
        console.warn('[MatchGame] PureMode Match fallback:', e?.message || e);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse Lò đúc Match AI', e);
        }
      }
    }

    // 2. Nhánh Thẻ của tôi (Card Mode) hoặc Fallback khi AI Pure thất bại
    const pool = [...retryCards];
    const poolKeys = new Set(pool.map((r) => normalizeKey(r?.term)).filter(Boolean));
    let attempts = 0;
    const maxAttempts = Math.max(20, (cardsRef.current?.length || 20) * 2);

    while (pool.length < targetCount && attempts < maxAttempts) {
      if (deckRef.current.length === 0 && currentSourceMode !== 'ai_pure') {
        let validCards = (cardsRef.current || []).filter(
          (c) => c && c.term && String(c.term).trim() !== ''
        );
        if (validCards.length < targetCount && FallbackDataEngine?.getFallbackData) {
          const fbItems = FallbackDataEngine.getFallbackData(
            curLang,
            currentDataMode,
            pickedLevel,
            20
          );
          if (Array.isArray(fbItems) && fbItems.length >= targetCount) {
            validCards = fbItems;
          }
        }
        if (validCards.length < targetCount) {
          validCards = [...(HARD_MATCH_FALLBACK[curLang] || HARD_MATCH_FALLBACK.en)];
        }
        deckRef.current = Utils.shuffleArray(validCards);
      }

      if (deckRef.current.length === 0) break;

      let c = deckRef.current.shift();
      attempts++;
      if (!c || !c.term) continue;

      // [JIT PROCESSING] Dịch thuật On-demand ngầm cho thẻ khuyết nghĩa (không còn nhánh 'vi')
      if (!c.definition || !String(c.definition).trim()) {
        if (cfg.isAiMode && currentApiKey && typeof callGeminiApi === 'function') {
          let timeoutId = null;
          try {
            const targetLangName = curLang === 'zh' ? 'Chinese' : 'English';
            const prompt =
              'Dịch từ/câu sau sang tiếng Việt ngắn gọn nhất (dưới 6 từ). KHÔNG giải thích. Từ/câu: "' +
              String(c.term) +
              '". Ngôn ngữ gốc: ' +
              targetLangName +
              '.';
            const schema = {
              type: 'OBJECT',
              properties: { definition: { type: 'STRING' } },
              required: ['definition']
            };
            const { loadingTime } = readAiCoreConfig();
            const dynamicTimeout = Math.max(12000, loadingTime * 1000 + 2000);
            const callPromise = callGeminiApi(prompt, schema, currentApiKey);
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('JIT Enrich Timeout')), dynamicTimeout);
            });
            const res = await Promise.race([callPromise, timeoutPromise]);
            const parsed = Utils.parseAiJson(res?.text);
            if (parsed && parsed.definition) {
              const filledDef = String(parsed.definition).trim();
              c = { ...c, definition: filledDef };
              if (res?._tokenUsage?.totalTokenCount) {
                safeAddTotalTokens(res._tokenUsage.totalTokenCount);
              }
              if (
                typeof onUpdateCardsRef.current === 'function' &&
                Array.isArray(cardsRef.current)
              ) {
                const targetKey = normalizeKey(c.term);
                let matched = false;
                const nextFullCards = cardsRef.current.map((existing) => {
                  if (!existing) return existing;
                  const sameId =
                    c.id !== undefined && existing.id !== undefined && existing.id === c.id;
                  const sameTerm = normalizeKey(existing.term) === targetKey;
                  if (!matched && (sameId || sameTerm)) {
                    matched = true;
                    return { ...existing, definition: filledDef };
                  }
                  return existing;
                });
                if (matched) {
                  cardsRef.current = nextFullCards;
                  onUpdateCardsRef.current(nextFullCards);
                }
              }
            }
          } catch (e) {
            console.warn('[MatchGame JIT Enrich] Lỗi dịch ngầm:', c.term, e?.message || e);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }
      }

      const termKey = normalizeKey(c.term);
      if (c.definition && String(c.definition).trim() && termKey && !poolKeys.has(termKey)) {
        poolKeys.add(termKey);
        pool.push(c);
      }
    }

    // Bù đắp bằng kho dự phòng nếu vẫn thiếu cặp
    if (pool.length < targetCount) {
      if (FallbackDataEngine?.getFallbackData) {
        const fbItems = FallbackDataEngine.getFallbackData(
          curLang,
          currentDataMode,
          pickedLevel,
          targetCount + 12
        );
        for (const fb of Utils.shuffleArray(fbItems || [])) {
          if (pool.length >= targetCount) break;
          const fbKey = normalizeKey(fb?.term);
          if (fbKey && fb?.definition && !poolKeys.has(fbKey)) {
            poolKeys.add(fbKey);
            pool.push(fb);
          }
        }
      }
      const hardList = HARD_MATCH_FALLBACK[curLang] || HARD_MATCH_FALLBACK.en;
      for (const item of hardList) {
        if (pool.length >= targetCount) break;
        const itemKey = normalizeKey(item.term);
        if (!poolKeys.has(itemKey)) {
          poolKeys.add(itemKey);
          pool.push(item);
        }
      }
    }

    const realCards = pool.slice(0, targetCount);
    const realKeys = new Set(realCards.map((r) => normalizeKey(r.term)));
    /** @type {Array<{ sourceCard: Record<string, any>, distortedTerm: string, definition: string, explanation: string, originalTerm: string, isAiGenerated: boolean }>} */
    const trapEntries = [];
    let isAiGenerated = false;

    // 3. Tạo 2 thẻ bẫy vô nghiệm khi ở Chế độ Khó (Hard Mode)
    if (currentDiff === 'hard') {
      const cleanDeckForTraps = (cardsRef.current || []).filter(
        (c) =>
          c &&
          c.term &&
          String(c.term).trim() !== '' &&
          c.definition &&
          String(c.definition).trim() !== '' &&
          !realKeys.has(normalizeKey(c.term))
      );
      let trapSources = Utils.shuffleArray(cleanDeckForTraps).slice(0, 2);

      if (trapSources.length < 2 && FallbackDataEngine?.getFallbackData) {
        const fbItems = FallbackDataEngine.getFallbackData(
          curLang,
          currentDataMode,
          pickedLevel,
          15
        );
        const existingTrapKeys = new Set(trapSources.map((tr) => normalizeKey(tr.term)));
        for (const fb of Utils.shuffleArray(fbItems || [])) {
          if (trapSources.length >= 2) break;
          const fbKey = normalizeKey(fb?.term);
          if (fbKey && fb?.definition && !realKeys.has(fbKey) && !existingTrapKeys.has(fbKey)) {
            existingTrapKeys.add(fbKey);
            trapSources.push(fb);
          }
        }
      }

      if (trapSources.length < 2) {
        const hardList = HARD_MATCH_FALLBACK[curLang] || HARD_MATCH_FALLBACK.en;
        const existingTrapKeys = new Set(trapSources.map((tr) => normalizeKey(tr.term)));
        for (const item of hardList) {
          if (trapSources.length >= 2) break;
          const itemKey = normalizeKey(item.term);
          if (!realKeys.has(itemKey) && !existingTrapKeys.has(itemKey)) {
            existingTrapKeys.add(itemKey);
            trapSources.push(item);
          }
        }
      }

      const type = currentDataMode === 'sentence' ? 'sentence' : 'word';

      for (let i = 0; i < trapSources.length; i++) {
        const trapCard = trapSources[i];
        let distortedTerm = '';
        let explanation = '';

        if (cfg.isAiMode && currentApiKey && GameAlgoEngine?.DistortionEngine?.ai_distort) {
          try {
            const res = await GameAlgoEngine.DistortionEngine.ai_distort(
              trapCard.term,
              curLang,
              type,
              currentApiKey,
              pickedLevel,
              safeTopicStr
            );
            const returnedDistortion =
              type === 'word' ? res?.wrongWord : res?.wrongSentence;
            if (
              returnedDistortion &&
              normalizeKey(returnedDistortion) !== normalizeKey(trapCard.term)
            ) {
              distortedTerm = String(returnedDistortion).trim();
              explanation = String(res?.explanation || '').trim();
              isAiGenerated = true;
              safeAddTotalTokens(150);
            }
          } catch (e) {
            console.warn('[MatchGame] AI Distortion fallback to Offline:', e?.message || e);
            if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
              window.logSystemEvent('Lỗi API bóp méo bẫy Match', e);
            }
          }
        }

        if (!distortedTerm && GameAlgoEngine?.DistortionEngine?.offline_distort) {
          const offRes = GameAlgoEngine.DistortionEngine.offline_distort(
            trapCard.term,
            curLang,
            type
          );
          const candidate = type === 'word' ? offRes?.wrongWord : offRes?.wrongSentence;
          if (candidate && normalizeKey(candidate) !== normalizeKey(trapCard.term)) {
            distortedTerm = String(candidate).trim();
          }
          explanation = String(offRes?.explanation || '').trim();
        }

        // Vá lỗi Runtime ngầm #1 (Ver 1.1): nối chuỗi tường minh chống mất ký tự `$`
        if (!distortedTerm) {
          const safeTrapTerm = String(trapCard.term || '').trim();
          distortedTerm = curLang === 'zh' ? safeTrapTerm + '的' : safeTrapTerm + 'x';
          explanation = 'Lỗi hình thái từ (Offline).';
        }

        trapEntries.push({
          sourceCard: trapCard,
          distortedTerm,
          definition: String(trapCard.definition || '').trim(),
          explanation,
          originalTerm: String(trapCard.term).trim(),
          isAiGenerated
        });
      }
    }

    // Dựng tách bạch cột Trái & cột Phải (không dò isTrap bằng so khớp term -> chống đụng độ F3/F10)
    /** @type {MatchLeftItem[]} */
    const realLeftItems = realCards.map((c) => ({
      id: nextMatchUid('left_real'),
      term: String(c.term).trim(),
      definition: String(c.definition || 'Không có định nghĩa').trim(),
      isTrap: false,
      originalTerm: String(c.term).trim(),
      explanation: String(c.analysis || c.explanation || '').trim(),
      origin: c
    }));

    /** @type {MatchLeftItem[]} */
    const trapLeftItems = trapEntries.map((tr) => ({
      id: nextMatchUid('left_trap'),
      term: tr.originalTerm,
      definition: tr.definition || 'Không có định nghĩa',
      isTrap: true,
      originalTerm: tr.originalTerm,
      explanation: tr.explanation,
      origin: {
        ...tr.sourceCard,
        term: tr.originalTerm,
        definition: tr.definition,
        explanation: tr.explanation
      }
    }));

    /** @type {MatchRightItem[]} */
    const realRightItems = realCards.map((c) => ({
      id: nextMatchUid('right_real'),
      term: String(c.term).trim(),
      isTrap: false,
      originalTerm: String(c.term).trim(),
      explanation: ''
    }));

    /** @type {MatchRightItem[]} */
    const trapRightItems = trapEntries.map((tr) => ({
      id: nextMatchUid('right_trap'),
      term: tr.distortedTerm,
      isTrap: true,
      originalTerm: tr.originalTerm,
      explanation: tr.explanation
    }));

    return {
      pairs: realCards,
      leftItems: shuffleNoAdjacentTraps([...realLeftItems, ...trapLeftItems]),
      rightItems: shuffleNoAdjacentTraps([...realRightItems, ...trapRightItems]),
      isAiGenerated,
      _isRescued: false
    };
  }, []);

  // Khóa wrapper ổn định cho BatchQueueCoordinator (0 Stale Closure)
  const fetchTaskRef = useRef(fetchTask);
  fetchTaskRef.current = fetchTask;

  // ==========================================================================
  // 7. ÁP DỤNG VÒNG CHƠI MỚI, CHUYỂN VÒNG & CHẤM ĐIỂM
  // ==========================================================================
  const applyMatchData = useCallback(
    (rawData) => {
      if (!isGameActiveRef.current) return;
      const data = normalizeMatchRoundData(rawData) || buildHardFallbackMatchRound();
      if (!data) return;

      cleanupTimers();
      isCheckingLockRef.current = false;

      /** @type {MatchState} */
      const nextMatchState = {
        pairs: data.pairs || [],
        leftItems: data.leftItems || [],
        rightItems: data.rightItems || [],
        connections: {},
        selectedLeft: null,
        isChecked: false,
        score: 0,
        correctLines: [],
        wrongLines: [],
        missingLines: [],
        timer: 10,
        isAiGenerated: Boolean(data.isAiGenerated),
        isResultPaused: false,
        _isRescued: Boolean(data._isRescued)
      };

      matchStateRef.current = nextMatchState;
      resultCountdownRef.current = 10;
      setMatchState(nextMatchState);

      const nextTimeLimit = configRef.current.timeLimit;
      timeLeftRef.current = nextTimeLimit;
      setTimeLeft(nextTimeLimit);
      setIsGenerating(false);

      const currentCooldown =
        configRef.current.sourceMode === 'ai_pure' || configRef.current.isAiMode
          ? getConfiguredUiCooldown(9)
          : 0;
      aiWaitTimeRef.current = currentCooldown;
      setAiWaitTime(currentCooldown);

      syncQueueLength();
      scheduleAutoSave();
    },
    [buildHardFallbackMatchRound, cleanupTimers, scheduleAutoSave, syncQueueLength]
  );

  // Chuyển sang vòng nối ô tiếp theo (có khóa chống double-click)
  const generateMatch = useCallback(async () => {
    if (!isGameActiveRef.current || isTransitioningRoundRef.current) return;
    isTransitioningRoundRef.current = true;

    cleanupTimers();

    try {
      const coord = coordinatorRef.current;
      const isOfflineFastTrack =
        configRef.current.sourceMode === 'card' && !configRef.current.isAiMode;

      if (coord && typeof coord.length === 'function' && coord.length() > 0) {
        const nextData = coord.pop();
        syncQueueLength();
        if (coord && typeof coord.maintain === 'function') {
          const { loadingTime } = readAiCoreConfig();
          coord
            .maintain(false, loadingTime * 1000, isOfflineFastTrack)
            .then(syncQueueLength)
            .catch(() => {});
        }
        if (isGameActiveRef.current && nextData) {
          applyMatchData(nextData);
          return;
        }
      }

      setIsGenerating(true);
      let fresh = null;

      if (coord && typeof coord.maintain === 'function') {
        const { loadingTime } = readAiCoreConfig();
        await coord.maintain(false, loadingTime * 1000, isOfflineFastTrack);
        if (!isGameActiveRef.current) return;
        fresh = coord.pop();
        syncQueueLength();
      }

      if (!fresh && isGameActiveRef.current) {
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent(
            'Queue cạn đạn lúc chuyển vòng Game Nối Ô',
            'Kích hoạt Hard Fallback'
          );
        }
        safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
        fresh = buildHardFallbackMatchRound();
      }

      if (isGameActiveRef.current && fresh) {
        applyMatchData(fresh);
      } else if (isGameActiveRef.current) {
        setIsGenerating(false);
      }
    } finally {
      isTransitioningRoundRef.current = false;
    }
  }, [applyMatchData, buildHardFallbackMatchRound, cleanupTimers, safeShowToast, syncQueueLength]);

  const generateMatchRef = useRef(generateMatch);
  generateMatchRef.current = generateMatch;

  // Kiểm tra kết quả nối dây (DIỆT F9: Khóa chống double-check + log từ sạch cho thẻ bẫy)
  const checkMatch = useCallback(
    (isTimeout = false) => {
      const curState = matchStateRef.current;
      if (
        !isGameActiveRef.current ||
        !curState ||
        curState.isChecked ||
        isCheckingLockRef.current ||
        !Array.isArray(curState.leftItems) ||
        curState.leftItems.length === 0
      ) {
        return;
      }

      isCheckingLockRef.current = true;
      cleanupTimers();

      let roundScore = 0;
      /** @type {MatchLine[]} */
      const correctLines = [];
      /** @type {MatchLine[]} */
      const wrongLines = [];
      /** @type {MatchLine[]} */
      const missingLines = [];

      curState.leftItems.forEach((left) => {
        const userConnectedRightId = curState.connections[left.id];
        if (left.isTrap) {
          if (userConnectedRightId === undefined) {
            roundScore++;
          } else {
            wrongLines.push({ start: left.id, end: userConnectedRightId });
            // DIỆT F9: Truyền nguyên object `left` để `logMistake` trích xuất `originalTerm` sạch
            logMistake(left);
          }
        } else {
          const leftKey = normalizeKey(left.originalTerm || left.term);
          const correctRight = curState.rightItems.find(
            (r) => !r.isTrap && normalizeKey(r.term) === leftKey
          );
          if (userConnectedRightId !== undefined) {
            if (correctRight && String(userConnectedRightId) === String(correctRight.id)) {
              roundScore++;
              correctLines.push({ start: left.id, end: userConnectedRightId });
              localRemoveFromRetryBag(left.originalTerm || left.term);
            } else {
              wrongLines.push({ start: left.id, end: userConnectedRightId });
              if (correctRight) {
                missingLines.push({ start: left.id, end: correctRight.id });
              }
              logMistake(left);
              localPushToRetryBag(left);
            }
          } else {
            if (correctRight) {
              missingLines.push({ start: left.id, end: correctRight.id });
            }
            logMistake(left);
            localPushToRetryBag(left);
          }
        }
      });

      const totalItems = curState.leftItems.length;
      const isPerfectRound = roundScore === totalItems;
      playGameSFX(isPerfectRound ? 'correct' : 'wrong', effectiveMutedRef.current);

      const delaySec = Math.max(10, aiWaitTimeRef.current || 0);
      resultCountdownRef.current = delaySec;

      const nextStats = {
        correct: gameStatsRef.current.correct + roundScore,
        wrong: gameStatsRef.current.wrong + (totalItems - roundScore)
      };
      gameStatsRef.current = nextStats;
      setGameStats(nextStats);

      /** @type {MatchState} */
      const checkedState = {
        ...curState,
        isChecked: true,
        score: roundScore,
        correctLines,
        wrongLines,
        missingLines,
        timer: delaySec,
        isResultPaused: false
      };
      matchStateRef.current = checkedState;
      setMatchState(checkedState);

      const curDiff = configRef.current.difficulty;
      if (curDiff === 'hard' && isPerfectRound) {
        safeShowToast('Xuất sắc! Bạn không sập bẫy!', 'success');
      } else if (curDiff === 'hard' && !isPerfectRound) {
        safeShowToast(
          isTimeout
            ? 'Hết giờ! Cẩn thận sập bẫy nhé!'
            : 'Có lỗi sai rồi, cẩn thận sập bẫy nhé!',
          'warning'
        );
      } else if (isTimeout) {
        safeShowToast('Hết giờ! Đã tự động kiểm tra.', 'warning');
      }

      scheduleAutoSave();
    },
    [
      cleanupTimers,
      localPushToRetryBag,
      localRemoveFromRetryBag,
      logMistake,
      safeShowToast,
      scheduleAutoSave
    ]
  );

  const checkMatchRef = useRef(checkMatch);
  checkMatchRef.current = checkMatch;

  // ==========================================================================
  // 8. VÒNG ĐỜI KHỞI TẠO / KHÔI PHỤC (DIỆT C2 & C7: STRICTMODE + ZOMBIEKILLER)
  // ==========================================================================
  useEffect(() => {
    isGameActiveRef.current = true;
    let cancelled = false;

    const initSession = async () => {
      if (cancelled || !isGameActiveRef.current) return;

      const cfg = configRef.current;
      const curLang = langRef.current === 'zh' ? 'zh' : 'en';
      const { pickedLevel } = normalizeLevelAndTopic(cfg.level, cfg.topic, curLang);
      const { maxAmmo, loadingTime } = readAiCoreConfig();
      const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.isAiMode;

      // Cảnh báo nếu AI Pure mà thiếu API Key 4 tầng
      if (cfg.sourceMode === 'ai_pure' && !resolveActiveApiKey(apiKeyRef.current)) {
        if (typeof onMissingKey === 'function') onMissingKey();
      }

      // Chuẩn bị bộ bài cho Card Mode (nếu chưa có deck khôi phục)
      if (cfg.sourceMode === 'card' && deckRef.current.length === 0) {
        let validCards = (cardsRef.current || []).filter(
          (c) => c && c.term && String(c.term).trim() !== ''
        );
        if (validCards.length < 4) {
          safeShowToast(
            'Bộ thẻ không đủ 4 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
            'warning'
          );
          if (FallbackDataEngine?.getFallbackData) {
            const fbMode = cfg.dataMode === 'sentence' ? 'sentence' : 'vocab';
            const fbItems = FallbackDataEngine.getFallbackData(
              curLang,
              fbMode,
              pickedLevel,
              20
            );
            const existingKeys = new Set(validCards.map((c) => normalizeKey(c.term)));
            for (const fb of fbItems || []) {
              if (!existingKeys.has(normalizeKey(fb?.term))) {
                existingKeys.add(normalizeKey(fb?.term));
                validCards.push(fb);
              }
            }
          }
          if (validCards.length < 4) {
            const hardList = HARD_MATCH_FALLBACK[curLang] || HARD_MATCH_FALLBACK.en;
            const existingKeys = new Set(validCards.map((c) => normalizeKey(c.term)));
            for (const item of hardList) {
              if (!existingKeys.has(normalizeKey(item.term))) {
                existingKeys.add(normalizeKey(item.term));
                validCards.push(item);
              }
            }
          }
        }
        deckRef.current = Utils.shuffleArray(validCards);
      }

      // Khởi tạo BatchQueueCoordinator sau nhịp 50ms -> StrictMode unmount #1 KHÔNG gọi ZombieKiller
      const coord =
        QueueEngine && typeof QueueEngine.createBatchQueueCoordinator === 'function'
          ? QueueEngine.createBatchQueueCoordinator(() => fetchTaskRef.current(), maxAmmo)
          : null;
      coordinatorRef.current = coord;

      // Trường hợp 1: Resume vòng đang chơi dở (chưa kiểm tra)
      if (hasRestoredActiveRound) {
        setIsGenerating(false);
        if (coord && typeof coord.maintain === 'function') {
          coord
            .maintain(false, loadingTime * 1000, isOfflineFastTrack)
            .then(syncQueueLength)
            .catch(() => {});
        }
        return;
      }

      // Trường hợp 2: Ván mới hoặc Resume sau khi vòng trước đã kiểm tra / thoát ngang
      setIsGenerating(true);
      let firstData = null;

      if (coord && typeof coord.maintain === 'function') {
        await coord.maintain(true, loadingTime * 1000, isOfflineFastTrack);
        if (cancelled || !isGameActiveRef.current) return;
        firstData = coord.pop();
        syncQueueLength();
        coord
          .maintain(false, loadingTime * 1000, isOfflineFastTrack)
          .then(syncQueueLength)
          .catch(() => {});
      }

      if (!firstData && !cancelled && isGameActiveRef.current) {
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent(
            'Queue cạn đạn lúc khởi tạo Game Nối Ô',
            'Kích hoạt Hard Fallback'
          );
        }
        safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
        firstData = buildHardFallbackMatchRound();
      }

      if (cancelled || !isGameActiveRef.current) return;

      if (firstData) {
        applyMatchData(firstData);
        if (!savedState) {
          safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
        }
      } else {
        setIsGenerating(false);
      }
    };

    const bootTimer = setTimeout(() => {
      if (!cancelled) {
        initSession();
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      isGameActiveRef.current = false;
      cleanupTimers();
      if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
    };
    // Chạy đúng 1 lần cho mỗi phiên chơi (GameView cấp key={gameSessionId} riêng mỗi ván)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================================
  // 9. ĐỒNG HỒ ĐẾM NGƯỢC LÀM BÀI & CHUYỂN VÒNG (PURE — 0 SIDE-EFFECT TRONG UPDATER)
  // ==========================================================================
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (
      !effectiveTimerMode ||
      matchState.isChecked ||
      effectivePaused ||
      isLoading ||
      isGenerating ||
      matchState.leftItems.length === 0
    ) {
      return undefined;
    }

    timerIntervalRef.current = setInterval(() => {
      if (
        !isGameActiveRef.current ||
        effectivePausedRef.current ||
        matchStateRef.current.isChecked
      ) {
        return;
      }
      const nextVal = timeLeftRef.current - 1;
      if (nextVal <= 0) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        timeLeftRef.current = 0;
        setTimeLeft(0);
        checkMatchRef.current(true);
        return;
      }
      timeLeftRef.current = nextVal;
      setTimeLeft(nextVal);
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [
    effectiveTimerMode,
    matchState.isChecked,
    matchState.leftItems.length,
    effectivePaused,
    isLoading,
    isGenerating
  ]);

  useEffect(() => {
    if (resultIntervalRef.current) {
      clearInterval(resultIntervalRef.current);
      resultIntervalRef.current = null;
    }

    if (
      !matchState.isChecked ||
      effectivePaused ||
      matchState.isResultPaused ||
      isGenerating
    ) {
      return undefined;
    }

    resultIntervalRef.current = setInterval(() => {
      if (
        !isGameActiveRef.current ||
        effectivePausedRef.current ||
        matchStateRef.current.isResultPaused ||
        !matchStateRef.current.isChecked
      ) {
        return;
      }
      const nextSec = resultCountdownRef.current - 1;
      if (nextSec <= 0) {
        if (resultIntervalRef.current) {
          clearInterval(resultIntervalRef.current);
          resultIntervalRef.current = null;
        }
        resultCountdownRef.current = 0;
        setMatchState((p) => ({ ...p, timer: 0 }));
        generateMatchRef.current();
        return;
      }
      resultCountdownRef.current = nextSec;
      setMatchState((p) => ({ ...p, timer: nextSec }));
    }, 1000);

    return () => {
      if (resultIntervalRef.current) {
        clearInterval(resultIntervalRef.current);
        resultIntervalRef.current = null;
      }
    };
  }, [matchState.isChecked, matchState.isResultPaused, effectivePaused, isGenerating]);

  // ==========================================================================
  // 10. TƯƠNG TÁC NGƯỜI DÙNG (TẠM DỪNG, NỐI DÂY, THOÁT MENU, KẾT THÚC)
  // ==========================================================================
  const handleTogglePause = useCallback(() => {
    setInternalPaused((prev) => {
      const next = !prev;
      effectivePausedRef.current = Boolean(propIsPaused || next);
      if (next) {
        try {
          if (typeof stopSpeakingRef.current === 'function') {
            stopSpeakingRef.current();
          } else if (typeof onPauseRef.current === 'function') {
            onPauseRef.current();
          }
        } catch {
          // Bỏ qua an toàn
        }
      }
      return next;
    });
  }, [propIsPaused]);

  const toggleResultPause = useCallback(() => {
    setMatchState((p) => {
      const nextPaused = !p.isResultPaused;
      matchStateRef.current = { ...p, isResultPaused: nextPaused };
      return { ...p, isResultPaused: nextPaused };
    });
  }, []);

  // Xử lý click nối ô Trái - Phải
  const handleMatchClick = useCallback((side, id) => {
    const cur = matchStateRef.current;
    if (cur.isChecked || effectivePausedRef.current) return;
    playGameSFX('click', effectiveMutedRef.current);

    if (side === 'left') {
      const existingRight = cur.connections[id];
      if (existingRight !== undefined) {
        const newConn = { ...cur.connections };
        delete newConn[id];
        setMatchState((p) => ({ ...p, connections: newConn, selectedLeft: id }));
      } else {
        setMatchState((p) => ({ ...p, selectedLeft: id }));
      }
    } else if (cur.selectedLeft !== null) {
      const currentLeft = Object.keys(cur.connections).find(
        (key) => String(cur.connections[key]) === String(id)
      );
      const newConn = { ...cur.connections };
      if (currentLeft) delete newConn[currentLeft];
      newConn[cur.selectedLeft] = id;
      setMatchState((p) => ({ ...p, connections: newConn, selectedLeft: null }));
    }
  }, []);

  // Thoát về Menu kèm kỷ luật thoát ngang & dọn tài nguyên
  const handleSaveAndBack = useCallback(() => {
    cleanupTimers();

    const curMatch = matchStateRef.current;
    const finalStats = { ...gameStatsRef.current };
    let needsNext = Boolean(curMatch?.isChecked);
    const totalAnswered = finalStats.correct + finalStats.wrong;

    // Áp dụng kỷ luật thoát ngang khi đang chơi dở giữa vòng (trừ lúc hủy Loading ở 0/0)
    if (
      curMatch &&
      !curMatch.isChecked &&
      Array.isArray(curMatch.leftItems) &&
      curMatch.leftItems.length > 0 &&
      (totalAnswered > 0 || Object.keys(curMatch.connections || {}).length > 0)
    ) {
      let realCount = 0;
      curMatch.leftItems.forEach((item) => {
        if (!item.isTrap) {
          realCount++;
          localPushToRetryBag(item);
          logMistake(item);
        }
      });
      finalStats.wrong += realCount || curMatch.pairs?.length || 4;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính lỗi sai!', 'warning');
    }

    const snapshot =
      curMatch?.leftItems?.length > 0 || totalAnswered > 0
        ? buildSessionSnapshot({
            gameStats: finalStats,
            _needsNextOnResume: needsNext
          })
        : null;

    isGameActiveRef.current = false;
    if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    if (typeof onBack === 'function') {
      onBack(snapshot);
    }
  }, [
    buildSessionSnapshot,
    cleanupTimers,
    localPushToRetryBag,
    logMistake,
    onBack,
    safeShowToast
  ]);

  // Kết thúc ván chơi: dọn sạch timer & coordinator (DIỆT F11)
  const handleEndGameInternal = useCallback(
    (statsOverride) => {
      cleanupTimers();
      isGameActiveRef.current = false;

      if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }

      if (typeof onEndGame === 'function') {
        onEndGame(statsOverride || { ...gameStatsRef.current });
      }
    },
    [cleanupTimers, onEndGame]
  );

  const totalPlayed = gameStats.correct + gameStats.wrong;
  const accuracy = totalPlayed > 0 ? Math.round((gameStats.correct / totalPlayed) * 100) : 0;

  return (
    <MatchPlayScreen
      t={t}
      mainColor={mainColor}
      isLoading={isLoading}
      isPaused={effectivePaused}
      onPause={handleTogglePause}
      handleSaveAndBack={handleSaveAndBack}
      onEndGame={handleEndGameInternal}
      timerMode={effectiveTimerMode}
      timeLeft={timeLeft}
      timeLimit={effectiveTimeLimit}
      gameStats={gameStats}
      accuracy={accuracy}
      difficulty={difficulty}
      isAiMode={isAiMode}
      matchState={matchState}
      settings={settings}
      notebook={notebook}
      onBookmark={effectiveBookmarkFn}
      handleMatchClick={handleMatchClick}
      checkMatch={checkMatch}
      generateMatch={generateMatch}
      toggleResultPause={toggleResultPause}
      isGenerating={isGenerating}
      config={resolvedConfig}
      queueLength={queueLength}
      aiWaitTime={aiWaitTime}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).MatchGame = MatchGame;
  /** @type {any} */ (window).Block5_1_MatchGame = MatchGame;
  /** @type {any} */ (window).Block5_2_MatchGame = MatchGame;
}

export default MatchGame;