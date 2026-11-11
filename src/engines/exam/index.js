/**
 * @file src/engines/exam/index.js
 * @description The Core Hydrator & Hợp nhất khối Khảo thí Tầng 2.7. Động cơ nạp đề thi nguyên tử. Đóng vai trò Cảnh sát giao thông điều phối giữa DB, AI, Normalizer.
 * @origin Tầng 2 - Block 2.7d (The Core Hydrator)
 */

import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { AiFactoryEngine } from '../aiFactory';
import { IoeDataEngine } from '../pedagogyEngine';
import { FallbackDataEngine } from '../fallbackData';
import { MICRO_PROMPTS } from '../microPrompts';

import { ExamMemory } from './examMemory';
import { ExamFallback } from './examFallback';
import { ExamNormalizer } from './examNormalizer';

export const ExamEngine = {
  // Kế thừa toàn bộ chức năng của Bộ nhớ (Volatile RAM) và Lưới lọc sư phạm
  ...ExamMemory,
  
  // Ánh xạ các chức năng từ các Module con
  _generateFallbackData: ExamFallback.generateFallbackData,
  _normalizeForMinigame: ExamNormalizer.normalizeForMinigame,

  // ============================================================================
  // 1. HYDRATION LOGIC (CỖ MÁY NẠP ĐẠN NGUYÊN TỬ TỐI THƯỢNG)
  // ============================================================================
  hydrateQuestion: async function(metadata, apiKey, passedHistory = []) {
    const { id, track, level, type, topic, passageGroup, questionIndexInPassage, index, mode, grammarId } = metadata;
    let questionData = null;
    const isMinigame = mode === 'minigame' || !['ioe', 'ielts', 'hsk'].includes(track);

    // [BẢN VÁ 2.9] TRẠM TRÍCH XUẤT NGỮ PHÁP & MÀNG LỌC TƯƠNG THÍCH NGƯỢC
    const extractGrammarPrompt = (metaId) => {
      if (!metaId || !MICRO_PROMPTS) return "";
      let foundGrammar = null;
      for (const poolKey in MICRO_PROMPTS) {
        if (MICRO_PROMPTS[poolKey][metaId]) {
          foundGrammar = MICRO_PROMPTS[poolKey][metaId];
          break;
        }
      }
      if (foundGrammar) {
        const grammarStr = typeof foundGrammar === 'object' ? (foundGrammar.prompt || "") : foundGrammar;
        if (grammarStr) return `\n[YÊU CẦU NGỮ PHÁP ÉP BUỘC TỪ NGƯỜI DÙNG]: ${grammarStr}\n`;
      }
      return "";
    };
    
    const userGrammarConstraint = extractGrammarPrompt(grammarId);

    // Kiểm tra bộ nhớ đệm (Chỉ dành cho Mock Test)
    if (FcDB && !isMinigame) {
      try {
        questionData = await FcDB.get(id, 'fc_questions_bank');
      } catch(e) {
        console.warn("[ExamEngine] DB Get Error or Store missing:", e);
      }
    }

    if (questionData) {
      return questionData;
    }

    console.log("[ExamEngine] Hydrating via Universal Engine for type: " + type);
    
    let generatedData = null;
    let isFromHarvestPool = false;
    let harvestId = null;
    let isNewHarvest = false;
    let ratio = 70;
    let harvestPool = {};
    let userHistory = [];

    // Nội suy ngôn ngữ an toàn tuyệt đối
    const metaLang = metadata.lang || metadata.language;
    const localLang = window.localStorage ? localStorage.getItem('fc_lang') : 'en';
    const targetLang = metaLang ? metaLang : ((track === 'hsk' || String(level).startsWith('zh')) ? 'zh' : ((track === 'vi' || String(level).startsWith('vi')) ? 'vi' : (localLang || 'en')));
    const safeTopic = topic || 'General';

    // Nạp cấu hình Offline
    if (FcDB && !isMinigame) {
      try {
        const r = await FcDB.get('fc_exam_ratio');
        if (r !== undefined && r !== null) ratio = Number(r);
        const p = await FcDB.get('fc_exam_pool');
        if (p) harvestPool = p;
        const h = await FcDB.get('fc_user_exam_history');
        if (h && Array.isArray(h)) userHistory = h;
      } catch(e) { console.warn("[ExamEngine] Lỗi đọc DB Lai:", e); }
    }

    const fetchFromOfflinePool = (targetType) => {
      if (!harvestPool[targetLang] || !harvestPool[targetLang][level] || !harvestPool[targetLang][level][safeTopic] || !harvestPool[targetLang][level][safeTopic][targetType]) return null;
      const items = harvestPool[targetLang][level][safeTopic][targetType];
      if (!items || items.length === 0) return null;
      const available = items.filter(item => !userHistory.includes(item.id));
      if (available.length === 0) return null;
      return available[Math.floor(Math.random() * available.length)];
    };

    const autoHarvest = (contentData, itemType) => {
      return "ex_" + itemType + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    };

    const tryOfflineFirst = (Math.random() * 100) <= ratio && !isMinigame;

    // --- CHIẾN DỊCH ĐỌC HIỂU: THUẬT TOÁN "BẺ KÉN" (PASSAGE GROUPING) ---
    if (passageGroup) {
      const groupId = passageGroup;
      const qIndex = questionIndexInPassage || 0;
      
      if (!this._passageLocks[groupId]) {
        this._passageLocks[groupId] = (async () => {
          let pData = null;
          let pLastErr = null;
          const pType = type.includes('reading') ? 'ielts_reading_passage' : type;
          
          if (tryOfflineFirst) {
            const picked = fetchFromOfflinePool(pType);
            if (picked && picked.content && picked.content.questions && picked.content.questions.length > 0) {
              pData = JSON.parse(JSON.stringify(picked.content));
              pData._harvestId = picked.id;
              console.log("[ExamEngine] Offline Passage Hit: " + picked.id);
            }
          }
          
          if (!pData) {
            try {
              if (!apiKey) throw new Error("Missing API Key");
              let currentFreshHistory = Utils?.AiMemoryManager ? Utils.AiMemoryManager.get() : [];
              let historyPrompt = AiFactoryEngine && currentFreshHistory.length > 0 ? AiFactoryEngine.getHistoryPrompt(currentFreshHistory) : "";
              historyPrompt = userGrammarConstraint + historyPrompt; // Tiêm yêu cầu ngữ pháp
              
              const parsed = await AiFactoryEngine.forgeContext('reading_passage', level, targetLang, apiKey, topic, historyPrompt);
              if (!parsed || !parsed.passage || !parsed.questions || parsed.questions.length === 0) {
                throw new Error("Ảo giác AI: Tổ kén bị rỗng.");
              }
              
              if (parsed._tokenUsage) {
                const used = parsed._tokenUsage.totalTokenCount || 0;
                const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
                localStorage.setItem('fc_total_tokens', currentTotal + used);
              }
              
              pData = parsed;
              pData._harvestId = autoHarvest(parsed, pType);
              pData.id = pData._harvestId;
              pData._isNewHarvest = true;
            } catch(e) {
              pLastErr = e;
            }
            if (!pData) throw pLastErr;
          }
          return pData;
        })();
        
        setTimeout(() => {
          if (this._passageLocks[groupId]) {
            delete this._passageLocks[groupId];
          }
        }, 300000);
      }
      
      try {
        const passageSet = await this._passageLocks[groupId];
        
        // Chế độ Mini-game: Trả thẳng nguyên Tổ kén
        if (isMinigame) {
          return { id: passageSet.id || autoHarvest(passageSet, 'reading_passage'), metadata, content: passageSet, timestamp: Date.now() };
        }
        
        // Chế độ Khảo thí: Trả từng câu hỏi con
        let qData = passageSet.questions[qIndex];
        let isRescuedPassageChild = false;
        
        if (!qData) {
          console.warn("[ExamEngine] Ảo giác AI: Tổ kén thiếu câu hỏi số " + (qIndex + 1) + ". Kích hoạt Tự vá Tổ kén.");
          const fallbackQ = passageSet.questions[0];
          if (fallbackQ) {
            qData = { ...fallbackQ, questionText: fallbackQ.questionText + " (Review)" };
          } else {
            qData = {
              type: 'tfng',
              questionText: "This passage is informative and provides useful details.",
              options: ["True", "False", "Not Given"],
              correctAnswer: "True",
              explanation: "Hệ thống tự động bù đắp do AI sinh thiếu câu hỏi."
            };
          }
          isRescuedPassageChild = true;
        }
        
        let tempGeneratedData = {
          passage: passageSet.passage,
          explanation: qData.explanation,
          isAiGenerated: !isRescuedPassageChild,
          _isRescued: isRescuedPassageChild
        };
        
        if (qData.type === 'fill_blank') {
          tempGeneratedData.displaySentence = qData.questionText;
          tempGeneratedData.targetWord = qData.correctAnswer;
          
          if (tempGeneratedData.displaySentence && tempGeneratedData.targetWord && !tempGeneratedData.displaySentence.includes('[__________]')) {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const safeWord = escapeRegExp(tempGeneratedData.targetWord);
            let regex;
            try { regex = new RegExp(`\\b${safeWord}\\b`, 'i'); } catch(e) { regex = new RegExp(safeWord, 'i'); }
            if (regex.test(tempGeneratedData.displaySentence)) {
              tempGeneratedData.displaySentence = tempGeneratedData.displaySentence.replace(regex, '[__________]');
            } else {
              tempGeneratedData.displaySentence = tempGeneratedData.displaySentence.replace(tempGeneratedData.targetWord, '[__________]');
            }
            if (!tempGeneratedData.displaySentence.includes('[__________]')) {
              tempGeneratedData.displaySentence += ' [__________]';
            }
          }
          metadata.type = 'ioe_fill_blank';
        } else if (qData.type === 'tfng') {
          tempGeneratedData.term = qData.questionText;
          tempGeneratedData.options = [
            {text: "True", isCorrect: String(qData.correctAnswer).toLowerCase() === 'true'},
            {text: "False", isCorrect: String(qData.correctAnswer).toLowerCase() === 'false'},
            {text: "Not Given", isCorrect: String(qData.correctAnswer).toLowerCase() === 'not given'}
          ];
          if (!tempGeneratedData.options.some(o=>o.isCorrect)) tempGeneratedData.options[0].isCorrect = true;
          metadata.type = 'ioe_multiple_choice';
        } else {
          tempGeneratedData.term = qData.questionText;
          const mappedOptions = (qData.options && qData.options.length > 0 ? qData.options : ["A","B","C","D"]).map(o => ({ text: o, isCorrect: String(o).toLowerCase().trim() === String(qData.correctAnswer).toLowerCase().trim() || String(o).includes(String(qData.correctAnswer)) }));
          tempGeneratedData.options = Utils && Utils.shuffleArray ? Utils.shuffleArray(mappedOptions) : mappedOptions;
          if (!tempGeneratedData.options.some(o => o.isCorrect) && tempGeneratedData.options.length > 0) { tempGeneratedData.options[0].isCorrect = true; }
          metadata.type = 'ioe_multiple_choice';
        }
        
        if (!isRescuedPassageChild && !this._sanitizeAiItem(tempGeneratedData, metadata.type, track, level)) {
          throw new Error("Dữ liệu câu hỏi con vi phạm quy tắc (Ám sát sư phạm hoặc thiếu đáp án).");
        }
        
        harvestId = passageSet._harvestId;
        if (passageSet._isNewHarvest && qIndex === 0) {
          isNewHarvest = true;
          tempGeneratedData._fullPassageData = passageSet;
        }
        isFromHarvestPool = !passageSet._isNewHarvest;
        generatedData = tempGeneratedData;
        
      } catch (e) {
        console.error("[ExamEngine] Passage Cocoon break failed for " + groupId + ":", e.message);
        throw e;
      }
    }
    else {
      // --- CÁC CÂU HỎI ĐƠN LẺ NGUYÊN TỬ ---
      if (tryOfflineFirst) {
        const picked = fetchFromOfflinePool(type);
        if (picked && picked.content) {
          let qContent = JSON.parse(JSON.stringify(picked.content));
          const isMCQ = type.includes('multiple_choice') || type.includes('match') || type.includes('image_quiz');
          
          if (isMCQ && (!qContent.options || qContent.options.length < 3)) {
            const isOfflineImageQuiz = type.includes('image_quiz');
            const correctText = isOfflineImageQuiz ? qContent.term : (qContent.definition || qContent.targetWord || qContent.correction || qContent.oddWord || qContent.term || "Đáp án");
            
            if (GameAlgoEngine && GameAlgoEngine.OptionsEngine.offline_generateOptions) {
              try {
                const dists = GameAlgoEngine.OptionsEngine.offline_generateOptions(correctText, [], targetLang, 'vocab', 3, isOfflineImageQuiz);
                qContent.options = Utils.shuffleArray([
                  ...dists.map(d => ({ text: d, isCorrect: false })),
                  { text: correctText, isCorrect: true }
                ]);
              } catch(e) {}
            }
            if (isOfflineImageQuiz && qContent.options) {
              qContent.options = qContent.options.map(opt => ({
                ...opt,
                image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(opt.text + " isolated clipart")}&w=300&h=300&c=7&rs=1&p=0`
              }));
            }
          }
          
          if (this._sanitizeAiItem(qContent, type, track, level)) {
            generatedData = qContent;
            isFromHarvestPool = true;
            harvestId = picked.id;
            console.log("[ExamEngine] Offline Pool Hit: " + harvestId);
          }
        }
      }

      if (!generatedData) {
        try {
          if (!apiKey) {
            throw new Error("Missing API Key for Exam Hydration.");
          }
          
          let currentFreshHistory = Utils?.AiMemoryManager ? Utils.AiMemoryManager.get() : [];
          let finalHistoryPrompt = "";
          if (AiFactoryEngine && currentFreshHistory.length > 0) {
            finalHistoryPrompt = AiFactoryEngine.getHistoryPrompt(currentFreshHistory);
          }
          
          finalHistoryPrompt = userGrammarConstraint + finalHistoryPrompt; // Tiêm yêu cầu ngữ pháp
          
          let tempGeneratedData = null;
          const tType = type.toLowerCase();
          const isMatch = tType === IoeDataEngine?.QUESTION_TYPES?.IOE_MATCH || tType === 'ioe_match';
          const isImageQuiz = tType === IoeDataEngine?.QUESTION_TYPES?.IOE_IMAGE_QUIZ || tType === 'ioe_image_quiz';
          const isQuizType = tType.includes('quiz') || tType.includes('multiple_choice') || isMatch;
          
          const useLegacyAi = window.localStorage ? window.localStorage.getItem('fc_debug_legacy_ai') === 'true' : false;

          // ====================================================================
          // KHỐI LOGIC 1: LẮP RÁP (2-SHOT LEGACY) CHO QUIZ & IMAGE QUIZ & MOCK TEST MATCH
          // ====================================================================
          if (isQuizType && useLegacyAi && (!isMinigame || tType !== 'match')) {
            console.log("[ExamEngine] Running Legacy 2-Shot AI for: " + type);
            const dataModeParam = metadata.dataMode || 'vocab';
            
            tempGeneratedData = await AiFactoryEngine.forgeBaseCard(level, targetLang, apiKey, topic, finalHistoryPrompt, dataModeParam);
            if (!tempGeneratedData) throw new Error("AI returned empty data");
            
            let doubleCheckHistory = Utils?.AiMemoryManager ? Utils.AiMemoryManager.get() : [];
            const termsToCheck = this._extractTermsToCheck(tempGeneratedData, type);
            
            if (this._isDuplicate(termsToCheck, doubleCheckHistory)) {
              throw new Error("[Duplicate Detected] Lưới lọc phát hiện từ khóa trùng lặp. Ép AI đúc lại.");
            }
            
            this._syncMemory(tempGeneratedData, type);
            
            let dists = [];
            const isReverseDistractor = isImageQuiz || metadata.askMode === 'def';
            
            try {
              if (GameAlgoEngine && GameAlgoEngine.OptionsEngine.ai_generateOptions) {
                const distLang = isReverseDistractor && tType.includes('quiz') ? targetLang : 'vi';
                dists = await GameAlgoEngine.OptionsEngine.ai_generateOptions(tempGeneratedData, distLang, dataModeParam === 'sentence' ? 'sentence' : 'word', apiKey, 3, level, topic, isReverseDistractor);
              }
            } catch(aiErr) {
              console.warn("Nhịp 2 (Options AI) thất bại, fallback sang Offline:", aiErr.message);
            }
            
            if (!dists || dists.length < 3) {
              const cleanDeckForTraps = Utils ? Utils.safeJsonParse('fc_data_' + targetLang, []) : [];
              if (GameAlgoEngine && GameAlgoEngine.OptionsEngine.offline_generateOptions) {
                const baseTextForTrap = isReverseDistractor ? tempGeneratedData.term : tempGeneratedData.definition;
                dists = GameAlgoEngine.OptionsEngine.offline_generateOptions(baseTextForTrap, cleanDeckForTraps, targetLang, 'word', 3, isReverseDistractor);
              } else {
                dists = ["Nhiễu 1", "Nhiễu 2", "Nhiễu 3"];
              }
            }
            
            const correctOptText = isImageQuiz ? tempGeneratedData.term : tempGeneratedData.definition;
            const correctOpt = { text: correctOptText, isCorrect: true };
            const wrongOpts = dists.slice(0, 3).map(d => ({ text: d, isCorrect: false }));
            
            tempGeneratedData.options = Utils.shuffleArray([...wrongOpts, correctOpt]);
            
            if (isImageQuiz) {
              tempGeneratedData.options = tempGeneratedData.options.map(opt => {
                let query = opt.text + " isolated clipart";
                if (opt.isCorrect && tempGeneratedData.image_keyword) {
                  query = tempGeneratedData.image_keyword;
                }
                return {
                  ...opt, image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(query)}&w=300&h=300&c=7&rs=1&p=0`
                };
              });
            }
          }
          // ====================================================================
          // KHỐI LOGIC 2: ĐÚC NGUYÊN KHỐI (1-SHOT) CHO QUIZ & IMAGE QUIZ & MOCK TEST MATCH
          // ====================================================================
          else if (isQuizType && !useLegacyAi && (!isMinigame || tType !== 'match')) {
            console.log("[ExamEngine] Running Fast 1-Shot AI for: " + type);
            const forgeType = (metadata.dataMode === 'sentence' || tType.includes('grammar')) ? 'grammar_mcq' : 'vocab_mcq';
            
            tempGeneratedData = await AiFactoryEngine.forgeContext(forgeType, level, targetLang, apiKey, topic, finalHistoryPrompt);
            if (!tempGeneratedData) throw new Error("AI returned empty data for vocab_mcq");
            
            let doubleCheckHistory = Utils?.AiMemoryManager ? Utils.AiMemoryManager.get() : [];
            const termsToCheck = this._extractTermsToCheck(tempGeneratedData, type);
            
            if (this._isDuplicate(termsToCheck, doubleCheckHistory)) {
              throw new Error("[Duplicate Detected] Lưới lọc phát hiện từ khóa trùng lặp. Ép AI đúc lại.");
            }
            
            this._syncMemory(tempGeneratedData, type);
            
            if (isImageQuiz && tempGeneratedData.options) {
              tempGeneratedData.options = tempGeneratedData.options.map(opt => {
                let query = opt.text + " isolated clipart";
                if (opt.isCorrect && tempGeneratedData.image_keyword) {
                  query = tempGeneratedData.image_keyword;
                }
                return {
                  ...opt, image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(query)}&w=300&h=300&c=7&rs=1&p=0`
                };
              });
            }
          }
          // ====================================================================
          // KHỐI LOGIC 3: CÁC DẠNG BÀI ĐẶC THÙ (MINI-GAMES & OTHERS)
          // ====================================================================
          else {
            if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_MULTIPLE_CHOICE || tType === 'ioe_multiple_choice') {
              tempGeneratedData = await AiFactoryEngine.forgeContext('grammar_mcq', level, targetLang, apiKey, topic, finalHistoryPrompt);
            }
            else if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_SPOT_MISTAKE || tType === 'ioe_spot_mistake' || tType === 'spotmistake') {
              tempGeneratedData = await AiFactoryEngine.forgeContext('spot_mistake', level, targetLang, apiKey, topic, finalHistoryPrompt);
            }
            else if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_FILL_BLANK || tType === 'ioe_fill_blank' || tType === 'fillblank') {
              // [CẬP NHẬT V3.0] INJECTION ĐỘNG CƠ 3 MA TRẬN
              let matrixInstruction = "\n[YÊU CẦU SƯ PHẠM QUỐC TẾ CHO GAME ĐIỀN TỪ]:\n";
              matrixInstruction += "1. BẮT BUỘC TRẢ VỀ: Sinh thêm một mảng 'distractors' chứa CHÍNH XÁC 3 từ nhiễu sai (Bẫy). TUYỆT ĐỐI không để mảng này rỗng.\n";
              
              if (userGrammarConstraint) {
                matrixInstruction += "2. CHIẾN LƯỢC NGỮ PHÁP (Khóa cứng): Câu đố PHẢI tuân thủ tuyệt đối [YÊU CẦU NGỮ PHÁP ÉP BUỘC TỪ NGƯỜI DÙNG] ở trên. 'targetWord' phải là từ/cụm từ phản ánh đúng cấu trúc ngữ pháp đó.\n";
              } else {
                const matrixRoll = Math.random();
                if (matrixRoll < 0.35) {
                  matrixInstruction += "2. CHIẾN LƯỢC COLLOCATIONS (35%): Câu đố kiểm tra Cụm từ cố định / Phrasal Verbs / Idioms. Từ đục lỗ (targetWord) nằm trong cụm đó. 3 distractors phải là các từ dễ nhầm lẫn nếu học sinh dịch word-by-word.\n";
                } else if (matrixRoll < 0.70) {
                  matrixInstruction += "2. CHIẾN LƯỢC NGỮ PHÁP (35%): Kiểm tra chuyên sâu một mảng Ngữ pháp bất kỳ (Giới từ, Mạo từ, Liên từ, Chia động từ...). 'targetWord' phải là từ mang chức năng ngữ pháp.\n";
                } else {
                  matrixInstruction += "2. CHIẾN LƯỢC PARAPHRASING (30%): Kiểm tra Đọc hiểu từ đồng nghĩa. Trường 'hint' (Gợi ý) TUYỆT ĐỐI KHÔNG DỊCH SANG TIẾNG VIỆT, mà phải là một cụm từ đồng nghĩa / giải nghĩa bằng ngôn ngữ đích.\n";
                }
              }
              
              const upgradedPrompt = finalHistoryPrompt + matrixInstruction;
              tempGeneratedData = await AiFactoryEngine.forgeContext('fill_blank', level, targetLang, apiKey, topic, upgradedPrompt);
              
              if (tempGeneratedData && tempGeneratedData.displaySentence && tempGeneratedData.targetWord && !tempGeneratedData.displaySentence.includes('[__________]')) {
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const safeWord = escapeRegExp(tempGeneratedData.targetWord);
                let regex;
                try { regex = new RegExp(`\\b${safeWord}\\b`, 'i'); } catch(e) { regex = new RegExp(safeWord, 'i'); }
                if (regex.test(tempGeneratedData.displaySentence)) {
                  tempGeneratedData.displaySentence = tempGeneratedData.displaySentence.replace(regex, '[__________]');
                } else {
                  tempGeneratedData.displaySentence = tempGeneratedData.displaySentence.replace(tempGeneratedData.targetWord, '[__________]');
                }
                if (!tempGeneratedData.displaySentence.includes('[__________]')) {
                  tempGeneratedData.displaySentence += ' [__________]';
                }
              }
            }
            else if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_SCRAMBLE || tType === 'ioe_scramble' || tType === 'scramble') {
              tempGeneratedData = await AiFactoryEngine.forgeBaseCard(level, targetLang, apiKey, topic, finalHistoryPrompt, 'sentence');
            }
            else if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_ODD_ONE_OUT || tType === 'ioe_odd_one_out' || tType === 'oddoneout') {
              tempGeneratedData = await AiFactoryEngine.forgeMatrix('odd_one_out', level, targetLang, apiKey, topic, finalHistoryPrompt, metadata.dataMode || 'vocab');
            }
            else if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_PRONUNCIATION || tType === 'ioe_pronunciation' || tType === 'pronunciation') {
              tempGeneratedData = await AiFactoryEngine.forgeMatrix('pronunciation', level, targetLang, apiKey, topic, finalHistoryPrompt, 'vocab');
            }
            else if (tType === IoeDataEngine?.QUESTION_TYPES?.IOE_LISTENING || tType === 'ioe_listening' || tType === 'listening') {
              tempGeneratedData = await AiFactoryEngine.forgeContext('listening', level, targetLang, apiKey, topic, finalHistoryPrompt);
              if (tempGeneratedData && tempGeneratedData.question) {
                tempGeneratedData.term = tempGeneratedData.question;
              }
            }
            else if (tType === 'match' && isMinigame) {
              const subType = (metadata.hardMode || metadata.difficulty === 'hard') ? 'match_hard' : 'match';
              tempGeneratedData = await AiFactoryEngine.forgeMatrix(subType, level, targetLang, apiKey, topic, finalHistoryPrompt, metadata.dataMode || 'vocab');
            }
            else {
              tempGeneratedData = await AiFactoryEngine.forgeBaseCard(level, targetLang, apiKey, topic, finalHistoryPrompt, metadata.dataMode || 'vocab');
            }
            
            if (!tempGeneratedData) throw new Error("AI returned empty data for type: " + type);
            
            let doubleCheckHistory = Utils?.AiMemoryManager ? Utils.AiMemoryManager.get() : [];
            const termsToCheck = this._extractTermsToCheck(tempGeneratedData, type);
            
            if (this._isDuplicate(termsToCheck, doubleCheckHistory)) {
              throw new Error("[Duplicate Detected] Lưới lọc phát hiện từ khóa trùng lặp. Ép AI đúc lại.");
            }
            
            this._syncMemory(tempGeneratedData, type);
          }

          if (tempGeneratedData._tokenUsage) {
            const used = tempGeneratedData._tokenUsage.totalTokenCount || 0;
            const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
            localStorage.setItem('fc_total_tokens', currentTotal + used);
          }
          
          // ====================================================================
          // [BƯỚC CHUẨN HÓA] NORMALIZATION BẰNG DATA PIPELINE TỪ BLOCK 2.7c
          // ====================================================================
          if (isMinigame && this._normalizeForMinigame) {
            tempGeneratedData = await this._normalizeForMinigame(tempGeneratedData, tType, metadata, targetLang, level, safeTopic, apiKey);
          }
          
          const isOptionsBased = tType === IoeDataEngine?.QUESTION_TYPES?.IOE_MULTIPLE_CHOICE || tType === 'ioe_multiple_choice' || isMatch || isImageQuiz || tType === 'ioe_pronunciation' || tType === 'ioe_listening' || tType.includes('quiz');
          
          if (isOptionsBased && !isMinigame) {
            if (!tempGeneratedData.term || !tempGeneratedData.options || !Array.isArray(tempGeneratedData.options) || tempGeneratedData.options.length === 0) {
              throw new Error("Ảo giác AI: Thiếu trường 'term' hoặc mảng 'options' bị rỗng.");
            }
            if (tType === 'ioe_listening' && !tempGeneratedData.audioScript) {
              throw new Error("Ảo giác AI: Thiếu kịch bản âm thanh 'audioScript'.");
            }
          } else if ((tType === IoeDataEngine?.QUESTION_TYPES?.IOE_SPOT_MISTAKE || tType === 'ioe_spot_mistake') && !isMinigame) {
            if (!tempGeneratedData.wrongSentence || !tempGeneratedData.wrongWord || !tempGeneratedData.correction) {
              throw new Error("Ảo giác AI: Thiếu trường 'wrongSentence', 'wrongWord' hoặc 'correction'.");
            }
          } else if ((tType === IoeDataEngine?.QUESTION_TYPES?.IOE_FILL_BLANK || tType === 'ioe_fill_blank') && !isMinigame) {
            if (!tempGeneratedData.displaySentence || !tempGeneratedData.targetWord) {
              throw new Error("Ảo giác AI: Thiếu trường 'displaySentence' hoặc 'targetWord'.");
            }
          } else if ((tType === IoeDataEngine?.QUESTION_TYPES?.IOE_ODD_ONE_OUT || tType === 'ioe_odd_one_out') && !isMinigame) {
            if (!tempGeneratedData.words || !Array.isArray(tempGeneratedData.words) || !tempGeneratedData.oddWord) {
              throw new Error("Ảo giác AI: Thiếu trường 'words' hoặc 'oddWord'.");
            }
          }
          
          if (!isMinigame && !this._sanitizeAiItem(tempGeneratedData, type, track, level)) {
            throw new Error("Dữ liệu vi phạm quy tắc Sư phạm (Ám sát sư phạm, Thiếu đáp án, hoặc lỗi cấu trúc do tái chế).");
          }
          
          if (!isFromHarvestPool && tempGeneratedData && !tempGeneratedData._isRescued) {
            harvestId = autoHarvest(tempGeneratedData, type);
            if (typeof tempGeneratedData === 'object' && tempGeneratedData !== null) {
              tempGeneratedData.id = harvestId;
            }
            isNewHarvest = true;
          }
          
          generatedData = tempGeneratedData;
          
        } catch (error) {
          console.error(`[ExamEngine] Lỗi đúc AI cho ${type}. Từ chối nạp đạn. Lỗi: ${error.message}`);
          throw error;
        }
      }
    }
    
    if (!generatedData) {
      throw new Error("Dữ liệu AI trả về rỗng. Chặn nạp đạn khuyết tật vào Băng đạn.");
    }
    
    const atomicQuestion = {
      id: id,
      harvestId: harvestId,
      isNewHarvest: isNewHarvest,
      content: generatedData,
      metadata: metadata,
      timestamp: Date.now()
    };
    
    return atomicQuestion;
  },

  // ============================================================================
  // 2. BỘ MÁY CỨU HỘ TOÀN CỤC (UNIVERSAL JIT FALLBACK ENGINE)
  // ============================================================================
  getEmergencyFallback: function(metadata, passedLocalDeck = null, passedIndex = null) {
    try {
      const { id, track, level, type, topic, index, mode } = metadata;
      const isMinigame = mode === 'minigame' || !['ioe', 'ielts', 'hsk'].includes(track);
      
      const metaLang = metadata.lang || metadata.language;
      const localLang = window.localStorage ? localStorage.getItem('fc_lang') : 'en';
      const targetLang = metaLang ? metaLang : ((track === 'hsk' || String(level).startsWith('zh')) ? 'zh' : ((track === 'vi' || String(level).startsWith('vi')) ? 'vi' : (localLang || 'en')));
      
      let rescuedData = null;
      console.log("[EmergencyFallback] Kích hoạt Cứu hộ Tức thời (JIT) Toàn cục.");
      
      const rawLocalDeck = passedLocalDeck || (Utils.safeJsonParse('fc_data_' + targetLang, []));
      const isReverse = metadata.askMode === 'def';
      
      // Màng lọc RAM: Bất kể Đảo ngược hay không, chỉ cần có term là giữ lại. Cấm vứt thẻ của người dùng.
      const validLocalDeck = rawLocalDeck.filter(c => c.term && c.term.trim() !== '');
      let fallbackCard = null;
      
      // LUÔN ƯU TIÊN SỬ DỤNG "THẺ CỦA TÔI" NẾU CÓ DỮ LIỆU BẤT KỂ LÀ MOCK TEST HAY MINIGAME
      if (validLocalDeck.length > 0) {
        let safeIndex = passedIndex !== null ? passedIndex : index;
        if (safeIndex === undefined || safeIndex === null || isNaN(safeIndex)) {
          safeIndex = Math.floor(Math.random() * validLocalDeck.length);
        }
        
        if (metadata.term) fallbackCard = validLocalDeck.find(c => c.term === metadata.term);
        if (!fallbackCard && id) fallbackCard = validLocalDeck.find(c => c.term === id || c.id === id);
        if (!fallbackCard) fallbackCard = validLocalDeck[safeIndex % validLocalDeck.length];
      }
      
      if (fallbackCard) {
        rescuedData = JSON.parse(JSON.stringify(fallbackCard));
        const tType = (metadata.type || type).toLowerCase();
        const isMCQ = tType.includes('multiple_choice') || tType.includes('match') || tType.includes('image_quiz') || tType.includes('quiz');
        
        if (isMCQ) {
          // Xử lý Graceful Degradation: Nếu thẻ khuyết nghĩa, chèn nhãn cảnh báo thay vì để trống
          const safeDef = (rescuedData.definition && rescuedData.definition.trim() !== '') 
            ? rescuedData.definition 
            : `(Thẻ khuyết nghĩa) ${rescuedData.term}`;
            
          const correctText = isReverse ? rescuedData.term : safeDef;
          const baseTextForTrap = isReverse ? rescuedData.term : safeDef;
          
          let dists = [];
          
          // Ưu tiên nạp đạn nhiễu offline từ thẻ thật (Nếu game engine đã load)
          if (window.OfflineDistractorEngine && window.OfflineDistractorEngine.generate) {
            dists = window.OfflineDistractorEngine.generate(correctText, validLocalDeck, targetLang, metadata.askMode);
          } else {
            dists = ["(Ngoại tuyến) Đáp án A", "(Ngoại tuyến) Đáp án B", "(Ngoại tuyến) Đáp án C"];
          }
          
          const correctOpt = { text: correctText, isCorrect: true };
          const wrongOpts = dists.slice(0, 3).map(d => ({ text: d, isCorrect: false }));
          rescuedData.options = Utils.shuffleArray([...wrongOpts, correctOpt]);
          
          // DATA MAPPING ÉP BUỘC CHO UI: UI luôn đọc trường .term để in câu hỏi chính
          if (isReverse) {
            rescuedData.term = safeDef; // Tráo nghĩa (hoặc nhãn cảnh báo) lên trường term
          }
          rescuedData.questionText = rescuedData.term; // Back-up cho các Game đọc questionText
          
          if (tType.includes('image')) {
            rescuedData.options = rescuedData.options.map(opt => ({
              ...opt,
              image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(opt.text + " isolated clipart")}&w=300&h=300&c=7&rs=1&p=0`
            }));
          }
        } else if (tType.includes('spot_mistake') || tType.includes('spotmistake')) {
          rescuedData.wrongWord = "___";
          rescuedData.wrongSentence = rescuedData.term + " (Offline)";
          rescuedData.correction = rescuedData.term;
          rescuedData.explanation = "Dữ liệu ngoại tuyến (Máy chủ AI quá tải)";
        } else if (tType.includes('fill_blank') || tType.includes('fillblank')) {
          rescuedData.targetWord = rescuedData.term;
          rescuedData.displaySentence = `[__________] (${rescuedData.definition || 'Offline'})`;
        } else if (tType.includes('odd_one_out') || tType.includes('oddoneout')) {
          rescuedData.words = Utils.shuffleArray(["Nhiễu 1", "Nhiễu 2", "Nhiễu 3", rescuedData.term]);
          rescuedData.oddWord = rescuedData.term;
        } else if (tType.includes('scramble')) {
          rescuedData.noise = ["rác1", "rác2"];
        }
      } else {
        // CHỈ KHI KHO THẺ CỦA NGƯỜI DÙNG RỖNG 0 THẺ, MỚI DÙNG DỮ LIỆU TĨNH TỪ ENGINE
        if (!isMinigame && this._generateFallbackData) {
          console.log("[EmergencyFallback] Kéo cáp cứu hộ Mock Test cho dạng bài: " + (metadata.type || type));
          const rescueIndex = passedIndex !== null ? passedIndex : (index || 0);
          rescuedData = this._generateFallbackData(metadata.type || type, level, track, rescueIndex);
        } else if (FallbackDataEngine && FallbackDataEngine.getGameReadyFallback) {
          let fbType = 'quiz';
          const tType = (metadata.type || type).toLowerCase();
          
          if (tType.includes('match')) fbType = 'match';
          else if (tType.includes('scramble')) fbType = 'scramble';
          else if (tType.includes('fill_blank') || tType.includes('fillblank')) fbType = 'fillblank';
          else if (tType.includes('spot_mistake') || tType.includes('spotmistake')) fbType = 'spotmistake';
          else if (tType.includes('odd_one_out') || tType.includes('oddoneout')) fbType = 'oddoneout';
          else if (tType.includes('imagequiz') || tType.includes('image_quiz')) fbType = 'imagequiz';
          else if (tType.includes('pronunciation')) fbType = 'pronunciation';
          else if (tType.includes('listening')) fbType = 'listening';
          else if (tType.includes('reading')) fbType = 'reading';
          
          rescuedData = FallbackDataEngine.getGameReadyFallback(fbType, targetLang, level, metadata);
        }
      }
      
      // Chốt chặn cuối cùng chống sập UI nếu mọi thuật toán cứu hộ đều trắng tay
      if (!rescuedData) {
        rescuedData = {
          term: "Lỗi kết xuất cứu hộ",
          definition: "Không tìm thấy dữ liệu an toàn",
          options: [{text: "A", isCorrect: true}, {text: "B", isCorrect: false}, {text: "C", isCorrect: false}, {text: "D", isCorrect: false}]
        };
      }
      
      rescuedData.isAiGenerated = false;
      rescuedData._isRescued = true;
      
      return {
        id: id || "rescue_" + Date.now(),
        harvestId: null,
        isNewHarvest: false,
        content: rescuedData,
        metadata: metadata,
        timestamp: Date.now()
      };
    } catch (e) {
      console.error("[EmergencyFallback] Động cơ cứu hộ sập toàn tập:", e);
      return null;
    }
  }
};