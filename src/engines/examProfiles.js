/**
 * @file src/engines/examProfiles.js
 * @description Chứa định nghĩa chi tiết (Blueprints) của 6 cấu trúc đề thi (IOE, IELTS, HSK) và Bảng Ánh xạ Trình độ.
 * @origin Tầng 2 - Block 2.8 (ExamProfiles)
 */

import { IoeDataEngine } from './pedagogyEngine';
import { MICRO_PROMPTS } from './microPrompts';

export const ExamProfiles = {
  // 1. TỪ ĐIỂN CẤU HÌNH ĐỀ THI TỔNG QUAN
  PROFILES: {
    ioe_mini: {
      id: 'ioe_mini',
      name: 'IOE Mini-Mock',
      track: 'ioe',
      mode: 'mini',
      totalQuestions: 50,
      timeLimit: 1500,
      description: 'Bài thi rút gọn đánh giá nhanh phản xạ Tiếng Anh (50 câu).'
    },
    ioe_std: {
      id: 'ioe_std',
      name: 'IOE Standard Test',
      track: 'ioe',
      mode: 'std',
      totalQuestions: 200,
      timeLimit: 1800,
      description: 'Bài thi tiêu chuẩn 200 câu với cường độ cao.'
    },
    ielts_mini: {
      id: 'ielts_mini',
      name: 'IELTS Mini-Mock',
      track: 'ielts',
      mode: 'mini',
      totalQuestions: 15,
      timeLimit: 900,
      description: 'Khởi động với các dạng câu hỏi học thuật cốt lõi.'
    },
    ielts_std: {
      id: 'ielts_std',
      name: 'IELTS Academic Reading',
      track: 'ielts',
      mode: 'std',
      totalQuestions: 40,
      timeLimit: 3600,
      description: 'Đề thi đọc hiểu IELTS Academic tiêu chuẩn.'
    },
    hsk_mini: {
      id: 'hsk_mini',
      name: 'HSK Mini-Mock',
      track: 'hsk',
      mode: 'mini',
      totalQuestions: 15,
      timeLimit: 900,
      description: 'Bài thi rút gọn đánh giá Hán ngữ.'
    },
    hsk_std: {
      id: 'hsk_std',
      name: 'HSK Standard',
      track: 'hsk',
      mode: 'std',
      totalQuestions: 45,
      timeLimit: 2700,
      description: 'Bài kiểm tra năng lực Hán ngữ toàn diện.'
    }
  },

  // 1.5 BẢNG ÁNH XẠ TRÌNH ĐỘ CHUẨN QUỐC TẾ (CEFR & HSK)
  LEVEL_MAPPINGS: {
    en_level_1: "Pre-A1 (Starters/Beginner)",
    en_level_2: "A1 (Movers/Elementary)",
    en_level_3: "A2 (Flyers/Pre-Intermediate)",
    en_level_4: "B1 (PET/Intermediate)",
    en_level_5: "B2 (FCE/Upper-Intermediate)",
    en_level_6: "B2+ (IELTS 5.5 - 6.0)",
    en_level_7: "C1 (IELTS 6.5 - 7.0/Advanced)",
    en_level_8: "C1+ (IELTS 7.5)",
    en_level_9: "C2 (IELTS 8.0+/Proficiency)",
    
    zh_level_1: "HSK 1 (A1 - Beginner)",
    zh_level_2: "HSK 2 (A2 - Elementary)",
    zh_level_3: "HSK 3 (B1 - Intermediate)",
    zh_level_4: "HSK 4 (B2 - Upper-Intermediate)",
    zh_level_5: "HSK 5 (C1 - Advanced)",
    zh_level_6: "HSK 6 (C2 - Proficiency)",
    zh_level_7: "HSK 7 (Expert/Academic)",
    zh_level_8: "HSK 8 (Mastery/Academic)",
    zh_level_9: "HSK 9 (Native-like/Academic)",
    
    vi_default: "Vietnamese Basic",
    
    // Fallback mapping cho các key cũ (Kiddie/Junior)
    level_1_kiddie: "Pre-A1 (Starters)",
    level_2_junior_basic: "A1 (Movers)",
    level_3_junior_advanced: "A2 (Flyers)",
    level_4_discovery_basic: "B1 (PET)",
    level_5_discovery_advanced: "B2 (FCE)",
    level_6_pre_ielts: "B2+ (IELTS 5.5 - 6.0)",
    level_7_breakthrough: "C1 (IELTS 6.5 - 7.0)",
    level_8_academic: "C1+ (IELTS 7.5)",
    level_9_expert: "C2 (IELTS 8.0+)"
  },

  getCefrLevel: function(levelKey) {
    if (!levelKey) return "B1 (Intermediate)";
    return this.LEVEL_MAPPINGS[levelKey] || "B1 (Intermediate)";
  },

  // 2. HÀM XUẤT BẢN VẼ CHI TIẾT (BLUEPRINT GENERATOR)
  // Đầu ra: Mảng chứa các object metadata nguyên tử (atomic metadata)
  generateBlueprint: function(profileId, targetLevel, targetTopic) {
    const config = this.PROFILES[profileId];
    if (!config) return [];
    
    const blueprint = [];
    let globalIndex = 1;
    // Bọc thép bảo vệ bằng Optional Chaining
    const types = IoeDataEngine?.QUESTION_TYPES || {};
    
    // Cập nhật các dạng bài mới từ Tầng 2.2
    const TYPE_PRONUNCIATION = types.IOE_PRONUNCIATION || 'ioe_pronunciation';
    const TYPE_IMAGE_QUIZ = types.IOE_IMAGE_QUIZ || 'ioe_image_quiz';
    const TYPE_LISTENING = types.IOE_LISTENING || 'ioe_listening';
    const TYPE_READING_PASSAGE = types.IELTS_READING_PASSAGE || 'ielts_reading_passage';
    
    // Xác định cấp Tiểu học (Để điều phối kết hợp Game Hình ảnh và Game Nghe)
    const isPrimary = ['en_level_1', 'en_level_2', 'en_level_3', 'level_1_kiddie', 'level_2_junior_basic', 'level_3_junior_advanced'].includes(targetLevel);
    
    // [BẢN VÁ 1.10] ĐỘNG CƠ BỐC THĂM BẪY NGỮ PHÁP TỪ MICRO_PROMPTS TRỰC TIẾP
    const getRandomGrammarId = (qType, levelStr, track) => {
      if (!MICRO_PROMPTS) return null;
      let poolKey = 'quiz';
      const typeStr = String(qType).toLowerCase();
      
      if (typeStr.includes('spot_mistake')) poolKey = 'spot_mistake';
      else if (typeStr.includes('fill_blank')) poolKey = 'fill_blank';
      else if (typeStr.includes('scramble')) poolKey = 'scramble';
      
      const pool = MICRO_PROMPTS[poolKey];
      if (!pool) return null;
      
      const isChinese = track === 'hsk' || String(levelStr).startsWith('zh');
      const isEnglish = track === 'ielts' || track === 'ioe' || String(levelStr).startsWith('en');
      
      const availableKeys = Object.keys(pool).filter(k => {
        if (isChinese && k.startsWith('zh_')) return true;
        if (isEnglish && (k.startsWith('eng_') || k.startsWith('pre_'))) return true;
        if (k.startsWith('general_')) return true;
        return false;
      });
      
      if (availableKeys.length === 0) return null;
      return availableKeys[Math.floor(Math.random() * availableKeys.length)];
    };
    
    // ============================================================================
    // [THUẬT TOÁN MỚI] DYNAMIC TOPIC HYBRID V3 (MACRO TOPICS 8+1 ADAPTATION)
    // ============================================================================
    let availableTopics = [];
    if (Array.isArray(IoeDataEngine?.TOPICS)) {
      availableTopics = IoeDataEngine.TOPICS;
    }
    
    // Bỏ qua chủ đề 'Other' để đề thi tập trung vào các chủ đề học thuật cốt lõi
    let coreTopics = availableTopics.filter(t => t && t.toLowerCase() !== 'other');
    if (coreTopics.length === 0) coreTopics = ["General Knowledge"];
    
    const phaseTopics = {};
    const shuffled = coreTopics.sort(() => Math.random() - 0.5);
    let topicPointer = 0;
    
    for (let p = 1; p <= 10; p++) {
      // Phân bổ xoay vòng (Round-robin) 3 chủ đề cho mỗi chặng
      phaseTopics[p] = [
        shuffled[(topicPointer++) % shuffled.length],
        shuffled[(topicPointer++) % shuffled.length],
        shuffled[(topicPointer++) % shuffled.length]
      ];
    }
    
    const passageCountTracker = {}; // Dành riêng cho Đọc hiểu: Đếm số lượng passage group
    
    // Bơm đạn kèm Thuật toán Xoay vòng 3 Chủ đề
    const addQuestions = (qType, count, phaseNum, chapterName, passageGroup = null, specialFocus = "") => {
      const isPassage = qType === TYPE_READING_PASSAGE || qType.includes('reading');
      
      if (isPassage && passageGroup && !passageCountTracker[passageGroup]) {
        passageCountTracker[passageGroup] = Object.keys(passageCountTracker).length;
      }
      
      for (let i = 0; i < count; i++) {
        let selectedTopic = targetTopic; // Tôn trọng user nếu ép 1 chủ đề từ Menu
        if (!selectedTopic) {
          const phaseTopicsList = phaseTopics[phaseNum] || ["", "", ""];
          if (isPassage && passageGroup) {
            // [LƯU Ý 1] Các câu hỏi con trong cùng Tổ kén phải chung 1 chủ đề
            selectedTopic = phaseTopicsList[passageCountTracker[passageGroup] % 3];
          } else {
            // [LƯU Ý 2] Các câu hỏi rời rạc phải được đan xen 3 chủ đề liên tục
            selectedTopic = phaseTopicsList[i % 3];
          }
        }
        
        // Cấy Chỉ mục Vi phân (Micro-Topic Index) để phá Local Minimum của AI
        let microTopic = selectedTopic ? `${selectedTopic} (Specific Scenario ${i + 1})` : "";
        
        // Bơm Meta-tag Sư phạm
        if (specialFocus) {
          microTopic = microTopic ? `${microTopic} - [GRAMMAR FOCUS: ${specialFocus}]` : `[GRAMMAR FOCUS: ${specialFocus}]`;
        }
        
        // [TOPIC FREEDOM] Giải phóng các Game Kỹ thuật khỏi ràng buộc Chủ đề
        const isTopicFreeType = qType === TYPE_PRONUNCIATION || qType === types.IOE_ODD_ONE_OUT || qType === 'ioe_odd_one_out' || qType === types.IOE_SPOT_MISTAKE || qType === 'ioe_spot_mistake';
        if (isTopicFreeType) {
          microTopic = "ANY";
        }
        
        // [BẢN VÁ 1.10] Ép AI sử dụng bẫy ngữ pháp linh động từ kho
        let dynamicGrammarId = null;
        const isGrammarFocusType = qType === types.IOE_MULTIPLE_CHOICE || qType === 'ioe_multiple_choice' ||
                                   qType === types.IOE_SPOT_MISTAKE || qType === 'ioe_spot_mistake' ||
                                   qType === types.IOE_FILL_BLANK || qType === 'ioe_fill_blank' ||
                                   qType === types.IOE_SCRAMBLE || qType === 'ioe_scramble';
                                   
        // Tỷ lệ 70% ép khung ngữ pháp, 30% cho AI thả rông
        if (isGrammarFocusType && Math.random() > 0.3) {
          dynamicGrammarId = getRandomGrammarId(qType, targetLevel, config.track);
        }
        
        blueprint.push({
          id: `${profileId}_${targetLevel}_${qType}_${globalIndex}_${Date.now()}_${i}`,
          index: globalIndex,
          phase: phaseNum,
          chapter: chapterName,
          track: config.track,
          level: targetLevel,
          type: qType,
          topic: microTopic,
          passageGroup: passageGroup,
          questionIndexInPassage: passageGroup ? i : null,
          grammarId: dynamicGrammarId
        });
        
        globalIndex++;
      }
    };
    
    // MA TRẬN PHÂN BỔ THEO TỪNG TRACK (CHIA CHẶNG LOGIC CHẶT CHẼ)
    switch (profileId) {
      // ----------------------------------------------------
      // TRACK: IOE (Tiếng Anh Phổ Thông)
      // ----------------------------------------------------
      case 'ioe_mini':
        // 50 CÂU => CHIA LÀM 5 CHẶNG
        if (isPrimary) {
          // Phase 1 (10 câu)
          addQuestions(TYPE_LISTENING, 5, 1, 'Kỹ năng Nghe (Listening)');
          addQuestions(TYPE_IMAGE_QUIZ, 5, 1, 'Kỹ năng Hình ảnh');
          // Phase 2 (10 câu)
          addQuestions(TYPE_PRONUNCIATION, 5, 2, 'Ngữ âm & Trọng âm');
          addQuestions(types.IOE_ODD_ONE_OUT, 5, 2, 'Từ khác loại');
          // Phase 3 (10 câu)
          addQuestions(types.IOE_MATCH, 5, 3, 'Nhận diện Từ vựng');
          addQuestions(types.IOE_MULTIPLE_CHOICE, 5, 3, 'Ngữ pháp Tổng hợp', null, 'Functional Grammar');
          // Phase 4 (10 câu)
          addQuestions(TYPE_READING_PASSAGE, 5, 4, 'Đọc hiểu Đoạn văn', `ioe_passage_mini_${Date.now()}`);
          addQuestions(types.IOE_MULTIPLE_CHOICE, 5, 4, 'Ngữ pháp P2', null, 'Lexical Grammar');
          // Phase 5 (10 câu)
          addQuestions(types.IOE_FILL_BLANK, 5, 5, 'Điền từ khóa');
          addQuestions(types.IOE_SCRAMBLE, 5, 5, 'Tái cấu trúc câu');
        } else {
          // Phase 1 (10 câu)
          addQuestions(TYPE_LISTENING, 10, 1, 'Kỹ năng Nghe (Listening)');
          // Phase 2 (10 câu)
          addQuestions(TYPE_PRONUNCIATION, 5, 2, 'Ngữ âm & Trọng âm');
          addQuestions(types.IOE_SPOT_MISTAKE, 5, 2, 'Săn lỗi sai Ngữ pháp');
          // Phase 3 (10 câu)
          addQuestions(types.IOE_MATCH, 5, 3, 'Nhận diện Từ vựng');
          addQuestions(types.IOE_MULTIPLE_CHOICE, 5, 3, 'Ngữ pháp Tổng hợp', null, 'Functional Grammar');
          // Phase 4 (10 câu)
          addQuestions(TYPE_READING_PASSAGE, 5, 4, 'Đọc hiểu Đoạn văn', `ioe_passage_mini_${Date.now()}`);
          addQuestions(types.IOE_MULTIPLE_CHOICE, 5, 4, 'Ngữ pháp P2', null, 'Lexical Grammar');
          // Phase 5 (10 câu)
          addQuestions(types.IOE_FILL_BLANK, 5, 5, 'Điền từ khóa');
          addQuestions(types.IOE_SCRAMBLE, 5, 5, 'Tái cấu trúc câu');
        }
        break;
        
      case 'ioe_std':
        // 200 CÂU => CHIA LÀM 10 CHẶNG
        // Phase 1: Kỹ năng Nghe / Hình ảnh (20 câu)
        if (isPrimary) {
          addQuestions(TYPE_LISTENING, 10, 1, 'Kỹ năng Nghe (Listening)');
          addQuestions(TYPE_IMAGE_QUIZ, 10, 1, 'Kỹ năng Hình ảnh');
        } else {
          addQuestions(TYPE_LISTENING, 10, 1, 'Kỹ năng Nghe - P1');
          addQuestions(TYPE_LISTENING, 10, 1, 'Kỹ năng Nghe - P2');
        }
        // Phase 2: Ngữ âm & Phân nhóm (20 câu)
        addQuestions(TYPE_PRONUNCIATION, 10, 2, 'Ngữ âm & Trọng âm');
        addQuestions(types.IOE_ODD_ONE_OUT, 10, 2, 'Phân nhóm Từ vựng');
        // Phase 3: Nhận diện Từ vựng 1 (20 câu)
        addQuestions(types.IOE_MATCH, 20, 3, 'Nhận diện Từ vựng - P1');
        // Phase 4: Nhận diện Từ vựng 2 & Lỗi sai (20 câu)
        addQuestions(types.IOE_MATCH, 10, 4, 'Nhận diện Từ vựng - P2');
        addQuestions(types.IOE_SPOT_MISTAKE, 10, 4, 'Săn lỗi sai Ngữ pháp');
        // Phase 5: Ngữ pháp 1 (20 câu)
        addQuestions(types.IOE_MULTIPLE_CHOICE, 20, 5, 'Trắc nghiệm Ngữ pháp - P1', null, 'Functional Grammar');
        // Phase 6: Ngữ pháp 2 (20 câu)
        addQuestions(types.IOE_MULTIPLE_CHOICE, 20, 6, 'Trắc nghiệm Ngữ pháp - P2', null, 'Lexical Grammar');
        // Phase 7: Đọc hiểu 1 (20 câu - 4 tổ kén)
        for (let p = 1; p <= 4; p++) {
          addQuestions(TYPE_READING_PASSAGE, 5, 7, `Đọc hiểu: Đoạn văn ${p}`, `ioe_passage_std_${p}_${Date.now()}`);
        }
        // Phase 8: Đọc hiểu 2 (20 câu - 4 tổ kén)
        for (let p = 5; p <= 8; p++) {
          addQuestions(TYPE_READING_PASSAGE, 5, 8, `Đọc hiểu: Đoạn văn ${p}`, `ioe_passage_std_${p}_${Date.now()}`);
        }
        // Phase 9: Điền từ khuyết (20 câu)
        addQuestions(types.IOE_FILL_BLANK, 10, 9, 'Điền từ khuyết - P1');
        addQuestions(types.IOE_FILL_BLANK, 10, 9, 'Điền từ khuyết - P2');
        // Phase 10: Tái cấu trúc câu (20 câu)
        addQuestions(types.IOE_SCRAMBLE, 10, 10, 'Tái cấu trúc câu - P1');
        addQuestions(types.IOE_SCRAMBLE, 10, 10, 'Tái cấu trúc câu - P2');
        break;
        
      // ----------------------------------------------------
      // TRACK: IELTS (Tiếng Anh Học Thuật)
      // ----------------------------------------------------
      case 'ielts_mini':
        // 15 CÂU => CHIA LÀM 3 CHẶNG
        addQuestions(TYPE_READING_PASSAGE, 5, 1, 'Reading: Academic Passage', `passage_mini_${Date.now()}`);
        addQuestions(TYPE_LISTENING, 5, 2, 'Listening: Academic Monologue');
        addQuestions(types.IOE_SPOT_MISTAKE, 5, 3, 'Grammar: Error Correction');
        break;
        
      case 'ielts_std':
        // 40 CÂU => CHIA LÀM 4 CHẶNG
        for (let p = 1; p <= 8; p++) {
          const phaseNum = Math.ceil(p / 2); // p=1,2 -> phase=1; p=3,4 -> phase=2...
          addQuestions(TYPE_READING_PASSAGE, 5, phaseNum, `Reading: Passage ${p}`, `passage_std_${p}_${Date.now()}`);
        }
        break;
        
      // ----------------------------------------------------
      // TRACK: HSK (Tiếng Trung)
      // ----------------------------------------------------
      case 'hsk_mini':
        // 15 CÂU => CHIA LÀM 3 CHẶNG
        addQuestions(types.IOE_MATCH, 5, 1, 'Nhận diện Hán tự');
        addQuestions(types.IOE_MULTIPLE_CHOICE, 5, 2, 'Trắc nghiệm Ngữ pháp');
        addQuestions(types.IOE_FILL_BLANK, 5, 3, 'Điền Lượng từ');
        break;
        
      case 'hsk_std':
        // 45 CÂU => CHIA LÀM 3 CHẶNG
        // Phase 1 (15 câu)
        addQuestions(types.IOE_MULTIPLE_CHOICE, 10, 1, 'Nghe hiểu (Mô phỏng)');
        addQuestions(types.IOE_MATCH, 5, 1, 'Nối Pinyin & Hán tự P1');
        // Phase 2 (15 câu)
        addQuestions(types.IOE_MATCH, 5, 2, 'Nối Pinyin & Hán tự P2');
        addQuestions(types.IOE_MULTIPLE_CHOICE, 10, 2, 'Đọc hiểu & Ngữ pháp');
        // Phase 3 (15 câu)
        addQuestions(types.IOE_FILL_BLANK, 10, 3, 'Điền từ vào chỗ trống');
        addQuestions(types.IOE_SCRAMBLE, 5, 3, 'Tái cấu trúc câu (Tập viết)');
        break;
        
      default:
        addQuestions(types.IOE_MULTIPLE_CHOICE, 10, 1, 'General Practice');
    }
    
    return blueprint;
  }
};