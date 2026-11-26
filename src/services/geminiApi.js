// ============================================================================
// FILE 14/85: src/services/geminiApi.js
// NGUỒN GỐC: Tầng 2 - Block 2.1c (Gemini API Service V4.23)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 15:29 (GMT+7)
// NHIỆM VỤ: Trạm điều phối Gemini API hợp nhất (executeGeminiRequest, Mutex Lock,
//           Radar RPD có markExhausted, 7 tầng Proxy có Timeout 8s & lọc HTML lỗi,
//           cách ly tuyệt đối Paid Key làm chốt chặn cuối & Ma trận Thị giác
//           Song ngữ Anh – Trung tách nhánh).
//           Nâng cấp Ver 1.2 (Lượt 4.1 — Diệt 7/7 HIGH Radar & 0 Problems tsc):
//           1. Diệt 7/7 HIGH Radar (R05): Thay toàn bộ `localStorage.setItem` trần
//              bằng `safeLocalStorageSet`, bọc `try/catch` toàn bộ lệnh đọc Storage.
//           2. Diệt C1 & C2: Gỡ 3 named import chết (`getPrompt`, `cleanText`,
//              `detectSentence`) khỏi `helpers.js`; sửa regex lọc ngoặc tròn
//              `/.*?/g` cho `sinoViet`.
//           3. Diệt S1 (Chống đốt tiền Paid Key): Tách `resolveEffectiveKeyPool`
//              thành `{ freeKeys, paidKey }` (Paid Key chỉ chạy chốt chặn cuối,
//              không trộn vòng xoay, không bị bóp RPD free, không ghi đè slot Key chính).
//           4. Diệt S2, S3 & S4: Phân tách HTTP `400 API_KEY_INVALID` (phạt 24h & đổi key)
//              vs `400 Bad Request` (dừng ngay); `encodeURIComponent(cleanK)`; lọc Proxy
//              trả HTTP 200 kèm HTML rác ở `fetchWithFallback`; đồng bộ trả về cả
//              `tokenMetadata` lẫn `_tokenUsage` ở `callGeminiApi`.
//           5. Diệt F1 -> F5 & 0 Problems tsc: Chống `NaN` ở `fc_key_pointer` /
//              `fc_global_api_pause`, mở rộng `advKeywords` đủ 9 cấp + Array Armor
//              `levelContext`, chặn `null` từ `parseAiJson`, gỡ `window.IoeDataEngine`
//              và xóa nhánh `'vi'` trong `fetchAiDistractorsBatch`.
// ============================================================================


import { STORAGE_KEYS, AI_MODELS, IoeEnumRegistry } from '../config/constants.js';
import { DEFAULT_PROMPTS } from '../config/prompts.js';
import {
  Utils,
  safeJsonParse,
  safeLocalStorageSet,
  parseAiJson,
  buildSmartImageUrl
} from '../utils/helpers.js';
import { IoeDataEngine } from '../engines/pedagogyEngine.js';


// ============================================================================
// 0.0 CÁC HÀM PHÒNG THỦ STORAGE, CHUẨN HÓA KEY & NHẬN DIỆN CÂU NỘI BỘ
// ============================================================================


/**
 * Đọc localStorage an toàn (không crash ở Safari ẩn danh / SSR / Vitest)
 * @param {string} key
 * @param {string} [fallback='']
 * @returns {string}
 */
const safeStorageGet = (key, fallback = '') => {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const val = localStorage.getItem(key);
    return val !== null && val !== undefined ? val : fallback;
  } catch {
    return fallback;
  }
};


/**
 * Làm sạch chuỗi API Key (loại bỏ dấu nháy, khoảng trắng, ký tự điều khiển)
 * @param {any} rawKey
 * @returns {string}
 */
const cleanApiKey = (rawKey) => {
  if (typeof rawKey !== 'string') return '';
  return rawKey.replace(/["'\s]/g, '').trim();
};


/**
 * Nhận diện chuỗi là Câu văn hay Từ vựng (Hỗ trợ chuẩn EN & CJK — Diệt C1)
 * @param {any} text
 * @returns {boolean}
 */
const isSentenceText = (text) => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.replace(/\u0332/g, '').trim();
  if (!trimmed) return false;
  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed.length >= 6 || /[。！？，；,.!?]/.test(trimmed);
  }
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount >= 4 || /[.!?]$/.test(trimmed);
};


/**
 * Dựng prompt từ kho mẫu chuẩn (thay thế named import hỏng `getPrompt` — Diệt C1)
 * @param {string} promptKey
 * @param {Record<string, any>} [vars={}]
 * @returns {string}
 */
const resolvePromptTemplate = (promptKey, vars = {}) => {
  if (Utils && typeof Utils.getPrompt === 'function') {
    const fromUtils = Utils.getPrompt(promptKey, vars);
    if (typeof fromUtils === 'string' && fromUtils.trim() !== '') {
      return fromUtils;
    }
  }
  const promptMap = /** @type {Record<string, string>} */ (DEFAULT_PROMPTS || {});
  const fallbackAliasMap = /** @type {Record<string, string>} */ ({
    quiz_word: 'quizword',
    match_word: 'match',
    match_sentence: 'match'
  });
  let template =
    promptMap[promptKey] ||
    (fallbackAliasMap[promptKey] ? promptMap[fallbackAliasMap[promptKey]] : '') ||
    '';


  if (!template) {
    if (promptKey === 'grammar') {
      template = 'Hãy giải thích chi tiết cấu trúc ngữ pháp của câu sau bằng Tiếng Việt: "{sentence}" (Ngôn ngữ: {lang}).';
    } else if (promptKey.startsWith('quiz')) {
      template =
        'Tạo 3 đáp án nhiễu hợp lý cho mục tiêu "{baseText}" (Đáp án đúng: "{targetText}"). Trả về JSON { "distractors": [...] }.';
    } else if (promptKey.startsWith('match')) {
      template =
        'Tạo {count} đáp án nhiễu ({fullLang}) cho danh sách sau:\n{itemsText}\nTrả về JSON { "distractors": [...] }.';
    }
  }


  for (const [k, v] of Object.entries(vars || {})) {
    const replacement = v === undefined || v === null ? '' : String(v);
    template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), replacement);
  }
  return template;
};


/**
 * Làm sạch văn bản phản hồi từ AI (thay thế named import hỏng `cleanText` — Diệt C1)
 * @param {any} rawText
 * @returns {string}
 */
