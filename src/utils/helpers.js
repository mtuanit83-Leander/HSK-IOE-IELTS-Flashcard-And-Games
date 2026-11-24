// ============================================================================
// FILE 10/85: src/utils/helpers.js
// NGUỒN GỐC: tang_2.js (Block 2.1b - Core Data Utilities)
// PHIÊN BẢN: Ver 1.3
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 07:13 (GMT+7)
// NHIỆM VỤ: Cung cấp tiện ích lõi xử lý chuỗi/mảng/Pinyin/SRS/CSV/TSV/WakeLock;
//           vận hành Bộ đệm RAM Mirror 0ms cho Kho Master Data (fc_master_data_*)
//           với chốt chặn Plain Object (chống lọt Array/dữ liệu dị dạng),
//           import ES Module trực tiếp FcDB (sạch 100% cảnh báo Radar window.FcDB),
//           phân tích CSV chuẩn RFC-4180 hỗ trợ ô đa dòng, vá Pinyin ü/v 2 chiều,
//           chống SRS 0 ngày và giữ gọn cột image chống phình dung lượng.
// ============================================================================

import { CONFIG_SAMPLES } from '../config/constants.js';
import { DEFAULT_PROMPTS } from '../config/prompts.js';
import { FcDB } from '../services/db.js';

// Tiền tố nhận diện các kho Master Data kích thước lớn (9 Tabs x EN/ZH x Vocab/Sentence)
export const MASTER_DATA_KEY_PREFIX = 'fc_master_data_';

// Biến lưu trữ trạng thái giữ sáng màn hình (Screen Wake Lock)
let currentWakeLock = null;

// Bộ đệm RAM dùng chung toàn cục (tránh lệch instance khi Vite HMR hoặc import chéo alias)
const fallbackMasterCache = new Map();
const getGlobalMasterCache = () => {
  if (typeof globalThis !== 'undefined') {
    if (!(globalThis.__fcMasterDataCache instanceof Map)) {
      globalThis.__fcMasterDataCache = new Map();
    }
    return globalThis.__fcMasterDataCache;
  }
  return fallbackMasterCache;
};

// Danh sách các từ khóa rỗng/rác không được phép dùng làm URL hoặc từ khóa tìm ảnh
const GARBAGE_IMAGE_TOKENS = new Set([
  'null',
  'undefined',
  'none',
  'n/a',
  'na',
  'false',
  'true',
  'nan',
  'empty',
  'no image',
  'no_image',
  'khong co',
  'không có',
  '-'
]);

/**
 * Kiểm tra giá trị có phải Plain Object hợp lệ cho cấu trúc Kho Master Data hay không
 * (Chặn tuyệt đối Array, null, Date, Map, Set hoặc kiểu nguyên thủy)
 * @param {any} value
 * @returns {boolean}
 */
const isPlainMasterObject = (value) => {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
};

/**
 * Kiểm tra một khóa lưu trữ có thuộc nhóm Kho Master Data cỡ lớn hay không
 */
export const isMasterDataKey = (key) => {
  return typeof key === 'string' && key.startsWith(MASTER_DATA_KEY_PREFIX);
};

/**
 * Ghi dữ liệu Kho Master Data vào Bộ đệm RAM 0ms (chỉ chấp nhận Plain Object hoặc null/undefined để xóa)
 */
export const setMasterDataCache = (key, value) => {
  if (!isMasterDataKey(key)) return false;
  const cache = getGlobalMasterCache();
  if (value === null || value === undefined) {
    cache.delete(key);
    return true;
  }
  if (isPlainMasterObject(value)) {
    cache.set(key, value);
    return true;
  }
  return false;
};

/**
 * Đọc đồng bộ Kho Master Data từ Bộ đệm RAM 0ms
 */
export const getMasterDataCache = (key, fallback = null) => {
  if (!isMasterDataKey(key)) return fallback;
  const cache = getGlobalMasterCache();
  return cache.has(key) ? cache.get(key) : fallback;
};

/**
 * Kiểm tra một khóa Master Data đã được nạp vào RAM Cache hay chưa
 */
