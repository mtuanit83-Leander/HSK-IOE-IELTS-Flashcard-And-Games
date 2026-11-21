// ============================================================================
// FILE 21/85: src/engines/aiFactory.js
// NGUỒN GỐC: Tầng 2 - Block 2.6 (AI Factory Engine V1.55)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 21/11/2026 - 17:49 (GMT+7)
// NHIỆM VỤ: Nhà máy 3 Lò đúc AI 1-Shot (Đúc thẻ cơ sở, Đúc ma trận 4 lựa chọn,
//           Đúc ngữ cảnh Nghe/Đọc) và Làm giàu hàng loạt (Batch Enrich);
//           vá dứt điểm lỗi ghi đè isReverse bởi fc_quiz_config/fc_settings,
//           chuẩn hóa Array Armor cho topic, đồng nhất definition câu văn
//           và bảo vệ an toàn ghi nhận fc_total_tokens.
// ============================================================================

import { IoeEnumRegistry } from '../config/constants.js';
import {
  safeJsonParse,
  parseAiJson,
  shuffleArray,
  buildSmartImageUrl
} from '../utils/helpers.js';
import { callGeminiApi } from '../services/geminiApi.js';
import { IoeDataEngine } from './pedagogyEngine.js';

const DEFAULT_CEFR_MAP = {
  en_level_1: 'Pre-A1 (Starters/Beginner)',
  en_level_2: 'A1 (Movers/Elementary)',
  en_level_3: 'A2 (Flyers/Pre-Intermediate)',
  en_level_4: 'B1 (PET/Intermediate)',
  en_level_5: 'B2 (FCE/Upper-Intermediate)',
  en_level_6: 'B2+ (IELTS 5.5 - 6.0)',
  en_level_7: 'C1 (IELTS 6.5 - 7.0/Advanced)',
  en_level_8: 'C1+ (IELTS 7.5)',
  en_level_9: 'C2 (IELTS 8.0+/Proficiency)',
  zh_level_1: 'HSK 1 (A1 - Beginner)',
  zh_level_2: 'HSK 2 (A2 - Elementary)',
  zh_level_3: 'HSK 3 (B1 - Intermediate)',
  zh_level_4: 'HSK 4 (B2 - Upper-Intermediate)',
  zh_level_5: 'HSK 5 (C1 - Advanced)',
  zh_level_6: 'HSK 6 (C2 - Proficiency)',
  zh_level_7: 'HSK 7 (Expert/Academic)',
  zh_level_8: 'HSK 8 (Mastery/Academic)',
  zh_level_9: 'HSK 9 (Native-like/Academic)',
  level_1_kiddie: 'Pre-A1 (Starters)',
  level_2_junior_basic: 'A1 (Movers)',
  level_3_junior_advanced: 'A2 (Flyers)',
  level_4_discovery_basic: 'B1 (PET)',
  level_5_discovery_advanced: 'B2 (FCE)',
  level_6_pre_ielts: 'B2+ (IELTS 5.5 - 6.0)',
  level_7_breakthrough: 'C1 (IELTS 6.5 - 7.0)',
  level_8_academic: 'C1+ (IELTS 7.5)',
  level_9_expert: 'C2 (IELTS 8.0+)'
};

const IMAGE_KEYWORD_SCHEMA_DESC =
  'A concrete 3 to 6 word ENGLISH visual scene description for clean illustration search (NO Chinese characters, NO Vietnamese, NO URLs, NO single abstract word).';

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

const ADVANCED_LEVEL_KEYWORDS = [
  'level_5',
  'level_6',
  'level_7',
  'level_8',
  'level_9',
  'hsk5',
  'hsk6',
  'hsk7',
  'hsk8',
  'hsk9',
  'hsk 5',
  'hsk 6',
  'hsk 7',
  'hsk 8',
  'hsk 9',
  'c1',
  'c2'
];

const resolveCefrLevel = (level) => {
  const resolveSingle = (lvlKey) => {
    if (
      typeof window !== 'undefined' &&
      window.ExamProfiles &&
      typeof window.ExamProfiles.getCefrLevel === 'function'
    ) {
      return window.ExamProfiles.getCefrLevel(lvlKey);
    }
    return DEFAULT_CEFR_MAP[lvlKey] || 'B1 (Intermediate)';
  };

  if (Array.isArray(level) && level.length > 0) {
    const mapped = [...new Set(level.map((lvl) => resolveSingle(lvl)).filter(Boolean))];
    return mapped.length > 0 ? mapped.join(' / ') : 'B1 (Intermediate)';
  }
  return resolveSingle(level);
};

// [VER 1.1] Helper duy nhất tính Ngưỡng Từ loại Động cho đủ 9 cấp độ (en_level_1..9 & zh_level_1..9)
const resolvePosThreshold = (level) => {
  const levelCheckStr = Array.isArray(level)
    ? level.join(',').toLowerCase()
    : String(level || '').toLowerCase();
  if (!levelCheckStr) return '20%';
  const isAdvancedLevel = ADVANCED_LEVEL_KEYWORDS.some((kw) => levelCheckStr.includes(kw));
  return isAdvancedLevel ? '10%' : '20%';
};

// [VER 1.1] Đọc động Timeout với biên độ rộng hơn tầng geminiApi.js (+12000ms) để đủ dư địa cho Cascade đa model
const resolveDynamicTimeout = (defaultMs = 32000, extraMs = 0) => {
  try {
    const aiCfg = safeJsonParse('fc_ai_config', null);
    const loadingSec = parseInt(aiCfg?.loadingTime, 10);
    if (!isNaN(loadingSec) && loadingSec > 0) {
      return loadingSec * 1000 + 12000 + extraMs;
    }
  } catch (e) {
    // Bỏ qua lỗi đọc cấu hình
  }
  return defaultMs + extraMs;
};

// [VER 1.2] Ghi nhận Token an toàn tuyệt đối (chống QuotaExceededError & NaN)
const safeAddTotalTokens = (tokenMetadata) => {
  if (!tokenMetadata || typeof localStorage === 'undefined') return;
  const used = Number(tokenMetadata.totalTokenCount || 0);
  if (!Number.isFinite(used) || used <= 0) return;
  try {
    const prevRaw = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
    const prevSafe = Number.isFinite(prevRaw) && prevRaw >= 0 ? prevRaw : 0;
    localStorage.setItem('fc_total_tokens', String(prevSafe + used));
  } catch (e) {
    console.warn('[AiFactoryEngine] Không thể cập nhật fc_total_tokens:', e?.message || e);
  }
};

