/**
 * @file src/engines/aiFactory.js
 * @description Nhà máy AI khổng lồ (AI Factory Engine). Nguồn sự thật duy nhất cho việc đúc dữ liệu từ Gemini API. Chứa 3 Lò đúc Vạn năng.
 * @origin Tầng 2 - Block 2.6 (AiFactoryEngine)
 */

import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { callGeminiApi } from '@/services/geminiApi';
import { IoeDataEngine } from './pedagogyEngine';
// Nhúng dự phòng ExamProfiles (Sẽ được tạo ở bước kế tiếp)
import { ExamProfiles } from './examProfiles';

export const AiFactoryEngine = {
  // ============================================================================
  // 1. CÁC HÀM TIỆN ÍCH DÙNG CHUNG (BATCH ENRICH & HISTORY)
  // ============================================================================
  batchEnrich: async function(cards, queueIndices, maxCount, lang, apiKey) {
    if (!apiKey || !callGeminiApi) return { updatedCards: cards, hasUpdates: false };
    
    let updatedCards = [...cards];
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
      let timeoutId;
      try {
        const targetLangName = lang === 'zh' ? 'Tiếng Trung' : (lang === 'en' ? 'Tiếng Anh' : 'Tiếng Việt');
        
        // [V1.50] Anti-Encyclopedic Prompt for Batch Enrich
        let prompt = "Cung cấp bản dịch Tiếng Việt trực tiếp và chuẩn xác nhất cho " + batchTargets.length + " từ/cụm từ " + targetLangName + " sau. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa (VD: 'Day' dịch là 'Ngày', KHÔNG dịch là 'Khoảng thời gian 24 giờ'; 'Music' là 'Âm nhạc', KHÔNG dịch là 'Nghệ thuật âm thanh'). Ưu tiên bản dịch cực ngắn (1-3 từ, trừ thành ngữ).\nDanh sách:\n";
        prompt += batchTargets.map((b, i) => (i+1) + ". " + b.term).join('\n');
        prompt += "\n\nBẮT BUỘC trả về chính xác một JSON object chứa mảng 'translations'.\nĐịnh dạng: {\"translations\": [\"nghĩa 1\", \"nghĩa 2\", ...]}";
        
        const schema = { type: "OBJECT", properties: { translations: { type: "ARRAY", items: { type: "STRING" } } }, required: ["translations"] };
        const aiPromise = callGeminiApi(prompt, schema, apiKey);
        
        let dynamicTimeout = 20000;
        try {
          const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config'));
          if (aiCfg && aiCfg.loadingTime) dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
        } catch(e) {}
        
        const timeoutPromise = new Promise((_, r) => {
          timeoutId = setTimeout(() => r(new Error("Timeout")), dynamicTimeout);
        });
        
        const res = await Promise.race([aiPromise, timeoutPromise]);
        clearTimeout(timeoutId);
        
        const parsed = Utils.parseAiJson(res.text);
        if (parsed && Array.isArray(parsed.translations)) {
          const limit = Math.min(parsed.translations.length, batchTargets.length);
          for(let i = 0; i < limit; i++) {
            const b = batchTargets[i];
            updatedCards[b.idx] = { ...updatedCards[b.idx], definition: parsed.translations[i] };
          }
          hasUpdates = true;
          
          if (res.tokenMetadata) {
            const used = res.tokenMetadata.totalTokenCount || 0;
            const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
            localStorage.setItem('fc_total_tokens', currentTotal + used);
          }
        }
      } catch(e) {
        if (timeoutId) clearTimeout(timeoutId);
        console.warn("Pre-flight Batch enrich error:", e);
        if (window.logSystemEvent) window.logSystemEvent("Lỗi tự động điền từ (Batch Enrich) sập", e);
      }
    }
    
    return { updatedCards, hasUpdates };
  },

  getHistoryPrompt: function(historyArray) {
    if (!historyArray || historyArray.length === 0) return "";
    const stopWords = ['the', 'and', 'are', 'was', 'were', 'that', 'this', 'have', 'has', 'had', 'what', 'when', 'where', 'who', 'how', 'why', 'then', 'there', 'their', 'they', 'them', 'with', 'from', 'about'];
    let processedHistory = [];
    
    historyArray.slice(-80).forEach(item => {
      if (typeof item !== 'string') return;
      if (item.length > 30) {
        const words = item.toLowerCase().replace(/[^\p{L}\p{N}]/gu, " ").split(/\s+/);
        const validWords = words.filter(w => w.length > 1 && !stopWords.includes(w));
        const keywords = [...new Set(validWords)].slice(0, 5).join(' ');
        if (keywords) processedHistory.push(keywords);
      } else {
        processedHistory.push(item);
      }
    });
    
    return "\n\nHISTORY (LỊCH SỬ): Vui lòng cố gắng tránh lặp lại các khái niệm gần đây sau đây để nội dung luôn mới mẻ: [" + processedHistory.join(' | ') + "].\n";
  },

  // ============================================================================
  // 2. MASTER PROMPT BUILDER & SCHEMAS (Internal Lõi Bọc Thép)
  // ============================================================================
  _buildSystemPrompt: function(forgeType, subType, level, lang, topic, dataMode = 'vocab', isReverse = false) {
    let actualIsReverse = isReverse;
    try {
      const settingsStr = localStorage.getItem(STORAGE_KEYS?.SETTINGS || 'fc_settings');
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        if (settings.startSide === 'def') actualIsReverse = true;
      }
      
      if (subType === 'vocab_mcq' || subType === 'grammar_mcq') {
        const quizConfigStr = localStorage.getItem('fc_quiz_config');
        if (quizConfigStr) {
          const quizConfig = JSON.parse(quizConfigStr);
          if (quizConfig.askMode === 'def') {
            actualIsReverse = true;
          } else if (quizConfig.askMode === 'term') {
            actualIsReverse = false;
          }
        }
      }
    } catch(e) {}
    
    const targetLangName = lang === 'zh' ? 'Tiếng Trung' : (lang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh');
    const cefrLevel = ExamProfiles?.getCefrLevel ? ExamProfiles.getCefrLevel(level) : "Intermediate";
    
    // Tính toán Ngưỡng Từ loại Động (Dynamic POS Threshold)
    let isAdvancedLevel = false;
    if (typeof level === 'string') {
      const advKeywords = ['level_5', 'level_6', 'hsk5', 'hsk6', 'hsk 5', 'hsk 6', 'c1', 'c2'];
      isAdvancedLevel = advKeywords.some(kw => level.toLowerCase().includes(kw));
    }
    const posThresholdStr = isAdvancedLevel ? "10%" : "20%";
    
    // Lấy luật Sư phạm động từ Ma trận (Pedagogy Routing Matrix V1.14)
    const pedagogyRules = IoeDataEngine?.getPedagogyMatrixRule ? IoeDataEngine.getPedagogyMatrixRule(level, lang) : {
      example: "Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng.",
      definition: "Bản dịch Tiếng Việt trực tiếp, chuẩn xác. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa."
    };
    
    let prompt = `Bạn là một gia sư ${targetLangName} chuyên nghiệp và tận tâm, đang tạo nội dung cho một ứng dụng giáo dục.\n`;
    prompt += `CẤP ĐỘ MỤC TIÊU: ${level} (Tiêu chuẩn tương đương: ${cefrLevel}).\n`;
    
    const levelContext = IoeDataEngine?.GRADE_CONTEXTS?.[level] || "";
    if (levelContext) prompt += `NGỮ CẢNH (CONTEXT): ${levelContext}\n`;
    
    if (lang === 'zh') {
      prompt += `QUY TẮC TỪ VỰNG: Vui lòng sử dụng từ vựng phù hợp với tiêu chuẩn ${level}. Đối với cấp độ cơ bản (HSK 1-2), chỉ dùng các từ giao tiếp hàng ngày cơ bản. Với cấp độ cao hơn, dùng từ vựng nâng cao phù hợp nhưng không quá hiếm gặp hoặc tối nghĩa.\n`;
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
    
    const isTopicFree = topic === 'ANY' || subType === 'pronunciation' || subType === 'odd_one_out' || subType === 'spot_mistake';
    if (isTopicFree) {
      prompt += `TỰ DO CHỦ ĐỀ: Bạn có thể tùy ý chọn từ các chủ đề ${lang === 'zh' ? 'đời sống hàng ngày' : 'Cambridge'} phổ biến.\n`;
    } else if (topic) {
      prompt += `TẬP TRUNG CHỦ ĐỀ: Vui lòng tạo nội dung liên quan chặt chẽ đến chủ đề: "${topic}".\n`;
    }
    
    if (forgeType === 'base_card') {
      prompt += `NHIỆM VỤ: Tạo một ${dataMode === 'sentence' ? 'câu văn' : 'từ vựng'} phù hợp với cấp độ và chủ đề đã giao.\n`;
      
      const typeRule = IoeDataEngine?.getMicroTierVocabTypeRule ? IoeDataEngine.getMicroTierVocabTypeRule(level) : "";
      if (typeRule && dataMode === 'vocab') {
        prompt += typeRule + "\n";
        prompt += `TÍNH TRỰC QUAN: Đối với từ vựng, ưu tiên chọn các danh từ cụ thể, có hình khối rõ ràng nếu có thể.\n`;
      }
      
      // [V1.53] Áp dụng luật dịch nghĩa từ Ma trận Định tuyến
      prompt += `QUY TẮC ĐỊNH NGHĨA: Trường 'definition' BẮT BUỘC tuân thủ: ${pedagogyRules.definition} Ngoài ra, cung cấp thêm một 'image_keyword' bằng Tiếng Anh đơn giản.\n`;
      
      // PRE-COMPUTATION CONSTRAINT: Dời luật Ngữ pháp lên trước luật JSON
      if (dataMode === 'vocab') {
        prompt += `\n[CÁC LỖI NGỮ PHÁP NGHIÊM CẤM]:\n`;
        // [V1.54] LOGIC CENTRALIZATION: Tích hợp Vắc-xin Ngữ pháp từ Block 2.2
        const grammarRule = IoeDataEngine?.getMicroTierGrammarRule ? IoeDataEngine.getMicroTierGrammarRule(lang) : `- Chỉ phân loại theo đúng ngữ pháp ngôn ngữ gốc, tuyệt đối không vay mượn ngữ pháp bản dịch Tiếng Việt.\n`;
        prompt += grammarRule + "\n";
        
        // [V1.52] PROMPT RESTRUCTURING
        prompt += `\n[QUY TẮC ĐỊNH DẠNG JSON (TỪ VỰNG)]:\n`;
        prompt += `  -> THỨ TỰ BẮT BUỘC: Phải xuất trường 'posAnalysis' ĐẦU TIÊN trong chuỗi JSON để làm nháp.\n`;
        prompt += `  -> 'posAnalysis' (TỜ GIẤY NHÁP): Tư duy theo chuỗi. BẮT BUỘC viết phân tích chức năng ngữ pháp TRƯỚC, sau đó mới chốt lại tỉ lệ % ở cuối cùng. (VD: Từ này ghép bởi A và B, hoạt động như C, do đó C chiếm 100%, D chiếm 0%). [LUẬT ÉP 0%]: Nếu vi phạm [CÁC LỖI NGỮ PHÁP NGHIÊM CẤM], lập tức ép % về 0.\n`;
        prompt += `  -> 'partOfSpeech': Dựa vào 'posAnalysis', CHỈ xuất các từ loại >${posThresholdStr}, cách nhau bằng '|'. Dịch tên từ loại sang Tiếng Việt.\n`;
        
        // [V1.53] Áp dụng luật ví dụ từ Ma trận Định tuyến
        prompt += `  -> 'example': Câu ví dụ BẮT BUỘC phải chứa CHÍNH XÁC từ vựng ở trường 'term'. [TIÊU CHUẨN SƯ PHẠM]: ${pedagogyRules.example}\n`;
        prompt += `  -> [ĐỊNH DẠNG BẮT BUỘC CỦA EXAMPLE]:\n`;
        prompt += `     1. Ánh xạ 1:1 với 'partOfSpeech' (Đúng số lượng, đúng thứ tự từ loại), mỗi câu 1 dòng.\n`;
        prompt += `     2. Bắt đầu mỗi câu bằng dấu "- " (gạch ngang và khoảng trắng), theo sau là: Câu ngoại ngữ | Bản dịch.\n`;
        prompt += `     3. KHÔNG chứa Pinyin/IPA, KHÔNG chèn tag từ loại.\n`;
      }
    }
    else if (forgeType === 'matrix') {
      if (subType === 'match' || subType === 'match_hard') {
        // [V1.53] Áp dụng luật dịch nghĩa từ Ma trận Định tuyến
        prompt += `NHIỆM VỤ: Tạo chính xác 5 cặp ${dataMode === 'sentence' ? 'câu văn' : 'từ vựng'} và bản dịch Tiếng Việt chính xác của chúng.\n`;
        prompt += `QUY TẮC DỊCH NGHĨA: ${pedagogyRules.definition}\n`;
        
        const typeRule = IoeDataEngine?.getMicroTierVocabTypeRule ? IoeDataEngine.getMicroTierVocabTypeRule(level) : "";
        if (typeRule && dataMode === 'vocab') {
          prompt += typeRule + "\n";
          prompt += `QUY TẮC RÕ RÀNG VỀ MẶT THỊ GIÁC: Sử dụng các danh từ cụ thể ở đúng cấp độ chuẩn (${cefrLevel}) để mang lại kết quả học tập tốt hơn.\n`;
        }
        
        if (subType === 'match_hard') {
          prompt += `NHIỆM VỤ BỔ SUNG: Tạo thêm 2 mục BẪY (đáp án sai, có vẻ hợp lý) để thử thách học viên, kèm theo giải thích bằng Tiếng Việt.\n`;
        }
      } else if (subType === 'odd_one_out') {
        const allTopics = ["Animals", "Food", "Colors", "Numbers", "Body parts", "Clothes", "House", "School", "Jobs", "Weather", "Sports", "Vehicles", "Nature", "Emotions", "Technology", "Space", "Art", "Music", "Medicine", "Business"];
        const shuffledTopics = Utils && Utils.shuffleArray ? Utils.shuffleArray([...allTopics]) : allTopics.sort(() => Math.random() - 0.5);
        
        prompt += `NHIỆM VỤ: Tạo một câu hỏi 'Tìm Từ Khác Loại' gồm 4 từ ${targetLangName} ở cấp độ ${cefrLevel}.\n`;
        prompt += `MỒI NGỮ NGHĨA: Hãy chọn 3 từ thuộc nhóm [${shuffledTopics[0]}] và 1 từ khác loại thuộc nhóm [${shuffledTopics[1]}].\n`;
        
        const oddRule = IoeDataEngine?.getMicroTierOddRule ? IoeDataEngine.getMicroTierOddRule(targetLangName, dataMode, level, topic) : "";
        if (oddRule) prompt += oddRule + "\n";
        
        prompt += `QUY TẮC BẮT BUỘC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT.\n`;
      } else if (subType === 'pronunciation') {
        prompt += `NHIỆM VỤ: Tạo một câu hỏi Ngữ âm/Phát âm gồm 4 từ ${targetLangName} ở cấp độ ${cefrLevel}.\n`;
        prompt += `QUY TẮC BẮT BUỘC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT.\n`;
      }
    }
    else if (forgeType === 'context') {
      if (subType === 'fill_blank') {
        prompt += `NHIỆM VỤ: Tạo một câu văn ${targetLangName} ở cấp độ ${cefrLevel}. Chọn MỘT từ vựng quan trọng làm 'targetWord'.\n`;
        prompt += `TỐI QUAN TRỌNG: KHÔNG ĐƯỢC chèn '[__________]' vào trong câu. Trường 'displaySentence' BẮT BUỘC phải chứa nguyên văn toàn bộ câu không bị chỉnh sửa.\n`;
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
            // [V1.53] Áp dụng luật dịch nghĩa từ Ma trận Định tuyến
            prompt += `- 'definition': ${pedagogyRules.definition}\n`;
            prompt += `- 'options': 4 câu văn hoàn chỉnh bằng TIẾNG VIỆT dịch nghĩa cho 'displaySentence' (1 đáp án dịch đúng, 3 đáp án nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT bản dịch tiếng Việt của 'displaySentence'.\n`;
          }
        } else {
          // [V1.53] Áp dụng luật dịch nghĩa từ Ma trận Định tuyến
          prompt += `- 'definition': ${pedagogyRules.definition}\n`;
          prompt += `- 'displaySentence': Một câu ví dụ ngắn gọn bằng ${targetLangName}.\n`;
          if (actualIsReverse) {
            prompt += `- 'options': 4 từ/cụm từ ngắn bằng ${targetLangName} dịch từ 'definition' (1 đúng, 3 nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT nội dung của trường 'term'.\n`;
          } else {
            prompt += `- 'options': 4 từ/cụm từ ngắn bằng TIẾNG VIỆT dịch nghĩa cho 'term' (1 đúng, 3 nhiễu). TỐI QUAN TRỌNG: 1 đáp án đúng BẮT BUỘC PHẢI SAO CHÉP GIỐNG HỆT nội dung của trường 'definition'.\n`;
          }
        }
        
        prompt += `ĐÁP ÁN NHIỄU (DISTRACTORS): Cung cấp 3 đáp án nhiễu sai nhưng có vẻ hợp lý và liên quan đến chủ đề.\n`;
        prompt += `TỪ KHÓA ẢNH (IMAGE KEYWORD): Cung cấp một 'image_keyword' bằng Tiếng Anh đơn giản mô tả đáp án đúng.\n`;
        prompt += `QUY TẮC BẮT BUỘC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT, giải thích lý do tại sao đáp án đúng lại phù hợp và tại sao các đáp án khác lại sai.\n`;
      } else if (subType === 'spot_mistake') {
        prompt += `NHIỆM VỤ: Tạo một câu ${targetLangName} ở cấp độ ${cefrLevel} chứa DUY NHẤT MỘT lỗi sai nhỏ (về ngữ pháp hoặc từ vựng).\n`;
        prompt += `QUY TẮC: Cung cấp câu sai, từ bị sai, từ sửa lại cho đúng, và phần giải thích bằng TIẾNG VIỆT.\n`;
      } else if (subType === 'listening') {
        prompt += `NHIỆM VỤ: Tạo một kịch bản bài nghe hiểu và 1 câu hỏi trắc nghiệm 4 đáp án ở cấp độ ${cefrLevel}. Phần giải thích PHẢI BẰNG TIẾNG VIỆT.\n`;
      } else if (subType === 'reading_passage') {
        prompt += `NHIỆM VỤ: Tạo một đoạn văn đọc hiểu và các câu hỏi kèm theo ở cấp độ ${cefrLevel}.\n`;
        prompt += `CÂU HỎI: Kết hợp giữa Trắc nghiệm, True/False/Not Given hoặc Điền Khuyết. Phần giải thích cho mỗi câu PHẢI BẰNG TIẾNG VIỆT.\n`;
      }
    }
    
    const randomSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
    prompt += `\n[MÃ HẠT GIỐNG - SEED: ${randomSeed}] SỰ SÁNG TẠO: Vui lòng giữ cho nội dung luôn phong phú, đa dạng và thú vị.\n`;
    
    return prompt;
  },

  _getMasterSchema: function(forgeType, subType, dataMode = 'vocab', level = "") {
    const commonProps = { cefr_level: { type: "STRING" } };
    const commonRequired = ["cefr_level"];
    
    // Tính toán Ngưỡng Từ loại Động (Dynamic POS Threshold)
    let isAdvancedLevel = false;
    if (typeof level === 'string') {
      const advKeywords = ['level_5', 'level_6', 'hsk5', 'hsk6', 'hsk 5', 'hsk 6', 'c1', 'c2'];
      isAdvancedLevel = advKeywords.some(kw => level.toLowerCase().includes(kw));
    }
    const posThresholdStr = isAdvancedLevel ? "10%" : "20%";
    
    if (forgeType === 'base_card') {
      const baseRequired = ["term", "definition", "image_keyword"];
      if (dataMode === 'sentence') {
        baseRequired.push("grammar_type");
      } else {
        baseRequired.push("posAnalysis", "partOfSpeech", "example");
      }
      
      return {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" },
          image_keyword: { type: "STRING" },
          grammar_type: { type: "ARRAY", items: { type: "STRING" } },
          posAnalysis: { type: "STRING", description: `Tờ giấy nháp: Tư duy theo chuỗi. BẮT BUỘC viết phân tích chức năng ngữ pháp TRƯỚC, sau đó mới chốt lại tỉ lệ % ở cuối cùng. Ép 0% nếu vi phạm luật cấm. Quyết định loại bỏ các từ loại có tỉ lệ <${posThresholdStr}.` },
          partOfSpeech: { type: "STRING", description: `Từ loại của từ (BẰNG TIẾNG VIỆT). Xuất kết quả cuối cùng từ posAnalysis (chỉ lấy >${posThresholdStr}), cách nhau bằng dấu '|'.` },
          // [V1.51] Đánh dấu neo "- " cho thuật toán bẻ dòng
          example: { type: "STRING", description: "Multiline string containing examples. MUST generate exactly ONE example sentence for EACH part of speech listed in 'partOfSpeech' AND KEEP THE EXACT ORDER. Format each line exactly as: - Foreign Sentence | Vietnamese Translation" },
          ...commonProps
        },
        required: [...baseRequired, ...commonRequired]
      };
    }
    
    if (forgeType === 'matrix') {
      if (subType === 'match') return { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, definition: { type: "STRING" } }, required: ["term", "definition"] } }, ...commonProps }, required: ["items", ...commonRequired] };
      if (subType === 'match_hard') return { type: "OBJECT", properties: { correctPairs: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, definition: { type: "STRING" } }, required: ["term", "definition"] } }, trapPairs: { type: "ARRAY", items: { type: "OBJECT", properties: { wrongWord: { type: "STRING" }, correction: { type: "STRING" }, definition: { type: "STRING" }, explanation: { type: "STRING" } }, required: ["wrongWord", "correction", "definition", "explanation"] } }, ...commonProps }, required: ["correctPairs", "trapPairs", ...commonRequired] };
      if (subType === 'odd_one_out') return { type: "OBJECT", properties: { words: { type: "ARRAY", items: { type: "STRING" } }, oddWord: { type: "STRING" }, explanation: { type: "STRING" }, ...commonProps }, required: ["words", "oddWord", "explanation", ...commonRequired] };
      if (subType === 'pronunciation') return { type: "OBJECT", properties: { term: { type: "STRING" }, definition: { type: "STRING" }, options: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, isCorrect: { type: "BOOLEAN" } }, required: ["text", "isCorrect"] } }, ...commonProps }, required: ["term", "definition", "options", ...commonRequired] };
    }
    
    if (forgeType === 'context') {
      if (subType === 'fill_blank') return { type: "OBJECT", properties: { displaySentence: { type: "STRING" }, targetWord: { type: "STRING" }, hint: { type: "STRING" }, ...commonProps }, required: ["displaySentence", "targetWord", "hint", ...commonRequired] };
      if (subType === 'vocab_mcq' || subType === 'grammar_mcq') return { type: "OBJECT", properties: { term: { type: "STRING" }, definition: { type: "STRING" }, displaySentence: { type: "STRING" }, options: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, isCorrect: { type: "BOOLEAN" } }, required: ["text", "isCorrect"] } }, image_keyword: { type: "STRING" }, explanation: { type: "STRING" }, ...commonProps }, required: ["term", "definition", "displaySentence", "options", "image_keyword", "explanation", ...commonRequired] };
      if (subType === 'spot_mistake') return { type: "OBJECT", properties: { wrongSentence: { type: "STRING" }, wrongWord: { type: "STRING" }, correction: { type: "STRING" }, explanation: { type: "STRING" }, ...commonProps }, required: ["wrongSentence", "wrongWord", "correction", "explanation", ...commonRequired] };
      if (subType === 'listening') return { type: "OBJECT", properties: { audioScript: { type: "STRING" }, question: { type: "STRING" }, options: { type: "ARRAY", items: { type: "OBJECT", properties: { text: { type: "STRING" }, isCorrect: { type: "BOOLEAN" } }, required: ["text", "isCorrect"] } }, explanation: { type: "STRING" }, ...commonProps }, required: ["audioScript", "question", "options", "explanation", ...commonRequired] };
      if (subType === 'reading_passage') return { type: "OBJECT", properties: { passage: { type: "STRING" }, questions: { type: "ARRAY", items: { type: "OBJECT", properties: { type: { type: "STRING" }, questionText: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correctAnswer: { type: "STRING" }, explanation: { type: "STRING" } }, required: ["type", "questionText", "correctAnswer", "explanation"] } }, ...commonProps }, required: ["passage", "questions", ...commonRequired] };
    }
    return null;
  },

  // ============================================================================
  // 3. LÒ ĐÚC 1: LÒ ĐÚC CƠ SỞ (FORGE BASE CARD)
  // ============================================================================
  forgeBaseCard: async function(level, lang, apiKey, topic = "", historyPrompt = "", dataMode = 'vocab', isReverse = false) {
    let timeoutId;
    try {
      let prompt = this._buildSystemPrompt('base_card', null, level, lang, topic, dataMode, isReverse);
      if (historyPrompt) prompt += historyPrompt;
      
      const schema = this._getMasterSchema('base_card', null, dataMode, level);
      const aiPromise = callGeminiApi(prompt, schema, apiKey);
      
      let dynamicTimeout = 20000;
      try {
        const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config'));
        if (aiCfg && aiCfg.loadingTime) dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
      } catch(e) {}
      
      const timeoutPromise = new Promise((_, r) => {
        timeoutId = setTimeout(() => r(new Error("AI Base Card Timeout")), dynamicTimeout);
      });
      
      const res = await Promise.race([aiPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      
      const parsed = Utils.parseAiJson(res.text);
      return {
        term: parsed.term,
        definition: parsed.definition,
        image_keyword: parsed.image_keyword || parsed.term,
        cefr_level: parsed.cefr_level || "",
        grammar_type: parsed.grammar_type || [],
        partOfSpeech: parsed.partOfSpeech || "",
        example: parsed.example || "",
        isAiGenerated: true,
        _tokenUsage: res.tokenMetadata
      };
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error("forgeBaseCard Error:", e);
      if (window.logSystemEvent) window.logSystemEvent("Lò Đúc Cơ Sở (Base Card) sập", e);
      throw e;
    }
  },

  // ============================================================================
  // 4. LÒ ĐÚC 2: LÒ ĐÚC MA TRẬN (FORGE MATRIX)
  // ============================================================================
  forgeMatrix: async function(subType, level, lang, apiKey, topic = "", historyPrompt = "", dataMode = 'vocab', isReverse = false) {
    let timeoutId;
    try {
      let prompt = this._buildSystemPrompt('matrix', subType, level, lang, topic, dataMode, isReverse);
      if (historyPrompt) prompt += historyPrompt;
      
      const schema = this._getMasterSchema('matrix', subType, dataMode, level);
      const aiPromise = callGeminiApi(prompt, schema, apiKey);
      
      let dynamicTimeout = 25000;
      try {
        const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config'));
        if (aiCfg && aiCfg.loadingTime) dynamicTimeout = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
      } catch(e) {}
      
      const timeoutPromise = new Promise((_, r) => {
        timeoutId = setTimeout(() => r(new Error("AI Matrix Timeout")), dynamicTimeout);
      });
      
      const res = await Promise.race([aiPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      
      const parsed = Utils.parseAiJson(res.text);
      const result = { ...parsed, isAiGenerated: true, type: subType, _tokenUsage: res.tokenMetadata };
      
      if (subType === 'odd_one_out' && result.words && Array.isArray(result.words)) {
        result.words = Utils.shuffleArray(result.words);
      }
      if (subType === 'pronunciation' && result.options && Array.isArray(result.options)) {
        result.options = Utils.shuffleArray(result.options);
      }
      if ((subType === 'match' || subType === 'match_hard') && result.items) {
        result.items = Utils.shuffleArray(result.items);
      }
      
      return result;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error(`forgeMatrix [${subType}] Error:`, e);
      if (window.logSystemEvent) window.logSystemEvent(`Lò Đúc Ma Trận (${subType}) sập`, e);
      throw e;
    }
  },

  // ============================================================================
  // 5. LÒ ĐÚC 3: LÒ ĐÚC NGỮ CẢNH (FORGE CONTEXT)
  // ============================================================================
  forgeContext: async function(subType, level, lang, apiKey, topic = "", historyPrompt = "", dataMode = 'vocab', isReverse = false) {
    let timeoutId;
    try {
      let prompt = this._buildSystemPrompt('context', subType, level, lang, topic, dataMode, isReverse);
      if (historyPrompt) prompt += historyPrompt;
      
      const schema = this._getMasterSchema('context', subType, dataMode, level);
      const aiPromise = callGeminiApi(prompt, schema, apiKey);
      
      let dynamicTimeout = subType === 'reading_passage' ? 35000 : 25000;
      try {
        const aiCfg = JSON.parse(localStorage.getItem('fc_ai_config'));
        if (aiCfg && aiCfg.loadingTime) {
          const baseTime = parseInt(aiCfg.loadingTime, 10);
          dynamicTimeout = (baseTime * 1000) + 5000;
          if (subType === 'reading_passage') {
            dynamicTimeout += 5000;
          }
        }
      } catch(e) {}
      
      const timeoutPromise = new Promise((_, r) => {
        timeoutId = setTimeout(() => r(new Error(`AI Context Timeout (${subType})`)), dynamicTimeout);
      });
      
      const res = await Promise.race([aiPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      
      const parsed = Utils.parseAiJson(res.text);
      const result = { ...parsed, isAiGenerated: true, type: subType, _tokenUsage: res.tokenMetadata };
      
      if (subType === 'listening' || subType === 'grammar_mcq' || subType === 'vocab_mcq') {
        if (result.options && Array.isArray(result.options)) {
          result.options = Utils.shuffleArray(result.options);
        }
      }
      
      return result;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error(`forgeContext [${subType}] Error:`, e);
      if (window.logSystemEvent) window.logSystemEvent(`Lò Đúc Ngữ Cảnh (${subType}) sập`, e);
      throw e;
    }
  }
};