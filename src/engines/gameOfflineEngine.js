// ============================================================================
// FILE 18/85: src/engines/gameOfflineEngine.js
// NGUỒN GỐC: tang_2.js (Block 2.3B - Game Offline Engine & Facade V1.24)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 20/11/2026 - 19:42 (GMT+7)
// NHIỆM VỤ: Chuyên trách thuật toán Offline (Raw-String Signature Cache cho
//           Tổng kho Master Pool, Ma trận Trọng số chuẩn Array Armor 100%,
//           Trạm gác Độc bản 2 chiều chuẩn NFC, Escape Regex an toàn, chuẩn hóa
//           từ loại Anh/Việt/Trung cho OddOneOut) và Trạm định tuyến (Facade)
//           đồng bộ 100% Named Exports cho toàn bộ Mini-Games.
// ============================================================================


import { safeJsonParse, shuffleArray, detectSentence } from '../utils/helpers.js';
import { MICRO_PROMPTS } from './microPrompts.js';
import { GameAiEngine } from './gameAiEngine.js';


// ============================================================================
// HẰNG SỐ & HÀM PHỤ TRỢ NỘI BỘ (UNICODE NFC, ESCAPE REGEX, ARRAY ARMOR & CACHE)
// ============================================================================


const HANZI_REGEX = /[\u4e00-\u9fff]/;
const PURE_HANZI_REGEX = /^[\u4e00-\u9fff]+$/;
const EDGE_PUNCT_REGEX = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const VALID_CHAR_REGEX = /[\p{L}\p{N}]/u;


// Bộ nhớ đệm theo chữ ký chuỗi thô của localStorage (Zero-Stale, 0 JSON.parse khi chưa đổi)
const MASTER_POOL_CACHE = new Map();


// Nhãn hiển thị Tiếng Việt mặc định khi thẻ gốc chỉ ghi ký hiệu tắt
const POS_DISPLAY_LABELS = {
  noun: 'Danh từ',
  verb: 'Động từ',
  adj: 'Tính từ',
  adv: 'Trạng từ',
  pron: 'Đại từ',
  prep: 'Giới từ',
  conj: 'Liên từ',
  measure: 'Lượng từ'
};


/**
 * Chuẩn hóa chuỗi để so sánh độc bản chuẩn xác (Unicode NFC + gom khoảng trắng + thường hóa)
 * @param {any} str
 * @returns {string}
 */
const normalizeCompareKey = (str) => {
  if (str === null || str === undefined) return '';
  const compact = String(str).trim().replace(/\s+/g, ' ');
  const normalized = typeof compact.normalize === 'function' ? compact.normalize('NFC') : compact;
  return normalized.toLowerCase();
};


/**
 * Thoát toàn bộ ký tự đặc biệt Regex để chống SyntaxError (VD: "C++", "$100", "(approx)")
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


/**
 * Thay thế từ trong câu Tiếng Anh an toàn (không crash với ký tự đặc biệt Regex)
 * @param {string} sentence
 * @param {string} targetWord
 * @param {string} replacement
 * @returns {string}
 */
const safeReplaceWord = (sentence, targetWord, replacement) => {
  if (!sentence || !targetWord) return sentence;
  const escaped = escapeRegex(targetWord);
  const startBoundary = /^\w/.test(targetWord) ? '\\b' : '';
  const endBoundary = /\w$/.test(targetWord) ? '\\b' : '';
  try {
    return sentence.replace(new RegExp(`${startBoundary}${escaped}${endBoundary}`, 'i'), replacement);
  } catch {
    return sentence.replace(targetWord, replacement);
  }
};


/**
 * Nhận diện ngôn ngữ an toàn (chỉ vận hành 'en' | 'zh')
 * @param {string} lang
 * @param {string} sampleText
 * @returns {'en' | 'zh'}
 */
const resolveSafeLang = (lang, sampleText = '') => {
  const cleanLang = String(lang || '').trim().toLowerCase();
  if (cleanLang === 'zh' || cleanLang === 'en') return cleanLang;
  if (HANZI_REGEX.test(String(sampleText || ''))) return 'zh';
  return 'en';
};


/**
 * Hợp nhất Array Armor: chuyển đổi trường đa trị (topic, level dạng String hoặc Array)
 * thành tập hợp Set đã chuẩn hóa NFC
 * @param {string|string[]} value
 * @returns {Set<string>}
 */
const extractTokenSet = (value) => {
  const set = new Set();
  if (Array.isArray(value)) {
    value.forEach((item) => {
      const k = normalizeCompareKey(item);
      if (k) set.add(k);
    });
  } else if (typeof value === 'string' && value.trim()) {
    value.split(/[,;|]/).forEach((part) => {
      const k = normalizeCompareKey(part);
      if (k) set.add(k);
    });
  }
  return set;
};


/**
 * Kiểm tra 2 tập giá trị (topic hoặc level) có ít nhất 1 phần tử giao nhau
 * @param {Set<string>} originSet
 * @param {string|string[]} candidateValue
 * @returns {boolean}
 */
const hasSetIntersection = (originSet, candidateValue) => {
  if (!originSet || originSet.size === 0 || !candidateValue) return false;
  const candSet = extractTokenSet(candidateValue);
  for (const token of candSet) {
    if (originSet.has(token)) return true;
  }
  return false;
};


/**
 * Bảo toàn kiểu chữ hoa/thường khi thay thế 1 từ trong câu Tiếng Anh
 * @param {string} originalWord
 * @param {string} replacementWord
 * @returns {string}
 */
const matchEnglishCasing = (originalWord, replacementWord) => {
  if (!originalWord || !replacementWord) return replacementWord;
  const isAllCaps =
    originalWord.length > 1 &&
    originalWord === originalWord.toUpperCase() &&
    /[A-Z]/.test(originalWord);
  if (isAllCaps) return replacementWord.toUpperCase();
  if (/^[A-Z]/.test(originalWord)) {
    return replacementWord.charAt(0).toUpperCase() + replacementWord.slice(1);
  }
  return replacementWord;
};


/**
 * Chuẩn hóa từ loại (POS) hỗ trợ Anh / Việt / Trung, chống dính chuỗi con
 * ("adverb" != "verb", "pronoun" != "noun") và loại bỏ thẻ đa từ loại (VD: "n/v")
 * để tránh câu hỏi OddOneOut mơ hồ.
 * @param {string} rawPos
 * @returns {string}
 */
