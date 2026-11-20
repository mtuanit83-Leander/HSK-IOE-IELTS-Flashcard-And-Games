// ============================================================================
// FILE 17/85: src/engines/gameAiEngine.js
// NGUỒN GỐC: tang_2.js (Block 2.3A - Game AI Engine V2.13)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 20/11/2026 - 19:07 (GMT+7)
// NHIỆM VỤ: Chuyên trách giao tiếp API sinh dữ liệu nhiễu bằng AI cho Mini-Games
//           (Spot Mistake, Quiz Options, Scramble Noise, Cloze Mask) kèm nhận diện
//           song ngữ 4 tầng đồng bộ cả 4 động cơ, Trạm gác Độc bản 2 chiều (NFC),
//           Tường lửa ký tự nâng cao và lớp Hậu kiểm toàn diện (Gatekeeper).
// ============================================================================


import { parseAiJson } from '../utils/helpers.js';
import { callGeminiApi } from '../services/geminiApi.js';
import { IoeDataEngine } from './pedagogyEngine.js';
import { MICRO_PROMPTS } from './microPrompts.js';


// ============================================================================
// HẰNG SỐ & HÀM PHỤ TRỢ NỘI BỘ (CHUẨN HÓA NGÔN NGỮ, CẤP ĐỘ, UNICODE & TƯỜNG LỬA)
// ============================================================================


// Bảng ánh xạ mã cấp độ cũ (legacy) sang mã cấp độ 9 tầng hiện hành
const OLD_TO_NEW_LEVEL_MAP = {
  level_1_kiddie: 'en_level_1',
  level_2_junior_basic: 'en_level_2',
  level_3_junior_advanced: 'en_level_3',
  level_4_discovery_basic: 'en_level_4',
  level_5_discovery_advanced: 'en_level_5',
  level_6_pre_ielts: 'en_level_6',
  level_7_breakthrough: 'en_level_7',
  level_8_academic: 'en_level_8',
  level_9_expert: 'en_level_9'
};


// Phát hiện ký tự chữ Hán (CJK Unified Ideographs)
const HANZI_REGEX = /[\u4e00-\u9fff]/;


// Nguyên âm Pinyin có dấu thanh điệu (luôn cấm trong đáp án Tiếng Trung kể cả khi từ gốc có chữ Latin)
const PINYIN_TONE_REGEX = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ]/;


// Cặp ngoặc đơn (ASCII hoặc Fullwidth) chứa chữ Latin/Pinyin dạng chú thích (VD: "T恤 (T xù)")
const CHINESE_PAREN_LATIN_REGEX =
  /[（(][^）)]*[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ][^）)]*[）)]/;


// Chữ Latin ASCII thông thường
const ASCII_LATIN_REGEX = /[a-zA-Z]/;


// Tường lửa Tiếng Anh: chặn ký tự IPA chuẩn, dấu trọng âm/trường âm IPA và ký tự backslash
const ENGLISH_IPA_CHAR_REGEX = /[\\əæθʃʒðŋɑɔʊʌɛɪˈˌː]/;
const ENGLISH_BRACKET_REGEX = /\[[^\]]*\]/;


// Chặn cụm phiên âm nằm giữa 2 dấu gạch chéo /.../ (bao gồm "/in time/", "(/buk/)")
// nhưng KHÔNG chặn oan "and/or", "he/she", "24/7", "in / on / at"
const ENGLISH_SLASH_PHONETIC_REGEX =
  /(?:^|[\s(])\/[^\s/](?:[^/]{0,38}[^\s/])?\/(?:[\s).,;!?]|$)/;


// Ký tự dấu câu ở 2 đầu token dùng khi so sánh khử trùng lặp
const EDGE_PUNCTUATION_REGEX = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;


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
 * Trích xuất chuỗi cấp độ đầu tiên hợp lệ từ chuỗi hoặc mảng Multi-select
 * @param {string|string[]} level
 * @returns {string}
 */
const extractRawLevel = (level) => {
  if (Array.isArray(level)) {
    const firstValid = level.find(
      (item) => item !== null && item !== undefined && String(item).trim() !== ''
    );
    return firstValid !== undefined ? String(firstValid).trim() : '';
  }
  return level !== null && level !== undefined ? String(level).trim() : '';
};


/**
 * Chuẩn hóa mã cấp độ (hỗ trợ cả Array từ bộ chọn Multi-select và mã legacy)
 * @param {string|string[]} level
 * @param {'en'|'zh'} fallbackLang
 * @returns {string}
 */
const normalizeLevelKey = (level, fallbackLang = 'en') => {
  const rawLevel = extractRawLevel(level);
  if (!rawLevel) {
    return fallbackLang === 'zh' ? 'zh_level_4' : 'en_level_4';
  }


  const mapped = OLD_TO_NEW_LEVEL_MAP[rawLevel] || rawLevel;
  if (!mapped.includes('level_')) {
    return fallbackLang === 'zh' ? 'zh_level_4' : 'en_level_4';
  }
  return mapped;
};


/**
 * Chuẩn hóa tham số chủ đề (Vắc-xin Đa nhiệm Array Armor)
 * @param {string|string[]} topic
 * @returns {string}
 */
const normalizeTopic = (topic) => {
  if (Array.isArray(topic)) {
    const valid = topic
      .map((item) => (item !== null && item !== undefined ? String(item).trim() : ''))
      .filter(Boolean);
    return valid.length > 0 ? valid.join(', ') : '';
  }
  return topic !== null && topic !== undefined ? String(topic).trim() : '';
};


/**
 * Nhận diện chính xác ngôn ngữ ngoại ngữ gốc của thẻ (4 tầng ưu tiên):
 * 1. Tham số `explicitLang` nếu là 'zh' hoặc 'en'
 * 2. Trường `language` trên đối tượng thẻ (`cardOrText.language`)
 * 3. Chuỗi cấp độ (`level`) chứa 'zh' hoặc 'hsk'
 * 4. Tự động phát hiện ký tự Hán trong `term` (cứu hộ khi caller truyền ''/'vi' + level cũ)
 *
 * @param {Object|string} cardOrText
 * @param {string} explicitLang
 * @param {string|string[]} level
 * @returns {'en' | 'zh'}
 */