export const hasMasterDataCache = (key) => {
  if (!isMasterDataKey(key)) return false;
  return getGlobalMasterCache().has(key);
};

/**
 * Xóa một khóa cụ thể hoặc toàn bộ Bộ đệm RAM Master Data
 */
export const clearMasterDataCache = (key = null) => {
  const cache = getGlobalMasterCache();
  if (typeof key === 'string' && key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
};

/**
 * Kiểm tra một giá trị có phải là đường dẫn URL hình ảnh hợp lệ hay không
 */
export const isValidImageUrl = (val) => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (GARBAGE_IMAGE_TOKENS.has(trimmed.toLowerCase())) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('blob:')
  );
};

/**
 * Chuẩn hóa gọn nhẹ giá trị cột `image` khi lưu trữ từ Excel/Sheet/JSON:
 * - Lọc sạch chuỗi rác (null, n/a, none, -, không có...)
 * - Giữ nguyên URL hợp lệ hoặc từ khóa ngắn gọn (KHÔNG phình thành URL Bing dài khi lưu)
 * - Việc dựng URL Bing thông minh được thực hiện on-the-fly lúc hiển thị (FlashcardDisplay)
 */
export const normalizeStoredImageValue = (rawImage) => {
  if (!rawImage || typeof rawImage !== 'string') return '';
  const trimmed = rawImage.trim();
  if (!trimmed) return '';
  if (GARBAGE_IMAGE_TOKENS.has(trimmed.toLowerCase())) return '';
  return trimmed;
};

/**
 * Làm sạch cụm từ khóa tìm ảnh Tiếng Anh, loại bỏ ký tự rác và chữ Hán
 */
const sanitizeImageKeyword = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s || GARBAGE_IMAGE_TOKENS.has(s.toLowerCase())) return '';

  // Loại bỏ chữ Hán (CJK) để tránh bẫy ảnh Meme chữ Hán (表情包) trên Bing
  s = s.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ');

  // Loại bỏ dấu ngoặc, ký tự đặc biệt, giữ lại chữ cái Latin và chữ số
  s = s
    .replace(/["'`[\](){}<>|\\/~^*+=@#$%&;:!?.,_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (s.length < 2 || GARBAGE_IMAGE_TOKENS.has(s.toLowerCase())) return '';
  return s;
};

/**
 * Xây dựng URL ảnh minh họa thông minh từ URL có sẵn hoặc cụm từ khóa Tiếng Anh
 * - Bảo toàn URL nếu đã hợp lệ (http/https/data:image)
 * - Lọc sạch từ khóa rác & chữ Hán
 * - Tự động bổ sung hậu tố "clean illustration no text" để ưu tiên hình minh họa sạch chữ
 */
export const buildSmartImageUrl = (
  rawImageOrKeyword,
  fallbackTerm = '',
  dataMode = 'vocab'
) => {
  // 1. Nếu đầu vào đã là một URL ảnh hợp lệ -> Giữ nguyên
  if (isValidImageUrl(rawImageOrKeyword)) {
    return rawImageOrKeyword.trim();
  }

  // 2. Làm sạch từ khóa chính
  let cleanKw = sanitizeImageKeyword(rawImageOrKeyword);

  // 3. Nếu từ khóa chính rỗng, thử dùng fallbackTerm (Chỉ chấp nhận từ tiếng Anh không dấu, không chữ Hán)
  if (!cleanKw && fallbackTerm && typeof fallbackTerm === 'string') {
    const hasCjk = /[\u4e00-\u9fff\u3400-\u4dbf]/.test(fallbackTerm);
    const hasVietDiacritics =
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
        fallbackTerm
      );
    if (!hasCjk && !hasVietDiacritics) {
      cleanKw = sanitizeImageKeyword(fallbackTerm);
    }
  }

  if (!cleanKw) return '';

  // Giới hạn độ dài từ khóa tối đa 8 từ để công cụ tìm ảnh đạt độ chính xác cao nhất
  const words = cleanKw.split(' ').filter(Boolean);
  const compactKw = words.slice(0, 8).join(' ');
  const lowerKw = compactKw.toLowerCase();

  // Tự động gắn hậu tố lọc chữ nếu từ khóa chưa có chỉ dẫn phong cách
  const hasStyleSuffix =
    lowerKw.includes('illustration') ||
    lowerKw.includes('clipart') ||
    lowerKw.includes('no text') ||
    lowerKw.includes('vector');

  const suffix =
    dataMode === 'sentence'
      ? 'scene illustration no text'
      : 'clean illustration no text';

  const finalQuery = hasStyleSuffix ? compactKw : `${compactKw} ${suffix}`;

  return `https://tse2.mm.bing.net/th?q=${encodeURIComponent(finalQuery)}&w=400&h=300&c=7&rs=1&p=0`;
};

