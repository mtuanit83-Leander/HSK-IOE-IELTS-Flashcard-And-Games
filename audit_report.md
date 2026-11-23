# BÁO CÁO RADAR RÀ SOÁT TOÀN ỨNG DỤNG FLASHCARD-3D

* **Thời điểm quét:** 23/11/2026 - 16:08:16
* **Phạm vi quét:** `80` tệp mã nguồn trong `src/`
* **Thời gian thực thi:** `282 ms`

---

## 1. BẢNG TỔNG QUAN MỨC ĐỘ NGHIÊM TRỌNG

| Mức độ | Số lượng phát hiện | Ý nghĩa |
| :--- | :---: | :--- |
| 🔴 **CRITICAL** | **4** | Lỗi gãy build, crash Runtime, vi phạm Kho Master Lai hoặc StrictMode |
| 🟠 **HIGH** | **47** | Rủi ro tràn Quota, nhánh `vi` cũ sót, hộp thoại `alert/confirm` chặn UI |
| 🟡 **MEDIUM** | **55** | Rò rỉ Timer/Listener, phụ thuộc `window.*` legacy |
| ⚪ **INFO** | **0** | Thông tin đối chiếu kiểm kê |

### Thống kê theo Mã Luật Radar

| Mã luật | Số lượng |
| :--- | :---: |
| `R03_STRICTMODE_UPDATER_SIDEEFFECT` | 4 |
| `R05_UNSAFE_LOCALSTORAGE_SET` | 67 |
| `R06A_DEPRECATED_VI_BRANCH` | 2 |
| `R06B_LEGACY_WINDOW_GLOBAL` | 33 |

## 2. TOP ĐIỂM NÓNG (TỆP CẦN ƯU TIÊN XỬ LÝ TRƯỚC)

| Tệp mã nguồn | 🔴 Critical | 🟠 High | 🟡 Medium | Tổng |
| :--- | :---: | :---: | :---: | :---: |
| `src/hooks/useExamLogic.js` | 2 | 16 | 0 | **18** |
| `src/context/AppContext.jsx` | 1 | 1 | 0 | **2** |
| `src/hooks/useStudyProgress.js` | 1 | 0 | 0 | **1** |
| `src/services/geminiApi.js` | 0 | 7 | 0 | **7** |
| `src/components/modals/ApiKeyModal.jsx` | 0 | 3 | 2 | **5** |
| `src/features/games/OddOneOutGame.jsx` | 0 | 2 | 2 | **4** |
| `src/features/games/ImageQuizGame.jsx` | 0 | 2 | 1 | **3** |
| `src/components/modals/NotebookModal.jsx` | 0 | 1 | 2 | **3** |
| `src/engines/pedagogyEngine.js` | 0 | 1 | 1 | **2** |
| `src/features/games/FillBlankGame.jsx` | 0 | 1 | 1 | **2** |
| `src/features/games/PronunciationGame.jsx` | 0 | 1 | 1 | **2** |
| `src/features/games/SpotMistakeGame.jsx` | 0 | 1 | 1 | **2** |
| `src/hooks/useAiLogic.js` | 0 | 1 | 1 | **2** |
| `src/App.jsx` | 0 | 1 | 0 | **1** |
| `src/components/modals/ManualInputModal.jsx` | 0 | 1 | 0 | **1** |

## 3. CHI TIẾT PHÁT HIỆN THEO MỨC ĐỘ

### 🔴 CRITICAL (4 mục)

- **`src/context/AppContext.jsx:142`** [`R03_STRICTMODE_UPDATER_SIDEEFFECT`] — Phát hiện side-effect (safeLocalStorageSet()) nằm bên trong hàm updater của setState — vi phạm tính thuần khiết React 18 StrictMode (dễ ghi DB 2 lần hoặc bắn 2 Toast).
  - Code: `setCards((prevCards) => {`
  - Gợi ý vá: Tính toán mảng/object mới bên ngoài updater (hoặc lưu trong useEffect), sau đó mới gọi setState(nextVal) và thực thi DB/Toast tuần tự.
