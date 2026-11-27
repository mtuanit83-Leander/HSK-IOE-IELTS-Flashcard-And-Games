// ============================================================================
// FILE 23/85: src/engines/exam/examMemory.js
// NGUỒN GỐC: Tầng 2 - Block 2.7a (Exam Memory, Anti-Duplicate & Sanitizer)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 22:48 (GMT+7)
// NHIỆM VỤ: Quản lý bộ nhớ chống lặp (Hybrid RAM + Volatile Memory), trích xuất
//           khóa kiểm tra và kiểm duyệt cấu trúc dữ liệu AI cho Phòng thi
//           Khảo thí & 10 Mini-Games.
//           Nâng cấp Ver 1.0 (Giai đoạn 5 - Lượt 5.1 - Diệt 3M Radar & 0 tsc):
//           1. Diệt 3/3 MEDIUM Radar (2x R06B, 1x R05): Gỡ sạch
//              window.Utils?.AiMemoryManager; chuyển fallback fc_ai_memory sang
//              safeJsonParse + safeLocalStorageSet từ helpers.js.
//           2. Diệt S11 (Tách đôi RAM): clearVolatileMemory xóa rỗng mảng tại
//              chỗ (length = 0) & _isDuplicate hợp nhất cả this và ExamMemory,
//              không làm mất đồng bộ sau spread {...ExamMemory} ở ExamEngine.
//           3. Diệt E1 & S13: Chuẩn hóa Unicode NFC, lọc dấu câu Latin + CJK,
//              khớp lỗ trống /\[_{2,}\]/g và nhận diện câu Tiếng Trung (CJK)
//              tránh báo trùng oan khi chạy Fuzzy Match 85%.
//           4. Diệt E2 & S12: Phân nhánh bảo vệ tổ kén reading_passage, yêu cầu
//              >= 3 phương án không rỗng và đúng 1 đáp án đúng (correctCount=1).
// ============================================================================

import {
  calculateSimilarity,
  safeJsonParse,
  safeLocalStorageSet
} from '../../utils/helpers.js';
import { AiMemoryManager } from '../../utils/memoryManager.js';

// ============================================================================
// HẰNG SỐ & HÀM TIỆN ÍCH CHUẨN HÓA NỘI BỘ (NFC, CJK, REGEX)
// ============================================================================