const cleanAiText = (rawText) => {
  if (rawText === undefined || rawText === null) return '';
  const utilsAny = /** @type {any} */ (Utils);
  if (utilsAny && typeof utilsAny.cleanText === 'function') {
    return String(utilsAny.cleanText(rawText) || '').trim();
  }
  return String(rawText)
    .replace(/^```(?:markdown|text|json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
};


/**
 * Kiểm tra phản hồi lỗi 400 có phải do API Key không hợp lệ (S2)
 * @param {any} errObj
 * @param {string} msgLower
 * @returns {boolean}
 */
const isInvalidApiKeyError = (errObj, msgLower) => {
  if (
    msgLower.includes('api key') ||
    msgLower.includes('api_key_invalid') ||
    msgLower.includes('key not valid') ||
    msgLower.includes('invalid key')
  ) {
    return true;
  }
  const details = Array.isArray(errObj?.details) ? errObj.details : [];
  return details.some(
    (d) =>
      d &&
      (String(d.reason || '').toUpperCase() === 'API_KEY_INVALID' ||
        String(d.reason || '').toUpperCase() === 'API_KEY_EXPIRED')
  );
};


// ============================================================================
// 0.A CƠ CHẾ KHÓA ĐA LUỒNG (GLOBAL MUTEX LOCK) - CHỐNG RACE CONDITION
// ============================================================================
let apiMutex = Promise.resolve();


/**
 * @template T
 * @param {() => Promise<T>} taskFn
 * @returns {Promise<T>}
 */
export const withApiLock = async (taskFn) => {
  const previousLock = apiMutex;
  /** @type {() => void} */
  let releaseLock = () => {};
  apiMutex = new Promise((resolve) => {
    releaseLock = () => resolve();
  });
  await previousLock.catch(() => {});
  try {
    return await taskFn();
  } finally {
    releaseLock();
  }
};


// ============================================================================
// 0.B HỆ THỐNG QUẢN LÝ ÁN PHẠT API, CẤU HÌNH ĐỘNG & CẦU DAO TOÀN CỤC
// ============================================================================
/**
 * @returns {Record<string, { startedAt: number, expireAt: number }>}
 */
export const getPersistentCooldowns = () => {
  const parsed = safeJsonParse('fc_api_cooldowns', {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};


/**
 * @param {string} key
 * @param {number} durationMs
 */
export const setKeyCooldown = (key, durationMs) => {
  const cleanK = cleanApiKey(key);
  if (!cleanK) return;
  const safeDuration = Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : 0;
  const cooldowns = getPersistentCooldowns();
  const now = Date.now();
  cooldowns[cleanK] = { startedAt: now, expireAt: now + safeDuration };
  safeLocalStorageSet('fc_api_cooldowns', cooldowns);
};


/**
 * @returns {Record<string, { startedAt: number, expireAt: number }>}
 */
export const cleanExpiredCooldowns = () => {
  const cooldowns = getPersistentCooldowns();
  let changed = false;
  const now = Date.now();
  for (const k of Object.keys(cooldowns)) {
    const entry = cooldowns[k];
    if (!entry || typeof entry.expireAt !== 'number' || !Number.isFinite(entry.expireAt) || now > entry.expireAt) {
      delete cooldowns[k];
      changed = true;
    }
  }
  if (changed) {
    safeLocalStorageSet('fc_api_cooldowns', cooldowns);
  }
  return cooldowns;
};


/**
 * @returns {boolean}
 */
export const isGlobalPaused = () => {
  const pauseUntil = parseInt(safeStorageGet('fc_global_api_pause', '0'), 10);
  return Number.isFinite(pauseUntil) && Date.now() < pauseUntil;
};


/**
 * @param {number} [durationMs=15000]
 */
export const triggerGlobalPause = (durationMs = 15000) => {
  const safeMs = Number.isFinite(Number(durationMs)) ? Math.max(1000, Number(durationMs)) : 15000;
  safeLocalStorageSet('fc_global_api_pause', String(Date.now() + safeMs));
};


/**
 * @returns {number}
 */
export const getCooldown429Ms = () => {
  const config = safeJsonParse('fc_ai_config', {});
  const minutes = Number(config?.cooldown429);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 120;
  return safeMinutes * 60 * 1000;
};


// Helper nội bộ: Đọc động thời gian chờ timeout mạng từ fc_ai_config
const getConfiguredTimeoutMs = () => {
  try {
    const aiCfg = safeJsonParse('fc_ai_config', {});
    const loadingTimeSec = parseInt(String(aiCfg?.loadingTime ?? ''), 10);
    if (Number.isFinite(loadingTimeSec) && loadingTimeSec > 0) {
      return loadingTimeSec * 1000 + 5000;
    }
  } catch {
    // Bỏ qua lỗi cấu hình, dùng mặc định
  }
  return 25000;
};


// Helper nội bộ: Đọc động thời gian nghỉ giữa 2 lượt gọi API từ fc_ai_config
const getConfiguredDelayMs = () => {
  try {
    const aiCfg = safeJsonParse('fc_ai_config', {});
    const delay = parseInt(String(aiCfg?.delayMs ?? ''), 10);
    if (Number.isFinite(delay) && delay >= 0) {
      return delay;
    }
  } catch {
    // Bỏ qua lỗi cấu hình, dùng mặc định
  }
  return 2500;
};


/**
 * [VER 1.2 - DIỆT S1] Tập hợp kho Key chuẩn hóa:
 * - Khử sạch dấu nháy/khoảng trắng & khử trùng tuyệt đối bằng Set.
 * - Tách bạch `freeKeys` (xoay vòng) và `paidKey` (chốt chặn cuối — chỉ chạy khi
 *   toàn bộ Free Keys cạn quota/cooldown, tuyệt đối không bị trộn vào vòng xoay).
 * @param {string | null} [apiKeyOverride=null]
 * @returns {{ freeKeys: string[], paidKey: string }}
 */
const resolveEffectiveKeyPool = (apiKeyOverride = null) => {
  const paidKeyCandidate = cleanApiKey(safeStorageGet('fc_paid_apikey', ''));
  const paidKey = paidKeyCandidate.length >= 10 ? paidKeyCandidate : '';


  /** @type {Set<string>} */
  const freeSet = new Set();


  /** @param {any} rawK */
  const addFreeKey = (rawK) => {
    const cleaned = cleanApiKey(rawK);
    if (cleaned.length >= 10 && cleaned !== paidKey) {
      freeSet.add(cleaned);
    }
  };


  // Đọc danh sách key dự phòng & key chính
  const rawPool = safeJsonParse('fc_apikey_pool', []);
  if (Array.isArray(rawPool)) {
    rawPool.forEach(addFreeKey);
  }


  if (apiKeyOverride) addFreeKey(apiKeyOverride);


  const primaryStorageKey = STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key';
  addFreeKey(safeStorageGet(primaryStorageKey, ''));
  addFreeKey(safeStorageGet('fc_apikey', ''));
  addFreeKey(safeStorageGet('fc_gemini_api_key', ''));


  return {
    freeKeys: Array.from(freeSet),
    paidKey
  };
};


// Helper nội bộ: Dựng danh sách Model Cascade ưu tiên model chính lên đầu
const resolveCascadeModels = () => {
  const primaryModelId =
    safeStorageGet(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model', '') || 'gemini-3.5-flash-lite';


  const modelsPool =
    Array.isArray(AI_MODELS) && AI_MODELS.length > 0
      ? [...AI_MODELS]
      : [
          { id: 'gemini-3.5-flash-lite', rpdLimit: 500 },
          { id: 'gemini-3.1-flash-lite', rpdLimit: 500 },
          { id: 'gemini-2.5-flash-lite', rpdLimit: 20 },
          { id: 'gemini-3.0-flash', rpdLimit: 20 },
          { id: 'gemini-3.5-flash', rpdLimit: 20 },
          { id: 'gemini-3.6-flash', rpdLimit: 20 },
          { id: 'gemini-3.7-flash', rpdLimit: 20 },
          { id: 'gemini-2.5-flash', rpdLimit: 20 }
        ];


  /** @type {Array<{ id: string, rpdLimit: number, name?: string }>} */
  const cascadeModels = [];
  const primaryObj = modelsPool.find((m) => m.id === primaryModelId);
  if (primaryObj) cascadeModels.push(primaryObj);
  modelsPool.forEach((m) => {
    if (m.id !== primaryModelId) cascadeModels.push(m);
  });
  return cascadeModels;
};


// ============================================================================
// 0.C BỘ ĐẾM RPD (REQUESTS PER DAY) THÔNG MINH - MA TRẬN 2 CHIỀU
// ============================================================================
export const RPDTracker = {
  _getQuotaDay: function () {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const vnTime = new Date(utc + 3600000 * 7);
    const qDate = new Date(vnTime);
    if (vnTime.getHours() < 15) {
      qDate.setDate(qDate.getDate() - 1);
    }
    const yyyy = qDate.getFullYear();
    const mm = String(qDate.getMonth() + 1).padStart(2, '0');
    const dd = String(qDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },


  _load: function () {
    const key = STORAGE_KEYS?.QUOTA_TRACKER || 'fc_quota_tracker';
    let data = safeJsonParse(key, null);
    const currentQuotaDay = this._getQuotaDay();
    if (!data || typeof data !== 'object' || data.quotaDay !== currentQuotaDay || !data.usage) {
      data = { quotaDay: currentQuotaDay, usage: {} };
      safeLocalStorageSet(key, data);
    }
    return data;
  },


  /** @param {{ quotaDay: string, usage: Record<string, Record<string, number>> }} data */
  _save: function (data) {
    const key = STORAGE_KEYS?.QUOTA_TRACKER || 'fc_quota_tracker';
    safeLocalStorageSet(key, data);
  },


  /**
   * @param {string} [key]
   * @param {string} [modelId]
   * @returns {any}
   */
  getUsage: function (key, modelId) {
    const data = this._load();
    if (!key && !modelId) return data.usage || {};
    if (!key || !modelId) return 0;
    const cleanK = cleanApiKey(String(key));
    return data.usage[cleanK]?.[modelId] || data.usage[key]?.[modelId] || 0;
  },


  /**
   * @param {string} key
   * @param {string} modelId
   */
  incrementUsage: function (key, modelId) {
    if (!key || !modelId) return;
    const cleanK = cleanApiKey(String(key));
    if (!cleanK) return;
    const data = this._load();
    if (!data.usage[cleanK]) data.usage[cleanK] = {};
    data.usage[cleanK][modelId] = (data.usage[cleanK][modelId] || 0) + 1;
    this._save(data);
  },


  /**
   * Alias tương thích Mapping.md
   * @param {string} key
   * @param {string} modelId
   */
  increment: function (key, modelId) {
    return this.incrementUsage(key, modelId);
  },


  /**
   * Đánh dấu cạn hạn ngạch ngày cho cặp (Key, Model) khi Google báo 429 Quota
   * @param {string} key
   * @param {string} modelId
   * @param {number | null} [limitOverride=null]
   */
  markExhausted: function (key, modelId, limitOverride = null) {
    if (!key || !modelId) return;
    const cleanK = cleanApiKey(String(key));
    if (!cleanK) return;
    const modelObj = Array.isArray(AI_MODELS)
      ? AI_MODELS.find((m) => m.id === modelId)
      : null;
    const limit =
      limitOverride !== null && Number.isFinite(Number(limitOverride))
        ? Number(limitOverride)
        : modelObj?.rpdLimit || 500;
    const data = this._load();
    if (!data.usage[cleanK]) data.usage[cleanK] = {};
    const current = data.usage[cleanK][modelId] || 0;
    if (current < limit) {
      data.usage[cleanK][modelId] = limit;
      this._save(data);
    }
  },


  /**
   * @param {string} key
   * @param {string} modelId
   * @param {number | null} [limitOverride=null]
   * @returns {boolean}
   */
  isExhausted: function (key, modelId, limitOverride = null) {
    if (!key || !modelId) return false;
    const used = Number(this.getUsage(key, modelId)) || 0;
    if (limitOverride !== null && Number.isFinite(Number(limitOverride))) {
      return used >= Number(limitOverride);
    }
    const modelObj = Array.isArray(AI_MODELS)
      ? AI_MODELS.find((m) => m.id === modelId)
      : null;
    const limit = modelObj?.rpdLimit || 500;
    return used >= limit;
  },


  /**
   * @param {string[]} [keys=[]]
   * @param {Array<string | { id: string }>} [models=AI_MODELS]
   * @returns {Record<string, Record<string, number>>}
   */
  getMatrix: function (keys = [], models = AI_MODELS || []) {
    /** @type {Record<string, Record<string, number>>} */
    const matrix = {};
    const keyList = Array.isArray(keys) ? keys : [];
    const modelList = Array.isArray(models) ? models : [];
    keyList.forEach((k) => {
      const cleanK = cleanApiKey(String(k));
      if (!cleanK) return;
      matrix[cleanK] = {};
      modelList.forEach((m) => {
        const mId = typeof m === 'string' ? m : m.id;
        matrix[cleanK][mId] = Number(this.getUsage(cleanK, mId)) || 0;
      });
    });
    return matrix;
  }
};


// ============================================================================
// 0.D ĐỘNG CƠ LÕI GỌI MẠNG GEMINI (HỢP NHẤT DRY: FREE POOL -> PAID FALLBACK)
// ============================================================================
/**
 * @param {Record<string, any>} payload
 * @param {string | null} [apiKeyOverride=null]
 * @param {string} [contextTag='API']
 */
const executeGeminiRequest = async (payload, apiKeyOverride = null, contextTag = 'API') => {
  return withApiLock(async () => {
    if (isGlobalPaused()) {
      throw new Error('[GLOBAL_PAUSE] Mạng đang tạm nghỉ 15s để chống bộ lọc IP Spam.');
    }


    const { freeKeys, paidKey } = resolveEffectiveKeyPool(apiKeyOverride);
    const freeCount = freeKeys.length;
    if (freeCount === 0 && !paidKey) {
      throw new Error('Chưa nhập API Key (Vui lòng cấu hình trong Settings)');
    }


    const abortSignal =
      typeof window !== 'undefined' && window.__currentGameAbortController
        ? window.__currentGameAbortController.signal
        : null;
    if (abortSignal && abortSignal.aborted) {
      throw new DOMException('Người dùng đã hủy thao tác', 'AbortError');
    }


    const dynamicTimeoutMs = getConfiguredTimeoutMs();
    const rawPointer = parseInt(safeStorageGet('fc_key_pointer', '0'), 10);
    const safePointer =
      Number.isFinite(rawPointer) && rawPointer >= 0 && freeCount > 0
        ? rawPointer % freeCount
        : 0;


    const isAuto = safeStorageGet('fc_is_auto_cascade', 'true') !== 'false';
    const isPremium = safeStorageGet('fc_is_premium_key', 'false') === 'true';
    const cascadeModels = resolveCascadeModels();


    // Xây dựng danh sách ứng viên: xoay tròn Free Keys trước, Paid Key ở cuối tuyệt đối (S1)
    /** @type {Array<{ key: string, isPaid: boolean, freeIndex: number }>} */
    const keyCandidates = [];
    for (let i = 0; i < freeCount; i++) {
      const idx = (safePointer + i) % freeCount;
      keyCandidates.push({ key: freeKeys[idx], isPaid: false, freeIndex: idx });
    }
    if (paidKey) {
      keyCandidates.push({ key: paidKey, isPaid: true, freeIndex: -1 });
    }


    /** @type {any} */
    let finalData = null;
    /** @type {string | null} */
    let usedModelId = null;
    /** @type {string | null} */
    let usedApiKey = null;
    let usedIsPaid = false;
    /** @type {any} */
    let lastError = null;
    let shortestWaitMs = Infinity;
    let hitGlobalPause = false;
    let fatalBadRequest = false;


    cleanExpiredCooldowns();
    const activeCooldowns = getPersistentCooldowns();


    for (const candidate of keyCandidates) {
      const cleanK = candidate.key;
      if (!cleanK || cleanK.length < 10) continue;


      const cdData = activeCooldowns[cleanK];
      const cooldownUntil = cdData ? cdData.expireAt : 0;
      const waitMs = cooldownUntil - Date.now();


      if (waitMs > 0) {
        if (waitMs < shortestWaitMs) shortestWaitMs = waitMs;
        continue;
      }


      const effectiveIsPremium = isPremium || candidate.isPaid;
      const modelsToTry = isAuto ? cascadeModels : [cascadeModels[0]];


      for (const model of modelsToTry) {
        const currentRpd = Number(RPDTracker.getUsage(cleanK, model.id)) || 0;
        if (!effectiveIsPremium && currentRpd >= model.rpdLimit) {
          lastError = new Error(
            `[Cạn Quota] Mô hình ${model.id} của Key ...${cleanK.slice(-4)}`
          );
          continue;
        }


        const controller = new AbortController();
        const onAbort = () => controller.abort();
        let isTimedOut = false;
        /** @type {ReturnType<typeof setTimeout> | null} */
        let timeoutId = null;


        if (abortSignal) abortSignal.addEventListener('abort', onAbort);


        try {
          timeoutId = setTimeout(() => {
            isTimedOut = true;
            controller.abort();
          }, dynamicTimeoutMs);


          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
              model.id
            )}:generateContent?key=${encodeURIComponent(cleanK)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal
            }
          );


          // Đọc thân phản hồi JSON TRƯỚC khi phân nhánh để bảo toàn logic chống Spam 429
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          /** @type {any} */
          let data = null;
          try {
            data = await res.json();
          } catch {
            data = null;
          }


          if (!res.ok || data?.error) {
            const errObj = data?.error || {};
            const errCode = errObj.code || res.status;
            const errStatus = String(errObj.status || '').toUpperCase();
            const errMsg = String(errObj.message || '');
            const msgLower = errMsg.toLowerCase();


            // 1. Nhánh 429 / Cạn Quota / Spam RPM
            if (
              res.status === 429 ||
              errCode === 429 ||
              errStatus === 'RESOURCE_EXHAUSTED' ||
              msgLower.includes('quota') ||
              msgLower.includes('rate limit')
            ) {
              if (
                msgLower.includes('per minute') ||
                msgLower.includes('rate limit') ||
                msgLower.includes('load balancer') ||
                msgLower.includes('rpm')
              ) {
                setKeyCooldown(cleanK, 5 * 60 * 1000);
                triggerGlobalPause(15000);
                hitGlobalPause = true;
                lastError = new Error(
                  `[GLOBAL_PAUSE] [Spam 429] Key ...${cleanK.slice(-4)} gọi quá nhanh (RPM).`
                );
                break;
              } else {
                if (!effectiveIsPremium) {
                  RPDTracker.markExhausted(cleanK, model.id, model.rpdLimit);
                }
                lastError = new Error(`429: Cạn Quota mô hình ${model.id}`);
                continue;
              }
            }


            // 2. Nhánh 404 (Model không tồn tại / đã ngừng hỗ trợ)
            if (res.status === 404 || errCode === 404 || errStatus === 'NOT_FOUND') {
              lastError = new Error(`404: Mô hình ${model.id} không khả dụng.`);
              continue;
            }


            // 3. Nhánh 503 / 500 (Quá tải máy chủ Google)
            if (
              res.status === 503 ||
              res.status === 500 ||
              errCode === 503 ||
              errCode === 500 ||
              msgLower.includes('overloaded') ||
              msgLower.includes('unavailable')
            ) {
              lastError = new Error(`${errCode}: Nghẽn mô hình ${model.id}`);
              continue;
            }


            // 4. Nhánh 403 (API Key bị vô hiệu hóa / sai quyền)
            if (
              res.status === 403 ||
              errCode === 403 ||
              msgLower.includes('unregistered') ||
              msgLower.includes('permission')
            ) {
              setKeyCooldown(cleanK, 24 * 60 * 60 * 1000);
              lastError = new Error(`403: Key ...${cleanK.slice(-4)} bị vô hiệu hóa.`);
              break;
            }


            // 5. Nhánh 400 — Phân tách rõ API_KEY_INVALID vs Bad Request cú pháp (S2)
            if (res.status === 400 || errCode === 400) {
              if (isInvalidApiKeyError(errObj, msgLower)) {
                setKeyCooldown(cleanK, 24 * 60 * 60 * 1000);
                lastError = new Error(`400: Key ...${cleanK.slice(-4)} không hợp lệ.`);
                break; // Chuyển sang key tiếp theo
              }
              fatalBadRequest = true;
              lastError = new Error(`400: Lỗi cú pháp - ${errMsg || 'Bad Request'}`);
              break; // Dừng ngay cả 2 vòng lặp, không gửi lặp sang key khác
            }


            // 6. Các lỗi HTTP không phải JSON hoặc lỗi khác
            if (!data && !contentType.includes('application/json')) {
              throw new Error(`HTTP ${res.status}: Lỗi mạng không xác định (Non-JSON)`);
            }
            throw new Error(errMsg || `HTTP ${res.status}: Lỗi phản hồi từ Gemini API`);
          }


          if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('AI không trả về nội dung (Response rỗng)');
          }


          finalData = data;
          usedModelId = model.id;
          usedApiKey = cleanK;
          usedIsPaid = candidate.isPaid;


          if (!candidate.isPaid && freeCount > 0) {
            safeLocalStorageSet(
              'fc_key_pointer',
              String((candidate.freeIndex + 1) % freeCount)
            );
          }
          break;
        } catch (e) {
          if (isTimedOut) {
            throw new Error(
              `Hết thời gian chờ ${Math.round(dynamicTimeoutMs / 1000)}s (Bị treo ở tầng Network).`
            );
          }
          const errName = e && typeof e === 'object' && 'name' in e ? String(e.name) : '';
          const errMsg = e instanceof Error ? e.message : String(e || '');
          if (
            (abortSignal && abortSignal.aborted) ||
            errName === 'AbortError' ||
            errMsg.includes('Người dùng đã hủy')
          ) {
            throw e;
          }
          lastError = e;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        }
      }


      if (finalData || hitGlobalPause || fatalBadRequest) break;
    }


    if (!finalData || !usedApiKey || !usedModelId) {
      if (shortestWaitMs !== Infinity && shortestWaitMs > 0 && !hitGlobalPause && !fatalBadRequest) {
        throw new Error(
          `[API_COOLDOWN] ${contextTag}: Toàn bộ kho Key đang đóng băng. Thử lại sau ${Math.ceil(
            shortestWaitMs / 60000
          )} phút.`
        );
      }
      if (lastError) throw lastError;
      throw new Error('Không có Key & Mô hình AI nào khả dụng.');
    }


    RPDTracker.incrementUsage(usedApiKey, usedModelId);


    // Chỉ gán cooldown nhẹ 5s giữa các key khi đang xoay vòng nhiều Free Keys
    if (!usedIsPaid && freeCount > 1) {
      setKeyCooldown(usedApiKey, 5000);
    }


    // [S1] Tuyệt đối KHÔNG ghi đè Paid Key lên slot API Key chính `fc_gemini_api_key`
    if (!usedIsPaid) {
      const activeStorageKey = STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key';
      if (usedApiKey !== safeStorageGet(activeStorageKey, '')) {
        safeLocalStorageSet(activeStorageKey, usedApiKey);
      }
    }


    const delayMs = getConfiguredDelayMs();
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }


    return {
      data: finalData,
      text: finalData.candidates[0].content.parts[0].text,
      tokenMetadata: finalData.usageMetadata || null,
      usedModelId,
      usedApiKey
    };
  });
};


// ============================================================================
// 1. TẢI DỮ LIỆU TỪ GOOGLE SHEETS BẰNG MẠNG LƯỚI 7 PROXY THÔNG MINH (TIMEOUT 8S)
// ============================================================================
/**
 * @param {string} url
 * @returns {Promise<Response>}
 */
export const fetchWithFallback = async (url) => {
  if (!url) throw new Error('Đường dẫn URL trống');


  // Trích xuất chính xác gid trước khi thay thế /edit -> /export?format=csv
  let finalUrl = String(url).trim();
  if (finalUrl.includes('docs.google.com') && finalUrl.includes('/edit')) {
    const gidMatch = finalUrl.match(/[?#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    finalUrl = finalUrl.replace(/\/edit.*$/, `/export?format=csv&gid=${gid}`);
  }


  const expectsCsv = /[?&](format|output)=csv/i.test(finalUrl);
  const cacheBuster = finalUrl.includes('?') ? `&cb=${Date.now()}` : `?cb=${Date.now()}`;


  const strategies = [
    { name: 'Direct', url: finalUrl },
    {
      name: 'AllOrigins',
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(finalUrl + cacheBuster)}`
    },
    {
      name: 'CorsProxyIO',
      url: `https://corsproxy.io/?${encodeURIComponent(finalUrl + cacheBuster)}`
    },
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${finalUrl}` },
    {
      name: 'CodeTabs',
      url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(finalUrl)}`
    },
    { name: 'CorsAnywhere', url: `https://cors-anywhere.herokuapp.com/${finalUrl}` },
    { name: 'CorsSH', url: `https://proxy.cors.sh/${finalUrl}` }
  ];


  for (const s of strategies) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(s.url, { signal: controller.signal });
      if (res.ok) {
        // [S3] Chặn Proxy trả HTTP 200 kèm trang HTML lỗi / captcha khi đang yêu cầu CSV
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (expectsCsv && ct.includes('text/html')) {
          console.warn(`[Proxy Fallback] ${s.name} trả về HTML thay vì CSV, thử node tiếp theo...`);
          continue;
        }
        return res;
      }
    } catch {
      console.warn(`[Proxy Fallback] ${s.name} thất bại/quá hạn 8s, thử node tiếp theo...`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error('Lỗi tải dữ liệu mạng (Tất cả Proxy đều bị chặn hoặc quá hạn)');
};


// ============================================================================
// 2. THĂM DÒ XUNG KÍCH (HEURISTIC PROBING - RADAR)
// ============================================================================
/**
 * @param {string} apiKey
 * @returns {Promise<{ status: number, ok: boolean, error?: string }>}
 */
export const pingGeminiKey = async (apiKey) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const k = cleanApiKey(apiKey);
    if (!k) return { status: 400, ok: false, error: 'API Key trống' };


    const body = { contents: [{ parts: [{ text: "Hãy trả lời 'OK'" }] }] };
    const primaryModelId =
      safeStorageGet(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model', '') || 'gemini-3.5-flash-lite';


    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        primaryModelId
      )}:generateContent?key=${encodeURIComponent(k)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );


    if (res.status === 429) {
      setKeyCooldown(k, getCooldown429Ms());
      triggerGlobalPause(15000);
    } else if (res.status === 403) {
      setKeyCooldown(k, 24 * 60 * 60 * 1000);
    } else if (res.status === 400) {
      // [S2] Xác minh lỗi 400 API_KEY_INVALID khi thăm dò
      try {
        const errData = await res.json();
        const errObj = errData?.error || {};
        const msgLower = String(errObj.message || '').toLowerCase();
        if (isInvalidApiKeyError(errObj, msgLower)) {
          setKeyCooldown(k, 24 * 60 * 60 * 1000);
        }
      } catch {
        // Bỏ qua lỗi parse
      }
    }
    return { status: res.status, ok: res.ok };
  } catch (e) {
    const errName = e && typeof e === 'object' && 'name' in e ? String(e.name) : '';
    const errMsg = e instanceof Error ? e.message : String(e || 'Network Error');
    return { status: errName === 'AbortError' ? 408 : 0, ok: false, error: errMsg };
  } finally {
    clearTimeout(timeoutId);
  }
};


