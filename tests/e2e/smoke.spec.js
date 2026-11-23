// ============================================================================
// FILE: tests/e2e/smoke.spec.js
// NGUỒN GỐC: Bước 3B — Bot Smoke Test Tự động Toàn App (Playwright Chromium)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 13:08 (GMT+7)
// NHIỆM VỤ: Tự động kiểm thử 4 luồng sống còn trên Chrome thật:
//           (1) Khởi động & Học Thẻ 3D (Lật thẻ, chuyển thẻ, ô nhập từ),
//           (2) Khóa hồi quy Từ Vựng <-> Câu Văn, EN <-> CN, F5 & Quota < 2MB,
//           (3) Quét mở/đóng các Modals chính (Settings, API Key, AI Chat, Link),
//           (4) Quét Tầng Game (Vào sảnh Game & mở thử Mini-Game Offline).
//           Đánh chặn 100% lỗi Uncaught PageError / React Crash ở mọi kịch bản.
// ============================================================================

import { test, expect } from '@playwright/test';

// ============================================================================
// BỘ DỮ LIỆU MẪU ĐẶC CHỦNG CHO KIỂM THỬ E2E (TÁCH BẠCH 4 KHO MASTER)
// ============================================================================
const SEED_EN_VOCAB = {
  en_level_4: [
    { term: 'E2E_EN_VOCAB_APPLE', pronunciation: '/ˈæp.əl/', definition: 'quả táo mẫu', example: 'I eat an apple.', topic: 'E2E_Food', partOfSpeech: 'noun' },
    { term: 'E2E_EN_VOCAB_BOOK', pronunciation: '/bʊk/', definition: 'quyển sách mẫu', example: 'Read this book.', topic: 'E2E_School', partOfSpeech: 'noun' },
    { term: 'E2E_EN_VOCAB_WATER', pronunciation: '/ˈwɔː.tər/', definition: 'nước uống mẫu', example: 'Drink cold water.', topic: 'E2E_Food', partOfSpeech: 'noun' },
    { term: 'E2E_EN_VOCAB_TRAIN', pronunciation: '/treɪn/', definition: 'tàu hỏa mẫu', example: 'Catch the train.', topic: 'E2E_Travel', partOfSpeech: 'noun' },
    { term: 'E2E_EN_VOCAB_MUSIC', pronunciation: '/ˈmjuː.zɪk/', definition: 'âm nhạc mẫu', example: 'Listen to music.', topic: 'E2E_Art', partOfSpeech: 'noun' },
    { term: 'E2E_EN_VOCAB_HAPPY', pronunciation: '/ˈhæp.i/', definition: 'vui vẻ mẫu', example: 'She feels happy.', topic: 'E2E_Mood', partOfSpeech: 'adjective' }
  ]
};

const SEED_EN_SENTENCE = {
  en_level_4: [
    { term: 'E2E_EN_SENTENCE_ALPHA.', pronunciation: '', definition: 'Câu văn tiếng Anh kiểm thử số 1', example: '', topic: 'E2E_Daily', partOfSpeech: 'sentence' },
    { term: 'E2E_EN_SENTENCE_BETA.', pronunciation: '', definition: 'Câu văn tiếng Anh kiểm thử số 2', example: '', topic: 'E2E_Daily', partOfSpeech: 'sentence' }
  ]
};

const SEED_ZH_VOCAB = {
  zh_level_1: [
    { term: 'E2E中文词汇一', pronunciation: 'cíhuì yī', definition: 'Từ vựng tiếng Trung mẫu 1', example: '学习词汇', topic: 'E2E_ZhVocab', partOfSpeech: 'noun' },
    { term: 'E2E中文词汇二', pronunciation: 'cíhuì èr', definition: 'Từ vựng tiếng Trung mẫu 2', example: '复习词汇', topic: 'E2E_ZhVocab', partOfSpeech: 'noun' }
  ]
};

const SEED_ZH_SENTENCE = {
  zh_level_1: [
    { term: 'E2E中文句子测试一。', pronunciation: 'jùzi yī', definition: 'Câu văn tiếng Trung mẫu 1', example: '', topic: 'E2E_ZhSent', partOfSpeech: 'sentence' },
    { term: 'E2E中文句子测试二。', pronunciation: 'jùzi èr', definition: 'Câu văn tiếng Trung mẫu 2', example: '', topic: 'E2E_ZhSent', partOfSpeech: 'sentence' }
  ]
};