// Alias tương thích cho các module gọi tên resolveSmartImageUrl
export const resolveSmartImageUrl = buildSmartImageUrl;

/**
 * Đọc và phân tích cú pháp JSON an toàn:
 * - Với khóa `fc_master_data_*`: Ưu tiên đọc tức thì 0ms từ RAM Mirror;
 *   nếu chưa có trong RAM thì fallback đọc LocalStorage cũ (chỉ nhận Plain Object hợp lệ) và nạp vào RAM.
 * - Với các khóa thường: Đọc và parse JSON an toàn từ LocalStorage (trả fallback nếu giá trị null/undefined).
 */
export const safeJsonParse = (key, fallback) => {
  try {
    if (isMasterDataKey(key)) {
      const cache = getGlobalMasterCache();
      if (cache.has(key)) {
        return cache.get(key);
      }
      if (typeof localStorage !== 'undefined') {
        const legacyRaw = localStorage.getItem(key);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          if (isPlainMasterObject(parsed)) {
            cache.set(key, parsed);
            return parsed;
          }
        }
      }
      return fallback;
    }

    if (typeof localStorage === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    if (item === null || item === '') return fallback;
    const parsed = JSON.parse(item);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

/**
 * Lưu dữ liệu an toàn (trả về boolean để caller biết chắc chắn ghi thành công hay thất bại):
 * - Với khóa `fc_master_data_*`: Tự giải mã nếu nhận chuỗi JSON legacy, kiểm định Plain Object
 *   trên RAM Mirror trước khi dọn LocalStorage & đồng bộ ngầm xuống FcDB (chống lệch RAM <-> DB).
 * - Với các khóa thường: Xóa key nếu value === null; tự động stringify nếu là Object/Array.
 */
export const safeLocalStorageSet = (key, value) => {
  if (!key || typeof key !== 'string' || value === undefined) return false;

  if (isMasterDataKey(key)) {
    try {
      let normalizedValue = value;
      if (typeof normalizedValue === 'string') {
        try {
          normalizedValue = JSON.parse(normalizedValue);
        } catch {
          console.warn(
            `[Utils] Invalid JSON string for MasterData (${key}). Write aborted.`
          );
          return false;
        }
      }

      const ok = setMasterDataCache(key, normalizedValue);
      if (!ok) {
        console.warn(
          `[Utils] Invalid MasterData payload (${key}): expected Plain Object or null. Write aborted.`
        );
        return false;
      }

      // Dọn bản cũ (nếu còn sót) trên localStorage để giải phóng quota 5MB
      if (typeof localStorage !== 'undefined') {
        try {
          if (localStorage.getItem(key) !== null) {
            localStorage.removeItem(key);
          }
        } catch {
          // Bỏ qua lỗi quyền truy cập storage
        }
      }

      // Đồng bộ bất đồng bộ xuống IndexedDB qua ES Module FcDB (tự động an toàn trên jsdom/Vitest)
      if (FcDB && typeof FcDB.set === 'function') {
        Promise.resolve(
          normalizedValue === null
            ? FcDB.remove(key)
            : FcDB.set(key, normalizedValue)
        ).catch((dbErr) => {
          console.warn(`[Utils] FcDB Sync Error (${key}):`, dbErr);
        });
      }
      return true;
    } catch (err) {
      console.warn(`[Utils] MasterData Cache Set Error (${key}):`, err);
      return false;
    }
  }

  try {
    if (typeof localStorage === 'undefined') return false;
    if (value === null) {
      localStorage.removeItem(key);
      return true;
    }
    localStorage.setItem(
      key,
      typeof value === 'object' ? JSON.stringify(value) : String(value)
    );
    return true;
  } catch (err) {
    console.warn(`[Utils] LocalStorage Set Error (${key}):`, err);
    return false;
  }
};

/**
 * Lấy chuỗi CSS font-family tương ứng với cấu hình cài đặt của người dùng
 */
export const getFontFamily = (settings) => {
  const font = settings?.fontFamily || 'sans';
  switch (font) {
    case 'serif':
      return '"Noto Serif SC", serif';
    case 'kaiti':
      return '"KaiTi", "STKaiti", "楷体", "LXGW WenKai Lite", serif';
    case 'callig':
      return '"Long Cang", cursive';
    case 'cn_kaiti':
      return '"KaiTi", "STKaiti", "楷体", serif';
    default:
      return 'ui-sans-serif, system-ui, sans-serif';
  }
};

/**
 * Chuẩn hóa chuỗi nâng cao (Chuyển đổi số đếm sang chữ theo ngôn ngữ & lọc bỏ dấu câu)
 * Phục vụ so khớp đáp án gõ phím và nhận diện giọng nói (Voice/Type)
 */
export const advancedNormalize = (str, langCode) => {
  if (!str) return '';
  let s = String(str).toLowerCase();

  if (langCode === 'vi') {
    s = s
      .replace(/\blăm\b/g, 'năm')
      .replace(/\bmốt\b/g, 'một')
      .replace(/\btư\b/g, 'bốn');
  } else if (langCode === 'zh') {
    s = s.replace(/两/g, '二');
  }

  s = s.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    if (isNaN(num)) return match;

    if (langCode === 'vi') {
      const units = [
        'không',
        'một',
        'hai',
        'ba',
        'bốn',
        'năm',
        'sáu',
        'bảy',
        'tám',
        'chín'
      ];
      if (num < 10) return units[num];
      if (num === 10) return 'mười';
      if (num < 20) return 'mười ' + units[num % 10];
      if (num < 100) {
        return (
          units[Math.floor(num / 10)] +
          ' mươi ' +
          (num % 10 !== 0 ? units[num % 10] : '')
        );
      }
    } else if (langCode === 'en') {
      const units = [
        'zero',
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        'nine'
      ];
      const teens = [
        'ten',
        'eleven',
        'twelve',
        'thirteen',
        'fourteen',
        'fifteen',
        'sixteen',
        'seventeen',
        'eighteen',
        'nineteen'
      ];
      const tens = [
        '',
        '',
        'twenty',
        'thirty',
        'forty',
        'fifty',
        'sixty',
        'seventy',
        'eighty',
        'ninety'
      ];
      if (num < 10) return units[num];
      if (num < 20) return teens[num - 10];
      if (num < 100) {
        return (
          tens[Math.floor(num / 10)] +
          (num % 10 !== 0 ? ' ' + units[num % 10] : '')
        );
      }
    } else if (langCode === 'zh') {
      const units = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      if (num < 10) return units[num];
      if (num === 10) return '十';
      if (num < 20) return '十' + (num % 10 !== 0 ? units[num % 10] : '');
      if (num < 100) {
        return (
          units[Math.floor(num / 10)] +
          '十' +
          (num % 10 !== 0 ? units[num % 10] : '')
        );
      }
    }
    return match;
  });

  return s.replace(/[^\p{L}\p{N}]/gu, '').trim();
};