// ============================================================================
// 3. GỌI API GEMINI VẠN NĂNG (HỖ TRỢ ĐẦY ĐỦ OPTIONS & ĐỒNG BỘ _tokenUsage)
// ============================================================================
/**
 * @param {string} prompt
 * @param {Record<string, any> | null} [schema=null]
 * @param {string | null} [apiKeyOverride=null]
 * @param {Record<string, any> | null} [options=null]
 * @returns {Promise<{ text: string, tokenMetadata: any, _tokenUsage: any }>}
 */
export const callGeminiApi = async (
  prompt,
  schema = null,
  apiKeyOverride = null,
  options = null
) => {
  /** @type {Record<string, any>} */
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  /** @type {Record<string, any>} */
  const genConfig = {};


  if (schema) {
    genConfig.responseMimeType = 'application/json';
    genConfig.responseSchema = schema;
  }


  if (options && typeof options === 'object') {
    if (options.systemInstruction) {
      payload.systemInstruction =
        typeof options.systemInstruction === 'string'
          ? { parts: [{ text: options.systemInstruction }] }
          : options.systemInstruction;
    }
    if (options.generationConfig && typeof options.generationConfig === 'object') {
      Object.assign(genConfig, options.generationConfig);
    }
    if (typeof options.temperature === 'number') {
      genConfig.temperature = options.temperature;
    }
    if (typeof options.maxOutputTokens === 'number') {
      genConfig.maxOutputTokens = options.maxOutputTokens;
    }
  }


  if (Object.keys(genConfig).length > 0) {
    payload.generationConfig = genConfig;
  }


  const { text, tokenMetadata } = await executeGeminiRequest(payload, apiKeyOverride, 'CallAPI');
  // [S4] Trả về đồng thời `tokenMetadata` và `_tokenUsage` để khớp 100% mọi caller
  return { text, tokenMetadata, _tokenUsage: tokenMetadata };
};