// [VER 1.2] Chuẩn hóa chủ đề hỗ trợ Multi-select Array Armor
const normalizeTopicInput = (topic) => {
  const isWildcard = (val) => {
    const low = String(val || '').trim().toLowerCase();
    return !low || low === 'any' || low === 'all' || low === 'tất cả';
  };
  if (Array.isArray(topic)) {
    const cleaned = [...new Set(topic.map((t) => String(t || '').trim()).filter((t) => !isWildcard(t)))];
    return cleaned.join(', ');
  }
  const single = String(topic || '').trim();
  return isWildcard(single) ? '' : single;
};

// Helper nội bộ: Ma trận Chuyển hóa Thị giác tách nhánh theo ngôn ngữ (en vs zh)
const buildVisualImageRule = (lang, dataMode = 'vocab') => {
  if (dataMode === 'sentence') {
    return (
      `QUY TẮC ẢNH MINH HỌA ('image_keyword'): Cụm 3 đến 6 từ TIẾNG ANH mô tả 1 khung cảnh/hành động hữu hình minh họa cho câu văn ` +
      `(VD: "student studying books at wooden desk"). TUYỆT ĐỐI CẤM xuất chữ Hán, Pinyin, tiếng Việt, URL hoặc chuỗi "none"/"null".\n`
    );
  }

  if (lang === 'zh') {
    return (
      `QUY TẮC ẢNH MINH HỌA ('image_keyword'): Cụm 3 đến 6 từ TIẾNG ANH mô tả 1 KHUNG CẢNH HOẶC VẬT THỂ HỮU HÌNH (concrete visual scene) minh họa trực tiếp cho nghĩa chính của từ Tiếng Trung.\n` +
      `  1. TUYỆT ĐỐI CẤM xuất chữ Hán, Pinyin, tiếng Việt, URL, chuỗi "none"/"null", hoặc 1 từ đơn trừu tượng.\n` +
      `  2. CHUYỂN HÓA THỊ GIÁC THEO TỪ LOẠI TIẾNG TRUNG:\n` +
      `     • Danh từ cụ thể: [Đặc tính] + [Vật thể/Sinh vật chính] + [Bối cảnh sạch] (VD: 苹果 -> "fresh red apple on white plate").\n` +
      `     • Danh từ trừu tượng: Chuyển thành biểu tượng hoặc hiện trường thực tế đại diện (VD: 压力 -> "tired office worker holding head at desk").\n` +
      `     • Động từ / Động từ ly hợp (离合词): [Chủ thể người rõ ràng] + [Hành động có tư thế nhìn thấy được] (VD: 散步 -> "couple walking peacefully in green park").\n` +
      `     • Tính từ / Trạng từ: [Nhân vật có biểu cảm rõ] HOẶC [Vật thể mang đặc tính điển hình] (VD: 脆弱 -> "cracked glass vase on wooden table").\n` +
      `     • Lượng từ (量词) & Hư từ: BẮT BUỘC ghép vào 1-2 vật thể đại diện điển hình nhất (VD: 条 -> "long winding river and swimming fish"; 双 -> "pair of red sneakers and wooden chopsticks").\n` +
      `     • Thành ngữ (成语): Vẽ hình tượng nghĩa đen tạo hình hoặc tình huống hành vi thực tế (VD: 井底之蛙 -> "green frog sitting inside deep stone well").\n`
    );
  }

  return (
    `QUY TẮC ẢNH MINH HỌA ('image_keyword'): Cụm 3 đến 6 từ TIẾNG ANH mô tả 1 KHUNG CẢNH HOẶC VẬT THỂ HỮU HÌNH (concrete visual scene) minh họa trực tiếp cho nghĩa chính của từ Tiếng Anh.\n` +
    `  1. TUYỆT ĐỐI CẤM xuất tiếng Việt, URL, ký tự đặc biệt, chuỗi "none"/"null", hoặc chỉ lặp lại 1 từ đơn trừu tượng.\n` +
    `  2. CHUYỂN HÓA THỊ GIÁC THEO TỪ LOẠI TIẾNG ANH:\n` +
    `     • Concrete Noun: [Color/Feature] + [Main Object] + [Clean Setting] (e.g., apple -> "fresh red apple on white plate").\n` +
    `     • Abstract Noun: Visual metaphor or concrete real-world scene (e.g., inflation -> "shopping cart with rising price tags").\n` +
    `     • Verb / Phrasal Verb: [Clear Subject] + [Visible Gesture/Action] (e.g., negotiate -> "two business people shaking hands across table").\n` +
    `     • Adjective / Adverb: [Expressive Person] OR [Iconic Object showing trait] (e.g., fragile -> "cracked glass vase on wooden table").\n` +
    `     • Preposition / Function Word: Spatial diagram with simple objects (e.g., between -> "red ball sitting between two blue boxes").\n` +
    `     • Idiom: Concrete visual scene representing the meaning (e.g., break the ice -> "friendly coworkers smiling shaking hands at party").\n`
  );
};

// [VER 1.1] Lọc từ khóa ảnh rác ("none", "null", "n/a") và chặn chữ Hán
const sanitizeImageKeyword = (raw) => {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || INVALID_IMAGE_KEYWORDS.has(trimmed.toLowerCase())) return '';
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return '';
  return trimmed;
};

// [VER 1.1] Dựng URL ảnh sạch qua buildSmartImageUrl, không lưu từ khóa rác và không fallback chữ Hán
const buildSafeFactoryImage = (rawKeyword, fallbackTerm, lang, dataMode = 'vocab') => {
  const cleanKeyword = sanitizeImageKeyword(rawKeyword);
  const safeFallback =
    lang === 'zh' || dataMode === 'sentence' ? '' : sanitizeImageKeyword(fallbackTerm);
  const effectiveKeyword = cleanKeyword || safeFallback;
  const imageUrl = effectiveKeyword ? buildSmartImageUrl(effectiveKeyword, '', dataMode) : '';
  return {
    image_keyword: imageUrl ? effectiveKeyword : '',
    image: imageUrl || ''
  };
};

