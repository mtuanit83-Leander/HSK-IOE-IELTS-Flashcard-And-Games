/**
 * @file src/engines/exam/examMemory.js
 * @description Quản lý bộ nhớ tạm (Volatile RAM) và lưới lọc sư phạm (Sanitizer) cho Máy trộn đề ExamEngine.
 * @origin Tầng 2 - Block 2.7a (Exam Memory & QA Guards)
 */

import { Utils } from '@/utils/helpers';

export const ExamMemory = {
  // Bộ nhớ tạm để khóa các cuộc gọi AI trùng lặp cho cùng 1 Tổ kén (Passage Group)
  _passageLocks: {},

  // Bộ nhớ RAM siêu tốc: Đồng bộ hóa ngay lập tức các từ vừa được AI sinh ra trong cùng 1 Batch/Sliding Window.
  _volatileMemory: [],

  // Công tắc dọn dẹp RAM cho Tầng 6 (Chuyển Phase)
  clearVolatileMemory: function() {
    this._volatileMemory = [];
    console.log("[ExamMemory] Volatile memory cleared for new phase.");
  },

  // ============================================================================
  // [INTERNAL UTILS] CÁC HÀM TIỆN ÍCH NỘI BỘ (LƯU TRỮ VÀ LỌC)
  // ============================================================================
  _syncMemory: function(content, type) {
    if (!content) return;
    
    let termToSave = "";
    if (type.includes('spot_mistake')) termToSave = content.wrongSentence;
    else if (type.includes('fill_blank')) termToSave = content.targetWord;
    else if (type.includes('multiple_choice') && content.term) termToSave = content.term.replace(/\[__________\]/g, "");
    else if (type.includes('odd_one_out') && Array.isArray(content.words)) termToSave = content.words.join(' ');
    else if (type.includes('listening')) termToSave = content.audioScript;
    else if (type.includes('reading')) termToSave = content.passage;
    else termToSave = content.term;
    
    if (termToSave && typeof termToSave === 'string') {
      const cleanTerm = termToSave.toLowerCase().replace(/[.,?!;:'"“”]/g, "").trim();
      if (cleanTerm) {
        // 1. Lưu vào Hybrid Memory Buffer (RAM) thay vì ép I/O ổ cứng
        if (Utils && Utils.AiMemoryManager) {
          Utils.AiMemoryManager.add(cleanTerm);
        } else {
          // Fallback an toàn nếu chưa nạp kịp Utils
          let currentMemory = [];
          try { currentMemory = JSON.parse(localStorage.getItem('fc_ai_memory') || '[]'); } catch(e) {}
          if (!currentMemory.includes(cleanTerm)) {
            currentMemory.push(cleanTerm);
            while (currentMemory.length > 400) currentMemory.shift();
            try { localStorage.setItem('fc_ai_memory', JSON.stringify(currentMemory)); } catch(e) {}
          }
        }
        
        // 2. Lưu ngay lập tức vào Volatile Memory để chống lặp song song (Safety Fallback)
        if (!this._volatileMemory) this._volatileMemory = [];
        if (!this._volatileMemory.includes(cleanTerm)) {
          this._volatileMemory.push(cleanTerm);
          if (this._volatileMemory.length > 50) this._volatileMemory.shift();
        }
      }
    }
  },

  _extractTermsToCheck: function(data, type) {
    let terms = [];
    if (!data) return terms;
    
    if (type.includes('spot_mistake')) terms.push(data.wrongSentence);
    else if (type.includes('fill_blank')) terms.push(data.targetWord);
    else if (type.includes('multiple_choice') && data.term) terms.push(data.term.replace(/\[__________\]/g, ""));
    else if (type.includes('odd_one_out') && Array.isArray(data.words)) terms.push(...data.words);
    else if (type.includes('pronunciation') && Array.isArray(data.options)) {
      // [NO-MARKING] Xóa lệnh lọc dấu sao, giữ nguyên văn bản thô
      data.options.forEach(o => terms.push(o.text));
    } else if (type.includes('listening') && data.audioScript) {
      terms.push(data.audioScript);
    } else if (type.includes('reading') && data.passage) {
      terms.push(data.passage);
    } else {
      terms.push(data.term);
    }
    
    return terms;
  },

  _isDuplicate: function(termsToCheck, history) {
    const volatile = this._volatileMemory || [];
    // Cắt giảm tầm nhìn xuống 40 để bớt khắt khe và giảm chi phí
    const combinedHistory = [...(history || []), ...volatile].slice(-40);
    
    if (combinedHistory.length === 0) return false;
    
    for (const t of termsToCheck) {
      if (!t || typeof t !== 'string') continue;
      const cleanCheck = t.toLowerCase().replace(/[.,?!;:'"“”]/g, "").trim();
      if (!cleanCheck) continue;
      
      const isCheckSentence = cleanCheck.includes(' ');
      
      const hasMatch = combinedHistory.some(histItem => {
        if (!histItem || typeof histItem !== 'string') return false;
        const cleanHist = histItem.toLowerCase().replace(/[.,?!;:'"“”]/g, "").trim();
        const isHistSentence = cleanHist.includes(' ');
        
        if (cleanHist === cleanCheck) return true;
        
        // TẮT HOÀN TOÀN Fuzzy Match cho Câu Văn/Đoạn Văn. Nâng ngưỡng từ vựng lên 85%.
        if (!isCheckSentence && !isHistSentence && cleanCheck.length > 4 && Utils && Utils.calculateSimilarity) {
          const simScore = Utils.calculateSimilarity(cleanCheck, cleanHist);
          if (simScore >= 0.85) {
            console.log(`[ExamMemory] Lưới lọc 85% phát hiện trùng lặp từ vựng:`, cleanCheck);
            return true;
          }
        }
        
        if (isCheckSentence && isHistSentence && cleanHist.length > 20 && cleanCheck.length > 20) {
          return cleanHist.includes(cleanCheck) || cleanCheck.includes(cleanHist);
        }
        
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          if (!isCheckSentence && isHistSentence && cleanCheck.length > 2) {
            const regex = new RegExp(`\\b${escapeRegExp(cleanCheck)}\\b`, 'i');
            return regex.test(cleanHist);
          }
          if (isCheckSentence && !isHistSentence && cleanHist.length > 2) {
            const regex = new RegExp(`\\b${escapeRegExp(cleanHist)}\\b`, 'i');
            return regex.test(cleanCheck);
          }
        } catch (e) {}
        
        if (!isCheckSentence && !isHistSentence && cleanHist.length > 5 && cleanCheck.length > 5) {
          return cleanHist.includes(cleanCheck) || cleanCheck.includes(cleanHist);
        }
        return false;
      });
      
      if (hasMatch) return true;
    }
    
    return false;
  },

  _sanitizeAiItem: function(parsedData, expectedType, track, level) {
    if (!parsedData) return false;
    
    // Gom nhóm các dạng bài sử dụng Options
    const isOptionsType = expectedType.includes('multiple_choice') || expectedType.includes('match') || expectedType.includes('listening') || expectedType.includes('image_quiz') || expectedType.includes('pronunciation') || expectedType.includes('reading') || expectedType === 'quiz';
    
    // 1. Lọc Tiếng Việt lọt vào đề Tiếng Anh
    if (track !== 'hsk') {
      const viChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúúúụủũưừứựửữỳýỵỷỹđ]/i;
      if (expectedType.includes('spot_mistake') && viChars.test(parsedData.wrongSentence || '')) return false;
      if (expectedType.includes('fill_blank') && viChars.test(parsedData.displaySentence || '')) return false;
      if (expectedType.includes('odd_one_out') && Array.isArray(parsedData.words) && parsedData.words.some(w => viChars.test(w || ''))) return false;
      if ((expectedType.includes('multiple_choice') || expectedType.includes('match')) && viChars.test(parsedData.term || '')) return false;
    }
    
    // 2. Lọc độ dài đáp án (Ám sát sư phạm) - ĐÃ BỊ LOẠI BỎ (Version 2.1)
    // Theo chỉ thị "Tự do hóa AI", gỡ bỏ hoàn toàn giới hạn maxWords = 12 ở cấp độ Basic.
    // Cho phép AI tự do sáng tác các câu giải nghĩa dài.
    
    // 3. Lưới lọc thép Cấu trúc (Structural Integrity)
    if (isOptionsType && !expectedType.includes('match')) {
      // Cấm mảng options bị rỗng hoặc thiếu
      if (!parsedData.options || !Array.isArray(parsedData.options) || parsedData.options.length < 3) {
        console.warn("[Sanitizer] Blocked: Options array is missing or too short.");
        return false;
      }
      
      // Cấm tình trạng toàn bộ options đều sai (Không có đáp án đúng)
      const hasCorrect = parsedData.options.some(opt => opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true');
      if (!hasCorrect) {
        console.warn("[Sanitizer] Blocked: No correct option provided by AI.");
        return false;
      }
    }
    
    return true; // Dữ liệu sạch
  }
};