// ============================================================================
// 4. LÀM GIÀU THẺ TỰ ĐỘNG BẰNG AI (DYNAMIC SCHEMA & MA TRẬN THỊ GIÁC TÁCH NHÁNH)
// ============================================================================
/**
 * @param {string} term
 * @param {string} lang
 * @param {string | null} apiKey
 * @param {string[] | null} [targetFields=null]
 * @param {string} [dataMode='vocab']
 * @param {string[] | string} [levelContext=[]]
 * @param {Record<string, any> | null} [existingData=null]
 * @returns {Promise<Record<string, any>>}
 */
export const fillCardWithAi = async (
  term,
  lang,
  apiKey,
  targetFields = null,
  dataMode = 'vocab',
  levelContext = [],
  existingData = null
) => {
  const safeLang = lang === 'zh' ? 'zh' : 'en';
  const cleanTermForAi = term ? String(term).replace(/\u0332/g, '') : '';
  const isSentence = dataMode === 'sentence';
  const typeLabel = isSentence ? 'CÂU VĂN' : 'TỪ VỰNG';


  const activePedagogyEngine = IoeDataEngine || null;
  const levelDictionary = /** @type {Record<string, string>} */ (
    activePedagogyEngine?.LEVEL_DICTIONARY || {}
  );


  // [F5] Multi-select Array Armor cho levelContext (chấp nhận cả string lẫn string[])
  const normalizedLevels = Array.isArray(levelContext)
    ? levelContext.filter((x) => typeof x === 'string' && x.trim() !== '')
    : typeof levelContext === 'string' && levelContext.trim() !== ''
      ? [levelContext.trim()]
      : [];


  /** @type {string[]} */
  let translatedLevels = [];
  let isAdvancedLevel = false;


  if (normalizedLevels.length > 0) {
    translatedLevels = normalizedLevels.map((lvl) => levelDictionary[lvl] || lvl);
    const advKeywords = [
      'level_5',
      'level_6',
      'level_7',
      'level_8',
      'level_9',
      'hsk5',
      'hsk6',
      'hsk7',
      'hsk8',
      'hsk9',
      'hsk 5',
      'hsk 6',
      'hsk 7',
      'hsk 8',
      'hsk 9',
      'b2',
      'c1',
      'c2',
      'academic',
      'expert'
    ];
    isAdvancedLevel = normalizedLevels.some((lvl) =>
      advKeywords.some((kw) => lvl.toLowerCase().includes(kw))
    );
  } else {
    translatedLevels = [
      safeLang === 'zh'
        ? 'Tiếng Trung phổ thông (Mọi cấp độ)'
        : 'Tiếng Anh phổ thông (Mọi cấp độ)'
    ];
  }


  const posThresholdStr = isAdvancedLevel ? '10%' : '20%';


  // Lấy luật Sư phạm động từ Ma trận (Pedagogy Routing Matrix)
  const pedagogyRules = activePedagogyEngine?.getPedagogyMatrixRule
    ? activePedagogyEngine.getPedagogyMatrixRule(normalizedLevels, safeLang)
    : {
        example: 'Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng.',
        definition:
          'Bản dịch Tiếng Việt trực tiếp, chuẩn xác. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa.'
      };


  /** @type {Record<string, any>} */
  let propertiesToFetch = {
    term: { type: 'STRING' },
    pronunciation: { type: 'STRING' },
    definition: { type: 'STRING' },
    posAnalysis: { type: 'STRING' },
    partOfSpeech: { type: 'STRING' },
    topic: { type: 'STRING' },
    analysis: { type: 'STRING' },
    sinoViet: { type: 'STRING' },
    example: {
      type: 'STRING',
      description: isSentence
        ? '1 example sentence with a similar grammatical structure and its Vietnamese translation. Format: - Foreign Sentence | Vietnamese Translation'
        : "Multiline string containing examples. MUST generate exactly ONE example sentence for EACH part of speech listed in 'partOfSpeech'. Format each line exactly as: - Foreign Sentence | Vietnamese Translation"
    },
    image_keyword: {
      type: 'STRING',
      description:
        'A concrete 3 to 6 word ENGLISH visual scene description for clean illustration search (NO Chinese characters, NO Vietnamese, NO URLs, NO single abstract word).'
    },
    grammar_type: { type: 'ARRAY', items: { type: 'STRING' } }
  };


  let requiredFields = [
    'term',
    'pronunciation',
    'definition',
    'posAnalysis',
    'partOfSpeech',
    'topic',
    'analysis',
    'sinoViet',
    'example',
    'image_keyword',
    'grammar_type'
  ];


  if (safeLang !== 'zh') {
    delete propertiesToFetch.sinoViet;
    requiredFields = requiredFields.filter((f) => f !== 'sinoViet');
  }
  if (isSentence) {
    // Câu văn không dùng tờ giấy nháp tính % từ loại của từ đơn
    delete propertiesToFetch.posAnalysis;
    requiredFields = requiredFields.filter((f) => f !== 'posAnalysis');
  } else {
    delete propertiesToFetch.grammar_type;
    requiredFields = requiredFields.filter((f) => f !== 'grammar_type');
  }


  let isTrimming = false;
  if (targetFields && Array.isArray(targetFields) && targetFields.length > 0) {
    isTrimming = true;
    const mappedTargetFields = targetFields.map((f) => (f === 'image' ? 'image_keyword' : f));
    requiredFields = requiredFields.filter((f) => mappedTargetFields.includes(f));
    if (
      !isSentence &&
      requiredFields.includes('partOfSpeech') &&
      !requiredFields.includes('posAnalysis')
    ) {
      requiredFields.push('posAnalysis');
    }
    if (requiredFields.length === 0) {
      requiredFields = ['term'];
    }
  }


  const strictOrder = [
    'posAnalysis',
    'partOfSpeech',
    'example',
    'term',
    'pronunciation',
    'definition',
    'topic',
    'analysis',
    'sinoViet',
    'image_keyword',
    'grammar_type'
  ];
  /** @type {Record<string, any>} */
  const orderedProperties = {};
  strictOrder.forEach((f) => {
    if (requiredFields.includes(f) && propertiesToFetch[f]) {
      orderedProperties[f] = propertiesToFetch[f];
    }
  });
  propertiesToFetch = orderedProperties;
  requiredFields.sort((a, b) => strictOrder.indexOf(a) - strictOrder.indexOf(b));


  const promptKey = isSentence ? 'enrich_sentence' : 'enrich_word';
  const promptMap = /** @type {Record<string, string>} */ (DEFAULT_PROMPTS || {});
  let basePrompt = promptMap[promptKey] || 'Phân tích {term} ({lang})';
  basePrompt = basePrompt.replace(/{term}/g, cleanTermForAi).replace(/{lang}/g, safeLang);


  let dynamicInstruction = '';
  if (requiredFields.includes('pronunciation') || requiredFields.includes('sinoViet')) {
    dynamicInstruction =
      safeLang === 'zh'
        ? ' Đối với pronunciation: BẮT BUỘC xuất Pinyin. ' +
          (requiredFields.includes('sinoViet')
            ? 'Bắt buộc xuất thêm trường sinoViet (Âm Hán Việt thuần túy).'
            : '')
        : ' Đối với pronunciation: BẮT BUỘC xuất chuẩn quốc tế IPA. Tuyệt đối KHÔNG xuất trường sinoViet.';
  }


  let userQuery = '';
  if (isTrimming) {
    userQuery = `Nhiệm vụ: Bổ sung thông tin cho ${typeLabel} này: "${cleanTermForAi}" (Ngôn ngữ: ${safeLang}).\n`;
    userQuery += `[ĐỊNH HƯỚNG BẮT BUỘC]:\n`;
    if (requiredFields.includes('analysis')) {
      if (isSentence) {
        userQuery += `1. TIÊU ĐIỂM: Mổ xẻ ĐIỂM NGỮ PHÁP TRỌNG TÂM của câu. Giải thích công thức và cách dùng.\n`;
      } else {
        userQuery += `1. TIÊU ĐIỂM: Chỉ ra Từ loại, Phân tích gốc từ/sắc thái nghĩa, liệt kê cấu trúc đi kèm và cách dùng phổ biến.\n`;
      }
      userQuery += `2. NGÔN NGỮ & TRÌNH BÀY: Tiếng Việt. Trình bày bằng gạch đầu dòng mạch lạc.\n`;
      userQuery += `3. PHONG CÁCH: Chi tiết nhưng súc tích, đi thẳng vào bản chất.\n`;
    } else {
      userQuery += `1. TIÊU ĐIỂM: Máy trích xuất dữ liệu tự động.\n`;
      userQuery += `2. NGÔN NGỮ: Xử lý bằng Tiếng Việt dễ hiểu.\n`;
      userQuery += `3. PHONG CÁCH: Cực kỳ NGẮN GỌN (tối đa 2-3 câu), không lan man.\n`;
    }
  } else {
    userQuery = `Hãy phân tích toàn diện ${typeLabel} này: "${cleanTermForAi}" (Ngôn ngữ: ${safeLang}). Bắt buộc xuất đầy đủ JSON Schema đã định nghĩa.${dynamicInstruction}\n`;
  }


  // Bơm ngữ cảnh hiện có của thẻ (nghĩa, từ loại, chủ đề) để chống lệch nghĩa từ đa nghĩa
  if (existingData && typeof existingData === 'object') {
    const ctxParts = [];
    if (existingData.definition && String(existingData.definition).trim() !== '') {
      ctxParts.push(`Nghĩa tiếng Việt hiện có: "${String(existingData.definition).trim()}"`);
    }
    if (existingData.partOfSpeech && String(existingData.partOfSpeech).trim() !== '') {
      ctxParts.push(`Từ loại hiện có: "${String(existingData.partOfSpeech).trim()}"`);
    }
    if (existingData.topic && String(existingData.topic).trim() !== '') {
      ctxParts.push(`Chủ đề hiện có: "${String(existingData.topic).trim()}"`);
    }
    if (ctxParts.length > 0) {
      userQuery += `[NGỮ CẢNH THẺ HIỆN CÓ - BẮT BUỘC BÁM SÁT ĐỂ TRÁNH LỆCH NGHĨA]: ${ctxParts.join(
        ' | '
      )}.\n`;
    }
  }


  // Luôn bơm Vắc-xin Ngữ pháp cho chế độ Từ vựng khi cần phân loại từ loại
  if (
    !isSentence &&
    (requiredFields.includes('partOfSpeech') || requiredFields.includes('posAnalysis'))
  ) {
    userQuery += `\n[CÁC LỖI NGỮ PHÁP NGHIÊM CẤM]:\n`;
    const grammarRule = activePedagogyEngine?.getMicroTierGrammarRule
      ? activePedagogyEngine.getMicroTierGrammarRule(safeLang)
      : `- Chỉ phân loại theo đúng ngữ pháp ngôn ngữ gốc, tuyệt đối không vay mượn ngữ pháp bản dịch Tiếng Việt.\n`;
    userQuery += grammarRule + '\n';
  }


  if (isTrimming) {
    if (!isSentence && requiredFields.includes('posAnalysis')) {
      userQuery += `4. ĐỊNH DẠNG & THỨ TỰ BẮT BUỘC: TRỌNG TÂM: Phải xuất trường 'posAnalysis' ĐẦU TIÊN trong chuỗi JSON để làm nháp. Chỉ xuất CHÍNH XÁC các trường: ${requiredFields.join(
        ', '
      )}.\n`;
    } else {
      userQuery += `4. ĐỊNH DẠNG BẮT BUỘC: Chỉ xuất CHÍNH XÁC các trường: ${requiredFields.join(
        ', '
      )}.\n`;
    }
    userQuery += `${dynamicInstruction}`;
  }


  let validTagsStr = '';
  if (IoeEnumRegistry && IoeEnumRegistry.LEVEL_TO_TRAPS) {
    /** @type {string[]} */
    const tagsArr = [];
    const prefix = safeLang === 'zh' ? 'zh' : 'en';
    for (const [lvl, traps] of Object.entries(IoeEnumRegistry.LEVEL_TO_TRAPS)) {
      if (lvl.startsWith(prefix) && Array.isArray(traps)) {
        tagsArr.push(...traps);
      }
    }
    const uniqueTags = [...new Set(tagsArr)];
    if (uniqueTags.length > 0) {
      validTagsStr = `1. Nếu câu mang cấu trúc giao tiếp bình thường, không chứa bẫy ngữ pháp đặc biệt, BẮT BUỘC trả về mảng rỗng []. 2. Nếu có cấu trúc đặc trưng, chỉ chọn 1 đến 2 mã cốt lõi nhất từ danh sách: [${uniqueTags.join(
        ', '
      )}].`;
    } else {
      validTagsStr = `Chỉ xuất mã nhãn hợp lệ hoặc mảng rỗng [].`;
    }
  } else {
    validTagsStr = `Chỉ xuất mã nhãn hợp lệ hoặc mảng rỗng [].`;
  }


  let fieldRules = `\n[QUY TẮC CÁC TRƯỜNG]:\n`;
  if (requiredFields.includes('pronunciation') && isSentence) {
    fieldRules += `- 'pronunciation': Phiên âm (IPA/Pinyin) TOÀN BỘ CÂU VĂN.\n`;
  }
  if (requiredFields.includes('definition')) {
    if (isSentence) {
      fieldRules += `- 'definition': Dịch nghĩa của toàn bộ câu sang Tiếng Việt tự nhiên, chuẩn xác.\n`;
    } else {
      fieldRules += `- 'definition': Bản dịch Tiếng Việt trực tiếp, chuẩn xác. ${pedagogyRules.definition}\n`;
    }
  }
  if (requiredFields.includes('topic')) {
    const predefinedTopics =
      Array.isArray(activePedagogyEngine?.TOPICS) && activePedagogyEngine.TOPICS.length > 0
        ? activePedagogyEngine.TOPICS
        : [
            'Self & Body',
            'Social Connections',
            'Living Spaces',
            'The Natural World',
            'Food & Health',
            'Daily Life & Leisure',
            'School & Career',
            'Travel & Exploration',
            'Other'
          ];
    fieldRules += `- 'topic': Chọn CHÍNH XÁC 1 từ khóa từ: [${predefinedTopics.join(', ')}].\n`;
  }
  if (!isSentence && requiredFields.includes('posAnalysis')) {
    fieldRules += `- 'posAnalysis' (TỜ GIẤY NHÁP): Tư duy theo chuỗi. BẮT BUỘC viết phân tích chức năng ngữ pháp TRƯỚC, sau đó mới chốt lại tỉ lệ % ở cuối cùng. [LUẬT ÉP 0%]: Nếu vi phạm [CÁC LỖI NGỮ PHÁP NGHIÊM CẤM], lập tức ép % về 0.\n`;
  }
  if (requiredFields.includes('partOfSpeech')) {
    if (isSentence) {
      fieldRules += `- 'partOfSpeech': Ghi ngắn gọn là "Câu văn" (hoặc phân loại câu: Câu trần thuật / Câu nghi vấn / Câu cảm thán).\n`;
    } else {
      const posDifficulty =
        translatedLevels.length > 0
          ? ` Chỉ liệt kê từ loại phổ biến, phù hợp cấp độ [${translatedLevels.join(', ')}].`
          : ` Chỉ liệt kê từ loại phổ biến trong giao tiếp.`;
      const posFormatRule = ` Dựa vào 'posAnalysis', CHỈ xuất các từ loại >${posThresholdStr}. Dịch tên từ loại sang Tiếng Việt.`;
      const combinedPosRules = [posDifficulty, posFormatRule].join('');
      if (existingData && existingData.partOfSpeech) {
        fieldRules += `- 'partOfSpeech': User đã chỉ định là [${existingData.partOfSpeech}]. Giữ từ loại này, liệt kê thêm (nếu >${posThresholdStr}), cách nhau bằng '|'.${combinedPosRules}\n`;
      } else {
        fieldRules += `- 'partOfSpeech': Xuất kết quả cuối cùng từ 'posAnalysis', cách nhau bằng '|'.${combinedPosRules}\n`;
      }
    }
  }
  if (requiredFields.includes('analysis')) {
    if (isSentence) {
      fieldRules += `- 'analysis': Phân tích cấu trúc ngữ pháp của câu và giải nghĩa các từ vựng quan trọng trong câu (bằng Tiếng Việt, trình bày gạch đầu dòng rõ ràng).\n`;
    } else {
      fieldRules += `- 'analysis': Giải thích chi tiết cách dùng, cấu trúc đi kèm (collocations) và sắc thái nghĩa bằng Tiếng Việt.\n`;
    }
  }
  if (requiredFields.includes('image_keyword')) {
    if (isSentence) {
      fieldRules += `- 'image_keyword': Cụm 3 đến 6 từ TIẾNG ANH mô tả 1 khung cảnh/hành động hữu hình minh họa cho câu văn (VD: "student studying books at wooden desk"). TUYỆT ĐỐI CẤM xuất chữ Hán, Pinyin, tiếng Việt, URL hoặc chuỗi "none"/"null".\n`;
    } else if (safeLang === 'zh') {
      // Nhánh Ma trận Thị giác chuyên biệt cho Tiếng Trung (Tiết kiệm Token)
      fieldRules += `- 'image_keyword': Cụm 3 đến 6 từ TIẾNG ANH mô tả 1 KHUNG CẢNH HOẶC VẬT THỂ HỮU HÌNH (concrete visual scene) minh họa trực tiếp cho nghĩa chính của từ Tiếng Trung.\n`;
      fieldRules += `  1. TUYỆT ĐỐI CẤM xuất chữ Hán, Pinyin, tiếng Việt, URL, chuỗi "none"/"null", hoặc 1 từ đơn trừu tượng.\n`;
      fieldRules += `  2. CHUYỂN HÓA THỊ GIÁC THEO TỪ LOẠI TIẾNG TRUNG:\n`;
      fieldRules += `     • Danh từ cụ thể: [Đặc tính] + [Vật thể/Sinh vật chính] + [Bối cảnh sạch] (VD: 苹果 -> "fresh red apple on white plate").\n`;
      fieldRules += `     • Danh từ trừu tượng: Chuyển thành biểu tượng hoặc hiện trường thực tế đại diện (VD: 压力 -> "tired office worker holding head at desk").\n`;
      fieldRules += `     • Động từ / Động từ ly hợp (离合词): [Chủ thể người rõ ràng] + [Hành động có tư thế nhìn thấy được] (VD: 散步 -> "couple walking peacefully in green park").\n`;
      fieldRules += `     • Tính từ / Trạng từ: [Nhân vật có biểu cảm rõ] HOẶC [Vật thể mang đặc tính điển hình] (VD: 脆弱 -> "cracked glass vase on wooden table").\n`;
      fieldRules += `     • Lượng từ (量词) & Hư từ: BẮT BUỘC ghép vào 1-2 vật thể đại diện điển hình nhất (VD: 条 -> "long winding river and swimming fish"; 双 -> "pair of red sneakers and wooden chopsticks").\n`;
      fieldRules += `     • Thành ngữ (成语): Vẽ hình tượng nghĩa đen tạo hình hoặc tình huống hành vi thực tế (VD: 井底之蛙 -> "green frog sitting inside deep stone well").\n`;
    } else {
      // Nhánh Ma trận Thị giác chuyên biệt cho Tiếng Anh (Tiết kiệm Token)
      fieldRules += `- 'image_keyword': Cụm 3 đến 6 từ TIẾNG ANH mô tả 1 KHUNG CẢNH HOẶC VẬT THỂ HỮU HÌNH (concrete visual scene) minh họa trực tiếp cho nghĩa chính của từ Tiếng Anh.\n`;
      fieldRules += `  1. TUYỆT ĐỐI CẤM xuất tiếng Việt, URL, ký tự đặc biệt, chuỗi "none"/"null", hoặc chỉ lặp lại 1 từ đơn trừu tượng.\n`;
      fieldRules += `  2. CHUYỂN HÓA THỊ GIÁC THEO TỪ LOẠI TIẾNG ANH:\n`;
      fieldRules += `     • Concrete Noun: [Color/Feature] + [Main Object] + [Clean Setting] (e.g., apple -> "fresh red apple on white plate").\n`;
      fieldRules += `     • Abstract Noun: Visual metaphor or concrete real-world scene (e.g., inflation -> "shopping cart with rising price tags").\n`;
      fieldRules += `     • Verb / Phrasal Verb: [Clear Subject] + [Visible Gesture/Action] (e.g., negotiate -> "two business people shaking hands across table").\n`;
      fieldRules += `     • Adjective / Adverb: [Expressive Person] OR [Iconic Object showing trait] (e.g., fragile -> "cracked glass vase on wooden table").\n`;
      fieldRules += `     • Preposition / Function Word: Spatial diagram with simple objects (e.g., between -> "red ball sitting between two blue boxes").\n`;
      fieldRules += `     • Idiom: Concrete visual scene representing the meaning (e.g., break the ice -> "friendly coworkers smiling shaking hands at party").\n`;
    }
  }
  if (requiredFields.includes('example')) {
    if (isSentence) {
      fieldRules += `- 'example': Tạo 1 câu ví dụ mới có cấu trúc ngữ pháp tương tự câu gốc. [TIÊU CHUẨN SƯ PHẠM]: ${pedagogyRules.example}\n`;
      fieldRules += `  -> [ĐỊNH DẠNG BẮT BUỘC]: Bắt đầu bằng dấu "- " theo sau là: Câu ngoại ngữ | Bản dịch Tiếng Việt. KHÔNG chứa Pinyin/IPA.\n`;
    } else {
      fieldRules += `- 'example': Sáng tác các câu có chứa CHÍNH XÁC từ "${cleanTermForAi}". [TIÊU CHUẨN SƯ PHẠM]: ${pedagogyRules.example}\n`;
      fieldRules += `  -> [ĐỊNH DẠNG BẮT BUỘC]:\n`;
      fieldRules += `  1. Ánh xạ 1:1 với 'partOfSpeech' (Đúng số lượng, đúng thứ tự từ loại), mỗi câu 1 dòng.\n`;
      fieldRules += `  2. Bắt đầu mỗi câu bằng dấu "- " (gạch ngang và khoảng trắng), theo sau là: Câu ngoại ngữ | Bản dịch.\n`;
      fieldRules += `  3. KHÔNG chứa Pinyin/IPA, KHÔNG chèn tag từ loại.\n`;
    }
  }
  if (requiredFields.includes('grammar_type')) {
    fieldRules += `- 'grammar_type': ${validTagsStr}\n`;
  }
  userQuery += fieldRules;


  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: {
      parts: [
        {
          text: isTrimming
            ? 'BẮT BUỘC TRẢ VỀ JSON HỢP LỆ THEO SCHEMA. Không bình luận.'
            : basePrompt
        }
      ]
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: propertiesToFetch,
        required: requiredFields
      }
    }
  };


  const { text, tokenMetadata } = await executeGeminiRequest(payload, apiKey, 'SmartFill');


  const parsedRaw = parseAiJson(text);
  /** @type {Record<string, any>} */
  const parsed =
    parsedRaw && typeof parsedRaw === 'object' && !Array.isArray(parsedRaw) ? parsedRaw : {};


  // [C2] Sửa đúng regex lọc ngoặc tròn nửa rộng & toàn rộng trong âm Hán Việt
  if (safeLang === 'zh' && typeof parsed.sinoViet === 'string' && parsed.sinoViet) {
    parsed.sinoViet = parsed.sinoViet
      .replace(/.*?/g, '')
      .replace(/（.*?）/g, '')
      .trim();
  }


  /** @type {Record<string, any>} */
  const finalResult = { ...parsed, term: term };
  for (const key of Object.keys(finalResult)) {
    if (finalResult[key] === '' || finalResult[key] === null || finalResult[key] === undefined) {
      delete finalResult[key];
    }
  }
  delete finalResult.posAnalysis;
  delete finalResult.image;


  // Dựng URL ảnh sạch qua buildSmartImageUrl và xóa sạch biến nháp image_keyword
  const rawImageKeyword = finalResult.image_keyword;
  delete finalResult.image_keyword;


  if (rawImageKeyword && typeof rawImageKeyword === 'string' && rawImageKeyword.trim() !== '') {
    const smartImgUrl = buildSmartImageUrl(
      rawImageKeyword,
      safeLang === 'zh' || isSentence ? '' : cleanTermForAi,
      dataMode
    );
    if (smartImgUrl) {
      finalResult.image = smartImgUrl;
    }
  }


  if (tokenMetadata) {
    finalResult._tokenUsage = tokenMetadata;
  }


  return finalResult;
};


