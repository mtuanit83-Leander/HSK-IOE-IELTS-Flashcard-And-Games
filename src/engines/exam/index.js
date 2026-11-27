// ============================================================================
// FILE 26/85: src/engines/exam/index.js
// NGUỒN GỐC: Tầng 2 - Block 2.7d (The Core Hydrator V3.0)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 05:30 (GMT+7)
// NHIỆM VỤ: Tổng công trình sư khảo thí hợp nhất ExamMemory, ExamFallback,
//           ExamNormalizer; điều phối nạp câu hỏi nguyên tử (hydrateQuestion)
//           và cứu hộ JIT 0ms (getEmergencyFallback) chuẩn hóa cho cả Mock Test
//           lẫn 10 Mini-Games.
//           Nâng cấp Ver 1.2 (Giai đoạn 5 - Lượt 5.1 - Diệt 1M Radar & 0 tsc):
//           1. Diệt 1/1 MEDIUM Radar (R05): Thay localStorage.setItem trần tại
//              safeAddTotalTokens bằng safeLocalStorageSet từ helpers.js.
//           2. Diệt S14: Bảo vệ item.id rỗng/undefined trong fetchFromOfflinePool.
//           3. Diệt S15: Chặn bắn từ khóa CJK/Việt ở fallbackQuery của
//              buildOptionImageUrl; khóa chặt toàn bộ JSDoc TS 5.x (safeMeta,
//              tempGeneratedData, fallbackBase, self, getErrorMessage, .apply
//              cho 5 Named Exports) để xanh sạch 0 Problems tsc --noEmit.
//           4. Đồng bộ xóa tại chỗ _volatileMemory với ExamMemory (Ver 1.0).
// ============================================================================

import { FcDB } from '../../services/db.js';
import { AiMemoryManager } from '../../utils/memoryManager.js';
import {
  safeJsonParse,
  safeLocalStorageSet,
  shuffleArray,
  buildSmartImageUrl,
  detectSentence
} from '../../utils/helpers.js';
import { OfflineDistractorEngine } from '../../utils/offlineDistractor.js';
import { IoeDataEngine } from '../pedagogyEngine.js';
import { MICRO_PROMPTS } from '../microPrompts.js';
import { AiFactoryEngine } from '../aiFactory.js';
import { GameAlgoEngine } from '../gameOfflineEngine.js';
import { FallbackDataEngine } from '../fallbackData.js';
import { ExamMemory } from './examMemory.js';
import { ExamFallback } from './examFallback.js';
import { ExamNormalizer } from './examNormalizer.js';

// ============================================================================
// BỘ TIỆN ÍCH NỘI BỘ (CHUẨN HÓA NGÔN NGỮ, ARRAY ARMOR, ĐỤC LỖ & KIỂM ĐỊNH)
// ============================================================================
const VI_DIACRITIC_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const CJK_REGEX = /[\u4e00-\u9fff]/;
const CLOZE_BLANK_REGEX = /(?:_{2,}|\[[\s_]+\]|\(\s*\)|（\s*）)/;
const INVALID_IMAGE_KEYWORDS = new Set([
  'none',
  'null',
  'undefined',
  'n/a',
  'na',
  'false',
  'empty',
  '-'
]);

/**
 * Trích xuất thông điệp lỗi an toàn từ unknown (tránh ts(18046)).
 * @param {unknown} err
 * @returns {string}
 */
const getErrorMessage = (err) => {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return String(err);
};

/**
 * @param {any} val
 * @returns {string}
 */
const normalizeCompare = (val) =>
  String(val || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @param {any} val
 * @returns {string}
 */
const stripOptionLabelPrefix = (val) =>
  normalizeCompare(val)
    .replace(/^(?:option\s+)?[a-d][.):\-]\s*/i, '')
    .trim();

/**
 * @param {any} str
 * @returns {string}
 */
const escapeRegExp = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {any} text
 * @returns {boolean}
 */
const isVietnameseText = (text) => {
  const str = String(text || '').trim();
  if (!str) return false;
  return VI_DIACRITIC_REGEX.test(str) && !CJK_REGEX.test(str);
};

// Nội suy ngôn ngữ chuẩn 2 nhánh hệ thống ('en' | 'zh'), thanh trừng 'vi'
/**
 * @param {Record<string, any>} [metadata={}]
 * @returns {'en' | 'zh'}
 */
const resolveTargetLang = (metadata = {}) => {
  const rawMetaLang = String(metadata?.lang || metadata?.language || '')
    .replace(/"/g, '')
    .toLowerCase()
    .trim();
  if (rawMetaLang === 'zh' || rawMetaLang === 'cn') return 'zh';
  if (rawMetaLang === 'en') return 'en';

  const track = String(metadata?.track || '')
    .toLowerCase()
    .trim();
  if (track === 'hsk') return 'zh';

  const levelStr = Array.isArray(metadata?.level)
    ? metadata.level.join(',').toLowerCase()
    : String(metadata?.level || '').toLowerCase();
  if (levelStr.includes('zh') || levelStr.includes('hsk')) return 'zh';
  if (track === 'ioe' || track === 'ielts' || levelStr.includes('en_level')) return 'en';

  try {
    if (typeof localStorage !== 'undefined') {
      const stored = String(localStorage.getItem('fc_lang') || '')
        .replace(/"/g, '')
        .toLowerCase()
        .trim();
      if (stored === 'zh') return 'zh';
    }
  } catch {
    // Bỏ qua lỗi đọc localStorage ở chế độ ẩn danh
  }
  return 'en';
};

// Vắc-xin Đa nhiệm (Multi-select Array Armor) cho Level
/**
 * @param {any} level
 * @param {'en' | 'zh'} targetLang
 * @returns {string[]}
 */
const normalizeLevelList = (level, targetLang) => {
  const defaultLvl = targetLang === 'zh' ? 'zh_level_4' : 'en_level_4';
  if (Array.isArray(level)) {
    const cleaned = [...new Set(level.map((l) => String(l || '').trim()).filter(Boolean))];
    return cleaned.length > 0 ? cleaned : [defaultLvl];
  }
  const single = String(level || '').trim();
  return single ? [single] : [defaultLvl];
};

// Vắc-xin Đa nhiệm (Multi-select Array Armor) cho Topic
/**
 * @param {any} topic
 * @returns {string[]}
 */
const normalizeTopicList = (topic) => {
  /** @param {string} t */
  const isWildcard = (t) => {
    const low = t.toLowerCase();
    return !low || low === 'any' || low === 'all' || low === 'tất cả';
  };

  if (Array.isArray(topic)) {
    const cleaned = [
      ...new Set(topic.map((t) => String(t || '').trim()).filter((t) => !isWildcard(t)))
    ];
    return cleaned;
  }
  const single = String(topic || '').trim();
  return isWildcard(single) ? [] : [single];
};

/**
 * @param {any} topic
 * @returns {string}
 */
const resolveTopicForAi = (topic) => {
  const list = normalizeTopicList(topic);
  if (list.length === 0) {
    return String(topic || '')
      .trim()
      .toUpperCase() === 'ANY'
      ? 'ANY'
      : '';
  }
  return list.join(', ');
};

// Hợp nhất lịch sử chống lặp từ AiMemoryManager + passedHistory (từ useExamLogic / QuizGame)
/**
 * @param {any[]} [passedHistory=[]]
 * @returns {string[]}
 */
const getMergedHistory = (passedHistory = []) => {
  const safeMemMgr = /** @type {any} */ (AiMemoryManager);
  const fromManager =
    safeMemMgr && typeof safeMemMgr.get === 'function' ? safeMemMgr.get() : [];
  /** @type {string[]} */
  const merged = [];
  const seen = new Set();

  /** @param {any} arr */
  const pushUnique = (arr) => {
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(trimmed);
      }
    }
  };

  pushUnique(passedHistory);
  pushUnique(fromManager);
  return merged.slice(-200);
};

// Ghi nhận Token an toàn tuyệt đối qua safeLocalStorageSet (Diệt 1/1 MEDIUM Radar R05 & chống NaN)
/**
 * @param {any} tokenUsage
 */
const safeAddTotalTokens = (tokenUsage) => {
  if (!tokenUsage || typeof localStorage === 'undefined') return;
  const used = Number(tokenUsage.totalTokenCount || 0);
  if (!Number.isFinite(used) || used <= 0) return;
  try {
    const prevRaw = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
    const prevSafe = Number.isFinite(prevRaw) && prevRaw >= 0 ? prevRaw : 0;
    safeLocalStorageSet('fc_total_tokens', String(prevSafe + Math.floor(used)));
  } catch (e) {
    console.warn('[ExamEngine] Không thể cập nhật fc_total_tokens:', getErrorMessage(e));
  }
};

// Dựng URL ảnh sạch cho từng đáp án Image Quiz (ưu tiên buildSmartImageUrl, chặn từ khóa rác & CJK/Việt)
/**
 * @param {any} opt
 * @param {any} data
 * @param {'en' | 'zh'} targetLang
 * @returns {string}
 */
const buildOptionImageUrl = (opt, data, targetLang) => {
  if (opt && typeof opt.image === 'string' && /^https?:\/\//i.test(opt.image.trim())) {
    return opt.image.trim();
  }

  /** @param {any} raw */
  const pickCleanKeyword = (raw) => {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed || INVALID_IMAGE_KEYWORDS.has(trimmed.toLowerCase())) return '';
    if (VI_DIACRITIC_REGEX.test(trimmed)) return '';
    if (CJK_REGEX.test(trimmed)) return '';
    return trimmed;
  };

  let query = '';
  if (opt?.isCorrect) {
    query = pickCleanKeyword(data?.image_keyword);
  }
  if (!query) {
    query = pickCleanKeyword(opt?.image_keyword);
  }
  if (!query && targetLang !== 'zh') {
    query = pickCleanKeyword(opt?.text);
  }

  if (query && typeof buildSmartImageUrl === 'function') {
    const smartUrl = buildSmartImageUrl(query, '', 'vocab');
    if (smartUrl) return smartUrl;
  }

  // [S15] Tuyệt đối không bắn chuỗi CJK / Tiếng Việt chưa lọc lên Bing ở fallbackQuery
  const fallbackQuery = query || 'clean illustration object';
  return `https://tse4.mm.bing.net/th?q=${encodeURIComponent(
    `${fallbackQuery} isolated clipart`
  )}&w=300&h=300&c=7&rs=1&p=0`;
};

// Đục lỗ chuẩn hóa hỗ trợ cả Tiếng Anh lẫn Tiếng Trung (CJK) và không tạo đúp lỗ trống
/**
 * @param {any} rawSentence
 * @param {any} rawTargetWord
 * @returns {string}
 */
