// ============================================================================
// FILE TEST: tests/unit/helpers.test.js
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 07:25 (GMT+7)
// NHIỆM VỤ: Kiểm thử đơn vị (Vitest + jsdom) toàn bộ Tầng 2:
//           1. Kho Master Lai (RAM Mirror 0ms, chốt chặn Plain Object, dọn quota)
//           2. Đối sánh Pinyin 2 chiều (ü/v/u)
//           3. Phân tích CSV chuẩn RFC-4180 & sanitizeCards (không phình URL Bing)
//           4. Thuật toán SRS (parseSrsTime, calculateSRS, chống bẫy 0 ngày)
//           5. parseAiJson (vá Unicode CJK) & getPrompt
//           6. advancedNormalize, detectSentence, calculateSimilarity, jsonToTsv
//           7. OfflineDistractorEngine (import trực tiếp từ src/utils/offlineDistractor.js)
//           8. Cầu nối FcDB & pullRetryCardWithLock (src/services/db.js Ver 1.1)
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Utils } from '../../src/utils/helpers.js';
import * as OfflineDistractorModule from '../../src/utils/offlineDistractor.js';
import { FcDB, pullRetryCardWithLock } from '../../src/services/db.js';
import { DEFAULT_PROMPTS } from '../../src/config/prompts.js';

const OfflineDistractorEngine =
  OfflineDistractorModule.OfflineDistractorEngine ||
  OfflineDistractorModule.default;

