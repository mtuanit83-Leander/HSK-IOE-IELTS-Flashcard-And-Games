import { calculateSimilarity } from '../../utils/helpers.js';
import { AiMemoryManager } from '../../utils/memoryManager.js';

export const ExamMemory = {
  // Bộ nhớ tạm để khóa các cuộc gọi AI trùng lặp cho cùng 1 Tổ kén (Passage Group)
  _passageLocks: {},

  // Bộ nhớ RAM siêu tốc: Đồng bộ hóa ngay lập tức các từ vừa được AI sinh ra trong cùng 1 Batch/Sliding Window
  _volatileMemory: [],

  // Công tắc dọn dẹp RAM cho Tầng 6 (Khi chuyển Phase hoặc kết thúc bài thi)
  clearVolatileMemory: function () {
    this._volatileMemory = [];
    ExamMemory._volatileMemory = [];
    console.log('[ExamEngine] Volatile memory cleared for new phase.');
  },

  // ============================================================================
  // [INTERNAL UTILS] CÁC HÀM TIỆN ÍCH NỘI BỘ (LƯU TRỮ VÀ LỌC)
  // ============================================================================
  _syncMemory: function (content, type) {
    if (!content) return;

    let termToSave = '';
    const safeType = String(type || '').toLowerCase();

    if (safeType.includes('spot_mistake')) termToSave = content.wrongSentence;
    else if (safeType.includes('fill_blank')) termToSave = content.targetWord;
    else if (safeType.includes('multiple_choice') && content.term) {
      termToSave = content.term.replace(/\[__________\]/g, '');
    } else if (safeType.includes('odd_one_out') && Array.isArray(content.words)) {
      termToSave = content.words.join(' ');
    } else if (safeType.includes('listening')) termToSave = content.audioScript;
    else if (safeType.includes('reading')) termToSave = content.passage;
    else termToSave = content.term;

    if (termToSave && typeof termToSave === 'string') {
      const cleanTerm = termToSave.toLowerCase().replace(/[.,?!;:'"“”]/g, '').trim();
      if (cleanTerm) {
        // 1. Lưu vào Hybrid Memory Buffer (RAM) thay vì ép I/O ổ cứng trực tiếp
        if (AiMemoryManager && typeof AiMemoryManager.add === 'function') {
          AiMemoryManager.add(cleanTerm);
        } else if (typeof window !== 'undefined' && window.Utils?.AiMemoryManager) {
          window.Utils.AiMemoryManager.add(cleanTerm);
        } else {
          let currentMemory = [];
          try {
            currentMemory = JSON.parse(localStorage.getItem('fc_ai_memory') || '[]');
          } catch (e) {}
          if (!currentMemory.includes(cleanTerm)) {
            currentMemory.push(cleanTerm);
            while (currentMemory.length > 400) currentMemory.shift();
            try {
              localStorage.setItem('fc_ai_memory', JSON.stringify(currentMemory));
            } catch (e) {}
          }
        }

        // 2. Lưu ngay lập tức vào Volatile Memory để chống lặp song song (Safety Fallback)
        if (!this._volatileMemory) this._volatileMemory = [];
        if (!this._volatileMemory.includes(cleanTerm)) {
          this._volatileMemory.push(cleanTerm);
          if (this._volatileMemory.length > 50) this._volatileMemory.shift();
        }
        if (this !== ExamMemory) {
          ExamMemory._volatileMemory = this._volatileMemory;
        }
      }
    }
  },

  _extractTermsToCheck: function (data, type) {
    const terms = [];
    if (!data) return terms;

    const safeType = String(type || '').toLowerCase();

    if (safeType.includes('spot_mistake')) terms.push(data.wrongSentence);
    else if (safeType.includes('fill_blank')) terms.push(data.targetWord);
    else if (safeType.includes('multiple_choice') && data.term) {
      terms.push(data.term.replace(/\[__________\]/g, ''));
    } else if (safeType.includes('odd_one_out') && Array.isArray(data.words)) {
      terms.push(...data.words);
    } else if (safeType.includes('pronunciation') && Array.isArray(data.options)) {
      // [NO-MARKING] Giữ nguyên văn bản thô từ các phương án
      data.options.forEach((o) => {
        if (o && o.text) terms.push(o.text);
      });
    } else if (safeType.includes('listening') && data.audioScript) {
      terms.push(data.audioScript);
    } else if (safeType.includes('reading') && data.passage) {
      terms.push(data.passage);
    } else {
      terms.push(data.term);
    }

    return terms;
  },

  _isDuplicate: function (termsToCheck, history) {
    const volatile = this._volatileMemory || ExamMemory._volatileMemory || [];
    // Cắt giảm tầm nhìn xuống 40 mục gần nhất để tối ưu hiệu năng
    const combinedHistory = [...(history || []), ...volatile].slice(-40);
    if (combinedHistory.length === 0) return false;

    for (const t of termsToCheck) {
      if (!t || typeof t !== 'string') continue;
      const cleanCheck = t.toLowerCase().replace(/[.,?!;:'"“”]/g, '').trim();
      if (!cleanCheck) continue;

      const isCheckSentence = cleanCheck.includes(' ');

      const hasMatch = combinedHistory.some((histItem) => {
        if (!histItem || typeof histItem !== 'string') return false;
        const cleanHist = histItem.toLowerCase().replace(/[.,?!;:'"“”]/g, '').trim();
        const isHistSentence = cleanHist.includes(' ');

        if (cleanHist === cleanCheck) return true;

        // Tắt hoàn toàn Fuzzy Match cho Câu Văn/Đoạn Văn. Ngưỡng từ vựng: 85%.
        if (!isCheckSentence && !isHistSentence && cleanCheck.length > 4 && typeof calculateSimilarity === 'function') {
          const simScore = calculateSimilarity(cleanCheck, cleanHist);
          if (simScore >= 0.85) {
            console.log('[ExamEngine] Lưới lọc 85% phát hiện trùng lặp từ vựng:', cleanCheck);
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

  _sanitizeAiItem: function (parsedData, expectedType, track, level) {
    if (!parsedData) return false;

    const safeType = String(expectedType || '').toLowerCase();

    // Gom nhóm các dạng bài sử dụng Options
    const isOptionsType =
      safeType.includes('multiple_choice') ||
      safeType.includes('match') ||
      safeType.includes('listening') ||
      safeType.includes('image_quiz') ||
      safeType.includes('pronunciation') ||
      safeType.includes('reading') ||
      safeType === 'quiz';

    // 1. Lọc Tiếng Việt lọt vào câu gốc của đề Tiếng Anh
    if (track !== 'hsk') {
      const viChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
      if (safeType.includes('spot_mistake') && viChars.test(parsedData.wrongSentence || '')) return false;
      if (safeType.includes('fill_blank') && viChars.test(parsedData.displaySentence || '')) return false;
      if (
        safeType.includes('odd_one_out') &&
        Array.isArray(parsedData.words) &&
        parsedData.words.some((w) => viChars.test(w || ''))
      ) {
        return false;
      }
      if ((safeType.includes('multiple_choice') || safeType.includes('match')) && viChars.test(parsedData.term || '')) {
        return false;
      }
    }

    // 2. Lưới lọc thép Cấu trúc (Structural Integrity)
    if (isOptionsType && !safeType.includes('match')) {
      // Cấm mảng options bị rỗng hoặc thiếu
      if (!parsedData.options || !Array.isArray(parsedData.options) || parsedData.options.length < 3) {
        console.warn('[Sanitizer] Blocked: Options array is missing or too short.');
        return false;
      }
      // Cấm tình trạng toàn bộ options đều sai (Không có đáp án đúng)
      const hasCorrect = parsedData.options.some(
        (opt) => opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true'
      );
      if (!hasCorrect) {
        console.warn('[Sanitizer] Blocked: No correct option provided by AI.');
        return false;
      }
    }

    return true; // Dữ liệu sạch
  }
};

export const clearVolatileMemory = ExamMemory.clearVolatileMemory.bind(ExamMemory);
export const _syncMemory = ExamMemory._syncMemory.bind(ExamMemory);
export const _extractTermsToCheck = ExamMemory._extractTermsToCheck.bind(ExamMemory);
export const _isDuplicate = ExamMemory._isDuplicate.bind(ExamMemory);
export const _sanitizeAiItem = ExamMemory._sanitizeAiItem.bind(ExamMemory);

export default ExamMemory;