# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.js >> Flashcard 3D — E2E Smoke Test Suite (Zero-Crash Verification) >> 3. Quét mở/đóng các Modals chính (Settings, API Key, AI Chat, Data & Link Manager) không crash
- Location: tests\e2e\smoke.spec.js:281:3

# Error details

```
TimeoutError: page.waitForFunction: Timeout 15000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - button "Đẩy sang Trái (Mở rộng Không gian làm việc)" [ref=e5] [cursor=pointer]
    - button "Căn Giữa (Mặc định)" [ref=e7] [cursor=pointer]
    - button "Đẩy sang Phải" [ref=e9] [cursor=pointer]
  - generic [ref=e12]:
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]:
          - heading "Flashcard Lite" [level=1] [ref=e16]
          - button "EN" [ref=e21] [cursor=pointer]
        - generic [ref=e25]:
          - button "Vocabulary Notebook" [ref=e26] [cursor=pointer]
          - button "Sổ tay cần nhớ (Lỗi sai)" [ref=e30] [cursor=pointer]
          - button "Reload Default Data" [ref=e34] [cursor=pointer]
          - button "Import/Export" [ref=e39] [cursor=pointer]
          - button "Thêm thẻ thủ công / JSON" [ref=e43] [cursor=pointer]
          - button "Sao lưu & Phục hồi (.json)" [ref=e47] [cursor=pointer]
          - button "User Guide" [ref=e52] [cursor=pointer]
      - generic [ref=e56]:
        - generic [ref=e58]:
          - button "Từ Vựng" [ref=e59] [cursor=pointer]
          - button "Câu Văn" [ref=e60] [cursor=pointer]
        - generic [ref=e61]:
          - button "Discovery Lớp 6-7" [ref=e64] [cursor=pointer]:
            - generic [ref=e65]:
              - generic [ref=e66]: Discovery
              - generic [ref=e67]: Lớp 6-7
          - button "Chủ đề Tất cả chủ đề" [ref=e72] [cursor=pointer]:
            - generic [ref=e73]:
              - generic [ref=e74]: Chủ đề
              - generic [ref=e75]: Tất cả chủ đề
    - generic [ref=e79]:
      - generic [ref=e80]:
        - textbox "Gõ lại từ vựng... (Phím Delete để xóa nhanh)" [ref=e81]
        - button [ref=e82] [cursor=pointer]
      - generic [ref=e87] [cursor=pointer]:
        - generic [ref=e88]:
          - 'generic "Chế độ AI: Tự động điền (Đang TẮT)" [ref=e89]'
          - generic [ref=e95]:
            - textbox "Nhập số để chuyển thẻ" [disabled] [ref=e96]: "0"
            - generic [ref=e97]: /
            - generic [ref=e98]: "0"
          - button [ref=e101]
        - generic [ref=e105]:
          - generic [ref=e106]: Mới
          - button "Tạo phân tích chi tiết" [ref=e109]
          - generic [ref=e112]:
            - button "Again" [ref=e113]
            - button "Hard" [ref=e115]
            - button "Good" [ref=e117]
            - button "Easy" [ref=e119]
  - generic [ref=e121]:
    - generic [ref=e123]:
      - button "Shuffle" [ref=e124] [cursor=pointer]
      - button "Previous" [ref=e131] [cursor=pointer]
      - button "Auto Play" [ref=e134] [cursor=pointer]
      - button "Bookmark" [ref=e137] [cursor=pointer]
      - button "Next" [ref=e140] [cursor=pointer]
      - button "Đánh dấu đã thuộc" [ref=e143] [cursor=pointer]
    - generic [ref=e147]:
      - button "Learn" [ref=e148] [cursor=pointer]
      - button "Game" [ref=e153] [cursor=pointer]
      - button "AI Chat" [ref=e157] [cursor=pointer]
      - button "API Key" [ref=e161] [cursor=pointer]
      - button "Settings" [ref=e165] [cursor=pointer]
```

# Test source

