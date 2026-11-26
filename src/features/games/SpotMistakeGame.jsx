// ============================================================================
// FILE 61/85: src/features/games/SpotMistakeGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.11 - SpotMistake Logic & Wrapper V1.23)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 21:33 (GMT+7)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Tìm Lỗi Sai (Spot Mistake), quản lý
//           luồng nạp đạn AI/Offline, định vị tọa độ lỗi tuyệt đối (Absolute
//           Indexing), chấm điểm thẩm thấu toàn câu và gọi AI On-Demand.
//           Nâng cấp Ver 1.1 (Diệt sạch 18/18 lỗi ts(2339) & 2 lỗi Runtime ngầm):
//           1. Diệt 18/18 lỗi ts(2339) tại `configRef`: Khai báo tường minh
//              `dataMode`, `level`, `topic`, `apiKey` và khóa kiểu
//              `Record<string, any>` cho `resolvedHookConfig` / `configRef`.
//           2. Vá lỗi Runtime ngầm #2 tại `findEnglishWrongSpan` & `escapeRegex`:
//              Dựng RegExp ranh giới từ bằng phép nối chuỗi tường minh kết hợp
//              `String.fromCharCode(36)` cho ký tự neo cuối dòng (diệt triệt để
//              lỗi mất `$` làm hỏng biểu thức chính quy Tiếng Anh).
//           3. Vá lỗi Runtime ngầm #3 tại `handleExplain`: Dựng chuỗi prompt
//              giải thích ngữ pháp bằng phép nối chuỗi tường minh (đảm bảo gửi
//              đúng câu sai, từ sai và đáp án sửa lên Gemini).
//           4. Bảo toàn 100% chuẩn Ver 1.0: StrictMode-safe (bootTimer 50ms),
//              0/0/0 Radar, `normalizeSpotMistakeData`, `reconstructCorrectText`,
//              hợp đồng 2 tham số `onSaveToHarvest(harvestLevelKey, harvestData)`
//              và sạch 0 Problems `tsc / checkJs`.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { callGeminiApi, explainSentenceGrammar } from '@/services/geminiApi';
import { GameAlgoEngine } from '@/engines/gameOfflineEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { SpotMistakePlayScreen } from './SpotMistakeUI';
import {
  normalizeLevelAndTopic,
  getConfiguredUiCooldown,
  mergePendingAmmoToDeck,
  resolveActiveApiKey,
  playGameSFX
} from './common/gameHelpers';

/**
 * @typedef {{ id: string, text: string, isTarget: boolean }} SpotChunk
 * @typedef {{
 *   wrongSentence: string,
 *   wrongWord: string,
 *   correction: string,
 *   explanation: string,
 *   hint?: string,
 *   origin?: Record<string, any>,
 *   isAiGenerated?: boolean,
 *   _isRescued?: boolean
 * }} SpotQuestionData
 */

// Bộ đếm ID đơn điệu toàn cục (chống trùng key chunk trong cùng 1ms)
let spotUidSeq = 0;
/**
 * @param {string} prefix
 * @returns {string}
 */
const nextSpotUid = (prefix) => {
  spotUidSeq = (spotUidSeq + 1) % 1000000000;
  return prefix + '_' + String(spotUidSeq) + '_' + String(Date.now());
};

// Kho chốt chặn cứng song ngữ bất tử (EN & ZH) đảm bảo 0% trắng màn hình
const HARD_SPOT_FALLBACK = {
  en: [
    {
      wrongSentence: 'She go to school every morning.',
      wrongWord: 'go',
      correction: 'goes',
      explanation: 'Chủ ngữ ngôi thứ ba số ít "She" đi với động từ chia thêm "-es" (goes).',
      hint: 'Cô ấy đi học vào mỗi buổi sáng.',
      origin: {
        term: 'She goes to school every morning.',
        definition: 'Cô ấy đi học vào mỗi buổi sáng.'
      }
    },
    {
      wrongSentence: 'The childrens are playing in the park.',
      wrongWord: 'childrens',
      correction: 'children',
      explanation: '"Children" đã là danh từ số nhiều bất quy tắc của "child", không thêm "s".',
      hint: 'Bọn trẻ đang chơi trong công viên.',
      origin: {
        term: 'The children are playing in the park.',
        definition: 'Bọn trẻ đang chơi trong công viên.'
      }
    },
    {
      wrongSentence: 'He do not like drinking cold coffee.',
      wrongWord: 'do',
      correction: 'does',
      explanation: 'Chủ ngữ số ít "He" dùng trợ động từ "does" ở thì hiện tại đơn.',
      hint: 'Anh ấy không thích uống cà phê lạnh.',
      origin: {
        term: 'He does not like drinking cold coffee.',
        definition: 'Anh ấy không thích uống cà phê lạnh.'
      }
    },
    {
      wrongSentence: 'There is many books on the wooden table.',
      wrongWord: 'is',
      correction: 'are',
      explanation: '"Many books" là danh từ số nhiều nên động từ to-be phải là "are".',
      hint: 'Có rất nhiều quyển sách trên chiếc bàn gỗ.',
      origin: {
        term: 'There are many books on the wooden table.',
        definition: 'Có rất nhiều quyển sách trên chiếc bàn gỗ.'
      }
    }
  ],
  zh: [
    {
      wrongSentence: '我每天吃水。',
      wrongWord: '吃',
      correction: '喝',
      explanation:
        'Với đồ uống như "水" (nước), tiếng Trung dùng động từ "喝" (uống), không dùng "吃" (ăn).',
      hint: 'Tôi uống nước mỗi ngày.',
      origin: {
        term: '我每天喝水。',
        definition: 'Tôi uống nước mỗi ngày.'
      }
    },
    {
      wrongSentence: '她昨天去学校了明天。',
      wrongWord: '明天',
      correction: '已经',
      explanation:
        'Câu đã có trạng ngữ quá khứ "昨天" (hôm qua), không thể dùng "明天" (ngày mai).',
      hint: 'Hôm qua cô ấy đã đến trường rồi.',
      origin: {
        term: '她昨天已经去学校了。',
        definition: 'Hôm qua cô ấy đã đến trường rồi.'
      }
    },
    {
      wrongSentence: '我有一本书很漂亮在桌子上。',
      wrongWord: '一本书',
      correction: '一本',
      explanation:
        'Cụm định ngữ "很漂亮的书" cần giữ lượng từ "一本" gọn gàng trước tính từ.',
      hint: 'Tôi có một quyển sách rất đẹp trên bàn.',
      origin: {
        term: '我有一本很漂亮的书在桌子上。',
        definition: 'Tôi có một quyển sách rất đẹp trên bàn.'
      }
    },
    {
      wrongSentence: '他非常喜欢看音乐。',
      wrongWord: '看',
      correction: '听',
      explanation: 'Với "音乐" (âm nhạc), phải dùng động từ "听" (nghe) thay vì "看" (xem).',
      hint: 'Anh ấy rất thích nghe nhạc.',
      origin: {
        term: '他非常喜欢听音乐。',
        definition: 'Anh ấy rất thích nghe nhạc.'
      }
    }
  ]
};

/**
 * Chuẩn hóa khóa so khớp Unicode NFC (loại dấu gạch chân kết hợp \u0332)
 * @param {any} val
 * @returns {string}
 */
