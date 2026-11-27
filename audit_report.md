# BÁO CÁO RADAR RÀ SOÁT TOÀN ỨNG DỤNG FLASHCARD-3D

* **Thời điểm quét:** 27/11/2026 - 21:58:23
* **Phạm vi quét:** `80` tệp mã nguồn trong `src/`
* **Thời gian thực thi:** `298 ms`

---

## 1. BẢNG TỔNG QUAN MỨC ĐỘ NGHIÊM TRỌNG

| Mức độ | Số lượng phát hiện | Ý nghĩa |
| :--- | :---: | :--- |
| 🔴 **CRITICAL** | **0** | Lỗi gãy build, crash Runtime, vi phạm Kho Master Lai hoặc StrictMode |
| 🟠 **HIGH** | **0** | Rủi ro tràn Quota, nhánh `vi` cũ sót, hộp thoại `alert/confirm` chặn UI |
| 🟡 **MEDIUM** | **24** | Rò rỉ Timer/Listener, phụ thuộc `window.*` legacy |
| ⚪ **INFO** | **0** | Thông tin đối chiếu kiểm kê |

### Thống kê theo Mã Luật Radar

| Mã luật | Số lượng |
| :--- | :---: |
| `R05_UNSAFE_LOCALSTORAGE_SET` | 6 |
| `R06B_LEGACY_WINDOW_GLOBAL` | 18 |

## 2. TOP ĐIỂM NÓNG (TỆP CẦN ƯU TIÊN XỬ LÝ TRƯỚC)

| Tệp mã nguồn | 🔴 Critical | 🟠 High | 🟡 Medium | Tổng |
| :--- | :---: | :---: | :---: | :---: |
| `src/engines/queueEngine.js` | 0 | 0 | 11 | **11** |
| `src/engines/aiFactory.js` | 0 | 0 | 4 | **4** |
| `src/components/modals/AiChatModal.jsx` | 0 | 0 | 3 | **3** |
| `src/engines/exam/examMemory.js` | 0 | 0 | 3 | **3** |
| `src/engines/exam/index.js` | 0 | 0 | 1 | **1** |
| `src/hooks/useDataIO.js` | 0 | 0 | 1 | **1** |
| `src/main.jsx` | 0 | 0 | 1 | **1** |

## 3. CHI TIẾT PHÁT HIỆN THEO MỨC ĐỘ

### 🟡 MEDIUM (24 mục)

