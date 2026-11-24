// ============================================================================
// FILE: tests/e2e/smoke.spec.js
// NGUỒN GỐC: Bộ Công cụ Rà soát Lỗi Toàn Ứng dụng (Bước 3B — Playwright E2E)
// PHIÊN BẢN: Ver 1.3
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 10:02 (GMT+7)
// NHIỆM VỤ: Tự động khởi chạy Chromium thật trên http://localhost:3000 để kiểm
//           chứng 4 luồng sống còn (Zero-Crash Verification) với 0 lỗi Runtime:
//           (0) Warm-up Vite cold-start trong beforeAll chống Timeout Test 1
//           (1) Khởi động App -> Nạp đúng Level mặc định (en_level_4 / zh_level_1)
//               -> Hiển thị thẻ 3D -> Lật thẻ -> Chuyển thẻ -> Gõ kiểm tra
//           (2) Chuyển đổi Từ Vựng <-> Câu Văn & EN <-> ZH tách bạch 100%,
//               bền vững sau F5 & giữ localStorage < 2MB (0 rò rỉ fc_master_data_*)
//           (3) Quét mở/đóng an toàn các Modals chính (Settings, API Key,
//               AI Chat, Link Manager, Notebook, Manual Input, Save/Load)
//           (4) Chuyển sang tab Game, kiểm tra sảnh Mini-Games & mở thử ván
//               chơi Offline không vỡ Props rồi quay lại tab Learn trọn vẹn.
// ============================================================================

import { test, expect } from '@playwright/test';

// Cho phép thời gian đủ rộng cho toàn bộ suite khi chạy tuần tự trên Windows
test.describe.configure({ timeout: 90_000 });

// ============================================================================
// 1. BỘ DỮ LIỆU MẪU CÔ LẬP 4 KHO MASTER DATA (KHỚP 100% DEFAULT LEVEL CỦA APP)
//    - EN mặc định: en_level_4 ("Discovery Lớp 6-7") — xem src/hooks/useCoreState.js
//    - ZH mặc định: zh_level_1 — xem src/hooks/useCoreState.js
//    - Mỗi kho có >= 5 thẻ chuẩn 10 cột để các Mini-Games Offline mở ván trơn tru
// ============================================================================