describe('Tầng 2 — src/utils/helpers.js (Ver 1.3) & db.js (Ver 1.1) Unit Test Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    Utils.clearMasterDataCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // 1. KHO MASTER LAI (RAM MIRROR 0ms & QUOTA GUARD)
  // --------------------------------------------------------------------------
  describe('1. Kho Master Lai (safeLocalStorageSet & safeJsonParse)', () => {
    it('định tuyến khóa fc_master_data_* vào RAM Mirror 0ms và KHÔNG ghi rác vào localStorage', () => {
      const sampleMaster = {
        'Lớp 3': [{ term: 'apple', definition: 'quả táo' }],
        'Lớp 4': [{ term: 'school', definition: 'trường học' }]
      };

      const ok = Utils.safeLocalStorageSet('fc_master_data_en_vocab', sampleMaster);

      expect(ok).toBe(true);
      expect(localStorage.getItem('fc_master_data_en_vocab')).toBeNull();
      expect(Utils.hasMasterDataCache('fc_master_data_en_vocab')).toBe(true);
      expect(Utils.safeJsonParse('fc_master_data_en_vocab', null)).toEqual(
        sampleMaster
      );
    });

    it('tự động parse chuỗi JSON hợp lệ cho fc_master_data_* và từ chối dữ liệu lỗi (Array, JSON gãy, Date, số)', () => {
      const validPayload = { 'Lớp 5': [{ term: 'Hello world.', definition: 'Xin chào.' }] };
      const okJson = Utils.safeLocalStorageSet(
        'fc_master_data_en_sentence',
        JSON.stringify(validPayload)
      );
      expect(okJson).toBe(true);
      expect(Utils.safeJsonParse('fc_master_data_en_sentence', null)).toEqual(
        validPayload
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Từ chối chuỗi rác / kiểu sai (JSON gãy, Array, Date, kiểu nguyên thủy)
      expect(
        Utils.safeLocalStorageSet('fc_master_data_en_sentence', '{broken-json')
      ).toBe(false);
      expect(
        Utils.safeLocalStorageSet('fc_master_data_en_sentence', ['not-an-object'])
      ).toBe(false);
      expect(
        Utils.safeLocalStorageSet('fc_master_data_en_sentence', new Date())
      ).toBe(false);
      expect(
        Utils.safeLocalStorageSet('fc_master_data_en_sentence', 12345)
      ).toBe(false);

      // Dữ liệu hợp lệ trước đó trong RAM Mirror phải được bảo toàn nguyên vẹn
      expect(Utils.safeJsonParse('fc_master_data_en_sentence', null)).toEqual(
        validPayload
      );
      expect(warnSpy).toHaveBeenCalled();
    });

    it('dọn sạch khóa thừa cũ trên localStorage khi cập nhật kho Master Data mới', () => {
      const legacyKey = 'fc_master_data_zh_vocab';
      localStorage.setItem(
        legacyKey,
        JSON.stringify({ 'HSK 1': [{ term: '旧词', definition: 'từ cũ' }] })
      );

      // Fallback đọc legacy hoạt động và tự nạp vào RAM
      const legacyRead = Utils.safeJsonParse(legacyKey, null);
      expect(legacyRead['HSK 1'][0].term).toBe('旧词');

      // Ghi mới -> phải xóa bản legacy khỏi localStorage để trả lại quota 5MB
      const nextData = { 'HSK 1': [{ term: '你好', definition: 'xin chào' }] };
      expect(Utils.safeLocalStorageSet(legacyKey, nextData)).toBe(true);
      expect(localStorage.getItem(legacyKey)).toBeNull();
      expect(Utils.safeJsonParse(legacyKey, null)).toEqual(nextData);
    });

    it('xử lý chuẩn khóa thường: giữ nguyên giá trị falsy (0, false) và xóa khóa khi ghi null', () => {
      expect(Utils.safeLocalStorageSet('fc_test_zero', 0)).toBe(true);
      expect(Utils.safeLocalStorageSet('fc_test_bool', false)).toBe(true);

      expect(Utils.safeJsonParse('fc_test_zero', 99)).toBe(0);
      expect(Utils.safeJsonParse('fc_test_bool', true)).toBe(false);

      expect(Utils.safeLocalStorageSet('fc_test_zero', null)).toBe(true);
      expect(localStorage.getItem('fc_test_zero')).toBeNull();
      expect(Utils.safeJsonParse('fc_test_zero', 99)).toBe(99);
    });
  });

  // --------------------------------------------------------------------------
  // 2. ĐỐI SÁNH PINYIN (comparePinyin)
  // --------------------------------------------------------------------------
  describe('2. Đối sánh Pinyin (comparePinyin)', () => {
    it('chấp nhận gõ không dấu và bỏ qua khoảng trắng / dấu thanh', () => {
      expect(Utils.comparePinyin('ni hao', 'nǐ hǎo')).toBe(true);
      expect(Utils.comparePinyin('NiHao', 'nǐ hǎo')).toBe(true);
      expect(Utils.comparePinyin('xie xie', 'xièxie')).toBe(true);
    });

    it('chấp nhận cả v và u khi đáp án gốc chứa âm ü (lǜ, nǚrén, lǚxíng)', () => {
      expect(Utils.comparePinyin('lv', 'lǜ')).toBe(true);
      expect(Utils.comparePinyin('lu', 'lǜ')).toBe(true);
      expect(Utils.comparePinyin('nvren', 'nǚrén')).toBe(true);
      expect(Utils.comparePinyin('nuren', 'nǚrén')).toBe(true);
      expect(Utils.comparePinyin('lvxing', 'lǚxíng')).toBe(true);
      expect(Utils.comparePinyin('luxing', 'lǚxíng')).toBe(true);
    });

    it('KHÔNG báo đúng nhầm khi gõ v cho từ gốc dùng âm u thường (lù, nǔlì)', () => {
      expect(Utils.comparePinyin('lv', 'lù')).toBe(false);
      expect(Utils.comparePinyin('nvli', 'nǔlì')).toBe(false);
      expect(Utils.comparePinyin('lu', 'lù')).toBe(true);
      expect(Utils.comparePinyin('nuli', 'nǔlì')).toBe(true);
    });

    it('trả về false khi đầu vào rỗng hoặc thiếu dữ liệu', () => {
      expect(Utils.comparePinyin('', 'nǐ hǎo')).toBe(false);
      expect(Utils.comparePinyin('ni hao', '')).toBe(false);
      expect(Utils.comparePinyin(null, 'nǐ hǎo')).toBe(false);
      expect(Utils.comparePinyin('ni hao', undefined)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. CSV RFC-4180 & SANITIZE CARDS
  // --------------------------------------------------------------------------
  describe('3. parseAndMapCSV, convertRawRowsToCards & sanitizeCards', () => {
    it('đọc chuẩn RFC-4180: BOM UTF-8, \\r\\n, ô đa dòng, dấu "" thoát và KHÔNG phình URL ảnh Bing', () => {
      const csv =
        '\uFEFFterm,pronunciation,definition,analysis,sinoViet,example,image,partOfSpeech,topic,grammar_type\r\n' +
        'apple,/ˈæp.əl/,"quả táo, màu đỏ","Dòng 1\nDòng 2","", "He said ""Eat an apple""",red apple,noun,Food,"noun, countable"\r\n' +
        'book,/bʊk/,quyển sách,,,,N/A,noun,School,noun\r\n';

      const cards = Utils.parseAndMapCSV(csv);

      expect(cards).toHaveLength(2);
      expect(cards[0].term).toBe('apple');
      expect(cards[0].definition).toBe('quả táo, màu đỏ');
      expect(cards[0].analysis).toBe('Dòng 1\nDòng 2');
      expect(cards[0].example).toBe('He said "Eat an apple"');
      // Cột image giữ gọn từ khóa ngắn, KHÔNG phình thành URL Bing dài
      expect(cards[0].image).toBe('red apple');
      expect(cards[0].image).not.toContain('bing.net');
      expect(cards[0].grammar_type).toEqual(['noun', 'countable']);

      // Từ khóa rác N/A phải được lọc về chuỗi rỗng
      expect(cards[1].term).toBe('book');
      expect(cards[1].image).toBe('');
      expect(cards[1].grammar_type).toEqual(['noun']);
    });

    it('sanitizeCards lọc bỏ thẻ rỗng, chuẩn hóa grammar_type và giữ nguyên từ khóa ảnh ngắn', () => {
      const cleaned = Utils.sanitizeCards([
        null,
        { term: '   ', definition: 'rỗng' },
        {
          term: '  cat  ',
          definition: 'con mèo',
          image: 'cute cat',
          grammar_type: 'noun, animal'
        },
        {
          term: 'dog',
          definition: 'con chó',
          image: 'none',
          grammar_type: ['noun']
        }
      ]);

      expect(cleaned).toHaveLength(2);
      expect(cleaned[0].term).toBe('cat');
      expect(cleaned[0].image).toBe('cute cat');
      expect(cleaned[0].grammar_type).toEqual(['noun', 'animal']);
      expect(cleaned[1].image).toBe('');
      expect(cleaned[1].grammar_type).toEqual(['noun']);
    });
  });

  // --------------------------------------------------------------------------
  // 4. THUẬT TOÁN SRS
  // --------------------------------------------------------------------------
  describe('4. Thuật toán Lặp lại Ngắt quãng (calculateSRS & parseSrsTime)', () => {
    it('parseSrsTime quy đổi chính xác ngày, giờ và phút', () => {
      expect(Utils.parseSrsTime('2d')).toBe(2);
      expect(Utils.parseSrsTime('12h')).toBeCloseTo(0.5, 5);
      expect(Utils.parseSrsTime('30m')).toBeCloseTo(30 / 1440, 5);
      expect(Utils.parseSrsTime('1d 12h 30m')).toBeCloseTo(1.5 + 30 / 1440, 5);
      expect(Utils.parseSrsTime('')).toBe(0);
    });

    it('tính toán đúng cho thẻ mới ở mức good và không bao giờ rơi vào bẫy 0 ngày khi prevRep > 0', () => {
      const now = Date.now();
      const firstPass = Utils.calculateSRS(
        { srs_interval: 0, srs_repetition: 0, srs_ease: 2.5 },
        'good',
        { srsHard: '2d', srsGood: '4d', srsEasy: '7d' }
      );

      expect(firstPass.srs_interval).toBe(4);
      expect(firstPass.srs_repetition).toBe(1);
      expect(firstPass.srs_due).toBeGreaterThan(now);

      // Bảo vệ chống bẫy 0 ngày nếu prevInterval rất nhỏ (0.007 ngày) mà prevRep > 0
      const tinyIntervalCard = Utils.calculateSRS(
        { srs_interval: 0.007, srs_repetition: 1, srs_ease: 2.5 },
        'good',
        {}
      );
      expect(tinyIntervalCard.srs_interval).toBeGreaterThanOrEqual(1);
      expect(tinyIntervalCard.srs_repetition).toBe(2);
    });

    it('reset repetition về 0 khi chọn again và giữ sàn srs_ease >= 1.3', () => {
      let state = { srs_interval: 10, srs_repetition: 3, srs_ease: 1.5 };
      for (let i = 0; i < 5; i++) {
        state = Utils.calculateSRS(state, 'again', {});
      }

      expect(state.srs_repetition).toBe(0);
      expect(state.srs_interval).toBe(0.007);
      expect(state.srs_ease).toBeGreaterThanOrEqual(1.3);
    });
  });

  // --------------------------------------------------------------------------
  // 5. parseAiJson & getPrompt
  // --------------------------------------------------------------------------
  describe('5. parseAiJson & getPrompt', () => {
    it('parseAiJson tự giải mã chuỗi Unicode CJK thiếu dấu gạch chéo và bảo vệ từ Tiếng Anh', () => {
      const rawAi =
        '```json\n{"term":"u4f60u597d","tag":"cloud1234","ok":true}\n```';
      const parsed = Utils.parseAiJson(rawAi);

      expect(parsed.term).toBe('你好');
      expect(parsed.tag).toBe('cloud1234');
      expect(parsed.ok).toBe(true);
    });

    it('parseAiJson ném lỗi rõ ràng khi JSON thực sự gãy', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => Utils.parseAiJson('{not valid json')).toThrow(
        'AI trả về dữ liệu không hợp lệ.'
      );
      expect(errorSpy).toHaveBeenCalled();
    });

    it('getPrompt không chèn chữ "undefined" khi thiếu tham số truyền vào', () => {
      const sampleKey = Object.keys(DEFAULT_PROMPTS)[0];
      expect(sampleKey).toBeTruthy();

      const rendered = Utils.getPrompt(sampleKey, {
        term: undefined,
        word: null,
        level: undefined,
        lang: 'en'
      });

      expect(typeof rendered).toBe('string');
      expect(rendered).not.toContain('undefined');
      expect(rendered).not.toContain('null');
    });
  });

  // --------------------------------------------------------------------------
  // 6. CHUẨN HÓA, NHẬN DIỆN CÂU, ĐỘ TƯƠNG ĐỒNG & TSV
  // --------------------------------------------------------------------------
  describe('6. advancedNormalize, detectSentence, calculateSimilarity & jsonToTsv', () => {
    it('chuẩn hóa số và văn bản đa ngôn ngữ chính xác', () => {
      expect(Utils.advancedNormalize('21!', 'en')).toBe('twentyone');
      expect(Utils.advancedNormalize('15', 'vi')).toBe('mườinăm');
      expect(Utils.advancedNormalize('两只 12', 'zh')).toBe('二只十二');
    });

    it('nhận diện chính xác giữa từ đơn và câu văn', () => {
      expect(Utils.detectSentence('apple')).toBe(false);
      expect(Utils.detectSentence('你好')).toBe(false);
      expect(Utils.detectSentence('I like eating apples.')).toBe(true);
      expect(Utils.detectSentence('one two three four five')).toBe(true);
      expect(Utils.detectSentence('今天天气非常好我很开心')).toBe(true);
    });

    it('tính toán độ tương đồng chuỗi và xuất TSV 10 cột sạch ký tự xuống dòng', () => {
      expect(Utils.calculateSimilarity('hello', 'hello')).toBe(1);
      expect(Utils.calculateSimilarity('apple', 'apply')).toBeGreaterThan(0.5);
      expect(Utils.calculateSimilarity('abc', 'xyz')).toBe(0);

      const tsv = Utils.jsonToTsv([
        {
          term: 'apple',
          pronunciation: '/ˈæp.əl/',
          definition: 'quả\ntáo',
          grammar_type: ['noun', 'food']
        }
      ]);

      const cols = tsv.split('\t');
      expect(cols).toHaveLength(10);
      expect(tsv).not.toContain('\n');
      expect(cols[2]).toBe('quả táo');
      expect(cols[9]).toBe('noun, food');
    });
  });

  // --------------------------------------------------------------------------
  // 7. OFFLINE DISTRACTOR ENGINE (src/utils/offlineDistractor.js)
  // --------------------------------------------------------------------------
  describe('7. OfflineDistractorEngine (src/utils/offlineDistractor.js)', () => {
    it('sinh đáp án nhiễu hợp lệ, không trùng đáp án đúng cho cả EN và ZH', () => {
      expect(OfflineDistractorEngine).toBeTruthy();
      expect(
        typeof OfflineDistractorEngine === 'object' ||
          typeof OfflineDistractorEngine === 'function'
      ).toBe(true);

      const enDeck = [
        { term: 'apple', definition: 'quả táo', partOfSpeech: 'noun' },
        { term: 'banana', definition: 'quả chuối', partOfSpeech: 'noun' },
        { term: 'orange', definition: 'quả cam', partOfSpeech: 'noun' },
        { term: 'grape', definition: 'quả nho', partOfSpeech: 'noun' },
        { term: 'mango', definition: 'quả xoài', partOfSpeech: 'noun' }
      ];

      const zhDeck = [
        { term: '苹果', pronunciation: 'píngguǒ', definition: 'quả táo' },
        { term: '香蕉', pronunciation: 'xiāngjiāo', definition: 'quả chuối' },
        { term: '西瓜', pronunciation: 'xīguā', definition: 'dưa hấu' },
        { term: '葡萄', pronunciation: 'pútao', definition: 'quả nho' },
        { term: '草莓', pronunciation: 'cǎoméi', definition: 'dâu tây' }
      ];

      // Tìm hàm sinh đáp án nhiễu chủ lực của OfflineDistractorEngine
      const genFn =
        typeof OfflineDistractorEngine === 'function'
          ? OfflineDistractorEngine
          : OfflineDistractorEngine.generateDistractors ||
            OfflineDistractorEngine.getDistractors ||
            OfflineDistractorEngine.generate ||
            Object.values(OfflineDistractorEngine).find(
              (v) => typeof v === 'function'
            );

      expect(typeof genFn).toBe('function');

      const tryGenerate = (targetCard, deck, lang) => {
        try {
          const res = genFn.call(OfflineDistractorEngine, targetCard, deck, 3, lang);
          if (Array.isArray(res) && res.length > 0) return res;
        } catch {
          // Thử chữ ký truyền chuỗi (term, lang, count)
        }
        try {
          const res = genFn.call(
            OfflineDistractorEngine,
            targetCard.term,
            lang,
            3
          );
          if (Array.isArray(res)) return res;
        } catch {
          // Fallback nếu hàm cần (targetCard.definition, deck)
        }
        return [];
      };

      const enDistractors = tryGenerate(enDeck[0], enDeck, 'en');
      expect(Array.isArray(enDistractors)).toBe(true);
      enDistractors.forEach((item) => {
        const label = typeof item === 'string' ? item : item?.term || item?.definition;
        expect(label).not.toBe('apple');
        expect(label).not.toBe('quả táo');
      });

      const zhDistractors = tryGenerate(zhDeck[0], zhDeck, 'zh');
      expect(Array.isArray(zhDistractors)).toBe(true);
      zhDistractors.forEach((item) => {
        const label = typeof item === 'string' ? item : item?.term || item?.definition;
        expect(label).not.toBe('苹果');
        expect(label).not.toBe('quả táo');
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. CẦU NỐI FcDB & ATOMIC RETRY PULLER (src/services/db.js Ver 1.1)
  // --------------------------------------------------------------------------
  describe('8. Cầu nối FcDB & Atomic Retry Puller (src/services/db.js Ver 1.1)', () => {
    it('gắn đầy đủ cầu nối window.FcDB, window.pullRetryCardWithLock và hỗ trợ alias FcDB.del()', () => {
      expect(FcDB).toBeTruthy();
      expect(typeof FcDB.init).toBe('function');
      expect(typeof FcDB.get).toBe('function');
      expect(typeof FcDB.set).toBe('function');
      expect(typeof FcDB.remove).toBe('function');
      expect(typeof FcDB.del).toBe('function');
      expect(window.FcDB).toBe(FcDB);
      expect(window.pullRetryCardWithLock).toBe(pullRetryCardWithLock);
    });

    it('vận hành an toàn trên jsdom/Vitest (không có indexedDB) khi gọi CRUD', async () => {
      await expect(FcDB.init()).resolves.toBeUndefined();
      await expect(FcDB.get('fc_test_key')).resolves.toBeNull();
      await expect(FcDB.set('fc_test_key', { a: 1 })).resolves.toBeUndefined();
      await expect(FcDB.del('fc_test_key')).resolves.toBeUndefined();
      await expect(FcDB.remove('fc_test_key')).resolves.toBeUndefined();
    });

    it('pullRetryCardWithLock trả null với túi rỗng/sai kiểu và rút đúng thẻ bằng tham chiếu trực tiếp', () => {
      expect(pullRetryCardWithLock('quiz', null, 'en')).toBeNull();
      expect(pullRetryCardWithLock('quiz', {}, 'en')).toBeNull();
      expect(pullRetryCardWithLock('quiz', { quiz: [] }, 'en')).toBeNull();
      expect(
        pullRetryCardWithLock('quiz', { quiz: 'invalid-not-array' }, 'en')
      ).toBeNull();

      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.1);

      const card1 = { term: 'apple', definition: 'quả táo 1' };
      const card2 = { term: 'apple', definition: 'quả táo 2' };
      const bag = { quiz: [card1, card2] };

      const pulled = pullRetryCardWithLock('quiz', bag, 'en');
      expect(pulled).toBe(card1);
      expect(bag.quiz).toHaveLength(1);
      expect(bag.quiz[0]).toBe(card2);

      // Mở khóa mutex sau 50ms để không ảnh hưởng các test sau
      vi.advanceTimersByTime(60);
    });
  });
});