export const AiFactoryEngine = {
  // ============================================================================
  // 1. CÁC HÀM TIỆN ÍCH DÙNG CHUNG (BATCH ENRICH & HISTORY)
  // ============================================================================
  batchEnrich: async function (cards, queueIndices, maxCount, lang, apiKey) {
    if (!apiKey || typeof callGeminiApi !== 'function') {
      return { updatedCards: cards, hasUpdates: false };
    }

    const updatedCards = [...cards];
    let hasUpdates = false;
    const batchTargets = [];

    for (let i = 0; i < queueIndices.length; i++) {
      if (batchTargets.length >= maxCount) break;
      const cardIdx = queueIndices[i];
      const c = updatedCards[cardIdx];
      if (c && (!c.definition || c.definition.trim() === '')) {
        batchTargets.push({ idx: cardIdx, term: c.term });
      }
    }

    if (batchTargets.length > 0) {
      let timeoutId = null;
      try {
        const targetLangName = lang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';
        // [V1.50] Anti-Encyclopedic Prompt for Batch Enrich
        let prompt =
          'Cung cấp bản dịch Tiếng Việt trực tiếp và chuẩn xác nhất cho ' +
          batchTargets.length +
          ' từ/cụm từ ' +
          targetLangName +
          " sau. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa (VD: 'Day' dịch là 'Ngày', KHÔNG dịch là 'Khoảng thời gian 24 giờ'; 'Music' là 'Âm nhạc', KHÔNG dịch là 'Nghệ thuật âm thanh'). Ưu tiên bản dịch cực ngắn (1-3 từ, trừ thành ngữ).\nDanh sách:\n";
        prompt += batchTargets.map((b, i) => i + 1 + '. ' + b.term).join('\n');
        prompt +=
          "\n\nBẮT BUỘC trả về chính xác một JSON object chứa mảng 'translations'.\nĐịnh dạng: {\"translations\": [\"nghĩa 1\", \"nghĩa 2\", ...]}";

        const schema = {
          type: 'OBJECT',
          properties: {
            translations: { type: 'ARRAY', items: { type: 'STRING' } }
          },
          required: ['translations']
        };

        const aiPromise = callGeminiApi(prompt, schema, apiKey);
        const dynamicTimeout = resolveDynamicTimeout(30000);

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout')), dynamicTimeout);
        });

        const res = await Promise.race([aiPromise, timeoutPromise]);
        const parsed = parseAiJson(res?.text);

        if (parsed && Array.isArray(parsed.translations)) {
          const limit = Math.min(parsed.translations.length, batchTargets.length);
          for (let i = 0; i < limit; i++) {
            const b = batchTargets[i];
            updatedCards[b.idx] = { ...updatedCards[b.idx], definition: parsed.translations[i] };
          }
          hasUpdates = true;
          safeAddTotalTokens(res?.tokenMetadata);
        }
      } catch (e) {
        console.warn('Pre-flight Batch enrich error:', e);
        if (typeof window !== 'undefined' && window.logSystemEvent) {
          window.logSystemEvent('Lỗi tự động điền từ (Batch Enrich) sập', e);
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    return { updatedCards, hasUpdates };
  },

  getHistoryPrompt: function (historyArray) {
    if (!historyArray || historyArray.length === 0) return '';
    const stopWords = [
      'the', 'and', 'are', 'was', 'were', 'that', 'this', 'have', 'has', 'had',
      'what', 'when', 'where', 'who', 'how', 'why', 'then', 'there', 'their',
      'they', 'them', 'with', 'from', 'about'
    ];
    const processedHistory = [];

    historyArray.slice(-80).forEach((item) => {
      if (typeof item !== 'string') return;
      if (item.length > 30) {
        const words = item
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, ' ')
          .split(/\s+/);
        const validWords = words.filter((w) => w.length > 1 && !stopWords.includes(w));
        const keywords = [...new Set(validWords)].slice(0, 5).join(' ');
        if (keywords) processedHistory.push(keywords);
      } else {
        processedHistory.push(item);
      }
    });

    return (
      '\n\nHISTORY (LỊCH SỬ): Vui lòng cố gắng tránh lặp lại các khái niệm gần đây sau đây để nội dung luôn mới mẻ: [' +
      processedHistory.join(' | ') +
      '].\n'
    );
  },

  // ============================================================================
  // 2. MASTER PROMPT BUILDER, SCHEMAS & LÕI GỌI LÒ ĐÚC CHUNG
  // ============================================================================
  _buildSystemPrompt: function (
    forgeType,
    subType,
    level,
    lang,
    topic,
    dataMode = 'vocab',
    isReverse = false
  ) {
    // [VER 1.2] Tôn trọng tuyệt đối tham số isReverse truyền tường minh từ ExamEngine / QuizGame / Mock Test.
    // Đã gỡ bỏ hoàn toàn việc đọc lén localStorage (fc_settings.startSide & fc_quiz_config.askMode) gây nhiễm chéo chiều đáp án.
    const actualIsReverse = Boolean(isReverse);

    const activePedagogyEngine =
      IoeDataEngine || (typeof window !== 'undefined' ? window.IoeDataEngine : null);
    const targetLangName = lang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';
    const cefrLevel = resolveCefrLevel(level);
    const levelDisplay = Array.isArray(level) ? level.join(', ') : level;
    const posThresholdStr = resolvePosThreshold(level);

    // Lấy luật Sư phạm động từ Ma trận (Pedagogy Routing Matrix)
    const pedagogyRules = activePedagogyEngine?.getPedagogyMatrixRule
      ? activePedagogyEngine.getPedagogyMatrixRule(level, lang)
      : {
          example: 'Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng.',
          definition:
            'Bản dịch Tiếng Việt trực tiếp, chuẩn xác. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa.'
        };

    let prompt = `Bạn là một gia sư ${targetLangName} chuyên nghiệp và tận tâm, đang tạo nội dung cho một ứng dụng giáo dục.\n`;
    prompt += `CẤP ĐỘ MỤC TIÊU: ${levelDisplay} (Tiêu chuẩn tương đương: ${cefrLevel}).\n`;

    // Hợp nhất ngữ cảnh đa cấp độ (Multi-select Level Contexts)
    if (level) {
      const levelArr = Array.isArray(level) ? level : [level];
      const contexts = levelArr
        .map((lvl) => activePedagogyEngine?.GRADE_CONTEXTS?.[lvl])
        .filter(Boolean);
      if (contexts.length > 0) {
        prompt += `NGỮ CẢNH (CONTEXT): ${contexts.join(' | ')}\n`;
      }
    }

    if (lang === 'zh') {
      prompt += `QUY TẮC TỪ VỰNG: Vui lòng sử dụng từ vựng phù hợp với tiêu chuẩn ${levelDisplay}. Đối với cấp độ cơ bản (HSK 1-2), chỉ dùng các từ giao tiếp hàng ngày cơ bản. Với cấp độ cao hơn, dùng từ vựng nâng cao phù hợp nhưng không quá hiếm gặp hoặc tối nghĩa.\n`;
    } else {
      prompt += `QUY TẮC TỪ VỰNG: Vui lòng sử dụng từ vựng bám sát tiêu chuẩn ${cefrLevel}. Đảm bảo độ khó hoàn toàn phù hợp với học viên mục tiêu.\n`;
    }

    if (dataMode === 'sentence' || subType === 'grammar_mcq') {
      prompt += `QUY TẮC ĐỊNH DẠNG: Trường 'displaySentence' và tất cả các đáp án (options) đều phải là các câu văn hoàn chỉnh, nghe tự nhiên.\n`;
    } else {
      if (lang === 'zh') {
        prompt += `QUY TẮC ĐỊNH DẠNG: Đối với HSK 1 hoặc 2, hãy giữ cho các đáp án (options) tương đối ngắn gọn và dễ đọc.\n`;
      } else {
        prompt += `QUY TẮC ĐỊNH DẠNG: Đối với cấp độ cơ bản (Pre-A1 đến A2), hãy giữ cho các đáp án (options) tương đối đơn giản, dễ đọc.\n`;
      }
    }

    if (lang === 'zh') {
      prompt += `GẮN NHÃN CẤP ĐỘ: Vui lòng khai báo đúng cấp độ HSK vào trường 'cefr_level' (ví dụ: 'HSK 3').\n`;
    } else {
      prompt += `GẮN NHÃN CẤP ĐỘ: Vui lòng khai báo đúng cấp độ CEFR vào trường 'cefr_level' (ví dụ: 'B1').\n`;
    }

    const cleanTopic = normalizeTopicInput(topic);
    const isTopicFree =
      !cleanTopic ||
      subType === 'pronunciation' ||
      subType === 'odd_one_out' ||
      subType === 'spot_mistake';
    if (isTopicFree) {
      prompt += `TỰ DO CHỦ ĐỀ: Bạn có thể tùy ý chọn từ các chủ đề ${lang === 'zh' ? 'đời sống hàng ngày' : 'Cambridge'} phổ biến.\n`;
    } else {
      prompt += `TẬP TRUNG CHỦ ĐỀ: Vui lòng tạo nội dung liên quan chặt chẽ đến chủ đề: "${cleanTopic}".\n`;
    }

    if (forgeType === 'base_card') {
      prompt += `NHIỆM VỤ: Tạo một ${dataMode === 'sentence' ? 'câu văn' : 'từ vựng'} phù hợp với cấp độ và chủ đề đã giao.\n`;
      const typeRule = activePedagogyEngine?.getMicroTierVocabTypeRule
        ? activePedagogyEngine.getMicroTierVocabTypeRule(level)
        : '';
      if (typeRule && dataMode === 'vocab') {
        prompt += typeRule + '\n';
        prompt += `TÍNH TRỰC QUAN: Đối với từ vựng, ưu tiên chọn các danh từ cụ thể, có hình khối rõ ràng nếu có thể.\n`;
      }

      if (dataMode === 'sentence') {
        prompt += `QUY TẮC CÂU VĂN & ĐỊNH NGHĨA: Trường 'term' là câu văn hoàn chỉnh tuân thủ: ${pedagogyRules.example}\n`;
        prompt += `Trường 'definition' là bản dịch Tiếng Việt tự nhiên, chuẩn xác của toàn bộ câu 'term'.\n`;
        prompt += buildVisualImageRule(lang, 'sentence');

        if (IoeEnumRegistry && IoeEnumRegistry.LEVEL_TO_TRAPS) {
          const tagsArr = [];
          const prefix = lang === 'zh' ? 'zh' : 'en';
          for (const [lvl, traps] of Object.entries(IoeEnumRegistry.LEVEL_TO_TRAPS)) {
            if (lvl.startsWith(prefix)) tagsArr.push(...traps);
          }
          const uniqueTags = [...new Set(tagsArr)];
          if (uniqueTags.length > 0) {
            prompt += `QUY TẮC NHÃN NGỮ PHÁP ('grammar_type'): Nếu câu mang cấu trúc giao tiếp bình thường, trả về mảng rỗng []. Nếu có cấu trúc đặc trưng, chỉ chọn 1-2 mã cốt lõi từ: [${uniqueTags.join(', ')}].\n`;
          }
        }
      } else {
        prompt += `QUY TẮC ĐỊNH NGHĨA: Trường 'definition' BẮT BUỘC tuân thủ: ${pedagogyRules.definition}\n`;
        prompt += buildVisualImageRule(lang, 'vocab');

        // PRE-COMPUTATION CONSTRAINT: Dời luật Ngữ pháp lên trước luật JSON và thêm Pedagogical Prompt
        prompt += `\n[CÁC LỖI NGỮ PHÁP NGHIÊM CẤM]:\n`;
        const grammarRule = activePedagogyEngine?.getMicroTierGrammarRule
          ? activePedagogyEngine.getMicroTierGrammarRule(lang)
          : `- Chỉ phân loại theo đúng ngữ pháp ngôn ngữ gốc, tuyệt đối không vay mượn ngữ pháp bản dịch Tiếng Việt.\n`;
        prompt += grammarRule + '\n';

        // [V1.52] PROMPT RESTRUCTURING: Tái cấu trúc Prompt trường 'example'
        prompt += `\n[QUY TẮC ĐỊNH DẠNG JSON (TỪ VỰNG)]:\n`;
        prompt += `  -> THỨ TỰ BẮT BUỘC: Phải xuất trường 'posAnalysis' ĐẦU TIÊN trong chuỗi JSON để làm nháp.\n`;
        prompt += `  -> 'posAnalysis' (TỜ GIẤY NHÁP): Tư duy theo chuỗi. BẮT BUỘC viết phân tích chức năng ngữ pháp TRƯỚC, sau đó mới chốt lại tỉ lệ % ở cuối cùng. (VD: Từ này ghép bởi A và B, hoạt động như C, do đó C chiếm 100%, D chiếm 0%). [LUẬT ÉP 0%]: Nếu vi phạm [CÁC LỖI NGỮ PHÁP NGHIÊM CẤM], lập tức ép % về 0.\n`;
        prompt += `  -> 'partOfSpeech': Dựa vào 'posAnalysis', CHỈ xuất các từ loại >${posThresholdStr}, cách nhau bằng '|'. Dịch tên từ loại sang Tiếng Việt.\n`;
        prompt += `  -> 'example': Câu ví dụ BẮT BUỘC phải chứa CHÍNH XÁC từ vựng ở trường 'term'. [TIÊU CHUẨN SƯ PHẠM]: ${pedagogyRules.example}\n`;
        prompt += `  -> [ĐỊNH DẠNG BẮT BUỘC CỦA EXAMPLE]:\n`;
        prompt += `     1. Ánh xạ 1:1 với 'partOfSpeech' (Đúng số lượng, đúng thứ tự từ loại), mỗi câu 1 dòng.\n`;
        prompt += `     2. Bắt đầu mỗi câu bằng dấu "- " (gạch ngang và khoảng trắng), theo sau là: Câu ngoại ngữ | Bản dịch.\n`;
        prompt += `     3. KHÔNG chứa Pinyin/IPA, KHÔNG chèn tag từ loại.\n`;
      }
    } else if (forgeType === 'matrix') {
      if (subType === 'match' || subType === 'match_hard') {
        prompt += `NHIỆM VỤ: Tạo chính xác 5 cặp ${dataMode === 'sentence' ? 'câu văn' : 'từ vựng'} và bản dịch Tiếng Việt chính xác của chúng.\n`;
        prompt += `QUY TẮC DỊCH NGHĨA: ${pedagogyRules.definition}\n`;
        if (subType === 'match_hard') {
          prompt += `NHIỆM VỤ BỔ SUNG: Tạo thêm 2 mục BẪY (đáp án sai, có vẻ hợp lý) để thử thách học viên, kèm theo giải thích bằng Tiếng Việt.\n`;
        }
      } else if (subType === 'odd_one_out') {
        const allTopics = [
          'Animals', 'Food', 'Colors', 'Numbers', 'Body parts', 'Clothes',
          'House', 'School', 'Jobs', 'Weather', 'Sports', 'Vehicles',
          'Nature', 'Emotions', 'Technology', 'Space', 'Art', 'Music',
          'Medicine', 'Business'
        ];
        const shuffledTopics = shuffleArray
          ? shuffleArray([...allTopics])
          : allTopics.sort(() => Math.random() - 0.5);
        prompt += `NHIỆM VỤ: Tạo một câu hỏi 'Tìm Từ Khác Loại' gồm 4 từ ${targetLangName} ở cấp độ ${cefrLevel}.\n`;
        prompt += `MỒI NGỮ NGHĨA: Hãy chọn 3 từ thuộc nhóm [${shuffledTopics[0]}] và 1 từ khác loại thuộc nhóm [${shuffledTopics[1]}].\n`;
        const oddRule = activePedagogyEngine?.getMicroTierOddRule
          ? activePedagogyEngine.getMicroTierOddRule(lang, dataMode, level, cleanTopic || 'ANY')
          : '';
        if (oddRule) prompt += oddRule + '\n';
        prompt += `QUY TẮC BẮT BUỘC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT.\n`;
      } else if (subType === 'pronunciation') {
        prompt += `NHIỆM VỤ: Tạo một câu hỏi Ngữ âm/Phát âm gồm 4 từ ${targetLangName} ở cấp độ ${cefrLevel}.\n`;
        prompt += `QUY TẮC BẮT BUỘC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT.\n`;
      }
    } else if (forgeType === 'context') {
      if (subType === 'fill_blank') {
        prompt += `NHIỆM VỤ: Tạo một câu văn ${targetLangName} ở cấp độ ${cefrLevel}. Chọn MỘT từ vựng quan trọng làm 'targetWord'.\n`;
        prompt += `TỐI QUAN TRỌNG: KHÔNG ĐƯỢC chèn '[__________]' vào trong câu. Trường 'displaySentence' BẮT BUỘC phải chứa nguyên văn toàn bộ câu không bị chỉnh sửa.\n`;
        const clozeRule = activePedagogyEngine?.getMicroTierClozeRule
          ? activePedagogyEngine.getMicroTierClozeRule(lang, dataMode, level, cleanTopic || 'ANY')
          : '';
        if (clozeRule) prompt += clozeRule + '\n';
        prompt += `QUY TẮC: Trường 'hint' chính là bản dịch Tiếng Việt của toàn bộ câu văn đó.\n`;
      } else if (subType === 'vocab_mcq' || subType === 'grammar_mcq') {
        const isSentenceTask = dataMode === 'sentence' || subType === 'grammar_mcq';
        prompt += `NHIỆM VỤ: Tạo một câu hỏi trắc nghiệm kiểm tra kỹ năng ${isSentenceTask ? 'đọc hiểu câu văn' : 'nhận diện từ vựng'} ở cấp độ ${cefrLevel}.\n`;
        prompt += `QUY TẮC RÀNG BUỘC DỮ LIỆU JSON (JSON DATA BINDING RULES):\n`;
        prompt += `- 'term': Từ/cụm từ mục tiêu cốt lõi bằng ${targetLangName}.\n`;
        if (isSentenceTask) {
          prompt += `- 'displaySentence': Một câu văn hoàn chỉnh bằng ${targetLangName} chứa từ 'term'.\n`;
          if (actualIsReverse) {
            prompt += `- 'definition': BẢN DỊCH TIẾNG VIỆT HOÀN CHỈNH của 'displaySentence' (Điều này cực kỳ quan trọng đối với Chế độ Đảo ngược để dùng làm câu hỏi).\n`;
            prompt += `- 'options': 4 câu văn hoàn chỉnh bằng ${targetLangName} (1 câu đúng, 3 câu nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT nội dung của trường 'displaySentence'.\n`;
          } else {
            prompt += `- 'definition': BẢN DỊCH TIẾNG VIỆT HOÀN CHỈNH, tự nhiên của câu 'displaySentence'.\n`;
            prompt += `- 'options': 4 câu văn hoàn chỉnh bằng TIẾNG VIỆT dịch nghĩa cho 'displaySentence' (1 đáp án dịch đúng, 3 đáp án nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT nội dung của trường 'definition'.\n`;
          }
        } else {
          prompt += `- 'definition': ${pedagogyRules.definition}\n`;
          prompt += `- 'displaySentence': Một câu ví dụ ngắn gọn bằng ${targetLangName}.\n`;
          if (actualIsReverse) {
            prompt += `- 'options': 4 từ/cụm từ ngắn bằng ${targetLangName} dịch từ 'definition' (1 đúng, 3 nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT nội dung của trường 'term'.\n`;
          } else {
            prompt += `- 'options': 4 từ/cụm từ ngắn bằng TIẾNG VIỆT dịch nghĩa cho 'term' (1 đúng, 3 nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT nội dung của trường 'definition'.\n`;
          }
        }
        prompt += `ĐÁP ÁN NHIỄU (DISTRACTORS): Cung cấp 3 đáp án nhiễu sai nhưng có vẻ hợp lý và liên quan đến chủ đề.\n`;
        prompt += buildVisualImageRule(lang, isSentenceTask ? 'sentence' : 'vocab');
        prompt += `QUY TẮC BẮT BUỘC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT, giải thích lý do tại sao đáp án đúng lại phù hợp và tại sao các đáp án khác lại sai.\n`;
      } else if (subType === 'spot_mistake') {
        prompt += `NHIỆM VỤ: Tạo một câu ${targetLangName} ở cấp độ ${cefrLevel} chứa DUY NHẤT MỘT lỗi sai nhỏ (về ngữ pháp hoặc từ vựng).\n`;
        prompt += `QUY TẮC SƯ PHẠM: Câu văn BẮT BUỘC tuân thủ: ${pedagogyRules.example}\n`;
        prompt += `VẮC-XIN CHỐNG LỖI TỪ ĐỒNG DẠNG (SUBSTRING FALLACY): Từ bị sai PHẢI là một từ độc lập trong câu. TUYỆT ĐỐI CẤM chọn một từ nằm bên trong một từ ghép khác để làm lỗi.\n`;
        prompt += `QUY TẮC: Cung cấp câu sai, từ bị sai, từ sửa lại cho đúng, và phần giải thích bằng TIẾNG VIỆT.\n`;
      } else if (subType === 'listening') {
        prompt += `NHIỆM VỤ: Tạo một kịch bản bài nghe hiểu và 1 câu hỏi trắc nghiệm 4 đáp án ở cấp độ ${cefrLevel}. Phần giải thích PHẢI BẰNG TIẾNG VIỆT.\n`;
        const listenRule = activePedagogyEngine?.getMicroTierListeningRule
          ? activePedagogyEngine.getMicroTierListeningRule(level)
          : '';
        if (listenRule) prompt += listenRule + '\n';
      } else if (subType === 'reading_passage') {
        prompt += `NHIỆM VỤ: Tạo một đoạn văn đọc hiểu và các câu hỏi kèm theo ở cấp độ ${cefrLevel}.\n`;
        const readRule = activePedagogyEngine?.getMicroTierReadingRule
          ? activePedagogyEngine.getMicroTierReadingRule(level)
          : '';
        if (readRule) prompt += readRule + '\n';
        prompt += `CÂU HỎI: Kết hợp giữa Trắc nghiệm, True/False/Not Given hoặc Điền Khuyết. Phần giải thích cho mỗi câu PHẢI BẰNG TIẾNG VIỆT.\n`;
      }
    }

    const randomSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
    prompt += `\n[MÃ HẠT GIỐNG - SEED: ${randomSeed}] SỰ SÁNG TẠO: Vui lòng giữ cho nội dung luôn phong phú, đa dạng và thú vị.\n`;
    return prompt;
  },

  _getMasterSchema: function (forgeType, subType, dataMode = 'vocab', level = '') {
    const commonProps = { cefr_level: { type: 'STRING' } };
    const commonRequired = ['cefr_level'];
    const posThresholdStr = resolvePosThreshold(level);

    if (forgeType === 'base_card') {
      if (dataMode === 'sentence') {
        return {
          type: 'OBJECT',
          properties: {
            term: { type: 'STRING' },
            definition: { type: 'STRING' },
            image_keyword: { type: 'STRING', description: IMAGE_KEYWORD_SCHEMA_DESC },
            grammar_type: { type: 'ARRAY', items: { type: 'STRING' } },
            ...commonProps
          },
          required: ['term', 'definition', 'image_keyword', 'grammar_type', ...commonRequired]
        };
      }

      return {
        type: 'OBJECT',
        properties: {
          posAnalysis: {
            type: 'STRING',
            description: `Tờ giấy nháp: Tư duy theo chuỗi. BẮT BUỘC viết phân tích chức năng ngữ pháp TRƯỚC, sau đó mới chốt lại tỉ lệ % ở cuối cùng. Ép 0% nếu vi phạm luật cấm. Quyết định loại bỏ các từ loại có tỉ lệ <${posThresholdStr}.`
          },
          partOfSpeech: {
            type: 'STRING',
            description: `Từ loại của từ (BẰNG TIẾNG VIỆT). Xuất kết quả cuối cùng từ posAnalysis (chỉ lấy >${posThresholdStr}), cách nhau bằng dấu '|'.`
          },
          example: {
            type: 'STRING',
            description:
              "Multiline string containing examples. MUST generate exactly ONE example sentence for EACH part of speech listed in 'partOfSpeech' AND KEEP THE EXACT ORDER. Format each line exactly as: - Foreign Sentence | Vietnamese Translation"
          },
          term: { type: 'STRING' },
          definition: { type: 'STRING' },
          image_keyword: { type: 'STRING', description: IMAGE_KEYWORD_SCHEMA_DESC },
          ...commonProps
        },
        required: [
          'posAnalysis',
          'partOfSpeech',
          'example',
          'term',
          'definition',
          'image_keyword',
          ...commonRequired
        ]
      };
    }

    if (forgeType === 'matrix') {
      if (subType === 'match') {
        return {
          type: 'OBJECT',
          properties: {
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  term: { type: 'STRING' },
                  definition: { type: 'STRING' }
                },
                required: ['term', 'definition']
              }
            },
            ...commonProps
          },
          required: ['items', ...commonRequired]
        };
      }
      if (subType === 'match_hard') {
        return {
          type: 'OBJECT',
          properties: {
            correctPairs: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  term: { type: 'STRING' },
                  definition: { type: 'STRING' }
                },
                required: ['term', 'definition']
              }
            },
            trapPairs: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  wrongWord: { type: 'STRING' },
                  correction: { type: 'STRING' },
                  definition: { type: 'STRING' },
                  explanation: { type: 'STRING' }
                },
                required: ['wrongWord', 'correction', 'definition', 'explanation']
              }
            },
            ...commonProps
          },
          required: ['correctPairs', 'trapPairs', ...commonRequired]
        };
      }
      if (subType === 'odd_one_out') {
        return {
          type: 'OBJECT',
          properties: {
            words: { type: 'ARRAY', items: { type: 'STRING' } },
            oddWord: { type: 'STRING' },
            explanation: { type: 'STRING' },
            ...commonProps
          },
          required: ['words', 'oddWord', 'explanation', ...commonRequired]
        };
      }
      if (subType === 'pronunciation') {
        return {
          type: 'OBJECT',
          properties: {
            term: { type: 'STRING' },
            definition: { type: 'STRING' },
            options: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  text: { type: 'STRING' },
                  isCorrect: { type: 'BOOLEAN' }
                },
                required: ['text', 'isCorrect']
              }
            },
            ...commonProps
          },
          required: ['term', 'definition', 'options', ...commonRequired]
        };
      }
    }

    if (forgeType === 'context') {
      if (subType === 'fill_blank') {
        return {
          type: 'OBJECT',
          properties: {
            displaySentence: { type: 'STRING' },
            targetWord: { type: 'STRING' },
            hint: { type: 'STRING' },
            distractors: { type: 'ARRAY', items: { type: 'STRING' } },
            ...commonProps
          },
          required: ['displaySentence', 'targetWord', 'hint', ...commonRequired]
        };
      }
      if (subType === 'vocab_mcq' || subType === 'grammar_mcq') {
        return {
          type: 'OBJECT',
          properties: {
            term: { type: 'STRING' },
            definition: { type: 'STRING' },
            displaySentence: { type: 'STRING' },
            options: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  text: { type: 'STRING' },
                  isCorrect: { type: 'BOOLEAN' }
                },
                required: ['text', 'isCorrect']
              }
            },
            image_keyword: { type: 'STRING', description: IMAGE_KEYWORD_SCHEMA_DESC },
            explanation: { type: 'STRING' },
            ...commonProps
          },
          required: [
            'term',
            'definition',
            'displaySentence',
            'options',
            'image_keyword',
            'explanation',
            ...commonRequired
          ]
        };
      }
      if (subType === 'spot_mistake') {
        return {
          type: 'OBJECT',
          properties: {
            wrongSentence: { type: 'STRING' },
            wrongWord: { type: 'STRING' },
            correction: { type: 'STRING' },
            explanation: { type: 'STRING' },
            ...commonProps
          },
          required: ['wrongSentence', 'wrongWord', 'correction', 'explanation', ...commonRequired]
        };
      }
      if (subType === 'listening') {
        return {
          type: 'OBJECT',
          properties: {
            audioScript: { type: 'STRING' },
            question: { type: 'STRING' },
            options: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  text: { type: 'STRING' },
                  isCorrect: { type: 'BOOLEAN' }
                },
                required: ['text', 'isCorrect']
              }
            },
            explanation: { type: 'STRING' },
            ...commonProps
          },
          required: ['audioScript', 'question', 'options', 'explanation', ...commonRequired]
        };
      }
      if (subType === 'reading_passage') {
        return {
          type: 'OBJECT',
          properties: {
            passage: { type: 'STRING' },
            questions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  type: { type: 'STRING' },
                  questionText: { type: 'STRING' },
                  options: { type: 'ARRAY', items: { type: 'STRING' } },
                  correctAnswer: { type: 'STRING' },
                  explanation: { type: 'STRING' }
                },
                required: ['type', 'questionText', 'correctAnswer', 'explanation']
              }
            },
            ...commonProps
          },
          required: ['passage', 'questions', ...commonRequired]
        };
      }
    }

    return null;
  },

  // [VER 1.1] Lõi gọi chung cho 3 Lò đúc: Prompt + Schema + Timeout + Null-Safety + Dọn Timer
  _executeForgeCall: async function ({
    forgeType,
    subType = null,
    level,
    lang,
    apiKey,
    topic = '',
    historyPrompt = '',
    dataMode = 'vocab',
    isReverse = false,
    defaultTimeoutMs = 32000,
    extraTimeoutMs = 0,
    timeoutLabel = 'AI Forge Timeout'
  }) {
    let timeoutId = null;
    try {
      let prompt = AiFactoryEngine._buildSystemPrompt(
        forgeType,
        subType,
        level,
        lang,
        topic,
        dataMode,
        isReverse
      );
      if (historyPrompt) prompt += historyPrompt;
      const schema = AiFactoryEngine._getMasterSchema(forgeType, subType, dataMode, level);

      const aiPromise = callGeminiApi(prompt, schema, apiKey);
      const dynamicTimeout = resolveDynamicTimeout(defaultTimeoutMs, extraTimeoutMs);

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutLabel)), dynamicTimeout);
      });

      const res = await Promise.race([aiPromise, timeoutPromise]);
      const parsed = parseAiJson(res?.text);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`AI trả về dữ liệu JSON rỗng hoặc sai cấu trúc (${timeoutLabel})`);
      }

      return { parsed, tokenMetadata: res?.tokenMetadata || null };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  },

  // ============================================================================
  // 3. LÒ ĐÚC 1: LÒ ĐÚC CƠ SỞ (FORGE BASE CARD)
  // ============================================================================
  forgeBaseCard: async function (
    level,
    lang,
    apiKey,
    topic = '',
    historyPrompt = '',
    dataMode = 'vocab',
    isReverse = false
  ) {
    try {
      const { parsed, tokenMetadata } = await AiFactoryEngine._executeForgeCall({
        forgeType: 'base_card',
        subType: null,
        level,
        lang,
        apiKey,
        topic,
        historyPrompt,
        dataMode,
        isReverse,
        defaultTimeoutMs: 32000,
        timeoutLabel: 'AI Base Card Timeout'
      });

      // [VER 1.1] Dựng URL ảnh sạch qua buildSmartImageUrl, lọc sạch từ khóa rác & chữ Hán
      const { image_keyword, image } = buildSafeFactoryImage(
        parsed.image_keyword,
        parsed.term,
        lang,
        dataMode
      );

      return {
        term: parsed.term || '',
        definition: parsed.definition || '',
        image: image,
        image_keyword: image_keyword,
        cefr_level: parsed.cefr_level || '',
        grammar_type: Array.isArray(parsed.grammar_type) ? parsed.grammar_type : [],
        partOfSpeech: parsed.partOfSpeech || (dataMode === 'sentence' ? 'Câu văn' : ''),
        example: parsed.example || '',
        language: lang,
        isAiGenerated: true,
        _tokenUsage: tokenMetadata
      };
    } catch (e) {
      console.error('forgeBaseCard Error:', e);
      if (typeof window !== 'undefined' && window.logSystemEvent) {
        window.logSystemEvent('Lò Đúc Cơ Sở (Base Card) sập', e);
      }
      throw e;
    }
  },

  // ============================================================================
  // 4. LÒ ĐÚC 2: LÒ ĐÚC MA TRẬN (FORGE MATRIX)
  // ============================================================================
  forgeMatrix: async function (
    subType,
    level,
    lang,
    apiKey,
    topic = '',
    historyPrompt = '',
    dataMode = 'vocab',
    isReverse = false
  ) {
    try {
      const { parsed, tokenMetadata } = await AiFactoryEngine._executeForgeCall({
        forgeType: 'matrix',
        subType,
        level,
        lang,
        apiKey,
        topic,
        historyPrompt,
        dataMode,
        isReverse,
        defaultTimeoutMs: 35000,
        timeoutLabel: 'AI Matrix Timeout'
      });

      const result = {
        ...parsed,
        isAiGenerated: true,
        type: subType,
        _tokenUsage: tokenMetadata
      };

      if (subType === 'odd_one_out' && Array.isArray(result.words)) {
        result.words = shuffleArray(result.words);
      }
      if (subType === 'pronunciation' && Array.isArray(result.options)) {
        result.options = shuffleArray(result.options);
      }
      if (subType === 'match' && Array.isArray(result.items)) {
        result.items = shuffleArray(result.items);
      }
      if (subType === 'match_hard' && Array.isArray(result.correctPairs)) {
        result.correctPairs = shuffleArray(result.correctPairs);
      }

      return result;
    } catch (e) {
      console.error(`forgeMatrix [${subType}] Error:`, e);
      if (typeof window !== 'undefined' && window.logSystemEvent) {
        window.logSystemEvent(`Lò Đúc Ma Trận (${subType}) sập`, e);
      }
      throw e;
    }
  },

  // ============================================================================
  // 5. LÒ ĐÚC 3: LÒ ĐÚC NGỮ CẢNH (FORGE CONTEXT)
  // ============================================================================
  forgeContext: async function (
    subType,
    level,
    lang,
    apiKey,
    topic = '',
    historyPrompt = '',
    dataMode = 'vocab',
    isReverse = false
  ) {
    try {
      const isReading = subType === 'reading_passage';
      const { parsed, tokenMetadata } = await AiFactoryEngine._executeForgeCall({
        forgeType: 'context',
        subType,
        level,
        lang,
        apiKey,
        topic,
        historyPrompt,
        dataMode,
        isReverse,
        defaultTimeoutMs: isReading ? 42000 : 35000,
        extraTimeoutMs: isReading ? 5000 : 0,
        timeoutLabel: `AI Context Timeout (${subType})`
      });

      const result = {
        ...parsed,
        isAiGenerated: true,
        type: subType,
        _tokenUsage: tokenMetadata
      };

      if (subType === 'listening' || subType === 'grammar_mcq' || subType === 'vocab_mcq') {
        if (Array.isArray(result.options)) {
          result.options = shuffleArray(result.options);
        }
      }

      // [VER 1.1] Đồng bộ URL ảnh sạch cho câu hỏi trắc nghiệm từ vựng / ngữ pháp
      if (subType === 'vocab_mcq' || subType === 'grammar_mcq') {
        const effectiveMode =
          dataMode === 'sentence' || subType === 'grammar_mcq' ? 'sentence' : 'vocab';
        const { image_keyword, image } = buildSafeFactoryImage(
          parsed.image_keyword,
          parsed.term,
          lang,
          effectiveMode
        );
        result.image_keyword = image_keyword;
        if (image) {
          result.image = image;
        }
      }

      return result;
    } catch (e) {
      console.error(`forgeContext [${subType}] Error:`, e);
      if (typeof window !== 'undefined' && window.logSystemEvent) {
        window.logSystemEvent(`Lò Đúc Ngữ Cảnh (${subType}) sập`, e);
      }
      throw e;
    }
  }
};

// Named Exports tương thích trực tiếp với NewMapping.md
export const batchEnrich = (...args) => AiFactoryEngine.batchEnrich(...args);
export const getHistoryPrompt = (...args) => AiFactoryEngine.getHistoryPrompt(...args);
export const forgeBaseCard = (...args) => AiFactoryEngine.forgeBaseCard(...args);
export const forgeMatrix = (...args) => AiFactoryEngine.forgeMatrix(...args);
export const forgeContext = (...args) => AiFactoryEngine.forgeContext(...args);

if (typeof window !== 'undefined') {
  window.AiFactoryEngine = AiFactoryEngine;
}

export default AiFactoryEngine;