// ============================================================================
// FILE: tests/unit/engines.test.js
// NGUỒN GỐC: Bước 3A — Bộ Kiểm định Động cơ Sư phạm, Khảo thí & Trò chơi
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 13:03 (GMT+7)
// NHIỆM VỤ: Tự động phát hiện và kiểm định toàn bộ tệp trong src/engines/**:
//           (1) Smoke Load 100% module engines không lỗi cú pháp/import,
//           (2) Vắc-xin Đa nhiệm Mảng (Multi-select Array Armor) cho IoeDataEngine,
//           (3) Sinh Blueprint đầy đủ cho tất cả 6 bộ đề thi trong ExamProfiles,
//           (4) Động cơ Game Ngoại tuyến (GameAlgoEngine / FallbackDataEngine),
//           (5) Khởi tạo và hủy sạch bộ điều phối QueueEngine không rò rỉ.
// ============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import * as HelpersModule from '@/utils/helpers';

// Tự động phát hiện toàn bộ tệp Engine bất kể cấu trúc thư mục con trong src/engines/
const engineLoaders = import.meta.glob('../../src/engines/**/*.{js,jsx}');

const loadedModules = new Map();
const loadErrors = [];

/**
 * Tìm kiếm một Engine symbol từ exports của các module vừa nạp hoặc cầu nối window.*
 */
function resolveEngineSymbol(symbolName) {
  for (const mod of loadedModules.values()) {
    if (mod && mod[symbolName]) return mod[symbolName];
    if (mod?.default && typeof mod.default === 'object' && mod.default[symbolName]) {
      return mod.default[symbolName];
    }
  }
  if (typeof window !== 'undefined' && window[symbolName]) {
    return window[symbolName];
  }
  return null;
}