- **`src/components/modals/AiChatModal.jsx:106`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_ai_chat_history', JSON.stringify(messages));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/AiChatModal.jsx:116`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_aichat_size', JSON.stringify(size));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/AiChatModal.jsx:177`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.callGeminiApi);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/aiFactory.js:91`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.ExamProfiles" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.ExamProfiles &&`
  - Gợi ý vá: Chuyển sang import { ExamProfiles } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/aiFactory.js:92`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.ExamProfiles" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `typeof window.ExamProfiles.getCefrLevel === 'function'`
  - Gợi ý vá: Chuyển sang import { ExamProfiles } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/aiFactory.js:94`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.ExamProfiles" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `return window.ExamProfiles.getCefrLevel(lvlKey);`
  - Gợi ý vá: Chuyển sang import { ExamProfiles } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/aiFactory.js:138`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_total_tokens', String(prevSafe + used));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/engines/exam/examMemory.js:43`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `} else if (typeof window !== 'undefined' && window.Utils?.AiMemoryManager) {`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/exam/examMemory.js:44`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.Utils.AiMemoryManager.add(cleanTerm);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/exam/examMemory.js:54`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_ai_memory', JSON.stringify(currentMemory));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/engines/exam/index.js:170`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_total_tokens', String(prevSafe + used));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/engines/queueEngine.js:4`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `if (typeof window !== 'undefined' && window.AiFactoryEngine && !window.__zombieKillerActive) {`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:6`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `const origContext = window.AiFactoryEngine.forgeContext;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:7`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `const origMatrix = window.AiFactoryEngine.forgeMatrix;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:8`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `const origBase = window.AiFactoryEngine.forgeBaseCard;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:15`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.AiFactoryEngine.forgeContext = killSwitch;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:16`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.AiFactoryEngine.forgeMatrix = killSwitch;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:17`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.AiFactoryEngine.forgeBaseCard = killSwitch;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:21`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `if (window.AiFactoryEngine) {`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:22`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.AiFactoryEngine.forgeContext = origContext;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:23`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.AiFactoryEngine.forgeMatrix = origMatrix;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/engines/queueEngine.js:24`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.AiFactoryEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.AiFactoryEngine.forgeBaseCard = origBase;`
  - Gợi ý vá: Chuyển sang import { AiFactoryEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/hooks/useDataIO.js:92`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.fetchWithFallback);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/main.jsx:27`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_lang', JSON.stringify('en'));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).

## 4. KIỂM KÊ KHÓA LƯU TRỮ (`fc_*`) NGOÀI DANH MỤC CHUẨN

Các khóa dưới đây chưa có trong danh mục chuẩn `CANONICAL_FC_KEYS` (kiểm tra xem là khóa hợp lệ mới thêm hay gõ nhầm chính tả):

| Khóa `fc_*` | Số lần xuất hiện | Vị trí mẫu |
| :--- | :---: | :--- |
| `fc_active_exam` | 3 | `src/config/constants.js:20`, `src/features/games/GameMenu.jsx:35`, `src/features/games/GameMenu.jsx:37` |
| `fc_ai_memory_vi` | 1 | `src/hooks/useCoreState.js:522` |
| `fc_aichat_size` | 2 | `src/components/modals/AiChatModal.jsx:66`, `src/components/modals/AiChatModal.jsx:116` |
| `fc_api_cooldowns` | 4 | `src/components/modals/ApiKeyModal.jsx:86`, `src/services/geminiApi.js:215`, `src/services/geminiApi.js:231` |
| `fc_apikey_sheet_url` | 2 | `src/components/modals/LinkManagerModal.jsx:381`, `src/config/constants.js:16` |
| `fc_cards` | 1 | `src/config/constants.js:10` |
| `fc_current_lang` | 1 | `src/config/constants.js:18` |
| `fc_current_level_vi` | 1 | `src/hooks/useCoreState.js:518` |
| `fc_current_topic_vi` | 1 | `src/hooks/useCoreState.js:519` |
| `fc_data_vi` | 1 | `src/hooks/useCoreState.js:517` |
| `fc_debug_legacy_ai` | 3 | `src/engines/exam/index.js:1312`, `src/features/games/GameMenu.jsx:66`, `src/features/games/GameMenu.jsx:240` |
| `fc_fillblank_config` | 1 | `src/features/games/FillBlankUI.jsx:23` |
| `fc_game_auto_next_delay` | 1 | `src/features/games/QuizGame.jsx:151` |
| `fc_gemini_api_key` | 10 | `src/components/modals/AiChatModal.jsx:135`, `src/components/modals/ApiKeyModal.jsx:102`, `src/components/modals/NotebookModal.jsx:222` |
| `fc_global_api_pause` | 2 | `src/services/geminiApi.js:260`, `src/services/geminiApi.js:270` |
| `fc_global_retry_bag_vi` | 1 | `src/hooks/useCoreState.js:540` |
| `fc_imagequiz_config` | 2 | `src/features/games/ImageQuizUI.jsx:247`, `src/features/games/ImageQuizUI.jsx:285` |
| `fc_incorrect_list_vi` | 1 | `src/hooks/useCoreState.js:538` |
| `fc_is_auto_cascade` | 3 | `src/components/modals/ApiKeyModal.jsx:270`, `src/components/modals/ApiKeyModal.jsx:428`, `src/services/geminiApi.js:583` |
| `fc_is_premium_key` | 3 | `src/components/modals/ApiKeyModal.jsx:269`, `src/components/modals/ApiKeyModal.jsx:416`, `src/services/geminiApi.js:584` |
| `fc_key_pointer` | 2 | `src/services/geminiApi.js:576`, `src/services/geminiApi.js:796` |
| `fc_listening_config` | 2 | `src/features/games/ListeningUI.jsx:267`, `src/features/games/ListeningUI.jsx:326` |
| `fc_master_data_vi_sentence` | 1 | `src/hooks/useCoreState.js:521` |
| `fc_master_data_vi_vocab` | 1 | `src/hooks/useCoreState.js:520` |
| `fc_mastered` | 1 | `src/config/constants.js:12` |
| `fc_mastered_vi` | 1 | `src/hooks/useCoreState.js:534` |
| `fc_match_config` | 3 | `src/features/games/MatchGame.jsx:115`, `src/features/games/MatchUI.jsx:206`, `src/features/games/MatchUI.jsx:236` |
| `fc_match_history` | 1 | `src/components/modals/SettingsModal.jsx:843` |
| `fc_notebook` | 1 | `src/config/constants.js:11` |
| `fc_notebook_vi` | 1 | `src/hooks/useCoreState.js:533` |
| `fc_oddoneout_config` | 2 | `src/features/games/OddOneOutUI.jsx:220`, `src/features/games/OddOneOutUI.jsx:257` |
| `fc_pronunciation_config` | 2 | `src/features/games/PronunciationUI.jsx:270`, `src/features/games/PronunciationUI.jsx:320` |
| `fc_quota_tracker` | 3 | `src/config/constants.js:22`, `src/services/geminiApi.js:416`, `src/services/geminiApi.js:429` |
| `fc_reading_config` | 2 | `src/features/games/ReadingUI.jsx:152`, `src/features/games/ReadingUI.jsx:178` |
| `fc_scramble_config` | 3 | `src/features/games/ScrambleGame.jsx:130`, `src/features/games/ScrambleUI.jsx:194`, `src/features/games/ScrambleUI.jsx:290` |
| `fc_spotmistake_config` | 3 | `src/features/games/SpotMistakeGame.jsx:223`, `src/features/games/SpotMistakeUI.jsx:227`, `src/features/games/SpotMistakeUI.jsx:253` |

## 5. KẾT QUẢ QUÉT TĨNH OXLINT (TẦNG 1)

* **Trạng thái:** `not_installed`

```text
Chưa cài đặt oxlint trong node_modules (bỏ qua để không tải mạng tự động). Bạn có thể chạy riêng lệnh: npx oxlint --react-plugin --import-plugin src/
```
