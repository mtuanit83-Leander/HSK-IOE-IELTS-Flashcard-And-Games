// ============================================================================
// FILE 76/85: src/hooks/useAiLogic.js
// NGUỒN GỐC: Tầng 6 - Block 6.2 (AI Logic - Version 1.23)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 19/11/2026 - 22:59 (GMT+7)
// NHIỆM VỤ: Cung cấp hook useAiLogic xử lý tự động phát (Auto-Play) và giao tiếp
//           với AI Gemini (Làm giàu thẻ, giải thích ngữ pháp, hàng đợi ngầm);
//           vá lỗi dependency object core & bảo vệ AbortController, chống nhiễm
//           chéo ngôn ngữ/chế độ, chuẩn hóa resolveActiveApiKey, chống deadlock
//           hàng đợi với trần GLOBAL_PAUSE và tách điều kiện ảnh cho chế độ vocab.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { STORAGE_KEYS, CONFIG_SAMPLES } from '@/config/constants';
import {
  Utils,
  isValidImageUrl,
  buildSmartImageUrl
} from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { fillCardWithAi } from '@/services/geminiApi';

// Giới hạn số lần ngủ đông GLOBAL_PAUSE liên tiếp trước khi tự dừng hàng đợi (tránh treo vô hạn)
const MAX_GLOBAL_PAUSE_RETRIES = 4;