const E2E_DECKS = {
  fc_master_data_en_vocab: {
    en_level_4: [
      {
        term: 'E2E_EN_VOCAB_APPLE',
        pronunciation: '/ˈæp.əl/',
        definition: 'E2E_DEF_EN_APPLE Quả táo đỏ',
        analysis: 'Danh từ đếm được cơ bản dùng kiểm thử E2E',
        sinoViet: '',
        example: 'I eat an apple every morning.',
        image: '',
        partOfSpeech: 'noun',
        topic: 'Food',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_EN_VOCAB_BANANA',
        pronunciation: '/bəˈnɑː.nə/',
        definition: 'E2E_DEF_EN_BANANA Quả chuối vàng',
        analysis: 'Danh từ đếm được chủ đề hoa quả',
        sinoViet: '',
        example: 'She bought a bunch of bananas.',
        image: '',
        partOfSpeech: 'noun',
        topic: 'Food',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_EN_VOCAB_LIBRARY',
        pronunciation: '/ˈlaɪ.brər.i/',
        definition: 'E2E_DEF_EN_LIBRARY Thư viện trường học',
        analysis: 'Danh từ chỉ địa điểm học tập',
        sinoViet: '',
        example: 'Students read quietly in the library.',
        image: '',
        partOfSpeech: 'noun',
        topic: 'School',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_EN_VOCAB_TEACHER',
        pronunciation: '/ˈtiː.tʃər/',
        definition: 'E2E_DEF_EN_TEACHER Giáo viên hướng dẫn',
        analysis: 'Danh từ chỉ nghề nghiệp',
        sinoViet: '',
        example: 'Our teacher explains grammar clearly.',
        image: '',
        partOfSpeech: 'noun',
        topic: 'School',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_EN_VOCAB_MOUNTAIN',
        pronunciation: '/ˈmaʊn.tɪn/',
        definition: 'E2E_DEF_EN_MOUNTAIN Ngọn núi cao',
        analysis: 'Danh từ chỉ địa hình thiên nhiên',
        sinoViet: '',
        example: 'They climbed the high mountain.',
        image: '',
        partOfSpeech: 'noun',
        topic: 'Nature',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_EN_VOCAB_JOURNEY',
        pronunciation: '/ˈdʒɜː.ni/',
        definition: 'E2E_DEF_EN_JOURNEY Hành trình khám phá',
        analysis: 'Danh từ trừu tượng chỉ chuyến đi dài',
        sinoViet: '',
        example: 'Learning is a wonderful journey.',
        image: '',
        partOfSpeech: 'noun',
        topic: 'Travel',
        grammar_type: ['noun']
      }
    ]
  },

  fc_master_data_en_sentence: {
    en_level_4: [
      {
        term: 'E2E_EN_SENTENCE_MORNING Good morning, how are you today?',
        pronunciation: '/ɡʊd ˈmɔː.nɪŋ/',
        definition: 'E2E_DEF_EN_SENTENCE Chào buổi sáng, hôm nay bạn khỏe không?',
        analysis: 'Mẫu câu giao tiếp chào hỏi lịch sự',
        sinoViet: '',
        example: 'Good morning, how are you today?',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Daily',
        grammar_type: ['greeting']
      },
      {
        term: 'E2E_EN_SENTENCE_LIBRARY I study English in the library every afternoon.',
        pronunciation: '/aɪ ˈstʌd.i ˈɪŋ.ɡlɪʃ/',
        definition: 'Tôi học tiếng Anh ở thư viện mỗi buổi chiều.',
        analysis: 'Thì hiện tại đơn diễn tả thói quen',
        sinoViet: '',
        example: 'I study English in the library every afternoon.',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'School',
        grammar_type: ['present_simple']
      },
      {
        term: 'E2E_EN_SENTENCE_WEATHER The weather is sunny and warm today.',
        pronunciation: '/ðə ˈweð.ər ɪz ˈsʌn.i/',
        definition: 'Thời tiết hôm nay nắng và ấm áp.',
        analysis: 'Cấu trúc mô tả thời tiết với to be + tính từ',
        sinoViet: '',
        example: 'The weather is sunny and warm today.',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Nature',
        grammar_type: ['adjective']
      },
      {
        term: 'E2E_EN_SENTENCE_HELP Could you please help me open this door?',
        pronunciation: '/kʊd juː pliːz help miː/',
        definition: 'Bạn có thể vui lòng giúp tôi mở cánh cửa này không?',
        analysis: 'Câu đề nghị lịch sự với Could you please',
        sinoViet: '',
        example: 'Could you please help me open this door?',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Daily',
        grammar_type: ['modal_verb']
      },
      {
        term: 'E2E_EN_SENTENCE_DINNER We are cooking a delicious dinner together.',
        pronunciation: '/wiː ɑːr ˈkʊk.ɪŋ/',
        definition: 'Chúng tôi đang cùng nhau nấu một bữa tối ngon miệng.',
        analysis: 'Thì hiện tại tiếp diễn',
        sinoViet: '',
        example: 'We are cooking a delicious dinner together.',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Food',
        grammar_type: ['present_continuous']
      }
    ]
  },

  fc_master_data_zh_vocab: {
    zh_level_1: [
      {
        term: 'E2E_ZH_VOCAB_NIHAO 你好',
        pronunciation: 'nǐ hǎo',
        definition: 'E2E_DEF_ZH_NIHAO Xin chào',
        analysis: 'Lời chào thông dụng nhất trong tiếng Trung',
        sinoViet: 'NHĨ HẢO',
        example: '你好，很高兴认识你。',
        image: '',
        partOfSpeech: 'greeting',
        topic: 'Basic',
        grammar_type: ['greeting']
      },
      {
        term: 'E2E_ZH_VOCAB_XIEXIE 谢谢',
        pronunciation: 'xiè xie',
        definition: 'E2E_DEF_ZH_XIEXIE Cảm ơn',
        analysis: 'Từ biểu thị lòng biết ơn cơ bản',
        sinoViet: 'TẠ TẠ',
        example: '谢谢你的帮助。',
        image: '',
        partOfSpeech: 'verb',
        topic: 'Basic',
        grammar_type: ['verb']
      },
      {
        term: 'E2E_ZH_VOCAB_XUEXI 学习',
        pronunciation: 'xué xí',
        definition: 'E2E_DEF_ZH_XUEXI Học tập',
        analysis: 'Động từ chỉ hoạt động học hỏi',
        sinoViet: 'HỌC TẬP',
        example: '我喜欢学习汉语。',
        image: '',
        partOfSpeech: 'verb',
        topic: 'School',
        grammar_type: ['verb']
      },
      {
        term: 'E2E_ZH_VOCAB_LAOSHI 老师',
        pronunciation: 'lǎo shī',
        definition: 'E2E_DEF_ZH_LAOSHI Giáo viên',
        analysis: 'Danh từ chỉ thầy cô giáo',
        sinoViet: 'LÃO SƯ',
        example: '王老师很热情。',
        image: '',
        partOfSpeech: 'noun',
        topic: 'School',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_ZH_VOCAB_PENGYOU 朋友',
        pronunciation: 'péng you',
        definition: 'E2E_DEF_ZH_PENGYOU Bạn bè',
        analysis: 'Danh từ chỉ bạn hữu',
        sinoViet: 'BẰNG HỮU',
        example: '他是我的好朋友。',
        image: '',
        partOfSpeech: 'noun',
        topic: 'Daily',
        grammar_type: ['noun']
      },
      {
        term: 'E2E_ZH_VOCAB_PINGGUO 苹果',
        pronunciation: 'píng guǒ',
        definition: 'E2E_DEF_ZH_PINGGUO Quả táo',
        analysis: 'Danh từ chỉ loại quả quen thuộc',
        sinoViet: 'BÌNH QUẢ',
        example: '这个苹果很甜。',
        image: '',
        partOfSpeech: 'noun',
        topic: 'Food',
        grammar_type: ['noun']
      }
    ]
  },

  fc_master_data_zh_sentence: {
    zh_level_1: [
      {
        term: 'E2E_ZH_SENTENCE_STUDY 我每天学习中文。',
        pronunciation: 'wǒ měi tiān xué xí zhōng wén',
        definition: 'E2E_DEF_ZH_SENTENCE Tôi học tiếng Trung mỗi ngày.',
        analysis: 'Cấu trúc Chủ ngữ + Thời gian + Động từ + Tân ngữ',
        sinoViet: 'NGÃ MỖI THIÊN HỌC TẬP TRUNG VĂN',
        example: '我每天学习中文。',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'School',
        grammar_type: ['statement']
      },
      {
        term: 'E2E_ZH_SENTENCE_WEATHER 今天天气非常好。',
        pronunciation: 'jīn tiān tiān qì fēi cháng hǎo',
        definition: 'Thời tiết hôm nay vô cùng đẹp.',
        analysis: 'Câu vị ngữ tính từ với phó từ mức độ 非常',
        sinoViet: 'KIM THIÊN THIÊN KHÍ PHI THƯỜNG HẢO',
        example: '今天天气非常好。',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Nature',
        grammar_type: ['adjective']
      },
      {
        term: 'E2E_ZH_SENTENCE_MEET 很高兴认识你。',
        pronunciation: 'hěn gāo xìng rèn shi nǐ',
        definition: 'Rất vui được làm quen với bạn.',
        analysis: 'Mẫu câu xã giao khi lần đầu gặp mặt',
        sinoViet: 'HÃN CAO HỨNG NHẬN THỨC NHĨ',
        example: '很高兴认识你。',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Daily',
        grammar_type: ['greeting']
      },
      {
        term: 'E2E_ZH_SENTENCE_BOOK 我在图书馆看书。',
        pronunciation: 'wǒ zài tú shū guǎn kàn shū',
        definition: 'Tôi đọc sách ở thư viện.',
        analysis: 'Cấu trúc giới từ chỉ địa điểm 在 + Địa điểm + Động từ',
        sinoViet: 'NGÃ TẠI ĐỒ THƯ QUÁN KHÁN THƯ',
        example: '我在图书馆看书。',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'School',
        grammar_type: ['location']
      },
      {
        term: 'E2E_ZH_SENTENCE_TEA 请喝一杯热茶。',
        pronunciation: 'qǐng hē yī bēi rè chá',
        definition: 'Mời uống một tách trà nóng.',
        analysis: 'Câu cầu khiến lịch sự với 请',
        sinoViet: 'THỈNH HÁT NHẤT BÔI NHIỆT TRÀ',
        example: '请喝一杯热茶。',
        image: '',
        partOfSpeech: 'sentence',
        topic: 'Food',
        grammar_type: ['request']
      }
    ]
  }
};

