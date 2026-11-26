// ============================================================================
// FILE 76/85: src/hooks/useAiLogic.js
// NGUỒN GỐC: Tầng 6 - Block 6.2 (AI Logic - Version 1.23)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 16:08 (GMT+7)
// NHIỆM VỤ: Cung cấp hook useAiLogic xử lý tự động phát (Auto-Play) và giao tiếp
//           với AI Gemini (Làm giàu thẻ, giải thích ngữ pháp, hàng đợi ngầm).
//           Nâng cấp Ver 1.2 (Lượt 4.1 — Diệt 1H + 1M Radar & 0 Problems tsc):
//           1. Diệt 1H (R05) & 1M (R06B): Chuyển fc_total_tokens sang
//              safeAddTotalTokens dùng Utils.safeLocalStorageSet (chống NaN);
//              gỡ sạch window.Utils & window.FcDB legacy, dùng thẳng ES Modules.
//           2. Diệt C4, S9 & S10 (Kho Master Lai + React 18 StrictMode):
//              - Tách toàn bộ side-effect persist ra khỏi state updaters qua
//                hàng đợi sau commit pendingPersistMapRef + persistSeq.
//              - Ngừng ghi rò rỉ fc_notebook_* xuống localStorage (chỉ lưu FcDB).
//              - Đồng bộ bất biến Kho Master Lai qua getMasterDataCache /
//                setMasterDataCache + FcDB.set + bumpMasterDataVersion().
//              - Đối khớp thẻ 2 tầng (exact -> Unicode NFC lọc \u0332).
//           3. Diệt S11, S12, S13, F11 & F13: Fallback nguồn học cho Auto-Play,
//              giải phóng Promise treo ở wait()/speak(), hủy sạch sleep timers
//              khi unmount + bootTimer 80ms chống StrictMode double-fire, và
//              đọc API Key 4 tầng tương thích kép (fc_gemini_api_key / fc_apikey).
// ============================================================================


import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS, CONFIG_SAMPLES } from '@/config/constants';
import {
  Utils,
  isValidImageUrl,
  buildSmartImageUrl,
  getMasterDataCache,
  setMasterDataCache
} from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { fillCardWithAi } from '@/services/geminiApi';


// Giới hạn số lần ngủ đông GLOBAL_PAUSE liên tiếp trước khi tự dừng hàng đợi (tránh treo vô hạn)
const MAX_GLOBAL_PAUSE_RETRIES = 4;


/**
 * Chuẩn hóa mã ngôn ngữ học về 'en' | 'zh'
 * @param {any} lang
 * @returns {'en' | 'zh'}
 */
const normalizeLearningLang = (lang) => (lang === 'zh' ? 'zh' : 'en');


/**
 * Chuẩn hóa chế độ dữ liệu về 'vocab' | 'sentence'
 * @param {any} mode
 * @returns {'vocab' | 'sentence'}
 */
const normalizeDataMode = (mode) => (mode === 'sentence' ? 'sentence' : 'vocab');


/**
 * Chuẩn hóa khóa từ vựng theo Unicode NFC + loại bỏ ký tự gạch chân \u0332
 * @param {any} val
 * @returns {string}
 */
const normalizeTermKey = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .normalize('NFC')
    .replace(/\u0332/g, '')
    .trim()
    .toLowerCase();
};


/**
 * Tìm chỉ mục thẻ theo 2 tầng: khớp chính xác trước -> fallback chuẩn hóa NFC
 * @param {any[]} list
 * @param {string} cardTerm
 * @returns {number}
 */
const findCardIndex = (list, cardTerm) => {
  if (!Array.isArray(list) || !cardTerm) return -1;
  const exactIdx = list.findIndex((c) => c && c.term === cardTerm);
  if (exactIdx !== -1) return exactIdx;
  const normTarget = normalizeTermKey(cardTerm);
  if (!normTarget) return -1;
  return list.findIndex((c) => c && normalizeTermKey(c.term) === normTarget);
};


/**
 * Đọc an toàn chuỗi từ localStorage
 * @param {string} key
 * @returns {string}
 */
const safeStorageGet = (key) => {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};


/**
 * [V1.23 + F13] Đọc Level trực tiếp từ LocalStorage qua Utils.safeJsonParse
 * @param {any} lang
 * @returns {string[]}
 */