const resolveForeignLang = (cardOrText, explicitLang, level) => {
  const cleanExplicit = String(explicitLang || '').trim().toLowerCase();
  if (cleanExplicit === 'zh' || cleanExplicit === 'en') {
    return cleanExplicit;
  }


  if (cardOrText && typeof cardOrText === 'object') {
    const cardLang = String(cardOrText.language || '').trim().toLowerCase();
    if (cardLang === 'zh' || cardLang === 'en') {
      return cardLang;
    }
  }


  const levelStr = (Array.isArray(level) ? level.join(',') : String(level || '')).toLowerCase();
  if (levelStr.includes('zh') || levelStr.includes('hsk')) {
    return 'zh';
  }


  const rawTerm = typeof cardOrText === 'string' ? cardOrText : String(cardOrText?.term || '');
  if (HANZI_REGEX.test(rawTerm)) {
    return 'zh';
  }


  return 'en';
};


/**
 * Kiểm tra rò rỉ ký tự phiên âm IPA cho Tiếng Anh
 * (Chặn IPA, [...], /.../, (/.../) nhưng bảo toàn "and/or", "he/she", "24/7", "in / on / at")
 * @param {string} text
 * @returns {boolean}
 */
const hasEnglishPhoneticLeak = (text) => {
  if (!text) return false;
  return (
    ENGLISH_IPA_CHAR_REGEX.test(text) ||
    ENGLISH_BRACKET_REGEX.test(text) ||
    ENGLISH_SLASH_PHONETIC_REGEX.test(text)
  );
};


/**
 * Kiểm tra rò rỉ Pinyin/Tiếng Anh trong đáp án Tiếng Trung:
 * - Bắt buộc có ít nhất 1 chữ Hán.
 * - Luôn chặn nguyên âm Pinyin có dấu thanh điệu và chú thích ngoặc chứa chữ Latin
 *   ngay cả khi từ gốc là từ vay mượn chứa chữ Latin (VD: "T恤", "KTV").
 * - Nếu từ gốc không chứa chữ Latin, cấm tuyệt đối mọi ký tự ASCII a-z/A-Z.
 *
 * @param {string} text
 * @param {string} sourceTerm
 * @returns {boolean}
 */
const hasChineseLeak = (text, sourceTerm = '') => {
  if (!text) return true;
  if (!HANZI_REGEX.test(text)) return true;
  if (PINYIN_TONE_REGEX.test(text) || CHINESE_PAREN_LATIN_REGEX.test(text)) {
    return true;
  }
  const sourceHasLatin = ASCII_LATIN_REGEX.test(sourceTerm);
  if (!sourceHasLatin && ASCII_LATIN_REGEX.test(text)) {
    return true;
  }
  return false;
};


/**
 * Phân tích phản hồi JSON từ Gemini an toàn, không bao giờ ném lỗi null-reference
 * @param {Object|null} res
 * @returns {Object|null}
 */