// [V1.23 - DIRECT INJECTION] Hàm đọc Level trực tiếp từ LocalStorage, vượt qua State của React
const getDirectLevelContext = (lang) => {
  let result = null;
  try {
    const rawLevel = localStorage.getItem('fc_current_level_' + lang);
    if (rawLevel) {
      const parsed = JSON.parse(rawLevel);
      if (Array.isArray(parsed) && parsed.length > 0) result = parsed;
      else if (typeof parsed === 'string' && parsed.trim() !== '') result = [parsed];
    }
  } catch (e) {
    // Fallback cứu hộ nếu JSON bị vỡ
    const rawLevel = localStorage.getItem('fc_current_level_' + lang);
    if (rawLevel) {
      const cleanRaw = rawLevel.replace(/["[\]]/g, '').trim();
      if (cleanRaw) result = [cleanRaw];
    }
  }

  // Quét dự phòng trong settings cũ nếu vẫn rỗng
  if (!result || result.length === 0) {
    try {
      const settings = JSON.parse(localStorage.getItem('fc_settings') || '{}');
      if (settings.currentLevel) {
        result = Array.isArray(settings.currentLevel)
          ? settings.currentLevel
          : [settings.currentLevel];
      }
    } catch (e) {
      // Bỏ qua lỗi đọc settings cũ
    }
  }
  return result || [];
};

// Hàm delay dùng riêng cho Hàng đợi ngầm (Không bị ngắt bởi AutoPlay)
const smartQueueDelay = (ms) => new Promise((r) => setTimeout(r, ms));

// [VER 1.1] Đọc động khoảng nghỉ giữa các thẻ từ fc_ai_config (luôn chặn sàn nhất quán ở 3000ms)
const getDynamicQueueDelayMs = (defaultMs = 5000) => {
  try {
    const aiCfg = Utils?.safeJsonParse ? Utils.safeJsonParse('fc_ai_config', null) : null;
    const configured = parseInt(aiCfg?.delayMs, 10);
    if (!isNaN(configured) && configured >= 0) {
      return Math.max(3000, configured);
    }
  } catch (e) {
    // Bỏ qua lỗi đọc cấu hình
  }
  return defaultMs;
};

// [VER 1.1] Đọc API Key khả dụng đồng nhất trên toàn bộ hook (State -> fc_apikey -> Paid Key -> Pool)
const resolveActiveApiKey = (stateApiKey = '') => {
  const cleanKey = (val) =>
    typeof val === 'string' ? val.replace(/["'\s]/g, '').trim() : '';

  const fromState = cleanKey(stateApiKey);
  if (fromState.length >= 10) return fromState;

  try {
    const fromPrimary = cleanKey(
      localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_apikey')
    );
    if (fromPrimary.length >= 10) return fromPrimary;

    const fromPaid = cleanKey(localStorage.getItem('fc_paid_apikey'));
    if (fromPaid.length >= 10) return fromPaid;

    const pool = Utils?.safeJsonParse
      ? Utils.safeJsonParse('fc_apikey_pool', [])
      : [];
    if (Array.isArray(pool)) {
      const firstValid = pool.find((k) => cleanKey(k).length >= 10);
      if (firstValid) return cleanKey(firstValid);
    }
  } catch (e) {
    // Bỏ qua lỗi truy cập storage
  }

  return '';
};

// [VER 1.1] Xây dựng danh sách trường bắt buộc theo chế độ (chỉ bắt buộc ảnh ở chế độ Từ vựng)
const buildRequiredFields = (lang, dataMode) => {
  const isSentence = dataMode === 'sentence';
  const fields = [
    'pronunciation',
    'definition',
    'partOfSpeech',
    'topic',
    'example'
  ];
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

// Kiểm tra đường dẫn ảnh hợp lệ qua helpers (hỗ trợ http/https/data:image và chặn chuỗi rác)
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

// Dựng URL ảnh sạch qua buildSmartImageUrl, tuyệt đối chặn fallback bằng chữ Hán hoặc câu dài
const resolveSafeImageFallback = (aiImage, existingImage, fallbackTerm, lang, dataMode) => {
  if (checkIsValidImage(aiImage)) return aiImage.trim();

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

// Lọc bỏ các trường nháp/metadata trước khi lưu vào thẻ (chống phình LocalStorage & IndexedDB)
const stripTransientAiFields = (payload) => {
  if (!payload || typeof payload !== 'object') return {};
  const { _tokenUsage, posAnalysis, image_keyword, ...cleanData } = payload;
  return cleanData;
};

// Xác định danh sách thẻ đang hiển thị (State Targeting)
const getActiveCardsArray = (state) => {
  if (!state) return [];
  if (state.isStudyingNotebook) return state.notebook || [];
  if (state.studySourceName === 'mastered') return state.mastered || [];
  if (state.studySourceName === 'incorrect') return state.incorrectList || [];
  return state.cards || [];
};

// Cộng dồn tổng số Token sử dụng vào LocalStorage và React State
const recordTokenUsage = (tokenUsage, setTotalTokens) => {
  if (!tokenUsage || !tokenUsage.totalTokenCount) return;
  const newTotal =
    parseInt(localStorage.getItem('fc_total_tokens') || '0', 10) +
    (tokenUsage.totalTokenCount || 0);
  localStorage.setItem('fc_total_tokens', String(newTotal));
  if (typeof setTotalTokens === 'function') {
    setTotalTokens(newTotal);
  }
};

// Cầu nối gọi hàm fillCardWithAi an toàn với đầy đủ 7 tham số (bao gồm existingData)
const callFillCardWithAi = async (
  term,
  lang,
  apiKey,
  missingFields,
  dataMode,
  levelContext,
  existingData = null
) => {
  const fn =
    fillCardWithAi ||
    Utils?.fillCardWithAi ||
    (typeof window !== 'undefined' && window.Utils?.fillCardWithAi);
  if (typeof fn !== 'function') {
    throw new Error('Không tìm thấy hàm fillCardWithAi trong hệ thống.');
  }
  return await fn(
    term,
    lang,
    apiKey,
    missingFields,
    dataMode,
    levelContext,
    existingData
  );
};

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

  // Cờ báo hiệu vòng lặp đang chạy và ID phiên chạy chống chồng chéo
  const isLoopRunning = useRef(false);
  const autoPlaySessionRef = useRef(0);

  // Hàng đợi tuần tự cho tính năng Làm giàu thẻ khi đang học
  const enrichQueueRef = useRef([]);
  const isProcessingEnrichQueue = useRef(false);

  // [VER 1.1] Cờ theo dõi trạng thái Bật/Tắt thực tế của Học AI để chỉ gọi abort() khi chuyển Bật -> Tắt
  const wasLearnAiActiveRef = useRef(false);

  // [VER 1.1] Helper đồng bộ dữ liệu thẻ xuyên suốt 5 kho & khóa cứng (targetLang, targetMode) chống nhiễm chéo
  const syncCardAcrossPools = useCallback(
    (cardTerm, patchData, targetLang = null, targetMode = null) => {
      if (!cardTerm || !patchData || typeof patchData !== 'object') return;
      const liveState = latestStateRef?.current || coreRef.current;
      const resolvedLang = targetLang || liveState?.lang || coreLang;
      const resolvedMode = targetMode || liveState?.dataMode || coreDataMode;
      const isSameActiveLang = (liveState?.lang || coreLang) === resolvedLang;
      const isSameActiveMode = (liveState?.dataMode || coreDataMode) === resolvedMode;

      const dbInstance =
        FcDB || (typeof window !== 'undefined' ? window.FcDB : null);

      const updateList = (prev, dbKey = null, storageKey = null) => {
        if (!Array.isArray(prev)) return prev;
        const idx = prev.findIndex((c) => c && c.term === cardTerm);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...patchData };
        if (dbKey && dbInstance) dbInstance.set(dbKey, next);
        if (storageKey) Utils?.safeLocalStorageSet(storageKey, next);
        return next;
      };

      const dataStorageKey =
        CONFIG_SAMPLES?.[resolvedLang]?.dataKey || `fc_data_${resolvedLang}`;
      const noteStorageKey =
        CONFIG_SAMPLES?.[resolvedLang]?.noteKey || `fc_notebook_${resolvedLang}`;
      const notebookDbKey = `fc_notebook_${resolvedLang}`;
      const masteredDbKey = `fc_mastered_${resolvedLang}`;
      const incorrectDbKey =
        (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') +
        '_' +
        resolvedLang;

      if (isSameActiveLang) {
        if (isSameActiveMode) {
          setCards((prev) => updateList(prev, null, dataStorageKey));
        }
        setNotebook((prev) => updateList(prev, notebookDbKey, noteStorageKey));
        if (typeof setMastered === 'function') {
          setMastered((prev) => updateList(prev, masteredDbKey, null));
        }
        if (typeof setIncorrectList === 'function') {
          setIncorrectList((prev) => updateList(prev, incorrectDbKey, null));
        }
      } else {
        // Người dùng đã chuyển sang ngôn ngữ khác khi API đang bay: cập nhật trực tiếp kho vật lý của ngôn ngữ gốc
        const storedNote = Utils?.safeJsonParse(noteStorageKey, null);
        if (Array.isArray(storedNote)) {
          const nIdx = storedNote.findIndex((c) => c && c.term === cardTerm);
          if (nIdx !== -1) {
            storedNote[nIdx] = { ...storedNote[nIdx], ...patchData };
            Utils?.safeLocalStorageSet(noteStorageKey, storedNote);
            if (dbInstance) dbInstance.set(notebookDbKey, storedNote);
          }
        }
      }

      // Luôn cập nhật thẳng vào kho lõi Master Data của đúng (resolvedLang, resolvedMode)
      const masterDataKey = `fc_master_data_${resolvedLang}_${resolvedMode}`;
      const masterData = Utils?.safeJsonParse(masterDataKey, null);
      if (masterData && typeof masterData === 'object') {
        let updatedMaster = false;
        Object.keys(masterData).forEach((levelKey) => {
          if (Array.isArray(masterData[levelKey])) {
            const mIdx = masterData[levelKey].findIndex(
              (c) => c && c.term === cardTerm
            );
            if (mIdx !== -1) {
              masterData[levelKey][mIdx] = {
                ...masterData[levelKey][mIdx],
                ...patchData
              };
              updatedMaster = true;
            }
          }
        });
        if (updatedMaster) {
          Utils?.safeLocalStorageSet(masterDataKey, masterData);
        }
      }
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
  // 1. CÁC HÀM TRÌ HOÃN (DELAYS)
  // ==================================================================================
  // Hàm đợi an toàn dùng riêng cho AutoPlay (Có thể bị ngắt bởi autoPlayTimeoutRef)
  const wait = useCallback(
    (ms) =>
      new Promise((resolve) => {
        if (autoPlayTimeoutRef?.current) {
          clearTimeout(autoPlayTimeoutRef.current);
        }
        if (autoPlayTimeoutRef) {
          autoPlayTimeoutRef.current = setTimeout(resolve, ms);
        } else {
          setTimeout(resolve, ms);
        }
      }),
    [autoPlayTimeoutRef]
  );

  // ==================================================================================
  // 2. LOGIC AUTO-PLAY (STABLE VERSION - KHÔI PHỤC NGUYÊN BẢN BLOCK 6.2)
  // ==================================================================================
  const runAutoPlay = useCallback(async () => {
    if (isLoopRunning.current) return;
    if (!latestStateRef?.current?.isAutoPlaying) return;

    isLoopRunning.current = true;
    const sessionId = ++autoPlaySessionRef.current;
    const isSessionValid = () =>
      Boolean(
        latestStateRef?.current?.isAutoPlaying &&
          autoPlaySessionRef.current === sessionId
      );

    try {
      const { cards, currentCardIndex: idx, settings } = latestStateRef.current;
      const card = cards?.[idx];

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
          if (callbacksRef.current?.handleNext) {
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

        // 2. Đọc (Speak) kèm dọn timer an toàn chống rò rỉ
        const minTimePromise = wait(1500);
        const speakPromise = new Promise((resolve) => {
          if (typeof callbacksRef.current?.speak === 'function') {
            callbacksRef.current.speak(textToSpeak, null, null, resolve);
          } else {
            resolve();
          }
        });
        // Tính toán thời gian động dựa trên độ dài văn bản (150ms/ký tự, tối thiểu 10 giây)
        const dynamicTimeoutMs = Math.max(
          10000,
          (textToSpeak ? textToSpeak.length : 0) * 150
        );
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
      if (
        !latestStateRef?.current?.isAutoPlaying ||
        autoPlaySessionRef.current !== sessionId
      ) {
        if (autoPlaySessionRef.current === sessionId) {
          isLoopRunning.current = false;
        }
      }
    }
  }, [latestStateRef, setIsFlipped, setIsContentHidden, wait]);

  // [EFFECT MASTER] - Khóa chặt dependency [isAutoPlaying, currentCardIndex] theo đúng Block 6.2 gốc
  // Tuyệt đối không đưa runAutoPlay/callbacks vào dependency để tránh clearTimeout khi lật thẻ (setIsFlipped)
  useEffect(() => {
    if (autoPlayTimeoutRef?.current) {
      clearTimeout(autoPlayTimeoutRef.current);
    }

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
      if (autoPlayTimeoutRef?.current) {
        clearTimeout(autoPlayTimeoutRef.current);
      }
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

    // [VER 1.1] Bọc try...finally ngoài vòng while để đảm bảo 0% nguy cơ deadlock khóa hàng đợi
    try {
      while (aiQueueRef.current.length > 0) {
        const term = aiQueueRef.current[0];
        const currentApiKey = resolveActiveApiKey(apiKey);
        const liveState = latestStateRef?.current || coreRef.current;
        const reqLang = liveState?.lang || coreLang;
        const reqMode = liveState?.dataMode || coreDataMode;

        let shouldDelay = false;
        let shouldShift = true; // [V1.13] Cờ quyết định có vứt bỏ từ vựng hay không
        let customDelayMs = 0; // [V1.13] Thời gian ngủ đông đặc biệt

        try {
          if (!currentApiKey) {
            continue;
          }
          const currentNotebook = liveState?.notebook || [];
          const noteCard = currentNotebook.find((n) => n && n.term === term);

          // [VER 1.1] Tách điều kiện 'image' chỉ bắt buộc ở chế độ Từ vựng (!isSentence)
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
                const strVal = val ? val.toString().trim() : '';
                return strVal === '';
              })
            : requiredFields;

          if (missingFields && missingFields.length === 0) {
            continue;
          }

          shouldDelay = true; // Sẽ gọi API, cần delay sau đó để hãm phanh

          // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
          const levelContext = getDirectLevelContext(reqLang);

          // Truyền đầy đủ 7 tham số (bao gồm noteCard làm existingData) xuống tầng Lõi API
          const res = await callFillCardWithAi(
            term,
            reqLang,
            currentApiKey,
            missingFields,
            reqMode,
            levelContext,
            noteCard || null
          );

          if (res && typeof res === 'object') {
            recordTokenUsage(res._tokenUsage, setTotalTokens);
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

            // [VER 1.1] Đồng bộ xuyên 5 kho theo đúng (reqLang, reqMode) thay vì chỉ cập nhật notebook
            syncCardAcrossPools(
              term,
              {
                ...cleanRes,
                ai_explanation:
                  cleanRes.example || noteCard?.example || 'Enriched'
              },
              reqLang,
              reqMode
            );
          }

          consecutiveFailures = 0; // Reset bộ đếm nếu thành công
          globalPauseRetries = 0;
        } catch (e) {
          // [V1.13 + VER 1.1] Xử lý lỗi Cầu dao Toàn cục (Global Pause) có giới hạn số lần thử
          if (e.message && e.message.includes('GLOBAL_PAUSE')) {
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
            shouldShift = false; // Không vứt bỏ từ vựng
            customDelayMs = 15500; // Ngủ đông 15.5 giây đợi hết bão
            console.warn(
              `[AI Queue] Tạm nghỉ 15.5s để né 429 (lần ${globalPauseRetries}/${MAX_GLOBAL_PAUSE_RETRIES})... Giữ lại từ: ${term}`
            );
          } else {
            shouldDelay = true; // Lỗi mạng thông thường, bắt buộc phải delay
            console.warn(`Auto-fill skipped for ${term}:`, e);
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              if (typeof callbacksRef.current?.showToast === 'function') {
                callbacksRef.current.showToast(
                  'Máy chủ AI quá tải. Đã dừng tự động điền sổ tay!',
                  'error'
                );
              }
              aiQueueRef.current = []; // Hủy toàn bộ đạn
              break; // Cắt đứt vòng lặp vô tận
            }
          }
        } finally {
          // [V1.13] LUÔN LUÔN thực thi shift CHỈ KHI Cờ shouldShift cho phép
          if (shouldShift && aiQueueRef.current.length > 0) {
            aiQueueRef.current.shift();
          }
          // [V1.13] Xử lý Delay: Ngủ đông dài (nếu có bão) hoặc Delay nền động
          if (customDelayMs > 0) {
            await smartQueueDelay(customDelayMs);
          } else if (shouldDelay) {
            await smartQueueDelay(getDynamicQueueDelayMs(5000));
          }
        }
      }
    } finally {
      isAiQueueProcessing.current = false;
    }
  }, [
    aiQueueRef,
    apiKey,
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
  // Xử lý tham số đầu vào linh hoạt (index, card object, hoặc Event)
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

      // Tự động nhận diện mảng dữ liệu đang Active (State Targeting) qua latestStateRef/coreRef
      const state = latestStateRef?.current || coreRef.current;
      const reqLang = state?.lang || coreLang;
      const reqMode = state?.dataMode || coreDataMode;
      const activeArr = getActiveCardsArray(state);

      let cardTerm = null;
      if (typeof indexOrCardOrEvent === 'number') {
        cardTerm = activeArr[indexOrCardOrEvent]?.term;
      } else if (
        indexOrCardOrEvent &&
        typeof indexOrCardOrEvent === 'object' &&
        indexOrCardOrEvent.term
      ) {
        cardTerm = indexOrCardOrEvent.term;
      } else {
        const idx = state.currentCardIndex;
        cardTerm = activeArr[idx]?.term;
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
      if (!silent) setIsAiLoading(true);

      try {
        const currentCard = activeArr.find((c) => c && c.term === cardTerm);
        // [VER 1.1] Chỉ ép 'image' bắt buộc ở chế độ Từ vựng (!isSentence)
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
          return !val || val.toString().trim() === '';
        });

        // Trả về false nếu không gọi API, giúp quá trình chạy ngầm quét 0ms
        if (!missingFields.length) {
          if (!silent && typeof notify === 'function') {
            notify('Thẻ đã đầy đủ!', 'success');
          }
          return false;
        }

        // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
        const levelContext = getDirectLevelContext(reqLang);

        // Truyền đầy đủ 7 tham số (bao gồm currentCard làm existingData) xuống tầng Lõi API
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

        recordTokenUsage(enriched._tokenUsage, setTotalTokens);
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

        // ĐỒNG BỘ XUYÊN MẢNG (CROSS-ARRAY SYNCHRONIZATION) khóa cứng (reqLang, reqMode)
        const enrichedData = {
          ...cleanEnriched,
          ai_explanation:
            cleanEnriched.example || currentCard?.example || 'Enriched',
          is_enriched: true
        };

        syncCardAcrossPools(cardTerm, enrichedData, reqLang, reqMode);

        if (!silent && typeof notify === 'function') {
          notify('Đã bổ sung thông tin cơ bản!', 'success');
        }
        return true; // Trả về true báo hiệu API đã bị hit
      } catch (e) {
        if (!silent && typeof notify === 'function') {
          notify('Lỗi AI: ' + e.message, 'error');
        }
        // [VER 1.1] Chỉ ném lỗi ra ngoài khi chạy ngầm (silent=true) để tránh Unhandled Promise Rejection khi bấm tay
        if (silent) {
          throw e;
        }
        return false;
      } finally {
        processingCardsRef?.current?.delete(cardTerm);
        if (!silent) setIsAiLoading(false);
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

  const handleExplainGrammar = useCallback(
    async (index) => {
      const notify = callbacksRef.current?.showToast;
      const effectiveKey = resolveActiveApiKey(apiKey);
      if (!effectiveKey) {
        if (typeof notify === 'function') notify('Cần API Key!', 'warning');
        return;
      }

      // Tự động nhận diện mảng dữ liệu đang Active qua latestStateRef/coreRef
      const state = latestStateRef?.current || coreRef.current;
      const reqLang = state?.lang || coreLang;
      const reqMode = state?.dataMode || coreDataMode;
      const activeArr = getActiveCardsArray(state);
      const targetIdx =
        typeof index === 'number' ? index : state.currentCardIndex;
      const targetCard = activeArr[targetIdx];
      const cardTerm = targetCard?.term;

      if (!cardTerm) return;

      setIsAiLoading(true);
      try {
        // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
        const levelContext = getDirectLevelContext(reqLang);

        // Truyền đầy đủ 7 tham số (bao gồm targetCard làm existingData) xuống tầng Lõi API
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
          recordTokenUsage(result._tokenUsage, setTotalTokens);
          syncCardAcrossPools(
            cardTerm,
            { analysis: result.analysis },
            reqLang,
            reqMode
          );
          if (typeof notify === 'function') notify('Phân tích xong!', 'success');
        }
      } catch (e) {
        if (typeof notify === 'function') {
          notify('Lỗi AI: ' + e.message, 'error');
        }
      } finally {
        setIsAiLoading(false);
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

  const handleManualAiFill = useCallback(
    async (term, existingData = null) => {
      const notify = callbacksRef.current?.showToast;
      const effectiveKey = resolveActiveApiKey(apiKey);
      if (!effectiveKey) {
        if (typeof notify === 'function') notify('Cần API Key!', 'warning');
        return null;
      }

      const state = latestStateRef?.current || coreRef.current;
      const reqLang = state?.lang || coreLang;
      const reqMode = state?.dataMode || coreDataMode;

      setIsAiLoading(true);
      try {
        // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
        const levelContext = getDirectLevelContext(reqLang);

        // Truyền đầy đủ 7 tham số xuống tầng Lõi API
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
          recordTokenUsage(res._tokenUsage, setTotalTokens);
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
        if (typeof notify === 'function') notify(e.message, 'error');
        return null;
      } finally {
        setIsAiLoading(false);
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

    // [VER 1.1] Bọc try...finally ngoài vòng while chống deadlock khóa hàng đợi
    try {
      while (enrichQueueRef.current.length > 0) {
        const termToEnrich = enrichQueueRef.current[0];
        let shouldDelay = false;
        let shouldShift = true; // [V1.13] Cờ quyết định vứt bỏ từ vựng
        let customDelayMs = 0; // [V1.13] Thời gian ngủ đông đặc biệt

        try {
          // Tái sử dụng hàm handleAiEnrichCard với tham số silent=true để xử lý ngầm
          // Nhận cờ boolean để biết API có thực sự bị gọi hay không
          const apiHit = await handleAiEnrichCard({ term: termToEnrich }, true);
          shouldDelay = apiHit;
          consecutiveFailures = 0; // Reset bộ đếm nếu chạy êm ái
          globalPauseRetries = 0;
        } catch (e) {
          // [V1.13 + VER 1.1] Xử lý lỗi Cầu dao Toàn cục (Global Pause) có giới hạn số lần thử
          if (e.message && e.message.includes('GLOBAL_PAUSE')) {
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
            shouldShift = false; // Ôm chặt từ vựng, không vứt đi
            customDelayMs = 15500; // Ngủ đông 15.5 giây chờ Cầu dao mở lại
            console.warn(
              `[Enrich Queue] Tạm nghỉ 15.5s để né 429 (lần ${globalPauseRetries}/${MAX_GLOBAL_PAUSE_RETRIES})... Giữ lại từ: ${termToEnrich}`
            );
          } else {
            shouldDelay = true; // Nếu lỗi xảy ra tức là API đã bị hit và bị từ chối
            console.warn(`Background enrich error for ${termToEnrich}:`, e);
            consecutiveFailures++;
            if (consecutiveFailures >= 3) {
              if (typeof callbacksRef.current?.showToast === 'function') {
                callbacksRef.current.showToast(
                  'Máy chủ AI quá tải. Tiến trình Làm giàu thẻ tự động đã bị dừng!',
                  'error'
                );
              }
              enrichQueueRef.current = []; // Hủy toàn bộ hàng đợi
              break; // Thoát vòng lặp
            }
          }
        } finally {
          // [V1.13] LUÔN LUÔN thực thi shift CHỈ KHI Cờ shouldShift cho phép
          if (shouldShift && enrichQueueRef.current.length > 0) {
            enrichQueueRef.current.shift();
          }
          // [V1.13] Khóa cứng luồng bằng customDelay (15.5s) HOẶC delay nền động
          if (customDelayMs > 0) {
            await smartQueueDelay(customDelayMs);
          } else if (shouldDelay) {
            await smartQueueDelay(getDynamicQueueDelayMs(5000));
          }
        }
      }
    } finally {
      isProcessingEnrichQueue.current = false;
    }
  }, [handleAiEnrichCard]);

  // [VER 1.1] Tự động làm sạch hàng đợi nền khi người dùng chuyển ngôn ngữ, chế độ hoặc nguồn học
  useEffect(() => {
    enrichQueueRef.current = [];
  }, [coreLang, coreDataMode, coreIsStudyingNotebook, coreStudySourceName]);

  // Tính số lượng thẻ hiện có của nguồn học đang active để làm dependency ổn định cho Effect
  const activeCardsCount = getActiveCardsArray(core).length;

  // Effect: Batch Enrich (Chạy Tuần Tự) - Vá triệt để lỗi Kill Switch cắt nhầm luồng Mini-Game/Thủ công
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

      // Đảm bảo Controller luôn sẵn sàng cho luồng chạy
      if (
        typeof window !== 'undefined' &&
        (!window.__currentGameAbortController ||
          window.__currentGameAbortController.signal.aborted)
      ) {
        window.__currentGameAbortController = new AbortController();
      }

      const currentTerm = activeCards[currentCardIndex]?.term;
      if (!currentTerm) return;

      const nextTerms = [];
      nextTerms.push(currentTerm); // Ưu tiên thẻ hiện tại

      // Nạp thêm 2 thẻ kế tiếp
      for (let i = 1; i <= 2; i++) {
        const nextIdx = (currentCardIndex + i) % activeCards.length;
        const nextTerm = activeCards[nextIdx]?.term;
        if (nextTerm && !nextTerms.includes(nextTerm)) {
          nextTerms.push(nextTerm);
        }
      }

      // Đẩy vào hàng đợi (Loại bỏ các từ đã có sẵn trong queue)
      nextTerms.forEach((term) => {
        if (!enrichQueueRef.current.includes(term)) {
          enrichQueueRef.current.push(term);
        }
      });

      // Kích hoạt động cơ
      processEnrichQueue();
    } else {
      // Dọn dẹp hàng đợi nếu tắt tính năng hoặc thoát màn hình
      enrichQueueRef.current = [];

      // [VER 1.1] CHỈ kích hoạt Kill Switch khi chế độ Học AI thực sự chuyển từ Bật -> Tắt
      if (wasLearnAiActiveRef.current) {
        wasLearnAiActiveRef.current = false;
        if (typeof window !== 'undefined' && window.__currentGameAbortController) {
          window.__currentGameAbortController.abort('User toggled off AI');
          window.__currentGameAbortController = new AbortController();
        }
      }
    }
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
  window.Block6_2_useAiLogic = useAiLogic;
  window.Block14_useAiLogic = useAiLogic;
  window.useAiLogic = useAiLogic;
}

export default useAiLogic;