const applyClozeBlank = (rawSentence, rawTargetWord) => {
  let sentence = String(rawSentence || '').trim();
  const targetWord = String(rawTargetWord || '').trim();
  if (!sentence) return targetWord ? '[__________]' : '';

  // Chuẩn hóa mọi biến thể gạch dưới AI hay tự chèn ([____], _____, ___) về đúng 1 token chuẩn
  sentence = sentence.replace(/\[\s*_{2,}\s*\]/g, '[__________]');
  if (!sentence.includes('[__________]') && /_{3,}/.test(sentence)) {
    sentence = sentence.replace(/_{3,}/, '[__________]');
  }

  if (sentence.includes('[__________]') || !targetWord) {
    return sentence;
  }

  const escaped = escapeRegExp(targetWord);
  const startsAsciiWord = /^[A-Za-z0-9]/.test(targetWord);
  const endsAsciiWord = /[A-Za-z0-9]$/.test(targetWord);

  let replaced = sentence;
  try {
    const pattern = `${startsAsciiWord ? '\\b' : ''}${escaped}${endsAsciiWord ? '\\b' : ''}`;
    const boundaryRegex = new RegExp(pattern, 'i');
    if (boundaryRegex.test(sentence)) {
      replaced = sentence.replace(boundaryRegex, '[__________]');
    }
  } catch {
    // Rơi xuống khớp chuỗi thường
  }

  if (!replaced.includes('[__________]')) {
    try {
      const looseRegex = new RegExp(escaped, 'i');
      if (looseRegex.test(sentence)) {
        replaced = sentence.replace(looseRegex, '[__________]');
      }
    } catch {
      if (sentence.includes(targetWord)) {
        replaced = sentence.replace(targetWord, '[__________]');
      }
    }
  }

  if (!replaced.includes('[__________]')) {
    replaced = `${sentence} [__________]`;
  }

  return replaced;
};

// Bù & làm sạch mảng distractors cho FillBlank (khử trùng NFC, loại bỏ targetWord)
/**
 * @param {any} rawDistractors
 * @param {string} targetWord
 * @param {'en' | 'zh'} targetLang
 * @param {any[]} [localDeck=[]]
 * @returns {string[]}
 */
const ensureFillBlankDistractors = (rawDistractors, targetWord, targetLang, localDeck = []) => {
  const targetKey = normalizeCompare(targetWord);
  const seen = new Set(targetKey ? [targetKey] : []);
  /** @type {string[]} */
  const cleanList = [];
  const safeAlgo = /** @type {any} */ (GameAlgoEngine);
  const safeOfflineDist = /** @type {any} */ (OfflineDistractorEngine);

  /** @param {any} cand */
  const pushCandidate = (cand) => {
    const text =
      typeof cand === 'object' && cand !== null
        ? String(cand.text || '').trim()
        : String(cand || '').trim();
    if (!text) return;
    const key = normalizeCompare(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    cleanList.push(text);
  };

  if (Array.isArray(rawDistractors)) {
    rawDistractors.forEach(pushCandidate);
  }

  if (cleanList.length < 3 && targetWord) {
    /** @type {any[]} */
    let extra = [];
    if (safeAlgo?.OptionsEngine?.offline_generateOptions) {
      try {
        extra = safeAlgo.OptionsEngine.offline_generateOptions(
          targetWord,
          localDeck,
          targetLang,
          'word',
          5,
          true
        );
      } catch {
        // Bỏ qua lỗi sinh nhiễu offline
      }
    }
    if (Array.isArray(extra)) extra.forEach(pushCandidate);
  }

  if (cleanList.length < 3 && safeOfflineDist?.generate && targetWord) {
    try {
      const extra2 = safeOfflineDist.generate(targetWord, localDeck, targetLang, 'def');
      if (Array.isArray(extra2)) extra2.forEach(pushCandidate);
    } catch {
      // Bỏ qua lỗi fallback distractor
    }
  }

  const emergency = targetLang === 'zh' ? ['但是', '因为', '虽然'] : ['however', 'because', 'although'];
  for (let i = 0; i < emergency.length && cleanList.length < 3; i++) {
    pushCandidate(emergency[i]);
  }

  return cleanList.slice(0, 3);
};

// Thuật toán khớp đáp án 3 tầng cho câu hỏi con MCQ trong Tổ kén Đọc Hiểu
/**
 * @param {any} rawOptions
 * @param {any} rawCorrectAnswer
 * @returns {number}
 */
const resolvePassageMcqCorrectIndex = (rawOptions, rawCorrectAnswer) => {
  const options = Array.isArray(rawOptions) ? rawOptions.map((o) => String(o || '').trim()) : [];
  if (options.length === 0) return -1;

  const ansRaw = String(rawCorrectAnswer || '').trim();
  if (!ansRaw) return 0;

  const ansNorm = normalizeCompare(ansRaw);
  const ansStripped = stripOptionLabelPrefix(ansRaw);

  // Tầng 1: Khớp chính xác (nguyên bản hoặc sau khi bóc nhãn A./B./C./D.)
  for (let i = 0; i < options.length; i++) {
    const optNorm = normalizeCompare(options[i]);
    const optStripped = stripOptionLabelPrefix(options[i]);
    if (
      optNorm === ansNorm ||
      (ansStripped && optStripped === ansStripped) ||
      (ansStripped && optNorm === ansStripped)
    ) {
      return i;
    }
  }

  // Tầng 2: Khớp nhãn chữ cái đơn (A / B / C / D hoặc Option A)
  const labelMatch = ansRaw.match(/^(?:option\s+)?([A-D])(?:[.):\-\s]|$)/i);
  if (labelMatch) {
    const letter = labelMatch[1].toUpperCase();
    const letterIdx = letter.charCodeAt(0) - 65;
    const explicitLabelIdx = options.findIndex((o) =>
      new RegExp(`^${letter}[.):\\-]\\s*`, 'i').test(o)
    );
    if (explicitLabelIdx !== -1) return explicitLabelIdx;
    if (letterIdx >= 0 && letterIdx < options.length) return letterIdx;
  }

  // Tầng 3: Khớp bao hàm có điều kiện (chỉ khi chuỗi >= 3 ký tự, chọn option gần chiều dài nhất)
  if (ansStripped.length >= 3) {
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < options.length; i++) {
      const optStripped = stripOptionLabelPrefix(options[i]);
      if (optStripped.length < 3) continue;
      if (optStripped.includes(ansStripped) || ansStripped.includes(optStripped)) {
        const delta = Math.abs(optStripped.length - ansStripped.length);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = i;
        }
      }
    }
    if (bestIdx !== -1) return bestIdx;
  }

  return 0;
};

// Chọn tối đa 4 phương án nhưng tuyệt đối không bao giờ cắt mất đáp án đúng (slice-safe)
/**
 * @param {any[]} normalizedOptions
 * @param {number} correctIdx
 * @returns {any[]}
 */
const selectUpToFourPreservingCorrect = (normalizedOptions, correctIdx) => {
  if (!Array.isArray(normalizedOptions) || normalizedOptions.length === 0) return [];
  if (correctIdx < 0 || correctIdx >= normalizedOptions.length) {
    return normalizedOptions.slice(0, 4);
  }
  if (normalizedOptions.length <= 4) {
    return normalizedOptions.map((o, idx) => ({
      ...o,
      isCorrect: idx === correctIdx
    }));
  }
  const pickedCorrect = { ...normalizedOptions[correctIdx], isCorrect: true };
  const pickedWrongs = normalizedOptions
    .filter((_, idx) => idx !== correctIdx)
    .slice(0, 3)
    .map((o) => ({ ...o, isCorrect: false }));
  return shuffleArray([...pickedWrongs, pickedCorrect]);
};

// Trạm Kiểm định & Tự phục hồi Chiều Đáp án (Vá Cloze Grammar HSK + Phòng thủ bug fc_quiz_config)
/**
 * @param {any} data
 * @param {{ targetLang: 'en' | 'zh', isReverse: boolean, isImageQuiz: boolean, isSentenceMode: boolean, isGrammarContext?: boolean, localDeck?: any[] }} opts
 */