const normalizePartOfSpeech = (rawPos) => {
  const pos = normalizeCompareKey(rawPos);
  if (!pos) return '';


  const matched = new Set();


  // Xử lý riêng cụm '代名词' trước khi kiểm tra '名词' để không bị tính nhầm sang 'noun'
  const posForNounCheck = pos.replace(/代名词/g, '');


  // 1. Trạng từ / Phó từ (đặt tách biệt bằng ranh giới từ để không bị nuốt vào 'verb')
  if (
    pos.includes('trạng từ') ||
    pos.includes('phó từ') ||
    pos.includes('副词') ||
    /\badverb\b/.test(pos) ||
    /(?:^|[\s(,/;])adv\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('adv');
  }


  // 2. Đại từ (đặt tách biệt bằng ranh giới từ để không bị nuốt vào 'noun')
  if (
    pos.includes('đại từ') ||
    pos.includes('代词') ||
    pos.includes('代名词') ||
    /\bpronoun\b/.test(pos) ||
    /(?:^|[\s(,/;])pron\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('pron');
  }


  // 3. Danh từ
  if (
    posForNounCheck.includes('danh từ') ||
    posForNounCheck.includes('名词') ||
    /\bnoun\b/.test(posForNounCheck) ||
    /(?:^|[\s(,/;])n\.?(?:$|[\s),/;])/.test(posForNounCheck)
  ) {
    matched.add('noun');
  }


  // 4. Động từ
  if (
    pos.includes('động từ') ||
    pos.includes('动词') ||
    /\bverb\b/.test(pos) ||
    /(?:^|[\s(,/;])v[ti]?\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('verb');
  }


  // 5. Tính từ
  if (
    pos.includes('tính từ') ||
    pos.includes('形容词') ||
    /\badjective\b/.test(pos) ||
    /(?:^|[\s(,/;])adj\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('adj');
  }


  // 6. Giới từ
  if (
    pos.includes('giới từ') ||
    pos.includes('介词') ||
    /\bpreposition\b/.test(pos) ||
    /(?:^|[\s(,/;])prep\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('prep');
  }


  // 7. Liên từ
  if (
    pos.includes('liên từ') ||
    pos.includes('连词') ||
    /\bconjunction\b/.test(pos) ||
    /(?:^|[\s(,/;])conj\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('conj');
  }


  // 8. Lượng từ (đặc thù Tiếng Trung)
  if (
    pos.includes('lượng từ') ||
    pos.includes('量词') ||
    /\bmeasure\s*word\b/.test(pos) ||
    /\bclassifier\b/.test(pos) ||
    /(?:^|[\s(,/;])mw\.?(?:$|[\s),/;])/.test(pos)
  ) {
    matched.add('measure');
  }


  // Bỏ qua thẻ đa từ loại (VD: "n/v", "adj, adv") tránh sinh câu hỏi gây tranh cãi
  if (matched.size > 1) return '';
  if (matched.size === 1) return Array.from(matched)[0];


  // Nếu là nhãn từ loại tùy chỉnh đơn lẻ (không chứa dấu ngăn đa từ loại) thì giữ lại
  if (!/[,/;&]/.test(pos)) return pos;
  return '';
};


/**
 * Parse chuỗi JSON thô đã đọc từ localStorage (dùng safeJsonParse làm fallback an toàn)
 * @param {string} key
 * @param {string|null} raw
 * @param {any} fallback
 * @returns {any}
 */
const parseRawStorageValue = (key, raw, fallback) => {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch {
    return safeJsonParse(key, fallback);
  }
};


export const GameOfflineEngine = {
  // Helper nội bộ làm sạch từ vựng (chuẩn NFC)
  _cleanWord: (word) => {
    if (!word) return '';
    const cleaned = String(word).replace(/[^\p{L}\p{N}]/gu, '');
    return normalizeCompareKey(cleaned);
  },


  // Hút dữ liệu từ Tổng kho kèm Raw-String Signature Cache (Zero-Stale, tránh parse lặp lại)
  _getMasterPool: function (lang, modeHint = '') {
    const safeLang = resolveSafeLang(lang);
    const modesToRead =
      modeHint === 'sentence'
        ? ['sentence', 'vocab']
        : modeHint === 'word' || modeHint === 'vocab'
        ? ['vocab', 'sentence']
        : ['vocab', 'sentence'];


    const keyFlat = `fc_data_${safeLang}`;
    const keyMode0 = `fc_master_data_${safeLang}_${modesToRead[0]}`;
    const keyMode1 = `fc_master_data_${safeLang}_${modesToRead[1]}`;
    const cacheKey = `${safeLang}:${modesToRead[0]}`;


    const hasStorage = typeof localStorage !== 'undefined';
    let rawFlat = null;
    let rawMode0 = null;
    let rawMode1 = null;


    if (hasStorage) {
      try {
        rawFlat = localStorage.getItem(keyFlat);
        rawMode0 = localStorage.getItem(keyMode0);
        rawMode1 = localStorage.getItem(keyMode1);


        const cached = MASTER_POOL_CACHE.get(cacheKey);
        if (
          cached &&
          cached.rawFlat === rawFlat &&
          cached.rawMode0 === rawMode0 &&
          cached.rawMode1 === rawMode1
        ) {
          // Trả bản sao nông để bảo vệ bộ đệm khỏi các thao tác mutate bên ngoài
          return cached.data.slice();
        }
      } catch (e) {
        console.warn('[GameOfflineEngine] Lỗi kiểm tra Signature Cache:', e);
      }
    }


    const dedupMap = new Map();
    const pushCards = (list) => {
      if (!Array.isArray(list)) return;
      for (const card of list) {
        if (!card || typeof card !== 'object' || !card.term) continue;
        const termKey = normalizeCompareKey(card.term);
        if (termKey && !dedupMap.has(termKey)) {
          dedupMap.set(termKey, card);
        }
      }
    };


    try {
      const currentFlat = hasStorage
        ? parseRawStorageValue(keyFlat, rawFlat, [])
        : safeJsonParse(keyFlat, []);
      pushCards(currentFlat);
    } catch (e) {
      console.warn('[GameOfflineEngine] Lỗi đọc fc_data Master Pool:', e);
    }


    const masterPairs = [
      { key: keyMode0, raw: rawMode0 },
      { key: keyMode1, raw: rawMode1 }
    ];
    for (const entry of masterPairs) {
      try {
        const masterObj = hasStorage
          ? parseRawStorageValue(entry.key, entry.raw, null)
          : safeJsonParse(entry.key, null);
        if (masterObj && typeof masterObj === 'object' && !Array.isArray(masterObj)) {
          Object.values(masterObj).forEach((levelCards) => {
            if (Array.isArray(levelCards)) pushCards(levelCards);
          });
        }
      } catch (e) {
        console.warn(`[GameOfflineEngine] Lỗi đọc ${entry.key}:`, e);
      }
    }


    const result = Array.from(dedupMap.values());
    if (hasStorage) {
      MASTER_POOL_CACHE.set(cacheKey, {
        rawFlat,
        rawMode0,
        rawMode1,
        data: result
      });
    }


    return result.slice();
  },


  // ============================================================================
  // 0. BỘ ĐỊNH TUYẾN NGỮ PHÁP (Offline Grammar Smart Router)
  // ============================================================================
  offline_getGrammarMicroPrompt: function (card, gameType) {
    if (!MICRO_PROMPTS || !card) return '';
    let gTypes = card.grammar_type;
    if (!gTypes) return '';
    if (typeof gTypes === 'string') {
      gTypes = gTypes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(gTypes) || gTypes.length === 0) return '';


    const gamePrompts = MICRO_PROMPTS[gameType];
    if (!gamePrompts) return '';


    const validTypes = gTypes.filter((t) => gamePrompts[t]);
    if (validTypes.length === 0) return '';


    const targetType = validTypes[Math.floor(Math.random() * validTypes.length)];
    const selected = gamePrompts[targetType];
    return typeof selected === 'object' ? selected.prompt || '' : String(selected || '');
  },


  // ============================================================================
  // 1. THUẬT TOÁN BÓP MÉO NGOẠI TUYẾN (Offline Distortion)
  // ============================================================================
  offline_distort: function (text, lang, type) {
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return {
        wrongSentence: '',
        wrongWord: '',
        correction: '',
        explanation: 'Lỗi dữ liệu đầu vào rỗng.'
      };
    }


    const safeLang = resolveSafeLang(lang, cleanText);


    if (type === 'word') {
      if (safeLang === 'zh') {
        const arr = Array.from(cleanText);
        const validIndices = arr
          .map((char, i) => (HANZI_REGEX.test(char) ? i : -1))
          .filter((i) => i !== -1);
        if (validIndices.length > 0) {
          const idx = validIndices[Math.floor(Math.random() * validIndices.length)];
          const fallbackWrongs = ['的', '了', '吗', '吧', '啊', '在', '是', '不', '没'].filter(
            (ch) => ch !== arr[idx]
          );
          const wrongChar = fallbackWrongs[Math.floor(Math.random() * fallbackWrongs.length)] || '没';
          arr[idx] = wrongChar;
          return { wrongWord: arr.join(''), explanation: 'Lỗi dùng sai chữ Hán.' };
        }
        return { wrongWord: cleanText + '的', explanation: 'Lỗi thêm chữ thừa.' };
      }


      // Nhánh Tiếng Anh: các quy tắc bóp méo hình thái phổ biến (không dùng cờ /g tránh lastIndex)
      const enSwaps = [
        { p: /ss/, r: 's', exp: 'Lỗi thiếu phụ âm kép.' },
        { p: /ll/, r: 'l', exp: 'Lỗi thiếu phụ âm kép.' },
        { p: /mm/, r: 'm', exp: 'Lỗi thiếu phụ âm kép.' },
        { p: /nn/, r: 'n', exp: 'Lỗi thiếu phụ âm kép.' },
        { p: /pp/, r: 'p', exp: 'Lỗi thiếu phụ âm kép.' },
        { p: /ie/, r: 'ei', exp: 'Lỗi đảo nguyên âm (ie/ei).' },
        { p: /ei/, r: 'ie', exp: 'Lỗi đảo nguyên âm (ie/ei).' },
        { p: /tion\b/, r: 'sion', exp: 'Lỗi sai hậu tố (tion/sion).' },
        { p: /sion\b/, r: 'tion', exp: 'Lỗi sai hậu tố (sion/tion).' },
        { p: /ent\b/, r: 'ant', exp: 'Lỗi sai hậu tố (ent/ant).' },
        { p: /ant\b/, r: 'ent', exp: 'Lỗi sai hậu tố (ant/ent).' },
        { p: /ce\b/, r: 'se', exp: 'Lỗi nhầm lẫn c/s ở cuối từ.' },
        { p: /se\b/, r: 'ce', exp: 'Lỗi nhầm lẫn c/s ở cuối từ.' }
      ];
      const shuffledEn = shuffleArray(enSwaps);
      for (const rule of shuffledEn) {
        if (rule.p.test(cleanText)) {
          const mutated = cleanText.replace(rule.p, rule.r);
          if (mutated !== cleanText) {
            return { wrongWord: mutated, explanation: rule.exp };
          }
        }
      }


      // Đảo 2 ký tự liền kề KHÁC NHAU (tránh đảo 'oo' thành 'oo')
      const arr = Array.from(cleanText);
      if (arr.length >= 4) {
        const swapCandidates = [];
        for (let i = 1; i <= arr.length - 3; i++) {
          if (arr[i] !== arr[i + 1] && arr[i] !== ' ' && arr[i + 1] !== ' ') {
            swapCandidates.push(i);
          }
        }
        if (swapCandidates.length > 0) {
          const idx = swapCandidates[Math.floor(Math.random() * swapCandidates.length)];
          const temp = arr[idx];
          arr[idx] = arr[idx + 1];
          arr[idx + 1] = temp;
          return { wrongWord: arr.join(''), explanation: 'Lỗi đảo chữ (Typo).' };
        }
      }


      // [VER 1.1] Bảo toàn chữ viết hoa toàn bộ (VD: "BUS" -> "BUSES", "CAT" -> "CATS")
      const isAllCaps =
        cleanText.length > 1 && cleanText === cleanText.toUpperCase() && /[A-Z]/.test(cleanText);
      const endsWithS = cleanText.toLowerCase().endsWith('s');
      const suffix = endsWithS ? (isAllCaps ? 'ES' : 'es') : isAllCaps ? 'S' : 's';


      return {
        wrongWord: cleanText + suffix,
        explanation: 'Lỗi hình thái từ.'
      };
    }


    // NHÁNH CÂU VĂN TIẾNG TRUNG
    if (safeLang === 'zh') {
      const replacements = [
        { wrong: '得', correct: '的', exp: 'Dùng sai trợ từ kết cấu (的/得/地).' },
        { wrong: '地', correct: '得', exp: 'Dùng sai trợ từ kết cấu (的/得/地).' },
        { wrong: '的', correct: '地', exp: 'Dùng sai trợ từ kết cấu (的/得/地).' },
        { wrong: '没', correct: '不', exp: 'Dùng sai phó từ phủ định (不/没).' },
        { wrong: '不', correct: '没', exp: 'Dùng sai phó từ phủ định (不/没).' },
        { wrong: '她', correct: '他', exp: 'Dùng sai đại từ nhân xưng.' },
        { wrong: '他', correct: '她', exp: 'Dùng sai đại từ nhân xưng.' },
        { wrong: '是', correct: '在', exp: 'Dùng sai động từ/giới từ.' },
        { wrong: '在', correct: '是', exp: 'Dùng sai động từ/giới từ.' },
        { wrong: '过', correct: '了', exp: 'Dùng sai trợ từ động thái.' },
        { wrong: '了', correct: '过', exp: 'Dùng sai trợ từ động thái.' }
      ];
      const shuffledRules = shuffleArray(replacements);
      for (const rule of shuffledRules) {
        if (cleanText.includes(rule.correct)) {
          return {
            wrongSentence: cleanText.replace(rule.correct, rule.wrong),
            wrongWord: rule.wrong,
            correction: rule.correct,
            explanation: rule.exp
          };
        }
      }


      const arr = Array.from(cleanText);
      const validIndices = arr
        .map((char, i) => (HANZI_REGEX.test(char) ? i : -1))
        .filter((i) => i !== -1);
      if (validIndices.length > 0) {
        const idx = validIndices[Math.floor(Math.random() * validIndices.length)];
        const correctChar = arr[idx];
        const fallbackWrongs = ['的', '了', '吗', '吧', '啊', '在', '是', '不', '没'].filter(
          (ch) => ch !== correctChar
        );
        const wrongChar = fallbackWrongs[Math.floor(Math.random() * fallbackWrongs.length)] || '没';
        arr[idx] = wrongChar;
        return {
          wrongSentence: arr.join(''),
          wrongWord: wrongChar,
          correction: correctChar,
          explanation: 'Lỗi dùng sai từ vựng tiếng Trung.'
        };
      }
      return {
        wrongSentence: cleanText + '的',
        wrongWord: '的',
        correction: '',
        explanation: 'Lỗi thêm chữ thừa.'
      };
    }


    // NHÁNH CÂU VĂN TIẾNG ANH
    const replacements = [
      {
        regex: /\b(an)\b(?=\s+[aeiou])/i,
        wrong: 'a',
        correct: 'an',
        exp: "Đứng trước nguyên âm (a,e,i,o,u) phải dùng mạo từ 'an'."
      },
      {
        regex: /\b(a)\b(?=\s+[bcdfghjklmnpqrstvwxyz])/i,
        wrong: 'an',
        correct: 'a',
        exp: "Đứng trước phụ âm phải dùng mạo từ 'a'."
      },
      { regex: /\b(is)\b/i, wrong: 'are', correct: 'is', exp: "Chủ ngữ số ít đi với 'is'." },
      { regex: /\b(are)\b/i, wrong: 'is', correct: 'are', exp: "Chủ ngữ số nhiều đi với 'are'." },
      { regex: /\b(was)\b/i, wrong: 'were', correct: 'was', exp: "Quá khứ số ít dùng 'was'." },
      { regex: /\b(were)\b/i, wrong: 'was', correct: 'were', exp: "Quá khứ số nhiều dùng 'were'." },
      {
        regex: /\b(he)\b/i,
        wrong: 'him',
        correct: 'he',
        exp: 'Cần dùng Đại từ nhân xưng làm chủ ngữ, không dùng Tân ngữ.'
      },
      {
        regex: /\b(she)\b/i,
        wrong: 'her',
        correct: 'she',
        exp: 'Cần dùng Đại từ nhân xưng làm chủ ngữ, không dùng Tân ngữ.'
      },
      { regex: /\b(in)\b/i, wrong: 'on', correct: 'in', exp: 'Sai giới từ (In/On/At).' },
      { regex: /\b(on)\b/i, wrong: 'in', correct: 'on', exp: 'Sai giới từ (In/On/At).' },
      { regex: /\b(at)\b/i, wrong: 'in', correct: 'at', exp: 'Sai giới từ (In/On/At).' },
      {
        regex: /\b(because)\b/i,
        wrong: 'so',
        correct: 'because',
        exp: 'Sai từ nối chỉ nguyên nhân - kết quả.'
      },
      {
        regex: /\b(but)\b/i,
        wrong: 'and',
        correct: 'but',
        exp: 'Sai từ nối mang nghĩa tương phản.'
      },
      {
        regex: /\b(can)\b/i,
        wrong: 'can to',
        correct: 'can',
        exp: "Sau động từ khuyết thiếu (can, should...) dùng động từ nguyên thể không 'to'."
      },
      {
        regex: /\b(must)\b/i,
        wrong: 'must to',
        correct: 'must',
        exp: "Sau động từ khuyết thiếu dùng nguyên thể không 'to'."
      },
      {
        regex: /\b(has)\b/i,
        wrong: 'have',
        correct: 'has',
        exp: "Sự hòa hợp chủ vị với 'have/has'."
      },
      {
        regex: /\b(have)\b/i,
        wrong: 'has',
        correct: 'have',
        exp: "Sự hòa hợp chủ vị với 'have/has'."
      },
      {
        regex: /\b(good)\b/i,
        wrong: 'well',
        correct: 'good',
        exp: 'Dùng sai từ loại (Tính từ vs Trạng từ).'
      },
      {
        regex: /\b(well)\b/i,
        wrong: 'good',
        correct: 'well',
        exp: 'Dùng sai từ loại (Trạng từ bổ nghĩa cho động từ).'
      },
      {
        regex: /\b(make)\b/i,
        wrong: 'do',
        correct: 'make',
        exp: 'Sai cụm từ cố định (Collocation).'
      }
    ];


    const shuffledRules = shuffleArray(replacements);
    for (const rule of shuffledRules) {
      const match = cleanText.match(rule.regex);
      if (match) {
        const originalWord = match[0];
        const finalWrong = matchEnglishCasing(originalWord, rule.wrong);
        const finalCorrect = matchEnglishCasing(originalWord, rule.correct);
        return {
          wrongSentence: cleanText.replace(rule.regex, finalWrong),
          wrongWord: finalWrong,
          correction: finalCorrect,
          explanation: rule.exp
        };
      }
    }


    const words = cleanText.split(/\s+/);
    let validIndices = words
      .map((w, i) => (w.replace(EDGE_PUNCT_REGEX, '').length > 4 ? i : -1))
      .filter((i) => i !== -1);


    if (validIndices.length === 0) {
      validIndices = words
        .map((w, i) => (w.replace(EDGE_PUNCT_REGEX, '').length >= 2 ? i : -1))
        .filter((i) => i !== -1);
    }


    if (validIndices.length > 0) {
      const targetIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
      const rawToken = words[targetIdx];
      const correction = rawToken.replace(EDGE_PUNCT_REGEX, '');
      if (correction) {
        const isAllCaps =
          correction.length > 1 && correction === correction.toUpperCase() && /[A-Z]/.test(correction);
        const endsWithS = correction.toLowerCase().endsWith('s');
        const suffix = endsWithS ? (isAllCaps ? 'ES' : 'es') : isAllCaps ? 'S' : 's';
        const wrongWord = correction + suffix;
        const mutatedWords = [...words];
        mutatedWords[targetIdx] = rawToken.replace(correction, wrongWord);
        return {
          wrongSentence: mutatedWords.join(' '),
          wrongWord,
          correction,
          explanation: 'Lỗi số ít/số nhiều hoặc hình thái từ.'
        };
      }
    }


    // [VER 1.1] Fallback cuối cùng luôn biến đổi đúng 1 token thay vì cả câu (tránh lỗi SpotMistake)
    const lastIdx = words.length - 1;
    const rawLast = words[lastIdx] || cleanText;
    const lastCore = rawLast.replace(EDGE_PUNCT_REGEX, '') || rawLast;
    const isLastAllCaps =
      lastCore.length > 1 && lastCore === lastCore.toUpperCase() && /[A-Z]/.test(lastCore);
    const fallbackWrongWord = lastCore + (isLastAllCaps ? 'S' : 's');
    const mutatedFallbackWords = [...words];
    mutatedFallbackWords[lastIdx] = rawLast.replace(lastCore, fallbackWrongWord);


    return {
      wrongSentence: mutatedFallbackWords.join(' '),
      wrongWord: fallbackWrongWord,
      correction: lastCore,
      explanation: 'Lỗi hình thái từ trong câu.'
    };
  },


  // ============================================================================
  // 2. THUẬT TOÁN TẠO ĐÁP ÁN NHIỄU TỔNG KHO (Universal Master Pool Scoring)
  // ============================================================================
  offline_generateOptions: function (
    correctText,
    deck = [],
    lang,
    type,
    count = 3,
    isReverse = false,
    isHard = false
  ) {
    const cleanCorrectText = String(correctText || '').trim();
    if (!cleanCorrectText) return [];


    const safeCount = Math.max(1, Number(count) || 3);
    const safeLang = resolveSafeLang(lang, isReverse ? cleanCorrectText : '');
    const targetKey = normalizeCompareKey(cleanCorrectText);


    // [BƯỚC 1: TRÍCH XUẤT TỔNG KHO & TÌM THẺ GỐC MỎ NEO TRÊN CẢ DECK + MASTER POOL]
    const safeDeck = Array.isArray(deck) ? deck : [];
    const masterPool = GameOfflineEngine._getMasterPool(safeLang, type);
    const allCards = [...safeDeck, ...masterPool];


    const baseCard =
      allCards.find((c) => {
        if (!c || typeof c !== 'object') return false;
        if (isReverse) {
          return (
            normalizeCompareKey(c.term) === targetKey ||
            normalizeCompareKey(c.displaySentence) === targetKey
          );
        }
        return normalizeCompareKey(c.definition) === targetKey;
      }) || {};


    // TRẠM GÁC ĐỘC BẢN 2 CHIỀU CHUẨN UNICODE NFC (2D Uniqueness Filter)
    const textSet = new Set();
    const meaningSet = new Set();


    // Luôn khóa đáp án đúng hiện tại dù có tìm thấy baseCard hay không
    if (isReverse) {
      textSet.add(targetKey);
    } else {
      meaningSet.add(targetKey);
    }
    if (baseCard.term) textSet.add(normalizeCompareKey(baseCard.term));
    if (baseCard.displaySentence) textSet.add(normalizeCompareKey(baseCard.displaySentence));
    if (baseCard.definition) meaningSet.add(normalizeCompareKey(baseCard.definition));


    const finalDistractors = [];
    // [VER 1.1] Array Armor 100% cho cả topic và level
    const originTopicSet = extractTokenSet(baseCard.topic);
    const originLevelSet = extractTokenSet(baseCard.level);
    const originPOS = normalizePartOfSpeech(baseCard.partOfSpeech);
    const baseTermKey = normalizeCompareKey(baseCard.term);


    const getVal = (c) => {
      const val = isReverse ? c.term : c.definition;
      return val !== null && val !== undefined ? String(val).trim() : '';
    };


    const combinedMap = new Map();
    for (const c of allCards) {
      if (!c || !c.term) continue;
      const cVal = getVal(c);
      const cValKey = normalizeCompareKey(cVal);
      const cTermKey = normalizeCompareKey(c.term);
      if (!cValKey || cValKey === targetKey) continue;
      if (baseTermKey && cTermKey === baseTermKey) continue;
      if (!combinedMap.has(cValKey)) {
        combinedMap.set(cValKey, c);
      }
    }
    const combinedPool = Array.from(combinedMap.values());


    // Helper đẩy ứng viên an toàn qua Trạm gác 2 chiều
    const pushThroughGatekeeper = (candidates) => {
      for (const item of candidates) {
        if (finalDistractors.length >= safeCount) break;
        if (!item || !item.val) continue;
        const cTermKey = normalizeCompareKey(item.card?.term);
        const cDefKey = normalizeCompareKey(item.card?.definition);
        const valKey = normalizeCompareKey(item.val);


        if ((cTermKey && textSet.has(cTermKey)) || (cDefKey && meaningSet.has(cDefKey))) {
          continue;
        }
        if ((isReverse && textSet.has(valKey)) || (!isReverse && meaningSet.has(valKey))) {
          continue;
        }


        if (cTermKey) textSet.add(cTermKey);
        if (cDefKey) meaningSet.add(cDefKey);
        if (isReverse) textSet.add(valKey);
        else meaningSet.add(valKey);


        finalDistractors.push(item.val);
      }
    };


    if (type === 'sentence') {
      // [LOGIC CHO CÂU VĂN]
      const sentencePool = combinedPool.filter((c) => detectSentence(c.term));
      const nonSentencePool = combinedPool.filter((c) => !detectSentence(c.term));


      if (!isReverse) {
        // Chiều xuôi: Hỏi Câu Ngoại ngữ -> Chọn Nghĩa Câu Tiếng Việt (ưu tiên câu văn trước)
        const scoreSentenceItems = (pool) =>
          pool
            .map((c) => {
              let score = 0;
              if (hasSetIntersection(originTopicSet, c.topic)) score += 2;
              if (hasSetIntersection(originLevelSet, c.level)) score += 1;
              const val = getVal(c);
              const diff = Math.abs(val.length - cleanCorrectText.length);
              if (diff <= 15) score += 1;
              return { card: c, score, val };
            })
            .filter((item) => item.val)
            .sort((a, b) => b.score - a.score);


        pushThroughGatekeeper(shuffleArray(scoreSentenceItems(sentencePool).slice(0, 30)));


        // [VER 1.1] Chỉ mượn thẻ từ nonSentencePool có nghĩa đủ dài tương đương câu, tránh lộ bẫy từ đơn ngắn
        if (finalDistractors.length < safeCount && nonSentencePool.length > 0) {
          const minSentenceMeaningLen = Math.max(12, Math.floor(cleanCorrectText.length * 0.5));
          const longMeaningPool = nonSentencePool.filter((c) => {
            const val = getVal(c);
            return val.split(/\s+/).length >= 4 || val.length >= minSentenceMeaningLen;
          });
          if (longMeaningPool.length > 0) {
            pushThroughGatekeeper(shuffleArray(scoreSentenceItems(longMeaningPool).slice(0, 20)));
          }
        }
      } else {
        // Chiều ngược: Hỏi Nghĩa Tiếng Việt -> Chọn Câu Ngoại Ngữ
        if (isHard && GameOfflineEngine.offline_distort) {
          const distorted = GameOfflineEngine.offline_distort(cleanCorrectText, safeLang, type);
          const trap1 = String(distorted?.wrongSentence || '').trim();
          const trapKey = normalizeCompareKey(trap1);
          if (trap1 && trapKey !== targetKey && !textSet.has(trapKey)) {
            textSet.add(trapKey);
            finalDistractors.push(trap1);
          }
        }


        // Bẫy thay thế 1 từ trong câu bằng từ vựng khác cùng hệ chữ (đã escape Regex & bảo toàn chữ Hoa)
        const isChinese = safeLang === 'zh';
        const rawWords = isChinese
          ? Array.from(cleanCorrectText).filter((ch) => HANZI_REGEX.test(ch))
          : cleanCorrectText
              .split(/\s+/)
              .map((w) => w.replace(EDGE_PUNCT_REGEX, ''))
              .filter(Boolean);
        const minLen = isChinese ? 1 : 4;
        const validWords = rawWords.filter((w) => w.length >= minLen);


        if (validWords.length > 0 && nonSentencePool.length > 0) {
          const kw = validWords[Math.floor(Math.random() * validWords.length)];
          // [VER 1.1] Lọc đúng hệ ngôn ngữ (chặn nhét từ Tiếng Anh vào câu Tiếng Trung và ngược lại)
          const langMatchedWords = nonSentencePool.filter((c) => {
            if (!c.term) return false;
            return isChinese ? HANZI_REGEX.test(c.term) : !HANZI_REGEX.test(c.term);
          });
          let poolFilter =
            originTopicSet.size > 0
              ? langMatchedWords.filter((c) => hasSetIntersection(originTopicSet, c.topic))
              : langMatchedWords;
          if (poolFilter.length === 0) poolFilter = langMatchedWords;


          const kwKey = normalizeCompareKey(kw);
          const swapCandidates = poolFilter.filter(
            (c) => c.term && normalizeCompareKey(c.term) !== kwKey
          );


          if (swapCandidates.length > 0) {
            const rawSwapWord = String(
              swapCandidates[Math.floor(Math.random() * swapCandidates.length)].term || ''
            ).trim();
            if (rawSwapWord) {
              const adjustedSwap = isChinese
                ? rawSwapWord
                : matchEnglishCasing(kw, rawSwapWord);
              const newSentence = isChinese
                ? cleanCorrectText.replace(kw, adjustedSwap)
                : safeReplaceWord(cleanCorrectText, kw, adjustedSwap);
              const newSentenceKey = normalizeCompareKey(newSentence);
              if (
                newSentence &&
                newSentenceKey !== targetKey &&
                !textSet.has(newSentenceKey)
              ) {
                textSet.add(newSentenceKey);
                finalDistractors.push(newSentence.trim());
              }
            }
          }
        }


        const scoredSentences = sentencePool
          .map((c) => {
            let score = 0;
            if (hasSetIntersection(originTopicSet, c.topic)) score += 2;
            if (hasSetIntersection(originLevelSet, c.level)) score += 1;
            return { card: c, score, val: getVal(c) };
          })
          .filter((item) => item.val)
          .sort((a, b) => b.score - a.score);


        pushThroughGatekeeper(shuffleArray(scoredSentences.slice(0, 30)));
      }
    } else {
      // [BƯỚC 2: CỖ MÁY CHẤM ĐIỂM TRỌNG SỐ CHO TỪ VỰNG]
      // Ưu tiên tuyệt đối thẻ từ vựng (!detectSentence), chỉ mở rộng sang câu nếu kho quá ít
      const vocabPool = combinedPool.filter((c) => !detectSentence(c.term));
      const overflowPool = combinedPool.filter((c) => detectSentence(c.term));


      const scoreVocabItems = (pool) =>
        pool
          .map((c) => {
            let score = 0;
            const cPos = normalizePartOfSpeech(c.partOfSpeech);
            // +3 Điểm: Khớp Từ loại chuẩn hóa
            if (originPOS && cPos === originPOS) score += 3;
            // +2 Điểm: Khớp Chủ đề (hỗ trợ đa chủ đề)
            if (hasSetIntersection(originTopicSet, c.topic)) score += 2;
            // +1 Điểm: Khớp Cấp độ (hỗ trợ đa cấp độ)
            if (hasSetIntersection(originLevelSet, c.level)) score += 1;


            // Điểm cộng phụ chống lệch hình thể
            const cVal = getVal(c);
            if (cVal && Math.abs(cVal.length - cleanCorrectText.length) <= 2) score += 0.5;
            if (
              cVal &&
              normalizeCompareKey(cVal.charAt(0)) === normalizeCompareKey(cleanCorrectText.charAt(0))
            ) {
              score += 0.5;
            }
            return { card: c, score, val: cVal };
          })
          .filter((item) => item.val)
          .sort((a, b) => b.score - a.score);


      pushThroughGatekeeper(shuffleArray(scoreVocabItems(vocabPool).slice(0, 30)));


      if (finalDistractors.length < safeCount && overflowPool.length > 0) {
        pushThroughGatekeeper(shuffleArray(scoreVocabItems(overflowPool).slice(0, 15)));
      }
    }


    // [BƯỚC 6: CHỐT CHẶN CỨU HỘ TĨNH PHÂN TÁCH RÕ CÂU VĂN VS TỪ VỰNG]
    if (finalDistractors.length < safeCount) {
      let fallbackPool = [];


      if (type === 'sentence') {
        if (safeLang === 'zh' && isReverse) {
          fallbackPool = [
            '我每天早上七点起床。',
            '今天天气非常好。',
            '他正在图书馆看书。',
            '我们明天一起去公园吧。',
            '这本书非常有意思。',
            '她很喜欢听音乐。'
          ];
        } else if (!isReverse) {
          fallbackPool = [
            'Tôi thức dậy lúc bảy giờ mỗi sáng.',
            'Thời tiết hôm nay rất đẹp.',
            'Anh ấy đang đọc sách ở thư viện.',
            'Ngày mai chúng ta cùng đi công viên nhé.',
            'Cuốn sách này rất thú vị.',
            'Cô ấy rất thích nghe nhạc.'
          ];
        } else {
          fallbackPool = [
            'I wake up at seven every morning.',
            'The weather is very nice today.',
            'He is reading a book in the library.',
            'Let us go to the park together tomorrow.',
            'This book is very interesting.',
            'She really enjoys listening to music.'
          ];
        }
      } else if (safeLang === 'zh' && isReverse) {
        fallbackPool = ['苹果', '香蕉', '猫', '狗', '电脑', '桌子', '老师', '学生'];
      } else if (!isReverse) {
        fallbackPool = [
          'Quả táo',
          'Quả chuối',
          'Con mèo',
          'Con chó',
          'Máy tính',
          'Cái bàn',
          'Giáo viên',
          'Học sinh'
        ];
      } else {
        fallbackPool = [
          'Apple',
          'Banana',
          'Cat',
          'Dog',
          'Computer',
          'Table',
          'Teacher',
          'Student'
        ];
      }


      const targetSet = isReverse ? textSet : meaningSet;
      for (const fw of shuffleArray([...fallbackPool])) {
        if (finalDistractors.length >= safeCount) break;
        const fwKey = normalizeCompareKey(fw);
        if (fwKey !== targetKey && !targetSet.has(fwKey)) {
          targetSet.add(fwKey);
          finalDistractors.push(fw);
        }
      }


      let fallbackCounter = 1;
      while (finalDistractors.length < safeCount) {
        const generatedFallback = `${cleanCorrectText} (${fallbackCounter})`;
        const genKey = normalizeCompareKey(generatedFallback);
        if (!targetSet.has(genKey)) {
          targetSet.add(genKey);
          finalDistractors.push(generatedFallback);
        }
        fallbackCounter++;
      }
    }


    return finalDistractors.slice(0, safeCount);
  },


  // ============================================================================
  // 3. THUẬT TOÁN BĂM RÁC TỔNG KHO (Universal Scramble Noise)
  // ============================================================================
  offline_getNoise: function (correctText, deck = [], lang, type, count = 2) {
    const cleanText = String(correctText || '').trim();
    if (!cleanText) return [];


    const safeCount = Math.max(1, Number(count) || 2);
    const safeLang = resolveSafeLang(lang, cleanText);
    const isZh = safeLang === 'zh';


    const safeDeck = Array.isArray(deck) ? deck : [];
    const masterPool = GameOfflineEngine._getMasterPool(safeLang, type);


    const combinedMap = new Map();
    [...safeDeck, ...masterPool].forEach((c) => {
      if (c && c.term) {
        const k = normalizeCompareKey(c.term);
        if (k && !combinedMap.has(k)) combinedMap.set(k, c);
      }
    });
    const combinedDeck = Array.from(combinedMap.values());
    const noise = new Set();


    if (type === 'word') {
      const existingChars = new Set(
        Array.from(cleanText).map((ch) => normalizeCompareKey(ch))
      );
      const preferredPool = [];
      const secondaryPool = [];


      if (isZh) {
        combinedDeck.forEach((c) => {
          if (c.term && normalizeCompareKey(c.term) !== normalizeCompareKey(cleanText)) {
            Array.from(c.term).forEach((char) => {
              // Chỉ bốc chữ Hán thật, lọc bỏ dấu câu/khoảng trắng/chữ Latin
              if (!HANZI_REGEX.test(char)) return;
              if (existingChars.has(normalizeCompareKey(char))) secondaryPool.push(char);
              else preferredPool.push(char);
            });
          }
        });
        const fallbackZhChars = ['的', '了', '是', '不', '我', '人', '大', '中', '国', '一', '有', '在'];
        fallbackZhChars.forEach((char) => {
          if (existingChars.has(normalizeCompareKey(char))) secondaryPool.push(char);
          else preferredPool.push(char);
        });
      } else {
        const vowels = ['a', 'e', 'i', 'o', 'u'];
        const consonants = [
          'b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y'
        ];
        [...vowels, ...vowels, ...consonants].forEach((char) => {
          if (existingChars.has(char)) secondaryPool.push(char);
          else preferredPool.push(char);
        });
      }


      for (const c of [...shuffleArray(preferredPool), ...shuffleArray(secondaryPool)]) {
        if (noise.size >= safeCount) break;
        noise.add(isZh ? c : c.toLowerCase());
      }
      return Array.from(noise).slice(0, safeCount);
    }


    const baseTokenSet = new Set(
      (isZh ? Array.from(cleanText) : cleanText.split(/\s+/))
        .map((t) => GameOfflineEngine._cleanWord(t))
        .filter(Boolean)
    );


    const pool = [];
    combinedDeck.forEach((c) => {
      if (c.term && normalizeCompareKey(c.term) !== normalizeCompareKey(cleanText)) {
        const cTokens = isZh ? Array.from(c.term) : c.term.split(/\s+/);
        cTokens.forEach((t) => {
          if (isZh && !HANZI_REGEX.test(t)) return;
          const clean = GameOfflineEngine._cleanWord(t);
          if (clean && !baseTokenSet.has(clean)) pool.push(clean);
        });
      }
    });


    for (const w of shuffleArray(pool)) {
      if (noise.size >= safeCount) break;
      noise.add(w);
    }


    // [VER 1.1] Xáo trộn danh sách rác dự phòng để tránh lặp cố định
    if (noise.size < safeCount) {
      const fbList = isZh
        ? ['的', '得', '地', '了', '是', '在', '不']
        : ['is', 'are', 'a', 'the', 'in', 'not'];
      for (const w of shuffleArray([...fbList])) {
        if (noise.size >= safeCount) break;
        if (!baseTokenSet.has(w)) noise.add(w);
      }
    }


    return Array.from(noise).slice(0, safeCount);
  },


  // ============================================================================
  // 4. THUẬT TOÁN ĐỤC LỖ TỔNG KHO (Universal Cloze Mask)
  // ============================================================================
  offline_mask: function (text, lang, type, deck = []) {
    const cleanText = String(text || '').trim();
    const safeLang = resolveSafeLang(lang, cleanText);


    if (!cleanText) {
      return { targetWord: '', displaySentence: '[__________]', hint: 'Từ vựng', distractors: [] };
    }


    if (type === 'word') {
      // Bắt buộc truyền isReverse = true để trả về 3 từ NGOẠI NGỮ thay vì nghĩa Tiếng Việt
      const dists = GameOfflineEngine.offline_generateOptions(
        cleanText,
        deck,
        safeLang,
        'word',
        3,
        true
      );
      return {
        targetWord: cleanText,
        displaySentence: '[__________]',
        hint: 'Từ vựng',
        distractors: dists
      };
    }


    const isZh = safeLang === 'zh';
    let targetWord = '';
    let displaySentence = '';


    if (isZh) {
      const chars = Array.from(cleanText);
      const validIndices = chars
        .map((ch, i) => (HANZI_REGEX.test(ch) || VALID_CHAR_REGEX.test(ch) ? i : -1))
        .filter((i) => i !== -1);


      if (validIndices.length === 0) {
        targetWord = cleanText;
        displaySentence = '[__________]';
      } else if (validIndices.length <= 3) {
        const pickPos = validIndices.length > 1 ? validIndices[1] : validIndices[0];
        targetWord = chars[pickPos];
        displaySentence =
          chars.slice(0, pickPos).join('') + '[__________]' + chars.slice(pickPos + 1).join('');
      } else {
        // Chọn chỉ mục ở vùng giữa chứa chữ Hán thật, chỉ ghép 2 ký tự nếu ký tự kế tiếp cũng hợp lệ
        const innerIndices = validIndices.slice(1, -1);
        const start = innerIndices[Math.floor(Math.random() * innerIndices.length)];
        const canTakeTwo =
          start + 1 < chars.length &&
          (HANZI_REGEX.test(chars[start + 1]) || VALID_CHAR_REGEX.test(chars[start + 1])) &&
          Math.random() < 0.5;
        const k = canTakeTwo ? 2 : 1;
        targetWord = chars.slice(start, start + k).join('');
        displaySentence =
          chars.slice(0, start).join('') + '[__________]' + chars.slice(start + k).join('');
      }
    } else {
      const words = cleanText.split(/\s+/);
      const validWordIndices = words
        .map((w, i) => (w.replace(EDGE_PUNCT_REGEX, '').length > 0 ? i : -1))
        .filter((i) => i !== -1);


      if (validWordIndices.length === 0) {
        targetWord = cleanText;
        displaySentence = '[__________]';
      } else {
        const poolIdx =
          validWordIndices.length > 2 ? validWordIndices.slice(1, -1) : validWordIndices;
        const pickedIdx = poolIdx[Math.floor(Math.random() * poolIdx.length)];
        const rawWord = words[pickedIdx];
        const coreWord = rawWord.replace(EDGE_PUNCT_REGEX, '');
        targetWord = coreWord;
        // Giữ nguyên dấu câu trước/sau từ bị đục lỗ
        const maskedToken = rawWord.replace(coreWord, '[__________]');
        const maskedWords = [...words];
        maskedWords[pickedIdx] = maskedToken;
        displaySentence = maskedWords.join(' ');
      }
    }


    targetWord = String(targetWord || '').replace(EDGE_PUNCT_REGEX, '').trim();
    if (!targetWord) targetWord = cleanText;


    const targetKey = normalizeCompareKey(targetWord);
    const targetLen = isZh ? Array.from(targetWord).length : targetWord.length;
    const isTargetPureHanzi = isZh && PURE_HANZI_REGEX.test(targetWord);
    const cleanToken = (t) => (t ? String(t).replace(EDGE_PUNCT_REGEX, '').trim() : '');


    const seenKeys = new Set([targetKey]);
    const distractors = [];


    const tryAddDistractor = (candidate) => {
      if (distractors.length >= 3 || !candidate) return;
      const candKey = normalizeCompareKey(candidate);
      if (!candKey || seenKeys.has(candKey)) return;
      seenKeys.add(candKey);
      distractors.push(candidate);
    };


    const safeDeck = Array.isArray(deck) ? deck : [];
    const masterPool = GameOfflineEngine._getMasterPool(safeLang, 'sentence');
    const combinedMap = new Map();
    [...safeDeck, ...masterPool].forEach((c) => {
      if (c && c.term) {
        const k = normalizeCompareKey(c.term);
        if (k && !combinedMap.has(k)) combinedMap.set(k, c);
      }
    });
    const shuffledDeck = shuffleArray(Array.from(combinedMap.values()));


    for (const card of shuffledDeck) {
      if (distractors.length >= 3) break;
      if (card.term && normalizeCompareKey(card.term) !== normalizeCompareKey(cleanText)) {
        if (isZh) {
          const chars = Array.from(card.term);
          for (let i = 0; i <= chars.length - targetLen; i++) {
            if (distractors.length >= 3) break;
            const chunk = cleanToken(chars.slice(i, i + targetLen).join(''));
            // [VER 1.1] Bắt buộc thuần Hán khi đáp án gốc thuần Hán (chặn cụm pha tạp như "的A", "1个")
            const isValidZhChunk = isTargetPureHanzi
              ? PURE_HANZI_REGEX.test(chunk)
              : HANZI_REGEX.test(chunk);
            if (chunk && isValidZhChunk && Array.from(chunk).length === targetLen) {
              tryAddDistractor(chunk);
            }
          }
        } else {
          const words = card.term.split(/\s+/);
          for (const w of words) {
            if (distractors.length >= 3) break;
            const cw = cleanToken(w);
            if (cw && Math.abs(cw.length - targetLen) <= 2) {
              tryAddDistractor(cw);
            }
          }
        }
      }
    }


    if (distractors.length < 3) {
      const fbZh = ['怎么', '什么', '那个', '这个', '很多', '一点', '非常', '比较', '知道', '觉得'];
      const fbEn = [
        'other',
        'different',
        'another',
        'some',
        'many',
        'much',
        'very',
        'really',
        'that',
        'this'
      ];
      const fbPool = shuffleArray([...(isZh ? fbZh : fbEn)]);
      for (const fw of fbPool) {
        if (distractors.length >= 3) break;
        let adjustedFw = fw;
        if (isZh && Array.from(fw).length > targetLen) {
          adjustedFw = Array.from(fw).slice(0, targetLen).join('');
        }
        tryAddDistractor(adjustedFw);
      }
    }


    let fallbackCounter = 1;
    while (distractors.length < 3) {
      tryAddDistractor(`${targetWord}${fallbackCounter}`);
      fallbackCounter++;
    }


    return {
      targetWord,
      displaySentence: displaySentence.trim(),
      hint: 'Điền từ còn thiếu',
      distractors: distractors.slice(0, 3)
    };
  },


  // ============================================================================
  // 5. THUẬT TOÁN TỪ KHÁC LOẠI TỔNG KHO (Universal Odd One Out)
  // ============================================================================
  offline_generateOddOneOut: function (deck = [], lang) {
    const safeLang = resolveSafeLang(lang);
    const safeDeck = Array.isArray(deck) ? deck : [];
    const masterPool = GameOfflineEngine._getMasterPool(safeLang, 'vocab');


    const combinedMap = new Map();
    [...safeDeck, ...masterPool].forEach((c) => {
      if (c && c.term && !detectSentence(c.term)) {
        const k = normalizeCompareKey(c.term);
        if (k && !combinedMap.has(k)) {
          combinedMap.set(k, c);
        }
      }
    });
    const validCards = Array.from(combinedMap.values());


    if (validCards.length >= 4) {
      const posMap = {};
      validCards.forEach((c) => {
        // [VER 1.1] Dùng normalizePartOfSpeech chống nuốt adverb->verb, pronoun->noun & bỏ thẻ đa POS
        const pos = normalizePartOfSpeech(c.partOfSpeech);
        if (pos) {
          if (!posMap[pos]) posMap[pos] = [];
          posMap[pos].push(c);
        }
      });


      let majorCat = null;
      let minorCat = null;
      // Xáo trộn danh sách nhóm từ loại để mỗi ván không lặp cố định 1 cặp POS
      const keys = shuffleArray(Object.keys(posMap));
      for (let i = 0; i < keys.length; i++) {
        if (posMap[keys[i]].length >= 3) {
          majorCat = keys[i];
          const otherKeys = shuffleArray(keys.filter((k) => k !== majorCat && posMap[k].length >= 1));
          if (otherKeys.length > 0) {
            minorCat = otherKeys[0];
            break;
          }
        }
      }


      if (majorCat && minorCat) {
        const majorCards = shuffleArray([...posMap[majorCat]]).slice(0, 3);
        const minorCard = shuffleArray([...posMap[minorCat]])[0];
        const wordsObj = [...majorCards, minorCard];
        const shuffledWordsObj = shuffleArray(wordsObj);
        const minorLabel = minorCard.partOfSpeech || POS_DISPLAY_LABELS[minorCat] || minorCat;
        const majorLabel = majorCards[0].partOfSpeech || POS_DISPLAY_LABELS[majorCat] || majorCat;


        return {
          words: shuffledWordsObj.map((c) => c.term),
          oddWord: minorCard.term,
          explanation:
            'Từ ' +
            minorCard.term +
            ' là ' +
            minorLabel +
            ', trong khi các từ còn lại là ' +
            majorLabel +
            '.',
          originCards: shuffledWordsObj
        };
      }
    }


    if (safeLang === 'zh') {
      const zhWords = shuffleArray(['苹果', '香蕉', '西瓜', '猫']);
      return {
        words: zhWords,
        oddWord: '猫',
        explanation: '猫 (Con mèo) là động vật, các từ còn lại là trái cây.',
        isFallback: true
      };
    }


    return {
      words: shuffleArray(['apple', 'banana', 'orange', 'cat']),
      oddWord: 'cat',
      explanation: 'Cat là động vật (Dữ liệu dự phòng Offline).',
      isFallback: true
    };
  }
};


// ============================================================================
// TRẠM ĐỊNH TUYẾN (FACADE PATTERN) - ĐỒNG BỘ 100% EXPORTS THEO NEWMAPPING.MD
// ============================================================================
export const GameAlgoEngine = {
  _cleanWord: (word) => GameOfflineEngine._cleanWord(word),
  _getLevelContext: (...args) =>
    GameAiEngine && GameAiEngine._getLevelContext ? GameAiEngine._getLevelContext(...args) : '',
  GrammarRouter: {
    getMicroPrompt: (...args) => GameOfflineEngine.offline_getGrammarMicroPrompt(...args)
  },
  DistortionEngine: {
    offline_distort: (...args) => GameOfflineEngine.offline_distort(...args),
    ai_distort: (...args) => GameAiEngine.ai_distort(...args)
  },
  OptionsEngine: {
    offline_generateOptions: (
      correctText,
      deck,
      lang,
      type,
      count = 3,
      isReverse = false,
      isHard = false
    ) => {
      const safeIsHard = isReverse ? isHard : false;
      return GameOfflineEngine.offline_generateOptions(
        correctText,
        deck,
        lang,
        type,
        count,
        isReverse,
        safeIsHard
      );
    },
    ai_generateOptions: (...args) => GameAiEngine.ai_generateOptions(...args)
  },
  ScrambleNoiseEngine: {
    offline_getNoise: (...args) => GameOfflineEngine.offline_getNoise(...args),
    ai_getNoise: (...args) => GameAiEngine.ai_getNoise(...args)
  },
  ClozeEngine: {
    offline_mask: (...args) => GameOfflineEngine.offline_mask(...args),
    ai_mask: (...args) => GameAiEngine.ai_mask(...args)
  },
  OddOneOutEngine: {
    offline_generate: (...args) => GameOfflineEngine.offline_generateOddOneOut(...args)
  }
};


export const OptionsEngine = GameAlgoEngine.OptionsEngine;
export const DistortionEngine = GameAlgoEngine.DistortionEngine;
export const ClozeEngine = GameAlgoEngine.ClozeEngine;
export const ScrambleNoiseEngine = GameAlgoEngine.ScrambleNoiseEngine;
export const OddOneOutEngine = GameAlgoEngine.OddOneOutEngine;


if (typeof window !== 'undefined') {
  window.GameOfflineEngine = GameOfflineEngine;
  window.GameAlgoEngine = GameAlgoEngine;
}


export default GameAlgoEngine;