```ts
  1   | // ============================================================================
  2   | // FILE: tests/e2e/smoke.spec.js
  3   | // NGUỒN GỐC: Bước 3B — Bot Smoke Test Tự động Toàn App (Playwright Chromium)
  4   | // PHIÊN BẢN: Ver 1.0
  5   | // NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 13:08 (GMT+7)
  6   | // NHIỆM VỤ: Tự động kiểm thử 4 luồng sống còn trên Chrome thật:
  7   | //           (1) Khởi động & Học Thẻ 3D (Lật thẻ, chuyển thẻ, ô nhập từ),
  8   | //           (2) Khóa hồi quy Từ Vựng <-> Câu Văn, EN <-> CN, F5 & Quota < 2MB,
  9   | //           (3) Quét mở/đóng các Modals chính (Settings, API Key, AI Chat, Link),
  10  | //           (4) Quét Tầng Game (Vào sảnh Game & mở thử Mini-Game Offline).
  11  | //           Đánh chặn 100% lỗi Uncaught PageError / React Crash ở mọi kịch bản.
  12  | // ============================================================================
  13  | 
  14  | import { test, expect } from '@playwright/test';
  15  | 
  16  | // ============================================================================
  17  | // BỘ DỮ LIỆU MẪU ĐẶC CHỦNG CHO KIỂM THỬ E2E (TÁCH BẠCH 4 KHO MASTER)
  18  | // ============================================================================
  19  | const SEED_EN_VOCAB = {
  20  |   en_level_4: [
  21  |     { term: 'E2E_EN_VOCAB_APPLE', pronunciation: '/ˈæp.əl/', definition: 'quả táo mẫu', example: 'I eat an apple.', topic: 'E2E_Food', partOfSpeech: 'noun' },
  22  |     { term: 'E2E_EN_VOCAB_BOOK', pronunciation: '/bʊk/', definition: 'quyển sách mẫu', example: 'Read this book.', topic: 'E2E_School', partOfSpeech: 'noun' },
  23  |     { term: 'E2E_EN_VOCAB_WATER', pronunciation: '/ˈwɔː.tər/', definition: 'nước uống mẫu', example: 'Drink cold water.', topic: 'E2E_Food', partOfSpeech: 'noun' },
  24  |     { term: 'E2E_EN_VOCAB_TRAIN', pronunciation: '/treɪn/', definition: 'tàu hỏa mẫu', example: 'Catch the train.', topic: 'E2E_Travel', partOfSpeech: 'noun' },
  25  |     { term: 'E2E_EN_VOCAB_MUSIC', pronunciation: '/ˈmjuː.zɪk/', definition: 'âm nhạc mẫu', example: 'Listen to music.', topic: 'E2E_Art', partOfSpeech: 'noun' },
  26  |     { term: 'E2E_EN_VOCAB_HAPPY', pronunciation: '/ˈhæp.i/', definition: 'vui vẻ mẫu', example: 'She feels happy.', topic: 'E2E_Mood', partOfSpeech: 'adjective' }
  27  |   ]
  28  | };
  29  | 
  30  | const SEED_EN_SENTENCE = {
  31  |   en_level_4: [
  32  |     { term: 'E2E_EN_SENTENCE_ALPHA.', pronunciation: '', definition: 'Câu văn tiếng Anh kiểm thử số 1', example: '', topic: 'E2E_Daily', partOfSpeech: 'sentence' },
  33  |     { term: 'E2E_EN_SENTENCE_BETA.', pronunciation: '', definition: 'Câu văn tiếng Anh kiểm thử số 2', example: '', topic: 'E2E_Daily', partOfSpeech: 'sentence' }
  34  |   ]
  35  | };
  36  | 
  37  | const SEED_ZH_VOCAB = {
  38  |   zh_level_1: [
  39  |     { term: 'E2E中文词汇一', pronunciation: 'cíhuì yī', definition: 'Từ vựng tiếng Trung mẫu 1', example: '学习词汇', topic: 'E2E_ZhVocab', partOfSpeech: 'noun' },
  40  |     { term: 'E2E中文词汇二', pronunciation: 'cíhuì èr', definition: 'Từ vựng tiếng Trung mẫu 2', example: '复习词汇', topic: 'E2E_ZhVocab', partOfSpeech: 'noun' }
  41  |   ]
  42  | };
  43  | 
  44  | const SEED_ZH_SENTENCE = {
  45  |   zh_level_1: [
  46  |     { term: 'E2E中文句子测试一。', pronunciation: 'jùzi yī', definition: 'Câu văn tiếng Trung mẫu 1', example: '', topic: 'E2E_ZhSent', partOfSpeech: 'sentence' },
  47  |     { term: 'E2E中文句子测试二。', pronunciation: 'jùzi èr', definition: 'Câu văn tiếng Trung mẫu 2', example: '', topic: 'E2E_ZhSent', partOfSpeech: 'sentence' }
  48  |   ]
  49  | };
  50  | 
  51  | // Các mẫu lỗi Console nghiêm trọng từ React/JS (bỏ qua cảnh báo mạng ngoài khi offline)
  52  | const FATAL_CONSOLE_PATTERNS = [
  53  |   /Uncaught\s+(TypeError|ReferenceError|RangeError|SyntaxError)/i,
  54  |   /Cannot read properties of (null|undefined)/i,
  55  |   /is not a function/i,
  56  |   /Maximum update depth exceeded/i,
  57  |   /Invalid hook call/i,
  58  |   /The above error occurred in the/i,
  59  |   /ErrorBoundary/i
  60  | ];
  61  | 
  62  | /**
  63  |  * Gắn Bẫy Đánh chặn Lỗi Toàn cục (Zero-Crash Trap) cho mỗi phiên trang
  64  |  */
  65  | function attachZeroCrashTrap(page) {
  66  |   const pageErrors = [];
  67  |   const fatalConsoleErrors = [];
  68  | 
  69  |   page.on('pageerror', (err) => {
  70  |     pageErrors.push(err?.stack || err?.message || String(err));
  71  |   });
  72  | 
  73  |   page.on('console', (msg) => {
  74  |     if (msg.type() !== 'error') return;
  75  |     const text = msg.text() || '';
  76  |     if (FATAL_CONSOLE_PATTERNS.some((rx) => rx.test(text))) {
  77  |       fatalConsoleErrors.push(text);
  78  |     }
  79  |   });
  80  | 
  81  |   return {
  82  |     assertZeroCrashes() {
  83  |       expect(pageErrors, `Phát hiện lỗi Uncaught PageError:\n${pageErrors.join('\n')}`).toEqual([]);
  84  |       expect(
  85  |         fatalConsoleErrors,
  86  |         `Phát hiện lỗi Fatal React/JS Console Error:\n${fatalConsoleErrors.join('\n')}`
  87  |       ).toEqual([]);
  88  |     }
  89  |   };
  90  | }
  91  | 
  92  | /**
  93  |  * Bơm sạch dữ liệu 4 kho Master Data vào IndexedDB (FcDB) và đồng bộ cài đặt gốc
  94  |  */
  95  | async function seedFourMasterDecks(page, initialLang = 'zh', initialMode = 'vocab') {
  96  |   await page.goto('/', { waitUntil: 'domcontentloaded' });
  97  |   await page.waitForSelector('#root', { state: 'attached' });
  98  | 
  99  |   // Đợi window.FcDB sẵn sàng từ tầng khởi tạo của ứng dụng
> 100 |   await page.waitForFunction(
      |              ^ TimeoutError: page.waitForFunction: Timeout 15000ms exceeded.
  101 |     () => typeof window.FcDB !== 'undefined' && typeof window.FcDB.set === 'function',
  102 |     null,
  103 |     { timeout: 15000 }
  104 |   );
  105 | 
  106 |   await page.evaluate(
  107 |     async ({ enV, enS, zhV, zhS, lang, mode }) => {
  108 |       localStorage.clear();
  109 | 
  110 |       // Khóa cấu hình khởi động ổn định (giao diện Tiếng Việt, Level khớp dữ liệu mẫu)
  111 |       localStorage.setItem('fc_ui_lang', JSON.stringify('vi'));
  112 |       localStorage.setItem('fc_lang', JSON.stringify(lang));
  113 |       localStorage.setItem('fc_data_mode', mode);
  114 |       localStorage.setItem('fc_current_level_en', JSON.stringify(['en_level_4']));
  115 |       localStorage.setItem('fc_current_level_zh', JSON.stringify(['zh_level_1']));
  116 |       localStorage.setItem('fc_current_topic_en', JSON.stringify([]));
  117 |       localStorage.setItem('fc_current_topic_zh', JSON.stringify([]));
  118 |       // Xóa URL auto-fetch API key Sheet để test chạy nhanh, không bị nhiễu mạng ngoài
  119 |       localStorage.setItem('fc_apikey_sheet', '');
  120 | 
  121 |       // Nạp 4 kho Master Data thẳng vào IndexedDB (Chuẩn Kiến trúc Kho Master Lai)
  122 |       await window.FcDB.init();
  123 |       await window.FcDB.set('fc_master_data_en_vocab', enV);
  124 |       await window.FcDB.set('fc_master_data_en_sentence', enS);
  125 |       await window.FcDB.set('fc_master_data_zh_vocab', zhV);
  126 |       await window.FcDB.set('fc_master_data_zh_sentence', zhS);
  127 |     },
  128 |     {
  129 |       enV: SEED_EN_VOCAB,
  130 |       enS: SEED_EN_SENTENCE,
  131 |       zhV: SEED_ZH_VOCAB,
  132 |       zhS: SEED_ZH_SENTENCE,
  133 |       lang: initialLang,
  134 |       mode: initialMode
  135 |     }
  136 |   );
  137 | 
  138 |   // Tải lại trang để useCoreState tự hydrate 4 kho từ IndexedDB -> RAM Mirror 0ms
  139 |   await page.reload({ waitUntil: 'domcontentloaded' });
  140 |   await page.waitForSelector('#root', { state: 'visible' });
  141 | }
  142 | 
  143 | /**
  144 |  * Đóng modal hiện hành một cách an toàn (nhấn Escape hoặc nút đóng X)
  145 |  */
  146 | async function dismissActiveModal(page) {
  147 |   await page.keyboard.press('Escape');
  148 |   await page.waitForTimeout(250);
  149 | 
  150 |   // Nếu modal vẫn đang mở (không gắn phím Escape), tìm nút đóng phổ biến trong overlay
  151 |   const closeBtn = page
  152 |     .locator(
  153 |       'button[aria-label*="Close" i], button[aria-label*="Đóng" i], button[title*="Đóng" i], button[title*="Close" i]'
  154 |     )
  155 |     .first();
  156 | 
  157 |   if (await closeBtn.isVisible().catch(() => false)) {
  158 |     await closeBtn.click();
  159 |     await page.waitForTimeout(250);
  160 |   }
  161 | }
  162 | 
  163 | // ============================================================================
  164 | // BỘ KỊCH BẢN SMOKE TEST 4 LUỒNG SỐNG CÒN
  165 | // ============================================================================
  166 | test.describe('Flashcard 3D — E2E Smoke Test Suite (Zero-Crash Verification)', () => {
  167 |   // --------------------------------------------------------------------------
  168 |   // KỊCH BẢN 1: KHỞI ĐỘNG & HỌC THẺ 3D
  169 |   // --------------------------------------------------------------------------
  170 |   test('1. Khởi động App, hiển thị thẻ học 3D, lật thẻ, chuyển thẻ và nhập liệu không lỗi', async ({
  171 |     page
  172 |   }) => {
  173 |     const trap = attachZeroCrashTrap(page);
  174 |     await seedFourMasterDecks(page, 'en', 'vocab');
  175 | 
  176 |     // Xác nhận thẻ đầu tiên của bộ EN Vocab xuất hiện đúng
  177 |     await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 12000 });
  178 | 
  179 |     // Thử gõ vào ô nhập luyện từ (nếu hiển thị)
  180 |     const typingInput = page.locator('input[type="text"]').first();
  181 |     if (await typingInput.isVisible().catch(() => false)) {
  182 |       await typingInput.fill('E2E_EN_VOCAB_APPLE');
  183 |       await expect(typingInput).toHaveValue('E2E_EN_VOCAB_APPLE');
  184 |       await typingInput.fill('');
  185 |       await typingInput.blur();
  186 |     }
  187 | 
  188 |     // Lật thẻ bằng phím Space (phím tắt chuẩn ở Learn Mode)
  189 |     await page.keyboard.press('Space');
  190 |     await page.waitForTimeout(300);
  191 | 
  192 |     // Chuyển sang thẻ kế tiếp bằng phím ArrowRight
  193 |     await page.keyboard.press('ArrowRight');
  194 |     await expect(page.getByText('E2E_EN_VOCAB_BOOK')).toBeVisible({ timeout: 5000 });
  195 | 
  196 |     // Quay lại thẻ trước bằng phím ArrowLeft
  197 |     await page.keyboard.press('ArrowLeft');
  198 |     await expect(page.getByText('E2E_EN_VOCAB_APPLE')).toBeVisible({ timeout: 5000 });
  199 | 
  200 |     trap.assertZeroCrashes();
```