// Các mẫu lỗi Console nghiêm trọng từ React/JS (bỏ qua cảnh báo mạng ngoài khi offline)
const FATAL_CONSOLE_PATTERNS = [
  /Uncaught\s+(TypeError|ReferenceError|RangeError|SyntaxError)/i,
  /Cannot read properties of (null|undefined)/i,
  /is not a function/i,
  /Maximum update depth exceeded/i,
  /Invalid hook call/i,
  /The above error occurred in the/i,
  /ErrorBoundary/i
];

/**
 * Gắn Bẫy Đánh chặn Lỗi Toàn cục (Zero-Crash Trap) cho mỗi phiên trang
 */
function attachZeroCrashTrap(page) {
  const pageErrors = [];
  const fatalConsoleErrors = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err?.stack || err?.message || String(err));
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text() || '';
    if (FATAL_CONSOLE_PATTERNS.some((rx) => rx.test(text))) {
      fatalConsoleErrors.push(text);
    }
  });

  return {
    assertZeroCrashes() {
      expect(pageErrors, `Phát hiện lỗi Uncaught PageError:\n${pageErrors.join('\n')}`).toEqual([]);
      expect(
        fatalConsoleErrors,
        `Phát hiện lỗi Fatal React/JS Console Error:\n${fatalConsoleErrors.join('\n')}`
      ).toEqual([]);
    }
  };
}

/**
 * Bơm sạch dữ liệu 4 kho Master Data vào IndexedDB (FcDB) và đồng bộ cài đặt gốc
 */
async function seedFourMasterDecks(page, initialLang = 'zh', initialMode = 'vocab') {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root', { state: 'attached' });

  // Đợi window.FcDB sẵn sàng từ tầng khởi tạo của ứng dụng
  await page.waitForFunction(
    () => typeof window.FcDB !== 'undefined' && typeof window.FcDB.set === 'function',
    null,
    { timeout: 15000 }
  );

  await page.evaluate(
    async ({ enV, enS, zhV, zhS, lang, mode }) => {
      localStorage.clear();

      // Khóa cấu hình khởi động ổn định (giao diện Tiếng Việt, Level khớp dữ liệu mẫu)
      localStorage.setItem('fc_ui_lang', JSON.stringify('vi'));
      localStorage.setItem('fc_lang', JSON.stringify(lang));
      localStorage.setItem('fc_data_mode', mode);
      localStorage.setItem('fc_current_level_en', JSON.stringify(['en_level_4']));
      localStorage.setItem('fc_current_level_zh', JSON.stringify(['zh_level_1']));
      localStorage.setItem('fc_current_topic_en', JSON.stringify([]));
      localStorage.setItem('fc_current_topic_zh', JSON.stringify([]));
      // Xóa URL auto-fetch API key Sheet để test chạy nhanh, không bị nhiễu mạng ngoài
      localStorage.setItem('fc_apikey_sheet', '');

      // Nạp 4 kho Master Data thẳng vào IndexedDB (Chuẩn Kiến trúc Kho Master Lai)
      await window.FcDB.init();
      await window.FcDB.set('fc_master_data_en_vocab', enV);
      await window.FcDB.set('fc_master_data_en_sentence', enS);
      await window.FcDB.set('fc_master_data_zh_vocab', zhV);
      await window.FcDB.set('fc_master_data_zh_sentence', zhS);
    },
    {
      enV: SEED_EN_VOCAB,
      enS: SEED_EN_SENTENCE,
      zhV: SEED_ZH_VOCAB,
      zhS: SEED_ZH_SENTENCE,
      lang: initialLang,
      mode: initialMode
    }
  );

  // Tải lại trang để useCoreState tự hydrate 4 kho từ IndexedDB -> RAM Mirror 0ms
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#root', { state: 'visible' });
}

/**
 * Đóng modal hiện hành một cách an toàn (nhấn Escape hoặc nút đóng X)
 */
async function dismissActiveModal(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // Nếu modal vẫn đang mở (không gắn phím Escape), tìm nút đóng phổ biến trong overlay
  const closeBtn = page
    .locator(
      'button[aria-label*="Close" i], button[aria-label*="Đóng" i], button[title*="Đóng" i], button[title*="Close" i]'
    )
    .first();

  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(250);
  }
}

