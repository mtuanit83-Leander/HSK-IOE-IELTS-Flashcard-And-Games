// ============================================================================
// FILE 82/85: src/hooks/useAppLogic.js
// NGUỒN GỐC: Tầng 6 - Block 6.4 (Main Controller - Version 1.09)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 21/11/2026 - 10:09 (GMT+7)
// NHIỆM VỤ: "Switchboard" điều phối toàn cục. Hợp nhất AI Logic (6.2),
//           Data I/O (6.3), Study Progress (6.5), AI Curator (6.6),
//           Mock Test Logic (6.7) và Exam Pool Logic (6.8).
//           Nâng cấp Ver 1.1 theo Phác đồ 6 Hạng mục (DanhGiaCode.md):
//           1. Đồng bộ khóa phiên mySessionId === speakSessionIdRef.current
//              cho safeOnEnd() ở cả u.onend, u.onerror và catch (0% zombie).
//           2. Tự động dừng Auto-Play & TTS khi chuyển ngữ cảnh (handleReviewWithGame,
//              handleExitStudyMode, tắt Shuffle và chuyển tab rời Learn qua BottomNav).
//           3. Chặn lặp phím (e.repeat) cho phím công tắc (gọi e.preventDefault()
//              trước e.repeat với Space để chống cuộn trang khi giữ phím).
//           4. Bọc try/catch đầy đủ cho toggleBatterySaver (WakeLock an toàn).
//           5. Nâng cấp extractRetryKey & removeFromRetryBag theo từng gameType
//              khớp 1:1 Validator của db.js (listening, reading, fillblank, oddoneout).
//           6. Thay cờ đơn bằng pendingRetryPersistMapRef (Map<lang, bag>) chống
//              race condition ghi đè chéo phân vùng ngôn ngữ trên IndexedDB.
// ============================================================================


import { useRef, useEffect, useCallback, useMemo } from 'react';
import { UI_TEXT } from '@/config/i18n';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { useAiLogic } from './useAiLogic';
import { useDataIO } from './useDataIO';
import { useStudyProgress } from './useStudyProgress';
import { useAiCurator } from './useAiCurator';
import { useExamLogic } from './useExamLogic';
import { useExamPoolLogic } from './useExamPoolLogic';


// ============================================================================
// MODULE HELPERS: CHUẨN HÓA UNICODE NFC & BỘ KHÓA TÚI NHÁP 10/10 MINI-GAMES
// ============================================================================
const HANZI_REGEX = /[\u4e00-\u9fff]/;


const SPECIALIZED_RETRY_GAMES = new Set([
  'oddoneout',
  'fillblank',
  'spotmistake',
  'listening',
  'reading'
]);


const normalizeKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};


const normalizeWordSignature = (words) => {
  if (!Array.isArray(words)) return '';
  return words.map((w) => normalizeKey(w)).join('|');
};


const pickFirstNonEmptyString = (candidates) => {
  for (const val of candidates) {
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
};


// Trích xuất khóa định danh chính theo từng gameType — khớp 1:1 với db.js
const extractRetryKey = (item, gameType = '') => {
  if (!item || typeof item !== 'object') return '';


  switch (gameType) {
    case 'listening':
      return pickFirstNonEmptyString([
        item.audioScript,
        item.questionText,
        item.term,
        item.origin?.term,
        item.question?.term
      ]);
    case 'reading': {
      const qText =
        typeof item.questionText === 'string' ? item.questionText.trim() : '';
      const pCtx =
        typeof item.passageContext === 'string'
          ? item.passageContext.trim()
          : '';
      if (qText && pCtx) return `${qText}::${pCtx}`;
      return pickFirstNonEmptyString([
        qText,
        pCtx,
        item.term,
        item.origin?.term,
        item.question?.term
      ]);
    }
    case 'fillblank':
      return pickFirstNonEmptyString([
        item.displaySentence,
        item.targetWord,
        item.term,
        item.origin?.term,
        item.question?.term
      ]);
    case 'spotmistake':
      return pickFirstNonEmptyString([
        item.wrongSentence,
        item.term,
        item.origin?.term,
        item.question?.term
      ]);
    case 'oddoneout':
      return pickFirstNonEmptyString([
        item.oddWord,
        item.term,
        item.origin?.term,
        item.question?.term
      ]);
    default:
      return pickFirstNonEmptyString([
        item.term,
        item.origin?.term,
        item.question?.term,
        item.displaySentence,
        item.wrongSentence,
        item.oddWord,
        item.audioScript,
        item.questionText
      ]);
  }
};


// Lấy tập toàn bộ khóa ứng viên chuẩn hóa NFC để removeFromRetryBag không bao giờ lệch khóa
const getRetryCandidateKeys = (item, gameType = '') => {
  if (!item || typeof item !== 'object') return [];
  const rawList = [
    extractRetryKey(item, gameType),
    item.term,
    item.origin?.term,
    item.question?.term,
    item.displaySentence,
    item.targetWord,
    item.wrongSentence,
    item.oddWord,
    item.audioScript,
    item.questionText,
    item.passageContext
  ];
  const keySet = new Set();
  for (const val of rawList) {
    const k = normalizeKey(val);
    if (k) keySet.add(k);
  }
  return Array.from(keySet);
};


// Tự động đẩy (hoist) top-level term & definition để tương thích 100% Validator dòng 41 của db.js
const normalizeRetryItem = (gameType, questionData) => {
  const cloned = { ...questionData };
  const nestedOrigin =
    cloned.origin && typeof cloned.origin === 'object' ? cloned.origin : null;
  const nestedQuestion =
    cloned.question && typeof cloned.question === 'object' ? cloned.question : null;


  if (!SPECIALIZED_RETRY_GAMES.has(gameType)) {
    const rawTerm =
      cloned.term ||
      nestedQuestion?.term ||
      nestedOrigin?.term ||
      cloned.displaySentence ||
      '';
    const rawDef =
      cloned.definition ||
      nestedQuestion?.definition ||
      nestedOrigin?.definition ||
      cloned.meaning ||
      nestedQuestion?.meaning ||
      nestedOrigin?.meaning ||
      '';


    if (typeof rawTerm === 'string' && rawTerm.trim()) {
      cloned.term = rawTerm.trim();
    }
    if (typeof rawDef === 'string' && rawDef.trim()) {
      cloned.definition = rawDef.trim();
    } else if (cloned.term) {
      // Bảo vệ trường hợp thẻ khuyết nghĩa không bị db.js từ chối rút ra câm lặng
      cloned.definition = cloned.term;
    }
  }


  return cloned;
};


// ============================================================================
// [AUDIO WAKE LOCK] KHIÊN SƯỞI ẤM ÂM THANH LIÊN TỤC (15s WAV LOOP)
// ============================================================================
const createTingAudio = () => {
  if (typeof window !== 'undefined' && window.fc_tingAudio) {
    return window.fc_tingAudio;
  }
  try {
    const sampleRate = 44100;
    const duration = 15.0; // 15 giây
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);


    const writeString = (dataView, offset, string) => {
      for (let i = 0; i < string.length; i++) {
        dataView.setUint8(offset + i, string.charCodeAt(i));
      }
    };


    // Viết Header chuẩn cho file .WAV
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true); // Format 1
    view.setUint16(22, 1, true); // 1 Channel (Mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16 bit
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);


    // Tạo sóng Sine 10Hz với âm lượng không đổi 5% (không fade-out)
    for (let i = 0; i < numSamples; i++) {
      const timeSec = i / sampleRate;
      const amplitude = 32767 * 0.05;
      const sample = amplitude * Math.sin(2 * Math.PI * 10 * timeSec);
      view.setInt16(44 + i * 2, sample, true);
    }


    const blob = new Blob([buffer], { type: 'audio/wav' });
    const audio = new Audio(URL.createObjectURL(blob));
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.preload = 'auto';
    audio.loop = true; // Lặp vô tận tạo lớp Khiên bền vững
    if (typeof window !== 'undefined') {
      window.fc_tingAudio = audio;
    }
    return audio;
  } catch (e) {
    console.warn('WAV Gen Error:', e);
    return null;
  }
};