const CJK_REGEX = /[\u4e00-\u9fff]/;
const VI_DIACRITIC_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const PUNCTUATION_STRIP_REGEX = /[.,?!;:'"“”‘’。，？！；：、（）()【】《》]/g;
const BLANK_TOKEN_REGEX = /\[_{2,}\]/g;
const ASCII_WORD_REGEX = /^[\x00-\x7F]+$/;

/**
 * Chuẩn hóa chuỗi Unicode NFC, loại bỏ dấu câu Latin/CJK và khoảng trắng thừa.
 * @param {any} raw
 * @returns {string}
 */
const normalizeMemoryText = (raw) => {
  if (typeof raw !== 'string') return '';
  let text = raw;
  try {
    text = text.normalize('NFC');
  } catch {
    // Giữ nguyên chuỗi nếu môi trường không hỗ trợ NFC
  }
  return text
    .toLowerCase()
    .replace(BLANK_TOKEN_REGEX, ' ')
    .replace(PUNCTUATION_STRIP_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Phân loại chuỗi đã chuẩn hóa là Câu/Đoạn văn (hỗ trợ cả Latin lẫn CJK).
 * @param {string} cleanText
 * @returns {boolean}
 */
const isSentenceLike = (cleanText) => {
  if (!cleanText) return false;
  return (
    cleanText.includes(' ') ||
    (CJK_REGEX.test(cleanText) && cleanText.length >= 6)
  );
};

/**
 * Escape ký tự đặc biệt trước khi tạo RegExp.
 * @param {string} str
 * @returns {string}
 */
const escapeRegExp = (str) =>
  String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Kiểm tra cờ đáp án đúng (hỗ trợ boolean và chuỗi 'true').
 * @param {any} opt
 * @returns {boolean}
 */
const isOptionMarkedCorrect = (opt) => {
  if (!opt || typeof opt !== 'object') return false;
  return (
    opt.isCorrect === true ||
    String(opt.isCorrect || '').trim().toLowerCase() === 'true'
  );
};

// ============================================================================
// ĐỘNG CƠ BỘ NHỚ & KIỂM DUYỆT KHẢO THÍ (EXAM MEMORY)
// ============================================================================

export const ExamMemory = {
  // Bộ nhớ tạm để khóa các cuộc gọi AI trùng lặp cho cùng 1 Tổ kén (Passage Group)
  /** @type {Record<string, any>} */
  _passageLocks: {},

  // Bộ nhớ RAM siêu tốc: Đồng bộ hóa ngay lập tức các từ vừa được AI sinh ra trong cùng 1 Batch/Sliding Window
  /** @type {string[]} */
  _volatileMemory: [],

  /**
   * Công tắc dọn dẹp RAM cho Tầng 6 (Khi chuyển Phase hoặc kết thúc bài thi).
   * Làm rỗng mảng tại chỗ (length = 0) để giữ nguyên đồng bộ tham chiếu với ExamEngine.
   */
  clearVolatileMemory: function () {
    if (Array.isArray(this._volatileMemory)) {
      this._volatileMemory.length = 0;
    } else {
      this._volatileMemory = [];
    }

    if (Array.isArray(ExamMemory._volatileMemory)) {
      ExamMemory._volatileMemory.length = 0;
    } else {
      ExamMemory._volatileMemory = [];
    }

    console.log('[ExamEngine] Volatile memory cleared for new phase.');
  },

  // ============================================================================
  // [INTERNAL UTILS] CÁC HÀM TIỆN ÍCH NỘI BỘ (LƯU TRỮ VÀ LỌC)
  // ============================================================================

  /**
   * Đồng bộ từ/câu vừa sinh vào Hybrid Memory Buffer (RAM) & Volatile Memory.
   * @param {Record<string, any> | null | undefined} content
   * @param {string} [type]
   */
  _syncMemory: function (content, type) {
    if (!content || typeof content !== 'object') return;

    let termToSave = '';
    const safeType = String(type || '').toLowerCase();

    if (safeType.includes('spot_mistake')) {
      termToSave = String(content.wrongSentence || '');
    } else if (safeType.includes('fill_blank')) {
      termToSave = String(content.targetWord || '');
    } else if (safeType.includes('multiple_choice') && content.term) {
      termToSave = String(content.term).replace(BLANK_TOKEN_REGEX, '');
    } else if (safeType.includes('odd_one_out') && Array.isArray(content.words)) {
      termToSave = content.words.map((w) => String(w || '').trim()).join(' ');
    } else if (safeType.includes('listening')) {
      termToSave = String(content.audioScript || '');
    } else if (safeType.includes('reading')) {
      termToSave = String(content.passage || '');
    } else {
      termToSave = String(content.term || '');
    }

    const cleanTerm = normalizeMemoryText(termToSave);
    if (!cleanTerm) return;

    // 1. Lưu vào Hybrid Memory Buffer (RAM) qua ES Module chuẩn (0x R06B, 0x R05)
    if (AiMemoryManager && typeof AiMemoryManager.add === 'function') {
      AiMemoryManager.add(cleanTerm);
    } else {
      const rawSaved =
        typeof safeJsonParse === 'function'
          ? safeJsonParse('fc_ai_memory', [])
          : [];
      /** @type {string[]} */
      const currentMemory = Array.isArray(rawSaved) ? [...rawSaved] : [];
      if (!currentMemory.includes(cleanTerm)) {
        currentMemory.push(cleanTerm);
        while (currentMemory.length > 400) {
          currentMemory.shift();
        }
        if (typeof safeLocalStorageSet === 'function') {
          safeLocalStorageSet('fc_ai_memory', currentMemory);
        }
      }
    }

    // 2. Lưu ngay lập tức vào Volatile Memory để chống lặp song song (đồng bộ cả this & ExamMemory)
    if (!Array.isArray(this._volatileMemory)) {
      this._volatileMemory = [];
    }
    if (!this._volatileMemory.includes(cleanTerm)) {
      this._volatileMemory.push(cleanTerm);
      if (this._volatileMemory.length > 50) {
        this._volatileMemory.shift();
      }
    }

    if (this !== ExamMemory) {
      if (!Array.isArray(ExamMemory._volatileMemory)) {
        ExamMemory._volatileMemory = [];
      }
      if (ExamMemory._volatileMemory !== this._volatileMemory) {
        if (!ExamMemory._volatileMemory.includes(cleanTerm)) {
          ExamMemory._volatileMemory.push(cleanTerm);
          if (ExamMemory._volatileMemory.length > 50) {
            ExamMemory._volatileMemory.shift();
          }
        }
      }
    }
  },

  /**
   * Trích xuất danh sách khóa cần kiểm tra trùng lặp từ dữ liệu câu hỏi.
   * @param {Record<string, any> | null | undefined} data
   * @param {string} [type]
   * @returns {string[]}
   */
  _extractTermsToCheck: function (data, type) {
    /** @type {string[]} */
    const terms = [];
    if (!data || typeof data !== 'object') return terms;

    const safeType = String(type || '').toLowerCase();

    if (safeType.includes('spot_mistake')) {
      if (typeof data.wrongSentence === 'string') terms.push(data.wrongSentence);
    } else if (safeType.includes('fill_blank')) {
      if (typeof data.targetWord === 'string') terms.push(data.targetWord);
    } else if (safeType.includes('multiple_choice') && typeof data.term === 'string') {
      terms.push(data.term.replace(BLANK_TOKEN_REGEX, ''));
    } else if (safeType.includes('odd_one_out') && Array.isArray(data.words)) {
      data.words.forEach((w) => {
        if (typeof w === 'string' && w.trim()) terms.push(w);
      });
    } else if (safeType.includes('pronunciation') && Array.isArray(data.options)) {
      // [NO-MARKING] Giữ nguyên văn bản thô từ các phương án
      data.options.forEach((o) => {
        if (o && typeof o.text === 'string' && o.text.trim()) {
          terms.push(o.text);
        }
      });
    } else if (safeType.includes('listening') && typeof data.audioScript === 'string') {
      terms.push(data.audioScript);
    } else if (safeType.includes('reading') && typeof data.passage === 'string') {
      terms.push(data.passage);
    } else if (typeof data.term === 'string') {
      terms.push(data.term);
    }

    return terms;
  },

  /**
   * Kiểm tra trùng lặp thông minh (hỗ trợ cả Latin & CJK, chuẩn Unicode NFC).
   * @param {string[]} termsToCheck
   * @param {string[]} [history]
   * @returns {boolean}
   */
  _isDuplicate: function (termsToCheck, history) {
    if (!Array.isArray(termsToCheck) || termsToCheck.length === 0) return false;

    const localVolatile = Array.isArray(this._volatileMemory)
      ? this._volatileMemory
      : [];
    const sharedVolatile =
      Array.isArray(ExamMemory._volatileMemory) &&
      ExamMemory._volatileMemory !== localVolatile
        ? ExamMemory._volatileMemory
        : [];
    const safeHistory = Array.isArray(history) ? history : [];

    // Cắt giảm tầm nhìn xuống 40 mục gần nhất để tối ưu hiệu năng
    const combinedHistory = [
      ...safeHistory,
      ...localVolatile,
      ...sharedVolatile
    ].slice(-40);
    if (combinedHistory.length === 0) return false;

    for (let i = 0; i < termsToCheck.length; i += 1) {
      const cleanCheck = normalizeMemoryText(termsToCheck[i]);
      if (!cleanCheck) continue;

      const isCheckSentence = isSentenceLike(cleanCheck);
      const isCheckAscii = ASCII_WORD_REGEX.test(cleanCheck);

      const hasMatch = combinedHistory.some((histItem) => {
        const cleanHist = normalizeMemoryText(histItem);
        if (!cleanHist) return false;
        const isHistSentence = isSentenceLike(cleanHist);

        if (cleanHist === cleanCheck) return true;

        // Tắt hoàn toàn Fuzzy Match cho Câu Văn/Đoạn Văn (cả Latin & CJK). Ngưỡng từ vựng: 85%.
        if (
          !isCheckSentence &&
          !isHistSentence &&
          cleanCheck.length > 4 &&
          typeof calculateSimilarity === 'function'
        ) {
          const simScore = calculateSimilarity(cleanCheck, cleanHist);
          if (simScore >= 0.85) {
            console.log(
              '[ExamEngine] Lưới lọc 85% phát hiện trùng lặp từ vựng:',
              cleanCheck
            );
            return true;
          }
        }

        if (
          isCheckSentence &&
          isHistSentence &&
          cleanHist.length > 20 &&
          cleanCheck.length > 20
        ) {
          return (
            cleanHist.includes(cleanCheck) || cleanCheck.includes(cleanHist)
          );
        }

        // Chỉ áp dụng word-boundary \b cho từ đơn thuần ASCII để tránh sai lệch với CJK
        try {
          if (
            !isCheckSentence &&
            isHistSentence &&
            isCheckAscii &&
            cleanCheck.length > 2
          ) {
            const regex = new RegExp(`\\b${escapeRegExp(cleanCheck)}\\b`, 'i');
            return regex.test(cleanHist);
          }
          if (
            isCheckSentence &&
            !isHistSentence &&
            ASCII_WORD_REGEX.test(cleanHist) &&
            cleanHist.length > 2
          ) {
            const regex = new RegExp(`\\b${escapeRegExp(cleanHist)}\\b`, 'i');
            return regex.test(cleanCheck);
          }
        } catch {
          // Bỏ qua lỗi RegExp bất thường
        }

        if (
          !isCheckSentence &&
          !isHistSentence &&
          cleanHist.length > 5 &&
          cleanCheck.length > 5
        ) {
          return (
            cleanHist.includes(cleanCheck) || cleanCheck.includes(cleanHist)
          );
        }

        return false;
      });

      if (hasMatch) return true;
    }

    return false;
  },

  /**
   * Lưới lọc thép kiểm duyệt cấu trúc & ngôn ngữ cho câu hỏi AI sinh ra.
   * @param {Record<string, any> | null | undefined} parsedData
   * @param {string} [expectedType]
   * @param {string} [track]
   * @param {any} [_level]
   * @returns {boolean}
   */
  _sanitizeAiItem: function (parsedData, expectedType, track, _level) {
    if (!parsedData || typeof parsedData !== 'object') return false;

    const safeType = String(expectedType || '').toLowerCase();
    const safeTrack = String(track || '').toLowerCase().trim();

    // 0. Phân nhánh riêng cho Tổ kén Đọc Hiểu (Reading Cocoon: { passage, questions })
    const isReadingCocoon =
      safeType.includes('reading') &&
      typeof parsedData.passage === 'string' &&
      Array.isArray(parsedData.questions);

    if (isReadingCocoon) {
      if (!parsedData.passage.trim() || parsedData.questions.length === 0) {
        console.warn('[Sanitizer] Blocked: Reading cocoon is empty.');
        return false;
      }
      const hasValidChild = parsedData.questions.some(
        (q) =>
          q &&
          typeof q === 'object' &&
          String(q.questionText || '').trim().length > 0 &&
          String(q.correctAnswer || '').trim().length > 0
      );
      if (!hasValidChild) {
        console.warn(
          '[Sanitizer] Blocked: Reading cocoon has no valid child questions.'
        );
        return false;
      }
      return true;
    }

    // Gom nhóm các dạng bài sử dụng Options
    const isOptionsType =
      safeType.includes('multiple_choice') ||
      safeType.includes('match') ||
      safeType.includes('listening') ||
      safeType.includes('image_quiz') ||
      safeType.includes('pronunciation') ||
      safeType.includes('reading') ||
      safeType === 'quiz';

    // 1. Lọc Tiếng Việt lọt vào câu gốc của đề Tiếng Anh (bảo vệ không chặn nhầm chữ Hán)
    if (safeTrack !== 'hsk') {
      const hasViLeak = (val) => {
        const text = String(val || '');
        if (!text || CJK_REGEX.test(text)) return false;
        return VI_DIACRITIC_REGEX.test(text);
      };

      if (safeType.includes('spot_mistake') && hasViLeak(parsedData.wrongSentence)) {
        return false;
      }
      if (safeType.includes('fill_blank') && hasViLeak(parsedData.displaySentence)) {
        return false;
      }
      if (
        safeType.includes('odd_one_out') &&
        Array.isArray(parsedData.words) &&
        parsedData.words.some((w) => hasViLeak(w))
      ) {
        return false;
      }
      if (
        (safeType.includes('multiple_choice') || safeType.includes('match')) &&
        hasViLeak(parsedData.term)
      ) {
        return false;
      }
    }

    // 2. Lưới lọc thép Cấu trúc (Structural Integrity)
    if (isOptionsType && !safeType.includes('match')) {
      if (!Array.isArray(parsedData.options) || parsedData.options.length < 3) {
        console.warn(
          '[Sanitizer] Blocked: Options array is missing or too short.'
        );
        return false;
      }

      const validOptions = parsedData.options.filter(
        (opt) => opt && typeof opt === 'object' && String(opt.text || '').trim().length > 0
      );
      if (validOptions.length < 3) {
        console.warn(
          '[Sanitizer] Blocked: Options array contains empty option texts.'
        );
        return false;
      }

      // Yêu cầu có DUY NHẤT 1 đáp án đúng (chặn cả 0 đáp án đúng lẫn >= 2 đáp án đúng)
      const correctCount = validOptions.filter((opt) =>
        isOptionMarkedCorrect(opt)
      ).length;
      if (correctCount !== 1) {
        console.warn(
          '[Sanitizer] Blocked: Expected exactly 1 correct option, got:',
          correctCount
        );
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