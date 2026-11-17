// ============================================================================
// FILE 82/85: src/hooks/useAppLogic.js
// NGUỒN GỐC: Tầng 6 - Block 6.4 (Main Controller - Version 1.09)
// NHIỆM VỤ: "Switchboard" điều phối toàn cục. Hợp nhất AI Logic (6.2),
//           Data I/O (6.3), Study Progress (6.5), AI Curator (6.6),
//           Mock Test Logic (6.7) và Exam Pool Logic (6.8).
// ============================================================================

import { useRef, useEffect, useCallback } from 'react';
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
// [V1.09 AUDIO WAKE LOCK FIX] KHIÊN SƯỞI ẤM ÂM THANH LIÊN TỤC (15s WAV LOOP)
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
    audio.loop = true; // [BẢN VÁ V1.09] Lặp vô tận tạo lớp Khiên bền vững
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
      // [BẢN VÁ V1.09] Hủy đồng hồ hẹn giờ tắt khiên (nếu có)
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
            /* Bỏ qua lỗi Auto-play */
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
    if (window.fc_tingAudio) window.fc_tingAudio.pause();
  }, 3500);
};

export const useAppLogic = (core) => {
  // 1. LẤY CORE STATE
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
    aiHarvestPool
  } = core;

  // Derived State
  const mainColor = lang === 'zh' ? 'red' : 'sky';
  const isCurrentCardInNotebookDerived = Boolean(
    cards[currentCardIndex] &&
      notebook.some((n) => n.term === cards[currentCardIndex].term)
  );

  // [VÁ LỖI ĐỨT CÁP THU HOẠCH] Sử dụng Proxy Pattern để truyền hàm thu hoạch vào useExamLogic
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

  // Ref Isolation Pattern: Phong ấn State để dùng trong các hàm Async
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
    isShuffle: core.isShuffle,
    aiHarvestPool,
    globalRetryBag,
    lang
  });

  useEffect(() => {
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
      isShuffle: core.isShuffle,
      aiHarvestPool,
      globalRetryBag,
      lang
    };
  }, [
    cards,
    currentCardIndex,
    isFlipped,
    settings,
    isAutoPlaying,
    isFlipLocked,
    isAutoMode,
    notebook,
    core.mastered,
    core.isStudyingNotebook,
    core.studySourceName,
    core.incorrectList,
    core.isMuted,
    core.isShuffle,
    aiHarvestPool,
    globalRetryBag,
    lang
  ]);

  // 2. UTILITY FUNCTIONS
  const t = useCallback(
    (key, params = {}) => {
      const textDict =
        UI_TEXT || (typeof window !== 'undefined' ? window.UI_TEXT : null);
      if (!textDict) return key;
      const dict = textDict[uiLang] || textDict.en || {};
      let text = dict[key] || key;
      if (typeof text === 'string') {
        Object.keys(params).forEach((p) => {
          text = text.replace(`{${p}}`, params[p]);
        });
      }
      return text;
    },
    [uiLang]
  );

  const showToast = useCallback(
    (message, type = 'success') => {
      core.setToast({ text: message, type, id: Date.now() });
    },
    [core]
  );

  const getCardStyle = useCallback(
    (isBack = false) => {
      const size = isBack
        ? settings.backFontSize || 1.25
        : settings.fontSize || 3;
      const style = { fontSize: `${size}rem`, fontWeight: settings.fontWeight };
      switch (settings.fontFamily) {
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

  // Hàm speak tối ưu cho nền tảng di động & Bluetooth
  const speak = useCallback(
    (text, rate = null, voice = null, onEnd = null) => {
      const safeOnEnd = () => {
        if (onEnd) onEnd();
      };
      if (core.audioTimeoutRef.current) {
        clearTimeout(core.audioTimeoutRef.current);
      }
      if (!text || text.trim() === '') {
        safeOnEnd();
        return;
      }
      if (core.isMuted) {
        const simulatedDuration = 1200 + text.length * 80;
        core.audioTimeoutRef.current = setTimeout(() => {
          safeOnEnd();
        }, simulatedDuration);
        return;
      }
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        safeOnEnd();
        return;
      }

      // [BẢN VÁ V1.09] Kích hoạt "Khiên Sưởi Ấm Liên Tục" trước khi đọc TTS
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
            const pref = voices.find((vo) => vo.name === settings.selectedVoice);
            if (pref && pref.lang.startsWith(detectedLang.split('-')[0])) {
              v = pref;
            }
          }
          if (!v) {
            v =
              voices.find((x) => x.lang === detectedLang) ||
              voices.find((x) => x.lang.startsWith(detectedLang.split('-')[0]));
          }
        }
        if (v) u.voice = v;
        u.rate = rate || settings.rate || 0.9;
        u.pitch = settings.pitch || 1;

        u.onend = () => {
          window.fc_currentUtterance = null;
          releaseShieldDebounced(); // [BẢN VÁ V1.09] Hẹn giờ 3.5s thu hồi khiên
          safeOnEnd();
        };

        u.onerror = () => {
          window.fc_currentUtterance = null;
          releaseShieldDebounced(); // [BẢN VÁ V1.09] Hẹn giờ 3.5s thu hồi khiên
          // [BẢN VÁ V1.09] LUÔN LUÔN gọi safeOnEnd() kể cả khi bị interrupted để Game không bị đơ 3-4s
          safeOnEnd();
        };

        window.speechSynthesis.speak(u);
      };

      core.audioTimeoutRef.current = setTimeout(createAndSpeak, 300);
    },
    [voices, settings, core.isMuted, core.audioTimeoutRef]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (window.fc_tingAudioTimeout) clearTimeout(window.fc_tingAudioTimeout);
      if (window.fc_tingAudio) window.fc_tingAudio.pause(); // Cắt ngay lập tức nếu user chủ động bấm dừng
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      window.fc_currentUtterance = null;
    }
    if (core.audioTimeoutRef.current) {
      clearTimeout(core.audioTimeoutRef.current);
    }
    if (core.autoPlayTimeoutRef.current) {
      clearTimeout(core.autoPlayTimeoutRef.current);
    }
  }, [core.audioTimeoutRef, core.autoPlayTimeoutRef]);

  // 3. NAVIGATION (ĐIỀU HƯỚNG THẺ)
  const handleNext = useCallback(() => {
    const {
      cards: currentCards,
      isShuffle: currentShuffle,
      currentCardIndex: idx
    } = latestStateRef.current;
    core.setIsFlipped(false);
    core.setIsContentHidden(false);
    stopSpeaking();
    setTimeout(() => {
      if (!currentCards || currentCards.length === 0) return;
      if (currentShuffle) {
        if (idx >= currentCards.length - 1) {
          const reshuffled = Utils.shuffleArray([...currentCards]);
          core.setCards(reshuffled);
          core.setCurrentCardIndex(0);
          showToast('Đã đi hết 1 vòng! Đang xáo trộn lại bộ bài.', 'info');
        } else {
          core.setCurrentCardIndex((prev) => prev + 1);
        }
      } else {
        core.setCurrentCardIndex((prev) => (prev + 1) % currentCards.length);
      }
    }, 150);
  }, [core, stopSpeaking, showToast]);

  const handlePrev = useCallback(() => {
    const { cards: currentCards } = latestStateRef.current;
    core.setIsFlipped(false);
    core.setIsContentHidden(false);
    stopSpeaking();
    setTimeout(() => {
      if (!currentCards || currentCards.length === 0) return;
      core.setCurrentCardIndex(
        (prev) => (prev - 1 + currentCards.length) % currentCards.length
      );
    }, 150);
  }, [core, stopSpeaking]);

  const handleJumpToCard = useCallback(
    (inputNumber) => {
      const { cards: currentCards } = latestStateRef.current;
      const targetIndex = parseInt(inputNumber, 10) - 1;
      if (
        !isNaN(targetIndex) &&
        targetIndex >= 0 &&
        targetIndex < currentCards.length
      ) {
        core.setCurrentCardIndex(targetIndex);
        core.setIsFlipped(false);
        core.setIsContentHidden(false);
        stopSpeaking();
      }
    },
    [core, stopSpeaking]
  );

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
      showToast('Bắt đầu tự động phát', 'success');
    }
  }, [core, stopSpeaking, speak, showToast]);

  const handleStopAutoPlay = useCallback(() => {
    core.setIsAutoPlaying(false);
    core.setIsAutoMode(false);
    core.setIsContentHidden(false);
    stopSpeaking();
    core.setCurrentCardIndex(0);
    showToast('Đã dừng và quay về đầu!', 'info');
  }, [core, stopSpeaking, showToast]);

  const toggleBatterySaver = useCallback(async () => {
    if (!core.isBatterySaverMode) {
      await Utils.requestWakeLock();
      core.setIsBatterySaverMode(true);
      showToast('Đã bật Chế độ Rảnh tay (Màn hình luôn sáng)', 'success');
    } else {
      await Utils.releaseWakeLock();
      core.setIsBatterySaverMode(false);
    }
  }, [core, showToast]);

  const handleToggleMute = useCallback(() => {
    core.setIsMuted((prev) => {
      const newState = !prev;
      showToast(
        newState ? 'Đã tắt tiếng (Giả lập thời gian đọc)' : 'Đã bật tiếng',
        'info'
      );
      if (newState && typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return newState;
    });
  }, [core, showToast]);

  const handleToggleShuffle = useCallback(() => {
    const nextState = !core.isShuffle;
    core.setIsShuffle(nextState);
    if (nextState) {
      showToast('Đã bật trộn bài', 'info');
    } else {
      let originalData = [];
      if (
        core.studySourceName &&
        core.studySourceName.includes('Sổ tay cần nhớ')
      ) {
        originalData = core.incorrectList;
      } else if (
        (core.studySourceName &&
          core.studySourceName.includes('Sổ tay từ vựng')) ||
        core.isStudyingNotebook
      ) {
        originalData = core.notebook;
      } else {
        originalData = Utils?.safeJsonParse('fc_data_' + core.lang, []) || [];
      }
      core.setCards(originalData);
      core.setCurrentCardIndex(0);
      showToast('Đã tắt trộn bài (Về thứ tự gốc)', 'info');
    }
  }, [core, showToast]);

  // ==================================================================================
  // 4. RETRY BAG APIS (QUẢN LÝ TÚI NHÁP TOÀN CỤC)
  // ==================================================================================
  const addToRetryBag = useCallback(
    (gameType, questionData) => {
      if (!gameType || !questionData) return;
      core.setGlobalRetryBag((prev) => {
        const currentBag = prev[gameType] || [];
        const termToCheck =
          questionData.term ||
          questionData.origin?.term ||
          questionData.displaySentence ||
          questionData.wrongSentence ||
          questionData.oddWord;
        if (!termToCheck) return prev;
        const isDup = currentBag.some((item) => {
          const itemTerm =
            item.term ||
            item.origin?.term ||
            item.displaySentence ||
            item.wrongSentence ||
            item.oddWord;
          if (gameType === 'oddoneout' && item.words && questionData.words) {
            return (
              itemTerm === termToCheck &&
              item.words.join() === questionData.words.join()
            );
          }
          return itemTerm === termToCheck;
        });
        if (isDup) return prev;
        const nextBag = {
          ...prev,
          [gameType]: [...currentBag, questionData]
        };
        if (FcDB && core.isDbReady) {
          FcDB.set('fc_global_retry_bag_' + core.lang, nextBag);
          FcDB.set('fc_global_retry_bag', nextBag);
        }
        return nextBag;
      });
    },
    [core]
  );

  const removeFromRetryBag = useCallback(
    (gameType, termToRemove, extraData = null) => {
      if (!gameType || !termToRemove) return;
      core.setGlobalRetryBag((prev) => {
        const currentBag = prev[gameType] || [];
        const newBag = currentBag.filter((item) => {
          const itemTerm =
            item.term ||
            item.origin?.term ||
            item.displaySentence ||
            item.wrongSentence ||
            item.oddWord;
          if (gameType === 'oddoneout' && extraData && item.words) {
            if (
              itemTerm === termToRemove &&
              item.words.join() === extraData.join()
            ) {
              return false;
            }
            return true;
          }
          return itemTerm !== termToRemove;
        });
        if (newBag.length === currentBag.length) return prev;
        const nextBag = { ...prev, [gameType]: newBag };
        if (FcDB && core.isDbReady) {
          FcDB.set('fc_global_retry_bag_' + core.lang, nextBag);
          FcDB.set('fc_global_retry_bag', nextBag);
        }
        return nextBag;
      });
    },
    [core]
  );

  // ==================================================================================
  // 5. LẮP RÁP CÁC MODULE (SUB-HOOKS ASSEMBLY)
  // ==================================================================================
  // Khởi tạo AI Logic (Block 6.2)
  const aiLogic = useAiLogic(core, latestStateRef, {
    speak,
    handleNext,
    showToast,
    stopSpeaking
  });

  // Gom các callback chung cho các module dữ liệu
  const sharedCallbacks = {
    t,
    showToast,
    handleNext,
    processAiQueue: aiLogic.processAiQueue
  };

  // Mảnh 1: Quản lý I/O & File System (Block 6.3)
  const dataIO = useDataIO(core, latestStateRef, { t, showToast });

  // Mảnh 2: Quản lý Tiến độ học tập & SRS (Block 6.5)
  const studyProgress = useStudyProgress(core, latestStateRef, sharedCallbacks);

  // Mảnh 3: Quản lý Kho AI (Block 6.6)
  const aiCurator = useAiCurator(core, latestStateRef, { t, showToast });

  // Mảnh 4: Quản lý Kho Khảo thí (Block 6.8)
  const examPoolLogic = useExamPoolLogic(core, sharedCallbacks);

  // Đồng bộ hàm thu hoạch vào Ref Proxy
  useEffect(() => {
    handleAutoHarvestToPoolRef.current = examPoolLogic.handleAutoHarvestToPool;
  }, [examPoolLogic.handleAutoHarvestToPool]);

  // ==================================================================================
  // 6. UI ORCHESTRATION & ROUTER (HÀM ĐIỀU PHỐI GIAO DIỆN & ÔN TẬP)
  // ==================================================================================
  const handleOpenIncorrect = () => core.setShowIncorrectModal(true);
  const handleCloseIncorrect = () => core.setShowIncorrectModal(false);

  const handleRemoveAllIncorrect = () => {
    core.setIncorrectList([]);
    const incorrectKey =
      (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang;
    if (FcDB) FcDB.set(incorrectKey, []);
    showToast('Đã xóa toàn bộ danh sách cần nhớ', 'success');
    core.setShowIncorrectModal(false);
  };

  // [NEW V1.04] ROUTER ÔN TẬP VẠN NĂNG (UNIVERSAL REVIEW ROUTER)
  const handleReviewWithGame = (gameType, sourceData, sourceName) => {
    if (!sourceData || sourceData.length === 0) {
      showToast('Không có dữ liệu để ôn tập!', 'warning');
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
      showToast(
        core.isShuffle
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
      core.setStudySourceName(`${sourceName} (${suffix})`);
      core.setViewMode('game');
      // Đặt cờ toàn cục để Tầng 5 (GameView) có thể bắt được và nhảy thẳng vào Setup
      if (typeof window !== 'undefined') {
        window.__pendingGameRoute = `${gameType}_setup`;
      }
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
    showToast('Đã thoát chế độ ôn tập, quay lại danh sách gốc', 'info');
  };

  const handleOpenHelp = () => core.setShowHelp(true);
  const handleCloseHelp = () => core.setShowHelp(false);

  const handleOpenHanziStudy = (textOrEvent) => {
    const text =
      typeof textOrEvent === 'string'
        ? textOrEvent
        : cards[currentCardIndex]?.term || '';
    core.setWordSelectTarget(text);
    core.setShowHanziSelector(true);
  };

  const handleCloseHanziSelector = () => core.setShowHanziSelector(false);
  const handleStartWriting = (char) => {
    core.setCurrentHanziChar(char);
    core.setShowHanziSelector(false);
    core.setShowHanziWriter(true);
  };
  const handleCloseHanziWriter = () => core.setShowHanziWriter(false);

  // 7. KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode !== 'learn') return; // Chỉ chạy ở Learn Mode
      if (
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
      ) {
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
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
          e.preventDefault();
          core.setIsFlipped((prev) => !prev);
          break;
        case 's':
        case 'S': {
          const card = cards[currentCardIndex];
          if (card) speak(card.term);
          break;
        }
        case 'p':
        case 'P':
          toggleAutoPlay();
          break;
        case 'm':
        case 'M':
          handleToggleMute();
          break;
        case 'r':
        case 'R':
          handleToggleShuffle();
          break;
        case 'Escape':
        case 'x':
        case 'X':
          if (
            latestStateRef.current.isAutoPlaying ||
            latestStateRef.current.isAutoMode
          ) {
            handleStopAutoPlay();
          }
          break;
        case 'l':
        case 'L':
          if (latestStateRef.current.isAutoMode) {
            core.setIsFlipLocked((prev) => {
              const newState = !prev;
              showToast(
                newState ? 'Đã khóa lật' : 'Đã mở khóa lật',
                'info'
              );
              return newState;
            });
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
    core,
    handleNext,
    handlePrev,
    cards,
    currentCardIndex,
    speak,
    toggleAutoPlay,
    handleStopAutoPlay,
    handleToggleMute,
    handleToggleShuffle,
    showToast
  ]);

  // 8. RETURN MERGED ACTIONS (Lắp ráp API cho Tầng 7)
  return {
    // [MOCK TEST ERA] Bơm examLogic ra ngoài state tổng để GameView truy cập được
    state: {
      ...core,
      mainColor,
      isCurrentCardInNotebook: isCurrentCardInNotebookDerived,
      incorrectCount: core.incorrectList.length,
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
      handleOpenSettings: () => core.setShowSettings(true),
      handleCloseSettings: () => core.setShowSettings(false),
      handleCancelSettings: () => core.setShowSettings(false),
      handleOpenAiConfig: () => core.setShowAiConfigModal(true),
      onMissingKey: () => {
        showToast('Cần Google Gemini API Key', 'warning');
        core.setShowApiKeyModal(true);
      },
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

export const Block6_4_useAppLogic = useAppLogic;

if (typeof window !== 'undefined') {
  window.Block6_4_useAppLogic = useAppLogic;
  window.useAppLogic = useAppLogic;
}

export default useAppLogic;