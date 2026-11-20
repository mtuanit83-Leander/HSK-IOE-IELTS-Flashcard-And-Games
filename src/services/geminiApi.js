// ============================================================================
// FILE 14/85: src/services/geminiApi.js
// NGUỒN GỐC: Tầng 2 - Block 2.1c (Gemini API Service V4.23)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 19/11/2026 - 21:51 (GMT+7)
// NHIỆM VỤ: Trạm điều phối Gemini API hợp nhất (executeGeminiRequest, Mutex Lock,
//           Radar RPD có markExhausted, 7 tầng Proxy có Timeout 8s & vá gid,
//           đọc động delayMs, xử lý 429 RPM/RPD chuẩn xác và Ma trận Thị giác
//           Song ngữ Anh – Trung tách nhánh theo ngôn ngữ).
// ============================================================================

import { STORAGE_KEYS, AI_MODELS, IoeEnumRegistry } from '../config/constants.js';
import { DEFAULT_PROMPTS } from '../config/prompts.js';
import {
  safeJsonParse,
  parseAiJson,
  getPrompt,
  cleanText,
  detectSentence,
  buildSmartImageUrl
} from '../utils/helpers.js';
import { IoeDataEngine } from '../engines/pedagogyEngine.js';

// ============================================================================
// 0.A CƠ CHẾ KHÓA ĐA LUỒNG (GLOBAL MUTEX LOCK) - CHỐNG RACE CONDITION
// ============================================================================
let apiMutex = Promise.resolve();