// ============================================================================
// 2. HÀM HỖ TRỢ: CHẶN NHIỄU MẠNG NGOÀI, BẪY LỖI CRASH & NẠP DỮ LIỆU THỰC TẾ
// ============================================================================

/**
 * Chặn sớm các kết nối mạng ngoài localhost (Google Fonts, CDN, Bing ảnh,
 * Google Sheets, Gemini API) để test chạy nhanh, không treo mạng và cô lập 100%.
 */
async function blockExternalNetworkNoise(page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('http://[::1]') ||
      url.startsWith('ws://localhost') ||
      url.startsWith('ws://127.0.0.1') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('about:')
    ) {
      return route.continue();
    }
    return route.abort();
  });
}

/**
 * Gắn bẫy bắt sống 100% lỗi Runtime chưa xử lý (pageerror) và lỗi React nghiêm trọng trên Console.
 */
function attachCrashTrap(page) {
  const pageErrors = [];
  const fatalConsoleErrors = [];

  const FATAL_PATTERNS = [
    /Uncaught/i,
    /TypeError:/i,
    /ReferenceError:/i,
    /SyntaxError:/i,
    /Maximum update depth exceeded/i,
    /Rendered more hooks than during the previous render/i,
    /Minified React error/i,
    /The above error occurred in the/i
  ];

  const BENIGN_PATTERNS = [
    /net::ERR_/i,
    /Failed to load resource/i,
    /AbortError/i,
    /NotAllowedError/i,
    /speechSynthesis/i,
    /AudioContext/i,
    /favicon/i,
    /Auto load API Key failed/i,
    /fonts\.googleapis/i,
    /jsdelivr/i
  ];

  page.on('pageerror', (err) => {
    pageErrors.push(err?.stack || err?.message || String(err));
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text() || '';
    if (BENIGN_PATTERNS.some((re) => re.test(text))) return;
    if (FATAL_PATTERNS.some((re) => re.test(text))) {
      fatalConsoleErrors.push(text);
    }
  });

  return {
    pageErrors,
    fatalConsoleErrors,
    async assertZeroCrashes() {
      expect(
        pageErrors,
        `Phát hiện PageError (Uncaught Exception):\n${pageErrors.join('\n---\n')}`
      ).toEqual([]);

      expect(
        fatalConsoleErrors,
        `Phát hiện lỗi React/Runtime nghiêm trọng trên Console:\n${fatalConsoleErrors.join('\n---\n')}`
      ).toEqual([]);

      const rootState = await page.evaluate(() => {
        const root = document.getElementById('root');
        const text = (root?.innerText || '').trim();
        return {
          hasRoot: Boolean(root),
          textLength: text.length,
          hasErrorBoundaryText:
            /Đã xảy ra lỗi không mong muốn|Something went wrong|Application Error/i.test(text)
        };
      });

      expect(rootState.hasRoot, 'Phần tử #root không tồn tại trong DOM').toBe(true);
      expect(rootState.textLength, 'Ứng dụng bị trắng màn hình (#root rỗng)').toBeGreaterThan(0);
      expect(
        rootState.hasErrorBoundaryText,
        'Ứng dụng đã rơi vào màn hình lỗi ErrorBoundary'
      ).toBe(false);
    }
  };
}

