/**
 * @file src/engines/gameAiEngine.js
 * @description Bộ não AI (Game Ai Engine). Chuyên trách giao tiếp API, chứa Prompt và sinh dữ liệu nhiễu bằng AI.
 * @origin Tầng 2 - Block 2.3A (Game Ai Engine)
 */

import { Utils } from '@/utils/helpers';
import { IoeDataEngine } from './pedagogyEngine';

export const GameAiEngine = {
  // [V2.01] RADAR NHẬN DIỆN TRÌNH ĐỘ - Hỗ trợ Mở trần Từ vựng & HSK 3.0
  _getLevelContext: function(level, isForDistractor = false) {
    if (!level) return "";
    const oldToNewMap = {
      level_1_kiddie: 'en_level_1', level_2_junior_basic: 'en_level_2',
      level_3_junior_advanced: 'en_level_3', level_4_discovery_basic: 'en_level_4',
      level_5_discovery_advanced: 'en_level_5', level_6_pre_ielts: 'en_level_6',
      level_7_breakthrough: 'en_level_7', level_8_academic: 'en_level_8',
      level_9_expert: 'en_level_9'
    };
    
    let mappedKey = oldToNewMap[level] || level;
    let lang = mappedKey.includes('zh') || mappedKey.includes('hsk') ? 'zh' : 'en';
    
    // Ghi đè ngữ cảnh hệ thống, ép chuẩn HSK 3.0 cho Tiếng Trung
    let contextDesc = "";
    if (lang === 'zh') {
      contextDesc = "Chuẩn HSK 3.0 mới";
    } else {
      contextDesc = IoeDataEngine && IoeDataEngine.GRADE_CONTEXTS ? (IoeDataEngine.GRADE_CONTEXTS[mappedKey] || "CEFR Standard") : "CEFR Standard";
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

  // [LÕI ĐỊNH TUYẾN MỜ V1.8] Tự động chắp vá Micro-prompts xuyên cấp độ nhưng khóa cứng ngôn ngữ
  _getFuzzyMicroPrompt: function(card, gameType) {
    const pool = IoeDataEngine?.MICRO_PROMPTS?.[gameType];
    if (!pool) return "";
    
    const extractPrompt = (item) => {
      if (!item) return "";
      return typeof item === 'object' ? (item.prompt || "") : item;
    };
    
    const fallbacks = {
      quiz: 'general_trap',
      spot_mistake: 'general_mistake',
      fill_blank: 'general_blank',
      scramble: 'general_noise'
    };
    
    const defaultFallback = pool[fallbacks[gameType]] || "";
    
    if (!card || !card.grammar_type) return extractPrompt(defaultFallback);
    
    let tags = card.grammar_type;
    if (typeof tags === 'string') {
      tags = tags.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    if (!Array.isArray(tags) || tags.length === 0) return extractPrompt(defaultFallback);
    
    const targetTag = tags[Math.floor(Math.random() * tags.length)];
    
    // BƯỚC 1: EXACT MATCH
    if (pool[targetTag]) return extractPrompt(pool[targetTag]);
    
    // BƯỚC 2: LANGUAGE-AWARE FUZZY MATCH
    const isChinese = targetTag.startsWith('zh_');
    const isEnglish = targetTag.startsWith('eng_') || targetTag.startsWith('pre_a1_');
    const coreTrap = targetTag.replace(/^(zh_hsk\d*_|eng_a\d+p?_|pre_a1_)/, '');
    
    const possibleKeys = Object.keys(pool).filter(key => {
      const isCorrectLang = isChinese ? key.startsWith('zh_') : (isEnglish ? (key.startsWith('eng_') || key.startsWith('pre_')) : true);
      return isCorrectLang && key.includes(coreTrap);
    });
    
    if (possibleKeys.length > 0) {
      return extractPrompt(pool[possibleKeys[Math.floor(Math.random() * possibleKeys.length)]]);
    }
    
    // BƯỚC 3: LƯỚI CỨU HỘ CUỐI CÙNG
    return extractPrompt(defaultFallback);
  },

  // 1. ĐỘNG CƠ TẠO LỖI SAI TRỰC TUYẾN (Spot Mistake)
  ai_distort: async function(text, lang, type, apiKey, level = "", topic = "", card = null) {
    let prompt = "";
    let schema = {};
    const levelContext = GameAiEngine._getLevelContext(level, false);
    const langStr = lang === 'zh' ? 'Tiếng Trung' : (lang === 'en' ? 'Tiếng Anh' : 'Tiếng Việt');
    
    let microPrompt = "";
    if (card) {
      if (card.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(card, 'spot_mistake');
        if (mp) microPrompt = "\n[MỤC TIÊU NGỮ PHÁP ĐẶC BIỆT]: " + mp + "\n";
      } else {
        microPrompt = "\n[CHẨN ĐOÁN NGỮ PHÁP]: Phân tích cấu trúc cốt lõi (liên từ, giới từ, trật tự từ). Bẻ gãy chính cấu trúc đó thay vì chỉ sai từ vựng.\n";
      }
    }
    
    let injectedRule = "";
    if (IoeDataEngine && IoeDataEngine.getMicroTierDistortionRule) {
      const targetLang = lang === 'zh' ? 'Chinese' : (lang === 'en' ? 'English' : 'Vietnamese');
      const dataMode = type === 'sentence' ? 'sentence' : 'sentence'; // Spot Mistake auto sentence
      
      const oldToNewMap = { level_1_kiddie: 'en_level_1', level_2_junior_basic: 'en_level_2', level_3_junior_advanced: 'en_level_3', level_4_discovery_basic: 'en_level_4', level_5_discovery_advanced: 'en_level_5', level_6_pre_ielts: 'en_level_6', level_7_breakthrough: 'en_level_7', level_8_academic: 'en_level_8', level_9_expert: 'en_level_9' };
      let mappedKey = oldToNewMap[level] || level;
      if (!mappedKey.includes('level_')) mappedKey = lang === 'zh' ? 'zh_level_4' : 'en_level_4';
      
      const ruleStr = IoeDataEngine.getMicroTierDistortionRule(targetLang, dataMode, mappedKey, topic);
      if (ruleStr) injectedRule = "\n[ĐỊNH HƯỚNG BÓP MÉO]: " + ruleStr;
    }
    
    if (type === 'word') {
      prompt = `Ngữ cảnh: "${text}". Ngôn ngữ: ${langStr}.\n`;
      prompt += `[NHIỆM VỤ]: Tạo 1 lỗi chính tả/hình thái từ tự nhiên.` + microPrompt + injectedRule;
      prompt += `\n[CẤU TRÚC]: Trả về 1 từ duy nhất. Phần giải thích (explanation) viết bằng Tiếng Việt.` + levelContext;
      
      schema = {
        type: "OBJECT",
        properties: {
          wrongWord: { type: "STRING", description: "THE SINGLE INCORRECT WORD." },
          explanation: { type: "STRING", description: "Brief explanation in Vietnamese." }
        },
        required: ["wrongWord", "explanation"]
      };
    } else {
      // [V2.12] Trừu tượng hóa ví dụ bằng Keywords
      let examples = "";
      if (lang === 'zh') {
        examples = `[Ý TƯỞNG BẼ GÃY]: Sai đại từ/giới tính/thì, Đổi tính từ trái nghĩa, Sai trợ từ (de)/lượng từ, Thay cụm từ biểu cảm, Nhét chữ rác.`;
      } else if (lang === 'en') {
        examples = `[Ý TƯỞNG BẼ GÃY]: Sai thì/đại từ, Tính từ trái nghĩa, Đảo lộn trật tự cụm cố định, Thêm mạo từ/giới từ thừa.`;
      } else {
        examples = `[Ý TƯỞNG BẼ GÃY]: Sai động từ hoạt động, Đổi tính từ trái nghĩa, Thêm từ rác gây ngô nghê.`;
      }
      
      prompt = `Ngữ cảnh: "${text}". Ngôn ngữ: ${langStr}.\n`;
      prompt += `[NHIỆM VỤ]: Tạo 1 lỗi sai tinh vi (ngữ pháp/ngữ cảnh) trong câu bằng cách THAY THẾ hoặc THÊM TỪ.\n`;
      prompt += `${examples}\n`;
      prompt += `[TRẢ VỀ]: 'wrongWord' phải là sub-string tồn tại vật lý trong 'wrongSentence'. 'explanation' viết bằng Tiếng Việt.` + microPrompt + injectedRule + levelContext;
      
      schema = {
        type: "OBJECT",
        properties: {
          wrongSentence: { type: "STRING", description: "THE FULL SENTENCE CONTAINING THE MISTAKE." },
          wrongWord: { type: "STRING", description: "THE EXACT SUBSTRING THAT IS WRONG (Must physically exist in wrongSentence)." },
          correction: { type: "STRING", description: "THE CORRECT WORD OR PHRASE TO REPLACE THE MISTAKE." },
          explanation: { type: "STRING", description: "Explanation in Vietnamese." }
        },
        required: ["wrongSentence", "wrongWord", "correction", "explanation"]
      };
    }
    
    const res = await Utils.callGeminiApi(prompt, schema, apiKey);
    return Utils.parseAiJson(res.text);
  },

  // 2. ĐỘNG CƠ TẠO ĐÁP ÁN NHIỄU (Quiz Options) - V2.13 KỶ LUẬT THÉP & BỘ LỌC ĐỘC BẢN 2 CHIỀU
  ai_generateOptions: async function(cardOrText, distractorLang, type, apiKey, count = 3, level = "", topic = "", isReverse = false) {
    let term = "";
    let definition = "";
    
    if (typeof cardOrText === 'string') {
      term = cardOrText;
      definition = cardOrText;
    } else if (cardOrText) {
      term = cardOrText.term;
      definition = cardOrText.definition;
    }
    
    let foreignLang = 'en';
    if (level && level.includes('zh')) foreignLang = 'zh';
    else if (distractorLang === 'zh' || distractorLang === 'en') foreignLang = distractorLang;
    
    const foreignLangName = foreignLang === 'zh' ? 'TIẾNG TRUNG' : 'TIẾNG ANH';
    const foreignLangEngName = foreignLang === 'zh' ? 'CHINESE' : 'ENGLISH';
    
    // [V2.12] LẮP RÁP PROMPT: CHỈ THỊ MÁY MÓC (DIRECT COMMANDS)
    let prompt = `[SYSTEM]: QUIZ GENERATOR ENGINE.\n`;
    prompt += `[SOURCE]:\n`;
    prompt += `- Original (${foreignLangName}): "${term}"\n`;
    prompt += `- Meaning (Vietnamese): "${definition}"\n\n`;
    prompt += `[TASK]:\n`;
    prompt += `STEP 1: Generate ${count} traps ('foreignText') in ${foreignLangName} based on Original.\n`;
    prompt += `STEP 2: Translate the exact meaning of those ${count} traps into Vietnamese ('vietnameseText'). DO NOT re-translate the original word.\n\n`;
    
    // KỶ LUẬT THÉP (FIREWALL + EQUALITY CHECK) - TĂNG NẶNG HÌNH PHẠT
    prompt += `[STRICT CONSTRAINTS - MUST OBEY]:\n`;
    prompt += `1. NO SEMANTIC BLEEDING: 'foreignText' MUST ONLY contain REAL ${foreignLangEngName} words. NO ENGLISH translation of morphemes.\n`;
    prompt += `2. 2D UNIQUENESS: All ${count} 'foreignText' MUST NOT EQUAL "${term}". All ${count} 'vietnameseText' MUST NOT EQUAL "${definition}". No typo bypassing.\n`;
    prompt += `3. DICTIONARY WORDS ONLY: Must use REAL, EXISTING ${foreignLangEngName} words.\n`;
    prompt += `4. ENCODING: Return raw UTF-8 characters. NO \\uXXXX escaping.\n`;
    
    if (foreignLang === 'zh') {
      prompt += `5. CHARACTER FIREWALL: OUTPUT REQUIREMENT: 'foreignText' MUST BE 100% AUTHENTIC CHINESE CHARACTERS (Hanzi). STRICTLY PROHIBITED to output Pinyin or Romanized spellings. Any output containing a-z letters will cause system failure.\n`;
    } else {
      prompt += `5. CHARACTER FIREWALL: OUTPUT REQUIREMENT: 'foreignText' MUST BE STANDARD ENGLISH WORDS. STRICTLY PROHIBITED to output phonetic transcriptions (IPA) or pronunciation guides (like /.../ or [...]).\n`;
    }
    
    prompt += `6. ASSERTION: ASSERT(foreignText !== "${term}" && vietnameseText !== "${definition}"). IF MATCH, REGENERATE.\n\n`;
    
    // [V2.08] DYNAMIC MIMICRY
    if (type !== 'sentence' && definition) {
      let detectedSeparators = [];
      if (definition.includes(',')) detectedSeparators.push("comma (,)");
      if (definition.includes('/')) detectedSeparators.push("slash (/)");
      if (definition.includes(';')) detectedSeparators.push("semicolon (;)");
      
      if (detectedSeparators.length > 0) {
        prompt += `[STRUCTURAL MIMICRY]: Original translation contains ${detectedSeparators.join(" and ")}. 'vietnameseText' MUST precisely mimic this format.\n\n`;
      }
    }
    
    if (type === 'sentence') {
      prompt += `[TẠO BẪY CÂU]: Giữ nguyên 70-80% từ vựng gốc. Đổi 1-2 tiểu tiết cốt lõi (chủ thể, hành động, từ trái nghĩa).\n`;
    } else {
      // ĐỊNH TUYẾN LINH HOẠT TỐI ĐA (AB-AC FORMULA)
      prompt += `[ROUTING]:\n`;
      let primaryTrap = "";
      let fallbackTraps = "";
      
      if (foreignLang === 'zh') {
        let traps = [];
        const termLen = term.trim().length;
        if (termLen === 1) {
          traps = [
            { name: "Đồng âm/Pinyin", desc: "Đọc giống nhưng viết khác, nghĩa khác." },
            { name: "Chung gốc/Bán đồng hình", desc: "Chung 1 nét/bộ thủ nhưng khác nghĩa." },
            { name: "Trái nghĩa", desc: "Nghĩa đối lập hoàn toàn." },
            { name: "Cùng Chủ đề", desc: "Cùng loại sự vật nhưng sai đối tượng." }
          ];
        } else {
          traps = [
            { name: "Từ ghép chung gốc (Shared Morpheme)", desc: "Tìm từ ghép khác chung 1 chữ Hán. BẮT BUỘC CHỮ CÒN LẠI KHÁC NHAU. (Gốc AB -> Bẫy AC/CB. CẤM trả về AB)." },
            { name: "Trái nghĩa", desc: "Nghĩa đối lập hoàn toàn." },
            { name: "Cùng Chủ đề", desc: "Cùng loại sự vật/hành động nhưng sai đối tượng." }
          ];
        }
        
        const selectedIdx = Math.floor(Math.random() * traps.length);
        primaryTrap = traps[selectedIdx];
        const fallbacks = traps.filter((_, idx) => idx !== selectedIdx);
        fallbackTraps = fallbacks.map(t => `- ${t.name}: ${t.desc}`).join('\n');
        
        prompt += `> BƯỚC 1 (ƯU TIÊN): Dùng bẫy [${primaryTrap.name}] (${primaryTrap.desc}).\n`;
        prompt += `> BƯỚC 2 (ANTI-BLOCK): Nếu bí, lập tức chuyển sang các bẫy dự phòng:\n${fallbackTraps}\n`;
        prompt += `> BƯỚC 3: Được phép trộn nhiều loại bẫy, miễn là CÓ THẬT và KHÁC TỪ GỐC.\n`;
      } else {
        const traps = [
          { name: "Lookalikes", desc: "Sai 1-2 ký tự hoặc phát âm giống." },
          { name: "Morphology", desc: "Cùng gốc nhưng sai tiền/hậu tố." },
          { name: "Logic", desc: "Trái nghĩa hoặc cùng chủ đề." }
        ];
        const selectedIdx = Math.floor(Math.random() * traps.length);
        primaryTrap = traps[selectedIdx];
        const fallbacks = traps.filter((_, idx) => idx !== selectedIdx);
        fallbackTraps = fallbacks.map(t => `- ${t.name}: ${t.desc}`).join('\n');
        
        prompt += `> BƯỚC 1 (ƯU TIÊN): Dùng bẫy [${primaryTrap.name}] (${primaryTrap.desc}).\n`;
        prompt += `> BƯỚC 2: Nếu bí, dùng bẫy dự phòng:\n${fallbackTraps}\n`;
      }
    }
    
    prompt += `\n[THOUGHT PROCESS]: Điền trường 'reasoning' TRƯỚC TIÊN (Ghi 1 câu ngắn gọn logic tạo bẫy).\n`;
    
    let microPrompt = "";
    if (cardOrText && typeof cardOrText === 'object') {
      if (cardOrText.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(cardOrText, 'quiz');
        if (mp) microPrompt = `\n[TARGET GRAMMAR]: ${mp}\n`;
      }
    }
    
    prompt += microPrompt;
    prompt += GameAiEngine._getLevelContext(level, true);
    
    const itemsSchema = {
      type: "OBJECT",
      properties: {
        foreignText: { type: "STRING", description: `Trap in ${foreignLangEngName}. MUST NOT BE "${term}". STRICTLY NO ENGLISH. STRICTLY NO UNICODE ESCAPING.` },
        vietnameseText: { type: "STRING", description: `Vietnamese translation. MUST NOT BE "${definition}". MUST HAVE ACCENTS.` }
      },
      required: ["foreignText", "vietnameseText"]
    };
    
    const schema = {
      type: "OBJECT",
      properties: {
        reasoning: { type: "STRING", description: "Short reasoning logic." },
        distractors: { type: "ARRAY", items: itemsSchema }
      },
      required: ["reasoning", "distractors"]
    };
    
    const res = await Utils.callGeminiApi(prompt, schema, apiKey);
    const parsed = Utils.parseAiJson(res.text);
    const dists = parsed.distractors || [];
    
    // ============================================================================
    // [V2.13] TRẠM GÁC HẬU KỲ VÀ BỘ LỌC ĐỘC BẢN 2 CHIỀU (POST-PROCESSING GATEKEEPER)
    // ============================================================================
    const validDistractors = [];
    const textSet = new Set([term.toLowerCase().trim()]);
    const meaningSet = new Set([definition.toLowerCase().trim()]);
    
    // Regex cấm đoán
    const regexZh = /[a-zA-Z]/; // Cấm ký tự Latin (Pinyin, English)
    const regexEn = /[\[\]\/\\əæθʃʒðŋɑɔʊʌɛ]/; // Cấm phiên âm IPA/ngoặc
    
    for (const d of dists) {
      let fText = (d.foreignText || "").trim();
      let vText = (d.vietnameseText || "").trim();
      
      if (!fText || !vText) continue;
      
      // 1. Kiểm tra rò rỉ ngôn ngữ (Language Leakage Check)
      if (foreignLang === 'zh' && regexZh.test(fText)) {
        console.warn("[Gatekeeper] Phát hiện rò rỉ Pinyin/Tiếng Anh. Chém bỏ bẫy:", fText);
        continue;
      }
      if (foreignLang === 'en' && regexEn.test(fText)) {
        console.warn("[Gatekeeper] Phát hiện rò rỉ phiên âm IPA. Chém bỏ bẫy:", fText);
        continue;
      }
      
      // 2. Kiểm tra Độc bản 2 chiều (2D Uniqueness Check)
      const fTextLower = fText.toLowerCase();
      const vTextLower = vText.toLowerCase();
      
      if (textSet.has(fTextLower) || meaningSet.has(vTextLower)) {
        console.warn("[Gatekeeper] Phát hiện trùng lặp Cột mốc/Nội bộ. Chém bỏ bẫy:", fText, "|", vText);
        continue; // Trùng từ ngoại ngữ HOẶC trùng tiếng Việt -> Loại bỏ ngay
      }
      
      // Vượt qua trạm gác -> Lưu vào danh sách an toàn và Cập nhật từ điển Set()
      textSet.add(fTextLower);
      meaningSet.add(vTextLower);
      validDistractors.push(d);
    }
    
    // 3. Mapping và Cắt mảng (Sự khuyết thiếu sẽ được Tầng 5 / Block 2.3B tự động bù đắp bằng Offline Pooling)
    return validDistractors.map(d => {
      if (!isReverse) {
        return { text: d.vietnameseText || "Lỗi dịch", meaning: d.foreignText || "Lỗi tạo bẫy" };
      } else {
        return { text: d.foreignText || "Lỗi tạo bẫy", meaning: d.vietnameseText || "Lỗi dịch" };
      }
    }).slice(0, count);
  },

  // 3. ĐỘNG CƠ SINH RÁC TRỰC TUYẾN (Scramble Noise)
  ai_getNoise: async function(correctText, lang, type, apiKey, count = 2, level = "", topic = "", card = null) {
    let prompt = "";
    let microPrompt = "";
    
    if (card) {
      if (card.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(card, 'scramble');
        if (mp) microPrompt = "\n[TARGET GRAMMAR]: " + mp + "\n";
      } else {
        microPrompt = "\n[CHẨN ĐOÁN NGỮ PHÁP]: Phân tích cấu trúc cốt lõi. Sinh từ rác có thể phá vỡ cấu trúc đó (VD: thừa giới từ, sai liên từ).\n";
      }
    }
    
    if (type === 'word') {
      if (lang === 'zh') {
        prompt = `[NHIỆM VỤ]: Tạo ${count} chữ Hán ngẫu nhiên (cùng bộ thủ hoặc đồng âm) với từ gốc: "${correctText}" để làm nhiễu. CHỈ TRẢ VỀ CHỮ HÁN. BẮT BUỘC Raw UTF-8.`;
      } else {
        prompt = `[NHIỆM VỤ]: Tạo ${count} chữ cái in thường (a-z) ngẫu nhiên làm nhiễu cho từ gốc: "${correctText}".`;
      }
    } else {
      const langStr = lang === 'zh' ? 'Tiếng Trung' : (lang === 'en' ? 'Tiếng Anh' : 'Tiếng Việt');
      prompt = `Ngữ cảnh: "${correctText}". Ngôn ngữ: ${langStr}.\n`;
      prompt += `[NHIỆM VỤ]: Tạo ${count} từ vựng rác làm nhiễu.\n`;
      prompt += `[CHIẾN LƯỢC]: CÙNG TỪ LOẠI với các từ trong câu nhưng sai ngữ cảnh, để khi ghép vào sẽ tạo lỗi ngữ pháp.\n\n`;
      if (lang === 'zh') prompt += `BẮT BUỘC Raw UTF-8, không dùng \\uXXXX.\n`;
    }
    
    let injectedRule = "";
    if (IoeDataEngine && IoeDataEngine.getMicroTierNoiseRule) {
      const targetLang = lang === 'zh' ? 'Chinese' : (lang === 'en' ? 'English' : 'Vietnamese');
      const dataMode = type === 'sentence' ? 'sentence' : 'vocab';
      const oldToNewMap = { level_1_kiddie: 'en_level_1', level_2_junior_basic: 'en_level_2', level_3_junior_advanced: 'en_level_3', level_4_discovery_basic: 'en_level_4', level_5_discovery_advanced: 'en_level_5', level_6_pre_ielts: 'en_level_6', level_7_breakthrough: 'en_level_7', level_8_academic: 'en_level_8', level_9_expert: 'en_level_9' };
      
      let mappedKey = oldToNewMap[level] || level;
      if (!mappedKey.includes('level_')) mappedKey = lang === 'zh' ? 'zh_level_4' : 'en_level_4';
      
      const ruleStr = IoeDataEngine.getMicroTierNoiseRule(targetLang, dataMode, mappedKey, topic);
      if (ruleStr) injectedRule = "\n[ĐỊNH HƯỚNG RÁC]: " + ruleStr;
    }
    
    prompt += microPrompt;
    prompt += injectedRule;
    prompt += GameAiEngine._getLevelContext(level, false);
    
    const schema = {
      type: "OBJECT",
      properties: {
        noise: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "ARRAY OF RANDOM OR MISLEADING WORDS/CHARACTERS."
        }
      },
      required: ["noise"]
    };
    
    const res = await Utils.callGeminiApi(prompt, schema, apiKey);
    const parsed = Utils.parseAiJson(res.text);
    return parsed.noise || [];
  },

  // 4. ĐỘNG CƠ ĐỤC LỖ TRỰC TUYẾN (Cloze Mask)
  ai_mask: async function(text, hintFallback, lang, apiKey, level = "", topic = "", card = null) {
    const targetLang = lang === 'zh' ? 'Chinese' : (lang === 'en' ? 'English' : 'Vietnamese');
    const langName = lang === 'zh' ? 'Tiếng Trung' : (lang === 'en' ? 'Tiếng Anh' : 'Tiếng Việt');
    
    const rand = Math.floor(Math.random() * 100);
    let strategy = 1;
    if (rand >= 35 && rand < 70) strategy = 2;
    else if (rand >= 70) strategy = 3;
    
    let microPrompt = "";
    if (card) {
      if (card.grammar_type) {
        const mp = GameAiEngine._getFuzzyMicroPrompt(card, 'fill_blank');
        if (mp) {
          microPrompt = "\n[TARGET GRAMMAR]: " + mp + "\n";
          strategy = 2;
        }
      } else {
        microPrompt = "\n[CHẨN ĐOÁN NGỮ PHÁP]: Ưu tiên đục lỗ vị trí ngữ pháp then chốt (liên từ, giới từ, bổ ngữ) thay vì đục lỗ danh/động từ thông thường.\n";
      }
    }
    
    let prompt = `[SYSTEM]: CLOZE TEST GENERATOR.\n`;
    prompt += `[NHIỆM VỤ]: Tạo câu hỏi ĐIỀN TỪ VÀO CHỖ TRỐNG từ gốc: "${text}". Nghĩa tham khảo: "${hintFallback}". Ngôn ngữ đích: ${langName}.\n\n`;
    
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
    if (lang === 'zh') prompt += `- ABSOLUTELY NO UNICODE ESCAPING. Return raw UTF-8.\n`;
    
    let injectedRule = "";
    if (IoeDataEngine && IoeDataEngine.getMicroTierClozeRule) {
      const dataMode = 'sentence';
      const oldToNewMap = { level_1_kiddie: 'en_level_1', level_2_junior_basic: 'en_level_2', level_3_junior_advanced: 'en_level_3', level_4_discovery_basic: 'en_level_4', level_5_discovery_advanced: 'en_level_5', level_6_pre_ielts: 'en_level_6', level_7_breakthrough: 'en_level_7', level_8_academic: 'en_level_8', level_9_expert: 'en_level_9' };
      
      let mappedKey = oldToNewMap[level] || level;
      if (!mappedKey.includes('level_')) mappedKey = lang === 'zh' ? 'zh_level_4' : 'en_level_4';
      
      const ruleStr = IoeDataEngine.getMicroTierClozeRule(targetLang, dataMode, mappedKey, topic);
      if (ruleStr) injectedRule = "\n[ĐỊNH HƯỚNG BỔ SUNG]: " + ruleStr;
    }
    
    prompt += microPrompt;
    prompt += injectedRule;
    prompt += GameAiEngine._getLevelContext(level, false);
    
    const schema = {
      type: "OBJECT",
      properties: {
        displaySentence: { type: "STRING", description: "THE SENTENCE WITH EXACTLY 10 UNDERSCORES [__________] REPLACING THE TARGET WORD." },
        targetWord: { type: "STRING", description: "THE EXACT CORRECT WORD REMOVED FROM THE SENTENCE." },
        distractors: { type: "ARRAY", items: { type: "STRING" }, description: "ARRAY OF 3 WRONG OPTIONS. MUST BE REAL WORDS." },
        hint: { type: "STRING", description: "Hint in Vietnamese or paraphrased target language." }
      },
      required: ["displaySentence", "targetWord", "distractors", "hint"]
    };
    
    const res = await Utils.callGeminiApi(prompt, schema, apiKey);
    return Utils.parseAiJson(res.text);
  }
};