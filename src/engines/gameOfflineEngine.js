/**
 * @file src/engines/gameOfflineEngine.js
 * @description Bộ não Cục bộ (Game Offline Engine) & Trạm định tuyến (Facade Pattern). Chuyên trách xử lý logic game ngoại tuyến và kết hợp với AI.
 * @origin Tầng 2 - Block 2.3B (Game Offline Engine & Facade)
 */

import { Utils } from '@/utils/helpers';
import { IoeDataEngine } from './pedagogyEngine';
import { GameAiEngine } from './gameAiEngine';
// FallbackDataEngine sẽ được tạo ở bước tiếp theo
import { FallbackDataEngine } from './fallbackData';

export const GameOfflineEngine = {
  // Helper nội bộ
  _cleanWord: (word) => word ? word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase() : "",
  
  // Hút dữ liệu từ Tổng kho (Master Pool) tránh cạn kiệt thẻ cục bộ
  _getMasterPool: function(lang) {
    let masterPool = [];
    try {
      const safeLang = (lang === 'en' || lang === 'zh') ? lang : 'en';
      masterPool = Utils.safeJsonParse('fc_data_' + safeLang, []);
    } catch (e) { console.warn("Lỗi đọc Master Pool Offline", e); }
    return masterPool || [];
  },

  // ============================================================================
  // 0. BỘ ĐỊNH TUYẾN NGỮ PHÁP (Offline Grammar Smart Router)
  // ============================================================================
  offline_getGrammarMicroPrompt: function(card, gameType) {
    if (!IoeDataEngine || !IoeDataEngine.MICRO_PROMPTS) return "";
    let gTypes = card.grammar_type;
    if (!gTypes) return "";
    if (typeof gTypes === 'string') gTypes = gTypes.split(',').map(t => t.trim());
    if (!Array.isArray(gTypes) || gTypes.length === 0) return "";
    
    const gamePrompts = IoeDataEngine.MICRO_PROMPTS[gameType];
    if (!gamePrompts) return "";
    
    const validTypes = gTypes.filter(t => gamePrompts[t]);
    if (validTypes.length === 0) return "";
    
    const targetType = validTypes[Math.floor(Math.random() * validTypes.length)];
    return gamePrompts[targetType];
  },

  // ============================================================================
  // 1. THUẬT TOÁN BÓP MÉO NGOẠI TUYẾN (Offline Distortion)
  // ============================================================================
  offline_distort: function(text, lang, type) {
    if (!text || text.length < 1) {
      return { wrongSentence: text + "s", wrongWord: text + "s", correction: text, explanation: "Lỗi cơ bản" };
    }
    if (type === 'word') {
      if (lang === 'zh') {
        const arr = Array.from(text);
        const validIndices = arr.map((char, i) => /[\u4e00-\u9fa5]/.test(char) ? i : -1).filter(i => i !== -1);
        if (validIndices.length > 0) {
          const idx = validIndices[Math.floor(Math.random() * validIndices.length)];
          const fallbackWrongs = ['的', '了', '吗', '吧', '啊', '在', '是', '不'];
          let wrongChar = fallbackWrongs[Math.floor(Math.random() * fallbackWrongs.length)];
          if (wrongChar === arr[idx]) wrongChar = '没';
          arr[idx] = wrongChar;
          return { wrongWord: arr.join(''), explanation: "Lỗi dùng sai chữ Hán." };
        }
        return { wrongWord: text + "的", explanation: "Lỗi thêm chữ thừa." };
      }
      
      if (lang === 'en' || !lang) {
        let w = text;
        const enSwaps = [
          { p: /ss/g, r: 's', exp: "Lỗi thiếu phụ âm kép." },
          { p: /ll/g, r: 'l', exp: "Lỗi thiếu phụ âm kép." },
          { p: /mm/g, r: 'm', exp: "Lỗi thiếu phụ âm kép." },
          { p: /nn/g, r: 'n', exp: "Lỗi thiếu phụ âm kép." },
          { p: /pp/g, r: 'p', exp: "Lỗi thiếu phụ âm kép." },
          { p: /ie/g, r: 'ei', exp: "Lỗi đảo nguyên âm (ie/ei)." },
          { p: /ei/g, r: 'ie', exp: "Lỗi đảo nguyên âm (ie/ei)." },
          { p: /tion\b/g, r: 'sion', exp: "Lỗi sai hậu tố (tion/sion)." },
          { p: /sion\b/g, r: 'tion', exp: "Lỗi sai hậu tố (tion/sion)." },
          { p: /ent\b/g, r: 'ant', exp: "Lỗi sai hậu tố (ent/ant)." },
          { p: /ant\b/g, r: 'ent', exp: "Lỗi sai hậu tố (ent/ant)." },
          { p: /ce\b/g, r: 'se', exp: "Lỗi nhầm lẫn c/s ở cuối từ." },
          { p: /se\b/g, r: 'ce', exp: "Lỗi nhầm lẫn c/s ở cuối từ." }
        ];
        const shuffledEn = Utils ? Utils.shuffleArray(enSwaps) : enSwaps;
        for (const rule of shuffledEn) {
          if (rule.p.test(w)) {
            return { wrongWord: w.replace(rule.p, rule.r), explanation: rule.exp };
          }
        }
      }
      
      if (text.length >= 4) {
        const arr = Array.from(text);
        const idx = Math.floor(Math.random() * (arr.length - 3)) + 1;
        let t = arr[idx]; arr[idx] = arr[idx+1]; arr[idx+1] = t;
        return { wrongWord: arr.join(''), explanation: "Lỗi đảo chữ (Typo)." };
      }
      return { wrongWord: text + (lang === 'en' ? "s" : "x"), explanation: "Lỗi hình thái từ." };
    }
    
    if (lang === 'zh') {
      const replacements = [
        { wrong: '得', correct: '的', exp: "Dùng sai trợ từ kết cấu (的/得/地)." },
        { wrong: '地', correct: '得', exp: "Dùng sai trợ từ kết cấu (的/得/地)." },
        { wrong: '的', correct: '地', exp: "Dùng sai trợ từ kết cấu (的/得/地)." },
        { wrong: '没', correct: '不', exp: "Dùng sai phó từ phủ định (不/没)." },
        { wrong: '不', correct: '没', exp: "Dùng sai phó từ phủ định (不/没)." },
        { wrong: '她', correct: '他', exp: "Dùng sai đại từ nhân xưng." },
        { wrong: '他', correct: '她', exp: "Dùng sai đại từ nhân xưng." },
        { wrong: '是', correct: '在', exp: "Dùng sai động từ/giới từ." },
        { wrong: '在', correct: '是', exp: "Dùng sai động từ/giới từ." },
        { wrong: '过', correct: '了', exp: "Dùng sai trợ từ động thái." },
        { wrong: '了', correct: '过', exp: "Dùng sai trợ từ động thái." }
      ];
      const shuffledRules = Utils ? Utils.shuffleArray(replacements) : replacements;
      for (const rule of shuffledRules) {
        if (text.includes(rule.correct)) {
          return {
            wrongSentence: text.replace(rule.correct, rule.wrong),
            wrongWord: rule.wrong,
            correction: rule.correct,
            explanation: rule.exp
          };
        }
      }
      
      const arr = Array.from(text);
      const validIndices = arr.map((char, i) => /[\u4e00-\u9fa5]/.test(char) ? i : -1).filter(i => i !== -1);
      if (validIndices.length > 0) {
        const idx = validIndices[Math.floor(Math.random() * validIndices.length)];
        const correctChar = arr[idx];
        const fallbackWrongs = ['的', '了', '吗', '吧', '啊', '在', '是', '不'];
        let wrongChar = fallbackWrongs[Math.floor(Math.random() * fallbackWrongs.length)];
        if (wrongChar === correctChar) wrongChar = '没';
        arr[idx] = wrongChar;
        return {
          wrongSentence: arr.join(''),
          wrongWord: wrongChar,
          correction: correctChar,
          explanation: "Lỗi dùng sai từ vựng tiếng Trung."
        };
      }
      return { wrongSentence: text + "的", wrongWord: "的", correction: "", explanation: "Lỗi thêm chữ thừa." };
    }
    
    const replacements = [
      { regex: /\b(an)\b(?=\s+[aeiou])/i, wrong: "a", correct: "an", exp: "Đứng trước nguyên âm (a,e,i,o,u) phải dùng mạo từ 'an'." },
      { regex: /\b(a)\b(?=\s+[bcdfghjklmnpqrstvwxyz])/i, wrong: "an", correct: "a", exp: "Đứng trước phụ âm phải dùng mạo từ 'a'." },
      { regex: /\b(is)\b/i, wrong: "are", correct: "is", exp: "Chủ ngữ số ít đi với 'is'." },
      { regex: /\b(are)\b/i, wrong: "is", correct: "are", exp: "Chủ ngữ số nhiều đi với 'are'." },
      { regex: /\b(was)\b/i, wrong: "were", correct: "was", exp: "Quá khứ số ít dùng 'was'." },
      { regex: /\b(were)\b/i, wrong: "was", correct: "were", exp: "Quá khứ số nhiều dùng 'were'." },
      { regex: /\b(he)\b/i, wrong: "him", correct: "he", exp: "Cần dùng Đại từ nhân xưng làm chủ ngữ, không dùng Tân ngữ." },
      { regex: /\b(she)\b/i, wrong: "her", correct: "she", exp: "Cần dùng Đại từ nhân xưng làm chủ ngữ, không dùng Tân ngữ." },
      { regex: /\b(in)\b/i, wrong: "on", correct: "in", exp: "Sai giới từ (In/On/At)." },
      { regex: /\b(on)\b/i, wrong: "in", correct: "on", exp: "Sai giới từ (In/On/At)." },
      { regex: /\b(at)\b/i, wrong: "in", correct: "at", exp: "Sai giới từ (In/On/At)." },
      { regex: /\b(because)\b/i, wrong: "so", correct: "because", exp: "Sai từ nối chỉ nguyên nhân - kết quả." },
      { regex: /\b(but)\b/i, wrong: "and", correct: "but", exp: "Sai từ nối mang nghĩa tương phản." },
      { regex: /\b(can)\b/i, wrong: "can to", correct: "can", exp: "Sau động từ khuyết thiếu (can, should...) dùng động từ nguyên thể không 'to'." },
      { regex: /\b(must)\b/i, wrong: "must to", correct: "must", exp: "Sau động từ khuyết thiếu dùng nguyên thể không 'to'." },
      { regex: /\b(has)\b/i, wrong: "have", correct: "has", exp: "Sự hòa hợp chủ vị với 'have/has'." },
      { regex: /\b(have)\b/i, wrong: "has", correct: "have", exp: "Sự hòa hợp chủ vị với 'have/has'." },
      { regex: /\b(good)\b/i, wrong: "well", correct: "good", exp: "Dùng sai từ loại (Tính từ vs Trạng từ)." },
      { regex: /\b(well)\b/i, wrong: "good", correct: "well", exp: "Dùng sai từ loại (Trạng từ bổ nghĩa cho động từ)." },
      { regex: /\b(make)\b/i, wrong: "do", correct: "make", exp: "Sai cụm từ cố định (Collocation)." }
    ];
    
    const shuffledRules = Utils ? Utils.shuffleArray(replacements) : replacements;
    for (const rule of shuffledRules) {
      const match = text.match(rule.regex);
      if (match) {
        const originalWord = match[0];
        const isCap = /^[A-Z]/.test(originalWord);
        let finalWrong = rule.wrong;
        let finalCorrect = rule.correct;
        if (isCap) {
          finalWrong = finalWrong.charAt(0).toUpperCase() + finalWrong.slice(1);
          finalCorrect = finalCorrect.charAt(0).toUpperCase() + finalCorrect.slice(1);
        }
        return {
          wrongSentence: text.replace(rule.regex, finalWrong),
          wrongWord: finalWrong,
          correction: finalCorrect,
          explanation: rule.exp
        };
      }
    }
    
    const words = text.split(' ');
    const validIndices = words.map((w, i) => w.replace(/[^\w]/g, '').length > 4 ? i : -1).filter(i => i !== -1);
    
    if (validIndices.length > 0) {
      const targetIdx = validIndices[Math.floor(Math.random() * validIndices.length)];
      const correction = words[targetIdx].replace(/[.,?!;:]/g, '');
      const isCap = /^[A-Z]/.test(correction);
      let wrongWord = correction + (correction.endsWith('s') ? "es" : "s");
      if (isCap) wrongWord = wrongWord.charAt(0).toUpperCase() + wrongWord.slice(1);
      words[targetIdx] = words[targetIdx].replace(correction, wrongWord);
      return { wrongSentence: words.join(' '), wrongWord, correction, explanation: "Lỗi số ít/số nhiều hoặc hình thái từ." };
    }
    
    return { wrongSentence: text + "x", wrongWord: text + "x", correction: text, explanation: "Fallback" };
  },

  // ============================================================================
  // 2. THUẬT TOÁN TẠO ĐÁP ÁN NHIỄU TỔNG KHO (Universal Master Pool Scoring)
  // ============================================================================
  offline_generateOptions: function(correctText, deck, lang, type, count = 3, isReverse = false, isHard = false) {
    const cleanCorrectText = correctText ? correctText.trim() : "";
    if (!cleanCorrectText) return [];
    
    // TÌM THẺ GỐC (Đóng vai trò là Mỏ neo chấm điểm)
    let baseCard = isReverse ? deck.find(c => c.term === cleanCorrectText) : deck.find(c => c.definition === cleanCorrectText);
    baseCard = baseCard || {};
    
    // [V1.24] TRẠM GÁC ĐỘC BẢN 2 CHIỀU (2D Uniqueness Filter)
    const textSet = new Set();
    const meaningSet = new Set();
    
    // Thêm thẻ gốc vào danh sách đen để chặn sinh trùng
    if (baseCard.term) textSet.add(baseCard.term.toLowerCase().trim());
    if (baseCard.definition) meaningSet.add(baseCard.definition.toLowerCase().trim());
    
    const finalDistractors = [];
    const originTopic = baseCard.topic || "";
    const originPOS = (baseCard.partOfSpeech || "").toLowerCase().trim();
    const originLevel = baseCard.level || "";
    
    const getVal = (c) => {
      const val = isReverse ? c.term : c.definition;
      return val ? val.trim() : "";
    };
    
    // [BƯỚC 1: TRÍCH XUẤT TỔNG KHO]
    const masterPool = this._getMasterPool(lang);
    const combinedMap = new Map();
    [...deck, ...masterPool].forEach(c => {
      if (c && c.term) {
        const cVal = getVal(c);
        // BỘ LỌC TẦNG 1: Loại bỏ trùng lặp và chuỗi trống
        if (cVal && cVal !== cleanCorrectText && c.term !== baseCard.term) {
          combinedMap.set(cVal, c);
        }
      }
    });
    
    const combinedPool = Array.from(combinedMap.values());
    
    if (type === 'sentence') {
      // [LOGIC CHO CÂU VĂN]
      if (!isReverse) {
        // Điền Nghĩa Tiếng Việt
        const scoredSentences = combinedPool.map(c => {
          let score = 0;
          if (originTopic && c.topic === originTopic) score += 2;
          if (originLevel && c.level === originLevel) score += 1;
          const diff = Math.abs(getVal(c).length - cleanCorrectText.length);
          if (diff <= 15) score += 1;
          return { card: c, score, val: getVal(c) };
        }).filter(item => item.val);
        
        scoredSentences.sort((a, b) => b.score - a.score);
        const shuffled = Utils && Utils.shuffleArray ? Utils.shuffleArray(scoredSentences.slice(0, 30)) : scoredSentences.slice(0, 30);
        
        for (let item of shuffled) {
          if (finalDistractors.length >= count) break;
          const cTerm = (item.card.term || "").toLowerCase().trim();
          const cDef = (item.card.definition || "").toLowerCase().trim();
          
          // TRẠM GÁC 2 CHIỀU
          if (textSet.has(cTerm) || meaningSet.has(cDef)) continue;
          textSet.add(cTerm);
          meaningSet.add(cDef);
          
          finalDistractors.push(item.val);
        }
      } else {
        // Tiếng Ngoại Ngữ
        if (isHard && this.offline_distort) {
          const trap1 = this.offline_distort(cleanCorrectText, lang, type).wrongSentence;
          if (trap1 && trap1.trim() !== "" && trap1 !== cleanCorrectText) {
            const trapLower = trap1.toLowerCase().trim();
            if (!textSet.has(trapLower)) {
              textSet.add(trapLower);
              finalDistractors.push(trap1.trim());
            }
          }
        }
        
        const isChinese = lang === 'zh';
        const words = isChinese ? Array.from(cleanCorrectText) : cleanCorrectText.split(' ').map(w => w.replace(/[.,?!;:'"]/g, ''));
        const minLen = isChinese ? 1 : 4;
        const validWords = words.filter(w => w.length >= minLen);
        
        if (validWords.length > 0 && combinedPool.length > 0) {
          const kw = validWords[Math.floor(Math.random() * validWords.length)];
          let poolFilter = combinedPool.filter(c => !Utils.detectSentence(c.term));
          if (originTopic) poolFilter = poolFilter.filter(c => c.topic === originTopic);
          if (poolFilter.length === 0) poolFilter = combinedPool.filter(c => !Utils.detectSentence(c.term));
          
          if (poolFilter.length > 0) {
            const swapWord = poolFilter[Math.floor(Math.random() * poolFilter.length)].term.trim();
            if (swapWord) {
              const newSentence = isChinese ? cleanCorrectText.replace(kw, swapWord) : cleanCorrectText.replace(new RegExp(`\\b${kw}\\b`, 'i'), swapWord);
              const newSentenceLower = newSentence.toLowerCase().trim();
              
              if (!textSet.has(newSentenceLower)) {
                textSet.add(newSentenceLower);
                finalDistractors.push(newSentence);
              }
            }
          }
        }
        
        const scoredSentences = combinedPool.filter(c => Utils.detectSentence(c.term)).map(c => {
          let score = 0;
          if (originTopic && c.topic === originTopic) score += 2;
          if (originLevel && c.level === originLevel) score += 1;
          return { card: c, score, val: getVal(c) };
        }).filter(item => item.val);
        
        scoredSentences.sort((a, b) => b.score - a.score);
        const shuffled = Utils && Utils.shuffleArray ? Utils.shuffleArray(scoredSentences.slice(0, 30)) : scoredSentences.slice(0, 30);
        
        for (let item of shuffled) {
          if (finalDistractors.length >= count) break;
          const cTerm = (item.card.term || "").toLowerCase().trim();
          const cDef = (item.card.definition || "").toLowerCase().trim();
          
          // TRẠM GÁC 2 CHIỀU
          if (textSet.has(cTerm) || meaningSet.has(cDef)) continue;
          textSet.add(cTerm);
          meaningSet.add(cDef);
          
          finalDistractors.push(item.val);
        }
      }
    } else {
      // [BƯỚC 2: CỖ MÁY CHẤM ĐIỂM TRỌNG SỐ CHO TỪ VỰNG]
      const scoredPool = combinedPool.map(c => {
        let score = 0;
        const cPos = (c.partOfSpeech || "").toLowerCase().trim();
        
        // +3 Điểm: Khớp Từ loại
        if (originPOS && cPos === originPOS) score += 3;
        // +2 Điểm: Khớp Chủ đề
        if (originTopic && c.topic === originTopic) score += 2;
        // +1 Điểm: Khớp Cấp độ
        if (originLevel && c.level === originLevel) score += 1;
        
        // Điểm cộng phụ (Soft matches để chống lệch hình thái)
        const cVal = getVal(c);
        if (cVal && Math.abs(cVal.length - cleanCorrectText.length) <= 2) score += 0.5;
        if (cVal && cVal.charAt(0).toLowerCase() === cleanCorrectText.charAt(0).toLowerCase()) score += 0.5;
        
        return { card: c, score: score, val: cVal };
      });
      
      // BƯỚC 3: Sắp xếp và Cắt Top 30
      scoredPool.sort((a, b) => b.score - a.score);
      const topCandidates = scoredPool.slice(0, 30);
      
      // BƯỚC 4: Xáo trộn để tạo tính ngẫu nhiên
      const shuffledCandidates = Utils && Utils.shuffleArray
        ? Utils.shuffleArray(topCandidates)
        : topCandidates;
        
      // BƯỚC 5: Trích xuất an toàn qua Trạm gác 2 Chiều
      for (let item of shuffledCandidates) {
        if (finalDistractors.length >= count) break;
        if (!item.val) continue;
        
        const cTerm = (item.card.term || "").toLowerCase().trim();
        const cDef = (item.card.definition || "").toLowerCase().trim();
        
        // NGUYÊN TẮC ĐỘC BẢN: Chém bỏ nếu trùng Term hoặc trùng Meaning
        if (textSet.has(cTerm) || meaningSet.has(cDef)) continue;
        
        textSet.add(cTerm);
        meaningSet.add(cDef);
        finalDistractors.push(item.val);
      }
    }
    
    // [BƯỚC 6: CHỐT CHẶN CỨU HỘ TĨNH - HARDCODED FALLBACK]
    if (finalDistractors.length < count) {
      let fallbackPool = [];
      if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
        const safeLang = (lang === 'en' || lang === 'zh') ? lang : 'en';
        const fbItems = FallbackDataEngine.getFallbackData(safeLang, type === 'sentence' ? 'sentence' : 'vocab', originLevel || 'en_level_1', 15);
        if (fbItems && fbItems.length > 0) {
          fallbackPool = fbItems.map(item => !isReverse ? item.definition : item.term).filter(Boolean);
        }
      }
      
      if (fallbackPool.length === 0) {
        if (lang === 'zh' && isReverse) {
          fallbackPool = ["苹果", "香蕉", "猫", "狗", "电脑", "桌子", "老师", "学生"];
        } else {
          fallbackPool = ["Apple", "Banana", "Cat", "Dog", "Computer", "Table", "Teacher", "Student"];
        }
      }
      
      fallbackPool = Utils && Utils.shuffleArray ? Utils.shuffleArray([...fallbackPool]) : fallbackPool;
      for (let fw of fallbackPool) {
        if (finalDistractors.length >= count) break;
        const fwLower = fw.toLowerCase().trim();
        const targetSet = isReverse ? textSet : meaningSet;
        if (fwLower !== cleanCorrectText.toLowerCase().trim() && !targetSet.has(fwLower)) {
          targetSet.add(fwLower);
          finalDistractors.push(fw);
        }
      }
      
      let fallbackCounter = 1;
      while (finalDistractors.length < count) {
        const generatedFallback = cleanCorrectText + " " + fallbackCounter;
        finalDistractors.push(generatedFallback);
        fallbackCounter++;
      }
    }
    
    return finalDistractors.slice(0, count);
  },

  // ============================================================================
  // 3. THUẬT TOÁN BĂM RÁC TỔNG KHO (Universal Scramble Noise)
  // ============================================================================
  offline_getNoise: function(correctText, deck, lang, type, count = 2) {
    const noise = new Set();
    const isZh = lang === 'zh';
    
    const masterPool = this._getMasterPool(lang);
    const combinedMap = new Map();
    [...deck, ...masterPool].forEach(c => {
      if (c && c.term) combinedMap.set(c.term, c);
    });
    const combinedDeck = Array.from(combinedMap.values());
    
    if (type === 'word') {
      const pool = [];
      const baseChars = Array.from(correctText.toLowerCase().replace(/\s/g, ''));
      if (isZh) {
        combinedDeck.forEach(c => {
          if (c.term && c.term !== correctText) {
            Array.from(c.term).forEach(char => pool.push(char));
          }
        });
        const fallbackZhChars = ['的','了','是','不','我','人','大','中','国','一','有','在'];
        pool.push(...fallbackZhChars);
      } else {
        const vowels = ['a','e','i','o','u'];
        const consonants = ['b','c','d','f','g','h','k','l','m','n','p','r','s','t','v','w','y'];
        pool.push(...vowels, ...vowels, ...consonants);
      }
      const shuffledPool = Utils.shuffleArray(pool);
      for (let c of shuffledPool) {
        noise.add(c.toLowerCase());
        if (noise.size >= count) break;
      }
      return Array.from(noise);
    }
    
    const baseTokens = (isZh ? Array.from(correctText) : correctText.split(' ')).map(t => this._cleanWord(t));
    const pool = [];
    combinedDeck.forEach(c => {
      if (c.term && c.term !== correctText) {
        const cTokens = isZh ? Array.from(c.term) : c.term.split(' ');
        cTokens.forEach(t => {
          const clean = this._cleanWord(t);
          if (clean && !baseTokens.includes(clean)) pool.push(clean);
        });
      }
    });
    
    const shuffledPool = Utils.shuffleArray(pool);
    for (let w of shuffledPool) {
      noise.add(w);
      if (noise.size >= count) break;
    }
    
    if (noise.size < count) {
      const fbList = isZh ? ['的', '得', '地', '了', '是'] : ['is', 'are', 'a', 'the', 'in', 'not'];
      for (let w of fbList) {
        if (!baseTokens.includes(w)) noise.add(w);
        if (noise.size >= count) break;
      }
    }
    return Array.from(noise);
  },

  // ============================================================================
  // 4. THUẬT TOÁN ĐỤC LỖ TỔNG KHO (Universal Cloze Mask)
  // ============================================================================
  offline_mask: function(text, lang, type, deck = []) {
    if (type === 'word') {
      const dists = this.offline_generateOptions(text, deck, lang, 'word', 3);
      return { targetWord: text, displaySentence: '[__________]', hint: "Từ vựng", distractors: dists };
    }
    
    const isZh = lang === 'zh';
    let targetWord = "";
    let displaySentence = "";
    
    if (isZh) {
      const chars = Array.from(text);
      if (chars.length <= 3) {
        const idx = chars.length > 1 ? 1 : 0;
        targetWord = chars[idx];
        displaySentence = chars.slice(0, idx).join('') + '[__________]' + chars.slice(idx + 1).join('');
      } else {
        const start = Math.floor(Math.random() * (chars.length - 2)) + 1;
        let k = Math.floor(Math.random() * 2) + 1;
        if (start + k > chars.length - 1) k = 1;
        targetWord = chars.slice(start, start + k).join('');
        displaySentence = chars.slice(0, start).join('') + '[__________]' + chars.slice(start + k).join('');
      }
    } else {
      const words = text.split(/[\s]+/);
      if (words.length <= 3) {
        const idx = words.length > 1 ? 1 : 0;
        targetWord = words[idx];
        displaySentence = words.slice(0, idx).join(' ') + (idx > 0 ? ' ' : '') + '[__________]' + (idx < words.length - 1 ? ' ' : '') + words.slice(idx + 1).join(' ');
      } else {
        const start = Math.floor(Math.random() * (words.length - 2)) + 1;
        let k = Math.floor(Math.random() * 2) + 1;
        if (start + k > words.length - 1) k = 1;
        targetWord = words.slice(start, start + k).join(' ');
        displaySentence = words.slice(0, start).join(' ') + ' [__________] ' + words.slice(start + k).join(' ');
      }
    }
    targetWord = targetWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    
    let distractorSet = new Set();
    const targetLen = isZh ? Array.from(targetWord).length : targetWord.length;
    const cleanToken = (t) => t ? t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim() : '';
    
    const masterPool = this._getMasterPool(lang);
    const combinedMap = new Map();
    [...deck, ...masterPool].forEach(c => {
      if (c && c.term) combinedMap.set(c.term, c);
    });
    const combinedDeck = Array.from(combinedMap.values());
    const shuffledDeck = Utils && Utils.shuffleArray ? Utils.shuffleArray(combinedDeck) : combinedDeck;
    
    for (const card of shuffledDeck) {
      if (distractorSet.size >= 3) break;
      if (card.term && card.term !== text) {
        if (isZh) {
          const chars = Array.from(card.term);
          for (let i = 0; i <= chars.length - targetLen; i++) {
            let chunk = chars.slice(i, i + targetLen).join('');
            chunk = cleanToken(chunk);
            if (chunk && Array.from(chunk).length === targetLen && chunk !== targetWord) {
              distractorSet.add(chunk);
            }
          }
        } else {
          const words = card.term.split(/[\s]+/);
          for (const w of words) {
            const cw = cleanToken(w);
            if (cw && cw !== targetWord && Math.abs(cw.length - targetLen) <= 2) {
              distractorSet.add(cw);
            }
          }
        }
      }
    }
    
    if (distractorSet.size < 3) {
      const fbZh = ['怎么', '什么', '那个', '这个', '很多', '一点', '非常', '比较', '知道', '觉得'];
      const fbEn = ['other', 'different', 'another', 'some', 'many', 'much', 'very', 'really', 'that', 'this'];
      let fbPool = isZh ? fbZh : fbEn;
      fbPool = Utils && Utils.shuffleArray ? Utils.shuffleArray([...fbPool]) : fbPool;
      for (const fw of fbPool) {
        if (distractorSet.size >= 3) break;
        let adjustedFw = fw;
        if (isZh && Array.from(fw).length > targetLen) {
          adjustedFw = Array.from(fw).slice(0, targetLen).join('');
        }
        if (adjustedFw && adjustedFw !== targetWord) distractorSet.add(adjustedFw);
      }
    }
    
    let fallbackCounter = 1;
    while (distractorSet.size < 3) {
      distractorSet.add(targetWord + fallbackCounter);
      fallbackCounter++;
    }
    const distractors = Array.from(distractorSet).slice(0, 3);
    
    return {
      targetWord: targetWord,
      displaySentence: displaySentence.trim(),
      hint: "Điền từ còn thiếu",
      distractors: distractors
    };
  },

  // ============================================================================
  // 5. THUẬT TOÁN TỪ KHÁC LOẠI TỔNG KHO (Universal Odd One Out)
  // ============================================================================
  offline_generateOddOneOut: function(deck, lang) {
    const masterPool = this._getMasterPool(lang);
    const combinedMap = new Map();
    [...deck, ...masterPool].forEach(c => {
      if (c && c.term && !Utils.detectSentence(c.term)) {
        combinedMap.set(c.term, c);
      }
    });
    
    const validCards = Array.from(combinedMap.values());
    
    if (validCards.length >= 4) {
      const posMap = {};
      validCards.forEach(c => {
        let pos = (c.partOfSpeech || "").toLowerCase().trim();
        if (pos.includes('danh từ') || pos === 'n' || pos.includes('noun')) pos = 'noun';
        else if (pos.includes('động từ') || pos === 'v' || pos.includes('verb')) pos = 'verb';
        else if (pos.includes('tính từ') || pos === 'adj' || pos.includes('adjective')) pos = 'adj';
        else if (pos.includes('trạng từ') || pos === 'adv' || pos.includes('adverb')) pos = 'adv';
        
        if (pos) {
          if (!posMap[pos]) posMap[pos] = [];
          posMap[pos].push(c);
        }
      });
      
      let majorCat = null;
      let minorCat = null;
      const keys = Object.keys(posMap);
      
      for (let i = 0; i < keys.length; i++) {
        if (posMap[keys[i]].length >= 3) {
          majorCat = keys[i];
          for (let j = 0; j < keys.length; j++) {
            if (i !== j && posMap[keys[j]].length >= 1) {
              minorCat = keys[j];
              break;
            }
          }
          if (minorCat) break;
        }
      }
      
      if (majorCat && minorCat) {
        const majorCards = Utils.shuffleArray([...posMap[majorCat]]).slice(0, 3);
        const minorCard = Utils.shuffleArray([...posMap[minorCat]])[0];
        const wordsObj = [...majorCards, minorCard];
        const shuffledWordsObj = Utils.shuffleArray(wordsObj);
        
        return {
          words: shuffledWordsObj.map(c => c.term),
          oddWord: minorCard.term,
          explanation: "Từ " + minorCard.term + " là " + (minorCard.partOfSpeech || minorCat) + ", trong khi các từ còn lại là " + (majorCards[0].partOfSpeech || majorCat) + ".",
          originCards: shuffledWordsObj
        };
      }
    }
    
    let fb = null;
    if (FallbackDataEngine && FallbackDataEngine.getFallbackData) {
      const safeLang = (lang === 'en' || lang === 'zh') ? lang : 'en';
      const fbItems = FallbackDataEngine.getFallbackData(safeLang, 'vocab', 'en_level_1', 4);
      if (fbItems && fbItems.length === 4) {
        fb = {
          words: Utils.shuffleArray ? Utils.shuffleArray(fbItems.map(c => c.term)) : fbItems.map(c => c.term),
          oddWord: fbItems[0].term,
          explanation: "Từ khác loại (Dữ liệu dự phòng Offline).",
          isFallback: true
        };
      }
    }
    
    if (!fb) {
      fb = { words: ["apple", "banana", "orange", "cat"], oddWord: "cat", explanation: "Cat là động vật (Fallback cứng).", isFallback: true };
    }
    return fb;
  }
};

// ============================================================================
// TRẠM ĐỊNH TUYẾN (FACADE PATTERN) - TƯƠNG THÍCH NGƯỢC 100% VỚI 9 MINI-GAMES
// ============================================================================
export const GameAlgoEngine = {
  _cleanWord: (word) => GameOfflineEngine._cleanWord(word),
  _getLevelContext: (level) => GameAiEngine && GameAiEngine._getLevelContext ? GameAiEngine._getLevelContext(level) : "",
  GrammarRouter: {
    getMicroPrompt: (...args) => GameOfflineEngine.offline_getGrammarMicroPrompt(...args)
  },
  DistortionEngine: {
    offline_distort: (...args) => GameOfflineEngine.offline_distort(...args),
    ai_distort: (...args) => GameAiEngine.ai_distort(...args)
  },
  OptionsEngine: {
    offline_generateOptions: (correctText, deck, lang, type, count = 3, isReverse = false, isHard = false) => {
      const safeIsHard = isReverse ? isHard : false;
      return GameOfflineEngine.offline_generateOptions(correctText, deck, lang, type, count, isReverse, safeIsHard);
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