/**
 * Đợi ứng dụng hydrate xong (giao diện có nút bấm + hiển thị thẻ đánh dấu mong đợi).
 */
async function waitForAppHydrated(page, expectedMarkerText = null) {
  await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 });

  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root) return false;
      const buttons = root.querySelectorAll('button');
      return buttons.length > 0 && (root.innerText || '').trim().length > 10;
    },
    null,
    { timeout: 30_000 }
  );

  if (expectedMarkerText) {
    await expect(page.getByText(expectedMarkerText, { exact: false }).first()).toBeVisible({
      timeout: 20_000
    });
  }
}

/**
 * Nạp 4 Kho Master Lai cô lập vào IndexedDB (qua window.FcDB Ver 1.1) khớp chuẩn
 * khóa Level mặc định của App (`en_level_4` & `zh_level_1`) rồi reload để kiểm chứng
 * toàn bộ chu trình hydrate thực tế từ IndexedDB -> RAM Mirror -> React UI.
 */
async function seedFourMasterDecks(page, initialLang = 'en', initialMode = 'vocab') {
  await blockExternalNetworkNoise(page);

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#root', { state: 'attached', timeout: 30_000 });

  // Đợi cầu nối window.FcDB từ src/services/db.js (Ver 1.1) sẵn sàng
  await page.waitForFunction(
    () =>
      typeof window.FcDB !== 'undefined' &&
      typeof window.FcDB.init === 'function' &&
      typeof window.FcDB.set === 'function',
    null,
    { timeout: 45_000 }
  );

  // Khởi tạo DB, dọn sạch trạng thái cũ và ghi đồng bộ 4 kho Master Data xuống IndexedDB
  await page.evaluate(
    async ({ decks, lang, mode }) => {
      await window.FcDB.init();

      try {
        localStorage.clear();
      } catch {
        // Bỏ qua nếu môi trường chặn clear
      }

      if (window.Utils && typeof window.Utils.clearMasterDataCache === 'function') {
        window.Utils.clearMasterDataCache();
      }

      for (const [key, value] of Object.entries(decks)) {
        await window.FcDB.set(key, value);
      }

      // Khởi tạo trạng thái điều hướng khớp chính xác với src/hooks/useCoreState.js
      localStorage.setItem('fc_lang', JSON.stringify(lang));
      localStorage.setItem('fc_ui_lang', JSON.stringify('vi'));
      localStorage.setItem('fc_data_mode', mode === 'sentence' ? 'sentence' : 'vocab');
      localStorage.setItem('fc_current_level_en', JSON.stringify(['en_level_4']));
      localStorage.setItem('fc_current_level_zh', JSON.stringify(['zh_level_1']));
      localStorage.setItem('fc_current_topic_en', JSON.stringify([]));
      localStorage.setItem('fc_current_topic_zh', JSON.stringify([]));
    },
    { decks: E2E_DECKS, lang: initialLang, mode: initialMode }
  );

  // Tải lại trang để buộc App chạy luồng hydrate thật từ IndexedDB
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

  const expectedFirstMarker =
    initialLang === 'zh'
      ? initialMode === 'sentence'
        ? 'E2E_ZH_SENTENCE_STUDY'
        : 'E2E_ZH_VOCAB_NIHAO'
      : initialMode === 'sentence'
        ? 'E2E_EN_SENTENCE_MORNING'
        : 'E2E_EN_VOCAB_APPLE';

  await waitForAppHydrated(page, expectedFirstMarker);
}