/**
 * Xáo trộn mảng ngẫu nhiên theo thuật toán Fisher-Yates (Không làm biến đổi mảng gốc)
 */
export const shuffleArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Làm sạch văn bản Markdown trả về từ AI
 */
export const cleanText = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/[\*#_`~]/g, '')
    .replace(/^\s*-\s/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * [BẢN VÁ V2.5] Bộ lọc giải mã JSON thông minh chống lỗi Unicode Escaping (uXXXX) từ AI
 */
export const parseAiJson = (text) => {
  try {
    if (typeof text !== 'string') {
      if (text && typeof text === 'object') return text;
      throw new Error('Dữ liệu AI trống.');
    }
    let clean = text.replace(/```json\s*|\s*```/g, '').trim();

    // Lưới an toàn: Quét và giải mã Unicode Escaping bị vỡ do AI quên viết dấu \
    clean = clean.replace(/(?:\\+)?u([0-9a-fA-F]{4})/g, (match, hex) => {
      const code = parseInt(hex, 16);
      // Vùng 1: Chữ Hán (CJK Unified Ideographs). Nếu nằm trong vùng này, chắc chắn là AI xuất lỗi -> Giải mã ngay!
      if (code >= 0x4e00 && code <= 0x9fff) return String.fromCharCode(code);
      // Vùng 2: Nếu có dấu \ đàng hoàng (\uXXXX) thì giải mã theo chuẩn chung
      if (match.includes('\\')) return String.fromCharCode(code);
      // Trả về nguyên trạng để bảo vệ các từ tiếng Anh có chứa chữ u + 4 ký tự hex (VD: cloud1234 -> ud123)
      return match;
    });

    return JSON.parse(clean);
  } catch (e) {
    console.error('JSON Parse Error:', text);
    throw new Error('AI trả về dữ liệu không hợp lệ.');
  }
};

/**
 * Lấy mẫu câu lệnh (Prompt Template) và điền các tham số động (chống bẫy .join(undefined))
 */
export const getPrompt = (key, params = {}) => {
  let template = DEFAULT_PROMPTS[key];
  if (!template) return '';
  if (!params || typeof params !== 'object') return template;
  for (const [k, v] of Object.entries(params)) {
    template = template.split(`{${k}}`).join(v == null ? '' : String(v));
  }
  return template;
};

/**
 * Lấy cấu hình khóa lưu trữ theo ngôn ngữ
 */
export const getStorageConfig = (lang) => {
  return CONFIG_SAMPLES[lang] || CONFIG_SAMPLES['en'];
};

/**
 * Yêu cầu giữ màn hình luôn sáng (Wake Lock API) cho chế độ Rảnh tay
 */
export const requestWakeLock = async () => {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      currentWakeLock = await navigator.wakeLock.request('screen');
      Utils.wakeLock = currentWakeLock;
      console.log('Wake Lock active: Screen will stay on.');
    } catch (err) {
      console.warn(`Wake Lock failed: ${err.name}, ${err.message}`);
    }
  }
};