const ensureMcqOrientation = (
  data,
  { targetLang, isReverse, isImageQuiz, isSentenceMode, isGrammarContext = false, localDeck = [] }
) => {
  if (!data || typeof data !== 'object') return data;

  const safeAlgo = /** @type {any} */ (GameAlgoEngine);
  const safeOfflineDist = /** @type {any} */ (OfflineDistractorEngine);
  const expectForeign = Boolean(isReverse || isImageQuiz);
  const foreignAnswer = isSentenceMode
    ? String(data.displaySentence || data.term || '').trim()
    : String(data.term || '').trim();
  const vietnameseAnswer = String(data.definition || '').trim();

  // Chuẩn hóa & khử trùng mảng options hiện có theo NFC
  const rawOptions = Array.isArray(data.options) ? data.options : [];
  /** @type {any[]} */
  const normalizedOptions = [];
  const seenKeys = new Set();

  for (let i = 0; i < rawOptions.length; i++) {
    const rawOpt = rawOptions[i];
    const text =
      typeof rawOpt === 'object' && rawOpt !== null
        ? String(rawOpt.text || '').trim()
        : String(rawOpt || '').trim();
    if (!text) continue;
    const key = normalizeCompare(text);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    const isCorrectFlag =
      typeof rawOpt === 'object' && rawOpt !== null
        ? rawOpt.isCorrect === true || String(rawOpt.isCorrect).toLowerCase() === 'true'
        : false;

    normalizedOptions.push({
      ...(typeof rawOpt === 'object' && rawOpt !== null ? rawOpt : {}),
      text,
      isCorrect: isCorrectFlag
    });
  }

  // Kiểm tra 1 phương án có đúng ngôn ngữ đích không
  /** @param {any} optText */
  const isForeignOptionText = (optText) => {
    const text = String(optText || '').trim();
    if (!text) return false;
    if (targetLang === 'zh') {
      return CJK_REGEX.test(text) && !VI_DIACRITIC_REGEX.test(text);
    }
    return !VI_DIACRITIC_REGEX.test(text) && !CJK_REGEX.test(text);
  };

  // Nhận diện Câu Điền Ngữ Pháp / Trắc nghiệm Ngữ pháp ngoại ngữ (Cloze Grammar MCQ)
  const hasBlankInPrompt =
    CLOZE_BLANK_REGEX.test(String(data.term || '')) ||
    CLOZE_BLANK_REGEX.test(String(data.displaySentence || ''));
  const correctOpt = normalizedOptions.find((o) => o.isCorrect);
  const matchesFullForeignAnswer =
    Boolean(correctOpt && foreignAnswer) &&
    normalizeCompare(correctOpt.text) === normalizeCompare(foreignAnswer);
  const foreignOptionCount = normalizedOptions.filter((o) => isForeignOptionText(o.text)).length;

  const isClozeGrammarMcq =
    !isReverse &&
    !isImageQuiz &&
    (hasBlankInPrompt ||
      (Boolean(isGrammarContext) &&
        normalizedOptions.length >= 3 &&
        foreignOptionCount >= normalizedOptions.length - 1 &&
        !matchesFullForeignAnswer &&
        (!vietnameseAnswer ||
          !correctOpt ||
          normalizeCompare(correctOpt.text) !== normalizeCompare(vietnameseAnswer))));

  if (isClozeGrammarMcq) {
    let correctIdx = normalizedOptions.findIndex((o) => o.isCorrect);
    if (correctIdx === -1 && data.correctAnswer) {
      const ansKey = normalizeCompare(data.correctAnswer);
      correctIdx = normalizedOptions.findIndex((o) => normalizeCompare(o.text) === ansKey);
    }
    data.options =
      correctIdx !== -1
        ? selectUpToFourPreservingCorrect(normalizedOptions, correctIdx)
        : normalizedOptions.slice(0, 4);
    return data;
  }

  const expectedCorrectText = expectForeign
    ? foreignAnswer || vietnameseAnswer
    : vietnameseAnswer || foreignAnswer;

  if (!expectedCorrectText) return data;

  /** @param {any} optText */
  const isOptionLangCompatible = (optText) => {
    const text = String(optText || '').trim();
    if (!text) return false;
    if (expectForeign) return isForeignOptionText(text);
    // Kỳ vọng Tiếng Việt
    if (targetLang === 'zh' && CJK_REGEX.test(text)) return false;
    return true;
  };

  // Phát hiện sai chiều ngôn ngữ (VD: aiFactory.js bị fc_quiz_config ghi đè ngược)
  let isWrongOrientation = false;

  if (normalizedOptions.length > 0) {
    if (expectForeign) {
      const viCount = normalizedOptions.filter((o) => isVietnameseText(o.text)).length;
      const nonZhCount =
        targetLang === 'zh' ? normalizedOptions.filter((o) => !CJK_REGEX.test(o.text)).length : 0;
      const matchesDefInsteadOfTerm =
        Boolean(correctOpt && vietnameseAnswer && foreignAnswer) &&
        normalizeCompare(vietnameseAnswer) !== normalizeCompare(foreignAnswer) &&
        normalizeCompare(correctOpt.text) === normalizeCompare(vietnameseAnswer);

      if (
        viCount >= 2 ||
        (targetLang === 'zh' && nonZhCount >= 2) ||
        matchesDefInsteadOfTerm ||
        (correctOpt && !isOptionLangCompatible(correctOpt.text))
      ) {
        isWrongOrientation = true;
      }
    } else {
      const matchesTermInsteadOfDef =
        Boolean(correctOpt && vietnameseAnswer && foreignAnswer) &&
        normalizeCompare(vietnameseAnswer) !== normalizeCompare(foreignAnswer) &&
        normalizeCompare(correctOpt.text) === normalizeCompare(foreignAnswer);
      const hasCjkCorrect =
        targetLang === 'zh' && Boolean(correctOpt && CJK_REGEX.test(correctOpt.text));

      if (matchesTermInsteadOfDef || hasCjkCorrect) {
        isWrongOrientation = true;
      }
    }
  }

  const expectedKey = normalizeCompare(expectedCorrectText);
  /** @type {any[]} */
  let finalOptions = [];

  if (isWrongOrientation || normalizedOptions.length < 3) {
    /** @type {any[]} */
    const keptWrongs = [];
    const usedKeys = new Set([expectedKey]);

    if (!isWrongOrientation) {
      for (let i = 0; i < normalizedOptions.length; i++) {
        const opt = normalizedOptions[i];
        const key = normalizeCompare(opt.text);
        if (!key || usedKeys.has(key)) continue;
        if (!isOptionLangCompatible(opt.text)) continue;
        usedKeys.add(key);
        keptWrongs.push({ ...opt, isCorrect: false });
      }
    }

    const needed = Math.max(0, 3 - keptWrongs.length);
    if (needed > 0) {
      /** @type {any[]} */
      let generatedDists = [];
      const dataType = isSentenceMode ? 'sentence' : 'word';
      if (safeAlgo?.OptionsEngine?.offline_generateOptions) {
        try {
          generatedDists = safeAlgo.OptionsEngine.offline_generateOptions(
            expectedCorrectText,
            localDeck,
            targetLang,
            dataType,
            needed + 2,
            expectForeign
          );
        } catch {
          // Bỏ qua lỗi sinh nhiễu offline
        }
      }

      if ((!generatedDists || generatedDists.length < needed) && safeOfflineDist?.generate) {
        try {
          const more = safeOfflineDist.generate(
            expectedCorrectText,
            localDeck,
            targetLang,
            expectForeign ? 'def' : 'term'
          );
          if (Array.isArray(more)) generatedDists = [...(generatedDists || []), ...more];
        } catch {
          // Bỏ qua lỗi fallback distractor
        }
      }

      if (Array.isArray(generatedDists)) {
        for (let i = 0; i < generatedDists.length && keptWrongs.length < 3; i++) {
          const d = generatedDists[i];
          const text =
            typeof d === 'object' && d !== null
              ? String(d.text || '').trim()
              : String(d || '').trim();
          const key = normalizeCompare(text);
          if (!key || usedKeys.has(key)) continue;
          usedKeys.add(key);
          keptWrongs.push({
            text,
            meaning: typeof d === 'object' && d !== null ? d.meaning : undefined,
            isCorrect: false
          });
        }
      }
    }

    finalOptions = shuffleArray([
      ...keptWrongs.slice(0, 3),
      { text: expectedCorrectText, isCorrect: true }
    ]);
  } else {
    let correctIdx = normalizedOptions.findIndex((o) => normalizeCompare(o.text) === expectedKey);
    if (correctIdx === -1) {
      correctIdx = normalizedOptions.findIndex((o) => o.isCorrect);
    }
    if (correctIdx === -1) {
      normalizedOptions[normalizedOptions.length - 1] = {
        text: expectedCorrectText,
        isCorrect: true
      };
      correctIdx = normalizedOptions.length - 1;
    }

    finalOptions = selectUpToFourPreservingCorrect(normalizedOptions, correctIdx);
  }

  if (isImageQuiz) {
    finalOptions = finalOptions.map((opt) => ({
      ...opt,
      image: buildOptionImageUrl(opt, data, targetLang)
    }));
  }

  data.options = finalOptions;
  return data;
};

// Trạm Kiểm định Cấu trúc Thống nhất (Chạy TRƯỚC _syncMemory và _normalizeForMinigame cho cả Mock Test & 10 Mini-Games)
/**
 * @param {any} data
 * @param {any} rawType
 * @param {boolean} isMinigame
 * @returns {{ valid: boolean, reason?: string }}
 */
const validateRawQuestionData = (data, rawType, isMinigame) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Dữ liệu câu hỏi bị rỗng hoặc không phải Object.' };
  }

  const tType = String(rawType || '')
    .toLowerCase()
    .trim();
  const isImageQuiz = tType.includes('image_quiz') || tType.includes('imagequiz');
  const isListening = tType.includes('listening');
  const isPronunciation = tType.includes('pronunciation');
  const isSpotMistake = tType.includes('spot_mistake') || tType.includes('spotmistake');
  const isFillBlank = tType.includes('fill_blank') || tType.includes('fillblank');
  const isOddOneOut = tType.includes('odd_one_out') || tType.includes('oddoneout');
  const isScramble = tType.includes('scramble');
  const isMatchMinigame =
    isMinigame && (tType === 'match' || tType === 'match_hard' || tType === 'ioe_match');
  const isOptionsBased =
    !isMatchMinigame &&
    (tType.includes('multiple_choice') ||
      tType.includes('quiz') ||
      tType === 'ioe_match' ||
      isImageQuiz ||
      isPronunciation ||
      isListening);

  if (isMatchMinigame) {
    const pairs = Array.isArray(data.correctPairs)
      ? data.correctPairs
      : Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.pairs)
          ? data.pairs
          : [];
    const validPairs = pairs.filter(
      (/** @type {any} */ p) => p && String(p.term || '').trim() && String(p.definition || '').trim()
    );
    if (validPairs.length < 2) {
      return { valid: false, reason: 'Ảo giác AI: Dữ liệu Nối ô (Match) có ít hơn 2 cặp hợp lệ.' };
    }
    if (
      !Array.isArray(data.correctPairs) &&
      !Array.isArray(data.items) &&
      Array.isArray(data.pairs)
    ) {
      data.items = validPairs;
    }
    return { valid: true };
  }

  if (isOptionsBased) {
    if (isListening) {
      if (!String(data.audioScript || '').trim()) {
        return { valid: false, reason: "Ảo giác AI: Thiếu kịch bản âm thanh 'audioScript'." };
      }
      if (!String(data.term || data.question || '').trim()) {
        return { valid: false, reason: "Ảo giác AI: Thiếu câu hỏi nghe hiểu 'term/question'." };
      }
    } else if (!String(data.term || data.displaySentence || '').trim()) {
      return { valid: false, reason: "Ảo giác AI: Thiếu trường 'term' cho câu trắc nghiệm." };
    }

    if (!Array.isArray(data.options) || data.options.length < 3) {
      return { valid: false, reason: "Ảo giác AI: Mảng 'options' rỗng hoặc có ít hơn 3 phương án." };
    }
    const cleanOpts = data.options.filter(
      (/** @type {any} */ o) => o && String(o.text || '').trim() !== ''
    );
    if (cleanOpts.length < 3) {
      return { valid: false, reason: "Ảo giác AI: Nhiều phương án trong 'options' bị trống chữ." };
    }
    const uniqueOptKeys = new Set(
      cleanOpts.map((/** @type {any} */ o) => normalizeCompare(o.text)).filter(Boolean)
    );
    if (uniqueOptKeys.size < 3) {
      return {
        valid: false,
        reason: "Ảo giác AI: Mảng 'options' bị trùng lặp, có ít hơn 3 phương án khác nhau."
      };
    }
    const correctCount = cleanOpts.filter(
      (/** @type {any} */ o) =>
        o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true'
    ).length;
    if (correctCount === 0) {
      return { valid: false, reason: "Ảo giác AI: Không có phương án nào mang 'isCorrect: true'." };
    }
    if (correctCount > 1) {
      return {
        valid: false,
        reason: `Ảo giác AI: Có ${correctCount} phương án cùng mang 'isCorrect: true' (chỉ cho phép duy nhất 1).`
      };
    }
    return { valid: true };
  }

  if (isSpotMistake) {
    const ws = String(data.wrongSentence || '').trim();
    const ww = String(data.wrongWord || '').trim();
    const corr = String(data.correction || '').trim();
    if (!ws || !ww || !corr) {
      return {
        valid: false,
        reason: "Ảo giác AI: Thiếu 'wrongSentence', 'wrongWord' hoặc 'correction'."
      };
    }
    if (normalizeCompare(ww) === normalizeCompare(corr)) {
      return { valid: false, reason: "Ảo giác AI: 'wrongWord' trùng hệt 'correction'." };
    }
    if (!normalizeCompare(ws).includes(normalizeCompare(ww))) {
      return {
        valid: false,
        reason: "Ảo giác AI: 'wrongWord' không tồn tại bên trong 'wrongSentence'."
      };
    }
    return { valid: true };
  }

  if (isFillBlank) {
    const ds = String(data.displaySentence || '').trim();
    const tw = String(data.targetWord || '').trim();
    if (!ds || !tw || !ds.includes('[__________]')) {
      return {
        valid: false,
        reason: "Ảo giác AI: Thiếu 'displaySentence' (chứa lỗ trống) hoặc 'targetWord'."
      };
    }
    return { valid: true };
  }

  if (isOddOneOut) {
    if (!Array.isArray(data.words) || data.words.length < 4 || !String(data.oddWord || '').trim()) {
      return {
        valid: false,
        reason: "Ảo giác AI: 'words' có ít hơn 4 từ hoặc thiếu 'oddWord'."
      };
    }
    const uniqueWords = new Set(
      data.words.map((/** @type {any} */ w) => normalizeCompare(w)).filter(Boolean)
    );
    if (uniqueWords.size < 4) {
      return {
        valid: false,
        reason: "Ảo giác AI: Mảng 'words' có từ rỗng hoặc bị trùng lặp (cần đủ 4 từ khác nhau)."
      };
    }
    const oddNorm = normalizeCompare(data.oddWord);
    const matchedWord = data.words.find(
      (/** @type {any} */ w) => normalizeCompare(w) === oddNorm
    );
    if (!matchedWord) {
      return { valid: false, reason: "Ảo giác AI: 'oddWord' không nằm trong mảng 'words'." };
    }
    data.oddWord = matchedWord;
    return { valid: true };
  }

  if (isScramble) {
    if (!String(data.term || '').trim()) {
      return { valid: false, reason: "Ảo giác AI: Thiếu trường 'term' cho game Ghép câu." };
    }
    return { valid: true };
  }

  return { valid: true };
};