// ============================================================================
// BỘ KỊCH BẢN SMOKE TEST 4 LUỒNG SỐNG CÒN
// ============================================================================
test.describe('Flashcard 3D — E2E Smoke Test Suite (Zero-Crash Verification)', () => {
  // --------------------------------------------------------------------------
  // KỊCH BẢN 1: KHỞI ĐỘNG & HỌC THẺ 3D
  // --------------------------------------------------------------------------
  test('1. Khởi động App, hiển thị thẻ học 3D, lật thẻ, chuyển thẻ và nhập liệu không lỗi', async ({
    page
  }) => {
    const trap = attachZeroCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');

    // Xác nhận thẻ đầu tiên của bộ EN Vocab xuất hiện đúng
    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 12000 });

    // Thử gõ vào ô nhập luyện từ (nếu hiển thị)
    const typingInput = page.locator('input[type="text"]').first();
    if (await typingInput.isVisible().catch(() => false)) {
      await typingInput.fill('E2E_EN_VOCAB_APPLE');
      await expect(typingInput).toHaveValue('E2E_EN_VOCAB_APPLE');
      await typingInput.fill('');
      await typingInput.blur();
    }

    // Lật thẻ bằng phím Space (phím tắt chuẩn ở Learn Mode)
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Chuyển sang thẻ kế tiếp bằng phím ArrowRight
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('E2E_EN_VOCAB_BOOK')).toBeVisible({ timeout: 5000 });

    // Quay lại thẻ trước bằng phím ArrowLeft
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 5000 });

    trap.assertZeroCrashes();
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN 2: KHÓA HỒI QUY TỪ VỰNG <-> CÂU VĂN, EN <-> CN, F5 & QUOTA < 2MB
  // --------------------------------------------------------------------------
  test('2. Chuyển đổi Từ Vựng <-> Câu Văn và CN <-> EN tách bạch 100%, giữ nguyên sau F5 & localStorage < 2MB', async ({
    page
  }) => {
    const trap = attachZeroCrashTrap(page);
    await seedFourMasterDecks(page, 'zh', 'vocab');

    // 1. Trạng thái khởi đầu: CN + Từ Vựng
    await expect(page.getByText('E2E中文词汇一')).toBeVisible({ timeout: 12000 });
    await expect(page.getByText('E2E中文句子测试一。')).toHaveCount(0);

    // 2. Bấm chuyển sang tab Câu Văn (CN)
    const sentenceTabBtn = page
      .getByRole('button', { name: /Câu Văn|Sentences?|句子/i })
      .first();
    const vocabTabBtn = page
      .getByRole('button', { name: /Từ Vựng|Vocab(ulary)?|词汇/i })
      .first();

    await expect(sentenceTabBtn).toBeVisible();
    await sentenceTabBtn.click();
    await expect(page.getByText('E2E中文句子测试一。')).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('E2E中文词汇一')).toHaveCount(0);

    // 3. Bấm quay lại tab Từ Vựng (CN)
    await vocabTabBtn.click();
    await expect(page.getByText('E2E中文词汇一')).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('E2E中文句子测试一。')).toHaveCount(0);

    // 4. Đổi ngôn ngữ học từ CN -> EN bằng nút trên Header
    const langToggleBtn = page.getByRole('button', { name: /^(CN|ZH)$/i }).first();
    await expect(langToggleBtn).toBeVisible();
    await langToggleBtn.click();

    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('E2E_EN_SENTENCE_ALPHA.')).toHaveCount(0);

    // 5. Chuyển sang tab Câu Văn (EN)
    await sentenceTabBtn.click();
    await expect(page.getByText('E2E_EN_SENTENCE_ALPHA.')).toBeVisible({ timeout: 6000 });
    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toHaveCount(0);

    // 6. Bấm F5 (Reload) và xác nhận giữ nguyên đúng EN + Câu Văn
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('E2E_EN_SENTENCE_ALPHA.')).toBeVisible({ timeout: 12000 });
    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toHaveCount(0);

    // 7. Kiểm toán sức khỏe localStorage: tuyệt đối không chứa 4 kho Master & tổng < 2 MB
    const storageAudit = await page.evaluate(() => {
      const masterKeys = [
        'fc_master_data_en_vocab',
        'fc_master_data_en_sentence',
        'fc_master_data_zh_vocab',
        'fc_master_data_zh_sentence'
      ];
      const leakedMasterKeys = masterKeys.filter((k) => localStorage.getItem(k) !== null);
      let totalChars = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        totalChars += key.length + (localStorage.getItem(key) || '').length;
      }
      return {
        leakedMasterKeys,
        totalBytesMB: Number(((totalChars * 2) / (1024 * 1024)).toFixed(3))
      };
    });

    expect(storageAudit.leakedMasterKeys).toEqual([]);
    expect(storageAudit.totalBytesMB).toBeLessThan(2);

    trap.assertZeroCrashes();
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN 3: QUÉT MỞ / ĐÓNG CÁC MODALS CHÍNH
  // --------------------------------------------------------------------------
  test('3. Quét mở/đóng các Modals chính (Settings, API Key, AI Chat, Data & Link Manager) không crash', async ({
    page
  }) => {
    const trap = attachZeroCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');
    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 12000 });

    // Danh sách nút thanh điều hướng dưới (BottomNav) cần quét mở/đóng
    const bottomNavTargets = [
      /Settings|Cài đặt/i,
      /API Key/i,
      /AI Chat/i
    ];

    for (const labelPattern of bottomNavTargets) {
      const navBtn = page.getByRole('button', { name: labelPattern }).first();
      if (await navBtn.isVisible().catch(() => false)) {
        await navBtn.click();
        await page.waitForTimeout(350);
        // Xác nhận ứng dụng không trắng màn hình
        const rootTextLen = await page.locator('#root').innerText();
        expect(rootTextLen.trim().length).toBeGreaterThan(10);
        await dismissActiveModal(page);
      }
    }

    // Mở Data & Link Manager từ Header (dò theo title/aria-label nếu có)
    const linkManagerTrigger = page
      .locator(
        'header button[title*="Link" i], header button[title*="Dữ liệu" i], header button[title*="Nguồn" i], header button[aria-label*="Link" i]'
      )
      .first();

    if (await linkManagerTrigger.isVisible().catch(() => false)) {
      await linkManagerTrigger.click();
      await expect(page.getByText(/Data & Link Manager|Quản lý/i).first()).toBeVisible({
        timeout: 5000
      });
      await dismissActiveModal(page);
    }

    trap.assertZeroCrashes();
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN 4: QUÉT TẦNG GAME & MINI-GAME OFFLINE
  // --------------------------------------------------------------------------
  test('4. Chuyển sang tab Game, kiểm tra sảnh Mini-Games & mở thử ván chơi Offline không vỡ Props', async ({
    page
  }) => {
    const trap = attachZeroCrashTrap(page);
    await seedFourMasterDecks(page, 'en', 'vocab');
    await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 12000 });

    // Bấm chuyển sang tab Game trên thanh điều hướng dưới
    const gameNavBtn = page.getByRole('button', { name: /^Game$|Trò chơi/i }).first();
    await expect(gameNavBtn).toBeVisible();
    await gameNavBtn.click();

    // Đợi sảnh Game hiển thị các thẻ trò chơi
    await page.waitForTimeout(500);
    const bodyText = await page.locator('#root').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(20);

    // Chọn mở thử 1 Mini-Game kinh điển (Trắc Nghiệm / Quiz hoặc Nối Ô / Match)
    const sampleGameCard = page
      .getByRole('button', { name: /Trắc Nghiệm|Quiz|Nối Ô|Match/i })
      .first();

    if (await sampleGameCard.isVisible().catch(() => false)) {
      await sampleGameCard.click();
      await page.waitForTimeout(500);
      const afterOpenText = await page.locator('#root').innerText();
      expect(afterOpenText.trim().length).toBeGreaterThan(15);
    }

    // Quay trở lại tab Learn xác nhận khôi phục trạng thái học trơn tru
    const learnNavBtn = page.getByRole('button', { name: /^Learn$|Học/i }).first();
    if (await learnNavBtn.isVisible().catch(() => false)) {
      await learnNavBtn.click();
      await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 8000 });
    }

    trap.assertZeroCrashes();
  });
});