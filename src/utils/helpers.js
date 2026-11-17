import { CONFIG_SAMPLES } from '../config/constants.js';
import { DEFAULT_PROMPTS } from '../config/prompts.js';

// Biến lưu trữ trạng thái giữ sáng màn hình (Screen Wake Lock)
let currentWakeLock = null;

/**
 * Đọc và phân tích cú pháp JSON an toàn từ LocalStorage
 */
export const safeJsonParse = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Lưu dữ liệu an toàn vào LocalStorage (Tự động stringify nếu là Object/Array)
 */
export const safeLocalStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value);
  } catch (err) {
    console.warn('[Utils] LocalStorage Set Error:', err);
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
  let s = str.toLowerCase();

  if (langCode === 'vi') {
    s = s.replace(/\blăm\b/g, 'năm').replace(/\bmốt\b/g, 'một').replace(/\btư\b/g, 'bốn');
  } else if (langCode === 'zh') {
    s = s.replace(/两/g, '二');
  }

  s = s.replace(/\d+/g, (match) => {
    const num = parseInt(match, 10);
    if (isNaN(num)) return match;

    if (langCode === 'vi') {
      const units = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
      if (num < 10) return units[num];
      if (num === 10) return 'mười';
      if (num < 20) return 'mười ' + units[num % 10];
      if (num < 100) {
        return units[Math.floor(num / 10)] + ' mươi ' + (num % 10 !== 0 ? units[num % 10] : '');
      }
    } else if (langCode === 'en') {
      const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
      const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
      const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
      if (num < 10) return units[num];
      if (num < 20) return teens[num - 10];
      if (num < 100) {
        return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + units[num % 10] : '');
      }
    } else if (langCode === 'zh') {
      const units = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      if (num < 10) return units[num];
      if (num === 10) return '十';
      if (num < 20) return '十' + (num % 10 !== 0 ? units[num % 10] : '');
      if (num < 100) {
        return units[Math.floor(num / 10)] + '十' + (num % 10 !== 0 ? units[num % 10] : '');
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
  return text
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
    let clean = text.replace(/```json\s*|\s*```/g, '').trim();

    // Lưới an toàn: Quét và giải mã Unicode Escaping bị vỡ do AI quên viết dấu \
    clean = clean.replace(/(?:\\+)?u([0-9a-fA-F]{4})/g, (match, hex) => {
      const code = parseInt(hex, 16);
      // Vùng 1: Chữ Hán (CJK Unified Ideographs). Nếu nằm trong vùng này, chắc chắn là AI xuất lỗi -> Giải mã ngay!
      if (code >= 0x4E00 && code <= 0x9FFF) return String.fromCharCode(code);
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
 * Lấy mẫu câu lệnh (Prompt Template) và điền các tham số động
 */
export const getPrompt = (key, params = {}) => {
  let template = DEFAULT_PROMPTS[key];
  if (!template) return '';
  for (const [k, v] of Object.entries(params)) {
    template = template.split(`{${k}}`).join(v);
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
  if ('wakeLock' in navigator) {
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
 */
export const convertRawRowsToCards = (rows) => {
  if (!rows || rows.length === 0) return [];
  return rows
    .slice(1)
    .map((row) => {
      if (!row || row.length === 0 || !row[0]) return null;
      return {
        term: String(row[0] || '').trim(),
        pronunciation: String(row[1] || '').trim(),
        definition: String(row[2] || '').trim(),
        analysis: String(row[3] || '').trim(),
        sinoViet: String(row[4] || '').trim(),
        example: String(row[5] || '').trim(),
        image: String(row[6] || '').trim(),
        partOfSpeech: String(row[7] || '').trim(),
        topic: String(row[8] || '').trim(),
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
 * Phân tích chuỗi CSV và ánh xạ thành danh sách Thẻ
 */
export const parseAndMapCSV = (csvText) => {
  if (!csvText || csvText.length < 5) return [];
  const rows = csvText
    .split('\n')
    .filter((l) => l.trim())
    .map((line) =>
      line
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((p) => p.replace(/^"|"$/g, '').trim())
    );
  return convertRawRowsToCards(rows);
};

/**
 * Làm sạch và chuẩn hóa cấu trúc mảng thẻ đầu vào
 */
export const sanitizeCards = (rawCards) => {
  if (!Array.isArray(rawCards)) return [];
  return rawCards
    .map((c) => ({
      term: String(c.term || ''),
      pronunciation: String(c.pronunciation || ''),
      definition: String(c.definition || ''),
      analysis: String(c.analysis || ''),
      sinoViet: String(c.sinoViet || ''),
      example: String(c.example || ''),
      image: String(c.image || ''),
      partOfSpeech: String(c.partOfSpeech || ''),
      topic: String(c.topic || ''),
      grammar_type: Array.isArray(c.grammar_type)
        ? c.grammar_type
        : typeof c.grammar_type === 'string' && c.grammar_type.trim() !== ''
        ? c.grammar_type
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    }))
    .filter((c) => c.term.trim() !== '');
};

/**
 * Nhận diện nhanh văn bản là Câu văn (true) hay Từ vựng (false)
 */
export const detectSentence = (text) => {
  if (!text) return false;
  const str = text.trim();
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
        let val = item[key] || '';
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
 * So khớp phiên âm Pinyin không dấu (Dùng cho Game Điền Từ Tiếng Trung)
 */
export const comparePinyin = (input, targetPinyin) => {
  if (!input || !targetPinyin) return false;
  const cleanStr = (s) =>
    String(s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();
  const cleanInput = cleanStr(input);
  const cleanTarget = cleanStr(targetPinyin);
  return cleanInput.length > 0 && cleanInput === cleanTarget;
};

/**
 * Tạo nhanh một câu hỏi trắc nghiệm cơ bản từ danh sách thẻ
 */
export const generateQuizQuestion = (cards, correctIndex) => {
  const correctCard = cards[correctIndex];
  const options = [correctCard];
  const pool = cards.filter((_, i) => i !== correctIndex && cards[i].term !== correctCard.term);

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
  if (!str) return 0;
  let d = 0,
    h = 0,
    m = 0;
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
  let prevInterval = card.srs_interval || 0;
  let prevRep = card.srs_repetition || 0;
  let prevEase = card.srs_ease || 2.5;

  let internalGrade = 0;
  if (grade === 'again') internalGrade = 0;
  else if (grade === 'hard') internalGrade = 3;
  else if (grade === 'good') internalGrade = 4;
  else if (grade === 'easy') internalGrade = 5;

  let nextInterval, nextRep, nextEase;
  if (internalGrade >= 3) {
    if (prevRep === 0) {
      if (grade === 'hard') nextInterval = parseSrsTime(settings?.srsHard) || 2;
      else if (grade === 'good') nextInterval = parseSrsTime(settings?.srsGood) || 4;
      else if (grade === 'easy') nextInterval = parseSrsTime(settings?.srsEasy) || 7;
      else nextInterval = 1;
      if (nextInterval <= 0) nextInterval = 1;
    } else {
      nextInterval = Math.round(prevInterval * prevEase);
    }
    nextRep = prevRep + 1;
  } else {
    nextInterval = 0.007;
    nextRep = 0;
  }

  nextEase = prevEase + (0.1 - (5 - internalGrade) * (0.08 + (5 - internalGrade) * 0.02));
  if (nextEase < 1.3) nextEase = 1.3;

  const now = new Date();
  const dueDate = new Date(now.getTime() + nextInterval * 24 * 60 * 60 * 1000).getTime();

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
  if (!correctText || !otherCards || otherCards.length === 0) return correctText;
  const isChinese = !correctText.includes(' ');
  let words = isChinese ? correctText.split('') : correctText.split(' ');

  if (words.length <= 1) {
    const randomCard = otherCards[Math.floor(Math.random() * otherCards.length)];
    const randomSource = isChinese ? randomCard.definition.split('') : randomCard.definition.split(' ');
    const randomWord = randomSource[Math.floor(Math.random() * randomSource.length)];
    return correctText + (isChinese ? '' : ' ') + randomWord;
  }

  const strategy = Math.random();
  const lastIdx = words.length - 1;
  if (strategy < 0.33) {
    [words[lastIdx], words[lastIdx - 1]] = [words[lastIdx - 1], words[lastIdx]];
  } else if (strategy < 0.66) {
    const randomCard = otherCards[Math.floor(Math.random() * otherCards.length)];
    const randomSource = isChinese ? randomCard.definition.split('') : randomCard.definition.split(' ');
    const randomWord = randomSource[Math.floor(Math.random() * randomSource.length)];
    words.push(randomWord);
  } else {
    const randomCard = otherCards[Math.floor(Math.random() * otherCards.length)];
    const randomSource = isChinese ? randomCard.definition.split('') : randomCard.definition.split(' ');
    const randomWord = randomSource[Math.floor(Math.random() * randomSource.length)];
    words[lastIdx] = randomWord;
  }
  return words.join(isChinese ? '' : ' ');
};

/**
 * Đối tượng tổng hợp Utils để tương thích hoàn toàn với các mô-đun gọi qua namespace Utils.*
 */
export const Utils = {
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
  comparePinyin,
  generateQuizQuestion,
  parseSrsTime,
  calculateSRS,
  getSrsTimeLabel,
  generateTrickyVariant
};

export default Utils;