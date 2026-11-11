/**
 * @file src/engines/exam/examFallback.js
 * @description Kho Cứu hộ Đồng cấp (Tiered Fallback Agent). Cung cấp dữ liệu dự phòng chuẩn form thi khi AI sập mạng.
 * @origin Tầng 2 - Block 2.7b (Exam Fallback Agent)
 */

import { Utils } from '@/utils/helpers';
import { IoeDataEngine } from '../pedagogyEngine';
import { FallbackDataEngine } from '../fallbackData';

export const ExamFallback = {
  // ============================================================================
  // HÀM CỨU HỘ ĐỒNG CẤP (TIERED FALLBACK DATA ENGINE CHO MOCK TEST)
  // ============================================================================
  generateFallbackData: function(type, level, track, index = 0) {
    const lang = track === 'hsk' ? 'zh' : 'en';
    let fallbackCards = [];
    
    // Nâng cấp kho cứu hộ học thuật cho IELTS
    if (track === 'ielts') {
      fallbackCards = [
        {term: "Hypothesis", definition: "Giả thuyết"}, {term: "Paradigm", definition: "Hệ chuẩn"},
        {term: "Empirical", definition: "Dựa trên thực nghiệm"}, {term: "Qualitative", definition: "Định tính"},
        {term: "Quantitative", definition: "Định lượng"}, {term: "Correlation", definition: "Sự tương quan"},
        {term: "Subsequent", definition: "Xảy ra sau đó"}, {term: "Intrinsic", definition: "Thuộc về bản chất"}
      ];
    } else {
      // Trích xuất trực tiếp mảng gốc từ FallbackDataEngine
      const mode = (type.includes('sentence') || type.includes('spot_mistake') || type.includes('fill_blank') || type.includes('scramble') || type.includes('reading')) ? 'sentence' : 'vocab';
      try {
        if (FallbackDataEngine && FallbackDataEngine[lang] && FallbackDataEngine[lang][mode] && FallbackDataEngine[lang][mode][level]) {
          const rawData = FallbackDataEngine[lang][mode][level];
          if (Array.isArray(rawData) && rawData.length > 0) {
            fallbackCards = rawData;
          }
        }
      } catch (e) { console.warn("Linear extraction failed", e); }
      
      // Nếu vẫn rỗng, rút thẻ cứu hộ cuối cùng
      if (fallbackCards.length < 4) {
        fallbackCards = [
          {term: "Apple", definition: "Quả táo"}, {term: "Banana", definition: "Quả chuối"},
          {term: "Cat", definition: "Con mèo"}, {term: "Dog", definition: "Con chó"},
          {term: "Bird", definition: "Con chim"}, {term: "Fish", definition: "Con cá"}
        ];
      }
    }
    
    // Bốc xoay vòng TUYẾN TÍNH (Linear Pick) theo index để đảm bảo không bị lặp trong bài thi
    const safeIndex = Math.abs(index) % fallbackCards.length;
    const baseCard = fallbackCards[safeIndex] || {term: "Error", definition: "Lỗi"};
    
    // Trích xuất 3 nhiễu tịnh tiến an toàn
    const opt1 = fallbackCards[(safeIndex + 1) % fallbackCards.length]?.definition || "Nhiễu 1";
    const opt2 = fallbackCards[(safeIndex + 2) % fallbackCards.length]?.definition || "Nhiễu 2";
    const opt3 = fallbackCards[(safeIndex + 3) % fallbackCards.length]?.definition || "Nhiễu 3";
    
    // Sửa lại hàm trích nhiễu bằng Tiếng Anh cho Fallback Image Quiz
    const optEng1 = fallbackCards[(safeIndex + 1) % fallbackCards.length]?.term || "Ant";
    const optEng2 = fallbackCards[(safeIndex + 2) % fallbackCards.length]?.term || "Worm";
    const optEng3 = fallbackCards[(safeIndex + 3) % fallbackCards.length]?.term || "Bee";
    
    switch(type) {
      case IoeDataEngine?.QUESTION_TYPES?.IOE_MULTIPLE_CHOICE || 'ioe_multiple_choice':
      case 'ioe_multiple_choice':
      case IoeDataEngine?.QUESTION_TYPES?.IOE_MATCH || 'ioe_match':
      case 'ioe_match':
      case 'ielts_reading_mcq':
        return {
          term: baseCard.term,
          definition: baseCard.definition,
          options: Utils.shuffleArray([
            { text: baseCard.definition, isCorrect: true },
            { text: opt1, isCorrect: false },
            { text: opt2, isCorrect: false },
            { text: opt3, isCorrect: false }
          ]),
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_SPOT_MISTAKE || 'ioe_spot_mistake':
      case 'ioe_spot_mistake':
        return {
          wrongSentence: baseCard.term + "s",
          wrongWord: baseCard.term + "s",
          correction: baseCard.term,
          explanation: "Lỗi hình thái từ (Hệ thống dự phòng tự động).",
          origin: baseCard,
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_FILL_BLANK || 'ioe_fill_blank':
      case 'ioe_fill_blank':
      case 'ielts_listening_fill':
        return {
          displaySentence: "[__________]",
          targetWord: baseCard.term,
          hint: baseCard.definition,
          origin: baseCard,
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_SCRAMBLE || 'ioe_scramble':
      case 'ioe_scramble':
        return {
          term: baseCard.term,
          definition: baseCard.definition,
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_ODD_ONE_OUT || 'ioe_odd_one_out':
      case 'ioe_odd_one_out':
        return {
          words: Utils.shuffleArray([baseCard.term, fallbackCards[(safeIndex + 1) % fallbackCards.length]?.term || 'A', fallbackCards[(safeIndex + 2) % fallbackCards.length]?.term || 'B', "Lạc loài"]),
          oddWord: "Lạc loài",
          explanation: "Từ khác loại do hệ thống dự phòng cung cấp.",
          originCards: [baseCard],
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_PRONUNCIATION || 'ioe_pronunciation':
      case 'ioe_pronunciation':
        return {
          term: "cat, bat, tall, map",
          definition: "Từ tall có âm /ɔː/ khác với âm /æ/ ở các từ còn lại.",
          options: Utils.shuffleArray([
            { text: "cat", isCorrect: false },
            { text: "bat", isCorrect: false },
            { text: "tall", isCorrect: true },
            { text: "map", isCorrect: false }
          ]),
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_IMAGE_QUIZ || 'ioe_image_quiz':
      case 'ioe_image_quiz':
        return {
          term: baseCard.term,
          definition: baseCard.definition,
          options: Utils.shuffleArray([
            { text: baseCard.term, image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(baseCard.term + " isolated clipart")}&w=300&h=300&c=7&rs=1&p=0`, isCorrect: true },
            { text: optEng1, image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(optEng1 + " isolated clipart")}&w=300&h=300&c=7&rs=1&p=0`, isCorrect: false },
            { text: optEng2, image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(optEng2 + " isolated clipart")}&w=300&h=300&c=7&rs=1&p=0`, isCorrect: false },
            { text: optEng3, image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(optEng3 + " isolated clipart")}&w=300&h=300&c=7&rs=1&p=0`, isCorrect: false }
          ]),
          isAiGenerated: false
        };
        
      case IoeDataEngine?.QUESTION_TYPES?.IOE_LISTENING || 'ioe_listening':
      case 'ioe_listening':
        if (lang === 'zh') {
          const zhListeningFallbacks = [
            { audioScript: "你好，我叫王明。我喜欢吃苹果。", term: "王明喜欢吃什么？", options: ["苹果 (Píngguǒ)", "香蕉 (Xiāngjiāo)", "西瓜 (Xīguā)", "米饭 (Mǐfàn)"], explanation: "Trong đoạn băng, người nói nói rằng: '我喜欢吃苹果' (Tôi thích ăn táo)." },
            { audioScript: "今天天气很好，阳光明媚。", term: "今天天气怎么样？", options: ["很好 (Hěn hǎo)", "下雨 (Xià yǔ)", "很冷 (Hěn lěng)", "下雪 (Xià xuě)"], explanation: "Trong đoạn băng có câu: '今天天气很好' (Hôm nay thời tiết rất tốt)." }
          ];
          const listenItemZh = zhListeningFallbacks[Math.abs(index) % zhListeningFallbacks.length];
          return {
            audioScript: listenItemZh.audioScript,
            term: listenItemZh.term,
            options: Utils.shuffleArray([
              { text: listenItemZh.options[0], isCorrect: true },
              { text: listenItemZh.options[1], isCorrect: false },
              { text: listenItemZh.options[2], isCorrect: false },
              { text: listenItemZh.options[3], isCorrect: false }
            ]),
            explanation: listenItemZh.explanation,
            isAiGenerated: false
          };
        } else {
          const listeningFallbacks = [
            { audioScript: "The weather is very sunny today. I want to go to the beach.", term: "What is the weather like today?", options: ["Sunny", "Rainy", "Cloudy", "Snowy"], explanation: "The speaker said: 'The weather is very sunny today'." },
            { audioScript: "I have a new red bicycle. I ride it to school every day.", term: "What color is the bicycle?", options: ["Red", "Blue", "Green", "Yellow"], explanation: "The speaker said: 'I have a new red bicycle'." },
            { audioScript: "My favorite food is pizza. I eat it on weekends.", term: "What is the speaker's favorite food?", options: ["Pizza", "Burger", "Pasta", "Salad"], explanation: "The speaker said: 'My favorite food is pizza'." },
            { audioScript: "She is a doctor. She works in a big hospital.", term: "Where does she work?", options: ["Hospital", "School", "Shop", "Bank"], explanation: "The speaker said: 'She works in a big hospital'." },
            { audioScript: "They are playing football in the park.", term: "What are they playing?", options: ["Football", "Tennis", "Basketball", "Golf"], explanation: "The speaker said: 'They are playing football'." }
          ];
          const listenItemEn = listeningFallbacks[Math.abs(index) % listeningFallbacks.length];
          return {
            audioScript: listenItemEn.audioScript,
            term: listenItemEn.term,
            options: Utils.shuffleArray([
              { text: listenItemEn.options[0], isCorrect: true },
              { text: listenItemEn.options[1], isCorrect: false },
              { text: listenItemEn.options[2], isCorrect: false },
              { text: listenItemEn.options[3], isCorrect: false }
            ]),
            explanation: listenItemEn.explanation,
            isAiGenerated: false
          };
        }
        
      case 'ielts_reading_passage':
        const readingFallbacks = [
          { passage: "Education is crucial for the development of society. It equips individuals with the skills needed to succeed.", term: "What does education equip individuals with?", options: ["Skills needed to succeed", "Money", "Free time", "Nothing"], exp: "The text states that education equips individuals with skills." },
          { passage: "The Internet has revolutionized how we communicate. We can now connect with people instantly across the globe.", term: "What has the Internet revolutionized?", options: ["How we communicate", "How we eat", "How we sleep", "How we travel"], exp: "The text states that the Internet has revolutionized how we communicate." },
          { passage: "Regular exercise is beneficial for physical health. It helps reduce the risk of chronic diseases.", term: "What does regular exercise help reduce?", options: ["Risk of chronic diseases", "Intelligence", "Height", "Age"], exp: "The text says it helps reduce the risk of chronic diseases." },
          { passage: "Reading books enhances vocabulary and critical thinking. It is a productive habit for people of all ages.", term: "What does reading books enhance?", options: ["Vocabulary and critical thinking", "Physical strength", "Eyesight", "Hearing"], exp: "The text mentions it enhances vocabulary and critical thinking." },
          { passage: "Climate change is a pressing global issue. It requires immediate action from all countries to mitigate its effects.", term: "What kind of issue is climate change?", options: ["A pressing global issue", "A minor local problem", "A fictional story", "A positive trend"], exp: "The text describes it as a pressing global issue." }
        ];
        const readItem = readingFallbacks[Math.abs(index) % readingFallbacks.length];
        return {
          passage: readItem.passage,
          term: readItem.term,
          options: Utils.shuffleArray([
            { text: readItem.options[0], isCorrect: true },
            { text: readItem.options[1], isCorrect: false },
            { text: readItem.options[2], isCorrect: false },
            { text: readItem.options[3], isCorrect: false }
          ]),
          explanation: readItem.exp,
          isAiGenerated: false
        };
        
      default:
        return { term: "Lỗi mạng", definition: "Câu hỏi dự phòng", isAiGenerated: false };
    }
  }
};