// Sinh biến dạng an toàn tối thiểu cho SpotMistake Offline nếu DistortionEngine trượt
/**
 * @param {any} term
 * @param {'en' | 'zh'} targetLang
 * @returns {{ wrongSentence: string, wrongWord: string, correction: string, explanation: string }}
 */
const buildSafeOfflineDistortion = (term, targetLang) => {
  const cleanTerm = String(term || '').trim();
  if (!cleanTerm) {
    return {
      wrongSentence: 'He go to school every day.',
      wrongWord: 'go',
      correction: 'goes',
      explanation: 'Dữ liệu ngoại tuyến (Máy chủ AI quá tải).'
    };
  }

  if (targetLang === 'zh') {
    const chars = Array.from(cleanTerm);
    const targetChar = chars.find((ch) => CJK_REGEX.test(ch)) || chars[0];
    const zhCandidates = ['的', '得', '地', '在', '再', '了', '吗', '吧'];
    const wrongChar =
      zhCandidates.find((ch) => ch !== targetChar && !cleanTerm.includes(ch)) ||
      (targetChar === '的' ? '得' : '的');
    const wrongSentence = cleanTerm.replace(targetChar, wrongChar);
    return {
      wrongSentence,
      wrongWord: wrongChar,
      correction: targetChar,
      explanation: `Lỗi chữ Hán ngoại tuyến: "${wrongChar}" cần sửa thành "${targetChar}".`
    };
  }

  const tokens = cleanTerm.split(/\s+/).filter(Boolean);
  const pickIdx = tokens.findIndex((tok) => /^[A-Za-z]{3,}$/.test(tok.replace(/[^A-Za-z]/g, '')));
  const idx = pickIdx !== -1 ? pickIdx : 0;
  const origToken = tokens[idx];
  const core = origToken.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  const mutatedCore = core.endsWith('s') ? core.slice(0, -1) : `${core}s`;
  const wrongToken = core ? origToken.replace(core, mutatedCore) : `${origToken}s`;
  const mutatedTokens = [...tokens];
  mutatedTokens[idx] = wrongToken;

  return {
    wrongSentence: mutatedTokens.join(' '),
    wrongWord: mutatedCore || wrongToken,
    correction: core || origToken,
    explanation: `Lỗi hình thái từ ngoại tuyến: "${mutatedCore || wrongToken}" cần sửa thành "${
      core || origToken
    }".`
  };
};

