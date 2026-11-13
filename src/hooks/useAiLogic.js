/**
 * @file src/hooks/useAiLogic.js
 * @description Cung cấp hook useAiLogic xử lý tự động phát (Auto-Play) và giao tiếp với AI Gemini (Làm giàu thẻ, giải thích ngữ pháp).
 * @origin Tầng 6 - Block 6.2 (AI Logic)
 */

import { useCallback, useEffect, useRef } from 'react';
import { Utils } from '@/utils/helpers';
import { CONFIG_SAMPLES } from '@/config/constants';
import { FcDB } from '@/services/db';
import { STORAGE_KEYS } from '@/config/constants';

export const useAiLogic = (core, latestStateRef, callbacks) => {
  const { speak, handleNext } = callbacks;
  const {
    isAutoPlaying, currentCardIndex, setIsFlipped, setIsContentHidden,
    autoPlayTimeoutRef, apiKey, setIsAiLoading, setCards, setTotalTokens,
    setNotebook, aiQueueRef, isAiQueueProcessing, processingCardsRef
  } = core;

  // Cờ báo hiệu vòng lặp đang chạy
  const isLoopRunning = useRef(false);
  
  // Hàng đợi tuần tự cho tính năng Làm giàu thẻ khi đang học
  const enrichQueueRef = useRef([]);
  const isProcessingEnrichQueue = useRef(false);

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
        const cleanRaw = rawLevel.replace(/["\\[\]]/g, '').trim();
        if (cleanRaw) result = [cleanRaw];
      }
    }
    // Quét dự phòng trong settings cũ nếu vẫn rỗng
    if (!result || result.length === 0) {
      try {
        const settings = JSON.parse(localStorage.getItem('fc_settings') || '{}');
        if (settings.currentLevel) {
          result = Array.isArray(settings.currentLevel) ? settings.currentLevel : [settings.currentLevel];
        }
      } catch (e) {}
    }
    return result || [];
  };

  // ==================================================================================
  // 1. CÁC HÀM TRÌ HOÃN (DELAYS)
  // ==================================================================================
  // Hàm đợi an toàn dùng riêng cho AutoPlay (Có thể bị ngắt bởi autoPlayTimeoutRef)
  const wait = (ms) => new Promise(resolve => {
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    autoPlayTimeoutRef.current = setTimeout(resolve, ms);
  });
  
  // Hàm delay dùng riêng cho Hàng đợi ngầm (Không bị ngắt bởi AutoPlay)
  const smartQueueDelay = (ms) => new Promise(r => setTimeout(r, ms));

  // ==================================================================================
  // 2. LOGIC AUTO-PLAY (STABLE VERSION)
  // ==================================================================================
  const runAutoPlay = useCallback(async () => {
    if (isLoopRunning.current) return;
    if (!latestStateRef.current.isAutoPlaying) return;
    isLoopRunning.current = true;
    
    try {
      const { cards, currentCardIndex: idx, settings } = latestStateRef.current;
      const card = cards[idx];
      if (!card) return;
      
      // --- KIỂM TRA SRS ---
      if (settings.srsEnabled !== false && card.srs_due && card.srs_due > Date.now()) {
        await wait(2000);
        if (latestStateRef.current.isAutoPlaying) handleNext();
        return;
      }
      
      const textToSpeak = card.term;
      const repeatCount = Math.max(1, settings.repeatCount || 1);
      
      // --- VÒNG LẶP LẠI ---
      for (let i = 0; i < repeatCount; i++) {
        if (!latestStateRef.current.isAutoPlaying) break;
        
        // 1. Reset mặt trước
        setIsContentHidden(false);
        if (latestStateRef.current.isFlipped) {
          setIsFlipped(false);
          await wait(600);
        }
        
        if (!latestStateRef.current.isAutoPlaying) break;
        
        // 2. Đọc (Speak)
        const minTimePromise = wait(1500);
        const speakPromise = new Promise(resolve => speak(textToSpeak, null, null, resolve));
        
        // Tính toán thời gian động dựa trên độ dài văn bản (150ms/ký tự, tối thiểu 10 giây)
        const dynamicTimeoutMs = Math.max(10000, (textToSpeak ? textToSpeak.length : 0) * 150);
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('timeout'), dynamicTimeoutMs));
        
        await Promise.all([
          Promise.race([speakPromise, timeoutPromise]),
          minTimePromise
        ]);
        
        if (!latestStateRef.current.isAutoPlaying) break;
        
        await wait(settings.delayAfterRead || 1000);
        
        if (!latestStateRef.current.isAutoPlaying) break;
        
        // 3. Lật ra sau
        if (!latestStateRef.current.isFlipLocked) {
          setIsFlipped(true);
          await wait(600);
          await wait(settings.delayFlip || 2000);
        } else {
          await wait(settings.delayFlip || 2000);
        }
        
        // 4. Nghỉ giữa các lần lặp
        if (i < repeatCount - 1) {
          if (!latestStateRef.current.isAutoPlaying) break;
          if (!latestStateRef.current.isFlipLocked) {
            setIsFlipped(false);
            await wait(600);
          }
          await wait(800);
        }
      }
      
      // --- CHUYỂN THẺ ---
      if (latestStateRef.current.isAutoPlaying) {
        if (latestStateRef.current.isFlipped) {
          setIsFlipped(false);
          await wait(600);
        }
        await wait(settings.delayNext || 1500);
        isLoopRunning.current = false;
        handleNext();
      }
    } catch (e) {
      console.error("AutoPlay Error:", e);
      isLoopRunning.current = false;
    } finally {
      if (!latestStateRef.current.isAutoPlaying) {
        isLoopRunning.current = false;
      }
    }
  }, [speak, handleNext, latestStateRef, setIsFlipped, setIsContentHidden, autoPlayTimeoutRef]);

  // [EFFECT MASTER]
  useEffect(() => {
    if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    if (isAutoPlaying) {
      runAutoPlay();
    } else {
      isLoopRunning.current = false;
      setIsContentHidden(false);
      callbacks.stopSpeaking();
    }
    return () => {
      if (autoPlayTimeoutRef.current) clearTimeout(autoPlayTimeoutRef.current);
    };
  }, [isAutoPlaying, currentCardIndex]);

  // ==================================================================================
  // 3. CÁC LOGIC KHÁC (AI QUEUE)
  // ==================================================================================
  const processAiQueue = async () => {
    if (isAiQueueProcessing.current) return;
    isAiQueueProcessing.current = true;
    let consecutiveFailures = 0;
    
    while (aiQueueRef.current.length > 0) {
      const term = aiQueueRef.current[0];
      const currentApiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
      
      let shouldDelay = false;
      let shouldShift = true; // [V1.13] Cờ quyết định có vứt bỏ từ vựng hay không
      let customDelayMs = 0;  // [V1.13] Thời gian ngủ đông đặc biệt
      
      try {
        if (!currentApiKey) { continue; }
        
        const currentNotebook = latestStateRef.current.notebook;
        const noteCard = currentNotebook.find(n => n.term === term);
        
        // Lưới lọc thông minh nhận diện ngữ cảnh bằng dataMode
        const isSentence = core.dataMode === 'sentence';
        const requiredFields = ['pronunciation', 'definition', 'partOfSpeech', 'topic', 'example', 'image'];
        if (isSentence) {
          requiredFields.push('grammar_type');
        } else if (core.lang === 'zh') {
          requiredFields.push('sinoViet');
        }
        
        const missingFields = noteCard ? requiredFields.filter(field => {
          const val = noteCard[field];
          if (field === 'grammar_type') {
            return !val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '');
          }
          const strVal = val ? val.toString().trim() : "";
          if (field === 'image') return !strVal.startsWith('http');
          return strVal === "";
        }) : requiredFields;
        
        if (missingFields && missingFields.length === 0) { continue; }
        
        shouldDelay = true; // Sẽ gọi API, cần delay sau đó để hãm phanh
        
        // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
        const levelContext = getDirectLevelContext(core.lang);
        
        // Truyền core.dataMode và levelContext xuống tầng Lõi API
        const res = await Utils.fillCardWithAi(term, core.lang, currentApiKey, missingFields, core.dataMode, levelContext);
        
        if (missingFields.includes('image')) {
          if (!res.image || !res.image.startsWith('http')) {
            const fallbackQuery = noteCard && noteCard.image && noteCard.image.trim() !== "" ? noteCard.image : term;
            res.image = `https://tse4.mm.bing.net/th?q=${encodeURIComponent(fallbackQuery)}&w=300&h=300&c=7&rs=1&p=0`;
          }
        }
        
        if (res) {
          if (res._tokenUsage) {
            const newTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10) + (res._tokenUsage.totalTokenCount || 0);
            localStorage.setItem('fc_total_tokens', newTotal);
            setTotalTokens(newTotal);
          }
          
          setNotebook(prev => {
            const newData = prev.map(item => item.term === term ? { ...item, ...res, ai_explanation: res.example || item.example || "Enriched" } : item);
            Utils.safeLocalStorageSet(CONFIG_SAMPLES?.[core.lang]?.noteKey || `fc_notebook_${core.lang}`, newData);
            return newData;
          });
        }
        consecutiveFailures = 0; // Reset bộ đếm nếu thành công
      } catch (e) {
        // [V1.13] Xử lý lỗi Cầu dao Toàn cục (Global Pause)
        if (e.message && e.message.includes('GLOBAL_PAUSE')) {
          shouldShift = false; // Không vứt bỏ từ vựng
          customDelayMs = 15500; // Ngủ đông 15.5 giây đợi hết bão
          console.warn(`[AI Queue] Tạm nghỉ 15s để trốn bộ lọc 429... Giữ lại từ vựng: ${term}`);
        } else {
          shouldDelay = true; // Lỗi mạng thông thường, bắt buộc phải delay 5s
          console.warn(`Auto-fill skipped for ${term}:`, e);
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            if (callbacks && callbacks.showToast) {
              callbacks.showToast("Máy chủ AI quá tải. Đã dừng tự động điền sổ tay!", "error");
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
        // [V1.13] Xử lý Delay: Ngủ đông dài (nếu có bão) hoặc Delay ngắn 5s
        if (customDelayMs > 0) {
          await smartQueueDelay(customDelayMs);
        } else if (shouldDelay) {
          await smartQueueDelay(5000);
        }
      }
    }
    isAiQueueProcessing.current = false;
  };

  // ==================================================================================
  // 4. LOGIC ENRICH CARD (Làm giàu thẻ học hiện tại)
  // ==================================================================================
  // Xử lý tham số đầu vào linh hoạt (index, card object, hoặc Event)
  const handleAiEnrichCard = async (indexOrCardOrEvent, silent = false) => {
    if (!apiKey) { if (!silent) callbacks.showToast("Chưa có API Key!", "error"); return false; }
    
    // Tự động nhận diện mảng dữ liệu đang Active (State Targeting)
    const state = latestStateRef.current;
    let activeArr = state.cards;
    if (state.isStudyingNotebook) activeArr = state.notebook;
    else if (state.studySourceName === 'mastered') activeArr = state.mastered;
    else if (state.studySourceName === 'incorrect') activeArr = state.incorrectList;
    
    let cardTerm = null;
    if (typeof indexOrCardOrEvent === 'number') {
      cardTerm = activeArr[indexOrCardOrEvent]?.term;
    } else if (indexOrCardOrEvent && typeof indexOrCardOrEvent === 'object' && indexOrCardOrEvent.term) {
      cardTerm = indexOrCardOrEvent.term;
    } else {
      const idx = state.currentCardIndex;
      cardTerm = activeArr[idx]?.term;
    }
    
    if (!cardTerm) {
      if (!silent) callbacks.showToast("Không xác định được từ vựng!", "error");
      return false;
    }
    
    if (processingCardsRef.current.has(cardTerm)) {
      if (!silent) callbacks.showToast("Đang xử lý từ này...", "info");
      return false;
    }
    
    processingCardsRef.current.add(cardTerm);
    if (!silent) setIsAiLoading(true);
    
    try {
      const currentCard = activeArr.find(c => c.term === cardTerm);
      
      // Lưới lọc thông minh nhận diện ngữ cảnh bằng dataMode
      const isSentence = core.dataMode === 'sentence';
      const requiredFields = ['pronunciation', 'definition', 'partOfSpeech', 'topic', 'example', 'image'];
      if (isSentence) {
        requiredFields.push('grammar_type');
      } else if (core.lang === 'zh') {
        requiredFields.push('sinoViet');
      }
      
      const missingFields = requiredFields.filter(f => {
        if (f === 'grammar_type') {
          const val = currentCard?.[f];
          return !val || (Array.isArray(val) && val.length === 0) || (typeof val === 'string' && val.trim() === '');
        }
        return !currentCard?.[f] || (f === 'image' && !currentCard[f].startsWith('http'));
      });
      
      // Trả về false nếu không gọi API, giúp quá trình chạy ngầm quét 0ms
      if (!silent && !missingFields.length) { callbacks.showToast("Thẻ đã đầy đủ!", "success"); return false; }
      if (silent && !missingFields.length) return false;
      
      // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
      const levelContext = getDirectLevelContext(core.lang);
      
      // Truyền core.dataMode và levelContext xuống tầng Lõi API
      const enriched = await Utils.fillCardWithAi(cardTerm, core.lang, apiKey, missingFields, core.dataMode, levelContext);
      
      if (missingFields.includes('image') && (!enriched.image || !enriched.image.startsWith('http'))) {
        const q = (currentCard?.image && currentCard.image.trim()) || cardTerm;
        enriched.image = `https://tse4.mm.bing.net/th?q=${encodeURIComponent(q)}&w=300&h=300&c=7&rs=1&p=0`;
      }
      
      // ĐỒNG BỘ XUYÊN MẢNG (CROSS-ARRAY SYNCHRONIZATION)
      const enrichedData = { ...enriched, ai_explanation: enriched.example || currentCard?.example || "Enriched", is_enriched: true };
      
      const updateFn = (prev, dbKey = null, storageKey = null) => {
        const idx = prev.findIndex(c => c.term === cardTerm);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...enrichedData };
        if (dbKey && FcDB) FcDB.set(dbKey, next);
        else if (storageKey) Utils.safeLocalStorageSet(storageKey, next);
        return next;
      };
      
      // Phân tán bản cập nhật tới tất cả các chiều không gian dữ liệu cục bộ
      setCards(prev => updateFn(prev, null, CONFIG_SAMPLES?.[core.lang]?.dataKey || `fc_data_${core.lang}`));
      setNotebook(prev => updateFn(prev, null, CONFIG_SAMPLES?.[core.lang]?.noteKey || `fc_notebook_${core.lang}`));
      if (core.setMastered) core.setMastered(prev => updateFn(prev, `fc_mastered_${core.lang}`, null));
      if (core.setIncorrectList) core.setIncorrectList(prev => updateFn(prev, (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + core.lang, null));
      
      // CẬP NHẬT THẲNG VÀO KHO LÕI MASTER DATA (Ngăn Vòi nước rửa trôi)
      const masterDataKey = `fc_master_data_${core.lang}_${core.dataMode}`;
      const masterData = Utils.safeJsonParse(masterDataKey, null);
      if (masterData) {
        let updatedMaster = false;
        Object.keys(masterData).forEach(levelKey => {
          if (Array.isArray(masterData[levelKey])) {
            const mIdx = masterData[levelKey].findIndex(c => c.term === cardTerm);
            if (mIdx !== -1) {
              masterData[levelKey][mIdx] = { ...masterData[levelKey][mIdx], ...enrichedData };
              updatedMaster = true;
            }
          }
        });
        if (updatedMaster) {
          Utils.safeLocalStorageSet(masterDataKey, masterData);
        }
      }
      
      if (enriched._tokenUsage) {
        const newTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10) + (enriched._tokenUsage.totalTokenCount || 0);
        setTotalTokens(newTotal); localStorage.setItem('fc_total_tokens', newTotal);
      }
      if (!silent) callbacks.showToast("Đã bổ sung thông tin cơ bản!", "success");
      return true; // Trả về true báo hiệu API đã bị hit
    } catch (e) {
      if (!silent) callbacks.showToast("Lỗi AI: " + e.message, "error");
      throw e; // Bắt buộc ném lỗi ra ngoài để processEnrichQueue có thể đếm và bắt lỗi Global Pause
    } finally {
      processingCardsRef.current.delete(cardTerm);
      if (!silent) setIsAiLoading(false);
    }
  };

  const handleExplainGrammar = async (index) => {
    if (!apiKey) { callbacks.showToast("Cần API Key!", "warning"); return; }
    
    // Tự động nhận diện mảng dữ liệu đang Active thay vì hardcode thẻ Cards
    const state = latestStateRef.current;
    let activeArr = state.cards;
    if (state.isStudyingNotebook) activeArr = state.notebook;
    else if (state.studySourceName === 'mastered') activeArr = state.mastered;
    else if (state.studySourceName === 'incorrect') activeArr = state.incorrectList;
    
    const targetIdx = typeof index === 'number' ? index : state.currentCardIndex;
    const cardTerm = activeArr[targetIdx]?.term;
    if (!cardTerm) return;
    
    setIsAiLoading(true);
    try {
      // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
      const levelContext = getDirectLevelContext(core.lang);
      
      // Truyền core.dataMode và levelContext xuống tầng Lõi API
      const result = await Utils.fillCardWithAi(cardTerm, core.lang, apiKey, ['analysis'], core.dataMode, levelContext);
      
      if (result?.analysis) {
        // ĐỒNG BỘ XUYÊN MẢNG (CROSS-ARRAY SYNCHRONIZATION)
        const newData = { analysis: result.analysis };
        
        const updateFn = (prev, dbKey = null, storageKey = null) => {
          const idx = prev.findIndex(c => c.term === cardTerm);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], ...newData };
          if (dbKey && FcDB) FcDB.set(dbKey, next);
          else if (storageKey) Utils.safeLocalStorageSet(storageKey, next);
          return next;
        };
        
        // Phân tán bản cập nhật tới tất cả các kho
        setCards(prev => updateFn(prev, null, CONFIG_SAMPLES?.[core.lang]?.dataKey || `fc_data_${core.lang}`));
        setNotebook(prev => updateFn(prev, null, CONFIG_SAMPLES?.[core.lang]?.noteKey || `fc_notebook_${core.lang}`));
        if (core.setMastered) core.setMastered(prev => updateFn(prev, `fc_mastered_${core.lang}`, null));
        if (core.setIncorrectList) core.setIncorrectList(prev => updateFn(prev, (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + core.lang, null));
        
        // CẬP NHẬT THẲNG VÀO KHO LÕI MASTER DATA (Ngăn Vòi nước rửa trôi)
        const masterDataKey = `fc_master_data_${core.lang}_${core.dataMode}`;
        const masterData = Utils.safeJsonParse(masterDataKey, null);
        if (masterData) {
          let updatedMaster = false;
          Object.keys(masterData).forEach(levelKey => {
            if (Array.isArray(masterData[levelKey])) {
              const mIdx = masterData[levelKey].findIndex(c => c.term === cardTerm);
              if (mIdx !== -1) {
                masterData[levelKey][mIdx] = { ...masterData[levelKey][mIdx], ...newData };
                updatedMaster = true;
              }
            }
          });
          if (updatedMaster) {
            Utils.safeLocalStorageSet(masterDataKey, masterData);
          }
        }
        
        if (result._tokenUsage) {
          const newTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10) + (result._tokenUsage.totalTokenCount || 0);
          setTotalTokens(newTotal); localStorage.setItem('fc_total_tokens', newTotal);
        }
        callbacks.showToast("Phân tích xong!", "success");
      }
    } catch (e) { callbacks.showToast("Lỗi AI: " + e.message, "error"); }
    finally { setIsAiLoading(false); }
  };

  const handleManualAiFill = async (term) => {
    if (!apiKey) { callbacks.showToast("Cần API Key!", "warning"); return; }
    setIsAiLoading(true);
    try {
      // [V1.23 - DIRECT INJECTION] Đọc trực tiếp từ kho lưu trữ vật lý, bỏ qua State của React
      const levelContext = getDirectLevelContext(core.lang);
      
      // Truyền core.dataMode và levelContext xuống tầng Lõi API
      return await Utils.fillCardWithAi(term, core.lang, apiKey, null, core.dataMode, levelContext);
    }
    catch (e) { callbacks.showToast(e.message, "error"); return null; }
    finally { setIsAiLoading(false); }
  };

  // ==================================================================================
  // 5. ĐỘNG CƠ HÀNG ĐỢI LÀM GIÀU THẺ (ENRICH QUEUE WORKER)
  // ==================================================================================
  const processEnrichQueue = async () => {
    if (isProcessingEnrichQueue.current) return;
    isProcessingEnrichQueue.current = true;
    
    let consecutiveFailures = 0;
    while (enrichQueueRef.current.length > 0) {
      const termToEnrich = enrichQueueRef.current[0];
      let shouldDelay = false;
      let shouldShift = true; // [V1.13] Cờ quyết định vứt bỏ từ vựng
      let customDelayMs = 0;  // [V1.13] Thời gian ngủ đông đặc biệt
      
      try {
        // Tái sử dụng hàm handleAiEnrichCard với tham số silent=true để xử lý ngầm
        // Nhận cờ boolean để biết API có thực sự bị gọi hay không
        const apiHit = await handleAiEnrichCard({ term: termToEnrich }, true);
        shouldDelay = apiHit;
        consecutiveFailures = 0; // Reset bộ đếm nếu chạy êm ái
      } catch (e) {
        // [V1.13] Xử lý lỗi Cầu dao Toàn cục (Global Pause)
        if (e.message && e.message.includes('GLOBAL_PAUSE')) {
          shouldShift = false; // Ôm chặt từ vựng, không vứt đi
          customDelayMs = 15500; // Ngủ đông 15.5 giây chờ Cầu dao mở lại
          console.warn(`[Enrich Queue] Tạm nghỉ 15s để né bão 429... Giữ lại từ vựng: ${termToEnrich}`);
        } else {
          shouldDelay = true; // Nếu lỗi xảy ra tức là API đã bị hit và bị từ chối
          console.warn(`Background enrich error for ${termToEnrich}:`, e);
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            if (callbacks && callbacks.showToast) {
              callbacks.showToast("Máy chủ AI quá tải. Tiến trình Làm giàu thẻ tự động đã bị dừng!", "error");
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
        
        // [V1.13] Khóa cứng luồng bằng customDelay (15.5s) HOẶC delay thường (5s)
        if (customDelayMs > 0) {
          await smartQueueDelay(customDelayMs);
        } else if (shouldDelay) {
          await smartQueueDelay(5000);
        }
      }
    }
    isProcessingEnrichQueue.current = false;
  };

  // Effect: Batch Enrich (Chạy Tuần Tự)
  useEffect(() => {
    if (core.viewMode === 'learn' && core.isAiModeLearn && core.cards.length > 0 && apiKey) {
      // Đảm bảo Controller luôn sẵn sàng cho luồng chạy
      if (!window.__currentGameAbortController || window.__currentGameAbortController.signal.aborted) {
        window.__currentGameAbortController = new AbortController();
      }
      
      const currentTerm = core.cards[core.currentCardIndex]?.term;
      if (!currentTerm) return;
      
      const nextTerms = [];
      nextTerms.push(currentTerm); // Ưu tiên thẻ hiện tại
      
      // Nạp thêm 2 thẻ kế tiếp
      for (let i = 1; i <= 2; i++) {
        const nextIdx = (core.currentCardIndex + i) % core.cards.length;
        const nextTerm = core.cards[nextIdx]?.term;
        if (nextTerm && !nextTerms.includes(nextTerm)) {
          nextTerms.push(nextTerm);
        }
      }
      
      // Đẩy vào hàng đợi (Loại bỏ các từ đã có sẵn trong queue)
      nextTerms.forEach(term => {
        if (!enrichQueueRef.current.includes(term)) {
          enrichQueueRef.current.push(term);
        }
      });
      
      // Kích hoạt động cơ
      processEnrichQueue();
    } else {
      // Dọn dẹp hàng đợi nếu tắt tính năng hoặc thoát màn hình
      enrichQueueRef.current = [];
      // Kích hoạt Kill Switch: Chém đứt mọi tiến trình đang bay trên mạng
      if (window.__currentGameAbortController) {
        window.__currentGameAbortController.abort("User toggled off AI");
        window.__currentGameAbortController = new AbortController();
      }
    }
  }, [core.currentCardIndex, core.isAiModeLearn, core.viewMode, apiKey]);

  return {
    runAutoPlay,
    processAiQueue,
    handleAiEnrichCard,
    handleExplainGrammar,
    handleManualAiFill
  };
};