export const withApiLock = async (taskFn) => {
  const previousLock = apiMutex;
  let releaseLock;
  apiMutex = new Promise((resolve) => {
    releaseLock = resolve;
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
export const getPersistentCooldowns = () => {
  return safeJsonParse('fc_api_cooldowns', {});
};

export const setKeyCooldown = (key, durationMs) => {
  if (!key) return;
  const cooldowns = getPersistentCooldowns();
  const now = Date.now();
  cooldowns[key] = { startedAt: now, expireAt: now + durationMs };
  localStorage.setItem('fc_api_cooldowns', JSON.stringify(cooldowns));
};

export const cleanExpiredCooldowns = () => {
  const cooldowns = getPersistentCooldowns();
  let changed = false;
  const now = Date.now();
  for (const k in cooldowns) {
    if (now > cooldowns[k].expireAt) {
      delete cooldowns[k];
      changed = true;
    }
  }
  if (changed) localStorage.setItem('fc_api_cooldowns', JSON.stringify(cooldowns));
  return cooldowns;
};

export const isGlobalPaused = () => {
  const pauseUntil = parseInt(localStorage.getItem('fc_global_api_pause') || '0', 10);
  return Date.now() < pauseUntil;
};

export const triggerGlobalPause = (durationMs = 15000) => {
  localStorage.setItem('fc_global_api_pause', String(Date.now() + durationMs));
};

export const getCooldown429Ms = () => {
  const config = safeJsonParse('fc_ai_config', {});
  return (config.cooldown429 || 120) * 60 * 1000;
};

// Helper nội bộ: Đọc động thời gian chờ timeout mạng từ fc_ai_config
const getConfiguredTimeoutMs = () => {
  try {
    const aiCfg = safeJsonParse('fc_ai_config', {});
    const loadingTimeSec = parseInt(aiCfg?.loadingTime, 10);
    if (!isNaN(loadingTimeSec) && loadingTimeSec > 0) {
      return loadingTimeSec * 1000 + 5000;
    }
  } catch (e) {
    // Bỏ qua lỗi cấu hình, dùng mặc định
  }
  return 25000;
};

// Helper nội bộ: Đọc động thời gian nghỉ giữa 2 lượt gọi API từ fc_ai_config
const getConfiguredDelayMs = () => {
  try {
    const aiCfg = safeJsonParse('fc_ai_config', {});
    const delay = parseInt(aiCfg?.delayMs, 10);
    if (!isNaN(delay) && delay >= 0) {
      return delay;
    }
  } catch (e) {
    // Bỏ qua lỗi cấu hình, dùng mặc định
  }
  return 2500;
};

// Helper nội bộ: Tập hợp danh sách API Key an toàn từ Pool + Key đơn + Paid Key
const resolveEffectiveKeyPool = (apiKeyOverride = null) => {
  const rawPool = safeJsonParse('fc_apikey_pool', []);
  const pool = Array.isArray(rawPool) ? [...rawPool] : [];

  const addUniqueKey = (k) => {
    if (!k || typeof k !== 'string') return;
    const trimmed = k.replace(/["'\s]/g, '');
    if (trimmed.length >= 10 && !pool.includes(trimmed)) {
      pool.push(trimmed);
    }
  };

  if (apiKeyOverride) addUniqueKey(apiKeyOverride);

  const primaryStorageKey = STORAGE_KEYS?.API_KEY || 'fc_apikey';
  addUniqueKey(localStorage.getItem(primaryStorageKey));
  addUniqueKey(localStorage.getItem('fc_apikey'));
  addUniqueKey(localStorage.getItem('fc_gemini_api_key'));
  addUniqueKey(localStorage.getItem('fc_paid_apikey'));

  return pool;
};

// Helper nội bộ: Dựng danh sách Model Cascade ưu tiên model chính lên đầu
const resolveCascadeModels = () => {
  const primaryModelId =
    localStorage.getItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model') || 'gemini-3.5-flash-lite';

  const modelsPool = Array.isArray(AI_MODELS) && AI_MODELS.length > 0
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
    if (!data || data.quotaDay !== currentQuotaDay) {
      data = { quotaDay: currentQuotaDay, usage: {} };
      localStorage.setItem(key, JSON.stringify(data));
    }
    return data;
  },

  _save: function (data) {
    const key = STORAGE_KEYS?.QUOTA_TRACKER || 'fc_quota_tracker';
    localStorage.setItem(key, JSON.stringify(data));
  },

  getUsage: function (key, modelId) {
    const data = this._load();
    if (!key && !modelId) return data.usage || {};
    if (!key || !modelId) return 0;
    const cleanK = String(key).replace(/["'\s]/g, '');
    return data.usage[cleanK]?.[modelId] || data.usage[key]?.[modelId] || 0;
  },

  incrementUsage: function (key, modelId) {
    if (!key || !modelId) return;
    const cleanK = String(key).replace(/["'\s]/g, '');
    const data = this._load();
    if (!data.usage[cleanK]) data.usage[cleanK] = {};
    data.usage[cleanK][modelId] = (data.usage[cleanK][modelId] || 0) + 1;
    this._save(data);
  },

  // Alias tương thích NewMapping.md
  increment: function (key, modelId) {
    return this.incrementUsage(key, modelId);
  },

  // [VER 1.1] Đánh dấu cạn hạn ngạch ngày cho cặp (Key, Model) khi Google báo 429 Quota
  markExhausted: function (key, modelId, limitOverride = null) {
    if (!key || !modelId) return;
    const cleanK = String(key).replace(/["'\s]/g, '');
    const modelObj = Array.isArray(AI_MODELS)
      ? AI_MODELS.find((m) => m.id === modelId)
      : null;
    const limit = limitOverride !== null ? limitOverride : modelObj?.rpdLimit || 500;
    const data = this._load();
    if (!data.usage[cleanK]) data.usage[cleanK] = {};
    const current = data.usage[cleanK][modelId] || 0;
    if (current < limit) {
      data.usage[cleanK][modelId] = limit;
      this._save(data);
    }
  },

  isExhausted: function (key, modelId, limitOverride = null) {
    if (!key || !modelId) return false;
    const used = this.getUsage(key, modelId);
    if (limitOverride !== null) return used >= limitOverride;
    const modelObj = Array.isArray(AI_MODELS)
      ? AI_MODELS.find((m) => m.id === modelId)
      : null;
    const limit = modelObj?.rpdLimit || 500;
    return used >= limit;
  },

  getMatrix: function (keys = [], models = AI_MODELS || []) {
    const matrix = {};
    const keyList = Array.isArray(keys) ? keys : [];
    const modelList = Array.isArray(models) ? models : [];
    keyList.forEach((k) => {
      const cleanK = String(k).replace(/["'\s]/g, '');
      matrix[cleanK] = {};
      modelList.forEach((m) => {
        const mId = typeof m === 'string' ? m : m.id;
        matrix[cleanK][mId] = this.getUsage(cleanK, mId);
      });
    });
    return matrix;
  }
};

// ============================================================================
// 0.D ĐỘNG CƠ LÕI GỌI MẠNG GEMINI (HỢP NHẤT DRY: KEY POOL × MODEL CASCADE)
// ============================================================================
const executeGeminiRequest = async (payload, apiKeyOverride = null, contextTag = 'API') => {
  return withApiLock(async () => {
    if (isGlobalPaused()) {
      throw new Error('[GLOBAL_PAUSE] Mạng đang tạm nghỉ 15s để chống bộ lọc IP Spam.');
    }

    const keyPool = resolveEffectiveKeyPool(apiKeyOverride);
    if (keyPool.length === 0) {
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
    const pointer = parseInt(localStorage.getItem('fc_key_pointer') || '0', 10);
    const poolSize = keyPool.length;
    const isAuto = localStorage.getItem('fc_is_auto_cascade') !== 'false';
    const isPremium = localStorage.getItem('fc_is_premium_key') === 'true';
    const cascadeModels = resolveCascadeModels();

    let finalData = null;
    let usedModelId = null;
    let usedApiKey = null;
    let lastError = null;
    let shortestWaitMs = Infinity;
    let hitGlobalPause = false;

    cleanExpiredCooldowns();
    const activeCooldowns = getPersistentCooldowns();

    for (let i = 0; i < poolSize; i++) {
      const checkIndex = (pointer + i) % poolSize;
      const rawK = keyPool[checkIndex];
      if (!rawK || rawK.length < 10) continue;

      const cleanK = rawK.replace(/["'\s]/g, '');
      const cdData = activeCooldowns[cleanK];
      const cooldownUntil = cdData ? cdData.expireAt : 0;
      const waitMs = cooldownUntil - Date.now();

      if (waitMs > 0) {
        if (waitMs < shortestWaitMs) shortestWaitMs = waitMs;
        continue;
      }

      const modelsToTry = isAuto ? cascadeModels : [cascadeModels[0]];

      for (const model of modelsToTry) {
        const currentRpd = RPDTracker.getUsage(cleanK, model.id);
        if (!isPremium && currentRpd >= model.rpdLimit) {
          lastError = new Error(`[Cạn Quota] Mô hình ${model.id} của Key ...${cleanK.slice(-4)}`);
          continue;
        }

        const controller = new AbortController();
        const onAbort = () => controller.abort();
        let isTimedOut = false;
        let timeoutId = null;

        if (abortSignal) abortSignal.addEventListener('abort', onAbort);

        try {
          timeoutId = setTimeout(() => {
            isTimedOut = true;
            controller.abort();
          }, dynamicTimeoutMs);

          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${cleanK}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal
            }
          );

          // Đọc thân phản hồi JSON TRƯỚC khi phân nhánh để không làm chết logic chống Spam 429
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          let data = null;
          try {
            data = await res.json();
          } catch (_) {
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
                if (!isPremium) {
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
              msgLower.includes('api key') ||
              msgLower.includes('unregistered') ||
              msgLower.includes('permission')
            ) {
              setKeyCooldown(cleanK, 24 * 60 * 60 * 1000);
              lastError = new Error(`403: Key ...${cleanK.slice(-4)} bị vô hiệu hóa.`);
              break;
            }

            // 5. Nhánh 400 (Lỗi cú pháp Payload)
            if (res.status === 400 || errCode === 400) {
              lastError = new Error(`400: Lỗi cú pháp - ${errMsg || 'Bad Request'}`);
              break;
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
          localStorage.setItem('fc_key_pointer', String((checkIndex + 1) % poolSize));
          break;
        } catch (e) {
          if (isTimedOut) {
            throw new Error(
              `Hết thời gian chờ ${Math.round(dynamicTimeoutMs / 1000)}s (Bị treo ở tầng Network).`
            );
          }
          if (
            (abortSignal && abortSignal.aborted) ||
            e.name === 'AbortError' ||
            (e.message && e.message.includes('Người dùng đã hủy'))
          ) {
            throw e;
          }
          lastError = e;
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        }
      }

      if (finalData || hitGlobalPause) break;
    }

    if (!finalData) {
      if (shortestWaitMs !== Infinity && shortestWaitMs > 0 && !hitGlobalPause) {
        throw new Error(
          `[API_COOLDOWN] ${contextTag}: Toàn bộ kho Key đang đóng băng. Thử lại sau ${Math.ceil(shortestWaitMs / 60000)} phút.`
        );
      }
      if (lastError) throw lastError;
      throw new Error('Không có Key & Mô hình AI nào khả dụng.');
    }

    RPDTracker.incrementUsage(usedApiKey, usedModelId);

    if (keyPool.length > 1) {
      setKeyCooldown(usedApiKey, 5000);
    }
    const activeStorageKey = STORAGE_KEYS?.API_KEY || 'fc_apikey';
    if (usedApiKey !== localStorage.getItem(activeStorageKey)) {
      localStorage.setItem(activeStorageKey, usedApiKey);
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
export const fetchWithFallback = async (url) => {
  if (!url) throw new Error('Đường dẫn URL trống');

  // [VER 1.1] Trích xuất chính xác gid trước khi thay thế /edit -> /export?format=csv
  let finalUrl = url;
  if (url.includes('docs.google.com') && url.includes('/edit')) {
    const gidMatch = url.match(/[?#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    finalUrl = url.replace(/\/edit.*$/, `/export?format=csv&gid=${gid}`);
  }

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
      if (res.ok) return res;
    } catch (e) {
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
export const pingGeminiKey = async (apiKey) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const k = String(apiKey || '').replace(/["'\s]/g, '');
    const body = { contents: [{ parts: [{ text: "Hãy trả lời 'OK'" }] }] };
    const primaryModelId =
      localStorage.getItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model') || 'gemini-3.5-flash-lite';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${primaryModelId}:generateContent?key=${k}`,
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
    }
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: e.name === 'AbortError' ? 408 : 0, ok: false, error: e.message };
  } finally {
    clearTimeout(timeoutId);
  }
};

// ============================================================================
// 3. GỌI API GEMINI VẠN NĂNG (HỖ TRỢ ĐẦY ĐỦ OPTIONS THEO NEWMAPPING.MD)
// ============================================================================
export const callGeminiApi = async (
  prompt,
  schema = null,
  apiKeyOverride = null,
  options = null
) => {
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
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
  return { text, tokenMetadata };
};

// ============================================================================
// 4. LÀM GIÀU THẺ TỰ ĐỘNG BẰNG AI (DYNAMIC SCHEMA & MA TRẬN THỊ GIÁC TÁCH NHÁNH)
// ============================================================================
export const fillCardWithAi = async (
  term,
  lang,
  apiKey,
  targetFields = null,
  dataMode = 'vocab',
  levelContext = [],
  existingData = null
) => {
  const cleanTermForAi = term ? term.replace(/\u0332/g, '') : '';
  const isSentence = dataMode === 'sentence';
  const typeLabel = isSentence ? 'CÂU VĂN' : 'TỪ VỰNG';

  const activePedagogyEngine =
    IoeDataEngine || (typeof window !== 'undefined' ? window.IoeDataEngine : null);
  const levelDictionary = activePedagogyEngine?.LEVEL_DICTIONARY || {};
  let translatedLevels = [];
  let isAdvancedLevel = false;

  if (levelContext && Array.isArray(levelContext) && levelContext.length > 0) {
    translatedLevels = levelContext.map((lvl) => levelDictionary[lvl] || lvl);
    const advKeywords = ['level_5', 'level_6', 'hsk5', 'hsk6', 'hsk 5', 'hsk 6', 'c1', 'c2'];
    isAdvancedLevel = levelContext.some((lvl) =>
      advKeywords.some((kw) => typeof lvl === 'string' && lvl.toLowerCase().includes(kw))
    );
  } else {
    translatedLevels = [
      lang === 'zh'
        ? 'Tiếng Trung phổ thông (Mọi cấp độ)'
        : 'Tiếng Anh phổ thông (Mọi cấp độ)'
    ];
  }

  const posThresholdStr = isAdvancedLevel ? '10%' : '20%';

  // Lấy luật Sư phạm động từ Ma trận (Pedagogy Routing Matrix)
  const pedagogyRules = activePedagogyEngine?.getPedagogyMatrixRule
    ? activePedagogyEngine.getPedagogyMatrixRule(levelContext, lang)
    : {
        example: 'Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng.',
        definition:
          'Bản dịch Tiếng Việt trực tiếp, chuẩn xác. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa.'
      };

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

  if (lang !== 'zh') {
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
  const orderedProperties = {};
  strictOrder.forEach((f) => {
    if (requiredFields.includes(f) && propertiesToFetch[f]) {
      orderedProperties[f] = propertiesToFetch[f];
    }
  });
  propertiesToFetch = orderedProperties;
  requiredFields.sort((a, b) => strictOrder.indexOf(a) - strictOrder.indexOf(b));

  const promptKey = isSentence ? 'enrich_sentence' : 'enrich_word';
  let basePrompt = DEFAULT_PROMPTS ? DEFAULT_PROMPTS[promptKey] : 'Phân tích {term} ({lang})';
  basePrompt = basePrompt.replace(/{term}/g, cleanTermForAi).replace(/{lang}/g, lang);

  let dynamicInstruction = '';
  if (requiredFields.includes('pronunciation') || requiredFields.includes('sinoViet')) {
    dynamicInstruction =
      lang === 'zh'
        ? ' Đối với pronunciation: BẮT BUỘC xuất Pinyin. ' +
          (requiredFields.includes('sinoViet')
            ? 'Bắt buộc xuất thêm trường sinoViet (Âm Hán Việt thuần túy).'
            : '')
        : ' Đối với pronunciation: BẮT BUỘC xuất chuẩn quốc tế IPA. Tuyệt đối KHÔNG xuất trường sinoViet.';
  }

  let userQuery = '';
  if (isTrimming) {
    userQuery = `Nhiệm vụ: Bổ sung thông tin cho ${typeLabel} này: "${cleanTermForAi}" (Ngôn ngữ: ${lang}).\n`;
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
    userQuery = `Hãy phân tích toàn diện ${typeLabel} này: "${cleanTermForAi}" (Ngôn ngữ: ${lang}). Bắt buộc xuất đầy đủ JSON Schema đã định nghĩa.${dynamicInstruction}\n`;
  }

  // [VER 1.0+] Bơm ngữ cảnh hiện có của thẻ (nghĩa, từ loại, chủ đề) để chống lệch nghĩa từ đa nghĩa
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
      userQuery += `[NGỮ CẢNH THẺ HIỆN CÓ - BẮT BUỘC BÁM SÁT ĐỂ TRÁNH LỆCH NGHĨA]: ${ctxParts.join(' | ')}.\n`;
    }
  }

  // Luôn bơm Vắc-xin Ngữ pháp cho chế độ Từ vựng khi cần phân loại từ loại
  if (
    !isSentence &&
    (requiredFields.includes('partOfSpeech') || requiredFields.includes('posAnalysis'))
  ) {
    userQuery += `\n[CÁC LỖI NGỮ PHÁP NGHIÊM CẤM]:\n`;
    const grammarRule = activePedagogyEngine?.getMicroTierGrammarRule
      ? activePedagogyEngine.getMicroTierGrammarRule(lang)
      : `- Chỉ phân loại theo đúng ngữ pháp ngôn ngữ gốc, tuyệt đối không vay mượn ngữ pháp bản dịch Tiếng Việt.\n`;
    userQuery += grammarRule + '\n';
  }

  if (isTrimming) {
    if (!isSentence && requiredFields.includes('posAnalysis')) {
      userQuery += `4. ĐỊNH DẠNG & THỨ TỰ BẮT BUỘC: TRỌNG TÂM: Phải xuất trường 'posAnalysis' ĐẦU TIÊN trong chuỗi JSON để làm nháp. Chỉ xuất CHÍNH XÁC các trường: ${requiredFields.join(', ')}.\n`;
    } else {
      userQuery += `4. ĐỊNH DẠNG BẮT BUỘC: Chỉ xuất CHÍNH XÁC các trường: ${requiredFields.join(', ')}.\n`;
    }
    userQuery += `${dynamicInstruction}`;
  }

  let validTagsStr = '';
  if (IoeEnumRegistry && IoeEnumRegistry.LEVEL_TO_TRAPS) {
    const tagsArr = [];
    const prefix = lang === 'zh' ? 'zh' : 'en';
    for (const [lvl, traps] of Object.entries(IoeEnumRegistry.LEVEL_TO_TRAPS)) {
      if (lvl.startsWith(prefix)) {
        tagsArr.push(...traps);
      }
    }
    const uniqueTags = [...new Set(tagsArr)];
    if (uniqueTags.length > 0) {
      validTagsStr = `1. Nếu câu mang cấu trúc giao tiếp bình thường, không chứa bẫy ngữ pháp đặc biệt, BẮT BUỘC trả về mảng rỗng []. 2. Nếu có cấu trúc đặc trưng, chỉ chọn 1 đến 2 mã cốt lõi nhất từ danh sách: [${uniqueTags.join(', ')}].`;
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
    } else if (lang === 'zh') {
      // [VER 1.1] Nhánh Ma trận Thị giác chuyên biệt cho Tiếng Trung (Tiết kiệm Token)
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
      // [VER 1.1] Nhánh Ma trận Thị giác chuyên biệt cho Tiếng Anh (Tiết kiệm Token)
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

  const parsed = parseAiJson(text);
  if (lang === 'zh' && parsed.sinoViet) {
    parsed.sinoViet = parsed.sinoViet
      .replace(/\(.*?\)/g, '')
      .replace(/（.*?）/g, '')
      .trim();
  }

  const finalResult = { ...parsed, term: term };
  for (const key in finalResult) {
    if (finalResult[key] === '' || finalResult[key] === null) {
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
      lang === 'zh' || isSentence ? '' : cleanTermForAi,
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

export const fetchAiDistractors = async (baseText, targetText) => {
  const cleanTarget = targetText ? targetText.replace(/\u0332/g, '') : '';
  const schema = {
    type: 'object',
    properties: { distractors: { type: 'array', items: { type: 'string' } } },
    required: ['distractors']
  };
  const isSentence = detectSentence(cleanTarget);
  const promptKey = isSentence ? 'quiz_sentence' : 'quiz_word';
  const prompt = getPrompt(promptKey, {
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

export const fetchAiDistractorsBatch = async (items, lang) => {
  const schema = {
    type: 'object',
    properties: { distractors: { type: 'array', items: { type: 'string' } } },
    required: ['distractors']
  };
  const fullLang = { zh: 'Tiếng Trung', en: 'Tiếng Anh', vi: 'Tiếng Việt' }[lang] || lang;
  const itemsText = items
    .map((item, index) => {
      const cleanTerm = item.term ? item.term.replace(/\u0332/g, '') : '';
      return `${index + 1}. Mục tiêu: "${cleanTerm}" (Nghĩa đúng: "${item.definition}")`;
    })
    .join('\n');

  const isSentenceMode =
    items.length > 0 && detectSentence(items[0].term ? items[0].term.replace(/\u0332/g, '') : '');
  const promptKey = isSentenceMode ? 'match_sentence' : 'match_word';
  const prompt = getPrompt(promptKey, { itemsText, fullLang, count: items.length });

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
export const explainSentenceGrammar = async (sentence, lang, apiKey) => {
  const cleanSentence = sentence ? sentence.replace(/\u0332/g, '') : '';
  const prompt = getPrompt('grammar', { sentence: cleanSentence, lang });
  const { text, tokenMetadata } = await callGeminiApi(prompt, null, apiKey);
  return { text: cleanText(text), _tokenUsage: tokenMetadata };
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