const getDirectLevelContext = (lang) => {
  const safeLang = normalizeLearningLang(lang);
  const storageKey = `fc_current_level_${safeLang}`;
  /** @type {string[]} */
  let result = [];


  try {
    const parsed = Utils?.safeJsonParse ? Utils.safeJsonParse(storageKey, null) : null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      result = parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } else if (typeof parsed === 'string' && parsed.trim() !== '') {
      result = [parsed.trim()];
    } else {
      const rawLevel = safeStorageGet(storageKey);
      if (rawLevel) {
        const cleanRaw = rawLevel.replace(/["[\]]/g, '').trim();
        if (cleanRaw) result = [cleanRaw];
      }
    }
  } catch {
    // Bỏ qua lỗi đọc cấp độ trực tiếp
  }


  // Quét dự phòng trong settings cũ nếu vẫn rỗng
  if (result.length === 0) {
    try {
      const settings = Utils?.safeJsonParse ? Utils.safeJsonParse('fc_settings', null) : null;
      if (settings && typeof settings === 'object' && settings.currentLevel) {
        result = Array.isArray(settings.currentLevel)
          ? settings.currentLevel.map((item) => String(item || '').trim()).filter(Boolean)
          : [String(settings.currentLevel).trim()].filter(Boolean);
      }
    } catch {
      // Bỏ qua lỗi đọc settings cũ
    }
  }


  return result;
};


/**
 * [VER 1.2] Đọc động khoảng nghỉ giữa các thẻ từ fc_ai_config (luôn chặn sàn nhất quán ở 3000ms)
 * @param {number} [defaultMs=5000]
 * @returns {number}
 */
const getDynamicQueueDelayMs = (defaultMs = 5000) => {
  try {
    const aiCfg = Utils?.safeJsonParse ? Utils.safeJsonParse('fc_ai_config', null) : null;
    const configured = parseInt(String(aiCfg?.delayMs ?? ''), 10);
    if (Number.isFinite(configured) && configured >= 0) {
      return Math.max(3000, configured);
    }
  } catch {
    // Bỏ qua lỗi đọc cấu hình
  }
  return defaultMs;
};


/**
 * [VER 1.2 - DIỆT F11] Đọc API Key khả dụng 4 tầng tương thích kép:
 * State -> STORAGE_KEYS.API_KEY (fc_gemini_api_key) -> fc_apikey (legacy) -> fc_paid_apikey -> fc_apikey_pool
 * @param {string} [stateApiKey='']
 * @returns {string}
 */
const resolveActiveApiKey = (stateApiKey = '') => {
  /** @param {any} val */
  const cleanKey = (val) =>
    typeof val === 'string' ? val.replace(/["'\s]/g, '').trim() : '';


  const fromState = cleanKey(stateApiKey);
  if (fromState.length >= 10) return fromState;


  try {
    const primaryKeyName = STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key';
    const fromPrimary = cleanKey(safeStorageGet(primaryKeyName));
    if (fromPrimary.length >= 10) return fromPrimary;


    if (primaryKeyName !== 'fc_apikey') {
      const fromLegacy = cleanKey(safeStorageGet('fc_apikey'));
      if (fromLegacy.length >= 10) return fromLegacy;
    }


    const fromPaid = cleanKey(safeStorageGet('fc_paid_apikey'));
    if (fromPaid.length >= 10) return fromPaid;


    const pool = Utils?.safeJsonParse ? Utils.safeJsonParse('fc_apikey_pool', []) : [];
    if (Array.isArray(pool)) {
      const firstValid = pool.find((k) => cleanKey(k).length >= 10);
      if (firstValid) return cleanKey(firstValid);
    }
  } catch {
    // Bỏ qua lỗi truy cập storage
  }


  return '';
};


/**
 * Xây dựng danh sách trường bắt buộc theo chế độ (chỉ bắt buộc ảnh ở chế độ Từ vựng)
 * @param {'en' | 'zh'} lang
 * @param {'vocab' | 'sentence'} dataMode
 * @returns {string[]}
 */
const buildRequiredFields = (lang, dataMode) => {
  const isSentence = dataMode === 'sentence';
  const fields = ['pronunciation', 'definition', 'partOfSpeech', 'topic', 'example'];
  if (isSentence) {
    fields.push('grammar_type');
  } else {
    fields.push('image');
    if (lang === 'zh') {
      fields.push('sinoViet');
    }
  }
  return fields;
};


/**
 * Kiểm tra đường dẫn ảnh hợp lệ qua helpers (hỗ trợ http/https/data:image và chặn chuỗi rác)
 * @param {any} val
 * @returns {boolean}
 */
const checkIsValidImage = (val) => {
  if (typeof isValidImageUrl === 'function') return isValidImageUrl(val);
  if (typeof Utils?.isValidImageUrl === 'function') return Utils.isValidImageUrl(val);
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (
    /^https?:\/\/.+/i.test(trimmed) ||
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed)
  );
};


/**
 * Dựng URL ảnh sạch qua buildSmartImageUrl, tuyệt đối chặn fallback bằng chữ Hán hoặc câu dài
 * @param {any} aiImage
 * @param {any} existingImage
 * @param {string} fallbackTerm
 * @param {'en' | 'zh'} lang
 * @param {'vocab' | 'sentence'} dataMode
 * @returns {string}
 */
const resolveSafeImageFallback = (aiImage, existingImage, fallbackTerm, lang, dataMode) => {
  if (checkIsValidImage(aiImage)) return String(aiImage).trim();


  const smartBuilder =
    typeof buildSmartImageUrl === 'function'
      ? buildSmartImageUrl
      : typeof Utils?.buildSmartImageUrl === 'function'
      ? Utils.buildSmartImageUrl
      : null;


  if (!smartBuilder) return '';


  // 1. Ưu tiên chuyển đổi nếu AI hoặc thẻ cũ lưu từ khóa tiếng Anh sạch (không chứa chữ Hán)
  const candidateKeyword =
    (typeof aiImage === 'string' && aiImage.trim()) ||
    (typeof existingImage === 'string' && existingImage.trim()) ||
    '';


  if (candidateKeyword && !/[\u4e00-\u9fa5]/.test(candidateKeyword)) {
    const builtFromKeyword = smartBuilder(candidateKeyword, '', dataMode);
    if (builtFromKeyword) return builtFromKeyword;
  }


  // 2. Chỉ cho phép fallback bằng term ở chế độ Từ vựng Tiếng Anh (cấm tuyệt đối chữ Hán & Câu văn)
  if (
    lang !== 'zh' &&
    dataMode !== 'sentence' &&
    typeof fallbackTerm === 'string' &&
    fallbackTerm.trim() !== '' &&
    !/[\u4e00-\u9fa5]/.test(fallbackTerm)
  ) {
    return smartBuilder('', fallbackTerm, dataMode) || '';
  }


  return '';
};


/**
 * Lọc bỏ các trường nháp/metadata trước khi lưu vào thẻ (chống phình LocalStorage & IndexedDB)
 * @param {any} payload
 * @returns {Record<string, any>}
 */
const stripTransientAiFields = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  const { _tokenUsage: _tu, posAnalysis: _pa, image_keyword: _ik, ...cleanData } = payload;
  return cleanData;
};


/**
 * Xác định danh sách thẻ đang hiển thị (State Targeting)
 * @param {any} state
 * @returns {any[]}
 */
const getActiveCardsArray = (state) => {
  if (!state) return [];
  if (state.isStudyingNotebook) return Array.isArray(state.notebook) ? state.notebook : [];
  if (state.studySourceName === 'mastered') {
    return Array.isArray(state.mastered) ? state.mastered : [];
  }
  if (state.studySourceName === 'incorrect') {
    return Array.isArray(state.incorrectList) ? state.incorrectList : [];
  }
  return Array.isArray(state.cards) ? state.cards : [];
};


/**
 * [VER 1.2 - DIỆT 1H RADAR] Cộng dồn tổng số Token an toàn qua Utils.safeLocalStorageSet + chống NaN
 * @param {any} tokenUsage
 * @param {((val: number) => void) | undefined} setTotalTokens
 */
const safeAddTotalTokens = (tokenUsage, setTotalTokens) => {
  const used = Number(tokenUsage?.totalTokenCount);
  if (!Number.isFinite(used) || used <= 0) return;


  const rawPrev = Number(safeStorageGet('fc_total_tokens'));
  const prevSafe = Number.isFinite(rawPrev) && rawPrev > 0 ? Math.floor(rawPrev) : 0;
  const newTotal = prevSafe + Math.floor(used);


  Utils?.safeLocalStorageSet?.('fc_total_tokens', String(newTotal));
  if (typeof setTotalTokens === 'function') {
    setTotalTokens(newTotal);
  }
};


/**
 * [VER 1.2 - DIỆT 1M RADAR] Cầu nối gọi trực tiếp ES Module fillCardWithAi đủ 7 tham số
 * @param {string} term
 * @param {'en' | 'zh'} lang
 * @param {string} apiKey
 * @param {string[] | null} missingFields
 * @param {'vocab' | 'sentence'} dataMode
 * @param {string[]} levelContext
 * @param {Record<string, any> | null} [existingData=null]
 */
const callFillCardWithAi = async (
  term,
  lang,
  apiKey,
  missingFields,
  dataMode,
  levelContext,
  existingData = null
) => {
  if (typeof fillCardWithAi !== 'function') {
    throw new Error('Không tìm thấy hàm fillCardWithAi trong hệ thống.');
  }
  return await fillCardWithAi(
    term,
    lang,
    apiKey,
    missingFields,
    dataMode,
    levelContext,
    existingData
  );
};


/**
 * Helper trích xuất thông điệp lỗi an toàn cho tsc/checkJs
 * @param {unknown} err
 * @returns {string}
 */
const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String(/** @type {{ message?: any }} */ (err).message || 'Lỗi không xác định');
  }
  return String(err || 'Lỗi không xác định');
};