// ============================================================================
// 5. TẠO NHIỄU CHO GAME (QUIZ / MATCH - GIỮ TƯƠNG THÍCH NGƯỢC KIỂU ARRAY)
// ============================================================================
/**
 * @param {any} arr
 * @param {any} tokenMetadata
 * @returns {any[]}
 */
const attachTokenMetadataNonEnumerable = (arr, tokenMetadata) => {
  const safeArr = Array.isArray(arr) ? arr : [];
  if (tokenMetadata) {
    Object.defineProperty(safeArr, '_tokenUsage', {
      value: tokenMetadata,
      enumerable: false,
      configurable: true,
      writable: true
    });
  }
  return safeArr;
};


/**
 * @param {string} baseText
 * @param {string} targetText
 * @returns {Promise<any[]>}
 */
export const fetchAiDistractors = async (baseText, targetText) => {
  const cleanTarget = targetText ? String(targetText).replace(/\u0332/g, '') : '';
  const schema = {
    type: 'object',
    properties: { distractors: { type: 'array', items: { type: 'string' } } },
    required: ['distractors']
  };
  const isSentence = isSentenceText(cleanTarget);
  const promptKey = isSentence ? 'quiz_sentence' : 'quiz_word';
  const prompt = resolvePromptTemplate(promptKey, {
    baseText,
    targetText: cleanTarget,
    term: baseText,
    definition: cleanTarget
  });


  try {
    const { text, tokenMetadata } = await callGeminiApi(prompt, schema);
    const res = parseAiJson(text);
    return attachTokenMetadataNonEnumerable(res?.distractors, tokenMetadata);
  } catch (e) {
    console.warn('Lỗi lấy đáp án nhiễu:', e);
    return [];
  }
};