const playTing = () => {
  try {
    const audio = createTingAudio();
    if (audio) {
      // Hủy đồng hồ hẹn giờ tắt khiên (nếu có)
      if (typeof window !== 'undefined' && window.fc_tingAudioTimeout) {
        clearTimeout(window.fc_tingAudioTimeout);
        window.fc_tingAudioTimeout = null;
      }
      // Chỉ gọi play() nếu luồng đang ngủ. Nếu đang mở thì tái sử dụng!
      if (audio.paused) {
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            /* Bỏ qua lỗi Auto-play của trình duyệt */
          });
        }
      }
    }
  } catch (e) {
    console.warn('Play Ting Error:', e);
  }
};


// Hàm đóng khiên an toàn bằng kỹ thuật Debounce 3.5 giây
const releaseShieldDebounced = () => {
  if (typeof window === 'undefined') return;
  if (window.fc_tingAudioTimeout) clearTimeout(window.fc_tingAudioTimeout);
  window.fc_tingAudioTimeout = setTimeout(() => {
    window.fc_tingAudioTimeout = null;
    if (window.fc_tingAudio) window.fc_tingAudio.pause();
  }, 3500);
};


// Cắt khiên tức thời (dùng khi người dùng chủ động bấm Dừng / Mute / Unmount)
const stopShieldImmediately = () => {
  if (typeof window === 'undefined') return;
  if (window.fc_tingAudioTimeout) {
    clearTimeout(window.fc_tingAudioTimeout);
    window.fc_tingAudioTimeout = null;
  }
  if (window.fc_tingAudio) {
    try {
      window.fc_tingAudio.pause();
    } catch {
      // Bỏ qua an toàn
    }
  }
};


