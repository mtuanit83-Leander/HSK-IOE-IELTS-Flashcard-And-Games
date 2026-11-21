// ============================================================================
// FILE 26/85: src/engines/exam/index.js
// NGUỒN GỐC: Tầng 2 - Block 2.7d (The Core Hydrator V3.0)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 21/11/2026 - 17:29 (GMT+7)
// NHIỆM VỤ: Tổng công trình sư khảo thí hợp nhất ExamMemory, ExamFallback,
//           ExamNormalizer; điều phối nạp câu hỏi nguyên tử (hydrateQuestion)
//           và cứu hộ JIT 0ms (getEmergencyFallback) chuẩn hóa cho cả Mock Test
//           lẫn 10 Mini-Games (Vá Cloze Grammar HSK, Slice-safe 5+ Options,
//           Clone safeMeta 2 pha, Siết QA, Reading/match_hard & Clear Timers).
// ============================================================================

import { FcDB } from '../../services/db.js';
import { AiMemoryManager } from '../../utils/memoryManager.js';
import {
  safeJsonParse,
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

const normalizeCompare = (val) =>
  String(val || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const stripOptionLabelPrefix = (val) =>
  normalizeCompare(val).replace(/^(?:option\s+)?[a-d][\.\)\:\-]\s*/i, '').trim();

const escapeRegExp = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isVietnameseText = (text) => {
  const str = String(text || '').trim();
  if (!str) return false;
  return VI_DIACRITIC_REGEX.test(str) && !CJK_REGEX.test(str);
};

// Nội suy ngôn ngữ chuẩn 2 nhánh hệ thống ('en' | 'zh'), thanh trừng 'vi'
const resolveTargetLang = (metadata = {}) => {
  const rawMetaLang = String(metadata?.lang || metadata?.language || '')
    .replace(/"/g, '')
    .toLowerCase()
    .trim();
  if (rawMetaLang === 'zh' || rawMetaLang === 'cn') return 'zh';
  if (rawMetaLang === 'en') return 'en';

  const track = String(metadata?.track || '').toLowerCase().trim();
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
  } catch (e) {
    // Bỏ qua lỗi đọc localStorage ở chế độ ẩn danh
  }
  return 'en';
};

// Vắc-xin Đa nhiệm (Multi-select Array Armor) cho Level
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
const normalizeTopicList = (topic) => {
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

const resolveTopicForAi = (topic) => {
  const list = normalizeTopicList(topic);
  if (list.length === 0) {
    return String(topic || '').trim().toUpperCase() === 'ANY' ? 'ANY' : '';
  }
  return list.join(', ');
};

// Hợp nhất lịch sử chống lặp từ AiMemoryManager + passedHistory (từ useExamLogic / QuizGame)
const getMergedHistory = (passedHistory = []) => {
  const fromManager =
    AiMemoryManager && typeof AiMemoryManager.get === 'function' ? AiMemoryManager.get() : [];
  const merged = [];
  const seen = new Set();

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

// Ghi nhận Token an toàn tuyệt đối (chống QuotaExceededError & NaN)
const safeAddTotalTokens = (tokenUsage) => {
  if (!tokenUsage || typeof localStorage === 'undefined') return;
  const used = Number(tokenUsage.totalTokenCount || 0);
  if (!Number.isFinite(used) || used <= 0) return;
  try {
    const prevRaw = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
    const prevSafe = Number.isFinite(prevRaw) && prevRaw >= 0 ? prevRaw : 0;
    localStorage.setItem('fc_total_tokens', String(prevSafe + used));
  } catch (e) {
    console.warn('[ExamEngine] Không thể cập nhật fc_total_tokens:', e?.message || e);
  }
};

// Dựng URL ảnh sạch cho từng đáp án Image Quiz (ưu tiên buildSmartImageUrl, chặn từ khóa rác)
const buildOptionImageUrl = (opt, data, targetLang) => {
  if (opt && typeof opt.image === 'string' && /^https?:\/\//i.test(opt.image.trim())) {
    return opt.image.trim();
  }

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

  const fallbackQuery = query || String(opt?.text || data?.term || 'object').trim();
  return `https://tse4.mm.bing.net/th?q=${encodeURIComponent(
    `${fallbackQuery} isolated clipart`
  )}&w=300&h=300&c=7&rs=1&p=0`;
};

// Đục lỗ chuẩn hóa hỗ trợ cả Tiếng Anh lẫn Tiếng Trung (CJK) và không tạo đúp lỗ trống
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
  } catch (e) {
    // Rơi xuống khớp chuỗi thường
  }

  if (!replaced.includes('[__________]')) {
    try {
      const looseRegex = new RegExp(escaped, 'i');
      if (looseRegex.test(sentence)) {
        replaced = sentence.replace(looseRegex, '[__________]');
      }
    } catch (e) {
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
const ensureFillBlankDistractors = (rawDistractors, targetWord, targetLang, localDeck = []) => {
  const targetKey = normalizeCompare(targetWord);
  const seen = new Set(targetKey ? [targetKey] : []);
  const cleanList = [];

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
    let extra = [];
    if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
      try {
        extra = GameAlgoEngine.OptionsEngine.offline_generateOptions(
          targetWord,
          localDeck,
          targetLang,
          'word',
          5,
          true
        );
      } catch (e) {
        /* bỏ qua lỗi sinh nhiễu offline */
      }
    }
    if (Array.isArray(extra)) extra.forEach(pushCandidate);
  }

  if (cleanList.length < 3 && OfflineDistractorEngine?.generate && targetWord) {
    try {
      const extra2 = OfflineDistractorEngine.generate(targetWord, localDeck, targetLang, 'def');
      if (Array.isArray(extra2)) extra2.forEach(pushCandidate);
    } catch (e) {
      /* bỏ qua lỗi fallback distractor */
    }
  }

  const emergency = targetLang === 'zh' ? ['但是', '因为', '虽然'] : ['however', 'because', 'although'];
  for (let i = 0; i < emergency.length && cleanList.length < 3; i++) {
    pushCandidate(emergency[i]);
  }

  return cleanList.slice(0, 3);
};

// Thuật toán khớp đáp án 3 tầng cho câu hỏi con MCQ trong Tổ kén Đọc Hiểu
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
  const labelMatch = ansRaw.match(/^(?:option\s+)?([A-D])(?:[\.\)\:\-\s]|$)/i);
  if (labelMatch) {
    const letter = labelMatch[1].toUpperCase();
    const letterIdx = letter.charCodeAt(0) - 65;
    const explicitLabelIdx = options.findIndex((o) =>
      new RegExp(`^${letter}[\\.\\)\\:\\-]\\s*`, 'i').test(o)
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
const ensureMcqOrientation = (
  data,
  { targetLang, isReverse, isImageQuiz, isSentenceMode, isGrammarContext = false, localDeck = [] }
) => {
  if (!data || typeof data !== 'object') return data;

  const expectForeign = Boolean(isReverse || isImageQuiz);
  const foreignAnswer = isSentenceMode
    ? String(data.displaySentence || data.term || '').trim()
    : String(data.term || '').trim();
  const vietnameseAnswer = String(data.definition || '').trim();

  // Chuẩn hóa & khử trùng mảng options hiện có theo NFC
  const rawOptions = Array.isArray(data.options) ? data.options : [];
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
  const isForeignOptionText = (optText) => {
    const text = String(optText || '').trim();
    if (!text) return false;
    if (targetLang === 'zh') {
      return CJK_REGEX.test(text) && !VI_DIACRITIC_REGEX.test(text);
    }
    return !VI_DIACRITIC_REGEX.test(text) && !CJK_REGEX.test(text);
  };

  // [VER 1.1] Nhận diện Câu Điền Ngữ Pháp / Trắc nghiệm Ngữ pháp ngoại ngữ (Cloze Grammar MCQ)
  // Bảo toàn chiều đáp án ngoại ngữ cho câu HSK/IOE grammar_mcq có lỗ trống hoặc 4 đáp án ngắn cùng ngôn ngữ đích
  // mà KHÔNG làm mất lá chắn chống bug fc_quiz_config cho câu dịch nghĩa (vocab_mcq / sentence translation).
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
  let finalOptions = [];

  if (isWrongOrientation || normalizedOptions.length < 3) {
    // Giữ lại các đáp án nhiễu cùng chiều hợp lệ (khác đáp án đúng)
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
      let generatedDists = [];
      const dataType = isSentenceMode ? 'sentence' : 'word';
      if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
        try {
          generatedDists = GameAlgoEngine.OptionsEngine.offline_generateOptions(
            expectedCorrectText,
            localDeck,
            targetLang,
            dataType,
            needed + 2,
            expectForeign
          );
        } catch (e) {
          /* bỏ qua lỗi sinh nhiễu offline */
        }
      }

      if ((!generatedDists || generatedDists.length < needed) && OfflineDistractorEngine?.generate) {
        try {
          const more = OfflineDistractorEngine.generate(
            expectedCorrectText,
            localDeck,
            targetLang,
            expectForeign ? 'def' : 'term'
          );
          if (Array.isArray(more)) generatedDists = [...(generatedDists || []), ...more];
        } catch (e) {
          /* bỏ qua lỗi fallback distractor */
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
    // Cùng chiều & đủ >= 3 phương án: Đảm bảo duy nhất 1 đáp án isCorrect: true và không cắt bay đáp án đúng
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
const validateRawQuestionData = (data, rawType, isMinigame) => {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Dữ liệu câu hỏi bị rỗng hoặc không phải Object.' };
  }

  const tType = String(rawType || '').toLowerCase().trim();
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
      (p) => p && String(p.term || '').trim() && String(p.definition || '').trim()
    );
    if (validPairs.length < 2) {
      return { valid: false, reason: 'Ảo giác AI: Dữ liệu Nối ô (Match) có ít hơn 2 cặp hợp lệ.' };
    }
    // Đồng bộ dự phòng data.pairs -> data.items để examNormalizer.js đọc được
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
    const cleanOpts = data.options.filter((o) => o && String(o.text || '').trim() !== '');
    if (cleanOpts.length < 3) {
      return { valid: false, reason: "Ảo giác AI: Nhiều phương án trong 'options' bị trống chữ." };
    }
    const uniqueOptKeys = new Set(cleanOpts.map((o) => normalizeCompare(o.text)).filter(Boolean));
    if (uniqueOptKeys.size < 3) {
      return {
        valid: false,
        reason: "Ảo giác AI: Mảng 'options' bị trùng lặp, có ít hơn 3 phương án khác nhau."
      };
    }
    const correctCount = cleanOpts.filter(
      (o) => o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true'
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
    const uniqueWords = new Set(data.words.map((w) => normalizeCompare(w)).filter(Boolean));
    if (uniqueWords.size < 4) {
      return {
        valid: false,
        reason: "Ảo giác AI: Mảng 'words' có từ rỗng hoặc bị trùng lặp (cần đủ 4 từ khác nhau)."
      };
    }
    const oddNorm = normalizeCompare(data.oddWord);
    const matchedWord = data.words.find((w) => normalizeCompare(w) === oddNorm);
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

  _passageLocks: {},
  _passageLockTimers: {},

  // [VER 1.1] Ghi đè dọn dẹp RAM: Giải phóng triệt để _volatileMemory, _passageLocks & hủy toàn bộ timer 5 phút
  clearVolatileMemory: function () {
    const self = this || ExamEngine;
    if (ExamMemory && typeof ExamMemory.clearVolatileMemory === 'function') {
      ExamMemory.clearVolatileMemory.call(self);
    }
    self._volatileMemory = [];
    if (ExamMemory) ExamMemory._volatileMemory = [];

    if (self._passageLockTimers && typeof self._passageLockTimers === 'object') {
      Object.keys(self._passageLockTimers).forEach((k) => {
        if (self._passageLockTimers[k]) {
          clearTimeout(self._passageLockTimers[k]);
        }
      });
    }
    self._passageLockTimers = {};
    self._passageLocks = {};
    if (ExamMemory) ExamMemory._passageLocks = {};
  },

  // ============================================================================
  // 1. HYDRATION LOGIC (CỖ MÁY NẠP ĐẠN NGUYÊN TỬ TỐI THƯỢNG)
  // ============================================================================
  hydrateQuestion: async function (metadata, apiKey, passedHistory = []) {
    const self = this || ExamEngine;
    // [VER 1.1] Clone nông 2 pha: Không bao giờ làm bẩn metadata gốc nếu giữa chừng trượt QA / lỗi
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

    const tType = String(type || '').toLowerCase().trim();
    const isMinigame = mode === 'minigame' || !['ioe', 'ielts', 'hsk'].includes(track);
    const targetLang = resolveTargetLang(safeMeta);
    const effectiveTrack = targetLang === 'zh' ? 'hsk' : track || 'ioe';
    const levelList = normalizeLevelList(level, targetLang);
    const topicList = normalizeTopicList(topic);
    const aiTopic = resolveTopicForAi(topic);
    const safeTopicLabel = topicList.length > 0 ? topicList[0] : 'General';
    const mergedHistory = getMergedHistory(passedHistory);

    // [BẢN VÁ 2.9] TRẠM TRÍCH XUẤT NGỮ PHÁP & MÀNG LỌC TƯƠNG THÍCH NGƯỢC
    const extractGrammarPrompt = (metaId) => {
      const microPromptsRepo = IoeDataEngine?.MICRO_PROMPTS || MICRO_PROMPTS;
      if (!metaId || metaId === 'random' || !microPromptsRepo) return '';
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

    let generatedData = null;
    let isFromHarvestPool = false;
    let harvestId = null;
    let isNewHarvest = false;
    let ratio = 70;
    let harvestPool = {};
    let userHistory = [];

    // Nạp cấu hình Offline (Chỉ dành cho Mock Test - Đã gỡ lời gọi store không tồn tại fc_questions_bank)
    if (FcDB && !isMinigame) {
      try {
        const r = await FcDB.get('fc_exam_ratio');
        if (r !== undefined && r !== null && Number.isFinite(Number(r))) ratio = Number(r);
        const p = await FcDB.get('fc_exam_pool');
        if (p && typeof p === 'object') harvestPool = p;
        const h = await FcDB.get('fc_user_exam_history');
        if (Array.isArray(h)) userHistory = h;
      } catch (e) {
        console.warn('[ExamEngine] Lỗi đọc DB Lai:', e);
      }
    }

    // Tra cứu Kho đề Offline hỗ trợ đầy đủ Multi-select Array Armor cho level & topic
    const fetchFromOfflinePool = (targetType) => {
      const langBucket = harvestPool?.[targetLang];
      if (!langBucket || typeof langBucket !== 'object') return null;

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
      const available = candidateItems.filter((item) => item && !userHistory.includes(item.id));
      if (available.length === 0) return null;
      return available[Math.floor(Math.random() * available.length)];
    };

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
        let pData = null;
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
              (q) =>
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
              AiFactoryEngine && freshHistory.length > 0
                ? AiFactoryEngine.getHistoryPrompt(freshHistory)
                : '';
            historyPrompt = userGrammarConstraint + historyPrompt;

            const parsed = await AiFactoryEngine.forgeContext(
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
                  (q) =>
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

      let passagePromise;
      if (groupId) {
        if (!self._passageLocks[groupId]) {
          const createdPromise = loadOrForgePassage().catch((err) => {
            // Diệt triệt để Poisoned Promise Cache: Xóa khóa & hủy timer ngay lập tức khi lỗi
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
        // Gọi reading đơn lẻ (không kèm passageGroup): đúc trực tiếp, không lưu khóa 5 phút
        passagePromise = loadOrForgePassage();
      }

      try {
        const passageSet = await passagePromise;

        // Chế độ Mini-game Reading: Trả nguyên Tổ kén kèm đầy đủ harvestId & isNewHarvest
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

        // Chế độ Khảo thí: Tách từng câu hỏi con
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
        const subType = String(qData.type || 'mcq').toLowerCase().trim();
        safeMeta._originalType = originalType;
        safeMeta._subType = subType;

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
          if (!tempGeneratedData.options.some((o) => o.isCorrect)) {
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
          const mappedOptions = rawOpts.map((o, idx) => ({
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

        // [VER 1.1] Pha 2 của Clone safeMeta: Chỉ đồng bộ lại metadata gốc SAU KHI đã pass QA 100%
        // Bảo đảm tương thích ngược tuyệt đối với useExamLogic.js dòng 268 (qData.metadata = meta)
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
          e.message
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
        tType === IoeDataEngine?.QUESTION_TYPES?.IOE_MATCH;
      const isImageQuiz =
        tType.includes('image_quiz') ||
        tType.includes('imagequiz') ||
        tType === IoeDataEngine?.QUESTION_TYPES?.IOE_IMAGE_QUIZ;
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
          if (AiFactoryEngine && mergedHistory.length > 0) {
            finalHistoryPrompt = AiFactoryEngine.getHistoryPrompt(mergedHistory);
          }
          finalHistoryPrompt = userGrammarConstraint + finalHistoryPrompt;

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
            tempGeneratedData = await AiFactoryEngine.forgeBaseCard(
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

            let dists = [];
            const dataTypeArg = dataModeParam === 'sentence' ? 'sentence' : 'word';
            try {
              if (GameAlgoEngine?.OptionsEngine?.ai_generateOptions) {
                dists = await GameAlgoEngine.OptionsEngine.ai_generateOptions(
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
              console.warn('Nhịp 2 (Options AI) thất bại, fallback sang Offline:', aiErr.message);
            }

            if (!Array.isArray(dists) || dists.length < 3) {
              if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
                const baseTextForTrap = isReverse
                  ? tempGeneratedData.term
                  : tempGeneratedData.definition;
                dists = GameAlgoEngine.OptionsEngine.offline_generateOptions(
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

            // Truyền đủ 8 tham số tường minh (kể cả dataMode & isReverse)
            tempGeneratedData = await AiFactoryEngine.forgeContext(
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

            // Hậu kiểm & tự phục hồi chiều đáp án (bảo toàn Cloze Grammar HSK + phòng thủ bug fc_quiz_config)
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
              tType === IoeDataEngine?.QUESTION_TYPES?.IOE_SPOT_MISTAKE ||
              tType === 'ioe_spot_mistake' ||
              tType === 'spotmistake'
            ) {
              tempGeneratedData = await AiFactoryEngine.forgeContext(
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
              tType === IoeDataEngine?.QUESTION_TYPES?.IOE_FILL_BLANK ||
              tType === 'ioe_fill_blank' ||
              tType === 'fillblank'
            ) {
              // INJECTION ĐỘNG CƠ 3 MA TRẬN (Đã tháo gỡ mâu thuẫn gợi ý Paraphrasing với aiFactory.js)
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

              tempGeneratedData = await AiFactoryEngine.forgeContext(
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
              tType === IoeDataEngine?.QUESTION_TYPES?.IOE_SCRAMBLE ||
              tType === 'ioe_scramble' ||
              tType === 'scramble'
            ) {
              const scrambleMode = safeMeta.dataMode === 'vocab' ? 'vocab' : 'sentence';
              tempGeneratedData = await AiFactoryEngine.forgeBaseCard(
                level,
                targetLang,
                apiKey,
                aiTopic,
                finalHistoryPrompt,
                scrambleMode,
                false
              );
            } else if (
              tType === IoeDataEngine?.QUESTION_TYPES?.IOE_ODD_ONE_OUT ||
              tType === 'ioe_odd_one_out' ||
              tType === 'oddoneout'
            ) {
              tempGeneratedData = await AiFactoryEngine.forgeMatrix(
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
              tType === IoeDataEngine?.QUESTION_TYPES?.IOE_PRONUNCIATION ||
              tType === 'ioe_pronunciation' ||
              tType === 'pronunciation'
            ) {
              tempGeneratedData = await AiFactoryEngine.forgeMatrix(
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
              tType === IoeDataEngine?.QUESTION_TYPES?.IOE_LISTENING ||
              tType === 'ioe_listening' ||
              tType === 'listening'
            ) {
              tempGeneratedData = await AiFactoryEngine.forgeContext(
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
              tempGeneratedData = await AiFactoryEngine.forgeMatrix(
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
              tempGeneratedData = await AiFactoryEngine.forgeBaseCard(
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
          // Chạy TRƯỚC _syncMemory và TRƯỚC _normalizeForMinigame để không ghi đạn lỗi
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
            // [VER 1.1] Ánh xạ 'match_hard' -> 'match' để khớp nhánh xử lý correctPairs/trapPairs ở examNormalizer.js
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

            // Phòng thủ bug dead-code nhánh image_quiz trong examNormalizer.js
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
            `[ExamEngine] Lỗi đúc AI cho ${type}. Từ chối nạp đạn. Lỗi: ${error.message}`
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
  getEmergencyFallback: function (metadata, passedLocalDeck = null, passedIndex = null) {
    try {
      const self = this || ExamEngine;
      const safeMeta = metadata && typeof metadata === 'object' ? { ...metadata } : {};
      const { id, track, level, type, index, mode, passageGroup } = safeMeta;
      const isMinigame = mode === 'minigame' || !['ioe', 'ielts', 'hsk'].includes(track);
      const targetLang = resolveTargetLang(safeMeta);
      const effectiveTrack = targetLang === 'zh' ? 'hsk' : track || 'ioe';
      const tType = String(safeMeta.type || type || '').toLowerCase().trim();

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

        if (FallbackDataEngine?.getGameReadyFallback) {
          return FallbackDataEngine.getGameReadyFallback(
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
      // Tuyệt đối KHÔNG lấy 1 thẻ đơn từ validLocalDeck gây vỡ UI
      // ----------------------------------------------------------------------
      if (isContextSpecial) {
        rescuedData = pullStaticFallback();
      } else {
        // --------------------------------------------------------------------
        // LUỒNG B: ƯU TIÊN KHO THẺ CÁ NHÂN ("THẺ CỦA TÔI") KHI CÓ DỮ LIỆU
        // --------------------------------------------------------------------
        const rawLocalDeck = passedLocalDeck || safeJsonParse('fc_data_' + targetLang, []);
        const validLocalDeck = Array.isArray(rawLocalDeck)
          ? rawLocalDeck.filter((c) => c && typeof c.term === 'string' && c.term.trim() !== '')
          : [];

        if (isMatchMinigame) {
          // Mini-game Nối Ô: Dựng đúng khung { pairs, leftItems, rightItems } từ 2..5 thẻ thật
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
            // TUYỆT ĐỐI KHÔNG ghi đè baseCard.term bằng Tiếng Việt khi isReverse = true
            baseCard.questionText = isReverse ? safeDef : baseCard.term;

            const correctText = isReverse ? baseCard.term : safeDef;
            const dataType = isSentenceMode ? 'sentence' : 'word';
            let dists = [];

            if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
              try {
                dists = GameAlgoEngine.OptionsEngine.offline_generateOptions(
                  correctText,
                  validLocalDeck,
                  targetLang,
                  dataType,
                  3,
                  isReverse
                );
              } catch (e) {
                /* bỏ qua lỗi sinh nhiễu offline */
              }
            }

            if (!Array.isArray(dists) || dists.length < 3) {
              if (OfflineDistractorEngine?.generate) {
                try {
                  dists = OfflineDistractorEngine.generate(
                    correctText,
                    validLocalDeck,
                    targetLang,
                    isReverse ? 'def' : 'term'
                  );
                } catch (e) {
                  /* bỏ qua lỗi fallback distractor */
                }
              }
            }

            const seenOpts = new Set([normalizeCompare(correctText)]);
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
              baseCard.options = baseCard.options.map((opt) => ({
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
              : baseCard.term.includes(' ');
            let distorted = null;
            if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
              try {
                distorted = GameAlgoEngine.DistortionEngine.offline_distort(
                  baseCard.term,
                  targetLang,
                  isSent ? 'sentence' : 'word'
                );
              } catch (e) {
                /* bỏ qua lỗi biến dạng offline */
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
              : baseCard.term.includes(' ');
            let masked = null;
            if (GameAlgoEngine?.ClozeEngine?.offline_mask) {
              try {
                masked = GameAlgoEngine.ClozeEngine.offline_mask(
                  baseCard.term,
                  targetLang,
                  isSent ? 'sentence' : 'word',
                  validLocalDeck
                );
              } catch (e) {
                /* bỏ qua lỗi đục lỗ offline */
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
            let oddObj = null;
            if (validLocalDeck.length >= 4 && GameAlgoEngine?.OddOneOutEngine?.offline_generate) {
              try {
                oddObj = GameAlgoEngine.OddOneOutEngine.offline_generate(
                  validLocalDeck,
                  targetLang
                );
              } catch (e) {
                /* bỏ qua lỗi odd_one_out offline */
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
              : baseCard.term.includes(' ');
            const dataType = safeMeta.dataMode || (isSent ? 'sentence' : 'word');
            const cleanToken = (p) => {
              let s = String(p || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
              if (!isZh) s = s.toLowerCase();
              return s;
            };

            const parts = (isZh || !isSent ? baseCard.term.split('') : baseCard.term.split(/\s+/))
              .map(cleanToken)
              .filter(Boolean);

            let noiseWords = [];
            if (GameAlgoEngine?.ScrambleNoiseEngine?.offline_getNoise) {
              try {
                noiseWords = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(
                  baseCard.term,
                  validLocalDeck,
                  targetLang,
                  dataType,
                  2
                );
              } catch (e) {
                /* bỏ qua lỗi sinh nhiễu scramble offline */
              }
            }

            if (Array.isArray(noiseWords) && noiseWords.length > 0) {
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
          // Kho thẻ cá nhân rỗng 0 thẻ -> Kéo cáp tĩnh từ Engine
          rescuedData = pullStaticFallback();
        }
      }

      // [VER 1.1] Chốt chặn cuối cùng chống sập UI (có đủ image cho image_quiz và khung Mini-game MCQ)
      if (!rescuedData) {
        const isFinalMCQ =
          tType.includes('multiple_choice') ||
          tType === 'ioe_match' ||
          isImageQuiz ||
          tType.includes('quiz');
        const isZh = targetLang === 'zh';
        const fallbackBase = {
          term: isZh ? '苹果' : 'Apple',
          definition: 'Quả táo',
          image_keyword: 'fresh red apple on white plate',
          options: [
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
          ]
        };

        if (isImageQuiz) {
          fallbackBase.options = fallbackBase.options.map((opt) => ({
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
      console.error('[EmergencyFallback] Động cơ cứu hộ sập toàn tập:', e);
      return null;
    }
  }
};

// [VER 1.1] Khóa chuẩn 5 Named Exports theo NewMapping.md bằng arrow wrapper có guard an toàn
export const hydrateQuestion = (...args) =>
  typeof ExamEngine.hydrateQuestion === 'function'
    ? ExamEngine.hydrateQuestion(...args)
    : Promise.reject(new Error('ExamEngine.hydrateQuestion is unavailable'));

export const getEmergencyFallback = (...args) =>
  typeof ExamEngine.getEmergencyFallback === 'function'
    ? ExamEngine.getEmergencyFallback(...args)
    : null;

export const clearVolatileMemory = (...args) =>
  typeof ExamEngine.clearVolatileMemory === 'function'
    ? ExamEngine.clearVolatileMemory(...args)
    : undefined;

export const _generateFallbackData = (...args) =>
  typeof ExamEngine._generateFallbackData === 'function'
    ? ExamEngine._generateFallbackData(...args)
    : null;

export const _normalizeForMinigame = (...args) =>
  typeof ExamEngine._normalizeForMinigame === 'function'
    ? ExamEngine._normalizeForMinigame(...args)
    : Promise.resolve(null);

if (typeof window !== 'undefined') {
  window.ExamEngine = ExamEngine;
}

export default ExamEngine;