/**
 * @param {Array<{ term?: string, definition?: string }>} items
 * @param {string} lang
 * @returns {Promise<any[]>}
 */
export const fetchAiDistractorsBatch = async (items, lang) => {
  const safeItems = Array.isArray(items) ? items : [];
  if (safeItems.length === 0) return [];


  const schema = {
    type: 'object',
    properties: { distractors: { type: 'array', items: { type: 'string' } } },
    required: ['distractors']
  };
  const fullLang = lang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';
  const itemsText = safeItems
    .map((item, index) => {
      const cleanTerm = item?.term ? String(item.term).replace(/\u0332/g, '') : '';
      return `${index + 1}. Mục tiêu: "${cleanTerm}" (Nghĩa đúng: "${item?.definition || ''}")`;
    })
    .join('\n');


  const firstTerm = safeItems[0]?.term ? String(safeItems[0].term).replace(/\u0332/g, '') : '';
  const isSentenceMode = isSentenceText(firstTerm);
  const promptKey = isSentenceMode ? 'match_sentence' : 'match_word';
  const prompt = resolvePromptTemplate(promptKey, {
    itemsText,
    fullLang,
    count: safeItems.length
  });


  try {
    const { text, tokenMetadata } = await callGeminiApi(prompt, schema);
    const res = parseAiJson(text);
    return attachTokenMetadataNonEnumerable(res?.distractors, tokenMetadata);
  } catch (e) {
    console.warn('Lỗi nạp dữ liệu hàng loạt:', e);
    return [];
  }
};


