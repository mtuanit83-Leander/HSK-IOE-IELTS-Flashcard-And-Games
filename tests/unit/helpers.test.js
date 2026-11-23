// ============================================================================
// FILE: tests/unit/helpers.test.js
// NGUỒN GỐC: Bước 3A — Bộ Kiểm định Tầng 2 (src/utils/helpers.js Ver 1.2)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 13:03 (GMT+7)
// NHIỆM VỤ: Kiểm thử tự động toàn bộ thuật toán lõi & chốt chặn chống hồi quy
//           của helpers.js: Kho Master Lai (RAM Mirror 0ms), Pinyin ü/v/u,
//           CSV RFC-4180 đa dòng, chống phình URL ảnh Bing, SRS chống bẫy 0 ngày,
//           giải mã JSON AI lỗi Unicode, getPrompt và OfflineDistractorEngine.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as HelpersModule from '@/utils/helpers';
import * as PromptsModule from '@/config/prompts';

const Utils = HelpersModule.Utils || HelpersModule.default;
const OfflineDistractorEngine =
  HelpersModule.OfflineDistractorEngine ||
  (typeof window !== 'undefined' ? window.OfflineDistractorEngine : null);
const DEFAULT_PROMPTS =
  PromptsModule.DEFAULT_PROMPTS ||
  PromptsModule.default ||
  (typeof window !== 'undefined' ? window.DEFAULT_PROMPTS : {});