/**
 * Giải phóng chế độ giữ sáng màn hình
 */
export const releaseWakeLock = async () => {
  if (currentWakeLock !== null) {
    try {
      await currentWakeLock.release();
    } catch (err) {
      console.warn('Wake Lock release error:', err);
    }
    currentWakeLock = null;
    Utils.wakeLock = null;
    console.log('Wake Lock released.');
  }
};

/**
 * Chuyển đổi mảng dòng thô (từ Excel / CSV) thành danh sách đối tượng Thẻ chuẩn (10 cột)
 * Giữ gọn cột `image` (URL gốc hoặc từ khóa ngắn sạch rác) để tối ưu dung lượng lưu trữ
 */
export const convertRawRowsToCards = (rows) => {
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  return rows
    .slice(1)
    .map((row) => {
      if (!Array.isArray(row) || row.length === 0) return null;
      const term = String(row[0] ?? '').trim();
      if (!term) return null;
      return {
        term,
        pronunciation: String(row[1] ?? '').trim(),
        definition: String(row[2] ?? '').trim(),
        analysis: String(row[3] ?? '').trim(),
        sinoViet: String(row[4] ?? '').trim(),
        example: String(row[5] ?? '').trim(),
        image: normalizeStoredImageValue(String(row[6] ?? '')),
        partOfSpeech: String(row[7] ?? '').trim(),
        topic: String(row[8] ?? '').trim(),
        // Bắt dữ liệu cột J (index 9) và ép vào mảng an toàn
        grammar_type: row[9]
          ? String(row[9])
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : []
      };
    })
    .filter((card) => card !== null);
};

