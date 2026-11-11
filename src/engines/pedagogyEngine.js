/**
 * @file src/engines/pedagogyEngine.js
 * @description Động cơ Sư phạm (Pedagogy Engine). Quản lý cấu trúc dữ liệu, Hệ thống Cấp độ và các định chuẩn Sư phạm.
 * @origin Tầng 2 - Block 2.2 (Schemas & Level Context)
 */

import { IoeEnumRegistry } from '@/config/constants';
import { Utils } from '@/utils/helpers';

// Lưu ý: ExamProfiles sẽ được import sau khi tạo ở Block 2.8 để tránh lỗi Vite "missing module"
// import { ExamProfiles } from '@/engines/examProfiles';

export const IoeDataEngine = {
  // HẰNG SỐ DẠNG BÀI (Mock Test Era - Atomic Question Types)
  QUESTION_TYPES: {
    IOE_MULTIPLE_CHOICE: 'ioe_multiple_choice',
    IOE_MATCH: 'ioe_match',
    IOE_FILL_BLANK: 'ioe_fill_blank',
    IOE_SCRAMBLE: 'ioe_scramble',
    IOE_ODD_ONE_OUT: 'ioe_odd_one_out',
    IOE_SPOT_MISTAKE: 'ioe_spot_mistake',
    IOE_PRONUNCIATION: 'ioe_pronunciation',
    IOE_IMAGE_QUIZ: 'ioe_image_quiz',
    IOE_LISTENING: 'ioe_listening',
    IELTS_READING_MCQ: 'ielts_reading_mcq',
    IELTS_READING_TFNG: 'ielts_reading_tfng',
    IELTS_READING_MATCHING: 'ielts_reading_matching',
    IELTS_LISTENING_FILL: 'ielts_listening_fill',
    IELTS_WRITING_TASK1: 'ielts_writing_task1',
    IELTS_WRITING_TASK2: 'ielts_writing_task2'
  },

  // CẤU TRÚC KỲ THI TỔNG HỢP (LEVEL STRUCTURES BLUEPRINTS) BÁM SÁT MA TRẬN
  LEVEL_STRUCTURES: {
    track_ioe: {
      name: "IOE Standard",
      totalQuestions: 200,
      timeLimit: 1800,
      chapters: [
        { id: 'chap_1', name: 'Kỹ năng Nghe & Hình ảnh', types: ['ioe_image_quiz', 'ioe_multiple_choice'], count: 20 },
        { id: 'chap_2', name: 'Ngữ âm & Trọng âm', types: ['ioe_pronunciation'], count: 10 },
        { id: 'chap_3', name: 'Từ vựng & Ngữ pháp', types: ['ioe_match', 'ioe_multiple_choice', 'ioe_odd_one_out', 'ioe_spot_mistake'], count: 90 },
        { id: 'chap_4', name: 'Kỹ năng Đọc hiểu', types: ['ioe_multiple_choice'], count: 40 },
        { id: 'chap_5', name: 'Kỹ năng Viết', types: ['ioe_fill_blank', 'ioe_scramble'], count: 40 }
      ]
    },
    track_ielts: {
      name: "IELTS Academic",
      totalQuestions: 40,
      timeLimit: 3600,
      modules: [
        { id: 'mod_reading', name: 'Reading', passages: 3, types: ['ielts_reading_mcq', 'ielts_reading_tfng', 'ielts_reading_matching'] },
        { id: 'mod_listening', name: 'Listening', parts: 4, types: ['ielts_listening_fill', 'ioe_multiple_choice'] }
      ]
    }
  },

  // 1. HỆ THỐNG CẤP ĐỘ ĐÀO TẠO NỀN TẢNG (GRADE CONTEXTS)
  GRADE_CONTEXTS: {
    en_level_1: "Level 1 (Mẫu giáo - Pre-A1/Lớp 1-2). Ngữ pháp: Số ít/Số nhiều (s/es), mạo từ cơ bản (a/an). Từ vựng: Các danh từ cực kỳ cơ bản.",
    en_level_2: "Level 2 (Tiểu học Cơ bản - A1/Lớp 3-4). Ngữ pháp: Đại từ Chủ ngữ/Tân ngữ, Hiện tại Đơn, động từ 'to be'.",
    en_level_3: "Level 3 (Tiểu học Nâng cao - A1+/Lớp 5). Ngữ pháp: Giới từ, Tính từ Sở hữu, Hiện tại Tiếp diễn.",
    en_level_4: "Level 4 (Khám phá Cơ bản - A2/Lớp 6-7). Ngữ pháp: Quá khứ Đơn, Tính từ So sánh hơn.",
    en_level_5: "Level 5 (Khám phá Nâng cao - A2+/Lớp 8-9). Ngữ pháp: Tính từ So sánh nhất, Tương lai Đơn (will), Liên từ cơ bản.",
    en_level_6: "Level 6 (Tiền IELTS - B1/Lớp 10/IELTS 4.0). Ngữ pháp: Hiện tại Hoàn thành, mạo từ xác định 'the', Động từ Khuyết thiếu.",
    en_level_7: "Level 7 (Đột phá - B1+/Lớp 11-12/IELTS 5.0). Ngữ pháp: Câu bị động, Danh động từ/Động từ nguyên thể, Câu điều kiện loại 1 & 2.",
    en_level_8: "Level 8 (Học thuật - B2/IELTS 5.5-6.5). Ngữ pháp: Mệnh đề quan hệ, Cấu tạo từ, Liên từ học thuật. Từ vựng trang trọng.",
    en_level_9: "Level 9 (Chuyên gia - C1/C2/IELTS 7.0+). Ngữ pháp: Đảo ngữ, Câu điều kiện hỗn hợp, Collocation nâng cao. Từ vựng phức tạp/tinh tế.",
    
    zh_level_1: "HSK 1 (Sơ cấp). Ngữ pháp: Đại từ cơ bản, câu chữ 'Shi' (是), câu chữ 'You' (有). Từ vựng: 500 từ sinh tồn cơ bản.",
    zh_level_2: "HSK 2 (Sơ cấp). Ngữ pháp: Câu hỏi với 'Ma/Ne' (吗/呢), Trợ từ động thái (了/着/过).",
    zh_level_3: "HSK 3 (Sơ cấp). Ngữ pháp: Cấu trúc chữ 'Ba' (把) và chữ 'Bei' (被), Câu phức đơn giản.",
    zh_level_4: "HSK 4 (Trung cấp). Ngữ pháp: Cấu trúc so sánh, Bổ ngữ kết quả/trạng thái.",
    zh_level_5: "HSK 5 (Trung cấp). Từ vựng: Thành ngữ (Chengyu), Ngôn ngữ văn viết (书面语), Thuật ngữ xã hội & kinh tế.",
    zh_level_6: "HSK 6 (Trung cấp). Từ vựng: Tranh luận học thuật, vấn đề toàn cầu, cảm thụ nghệ thuật. Ngữ pháp phức tạp.",
    zh_level_7: "HSK 7 (Cao cấp). Từ vựng: Nghiên cứu giáo dục, quan hệ quốc tế, đột phá công nghệ. Trôi chảy ở mức chuyên môn.",
    zh_level_8: "HSK 8 (Cao cấp). Từ vựng: Triết học phương Đông, tâm lý học, khoa học vũ trụ, đạo đức y sinh. Tinh thông học thuật.",
    zh_level_9: "HSK 9 (Cao cấp). Từ vựng: 文言文 (Văn ngôn), phê bình kinh tế vĩ mô, tín ngưỡng tôn giáo. Diễn đạt như người bản xứ.",
    vi_default: "Mặc định Tiếng Việt. Giao tiếp cơ bản."
  },

  // TỪ ĐIỂN ÁNH XẠ CẤP ĐỘ (LEVEL DICTIONARY)
  LEVEL_DICTIONARY: {
    'zh_level_1': 'Tiếng Trung HSK 1 (Sơ cấp)', 'hsk1': 'Tiếng Trung HSK 1 (Sơ cấp)',
    'zh_level_2': 'Tiếng Trung HSK 2 (Sơ cấp)', 'hsk2': 'Tiếng Trung HSK 2 (Sơ cấp)',
    'zh_level_3': 'Tiếng Trung HSK 3 (Sơ cấp)', 'hsk3': 'Tiếng Trung HSK 3 (Sơ cấp)',
    'zh_level_4': 'Tiếng Trung HSK 4 (Trung cấp)', 'hsk4': 'Tiếng Trung HSK 4 (Trung cấp)',
    'zh_level_5': 'Tiếng Trung HSK 5 (Trung cấp)', 'hsk5': 'Tiếng Trung HSK 5 (Trung cấp)',
    'zh_level_6': 'Tiếng Trung HSK 6 (Trung cấp)', 'hsk6': 'Tiếng Trung HSK 6 (Trung cấp)',
    'zh_level_7': 'Tiếng Trung HSK 7 (Cao cấp)', 'hsk7': 'Tiếng Trung HSK 7 (Cao cấp)',
    'zh_level_8': 'Tiếng Trung HSK 8 (Cao cấp)', 'hsk8': 'Tiếng Trung HSK 8 (Cao cấp)',
    'zh_level_9': 'Tiếng Trung HSK 9 (Cao cấp)', 'hsk9': 'Tiếng Trung HSK 9 (Cao cấp)',
    'en_level_1': 'Tiếng Anh Pre-A1 (Kiddie)', 'pre_a1': 'Tiếng Anh Pre-A1 (Kiddie)', 'kiddie': 'Tiếng Anh Pre-A1 (Kiddie)',
    'en_level_2': 'Tiếng Anh A1 (Junior)', 'a1': 'Tiếng Anh A1 (Junior)', 'junior': 'Tiếng Anh A1 (Junior)',
    'en_level_3': 'Tiếng Anh A1+ (Junior+)', 'a1p': 'Tiếng Anh A1+ (Junior+)', 'junior+': 'Tiếng Anh A1+ (Junior+)',
    'en_level_4': 'Tiếng Anh A2 (Discovery)', 'a2': 'Tiếng Anh A2 (Discovery)', 'discovery': 'Tiếng Anh A2 (Discovery)',
    'en_level_5': 'Tiếng Anh A2+ (Discovery+)', 'a2p': 'Tiếng Anh A2+ (Discovery+)', 'discovery+': 'Tiếng Anh A2+ (Discovery+)',
    'en_level_6': 'Tiếng Anh B1 (Pre-IELTS)', 'b1': 'Tiếng Anh B1 (Pre-IELTS)', 'pre_ielts': 'Tiếng Anh B1 (Pre-IELTS)',
    'en_level_7': 'Tiếng Anh B1+ (Breakthrough)', 'b1p': 'Tiếng Anh B1+ (Breakthrough)', 'breakthrough': 'Tiếng Anh B1+ (Breakthrough)',
    'en_level_8': 'Tiếng Anh B2 (Academic)', 'b2': 'Tiếng Anh B2 (Academic)', 'academic': 'Tiếng Anh B2 (Academic)',
    'en_level_9': 'Tiếng Anh C1-C2 (Expert)', 'c1': 'Tiếng Anh C1-C2 (Expert)', 'c2': 'Tiếng Anh C1-C2 (Expert)', 'expert': 'Tiếng Anh C1-C2 (Expert)'
  },

  // 2. HỆ THỐNG CHỦ ĐỀ MỞ RỘNG (MACRO TOPICS)
  TOPICS: [
    'Self & Body',
    'Social Connections',
    'Living Spaces',
    'The Natural World',
    'Food & Health',
    'Daily Life & Leisure',
    'School & Career',
    'Travel & Exploration',
    'Other'
  ],

  // ==================================================================================
  // HỆ THỐNG ĐỘNG CƠ SƯ PHẠM VI PHÂN (MICRO-TIER PEDAGOGY RULES)
  // ==================================================================================
  
  // [MA TRẬN ĐỊNH TUYẾN SƯ PHẠM V1.21 - POOL AGGREGATION ALGORITHM]
  getPedagogyMatrixRule: function(mappedKeys, lang) {
    let rules = {
      example: "Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng.",
      definition: "Bản dịch Tiếng Việt trực tiếp, chuẩn xác."
    };
    if (!mappedKeys || (Array.isArray(mappedKeys) && mappedKeys.length === 0)) {
      rules.example += " Tránh sinh câu cụt lủn, vô hồn.";
      rules.definition += " TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa.";
      return rules;
    }
    const keysArray = Array.isArray(mappedKeys) ? mappedKeys : [mappedKeys];
    const keyStrs = keysArray.map(k => String(k).toLowerCase());
    
    // Gom các hồ bơi được kích hoạt
    let activePools = new Set();
    
    if (lang === 'zh') {
      keyStrs.forEach(keyStr => {
        if (['level_1', 'hsk1'].some(k => keyStr.includes(k))) activePools.add(1);
        if (['level_2', 'level_3', 'hsk2', 'hsk3'].some(k => keyStr.includes(k))) activePools.add(2);
        if (['level_4', 'level_5', 'hsk4', 'hsk5'].some(k => keyStr.includes(k))) activePools.add(3);
        if (['level_6', 'level_7', 'hsk6', 'hsk7'].some(k => keyStr.includes(k))) activePools.add(4);
        if (['level_8', 'level_9', 'hsk8', 'hsk9'].some(k => keyStr.includes(k))) activePools.add(5);
      });
      if (activePools.size === 0) activePools.add(1);
      
      let minPool = Math.min(...activePools);
      let maxPool = Math.max(...activePools);
      let lengths = ["cực kỳ ngắn gọn (4-7 chữ)", "ngắn gọn, tự nhiên", "vừa phải, có chuyển ý", "câu phức đa tầng", "câu văn ngôn/chuyên sâu"];
      let lengthDesc = (minPool === maxPool) ? lengths[minPool - 1] : `linh hoạt, đa dạng từ ${lengths[minPool - 1]} đến ${lengths[maxPool - 1]}`;
      
      let contexts = [];
      let grammars = [];
      
      if (activePools.has(1)) {
        contexts.push("miêu tả nhân vật, đồ vật, phương hướng cơ bản");
        grammars.push("câu chữ 是 (Shi), câu chữ 有 (You), đại từ cơ bản và số đếm");
      }
      if (activePools.has(2)) {
        contexts.push("các hoạt động hàng ngày, sở thích, mua sắm");
        grammars.push("trợ từ động thái (了/着/过), cấu trúc chữ 把 (Ba) và 被 (Bei) cơ bản, lượng từ phong phú, câu hỏi 吗/呢, và câu ghép đơn giản");
      }
      if (activePools.has(3)) {
        contexts.push("lập luận quan điểm cá nhân, môi trường làm việc");
        grammars.push("bổ ngữ trạng thái, bổ ngữ kết quả phức tạp, cấu trúc so sánh (比...更...), và một vài Thành ngữ (成语) phổ biến");
      }
      if (activePools.has(4)) {
        contexts.push("tranh luận, tin tức xã hội, hiện tượng văn hóa");
        grammars.push("câu phức đa tầng, cặp liên từ logic phức tạp (Dù... vẫn..., Hễ... là...), từ vựng cận nghĩa tinh tế");
      }
      if (activePools.has(5)) {
        contexts.push("triết học phương Đông, kinh tế vĩ mô, ngoại giao, y sinh");
        grammars.push("Thành ngữ sâu sắc, Tục ngữ, cấu trúc câu mang đậm âm hưởng Văn ngôn (文言文)");
      }
      
      rules.example = `ĐỊNH HƯỚNG SƯ PHẠM ĐA CẤP ĐỘ: BẮT BUỘC độ dài ${lengthDesc}. Ngữ cảnh trải rộng từ: [${contexts.join('; ')}]. Ngữ pháp tổng hợp, linh hoạt sử dụng: [${grammars.join('; ')}].`;
      rules.definition = maxPool >= 4 ? "Dịch chuẩn xác theo ngữ cảnh học thuật hoặc chuyên ngành. Có thể dùng từ Hán Việt/từ vựng cấp cao trong tiếng Việt." : "Dịch nghĩa đen, hoặc dịch chính xác sắc thái đời sống/công sở.";
    } else {
      keyStrs.forEach(keyStr => {
        if (['level_1', 'kiddie', 'pre_a1', 'pre-a1'].some(k => keyStr.includes(k))) activePools.add(1);
        if (['level_2', 'level_3', 'junior', 'a1'].some(k => keyStr.includes(k))) activePools.add(2);
        if (['level_4', 'level_5', 'discovery', 'a2'].some(k => keyStr.includes(k))) activePools.add(3);
        if (['level_6', 'level_7', 'pre_ielts', 'breakthrough', 'b1'].some(k => keyStr.includes(k))) activePools.add(4);
        if (['level_8', 'level_9', 'academic', 'expert', 'b2', 'c1', 'c2'].some(k => keyStr.includes(k))) activePools.add(5);
      });
      if (activePools.size === 0) activePools.add(1);
      
      let minPool = Math.min(...activePools);
      let maxPool = Math.max(...activePools);
      
      let minLens = [3, 5, 8, 12, 15];
      let maxLens = [5, 8, 12, 15, 25];
      let minLen = minLens[minPool - 1];
      let maxLen = maxLens[maxPool - 1];
      let lengthDesc = (minPool === maxPool) ? `${minLen}-${maxLen} từ` : `linh hoạt, đa dạng từ ${minLen} đến ${maxLen} từ`;
      
      let contexts = [];
      let grammars = [];
      
      if (activePools.has(1)) {
        contexts.push("miêu tả đồ vật vật lý xung quanh, màu sắc, con vật, số đếm, gia đình");
        grammars.push("To-Be, Have/Has, Thì hiện tại đơn, giới từ vị trí cơ bản (in, on, under), câu hỏi Yes/No ngắn (KHÔNG cụm động từ/thành ngữ)");
      }
      if (activePools.has(2)) {
        contexts.push("các hoạt động thói quen hàng ngày, sở thích, trường học");
        grammars.push("câu đơn/ghép (And/But), Hiện tại đơn/tiếp diễn, Quá khứ đơn (V-ed), Trạng từ tần suất, tính từ sở hữu, đại từ chỉ định");
      }
      if (activePools.has(3)) {
        contexts.push("kể câu chuyện hoặc trải nghiệm cá nhân ngắn, nêu lý do");
        grammars.push("Quá khứ tiếp diễn, Hiện tại hoàn thành, Tương lai, So sánh, Câu điều kiện loại 0/1, Động từ khuyết thiếu (Must, Have to, Should), Liên từ nối thời gian (When, While)");
      }
      if (activePools.has(4)) {
        contexts.push("trình bày quan điểm cá nhân, cảm xúc trừu tượng, môi trường công sở, xã hội");
        grammars.push("câu phức (Complex sentence), Mệnh đề quan hệ, Câu bị động, Câu điều kiện loại 2, V-ing/To-V (Gerunds & Infinitives), Câu tường thuật, Liên từ logic");
      }
      if (activePools.has(5)) {
        contexts.push("luận văn, báo chí, các vấn đề toàn cầu, triết học, kinh tế vĩ mô");
        grammars.push("văn phong học thuật, Đảo ngữ, Câu điều kiện hỗn hợp, Rút gọn mệnh đề phân từ, Câu bị động khách quan, Collocations nâng cao và Thành ngữ (Idioms)");
      }
      
      rules.example = `ĐỊNH HƯỚNG SƯ PHẠM ĐA CẤP ĐỘ: BẮT BUỘC độ dài ${lengthDesc}. Ngữ cảnh trải rộng từ: [${contexts.join('; ')}]. Ngữ pháp tổng hợp, linh hoạt sử dụng các cấu trúc: [${grammars.join('; ')}].`;
      rules.definition = maxPool >= 4 ? "Dịch chuẩn xác theo ngữ cảnh học thuật hoặc chuyên ngành. Có thể dùng từ Hán Việt/từ vựng cấp cao trong tiếng Việt." : "Dịch nghĩa đen, cơ bản nhất hoặc dịch sắc thái đời sống.";
    }
    
    // Vaccine chống từ điển hóa cho mọi cấp độ
    rules.definition += " TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa (VD: dịch 'Ngày', KHÔNG dịch 'Khoảng thời gian 24h'). Ưu tiên 1-3 từ (trừ thành ngữ).";
    return rules;
  },

  // [HÀM BẢO VỆ]: Xử lý mảng và nhặt ra Level có trọng số cao nhất cho Micro-tier Rules
  _getHighestLevelKey: function(mappedKey, targetLang) {
    if (!mappedKey) return '';
    const arr = Array.isArray(mappedKey) ? mappedKey : [mappedKey];
    const str = arr.join(',').toLowerCase();
    
    if (targetLang === 'English' || targetLang === 'en') {
      if (['level_8', 'level_9', 'academic', 'expert', 'b2', 'c1', 'c2'].some(k => str.includes(k))) return 'en_level_9';
      if (['level_6', 'level_7', 'pre_ielts', 'breakthrough', 'b1'].some(k => str.includes(k))) return 'en_level_6';
      if (['level_4', 'level_5', 'discovery', 'a2'].some(k => str.includes(k))) return 'en_level_4';
      if (['level_2', 'level_3', 'junior', 'a1'].some(k => str.includes(k))) return 'en_level_2';
      return 'en_level_1';
    } else if (targetLang === 'Chinese' || targetLang === 'zh') {
      if (['level_8', 'level_9', 'hsk8', 'hsk9'].some(k => str.includes(k))) return 'zh_level_9';
      if (['level_6', 'level_7', 'hsk6', 'hsk7'].some(k => str.includes(k))) return 'zh_level_6';
      if (['level_4', 'level_5', 'hsk4', 'hsk5'].some(k => str.includes(k))) return 'zh_level_4';
      if (['level_2', 'level_3', 'hsk2', 'hsk3'].some(k => str.includes(k))) return 'zh_level_2';
      return 'zh_level_1';
    }
    return arr[arr.length - 1];
  },

  // [VẮC-XIN LỖI NGỮ PHÁP - CHỐNG ẢO GIÁC ĐỘNG TỪ/TÂN NGỮ]
  getMicroTierGrammarRule: function(lang) {
    let rule = `- Chỉ phân loại theo đúng ngữ pháp ngôn ngữ gốc, tuyệt đối không vay mượn ngữ pháp bản dịch Tiếng Việt. Từ loại (Part of Speech): Bản chất từ vựng trong từ điển là loại từ nào gì? (Danh từ, Động từ, Đại từ...) \n`;
    if (lang === 'zh') {
      rule += `- Lỗi Kế Thừa (Inheritance Fallacy): TUYỆT ĐỐI KHÔNG lấy từ loại của chữ cái đầu tiên để gán mác cho toàn bộ từ (VD: CẤM gán mác "Phó từ" cho '还有', '就是' chỉ vì nó chứa chữ '还', '就'). Các từ mang tính kết nối này BẮT BUỘC chỉ được phân loại là "Liên từ" hoặc "Cụm động từ".\n`;
      rule += `- Chống bẫy ngữ nghĩa: NGỮ NGHĨA CỦA TỪ KHÔNG THỂ DÙNG ĐỂ PHÂN LOẠI NGỮ PHÁP . (Ví dụ: Các từ chỉ trạng thái, quá trình, hoặc hành động bị danh từ hóa như "动作", "sự lựa chọn", "niềm vui" phải được phân loại chuẩn xác là Danh từ, cấm tự suy diễn thành Động từ hay Tính từ dựa trên nghĩa)..\n`;
      rule += `- Không nhầm lẫn 'Từ độc lập' và 'Hình vị' (VD: '能' là trợ động từ, không gán mác danh từ vì có trong '能力').\n`;
    }
    return rule;
  },

  getMicroTierDistortionRule: function(targetLang, dataMode, mappedKey, topic) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, targetLang);
    let rule = "";
    const antiLengthRule = "TỐI QUAN TRỌNG: BẠN PHẢI VIẾT LẠI CHÍNH XÁC CÂU VĂN NGỮ CẢNH ĐÓ. KHÔNG ĐƯỢC tự bịa ra câu mới hoặc thay đổi độ dài của câu. CHỈ ĐƯỢC PHÉP thay đổi ĐÚNG MỘT TỪ để biến nó thành câu sai. ";
    
    if (targetLang === 'English' && dataMode === 'vocab') {
      if (['en_level_1'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ đơn liên quan chặt chẽ đến CHỦ ĐỀ TẬP TRUNG. Hãy tạo ĐÚNG MỘT lỗi chính tả cơ bản (VD: thiếu một chữ cái, hoặc dư một nguyên âm). KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else if (['en_level_2', 'en_level_3'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ đơn liên quan đến CHỦ ĐỀ TẬP TRUNG. Hãy tạo ĐÚNG MỘT lỗi hình thái cơ bản (VD: sai dạng số nhiều 's/es', đổi chỗ nguyên âm cơ bản). KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else if (['en_level_4', 'en_level_5'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ đơn liên quan đến CHỦ ĐỀ TẬP TRUNG. Hãy tạo ĐÚNG MỘT lỗi chính tả phổ biến ở trình độ trung cấp (VD: thiếu phụ âm đôi, nhầm lẫn 'ie' và 'ei'). KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else if (['en_level_6'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ đơn liên quan đến CHỦ ĐỀ TẬP TRUNG. Hãy tạo ĐÚNG MỘT lỗi cấu tạo từ (VD: dùng dạng tính từ thay vì danh từ, như 'beautifulness' thay vì 'beauty'). KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else if (['en_level_7', 'en_level_8'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ đơn liên quan đến CHỦ ĐỀ TẬP TRUNG. Hãy tạo ĐÚNG MỘT lỗi hình thái nâng cao (VD: dùng sai tiền tố/hậu tố như '-tion' thay vì '-sion', 'un-' thay vì 'in-'). KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else rule = "Các đáp án bẫy PHẢI LÀ từ đơn liên quan đến CHỦ ĐỀ TẬP TRUNG. Tập trung vào các cách cấu tạo từ học thuật sai nhưng trông rất hợp lý hoặc các từ 'False friends' (nhìn giống nhưng khác nghĩa). Từ sai nhìn phải giống như một thuật ngữ học thuật có thật. KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
    } else if (targetLang === 'English' && dataMode === 'sentence') {
      if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi ngữ pháp cơ bản: CHỈ LÀ sai danh từ số ít/số nhiều (s/es) hoặc sai mạo từ cơ bản (a/an/the).";
      else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi ngữ pháp trung cấp: CHỈ LÀ sai giới từ (in/on/at) hoặc sai từ loại (VD: dùng Danh từ thay vì Tính từ, 'careful' vs 'carefully').";
      else rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi học thuật nâng cao: CHỈ LÀ sai cấu trúc câu bị động, lỗi rút gọn mệnh đề quan hệ, hoặc lỗi liên từ logic (VD: dùng 'although' thay vì 'because'). Câu này nhìn phải có vẻ hoàn toàn đúng đối với người mới học.";
    } else if (targetLang === 'Chinese' && dataMode === 'vocab') {
      if (['zh_level_1', 'zh_level_2'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ vựng đơn (1-2 chữ Hán) liên quan đến CHỦ ĐỀ TẬP TRUNG. Thay thế ĐÚNG MỘT chữ Hán bằng một chữ Đồng âm (同音字) hoặc Hình cận tự (形近字) rất cơ bản. KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else if (['zh_level_3', 'zh_level_4'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ vựng đơn (2-3 chữ Hán) liên quan đến CHỦ ĐỀ TẬP TRUNG. Thay thế một chữ Hán bằng chữ Đồng âm (同音字) hoặc sử dụng một Cận nghĩa từ (近义词) sai ngữ cảnh. KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else if (['zh_level_5', 'zh_level_6'].includes(normalizedKey)) rule = "Các đáp án bẫy PHẢI LÀ từ vựng đơn (2-4 chữ Hán) liên quan đến CHỦ ĐỀ TẬP TRUNG. Tập trung vào ngôn ngữ văn viết (书面语) hoặc sự nhầm lẫn之间 các Cận nghĩa từ (近义词辨析). KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
      else rule = "Các đáp án bẫy PHẢI LÀ từ vựng đơn liên quan đến CHỦ ĐỀ TẬP TRUNG. Tập trung vào Thành ngữ 4 chữ (成语) hoặc thuật ngữ học thuật. Thay thế một chữ để tạo ra lỗi từ vựng tinh vi. KHÔNG ĐƯỢC viết câu hoàn chỉnh.";
    } else if (targetLang === 'Chinese' && dataMode === 'sentence') {
      if (['zh_level_1', 'zh_level_2'].includes(normalizedKey)) rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi cơ bản: CHỈ LÀ dùng sai lượng từ (量词) hoặc đại từ cơ bản.";
      else if (['zh_level_3', 'zh_level_4'].includes(normalizedKey)) rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi cấu trúc: CHỈ LÀ thiếu trợ từ kết cấu (的/得/地) hoặc sai trật tự từ chỉ thời gian/nơi chốn.";
      else if (['zh_level_5', 'zh_level_6'].includes(normalizedKey)) rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi ngữ pháp: CHỈ LÀ sai bổ ngữ phức tạp (kết quả/trạng thái) hoặc dùng sai Cận nghĩa từ (近义词) trong ngữ cảnh.";
      else rule = antiLengthRule + "Các đáp án bẫy PHẢI LÀ những câu hoàn chỉnh xoay quanh CHỦ ĐỀ TẬP TRUNG. Tạo ĐÚNG MỘT lỗi logic hoặc ngữ nghĩa bậc cao: CHỈ LÀ dùng sai Thành ngữ (成语) trong ngữ cảnh hoặc tạo ra nghịch lý logic tinh vi.";
    }
    return rule;
  },

  getMicroTierOptionsRule: function(targetLang, dataMode, mappedKey, topic) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, targetLang);
    let optionsRule = "";
    const antiFragmentRule = "QUY TẮC ĐỊNH DẠNG TỐI QUAN TRỌNG: BẠN PHẢI TRẢ VỀ CÁC CÂU VĂN HOÀN CHỈNH. KHÔNG ĐƯỢC trả về các cụm từ ngắn, mảnh vụn hoặc từ đơn lẻ. Các đáp án nhiễu (distractors) PHẢI CÓ độ dài và cấu trúc tổng thể GIỐNG HỆT như câu gốc. ";
    
    if (targetLang === 'English' && dataMode === 'vocab') {
      if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) optionsRule = "3 đáp án nhiễu PHẢI LÀ các từ hoàn toàn khác biệt (về nghĩa và cách viết) để người mới học dễ dàng phân biệt.";
      else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) optionsRule = "3 đáp án nhiễu PHẢI CÙNG loại từ và có chút liên quan đến chủ đề của từ gốc nhằm tạo ra sự nhầm lẫn nhẹ.";
      else optionsRule = "3 đáp án nhiễu PHẢI LÀ các từ False Friends (từ nhìn giống nhưng khác nghĩa), các từ có cùng tiền tố/hậu tố, hoặc các từ đồng nghĩa rất tinh vi nhưng không phù hợp ngữ cảnh. Chúng phải trông cực kỳ hợp lý đối với người học học thuật.";
    } else if (targetLang === 'English' && dataMode === 'sentence') {
      if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) optionsRule = antiFragmentRule + "3 đáp án nhiễu PHẢI CHỨA các lỗi ngữ pháp rõ ràng (VD: hoàn toàn sai thì động từ, thiếu chủ ngữ).";
      else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) optionsRule = antiFragmentRule + "3 đáp án nhiễu PHẢI CHỨA các lỗi trung cấp khó nhận biết (VD: sai một chút giới từ, nhầm lẫn giữa so sánh hơn và so sánh nhất).";
      else optionsRule = antiFragmentRule + "3 đáp án nhiễu PHẢI TRÔNG hoàn hảo về mặt ngữ pháp nhưng chứa các khiếm khuyết ngữ nghĩa bậc cao (VD: sai đại từ quan hệ mang sắc thái tinh vi, sai cụm từ đi kèm (collocation) trang trọng, hoặc lỗi cú pháp đảo ngữ).";
    } else if (targetLang === 'Chinese' && dataMode === 'vocab') {
      if (['zh_level_1', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) optionsRule = "3 đáp án nhiễu PHẢI LÀ các chữ Hán có hình dáng hoàn toàn khác biệt hoặc là từ trái nghĩa cơ bản. Tránh dùng các từ đồng âm phức tạp.";
      else if (['zh_level_4', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) optionsRule = "3 đáp án nhiễu PHẢI LÀ Cận nghĩa từ (近义词) hoặc các chữ Hán có cùng bộ thủ (同部首字) để gây ra sự nhầm lẫn về thị giác/ngữ nghĩa.";
      else optionsRule = "3 đáp án nhiễu PHẢI LÀ các từ vựng văn viết cực kỳ trang trọng (书面语) hoặc Thành ngữ (成语) rất giống nhau chỉ khác 1 chữ.";
    } else if (targetLang === 'Chinese' && dataMode === 'sentence') {
      if (['zh_level_1', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) optionsRule = antiFragmentRule + "3 đáp án nhiễu PHẢI CÓ các lỗi sai trật tự từ rõ rệt hoặc dùng sai lượng từ hoàn toàn.";
      else if (['zh_level_4', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) optionsRule = antiFragmentRule + "3 đáp án nhiễu PHẢI CÓ các lỗi ngữ pháp tinh vi (VD: sai trợ từ động thái 了/着/过, hoặc cấu trúc chữ 'Ba'/'Bei' hơi sai lệch).";
      else optionsRule = antiFragmentRule + "3 đáp án nhiễu PHẢI LÀ những câu hoàn hảo về mặt cấu trúc nhưng sai về mặt ngữ nghĩa (VD: dùng Thành ngữ sai trong ngữ cảnh).";
    }
    return optionsRule;
  },

  getMicroTierNoiseRule: function(targetLang, dataMode, mappedKey, topic) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, targetLang);
    let noiseRule = "";
    
    if (targetLang === 'English') {
      if (dataMode === 'vocab') {
        noiseRule = "Tạo chính xác từ 2 đến 4 chữ cái thường (a-z) làm bẫy chính tả. Tập trung vào các nguyên âm hoặc phụ âm dễ nhầm lẫn. KHÔNG ĐƯỢC tạo từ hoàn chỉnh.";
      } else {
        if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) noiseRule = "Tạo các từ bẫy (noise) là các mạo từ cơ bản (a, an, the) hoặc giới từ đơn giản (in, on) xung đột với ngữ cảnh của câu gốc.";
        else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) noiseRule = "Tạo các từ bẫy (noise) là các dạng sai của động từ chính (VD: nếu câu có 'playing', hãy tạo 'played') hoặc các liên từ đơn giản gây hiểu lầm (but, so).";
        else noiseRule = "Tạo các từ bẫy (noise) là các phó từ nâng cao gây hiểu lầm (nevertheless, thereby) hoặc đại từ quan hệ dễ nhầm lẫn (which vs where). CHÚNG KHÔNG ĐƯỢC PHÉP khớp đúng ngữ pháp ở bất kỳ vị trí nào trong câu.";
      }
    } else if (targetLang === 'Chinese') {
      if (dataMode === 'vocab') {
        noiseRule = "Tạo chính xác từ 1 đến 2 chữ Hán (汉字) đơn lẻ có hình dáng tương tự (形近字) hoặc cùng âm đọc (同音字) với các chữ trong từ mục tiêu. KHÔNG ĐƯỢC tạo từ có nhiều chữ Hán.";
      } else {
        if (['zh_level_1', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) noiseRule = "Tạo các chữ Hán bẫy (noise) là các trợ từ kết cấu cơ bản (的, 得, 地) hoặc lượng từ phổ biến (个, 本) không thuộc về câu.";
        else if (['zh_level_4', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) noiseRule = "Tạo các chữ Hán bẫy (noise) là các trợ từ động thái (了, 着, 过) hoặc giới từ dễ nhầm lẫn (把, 被, 对) để làm lạc hướng cấu trúc câu.";
        else noiseRule = "Tạo các chữ Hán bẫy (noise) là các liên từ trang trọng (尽管, 既然) hoặc hư từ văn ngôn (之, 乎, 者, 也) làm phá vỡ cú pháp nâng cao.";
      }
    }
    return noiseRule;
  },

  getMicroTierClozeRule: function(targetLang, dataMode, mappedKey, topic) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, targetLang);
    let clozeRule = "";
    
    if (targetLang === 'English') {
      if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) clozeRule = "Chọn một Danh từ Chủ ngữ cơ bản hoặc một Động từ Hành động đơn giản để thay thế bằng '[__________]'. Đó phải là một từ dễ đoán.";
      else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) clozeRule = "Chọn một Giới từ quan trọng (in/on/at), một Tính từ miêu tả, hoặc một Trợ động từ để thay thế bằng '[__________]'. Nó phải kiểm tra được ngữ pháp/từ vựng trung cấp.";
      else clozeRule = "Chọn một Liên từ phức tạp, một phần của Cụm từ cố định (Collocation) nâng cao, hoặc một Cụm động từ (Phrasal Verb) khó để thay thế bằng '[__________]'. Nó phải thử thách được kỹ năng đọc hiểu học thuật.";
    } else if (targetLang === 'Chinese') {
      if (['zh_level_1', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) clozeRule = "Chọn một Danh từ chính hoặc một Động từ Hành động đơn giản để thay thế bằng '[__________]'.";
      else if (['zh_level_4', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) clozeRule = "Chọn một Lượng từ cụ thể (量词) hoặc một Bổ ngữ Kết quả/Xu hướng (结果/趋向补语) để thay thế bằng '[__________]'.";
      else clozeRule = "Chọn một chữ Hán quan trọng nằm bên trong một Thành ngữ (成语), một liên từ trang trọng, hoặc một động từ trừu tượng để thay thế bằng '[__________]'.";
    }
    return clozeRule;
  },

  getMicroTierOddRule: function(targetLang, dataMode, mappedKey, topic) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, targetLang);
    let oddRule = "";
    
    if (dataMode === 'sentence') {
      if (targetLang === 'English') {
        if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) oddRule = "Cung cấp 4 câu hoàn chỉnh. 3 câu PHẢI chung một thì ngữ pháp cơ bản (VD: Hiện tại Đơn) hoặc chung chủ đề ngữ nghĩa, và 1 câu PHẢI dùng thì khác hoặc mang nghĩa trái ngược.";
        else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) oddRule = "Cung cấp 4 câu hoàn chỉnh. 3 câu PHẢI chung một cấu trúc ngữ pháp trung cấp cụ thể (VD: Câu điều kiện loại 1, hoặc câu bị động), và 1 câu PHẢI KHÁC BIỆT.";
        else oddRule = "Cung cấp 4 câu hoàn chỉnh. 3 câu PHẢI chung một sắc thái học thuật tinh vi, các từ nối liên kết, hoặc cấu trúc đảo ngữ nâng cao, và 1 câu PHẢI KHÁC BIỆT.";
      } else if (targetLang === 'Chinese') {
        if (['zh_level_1', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) oddRule = "Cung cấp 4 câu hoàn chỉnh. 3 câu PHẢI chung một mẫu câu cơ bản (VD: Câu chữ 'Shi') hoặc chung chủ đề, và 1 câu PHẢI KHÁC BIỆT.";
        else if (['zh_level_4', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) oddRule = "Cung cấp 4 câu hoàn chỉnh. 3 câu PHẢI dùng chung một trợ từ cụ thể (như chữ 'Ba' 把 hoặc 'Bei' 被) hoặc chung cấu trúc bổ ngữ, và 1 câu PHẢI KHÁC BIỆT.";
        else oddRule = "Cung cấp 4 câu hoàn chỉnh. 3 câu PHẢI chung một biện pháp tu từ trang trọng hoặc cách diễn đạt văn ngôn, và 1 câu PHẢI KHÁC BIỆT.";
      }
    } else {
      if (targetLang === 'English') {
        if (['en_level_1', 'en_level_2', 'en_level_3'].includes(normalizedKey)) oddRule = "Phân loại dựa trên Ngữ nghĩa đơn giản (VD: 3 loại trái cây vs 1 con vật, hoặc 3 màu sắc vs 1 phương tiện).";
        else if (['en_level_4', 'en_level_5', 'en_level_6'].includes(normalizedKey)) oddRule = "Phân loại dựa trên Từ loại (VD: 3 danh từ vs 1 động từ) hoặc Đuôi từ (VD: 3 từ đuôi '-tion' vs 1 từ đuôi '-ment').";
        else oddRule = "Phân loại dựa trên Sắc thái nghĩa tinh vi (VD: 3 từ học thuật mang nghĩa tích cực vs 1 từ tiêu cực), hoặc các trường ngữ nghĩa trừu tượng.";
      } else if (targetLang === 'Chinese') {
        if (['zh_level_1', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) oddRule = "Phân loại dựa trên Ngữ nghĩa đơn giản (VD: 3 món ăn vs 1 món đồ quần áo).";
        else if (['zh_level_4', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) oddRule = "Phân loại dựa trên Bộ thủ chữ Hán (VD: 3 chữ có bộ Thủy 氵 vs 1 chữ có bộ Hỏa 火) hoặc Từ loại rõ ràng.";
        else oddRule = "Phân loại dựa trên Cấu trúc Thành ngữ (Mẫu Chengyu), hoặc sắc thái cảm xúc (褒义词 - từ bao nghĩa vs 贬义词 - từ biếm nghĩa).";
      }
    }
    
    const fewShot = "\n[CRITICAL FEW-SHOT EXAMPLES]\nĐể tránh ảo giác logic, BẮT BUỘC tuân thủ chặt chẽ các ví dụ định dạng JSON sau:\nEnglish: words: ['apple', 'banana', 'orange', 'cat'], oddWord: 'cat', explanation: 'Cat is an animal, the others are fruits.'\nChinese: words: ['苹果', '香蕉', '橘子', '猫'], oddWord: '猫', explanation: '猫是动物，其他都是水果。'";
    return oddRule + fewShot;
  },

  getMicroTierVocabTypeRule: function(mappedKey) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, 'English'); 
    
    if (['en_level_1', 'en_level_2', 'zh_level_1', 'zh_level_2'].includes(normalizedKey)) {
      return "QUY TẮC CẤP ĐỘ QUAN TRỌNG (Level 1-2): (Các) mục từ vựng PHẢI LÀ TỪ ĐƠN CƠ BẢN (VD: 'apple', 'run', 'happy'). KHÔNG ĐƯỢC sử dụng cụm từ hoặc từ ghép.";
    } else if (['en_level_3', 'en_level_4', 'zh_level_3', 'zh_level_4'].includes(normalizedKey)) {
      return "QUY TẮC CẤP ĐỘ QUAN TRỌNG (Level 3-4): (Các) mục từ vựng PHẢI LÀ TỪ GHÉP hoặc CỤM TỪ CƠ BẢN NGẮN GỌN gồm chính xác 2 từ (VD: 'ice cream', 'wake up', '看书').";
    } else if (['en_level_5', 'en_level_6', 'zh_level_5', 'zh_level_6'].includes(normalizedKey)) {
      return "QUY TẮC CẤP ĐỘ QUAN TRỌNG (Level 5-6): (Các) mục từ vựng PHẢI LÀ CỤM ĐỘNG TỪ hoặc CỤM TỪ CỐ ĐỊNH PHỔ BIẾN (2-3 từ, VD: 'give up', 'make a decision', '取得进步').";
    } else if (['en_level_7', 'en_level_8', 'zh_level_7', 'zh_level_8'].includes(normalizedKey)) {
      return "QUY TẮC CẤP ĐỘ QUAN TRỌNG (Level 7-8): (Các) mục từ vựng PHẢI LÀ THUẬT NGỮ HỌC THUẬT, CỤM TỪ TRANG TRỌNG, hoặc CỤM ĐỘNG TỪ NÂNG CAO (VD: 'mitigate the impact', 'take into consideration').";
    } else if (['en_level_9', 'zh_level_9'].includes(normalizedKey)) {
      return "QUY TẮC CẤP ĐỘ QUAN TRỌNG (Level 9): (Các) mục từ vựng PHẢI LÀ THÀNH NGỮ, CÁCH DIỄN ĐẠT VĂN CHƯƠNG, hoặc CÁC CỤM TỪ TINH VI (tối đa 4 từ, VD: 'a blessing in disguise', '莫名其妙').";
    }
    return "QUY TẮC CẤP ĐỘ QUAN TRỌNG: Mục từ vựng phải phù hợp với cấp độ. Nó có thể là một từ đơn hoặc cụm từ ngắn (tối đa 4 từ).";
  },

  getMicroTierListeningRule: function(mappedKey) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, 'English');
    
    if (['en_level_1', 'zh_level_1', 'level_1_kiddie'].includes(normalizedKey)) {
      return "QUY TẮC KỊCH BẢN QUAN TRỌNG: Trường 'audioScript' PHẢI CỰC KỲ ĐƠN GIẢN. Chính xác 1 hoặc 2 câu ngắn đơn giản. KHÔNG ĐƯỢC dùng câu ghép. KHÔNG ĐƯỢC dùng tính từ phức tạp (VD: dùng 'The dog is black', KHÔNG dùng 'the quick brown dog'). CHỈ sử dụng từ vựng A1 cơ bản (màu sắc, số đếm, động vật cơ bản).";
    } else if (['en_level_2', 'en_level_3', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) {
      return "QUY TẮC KỊCH BẢN QUAN TRỌNG: Trường 'audioScript' PHẢI LÀ CHÍNH XÁC 2 đến 3 câu đơn giản. Sử dụng động từ hành động cơ bản và tính từ đơn giản. KHÔNG dùng ngữ pháp phức tạp.";
    } else if (['en_level_4', 'en_level_5', 'zh_level_4', 'zh_level_5'].includes(normalizedKey)) {
      return "QUY TẮC KỊCH BẢN QUAN TRỌNG: Trường 'audioScript' PHẢI LÀ CHÍNH XÁC 3 đến 4 câu. Có thể là hội thoại ngắn hoặc độc thoại. Sử dụng thì quá khứ đơn hoặc giới từ cơ bản.";
    } else if (['en_level_6', 'en_level_7', 'zh_level_6', 'zh_level_7'].includes(normalizedKey)) {
      return "QUY TẮC KỊCH BẢN QUAN TRỌNG: Trường 'audioScript' là một đoạn văn gắn kết hoặc hội thoại ngắn. Bao gồm một số thông tin gây nhiễu phụ để kiểm tra khả năng nghe hiểu.";
    } else {
      return "QUY TẮC KỊCH BẢN QUAN TRỌNG: Trường 'audioScript' là một đoạn độc thoại học thuật nâng cao hoặc bản tin (khoảng 50-80 từ). Sử dụng cấu trúc câu phức và từ vựng cấp độ cao.";
    }
  },

  getMicroTierReadingRule: function(mappedKey) {
    const normalizedKey = this._getHighestLevelKey(mappedKey, 'English');
    
    if (['en_level_1', 'zh_level_1', 'level_1_kiddie'].includes(normalizedKey)) {
      return "QUY TẮC BÀI ĐỌC QUAN TRỌNG (LEVEL 1): Trường 'passage' PHẢI CỰC KỲ NGẮN, chính xác 3 đến 4 câu đơn giản (tối đa 20-30 từ). CHỈ dùng các danh từ cơ bản 1 âm tiết. TUYỆT ĐỐI KHÔNG dùng từ phức tạp. Tập trung vào đồ vật đơn giản. KHÔNG dùng câu ghép. TỐI QUAN TRỌNG: BẠN PHẢI TẠO ĐÚNG 5 CÂU HỎI. Để tạo 5 câu hỏi từ đoạn văn ngắn, hãy hỏi các câu cực kỳ đơn giản về màu sắc, số lượng, Đúng/Sai, hoặc danh tính.";
    } else if (['en_level_2', 'en_level_3', 'zh_level_2', 'zh_level_3'].includes(normalizedKey)) {
      return "QUY TẮC BÀI ĐỌC QUAN TRỌNG (LEVEL 2-3): Trường 'passage' PHẢI NGẮN, chính xác 5 đến 7 câu (40-70 từ). Dùng ngôn ngữ miêu tả đơn giản. Tập trung vào thói quen hàng ngày. TỐI QUAN TRỌNG: BẠN PHẢI TẠO ĐÚNG 5 CÂU HỎI. Kết hợp giữa Trắc nghiệm đơn giản và Đúng/Sai/Không có thông tin (TFNG) để đủ 5 câu.";
    } else if (['en_level_4', 'en_level_5', 'zh_level_4', 'zh_level_5'].includes(normalizedKey)) {
      return "QUY TẮC BÀI ĐỌC QUAN TRỌNG (LEVEL 4-5): Trường 'passage' nên là một văn bản độ dài trung bình (80-120 từ). Giới thiệu các câu ghép cơ bản. TỐI QUAN TRỌNG: BẠN PHẢI TẠO ĐÚNG 5 CÂU HỎI.";
    } else {
      return "QUY TẮC BÀI ĐỌC QUAN TRỌNG (LEVEL 6+): Trường 'passage' nên là văn bản học thuật hoặc chi tiết (150-300 từ). Sử dụng từ vựng nâng cao và văn phong học thuật. TỐI QUAN TRỌNG: BẠN PHẢI TẠO ĐÚNG 5 CÂU HỎI.";
    }
  },

  // ==================================================================================
  // HÀM _buildSystemPrompt CỦA BỘ NÃO AI (BỌC LẠI CHO KHẢO THÍ)
  // ==================================================================================
  _buildSystemPromptForFactory: function(forgeType, subType, level, lang, topic, dataMode) {
    const targetLang = lang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';
    
    const representativeLevel = this._getHighestLevelKey(level, targetLang);
    // Hủy bỏ phụ thuộc vào window.ExamProfiles
    // Tạm thời fallback chuỗi tĩnh "Intermediate"
    const cefrLevel = "Intermediate"; 
    
    // Lấy luật Sư phạm động từ Ma trận
    const pedagogyRules = this.getPedagogyMatrixRule ? this.getPedagogyMatrixRule(level, lang) : {
      example: "Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng. Tránh sinh câu cụt lủn, vô hồn.",
      definition: "Bản dịch Tiếng Việt trực tiếp, chuẩn xác. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa."
    };
    
    let prompt = `Bạn là một gia sư ${targetLang} chuyên nghiệp và tận tâm, đang tạo nội dung cho một ứng dụng giáo dục.\n`;
    prompt += `CẤP ĐỘ MỤC TIÊU: ${Array.isArray(level) ? level.join(', ') : level} (Tiêu chuẩn tương đương: ${cefrLevel}).\n`;
    
    // Extract contexts for all selected levels
    if (level) {
      const levelArr = Array.isArray(level) ? level : [level];
      const contexts = levelArr.map(lvl => this.GRADE_CONTEXTS?.[lvl]).filter(Boolean);
      if (contexts.length > 0) {
        prompt += `NGỮ CẢNH (CONTEXT): ${contexts.join(' | ')}\n`;
      }
    }
    
    if (lang === 'zh') {
      prompt += `QUY TẮC TỪ VỰNG: Vui lòng sử dụng từ vựng phù hợp với tiêu chuẩn ${Array.isArray(level) ? level.join(', ') : level}. Đối với cấp độ cơ bản, chỉ dùng các từ giao tiếp hàng ngày cơ bản. Với cấp độ cao hơn, dùng từ vựng nâng cao phù hợp nhưng không quá hiếm gặp hoặc tối nghĩa.\n`;
    } else {
      prompt += `QUY TẮC TỪ VỰNG: Vui lòng sử dụng từ vựng bám sát tiêu chuẩn ${cefrLevel}. Đảm bảo độ khó hoàn toàn phù hợp với học viên mục tiêu.\n`;
    }
    
    if (dataMode === 'sentence') {
      prompt += `QUY TẮC ĐỊNH DẠNG: Trường 'displaySentence' và tất cả các đáp án (options) đều phải là các câu văn hoàn chỉnh, nghe tự nhiên. KHÔNG trả về các mảnh vụn ngắn.\n`;
    } else {
      if (lang === 'zh') {
        prompt += `QUY TẮC ĐỊNH DẠNG: Đối với HSK Sơ cấp, hãy giữ cho các đáp án (options) tương đối ngắn gọn và dễ đọc.\n`;
      } else {
        prompt += `QUY TẮC ĐỊNH DẠNG: Đối với cấp độ Sơ cấp, hãy giữ cho các đáp án (options) tương đối đơn giản, dễ đọc.\n`;
      }
    }
    
    prompt += `GẮN NHÃN CẤP ĐỘ: Vui lòng khai báo đúng cấp độ CEFR/HSK vào trường 'cefr_level'. Khai báo sai cấp độ là một lỗi nghiêm trọng.\n`;
    
    // [BẢN VÁ 1.12] THIẾT QUÂN LUẬT PHÂN LOẠI CHỦ ĐỀ CHỐNG RÁC CSDL
    prompt += `[QUY TẮC BẮT BUỘC VỀ CHỦ ĐỀ]: Trường 'topic' trong JSON kết quả CHỈ ĐƯỢC PHÉP nhận 1 trong 9 giá trị chính xác sau: ['Self & Body', 'Social Connections', 'Living Spaces', 'The Natural World', 'Food & Health', 'Daily Life & Leisure', 'School & Career', 'Travel & Exploration', 'Other']. TUYỆT ĐỐI KHÔNG TỰ BỊA CHỦ ĐỀ KHÁC. Nếu không thuộc 8 nhóm đầu, gán 'Other'.\n`;
    
    const isTopicFree = topic === 'ANY' || subType === 'pronunciation' || subType === 'odd_one_out' || subType === 'spot_mistake';
    if (isTopicFree) {
      prompt += `TỰ DO CHỦ ĐỀ: Bạn có quyền tự do tuyệt đối sử dụng từ vựng từ mọi lĩnh vực đời sống. Tập trung hoàn toàn vào kỹ thuật của câu hỏi (Chính tả, Ngữ pháp, hoặc Logic Tìm từ khác loại).\n`;
    } else if (topic) {
      prompt += `TẬP TRUNG CHỦ ĐỀ NỘI DUNG: Liên quan chặt chẽ đến "${topic}".\n`;
    }
    
    if (forgeType === 'base_card') {
      prompt += `NHIỆM VỤ: Tạo một ${dataMode === 'sentence' ? 'câu văn' : 'từ vựng'} phù hợp chính xác với cấp độ tiêu chuẩn (${cefrLevel}) và chủ đề.\n`;
      const typeRule = this.getMicroTierVocabTypeRule ? this.getMicroTierVocabTypeRule(level) : "";
      if (typeRule && dataMode === 'vocab') {
        prompt += typeRule + "\n";
        prompt += `QUY TẮC RÕ RÀNG VỀ MẶT THỊ GIÁC: Đối với từ vựng, ưu tiên chọn các danh từ cụ thể (động vật, trái cây, đồ vật, nghề nghiệp) có hình dáng rõ ràng. TỐI QUAN TRỌNG: Danh từ được chọn PHẢI ĐÚNG CẤP ĐỘ HỌC THUẬT (${cefrLevel}). Tránh các tính từ trừu tượng.\n`;
      }
      prompt += `QUY TẮC ĐỊNH NGHĨA: Trường 'definition' BẮT BUỘC tuân thủ: ${pedagogyRules.definition}\n`;
      prompt += `TỪ KHÓA ẢNH: Bạn CŨNG PHẢI cung cấp một 'image_keyword' bằng Tiếng Anh. Từ khóa này phải cực kỳ cụ thể và CHỈ tập trung vào vật thể cốt lõi.\n`;
    }
    else if (forgeType === 'matrix') {
      if (subType === 'match' || subType === 'match_hard') {
        prompt += `NHIỆM VỤ: Tạo chính xác 5 cặp ${dataMode === 'sentence' ? 'câu văn' : 'từ vựng'} và bản dịch Tiếng Việt chính xác của chúng.\n`;
        prompt += `QUY TẮC DỊCH NGHĨA: ${pedagogyRules.definition}\n`;
        const typeRule = this.getMicroTierVocabTypeRule ? this.getMicroTierVocabTypeRule(level) : "";
        if (typeRule && dataMode === 'vocab') {
          prompt += typeRule + "\n";
          prompt += `QUY TẮC RÕ RÀNG VỀ MẶT THỊ GIÁC: Sử dụng các danh từ cụ thể ở đúng cấp độ chuẩn (${cefrLevel}) để mang lại kết quả học tập tốt hơn.\n`;
        }
        if (subType === 'match_hard') {
          prompt += `NHIỆM VỤ BỔ SUNG: Tạo chính xác 2 mục BẪY (đáp án sai). Mỗi bẫy phải là một phiên bản hơi sai lệch/bị bóp méo của một từ/câu hợp lệ ở cấp độ ${cefrLevel} để đánh lừa học viên. Cung cấp giải thích bằng Tiếng Việt tại sao bẫy đó lại sai.\n`;
        }
      } else if (subType === 'odd_one_out') {
        const allTopics = ['Animals', 'Food', 'Colors', 'Numbers', 'Body parts', 'Clothes', 'House', 'School', 'Jobs', 'Weather', 'Sports', 'Vehicles', 'Nature', 'Emotions', 'Technology', 'Space', 'Art', 'Music', 'Medicine', 'Business'];
        const shuffledTopics = Utils && Utils.shuffleArray ? Utils.shuffleArray([...allTopics]) : allTopics.sort(() => Math.random() - 0.5);
        prompt += `NHIỆM VỤ: Tạo một câu hỏi 'Tìm Từ Khác Loại' với chính xác 4 từ ${targetLang} khớp với cấp độ chuẩn ${cefrLevel}.\n`;
        prompt += `QUY TẮC TẠO HẠT GIỐNG ĐỘNG: BẠN PHẢI chọn 3 mục thuộc nhóm ngữ nghĩa [${shuffledTopics[0]}] và 1 mục khác loại thuộc nhóm ngữ nghĩa [${shuffledTopics[1]}].\n`;
        const oddRule = this.getMicroTierOddRule ? this.getMicroTierOddRule(targetLang, dataMode, level, topic) : "";
        if (oddRule) prompt += oddRule + "\n";
        prompt += `QUY TẮC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT 100%.\n`;
      } else if (subType === 'pronunciation') {
        prompt += "NHIỆM VỤ: Tạo một câu hỏi Ngữ âm/Phát âm.\n";
        prompt += `YÊU CẦU: Cung cấp 4 từ ${targetLang} ở cấp độ chuẩn ${cefrLevel}.\n`;
        const phoneticCategories = ['single vowels (a, e, i, o, u)', 'vowel digraphs (e.g., ea, oo, ou)', 'consonant digraphs (e.g., ch, th, gh)', 'silent letters (e.g., k, w, b)', 'grammar suffixes (-ed or -s/-es)'];
        const seedCategory = phoneticCategories[Math.floor(Math.random() * phoneticCategories.length)];
        prompt += `QUY TẮC TẠO HẠT GIỐNG ĐỘNG: BẠN CÓ QUYỀN TỰ DO TUYỆT ĐỐI để chọn MỘT kiểu chính tả cụ thể thuộc nhóm này: [${seedCategory}]. Tạo 4 từ có chung CÙNG MỘT kiểu chính tả đó, nhưng MỘT TỪ phải có cách PHÁT ÂM KHÁC đối với kiểu chính tả đó hoặc không bị câm (not silent).\n`;
        prompt += "QUY TẮC BẮT BUỘC 1: KHÔNG CHO PHÉP BIẾN THỂ CHÍNH TẢ trong kiểu đã chọn. Chúng PHẢI CÓ chung mỏ neo chính tả trực quan giống hệt nhau.\n";
        prompt += "QUY TẮC BẮT BUỘC 2: CHỈ TRẢ VỀ VĂN BẢN THUẦN TÚY. Tuyệt đối không sử dụng dấu sao (*) hoặc bất kỳ ký tự đặc biệt nào để đánh dấu chữ cái.\n";
        prompt += "QUY TẮC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT 100%, giải thích rõ ràng âm thanh/IPA cụ thể nào là khác biệt đối với kiểu chính tả chung đó.\n";
      }
    }
    else if (forgeType === 'context') {
      if (subType === 'fill_blank') {
        prompt += `NHIỆM VỤ: Tạo một câu ${targetLang} hoàn chỉnh khớp với cấp độ ${cefrLevel}. Chọn MỘT từ vựng quan trọng từ câu đó để làm 'targetWord'.\n`;
        prompt += `QUY TẮC TỐI QUAN TRỌNG 1: KHÔNG ĐƯỢC chèn '[__________]' vào câu. Trường 'displaySentence' BẮT BUỘC phải chứa câu TOÀN VẸN, KHÔNG BỊ CHỈNH SỬA.\n`;
        const clozeRule = this.getMicroTierClozeRule ? this.getMicroTierClozeRule(targetLang, dataMode, level, topic) : "";
        if (clozeRule) prompt += clozeRule + "\n";
        prompt += `QUY TẮC: Trường 'hint' PHẢI LÀ bản dịch Tiếng Việt của toàn bộ câu.\n`;
      } else if (subType === 'vocab_mcq') {
        prompt += `NHIỆM VỤ: Tạo một câu hỏi trắc nghiệm nhận diện từ vựng ở cấp độ ${cefrLevel}.\n`;
        prompt += `ĐỊNH DẠNG: Cung cấp từ/cụm từ mục tiêu bằng ${targetLang} trong trường 'term'. Cung cấp chính xác 4 đáp án bằng TIẾNG VIỆT (1 bản dịch đúng, 3 đáp án nhiễu).\n`;
        prompt += `QUY TẮC TÁCH RỜI NGỮ NGHĨA: 3 đáp án nhiễu PHẢI thuộc cùng một chủ đề rộng nhưng PHẢI LÀ CÁC VẬT THỂ CÓ HÌNH DÁNG KHÁC BIỆT RÕ RÀNG hoặc các danh mục con hoàn toàn khác nhau. KHÔNG dùng các đồ vật có họ hàng gần nhìn giống nhau.\n`;
        prompt += `QUY TẮC TỪ KHÓA ẢNH: Cung cấp một 'image_keyword' bằng Tiếng Anh cực kỳ cụ thể cho từ đúng, thêm hậu tố 'isolated white background clipart' để đảm bảo tìm kiếm hình ảnh rõ nét.\n`;
        prompt += `QUY TẮC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT 100%.\n`;
      } else if (subType === 'spot_mistake') {
        prompt += `NHIỆM VỤ: Tạo một câu ${targetLang} khớp với cấp độ ${cefrLevel} chứa CHÍNH XÁC MỘT lỗi ngữ pháp hoặc từ vựng nhỏ.\n`;
        prompt += `QUY TẮC SƯ PHẠM: Câu văn (displaySentence) BẮT BUỘC tuân thủ: ${pedagogyRules.example}\n`;
        prompt += `VẮC-XIN CHỐNG LỖI TỪ ĐỒNG DẠNG (SUBSTRING FALLACY): Từ bị sai PHẢI là một từ độc lập trong câu. TUYỆT ĐỐI CẤM chọn một từ nằm bên trong một từ ghép khác để làm lỗi (Ví dụ: Cấm thay chữ 'broken' nằm bên trong từ 'heartbroken' thành chữ khác). Đây là quy tắc bất di bất dịch.\n`;
        prompt += `QUY TẮC GIẢI THÍCH: Cung cấp câu sai, từ sai, từ sửa lại cho đúng, và giải thích bằng TIẾNG VIỆT.\n`;
      } else if (subType === 'listening') {
        prompt += `NHIỆM VỤ: Tạo một kịch bản bài nghe hiểu và một câu hỏi trắc nghiệm tương ứng khớp với cấp độ ${cefrLevel}.\n`;
        const listenRule = this.getMicroTierListeningRule ? this.getMicroTierListeningRule(level) : "";
        if (listenRule) prompt += listenRule + "\n";
        prompt += `QUY TẮC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT 100%. Cung cấp chính xác 4 đáp án với duy nhất 1 đáp án đúng.\n`;
      } else if (subType === 'reading_passage') {
        prompt += `NHIỆM VỤ: Tạo một đoạn văn đọc hiểu và một nhóm các câu hỏi đọc hiểu tuân thủ nghiêm ngặt cấp độ ${cefrLevel}.\n`;
        const readRule = this.getMicroTierReadingRule ? this.getMicroTierReadingRule(level) : "";
        if (readRule) prompt += readRule + "\n";
        prompt += `YÊU CẦU CÂU HỎI: Bao gồm kết hợp giữa Trắc nghiệm (type: "mcq") và Đúng/Sai/Không có thông tin (type: "tfng") hoặc Điền khuyết (type: "fill_blank").\n`;
        prompt += `QUY TẮC: Phần 'explanation' cho mỗi câu hỏi PHẢI BẰNG TIẾNG VIỆT 100%, trích dẫn lại phần liên quan trong văn bản.\n`;
      } else if (subType === 'grammar_mcq') {
        prompt += `NHIỆM VỤ: Tạo một câu hỏi trắc nghiệm ngữ pháp/từ vựng khớp với cấp độ ${cefrLevel}.\n`;
        prompt += `ĐỊNH DẠNG: Tạo một câu ${targetLang} hoàn chỉnh nhưng thay thế từ/cụm từ mục tiêu bằng '[__________]'. Đặt câu này vào trường 'term'.\n`;
        prompt += `QUY TẮC SƯ PHẠM: Câu văn gốc BẮT BUỘC tuân thủ: ${pedagogyRules.example}\n`;
        prompt += `YÊU CẦU: Cung cấp chính xác 4 đáp án. Chỉ có 1 đáp án đúng về ngữ pháp và ngữ nghĩa để điền vào chỗ trống.\n`;
        prompt += `QUY TẮC: Trường 'explanation' PHẢI BẰNG TIẾNG VIỆT 100%, giải thích tại sao đáp án đúng lại phù hợp và tại sao các đáp án nhiễu bị sai.\n`;
      }
    }
    
    const randomSeed = Math.random().toString(36).substring(2, 10).toUpperCase();
    prompt += `\n[MÃ HẠT GIỐNG - SEED: ${randomSeed}] SỰ SÁNG TẠO: Vui lòng giữ cho nội dung luôn phong phú, đa dạng và thú vị.\n`;
    
    return prompt;
  }
};