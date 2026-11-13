/**
* @file src/utils/helpers.js
* @description Chứa các hàm tiện ích lõi (Core Utilities) xử lý chuỗi, mảng, thời gian, thuật toán SRS và Trí nhớ AI trên RAM.
* @origin Tầng 2 - Block 2.1b (Core Data Utilities)
*/

import { STORAGE_KEYS, CONFIG_SAMPLES } from '@/config/constants';
import { DEFAULT_PROMPTS } from '@/config/prompts';
// [BẢN VÁ] Import các hàm AI từ dịch vụ lõi để làm cổng nối cho toàn bộ ứng dụng
import { callGeminiApi, fillCardWithAi } from '@/services/geminiApi';

export const Utils = {
  // Gắn các hàm AI vào Utils để các Components gọi qua cổng này
  callGeminiApi,
  fillCardWithAi,

  safeJsonParse: (key, f) => {
    try {
      const i = localStorage.getItem(key);
      return i ? JSON.parse(i) : f;
    } catch {
      return f;
    }
  },

  getFontFamily: (settings) => {
    const font = settings?.fontFamily || 'sans';
    switch (font) {
      case 'serif': return '"Noto Serif SC", serif';
      case 'kaiti': return '"KaiTi", "STKaiti", "楷体", "LXGW WenKai Lite", serif';
      case 'callig': return '"Long Cang", cursive';
      case 'cn_kaiti': return '"KaiTi", "STKaiti", "楷体", serif';
      default: return 'ui-sans-serif, system-ui, sans-serif';
    }
  },

  advancedNormalize: (str, langCode) => {
    if (!str) return "";
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
        if (num < 100) return units[Math.floor(num / 10)] + ' mươi ' + (num % 10 !== 0 ? units[num % 10] : '');
      } else if (langCode === 'en') {
        const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        if (num < 10) return units[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? ' ' + units[num % 10] : '');
      } else if (langCode === 'zh') {
        const units = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (num < 10) return units[num];
        if (num === 10) return '十';
        if (num < 20) return '十' + (num % 10 !== 0 ? units[num % 10] : '');
        if (num < 100) return units[Math.floor(num / 10)] + '十' + (num % 10 !== 0 ? units[num % 10] : '');
      }
      return match;
    });
    return s.replace(/[^\p{L}\p{N}]/gu, "").trim();
  },

  safeLocalStorageSet: (k, v) => {
    try {
      localStorage.setItem(k, typeof v === 'object' ? JSON.stringify(v) : v);
    } catch { }
  },

  // ============================================================================
  // ĐỘNG CƠ VƯỢT RÀO CORS & FETCH DATA (CÓ LƯỚI CHỐNG RÁC HTML)
  // ============================================================================
  fetchWithFallback: async (url, options = {}) => {
    // [BẢN VÁ] Lưới lọc an ninh: Quét nội dung tải về trước khi đưa vào hệ thống
    const guardResponse = async (res) => {
      const clone = res.clone(); // Clone để không làm tiêu hao stream của res gốc
      const text = await clone.text();
      const snippet = text.trim().substring(0, 20).toLowerCase();
      
      // Nếu phát hiện tải nhầm trang HTML (Trang đăng nhập/Báo lỗi của Google) thì khóa ngay
      if (snippet.startsWith('<!doctype') || snippet.startsWith('<html')) {
        throw new Error("Bị chặn: Google trả về trang web HTML thay vì Dữ liệu thô. Vui lòng kiểm tra lại quyền truy cập của Link.");
      }
      return res;
    };

    try {
      // Thử tải trực tiếp trước (Tối ưu nhất nếu server đích mở CORS)
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`Direct fetch failed with status: ${res.status}`);
      return await guardResponse(res);
    } catch (e1) {
      console.warn("Direct fetch failed, trying Proxy 1 (allorigins)...", e1);
      try {
        // Fallback 1: Dùng allorigins.win (Trả về nội dung thô)
        const proxy1 = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const res1 = await fetch(proxy1, options);
        if (!res1.ok) throw new Error(`Proxy 1 failed with status: ${res1.status}`);
        return await guardResponse(res1);
      } catch (e2) {
        console.warn("Proxy 1 failed, trying Proxy 2 (corsproxy.io)...", e2);
        try {
          // Fallback 2: Dùng corsproxy.io (Mạnh nhưng thỉnh thoảng sập)
          const proxy2 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
          const res2 = await fetch(proxy2, options);
          if (!res2.ok) throw new Error(`Proxy 2 failed with status: ${res2.status}`);
          return await guardResponse(res2);
        } catch (e3) {
          console.error("All fetch attempts failed.");
          throw new Error("Không thể tải dữ liệu. Vui lòng kiểm tra lại kết nối mạng hoặc quyền truy cập của Link Google Sheet.");
        }
      }
    }
  },

  // ============================================================================
  // HỆ THỐNG TRÍ NHỚ AI TRÊN RAM (HYBRID MEMORY BUFFER)
  // ============================================================================
  AiMemoryManager: {
    _buffer: null,
    _saveTimeout: null,
    _isDirty: false,
    init: function() {
      if (this._buffer === null) {
        this._buffer = Utils.safeJsonParse('fc_ai_memory', []);
        this._setupHooks();
      }
    },
    get: function() {
      this.init();
      return this._buffer;
    },
    add: function(items) {
      this.init();
      let hasChanges = false;
      const itemsToAdd = Array.isArray(items) ? items : [items];
      itemsToAdd.forEach(item => {
        if (item && !this._buffer.includes(item)) {
          this._buffer.push(item);
          hasChanges = true;
        }
      });
      if (hasChanges) {
        if (this._buffer.length > 400) {
          this._buffer = this._buffer.slice(-400);
        }
        this._isDirty = true;
        this._scheduleSave();
      }
    },
    replace: function(newArray) {
      this.init();
      this._buffer = Array.isArray(newArray) ? newArray : [];
      if (this._buffer.length > 400) {
        this._buffer = this._buffer.slice(-400);
      }
      this._isDirty = true;
      this._scheduleSave();
    },
    _scheduleSave: function() {
      if (this._saveTimeout) clearTimeout(this._saveTimeout);
      this._saveTimeout = setTimeout(() => {
        this._flush();
      }, 3000); // Debounce 3 giây (Đợi AI xả đạn xong mới ghi)
    },
    _flush: function() {
      if (this._isDirty && this._buffer !== null) {
        Utils.safeLocalStorageSet('fc_ai_memory', this._buffer);
        this._isDirty = false;
        if (this._saveTimeout) {
          clearTimeout(this._saveTimeout);
          this._saveTimeout = null;
        }
      }
    },
    _setupHooks: function() {
      const flushHandler = () => this._flush();
      // Lưới an toàn 1: Vuốt ẩn App trên Mobile (iOS/Android)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushHandler();
      });
      // Lưới an toàn 2: Chuyển trang hoặc đóng Tab trên Desktop
      window.addEventListener('pagehide', flushHandler);
      window.addEventListener('beforeunload', flushHandler);
    }
  },

  shuffleArray: (a) => {
    if (!Array.isArray(a)) return [];
    let r = [...a];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  },

  cleanText: (text) => {
    if (!text) return "";
    return text.replace(/[\*#_`~]/g, '').replace(/^\s*-\s/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
  },

  // BỘ LỌC GIẢI MÃ UNICODE THÔNG MINH
  parseAiJson: (text) => {
    try {
      let clean = text.replace(/```json\s*|\s*```/g, "").trim();
      // Lưới an toàn: Quét và giải mã Unicode Escaping bị vỡ do AI quên viết dấu \
      clean = clean.replace(/(?:\\+)?u([0-9a-fA-F]{4})/g, (match, hex) => {
        const code = parseInt(hex, 16);
        // Vùng 1: Chữ Hán (CJK Unified Ideographs). Nếu nằm trong vùng này, chắc chắn là AI xuất lỗi, giải mã ngay!
        if (code >= 0x4E00 && code <= 0x9FFF) return String.fromCharCode(code);
        // Vùng 2: Nếu có dấu \ đàng hoàng (\uXXXX) thì giải mã theo chuẩn chung
        if (match.includes('\\')) return String.fromCharCode(code);
        // Trả về nguyên trạng để bảo vệ các từ tiếng Anh bị dính đạn lạc (VD: cloud1234 -> ud123)
        return match;
      });
      return JSON.parse(clean);
    } catch (e) {
      console.error("JSON Parse Error:", text);
      throw new Error("AI trả về dữ liệu không hợp lệ.");
    }
  },

  getPrompt: (key, params) => {
    let template = DEFAULT_PROMPTS[key];
    if (!template) return "";
    for (const [k, v] of Object.entries(params)) {
      template = template.split(`{${k}}`).join(v);
    }
    return template;
  },

  getStorageConfig: (lang) => CONFIG_SAMPLES[lang] || CONFIG_SAMPLES['en'],

  wakeLock: null,

  requestWakeLock: async () => {
    if ('wakeLock' in navigator) {
      try {
        Utils.wakeLock = await navigator.wakeLock.request('screen');
        console.log("Wake Lock active: Screen will stay on.");
      } catch (err) {
        console.warn(`Wake Lock failed: ${err.name}, ${err.message}`);
      }
    }
  },

  releaseWakeLock: async () => {
    if (Utils.wakeLock !== null) {
      await Utils.wakeLock.release();
      Utils.wakeLock = null;
      console.log("Wake Lock released.");
    }
  },

  convertRawRowsToCards: (rows) => {
    if (!rows || rows.length === 0) return [];
    return rows.slice(1).map(row => {
      if (!row || row.length === 0 || !row[0]) return null;
      return {
        term: String(row[0] || "").trim(),
        pronunciation: String(row[1] || "").trim(),
        definition: String(row[2] || "").trim(),
        analysis: String(row[3] || "").trim(),
        sinoViet: String(row[4] || "").trim(),
        example: String(row[5] || "").trim(),
        image: String(row[6] || "").trim(),
        partOfSpeech: String(row[7] || "").trim(),
        topic: String(row[8] || "").trim(),
        // Bắt dữ liệu cột J (index 9) và ép vào mảng an toàn
        grammar_type: row[9] ? String(row[9]).split(',').map(s => s.trim()).filter(Boolean) : []
      };
    }).filter(card => card !== null);
  },

  parseAndMapCSV: (csvText) => {
    if (!csvText || csvText.length < 5) return [];
    const rows = csvText.split('\n').filter(l => l.trim()).map(line => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.replace(/^"|"$/g, '').trim()));
    return Utils.convertRawRowsToCards(rows);
  },

  sanitizeCards: (rawCards) => {
    if (!Array.isArray(rawCards)) return [];
    return rawCards.map(c => ({
      term: String(c.term || ''),
      pronunciation: String(c.pronunciation || ''),
      definition: String(c.definition || ''),
      analysis: String(c.analysis || ''),
      sinoViet: String(c.sinoViet || ''),
      example: String(c.example || ''),
      image: String(c.image || ''),
      partOfSpeech: String(c.partOfSpeech || ''),
      topic: String(c.topic || ''),
      // Bảo vệ mảng grammar_type khi nạp vào hệ thống
      grammar_type: Array.isArray(c.grammar_type) ? c.grammar_type : (typeof c.grammar_type === 'string' && c.grammar_type.trim() !== '' ? c.grammar_type.split(',').map(s => s.trim()).filter(Boolean) : [])
    })).filter(c => c.term.trim() !== "");
  },

  detectSentence: (text) => {
    if (!text) return false;
    const str = text.trim();
    return /[.?!。？！]/.test(str) || str.split(/\s+/).length > 4 || (str.length > 7 && /[\u4e00-\u9fa5]/.test(str));
  },

  jsonToTsv: (data) => {
    if (!Array.isArray(data) || data.length === 0) return "";
    // Định nghĩa chính xác 10 cột để xuất ra TSV (Clipboard)
    const headers = ['term', 'pronunciation', 'definition', 'analysis', 'sinoViet', 'example', 'image', 'partOfSpeech', 'topic', 'grammar_type'];
    const rows = data.map(item => headers.map(key => {
      let val = item[key] || '';
      // Chuyển mảng thành chuỗi phân tách bằng dấu phẩy
      if (Array.isArray(val)) val = val.join(', ');
      val = String(val).replace(/(\r\n|\n|\r)/gm, " ");
      return val;
    }).join('\t'));
    return rows.join('\n');
  },

  calculateSimilarity: (str1, str2) => {
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
  },

  comparePinyin: (input, targetPinyin) => {
    if (!input || !targetPinyin) return false;
    const cleanStr = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
    const cleanInput = cleanStr(input);
    const cleanTarget = cleanStr(targetPinyin);
    return cleanInput.length > 0 && cleanInput === cleanTarget;
  },

  generateQuizQuestion: (cards, correctIndex, lang) => {
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
      options: Utils.shuffleArray(options).map(opt => ({
        definition: opt.definition,
        isCorrect: opt.term === correctCard.term
      }))
    };
  },

  parseSrsTime: (str) => {
    if (!str) return 0;
    let d = 0, h = 0, m = 0;
    const matchD = str.match(/(\d+)d/); if (matchD) d = parseInt(matchD[1]);
    const matchH = str.match(/(\d+)h/); if (matchH) h = parseInt(matchH[1]);
    const matchM = str.match(/(\d+)m/); if (matchM) m = parseInt(matchM[1]);
    return d + (h / 24) + (m / 1440);
  },

  calculateSRS: (card, grade, settings) => {
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
        if (grade === 'hard') nextInterval = Utils.parseSrsTime(settings?.srsHard) || 2;
        else if (grade === 'good') nextInterval = Utils.parseSrsTime(settings?.srsGood) || 4;
        else if (grade === 'easy') nextInterval = Utils.parseSrsTime(settings?.srsEasy) || 7;
        else nextInterval = 1;
        if (nextInterval <= 0) nextInterval = 1;
      } else if (prevRep === 1) {
        nextInterval = Math.round(prevInterval * prevEase);
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
  },

  getSrsTimeLabel: (days) => {
    if (!days) return "New";
    if (days < 1) {
      const minutes = Math.round(days * 24 * 60);
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.round(days * 24);
      return `${hours}h`;
    }
    return `${Math.round(days)}d`;
  },

  generateTrickyVariant: (correctText, otherCards) => {
    if (!correctText || !otherCards || otherCards.length === 0) return correctText;
    let words = correctText.split(' ');
    const isChinese = !correctText.includes(' ');
    if (isChinese) words = correctText.split('');
    if (words.length <= 1) {
      const randomCard = otherCards[Math.floor(Math.random() * otherCards.length)];
      const randomSource = isChinese ? randomCard.definition.split('') : randomCard.definition.split(' ');
      const randomWord = randomSource[Math.floor(Math.random() * randomSource.length)];
      return correctText + (isChinese ? "" : " ") + randomWord;
    }
    const strategy = Math.random();
    const lastIdx = words.length - 1;
    if (strategy < 0.33) {
      [words[lastIdx], words[lastIdx - 1]] = [words[lastIdx - 1], words[lastIdx]];
    }
    else if (strategy < 0.66) {
      const randomCard = otherCards[Math.floor(Math.random() * otherCards.length)];
      const randomSource = isChinese ? randomCard.definition.split('') : randomCard.definition.split(' ');
      const randomWord = randomSource[Math.floor(Math.random() * randomSource.length)];
      words.push(randomWord);
    }
    else {
      const randomCard = otherCards[Math.floor(Math.random() * otherCards.length)];
      const randomSource = isChinese ? randomCard.definition.split('') : randomCard.definition.split(' ');
      const randomWord = randomSource[Math.floor(Math.random() * randomSource.length)];
      words[lastIdx] = randomWord;
    }
    return words.join(isChinese ? '' : ' ');
  }
};