/**
 * Bộ phân tích CSV chuẩn RFC-4180 tuyến tính O(n):
 * - Hỗ trợ BOM UTF-8, ngắt dòng \r\n / \n / \r
 * - Hỗ trợ dấu ngoặc kép thoát "" và ô dữ liệu nhiều dòng bên trong "..."
 */
const parseCsvRowsRFC4180 = (csvText) => {
  const text = csvText.replace(/^\uFEFF/, '');
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else if (ch === '"' && currentCell.trim() === '') {
      inQuotes = true;
      currentCell = '';
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
};

/**
 * Phân tích chuỗi CSV chuẩn RFC-4180 và ánh xạ thành danh sách Thẻ chuẩn
 */
export const parseAndMapCSV = (csvText) => {
  if (!csvText || typeof csvText !== 'string' || csvText.length < 5) return [];
  const rows = parseCsvRowsRFC4180(csvText);
  return convertRawRowsToCards(rows);
};

/**
 * Làm sạch và chuẩn hóa cấu trúc mảng thẻ đầu vào (giữ gọn cột image, không phình URL)
 */
export const sanitizeCards = (rawCards) => {
  if (!Array.isArray(rawCards)) return [];
  return rawCards
    .filter((c) => c && typeof c === 'object')
    .map((c) => ({
      term: String(c.term ?? '').trim(),
      pronunciation: String(c.pronunciation ?? '').trim(),
      definition: String(c.definition ?? '').trim(),
      analysis: String(c.analysis ?? '').trim(),
      sinoViet: String(c.sinoViet ?? '').trim(),
      example: String(c.example ?? '').trim(),
      image: normalizeStoredImageValue(String(c.image ?? '')),
      partOfSpeech: String(c.partOfSpeech ?? '').trim(),
      topic: String(c.topic ?? '').trim(),
      grammar_type: Array.isArray(c.grammar_type)
        ? c.grammar_type
        : typeof c.grammar_type === 'string' && c.grammar_type.trim() !== ''
        ? c.grammar_type
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    }))
    .filter((c) => c.term !== '');
};

/**
 * Nhận diện nhanh văn bản là Câu văn (true) hay Từ vựng (false)
 */
export const detectSentence = (text) => {
  if (!text) return false;
  const str = String(text).trim();
  return (
    /[.?!。？！]/.test(str) ||
    str.split(/\s+/).length > 4 ||
    (str.length > 7 && /[\u4e00-\u9fa5]/.test(str))
  );
};

/**
 * Chuyển đổi mảng dữ liệu thẻ sang chuỗi TSV (Tab-Separated Values) gồm 10 cột để dán vào Google Sheets
 */
export const jsonToTsv = (data) => {
  if (!Array.isArray(data) || data.length === 0) return '';
  const headers = [
    'term',
    'pronunciation',
    'definition',
    'analysis',
    'sinoViet',
    'example',
    'image',
    'partOfSpeech',
    'topic',
    'grammar_type'
  ];
  const rows = data.map((item) =>
    headers
      .map((key) => {
        let val = item?.[key] || '';
        if (Array.isArray(val)) val = val.join(', ');
        val = String(val).replace(/(\r\n|\n|\r)/gm, ' ');
        return val;
      })
      .join('\t')
  );
  return rows.join('\n');
};

/**
 * Tính toán độ tương đồng giữa 2 chuỗi theo thuật toán Sørensen–Dice Coefficient (0.0 -> 1.0)
 */
export const calculateSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;
  const clean1 = String(str1).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const clean2 = String(str2).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (clean1 === clean2) return 1;
  if (clean1.length < 2 || clean2.length < 2) return 0;

  const bigrams1 = new Map();
  for (let i = 0; i < clean1.length - 1; i++) {
    const bg = clean1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < clean2.length - 1; i++) {
    const bg = clean2.substring(i, i + 2);
    const count = bigrams1.get(bg);
    if (count > 0) {
      intersection++;
      bigrams1.set(bg, count - 1);
    }
  }

  return (2.0 * intersection) / (clean1.length - 1 + clean2.length - 1);
};

