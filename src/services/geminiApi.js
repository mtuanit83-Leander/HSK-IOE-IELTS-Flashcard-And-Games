/**
 * @file src/services/geminiApi.js
 * @description Tác nhân AI & Mạng (Network & API Agent). Quản lý gọi API Gemini, Proxy Fetch, Atomic Lock và Rate Limiting.
 * @origin Tầng 2 - Block 2.1c (Network & API Agent)
 */

import { STORAGE_KEYS, AI_MODELS, IoeEnumRegistry } from '@/config/constants';
import { Utils } from '@/utils/helpers';
// Import Động cơ Sư phạm (Sẽ được tạo ở Giai đoạn 3)
import { IoeDataEngine } from '@/engines/pedagogyEngine';

// ============================================================================
// 0.A CƠ CHẾ KHÓA ĐA LUỒNG (GLOBAL MUTEX LOCK) - CHỐNG RACE CONDITION
// ============================================================================
let __apiMutex = Promise.resolve();

export const withApiLock = async (taskFn) => {
  const previousLock = __apiMutex;
  let releaseLock;
  __apiMutex = new Promise(resolve => { releaseLock = resolve; });
  await previousLock.catch(() => {});
  try {
    return await taskFn();
  } finally {
    releaseLock();
  }
};

// ============================================================================
// 0.B HỆ THỐNG QUẢN LÝ ÁN PHẠT API & CẦU DAO TOÀN CỤC
// ============================================================================
export const getPersistentCooldowns = () => {
  return Utils.safeJsonParse('fc_api_cooldowns', {});
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
  for (let k in cooldowns) {
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
  localStorage.setItem('fc_global_api_pause', (Date.now() + durationMs).toString());
};

export const getCooldown429Ms = () => {
  const config = Utils.safeJsonParse('fc_ai_config', {});
  return (config.cooldown429 || 120) * 60 * 1000;
};

// ============================================================================
// 0.C BỘ ĐẾM RPD (REQUESTS PER DAY) THÔNG MINH - MA TRẬN 2 CHIỀU
// ============================================================================
export const RPDTracker = {
  _getQuotaDay: function() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    let qDate = new Date(vnTime);
    if (vnTime.getHours() < 15) {
      qDate.setDate(qDate.getDate() - 1);
    }
    const yyyy = qDate.getFullYear();
    const mm = String(qDate.getMonth() + 1).padStart(2, '0');
    const dd = String(qDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },
  _load: function() {
    const key = STORAGE_KEYS?.QUOTA_TRACKER || 'fc_quota_tracker';
    let data = Utils.safeJsonParse(key, null);
    const currentQuotaDay = this._getQuotaDay();
    if (!data || data.quotaDay !== currentQuotaDay) {
      data = { quotaDay: currentQuotaDay, usage: {} };
      localStorage.setItem(key, JSON.stringify(data));
    }
    return data;
  },
  _save: function(data) {
    const key = STORAGE_KEYS?.QUOTA_TRACKER || 'fc_quota_tracker';
    localStorage.setItem(key, JSON.stringify(data));
  },
  getUsage: function(key, modelId) {
    if (!key || !modelId) return 0;
    const data = this._load();
    return data.usage[key]?.[modelId] || 0;
  },
  incrementUsage: function(key, modelId) {
    if (!key || !modelId) return;
    const data = this._load();
    if (!data.usage[key]) data.usage[key] = {};
    data.usage[key][modelId] = (data.usage[key][modelId] || 0) + 1;
    this._save(data);
  }
};

// ============================================================================
// 1. TẢI DỮ LIỆU TỪ GOOGLE SHEETS BẰNG MẢNG PROXY THÔNG MINH
// ============================================================================
export const fetchWithFallback = async (url) => {
  if (!url) throw new Error("Đường dẫn URL trống");
  let finalUrl = url.includes('docs.google.com') 
    ? url.replace(/\/edit.*$/, '/export?format=csv').replace(/gid=0/, `gid=${(url.match(/gid=(\d+)/) || ['', '0'])[1]}`) 
    : url;
    
  const cacheBuster = url.includes('?') ? `&cb=${Date.now()}` : `?cb=${Date.now()}`;
  const strategies = [
    { name: "Direct", url: finalUrl },
    { name: "AllOrigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(finalUrl + cacheBuster)}` },
    { name: "CorsProxyIO", url: `https://corsproxy.io/?${encodeURIComponent(finalUrl + cacheBuster)}` },
    { name: "ThingProxy", url: `https://thingproxy.freeboard.io/fetch/${finalUrl}` },
    { name: "CodeTabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(finalUrl)}` },
    { name: "CorsAnywhere", url: `https://cors-anywhere.herokuapp.com/${finalUrl}` },
    { name: "CorsSH", url: `https://proxy.cors.sh/${finalUrl}` }
  ];
  
  let err;
  for (const s of strategies) {
    try {
      const res = await fetch(s.url);
      if (res.ok) return res;
    } catch (e) {
      err = e;
      console.warn(`[Proxy Fallback] ${s.name} thất bại, thử node tiếp theo...`);
    }
  }
  throw new Error("Lỗi tải dữ liệu mạng (Tất cả Proxy đều bị chặn)");
};

// ============================================================================
// 2. THĂM DÒ XUNG KÍCH (HEURISTIC PROBING - RADAR)
// ============================================================================
export const pingGeminiKey = async (apiKey) => {
  try {
    const k = apiKey.replace(/["'\s]/g, "");
    const body = { contents: [{ parts: [{ text: "Hãy trả lời 'OK'" }] }] };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const primaryModelId = localStorage.getItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model') || 'gemini-3.5-flash-lite';
    
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${primaryModelId}:generateContent?key=${k}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (res.status === 429) {
      setKeyCooldown(k, getCooldown429Ms());
      triggerGlobalPause(15000);
    } else if (res.status === 403) {
      setKeyCooldown(k, 24 * 60 * 60 * 1000);
    }
    return { status: res.status, ok: res.ok };
  } catch (e) {
    return { status: e.name === 'AbortError' ? 408 : 0, ok: false, error: e.message };
  }
};

// ============================================================================
// 3. GỌI API GEMINI VẠN NĂNG (VÒNG LẶP KÉP: KEY TRƯỚC, MODEL SAU)
// ============================================================================
export const callGeminiApi = async (prompt, schema = null, apiKeyOverride = null) => {
  return withApiLock(async () => {
    if (isGlobalPaused()) {
      throw new Error("[GLOBAL_PAUSE] Mạng đang tạm nghỉ 15s để chống bộ lọc IP Spam.");
    }
    
    let keyPool = Utils.safeJsonParse('fc_apikey_pool', []);
    if (apiKeyOverride && !keyPool.includes(apiKeyOverride)) {
      keyPool.push(apiKeyOverride);
    }
    if (keyPool.length === 0) throw new Error("Chưa nhập API Key (Vui lòng cấu hình trong Settings)");
    
    let dynamicTimeoutMs = 20000;
    try {
      const aiCfg = Utils.safeJsonParse('fc_ai_config', {});
      if (aiCfg && aiCfg.loadingTime) {
        dynamicTimeoutMs = parseInt(aiCfg.loadingTime, 10) * 1000 + 5000;
      }
    } catch(e) {}
    
    // Biến toàn cục để Hủy Request khi người dùng ấn nút Thoát / Cancel
    const abortSignal = window.__currentGameAbortController ? window.__currentGameAbortController.signal : null;
    if (abortSignal && abortSignal.aborted) throw new DOMException("Người dùng đã hủy thao tác", "AbortError");
    
    let pointer = parseInt(localStorage.getItem('fc_key_pointer') || '0', 10);
    const poolSize = keyPool.length;
    const isAuto = localStorage.getItem('fc_is_auto_cascade') !== 'false';
    const isPremium = localStorage.getItem('fc_is_premium_key') === 'true';
    const primaryModelId = localStorage.getItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model') || 'gemini-3.5-flash-lite';
    
    const modelsPool = AI_MODELS ? [...AI_MODELS] : [
      { id: 'gemini-3.5-flash-lite', rpdLimit: 500 },
      { id: 'gemini-3.1-flash-lite', rpdLimit: 500 },
      { id: 'gemini-2.5-flash-lite', rpdLimit: 20 },
      { id: 'gemini-3.0-flash', rpdLimit: 20 },
      { id: 'gemini-3.5-flash', rpdLimit: 20 },
      { id: 'gemini-3.6-flash', rpdLimit: 20 },
      { id: 'gemini-3.7-flash', rpdLimit: 20 },
      { id: 'gemini-2.5-flash', rpdLimit: 20 }
    ];
    
    let cascadeModels = [];
    const primaryObj = modelsPool.find(m => m.id === primaryModelId);
    if (primaryObj) cascadeModels.push(primaryObj);
    modelsPool.forEach(m => { if (m.id !== primaryModelId) cascadeModels.push(m); });
    
    const body = { contents: [{ parts: [{ text: prompt }] }] };
    if (schema) {
      body.generationConfig = { responseMimeType: "application/json", responseSchema: schema };
    }
    
    let finalData = null;
    let usedModelId = null;
    let usedApiKey = null;
    let lastError = null;
    let shortestWaitMs = Infinity;
    
    cleanExpiredCooldowns();
    const activeCooldowns = getPersistentCooldowns();
    
    for (let i = 0; i < poolSize; i++) {
      const checkIndex = (pointer + i) % poolSize;
      const rawK = keyPool[checkIndex];
      if (!rawK || rawK.length < 10) continue;
      const cleanK = rawK.replace(/["'\s]/g, "");
      
      const cdData = activeCooldowns[cleanK];
      const cooldownUntil = cdData ? cdData.expireAt : 0;
      const waitMs = cooldownUntil - Date.now();
      if (waitMs > 0) {
        if (waitMs < shortestWaitMs) shortestWaitMs = waitMs;
        continue;
      }
      
      let modelsToTry = isAuto ? cascadeModels : [cascadeModels[0]];
      
      for (const model of modelsToTry) {
        const currentRpd = RPDTracker.getUsage(cleanK, model.id);
        if (!isPremium && currentRpd >= model.rpdLimit) {
          lastError = new Error(`[Cạn Quota] Mô hình ${model.id} của Key ...${cleanK.slice(-4)}`);
          continue;
        }
        
        try {
          const controller = new AbortController();
          const onAbort = () => controller.abort();
          if (abortSignal) abortSignal.addEventListener('abort', onAbort);
          
          const fetchPromise = fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${cleanK}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
          }).finally(() => {
            if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              controller.abort();
              reject(new Error(`Hết thời gian chờ API (${Math.round(dynamicTimeoutMs/1000)}s)`));
            }, dynamicTimeoutMs);
          });
          
          const res = await Promise.race([fetchPromise, timeoutPromise]);
          
          if (res.status === 429) { lastError = new Error(`429: Too Many Requests (${model.id})`); continue; }
          if (res.status === 503) { lastError = new Error(`503: Service Unavailable (${model.id})`); continue; }
          if (res.status === 500) throw new Error("500: Internal Server Error");
          
          if (!res.ok && res.status !== 200 && res.status !== 400 && res.status !== 403) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
              throw new Error(`HTTP ${res.status}: Lỗi mạng không xác định (Non-JSON)`);
            }
          }
          
          const d = await res.json();
          if (d.error) {
            const msgLower = (d.error.message || "").toLowerCase();
            if (d.error.code === 429 || d.error.status === 'RESOURCE_EXHAUSTED' || msgLower.includes('quota')) {
              if (msgLower.includes('per minute') || msgLower.includes('rate limit') || msgLower.includes('load balancer')) {
                setKeyCooldown(cleanK, 5 * 60 * 1000);
                triggerGlobalPause(15000);
                lastError = new Error(`[Spam 429] Key ...${cleanK.slice(-4)} gọi quá nhanh.`);
                break;
              } else {
                lastError = new Error(`429: Cạn Quota mô hình ${model.id}`);
                continue;
              }
            }
            if (d.error.code === 503 || d.error.code === 500 || msgLower.includes('overloaded')) {
              lastError = new Error(`503: Nghẽn mô hình ${model.id}`);
              continue;
            }
            if (d.error.code === 403 || msgLower.includes('api key') || msgLower.includes('unregistered')) {
              setKeyCooldown(cleanK, 24 * 60 * 60 * 1000);
              lastError = new Error(`403: Key ...${cleanK.slice(-4)} bị vô hiệu hóa.`);
              break;
            }
            if (d.error.code === 400) {
              lastError = new Error(`400: Lỗi cú pháp - ${d.error.message}`);
              break;
            }
            throw new Error(d.error.message);
          }
          
          if (!d.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("API trả về rỗng");
          
          finalData = d;
          usedModelId = model.id;
          usedApiKey = cleanK;
          localStorage.setItem('fc_key_pointer', (checkIndex + 1) % poolSize);
          break;
        } catch (e) {
          if (e.name === 'AbortError' || (e.message && e.message.includes('Hủy')) || (e.message && e.message.includes('thời gian chờ'))) {
            throw e;
          }
          lastError = e;
        }
      }
      if (finalData) break;
    }
    
    if (!finalData) {
      if (shortestWaitMs !== Infinity && shortestWaitMs > 0) {
        throw new Error(`[API_COOLDOWN] Toàn bộ kho Key đang đóng băng. Chờ ${Math.ceil(shortestWaitMs/60000)} phút.`);
      }
      if (lastError) throw lastError;
      throw new Error("Không có Key & Mô hình AI nào khả dụng.");
    }
    
    RPDTracker.incrementUsage(usedApiKey, usedModelId);
    const resultText = finalData.candidates[0].content.parts[0].text;
    const tokenMetadata = finalData.usageMetadata || null;
    
    if (keyPool.length > 1) {
      setKeyCooldown(usedApiKey, 5000);
    }
    
    if (usedApiKey !== localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')) {
      localStorage.setItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key', usedApiKey);
    }
    
    await new Promise(r => setTimeout(r, 3000));
    return { text: resultText, tokenMetadata };
  });
};

// ============================================================================
// 4. LÀM GIÀU THẺ TỰ ĐỘNG BẰNG AI (DYNAMIC SCHEMA & POOLING)
// ============================================================================
export const fillCardWithAi = async (term, lang, apiKey, targetFields = null, dataMode = 'vocab', levelContext = [], existingData = null) => {
  return withApiLock(async () => {
    if (isGlobalPaused()) {
      throw new Error("[GLOBAL_PAUSE] Mạng đang tạm nghỉ 15s để chống bộ lọc IP Spam.");
    }
    
    let keyPool = Utils.safeJsonParse('fc_apikey_pool', []);
    if (apiKey && !keyPool.includes(apiKey)) {
      keyPool.push(apiKey);
    }
    if (keyPool.length === 0) throw new Error("Chưa nhập API Key (Thiếu Key Pool)");
    
    const cleanTermForAi = term ? term.replace(/\u0332/g, '') : '';
    const isSentence = dataMode === 'sentence';
    const typeLabel = isSentence ? "CÂU VĂN" : "TỪ VỰNG";
    
    const levelDictionary = IoeDataEngine?.LEVEL_DICTIONARY || {};
    let translatedLevels = [];
    let isAdvancedLevel = false;
    
    if (levelContext && Array.isArray(levelContext) && levelContext.length > 0) {
      translatedLevels = levelContext.map(lvl => levelDictionary[lvl] || lvl);
      const advKeywords = ['level_5', 'level_6', 'hsk5', 'hsk6', 'hsk 5', 'hsk 6', 'c1', 'c2'];
      isAdvancedLevel = levelContext.some(lvl => advKeywords.some(kw => (typeof lvl === 'string') && lvl.toLowerCase().includes(kw)));
    } else {
      translatedLevels = [lang === 'zh' ? 'Tiếng Trung phổ thông (Mọi cấp độ)' : 'Tiếng Anh phổ thông (Mọi cấp độ)'];
    }
    const posThresholdStr = isAdvancedLevel ? "10%" : "20%";
    
    // Lấy luật Sư phạm động từ Ma trận (Pedagogy Routing Matrix - Truyền Toàn bộ Mảng)
    const pedagogyRules = IoeDataEngine?.getPedagogyMatrixRule 
      ? IoeDataEngine.getPedagogyMatrixRule(levelContext, lang) 
      : {
          example: "Tự nhiên, chuẩn ngữ pháp, có ngữ cảnh thực tế rõ ràng.",
          definition: "Bản dịch Tiếng Việt trực tiếp, chuẩn xác. TUYỆT ĐỐI KHÔNG giải nghĩa kiểu từ điển bách khoa."
        };
        
    let propertiesToFetch = {
      term: { type: "STRING" },
      pronunciation: { type: "STRING" },
      definition: { type: "STRING" },
      posAnalysis: { type: "STRING" },
      partOfSpeech: { type: "STRING" },
      topic: { type: "STRING" },
      analysis: { type: "STRING" },
      sinoViet: { type: "STRING" },
      example: { type: "STRING", description: "Multiline string containing examples. MUST generate exactly ONE example sentence for EACH part of speech listed in 'partOfSpeech'. Format each line exactly as: - Foreign Sentence | Vietnamese Translation" },
      image_keyword: { type: "STRING" },
      grammar_type: { type: "ARRAY", items: { type: "STRING" } }
    };
    
    let requiredFields = ["term", "pronunciation", "definition", "posAnalysis", "partOfSpeech", "topic", "analysis", "sinoViet", "example", "image_keyword", "grammar_type"];
    
    if (lang !== 'zh') {
      delete propertiesToFetch.sinoViet;
      requiredFields = requiredFields.filter(f => f !== 'sinoViet');
    }
    if (!isSentence) {
      delete propertiesToFetch.grammar_type;
      requiredFields = requiredFields.filter(f => f !== 'grammar_type');
    }
    
    let isTrimming = false;
    if (targetFields && Array.isArray(targetFields) && targetFields.length > 0) {
      isTrimming = true;
      const mappedTargetFields = targetFields.map(f => f === 'image' ? 'image_keyword' : f);
      requiredFields = requiredFields.filter(f => mappedTargetFields.includes(f));
      
      if (requiredFields.includes('partOfSpeech') && !requiredFields.includes('posAnalysis')) {
        requiredFields.push('posAnalysis');
      }
      if (requiredFields.length === 0) {
        requiredFields = ['term'];
      }
      
      const strictOrder = ["posAnalysis", "partOfSpeech", "example", "term", "pronunciation", "definition", "topic", "analysis", "sinoViet", "image_keyword", "grammar_type"];
      const trimmedProperties = {};
      strictOrder.forEach(f => {
        if (requiredFields.includes(f) && propertiesToFetch[f]) {
          trimmedProperties[f] = propertiesToFetch[f];
        }
      });
      propertiesToFetch = trimmedProperties;
      requiredFields.sort((a, b) => strictOrder.indexOf(a) - strictOrder.indexOf(b));
    }
    
    const promptKey = isSentence ? 'enrich_sentence' : 'enrich_word';
    let basePrompt = Utils.getPrompt(promptKey, { term: cleanTermForAi, lang: lang }) || "Phân tích từ";
    
    let dynamicInstruction = "";
    if (requiredFields.includes('pronunciation') || requiredFields.includes('sinoViet')) {
      dynamicInstruction = lang === 'zh'
        ? " Đối với pronunciation: BẮT BUỘC xuất Pinyin. " + (requiredFields.includes('sinoViet') ? "Bắt buộc xuất thêm trường sinoViet (Âm Hán Việt thuần túy)." : "")
        : " Đối với pronunciation: BẮT BUỘC xuất chuẩn quốc tế IPA. Tuyệt đối KHÔNG xuất trường sinoViet.";
    }
    
    let userQuery = "";
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
      
      if (requiredFields.includes('partOfSpeech') || requiredFields.includes('posAnalysis')) {
        userQuery += `\n[CÁC LỖI NGỮ PHÁP NGHIÊM CẤM]:\n`;
        const grammarRule = IoeDataEngine?.getMicroTierGrammarRule ? IoeDataEngine.getMicroTierGrammarRule(lang) : `- Chỉ phân loại theo đúng ngữ pháp ngôn ngữ gốc, tuyệt đối không vay mượn ngữ pháp bản dịch Tiếng Việt.\n`;
        userQuery += grammarRule + "\n";
      }
      userQuery += `4. ĐỊNH DẠNG & THỨ TỰ BẮT BUỘC: TRỌNG TÂM: Phải xuất trường 'posAnalysis' ĐẦU TIÊN trong chuỗi JSON để làm nháp. Chỉ xuất CHÍNH XÁC các trường: ${requiredFields.join(', ')}.\n`;
      userQuery += `${dynamicInstruction}`;
    } else {
      userQuery = `Hãy phân tích toàn diện ${typeLabel} này: "${cleanTermForAi}" (Ngôn ngữ: ${lang}). Bắt buộc xuất đầy đủ JSON Schema đã định nghĩa.${dynamicInstruction}`;
    }
    
    let validTagsStr = "";
    if (IoeEnumRegistry && IoeEnumRegistry.LEVEL_TO_TRAPS) {
      let tagsArr = [];
      const prefix = lang === 'zh' ? 'zh' : 'en';
      for (const [lvl, traps] of Object.entries(IoeEnumRegistry.LEVEL_TO_TRAPS)) {
        if (lvl.startsWith(prefix)) {
          tagsArr.push(...traps);
        }
      }
      if (tagsArr.length > 0) {
        validTagsStr = `Chỉ chọn tag từ danh sách: [${tagsArr.join(', ')}].`;
      } else {
        validTagsStr = `Chỉ xuất mã nhãn hợp lệ.`;
      }
    } else {
      validTagsStr = `Chỉ xuất mã nhãn hợp lệ.`;
    }
    
    let fieldRules = `\n[QUY TẮC CÁC TRƯỜNG]:\n`;
    if (requiredFields.includes('pronunciation') && isSentence) {
      fieldRules += `- 'pronunciation': Phiên âm (IPA/Pinyin) TOÀN BỘ CÂU VĂN.\n`;
    }
    if (requiredFields.includes('definition')) {
      fieldRules += `- 'definition': Bản dịch Tiếng Việt trực tiếp, chuẩn xác. ${pedagogyRules.definition}\n`;
    }
    if (requiredFields.includes('topic')) {
      const predefinedTopics = Array.isArray(IoeDataEngine?.TOPICS) && IoeDataEngine.TOPICS.length > 0
        ? IoeDataEngine.TOPICS
        : ['Self & Body', 'Social Connections', 'Living Spaces', 'The Natural World', 'Food & Health', 'Daily Life & Leisure', 'School & Career', 'Travel & Exploration', 'Other'];
      fieldRules += `- 'topic': Chọn CHÍNH XÁC 1 từ khóa từ: [${predefinedTopics.join(', ')}].\n`;
    }
    if (requiredFields.includes('posAnalysis')) {
      fieldRules += `- 'posAnalysis' (TỜ GIẤY NHÁP): Tư duy theo chuỗi. BẮT BUỘC viết phân tích chức năng ngữ pháp TRƯỚC, sau đó mới chốt lại tỉ lệ % ở cuối cùng. [LUẬT ÉP 0%]: Nếu vi phạm [CÁC LỖI NGỮ PHÁP NGHIÊM CẤM], lập tức ép % về 0.\n`;
    }
    if (requiredFields.includes('partOfSpeech')) {
      let posDifficulty = translatedLevels.length > 0 ? ` Chỉ liệt kê từ loại phổ biến, phù hợp cấp độ [${translatedLevels.join(', ')}].` : ` Chỉ liệt kê từ loại phổ biến trong giao tiếp.`;
      let posFormatRule = ` Dựa vào 'posAnalysis', CHỈ xuất các từ loại >${posThresholdStr}. Dịch tên từ loại sang Tiếng Việt.`;
      if (existingData && existingData.partOfSpeech) {
        fieldRules += `- 'partOfSpeech': User đã chỉ định là [${existingData.partOfSpeech}]. Giữ từ loại này, liệt kê thêm (nếu >${posThresholdStr}), cách nhau bằng '|'.${posDifficulty}${posFormatRule}\n`;
      } else {
        fieldRules += `- 'partOfSpeech': Xuất kết quả cuối cùng từ 'posAnalysis', cách nhau bằng '|'.${posDifficulty}${posFormatRule}\n`;
      }
    }
    if (requiredFields.includes('image_keyword')) {
      fieldRules += `- 'image_keyword': 1 từ khóa TIẾNG ANH mô tả trực quan nhất để tìm ảnh minh họa.\n`;
    }
    if (requiredFields.includes('example')) {
      fieldRules += `- 'example': Sáng tác các câu có chứa CHÍNH XÁC từ "${cleanTermForAi}". [TIÊU CHUẨN SƯ PHẠM]: ${pedagogyRules.example}\n`;
      fieldRules += `  -> [ĐỊNH DẠNG BẮT BUỘC]:\n`;
      fieldRules += `  1. Ánh xạ 1:1 với 'partOfSpeech' (Đúng số lượng, đúng thứ tự từ loại), mỗi câu 1 dòng.\n`;
      fieldRules += `  2. Bắt đầu mỗi câu bằng dấu "- " (gạch ngang và khoảng trắng), theo sau là: Câu ngoại ngữ | Bản dịch.\n`;
      fieldRules += `  3. KHÔNG chứa Pinyin/IPA, KHÔNG chèn tag từ loại.\n`;
    }
    if (requiredFields.includes('grammar_type')) {
      fieldRules += `- 'grammar_type': ${validTagsStr}\n`;
    }
    
    userQuery += fieldRules;
    
    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: "BẮT BUỘC TRẢ VỀ JSON HỢP LỆ THEO SCHEMA. Không bình luận." }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: propertiesToFetch,
          required: requiredFields
        }
      }
    };
    
    if (!isTrimming) {
      payload.systemInstruction = { parts: [{ text: basePrompt }] };
    }
    
    const abortSignal = window.__currentGameAbortController ? window.__currentGameAbortController.signal : null;
    if (abortSignal && abortSignal.aborted) throw new DOMException("Người dùng đã hủy thao tác", "AbortError");
    
    let pointer = parseInt(localStorage.getItem('fc_key_pointer') || '0', 10);
    const poolSize = keyPool.length;
    const isAuto = localStorage.getItem('fc_is_auto_cascade') !== 'false';
    const isPremium = localStorage.getItem('fc_is_premium_key') === 'true';
    const primaryModelId = localStorage.getItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model') || 'gemini-3.5-flash-lite';
    
    const modelsPool = AI_MODELS ? [...AI_MODELS] : [
      { id: 'gemini-3.5-flash-lite', rpdLimit: 500 },
      { id: 'gemini-3.1-flash-lite', rpdLimit: 500 },
      { id: 'gemini-2.5-flash-lite', rpdLimit: 20 },
      { id: 'gemini-3.0-flash', rpdLimit: 20 },
      { id: 'gemini-3.5-flash', rpdLimit: 20 },
      { id: 'gemini-3.6-flash', rpdLimit: 20 },
      { id: 'gemini-3.7-flash', rpdLimit: 20 },
      { id: 'gemini-2.5-flash', rpdLimit: 20 }
    ];
    
    let cascadeModels = [];
    const primaryObj = modelsPool.find(m => m.id === primaryModelId);
    if (primaryObj) cascadeModels.push(primaryObj);
    modelsPool.forEach(m => { if (m.id !== primaryModelId) cascadeModels.push(m); });
    
    let finalData = null;
    let usedModelId = null;
    let usedApiKey = null;
    let lastError = null;
    let shortestWaitMs = Infinity;
    
    cleanExpiredCooldowns();
    const activeCooldowns = getPersistentCooldowns();
    
    for (let i = 0; i < poolSize; i++) {
      const checkIndex = (pointer + i) % poolSize;
      const rawK = keyPool[checkIndex];
      if (!rawK || rawK.length < 10) continue;
      const cleanK = rawK.replace(/["'\s]/g, "");
      
      const cdData = activeCooldowns[cleanK];
      const cooldownUntil = cdData ? cdData.expireAt : 0;
      const waitMs = cooldownUntil - Date.now();
      if (waitMs > 0) {
        if (waitMs < shortestWaitMs) shortestWaitMs = waitMs;
        continue;
      }
      
      let modelsToTry = isAuto ? cascadeModels : [cascadeModels[0]];
      
      for (const model of modelsToTry) {
        const currentRpd = RPDTracker.getUsage(cleanK, model.id);
        if (!isPremium && currentRpd >= model.rpdLimit) {
          lastError = new Error(`[Cạn Quota] Mô hình ${model.id} của Key ...${cleanK.slice(-4)}`);
          continue;
        }
        
        try {
          const controller = new AbortController();
          const onAbort = () => controller.abort();
          if (abortSignal) abortSignal.addEventListener('abort', onAbort);
          
          const fetchPromise = fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${cleanK}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          }).finally(() => {
            if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              controller.abort();
              reject(new Error("Hết thời gian chờ 15s (Bị treo ở tầng Network)."));
            }, 15000);
          });
          
          const res = await Promise.race([fetchPromise, timeoutPromise]);
          
          if (res.status === 429) { lastError = new Error(`429: Too Many Requests (${model.id})`); continue; }
          if (res.status === 503) { lastError = new Error(`503: Service Unavailable (${model.id})`); continue; }
          if (res.status === 500) throw new Error("500: Internal Server Error");
          
          if (!res.ok && res.status !== 200 && res.status !== 400 && res.status !== 403) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
              throw new Error(`HTTP ${res.status}: Lỗi mạng không xác định (Non-JSON)`);
            }
          }
          
          const data = await res.json();
          if (data.error) {
            const msgLower = (data.error.message || "").toLowerCase();
            if (data.error.code === 429 || data.error.status === 'RESOURCE_EXHAUSTED' || msgLower.includes('quota')) {
              if (msgLower.includes('per minute') || msgLower.includes('rate limit') || msgLower.includes('load balancer')) {
                setKeyCooldown(cleanK, 5 * 60 * 1000);
                triggerGlobalPause(15000);
                lastError = new Error(`[Spam 429] Key ...${cleanK.slice(-4)} gọi quá nhanh.`);
                break;
              } else {
                lastError = new Error(`429: Cạn Quota mô hình ${model.id}`);
                continue;
              }
            }
            if (data.error.code === 503 || data.error.code === 500 || msgLower.includes('overloaded')) {
              lastError = new Error(`503: Nghẽn mô hình ${model.id}`);
              continue;
            }
            if (data.error.code === 403 || msgLower.includes('api key') || msgLower.includes('unregistered')) {
              setKeyCooldown(cleanK, 24 * 60 * 60 * 1000);
              lastError = new Error(`403: Key ...${cleanK.slice(-4)} bị vô hiệu hóa.`);
              break;
            }
            if (data.error.code === 400) {
              lastError = new Error(`400: Lỗi cú pháp - ${data.error.message}`);
              break;
            }
            throw new Error(data.error.message);
          }
          
          finalData = data;
          usedModelId = model.id;
          usedApiKey = cleanK;
          localStorage.setItem('fc_key_pointer', (checkIndex + 1) % poolSize);
          break;
        } catch (e) {
          if (e.name === 'AbortError' || (e.message && e.message.includes('Người dùng đã hủy')) || (e.message && e.message.includes('Hết thời gian chờ'))) {
            throw e;
          }
          lastError = e;
        }
      }
      if (finalData) break;
    }
    
    if (!finalData) {
      if (shortestWaitMs !== Infinity && shortestWaitMs > 0) {
        throw new Error(`[API_COOLDOWN] SmartFill: Kho Key đang đóng băng. Thử lại sau ${Math.ceil(shortestWaitMs/60000)} phút.`);
      }
      if (lastError) throw lastError;
      throw new Error("Không có Key & Mô hình AI nào khả dụng.");
    }
    
    RPDTracker.incrementUsage(usedApiKey, usedModelId);
    
    if (keyPool.length > 1) {
      setKeyCooldown(usedApiKey, 5000);
    }
    if (usedApiKey !== localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')) {
      localStorage.setItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key', usedApiKey);
    }
    
    const text = finalData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI không trả về kết quả");
    
    let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanText);
    
    if (lang === 'zh' && parsed.sinoViet) {
      parsed.sinoViet = parsed.sinoViet.replace(/\(.*?\)/g, '').replace(/（.*?）/g, '').trim();
    }
    
    const finalResult = { ...parsed, term: term };
    for (const key in finalResult) {
      if (finalResult[key] === "" || finalResult[key] === null) {
        delete finalResult[key];
      }
    }
    delete finalResult.posAnalysis;
    delete finalResult.image;
    
    if (finalResult.image_keyword && finalResult.image_keyword.trim() !== "") {
      finalResult.image = `https://tse4.mm.bing.net/th?q=${encodeURIComponent(finalResult.image_keyword.trim())}&w=300&h=300&c=7&rs=1&p=0`;
    }
    if (finalData.usageMetadata) {
      finalResult._tokenUsage = finalData.usageMetadata;
    }
    
    await new Promise(r => setTimeout(r, 3000));
    return finalResult;
  });
};

