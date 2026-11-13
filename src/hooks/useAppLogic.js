/**
 * @file src/hooks/useAppLogic.js
 * @description "Switchboard" điều phối toàn cục. Hợp nhất I/O, Progress, AI Curator, Mock Test Logic và Exam Pool Logic.
 * @origin Tầng 6 - Block 6.4 (Main Controller)
 */

import { useRef, useCallback, useEffect } from 'react';
import { Utils } from '@/utils/helpers';
import { UI_TEXT } from '@/config/i18n';
import { FcDB } from '@/services/db';
import { STORAGE_KEYS } from '@/config/constants';

// Import các sub-hooks (Lắp ráp logic)
import { useAiLogic } from './useAiLogic';
import { useDataIO } from './useDataIO';
import { useStudyProgress } from './useStudyProgress';
import { useAiCurator } from './useAiCurator';
import { useExamPoolLogic } from './useExamPoolLogic';
import { useExamLogic } from './useExamLogic';

export const useAppLogic = (core) => {
  // 1. LẤY CORE STATE
  const {
    viewMode, lang, uiLang, cards, notebook, apiKey,
    currentCardIndex, isFlipped, isAutoPlaying, isShuffle, isAutoMode, isFlipLocked,
    settings, voices, isAiModeLearn, isCurrentCardInNotebook, isMuted,
    globalRetryBag, aiHarvestPool
  } = core;

  // Derived State
  const mainColor = lang === 'zh' ? 'red' : 'sky';
  const isCurrentCardInNotebookDerived = cards[currentCardIndex] && notebook.some(n => n.term === cards[currentCardIndex].term);

  // [VÁ LỖI ĐỨT CÁP THU HOẠCH] Sử dụng Proxy Pattern để truyền hàm thu hoạch vào useExamLogic
  const handleAutoHarvestToPoolRef = useRef(null);
 
  const harvestProxy = useCallback((item, targetLang, level, topic, typeToHarvest) => {
    if (handleAutoHarvestToPoolRef.current) {
      handleAutoHarvestToPoolRef.current(item, targetLang, level, topic, typeToHarvest);
    }
  }, []);

  // [MOCK TEST ERA] Khởi tạo ExamLogic tại cấp cao nhất để giữ State khi chuyển Tab
  // Hook này sẽ quản lý toàn bộ luồng bài thi, timer và tự động nạp đạn
  const examLogic = useExamLogic(apiKey, harvestProxy);

  // Ref Isolation Pattern: Phong ấn State để dùng trong các hàm Async
  const latestStateRef = useRef({
    cards, currentCardIndex, isFlipped, settings, isAutoPlaying, isFlipLocked, isAutoMode, notebook, incorrectList: core.incorrectList,
    mastered: core.mastered, isStudyingNotebook: core.isStudyingNotebook, isMuted: core.isMuted, isShuffle: core.isShuffle, aiHarvestPool, globalRetryBag, lang
  });

  useEffect(() => {
    latestStateRef.current = {
      cards, currentCardIndex, isFlipped, settings, isAutoPlaying, isFlipLocked, isAutoMode, notebook, incorrectList: core.incorrectList,
      mastered: core.mastered, isStudyingNotebook: core.isStudyingNotebook, isMuted: core.isMuted, isShuffle: core.isShuffle, aiHarvestPool, globalRetryBag, lang
    };
  }, [cards, currentCardIndex, isFlipped, settings, isAutoPlaying, isFlipLocked, isAutoMode, notebook, core.mastered, core.isStudyingNotebook, core.incorrectList, core.isMuted, core.isShuffle, aiHarvestPool, globalRetryBag, lang]);

  // 2. UTILITY FUNCTIONS
  const t = useCallback((key, params = {}) => {
    if (!UI_TEXT) return key;
    const dict = UI_TEXT[uiLang] || UI_TEXT['en'] || {};
    let text = dict[key] || key;
   
    if (typeof text === 'string') {
      Object.keys(params).forEach(p => text = text.replace(`{${p}}`, params[p]));
    }
    return text;
  }, [uiLang]);

  const showToast = (message, type = 'success') => {
    core.setToast({ text: message, type, id: Date.now() });
  };

  const getCardStyle = (isBack = false) => {
    const size = isBack ? (settings.backFontSize || 1.25) : (settings.fontSize || 3);
    const style = { fontSize: `${size}rem`, fontWeight: settings.fontWeight };
   
    switch (settings.fontFamily) {
      case 'serif': style.fontFamily = '"Noto Serif SC", serif'; break;
      case 'kaiti': style.fontFamily = '"KaiTi", "STKaiti", "楷体", "LXGW WenKai Lite", serif'; break;
      case 'callig': style.fontFamily = '"Long Cang", cursive'; break;
      default: style.fontFamily = 'ui-sans-serif, system-ui, sans-serif';
    }
    return style;
  };

  // [V1.09 AUDIO WAKE LOCK FIX] Khởi tạo âm thanh Ting bằng HTML5 Audio và Blob WAV In-memory
  // Tăng thời lượng lên 15 giây, bật Loop để lặp vô hạn.
  const createTingAudio = () => {
    if (window.fc_tingAudio) return window.fc_tingAudio;
    try {
      const sampleRate = 44100;
      const duration = 15.0; // 15 giây
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);
     
      const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
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
     
      // Tạo sóng Sine 10Hz với hiệu lượng không đổi (không fade-out)
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const amplitude = 32767 * 0.05; // Âm lượng đều đặn 5%
        const sample = amplitude * Math.sin(2 * Math.PI * 10 * t);
        view.setInt16(44 + i * 2, sample, true);
      }
     
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const audio = new Audio(URL.createObjectURL(blob));
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.preload = "auto";
      audio.loop = true; // Cho phép lặp vô tận tạo lớp Khiên bền vững
     
      window.fc_tingAudio = audio;
      return audio;
    } catch (e) {
      console.warn("WAV Gen Error:", e);
      return null;
    }
  };

  const playTing = () => {
    try {
      const audio = createTingAudio();
      if (audio) {
        // Hủy đồng hồ hẹn giờ tắt khiên (nếu có)
        if (window.fc_tingAudioTimeout) {
          clearTimeout(window.fc_tingAudioTimeout);
          window.fc_tingAudioTimeout = null;
        }
        // Chỉ gọi play() nếu luồng đang ngủ. Nếu đang mở thì tái sử dụng!
        if (audio.paused) {
          audio.currentTime = 0;
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => { /* Bỏ qua lỗi Auto-play */ });
          }
        }
      }
    } catch (e) {
      console.warn("Play Ting Error:", e);
    }
  };

  // Hàm đóng khiên an toàn bằng kỹ thuật Debounce 3.5 giây
  const releaseShieldDebounced = () => {
    if (window.fc_tingAudioTimeout) clearTimeout(window.fc_tingAudioTimeout);
    window.fc_tingAudioTimeout = setTimeout(() => {
      if (window.fc_tingAudio) window.fc_tingAudio.pause();
    }, 3500); // 3.5 giây là khoảng đệm an toàn để chờ người dùng bấm câu tiếp theo
  };

  // Hàm speak tối ưu cho nền tảng di động
  const speak = useCallback((text, rate = null, voice = null, onEnd = null) => {
    const safeOnEnd = () => { if (onEnd) onEnd(); };
    if (core.audioTimeoutRef.current) clearTimeout(core.audioTimeoutRef.current);
    if (!text || text.trim() === '') { safeOnEnd(); return; }
   
    if (core.isMuted) {
      const simulatedDuration = 1200 + (text.length * 80);
      core.audioTimeoutRef.current = setTimeout(() => {
        safeOnEnd();
      }, simulatedDuration);
      return;
    }
   
    if (!window.speechSynthesis) { safeOnEnd(); return; }
   
    // Kích hoạt "Khiên Sưởi Ấm Liên Tục" trước khi đọc TTS
    playTing();
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
   
    const createAndSpeak = () => {
      const u = new SpeechSynthesisUtterance(text);
      window.fc_currentUtterance = u;
     
      const detectLang = (str) => {
        if (/[\u4e00-\u9fa5]/.test(str)) return 'zh-CN';
        return 'en-US';
      };
     
      const detectedLang = detectLang(text);
      u.lang = detectedLang;
      let v = voice;
     
      if (!v) {
        if (settings.selectedVoice) {
          const pref = voices.find(vo => vo.name === settings.selectedVoice);
          if (pref && pref.lang.startsWith(detectedLang.split('-')[0])) v = pref;
        }
        if (!v) v = voices.find(x => x.lang === detectedLang) || voices.find(x => x.lang.startsWith(detectedLang.split('-')[0]));
      }
     
      if (v) u.voice = v;
      u.rate = rate || settings.rate || 0.9;
      u.pitch = settings.pitch || 1;
     
      u.onend = () => {
        window.fc_currentUtterance = null;
        releaseShieldDebounced(); // Hẹn giờ 3.5s thu hồi khiên
        safeOnEnd();
      };
     
      u.onerror = (e) => {
        window.fc_currentUtterance = null;
        releaseShieldDebounced();
        // LUÔN LUÔN gọi safeOnEnd() kể cả khi bị interrupted để Game không bị đơ
        safeOnEnd();
      };
     
      window.speechSynthesis.speak(u);
    };
    core.audioTimeoutRef.current = setTimeout(createAndSpeak, 300);
  }, [voices, settings, lang, core.isMuted]);

  const stopSpeaking = useCallback(() => {
    if (window.fc_tingAudioTimeout) clearTimeout(window.fc_tingAudioTimeout);
    if (window.fc_tingAudio) window.fc_tingAudio.pause(); // Cắt ngay lập tức nếu user chủ động bấm dừng
    window.speechSynthesis.cancel();
    window.fc_currentUtterance = null;
    if (core.audioTimeoutRef.current) clearTimeout(core.audioTimeoutRef.current);
    if (core.autoPlayTimeoutRef.current) clearTimeout(core.autoPlayTimeoutRef.current);
  }, []);

  // 3. NAVIGATION (ĐIỀU HƯỚNG THẺ)
  const handleNext = useCallback(() => {
    const { cards, isShuffle, currentCardIndex } = latestStateRef.current;
    core.setIsFlipped(false);
    core.setIsContentHidden(false);
    stopSpeaking();
   
    setTimeout(() => {
      if (isShuffle) {
        if (currentCardIndex >= cards.length - 1) {
          const reshuffled = Utils.shuffleArray([...cards]);
          core.setCards(reshuffled);
          core.setCurrentCardIndex(0);
          showToast("Đã đi hết 1 vòng! Đang xáo trộn lại bộ bài.", "info");
        } else {
          core.setCurrentCardIndex(prev => prev + 1);
        }
      } else {
        core.setCurrentCardIndex(prev => (prev + 1) % cards.length);
      }
    }, 150);
  }, [stopSpeaking]);

  const handlePrev = useCallback(() => {
    const { cards } = latestStateRef.current;
    core.setIsFlipped(false);
    core.setIsContentHidden(false);
    stopSpeaking();
    setTimeout(() => core.setCurrentCardIndex(prev => (prev - 1 + cards.length) % cards.length), 150);
  }, [stopSpeaking]);

  const handleJumpToCard = useCallback((inputNumber) => {
    const { cards } = latestStateRef.current;
    const targetIndex = parseInt(inputNumber, 10) - 1;
    if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < cards.length) {
      core.setCurrentCardIndex(targetIndex);
      core.setIsFlipped(false);
      core.setIsContentHidden(false);
      stopSpeaking();
    }
  }, [stopSpeaking]);

  const toggleAutoPlay = useCallback(() => {
    if (latestStateRef.current.isAutoPlaying) {
      core.setIsAutoPlaying(false);
      core.setIsContentHidden(false);
      stopSpeaking();
    } else {
      speak('');
      core.setIsAutoMode(true);
      core.setIsAutoPlaying(true);
      core.setIsContentHidden(false);
      showToast("Bắt đầu tự động phát", "success");
    }
  }, [stopSpeaking, speak]);

  const handleStopAutoPlay = useCallback(() => {
    core.setIsAutoPlaying(false);
    core.setIsAutoMode(false);
    core.setIsContentHidden(false);
    stopSpeaking();
    core.setCurrentCardIndex(0);
    showToast("Đã dừng và quay về đầu!", "info");
  }, [stopSpeaking]);

  const toggleBatterySaver = useCallback(async () => {
    if (!core.isBatterySaverMode) {
      await Utils.requestWakeLock();
      core.setIsBatterySaverMode(true);
      showToast("Đã bật Chế độ Rảnh tay (Màn hình luôn sáng)", "success");
    } else {
      await Utils.releaseWakeLock();
      core.setIsBatterySaverMode(false);
    }
  }, [core.isBatterySaverMode]);

  const handleToggleMute = useCallback(() => {
    core.setIsMuted(prev => {
      const newState = !prev;
      showToast(newState ? "Đã tắt tiếng (Giả lập thời gian đọc)" : "Đã bật tiếng", "info");
      if (newState) window.speechSynthesis.cancel();
      return newState;
    });
  }, []);

  const handleToggleShuffle = useCallback(() => {
    const nextState = !core.isShuffle;
    core.setIsShuffle(nextState);
    if (nextState) {
      showToast("Đã bật trộn bài", "info");
    } else {
      let originalData = [];
      if (core.studySourceName && core.studySourceName.includes("Sổ tay cần nhớ")) {
        originalData = core.incorrectList;
      } else if ((core.studySourceName && core.studySourceName.includes("Sổ tay từ vựng")) || core.isStudyingNotebook) {
        originalData = core.notebook;
      } else {
        originalData = Utils?.safeJsonParse('fc_data_' + core.lang, []) || [];
      }
      core.setCards(originalData);
      core.setCurrentCardIndex(0);
      showToast("Đã tắt trộn bài (Về thứ tự gốc)", "info");
    }
  }, [core.isShuffle, core.studySourceName, core.isStudyingNotebook, core.lang, core.notebook, core.incorrectList]);

  // ==================================================================================
  // 4. RETRY BAG APIS (QUẢN LÝ TÚI NHÁP TOÀN CỤC)
  // ==================================================================================
  const addToRetryBag = useCallback((gameType, questionData) => {
    if (!gameType || !questionData) return;
    core.setGlobalRetryBag(prev => {
      const currentBag = prev[gameType] || [];
      const termToCheck = questionData.term || questionData.origin?.term || questionData.displaySentence || questionData.wrongSentence || questionData.oddWord;
      if (!termToCheck) return prev;
     
      const isDup = currentBag.some(item => {
        const itemTerm = item.term || item.origin?.term || item.displaySentence || item.wrongSentence || item.oddWord;
        if (gameType === 'oddoneout' && item.words && questionData.words) {
          return itemTerm === termToCheck && item.words.join() === questionData.words.join();
        }
        return itemTerm === termToCheck;
      });
     
      if (isDup) return prev;
      const nextBag = { ...prev, [gameType]: [...currentBag, questionData] };
      // Ghi ngầm bằng FcDB chuẩn ES Module để đồng bộ IndexedDB
      if (FcDB && core.isDbReady) FcDB.set('fc_global_retry_bag_' + core.lang, nextBag);
      return nextBag;
    });
  }, [core.setGlobalRetryBag, core.isDbReady, core.lang]);

  const removeFromRetryBag = useCallback((gameType, termToRemove, extraData = null) => {
    if (!gameType || !termToRemove) return;
    core.setGlobalRetryBag(prev => {
      const currentBag = prev[gameType] || [];
      const newBag = currentBag.filter(item => {
        const itemTerm = item.term || item.origin?.term || item.displaySentence || item.wrongSentence || item.oddWord;
        if (gameType === 'oddoneout' && extraData && item.words) {
          if (itemTerm === termToRemove && item.words.join() === extraData.join()) {
            return false;
          }
          return true;
        }
        return itemTerm !== termToRemove;
      });
     
      if (newBag.length === currentBag.length) return prev;
      const nextBag = { ...prev, [gameType]: newBag };
      if (FcDB && core.isDbReady) FcDB.set('fc_global_retry_bag_' + core.lang, nextBag);
      return nextBag;
    });
  }, [core.setGlobalRetryBag, core.isDbReady, core.lang]);

  // ==================================================================================
  // 5. LẮP RÁP CÁC MODULE (SUB-HOOKS ASSEMBLY)
  // ==================================================================================
  // Khởi tạo các Sub-Hooks ES Modules
  const aiLogic = useAiLogic(core, latestStateRef, { speak, handleNext, showToast, stopSpeaking });
  const sharedCallbacks = { t, showToast, handleNext, processAiQueue: aiLogic.processAiQueue };
 
  const dataIO = useDataIO(core, latestStateRef, { t, showToast });
  const studyProgress = useStudyProgress(core, latestStateRef, sharedCallbacks);
  const aiCurator = useAiCurator(core, latestStateRef, { t, showToast });
  const examPoolLogic = useExamPoolLogic(core, sharedCallbacks);

  // Đồng bộ hàm thu hoạch vào Ref Proxy
  handleAutoHarvestToPoolRef.current = examPoolLogic.handleAutoHarvestToPool;

  // ==================================================================================
  // 6. UI ORCHESTRATION & ROUTER (HÀM ĐIỀU PHỐI GIAO DIỆN & ÔN TẬP)
  // ==================================================================================
  const handleOpenIncorrect = () => core.setShowIncorrectModal(true);
  const handleCloseIncorrect = () => core.setShowIncorrectModal(false);
 
  const handleRemoveAllIncorrect = () => {
    core.setIncorrectList([]);
    if (FcDB && core.isDbReady) {
      FcDB.set((STORAGE_KEYS.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang, []);
    }
    showToast("Đã xóa toàn bộ danh sách cần nhớ", "success");
    core.setShowIncorrectModal(false);
  };

  // ROUTER ÔN TẬP VẠN NĂNG (UNIVERSAL REVIEW ROUTER)
  const handleReviewWithGame = (gameType, sourceData, sourceName) => {
    if (!sourceData || sourceData.length === 0) {
      showToast("Không có dữ liệu để ôn tập!", "warning");
      return;
    }
   
    let targetList = [...sourceData];
    if (core.isShuffle) targetList = Utils.shuffleArray(targetList);
   
    core.setCards(targetList);
    core.setIsStudyingNotebook(true);
   
    // Đóng các Modal
    core.setShowNotebook(false);
    core.setShowIncorrectModal(false);
   
    if (gameType === 'flashcard') {
      core.setStudySourceName(sourceName);
      core.setViewMode('learn');
      core.setCurrentCardIndex(0);
      showToast(core.isShuffle ? `Đã trộn ngẫu nhiên ${sourceName}!` : `Đang học ${sourceName}!`);
    } else {
      const gameNames = {
        match: 'Nối Ô', scramble: 'Ghép Câu', quiz: 'Trắc Nghiệm',
        fillblank: 'Điền Từ', spotmistake: 'Tìm Lỗi Sai', oddoneout: 'Từ Khác Loại',
        imagequiz: 'Đoán Hình', pronunciation: 'Ngữ Âm', listening: 'Nghe Hiểu', reading: 'Đọc Hiểu'
      };
      const suffix = gameNames[gameType] || gameType;
      core.setStudySourceName(`${sourceName} (${suffix})`);
      core.setViewMode('game');
     
      // Đặt cờ toàn cục để Tầng 5 (GameView) có thể bắt được và nhảy thẳng vào Setup
      window.__pendingGameRoute = `${gameType}_setup`;
      showToast(`Chuyển sang Game để ôn tập ${sourceName}!`);
    }
  };

  const handleExitStudyMode = () => {
    const savedData = Utils?.safeJsonParse('fc_data_' + core.lang, []);
    let targetList = savedData || [];
    if (core.isShuffle) targetList = Utils.shuffleArray([...targetList]);
   
    core.setCards(targetList);
    core.setStudySourceName(null);
    core.setIsStudyingNotebook(false);
    core.setCurrentCardIndex(0);
    showToast("Đã thoát chế độ ôn tập, quay lại danh sách gốc", "info");
  };

  const handleOpenHelp = () => core.setShowHelp(true);
  const handleCloseHelp = () => core.setShowHelp(false);
 
  const handleOpenHanziStudy = (textOrEvent) => {
    const text = (typeof textOrEvent === 'string') ? textOrEvent : (cards[currentCardIndex]?.term || '');
    core.setWordSelectTarget(text);
    core.setShowHanziSelector(true);
  };
  const handleCloseHanziSelector = () => core.setShowHanziSelector(false);
  const handleStartWriting = (char) => { core.setCurrentHanziChar(char); core.setShowHanziSelector(false); core.setShowHanziWriter(true); };
  const handleCloseHanziWriter = () => core.setShowHanziWriter(false);

  // 7. KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode !== 'learn') return; // Chặn phím tắt tác động vào Exam Mode (Chỉ chạy ở Learn Mode)
      if (core.showSettings || core.showApiKeyModal || core.showNotebook || core.showManual || core.showLinkManager || core.showWordSelect || core.showMastered || core.showIncorrectModal || core.showHelp || core.showHanziSelector || core.showHanziWriter || core.showSaveLoadModal || core.showAiChat || core.showExamPoolManager || core.showAiConfigModal) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
     
      switch (e.key) {
        case 'ArrowRight': case 'd': case 'D': handleNext(); break;
        case 'ArrowLeft': case 'a': case 'A': handlePrev(); break;
        case ' ': e.preventDefault(); core.setIsFlipped(prev => !prev); break;
        case 's': case 'S': const card = cards[currentCardIndex]; if (card) speak(card.term); break;
        case 'p': case 'P': toggleAutoPlay(); break;
        case 'm': case 'M': handleToggleMute(); break;
        case 'r': case 'R': handleToggleShuffle(); break;
        case 'Escape': case 'x': case 'X': if (latestStateRef.current.isAutoPlaying || latestStateRef.current.isAutoMode) { handleStopAutoPlay(); } break;
        case 'l': case 'L':
          if (latestStateRef.current.isAutoMode) {
            core.setIsFlipLocked(prev => {
              const newState = !prev;
              showToast(newState ? "Đã khóa lật" : "Đã mở khóa lật", "info");
              return newState;
            });
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, core.showSettings, core.showApiKeyModal, core.showNotebook || core.showManual, core.showLinkManager, core.showWordSelect, core.showMastered, core.showIncorrectModal, core.showHelp, core.showHanziSelector, core.showHanziWriter, core.showSaveLoadModal, core.showAiChat, core.showExamPoolManager, core.showAiConfigModal, handleNext, handlePrev, cards, currentCardIndex, speak, toggleAutoPlay, handleStopAutoPlay, handleToggleMute, handleToggleShuffle]);

  // 8. RETURN MERGED ACTIONS (Lắp ráp API cho Tầng 7)
  return {
    state: { ...core, mainColor, isCurrentCardInNotebook: isCurrentCardInNotebookDerived, incorrectCount: core.incorrectList.length, examLogic },
    setters: { ...core, setIsShuffle: handleToggleShuffle },
    actions: {
      t, showToast, getCardStyle, speak, stopSpeaking,
      handleNext, handlePrev, toggleAutoPlay, handleStopAutoPlay,
      handleJumpToCard,
      handleOpenSettings: () => core.setShowSettings(true),
      handleCloseSettings: () => core.setShowSettings(false),
      handleCancelSettings: () => core.setShowSettings(false),
      handleOpenAiConfig: () => core.setShowAiConfigModal(true),
      onMissingKey: () => { showToast("Cần Google Gemini API Key", "warning"); core.setShowApiKeyModal(true); },
      handleOpenWordSelector: (payload) => {
        let targetData;
        if (payload && typeof payload === 'object' && payload.isSmartTarget) {
          targetData = payload;
        } else if (typeof payload === 'string' && payload.trim() !== '') {
          targetData = payload;
        } else {
          targetData = cards[currentCardIndex]?.term || '';
        }
        core.setWordSelectTarget(targetData);
        core.setShowWordSelect(true);
      },
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
      handleOpenSaveLoad: () => core.setShowSaveLoadModal(true),
      handleCloseSaveLoad: () => core.setShowSaveLoadModal(false),
      handleOpenHanziStudy,
      handleCloseHanziSelector,
      handleStartWriting,
      handleCloseHanziWriter,
      handleOpenExamPoolManager: () => core.setShowExamPoolManager(true),
      handleCloseExamPoolManager: () => core.setShowExamPoolManager(false),
      setIsGamePlaying: core.setIsGamePlaying,
      addToRetryBag,
      removeFromRetryBag,
      ...dataIO,
      ...studyProgress,
      ...aiCurator,
      ...examPoolLogic
    },
    examPoolData: examPoolLogic,
    refs: { audioTimeoutRef: core.audioTimeoutRef }
  };
};