/**
 * Hook quản lý Auto-Play và các tác vụ AI Gemini (Làm giàu thẻ, Giải thích ngữ pháp, Hàng đợi ngầm)
 * @param {Record<string, any>} core
 * @param {import('react').MutableRefObject<any>} latestStateRef
 * @param {Record<string, any>} [callbacks={}]
 */
export const useAiLogic = (core, latestStateRef, callbacks = {}) => {
  const {
    isAutoPlaying,
    currentCardIndex,
    setIsFlipped,
    setIsContentHidden,
    autoPlayTimeoutRef,
    apiKey,
    setIsAiLoading,
    setCards,
    setTotalTokens,
    setNotebook,
    setMastered,
    setIncorrectList,
    aiQueueRef,
    isAiQueueProcessing,
    processingCardsRef,
    lang: coreLang,
    dataMode: coreDataMode,
    viewMode: coreViewMode,
    isAiModeLearn: coreIsAiModeLearn,
    isStudyingNotebook: coreIsStudyingNotebook,
    studySourceName: coreStudySourceName
  } = core;


  // Giữ tham chiếu core mới nhất trong Ref để tuyệt đối không đưa object `core` vào useCallback deps
  const coreRef = useRef(core);
  coreRef.current = core;


  // Phong ấn callbacks vào Ref để tránh làm đổi tham chiếu runAutoPlay khi render lại
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);


  // Theo dõi vòng đời mount (StrictMode-safe) & quản lý dọn sạch timer ngủ đông (Diệt S13)
  const isMountedRef = useRef(true);
  /** @type {import('react').MutableRefObject<Set<{ id: ReturnType<typeof setTimeout>, resolve: () => void }>>} */
  const activeSleepTimersRef = useRef(new Set());


  // [VER 1.2 - DIỆT S12] Ref giải phóng Promise treo của wait() & speak() khi dừng/chuyển thẻ
  /** @type {import('react').MutableRefObject<(() => void) | null>} */
  const autoPlayWaitResolveRef = useRef(null);
  /** @type {import('react').MutableRefObject<(() => void) | null>} */
  const autoPlaySpeakResolveRef = useRef(null);


  // [VER 1.2 - DIỆT C4] Hàng đợi persist sau commit chuẩn React 18 StrictMode (Map khử trùng idempotent)
  /** @type {import('react').MutableRefObject<Map<string, { kind: 'db' | 'ls', key: string, data: any }>>} */
  const pendingPersistMapRef = useRef(new Map());
  const [persistSeq, setPersistSeq] = useState(0);


  // Cờ báo hiệu vòng lặp đang chạy và ID phiên chạy chống chồng chéo
  const isLoopRunning = useRef(false);
  const autoPlaySessionRef = useRef(0);


  // Hàng đợi tuần tự cho tính năng Làm giàu thẻ khi đang học
  /** @type {import('react').MutableRefObject<string[]>} */
  const enrichQueueRef = useRef([]);
  const isProcessingEnrichQueue = useRef(false);


  // Cờ theo dõi trạng thái Bật/Tắt thực tế của Học AI để chỉ gọi abort() khi chuyển Bật -> Tắt
  const wasLearnAiActiveRef = useRef(false);


  // [VER 1.2 - DIỆT S12] Hủy toàn bộ timer & giải phóng tức thì mọi Promise đang chờ của Auto-Play
  const cancelPendingAutoPlayWait = useCallback(() => {
    if (autoPlayTimeoutRef?.current) {
      clearTimeout(autoPlayTimeoutRef.current);
      autoPlayTimeoutRef.current = null;
    }
    if (autoPlayWaitResolveRef.current) {
      const resolveWait = autoPlayWaitResolveRef.current;
      autoPlayWaitResolveRef.current = null;
      resolveWait();
    }
    if (autoPlaySpeakResolveRef.current) {
      const resolveSpeak = autoPlaySpeakResolveRef.current;
      autoPlaySpeakResolveRef.current = null;
      resolveSpeak();
    }
  }, [autoPlayTimeoutRef]);


  // [VER 1.2 - DIỆT S13] Hàm ngủ có thể hủy tức thì khi Unmount (cho AI Queue & Enrich Queue)
  const cancellableQueueDelay = useCallback((ms) => {
    if (!isMountedRef.current || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      /** @type {{ id: ReturnType<typeof setTimeout>, resolve: () => void }} */
      const entry = {
        id: /** @type {any} */ (null),
        resolve: () => {}
      };
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(entry.id);
        activeSleepTimersRef.current.delete(entry);
        resolve();
      };
      entry.resolve = done;
      entry.id = setTimeout(done, ms);
      activeSleepTimersRef.current.add(entry);
    });
  }, []);


  // Dọn dẹp toàn bộ timers & Promise đang chờ khi unmount (hỗ trợ remount StrictMode)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelPendingAutoPlayWait();
      enrichQueueRef.current = [];
      const entries = Array.from(activeSleepTimersRef.current);
      activeSleepTimersRef.current.clear();
      entries.forEach((entry) => {
        clearTimeout(entry.id);
        entry.resolve();
      });
    };
  }, [cancelPendingAutoPlayWait]);


  // [VER 1.2 - DIỆT C4] Thực thi ghi FcDB / Utils.safeLocalStorageSet sau khi React commit xong
  useEffect(() => {
    if (pendingPersistMapRef.current.size === 0) return;
    const tasks = Array.from(pendingPersistMapRef.current.values());
    pendingPersistMapRef.current.clear();


    tasks.forEach((task) => {
      if (task.kind === 'db') {
        FcDB.set(task.key, task.data).catch((err) => {
          console.warn(`[useAiLogic] Lỗi ghi FcDB (${task.key}):`, err);
        });
      } else if (task.kind === 'ls') {
        Utils?.safeLocalStorageSet?.(task.key, task.data);
      }
    });
  }, [persistSeq]);


  // [VER 1.2 - DIỆT C4, S9, S10] Đồng bộ dữ liệu thẻ bất biến xuyên 5 kho + Kho Master Lai (RAM Mirror <-> FcDB)
  const syncCardAcrossPools = useCallback(
    (cardTerm, patchData, targetLang = null, targetMode = null) => {
      if (!cardTerm || !patchData || typeof patchData !== 'object') return;


      const liveState = latestStateRef?.current || coreRef.current;
      const activeLang = normalizeLearningLang(liveState?.lang || coreLang);
      const activeMode = normalizeDataMode(liveState?.dataMode || coreDataMode);
      const resolvedLang = targetLang ? normalizeLearningLang(targetLang) : activeLang;
      const resolvedMode = targetMode ? normalizeDataMode(targetMode) : activeMode;
      const isSameActiveLang = activeLang === resolvedLang;
      const isSameActiveMode = activeMode === resolvedMode;
      const canPersistMainCardsLs =
        isSameActiveLang && isSameActiveMode && !liveState?.studySourceName;


      const sampleCfg = resolvedLang === 'zh' ? CONFIG_SAMPLES?.zh : CONFIG_SAMPLES?.en;
      const dataStorageKey = sampleCfg?.dataKey || `fc_data_${resolvedLang}`;
      const notebookDbKey = `fc_notebook_${resolvedLang}`;
      const masteredDbKey = `fc_mastered_${resolvedLang}`;
      const incorrectDbKey = `${STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list'}_${resolvedLang}`;


      /**
       * Đẩy tác vụ ghi sau commit vào Map (idempotent dưới StrictMode)
       * @param {'db' | 'ls'} kind
       * @param {string} key
       * @param {any} data
       */
      const enqueuePersist = (kind, key, data) => {
        if (!key) return;
        pendingPersistMapRef.current.set(`${kind}:${key}`, { kind, key, data });
      };


      /**
       * Pure updater: không thực thi side-effect I/O trực tiếp trong thân updater
       * @param {any[]} prev
       * @param {string | null} [dbKey=null]
       * @param {string | null} [lsKey=null]
       */
      const updateList = (prev, dbKey = null, lsKey = null) => {
        if (!Array.isArray(prev)) return prev;
        const idx = findCardIndex(prev, cardTerm);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...patchData };
        if (dbKey) enqueuePersist('db', dbKey, next);
        if (lsKey) enqueuePersist('ls', lsKey, next);
        return next;
      };


      if (isSameActiveLang && isMountedRef.current) {
        if (isSameActiveMode && typeof setCards === 'function') {
          setCards((/** @type {any[]} */ prev) =>
            updateList(prev, null, canPersistMainCardsLs ? dataStorageKey : null)
          );
        }
        // [DIỆT S10] Sổ tay, Đã thuộc, Lỗi sai CHỈ lưu vào FcDB (IndexedDB), không rò rỉ ra localStorage
        if (typeof setNotebook === 'function') {
          setNotebook((/** @type {any[]} */ prev) => updateList(prev, notebookDbKey, null));
        }
        if (typeof setMastered === 'function') {
          setMastered((/** @type {any[]} */ prev) => updateList(prev, masteredDbKey, null));
        }
        if (typeof setIncorrectList === 'function') {
          setIncorrectList((/** @type {any[]} */ prev) => updateList(prev, incorrectDbKey, null));
        }
        setPersistSeq((n) => n + 1);
      } else {
        // Người dùng đã chuyển ngôn ngữ khi API đang bay: cập nhật bất biến trực tiếp trên FcDB
        const dbKeysToPatch = [notebookDbKey, masteredDbKey, incorrectDbKey];
        Promise.all(
          dbKeysToPatch.map(async (dbKey) => {
            try {
              const stored = await FcDB.get(dbKey);
              if (!Array.isArray(stored)) return;
              const idx = findCardIndex(stored, cardTerm);
              if (idx === -1) return;
              const next = [...stored];
              next[idx] = { ...next[idx], ...patchData };
              await FcDB.set(dbKey, next);
            } catch (err) {
              console.warn(`[useAiLogic] Lỗi đồng bộ chéo ngôn ngữ (${dbKey}):`, err);
            }
          })
        ).catch(() => {});
      }


      // [DIỆT S9] Đồng bộ bất biến Kho Master Lai (RAM Mirror 0ms <-> IndexedDB) & bumpMasterDataVersion
      const masterDataKey = `fc_master_data_${resolvedLang}_${resolvedMode}`;
      (async () => {
        try {
          let masterData = getMasterDataCache(masterDataKey);
          if (!masterData || typeof masterData !== 'object' || Array.isArray(masterData)) {
            masterData = await FcDB.get(masterDataKey);
          }
          if (!masterData || typeof masterData !== 'object' || Array.isArray(masterData)) {
            return;
          }


          /** @type {Record<string, any>} */
          const nextMaster = { ...masterData };
          let updatedMaster = false;


          Object.keys(masterData).forEach((levelKey) => {
            const levelArr = masterData[levelKey];
            if (!Array.isArray(levelArr)) return;
            const mIdx = findCardIndex(levelArr, cardTerm);
            if (mIdx !== -1) {
              const nextLevelArr = [...levelArr];
              nextLevelArr[mIdx] = { ...nextLevelArr[mIdx], ...patchData };
              nextMaster[levelKey] = nextLevelArr;
              updatedMaster = true;
            }
          });


          if (updatedMaster) {
            setMasterDataCache(masterDataKey, nextMaster);
            await FcDB.set(masterDataKey, nextMaster);
            if (
              isMountedRef.current &&
              typeof coreRef.current?.bumpMasterDataVersion === 'function'
            ) {
              coreRef.current.bumpMasterDataVersion();
            }
          }
        } catch (err) {
          console.warn(`[useAiLogic] Lỗi đồng bộ Kho Master Lai (${masterDataKey}):`, err);
        }
      })();
    },
    [
      coreDataMode,
      coreLang,
      latestStateRef,
      setCards,
      setIncorrectList,
      setMastered,
      setNotebook
    ]
  );


  // ==================================================================================
  // 1. CÁC HÀM TRÌ HOÃN (DELAYS — CHỐNG RÒ RỈ PROMISE TREO)
  // ==================================================================================
  /**
   * Hàm đợi an toàn dùng riêng cho AutoPlay (có thể bị ngắt & resolve tức thì bởi cancelPendingAutoPlayWait)
   * @param {number} ms
   * @returns {Promise<void>}
   */
  const wait = useCallback(
    (ms) =>
      new Promise((resolve) => {
        if (autoPlayTimeoutRef?.current) {
          clearTimeout(autoPlayTimeoutRef.current);
          autoPlayTimeoutRef.current = null;
        }
        if (autoPlayWaitResolveRef.current) {
          const prevResolve = autoPlayWaitResolveRef.current;
          autoPlayWaitResolveRef.current = null;
          prevResolve();
        }


        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          if (autoPlayWaitResolveRef.current === done) {
            autoPlayWaitResolveRef.current = null;
          }
          if (autoPlayTimeoutRef?.current) {
            clearTimeout(autoPlayTimeoutRef.current);
            autoPlayTimeoutRef.current = null;
          }
          resolve();
        };


        autoPlayWaitResolveRef.current = done;
        const timerId = setTimeout(done, ms);
        if (autoPlayTimeoutRef) {
          autoPlayTimeoutRef.current = timerId;
        }
      }),
    [autoPlayTimeoutRef]
  );


  // ==================================================================================
  // 2. LOGIC AUTO-PLAY (STABLE VERSION - KHÔI PHỤC NGUYÊN BẢN BLOCK 6.2 + DIỆT S11/S12)
  // ==================================================================================
  const runAutoPlay = useCallback(async () => {
    if (isLoopRunning.current) return;
    if (!latestStateRef?.current?.isAutoPlaying) return;


    isLoopRunning.current = true;
    const sessionId = ++autoPlaySessionRef.current;
    const isSessionValid = () =>
      Boolean(
        isMountedRef.current &&
          latestStateRef?.current?.isAutoPlaying &&
          autoPlaySessionRef.current === sessionId
      );


    try {
      const live = latestStateRef.current;
      const idx = live.currentCardIndex;
      const settings = live.settings;
      // [DIỆT S11] Ưu tiên state.cards[idx] (bảo toàn Shuffle), fallback getActiveCardsArray nếu rỗng
      const card = live.cards?.[idx] || getActiveCardsArray(live)?.[idx];


      if (!card) {
        isLoopRunning.current = false;
        return;
      }


      // --- KIỂM TRA SRS ---
      if (
        settings?.srsEnabled !== false &&
        card.srs_due &&
        card.srs_due > Date.now()
      ) {
        await wait(2000);
        if (isSessionValid()) {
          isLoopRunning.current = false;
          if (typeof callbacksRef.current?.handleNext === 'function') {
            callbacksRef.current.handleNext();
          }
        }
        return;
      }


      const textToSpeak = card.term;
      const repeatCount = Math.max(1, settings?.repeatCount || 1);


      // --- VÒNG LẶP LẠI ---
      for (let i = 0; i < repeatCount; i++) {
        if (!isSessionValid()) break;


        // 1. Reset mặt trước
        setIsContentHidden(false);
        if (latestStateRef.current.isFlipped) {
          setIsFlipped(false);
          await wait(600);
        }


        if (!isSessionValid()) break;


        // 2. Đọc (Speak) kèm cơ chế giải phóng Promise & dọn timer an toàn chống rò rỉ
        const minTimePromise = wait(1500);
        const speakPromise = new Promise((resolve) => {
          let settled = false;
          const finishSpeak = () => {
            if (settled) return;
            settled = true;
            if (autoPlaySpeakResolveRef.current === finishSpeak) {
              autoPlaySpeakResolveRef.current = null;
            }
            resolve('done');
          };
          autoPlaySpeakResolveRef.current = finishSpeak;


          if (typeof callbacksRef.current?.speak === 'function') {
            callbacksRef.current.speak(textToSpeak, null, null, finishSpeak);
          } else {
            finishSpeak();
          }
        });


        // Tính toán thời gian động dựa trên độ dài văn bản (150ms/ký tự, tối thiểu 10 giây)
        const dynamicTimeoutMs = Math.max(
          10000,
          (textToSpeak ? String(textToSpeak).length : 0) * 150
        );
        /** @type {ReturnType<typeof setTimeout> | null} */
        let speakTimeoutId = null;
        const timeoutPromise = new Promise((resolve) => {
          speakTimeoutId = setTimeout(() => resolve('timeout'), dynamicTimeoutMs);
        });


        try {
          await Promise.all([
            Promise.race([speakPromise, timeoutPromise]),
            minTimePromise
          ]);
        } finally {
          if (speakTimeoutId) clearTimeout(speakTimeoutId);
          autoPlaySpeakResolveRef.current = null;
        }


        if (!isSessionValid()) break;
        await wait(settings?.delayAfterRead || 1000);


        if (!isSessionValid()) break;


        // 3. Lật ra sau
        if (!latestStateRef.current.isFlipLocked) {
          setIsFlipped(true);
          await wait(600);
          if (!isSessionValid()) break;
          await wait(settings?.delayFlip || 2000);
        } else {
          await wait(settings?.delayFlip || 2000);
        }


        // 4. Nghỉ giữa các lần lặp
        if (i < repeatCount - 1) {
          if (!isSessionValid()) break;
          if (!latestStateRef.current.isFlipLocked) {
            setIsFlipped(false);
            await wait(600);
          }
          if (!isSessionValid()) break;
          await wait(800);
        }
      }


      // --- CHUYỂN THẺ ---
      if (isSessionValid()) {
        if (latestStateRef.current.isFlipped) {
          setIsFlipped(false);
          await wait(600);
        }
        if (!isSessionValid()) return;
        await wait(settings?.delayNext || 1500);
        if (!isSessionValid()) return;


        isLoopRunning.current = false;
        if (typeof callbacksRef.current?.handleNext === 'function') {
          callbacksRef.current.handleNext();
        }
      }
    } catch (e) {
      console.error('AutoPlay Error:', e);
      isLoopRunning.current = false;
    } finally {
      if (autoPlaySessionRef.current === sessionId) {
        if (!isMountedRef.current || !latestStateRef?.current?.isAutoPlaying) {
          isLoopRunning.current = false;
        }
      }
    }
  }, [latestStateRef, setIsFlipped, setIsContentHidden, wait]);


  // [EFFECT MASTER] - Khóa chặt dependency [isAutoPlaying, currentCardIndex] theo đúng Block 6.2 gốc
  // Tuyệt đối không đưa runAutoPlay/callbacks vào dependency để tránh hủy timer khi lật thẻ (setIsFlipped)
  useEffect(() => {
    cancelPendingAutoPlayWait();


    if (isAutoPlaying) {
      isLoopRunning.current = false;
      runAutoPlay();
    } else {
      autoPlaySessionRef.current += 1;
      isLoopRunning.current = false;
      setIsContentHidden(false);
      if (typeof callbacksRef.current?.stopSpeaking === 'function') {
        callbacksRef.current.stopSpeaking();
      }
    }


    return () => {
      cancelPendingAutoPlayWait();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoPlaying, currentCardIndex]);


  // ==================================================================================
  // 3. CÁC LOGIC KHÁC (AI QUEUE CHO SỔ TAY)
  // ==================================================================================
  const processAiQueue = useCallback(async () => {
    if (!isAiQueueProcessing || !aiQueueRef) return;
    if (isAiQueueProcessing.current) return;
    isAiQueueProcessing.current = true;


    let consecutiveFailures = 0;
    let globalPauseRetries = 0;


    // Bọc try...finally ngoài vòng while đảm bảo 0% nguy cơ deadlock khóa hàng đợi
    try {
      while (isMountedRef.current && aiQueueRef.current.length > 0) {
        const term = aiQueueRef.current[0];
        const currentApiKey = resolveActiveApiKey(apiKey);
        const liveState = latestStateRef?.current || coreRef.current;
        const reqLang = normalizeLearningLang(liveState?.lang || coreLang);
        const reqMode = normalizeDataMode(liveState?.dataMode || coreDataMode);


        let shouldDelay = false;
        let shouldShift = true;
        let customDelayMs = 0;


        try {
          if (!currentApiKey) {
            continue;
          }
          const currentNotebook = Array.isArray(liveState?.notebook) ? liveState.notebook : [];
          const noteIdx = findCardIndex(currentNotebook, term);
          const noteCard = noteIdx !== -1 ? currentNotebook[noteIdx] : null;


          // Chỉ bắt buộc 'image' ở chế độ Từ vựng (!isSentence)
          const requiredFields = buildRequiredFields(reqLang, reqMode);


          const missingFields = noteCard
            ? requiredFields.filter((field) => {
                const val = noteCard[field];
                if (field === 'grammar_type') {
                  return (
                    !val ||
                    (Array.isArray(val) && val.length === 0) ||
                    (typeof val === 'string' && val.trim() === '')
                  );
                }
                if (field === 'image') return !checkIsValidImage(val);
                const strVal = val ? String(val).trim() : '';
                return strVal === '';
              })
            : requiredFields;


          if (missingFields.length === 0) {
            continue;
          }


          shouldDelay = true;


          const levelContext = getDirectLevelContext(reqLang);


          const res = await callFillCardWithAi(
            term,
            reqLang,
            currentApiKey,
            missingFields,
            reqMode,
            levelContext,
            noteCard || null
          );


          if (!isMountedRef.current) break;


          if (res && typeof res === 'object') {
            safeAddTotalTokens(res._tokenUsage, setTotalTokens);
            const cleanRes = stripTransientAiFields(res);


            if (missingFields.includes('image')) {
              const safeImg = resolveSafeImageFallback(
                cleanRes.image,
                noteCard?.image,
                term,
                reqLang,
                reqMode
              );
              if (safeImg) {
                cleanRes.image = safeImg;
              } else {
                delete cleanRes.image;
              }
            }


            syncCardAcrossPools(
              term,
              {
                ...cleanRes,
                ai_explanation: cleanRes.example || noteCard?.example || 'Enriched'
              },
              reqLang,
              reqMode
            );
          }


          consecutiveFailures = 0;
          globalPauseRetries = 0;
        } catch (e) {
          const errMsg = getErrorMessage(e);
          if (errMsg.includes('GLOBAL_PAUSE')) {
            globalPauseRetries++;
            if (globalPauseRetries >= MAX_GLOBAL_PAUSE_RETRIES) {
              if (typeof callbacksRef.current?.showToast === 'function') {
                callbacksRef.current.showToast(
                  'Máy chủ AI đang giới hạn tần suất (429) kéo dài. Đã tạm dừng tự động điền sổ tay!',
                  'error'
                );
              }
              aiQueueRef.current = [];
              break;
            }
            shouldShift = false;
            customDelayMs = 15500;
            console.warn(
              `[AI Queue] Tạm nghỉ 15.5s để né 429 (lần ${globalPauseRetries}/${MAX_GLOBAL_PAUSE_RETRIES})... Giữ lại từ: ${term}`
            );
          } else {
            shouldDelay = true;
            console.warn(`Auto-fill skipped for ${term}:`, e);
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              if (typeof callbacksRef.current?.showToast === 'function') {
                callbacksRef.current.showToast(
                  'Máy chủ AI quá tải. Đã dừng tự động điền sổ tay!',
                  'error'
                );
              }
              aiQueueRef.current = [];
              break;
            }
          }
        } finally {
          if (shouldShift && aiQueueRef.current.length > 0) {
            aiQueueRef.current.shift();
          }
          if (isMountedRef.current) {
            if (customDelayMs > 0) {
              await cancellableQueueDelay(customDelayMs);
            } else if (shouldDelay) {
              await cancellableQueueDelay(getDynamicQueueDelayMs(5000));
            }
          }
        }
      }
    } finally {
      isAiQueueProcessing.current = false;
    }
  }, [
    aiQueueRef,
    apiKey,
    cancellableQueueDelay,
    coreDataMode,
    coreLang,
    isAiQueueProcessing,
    latestStateRef,
    setTotalTokens,
    syncCardAcrossPools
  ]);


  // ==================================================================================
  // 4. LOGIC ENRICH CARD (Làm giàu thẻ học hiện tại)
  // ==================================================================================
  /**
   * @param {any} indexOrCardOrEvent
   * @param {boolean} [silent=false]
   * @returns {Promise<boolean>}
   */
  const handleAiEnrichCard = useCallback(
    async (indexOrCardOrEvent, silent = false) => {
      const notify = callbacksRef.current?.showToast;
      const effectiveKey = resolveActiveApiKey(apiKey);
      if (!effectiveKey) {
        if (!silent && typeof notify === 'function') {
          notify('Chưa có API Key!', 'error');
        }
        return false;
      }


      const state = latestStateRef?.current || coreRef.current;
      const reqLang = normalizeLearningLang(state?.lang || coreLang);
      const reqMode = normalizeDataMode(state?.dataMode || coreDataMode);
      const activeArr = getActiveCardsArray(state);


      /** @type {string | null} */
      let cardTerm = null;
      if (typeof indexOrCardOrEvent === 'number') {
        cardTerm = activeArr[indexOrCardOrEvent]?.term || null;
      } else if (
        indexOrCardOrEvent &&
        typeof indexOrCardOrEvent === 'object' &&
        indexOrCardOrEvent.term
      ) {
        cardTerm = String(indexOrCardOrEvent.term);
      } else {
        const idx = state.currentCardIndex;
        cardTerm = activeArr[idx]?.term || null;
      }


      if (!cardTerm) {
        if (!silent && typeof notify === 'function') {
          notify('Không xác định được từ vựng!', 'error');
        }
        return false;
      }


      if (processingCardsRef?.current?.has(cardTerm)) {
        if (!silent && typeof notify === 'function') {
          notify('Đang xử lý từ này...', 'info');
        }
        return false;
      }


      processingCardsRef?.current?.add(cardTerm);
      if (!silent && isMountedRef.current) setIsAiLoading(true);


      try {
        const matchIdx = findCardIndex(activeArr, cardTerm);
        const currentCard = matchIdx !== -1 ? activeArr[matchIdx] : null;
        const requiredFields = buildRequiredFields(reqLang, reqMode);


        const missingFields = requiredFields.filter((f) => {
          const val = currentCard?.[f];
          if (f === 'grammar_type') {
            return (
              !val ||
              (Array.isArray(val) && val.length === 0) ||
              (typeof val === 'string' && val.trim() === '')
            );
          }
          if (f === 'image') return !checkIsValidImage(val);
          return !val || String(val).trim() === '';
        });


        // Trả về false nếu không gọi API, giúp quá trình chạy ngầm quét 0ms
        if (missingFields.length === 0) {
          if (!silent && typeof notify === 'function') {
            notify('Thẻ đã đầy đủ!', 'success');
          }
          return false;
        }


        const levelContext = getDirectLevelContext(reqLang);


        const enriched = await callFillCardWithAi(
          cardTerm,
          reqLang,
          effectiveKey,
          missingFields,
          reqMode,
          levelContext,
          currentCard || null
        );


        if (!enriched || typeof enriched !== 'object') {
          throw new Error('AI trả về dữ liệu rỗng.');
        }


        safeAddTotalTokens(enriched._tokenUsage, setTotalTokens);
        const cleanEnriched = stripTransientAiFields(enriched);


        if (missingFields.includes('image')) {
          const safeImg = resolveSafeImageFallback(
            cleanEnriched.image,
            currentCard?.image,
            cardTerm,
            reqLang,
            reqMode
          );
          if (safeImg) {
            cleanEnriched.image = safeImg;
          } else {
            delete cleanEnriched.image;
          }
        }


        const enrichedData = {
          ...cleanEnriched,
          ai_explanation: cleanEnriched.example || currentCard?.example || 'Enriched',
          is_enriched: true
        };


        syncCardAcrossPools(cardTerm, enrichedData, reqLang, reqMode);


        if (!silent && typeof notify === 'function') {
          notify('Đã bổ sung thông tin cơ bản!', 'success');
        }
        return true;
      } catch (e) {
        if (!silent && typeof notify === 'function') {
          notify('Lỗi AI: ' + getErrorMessage(e), 'error');
        }
        if (silent) {
          throw e;
        }
        return false;
      } finally {
        processingCardsRef?.current?.delete(cardTerm);
        if (!silent && isMountedRef.current) setIsAiLoading(false);
      }
    },
    [
      apiKey,
      coreDataMode,
      coreLang,
      latestStateRef,
      processingCardsRef,
      setIsAiLoading,
      setTotalTokens,
      syncCardAcrossPools
    ]
  );


  /**
   * @param {number} [index]
   */
  const handleExplainGrammar = useCallback(
    async (index) => {
      const notify = callbacksRef.current?.showToast;
      const effectiveKey = resolveActiveApiKey(apiKey);
      if (!effectiveKey) {
        if (typeof notify === 'function') notify('Cần API Key!', 'warning');
        return;
      }


      const state = latestStateRef?.current || coreRef.current;
      const reqLang = normalizeLearningLang(state?.lang || coreLang);
      const reqMode = normalizeDataMode(state?.dataMode || coreDataMode);
      const activeArr = getActiveCardsArray(state);
      const targetIdx = typeof index === 'number' ? index : state.currentCardIndex;
      const targetCard = activeArr[targetIdx];
      const cardTerm = targetCard?.term;


      if (!cardTerm) return;


      if (isMountedRef.current) setIsAiLoading(true);
      try {
        const levelContext = getDirectLevelContext(reqLang);


        const result = await callFillCardWithAi(
          cardTerm,
          reqLang,
          effectiveKey,
          ['analysis'],
          reqMode,
          levelContext,
          targetCard || null
        );


        if (result?.analysis) {
          safeAddTotalTokens(result._tokenUsage, setTotalTokens);
          syncCardAcrossPools(cardTerm, { analysis: result.analysis }, reqLang, reqMode);
          if (typeof notify === 'function') notify('Phân tích xong!', 'success');
        }
      } catch (e) {
        if (typeof notify === 'function') {
          notify('Lỗi AI: ' + getErrorMessage(e), 'error');
        }
      } finally {
        if (isMountedRef.current) setIsAiLoading(false);
      }
    },
    [
      apiKey,
      coreDataMode,
      coreLang,
      latestStateRef,
      setIsAiLoading,
      setTotalTokens,
      syncCardAcrossPools
    ]
  );


  /**
   * @param {string} term
   * @param {Record<string, any> | null} [existingData=null]
   * @returns {Promise<Record<string, any> | null>}
   */
  const handleManualAiFill = useCallback(
    async (term, existingData = null) => {
      const notify = callbacksRef.current?.showToast;
      const effectiveKey = resolveActiveApiKey(apiKey);
      if (!effectiveKey) {
        if (typeof notify === 'function') notify('Cần API Key!', 'warning');
        return null;
      }


      const state = latestStateRef?.current || coreRef.current;
      const reqLang = normalizeLearningLang(state?.lang || coreLang);
      const reqMode = normalizeDataMode(state?.dataMode || coreDataMode);


      if (isMountedRef.current) setIsAiLoading(true);
      try {
        const levelContext = getDirectLevelContext(reqLang);


        const res = await callFillCardWithAi(
          term,
          reqLang,
          effectiveKey,
          null,
          reqMode,
          levelContext,
          existingData
        );


        if (res && typeof res === 'object') {
          safeAddTotalTokens(res._tokenUsage, setTotalTokens);
          const cleanRes = stripTransientAiFields(res);
          const safeImg = resolveSafeImageFallback(
            cleanRes.image,
            existingData?.image,
            term,
            reqLang,
            reqMode
          );
          if (safeImg) {
            cleanRes.image = safeImg;
          } else {
            delete cleanRes.image;
          }
          return cleanRes;
        }
        return null;
      } catch (e) {
        if (typeof notify === 'function') notify(getErrorMessage(e), 'error');
        return null;
      } finally {
        if (isMountedRef.current) setIsAiLoading(false);
      }
    },
    [apiKey, coreDataMode, coreLang, latestStateRef, setIsAiLoading, setTotalTokens]
  );


  // ==================================================================================
  // 5. ĐỘNG CƠ HÀNG ĐỢI LÀM GIÀU THẺ (ENRICH QUEUE WORKER)
  // ==================================================================================
  const processEnrichQueue = useCallback(async () => {
    if (isProcessingEnrichQueue.current) return;
    isProcessingEnrichQueue.current = true;


    let consecutiveFailures = 0;
    let globalPauseRetries = 0;


    try {
      while (isMountedRef.current && enrichQueueRef.current.length > 0) {
        const termToEnrich = enrichQueueRef.current[0];
        let shouldDelay = false;
        let shouldShift = true;
        let customDelayMs = 0;


        try {
          const apiHit = await handleAiEnrichCard({ term: termToEnrich }, true);
          shouldDelay = apiHit;
          consecutiveFailures = 0;
          globalPauseRetries = 0;
        } catch (e) {
          const errMsg = getErrorMessage(e);
          if (errMsg.includes('GLOBAL_PAUSE')) {
            globalPauseRetries++;
            if (globalPauseRetries >= MAX_GLOBAL_PAUSE_RETRIES) {
              if (typeof callbacksRef.current?.showToast === 'function') {
                callbacksRef.current.showToast(
                  'Máy chủ AI đang giới hạn tần suất (429) kéo dài. Tiến trình Làm giàu thẻ tự động đã tạm dừng!',
                  'error'
                );
              }
              enrichQueueRef.current = [];
              break;
            }
            shouldShift = false;
            customDelayMs = 15500;
            console.warn(
              `[Enrich Queue] Tạm nghỉ 15.5s để né 429 (lần ${globalPauseRetries}/${MAX_GLOBAL_PAUSE_RETRIES})... Giữ lại từ: ${termToEnrich}`
            );
          } else {
            shouldDelay = true;
            console.warn(`Background enrich error for ${termToEnrich}:`, e);
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              if (typeof callbacksRef.current?.showToast === 'function') {
                callbacksRef.current.showToast(
                  'Máy chủ AI quá tải. Tiến trình Làm giàu thẻ tự động đã bị dừng!',
                  'error'
                );
              }
              enrichQueueRef.current = [];
              break;
            }
          }
        } finally {
          if (shouldShift && enrichQueueRef.current.length > 0) {
            enrichQueueRef.current.shift();
          }
          if (isMountedRef.current) {
            if (customDelayMs > 0) {
              await cancellableQueueDelay(customDelayMs);
            } else if (shouldDelay) {
              await cancellableQueueDelay(getDynamicQueueDelayMs(5000));
            }
          }
        }
      }
    } finally {
      isProcessingEnrichQueue.current = false;
    }
  }, [cancellableQueueDelay, handleAiEnrichCard]);


  // Tự động làm sạch hàng đợi nền khi người dùng chuyển ngôn ngữ, chế độ hoặc nguồn học
  useEffect(() => {
    enrichQueueRef.current = [];
  }, [coreLang, coreDataMode, coreIsStudyingNotebook, coreStudySourceName]);


  // Tính số lượng thẻ hiện có của nguồn học đang active để làm dependency ổn định cho Effect
  const activeCardsCount = getActiveCardsArray(core).length;


  // Effect: Batch Enrich (Chạy Tuần Tự) — có bootTimer 80ms chống StrictMode double-fire (Diệt S13)
  useEffect(() => {
    const activeCards = getActiveCardsArray(latestStateRef?.current || coreRef.current);
    const hasEffectiveApiKey = Boolean(resolveActiveApiKey(apiKey));
    const isLearnAiActive = Boolean(
      coreViewMode === 'learn' &&
        coreIsAiModeLearn &&
        activeCards.length > 0 &&
        hasEffectiveApiKey
    );


    if (isLearnAiActive) {
      wasLearnAiActiveRef.current = true;


      if (
        typeof window !== 'undefined' &&
        (!window.__currentGameAbortController ||
          window.__currentGameAbortController.signal.aborted)
      ) {
        window.__currentGameAbortController = new AbortController();
      }


      const currentTerm = activeCards[currentCardIndex]?.term;
      if (!currentTerm) return undefined;


      // Trì hoãn 80ms để React 18 StrictMode không kích hoạt 2 luồng Gemini song song lúc mount
      const bootTimer = setTimeout(() => {
        if (!isMountedRef.current) return;
        const latestCards = getActiveCardsArray(latestStateRef?.current || coreRef.current);
        if (latestCards.length === 0) return;


        /** @type {string[]} */
        const nextTerms = [];
        const liveTerm = latestCards[currentCardIndex]?.term;
        if (liveTerm) nextTerms.push(liveTerm);


        // Nạp thêm 2 thẻ kế tiếp
        for (let i = 1; i <= 2; i++) {
          const nextIdx = (currentCardIndex + i) % latestCards.length;
          const nextTerm = latestCards[nextIdx]?.term;
          if (nextTerm && !nextTerms.includes(nextTerm)) {
            nextTerms.push(nextTerm);
          }
        }


        nextTerms.forEach((term) => {
          if (!enrichQueueRef.current.includes(term)) {
            enrichQueueRef.current.push(term);
          }
        });


        processEnrichQueue();
      }, 80);


      return () => clearTimeout(bootTimer);
    }


    // Dọn dẹp hàng đợi nếu tắt tính năng hoặc thoát màn hình
    enrichQueueRef.current = [];


    // CHỈ kích hoạt Kill Switch khi chế độ Học AI thực sự chuyển từ Bật -> Tắt
    if (wasLearnAiActiveRef.current) {
      wasLearnAiActiveRef.current = false;
      if (typeof window !== 'undefined' && window.__currentGameAbortController) {
        window.__currentGameAbortController.abort('User toggled off AI');
        window.__currentGameAbortController = new AbortController();
      }
    }
    return undefined;
  }, [
    currentCardIndex,
    coreIsAiModeLearn,
    coreViewMode,
    coreIsStudyingNotebook,
    coreStudySourceName,
    coreLang,
    coreDataMode,
    activeCardsCount,
    apiKey,
    latestStateRef,
    processEnrichQueue
  ]);


  return {
    runAutoPlay,
    processAiQueue,
    handleAiEnrichCard,
    handleExplainGrammar,
    handleManualAiFill
  };
};


export const Block6_2_useAiLogic = useAiLogic;


if (typeof window !== 'undefined') {
  const win = /** @type {any} */ (window);
  win.Block6_2_useAiLogic = useAiLogic;
  win.Block14_useAiLogic = useAiLogic;
  win.useAiLogic = useAiLogic;
}


export default useAiLogic;