- **`src/hooks/useExamLogic.js:88`** [`R03_STRICTMODE_UPDATER_SIDEEFFECT`] — Phát hiện side-effect (FcDB.set/del(), localStorage.setItem/removeItem()) nằm bên trong hàm updater của setState — vi phạm tính thuần khiết React 18 StrictMode (dễ ghi DB 2 lần hoặc bắn 2 Toast).
  - Code: `setExamState((prev) => {`
  - Gợi ý vá: Tính toán mảng/object mới bên ngoài updater (hoặc lưu trong useEffect), sau đó mới gọi setState(nextVal) và thực thi DB/Toast tuần tự.
- **`src/hooks/useExamLogic.js:737`** [`R03_STRICTMODE_UPDATER_SIDEEFFECT`] — Phát hiện side-effect (FcDB.set/del()) nằm bên trong hàm updater của setState — vi phạm tính thuần khiết React 18 StrictMode (dễ ghi DB 2 lần hoặc bắn 2 Toast).
  - Code: `setExamState((prev) => {`
  - Gợi ý vá: Tính toán mảng/object mới bên ngoài updater (hoặc lưu trong useEffect), sau đó mới gọi setState(nextVal) và thực thi DB/Toast tuần tự.
- **`src/hooks/useStudyProgress.js:51`** [`R03_STRICTMODE_UPDATER_SIDEEFFECT`] — Phát hiện side-effect (safeLocalStorageSet()) nằm bên trong hàm updater của setState — vi phạm tính thuần khiết React 18 StrictMode (dễ ghi DB 2 lần hoặc bắn 2 Toast).
  - Code: `core.setCards((prev) => {`
  - Gợi ý vá: Tính toán mảng/object mới bên ngoài updater (hoặc lưu trong useEffect), sau đó mới gọi setState(nextVal) và thực thi DB/Toast tuần tự.

### 🟠 HIGH (47 mục)

- **`src/App.jsx:407`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `onSaveSettings={(k, v) => localStorage.setItem(k, v)}`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/ApiKeyModal.jsx:165`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model', localAiModel);`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/ApiKeyModal.jsx:173`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_is_premium_key', newVal.toString());`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/ApiKeyModal.jsx:185`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_is_auto_cascade', newVal.toString());`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/ManualInputModal.jsx:132`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_total_tokens', String(currentTotal + used));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/NotebookModal.jsx:787`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/SettingsModal.jsx:324`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_total_tokens', '0');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/context/AppContext.jsx:28`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_lang', JSON.stringify('en'));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/engines/pedagogyEngine.js:829`** [`R06A_DEPRECATED_VI_BRANCH`] — Còn sót vết tích ngôn ngữ học Tiếng Việt ('vi') đã khai tử: "lang === 'vi'".
  - Code: `lang === 'zh' ? 'Tiếng Trung' : lang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh';`
  - Gợi ý vá: Gỡ bỏ nhánh định tuyến ngôn ngữ học "vi" (chỉ giữ "en" và "zh"; lưu ý uiLang vẫn hỗ trợ "vi").
- **`src/features/games/FillBlankGame.jsx:909`** [`R06A_DEPRECATED_VI_BRANCH`] — Còn sót vết tích ngôn ngữ học Tiếng Việt ('vi') đã khai tử: "lang === 'vi'".
  - Code: `(lang === 'zh' || lang === 'vi') &&`
  - Gợi ý vá: Gỡ bỏ nhánh định tuyến ngôn ngữ học "vi" (chỉ giữ "en" và "zh"; lưu ý uiLang vẫn hỗ trợ "vi").