/**
 * Đóng an toàn Modal đang mở (thử phím Escape trước, sau đó tìm nút Đóng / dấu X bên trong Modal).
 */
async function closeActiveModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const modalOverlay = page.locator('div.fixed.inset-0').last();
  if (!(await modalOverlay.isVisible().catch(() => false))) {
    return;
  }

  // Ưu tiên nút có nhãn đóng rõ ràng bên trong hộp thoại
  const namedCloseBtn = modalOverlay
    .getByRole('button', { name: /^(Đóng|Close|Hủy|Cancel|×|✕|X)$/i })
    .first();
  if (await namedCloseBtn.isVisible().catch(() => false)) {
    await namedCloseBtn.click({ force: true });
    await page.waitForTimeout(250);
    if (!(await modalOverlay.isVisible().catch(() => false))) return;
  }

  // Dự phòng: nút icon ở thanh tiêu đề của Modal (thường có title/aria-label)
  const titleCloseBtn = modalOverlay
    .locator('button[title*="Đóng" i], button[title*="Close" i], button[aria-label*="Close" i]')
    .first();
  if (await titleCloseBtn.isVisible().catch(() => false)) {
    await titleCloseBtn.click({ force: true });
    await page.waitForTimeout(250);
    if (!(await modalOverlay.isVisible().catch(() => false))) return;
  }

  // Dự phòng cuối: tìm nút icon-only (không có chữ) ở góc trên bên phải phần tiêu đề modal
  const headerIconClose = modalOverlay.locator('button').filter({ hasText: /^$/ }).first();
  if (await headerIconClose.isVisible().catch(() => false)) {
    await headerIconClose.click({ force: true });
    await page.waitForTimeout(250);
  }
}