// ============================================================================
// TỔNG CÔNG TRÌNH SƯ KHẢO THÍ (EXAM ENGINE)
// ============================================================================
export const ExamEngine = {
  ...ExamMemory,
  ...ExamFallback,
  ...ExamNormalizer,

  /** @type {Record<string, Promise<any>>} */
  _passageLocks: {},
  /** @type {Record<string, ReturnType<typeof setTimeout>>} */
  _passageLockTimers: {},

  // Dọn dẹp RAM triệt để: đồng bộ xóa tại chỗ _volatileMemory với ExamMemory & hủy mọi timer 5 phút
  clearVolatileMemory: function () {
    const self = /** @type {any} */ (this || ExamEngine);
    const safeExamMem = /** @type {any} */ (ExamMemory);

    if (safeExamMem && typeof safeExamMem.clearVolatileMemory === 'function') {
      safeExamMem.clearVolatileMemory.call(self);
    }
    if (Array.isArray(self._volatileMemory)) {
      self._volatileMemory.length = 0;
    } else {
      self._volatileMemory = [];
    }
    if (safeExamMem) {
      if (Array.isArray(safeExamMem._volatileMemory)) {
        safeExamMem._volatileMemory.length = 0;
      } else {
        safeExamMem._volatileMemory = [];
      }
    }

    if (self._passageLockTimers && typeof self._passageLockTimers === 'object') {
      Object.keys(self._passageLockTimers).forEach((k) => {
        if (self._passageLockTimers[k]) {
          clearTimeout(self._passageLockTimers[k]);
        }
      });
    }
    self._passageLockTimers = {};
    self._passageLocks = {};
    if (safeExamMem) safeExamMem._passageLocks = {};
  },

  // ============================================================================
  // 1. HYDRATION LOGIC (CỖ MÁY NẠP ĐẠN NGUYÊN TỬ TỐI THƯỢNG)
  // ============================================================================
  /**
   * @param {Record<string, any>} metadata
   * @param {string} apiKey
   * @param {any[]} [passedHistory=[]]
   */
  hydrateQuestion: async function (metadata, apiKey, passedHistory = []) {
    const self = /** @type {any} */ (this || ExamEngine);
    const safeIoe = /** @type {any} */ (IoeDataEngine);
    const safeFactory = /** @type {any} */ (AiFactoryEngine);
    const safeAlgo = /** @type {any} */ (GameAlgoEngine);
    const safeDb = /** @type {any} */ (FcDB);

    // Clone nông 2 pha: Không bao giờ làm bẩn metadata gốc nếu giữa chừng trượt QA / lỗi
    /** @type {Record<string, any>} */
    const safeMeta = metadata && typeof metadata === 'object' ? { ...metadata } : {};
    const {
      id,
      track,
      level,
      type,
      topic,
      passageGroup,
      questionIndexInPassage,
      mode,
      grammarId
    } = safeMeta;

    const tType = String(type || '')
      .toLowerCase()
      .trim();
    const isMinigame = mode === 'minigame' || !['ioe', 'ielts', 'hsk'].includes(track);
    const targetLang = resolveTargetLang(safeMeta);
    const effectiveTrack = targetLang === 'zh' ? 'hsk' : track || 'ioe';
    const levelList = normalizeLevelList(level, targetLang);
    const topicList = normalizeTopicList(topic);
    const aiTopic = resolveTopicForAi(topic);
    const safeTopicLabel = topicList.length > 0 ? topicList[0] : 'General';
    const mergedHistory = getMergedHistory(passedHistory);

    // TRẠM TRÍCH XUẤT NGỮ PHÁP & MÀNG LỌC TƯƠNG THÍCH NGƯỢC
    /** @param {any} metaId */
    const extractGrammarPrompt = (metaId) => {
      /** @type {Record<string, any>} */
      const microPromptsRepo = safeIoe?.MICRO_PROMPTS || MICRO_PROMPTS;
      if (!metaId || metaId === 'random' || !microPromptsRepo) return '';
      /** @type {any} */
      let foundGrammar = null;
      for (const poolKey in microPromptsRepo) {
        if (microPromptsRepo[poolKey] && microPromptsRepo[poolKey][metaId]) {
          foundGrammar = microPromptsRepo[poolKey][metaId];
          break;
        }
      }
      if (foundGrammar) {
        const grammarStr =
          typeof foundGrammar === 'object' ? foundGrammar.prompt || '' : foundGrammar;
        if (grammarStr) return `\n[YÊU CẦU NGỮ PHÁP ÉP BUỘC TỪ NGƯỜI DÙNG]: ${grammarStr}\n`;
      }
      return '';
    };

    const userGrammarConstraint = extractGrammarPrompt(grammarId);

    console.log('[ExamEngine] Hydrating via Universal Engine for type: ' + type);

    /** @type {any} */
    let generatedData = null;
    let isFromHarvestPool = false;
    /** @type {string | null} */
    let harvestId = null;
    let isNewHarvest = false;
    let ratio = 70;
    /** @type {Record<string, any>} */
    let harvestPool = {};
    /** @type {any[]} */
    let userHistory = [];

    // Nạp cấu hình Offline (Chỉ dành cho Mock Test)
    if (safeDb && !isMinigame) {
      try {
        const r = await safeDb.get('fc_exam_ratio');
        if (r !== undefined && r !== null && Number.isFinite(Number(r))) ratio = Number(r);
        const p = await safeDb.get('fc_exam_pool');
        if (p && typeof p === 'object') harvestPool = p;
        const h = await safeDb.get('fc_user_exam_history');
        if (Array.isArray(h)) userHistory = h;
      } catch (e) {
        console.warn('[ExamEngine] Lỗi đọc DB Lai:', getErrorMessage(e));
      }
    }

    // Tra cứu Kho đề Offline hỗ trợ đầy đủ Multi-select Array Armor cho level & topic
    /** @param {any} targetType */
    const fetchFromOfflinePool = (targetType) => {
      const langBucket = harvestPool?.[targetLang];
      if (!langBucket || typeof langBucket !== 'object') return null;

      /** @type {any[]} */
      const candidateItems = [];
      for (let li = 0; li < levelList.length; li++) {
        const lvlBucket = langBucket[levelList[li]];
        if (!lvlBucket || typeof lvlBucket !== 'object') continue;

        const topicsToScan = topicList.length > 0 ? topicList : Object.keys(lvlBucket);

        for (let ti = 0; ti < topicsToScan.length; ti++) {
          const topicBucket = lvlBucket[topicsToScan[ti]];
          const items = topicBucket?.[targetType];
          if (Array.isArray(items) && items.length > 0) {
            candidateItems.push(...items);
          }
        }
      }

      if (candidateItems.length === 0) return null;
      // [S14] Bảo vệ item.id rỗng/undefined không bị loại nhầm khi userHistory có phần tử lỗi
      const available = candidateItems.filter(
        (item) => item && (!item.id || !userHistory.includes(item.id))
      );
      if (available.length === 0) return null;
      return available[Math.floor(Math.random() * available.length)];
    };

    /** @param {any} itemType */
    const autoHarvest = (itemType) =>
      'ex_' +
      String(itemType || 'item') +
      '_' +
      Date.now() +
      '_' +
      Math.random().toString(36).slice(2, 7);

    const tryOfflineFirst = Math.random() * 100 <= ratio && !isMinigame;
    const isReadingFlow = Boolean(passageGroup) || tType.includes('reading');

    // ========================================================================
    // CHIẾN DỊCH ĐỌC HIỂU: THUẬT TOÁN "BẺ KÉN" (PASSAGE GROUPING + READING ĐƠN)
    // ========================================================================
    if (isReadingFlow) {
      const groupId = passageGroup || null;
      const qIndex = questionIndexInPassage || 0;

      const loadOrForgePassage = async () => {
        /** @type {any} */
        let pData = null;
        /** @type {any} */
        let pLastErr = null;
        const pType = tType.includes('reading') ? 'ielts_reading_passage' : type;

        if (tryOfflineFirst) {
          const picked = fetchFromOfflinePool(pType);
          if (
            picked &&
            picked.content &&
            String(picked.content.passage || '').trim() &&
            Array.isArray(picked.content.questions) &&
            picked.content.questions.length > 0
          ) {
            const cloned = JSON.parse(JSON.stringify(picked.content));
            cloned.questions = cloned.questions.filter(
              (/** @type {any} */ q) =>
                q &&
                typeof q === 'object' &&
                String(q.questionText || '').trim() !== '' &&
                String(q.correctAnswer || '').trim() !== ''
            );
            if (cloned.questions.length > 0) {
              pData = cloned;
              pData._harvestId = picked.id;
              pData._isNewHarvest = false;
              console.log('[ExamEngine] Offline Passage Hit: ' + picked.id);
            }
          }
        }

        if (!pData) {
          try {
            if (!apiKey) throw new Error('Missing API Key');
            const freshHistory = getMergedHistory(passedHistory);
            let historyPrompt =
              safeFactory && freshHistory.length > 0
                ? safeFactory.getHistoryPrompt(freshHistory)
                : '';
            historyPrompt = userGrammarConstraint + historyPrompt;

            const parsed = await safeFactory.forgeContext(
              'reading_passage',
              level,
              targetLang,
              apiKey,
              aiTopic,
              historyPrompt,
              'sentence',
              false
            );

            const validQuestions = Array.isArray(parsed?.questions)
              ? parsed.questions.filter(
                  (/** @type {any} */ q) =>
                    q &&
                    typeof q === 'object' &&
                    String(q.questionText || '').trim() !== '' &&
                    String(q.correctAnswer || '').trim() !== ''
                )
              : [];

            if (!parsed || !String(parsed.passage || '').trim() || validQuestions.length === 0) {
              throw new Error('Ảo giác AI: Tổ kén đọc hiểu bị rỗng hoặc thiếu câu hỏi con hợp lệ.');
            }

            parsed.questions = validQuestions;
            safeAddTotalTokens(parsed._tokenUsage);
            self._syncMemory(parsed, pType);

            pData = parsed;
            pData._harvestId = autoHarvest(pType);
            pData.id = pData._harvestId;
            pData._isNewHarvest = true;
          } catch (e) {
            pLastErr = e;
          }
          if (!pData) throw pLastErr || new Error('Passage generation failed');
        }

        return pData;
      };

      if (!self._passageLocks) self._passageLocks = {};
      if (!self._passageLockTimers) self._passageLockTimers = {};

      /** @type {Promise<any>} */
      let passagePromise;
      if (groupId) {
        if (!self._passageLocks[groupId]) {
          const createdPromise = loadOrForgePassage().catch((err) => {
            if (self._passageLockTimers[groupId]) {
              clearTimeout(self._passageLockTimers[groupId]);
              delete self._passageLockTimers[groupId];
            }
            if (self._passageLocks[groupId] === createdPromise) {
              delete self._passageLocks[groupId];
            }
            throw err;
          });

          self._passageLocks[groupId] = createdPromise;
          if (self._passageLockTimers[groupId]) {
            clearTimeout(self._passageLockTimers[groupId]);
          }
          const timerId = setTimeout(() => {
            if (self._passageLocks[groupId] === createdPromise) {
              delete self._passageLocks[groupId];
            }
            if (self._passageLockTimers[groupId] === timerId) {
              delete self._passageLockTimers[groupId];
            }
          }, 300000);
          self._passageLockTimers[groupId] = timerId;
        }
        passagePromise = self._passageLocks[groupId];
      } else {
        passagePromise = loadOrForgePassage();
      }

      try {
        const passageSet = await passagePromise;

        if (isMinigame) {
          return {
            id: passageSet.id || autoHarvest('reading_passage'),
            harvestId: passageSet._harvestId || null,
            isNewHarvest: Boolean(passageSet._isNewHarvest),
            metadata: safeMeta,
            content: passageSet,
            timestamp: Date.now()
          };
        }

        /** @type {any} */
        let qData = passageSet.questions[qIndex];
        let isRescuedPassageChild = false;

        if (!qData) {
          console.warn(
            '[ExamEngine] Ảo giác AI: Tổ kén thiếu câu hỏi số ' +
              (qIndex + 1) +
              '. Kích hoạt Tự vá Tổ kén.'
          );
          const fallbackQ = passageSet.questions[0];
          if (fallbackQ) {
            qData = { ...fallbackQ, questionText: `${fallbackQ.questionText} (Review)` };
          } else {
            qData = {
              type: 'tfng',
              questionText: 'This passage is informative and provides useful details.',
              options: ['True', 'False', 'Not Given'],
              correctAnswer: 'True',
              explanation: 'Hệ thống tự động bù đắp do AI sinh thiếu câu hỏi.'
            };
          }
          isRescuedPassageChild = true;
        }

        const originalType = safeMeta._originalType || safeMeta.type || type;
        const subType = String(qData.type || 'mcq')
          .toLowerCase()
          .trim();
        safeMeta._originalType = originalType;
        safeMeta._subType = subType;

        /** @type {Record<string, any>} */
        const tempGeneratedData = {
          passage: passageSet.passage,
          explanation: qData.explanation || '',
          isAiGenerated: !isRescuedPassageChild,
          _isRescued: isRescuedPassageChild
        };

        if (subType === 'fill_blank') {
          tempGeneratedData.targetWord = String(qData.correctAnswer || '').trim();
          tempGeneratedData.displaySentence = applyClozeBlank(
            qData.questionText,
            tempGeneratedData.targetWord
          );
          safeMeta.type = 'ioe_fill_blank';
        } else if (subType === 'tfng') {
          tempGeneratedData.term = qData.questionText;
          const cleanTfngAns = normalizeCompare(qData.correctAnswer);
          const isTrue = cleanTfngAns === 'true' || cleanTfngAns === 't';
          const isFalse = cleanTfngAns === 'false' || cleanTfngAns === 'f';
          const isNotGiven =
            cleanTfngAns === 'not given' || cleanTfngAns === 'ng' || cleanTfngAns === 'notgiven';

          tempGeneratedData.options = [
            { text: 'True', isCorrect: isTrue },
            { text: 'False', isCorrect: isFalse },
            { text: 'Not Given', isCorrect: isNotGiven }
          ];
          if (!tempGeneratedData.options.some((/** @type {any} */ o) => o.isCorrect)) {
            tempGeneratedData.options[0].isCorrect = true;
          }
          safeMeta.type = 'ioe_multiple_choice';
        } else {
          tempGeneratedData.term = qData.questionText;
          const rawOpts =
            Array.isArray(qData.options) && qData.options.length > 0
              ? qData.options
              : ['A', 'B', 'C', 'D'];
          const correctIdx = resolvePassageMcqCorrectIndex(rawOpts, qData.correctAnswer);
          const mappedOptions = rawOpts.map((/** @type {any} */ o, /** @type {number} */ idx) => ({
            text: String(o || '').trim(),
            isCorrect: idx === correctIdx
          }));
          tempGeneratedData.options = shuffleArray(mappedOptions);
          safeMeta.type = 'ioe_multiple_choice';
        }

        if (!isRescuedPassageChild) {
          const check = validateRawQuestionData(tempGeneratedData, safeMeta.type, false);
          if (!check.valid) {
            throw new Error(check.reason);
          }
          if (!self._sanitizeAiItem(tempGeneratedData, safeMeta.type, effectiveTrack, level)) {
            throw new Error(
              'Dữ liệu câu hỏi con vi phạm quy tắc (Ám sát sư phạm hoặc thiếu đáp án).'
            );
          }
        }

        // Pha 2 của Clone safeMeta: Chỉ đồng bộ lại metadata gốc SAU KHI đã pass QA 100%
        if (metadata && typeof metadata === 'object') {
          metadata._originalType = safeMeta._originalType;
          metadata._subType = safeMeta._subType;
          metadata.type = safeMeta.type;
        }

        harvestId = passageSet._harvestId;
        if (passageSet._isNewHarvest && qIndex === 0) {
          isNewHarvest = true;
          tempGeneratedData._fullPassageData = passageSet;
        }
        isFromHarvestPool = !passageSet._isNewHarvest;
        generatedData = tempGeneratedData;
      } catch (e) {
        console.error(
          '[ExamEngine] Passage Cocoon break failed for ' + (groupId || 'standalone') + ':',
          getErrorMessage(e)
        );
        throw e;
      }
    } else {
      // ======================================================================
      // CÁC CÂU HỎI ĐƠN LẺ NGUYÊN TỬ
      // ======================================================================
      const isMatchType =
        tType === 'match' ||
        tType === 'match_hard' ||
        tType === 'ioe_match' ||
        tType === safeIoe?.QUESTION_TYPES?.IOE_MATCH;
      const isImageQuiz =
        tType.includes('image_quiz') ||
        tType.includes('imagequiz') ||
        tType === safeIoe?.QUESTION_TYPES?.IOE_IMAGE_QUIZ;
      const isMcqQuizFlow =
        tType.includes('quiz') ||
        tType.includes('multiple_choice') ||
        isImageQuiz ||
        (isMatchType && !isMinigame);
      const isReverse = isImageQuiz || safeMeta.askMode === 'def';
      const isSentenceMode = safeMeta.dataMode === 'sentence' || tType.includes('grammar');
      const localDeckForOffline = safeJsonParse('fc_data_' + targetLang, []);

      // 1. Thử bốc từ Kho đề Offline (Mock Test)
      if (tryOfflineFirst) {
        const picked = fetchFromOfflinePool(type);
        if (picked && picked.content) {
          const qContent = JSON.parse(JSON.stringify(picked.content));

          if (isMcqQuizFlow) {
            ensureMcqOrientation(qContent, {
              targetLang,
              isReverse,
              isImageQuiz,
              isSentenceMode,
              isGrammarContext:
                isSentenceMode ||
                Boolean(userGrammarConstraint) ||
                (!isMinigame &&
                  (tType === 'ioe_multiple_choice' || tType === 'ielts_reading_mcq')),
              localDeck: localDeckForOffline
            });
          }

          const check = validateRawQuestionData(qContent, type, isMinigame);
          if (check.valid && self._sanitizeAiItem(qContent, type, effectiveTrack, level)) {
            generatedData = qContent;
            isFromHarvestPool = true;
            harvestId = picked.id;
            console.log('[ExamEngine] Offline Pool Hit: ' + harvestId);
          }
        }
      }

      // 2. Gọi Nhà máy AI nếu chưa có từ Kho đề Offline
      if (!generatedData) {
        try {
          if (!apiKey) {
            throw new Error('Missing API Key for Exam Hydration.');
          }

          let finalHistoryPrompt = '';
          if (safeFactory && mergedHistory.length > 0) {
            finalHistoryPrompt = safeFactory.getHistoryPrompt(mergedHistory);
          }
          finalHistoryPrompt = userGrammarConstraint + finalHistoryPrompt;

          /** @type {any} */
          let tempGeneratedData = null;
          const useLegacyAi =
            typeof localStorage !== 'undefined'
              ? localStorage.getItem('fc_debug_legacy_ai') === 'true'
              : false;

          // ------------------------------------------------------------------
          // KHỐI LOGIC 1: LẮP RÁP 2-SHOT LEGACY (QUIZ / IMAGE QUIZ / MOCK MATCH)
          // ------------------------------------------------------------------
          if (isMcqQuizFlow && useLegacyAi) {
            console.log('[ExamEngine] Running Legacy 2-Shot AI for: ' + type);
            const dataModeParam = isSentenceMode ? 'sentence' : 'vocab';
            tempGeneratedData = await safeFactory.forgeBaseCard(
              level,
              targetLang,
              apiKey,
              aiTopic,
              finalHistoryPrompt,
              dataModeParam,
              isReverse
            );
            if (!tempGeneratedData) throw new Error('AI returned empty data');

            const doubleCheckHistory = getMergedHistory(passedHistory);
            const termsToCheck = self._extractTermsToCheck(tempGeneratedData, type);
            if (self._isDuplicate(termsToCheck, doubleCheckHistory)) {
              throw new Error(
                '[Duplicate Detected] Lưới lọc phát hiện từ khóa trùng lặp. Ép AI đúc lại.'
              );
            }

            /** @type {any[]} */
            let dists = [];
            const dataTypeArg = dataModeParam === 'sentence' ? 'sentence' : 'word';
            try {
              if (safeAlgo?.OptionsEngine?.ai_generateOptions) {
                dists = await safeAlgo.OptionsEngine.ai_generateOptions(
                  tempGeneratedData,
                  targetLang,
                  dataTypeArg,
                  apiKey,
                  3,
                  level,
                  aiTopic,
                  isReverse
                );
              }
            } catch (aiErr) {
              console.warn(
                'Nhịp 2 (Options AI) thất bại, fallback sang Offline:',
                getErrorMessage(aiErr)
              );
            }

            if (!Array.isArray(dists) || dists.length < 3) {
              if (safeAlgo?.OptionsEngine?.offline_generateOptions) {
                const baseTextForTrap = isReverse
                  ? tempGeneratedData.term
                  : tempGeneratedData.definition;
                dists = safeAlgo.OptionsEngine.offline_generateOptions(
                  baseTextForTrap,
                  localDeckForOffline,
                  targetLang,
                  dataTypeArg,
                  3,
                  isReverse
                );
              } else {
                dists = [];
              }
            }

            const correctOptText = isReverse
              ? tempGeneratedData.term
              : tempGeneratedData.definition;
            const correctOpt = { text: correctOptText, isCorrect: true };
            const wrongOpts = (Array.isArray(dists) ? dists : []).slice(0, 3).map((d) => ({
              text: typeof d === 'object' && d !== null ? d.text : d,
              meaning: typeof d === 'object' && d !== null ? d.meaning : undefined,
              isCorrect: false
            }));
            tempGeneratedData.options = shuffleArray([...wrongOpts, correctOpt]);

            ensureMcqOrientation(tempGeneratedData, {
              targetLang,
              isReverse,
              isImageQuiz,
              isSentenceMode,
              isGrammarContext: false,
              localDeck: localDeckForOffline
            });
          }
          // ------------------------------------------------------------------
          // KHỐI LOGIC 2: ĐÚC NGUYÊN KHỐI 1-SHOT (QUIZ / IMAGE QUIZ / MOCK MATCH)
          // ------------------------------------------------------------------
          else if (isMcqQuizFlow && !useLegacyAi) {
            console.log('[ExamEngine] Running Fast 1-Shot AI for: ' + type);
            const useGrammarForge = isSentenceMode || Boolean(userGrammarConstraint);
            const forgeType = useGrammarForge ? 'grammar_mcq' : 'vocab_mcq';
            const dataModeParam = useGrammarForge ? 'sentence' : 'vocab';

            tempGeneratedData = await safeFactory.forgeContext(
              forgeType,
              level,
              targetLang,
              apiKey,
              aiTopic,
              finalHistoryPrompt,
              dataModeParam,
              isReverse
            );
            if (!tempGeneratedData) throw new Error('AI returned empty data for ' + forgeType);

            const doubleCheckHistory = getMergedHistory(passedHistory);
            const termsToCheck = self._extractTermsToCheck(tempGeneratedData, type);
            if (self._isDuplicate(termsToCheck, doubleCheckHistory)) {
              throw new Error(
                '[Duplicate Detected] Lưới lọc phát hiện từ khóa trùng lặp. Ép AI đúc lại.'
              );
            }

            ensureMcqOrientation(tempGeneratedData, {
              targetLang,
              isReverse,
              isImageQuiz,
              isSentenceMode: useGrammarForge,
              isGrammarContext:
                useGrammarForge || (!isMinigame && tType === 'ioe_multiple_choice'),
              localDeck: localDeckForOffline
            });
          }
          // ------------------------------------------------------------------
          // KHỐI LOGIC 3: CÁC DẠNG BÀI ĐẶC THÙ (SPOT / FILL / SCRAMBLE / ODD / PRON / LISTEN / MATCH)
          // ------------------------------------------------------------------
          else {
            if (
              tType === safeIoe?.QUESTION_TYPES?.IOE_SPOT_MISTAKE ||
              tType === 'ioe_spot_mistake' ||
              tType === 'spotmistake'
            ) {
              tempGeneratedData = await safeFactory.forgeContext(
                'spot_mistake',
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                'sentence',
                false
              );
            } else if (
              tType === safeIoe?.QUESTION_TYPES?.IOE_FILL_BLANK ||
              tType === 'ioe_fill_blank' ||
              tType === 'fillblank'
            ) {
              let matrixInstruction = '\n[YÊU CẦU SƯ PHẠM QUỐC TẾ CHO GAME ĐIỀN TỪ]:\n';
              matrixInstruction +=
                "1. BẮT BUỘC TRẢ VỀ: Sinh thêm một mảng 'distractors' chứa CHÍNH XÁC 3 từ nhiễu sai (Bẫy), khác hẳn 'targetWord'. TUYỆT ĐỐI không để mảng này rỗng.\n";
              if (userGrammarConstraint) {
                matrixInstruction +=
                  "2. CHIẾN LƯỢC NGỮ PHÁP (Khóa cứng): Câu đố PHẢI tuân thủ tuyệt đối [YÊU CẦU NGỮ PHÁP ÉP BUỘC TỪ NGƯỜI DÙNG] ở trên. 'targetWord' phải phản ánh đúng cấu trúc ngữ pháp đó.\n";
              } else {
                const matrixRoll = Math.random();
                if (matrixRoll < 0.35) {
                  matrixInstruction +=
                    '2. CHIẾN LƯỢC COLLOCATIONS (35%): Câu đố kiểm tra Cụm từ cố định / Phrasal Verbs / Idioms. Từ đục lỗ (targetWord) nằm trong cụm đó. 3 distractors là các từ dễ nhầm lẫn khi dịch word-by-word.\n';
                } else if (matrixRoll < 0.7) {
                  matrixInstruction +=
                    "2. CHIẾN LƯỢC NGỮ PHÁP (35%): Kiểm tra chuyên sâu một mảng Ngữ pháp phù hợp cấp độ (Giới từ, Mạo từ, Liên từ, Chia động từ...). 'targetWord' mang chức năng ngữ pháp.\n";
                } else {
                  matrixInstruction +=
                    "2. CHIẾN LƯỢC PARAPHRASING (30%): Kiểm tra từ đồng nghĩa theo ngữ cảnh. Trường 'hint' ghi bản dịch Tiếng Việt tự nhiên kèm từ đồng nghĩa bằng ngôn ngữ đích trong ngoặc đơn.\n";
                }
              }

              tempGeneratedData = await safeFactory.forgeContext(
                'fill_blank',
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt + matrixInstruction,
                'sentence',
                false
              );

              if (tempGeneratedData) {
                tempGeneratedData.displaySentence = applyClozeBlank(
                  tempGeneratedData.displaySentence,
                  tempGeneratedData.targetWord
                );
                tempGeneratedData.distractors = ensureFillBlankDistractors(
                  tempGeneratedData.distractors,
                  tempGeneratedData.targetWord,
                  targetLang,
                  localDeckForOffline
                );
              }
            } else if (
              tType === safeIoe?.QUESTION_TYPES?.IOE_SCRAMBLE ||
              tType === 'ioe_scramble' ||
              tType === 'scramble'
            ) {
              const scrambleMode = safeMeta.dataMode === 'vocab' ? 'vocab' : 'sentence';
              tempGeneratedData = await safeFactory.forgeBaseCard(
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                scrambleMode,
                false
              );
            } else if (
              tType === safeIoe?.QUESTION_TYPES?.IOE_ODD_ONE_OUT ||
              tType === 'ioe_odd_one_out' ||
              tType === 'oddoneout'
            ) {
              tempGeneratedData = await safeFactory.forgeMatrix(
                'odd_one_out',
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                safeMeta.dataMode || 'vocab',
                false
              );
            } else if (
              tType === safeIoe?.QUESTION_TYPES?.IOE_PRONUNCIATION ||
              tType === 'ioe_pronunciation' ||
              tType === 'pronunciation'
            ) {
              tempGeneratedData = await safeFactory.forgeMatrix(
                'pronunciation',
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                'vocab',
                false
              );
            } else if (
              tType === safeIoe?.QUESTION_TYPES?.IOE_LISTENING ||
              tType === 'ioe_listening' ||
              tType === 'listening'
            ) {
              tempGeneratedData = await safeFactory.forgeContext(
                'listening',
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                'sentence',
                false
              );
              if (tempGeneratedData && tempGeneratedData.question && !tempGeneratedData.term) {
                tempGeneratedData.term = tempGeneratedData.question;
              }
            } else if (isMatchType && isMinigame) {
              const subType =
                tType === 'match_hard' || safeMeta.hardMode || safeMeta.difficulty === 'hard'
                  ? 'match_hard'
                  : 'match';
              tempGeneratedData = await safeFactory.forgeMatrix(
                subType,
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                safeMeta.dataMode || 'vocab',
                false
              );
            } else {
              tempGeneratedData = await safeFactory.forgeBaseCard(
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                safeMeta.dataMode || 'vocab',
                false
              );
            }

            if (!tempGeneratedData) throw new Error('AI returned empty data for type: ' + type);

            const doubleCheckHistory = getMergedHistory(passedHistory);
            const termsToCheck = self._extractTermsToCheck(tempGeneratedData, type);
            if (self._isDuplicate(termsToCheck, doubleCheckHistory)) {
              throw new Error(
                '[Duplicate Detected] Lưới lọc phát hiện từ khóa trùng lặp. Ép AI đúc lại.'
              );
            }
          }

          // Ghi nhận Token an toàn trước khi chuẩn hóa (vì API đã thực sự tiêu thụ token)
          safeAddTotalTokens(tempGeneratedData._tokenUsage);

          // ------------------------------------------------------------------
          // TRẠM KIỂM ĐỊNH THỐNG NHẤT (CHẠY CHO CẢ MOCK TEST LẪN 10 MINI-GAMES)
          // ------------------------------------------------------------------
          const structuralCheck = validateRawQuestionData(tempGeneratedData, type, isMinigame);
          if (!structuralCheck.valid) {
            throw new Error(structuralCheck.reason);
          }

          if (!self._sanitizeAiItem(tempGeneratedData, type, effectiveTrack, level)) {
            throw new Error(
              'Dữ liệu vi phạm quy tắc Sư phạm (Ám sát sư phạm, thiếu đáp án hoặc sai cấu trúc).'
            );
          }

          // Đạn đã vượt qua toàn bộ kiểm định -> Ghi nhận vào bộ nhớ chống lặp
          self._syncMemory(tempGeneratedData, type);

          const rawTermSnapshot = tempGeneratedData.term || '';

          // ------------------------------------------------------------------
          // BƯỚC CHUẨN HÓA ĐẦU RA CHO MINI-GAMES (BLOCK 2.7c)
          // ------------------------------------------------------------------
          if (isMinigame && self._normalizeForMinigame) {
            const normalizerType = tType === 'match_hard' ? 'match' : tType;
            tempGeneratedData = await self._normalizeForMinigame(
              tempGeneratedData,
              normalizerType,
              safeMeta,
              targetLang,
              level,
              safeTopicLabel,
              apiKey
            );

            if (isImageQuiz && tempGeneratedData && typeof tempGeneratedData === 'object') {
              if (!tempGeneratedData.term && rawTermSnapshot) {
                tempGeneratedData.term = rawTermSnapshot;
              }
            }
          }

          if (!isFromHarvestPool && tempGeneratedData && !tempGeneratedData._isRescued) {
            harvestId = autoHarvest(type);
            if (typeof tempGeneratedData === 'object' && tempGeneratedData !== null) {
              tempGeneratedData.id = harvestId;
            }
            isNewHarvest = true;
          }

          generatedData = tempGeneratedData;
        } catch (error) {
          console.error(
            `[ExamEngine] Lỗi đúc AI cho ${type}. Từ chối nạp đạn. Lỗi: ${getErrorMessage(error)}`
          );
          throw error;
        }
      }
    }

    if (!generatedData) {
      throw new Error('Dữ liệu AI trả về rỗng. Chặn nạp đạn khuyết tật vào Băng đạn.');
    }

    return {
      id: id,
      harvestId: harvestId,
      isNewHarvest: isNewHarvest,
      content: generatedData,
      metadata: safeMeta,
      timestamp: Date.now()
    };
  },

  // ============================================================================
  // 2. BỘ MÁY CỨU HỘ TOÀN CỤC (UNIVERSAL JIT FALLBACK ENGINE - 0ms KHÔNG VỠ UI)
  // ============================================================================
  /**
   * @param {Record<string, any>} metadata
   * @param {any[] | null} [passedLocalDeck=null]
   * @param {number | null} [passedIndex=null]
   */
  getEmergencyFallback: function (metadata, passedLocalDeck = null, passedIndex = null) {
    try {
      const self = /** @type {any} */ (this || ExamEngine);
      const safeAlgo = /** @type {any} */ (GameAlgoEngine);
      const safeOfflineDist = /** @type {any} */ (OfflineDistractorEngine);
      const safeFallback = /** @type {any} */ (FallbackDataEngine);

      /** @type {Record<string, any>} */
      const safeMeta = metadata && typeof metadata === 'object' ? { ...metadata } : {};
      const { id, track, level, type, index, mode, passageGroup } = safeMeta;
      const isMinigame = mode === 'minigame' || !['ioe', 'ielts', 'hsk'].includes(track);
      const targetLang = resolveTargetLang(safeMeta);
      const effectiveTrack = targetLang === 'zh' ? 'hsk' : track || 'ioe';
      const tType = String(safeMeta.type || type || '')
        .toLowerCase()
        .trim();

      const isImageQuiz = tType.includes('image_quiz') || tType.includes('imagequiz');
      const isReverse = isImageQuiz || safeMeta.askMode === 'def';
      const isSentenceMode = safeMeta.dataMode === 'sentence';
      const isMatchMinigame =
        isMinigame && (tType === 'match' || tType === 'match_hard' || tType === 'ioe_match');
      const isContextSpecial =
        Boolean(passageGroup) ||
        tType.includes('listening') ||
        tType.includes('reading') ||
        tType.includes('pronunciation') ||
        tType.includes('tfng');

      /** @type {any} */
      let rescuedData = null;
      const rescueIndexRaw = passedIndex !== null && passedIndex !== undefined ? passedIndex : index;
      const rescueIndex =
        rescueIndexRaw !== undefined && rescueIndexRaw !== null && !isNaN(Number(rescueIndexRaw))
          ? Math.abs(Math.floor(Number(rescueIndexRaw)))
          : Math.floor(Math.random() * 100);

      console.log('[EmergencyFallback] Kích hoạt Cứu hộ Tức thời (JIT) Toàn cục cho: ' + tType);

      // Helper kéo cáp tĩnh theo phân nhánh Mock Test / Mini-Game
      const pullStaticFallback = () => {
        const resolveFbMinigameType = () => {
          if (tType.includes('match')) return 'match';
          if (tType.includes('scramble')) return 'scramble';
          if (tType.includes('fill_blank') || tType.includes('fillblank')) return 'fillblank';
          if (tType.includes('spot_mistake') || tType.includes('spotmistake')) return 'spotmistake';
          if (tType.includes('odd_one_out') || tType.includes('oddoneout')) return 'oddoneout';
          if (tType.includes('imagequiz') || tType.includes('image_quiz')) return 'imagequiz';
          if (tType.includes('pronunciation')) return 'pronunciation';
          if (tType.includes('listening')) return 'listening';
          if (tType.includes('reading') || Boolean(passageGroup)) return 'reading';
          return 'quiz';
        };

        if (!isMinigame && self._generateFallbackData) {
          let mockFbType = safeMeta.type || type;
          if (Boolean(passageGroup) || tType.includes('reading')) {
            mockFbType = 'ielts_reading_passage';
          }
          const mockRes = self._generateFallbackData(
            mockFbType,
            level,
            effectiveTrack,
            rescueIndex
          );
          if (mockRes) {
            if (tType.includes('tfng') && mockRes.passage) {
              return {
                passage: mockRes.passage,
                term: mockRes.term,
                options: [
                  { text: 'True', isCorrect: true },
                  { text: 'False', isCorrect: false },
                  { text: 'Not Given', isCorrect: false }
                ],
                explanation: mockRes.explanation || 'Dữ liệu dự phòng tự động.',
                isAiGenerated: false
              };
            }
            return mockRes;
          }
        }

        if (safeFallback?.getGameReadyFallback) {
          return safeFallback.getGameReadyFallback(
            resolveFbMinigameType(),
            targetLang,
            level,
            safeMeta
          );
        }

        if (self._generateFallbackData) {
          return self._generateFallbackData(
            safeMeta.type || type,
            level,
            effectiveTrack,
            rescueIndex
          );
        }
        return null;
      };

      // ----------------------------------------------------------------------
      // LUỒNG A: DẠNG NGỮ CẢNH ĐẶC THÙ (LISTENING / READING / PRONUNCIATION / TFNG)
      // ----------------------------------------------------------------------
      if (isContextSpecial) {
        rescuedData = pullStaticFallback();
      } else {
        // --------------------------------------------------------------------
        // LUỒNG B: ƯU TIÊN KHO THẺ CÁ NHÂN ("THẺ CỦA TÔI") KHI CÓ DỮ LIỆU
        // --------------------------------------------------------------------
        const rawLocalDeck = passedLocalDeck || safeJsonParse('fc_data_' + targetLang, []);
        /** @type {any[]} */
        const validLocalDeck = Array.isArray(rawLocalDeck)
          ? rawLocalDeck.filter((c) => c && typeof c.term === 'string' && c.term.trim() !== '')
          : [];

        if (isMatchMinigame) {
          /** @type {any[]} */
          const uniquePairs = [];
          const seenTerms = new Set();
          for (let offset = 0; offset < validLocalDeck.length && uniquePairs.length < 5; offset++) {
            const card = validLocalDeck[(rescueIndex + offset) % validLocalDeck.length];
            const tKey = normalizeCompare(card.term);
            if (!tKey || seenTerms.has(tKey)) continue;
            seenTerms.add(tKey);
            uniquePairs.push({
              term: card.term.trim(),
              definition:
                String(card.definition || '').trim() || `(Thẻ khuyết nghĩa) ${card.term.trim()}`
            });
          }

          if (uniquePairs.length >= 2) {
            const stamp = Date.now();
            const leftItems = shuffleArray(
              uniquePairs.map((c, i) => ({
                id: `left_fb_${i}_${stamp}`,
                term: c.term,
                definition: c.definition,
                isTrap: false,
                origin: c
              }))
            );
            const rightItems = shuffleArray(
              uniquePairs.map((c, i) => ({
                id: `right_fb_${i}_${stamp}`,
                term: c.term,
                isTrap: false
              }))
            );
            rescuedData = {
              pairs: uniquePairs,
              leftItems,
              rightItems,
              isAiGenerated: false
            };
          } else {
            rescuedData = pullStaticFallback();
          }
        } else if (validLocalDeck.length > 0) {
          /** @type {any} */
          let fallbackCard = null;
          if (safeMeta.term) {
            fallbackCard = validLocalDeck.find((c) => c.term === safeMeta.term);
          }
          if (!fallbackCard && id) {
            fallbackCard = validLocalDeck.find((c) => c.term === id || c.id === id);
          }
          if (!fallbackCard) {
            fallbackCard = validLocalDeck[rescueIndex % validLocalDeck.length];
          }

          /** @type {Record<string, any>} */
          const baseCard = JSON.parse(JSON.stringify(fallbackCard));
          const isMCQ =
            tType.includes('multiple_choice') ||
            tType === 'ioe_match' ||
            isImageQuiz ||
            tType.includes('quiz');

          if (isMCQ) {
            const safeDef =
              String(baseCard.definition || '').trim() || `(Thẻ khuyết nghĩa) ${baseCard.term}`;
            baseCard.definition = safeDef;
            baseCard.questionText = isReverse ? safeDef : baseCard.term;

            const correctText = isReverse ? baseCard.term : safeDef;
            const dataType = isSentenceMode ? 'sentence' : 'word';
            /** @type {any[]} */
            let dists = [];

            if (safeAlgo?.OptionsEngine?.offline_generateOptions) {
              try {
                dists = safeAlgo.OptionsEngine.offline_generateOptions(
                  correctText,
                  validLocalDeck,
                  targetLang,
                  dataType,
                  3,
                  isReverse
                );
              } catch {
                // Bỏ qua lỗi sinh nhiễu offline
              }
            }

            if (!Array.isArray(dists) || dists.length < 3) {
              if (safeOfflineDist?.generate) {
                try {
                  dists = safeOfflineDist.generate(
                    correctText,
                    validLocalDeck,
                    targetLang,
                    isReverse ? 'def' : 'term'
                  );
                } catch {
                  // Bỏ qua lỗi fallback distractor
                }
              }
            }

            const seenOpts = new Set([normalizeCompare(correctText)]);
            /** @type {any[]} */
            const wrongOpts = [];
            (Array.isArray(dists) ? dists : []).forEach((d) => {
              const txt =
                typeof d === 'object' && d !== null
                  ? String(d.text || '').trim()
                  : String(d || '').trim();
              const k = normalizeCompare(txt);
              if (!k || seenOpts.has(k) || wrongOpts.length >= 3) return;
              seenOpts.add(k);
              wrongOpts.push({
                text: txt,
                meaning: typeof d === 'object' && d !== null ? d.meaning : undefined,
                isCorrect: false
              });
            });

            while (wrongOpts.length < 3) {
              wrongOpts.push({
                text: `(Ngoại tuyến) Đáp án ${String.fromCharCode(65 + wrongOpts.length)}`,
                isCorrect: false
              });
            }

            baseCard.options = shuffleArray([
              ...wrongOpts,
              { text: correctText, isCorrect: true }
            ]);

            if (isImageQuiz) {
              baseCard.options = baseCard.options.map((/** @type {any} */ opt) => ({
                ...opt,
                image: buildOptionImageUrl(opt, baseCard, targetLang)
              }));
            }

            if (isMinigame) {
              rescuedData = {
                question: baseCard,
                term: baseCard.term,
                options: baseCard.options,
                origin: baseCard
              };
            } else {
              rescuedData = baseCard;
            }
          } else if (tType.includes('spot_mistake') || tType.includes('spotmistake')) {
            const isSent = detectSentence
              ? detectSentence(baseCard.term)
              : String(baseCard.term || '').includes(' ');
            /** @type {any} */
            let distorted = null;
            if (safeAlgo?.DistortionEngine?.offline_distort) {
              try {
                distorted = safeAlgo.DistortionEngine.offline_distort(
                  baseCard.term,
                  targetLang,
                  isSent ? 'sentence' : 'word'
                );
              } catch {
                // Bỏ qua lỗi biến dạng offline
              }
            }

            if (
              distorted &&
              distorted.wrongSentence &&
              distorted.wrongWord &&
              distorted.correction &&
              normalizeCompare(distorted.wrongSentence).includes(
                normalizeCompare(distorted.wrongWord)
              ) &&
              normalizeCompare(distorted.wrongWord) !== normalizeCompare(distorted.correction)
            ) {
              rescuedData = {
                ...baseCard,
                ...distorted,
                explanation:
                  distorted.explanation || 'Dữ liệu ngoại tuyến (Máy chủ AI quá tải).',
                origin: baseCard
              };
            } else {
              const safeDist = buildSafeOfflineDistortion(baseCard.term, targetLang);
              rescuedData = {
                ...baseCard,
                ...safeDist,
                origin: baseCard
              };
            }
          } else if (tType.includes('fill_blank') || tType.includes('fillblank')) {
            const isSent = detectSentence
              ? detectSentence(baseCard.term)
              : String(baseCard.term || '').includes(' ');
            /** @type {any} */
            let masked = null;
            if (safeAlgo?.ClozeEngine?.offline_mask) {
              try {
                masked = safeAlgo.ClozeEngine.offline_mask(
                  baseCard.term,
                  targetLang,
                  isSent ? 'sentence' : 'word',
                  validLocalDeck
                );
              } catch {
                // Bỏ qua lỗi đục lỗ offline
              }
            }

            const targetWord = String(masked?.targetWord || baseCard.term).trim();
            const displaySentence = applyClozeBlank(
              masked?.displaySentence || baseCard.term,
              targetWord
            );
            const distractors = ensureFillBlankDistractors(
              masked?.distractors,
              targetWord,
              targetLang,
              validLocalDeck
            );

            rescuedData = {
              ...baseCard,
              targetWord,
              displaySentence,
              hint: masked?.hint || baseCard.definition || 'Dữ liệu ngoại tuyến',
              distractors,
              origin: baseCard
            };
          } else if (tType.includes('odd_one_out') || tType.includes('oddoneout')) {
            /** @type {any} */
            let oddObj = null;
            if (validLocalDeck.length >= 4 && safeAlgo?.OddOneOutEngine?.offline_generate) {
              try {
                oddObj = safeAlgo.OddOneOutEngine.offline_generate(validLocalDeck, targetLang);
              } catch {
                // Bỏ qua lỗi odd_one_out offline
              }
            }
            if (
              oddObj &&
              Array.isArray(oddObj.words) &&
              oddObj.words.length >= 4 &&
              oddObj.oddWord
            ) {
              rescuedData = {
                ...oddObj,
                explanation: oddObj.explanation || 'Dữ liệu ngoại tuyến (Máy chủ AI quá tải).'
              };
            } else {
              rescuedData = pullStaticFallback();
            }
          } else if (tType.includes('scramble')) {
            const isZh = targetLang === 'zh';
            const isSent = detectSentence
              ? detectSentence(baseCard.term)
              : String(baseCard.term || '').includes(' ');
            const dataType = safeMeta.dataMode || (isSent ? 'sentence' : 'word');
            /** @param {any} p */
            const cleanToken = (p) => {
              let s = String(p || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
              if (!isZh) s = s.toLowerCase();
              return s;
            };

            const parts = (
              isZh || !isSent
                ? String(baseCard.term || '').split('')
                : String(baseCard.term || '').split(/\s+/)
            )
              .map(cleanToken)
              .filter(Boolean);

            /** @type {any[]} */
            let noiseWords = [];
            if (safeAlgo?.ScrambleNoiseEngine?.offline_getNoise) {
              try {
                noiseWords = safeAlgo.ScrambleNoiseEngine.offline_getNoise(
                  baseCard.term,
                  validLocalDeck,
                  targetLang,
                  dataType,
                  2
                );
              } catch {
                // Bỏ qua lỗi sinh nhiễu scramble offline
              }
            }

            if (Array.isArray(noiseWords) && noiseWords.length > 0) {
              /** @type {string[]} */
              const cleanedNoise = [];
              noiseWords.forEach((w) => {
                if (isZh || dataType === 'word') {
                  String(w || '')
                    .replace(/\s+/g, '')
                    .split('')
                    .forEach((ch) => {
                      const c = cleanToken(ch);
                      if (c) cleanedNoise.push(c);
                    });
                } else {
                  const c = cleanToken(w);
                  if (c) cleanedNoise.push(c);
                }
              });
              parts.push(...cleanedNoise.slice(0, 2));
            }

            baseCard.parts = shuffleArray(parts);
            rescuedData = isMinigame ? { origin: baseCard, parts: baseCard.parts } : baseCard;
          } else {
            rescuedData = baseCard;
          }
        } else {
          rescuedData = pullStaticFallback();
        }
      }

      // Chốt chặn cuối cùng chống sập UI (có đủ image cho image_quiz và khung Mini-game MCQ)
      if (!rescuedData) {
        const isFinalMCQ =
          tType.includes('multiple_choice') ||
          tType === 'ioe_match' ||
          isImageQuiz ||
          tType.includes('quiz');
        const isZh = targetLang === 'zh';

        /** @type {Record<string, any>} */
        const fallbackBase = {
          term: isZh ? '苹果' : 'Apple',
          definition: 'Quả táo',
          image_keyword: 'fresh red apple on white plate',
          options: /** @type {any[]} */ ([
            {
              text: isReverse ? (isZh ? '苹果' : 'Apple') : 'Quả táo',
              image_keyword: 'fresh red apple',
              isCorrect: true
            },
            {
              text: isReverse ? (isZh ? '香蕉' : 'Banana') : 'Quả chuối',
              image_keyword: 'yellow banana',
              isCorrect: false
            },
            {
              text: isReverse ? (isZh ? '猫' : 'Cat') : 'Con mèo',
              image_keyword: 'cute cat',
              isCorrect: false
            },
            {
              text: isReverse ? (isZh ? '狗' : 'Dog') : 'Con chó',
              image_keyword: 'friendly dog',
              isCorrect: false
            }
          ])
        };

        if (isImageQuiz) {
          fallbackBase.options = fallbackBase.options.map((/** @type {any} */ opt) => ({
            ...opt,
            image: buildOptionImageUrl(opt, fallbackBase, targetLang)
          }));
        }

        if (isMinigame && isFinalMCQ) {
          rescuedData = {
            question: fallbackBase,
            term: fallbackBase.term,
            options: fallbackBase.options,
            origin: fallbackBase
          };
        } else {
          rescuedData = fallbackBase;
        }
      }

      rescuedData.isAiGenerated = false;
      rescuedData._isRescued = true;

      return {
        id: id || 'rescue_' + Date.now(),
        harvestId: null,
        isNewHarvest: false,
        content: rescuedData,
        metadata: safeMeta,
        timestamp: Date.now()
      };
    } catch (e) {
      console.error('[EmergencyFallback] Động cơ cứu hộ sập toàn tập:', getErrorMessage(e));
      return null;
    }
  }
};

// Khóa chuẩn 5 Named Exports theo Mapping.md bằng wrapper an toàn (bảo toàn this & 0 lỗi tsc)
/** @param {...any} args */
export const hydrateQuestion = (...args) =>
  typeof ExamEngine.hydrateQuestion === 'function'
    ? /** @type {any} */ (ExamEngine).hydrateQuestion.apply(ExamEngine, args)
    : Promise.reject(new Error('ExamEngine.hydrateQuestion is unavailable'));

/** @param {...any} args */
export const getEmergencyFallback = (...args) =>
  typeof ExamEngine.getEmergencyFallback === 'function'
    ? /** @type {any} */ (ExamEngine).getEmergencyFallback.apply(ExamEngine, args)
    : null;

/** @param {...any} args */
export const clearVolatileMemory = (...args) =>
  typeof ExamEngine.clearVolatileMemory === 'function'
    ? /** @type {any} */ (ExamEngine).clearVolatileMemory.apply(ExamEngine, args)
    : undefined;

/** @param {...any} args */
export const _generateFallbackData = (...args) =>
  typeof /** @type {any} */ (ExamEngine)._generateFallbackData === 'function'
    ? /** @type {any} */ (ExamEngine)._generateFallbackData.apply(ExamEngine, args)
    : null;

/** @param {...any} args */
export const _normalizeForMinigame = (...args) =>
  typeof /** @type {any} */ (ExamEngine)._normalizeForMinigame === 'function'
    ? /** @type {any} */ (ExamEngine)._normalizeForMinigame.apply(ExamEngine, args)
    : Promise.resolve(null);

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).ExamEngine = ExamEngine;
}

export default ExamEngine;