/**
 * Loại bỏ dấu thanh điệu Pinyin về dạng chữ cái Latin không dấu (chuẩn hóa ü/ǖ/ǘ/ǚ/ǜ -> v trước NFD)
 */
export const removePinyinTones = (str) => {
  if (!str) return '';
  return String(str)
    .normalize('NFC')
    .replace(/[üǖǘǚǜ]/gi, 'v')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .trim();
};

/**
 * So khớp phiên âm Pinyin không dấu (Dùng cho Game Điền Từ Tiếng Trung)
 * - Hỗ trợ chuẩn bàn phím `v` (lv / nv) lẫn tương thích ngược gõ `u` (lu / nu) khi đáp án gốc có `ü`
 * - Tuyệt đối không báo đúng nhầm khi đáp án gốc là `u` (VD: lù != lv)
 */
export const comparePinyin = (input, targetPinyin) => {
  if (!input || !targetPinyin) return false;

  const normalizeKeepV = (s) =>
    String(s)
      .normalize('NFC')
      .replace(/[üǖǘǚǜ]/gi, 'v')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();

  const normalizeAsU = (s) =>
    String(s)
      .normalize('NFC')
      .replace(/[üǖǘǚǜ]/gi, 'u')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();

  const targetV = normalizeKeepV(targetPinyin);
  const inputV = normalizeKeepV(input);
  if (!targetV || !inputV) return false;

  if (inputV === targetV) return true;

  const targetU = normalizeAsU(targetPinyin);
  return targetU !== targetV && inputV === targetU;
};

/**
 * Tạo nhanh một câu hỏi trắc nghiệm cơ bản từ danh sách thẻ
 */
export const generateQuizQuestion = (cards, correctIndex) => {
  if (!Array.isArray(cards) || !cards[correctIndex]) {
    return { question: null, options: [] };
  }
  const correctCard = cards[correctIndex];
  const options = [correctCard];
  const pool = cards.filter(
    (_, i) => i !== correctIndex && cards[i]?.term !== correctCard.term
  );

  while (options.length < 5 && pool.length > 0) {
    const rand = Math.floor(Math.random() * pool.length);
    options.push(pool[rand]);
    pool.splice(rand, 1);
  }

  return {
    question: correctCard,
    options: shuffleArray(options).map((opt) => ({
      definition: opt.definition,
      isCorrect: opt.term === correctCard.term
    }))
  };
};

/**
 * Phân tích chuỗi cấu hình thời gian SRS (VD: "2d 4h 30m") sang đơn vị Ngày (Float)
 */
export const parseSrsTime = (str) => {
  if (!str || typeof str !== 'string') return 0;
  let d = 0;
  let h = 0;
  let m = 0;
  const matchD = str.match(/(\d+)d/);
  if (matchD) d = parseInt(matchD[1], 10);
  const matchH = str.match(/(\d+)h/);
  if (matchH) h = parseInt(matchH[1], 10);
  const matchM = str.match(/(\d+)m/);
  if (matchM) m = parseInt(matchM[1], 10);
  return d + h / 24 + m / 1440;
};

/**
 * Thuật toán Lặp lại Ngắt quãng (Spaced Repetition System - SuperMemo-2 biến thể)
 */