// ============================================================================
// 3. BỘ 4 KỊCH BẢN E2E SMOKE TEST (ZERO-CRASH VERIFICATION)
// ============================================================================

test.describe('Flashcard 3D — E2E Smoke Test Suite (Zero-Crash Verification)', () => {
  // Pha làm nóng Vite Dev Server trước Test 1 để triệt tiêu lỗi Timeout cold-start Windows
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await blockExternalNetworkNoise(page);
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 100_000 });
      await page.waitForFunction(
        () =>
          typeof window.FcDB !== 'undefined' &&
          typeof window.FcDB.init === 'function',
        null,
        { timeout: 60_000 }
      );
    } finally {
      await context.close();
    }
  });

  test('1. Khởi động App, hiển thị thẻ học 3D, lật thẻ, chuyển thẻ và giữ 0 lỗi Runtime', async ({
    page
  }) => {
    const trap = attachCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');

    // 1. Xác nhận thẻ đầu tiên của kho EN Vocab (en_level_4) hiển thị rõ ràng
    const firstCardText = page.getByText('E2E_EN_VOCAB_APPLE', { exact: false }).first();
    await expect(firstCardText).toBeVisible({ timeout: 15_000 });

    // Kiểm tra ô chỉ số thẻ đã mở khóa (không bị disabled 0 / 0) và đang ở thẻ số 1
    const cardIndexInput = page.getByRole('textbox', { name: /Nhập số để chuyển thẻ/i }).first();
    if (await cardIndexInput.isVisible().catch(() => false)) {
      await expect(cardIndexInput).toBeEnabled({ timeout: 10_000 });
      await expect(cardIndexInput).toHaveValue('1', { timeout: 10_000 });
    }

    // 2. Thử lật thẻ 3D bằng cú nhấp trực tiếp vào mặt thẻ (dự phòng phím Space)
    await firstCardText.click({ force: true });
    await page.waitForTimeout(350);

    const defLocator = page.getByText('E2E_DEF_EN_APPLE', { exact: false }).first();
    const isDefVisibleAfterClick = await defLocator.isVisible().catch(() => false);
    if (!isDefVisibleAfterClick) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(350);
    }
    await expect(defLocator).toBeVisible({ timeout: 8_000 });

    // 3. Chuyển sang thẻ thứ 2 bằng nút "Next" trên thanh điều khiển
    const nextBtn = page.getByRole('button', { name: /^(Next|Sau|Tiếp)$/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
    } else {
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.getByText('E2E_EN_VOCAB_BANANA', { exact: false }).first()).toBeVisible({
      timeout: 10_000
    });

    if (await cardIndexInput.isVisible().catch(() => false)) {
      await expect(cardIndexInput).toHaveValue('2', { timeout: 10_000 });
    }

    // 4. Kiểm tra ô nhập luyện gõ từ vựng hoạt động không lỗi
    const typingInput = page.getByPlaceholder(/Gõ lại từ vựng|Type/i).first();
    if (await typingInput.isVisible().catch(() => false)) {
      await typingInput.fill('E2E_EN_VOCAB_BANANA');
      await expect(typingInput).toHaveValue('E2E_EN_VOCAB_BANANA');
    }

    await trap.assertZeroCrashes();
  });

  test('2. Chuyển đổi Từ Vựng <-> Câu Văn và EN <-> ZH tách bạch 100%, giữ nguyên sau F5 & localStorage < 2MB', async ({
    page
  }) => {
    const trap = attachCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');

    // A. Đang ở EN + Từ Vựng: chỉ thấy thẻ EN Vocab, tuyệt đối không lẫn EN Sentence
    await expect(page.getByText('E2E_EN_VOCAB_APPLE', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('E2E_EN_SENTENCE_MORNING', { exact: false })).toHaveCount(0);

    // B. Chuyển sang Câu Văn (EN Sentence) — khóa chặt đầu cuối tránh bấm nhầm nút khác
    const sentenceBtn = page
      .getByRole('button', { name: /^(Câu Văn|Sentence|Sentences|句子)$/i })
      .first();
    await expect(sentenceBtn).toBeVisible({ timeout: 10_000 });
    await sentenceBtn.click();

    await expect(
      page.getByText('E2E_EN_SENTENCE_MORNING', { exact: false }).first()
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText('E2E_EN_VOCAB_APPLE', { exact: false })).toHaveCount(0);

    // C. Bấm F5 (Reload) -> Xác nhận vẫn giữ nguyên EN Câu Văn
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForAppHydrated(page, 'E2E_EN_SENTENCE_MORNING');
    await expect(page.getByText('E2E_EN_VOCAB_APPLE', { exact: false })).toHaveCount(0);

    // D. Chuyển ngôn ngữ EN -> ZH (hỗ trợ cả nút bấm đổi trực tiếp lẫn dropdown)
    const langBtn = page.getByRole('button', { name: /^EN$/i }).first();
    await expect(langBtn).toBeVisible({ timeout: 10_000 });
    await langBtn.click();
    await page.waitForTimeout(300);

    const zhOption = page.getByRole('button', { name: /^(ZH|CN|Tiếng Trung|中文)/i }).first();
    const alreadySwitched = await page
      .getByText('E2E_ZH_SENTENCE_STUDY', { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (!alreadySwitched && (await zhOption.isVisible().catch(() => false))) {
      await zhOption.click();
    }

    await expect(
      page.getByText('E2E_ZH_SENTENCE_STUDY', { exact: false }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('E2E_EN_SENTENCE_MORNING', { exact: false })).toHaveCount(0);

    // E. Chuyển từ Câu Văn -> Từ Vựng trong Tiếng Trung (ZH Vocab)
    // Khóa chặt ^...$ để TUYỆT ĐỐI không khớp nhầm nút "Vocabulary Notebook" trên Header
    const vocabBtn = page
      .getByRole('button', { name: /^(Từ Vựng|Vocab|Vocabulary|词汇)$/i })
      .first();
    await expect(vocabBtn).toBeVisible({ timeout: 10_000 });
    await vocabBtn.click();

    await expect(page.getByText('E2E_ZH_VOCAB_NIHAO', { exact: false }).first()).toBeVisible({
      timeout: 12_000
    });
    await expect(page.getByText('E2E_ZH_SENTENCE_STUDY', { exact: false })).toHaveCount(0);

    // F. Bấm F5 lần 2 -> Xác nhận bền vững ở ZH Từ Vựng
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForAppHydrated(page, 'E2E_ZH_VOCAB_NIHAO');

    // G. Kiểm định nghiêm ngặt Quota localStorage < 2MB & 0 khóa fc_master_data_* rò rỉ
    const storageAudit = await page.evaluate(() => {
      let totalBytes = 0;
      const leakedMasterKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key) || '';
        totalBytes += (key.length + val.length) * 2;
        if (key.startsWith('fc_master_data_')) {
          leakedMasterKeys.push(key);
        }
      }
      return { totalBytes, leakedMasterKeys };
    });

    expect(
      storageAudit.leakedMasterKeys,
      `Phát hiện kho Master Data bị rò rỉ ra localStorage: ${storageAudit.leakedMasterKeys.join(', ')}`
    ).toEqual([]);
    expect(
      storageAudit.totalBytes,
      `Dung lượng localStorage vượt ngưỡng an toàn 2MB (${storageAudit.totalBytes} bytes)`
    ).toBeLessThan(2 * 1024 * 1024);

    await trap.assertZeroCrashes();
  });

  test('3. Quét mở/đóng các Modals chính (Settings, API Key, AI Chat, Link Manager, Notebook) không crash', async ({
    page
  }) => {
    const trap = attachCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');

    // Danh sách nút mở Modal khớp 100% nhãn thực tế trên AppHeader & BottomNav
    const modalTriggers = [
      { label: 'Settings', pattern: /^Settings$|Cài đặt/i },
      { label: 'API Key', pattern: /^API Key$/i },
      { label: 'AI Chat', pattern: /^AI Chat$/i },
      { label: 'Link Manager (Import/Export)', pattern: /Import\/Export|Quản lý Link/i },
      { label: 'Vocabulary Notebook', pattern: /Vocabulary Notebook|Sổ tay từ vựng/i },
      { label: 'Manual Input', pattern: /Thêm thẻ thủ công|Manual/i },
      { label: 'Save/Load Backup', pattern: /Sao lưu & Phục hồi|Backup/i }
    ];

    let openedCount = 0;

    for (const item of modalTriggers) {
      const btn = page.getByRole('button', { name: item.pattern }).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;

      await btn.click({ force: true });
      await page.waitForTimeout(350);
      openedCount++;

      // Xác nhận mở Modal không gây sập trang hay lỗi Runtime
      await trap.assertZeroCrashes();

      // Đóng Modal sạch sẽ trước khi mở Modal tiếp theo
      await closeActiveModal(page);
    }

    expect(
      openedCount,
      'Phải mở và kiểm tra được tối thiểu 4 hộp thoại chính trên giao diện'
    ).toBeGreaterThanOrEqual(4);

    // Xác nhận quay lại trạng thái màn hình học nguyên vẹn
    await expect(page.getByText('E2E_EN_VOCAB_APPLE', { exact: false }).first()).toBeVisible({
      timeout: 10_000
    });

    await trap.assertZeroCrashes();
  });

  test('4. Chuyển sang tab Game, kiểm tra sảnh Mini-Games & mở thử ván chơi Offline không vỡ Props', async ({
    page
  }) => {
    const trap = attachCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');

    // 1. Chuyển sang tab Game từ thanh BottomNav (khóa chặt nhãn để không chạm nút khác)
    const gameNavBtn = page.getByRole('button', { name: /^(Game|Trò chơi)$/i }).last();
    await expect(gameNavBtn).toBeVisible({ timeout: 10_000 });
    await gameNavBtn.click();
    await page.waitForTimeout(500);

    // Xác nhận sảnh GameMenu đã hiển thị đủ nội dung
    const menuTextLen = await page.evaluate(
      () => (document.getElementById('root')?.innerText || '').trim().length
    );
    expect(menuTextLen, 'Sảnh Mini-Games bị rỗng').toBeGreaterThan(30);
    await trap.assertZeroCrashes();

    // 2. Chọn mở thử 1 Mini-Game Offline tiêu biểu (Quiz / Trắc nghiệm, dự phòng Match / Scramble)
    const candidateGameBtn = page
      .getByRole('button', { name: /Trắc nghiệm|Quiz|Ghép đôi|Match|Xếp chữ|Scramble/i })
      .first();

    if (await candidateGameBtn.isVisible().catch(() => false)) {
      await candidateGameBtn.click({ force: true });
      await page.waitForTimeout(500);
      await trap.assertZeroCrashes();

      // Nếu vào màn hình Setup/Cấu hình của Mini-Game -> Bấm "Bắt đầu" để vào ván chơi thực
      const startBtn = page
        .getByRole('button', { name: /Bắt đầu|Start|Chơi ngay|Play/i })
        .first();
      if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click({ force: true });
        await page.waitForTimeout(800);
        await trap.assertZeroCrashes();
      }

      const activeGameTextLen = await page.evaluate(
        () => (document.getElementById('root')?.innerText || '').trim().length
      );
      expect(activeGameTextLen, 'Màn hình ván chơi Mini-Game bị trắng').toBeGreaterThan(15);
    }

    // 3. Thoát ván chơi (nếu đang ẩn thanh BottomNav) và quay về tab Learn xác nhận phục hồi trơn tru
    // Khóa chặt ^...$ để không bấm nhầm các nút trong Game chứa chữ "Học"
    const learnNavBtn = page.getByRole('button', { name: /^(Learn|Học)$/i }).last();
    if (!(await learnNavBtn.isVisible().catch(() => false))) {
      for (let step = 0; step < 3; step++) {
        const backBtn = page
          .getByRole('button', { name: /Quay lại|Thoát|Menu|Back|Exit/i })
          .first();
        if (await backBtn.isVisible().catch(() => false)) {
          await backBtn.click({ force: true });
          await page.waitForTimeout(400);
        }
        if (await learnNavBtn.isVisible().catch(() => false)) break;
      }
    }

    if (await learnNavBtn.isVisible().catch(() => false)) {
      await learnNavBtn.click({ force: true });
      await expect(page.getByText(/E2E_EN_VOCAB_/).first()).toBeVisible({
        timeout: 12_000
      });
    }

    await trap.assertZeroCrashes();
  });
});