// ============================================================================
// 6. GIẢI THÍCH NGỮ PHÁP (GRAMMAR EXPLAIN)
// ============================================================================
/**
 * @param {string} sentence
 * @param {string} lang
 * @param {string | null} apiKey
 * @returns {Promise<{ text: string, _tokenUsage: any }>}
 */
export const explainSentenceGrammar = async (sentence, lang, apiKey) => {
  const safeLang = lang === 'zh' ? 'zh' : 'en';
  const cleanSentence = sentence ? String(sentence).replace(/\u0332/g, '') : '';
  const prompt = resolvePromptTemplate('grammar', { sentence: cleanSentence, lang: safeLang });
  const { text, tokenMetadata } = await callGeminiApi(prompt, null, apiKey);
  return { text: cleanAiText(text), _tokenUsage: tokenMetadata };
};


export const GeminiApiService = {
  withApiLock,
  getPersistentCooldowns,
  setKeyCooldown,
  cleanExpiredCooldowns,
  isGlobalPaused,
  triggerGlobalPause,
  getCooldown429Ms,
  RPDTracker,
  fetchWithFallback,
  pingGeminiKey,
  callGeminiApi,
  fillCardWithAi,
  fetchAiDistractors,
  fetchAiDistractorsBatch,
  explainSentenceGrammar
};


if (typeof window !== 'undefined') {
  window.GeminiApiService = GeminiApiService;
  window.RPDTracker = RPDTracker;
  window.Utils = Object.assign(window.Utils || {}, GeminiApiService);
}


export default GeminiApiService;