export const calculateSRS = (card, grade, settings) => {
  const prevInterval = card?.srs_interval || 0;
  const prevRep = card?.srs_repetition || 0;
  const prevEase = card?.srs_ease || 2.5;

  let internalGrade = 0;
  if (grade === 'again') internalGrade = 0;
  else if (grade === 'hard') internalGrade = 3;
  else if (grade === 'good') internalGrade = 4;
  else if (grade === 'easy') internalGrade = 5;

  let nextInterval;
  let nextRep;
  let nextEase;

  if (internalGrade >= 3) {
    if (prevRep === 0) {
      if (grade === 'hard') nextInterval = parseSrsTime(settings?.srsHard) || 2;
      else if (grade === 'good')
        nextInterval = parseSrsTime(settings?.srsGood) || 4;
      else if (grade === 'easy')
        nextInterval = parseSrsTime(settings?.srsEasy) || 7;
      else nextInterval = 1;
      if (nextInterval <= 0) nextInterval = 1;
    } else {
      nextInterval = Math.max(1, Math.round(prevInterval * prevEase));
    }
    nextRep = prevRep + 1;
  } else {
    nextInterval = 0.007;
    nextRep = 0;
  }

  nextEase =
    prevEase +
    (0.1 - (5 - internalGrade) * (0.08 + (5 - internalGrade) * 0.02));
  if (nextEase < 1.3) nextEase = 1.3;

  const now = new Date();
  const dueDate = new Date(
    now.getTime() + nextInterval * 24 * 60 * 60 * 1000
  ).getTime();

  return {
    srs_interval: nextInterval,
    srs_repetition: nextRep,
    srs_ease: parseFloat(nextEase.toFixed(2)),
    srs_due: dueDate
  };
};

/**
 * Hiển thị nhãn thời gian ôn tập SRS ngắn gọn trên nút bấm (VD: "10m", "4h", "7d")
 */
export const getSrsTimeLabel = (days) => {
  if (!days) return 'New';
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  return `${Math.round(days)}d`;
};

/**
 * Tạo biến thể gây nhiễu nhanh từ các thẻ khác trong bộ bài
 */
export const generateTrickyVariant = (correctText, otherCards) => {
  if (!correctText || !Array.isArray(otherCards) || otherCards.length === 0) {
    return correctText;
  }
  const safeText = String(correctText);
  const isChinese = !safeText.includes(' ');
  const words = isChinese ? safeText.split('') : safeText.split(' ');

  const pickRandomToken = () => {
    const validOthers = otherCards.filter(
      (c) => c && typeof c.definition === 'string' && c.definition.trim() !== ''
    );
    if (validOthers.length === 0) return isChinese ? '的' : 'the';
    const randomCard =
      validOthers[Math.floor(Math.random() * validOthers.length)];
    const randomSource = isChinese
      ? randomCard.definition.split('')
      : randomCard.definition.split(' ');
    return (
      randomSource[Math.floor(Math.random() * randomSource.length)] ||
      (isChinese ? '的' : 'the')
    );
  };

  if (words.length <= 1) {
    const randomWord = pickRandomToken();
    return safeText + (isChinese ? '' : ' ') + randomWord;
  }

  const strategy = Math.random();
  const lastIdx = words.length - 1;
  if (strategy < 0.33) {
    [words[lastIdx], words[lastIdx - 1]] = [words[lastIdx - 1], words[lastIdx]];
  } else if (strategy < 0.66) {
    words.push(pickRandomToken());
  } else {
    words[lastIdx] = pickRandomToken();
  }
  return words.join(isChinese ? '' : ' ');
};

/**
 * Đối tượng tổng hợp Utils để tương thích hoàn toàn với các mô-đun gọi qua namespace Utils.*
 */
export const Utils = {
  MASTER_DATA_KEY_PREFIX,
  isMasterDataKey,
  setMasterDataCache,
  getMasterDataCache,
  hasMasterDataCache,
  clearMasterDataCache,
  isValidImageUrl,
  normalizeStoredImageValue,
  buildSmartImageUrl,
  resolveSmartImageUrl,
  safeJsonParse,
  safeLocalStorageSet,
  getFontFamily,
  advancedNormalize,
  shuffleArray,
  cleanText,
  parseAiJson,
  getPrompt,
  getStorageConfig,
  wakeLock: null,
  requestWakeLock,
  releaseWakeLock,
  convertRawRowsToCards,
  parseAndMapCSV,
  sanitizeCards,
  detectSentence,
  jsonToTsv,
  calculateSimilarity,
  removePinyinTones,
  comparePinyin,
  generateQuizQuestion,
  parseSrsTime,
  calculateSRS,
  getSrsTimeLabel,
  generateTrickyVariant
};

if (typeof window !== 'undefined') {
  window.Utils = Object.assign(window.Utils || {}, Utils);
}

export default Utils;