const normalizeCompareKey = (val) => {
  if (val === undefined || val === null) return '';
  const cleaned = String(val)
    .replace(/\u0332/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return typeof cleaned.normalize === 'function' ? cleaned.normalize('NFC') : cleaned;
};

/**
 * Chuẩn hóa văn bản chấm điểm (bỏ dấu câu Anh/Trung, dấu gạch chân & chuẩn NFC)
 * @param {any} str
 * @returns {string}
 */
const normalizeForGrading = (str) => {
  if (str === undefined || str === null) return '';
  const stripped = String(str)
    .replace(/\u0332/g, '')
    .replace(/[.,?!;:"'()[\]{}。，？！；：“”‘’（）【】]/g, '');
  const base =
    Utils && typeof Utils.advancedNormalize === 'function'
      ? Utils.advancedNormalize(stripped)
      : stripped.toLowerCase();
  return String(base || '')
    .replace(/\s+/g, '')
    .trim();
};

// Ký tự neo cuối chuỗi RegExp tách rời để miễn nhiễm 100% với parser Markdown/LaTeX
const REGEX_END_ANCHOR = String.fromCharCode(36);
const REGEX_META_CHARS = new RegExp(
  '[.*+?^' + REGEX_END_ANCHOR + '{}()|[\\]\\\\]',
  'g'
);

/**
 * Escape ký tự đặc biệt cho RegExp (an toàn tuyệt đối, không chứa cặp ký tự `$`)
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) =>
  String(str || '').replace(REGEX_META_CHARS, (match) => '\\' + match);

/**
 * Đọc cấu hình đã lưu an toàn qua Utils.safeJsonParse
 * @returns {Record<string, any>}
 */
const readStoredSpotConfig = () => {
  try {
    const parsed = Utils.safeJsonParse('fc_spotmistake_config', {});
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
 * Cộng dồn token AI an toàn qua Utils.safeLocalStorageSet (Diệt 1 HIGH Radar & chống NaN)
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
 * Ghi nhận từ/câu vào bộ nhớ chống lặp 400 từ (Diệt 1 MEDIUM Radar)
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
    // Fallback sang Utils.safeLocalStorageSet
  }
  const list = readFreshAiMemory();
  const key = normalizeCompareKey(cleanTerm);
  const nextList = [
    ...list.filter((item) => normalizeCompareKey(item) !== key),
    cleanTerm
  ].slice(-400);
  Utils.safeLocalStorageSet('fc_ai_memory', nextList);
};

/**
 * Chuẩn hóa khóa cấp độ cho Kho AI Harvest (luôn có tiền tố 'en_' hoặc 'zh_')
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
 * Tìm vị trí bắt đầu đầu tiên khác biệt giữa câu sai và câu gốc
 * @param {string} sentence
 * @param {string} originTerm
 * @returns {number}
 */
const findFirstDiffIndex = (sentence, originTerm) => {
  if (!sentence || !originTerm) return -1;
  const minLen = Math.min(sentence.length, originTerm.length);
  for (let i = 0; i < minLen; i++) {
    if (sentence[i] !== originTerm[i]) return i;
  }
  return sentence.length !== originTerm.length ? minLen : -1;
};

/**
 * Định vị span [start, end) của lỗi sai trong câu Tiếng Anh theo ranh giới từ
 * Diệt F14 & Vá lỗi Runtime ngầm #2 (Ver 1.1): Không bao giờ cắt đôi từ Tiếng Anh
 * và dựng RegExp tường minh với REGEX_END_ANCHOR (miễn nhiễm lỗi mất `$`).
 * @param {string} sentence
 * @param {string} wrong
 * @param {string} originTerm
 * @returns {{ start: number, end: number } | null}
 */
const findEnglishWrongSpan = (sentence, wrong, originTerm) => {
  if (!sentence || !wrong) return null;
  const trimmedWrong = wrong.trim();
  if (!trimmedWrong) return null;

  const diffIdx = findFirstDiffIndex(sentence, originTerm);

  /**
   * Thu thập tất cả vị trí khớp theo regex ranh giới từ (ưu tiên nguyên từ/cụm từ)
   * @param {string} flags
   * @returns {Array<{ start: number, end: number }>}
   */
  const collectBoundaryMatches = (flags) => {
    /** @type {Array<{ start: number, end: number }>} */
    const matches = [];
    const pattern = new RegExp(
      '(^|[^\\p{L}\\p{N}])(' +
        escapeRegex(trimmedWrong) +
        ')(?=' +
        REGEX_END_ANCHOR +
        '|[^\\p{L}\\p{N}])',
      flags + 'u'
    );
    let m = pattern.exec(sentence);
    while (m !== null) {
      const prefixLen = m[1] ? m[1].length : 0;
      const start = m.index + prefixLen;
      const end = start + m[2].length;
      matches.push({ start, end });
      if (m[0].length === 0) pattern.lastIndex += 1;
      m = pattern.exec(sentence);
    }
    return matches;
  };

  let candidates = collectBoundaryMatches('g');
  if (candidates.length === 0) {
    candidates = collectBoundaryMatches('gi');
  }

  if (candidates.length > 0) {
    if (diffIdx === -1 || candidates.length === 1) return candidates[0];
    return candidates.reduce((best, cur) =>
      Math.abs(cur.start - diffIdx) < Math.abs(best.start - diffIdx) ? cur : best
    );
  }

  // Trường hợp chế độ từ đơn hoặc lỗi nằm bên trong 1 token duy nhất: mở rộng ra nguyên token
  const lowerSent = sentence.toLowerCase();
  const lowerWrong = trimmedWrong.toLowerCase();
  /** @type {number[]} */
  const subIndices = [];
  let searchFrom = 0;
  while (searchFrom < lowerSent.length) {
    const idx = lowerSent.indexOf(lowerWrong, searchFrom);
    if (idx === -1) break;
    subIndices.push(idx);
    searchFrom = idx + 1;
  }

  if (subIndices.length === 0) return null;

  const chosenStart =
    diffIdx === -1
      ? subIndices[0]
      : subIndices.reduce((best, cur) =>
          Math.abs(cur - diffIdx) < Math.abs(best - diffIdx) ? cur : best
        );

  // Mở rộng sang trái/phải tới hết ranh giới khoảng trắng để KHÔNG BAO GIỜ chẻ đôi từ
  let spanStart = chosenStart;
  let spanEnd = chosenStart + trimmedWrong.length;
  while (spanStart > 0 && !/\s/.test(sentence[spanStart - 1])) {
    spanStart -= 1;
  }
  while (spanEnd < sentence.length && !/\s/.test(sentence[spanEnd])) {
    spanEnd += 1;
  }

  return { start: spanStart, end: spanEnd };
};

// ============================================================================
// HELPER NỘI BỘ: PHÂN RÃ KÝ TỰ & ĐỊNH VỊ TỌA ĐỘ LỖI TUYỆT ĐỐI (EN & CJK)
// ============================================================================
/**
 * @param {SpotQuestionData | null | undefined} data
 * @returns {SpotChunk[]}
 */
const buildQuestionChunks = (data) => {
  if (!data) return [];
  const sentence = String(data.wrongSentence || '').trim();
  const wrong = String(data.wrongWord || '').trim();
  const originTerm = String(data.origin?.term || '').trim();
  if (!sentence) return [];

  const isChinese = /[\u4e00-\u9fa5]/.test(sentence);
  /** @type {SpotChunk[]} */
  let wordChunks = [];

  if (isChinese) {
    let exactStartIndex = wrong ? sentence.indexOf(wrong) : -1;
    const diffIdx = findFirstDiffIndex(sentence, originTerm);
    if (diffIdx !== -1 && wrong) {
      const searchAreaStart = Math.max(0, diffIdx - 3);
      const localIndex = sentence.substring(searchAreaStart).indexOf(wrong);
      if (localIndex !== -1) {
        exactStartIndex = searchAreaStart + localIndex;
      }
    }

    let currentStrIdx = 0;
    wordChunks = Array.from(sentence).map((char) => {
      const isTarget =
        exactStartIndex !== -1 &&
        currentStrIdx >= exactStartIndex &&
        currentStrIdx < exactStartIndex + wrong.length;
      currentStrIdx += char.length;
      return { id: nextSpotUid('c'), text: char, isTarget };
    });
  } else if (wrong) {
    const span = findEnglishWrongSpan(sentence, wrong, originTerm);
    if (span) {
      const before = sentence.substring(0, span.start);
      const matchedText = sentence.substring(span.start, span.end).trim();
      const after = sentence.substring(span.end);

      const beforeChunks = before
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((text) => ({
          id: nextSpotUid('cb'),
          text,
          isTarget: false
        }));
      const matchChunk = {
        id: nextSpotUid('cm'),
        text: matchedText,
        isTarget: true
      };
      const afterChunks = after
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((text) => ({
          id: nextSpotUid('ca'),
          text,
          isTarget: false
        }));

      wordChunks = [...beforeChunks, matchChunk, ...afterChunks];
    } else {
      const cleanWrong = wrong.replace(/[.,?!;:'"]/g, '').toLowerCase();
      wordChunks = sentence
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((text) => {
          const cleanText = text.replace(/[.,?!;:'"]/g, '').toLowerCase();
          return {
            id: nextSpotUid('c'),
            text,
            isTarget: Boolean(cleanWrong && cleanText === cleanWrong)
          };
        });
    }
  } else {
    wordChunks = sentence
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((text) => ({
        id: nextSpotUid('c'),
        text,
        isTarget: false
      }));
  }

  // Chốt chặn an toàn: Đảm bảo luôn có ít nhất 1 chunk là mục tiêu để người chơi không bị kẹt
  if (wordChunks.length > 0 && !wordChunks.some((c) => c.isTarget)) {
    const lowerWrong = wrong.toLowerCase();
    const fallbackIdx = lowerWrong
      ? wordChunks.findIndex((c) => c.text.toLowerCase().includes(lowerWrong))
      : -1;
    if (fallbackIdx !== -1) {
      wordChunks[fallbackIdx].isTarget = true;
    } else {
      wordChunks[wordChunks.length - 1].isTarget = true;
    }
  }

  return wordChunks;
};

/**
 * Tái dựng câu hoàn chỉnh chuẩn từ tọa độ `chunks` (chuẩn 100% cho cả EN & CJK)
 * @param {SpotQuestionData | null | undefined} question
 * @param {SpotChunk[]} chunks
 * @param {boolean} [underlineCorrection]
 * @returns {string}
 */
const reconstructCorrectText = (question, chunks, underlineCorrection = false) => {
  if (!question) return '';
  const correction = String(question.correction || '').trim();
  const formattedCorr = underlineCorrection
    ? Array.from(correction)
        .map((ch) => ch + '\u0332')
        .join('')
    : correction;

  if (!underlineCorrection && question.origin?.term && String(question.origin.term).trim()) {
    return String(question.origin.term).trim();
  }

  const wrongSentence = String(question.wrongSentence || '').trim();
  const isChinese = /[\u4e00-\u9fa5]/.test(wrongSentence);

  if (Array.isArray(chunks) && chunks.length > 0 && chunks.some((c) => c.isTarget)) {
    /** @type {string[]} */
    const out = [];
    let replaced = false;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].isTarget) {
        if (!replaced) {
          out.push(formattedCorr);
          replaced = true;
        }
      } else {
        out.push(chunks[i].text);
      }
    }
    return out.join(isChinese ? '' : ' ').trim();
  }

  if (wrongSentence && question.wrongWord && formattedCorr) {
    return wrongSentence.replace(String(question.wrongWord), formattedCorr);
  }
  return String(question.origin?.term || wrongSentence || correction).trim();
};

/**
 * BỘ CHUẨN HÓA BỌC THÉP (DIỆT C6): Chuẩn hóa mọi payload từ ExamEngine,
 * FallbackDataEngine, ai_distort, offline_distort (vocab/sentence) & RetryBag.
 * @param {any} rawData
 * @param {{ origin?: Record<string, any> | null, fallbackIsAi?: boolean, isRescued?: boolean }} [opts]
 * @returns {SpotQuestionData | null}
 */
const normalizeSpotMistakeData = (
  rawData,
  { origin = null, fallbackIsAi = false, isRescued = false } = {}
) => {
  if (!rawData || typeof rawData !== 'object') return null;
  const content =
    rawData.content && typeof rawData.content === 'object' ? rawData.content : rawData;

  const mergedOrigin =
    content.origin && typeof content.origin === 'object'
      ? { ...content.origin }
      : origin && typeof origin === 'object'
        ? { ...origin }
        : {};

  let wrongWord = String(content.wrongWord || '').trim();
  let wrongSentence = String(content.wrongSentence || '').trim();
  let correction = String(
    content.correction || content.correctWord || mergedOrigin.term || ''
  ).trim();

  // Mode từ đơn (`offline_distort` / `ai_distort` mode `word`) có thể chỉ trả `wrongWord`
  if (!wrongSentence && wrongWord) {
    wrongSentence = wrongWord;
  }
  if (!wrongWord && wrongSentence) {
    wrongWord = wrongSentence;
  }
  if (!wrongSentence || !wrongWord || !correction) return null;

  // Chặn trường hợp lỗi sai trùng khít đáp án sửa (câu không có lỗi)
  if (normalizeCompareKey(wrongWord) === normalizeCompareKey(correction)) {
    return null;
  }

  // Kiểm tra wrongWord có thực sự tồn tại trong wrongSentence không
  const isChinese = /[\u4e00-\u9fa5]/.test(wrongSentence);
  const existsInSentence = isChinese
    ? wrongSentence.includes(wrongWord)
    : wrongSentence.toLowerCase().includes(wrongWord.toLowerCase());

  if (!existsInSentence) {
    // Thử tự phục hồi nếu origin.term có đúng 1 token khác với wrongSentence
    if (!isChinese && mergedOrigin.term) {
      const wrongTokens = wrongSentence.split(/\s+/);
      const origTokens = String(mergedOrigin.term).trim().split(/\s+/);
      const diffIdx = wrongTokens.findIndex(
        (tok, idx) =>
          origTokens[idx] &&
          normalizeCompareKey(tok.replace(/[.,?!;:'"]/g, '')) !==
            normalizeCompareKey(origTokens[idx].replace(/[.,?!;:'"]/g, ''))
      );
      if (diffIdx !== -1) {
        wrongWord = wrongTokens[diffIdx].replace(/[.,?!;:'"]/g, '');
        correction = origTokens[diffIdx].replace(/[.,?!;:'"]/g, '');
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  if (normalizeCompareKey(wrongWord) === normalizeCompareKey(correction)) {
    return null;
  }

  const resolvedRescued = Boolean(isRescued || content._isRescued || rawData._isRescued);
  const resolvedAi = Boolean(
    !resolvedRescued && (content.isAiGenerated ?? rawData.isAiGenerated ?? fallbackIsAi)
  );

  const hint = String(
    content.hint || content.translation || mergedOrigin.definition || ''
  ).trim();
  const explanation = String(
    content.explanation || content.analysis || 'Lỗi chính tả / ngữ pháp.'
  ).trim();

  // Đảm bảo origin luôn có câu đúng chuẩn để tái dựng & bookmark chính xác
  if (!mergedOrigin.term) {
    const tempChunks = buildQuestionChunks({
      wrongSentence,
      wrongWord,
      correction,
      explanation
    });
    mergedOrigin.term = reconstructCorrectText(
      { wrongSentence, wrongWord, correction, explanation },
      tempChunks,
      false
    );
  }
  if (!mergedOrigin.definition && hint) {
    mergedOrigin.definition = hint;
  }

  return {
    wrongSentence,
    wrongWord,
    correction,
    explanation,
    hint,
    origin: mergedOrigin,
    isAiGenerated: resolvedAi,
    _isRescued: resolvedRescued
  };
};

/**
 * Đóng gói payload chuẩn cho Túi Nháp (luôn có top-level `term` khớp `useAppLogic Ver 1.1`)
 * @param {SpotQuestionData | null | undefined} question
 * @param {SpotChunk[]} chunks
 * @returns {Record<string, any> | null}
 */
const buildSpotRetryPayload = (question, chunks) => {
  if (!question || !question.wrongSentence) return null;
  const canonicalTerm =
    reconstructCorrectText(question, chunks, false) || question.wrongSentence;
  return {
    ...question,
    term: canonicalTerm,
    origin: {
      ...(question.origin || {}),
      term: question.origin?.term || canonicalTerm,
      definition: question.origin?.definition || question.hint || ''
    }
  };
};

// ============================================================================
// 1. ĐỘNG CƠ LOGIC TRÒ CHƠI TÌM LỖI SAI (USE SPOT MISTAKE LOGIC HOOK)
// ============================================================================
export const useSpotMistakeLogic = (
  cards = /** @type {any[]} */ ([]),
  config = /** @type {Record<string, any>} */ ({}),
  callbacks = /** @type {Record<string, any>} */ ({})
) => {
  const safeLang = /** @type {'en' | 'zh'} */ (config?.lang === 'zh' ? 'zh' : 'en');
  const sourceMode = config?.sourceMode || 'card';
  const difficulty = config?.difficulty === 'hard' ? 'hard' : 'easy';
  const isHardMode = difficulty === 'hard';
  const effectiveAiMode = Boolean(
    sourceMode === 'ai_pure' ||
      (sourceMode === 'card' && isHardMode) ||
      config?.isAiMode ||
      config?.aiMode
  );
  const timerMode = Boolean(config?.timerMode);
  const effectiveTimeLimit =
    Number.isFinite(Number(config?.timeLimit)) && Number(config?.timeLimit) > 0
      ? Number(config.timeLimit)
      : 30;
  const savedState = config?.savedState || null;
  const savedSM = savedState?.spotMistakeState || null;

  const hasRestoredQuestion = Boolean(
    savedSM &&
      !savedSM._needsNextOnResume &&
      savedSM.checkStatus !== 'success' &&
      savedSM.checkStatus !== 'failed' &&
      savedSM.currentQuestion &&
      savedSM.currentQuestion.wrongSentence
  );

  // ==========================================================================
  // STATE KHỞI TẠO (HỖ TRỢ RESUME AN TOÀN & CHỐNG CÀY ĐIỂM)
  // ==========================================================================
  const [currentQuestion, setCurrentQuestion] = useState(
    /** @type {() => SpotQuestionData | null} */ (() => {
      if (!hasRestoredQuestion) return null;
      return (
        normalizeSpotMistakeData(savedSM.currentQuestion) || savedSM.currentQuestion
      );
    })
  );

  const [chunks, setChunks] = useState(
    /** @type {() => SpotChunk[]} */ (() => {
      if (!hasRestoredQuestion) return [];
      if (Array.isArray(savedSM.chunks) && savedSM.chunks.length > 0) {
        return savedSM.chunks;
      }
      return buildQuestionChunks(savedSM.currentQuestion);
    })
  );

  const [stage, setStage] = useState(() =>
    hasRestoredQuestion ? savedSM.stage || 'spot' : 'spot'
  );
  const [selectedIndices, setSelectedIndices] = useState(
    /** @type {() => number[]} */ (() =>
      hasRestoredQuestion && Array.isArray(savedSM.selectedIndices)
        ? savedSM.selectedIndices
        : [])
  );
  const [inputBuffer, setInputBuffer] = useState(() =>
    hasRestoredQuestion ? String(savedSM.inputBuffer || '') : ''
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    hasRestoredQuestion ? savedSM.checkStatus || 'idle' : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    hasRestoredQuestion ? Number(savedSM.attempts) || 0 : 0
  );
  const [score, setScore] = useState(() => Number(savedSM?.score) || 0);
  const [combo, setCombo] = useState(() => Math.max(1, Number(savedSM?.combo) || 1));
  const [playedCount, setPlayedCount] = useState(() => Number(savedSM?.playedCount) || 0);
  const [time, setTime] = useState(() => Number(savedSM?.time) || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(() => Number(savedSM?.correctCount) || 0);
  const [wrongCount, setWrongCount] = useState(() => Number(savedSM?.wrongCount) || 0);
  const [isGenerating, setIsGenerating] = useState(() => !hasRestoredQuestion);

  const [isTranslating, setIsTranslating] = useState(false);
  const [isAiExplaining, setIsAiExplaining] = useState(false);

  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);

  const [timeLeft, setTimeLeft] = useState(() => {
    const savedT = Number(savedSM?.timeLeft);
    if (hasRestoredQuestion && Number.isFinite(savedT) && savedT > 0) {
      return savedT;
    }
    return effectiveTimeLimit;
  });

  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() => {
    const savedWait = Number(savedSM?.aiWaitTime);
    if (hasRestoredQuestion && Number.isFinite(savedWait) && savedWait >= 0) {
      return savedWait;
    }
    return 0;
  });

  // ==========================================================================
  // REFS ĐỒNG BỘ 0ms (DIỆT 18/18 LỖI ts(2339) & DIỆT F13 KHÔNG TÁI TẠO FETCHTASK)
  // ==========================================================================
  const resolvedHookConfig = /** @type {Record<string, any>} */ ({
    ...config,
    lang: safeLang,
    sourceMode,
    difficulty,
    isHardMode,
    effectiveAiMode,
    timerMode,
    timeLimit: effectiveTimeLimit,
    dataMode: config?.dataMode === 'vocab' ? 'vocab' : 'sentence',
    level: config?.level,
    topic: config?.topic,
    apiKey: config?.apiKey || ''
  });
  const configRef = useRef(resolvedHookConfig);
  configRef.current = resolvedHookConfig;

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const enrichedCardsRef = useRef(cards);
  enrichedCardsRef.current = cards;

  const globalRetryBagRef = useRef(config?.globalRetryBag || {});
  globalRetryBagRef.current = config?.globalRetryBag || {};

  const isMutedRef = useRef(Boolean(config?.isMuted));
  isMutedRef.current = Boolean(config?.isMuted);

  const deckRef = useRef(/** @type {any[]} */ ([]));
  const coordinatorRef = useRef(/** @type {any} */ (null));
  const isGameActiveRef = useRef(true);
  const isInitializingRef = useRef(false);
  const isTransitioningRoundRef = useRef(false);
  const isTimeoutHandledRef = useRef(false);

  const gameTimerRef = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const countdownIntervalRef = useRef(
    /** @type {ReturnType<typeof setInterval> | null} */ (null)
  );
  const autoSaveTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const feedbackTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

  const timeLeftRef = useRef(timeLeft);
  const aiWaitTimeRef = useRef(aiWaitTime);
  aiWaitTimeRef.current = aiWaitTime;

  const latestStateRef = useRef(/** @type {Record<string, any>} */ ({}));
  latestStateRef.current = {
    currentQuestion,
    chunks,
    stage,
    selectedIndices,
    inputBuffer,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    correctCount,
    wrongCount,
    deck: deckRef.current,
    timeLeft: timeLeftRef.current,
    aiWaitTime: aiWaitTimeRef.current
  };

  // Toast an toàn: ưu tiên prop showToast từ GameView (Ver 1.4), không lệ thuộc window.globalShowToast
  const safeShowToast = useCallback((msg, type = 'success') => {
    const text = typeof msg === 'string' ? msg : String(msg?.text || '');
    if (!text) return;
    const fn = callbacksRef.current?.showToast;
    if (typeof fn === 'function') {
      fn(text, type);
    }
  }, []);

  const cleanupTransientTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const cleanupAllResources = useCallback(() => {
    cleanupTransientTimers();
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (coordinatorRef.current && typeof coordinatorRef.current.destroy === 'function') {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }
  }, [cleanupTransientTimers]);

  const syncQueueLength = useCallback(() => {
    if (!isGameActiveRef.current) return;
    const len =
      coordinatorRef.current && typeof coordinatorRef.current.length === 'function'
        ? coordinatorRef.current.length()
        : 0;
    setQueueLength(len);
  }, []);

  // ==========================================================================
  // 2. AUTO-SAVE & BẢN CHỤP PHIÊN CHƠI (KHỬ TRÙNG DECK + CHỐNG CÀY ĐIỂM)
  // ==========================================================================
  const buildSessionSnapshot = useCallback((overrides = /** @type {Record<string, any>} */ ({})) => {
    const cur = latestStateRef.current;
    const mergedDeck = mergePendingAmmoToDeck(coordinatorRef.current, deckRef.current);
    const isResolved = cur.checkStatus === 'success' || cur.checkStatus === 'failed';
    const needsNext =
      overrides._needsNextOnResume !== undefined
        ? Boolean(overrides._needsNextOnResume)
        : isResolved;

    return {
      spotMistakeState: {
        ...cur,
        ...overrides,
        currentQuestion: needsNext ? null : cur.currentQuestion,
        chunks: needsNext ? [] : cur.chunks,
        selectedIndices: needsNext ? [] : cur.selectedIndices,
        inputBuffer: needsNext ? '' : cur.inputBuffer,
        stage: needsNext ? 'spot' : cur.stage,
        checkStatus: needsNext ? 'idle' : cur.checkStatus,
        timeLeft: needsNext ? configRef.current.timeLimit : timeLeftRef.current,
        aiWaitTime: needsNext ? 0 : aiWaitTimeRef.current,
        deck: mergedDeck,
        _needsNextOnResume: needsNext
      },
      config: {
        sourceMode: configRef.current.sourceMode,
        difficulty: configRef.current.difficulty,
        timerMode: configRef.current.timerMode,
        timeLimit: configRef.current.timeLimit,
        dataMode: configRef.current.dataMode || 'sentence',
        level: configRef.current.level,
        topic: configRef.current.topic,
        aiMode: configRef.current.effectiveAiMode
      }
    };
  }, []);

  const triggerAutoSave = useCallback(() => {
    const autoSaveFn = callbacksRef.current?.onAutoSave;
    if (
      !isGameActiveRef.current ||
      typeof autoSaveFn !== 'function' ||
      !latestStateRef.current?.currentQuestion
    ) {
      return;
    }
    autoSaveFn(buildSessionSnapshot());
  }, [buildSessionSnapshot]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      triggerAutoSave();
    }, 150);
  }, [triggerAutoSave]);

  useEffect(() => {
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
    return () => {
      clearInterval(intervalTimer);
    };
  }, [triggerAutoSave]);

  useEffect(() => {
    const queueScanner = setInterval(syncQueueLength, 500);
    return () => clearInterval(queueScanner);
  }, [syncQueueLength]);

  // Đồng hồ đếm ngược làm nguội UI (AI Cooldown)
  useEffect(() => {
    if (aiWaitTime <= 0 || isGenerating || isResultPaused) return undefined;
    const cdTimer = setTimeout(() => {
      setAiWaitTime((prev) => {
        const next = Math.max(0, prev - 1);
        aiWaitTimeRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearTimeout(cdTimer);
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // ==========================================================================
  // 3. QUẢN LÝ TÚI NHÁP & GHI SỔ LỖI SAI (CHUẨN EN/CJK)
  // ==========================================================================
  const localPushToRetryBag = useCallback((questionData, currentChunks = []) => {
    const addFn = callbacksRef.current?.addToRetryBag;
    if (typeof addFn !== 'function' || !questionData) return;
    const payload = buildSpotRetryPayload(questionData, currentChunks);
    if (payload) {
      try {
        addFn('spotmistake', payload);
      } catch {
        // Bỏ qua an toàn
      }
    }
  }, []);

  const localRemoveFromRetryBag = useCallback((termToCheck) => {
    const remFn = callbacksRef.current?.removeFromRetryBag;
    if (typeof remFn !== 'function' || !termToCheck) return;
    try {
      remFn('spotmistake', String(termToCheck).trim());
    } catch {
      // Bỏ qua an toàn
    }
  }, []);

  const logMistake = useCallback((question, currentChunks = []) => {
    const logFn = callbacksRef.current?.onLogWrong;
    if (typeof logFn !== 'function' || !question) return;

    const cfg = configRef.current;
    const { pickedLevel } = normalizeLevelAndTopic(cfg.level, cfg.topic, cfg.lang);
    const baseData = question.origin || {};
    const sentenceWithUnderline = reconstructCorrectText(question, currentChunks, true);

    const mistakeCard = {
      ...baseData,
      id: 'mistake_' + String(Date.now()) + '_' + Math.random().toString(36).substring(2, 11),
      type: 'mistake',
      term: sentenceWithUnderline || question.wrongSentence,
      definition: baseData.definition || question.hint || 'Thử thách Spot Mistake',
      analysis: question.explanation || baseData.analysis || '',
      example: 'Lỗi: ' + String(question.wrongWord || '') + ' -> Sửa: ' + String(question.correction || ''),
      tags: ['spotmistake', pickedLevel, cfg.sourceMode],
      timestamp: Date.now()
    };

    try {
      logFn(mistakeCard);
    } catch {
      // Bỏ qua an toàn
    }
  }, []);

  // ==========================================================================
  // 4. CỨU HỘ KHẨN CẤP SONG NGỮ BẤT TỬ (0% TRẢ NULL / 0% TRẮNG MÀN HÌNH)
  // ==========================================================================
  const buildHardFallbackSpotData = useCallback(() => {
    const cfg = configRef.current;
    const curLang = cfg.lang === 'zh' ? 'zh' : 'en';
    const { pickedLevel } = normalizeLevelAndTopic(cfg.level, cfg.topic, curLang);
    const type = cfg.dataMode === 'vocab' ? 'word' : 'sentence';

    // Tầng 1: Bóp méo offline trực tiếp 1 thẻ từ deck người dùng nếu đang ở chế độ AI
    if (cfg.effectiveAiMode && deckRef.current.length > 0) {
      const fallbackCard = deckRef.current.shift();
      if (fallbackCard && fallbackCard.term && GameAlgoEngine?.DistortionEngine?.offline_distort) {
        const offRes = GameAlgoEngine.DistortionEngine.offline_distort(
          fallbackCard.term,
          curLang,
          type
        );
        const normalized = normalizeSpotMistakeData(offRes, {
          origin: fallbackCard,
          fallbackIsAi: false,
          isRescued: true
        });
        if (normalized) {
          safeShowToast('AI quá tải, đã kích hoạt thuật toán bóp méo nội bộ!', 'warning');
          return normalized;
        }
      }
    }

    // Tầng 2: FallbackDataEngine.getGameReadyFallback('spotmistake', ...)
    try {
      if (FallbackDataEngine && typeof FallbackDataEngine.getGameReadyFallback === 'function') {
        const fbRaw = FallbackDataEngine.getGameReadyFallback(
          'spotmistake',
          curLang,
          pickedLevel,
          cfg
        );
        const normalized = normalizeSpotMistakeData(fbRaw, {
          fallbackIsAi: false,
          isRescued: true
        });
        if (normalized) {
          if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
            window.logSystemEvent(
              'Queue cạn đạn Game Tìm Lỗi Sai',
              'Kích hoạt FallbackDataEngine'
            );
          }
          safeShowToast('Mạng yếu, đã kích hoạt dữ liệu dự phòng!', 'warning');
          return normalized;
        }
      }
    } catch (e) {
      console.warn('[SpotMistakeGame] FallbackDataEngine error:', e);
    }

    // Tầng 3: Kho chốt cứng song ngữ EN/ZH bất tử
    const hardList = HARD_SPOT_FALLBACK[curLang] || HARD_SPOT_FALLBACK.en;
    const picked = hardList[Math.floor(Math.random() * hardList.length)] || hardList[0];
    return normalizeSpotMistakeData(picked, { fallbackIsAi: false, isRescued: true });
  }, [safeShowToast]);

  // ==========================================================================
  // 5. ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (FETCH TASK ỔN ĐỊNH — 0 TÁI TẠO MỖI GIÂY)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    const cfg = configRef.current;
    const curLang = /** @type {'en' | 'zh'} */ (cfg.lang === 'zh' ? 'zh' : 'en');
    const curSourceMode = cfg.sourceMode;
    const curEffectiveAi = cfg.effectiveAiMode;
    const curDataMode = cfg.dataMode === 'vocab' ? 'vocab' : 'sentence';
    const type = curDataMode === 'vocab' ? 'word' : 'sentence';
    const currentApiKey = resolveActiveApiKey(cfg.apiKey);

    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(cfg.level, cfg.topic, curLang);
    const safeTopicStr = Array.isArray(pickedTopic)
      ? pickedTopic.find(Boolean) || ''
      : String(pickedTopic || '');

    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp
    try {
      if (typeof pullRetryCardWithLock === 'function' && globalRetryBagRef.current) {
        const pulledCard = pullRetryCardWithLock(
          'spotmistake',
          globalRetryBagRef.current,
          curLang
        );
        if (pulledCard) {
          const normalizedRetry = normalizeSpotMistakeData(pulledCard);
          if (normalizedRetry) return normalizedRetry;
        }
      }
    } catch (e) {
      console.warn('[SpotMistakeGame] Retry bag pull warning:', e);
    }

    // 2. AI PURE MODE
    if (
      curSourceMode === 'ai_pure' &&
      curEffectiveAi &&
      currentApiKey &&
      ExamEngine?.hydrateQuestion
    ) {
      try {
        const meta = {
          id: nextSpotUid('spot_pure'),
          type: 'ioe_spot_mistake',
          level: pickedLevel,
          topic: safeTopicStr,
          dataMode: curDataMode,
          lang: curLang,
          mode: 'minigame'
        };
        const freshHistory = readFreshAiMemory();
        const qData = await ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory);
        const normalized = normalizeSpotMistakeData(qData, {
          fallbackIsAi: true,
          isRescued: Boolean(qData?.content?._isRescued)
        });

        if (normalized) {
          pushTermToAiMemory(normalized.origin?.term || normalized.wrongSentence);

          // KHÓA HỢP ĐỒNG useAiCurator.js (report2.md): Đúng 2 tham số, chặn _isRescued
          const harvestFn = callbacksRef.current?.onSaveToHarvest;
          if (
            !normalized._isRescued &&
            normalized.isAiGenerated !== false &&
            typeof harvestFn === 'function'
          ) {
            const harvestLevelKey = toCanonicalHarvestLevelKey(pickedLevel, curLang);
            try {
              harvestFn(harvestLevelKey, {
                wrongSentence: normalized.wrongSentence,
                wrongWord: normalized.wrongWord,
                correction: normalized.correction,
                explanation: normalized.explanation || '',
                hint: normalized.hint || '',
                pronunciation: normalized.origin?.pronunciation || '',
                sinoViet: normalized.origin?.sinoViet || '',
                topic: normalized.origin?.topic || safeTopicStr || 'AI Harvested',
                grammar_type: normalized.origin?.grammar_type || ''
              });
            } catch {
              // Không chặn luồng game nếu harvest gặp lỗi
            }
          }

          if (isInitializingRef.current) {
            safeShowToast('Đang nạp đạn AI...', 'info');
          }
          return normalized;
        }
      } catch (e) {
        console.warn('[SpotMistakeGame] AI SpotMistake Fallback:', e?.message || e);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse Lò đúc SpotMistake AI', e);
        }
      }
    }

    // 3. THẺ GỐC HOẶC KHO CỨU HỘ (CARD MODE)
    let baseCard = null;
    if (curSourceMode !== 'ai_pure' || deckRef.current.length > 0) {
      if (deckRef.current.length === 0 && curSourceMode !== 'ai_pure') {
        let validCards = (enrichedCardsRef.current || []).filter(
          (c) => c && c.term && String(c.term).trim().length >= 2
        );
        if (validCards.length < 2 && FallbackDataEngine?.getFallbackData) {
          const fbItems = FallbackDataEngine.getFallbackData(
            curLang,
            curDataMode,
            pickedLevel,
            20
          );
          if (Array.isArray(fbItems) && fbItems.length > 0) {
            const existingKeys = new Set(validCards.map((c) => normalizeCompareKey(c.term)));
            const newFbs = fbItems.filter((f) => !existingKeys.has(normalizeCompareKey(f?.term)));
            validCards = [...validCards, ...newFbs];
          }
        }
        if (validCards.length > 0) {
          deckRef.current = Utils.shuffleArray(validCards);
        }
      }
      baseCard = deckRef.current.shift() || null;
    }

    // 4. CỨU HỘ KHẨN CẤP NẾU KHÔNG CÓ THẺ GỐC
    if (!baseCard) {
      return buildHardFallbackSpotData();
    }

    // Đồng bộ bộ nhớ chống lặp 400 từ (0 Radar R05)
    pushTermToAiMemory(baseCard.term);

    // 5. CHẾ BIẾN LỖI SAI BẰNG AI (HYBRID HARD MODE — MỞ KHÓA CẢ VOCAB & SENTENCE, ĐÚNG 6 THAM SỐ)
    if (curEffectiveAi && currentApiKey && GameAlgoEngine?.DistortionEngine?.ai_distort) {
      let timeoutId = null;
      try {
        const aiDistortPromise = GameAlgoEngine.DistortionEngine.ai_distort(
          baseCard.term,
          curLang,
          type,
          currentApiKey,
          pickedLevel,
          safeTopicStr
        );

        const { loadingTime } = readAiCoreConfig();
        const dynamicTimeout = Math.max(15000, loadingTime * 1000 + 5000);
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('AI Distort Timeout')), dynamicTimeout);
        });

        const parsedResult = await Promise.race([aiDistortPromise, timeoutPromise]);
        const normalizedAi = normalizeSpotMistakeData(parsedResult, {
          origin: baseCard,
          fallbackIsAi: true,
          isRescued: false
        });
        if (normalizedAi) {
          if (parsedResult?._tokenUsage?.totalTokenCount) {
            safeAddTotalTokens(parsedResult._tokenUsage.totalTokenCount);
          }
          return normalizedAi;
        }
      } catch (e) {
        console.warn('[SpotMistakeGame] AI Distortion fallback:', e?.message || e);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi AI DistortionEngine (Bóp méo)', e);
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    // 6. CHẾ ĐỘ OFFLINE (CHẾ ĐỘ DỄ HOẶC FALLBACK KHI AI BÓP MÉO THẤT BẠI)
    if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
      const offlineResult = GameAlgoEngine.DistortionEngine.offline_distort(
        baseCard.term,
        curLang,
        type
      );
      const normalizedOffline = normalizeSpotMistakeData(offlineResult, {
        origin: baseCard,
        fallbackIsAi: false,
        isRescued: false
      });
      if (normalizedOffline) return normalizedOffline;
    }

    return buildHardFallbackSpotData();
  }, [buildHardFallbackSpotData, safeShowToast]);

  const fetchTaskRef = useRef(fetchTask);
  fetchTaskRef.current = fetchTask;

  // ==========================================================================
  // 6. NẠP CÂU HỎI MỚI & CHUYỂN VÒNG
  // ==========================================================================
  const setupQuestion = useCallback(
    (rawData) => {
      if (!isGameActiveRef.current) return;
      const data = normalizeSpotMistakeData(rawData) || buildHardFallbackSpotData();
      if (!data) return;

      cleanupTransientTimers();
      isTimeoutHandledRef.current = false;

      const nextChunks = buildQuestionChunks(data);
      const nextTimeLimit = configRef.current.timeLimit;

      setCurrentQuestion(data);
      setChunks(nextChunks);
      setStage('spot');
      setSelectedIndices([]);
      setInputBuffer('');
      setCheckStatus('idle');
      setAttempts(0);
      setResultTimer(0);
      setIsResultPaused(false);
      timeLeftRef.current = nextTimeLimit;
      setTimeLeft(nextTimeLimit);
      setIsGenerating(false);

      const currentCooldown =
        configRef.current.sourceMode === 'ai_pure' || configRef.current.effectiveAiMode
          ? getConfiguredUiCooldown(9)
          : 0;
      aiWaitTimeRef.current = currentCooldown;
      setAiWaitTime(currentCooldown);

      latestStateRef.current = {
        ...latestStateRef.current,
        currentQuestion: data,
        chunks: nextChunks,
        stage: 'spot',
        selectedIndices: [],
        inputBuffer: '',
        checkStatus: 'idle',
        attempts: 0,
        timeLeft: nextTimeLimit,
        aiWaitTime: currentCooldown
      };

      syncQueueLength();
      scheduleAutoSave();
    },
    [buildHardFallbackSpotData, cleanupTransientTimers, scheduleAutoSave, syncQueueLength]
  );

  const proceedToNext = useCallback((defaultDelaySec) => {
    if (!isGameActiveRef.current) return;
    let delaySec = Number(defaultDelaySec) || 6;
    if (aiWaitTimeRef.current > delaySec) {
      delaySec = aiWaitTimeRef.current;
    }
    if (delaySec < 1) delaySec = 1;
    setResultTimer(delaySec);
  }, []);

  const handleEndGameInternal = useCallback(
    (statsOverride = null) => {
      isGameActiveRef.current = false;
      cleanupAllResources();
      const cur = latestStateRef.current;
      const finalStats = statsOverride || {
        correct: cur.correctCount || 0,
        time: cur.time || 0,
        wrong: cur.wrongCount || 0
      };
      const endFn = callbacksRef.current?.onEndGame;
      if (typeof endFn === 'function') {
        endFn(finalStats);
      }
    },
    [cleanupAllResources]
  );

  const nextRound = useCallback(async () => {
    if (!isGameActiveRef.current || isTransitioningRoundRef.current) return;
    isTransitioningRoundRef.current = true;

    cleanupTransientTimers();
    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    try {
      const coord = coordinatorRef.current;
      const { loadingTime } = readAiCoreConfig();
      const isOfflineFastTrack =
        configRef.current.sourceMode === 'card' && !configRef.current.effectiveAiMode;

      if (coord && typeof coord.length === 'function' && coord.length() > 0) {
        const nextData = coord.pop();
        syncQueueLength();
        if (coord && typeof coord.maintain === 'function') {
          coord
            .maintain(false, loadingTime * 1000, isOfflineFastTrack)
            .then(syncQueueLength)
            .catch(() => {});
        }
        if (isGameActiveRef.current && nextData) {
          setupQuestion(nextData);
          return;
        }
      }

      setIsGenerating(true);
      let data = null;

      if (coord && typeof coord.maintain === 'function') {
        await coord.maintain(false, loadingTime * 1000, isOfflineFastTrack);
        if (!isGameActiveRef.current) return;
        data = coord.pop();
        syncQueueLength();
      }

      if (!data && isGameActiveRef.current) {
        data = buildHardFallbackSpotData();
      }

      if (isGameActiveRef.current && data) {
        setupQuestion(data);
      } else if (isGameActiveRef.current) {
        safeShowToast('Lỗi tải dữ liệu vòng mới. Buộc kết thúc.', 'error');
        setIsGenerating(false);
        handleEndGameInternal();
      }
    } finally {
      isTransitioningRoundRef.current = false;
    }
  }, [
    buildHardFallbackSpotData,
    cleanupTransientTimers,
    handleEndGameInternal,
    safeShowToast,
    setupQuestion,
    syncQueueLength
  ]);

  // ==========================================================================
  // 7. KHỞI TẠO VÒNG ĐỜI GAME (DIỆT C3 & C7: STRICTMODE + ZOMBIEKILLER)
  // ==========================================================================
  useEffect(() => {
    isGameActiveRef.current = true;
    let cancelled = false;

    const initGame = async () => {
      if (cancelled || !isGameActiveRef.current) return;

      const cfg = configRef.current;
      const curLang = cfg.lang === 'zh' ? 'zh' : 'en';
      const curDataMode = cfg.dataMode === 'vocab' ? 'vocab' : 'sentence';
      const { pickedLevel } = normalizeLevelAndTopic(cfg.level, cfg.topic, curLang);
      const { maxAmmo, loadingTime } = readAiCoreConfig();
      const isOfflineFastTrack = cfg.sourceMode === 'card' && !cfg.effectiveAiMode;

      // Cảnh báo thiếu API Key nếu vào chế độ AI Pure
      if (cfg.sourceMode === 'ai_pure' && !resolveActiveApiKey(cfg.apiKey)) {
        if (typeof callbacksRef.current?.onMissingKey === 'function') {
          callbacksRef.current.onMissingKey();
        }
      }

      // Khôi phục bộ bài từ savedState nếu có
      if (savedSM && Array.isArray(savedSM.deck) && savedSM.deck.length > 0) {
        if (typeof savedSM.deck[0] === 'number') {
          deckRef.current = savedSM.deck
            .map((idx) => (enrichedCardsRef.current || [])[idx])
            .filter(Boolean);
        } else {
          deckRef.current = [...savedSM.deck];
        }
      } else if (cfg.sourceMode === 'card') {
        let validCards = (enrichedCardsRef.current || []).filter(
          (c) => c && c.term && String(c.term).trim().length >= 2
        );
        if (validCards.length < 2) {
          safeShowToast(
            'Bộ thẻ không đủ 2 thẻ hợp lệ. Kích hoạt dữ liệu dự phòng...',
            'warning'
          );
          if (FallbackDataEngine?.getFallbackData) {
            const fbItems = FallbackDataEngine.getFallbackData(
              curLang,
              curDataMode,
              pickedLevel,
              20
            );
            const existingKeys = new Set(validCards.map((c) => normalizeCompareKey(c.term)));
            for (const fb of fbItems || []) {
              if (!existingKeys.has(normalizeCompareKey(fb?.term))) {
                existingKeys.add(normalizeCompareKey(fb?.term));
                validCards.push(fb);
              }
            }
          }
        }
        deckRef.current = Utils.shuffleArray(validCards);
      } else {
        deckRef.current = [];
      }

      // Khởi tạo Coordinator sau nhịp 50ms -> StrictMode unmount #1 KHÔNG gọi ZombieKiller
      const coord =
        QueueEngine && typeof QueueEngine.createQueueCoordinator === 'function'
          ? QueueEngine.createQueueCoordinator(() => fetchTaskRef.current(), maxAmmo)
          : null;
      coordinatorRef.current = coord;

      // Trường hợp 1: Resume câu đang làm dở
      if (hasRestoredQuestion) {
        setIsGenerating(false);
        if (coord && typeof coord.maintain === 'function') {
          coord
            .maintain(false, loadingTime * 1000, isOfflineFastTrack)
            .then(syncQueueLength)
            .catch(() => {});
        }
      } else {
        // Trường hợp 2: Ván mới hoặc Resume sau khi câu trước đã chốt / thoát ngang
        isInitializingRef.current = true;
        setIsGenerating(true);

        let firstData = null;
        if (coord && typeof coord.maintain === 'function') {
          await coord.maintain(!savedSM, loadingTime * 1000, isOfflineFastTrack);
          if (cancelled || !isGameActiveRef.current) return;
          firstData = coord.pop();
          syncQueueLength();
          coord
            .maintain(false, loadingTime * 1000, isOfflineFastTrack)
            .then(syncQueueLength)
            .catch(() => {});
        }

        if (!firstData && !cancelled && isGameActiveRef.current) {
          firstData = buildHardFallbackSpotData();
        }

        if (cancelled || !isGameActiveRef.current) return;

        isInitializingRef.current = false;
        if (firstData) {
          setupQuestion(firstData);
          if (!savedSM) {
            safeShowToast('Hoàn tất! Bắt đầu trò chơi.', 'success');
          }
        } else {
          safeShowToast('Lỗi nghiêm trọng khi tải dữ liệu. Buộc kết thúc.', 'error');
          setIsGenerating(false);
          handleEndGameInternal({ correct: 0, time: 0, wrong: 0 });
          return;
        }
      }

      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      gameTimerRef.current = setInterval(() => {
        if (isGameActiveRef.current) {
          setTime((prev) => prev + 1);
        }
      }, 1000);
    };

    const bootTimer = setTimeout(() => {
      if (!cancelled) {
        initGame();
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      isGameActiveRef.current = false;
      cleanupAllResources();
    };
    // Chạy đúng 1 lần cho mỗi phiên chơi (GameView cấp key={gameSessionId} riêng mỗi ván)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================================
  // 8. TƯƠNG TÁC NGƯỜI DÙNG (CHỌN LỖI, SỬA LỖI, BỎ QUA, THOÁT MENU)
  // ==========================================================================
  const handleSpotClick = useCallback(
    (idx) => {
      if (stage !== 'spot' || checkStatus === 'failed' || checkStatus === 'success') {
        return;
      }
      playGameSFX('click', isMutedRef.current);
      setSelectedIndices((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      );
    },
    [checkStatus, stage]
  );

  const handleCheckSpot = useCallback(() => {
    if (
      stage !== 'spot' ||
      checkStatus === 'failed' ||
      checkStatus === 'success' ||
      selectedIndices.length === 0 ||
      !currentQuestion
    ) {
      return;
    }

    const targetIndices = chunks
      .map((c, i) => (c.isTarget ? i : -1))
      .filter((i) => i !== -1);

    // [SMART OVERLAP ALGORITHM]
    const hasOverlap = selectedIndices.some((i) => targetIndices.includes(i));
    const maxTolerance = targetIndices.length + 3;
    const isWithinTolerance = selectedIndices.length <= maxTolerance;
    const isCorrect = hasOverlap && isWithinTolerance;

    if (isCorrect) {
      playGameSFX('correct', isMutedRef.current);
      setStage('correct');
      setCheckStatus('correct_spot');
      setScore((p) => p + 10 * combo);
      setAttempts(0);
      safeShowToast('Phát hiện chuẩn xác! Hãy sửa lại cho đúng.', 'success');
    } else {
      playGameSFX('wrong', isMutedRef.current);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setCombo(1);
      setScore((p) => Math.max(0, p - 5));
      if (newAttempts >= 3) {
        localPushToRetryBag(currentQuestion, chunks);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Đã hết lượt tìm lỗi!', 'error');
        logMistake(currentQuestion, chunks);
        proceedToNext(10);
      } else {
        setCheckStatus('wrong_spot');
        safeShowToast('Chưa đúng! Còn ' + String(3 - newAttempts) + ' lượt.', 'warning');
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          feedbackTimerRef.current = null;
          setCheckStatus((p) => (p === 'wrong_spot' ? 'idle' : p));
        }, 1000);
      }
    }
    scheduleAutoSave();
  }, [
    attempts,
    checkStatus,
    chunks,
    combo,
    currentQuestion,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave,
    selectedIndices,
    stage
  ]);

  // LAZY LOADING: GỌI AI DỊCH NGHĨA ON-DEMAND (DÙNG API KEY 4 TẦNG)
  const handleRequestHint = useCallback(async () => {
    const currentApiKey = resolveActiveApiKey(configRef.current.apiKey);
    if (isTranslating || isAiExplaining || isGenerating || !currentQuestion) return;
    if (!currentApiKey) {
      safeShowToast('Cần cấu hình API Key để gọi AI!', 'warning');
      if (typeof callbacksRef.current?.onMissingKey === 'function') {
        callbacksRef.current.onMissingKey();
      }
      return;
    }

    const textToTranslate =
      reconstructCorrectText(currentQuestion, chunks, false) || currentQuestion.wrongSentence;
    if (!textToTranslate) return;

    setIsTranslating(true);
    setIsAiExplaining(true);
    try {
      const prompt =
        'Dịch câu văn sau sang tiếng Việt một cách ngắn gọn, tự nhiên. CHỈ TRẢ VỀ CÂU DỊCH, KHÔNG GIẢI THÍCH THÊM: "' +
        textToTranslate +
        '"';
      const res = await callGeminiApi(prompt, null, currentApiKey);
      if (res && res.text && isGameActiveRef.current) {
        const translatedText = String(res.text).replace(/^["']|["']$/g, '').trim();
        if (res._tokenUsage?.totalTokenCount) {
          safeAddTotalTokens(res._tokenUsage.totalTokenCount);
        }
        setCurrentQuestion((prev) =>
          prev
            ? {
                ...prev,
                hint: translatedText,
                origin: { ...(prev.origin || {}), definition: translatedText }
              }
            : prev
        );
      }
    } catch (error) {
      console.warn('[SpotMistakeGame] Lỗi dịch tự động:', error);
      safeShowToast('Mạng yếu hoặc lỗi AI. Không thể tải gợi ý lúc này.', 'error');
    } finally {
      if (isGameActiveRef.current) {
        setIsTranslating(false);
        setIsAiExplaining(false);
      }
    }
  }, [chunks, currentQuestion, isAiExplaining, isGenerating, isTranslating, safeShowToast]);

  // LAZY LOADING: GỌI AI GIẢI THÍCH NGỮ PHÁP ON-DEMAND (VÁ LỖI RUNTIME NGẦM #3)
  const handleExplain = useCallback(async () => {
    const currentApiKey = resolveActiveApiKey(configRef.current.apiKey);
    if (isGenerating || isAiExplaining || !currentQuestion) return;
    if (!currentApiKey) {
      safeShowToast('Cần cấu hình API Key để gọi AI!', 'warning');
      if (typeof callbacksRef.current?.onMissingKey === 'function') {
        callbacksRef.current.onMissingKey();
      }
      return;
    }

    setIsAiExplaining(true);
    try {
      const contextToExplain =
        'Hãy giải thích ngữ pháp: Câu bị sai là "' +
        String(currentQuestion.wrongSentence || '') +
        '". Lỗi sai ở chữ "' +
        String(currentQuestion.wrongWord || '') +
        '" và phải sửa thành "' +
        String(currentQuestion.correction || '') +
        '". Tại sao lại sửa như vậy?';
      const result = await explainSentenceGrammar(
        contextToExplain,
        configRef.current.lang,
        currentApiKey
      );
      if (result && result.text && isGameActiveRef.current) {
        setCurrentQuestion((prev) => (prev ? { ...prev, explanation: result.text } : prev));
        if (result._tokenUsage?.totalTokenCount) {
          safeAddTotalTokens(result._tokenUsage.totalTokenCount);
        }
      }
    } catch (e) {
      safeShowToast('Lỗi kết nối AI: ' + String(e?.message || 'Không xác định'), 'error');
    } finally {
      if (isGameActiveRef.current) {
        setIsAiExplaining(false);
      }
    }
  }, [currentQuestion, isAiExplaining, isGenerating, safeShowToast]);

  // CHẤM ĐIỂM THẨM THẤU TOÀN CÂU (DIỆT F14: KHÔNG XÓA TỪ KHÔNG ĐƯỢC CHỌN KHI CHỌN RỜI RẠC)
  const handleCorrectionSubmit = useCallback(() => {
    if (stage !== 'correct' || !inputBuffer.trim() || !currentQuestion) return;

    const normalizedInput = normalizeForGrading(inputBuffer);
    const normalizedCorrection = normalizeForGrading(currentQuestion.correction);

    const isChinese = /[\u4e00-\u9fa5]/.test(currentQuestion.wrongSentence || '');
    const separator = isChinese ? '' : ' ';

    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
    const selectedSet = new Set(sortedIndices);
    const isContiguous =
      sortedIndices.length > 0 &&
      sortedIndices[sortedIndices.length - 1] - sortedIndices[0] + 1 === sortedIndices.length;

    /** @type {string[]} */
    const userSentenceArray = [];
    let insertedInput = false;

    if (isContiguous) {
      const minIdx = sortedIndices[0];
      const maxIdx = sortedIndices[sortedIndices.length - 1];
      for (let i = 0; i < chunks.length; i++) {
        if (i < minIdx || i > maxIdx) {
          userSentenceArray.push(chunks[i].text);
        } else if (i === minIdx) {
          userSentenceArray.push(inputBuffer.trim());
        }
      }
    } else {
      // Chọn rời rạc: bảo toàn mọi từ không được chọn, chỉ thay thế tại ô target được chọn
      const targetSelectedIdx = sortedIndices.find((idx) => chunks[idx]?.isTarget);
      const replaceIdx = targetSelectedIdx !== undefined ? targetSelectedIdx : sortedIndices[0];
      for (let i = 0; i < chunks.length; i++) {
        if (i === replaceIdx && !insertedInput) {
          userSentenceArray.push(inputBuffer.trim());
          insertedInput = true;
        } else if (!selectedSet.has(i) || !chunks[i]?.isTarget) {
          userSentenceArray.push(chunks[i].text);
        }
      }
    }

    const userFullSentence = userSentenceArray.join(separator);
    const aiCorrectSentence = reconstructCorrectText(currentQuestion, chunks, false);

    const normalizedUserFull = normalizeForGrading(userFullSentence);
    const normalizedAiFull = normalizeForGrading(aiCorrectSentence);

    const isCorrect =
      Boolean(normalizedInput && normalizedInput === normalizedCorrection) ||
      Boolean(normalizedUserFull && normalizedUserFull === normalizedAiFull);

    if (isCorrect) {
      playGameSFX('correct', isMutedRef.current);
      if (attempts === 0) {
        localRemoveFromRetryBag(aiCorrectSentence || currentQuestion.wrongSentence);
      }
      setCheckStatus('success');
      setCorrectCount((p) => p + 1);
      setScore((p) => p + 20 * combo);
      setCombo((p) => p + 1);
      safeShowToast('Tuyệt vời! Bạn đã sửa đúng.', 'success');
      proceedToNext(6);
    } else {
      playGameSFX('wrong', isMutedRef.current);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setCombo(1);
      setScore((p) => Math.max(0, p - 5));
      if (newAttempts >= 3) {
        localPushToRetryBag(currentQuestion, chunks);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Sai quá 3 lần. Xem đáp án nhé!', 'error');
        logMistake(currentQuestion, chunks);
        proceedToNext(10);
      } else {
        setCheckStatus('wrong_correct');
        safeShowToast('Sai rồi! Còn ' + String(3 - newAttempts) + ' lượt.', 'warning');
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          feedbackTimerRef.current = null;
          setCheckStatus((p) => (p === 'wrong_correct' ? 'correct_spot' : p));
        }, 1000);
      }
    }
    scheduleAutoSave();
  }, [
    attempts,
    chunks,
    combo,
    currentQuestion,
    inputBuffer,
    localPushToRetryBag,
    localRemoveFromRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave,
    selectedIndices,
    stage
  ]);

  const handleSkip = useCallback(() => {
    if (checkStatus === 'success' || checkStatus === 'failed' || !currentQuestion) return;
    playGameSFX('wrong', isMutedRef.current);
    localPushToRetryBag(currentQuestion, chunks);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion, chunks);
    proceedToNext(10);
    scheduleAutoSave();
  }, [
    checkStatus,
    chunks,
    currentQuestion,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave
  ]);

  // Xử lý hết giờ (tách hoàn toàn khỏi state updater — 100% Pure StrictMode)
  const handleQuestionTimeUp = useCallback(() => {
    const cur = latestStateRef.current;
    if (
      !isGameActiveRef.current ||
      isTimeoutHandledRef.current ||
      !cur.currentQuestion ||
      cur.checkStatus === 'success' ||
      cur.checkStatus === 'failed'
    ) {
      return;
    }
    isTimeoutHandledRef.current = true;
    playGameSFX('wrong', isMutedRef.current);
    localPushToRetryBag(cur.currentQuestion, cur.chunks);
    setCombo(1);
    setAttempts(3);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
    logMistake(cur.currentQuestion, cur.chunks);
    proceedToNext(10);
    scheduleAutoSave();
  }, [
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave
  ]);

  const handleQuestionTimeUpRef = useRef(handleQuestionTimeUp);
  handleQuestionTimeUpRef.current = handleQuestionTimeUp;

  // ĐỒNG HỒ ĐẾM NGƯỢC TỪNG CÂU (PURE — 0 SIDE-EFFECT TRONG UPDATER)
  useEffect(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (
      !timerMode ||
      checkStatus === 'success' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return undefined;
    }

    countdownIntervalRef.current = setInterval(() => {
      if (!isGameActiveRef.current) return;
      const nextVal = timeLeftRef.current - 1;
      if (nextVal <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        timeLeftRef.current = 0;
        setTimeLeft(0);
        handleQuestionTimeUpRef.current();
        return;
      }
      timeLeftRef.current = nextVal;
      setTimeLeft(nextVal);
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [timerMode, checkStatus, isGenerating, currentQuestion]);

  // ĐỒNG HỒ TỰ ĐỘNG CHUYỂN CÂU KHI ĐÃ HIỆN KẾT QUẢ
  useEffect(() => {
    if (
      (checkStatus !== 'success' && checkStatus !== 'failed') ||
      isResultPaused ||
      isGenerating
    ) {
      return undefined;
    }

    if (resultTimer > 0) {
      const id = setTimeout(() => setResultTimer((prev) => Math.max(0, prev - 1)), 1000);
      return () => clearTimeout(id);
    }

    const nextId = setTimeout(() => nextRound(), 0);
    return () => clearTimeout(nextId);
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((p) => !p);
  }, []);

  // Thoát về Menu kèm kỷ luật thoát ngang & dọn tài nguyên
  const handleSaveAndBack = useCallback(() => {
    const cur = latestStateRef.current;
    let finalWrongCount = cur.wrongCount || 0;
    let finalCombo = cur.combo || 1;
    let needsNext = cur.checkStatus === 'success' || cur.checkStatus === 'failed';
    const totalAnswered = (cur.correctCount || 0) + (cur.wrongCount || 0);

    // Nếu hủy Loading ở 0/0 chưa có câu hỏi -> quay thẳng về Menu không phạt
    if (!cur.currentQuestion && totalAnswered === 0) {
      isGameActiveRef.current = false;
      cleanupAllResources();
      if (typeof callbacksRef.current?.onBack === 'function') {
        callbacksRef.current.onBack(null);
      }
      return;
    }

    if (
      cur.checkStatus !== 'success' &&
      cur.checkStatus !== 'failed' &&
      cur.currentQuestion &&
      (totalAnswered > 0 || (cur.selectedIndices?.length || 0) > 0 || cur.stage === 'correct')
    ) {
      localPushToRetryBag(cur.currentQuestion, cur.chunks);
      logMistake(cur.currentQuestion, cur.chunks);
      finalWrongCount += 1;
      finalCombo = 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const snapshot = buildSessionSnapshot({
      wrongCount: finalWrongCount,
      combo: finalCombo,
      _needsNextOnResume: needsNext
    });

    isGameActiveRef.current = false;
    cleanupAllResources();

    if (typeof callbacksRef.current?.onBack === 'function') {
      callbacksRef.current.onBack(snapshot);
    }
  }, [
    buildSessionSnapshot,
    cleanupAllResources,
    localPushToRetryBag,
    logMistake,
    safeShowToast
  ]);

  return {
    currentQuestion,
    chunks,
    stage,
    selectedIndices,
    inputBuffer,
    setInputBuffer,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    isFinished,
    isGenerating,
    correctCount,
    wrongCount,
    resultTimer,
    isResultPaused,
    toggleResultPause,
    timeLeft,
    queueLength,
    aiWaitTime,
    handleSpotClick,
    handleCheckSpot,
    handleCorrectionSubmit,
    handleSkip,
    nextRound,
    handleSaveAndBack,
    handleEndGameInternal,
    onRequestExplanation: handleExplain,
    handleRequestHint,
    isExplaining: isAiExplaining,
    isTranslating,
    isHardMode
  };
};

// ============================================================================
// 2. COMPONENT BỌC NGOÀI (SPOT MISTAKE GAME WRAPPER)
// ============================================================================
export const SpotMistakeGame = ({
  cards = /** @type {any[]} */ ([]),
  t = undefined,
  onFinish = undefined,
  onEndGame = undefined,
  onQuit = undefined,
  onBack = undefined,
  mainColor = 'red',
  lang = 'en',
  isAiMode: propAiMode = undefined,
  apiKey = '',
  currentLevel = undefined,
  currentTopic = undefined,
  dataMode: propDataMode = undefined,
  level = undefined,
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = /** @type {any[]} */ ([]),
  onLogWrong = undefined,
  onMissingKey = undefined,
  showToast = undefined,
  settings = /** @type {Record<string, any>} */ ({}),
  config = /** @type {Record<string, any>} */ ({}),
  timerMode: propTimerMode = undefined,
  timeLimit: propTimeLimit = undefined,
  initialDifficulty: propDifficulty = undefined,
  onUpdateCards = undefined,
  onSaveToHarvest = undefined,
  savedState = /** @type {Record<string, any> | null} */ (null),
  onAutoSave = undefined,
  globalRetryBag = /** @type {Record<string, any>} */ ({}),
  addToRetryBag = undefined,
  removeFromRetryBag = undefined,
  isMuted = false
}) => {
  const safeLang = /** @type {'en' | 'zh'} */ (lang === 'zh' ? 'zh' : 'en');
  const effectiveMuted = Boolean(isMuted || settings?.isMuted);
  const effectiveBookmarkFn = onBookmark || onSaveToNotebook;

  // Hợp nhất & memoize cấu hình (Diệt F13 + không dùng 'level_4_discovery_basic')
  const finalConfig = useMemo(() => {
    const stored = readStoredSpotConfig();
    const resumeCfg =
      savedState?.config && typeof savedState.config === 'object' ? savedState.config : {};
    const incomingCfg = config && typeof config === 'object' ? config : {};

    const sourceMode =
      resumeCfg.sourceMode ?? incomingCfg.sourceMode ?? stored.sourceMode ?? 'card';
    const difficulty =
      resumeCfg.difficulty ??
      incomingCfg.difficulty ??
      propDifficulty ??
      stored.difficulty ??
      'easy';
    const effectiveAiMode = Boolean(
      sourceMode === 'ai_pure' ||
        (sourceMode === 'card' && difficulty === 'hard') ||
        resumeCfg.aiMode ||
        incomingCfg.aiMode ||
        propAiMode
    );
    const timerMode = Boolean(
      resumeCfg.timerMode ?? incomingCfg.timerMode ?? propTimerMode ?? stored.timerMode ?? false
    );
    const rawLimit = Number(
      resumeCfg.timeLimit ?? incomingCfg.timeLimit ?? propTimeLimit ?? stored.timeLimit ?? 30
    );
    const timeLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 30;
    const dataMode =
      resumeCfg.dataMode ??
      incomingCfg.dataMode ??
      propDataMode ??
      stored.dataMode ??
      'sentence';
    const resolvedLevel =
      resumeCfg.level ??
      incomingCfg.level ??
      level ??
      currentLevel ??
      (safeLang === 'zh' ? 'zh_level_1' : 'en_level_4');
    const resolvedTopic = resumeCfg.topic ?? incomingCfg.topic ?? currentTopic ?? [];

    return {
      sourceMode,
      difficulty: difficulty === 'hard' ? 'hard' : 'easy',
      aiMode: effectiveAiMode,
      isAiMode: effectiveAiMode,
      timerMode,
      timeLimit,
      dataMode,
      level: resolvedLevel,
      topic: resolvedTopic
    };
  }, [
    savedState,
    config,
    propDifficulty,
    propAiMode,
    propTimerMode,
    propTimeLimit,
    propDataMode,
    level,
    currentLevel,
    currentTopic,
    safeLang
  ]);

  const handleEndGameCallback = useCallback(
    (stats) => {
      const safeStats = stats || { correct: 0, time: 0, wrong: 0 };
      if (typeof onFinish === 'function') {
        onFinish(safeStats.correct, safeStats.time, safeStats.wrong);
      } else if (typeof onEndGame === 'function') {
        onEndGame({
          correct: safeStats.correct,
          time: safeStats.time,
          wrong: safeStats.wrong
        });
      }
    },
    [onFinish, onEndGame]
  );

  // Memoize callbacks (Diệt F13 + Gỡ bỏ hoàn toàn window.globalShowToast)
  const hookCallbacks = useMemo(
    () => ({
      onFinish,
      showToast,
      onLogWrong,
      onMissingKey,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      onBack: onBack || onQuit,
      addToRetryBag,
      removeFromRetryBag,
      onEndGame: handleEndGameCallback
    }),
    [
      onFinish,
      showToast,
      onLogWrong,
      onMissingKey,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      onBack,
      onQuit,
      addToRetryBag,
      removeFromRetryBag,
      handleEndGameCallback
    ]
  );

  const hookConfig = useMemo(
    () => ({
      ...finalConfig,
      apiKey,
      lang: safeLang,
      savedState,
      globalRetryBag,
      isMuted: effectiveMuted
    }),
    [finalConfig, apiKey, safeLang, savedState, globalRetryBag, effectiveMuted]
  );

  const logic = useSpotMistakeLogic(cards, hookConfig, hookCallbacks);

  // Bookmark trực tiếp qua prop từ GameView (Diệt F15: gỡ hoàn toàn window.handleSaveToNotebook)
  const handleSaveToNotebook = useCallback(
    (payload) => {
      if (typeof effectiveBookmarkFn === 'function') {
        effectiveBookmarkFn(payload);
      } else if (typeof showToast === 'function') {
        showToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    },
    [effectiveBookmarkFn, showToast]
  );

  // Tra cứu Notebook NFC chính xác O(1) (Diệt F13: không dùng .includes("a"/"is"))
  const notebookKeySet = useMemo(() => {
    const set = new Set();
    if (Array.isArray(notebook)) {
      for (let i = 0; i < notebook.length; i++) {
        const key = normalizeCompareKey(notebook[i]?.term);
        if (key) set.add(key);
      }
    }
    return set;
  }, [notebook]);

  const isBookmarked = useMemo(() => {
    if (!logic.currentQuestion || notebookKeySet.size === 0) return false;
    const correctFullText = reconstructCorrectText(logic.currentQuestion, logic.chunks, false);
    const fullKey = normalizeCompareKey(correctFullText);
    const originKey = normalizeCompareKey(logic.currentQuestion.origin?.term);
    return Boolean(
      (fullKey && notebookKeySet.has(fullKey)) || (originKey && notebookKeySet.has(originKey))
    );
  }, [logic.currentQuestion, logic.chunks, notebookKeySet]);

  return (
    <SpotMistakePlayScreen
      t={t}
      mainColor={mainColor}
      config={finalConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={logic.handleEndGameInternal}
      onSaveToNotebook={handleSaveToNotebook}
      isBookmarked={isBookmarked}
      settings={settings}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).Block5_11_useSpotMistakeLogic = useSpotMistakeLogic;
  /** @type {any} */ (window).useSpotMistakeLogic = useSpotMistakeLogic;
  /** @type {any} */ (window).Block5_11_SpotMistakeGame = SpotMistakeGame;
  /** @type {any} */ (window).SpotMistakeGame = SpotMistakeGame;
}

export default SpotMistakeGame;