const safeParseGeminiResult = (res) => {
  if (!res || typeof res.text !== 'string' || !res.text.trim()) {
    return null;
  }
  try {
    const parsed = parseAiJson(res.text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn('[GameAiEngine] Lỗi giải mã JSON từ AI:', err);
    return null;
  }
};


export const GameAiEngine = {
  // ============================================================================
  // 0A. RADAR NHẬN DIỆN TRÌNH ĐỘ - Hỗ trợ Mở trần Từ vựng & HSK 3.0
  // ============================================================================
  _getLevelContext: function (level, isForDistractor = false, forcedLang = '') {
    if (!level) return '';
    const rawLevel = extractRawLevel(level);
    if (!rawLevel) return '';


    const mappedKey = OLD_TO_NEW_LEVEL_MAP[rawLevel] || rawLevel;
    const isZh =
      forcedLang === 'zh' ||
      mappedKey.toLowerCase().includes('zh') ||
      mappedKey.toLowerCase().includes('hsk');


    // Ghi đè ngữ cảnh hệ thống, ép chuẩn HSK 3.0 cho Tiếng Trung
    let contextDesc = '';
    if (isZh) {
      contextDesc = 'Chuẩn HSK 3.0 mới';
    } else {
      contextDesc =
        IoeDataEngine && IoeDataEngine.GRADE_CONTEXTS
          ? IoeDataEngine.GRADE_CONTEXTS[mappedKey] || 'CEFR Standard'
          : 'CEFR Standard';
    }


    let instruction = `\n[TRÌNH ĐỘ]: ${mappedKey} (${contextDesc}).`;


    // Cởi trói cho AI khi tạo bẫy
    if (isForDistractor) {
      instruction += ` [QUY TẮC MỞ RỘNG]: Được phép dùng từ vựng vượt cấp để tạo bẫy. TUYỆT ĐỐI KHÔNG lặp lại từ gốc khi bí ý tưởng!`;
    } else {
      instruction += ` Ưu tiên từ vựng/ngữ pháp chuẩn cấp độ này.`;
    }
    return instruction;
  },


  // ============================================================================
  // 0B. LÕI ĐỊNH TUYẾN MỜ - Chắp vá Micro-prompts xuyên cấp độ nhưng khóa ngôn ngữ
  // ============================================================================
  _getFuzzyMicroPrompt: function (card, gameType) {
    const pool = MICRO_PROMPTS?.[gameType] || IoeDataEngine?.MICRO_PROMPTS?.[gameType];
    if (!pool) return '';


    const extractPrompt = (item) => {
      if (!item) return '';
      return typeof item === 'object' ? item.prompt || '' : String(item);
    };


    const fallbacks = {
      quiz: 'general_trap',
      spot_mistake: 'general_mistake',
      fill_blank: 'general_blank',
      scramble: 'general_noise'
    };
    const defaultFallback = pool[fallbacks[gameType]] || '';


    if (!card || !card.grammar_type) return extractPrompt(defaultFallback);


    let tags = card.grammar_type;
    if (typeof tags === 'string') {
      tags = tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(tags) || tags.length === 0) return extractPrompt(defaultFallback);


    const targetTag = String(tags[Math.floor(Math.random() * tags.length)] || '').trim();
    if (!targetTag) return extractPrompt(defaultFallback);


    // BƯỚC 1: EXACT MATCH
    if (pool[targetTag]) return extractPrompt(pool[targetTag]);


    // BƯỚC 2: LANGUAGE-AWARE FUZZY MATCH
    const isChinese = targetTag.startsWith('zh_');
    const isEnglish = targetTag.startsWith('eng_') || targetTag.startsWith('pre_a1_');
    const coreTrap = targetTag.replace(/^(zh_hsk\d*_|eng_a\d+p?_|pre_a1_)/, '');


    if (coreTrap) {
      const possibleKeys = Object.keys(pool).filter((key) => {
        const isCorrectLang = isChinese
          ? key.startsWith('zh_')
          : isEnglish
          ? key.startsWith('eng_') || key.startsWith('pre_')
          : true;
        return isCorrectLang && key.includes(coreTrap);
      });


      if (possibleKeys.length > 0) {
        return extractPrompt(pool[possibleKeys[Math.floor(Math.random() * possibleKeys.length)]]);
      }
    }


    // BƯỚC 3: LƯỚI CỨU HỘ CUỐI CÙNG
    return extractPrompt(defaultFallback);
  },


  // ============================================================================
  // 1. ĐỘNG CƠ TẠO LỖI SAI TRỰC TUYẾN (Spot Mistake) + GATEKEEPER HẬU KIỂM
  // ============================================================================
  ai_distort: async function (text, lang, type, apiKey, level = '', topic = '', card = null) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;


    const safeLang = resolveForeignLang(
      { language: card?.language, term: cleanText || card?.term },
      lang,
      level
    );
    const safeTopic = normalizeTopic(topic);
    const mappedLevel = normalizeLevelKey(level, safeLang);
    const levelContext = GameAiEngine._getLevelContext(mappedLevel, false, safeLang);
    const langStr = safeLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';


    let prompt = '';
    let schema = {};


    let microPrompt = '';
    if (card) {
      if (card.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(card, 'spot_mistake');
        if (mp) microPrompt = '\n[MỤC TIÊU NGỮ PHÁP ĐẶC BIỆT]: ' + mp + '\n';
      } else {
        microPrompt =
          '\n[CHẨN ĐOÁN NGỮ PHÁP]: Phân tích cấu trúc cốt lõi (liên từ, giới từ, trật tự từ). Bẻ gãy chính cấu trúc đó thay vì chỉ sai từ vựng.\n';
      }
    }


    let injectedRule = '';
    if (IoeDataEngine && typeof IoeDataEngine.getMicroTierDistortionRule === 'function') {
      const targetLang = safeLang === 'zh' ? 'Chinese' : 'English';
      // [VER 1.1] Phân biệt đúng chế độ từ vựng ('vocab') và câu văn ('sentence')
      const dataMode = type === 'word' ? 'vocab' : 'sentence';
      const ruleStr = IoeDataEngine.getMicroTierDistortionRule(
        targetLang,
        dataMode,
        mappedLevel,
        safeTopic
      );
      if (ruleStr) injectedRule = '\n[ĐỊNH HƯỚNG BÓP MÉO]: ' + ruleStr;
    }


    if (type === 'word') {
      prompt = `Ngữ cảnh: "${cleanText}". Ngôn ngữ: ${langStr}.\n`;
      prompt += `[NHIỆM VỤ]: Tạo 1 lỗi chính tả/hình thái từ tự nhiên.` + microPrompt + injectedRule;
      prompt +=
        `\n[CẤU TRÚC]: Trả về 1 từ duy nhất khác từ gốc. Phần giải thích (explanation) viết bằng Tiếng Việt.` +
        levelContext;
      schema = {
        type: 'OBJECT',
        properties: {
          wrongWord: { type: 'STRING', description: 'THE SINGLE INCORRECT WORD.' },
          explanation: { type: 'STRING', description: 'Brief explanation in Vietnamese.' }
        },
        required: ['wrongWord', 'explanation']
      };
    } else {
      const examples =
        safeLang === 'zh'
          ? `[Ý TƯỞNG BẺ GÃY]: Sai đại từ/giới tính/thì, Đổi tính từ trái nghĩa, Sai trợ từ (的/得/地)/lượng từ, Thay cụm từ biểu cảm, Nhét chữ rác.`
          : `[Ý TƯỞNG BẺ GÃY]: Sai thì/đại từ, Tính từ trái nghĩa, Đảo lộn trật tự cụm cố định, Thêm mạo từ/giới từ thừa.`;


      prompt = `Ngữ cảnh: "${cleanText}". Ngôn ngữ: ${langStr}.\n`;
      prompt += `[NHIỆM VỤ]: Tạo 1 lỗi sai tinh vi (ngữ pháp/ngữ cảnh) trong câu bằng cách THAY THẾ hoặc THÊM TỪ.\n`;
      prompt += `${examples}\n`;
      prompt +=
        `[TRẢ VỀ]: 'wrongWord' phải là sub-string tồn tại vật lý trong 'wrongSentence'. 'explanation' viết bằng Tiếng Việt.` +
        microPrompt +
        injectedRule +
        levelContext;
      schema = {
        type: 'OBJECT',
        properties: {
          wrongSentence: {
            type: 'STRING',
            description: 'THE FULL SENTENCE CONTAINING THE MISTAKE.'
          },
          wrongWord: {
            type: 'STRING',
            description:
              'THE EXACT SUBSTRING THAT IS WRONG (Must physically exist in wrongSentence).'
          },
          correction: {
            type: 'STRING',
            description: 'THE CORRECT WORD OR PHRASE TO REPLACE THE MISTAKE.'
          },
          explanation: { type: 'STRING', description: 'Explanation in Vietnamese.' }
        },
        required: ['wrongSentence', 'wrongWord', 'correction', 'explanation']
      };
    }


    // Giữ nguyên lan truyền lỗi mạng / GLOBAL_PAUSE lên tầng gọi
    const res = await callGeminiApi(prompt, schema, apiKey);
    const parsed = safeParseGeminiResult(res);
    if (!parsed) return null;


    // [VER 1.1] GATEKEEPER HẬU KIỂM CHO AI_DISTORT
    if (type === 'word') {
      const wrongWord = String(parsed.wrongWord || '').trim();
      const explanation = String(parsed.explanation || '').trim();


      if (!wrongWord || normalizeCompareKey(wrongWord) === normalizeCompareKey(cleanText)) {
        console.warn('[Gatekeeper:ai_distort] Từ bóp méo rỗng hoặc trùng từ gốc:', wrongWord);
        return null;
      }
      if (safeLang === 'zh' && hasChineseLeak(wrongWord, cleanText)) {
        console.warn('[Gatekeeper:ai_distort] Rò rỉ Pinyin/Latin ở chế độ từ:', wrongWord);
        return null;
      }
      if (safeLang === 'en' && hasEnglishPhoneticLeak(wrongWord)) {
        console.warn('[Gatekeeper:ai_distort] Rò rỉ IPA ở chế độ từ:', wrongWord);
        return null;
      }


      return {
        ...parsed,
        wrongWord,
        explanation: explanation || 'Lỗi chính tả/hình thái từ.'
      };
    }


    const wrongSentence = String(parsed.wrongSentence || '').trim();
    const rawWrongWord = String(parsed.wrongWord || '').trim();
    const correction = String(parsed.correction || '').trim();
    const explanation = String(parsed.explanation || '').trim();


    if (!wrongSentence || !rawWrongWord) {
      console.warn('[Gatekeeper:ai_distort] Thiếu wrongSentence hoặc wrongWord.');
      return null;
    }


    if (normalizeCompareKey(wrongSentence) === normalizeCompareKey(cleanText)) {
      console.warn('[Gatekeeper:ai_distort] Câu trả về không có thay đổi so với câu gốc.');
      return null;
    }


    // Tự phục hồi độ khớp hoa/thường để đảm bảo wrongWord luôn tồn tại vật lý trong wrongSentence
    let exactWrongWord = rawWrongWord;
    if (!wrongSentence.includes(exactWrongWord)) {
      const lowerIdx = wrongSentence.toLowerCase().indexOf(exactWrongWord.toLowerCase());
      if (lowerIdx !== -1) {
        exactWrongWord = wrongSentence.slice(lowerIdx, lowerIdx + exactWrongWord.length);
      } else {
        console.warn(
          '[Gatekeeper:ai_distort] wrongWord không tồn tại vật lý trong wrongSentence:',
          rawWrongWord
        );
        return null;
      }
    }


    if (correction && normalizeCompareKey(exactWrongWord) === normalizeCompareKey(correction)) {
      console.warn('[Gatekeeper:ai_distort] wrongWord trùng khớp với correction:', exactWrongWord);
      return null;
    }


    if (safeLang === 'zh' && hasChineseLeak(wrongSentence, cleanText)) {
      console.warn('[Gatekeeper:ai_distort] Rò rỉ Pinyin/Latin trong câu sai:', wrongSentence);
      return null;
    }
    if (safeLang === 'en' && hasEnglishPhoneticLeak(wrongSentence)) {
      console.warn('[Gatekeeper:ai_distort] Rò rỉ IPA trong câu sai:', wrongSentence);
      return null;
    }


    return {
      ...parsed,
      wrongSentence,
      wrongWord: exactWrongWord,
      correction,
      explanation: explanation || 'Lỗi ngữ pháp hoặc ngữ cảnh trong câu.'
    };
  },


  // ============================================================================
  // 2. ĐỘNG CƠ TẠO ĐÁP ÁN NHIỄU (Quiz Options) — KỶ LUẬT THÉP & ĐỘC BẢN 2 CHIỀU
  // ============================================================================
  ai_generateOptions: async function (
    cardOrText,
    distractorLang,
    type,
    apiKey,
    count = 3,
    level = '',
    topic = '',
    isReverse = false
  ) {
    let term = '';
    let definition = '';
    if (typeof cardOrText === 'string') {
      term = cardOrText.trim();
      definition = '';
    } else if (cardOrText && typeof cardOrText === 'object') {
      term = String(cardOrText.term || '').trim();
      definition = String(cardOrText.definition || '').trim();
    }


    if (!term) return [];


    const safeCount = Math.max(1, Number(count) || 3);


    // Nhận diện song ngữ 4 tầng, tuyệt đối không nhận nhầm Tiếng Trung thành Tiếng Anh
    const foreignLang = resolveForeignLang(cardOrText, distractorLang, level);
    const mappedLevel = normalizeLevelKey(level, foreignLang);
    const safeTopic = normalizeTopic(topic);
    const foreignLangName = foreignLang === 'zh' ? 'TIẾNG TRUNG' : 'TIẾNG ANH';
    const foreignLangEngName = foreignLang === 'zh' ? 'CHINESE' : 'ENGLISH';


    // LẮP RÁP PROMPT: CHỈ THỊ TRỰC DIỆN
    let prompt = `[SYSTEM]: QUIZ GENERATOR ENGINE.\n`;
    prompt += `[SOURCE]:\n`;
    prompt += `- Original (${foreignLangName}): "${term}"\n`;
    if (definition) {
      prompt += `- Meaning (Vietnamese): "${definition}"\n`;
    }
    if (safeTopic) {
      prompt += `- Topic: "${safeTopic}"\n`;
    }
    prompt += `\n[TASK]:\n`;
    prompt += `STEP 1: Generate ${safeCount} traps ('foreignText') in ${foreignLangName} based on Original.\n`;
    prompt += `STEP 2: Translate the exact meaning of those ${safeCount} traps into Vietnamese ('vietnameseText'). DO NOT re-translate the original word.\n\n`;


    // KỶ LUẬT THÉP (FIREWALL + EQUALITY CHECK)
    prompt += `[STRICT CONSTRAINTS - MUST OBEY]:\n`;
    if (foreignLang === 'zh') {
      prompt += `1. NO SEMANTIC BLEEDING: 'foreignText' MUST ONLY contain REAL CHINESE (Hanzi) words. NO ENGLISH translation of morphemes.\n`;
    } else {
      prompt += `1. NO SEMANTIC BLEEDING: 'foreignText' MUST ONLY contain REAL ENGLISH words. NO Vietnamese text inside 'foreignText'.\n`;
    }
    if (definition) {
      prompt += `2. 2D UNIQUENESS: All ${safeCount} 'foreignText' MUST NOT EQUAL "${term}". All ${safeCount} 'vietnameseText' MUST NOT EQUAL "${definition}". No typo bypassing.\n`;
    } else {
      prompt += `2. 2D UNIQUENESS: All ${safeCount} 'foreignText' MUST NOT EQUAL "${term}". All ${safeCount} 'vietnameseText' MUST translate the trap, NOT "${term}". No typo bypassing.\n`;
    }
    prompt += `3. DICTIONARY WORDS ONLY: Must use REAL, EXISTING ${foreignLangEngName} words.\n`;
    prompt += `4. ENCODING: Return raw UTF-8 characters. NO \\uXXXX escaping.\n`;
    if (foreignLang === 'zh') {
      prompt += `5. CHARACTER FIREWALL: 'foreignText' MUST BE 100% AUTHENTIC CHINESE CHARACTERS (Hanzi). STRICTLY PROHIBITED to output Pinyin or Romanized spellings. Any output containing a-z letters will cause system failure.\n`;
    } else {
      prompt += `5. CHARACTER FIREWALL: 'foreignText' MUST BE STANDARD ENGLISH WORDS. STRICTLY PROHIBITED to output phonetic transcriptions (IPA) or pronunciation guides (like /.../ or [...]).\n`;
    }
    if (definition) {
      prompt += `6. ASSERTION: ASSERT(foreignText !== "${term}" && vietnameseText !== "${definition}"). IF MATCH, REGENERATE.\n\n`;
    } else {
      prompt += `6. ASSERTION: ASSERT(foreignText !== "${term}"). IF MATCH, REGENERATE.\n\n`;
    }


    // DYNAMIC MIMICRY: Bắt chước cấu trúc dấu phân tách của nghĩa gốc để tránh lộ đáp án
    if (type !== 'sentence' && definition) {
      const detectedSeparators = [];
      if (definition.includes(',')) detectedSeparators.push('comma (,)');
      if (definition.includes('/')) detectedSeparators.push('slash (/)');
      if (definition.includes(';')) detectedSeparators.push('semicolon (;)');
      if (detectedSeparators.length > 0) {
        prompt += `[STRUCTURAL MIMICRY]: Original translation contains ${detectedSeparators.join(
          ' and '
        )}. 'vietnameseText' MUST precisely mimic this format.\n\n`;
      }
    }


    if (type === 'sentence') {
      prompt += `[TẠO BẪY CÂU]: Giữ nguyên 70-80% từ vựng gốc. Đổi 1-2 tiểu tiết cốt lõi (chủ thể, hành động, từ trái nghĩa).\n`;
    } else {
      prompt += `[ROUTING]:\n`;
      let primaryTrap = null;
      let fallbackTraps = '';
      if (foreignLang === 'zh') {
        const termLen = Array.from(term).length;
        const traps =
          termLen === 1
            ? [
                { name: 'Đồng âm/Pinyin', desc: 'Đọc giống nhưng viết khác, nghĩa khác.' },
                { name: 'Chung gốc/Bán đồng hình', desc: 'Chung 1 nét/bộ thủ nhưng khác nghĩa.' },
                { name: 'Trái nghĩa', desc: 'Nghĩa đối lập hoàn toàn.' },
                { name: 'Cùng Chủ đề', desc: 'Cùng loại sự vật nhưng sai đối tượng.' }
              ]
            : [
                {
                  name: 'Từ ghép chung gốc (Shared Morpheme)',
                  desc: 'Tìm từ ghép khác chung 1 chữ Hán. BẮT BUỘC CHỮ CÒN LẠI KHÁC NHAU. (Gốc AB -> Bẫy AC/CB. CẤM trả về AB).'
                },
                { name: 'Trái nghĩa', desc: 'Nghĩa đối lập hoàn toàn.' },
                {
                  name: 'Cùng Chủ đề',
                  desc: 'Cùng loại sự vật/hành động nhưng sai đối tượng.'
                }
              ];


        const selectedIdx = Math.floor(Math.random() * traps.length);
        primaryTrap = traps[selectedIdx];
        const fallbacks = traps.filter((_, idx) => idx !== selectedIdx);
        fallbackTraps = fallbacks.map((item) => `- ${item.name}: ${item.desc}`).join('\n');
        prompt += `> BƯỚC 1 (ƯU TIÊN): Dùng bẫy [${primaryTrap.name}] (${primaryTrap.desc}).\n`;
        prompt += `> BƯỚC 2 (ANTI-BLOCK): Nếu bí, lập tức chuyển sang các bẫy dự phòng:\n${fallbackTraps}\n`;
        prompt += `> BƯỚC 3: Được phép trộn nhiều loại bẫy, miễn là CÓ THẬT và KHÁC TỪ GỐC.\n`;
      } else {
        const traps = [
          { name: 'Lookalikes', desc: 'Sai 1-2 ký tự hoặc phát âm giống.' },
          { name: 'Morphology', desc: 'Cùng gốc nhưng sai tiền/hậu tố.' },
          { name: 'Logic', desc: 'Trái nghĩa hoặc cùng chủ đề.' }
        ];
        const selectedIdx = Math.floor(Math.random() * traps.length);
        primaryTrap = traps[selectedIdx];
        const fallbacks = traps.filter((_, idx) => idx !== selectedIdx);
        fallbackTraps = fallbacks.map((item) => `- ${item.name}: ${item.desc}`).join('\n');
        prompt += `> BƯỚC 1 (ƯU TIÊN): Dùng bẫy [${primaryTrap.name}] (${primaryTrap.desc}).\n`;
        prompt += `> BƯỚC 2: Nếu bí, dùng bẫy dự phòng:\n${fallbackTraps}\n`;
      }
    }


    prompt += `\n[THOUGHT PROCESS]: Điền trường 'reasoning' TRƯỚC TIÊN (Ghi 1 câu ngắn gọn logic tạo bẫy).\n`;


    if (cardOrText && typeof cardOrText === 'object' && cardOrText.grammar_type) {
      const mp = GameAiEngine._getFuzzyMicroPrompt(cardOrText, 'quiz');
      if (mp) prompt += `\n[TARGET GRAMMAR]: ${mp}\n`;
    }
    prompt += GameAiEngine._getLevelContext(mappedLevel, true, foreignLang);


    // Tách riêng mô tả Schema theo ngôn ngữ để tránh mâu thuẫn tự triệt tiêu
    const foreignFieldDesc =
      foreignLang === 'zh'
        ? `Trap in CHINESE (Hanzi only). MUST NOT BE "${term}". STRICTLY NO PINYIN OR ENGLISH. STRICTLY NO UNICODE ESCAPING.`
        : `Trap in ENGLISH. MUST NOT BE "${term}". STRICTLY NO IPA OR PHONETIC GUIDES.`;


    const vietnameseFieldDesc = definition
      ? `Vietnamese translation of foreignText. MUST NOT BE "${definition}". MUST HAVE ACCENTS.`
      : `Accurate Vietnamese translation of foreignText (NOT "${term}"). MUST HAVE ACCENTS.`;


    const itemsSchema = {
      type: 'OBJECT',
      properties: {
        foreignText: { type: 'STRING', description: foreignFieldDesc },
        vietnameseText: { type: 'STRING', description: vietnameseFieldDesc }
      },
      required: ['foreignText', 'vietnameseText']
    };


    const schema = {
      type: 'OBJECT',
      properties: {
        reasoning: { type: 'STRING', description: 'Short reasoning logic.' },
        distractors: { type: 'ARRAY', items: itemsSchema }
      },
      required: ['reasoning', 'distractors']
    };


    const res = await callGeminiApi(prompt, schema, apiKey);
    const parsed = safeParseGeminiResult(res);
    const dists = Array.isArray(parsed?.distractors) ? parsed.distractors : [];


    // ============================================================================
    // TRẠM GÁC HẬU KỲ & BỘ LỌC ĐỘC BẢN 2 CHIỀU (POST-PROCESSING GATEKEEPER - NFC)
    // ============================================================================
    const validDistractors = [];
    const textSet = new Set([normalizeCompareKey(term)]);
    const meaningSet = new Set(definition ? [normalizeCompareKey(definition)] : []);


    for (const d of dists) {
      if (!d || typeof d !== 'object') continue;
      const fText = String(d.foreignText || '').trim();
      const vText = String(d.vietnameseText || '').trim();
      if (!fText || !vText) continue;


      // 1. Kiểm tra rò rỉ ngôn ngữ & phiên âm (Language & Phonetic Firewall)
      if (foreignLang === 'zh' && hasChineseLeak(fText, term)) {
        console.warn('[Gatekeeper] Phát hiện rò rỉ Pinyin/Tiếng Anh. Chém bỏ bẫy:', fText);
        continue;
      }
      if (foreignLang === 'en' && hasEnglishPhoneticLeak(fText)) {
        console.warn('[Gatekeeper] Phát hiện rò rỉ phiên âm IPA. Chém bỏ bẫy:', fText);
        continue;
      }


      // 2. Kiểm tra Độc bản 2 chiều chuẩn Unicode NFC (2D Uniqueness Check)
      const fKey = normalizeCompareKey(fText);
      const vKey = normalizeCompareKey(vText);
      if (!fKey || !vKey || textSet.has(fKey) || meaningSet.has(vKey)) {
        console.warn(
          '[Gatekeeper] Phát hiện trùng lặp Cột mốc/Nội bộ. Chém bỏ bẫy:',
          fText,
          '|',
          vText
        );
        continue;
      }


      // Vượt qua trạm gác -> Lưu vào danh sách an toàn và cập nhật Set
      textSet.add(fKey);
      meaningSet.add(vKey);
      validDistractors.push({ foreignText: fText, vietnameseText: vText });
    }


    // 3. Ánh xạ đầu ra theo chiều hỏi (Sự khuyết thiếu sẽ được GameOfflineEngine bù đắp)
    return validDistractors
      .map((d) => {
        if (!isReverse) {
          return { text: d.vietnameseText, meaning: d.foreignText };
        }
        return { text: d.foreignText, meaning: d.vietnameseText };
      })
      .slice(0, safeCount);
  },


  // ============================================================================
  // 3. ĐỘNG CƠ SINH RÁC TRỰC TUYẾN (Scramble Noise) + GATEKEEPER HẬU KIỂM
  // ============================================================================
  ai_getNoise: async function (
    correctText,
    lang,
    type,
    apiKey,
    count = 2,
    level = '',
    topic = '',
    card = null
  ) {
    const cleanText = String(correctText || '').trim();
    if (!cleanText) return [];


    const safeCount = Math.max(1, Number(count) || 2);
    const safeLang = resolveForeignLang(
      { language: card?.language, term: cleanText || card?.term },
      lang,
      level
    );
    const safeTopic = normalizeTopic(topic);
    const mappedLevel = normalizeLevelKey(level, safeLang);


    let prompt = '';
    let microPrompt = '';
    if (card) {
      if (card.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(card, 'scramble');
        if (mp) microPrompt = '\n[TARGET GRAMMAR]: ' + mp + '\n';
      } else {
        microPrompt =
          '\n[CHẨN ĐOÁN NGỮ PHÁP]: Phân tích cấu trúc cốt lõi. Sinh từ rác có thể phá vỡ cấu trúc đó (VD: thừa giới từ, sai liên từ).\n';
      }
    }


    if (type === 'word') {
      if (safeLang === 'zh') {
        prompt = `[NHIỆM VỤ]: Tạo ${safeCount} chữ Hán đơn ngẫu nhiên (cùng bộ thủ hoặc đồng âm, KHÔNG nằm trong từ gốc) với từ gốc: "${cleanText}" để làm nhiễu. CHỈ TRẢ VỀ CHỮ HÁN. BẮT BUỘC Raw UTF-8.`;
      } else {
        prompt = `[NHIỆM VỤ]: Tạo ${safeCount} chữ cái in thường (a-z) ngẫu nhiên làm nhiễu cho từ gốc: "${cleanText}".`;
      }
    } else {
      const langStr = safeLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';
      prompt = `Ngữ cảnh: "${cleanText}". Ngôn ngữ: ${langStr}.\n`;
      prompt += `[NHIỆM VỤ]: Tạo ${safeCount} từ vựng rác làm nhiễu (KHÔNG trùng với các từ đã có trong câu gốc).\n`;
      prompt += `[CHIẾN LƯỢC]: CÙNG TỪ LOẠI với các từ trong câu nhưng sai ngữ cảnh, để khi ghép vào sẽ tạo lỗi ngữ pháp.\n\n`;
      if (safeLang === 'zh') prompt += `BẮT BUỘC Raw UTF-8, không dùng \\uXXXX.\n`;
    }


    let injectedRule = '';
    if (IoeDataEngine && typeof IoeDataEngine.getMicroTierNoiseRule === 'function') {
      const targetLang = safeLang === 'zh' ? 'Chinese' : 'English';
      const dataMode = type === 'sentence' ? 'sentence' : 'vocab';
      const ruleStr = IoeDataEngine.getMicroTierNoiseRule(
        targetLang,
        dataMode,
        mappedLevel,
        safeTopic
      );
      if (ruleStr) injectedRule = '\n[ĐỊNH HƯỚNG RÁC]: ' + ruleStr;
    }


    prompt += microPrompt;
    prompt += injectedRule;
    prompt += GameAiEngine._getLevelContext(mappedLevel, false, safeLang);


    const schema = {
      type: 'OBJECT',
      properties: {
        noise: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'ARRAY OF RANDOM OR MISLEADING WORDS/CHARACTERS.'
        }
      },
      required: ['noise']
    };


    const res = await callGeminiApi(prompt, schema, apiKey);
    const parsed = safeParseGeminiResult(res);
    const rawNoise = Array.isArray(parsed?.noise) ? parsed.noise : [];


    // [VER 1.1] GATEKEEPER HẬU KIỂM CHO AI_GETNOISE
    const normalizedSource = normalizeCompareKey(cleanText);
    const existingTokenSet = new Set();


    if (safeLang === 'zh') {
      Array.from(cleanText).forEach((ch) => {
        const cleaned = normalizeCompareKey(ch.replace(EDGE_PUNCTUATION_REGEX, ''));
        if (cleaned) existingTokenSet.add(cleaned);
      });
      cleanText.split(/\s+/).forEach((seg) => {
        const cleaned = normalizeCompareKey(seg.replace(EDGE_PUNCTUATION_REGEX, ''));
        if (cleaned) existingTokenSet.add(cleaned);
      });
    } else if (type === 'word') {
      Array.from(cleanText).forEach((ch) => {
        const cleaned = normalizeCompareKey(ch);
        if (cleaned) existingTokenSet.add(cleaned);
      });
    } else {
      cleanText.split(/\s+/).forEach((word) => {
        const cleaned = normalizeCompareKey(word.replace(EDGE_PUNCTUATION_REGEX, ''));
        if (cleaned) existingTokenSet.add(cleaned);
      });
    }


    const seenNoise = new Set();
    const validNoise = [];


    for (const item of rawNoise) {
      if (validNoise.length >= safeCount) break;
      let token = item !== null && item !== undefined ? String(item).trim() : '';
      if (!token) continue;


      if (safeLang === 'zh') {
        if (hasChineseLeak(token, cleanText)) continue;
        if (type === 'word' && Array.from(token).length !== 1) continue;
      } else if (type === 'word') {
        token = token.toLowerCase();
        if (!/^[a-z]$/.test(token)) continue;
      } else if (hasEnglishPhoneticLeak(token)) {
        continue;
      }


      const stripped = token.replace(EDGE_PUNCTUATION_REGEX, '') || token;
      const tokenKey = normalizeCompareKey(stripped);
      if (!tokenKey) continue;


      if (existingTokenSet.has(tokenKey) || seenNoise.has(tokenKey)) continue;
      if (safeLang === 'zh' && type !== 'word' && normalizedSource.includes(tokenKey)) {
        continue;
      }


      seenNoise.add(tokenKey);
      validNoise.push(token);
    }


    return validNoise.slice(0, safeCount);
  },


  // ============================================================================
  // 4. ĐỘNG CƠ ĐỤC LỖ TRỰC TUYẾN (Cloze Mask) + TỰ PHỤC HỒI & GATEKEEPER HẬU KIỂM
  // ============================================================================
  ai_mask: async function (
    text,
    hintFallback,
    lang,
    apiKey,
    level = '',
    topic = '',
    card = null
  ) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;


    const safeLang = resolveForeignLang(
      { language: card?.language, term: cleanText || card?.term },
      lang,
      level
    );
    const safeTopic = normalizeTopic(topic);
    const mappedLevel = normalizeLevelKey(level, safeLang);
    const targetLang = safeLang === 'zh' ? 'Chinese' : 'English';
    const langName = safeLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';


    const rand = Math.floor(Math.random() * 100);
    let strategy = 1;
    if (rand >= 35 && rand < 70) strategy = 2;
    else if (rand >= 70) strategy = 3;


    let microPrompt = '';
    if (card) {
      if (card.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(card, 'fill_blank');
        if (mp) {
          microPrompt = '\n[TARGET GRAMMAR]: ' + mp + '\n';
          strategy = 2;
        }
      } else {
        microPrompt =
          '\n[CHẨN ĐOÁN NGỮ PHÁP]: Ưu tiên đục lỗ vị trí ngữ pháp then chốt (liên từ, giới từ, bổ ngữ) thay vì đục lỗ danh/động từ thông thường.\n';
      }
    }


    let prompt = `[SYSTEM]: CLOZE TEST GENERATOR.\n`;
    prompt += `[NHIỆM VỤ]: Tạo câu hỏi ĐIỀN TỪ VÀO CHỖ TRỐNG từ gốc: "${cleanText}". Nghĩa tham khảo: "${
      hintFallback || ''
    }". Ngôn ngữ đích: ${langName}.\n\n`;


    if (strategy === 1) {
      prompt += `[CHIẾN LƯỢC 1: COLLOCATIONS]\n`;
      prompt += `- Chỉ thị: Đục lỗ MỘT TỪ DUY NHẤT cấu thành nên một cụm từ cố định.\n`;
      prompt += `- Nhiễu: 3 đáp án nhiễu CÙNG TỪ LOẠI mà học viên dễ nhầm do thói quen dịch word-by-word.\n`;
      prompt += `- Gợi ý (hint): Dịch nghĩa ngắn gọn của TỪ BỊ ĐỤC LỖ sang tiếng Việt.\n`;
    } else if (strategy === 2) {
      prompt += `[CHIẾN LƯỢC 2: GRAMMAR & COHESION]\n`;
      prompt += `- Chỉ thị: Đục lỗ vị trí ngữ pháp (Giới từ, Mạo từ, Đại từ, Từ nối, Chia thì).\n`;
      prompt += `- Nhiễu: 3 đáp án nhiễu CÙNG TỪ LOẠI nhưng sai logic/cấu trúc.\n`;
      prompt += `- Gợi ý (hint): Giải thích ngắn gọn bằng Tiếng Việt tại sao dùng từ này (VD: "Đi với danh từ X").\n`;
    } else {
      prompt += `[CHIẾN LƯỢC 3: PARAPHRASING]\n`;
      prompt += `- Chỉ thị: Đục lỗ Tính từ, Động từ, hoặc Danh từ cốt lõi.\n`;
      prompt += `- Nhiễu: 3 từ hợp lệ ngữ pháp nhưng sai ý nghĩa ngữ cảnh.\n`;
      prompt += `- Gợi ý (hint): KHÔNG DỊCH TIẾNG VIỆT. Viết lại (paraphrase) từ bị đục bằng từ đồng nghĩa (synonyms) BẰNG CHÍNH NGÔN NGỮ ĐÍCH (${langName}).\n`;
    }


    prompt += `\n[QUY TẮC ĐỤC LỖ]:\n`;
    prompt += `- Thay thế từ bị đục bằng CHÍNH XÁC: "[__________]" (10 dấu gạch dưới).\n`;
    prompt += `- Giữ nguyên dấu câu xung quanh.\n`;
    if (safeLang === 'zh') prompt += `- ABSOLUTELY NO UNICODE ESCAPING. Return raw UTF-8.\n`;


    let injectedRule = '';
    if (IoeDataEngine && typeof IoeDataEngine.getMicroTierClozeRule === 'function') {
      const dataMode = 'sentence';
      const ruleStr = IoeDataEngine.getMicroTierClozeRule(
        targetLang,
        dataMode,
        mappedLevel,
        safeTopic
      );
      if (ruleStr) injectedRule = '\n[ĐỊNH HƯỚNG BỔ SUNG]: ' + ruleStr;
    }


    prompt += microPrompt;
    prompt += injectedRule;
    prompt += GameAiEngine._getLevelContext(mappedLevel, false, safeLang);


    const schema = {
      type: 'OBJECT',
      properties: {
        displaySentence: {
          type: 'STRING',
          description:
            'THE SENTENCE WITH EXACTLY 10 UNDERSCORES [__________] REPLACING THE TARGET WORD.'
        },
        targetWord: {
          type: 'STRING',
          description: 'THE EXACT CORRECT WORD REMOVED FROM THE SENTENCE.'
        },
        distractors: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'ARRAY OF 3 WRONG OPTIONS. MUST BE REAL WORDS.'
        },
        hint: { type: 'STRING', description: 'Hint in Vietnamese or paraphrased target language.' }
      },
      required: ['displaySentence', 'targetWord', 'distractors', 'hint']
    };


    const res = await callGeminiApi(prompt, schema, apiKey);
    const parsed = safeParseGeminiResult(res);
    if (!parsed) return null;


    // [VER 1.1] TỰ PHỤC HỒI & GATEKEEPER HẬU KIỂM CHO AI_MASK
    let displaySentence = String(parsed.displaySentence || '').trim();
    displaySentence = displaySentence.replace(/\[[\s_]{3,}\]/g, '[__________]');
    if (!displaySentence.includes('[__________]') && /_{4,}/.test(displaySentence)) {
      displaySentence = displaySentence.replace(/_{4,}/, '[__________]');
    }


    const targetWord = String(parsed.targetWord || '').trim();
    const hint = String(parsed.hint || '').trim() || String(hintFallback || '').trim();


    if (!displaySentence || !displaySentence.includes('[__________]') || !targetWord) {
      console.warn(
        '[Gatekeeper:ai_mask] Câu đục lỗ thiếu [__________] hoặc rỗng targetWord:',
        displaySentence
      );
      return null;
    }


    if (safeLang === 'zh' && hasChineseLeak(targetWord, cleanText)) {
      console.warn('[Gatekeeper:ai_mask] targetWord Tiếng Trung rò rỉ Pinyin/Latin:', targetWord);
      return null;
    }
    if (safeLang === 'en' && hasEnglishPhoneticLeak(targetWord)) {
      console.warn('[Gatekeeper:ai_mask] targetWord Tiếng Anh rò rỉ IPA:', targetWord);
      return null;
    }


    const rawDistractors = Array.isArray(parsed.distractors) ? parsed.distractors : [];
    const seenKeys = new Set([normalizeCompareKey(targetWord)]);
    const validDistractors = [];


    for (const item of rawDistractors) {
      if (validDistractors.length >= 3) break;
      const dist = item !== null && item !== undefined ? String(item).trim() : '';
      if (!dist) continue;


      if (safeLang === 'zh' && hasChineseLeak(dist, cleanText)) continue;
      if (safeLang === 'en' && hasEnglishPhoneticLeak(dist)) continue;


      const distKey = normalizeCompareKey(dist);
      if (!distKey || seenKeys.has(distKey)) continue;


      seenKeys.add(distKey);
      validDistractors.push(dist);
    }


    return {
      ...parsed,
      displaySentence,
      targetWord,
      distractors: validDistractors,
      hint
    };
  }
};


if (typeof window !== 'undefined') {
  window.GameAiEngine = GameAiEngine;
}


export default GameAiEngine;