// ============================================================================
// 5. TẠO NHIỄU CHO GAME (QUIZ / MATCH)
// ============================================================================
export const fetchAiDistractors = async (baseText, targetText, lang) => {
  const cleanTarget = targetText ? targetText.replace(/\u0332/g, '') : '';
  const schema = { type: "object", properties: { distractors: { type: "array", items: { type: "string" } } }, required: ["distractors"] };
  const isSentence = Utils.detectSentence(cleanTarget);
  const promptKey = isSentence ? 'quiz_sentence' : 'quiz_word'; // Đã fix tên key
  const prompt = Utils.getPrompt(promptKey, { baseText, targetText: cleanTarget, term: baseText, definition: cleanTarget });
  
  try {
    const { text, tokenMetadata } = await callGeminiApi(prompt, schema);
    const res = Utils.parseAiJson(text);
    if (res.distractors && tokenMetadata) res.distractors._tokenUsage = tokenMetadata;
    return res.distractors || [];
  } catch (e) {
    console.warn("Lỗi lấy đáp án nhiễu", e);
    return [];
  }
};

export const fetchAiDistractorsBatch = async (items, lang) => {
  const schema = { type: "object", properties: { distractors: { type: "array", items: { type: "string" } } }, required: ["distractors"] };
  const fullLang = { 'zh': 'Tiếng Trung', 'en': 'Tiếng Anh', 'vi': 'Tiếng Việt' }[lang] || lang;
  
  const itemsText = items.map((item, index) => {
    const cleanTerm = item.term ? item.term.replace(/\u0332/g, '') : '';
    return `${index + 1}. Mục tiêu: "${cleanTerm}" (Nghĩa đúng: "${item.definition}")`;
  }).join('\n');
  
  const isSentenceMode = items.length > 0 && Utils.detectSentence(items[0].term ? items[0].term.replace(/\u0332/g, '') : '');
  const promptKey = isSentenceMode ? 'match_sentence' : 'match_word';
  const prompt = Utils.getPrompt(promptKey, { itemsText, fullLang, count: items.length });
  
  try {
    const { text, tokenMetadata } = await callGeminiApi(prompt, schema);
    const res = Utils.parseAiJson(text);
    if (res.distractors && tokenMetadata) res.distractors._tokenUsage = tokenMetadata;
    return res.distractors || [];
  } catch (e) {
    console.warn("Lỗi nạp dữ liệu hàng loạt", e);
    return [];
  }
};

// ============================================================================
// 6. GIẢI THÍCH NGỮ PHÁP (GRAMMAR EXPLAIN)
// ============================================================================
export const explainSentenceGrammar = async (sentence, lang, apiKey) => {
  const cleanSentence = sentence ? sentence.replace(/\u0332/g, '') : '';
  const prompt = Utils.getPrompt('grammar', { sentence: cleanSentence, lang });
  const { text, tokenMetadata } = await callGeminiApi(prompt, null, apiKey);
  return { text: Utils.cleanText(text), _tokenUsage: tokenMetadata };
};