- **`src/features/games/FillBlankUI.jsx:48`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_fillblank_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ImageQuizGame.jsx:456`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ImageQuizGame.jsx:547`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_total_tokens', currentTotal + 150);`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ImageQuizUI.jsx:46`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_imagequiz_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ListeningUI.jsx:51`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_listening_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/MatchGame.jsx:554`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_total_tokens', String(currentTotal + 150));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/MatchUI.jsx:60`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_match_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/OddOneOutGame.jsx:422`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/OddOneOutGame.jsx:485`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/OddOneOutUI.jsx:47`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_oddoneout_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/PronunciationGame.jsx:475`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ScrambleUI.jsx:52`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_scramble_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/SpotMistakeGame.jsx:1121`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_total_tokens', String(currentTotal + used));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useAiLogic.js:202`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_total_tokens', String(newTotal));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:103`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:104`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:236`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:237`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:424`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:425`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:518`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(activeExamKey, sessionId);`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:625`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:626`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:643`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:644`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:749`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:750`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:854`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(activeExamKey, sessionId);`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:898`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_en', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useExamLogic.js:899`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_ai_memory_zh', '[]');`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:55`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_api_cooldowns', JSON.stringify(cooldowns));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:68`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `if (changed) localStorage.setItem('fc_api_cooldowns', JSON.stringify(cooldowns));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:78`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_global_api_pause', String(Date.now() + durationMs));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:189`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(key, JSON.stringify(data));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:196`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(key, JSON.stringify(data));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:449`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem('fc_key_pointer', String((checkIndex + 1) % poolSize));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/services/geminiApi.js:491`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trần localStorage.setItem() không qua Utils.safeLocalStorageSet — sẽ crash toàn App nếu tràn Quota hoặc trình duyệt chặn Storage.
  - Code: `localStorage.setItem(activeStorageKey, usedApiKey);`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).

### 🟡 MEDIUM (55 mục)

- **`src/components/modals/AiChatModal.jsx:106`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_ai_chat_history', JSON.stringify(messages));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/AiChatModal.jsx:116`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_aichat_size', JSON.stringify(size));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/components/modals/AiChatModal.jsx:177`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.callGeminiApi);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/ApiKeyModal.jsx:228`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.pingGeminiKey);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/ApiKeyModal.jsx:528`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.RPDTracker);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/LinkManagerModal.jsx:55`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.DEFAULT_SHEETS" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `const fallbackSheets = DEFAULT_SHEETS || window.DEFAULT_SHEETS || {};`
  - Gợi ý vá: Chuyển sang import { DEFAULT_SHEETS } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/LinkManagerModal.jsx:64`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.DEFAULT_SHEETS" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `const fallbackSheets = DEFAULT_SHEETS || window.DEFAULT_SHEETS || {};`
  - Gợi ý vá: Chuyển sang import { DEFAULT_SHEETS } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/LinkManagerModal.jsx:76`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.DEFAULT_SHEETS" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `const fallbackSheets = DEFAULT_SHEETS || window.DEFAULT_SHEETS || {};`
  - Gợi ý vá: Chuyển sang import { DEFAULT_SHEETS } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/NotebookModal.jsx:279`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.safeJsonParse) ||`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/components/modals/NotebookModal.jsx:759`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.fillCardWithAi);`
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
- **`src/engines/pedagogyEngine.js:832`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.ExamProfiles" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `typeof window !== 'undefined' && window.ExamProfiles?.getCefrLevel`
  - Gợi ý vá: Chuyển sang import { ExamProfiles } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
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
- **`src/features/games/FillBlankGame.jsx:455`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/GameMenu.jsx:124`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_mock_delay', val.toString());`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/GameMenu.jsx:134`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_debug_legacy_ai', String(nextState));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ImageQuizGame.jsx:474`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ListeningGame.jsx:502`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/OddOneOutGame.jsx:470`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/OddOneOutGame.jsx:549`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/PronunciationGame.jsx:455`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/PronunciationUI.jsx:49`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_pronunciation_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/QuizGame.jsx:158`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_ai_memory', JSON.stringify(nextList));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/QuizUI.jsx:162`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_quiz_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/QuizUI.jsx:222`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.IoeDataEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.IoeDataEngine &&`
  - Gợi ý vá: Chuyển sang import { IoeDataEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/features/games/QuizUI.jsx:223`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.IoeDataEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `typeof window.IoeDataEngine.getGrammarTopics === 'function'`
  - Gợi ý vá: Chuyển sang import { IoeDataEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/features/games/QuizUI.jsx:225`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.IoeDataEngine" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `return window.IoeDataEngine.getGrammarTopics('quiz', lang, repLevel) || [];`
  - Gợi ý vá: Chuyển sang import { IoeDataEngine } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/features/games/ReadingUI.jsx:42`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_reading_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ScrambleGame.jsx:356`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_ai_memory', JSON.stringify(historyQueueRef.current));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/ScrambleGame.jsx:1199`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_total_tokens', String(currentTotal + used));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/SpotMistakeGame.jsx:564`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem(`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/features/games/SpotMistakeUI.jsx:51`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_spotmistake_config', JSON.stringify(config));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/hooks/useAiLogic.js:221`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.fillCardWithAi);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/hooks/useDataIO.js:92`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.Utils" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `(typeof window !== 'undefined' && window.Utils?.fetchWithFallback);`
  - Gợi ý vá: Chuyển sang import { Utils } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/main.jsx:27`** [`R05_UNSAFE_LOCALSTORAGE_SET`] — Gọi trực tiếp localStorage.setItem() (dù có try/catch gần đó, nên thống nhất qua Utils.safeLocalStorageSet).
  - Code: `localStorage.setItem('fc_lang', JSON.stringify('en'));`
  - Gợi ý vá: Thay thế bằng Utils.safeLocalStorageSet(key, value).