describe('Tầng 2 — src/utils/helpers.js (Ver 1.2) Unit Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    if (typeof Utils?.clearMasterDataCache === 'function') {
      Utils.clearMasterDataCache();
    } else if (typeof window !== 'undefined' && window.__fcMasterDataCache) {
      Object.keys(window.__fcMasterDataCache).forEach((k) => {
        delete window.__fcMasterDataCache[k];
      });
    }
    // Chặn ghi ngầm IndexedDB thật trong môi trường jsdom
    if (typeof window !== 'undefined') {
      window.FcDB = {
        init: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true),
        del: vi.fn().mockResolvedValue(true)
      };
    }
  });

  afterEach(() => {
    localStorage.clear();
    if (typeof Utils?.clearMasterDataCache === 'function') {
      Utils.clearMasterDataCache();
    }
  });

  // --------------------------------------------------------------------------
  // 1. KIẾN TRÚC KHO MASTER LAI (RAM MIRROR 0MS & CHỐNG TRÀN 5MB LOCALSTORAGE)
  // --------------------------------------------------------------------------
  describe('1. Kho Master Lai (safeLocalStorageSet & safeJsonParse)', () => {
    it('định tuyến khóa fc_master_data_* vào RAM Mirror 0ms và KHÔNG ghi rác vào localStorage', () => {
      const sampleMaster = {
        zh_level_1: [{ term: '你好', definition: 'Xin chào', topic: 'Chào hỏi' }],
        zh_level_2: [{ term: '一会儿', definition: 'Một lát', topic: 'Thời gian' }]
      };

      const saved = Utils.safeLocalStorageSet('fc_master_data_zh_vocab', sampleMaster);
      expect(saved).toBe(true);

      // Chốt chặn sống còn: localStorage tuyệt đối không được chứa kho Master Data
      expect(localStorage.getItem('fc_master_data_zh_vocab')).toBeNull();

      // Đọc đồng bộ 0ms qua safeJsonParse phải khớp 100%
      const loaded = Utils.safeJsonParse('fc_master_data_zh_vocab', null);
      expect(loaded).toEqual(sampleMaster);
    });

    it('tự động parse chuỗi JSON hợp lệ cho fc_master_data_* và từ chối dữ liệu lỗi', () => {
      const sampleMaster = {
        en_level_1: [{ term: 'apple', definition: 'quả táo' }]
      };

      // Chấp nhận chuỗi JSON hợp lệ (tương thích luồng Restore)
      const okFromJsonString = Utils.safeLocalStorageSet(
        'fc_master_data_en_vocab',
        JSON.stringify(sampleMaster)
      );
      expect(okFromJsonString).toBe(true);
      expect(localStorage.getItem('fc_master_data_en_vocab')).toBeNull();
      expect(Utils.safeJsonParse('fc_master_data_en_vocab', null)).toEqual(sampleMaster);

      // Từ chối chuỗi rác / kiểu sai (mảng hoặc JSON gãy)
      expect(Utils.safeLocalStorageSet('fc_master_data_en_sentence', '{invalid-json')).toBe(false);
      expect(Utils.safeLocalStorageSet('fc_master_data_en_sentence', ['not-an-object'])).toBe(false);
      expect(Utils.safeJsonParse('fc_master_data_en_sentence', null)).toBeNull();
    });

    it('dọn sạch khóa thừa cũ trên localStorage khi cập nhật kho Master Data mới', () => {
      localStorage.setItem('fc_master_data_zh_sentence', JSON.stringify({ zh_level_1: [] }));
      const nextData = {
        zh_level_2: [{ term: '北京比上海大吧', definition: 'Bắc Kinh lớn hơn Thượng Hải nhỉ' }]
      };

      const saved = Utils.safeLocalStorageSet('fc_master_data_zh_sentence', nextData);
      expect(saved).toBe(true);
      expect(localStorage.getItem('fc_master_data_zh_sentence')).toBeNull();
      expect(Utils.safeJsonParse('fc_master_data_zh_sentence', null)).toEqual(nextData);
    });

    it('xử lý chuẩn khóa thường: giữ nguyên giá trị falsy (0, false) và xóa khóa khi ghi null', () => {
      expect(Utils.safeLocalStorageSet('fc_test_zero', 0)).toBe(true);
      expect(Utils.safeJsonParse('fc_test_zero', 99)).toBe(0);

      expect(Utils.safeLocalStorageSet('fc_test_bool', false)).toBe(true);
      expect(Utils.safeJsonParse('fc_test_bool', true)).toBe(false);

      expect(Utils.safeLocalStorageSet('fc_test_null', 'hello')).toBe(true);
      expect(localStorage.getItem('fc_test_null')).toBe('hello');
      expect(Utils.safeLocalStorageSet('fc_test_null', null)).toBe(true);
      expect(localStorage.getItem('fc_test_null')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 2. ĐỐI SÁNH PINYIN (CHỐNG HỒI QUY ü / v / u)
  // --------------------------------------------------------------------------
  describe('2. Đối sánh Pinyin (comparePinyin)', () => {
    it('chấp nhận gõ không dấu và bỏ qua khoảng trắng / dấu thanh', () => {
      expect(Utils.comparePinyin('ni hao', 'nǐ hǎo')).toBe(true);
      expect(Utils.comparePinyin('nihao', 'nǐ hǎo')).toBe(true);
      expect(Utils.comparePinyin('NI HAO', 'nǐ hǎo')).toBe(true);
    });

    it('chấp nhận cả v và u khi đáp án gốc chứa âm ü (lǜ, nǚrén, lǚxíng)', () => {
      expect(Utils.comparePinyin('lv', 'lǜ')).toBe(true);
      expect(Utils.comparePinyin('lu', 'lǜ')).toBe(true);
      expect(Utils.comparePinyin('nvren', 'nǚrén')).toBe(true);
      expect(Utils.comparePinyin('nuren', 'nǚrén')).toBe(true);
      expect(Utils.comparePinyin('lvxing', 'lǚxíng')).toBe(true);
    });

    it('KHÔNG báo đúng nhầm khi gõ v cho từ gốc dùng âm u thường (lù, nǔlì)', () => {
      expect(Utils.comparePinyin('lv', 'lù')).toBe(false);
      expect(Utils.comparePinyin('nvli', 'nǔlì')).toBe(false);
    });

    it('trả về false khi đầu vào rỗng hoặc thiếu dữ liệu', () => {
      expect(Utils.comparePinyin('', 'nǐ hǎo')).toBe(false);
      expect(Utils.comparePinyin('nihao', '')).toBe(false);
      expect(Utils.comparePinyin(null, 'nǐ hǎo')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. PARSER CSV CHUẨN RFC-4180 & CHỐNG PHÌNH URL ẢNH BING
  // --------------------------------------------------------------------------
  describe('3. parseAndMapCSV, convertRawRowsToCards & sanitizeCards', () => {
    it('đọc chuẩn RFC-4180: BOM UTF-8, \\r\\n, ô đa dòng, dấu "" thoát và KHÔNG phình URL ảnh Bing', () => {
      const csvText =
        '\uFEFFterm,pronunciation,definition,analysis,sinoViet,example,image,partOfSpeech,topic,grammar_type\r\n' +
        '"hello","həˈloʊ","xin chào","dòng 1\ndòng 2","","""Hello"", she said.","red apple","interjection","Greetings","greeting, basic"\r\n' +
        '"   ","","","","","","","noun","EmptyRow",""\r\n';

      const cards = Utils.parseAndMapCSV(csvText);

      expect(cards).toHaveLength(1);
      expect(cards[0].term).toBe('hello');
      expect(cards[0].pronunciation).toBe('həˈloʊ');
      expect(cards[0].definition).toBe('xin chào');
      expect(cards[0].analysis).toContain('dòng 1');
      expect(cards[0].analysis).toContain('dòng 2');
      expect(cards[0].example).toBe('"Hello", she said.');
      // Chốt chặn sống còn: giữ từ khóa ngắn, KHÔNG phình thành link Bing 120+ ký tự
      expect(cards[0].image).toBe('red apple');
      expect(cards[0].image).not.toContain('bing.net');
      expect(cards[0].grammar_type).toEqual(['greeting', 'basic']);
    });

    it('sanitizeCards lọc bỏ thẻ rỗng, chuẩn hóa grammar_type và giữ nguyên từ khóa ảnh ngắn', () => {
      const cleaned = Utils.sanitizeCards([
        { term: '  ', definition: 'Rỗng' },
        {
          term: 'apple',
          definition: 'quả táo',
          image: 'green apple',
          grammar_type: 'noun_basic, fruit'
        },
        {
          term: 'cat',
          definition: 'con mèo',
          image: 'null',
          grammar_type: ['animal']
        }
      ]);

      expect(cleaned).toHaveLength(2);
      expect(cleaned[0].image).toBe('green apple');
      expect(cleaned[0].grammar_type).toEqual(['noun_basic', 'fruit']);
      // Lọc rác chuỗi 'null' / 'undefined' nếu có
      expect(cleaned[1].image).not.toBe('undefined');
    });
  });

  // --------------------------------------------------------------------------
  // 4. THUẬT TOÁN SRS (CHỐNG BẪY 0 NGÀY & SÀN EASE 1.3)
  // --------------------------------------------------------------------------
  describe('4. Thuật toán Lặp lại Ngắt quãng (calculateSRS & parseSrsTime)', () => {
    const mockSettings = { srsHard: '2d', srsGood: '4d', srsEasy: '7d' };

    it('parseSrsTime quy đổi chính xác ngày, giờ và phút', () => {
      expect(Utils.parseSrsTime('2d')).toBe(2);
      expect(Utils.parseSrsTime('12h')).toBeCloseTo(0.5, 5);
      expect(Utils.parseSrsTime('30m')).toBeCloseTo(30 / 1440, 5);
      expect(Utils.parseSrsTime('')).toBe(0);
    });

    it('tính toán đúng cho thẻ mới ở mức good và không bao giờ rơi vào bẫy 0 ngày khi prevRep > 0', () => {
      const firstPass = Utils.calculateSRS({}, 'good', mockSettings);
      expect(firstPass.srs_repetition).toBe(1);
      expect(firstPass.srs_interval).toBe(4);
      expect(firstPass.srs_due).toBeGreaterThan(Date.now());

      // Case biên cực nhỏ từ thẻ cũ từng lưu interval 0.007 ngày nhưng prevRep = 1
      const tinyIntervalCard = {
        srs_interval: 0.007,
        srs_repetition: 1,
        srs_ease: 2.5
      };
      const secondPass = Utils.calculateSRS(tinyIntervalCard, 'good', mockSettings);
      expect(secondPass.srs_repetition).toBe(2);
      expect(secondPass.srs_interval).toBeGreaterThanOrEqual(1);
    });

    it('reset repetition về 0 khi chọn again và giữ sàn srs_ease >= 1.3', () => {
      let card = { srs_interval: 10, srs_repetition: 3, srs_ease: 1.4 };
      for (let i = 0; i < 5; i++) {
        card = Utils.calculateSRS(card, 'again', mockSettings);
      }
      expect(card.srs_repetition).toBe(0);
      expect(card.srs_interval).toBeLessThan(1);
      expect(card.srs_ease).toBeGreaterThanOrEqual(1.3);
    });
  });

  // --------------------------------------------------------------------------
  // 5. GIẢI MÃ JSON AI & TEMPLATE PROMPT
  // --------------------------------------------------------------------------
  describe('5. parseAiJson & getPrompt', () => {
    it('parseAiJson tự giải mã chuỗi Unicode CJK thiếu dấu gạch chéo và bảo vệ từ Tiếng Anh', () => {
      const brokenAiOutput =
        '```json\n{"term": "u4f60u597d", "code": "cloud1234", "ok": true}\n```';
      const parsed = Utils.parseAiJson(brokenAiOutput);

      expect(parsed.term).toBe('你好');
      expect(parsed.code).toBe('cloud1234');
      expect(parsed.ok).toBe(true);
    });

    it('parseAiJson ném lỗi rõ ràng khi JSON thực sự gãy', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => Utils.parseAiJson('khong phai json')).toThrow();
      errSpy.mockRestore();
    });

    it('getPrompt không chèn chữ "undefined" khi thiếu tham số truyền vào', () => {
      const keys = Object.keys(DEFAULT_PROMPTS || {});
      const targetKey = keys.find((k) => /\{[a-zA-Z0-9_]+\}/.test(String(DEFAULT_PROMPTS[k] || '')));

      if (targetKey) {
        const template = String(DEFAULT_PROMPTS[targetKey]);
        const match = template.match(/\{([a-zA-Z0-9_]+)\}/);
        const placeholderName = match[1];
        const rendered = Utils.getPrompt(targetKey, { [placeholderName]: undefined });
        expect(rendered).not.toContain('undefined');
      } else {
        expect(Utils.getPrompt('NON_EXISTENT_PROMPT_KEY', {})).toBe('');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 6. CHUẨN HÓA CHUỖI, NHẬN DIỆN CÂU, TƯƠNG ĐỒNG & XUẤT TSV
  // --------------------------------------------------------------------------
  describe('6. advancedNormalize, detectSentence, calculateSimilarity & jsonToTsv', () => {
    it('chuẩn hóa số và văn bản đa ngôn ngữ chính xác', () => {
      expect(Utils.advancedNormalize('Hello, World!', 'en')).toBe('helloworld');
      expect(Utils.advancedNormalize('15', 'en')).toBe('fifteen');
      expect(Utils.advancedNormalize('两', 'zh')).toBe('二');
    });

    it('nhận diện chính xác giữa từ đơn và câu văn', () => {
      expect(Utils.detectSentence('apple')).toBe(false);
      expect(Utils.detectSentence('How are you doing today?')).toBe(true);
      expect(Utils.detectSentence('我今天想去北京旅游')).toBe(true);
    });

    it('tính toán độ tương đồng chuỗi và xuất TSV 10 cột sạch ký tự xuống dòng', () => {
      expect(Utils.calculateSimilarity('hello', 'hello')).toBe(1);
      expect(Utils.calculateSimilarity('', 'hello')).toBe(0);
      expect(Utils.calculateSimilarity('apple', 'apples')).toBeGreaterThan(0.7);

      const tsv = Utils.jsonToTsv([
        {
          term: 'apple',
          pronunciation: '/ˈæp.əl/',
          definition: 'quả táo',
          analysis: 'dòng 1\ndòng 2',
          sinoViet: '',
          example: 'An apple a day.',
          image: 'apple',
          partOfSpeech: 'noun',
          topic: 'Food',
          grammar_type: ['noun', 'countable']
        }
      ]);

      const cols = tsv.split('\t');
      expect(cols).toHaveLength(10);
      expect(tsv).not.toContain('\n');
      expect(cols[9]).toBe('noun, countable');
    });
  });

  // --------------------------------------------------------------------------
  // 7. BỘ MÁY GÂY NHIỄU NGOẠI TUYẾN (OFFLINE DISTRACTOR ENGINE)
  // --------------------------------------------------------------------------
  describe('7. OfflineDistractorEngine', () => {
    it('sinh đáp án nhiễu hợp lệ, không trùng đáp án đúng cho cả EN và ZH', () => {
      expect(OfflineDistractorEngine).toBeTruthy();

      const enDeck = [
        { term: 'I like reading books', definition: 'Tôi thích đọc sách' },
        { term: 'She plays the piano', definition: 'Cô ấy chơi đàn piano' },
        { term: 'We go to school', definition: 'Chúng tôi đi học' },
        { term: 'He drinks cold water', definition: 'Anh ấy uống nước lạnh' },
        { term: 'They watch movies together', definition: 'Họ xem phim cùng nhau' }
      ];

      const enDistractors = OfflineDistractorEngine.generate(
        'Tôi thích đọc sách',
        enDeck,
        'en',
        'term'
      );
      expect(Array.isArray(enDistractors)).toBe(true);
      expect(enDistractors.length).toBeGreaterThanOrEqual(3);
      expect(enDistractors).not.toContain('Tôi thích đọc sách');
      expect(new Set(enDistractors).size).toBe(enDistractors.length);

      const zhDeck = [
        { term: '我喜欢看书', definition: 'Tôi thích đọc sách' },
        { term: '他去北京旅游', definition: 'Anh ấy đi Bắc Kinh du lịch' },
        { term: '今天天气很好', definition: 'Thời tiết hôm nay rất đẹp' },
        { term: '我在喝热茶', definition: 'Tôi đang uống trà nóng' },
        { term: '她会说汉语', definition: 'Cô ấy biết nói tiếng Trung' }
      ];

      const zhDistractors = OfflineDistractorEngine.generate(
        '我喜欢看书',
        zhDeck,
        'zh',
        'def'
      );
      expect(Array.isArray(zhDistractors)).toBe(true);
      expect(zhDistractors.length).toBeGreaterThanOrEqual(3);
      expect(zhDistractors).not.toContain('我喜欢看书');
    });
  });
});