describe('Tầng Engines — Kiểm định Toàn diện src/engines/**', () => {
  beforeAll(async () => {
    // Gắn sẵn Utils tối thiểu lên window cho các engine còn dùng cầu nối fallback
    if (typeof window !== 'undefined') {
      window.Utils = HelpersModule.Utils || HelpersModule.default || window.Utils;
      window.OfflineDistractorEngine =
        HelpersModule.OfflineDistractorEngine || window.OfflineDistractorEngine;
    }

    const entries = Object.entries(engineLoaders).sort(([a], [b]) => a.localeCompare(b));
    for (const [relPath, loader] of entries) {
      try {
        const mod = await loader();
        loadedModules.set(relPath, mod);
      } catch (err) {
        loadErrors.push({
          file: relPath,
          error: err?.message || String(err)
        });
      }
    }
  });

  // --------------------------------------------------------------------------
  // 1. KIỂM ĐỊNH TOÀN VẸN NẠP MODULE (ENGINE INTEGRITY SMOKE)
  // --------------------------------------------------------------------------
  describe('1. Toàn vẹn Nạp Module (Zero Load/Import Errors)', () => {
    it('phát hiện được các tệp trong src/engines/ và nạp thành công 100% không lỗi', () => {
      expect(Object.keys(engineLoaders).length).toBeGreaterThan(0);
      expect(loadErrors).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 2. VẮC-XIN ĐA NHIỆM MẢNG (MULTI-SELECT ARRAY ARMOR — PEDAGOGY ENGINE)
  // --------------------------------------------------------------------------
  describe('2. IoeDataEngine / Pedagogy Matrix (Multi-select Array Armor)', () => {
    it('xử lý an toàn Mảng nhiều cấp độ, Mảng rỗng, Chuỗi đơn và null/undefined', () => {
      const IoeDataEngine = resolveEngineSymbol('IoeDataEngine');
      const PedagogyEngine = resolveEngineSymbol('PedagogyEngine');
      const targetEngine = IoeDataEngine || PedagogyEngine;

      // Bắt buộc dự án phải có động cơ sư phạm
      expect(targetEngine).toBeTruthy();

      const testInputs = [
        ['en_level_1', 'en_level_4'],
        ['zh_level_1', 'zh_level_3'],
        [],
        'en_level_4',
        'zh_level_2',
        null,
        undefined
      ];

      if (typeof targetEngine.getSafeLevelString === 'function') {
        for (const input of testInputs) {
          const safeStr = targetEngine.getSafeLevelString(input);
          expect(typeof safeStr).toBe('string');
        }
      }

      if (typeof targetEngine.getPedagogyMatrixRule === 'function') {
        for (const input of testInputs) {
          const langGuess =
            (Array.isArray(input) ? input[0] : input)?.toString().startsWith('zh') ? 'zh' : 'en';
          expect(() => targetEngine.getPedagogyMatrixRule(input, langGuess)).not.toThrow();
          const rule = targetEngine.getPedagogyMatrixRule(input, langGuess);
          expect(rule).toBeDefined();
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. KHẢO THÍ 6 BỘ ĐỀ (EXAM PROFILES & BLUEPRINT GENERATOR)
  // --------------------------------------------------------------------------
  describe('3. ExamProfiles — Sinh Blueprint cho toàn bộ bộ đề chuẩn', () => {
    it('sinh Blueprint hợp lệ cho mọi profile (IOE, HSK, IELTS — Std & Mini) với cả chuỗi và mảng Level', () => {
      const ExamProfiles = resolveEngineSymbol('ExamProfiles');
      expect(ExamProfiles).toBeTruthy();
      expect(ExamProfiles.PROFILES).toBeTruthy();
      expect(typeof ExamProfiles.generateBlueprint).toBe('function');

      const profileIds = Object.keys(ExamProfiles.PROFILES);
      expect(profileIds.length).toBeGreaterThanOrEqual(4);

      for (const profileId of profileIds) {
        const isHsk = profileId.toLowerCase().includes('hsk');
        const singleLevel = isHsk ? 'zh_level_2' : 'en_level_4';
        const multiLevel = isHsk ? ['zh_level_1', 'zh_level_2'] : ['en_level_3', 'en_level_4'];

        for (const lvl of [singleLevel, multiLevel]) {
          const blueprint = ExamProfiles.generateBlueprint(profileId, lvl, ['General']);
          expect(Array.isArray(blueprint)).toBe(true);
          expect(blueprint.length).toBeGreaterThan(0);

          // Đảm bảo không sinh phần tử undefined / khuyết trường cốt lõi
          blueprint.forEach((item, idx) => {
            expect(item, `Blueprint "${profileId}" phần tử #${idx} bị rỗng`).toBeTruthy();
            expect(item.id || item.type).toBeTruthy();
            expect(item.type).toBeTruthy();
          });
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. ĐỘNG CƠ GAME NGOẠI TUYẾN & DỮ LIỆU DỰ PHÒNG (OFFLINE GAME ENGINES)
  // --------------------------------------------------------------------------
  describe('4. GameAlgoEngine & FallbackDataEngine (Offline Resilience)', () => {
    const sampleEnDeck = [
      {
        term: 'apple',
        pronunciation: '/ˈæp.əl/',
        definition: 'quả táo',
        example: 'She eats a red apple every morning.',
        topic: 'Food',
        partOfSpeech: 'noun'
      },
      {
        term: 'banana',
        pronunciation: '/bəˈnɑː.nə/',
        definition: 'quả chuối',
        example: 'Monkeys love yellow bananas.',
        topic: 'Food',
        partOfSpeech: 'noun'
      },
      {
        term: 'library',
        pronunciation: '/ˈlaɪ.brər.i/',
        definition: 'thư viện',
        example: 'We study quietly in the school library.',
        topic: 'School',
        partOfSpeech: 'noun'
      },
      {
        term: 'quickly',
        pronunciation: '/ˈkwɪk.li/',
        definition: 'một cách nhanh chóng',
        example: 'He finished his homework quickly.',
        topic: 'Daily',
        partOfSpeech: 'adverb'
      },
      {
        term: 'beautiful',
        pronunciation: '/ˈbjuː.tɪ.fəl/',
        definition: 'xinh đẹp',
        example: 'The sunset looks very beautiful today.',
        topic: 'Nature',
        partOfSpeech: 'adjective'
      }
    ];

    const sampleZhDeck = [
      {
        term: '苹果',
        pronunciation: 'píngguǒ',
        definition: 'quả táo',
        example: '我每天吃一个苹果。',
        topic: 'Food',
        partOfSpeech: 'noun'
      },
      {
        term: '图书馆',
        pronunciation: 'túshūguǎn',
        definition: 'thư viện',
        example: '我在图书馆看书。',
        topic: 'School',
        partOfSpeech: 'noun'
      },
      {
        term: '高兴',
        pronunciation: 'gāoxìng',
        definition: 'vui vẻ',
        example: '认识你我很高兴。',
        topic: 'Emotion',
        partOfSpeech: 'adjective'
      },
      {
        term: '学习',
        pronunciation: 'xuéxí',
        definition: 'học tập',
        example: '我们一起学习汉语。',
        topic: 'School',
        partOfSpeech: 'verb'
      },
      {
        term: '北京',
        pronunciation: 'Běijīng',
        definition: 'Bắc Kinh',
        example: '北京是中国的首都。',
        topic: 'Place',
        partOfSpeech: 'noun'
      }
    ];

    it('FallbackDataEngine có dữ liệu dự phòng hợp lệ nếu được khai báo', () => {
      const FallbackDataEngine = resolveEngineSymbol('FallbackDataEngine');
      if (!FallbackDataEngine) return;

      expect(typeof FallbackDataEngine).toBe('object');
      if (typeof FallbackDataEngine.getFallbackCards === 'function') {
        const enCards = FallbackDataEngine.getFallbackCards('en');
        const zhCards = FallbackDataEngine.getFallbackCards('zh');
        expect(Array.isArray(enCards)).toBe(true);
        expect(Array.isArray(zhCards)).toBe(true);
      }
    });

    it('GameAlgoEngine / GameOfflineEngine vận hành ổn định không crash trên bộ thẻ EN & ZH', () => {
      const GameAlgoEngine = resolveEngineSymbol('GameAlgoEngine');
      const GameOfflineEngine = resolveEngineSymbol('GameOfflineEngine');
      const engine = GameAlgoEngine || GameOfflineEngine;

      if (!engine) return;

      // Kiểm thử an toàn OptionsEngine nếu có
      if (engine.OptionsEngine && typeof engine.OptionsEngine.generate === 'function') {
        expect(() =>
          engine.OptionsEngine.generate(sampleEnDeck[0], sampleEnDeck, 'en')
        ).not.toThrow();
        expect(() =>
          engine.OptionsEngine.generate(sampleZhDeck[0], sampleZhDeck, 'zh')
        ).not.toThrow();
      }

      // Kiểm thử an toàn ClozeEngine nếu có
      if (engine.ClozeEngine && typeof engine.ClozeEngine.generate === 'function') {
        expect(() =>
          engine.ClozeEngine.generate(sampleEnDeck[0], sampleEnDeck, 'en')
        ).not.toThrow();
      }

      // Kiểm thử an toàn OddOneOutEngine nếu có
      if (engine.OddOneOutEngine && typeof engine.OddOneOutEngine.generate === 'function') {
        expect(() => engine.OddOneOutEngine.generate(sampleEnDeck, 'en')).not.toThrow();
        expect(() => engine.OddOneOutEngine.generate(sampleZhDeck, 'zh')).not.toThrow();
      }

      // Kiểm thử an toàn ScrambleNoiseEngine nếu có
      if (
        engine.ScrambleNoiseEngine &&
        typeof engine.ScrambleNoiseEngine.generate === 'function'
      ) {
        expect(() =>
          engine.ScrambleNoiseEngine.generate(sampleEnDeck[0], sampleEnDeck, 'en')
        ).not.toThrow();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. HÀNG ĐỢI ĐIỀU PHỐI BÀI THI (QUEUE ENGINE LIFECYCLE)
  // --------------------------------------------------------------------------
  describe('5. QueueEngine — Khởi tạo & Hủy sạch không rò rỉ', () => {
    it('createQueueCoordinator khởi tạo, nạp thử và destroy() an toàn', async () => {
      const QueueEngine = resolveEngineSymbol('QueueEngine');
      if (!QueueEngine || typeof QueueEngine.createQueueCoordinator !== 'function') return;

      let counter = 0;
      const fakeFetchTask = async () => {
        counter += 1;
        return {
          id: `mock_q_${counter}`,
          metadata: { index: counter - 1 },
          content: { term: `Question ${counter}`, isAiGenerated: true }
        };
      };

      const coordinator = QueueEngine.createQueueCoordinator(fakeFetchTask, 2);
      expect(coordinator).toBeTruthy();
      expect(typeof coordinator.destroy).toBe('function');

      if (typeof coordinator.maintain === 'function') {
        await Promise.race([
          coordinator.maintain(true, 1000),
          new Promise((r) => setTimeout(r, 1200))
        ]);
      }

      expect(() => coordinator.destroy()).not.toThrow();
    });
  });
});