- **`src/utils/helpers.js:294`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.FcDB" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `window.FcDB &&`
  - Gợi ý vá: Chuyển sang import { FcDB } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/utils/helpers.js:295`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.FcDB" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `typeof window.FcDB.set === 'function'`
  - Gợi ý vá: Chuyển sang import { FcDB } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.
- **`src/utils/helpers.js:300`** [`R06B_LEGACY_WINDOW_GLOBAL`] — Đọc trực tiếp biến toàn cục "window.FcDB" từ thời HTML 1 file thay vì import ES Module chuẩn.
  - Code: `: window.FcDB.set(key, normalizedValue)`
  - Gợi ý vá: Chuyển sang import { FcDB } từ tệp nguồn chuẩn theo NewMapping.md để tránh lỗi undefined khi bundler tree-shake.

## 4. KIỂM KÊ KHÓA LƯU TRỮ (`fc_*`) NGOÀI DANH MỤC CHUẨN

Các khóa dưới đây chưa có trong danh mục chuẩn `CANONICAL_FC_KEYS` (kiểm tra xem là khóa hợp lệ mới thêm hay gõ nhầm chính tả):

| Khóa `fc_*` | Số lần xuất hiện | Vị trí mẫu |
| :--- | :---: | :--- |
| `fc_active_exam` | 3 | `src/config/constants.js:20`, `src/features/games/GameMenu.jsx:81`, `src/features/games/GameMenu.jsx:111` |
| `fc_ai_memory_vi` | 1 | `src/hooks/useCoreState.js:522` |
| `fc_aichat_size` | 2 | `src/components/modals/AiChatModal.jsx:66`, `src/components/modals/AiChatModal.jsx:116` |
| `fc_api_cooldowns` | 5 | `src/components/modals/ApiKeyModal.jsx:212`, `src/components/modals/ApiKeyModal.jsx:254`, `src/services/geminiApi.js:47` |
| `fc_apikey_sheet_url` | 2 | `src/components/modals/LinkManagerModal.jsx:199`, `src/config/constants.js:16` |
| `fc_cards` | 1 | `src/config/constants.js:10` |
| `fc_current_lang` | 1 | `src/config/constants.js:18` |
| `fc_current_level_vi` | 1 | `src/hooks/useCoreState.js:518` |
| `fc_current_topic_vi` | 1 | `src/hooks/useCoreState.js:519` |
| `fc_data_vi` | 1 | `src/hooks/useCoreState.js:517` |
| `fc_debug_legacy_ai` | 3 | `src/engines/exam/index.js:1312`, `src/features/games/GameMenu.jsx:91`, `src/features/games/GameMenu.jsx:134` |
| `fc_fillblank_config` | 2 | `src/features/games/FillBlankUI.jsx:18`, `src/features/games/FillBlankUI.jsx:48` |
| `fc_game_auto_next_delay` | 1 | `src/features/games/QuizGame.jsx:76` |
| `fc_gemini_api_key` | 9 | `src/components/modals/AiChatModal.jsx:135`, `src/components/modals/ApiKeyModal.jsx:79`, `src/components/modals/SettingsModal.jsx:217` |
| `fc_global_api_pause` | 2 | `src/services/geminiApi.js:73`, `src/services/geminiApi.js:78` |
| `fc_global_retry_bag_vi` | 1 | `src/hooks/useCoreState.js:540` |
| `fc_imagequiz_config` | 2 | `src/features/games/ImageQuizUI.jsx:21`, `src/features/games/ImageQuizUI.jsx:46` |
| `fc_incorrect_list_vi` | 1 | `src/hooks/useCoreState.js:538` |
| `fc_is_auto_cascade` | 3 | `src/components/modals/ApiKeyModal.jsx:111`, `src/components/modals/ApiKeyModal.jsx:185`, `src/services/geminiApi.js:290` |
| `fc_is_premium_key` | 3 | `src/components/modals/ApiKeyModal.jsx:110`, `src/components/modals/ApiKeyModal.jsx:173`, `src/services/geminiApi.js:291` |
| `fc_key_pointer` | 2 | `src/services/geminiApi.js:288`, `src/services/geminiApi.js:449` |
| `fc_listening_config` | 2 | `src/features/games/ListeningUI.jsx:22`, `src/features/games/ListeningUI.jsx:51` |
| `fc_master_data_vi_sentence` | 1 | `src/hooks/useCoreState.js:521` |
| `fc_master_data_vi_vocab` | 1 | `src/hooks/useCoreState.js:520` |
| `fc_mastered` | 1 | `src/config/constants.js:12` |
| `fc_mastered_vi` | 1 | `src/hooks/useCoreState.js:534` |
| `fc_match_config` | 5 | `src/features/games/MatchGame.jsx:78`, `src/features/games/MatchGame.jsx:89`, `src/features/games/MatchGame.jsx:100` |
| `fc_match_history` | 1 | `src/components/modals/SettingsModal.jsx:305` |
| `fc_notebook` | 1 | `src/config/constants.js:11` |
| `fc_notebook_vi` | 1 | `src/hooks/useCoreState.js:533` |
| `fc_oddoneout_config` | 2 | `src/features/games/OddOneOutUI.jsx:21`, `src/features/games/OddOneOutUI.jsx:47` |
| `fc_pronunciation_config` | 2 | `src/features/games/PronunciationUI.jsx:25`, `src/features/games/PronunciationUI.jsx:49` |
| `fc_quota_tracker` | 3 | `src/config/constants.js:22`, `src/services/geminiApi.js:184`, `src/services/geminiApi.js:195` |
| `fc_reading_config` | 2 | `src/features/games/ReadingUI.jsx:20`, `src/features/games/ReadingUI.jsx:42` |
| `fc_scramble_config` | 3 | `src/features/games/ScrambleGame.jsx:27`, `src/features/games/ScrambleUI.jsx:18`, `src/features/games/ScrambleUI.jsx:52` |
| `fc_spotmistake_config` | 2 | `src/features/games/SpotMistakeUI.jsx:17`, `src/features/games/SpotMistakeUI.jsx:51` |

## 5. KẾT QUẢ QUÉT TĨNH OXLINT (TẦNG 1)

* **Trạng thái:** `not_installed`

```text
Chưa cài đặt oxlint trong node_modules (bỏ qua để không tải mạng tự động). Bạn có thể chạy riêng lệnh: npx oxlint --react-plugin --import-plugin src/
```