// ============================================================================
// MAIN HOOK: useAppLogic
// ============================================================================
export const useAppLogic = (core) => {
  // 1. LẤY CORE STATE & STABLE SETTERS
  const {
    viewMode,
    lang,
    uiLang,
    cards,
    notebook,
    apiKey,
    currentCardIndex,
    isFlipped,
    isAutoPlaying,
    isShuffle,
    isAutoMode,
    isFlipLocked,
    settings,
    voices,
    globalRetryBag,
    aiHarvestPool,
    isDbReady,
    // Setters ổn định từ useState (không bao giờ đổi tham chiếu khi re-render)
    setToast,
    setIsFlipped,
    setIsContentHidden,
    setCards,
    setCurrentCardIndex,
    setIsAutoPlaying,
    setIsAutoMode,
    setIsBatterySaverMode,
    setIsMuted,
    setIsShuffle,
    setGlobalRetryBag,
    setIncorrectList,
    setShowIncorrectModal,
    setIsStudyingNotebook,
    setShowNotebook,
    setStudySourceName,
    setViewMode,
    setShowHelp,
    setWordSelectTarget,
    setShowHanziSelector,
    setCurrentHanziChar,
    setShowHanziWriter,
    setIsFlipLocked,
    setShowSettings,
    setShowAiConfigModal,
    setShowApiKeyModal,
    setShowWordSelect,
    setShowSaveLoadModal,
    setShowExamPoolManager,
    setIsGamePlaying,
    // Refs ổn định
    audioTimeoutRef,
    autoPlayTimeoutRef
  } = core;


  // Derived State
  const mainColor = lang === 'zh' ? 'red' : 'sky';
  const isCurrentCardInNotebookDerived = useMemo(() => {
    const currentTermKey = normalizeKey(cards?.[currentCardIndex]?.term);
    if (!currentTermKey || !Array.isArray(notebook)) return false;
    return notebook.some((n) => normalizeKey(n?.term) === currentTermKey);
  }, [cards, currentCardIndex, notebook]);


  // Ref nội bộ quản lý phiên đọc đơn điệu, dừng chủ động, timer điều hướng & hàng đợi ghi Túi Nháp
  const speakSessionIdRef = useRef(0);
  const explicitStopRef = useRef(false);
  const navTimeoutsRef = useRef(new Set());
  const pendingRetryPersistMapRef = useRef(new Map());
  const prevViewModeRef = useRef(viewMode);


  // Theo dõi trạng thái mở Modal qua Ref để không phải gỡ/gắn lại keydown listener liên tục
  const isAnyModalOpenRef = useRef(false);
  isAnyModalOpenRef.current = Boolean(
    core.showSettings ||
      core.showApiKeyModal ||
      core.showNotebook ||
      core.showManual ||
      core.showLinkManager ||
      core.showWordSelect ||
      core.showMastered ||
      core.showIncorrectModal ||
      core.showHelp ||
      core.showHanziSelector ||
      core.showHanziWriter ||
      core.showSaveLoadModal ||
      core.showAiChat ||
      core.showExamPoolManager ||
      core.showAiConfigModal
  );


  // [VÁ LỖI ĐỨT CÁP THU HOẠCH] Proxy Pattern truyền hàm thu hoạch vào useExamLogic
  const handleAutoHarvestToPoolRef = useRef(null);
  const harvestProxy = useCallback(
    (item, targetLang, level, topic, typeToHarvest) => {
      if (handleAutoHarvestToPoolRef.current) {
        handleAutoHarvestToPoolRef.current(
          item,
          targetLang,
          level,
          topic,
          typeToHarvest
        );
      }
    },
    []
  );


  // [MOCK TEST ERA] Khởi tạo ExamLogic tại cấp cao nhất để giữ State khi chuyển Tab
  const examLogic = useExamLogic(apiKey, harvestProxy);


  // Ref Isolation Pattern: Phong ấn State để dùng trong các hàm Async (Đồng bộ tức thời 0ms)
  const latestStateRef = useRef({
    cards,
    currentCardIndex,
    isFlipped,
    settings,
    isAutoPlaying,
    isFlipLocked,
    isAutoMode,
    notebook,
    incorrectList: core.incorrectList,
    mastered: core.mastered,
    isStudyingNotebook: core.isStudyingNotebook,
    studySourceName: core.studySourceName,
    isMuted: core.isMuted,
    isShuffle,
    isBatterySaverMode: core.isBatterySaverMode,
    aiHarvestPool,
    globalRetryBag,
    isDbReady,
    lang
  });


  latestStateRef.current = {
    cards,
    currentCardIndex,
    isFlipped,
    settings,
    isAutoPlaying,
    isFlipLocked,
    isAutoMode,
    notebook,
    incorrectList: core.incorrectList,
    mastered: core.mastered,
    isStudyingNotebook: core.isStudyingNotebook,
    studySourceName: core.studySourceName,
    isMuted: core.isMuted,
    isShuffle,
    isBatterySaverMode: core.isBatterySaverMode,
    aiHarvestPool,
    globalRetryBag,
    isDbReady,
    lang
  };


  // Helper quản lý bộ hẹn giờ điều hướng thẻ 150ms (chống rò rỉ & stale snapshot)
  const clearPendingNavTimeouts = useCallback(() => {
    navTimeoutsRef.current.forEach((id) => clearTimeout(id));
    navTimeoutsRef.current.clear();
  }, []);


  const scheduleNavTimeout = useCallback((fn, delay = 150) => {
    const id = setTimeout(() => {
      navTimeoutsRef.current.delete(id);
      fn();
    }, delay);
    navTimeoutsRef.current.add(id);
    return id;
  }, []);


  // ==========================================================================
  // 2. UTILITY FUNCTIONS (t, showToast, getCardStyle, speak, stopSpeaking)
  // ==========================================================================
  const t = useCallback(
    (key, params = {}) => {
      const textDict =
        UI_TEXT || (typeof window !== 'undefined' ? window.UI_TEXT : null);
      if (!textDict) return key;
      const dict = textDict[uiLang] || textDict.en || {};
      let text = dict[key] || key;
      if (typeof text === 'string' && params && typeof params === 'object') {
        Object.keys(params).forEach((p) => {
          text = text.split(`{${p}}`).join(String(params[p] ?? ''));
        });
      }
      return text;
    },
    [uiLang]
  );


  // Chuẩn hóa Toast: luôn đảm bảo `text` là String thuần (diệt 100% bẫy Object crash React)
  const showToast = useCallback(
    (message, type = 'success') => {
      let normalizedText = 'Thông báo';
      let normalizedType = typeof type === 'string' && type.trim() ? type : 'success';


      if (typeof message === 'string') {
        normalizedText = message;
      } else if (message && typeof message === 'object') {
        normalizedText = String(message.text ?? message.message ?? 'Thông báo');
        if (typeof message.type === 'string' && message.type.trim()) {
          normalizedType = message.type;
        }
      } else if (message !== null && message !== undefined) {
        normalizedText = String(message);
      }


      setToast({ text: normalizedText, type: normalizedType, id: Date.now() });
    },
    [setToast]
  );


  const getCardStyle = useCallback(
    (isBack = false) => {
      const fallbackSize = isBack ? 1.25 : 3;
      const rawSize = Number(
        isBack ? settings?.backFontSize : settings?.fontSize
      );
      // Chốt chặn an toàn chống NaN, số âm hoặc cỡ chữ lệch 26rem/36rem
      const size =
        Number.isFinite(rawSize) && rawSize > 0 && rawSize <= 10
          ? rawSize
          : fallbackSize;


      const style = {
        fontSize: `${size}rem`,
        fontWeight: settings?.fontWeight || 'bold'
      };
      switch (settings?.fontFamily) {
        case 'serif':
          style.fontFamily = '"Noto Serif SC", serif';
          break;
        case 'kaiti':
          style.fontFamily =
            '"KaiTi", "STKaiti", "楷体", "LXGW WenKai Lite", serif';
          break;
        case 'callig':
          style.fontFamily = '"Long Cang", cursive';
          break;
        default:
          style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
      }
      return style;
    },
    [settings]
  );


  // Đại phẫu speak(): chốt chặn safeRate/safePitch, smart overload callback & khóa phiên đơn điệu
  const speak = useCallback(
    (text, rate = null, voice = null, onEnd = null) => {
      // Tương thích ngược thông minh: nếu bất kỳ Mini-Game nào truyền nhầm callback vào vị trí 2/3
      let resolvedRate = rate;
      let resolvedVoice = voice;
      let resolvedOnEnd = onEnd;


      if (typeof resolvedRate === 'function') {
        resolvedOnEnd = resolvedRate;
        resolvedRate = null;
        resolvedVoice = null;
      } else if (typeof resolvedVoice === 'function') {
        resolvedOnEnd = resolvedVoice;
        resolvedVoice = null;
      }


      let ended = false;
      const safeOnEnd = () => {
        if (ended) return;
        ended = true;
        if (typeof resolvedOnEnd === 'function') {
          try {
            resolvedOnEnd();
          } catch (err) {
            console.warn('[useAppLogic] speak onEnd error:', err);
          }
        }
      };


      explicitStopRef.current = false;
      const mySessionId = ++speakSessionIdRef.current;


      if (audioTimeoutRef?.current) {
        clearTimeout(audioTimeoutRef.current);
        audioTimeoutRef.current = null;
      }


      const cleanText =
        typeof text === 'string'
          ? text.trim()
          : typeof text === 'number' && Number.isFinite(text)
          ? String(text)
          : '';


      if (!cleanText) {
        safeOnEnd();
        return;
      }


      if (latestStateRef.current.isMuted) {
        const simulatedDuration = 1200 + cleanText.length * 80;
        const onSimDone = () => {
          if (audioTimeoutRef) audioTimeoutRef.current = null;
          if (!explicitStopRef.current && mySessionId === speakSessionIdRef.current) {
            safeOnEnd();
          }
        };
        if (audioTimeoutRef) {
          audioTimeoutRef.current = setTimeout(onSimDone, simulatedDuration);
        } else {
          setTimeout(onSimDone, simulatedDuration);
        }
        return;
      }


      if (typeof window === 'undefined' || !window.speechSynthesis) {
        safeOnEnd();
        return;
      }


      // Kích hoạt "Khiên Sưởi Ấm Liên Tục" trước khi đọc TTS
      playTing();
      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      } catch {
        // Bỏ qua an toàn
      }


      const createAndSpeak = () => {
        if (audioTimeoutRef) audioTimeoutRef.current = null;
        if (explicitStopRef.current || mySessionId !== speakSessionIdRef.current) {
          return;
        }


        const currentSettings = latestStateRef.current.settings || {};
        const defaultRate =
          typeof currentSettings.rate === 'number' &&
          Number.isFinite(currentSettings.rate) &&
          currentSettings.rate >= 0.3 &&
          currentSettings.rate <= 2.5
            ? currentSettings.rate
            : 0.9;


        const safeRate =
          typeof resolvedRate === 'number' &&
          Number.isFinite(resolvedRate) &&
          resolvedRate >= 0.3 &&
          resolvedRate <= 2.5
            ? resolvedRate
            : defaultRate;


        const safePitch =
          typeof currentSettings.pitch === 'number' &&
          Number.isFinite(currentSettings.pitch) &&
          currentSettings.pitch >= 0.5 &&
          currentSettings.pitch <= 2.0
            ? currentSettings.pitch
            : 1;


        const u = new SpeechSynthesisUtterance(cleanText);
        window.fc_currentUtterance = u;


        const detectedLang = HANZI_REGEX.test(cleanText) ? 'zh-CN' : 'en-US';
        u.lang = detectedLang;


        const availableVoices =
          Array.isArray(voices) && voices.length > 0
            ? voices
            : typeof window.speechSynthesis.getVoices === 'function'
            ? window.speechSynthesis.getVoices() || []
            : [];


        let v =
          resolvedVoice &&
          typeof resolvedVoice === 'object' &&
          typeof resolvedVoice.lang === 'string'
            ? resolvedVoice
            : null;


        if (!v && availableVoices.length > 0) {
          const langPrefix = detectedLang.split('-')[0];
          if (currentSettings.selectedVoice) {
            const pref = availableVoices.find(
              (vo) => vo && vo.name === currentSettings.selectedVoice
            );
            if (pref && typeof pref.lang === 'string' && pref.lang.startsWith(langPrefix)) {
              v = pref;
            }
          }
          if (!v) {
            v =
              availableVoices.find((x) => x && x.lang === detectedLang) ||
              availableVoices.find(
                (x) => x && typeof x.lang === 'string' && x.lang.startsWith(langPrefix)
              ) ||
              null;
          }
        }


        if (v) u.voice = v;
        u.rate = safeRate;
        u.pitch = safePitch;


        const handleSpeechSettled = () => {
          // Chỉ thu hồi Khiên WAV 15s & bắn callback nếu đây đúng là phiên đọc mới nhất!
          if (mySessionId === speakSessionIdRef.current) {
            window.fc_currentUtterance = null;
            releaseShieldDebounced();
            if (!explicitStopRef.current) {
              safeOnEnd();
            }
          }
        };


        u.onend = handleSpeechSettled;
        u.onerror = handleSpeechSettled;


        try {
          window.speechSynthesis.speak(u);
        } catch (err) {
          console.warn('[useAppLogic] speechSynthesis.speak error:', err);
          handleSpeechSettled();
        }
      };


      if (audioTimeoutRef) {
        audioTimeoutRef.current = setTimeout(createAndSpeak, 300);
      } else {
        setTimeout(createAndSpeak, 300);
      }
    },
    [voices, audioTimeoutRef]
  );


  const stopSpeaking = useCallback(() => {
    explicitStopRef.current = true;
    speakSessionIdRef.current += 1;
    stopShieldImmediately();


    if (typeof window !== 'undefined') {
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      } catch {
        // Bỏ qua an toàn
      }
      window.fc_currentUtterance = null;
    }
    if (audioTimeoutRef?.current) {
      clearTimeout(audioTimeoutRef.current);
      audioTimeoutRef.current = null;
    }
    if (autoPlayTimeoutRef?.current) {
      clearTimeout(autoPlayTimeoutRef.current);
      autoPlayTimeoutRef.current = null;
    }
  }, [audioTimeoutRef, autoPlayTimeoutRef]);


  // Dọn đồng bộ toàn bộ trạng thái Auto-Play / Lật thẻ / TTS của màn hình Học Thẻ
  const resetLearnPlaybackState = useCallback(() => {
    clearPendingNavTimeouts();
    setIsAutoPlaying(false);
    setIsAutoMode(false);
    setIsFlipped(false);
    setIsContentHidden(false);
    stopSpeaking();
  }, [
    clearPendingNavTimeouts,
    setIsAutoMode,
    setIsAutoPlaying,
    setIsContentHidden,
    setIsFlipped,
    stopSpeaking
  ]);


  // Tự động dừng Auto-Play & TTS của màn hình Học Thẻ khi người dùng chuyển tab qua BottomNav
  useEffect(() => {
    if (prevViewModeRef.current === 'learn' && viewMode !== 'learn') {
      resetLearnPlaybackState();
    }
    prevViewModeRef.current = viewMode;
  }, [viewMode, resetLearnPlaybackState]);


  // Cleanup toàn bộ timer & Khiên âm thanh khi unmount
  useEffect(() => {
    return () => {
      clearPendingNavTimeouts();
      stopSpeaking();
    };
  }, [clearPendingNavTimeouts, stopSpeaking]);


  // ==========================================================================
  // 3. NAVIGATION (ĐIỀU HƯỚNG THẺ & PLAYBACK CONTROLS)
  // ==========================================================================
  const handleNext = useCallback(() => {
    clearPendingNavTimeouts();
    setIsFlipped(false);
    setIsContentHidden(false);
    stopSpeaking();


    scheduleNavTimeout(() => {
      const {
        cards: currentCards,
        isShuffle: currentShuffle,
        currentCardIndex: idx
      } = latestStateRef.current;


      if (!Array.isArray(currentCards) || currentCards.length === 0) return;


      if (currentShuffle) {
        if (idx >= currentCards.length - 1) {
          const reshuffled = Utils.shuffleArray([...currentCards]);
          setCards(reshuffled);
          setCurrentCardIndex(0);
          showToast('Đã đi hết 1 vòng! Đang xáo trộn lại bộ bài.', 'info');
        } else {
          setCurrentCardIndex((prev) =>
            Math.min(prev + 1, currentCards.length - 1)
          );
        }
      } else {
        setCurrentCardIndex((prev) => (prev + 1) % currentCards.length);
      }
    }, 150);
  }, [
    clearPendingNavTimeouts,
    scheduleNavTimeout,
    setCards,
    setCurrentCardIndex,
    setIsContentHidden,
    setIsFlipped,
    showToast,
    stopSpeaking
  ]);


  const handlePrev = useCallback(() => {
    clearPendingNavTimeouts();
    setIsFlipped(false);
    setIsContentHidden(false);
    stopSpeaking();


    scheduleNavTimeout(() => {
      const { cards: currentCards } = latestStateRef.current;
      if (!Array.isArray(currentCards) || currentCards.length === 0) return;
      const len = currentCards.length;
      setCurrentCardIndex((prev) => (((prev - 1) % len) + len) % len);
    }, 150);
  }, [
    clearPendingNavTimeouts,
    scheduleNavTimeout,
    setCurrentCardIndex,
    setIsContentHidden,
    setIsFlipped,
    stopSpeaking
  ]);


  const handleJumpToCard = useCallback(
    (inputNumber) => {
      clearPendingNavTimeouts();
      const { cards: currentCards } = latestStateRef.current;
      if (!Array.isArray(currentCards) || currentCards.length === 0) return;
      const targetIndex = parseInt(inputNumber, 10) - 1;
      if (
        !Number.isNaN(targetIndex) &&
        targetIndex >= 0 &&
        targetIndex < currentCards.length
      ) {
        setCurrentCardIndex(targetIndex);
        setIsFlipped(false);
        setIsContentHidden(false);
        stopSpeaking();
      }
    },
    [
      clearPendingNavTimeouts,
      setCurrentCardIndex,
      setIsContentHidden,
      setIsFlipped,
      stopSpeaking
    ]
  );


  const toggleAutoPlay = useCallback(() => {
    if (latestStateRef.current.isAutoPlaying) {
      clearPendingNavTimeouts();
      setIsAutoPlaying(false);
      setIsContentHidden(false);
      stopSpeaking();
    } else {
      // Đánh thức trực tiếp Khiên âm thanh HTML5 trên iOS/Safari ngay trong user gesture
      if (!latestStateRef.current.isMuted) {
        playTing();
      }
      setIsAutoMode(true);
      setIsAutoPlaying(true);
      setIsContentHidden(false);
      showToast('Bắt đầu tự động phát', 'success');
    }
  }, [
    clearPendingNavTimeouts,
    setIsAutoMode,
    setIsAutoPlaying,
    setIsContentHidden,
    showToast,
    stopSpeaking
  ]);


  const handleStopAutoPlay = useCallback(() => {
    resetLearnPlaybackState();
    setCurrentCardIndex(0);
    showToast('Đã dừng và quay về đầu!', 'info');
  }, [resetLearnPlaybackState, setCurrentCardIndex, showToast]);


  const toggleBatterySaver = useCallback(async () => {
    try {
      if (!latestStateRef.current.isBatterySaverMode) {
        await Utils.requestWakeLock();
        setIsBatterySaverMode(true);
        showToast('Đã bật Chế độ Rảnh tay (Màn hình luôn sáng)', 'success');
      } else {
        await Utils.releaseWakeLock();
        setIsBatterySaverMode(false);
      }
    } catch (err) {
      console.warn('[useAppLogic] WakeLock error:', err);
      showToast(
        'Trình duyệt không hỗ trợ hoặc từ chối giữ sáng màn hình',
        'warning'
      );
    }
  }, [setIsBatterySaverMode, showToast]);


  // Loại bỏ 100% side-effect khỏi React state updater & cắt Khiên âm thanh đầy đủ khi Mute
  const handleToggleMute = useCallback(() => {
    const newState = !latestStateRef.current.isMuted;
    setIsMuted(newState);
    if (newState) {
      stopSpeaking();
    }
    showToast(
      newState ? 'Đã tắt tiếng (Giả lập thời gian đọc)' : 'Đã bật tiếng',
      'info'
    );
  }, [setIsMuted, showToast, stopSpeaking]);


  // Tham chiếu ổn định vĩnh viễn (đọc từ latestStateRef chống re-bind keydown)
  const handleToggleShuffle = useCallback(() => {
    const s = latestStateRef.current;
    const nextState = !s.isShuffle;
    setIsShuffle(nextState);


    if (nextState) {
      showToast('Đã bật trộn bài', 'info');
    } else {
      resetLearnPlaybackState();
      let originalData = [];
      if (s.studySourceName && s.studySourceName.includes('Sổ tay cần nhớ')) {
        originalData = Array.isArray(s.incorrectList) ? s.incorrectList : [];
      } else if (
        (s.studySourceName && s.studySourceName.includes('Sổ tay từ vựng')) ||
        s.isStudyingNotebook
      ) {
        originalData = Array.isArray(s.notebook) ? s.notebook : [];
      } else {
        const savedList = Utils?.safeJsonParse('fc_data_' + s.lang, []);
        originalData = Array.isArray(savedList) ? savedList : [];
      }
      setCards(originalData);
      setCurrentCardIndex(0);
      showToast('Đã tắt trộn bài (Về thứ tự gốc)', 'info');
    }
  }, [
    resetLearnPlaybackState,
    setCards,
    setCurrentCardIndex,
    setIsShuffle,
    showToast
  ]);


  // ==========================================================================
  // 4. RETRY BAG APIS (QUẢN LÝ TÚI NHÁP TOÀN CỤC — KHỚP 1:1 VỚI db.js)
  // ==========================================================================
  // Hàng đợi Map đa phân vùng ngôn ngữ: chống tuyệt đối race condition khi đổi ngôn ngữ trong cùng 1 tick
  useEffect(() => {
    if (!isDbReady || pendingRetryPersistMapRef.current.size === 0) return;


    const dbInstance =
      FcDB || (typeof window !== 'undefined' ? window.FcDB : null);
    if (!dbInstance || typeof dbInstance.set !== 'function') return;


    const entries = Array.from(pendingRetryPersistMapRef.current.entries());
    pendingRetryPersistMapRef.current.clear();


    entries.forEach(([targetLang, bagSnapshot]) => {
      const safeTargetLang = targetLang === 'zh' ? 'zh' : 'en';
      dbInstance
        .set('fc_global_retry_bag_' + safeTargetLang, bagSnapshot)
        .catch(() => {});
    });
  }, [globalRetryBag, isDbReady]);


  const addToRetryBag = useCallback(
    (gameType, questionData) => {
      if (!gameType || !questionData || typeof questionData !== 'object') return;
      const normalizedItem = normalizeRetryItem(gameType, questionData);
      const termToCheck = extractRetryKey(normalizedItem, gameType);
      const targetKey = normalizeKey(termToCheck);
      if (!targetKey) return;


      const safeLang = latestStateRef.current.lang === 'zh' ? 'zh' : 'en';


      setGlobalRetryBag((prev) => {
        const safePrev = prev && typeof prev === 'object' ? prev : {};
        const currentBag = Array.isArray(safePrev[gameType])
          ? safePrev[gameType]
          : [];


        const isDup = currentBag.some((item) => {
          const itemKey = normalizeKey(extractRetryKey(item, gameType));
          if (!itemKey) return false;
          if (
            gameType === 'oddoneout' &&
            Array.isArray(item.words) &&
            Array.isArray(normalizedItem.words)
          ) {
            return (
              itemKey === targetKey &&
              normalizeWordSignature(item.words) ===
                normalizeWordSignature(normalizedItem.words)
            );
          }
          return itemKey === targetKey;
        });


        if (isDup) return safePrev;


        // Giới hạn 100 thẻ gần nhất / loại game chống phình IndexedDB
        const updatedList = [...currentBag, normalizedItem].slice(-100);
        const nextBag = {
          ...safePrev,
          [gameType]: updatedList
        };
        pendingRetryPersistMapRef.current.set(safeLang, nextBag);
        return nextBag;
      });
    },
    [setGlobalRetryBag]
  );


  const removeFromRetryBag = useCallback(
    (gameType, termToRemove, extraData = null) => {
      if (!gameType || !termToRemove) return;
      const targetKey = normalizeKey(termToRemove);
      if (!targetKey) return;


      const safeLang = latestStateRef.current.lang === 'zh' ? 'zh' : 'en';
      const extraPassageKey =
        gameType === 'reading' && typeof extraData === 'string'
          ? normalizeKey(extraData)
          : '';
      const extraOddWordsSig =
        gameType === 'oddoneout' && Array.isArray(extraData)
          ? normalizeWordSignature(extraData)
          : '';


      setGlobalRetryBag((prev) => {
        const safePrev = prev && typeof prev === 'object' ? prev : {};
        const currentBag = Array.isArray(safePrev[gameType])
          ? safePrev[gameType]
          : [];
        if (currentBag.length === 0) return safePrev;


        const newBag = currentBag.filter((item) => {
          const primaryKey = normalizeKey(extractRetryKey(item, gameType));


          if (
            gameType === 'oddoneout' &&
            extraOddWordsSig &&
            Array.isArray(item?.words)
          ) {
            if (
              primaryKey === targetKey &&
              normalizeWordSignature(item.words) === extraOddWordsSig
            ) {
              return false;
            }
            return true;
          }


          if (gameType === 'reading' && extraPassageKey) {
            const itemQuestionKey = normalizeKey(item?.questionText);
            const itemPassageKey = normalizeKey(item?.passageContext);
            if (
              itemQuestionKey === targetKey &&
              itemPassageKey === extraPassageKey
            ) {
              return false;
            }
            return true;
          }


          const candidateKeys = getRetryCandidateKeys(item, gameType);
          return !candidateKeys.includes(targetKey);
        });


        if (newBag.length === currentBag.length) return safePrev;


        const nextBag = {
          ...safePrev,
          [gameType]: newBag
        };
        pendingRetryPersistMapRef.current.set(safeLang, nextBag);
        return nextBag;
      });
    },
    [setGlobalRetryBag]
  );


  // ==========================================================================
  // 5. LẮP RÁP CÁC MODULE (SUB-HOOKS ASSEMBLY)
  // ==========================================================================
  const aiLogic = useAiLogic(core, latestStateRef, {
    speak,
    handleNext,
    showToast,
    stopSpeaking
  });


  const sharedCallbacks = {
    t,
    showToast,
    handleNext,
    processAiQueue: aiLogic.processAiQueue
  };


  const dataIO = useDataIO(core, latestStateRef, { t, showToast });
  const studyProgress = useStudyProgress(core, latestStateRef, sharedCallbacks);
  const aiCurator = useAiCurator(core, latestStateRef, { t, showToast });
  const examPoolLogic = useExamPoolLogic(core, sharedCallbacks);


  // Đồng bộ hàm thu hoạch vào Ref Proxy
  handleAutoHarvestToPoolRef.current = examPoolLogic.handleAutoHarvestToPool;


  // ==========================================================================
  // 6. UI ORCHESTRATION & UNIVERSAL REVIEW ROUTER (MEMOIZED)
  // ==========================================================================
  const handleOpenSettings = useCallback(() => setShowSettings(true), [setShowSettings]);
  const handleCloseSettings = useCallback(() => setShowSettings(false), [setShowSettings]);
  const handleOpenAiConfig = useCallback(() => setShowAiConfigModal(true), [setShowAiConfigModal]);


  const onMissingKey = useCallback(() => {
    showToast('Cần Google Gemini API Key', 'warning');
    setShowApiKeyModal(true);
  }, [setShowApiKeyModal, showToast]);


  const handleOpenWordSelector = useCallback(
    (payload) => {
      let targetData;
      if (payload && typeof payload === 'object' && payload.isSmartTarget) {
        targetData = payload;
      } else if (typeof payload === 'string' && payload.trim() !== '') {
        targetData = payload;
      } else {
        const s = latestStateRef.current;
        targetData = s.cards?.[s.currentCardIndex]?.term || '';
      }
      setWordSelectTarget(targetData);
      setShowWordSelect(true);
    },
    [setShowWordSelect, setWordSelectTarget]
  );


  const handleOpenIncorrect = useCallback(
    () => setShowIncorrectModal(true),
    [setShowIncorrectModal]
  );
  const handleCloseIncorrect = useCallback(
    () => setShowIncorrectModal(false),
    [setShowIncorrectModal]
  );


  const handleRemoveAllIncorrect = useCallback(() => {
    const safeLang = latestStateRef.current.lang === 'zh' ? 'zh' : 'en';
    setIncorrectList([]);
    const incorrectKey =
      (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + safeLang;
    const dbInstance =
      FcDB || (typeof window !== 'undefined' ? window.FcDB : null);
    if (dbInstance && typeof dbInstance.set === 'function') {
      dbInstance.set(incorrectKey, []).catch(() => {});
    }
    showToast('Đã xóa toàn bộ danh sách cần nhớ', 'success');
    setShowIncorrectModal(false);
  }, [setIncorrectList, setShowIncorrectModal, showToast]);


  // ROUTER ÔN TẬP VẠN NĂNG (UNIVERSAL REVIEW ROUTER — ĐỒNG BỘ GameView Ver 1.1)
  const handleReviewWithGame = useCallback(
    (gameType, sourceData, sourceName) => {
      if (!Array.isArray(sourceData) || sourceData.length === 0) {
        showToast('Không có dữ liệu để ôn tập!', 'warning');
        return;
      }


      resetLearnPlaybackState();


      const currentShuffle = latestStateRef.current.isShuffle;
      let targetList = [...sourceData];
      if (currentShuffle) targetList = Utils.shuffleArray(targetList);
      setCards(targetList);
      setIsStudyingNotebook(true);


      setShowNotebook(false);
      setShowIncorrectModal(false);


      if (gameType === 'flashcard') {
        setStudySourceName(sourceName);
        setViewMode('learn');
        setCurrentCardIndex(0);
        showToast(
          currentShuffle
            ? `Đã trộn ngẫu nhiên ${sourceName}!`
            : `Đang học ${sourceName}!`
        );
      } else {
        const gameNames = {
          match: 'Nối Ô',
          scramble: 'Ghép Câu',
          quiz: 'Trắc Nghiệm',
          fillblank: 'Điền Từ',
          spotmistake: 'Tìm Lỗi Sai',
          oddoneout: 'Từ Khác Loại',
          imagequiz: 'Đoán Hình',
          pronunciation: 'Ngữ Âm',
          listening: 'Nghe Hiểu',
          reading: 'Đọc Hiểu'
        };
        const suffix = gameNames[gameType] || gameType;
        setStudySourceName(`${sourceName} (${suffix})`);
        setViewMode('game');


        if (typeof window !== 'undefined') {
          const route = `${gameType}_setup`;
          window.__pendingGameRoute = route;
          try {
            window.dispatchEvent(
              new CustomEvent('fc-pending-game-route', { detail: route })
            );
          } catch {
            // Fallback an toàn cho trình duyệt cũ
          }
        }
        showToast(`Chuyển sang Game để ôn tập ${sourceName}!`);
      }
    },
    [
      resetLearnPlaybackState,
      setCards,
      setCurrentCardIndex,
      setIsStudyingNotebook,
      setShowIncorrectModal,
      setShowNotebook,
      setStudySourceName,
      setViewMode,
      showToast
    ]
  );


  const handleExitStudyMode = useCallback(() => {
    resetLearnPlaybackState();
    const s = latestStateRef.current;
    const savedData = Utils?.safeJsonParse('fc_data_' + s.lang, []);
    let targetList = Array.isArray(savedData) ? savedData : [];
    if (s.isShuffle) targetList = Utils.shuffleArray([...targetList]);
    setCards(targetList);
    setStudySourceName(null);
    setIsStudyingNotebook(false);
    setCurrentCardIndex(0);
    showToast('Đã thoát chế độ ôn tập, quay lại danh sách gốc', 'info');
  }, [
    resetLearnPlaybackState,
    setCards,
    setCurrentCardIndex,
    setIsStudyingNotebook,
    setStudySourceName,
    showToast
  ]);


  const handleOpenHelp = useCallback(() => setShowHelp(true), [setShowHelp]);
  const handleCloseHelp = useCallback(() => setShowHelp(false), [setShowHelp]);
  const handleOpenSaveLoad = useCallback(
    () => setShowSaveLoadModal(true),
    [setShowSaveLoadModal]
  );
  const handleCloseSaveLoad = useCallback(
    () => setShowSaveLoadModal(false),
    [setShowSaveLoadModal]
  );


  const handleOpenHanziStudy = useCallback(
    (textOrEvent) => {
      const s = latestStateRef.current;
      const text =
        typeof textOrEvent === 'string'
          ? textOrEvent
          : s.cards?.[s.currentCardIndex]?.term || '';
      setWordSelectTarget(text);
      setShowHanziSelector(true);
    },
    [setShowHanziSelector, setWordSelectTarget]
  );


  const handleCloseHanziSelector = useCallback(
    () => setShowHanziSelector(false),
    [setShowHanziSelector]
  );
  const handleStartWriting = useCallback(
    (char) => {
      setCurrentHanziChar(char);
      setShowHanziSelector(false);
      setShowHanziWriter(true);
    },
    [setCurrentHanziChar, setShowHanziSelector, setShowHanziWriter]
  );
  const handleCloseHanziWriter = useCallback(
    () => setShowHanziWriter(false),
    [setShowHanziWriter]
  );


  const handleOpenExamPoolManager = useCallback(
    () => setShowExamPoolManager(true),
    [setShowExamPoolManager]
  );
  const handleCloseExamPoolManager = useCallback(
    () => setShowExamPoolManager(false),
    [setShowExamPoolManager]
  );


  // ==========================================================================
  // 7. KEYBOARD SHORTCUTS (CHẶN CƯỚP PHÍM HỆ THỐNG, CHỐNG LẶP PHÍM GIỮ)
  // ==========================================================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode !== 'learn') return; // Chỉ chạy ở Learn Mode
      if (isAnyModalOpenRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;


      const target = e.target;
      const tagName = target?.tagName;
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }


      switch (e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          handleNext();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          handlePrev();
          break;
        case ' ':
          // Luôn preventDefault trước khi chặn e.repeat để chống cuộn trang khi giữ phím Space
          e.preventDefault();
          if (e.repeat) break;
          setIsFlipped((prev) => !prev);
          break;
        case 's':
        case 'S': {
          if (e.repeat) break;
          const s = latestStateRef.current;
          const card = s.cards?.[s.currentCardIndex];
          if (card?.term) speak(card.term);
          break;
        }
        case 'p':
        case 'P':
          if (e.repeat) break;
          toggleAutoPlay();
          break;
        case 'm':
        case 'M':
          if (e.repeat) break;
          handleToggleMute();
          break;
        case 'r':
        case 'R':
          if (e.repeat) break;
          handleToggleShuffle();
          break;
        case 'Escape':
        case 'x':
        case 'X':
          if (e.repeat) break;
          if (
            latestStateRef.current.isAutoPlaying ||
            latestStateRef.current.isAutoMode
          ) {
            handleStopAutoPlay();
          }
          break;
        case 'l':
        case 'L':
          if (e.repeat) break;
          if (latestStateRef.current.isAutoMode) {
            const nextLocked = !latestStateRef.current.isFlipLocked;
            setIsFlipLocked(nextLocked);
            showToast(
              nextLocked ? 'Đã khóa lật' : 'Đã mở khóa lật',
              'info'
            );
          }
          break;
        default:
          break;
      }
    };


    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    viewMode,
    handleNext,
    handlePrev,
    speak,
    toggleAutoPlay,
    handleStopAutoPlay,
    handleToggleMute,
    handleToggleShuffle,
    setIsFlipped,
    setIsFlipLocked,
    showToast
  ]);


  // ==========================================================================
  // 8. RETURN MERGED ACTIONS (BẢO TOÀN 100% HỢP ĐỒNG API CHO TẦNG 7)
  // ==========================================================================
  return {
    state: {
      ...core,
      mainColor,
      isCurrentCardInNotebook: isCurrentCardInNotebookDerived,
      incorrectCount: core.incorrectList?.length || 0,
      examLogic
    },
    setters: { ...core, setIsShuffle: handleToggleShuffle },
    actions: {
      t,
      showToast,
      getCardStyle,
      speak,
      stopSpeaking,
      handleNext,
      handlePrev,
      toggleAutoPlay,
      handleStopAutoPlay,
      handleJumpToCard,
      handleOpenSettings,
      handleCloseSettings,
      handleCancelSettings: handleCloseSettings,
      handleOpenAiConfig,
      onMissingKey,
      handleOpenWordSelector,
      handleNextWithToast: handleNext,
      ...aiLogic,
      toggleBatterySaver,
      handleToggleMute,
      handleOpenIncorrect,
      handleCloseIncorrect,
      handleRemoveAllIncorrect,
      handleReviewWithGame,
      handleExitStudyMode,
      handleOpenHelp,
      handleCloseHelp,
      handleOpenSaveLoad,
      handleCloseSaveLoad,
      handleOpenHanziStudy,
      handleCloseHanziSelector,
      handleStartWriting,
      handleCloseHanziWriter,
      handleOpenExamPoolManager,
      handleCloseExamPoolManager,
      setIsGamePlaying,
      addToRetryBag,
      removeFromRetryBag,
      ...dataIO,
      ...studyProgress,
      ...aiCurator,
      ...examPoolLogic
    },
    examPoolData: examPoolLogic,
    refs: { audioTimeoutRef }
  };
};


export const Block6_4_useAppLogic = useAppLogic;


if (typeof window !== 'undefined') {
  window.Block6_4_useAppLogic = useAppLogic;
  window.useAppLogic = useAppLogic;
}


export default useAppLogic;

