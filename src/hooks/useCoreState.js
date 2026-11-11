/**
 * @file src/hooks/useCoreState.js
 * @description Quản lý trạng thái cốt lõi (Core State) của toàn bộ ứng dụng (Data, UI toggles, User configs).
 * @origin Tầng 6 - Block 6.1 (Core State)
 */

import { useState, useEffect, useRef } from 'react';
import { STORAGE_KEYS, CONFIG_SAMPLES } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { ExamEngine } from '@/engines/exam';

const loadFont = (id, url) => {
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== url) {
    link.href = url;
  }
};

// Trình phân tích Storage thông minh, dọn dẹp rác chuỗi
const parseArrayStorage = (key, defaultArr) => {
  const raw = localStorage.getItem(key);
  if (!raw) return defaultArr;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return [parsed];
    return defaultArr;
  } catch(e) {
    // Fallback cứu hộ: Lọc bỏ nháy kép và ngoặc vuông rác
    const cleanRaw = raw.replace(/["\\[\]]/g, '').trim();
    return cleanRaw ? [cleanRaw] : defaultArr;
  }
};

export const useCoreState = () => {
  // --- CONSTANTS ---
  const DEFAULT_SETTINGS = {
    rate: 0.8, pitch: 1, selectedVoice: null,
    delayAfterRead: 1000, delayFlip: 2000, delayNext: 1500, repeatCount: 1,
    startSide: 'term', fontFamily: 'sans', fontSize: 3, backFontSize: 1.25, cardSize: 1, fontWeight: 'bold',
    srsEnabled: true,
    srsHard: '2d',
    srsGood: '4d',
    srsEasy: '7d'
  };
  const DEFAULT_AI_CONFIG = { loadingTime: 22, delayMs: 2500, maxAmmo: 4, uiCooldown: 9 };

  // --- STATE DEFINITIONS ---
  const [viewMode, setViewMode] = useState('learn');
  const [lang, setLang] = useState(() => Utils.safeJsonParse(STORAGE_KEYS.LANG || 'fc_lang', 'en') || 'en');
  
  // Chốt chặn để phân biệt lần đầu tải trang và đổi ngôn ngữ
  const prevLangRef = useRef(lang);
  
  const [uiLang, setUiLang] = useState(() => Utils.safeJsonParse(STORAGE_KEYS.UI_LANG || 'fc_ui_lang', 'en') || 'en');
  const [dataMode, setDataMode] = useState(() => {
    const saved = localStorage.getItem('fc_data_mode');
    return saved ? saved.replace(/"/g, '') : 'vocab';
  });

  // BOOT HYDRATION DESYNC FIX - Khởi tạo Level với độ tin cậy 100%
  const [currentLevel, setCurrentLevel] = useState(() => {
    const def = lang === 'zh' ? ['zh_level_1'] : ['en_level_4'];
    let initialVal = parseArrayStorage('fc_current_level_' + lang, null);
    
    // Quét dự phòng: Nếu chưa có trong storage chuẩn, thử tìm trong settings cũ
    if (!initialVal) {
      try {
        const settingsStr = localStorage.getItem('fc_settings');
        if (settingsStr) {
          const settingsObj = JSON.parse(settingsStr);
          if (settingsObj.currentLevel) {
            initialVal = Array.isArray(settingsObj.currentLevel) ? settingsObj.currentLevel : [settingsObj.currentLevel];
          }
        }
      } catch(e) {}
    }
    
    // Chốt chặn cuối cùng: Trả về Mặc định nếu vẫn rỗng
    if (!initialVal || initialVal.length === 0) {
      initialVal = def;
    }
    return initialVal;
  });

  const [currentTopic, setCurrentTopic] = useState(() => {
    return parseArrayStorage('fc_current_topic_' + lang, []);
  });

  // Data States
  const [cards, setCards] = useState([]);
  const [notebook, setNotebook] = useState([]);
  const [mastered, setMastered] = useState([]);
  const [incorrectList, setIncorrectList] = useState([]);
  const [isStudyingNotebook, setIsStudyingNotebook] = useState(false);
  const [studySourceName, setStudySourceName] = useState(null);

  // INDEXEDDB ASYNC STATE
  const [isDbReady, setIsDbReady] = useState(false);
  const [aiHarvestPool, setAiHarvestPool] = useState({});
  const [globalRetryBag, setGlobalRetryBag] = useState({});

  // SYSTEM EVENT LOGS STATE
  const [systemLogs, setSystemLogs] = useState(() => Utils.safeJsonParse('fc_system_logs', []) || []);

  // Config & Token
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.API_KEY || 'fc_apikey') || '');
  const [totalTokens, setTotalTokens] = useState(() => parseInt(localStorage.getItem('fc_total_tokens') || '0', 10));
  const [aiConfig, setAiConfig] = useState(() => Utils.safeJsonParse('fc_ai_config', DEFAULT_AI_CONFIG) || DEFAULT_AI_CONFIG);
  
  // Bổ sung State quản lý Mô hình AI
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('fc_ai_model') || 'gemini-3.5-flash-lite');
  
  // Bổ sung State quản lý vị trí Không gian học (Responsive Layout Alignment)
  const [layoutAlign, setLayoutAlign] = useState(() => {
    return localStorage.getItem('fc_layout_align') || 'center';
  });

  // UI Toggles
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showLinkManager, setShowLinkManager] = useState(false);
  const [showWordSelect, setShowWordSelect] = useState(false);
  const [showMastered, setShowMastered] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [showIncorrectModal, setShowIncorrectModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSaveLoadModal, setShowSaveLoadModal] = useState(false);
  const [showExamPoolManager, setShowExamPoolManager] = useState(false);
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);

  // Hanzi Toggles
  const [showHanziSelector, setShowHanziSelector] = useState(false);
  const [showHanziWriter, setShowHanziWriter] = useState(false);
  const [currentHanziChar, setCurrentHanziChar] = useState('');
  const [wordSelectTarget, setWordSelectTarget] = useState('');
  const [toast, setToast] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // AI Modes & Pending Actions
  const [isAiModeLearn, setIsAiModeLearn] = useState(false);
  const [isAiModeGame, setIsAiModeGame] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  // URLs
  const [exportUrl, setExportUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.EXPORT_URL || 'fc_export_url') || "");
  const [apiKeySheetUrl, setApiKeySheetUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.API_KEY_SHEET || 'fc_apikey_sheet') || "");
  const [importUrl, setImportUrl] = useState('');
  const [defaultUrl, setDefaultUrl] = useState('');

  // Playback & Game State
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [isFlipLocked, setIsFlipLocked] = useState(false);
  const [isGamePlaying, setIsGamePlaying] = useState(false);

  // Quản lý Sessions đa ngôn ngữ
  const [globalGameSessions, setGlobalGameSessions] = useState(() => {
    const data = Utils.safeJsonParse('fc_game_sessions', {});
    if (data && (data.quiz || data.match || data.scramble)) return {};
    return data;
  });

  // Proxy các biến state cho riêng ngôn ngữ hiện tại
  const gameSessions = globalGameSessions[lang] || {};
  const setGameSessions = (updater) => {
    setGlobalGameSessions(prev => {
      const currentLangSessions = prev[lang] || {};
      const nextLangSessions = typeof updater === 'function' ? updater(currentLangSessions) : updater;
      return { ...prev, [lang]: nextLangSessions };
    });
  };

  const [isMuted, setIsMuted] = useState(false);
  const [settings, setSettings] = useState(() => Utils.safeJsonParse(STORAGE_KEYS.SETTINGS || 'fc_settings', DEFAULT_SETTINGS));
  const [voices, setVoices] = useState([]);
  const [isContentHidden, setIsContentHidden] = useState(false);
  const [isBatterySaverMode, setIsBatterySaverMode] = useState(false);

  // --- REFS ---
  const audioTimeoutRef = useRef(null);
  const autoPlayTimeoutRef = useRef(null);
  const processingCardsRef = useRef(new Set());
  const resetTimeoutRef = useRef(null);
  const aiQueueRef = useRef([]);
  const isAiQueueProcessing = useRef(false);

  // --- INITIALIZATION EFFECTS ---

  // ĐỘNG CƠ KHỞI TẠO CƠ SỞ DỮ LIỆU (INDEXEDDB INIT)
  useEffect(() => {
    const initPersistence = async () => {
      if (!FcDB) {
        console.error('[CoreState] FcDB not found');
        setIsDbReady(true);
        return;
      }
      try {
        await FcDB.init();
        const pool = await FcDB.get('fc_ai_harvest_pool');
        if (pool) setAiHarvestPool(pool);
        
        try {
          const viKeys = ['fc_data_vi', 'fc_current_level_vi', 'fc_current_topic_vi', 'fc_master_data_vi_vocab', 'fc_master_data_vi_sentence', 'fc_ai_memory_vi'];
          viKeys.forEach(k => localStorage.removeItem(k));
          await FcDB.set('fc_notebook_vi', []);
          await FcDB.set('fc_mastered_vi', []);
          const incorrectKey = STORAGE_KEYS.INCORRECT_LIST ? STORAGE_KEYS.INCORRECT_LIST + '_vi' : 'fc_incorrect_list_vi';
          await FcDB.set(incorrectKey, []);
          await FcDB.set('fc_global_retry_bag_vi', {});
        } catch(err) {
          console.warn('[CoreState] Silenced Cleanup Error:', err);
        }
        
        setIsDbReady(true);
        console.log('[CoreState] IndexedDB ready. Vietnamese deprecated.');
      } catch (e) {
        console.error('[CoreState] IndexedDB Init Error:', e);
        setIsDbReady(true);
      }
    };
    initPersistence();
  }, []);

  // 1. Load Fonts
  useEffect(() => {
    const googleId = 'fc-google-fonts';
    const googleUrl = 'https://fonts.googleapis.com/css2?family=Long+Cang&family=Noto+Serif+SC:wght@400;700&display=swap';
    const kaitiId = 'fc-kaiti-font';
    const kaitiUrl = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-lite-webfont@1.7.0/style.css';
    loadFont(googleId, googleUrl);
    loadFont(kaitiId, kaitiUrl);
  }, []);

  // 2. Load Voices
  useEffect(() => {
    const loadVoices = () => {
      if (window.speechSynthesis) {
        setVoices(window.speechSynthesis.getVoices());
      }
    };
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Lưu UI Lang riêng biệt
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.UI_LANG || 'fc_ui_lang', JSON.stringify(uiLang));
  }, [uiLang]);

  // 3. EFFECT: Đổi Ngôn Ngữ -> Tải các Sổ tay, Túi Nháp và Khởi tạo Level
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LANG || 'fc_lang', JSON.stringify(lang));
    
    const loadUserData = async () => {
      if (isDbReady && FcDB) {
        const savedNote = await FcDB.get('fc_notebook_' + lang) || [];
        const savedMaster = await FcDB.get('fc_mastered_' + lang) || [];
        const savedIncorrect = await FcDB.get((STORAGE_KEYS.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang) || [];
        const savedRetryBag = await FcDB.get('fc_global_retry_bag_' + lang) || {};
        setNotebook(savedNote);
        setMastered(savedMaster);
        setIncorrectList(savedIncorrect);
        setGlobalRetryBag(savedRetryBag);
      }
    };
    loadUserData();
    
    // Cầu dao bảo vệ: Chỉ reset các trạng thái khi THỰC SỰ đổi ngôn ngữ
    if (prevLangRef.current !== lang) {
      setCurrentCardIndex(0);
      setIsStudyingNotebook(false);
      setStudySourceName(null);
      aiQueueRef.current = [];
      localStorage.removeItem('fc_ai_memory');
      
      if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
        ExamEngine.clearVolatileMemory();
      }
      if (Utils && Utils.AiMemoryManager && typeof Utils.AiMemoryManager.clear === 'function') {
        Utils.AiMemoryManager.clear();
      }
      
      const defLvl = lang === 'zh' ? ['zh_level_1'] : ['en_level_4'];
      setCurrentLevel(parseArrayStorage('fc_current_level_' + lang, defLvl));
      setCurrentTopic(parseArrayStorage('fc_current_topic_' + lang, []));
      
      prevLangRef.current = lang;
    }
  }, [lang, isDbReady]);

  // ĐỘNG CƠ "VÒI NƯỚC" - ĐỒNG BỘ DỮ LIỆU ĐA CHIỀU (MULTI-SELECT MATRIX)
  useEffect(() => {
    if (isStudyingNotebook || studySourceName) return;
    
    const storageKey = `fc_master_data_${lang}_${dataMode}`;
    const masterData = Utils.safeJsonParse(storageKey, null);
    
    let targetCards = [];
    if (masterData) {
      // Cưỡng chế Mảng, đề phòng lỗi State bất thường
      const levelsArr = Array.isArray(currentLevel) ? currentLevel : (currentLevel ? [currentLevel] : []);
      const topicsArr = Array.isArray(currentTopic) ? currentTopic : (currentTopic ? [currentTopic] : []);
      
      // BƯỚC 1: Lọc theo Level - Gộp các mảng lại với nhau
      if (levelsArr.length === 0) {
        Object.values(masterData).forEach(arr => {
          if (Array.isArray(arr)) targetCards = targetCards.concat(arr);
        });
      } else {
        levelsArr.forEach(lv => {
          if (masterData[lv] && Array.isArray(masterData[lv])) {
            targetCards = targetCards.concat(masterData[lv]);
          }
        });
      }
      
      // BƯỚC 2: Lọc theo Topic
      if (topicsArr.length > 0) {
        targetCards = targetCards.filter(c => topicsArr.includes(c.topic));
      }
    }
    
    // Bơm vào màn hình và đồng bộ Storage
    if (targetCards.length > 0) {
      setCards(targetCards);
      Utils.safeLocalStorageSet('fc_data_' + lang, targetCards);
      setCurrentCardIndex(0);
    } else {
      setCards([]);
      Utils.safeLocalStorageSet('fc_data_' + lang, []);
      setCurrentCardIndex(0);
    }
  }, [lang, dataMode, currentLevel, currentTopic, isStudyingNotebook, studySourceName]);

  // 4. Persistence Effects
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SETTINGS || 'fc_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.API_KEY || 'fc_apikey', apiKey); }, [apiKey]);
  useEffect(() => { Utils.safeLocalStorageSet('fc_game_sessions', globalGameSessions); }, [globalGameSessions]);
  
  // SYSTEM LOGS PERSISTENCE
  useEffect(() => { Utils.safeLocalStorageSet('fc_system_logs', systemLogs); }, [systemLogs]);
  
  // AI CONFIG PERSISTENCE
  useEffect(() => { Utils.safeLocalStorageSet('fc_ai_config', aiConfig); }, [aiConfig]);
  
  // AI MODEL PERSISTENCE
  useEffect(() => { localStorage.setItem('fc_ai_model', aiModel); }, [aiModel]);
  
  // LAYOUT ALIGN PERSISTENCE
  useEffect(() => { localStorage.setItem('fc_layout_align', layoutAlign); }, [layoutAlign]);

  // LƯU TRỮ TRÊN INDEXEDDB (ASYNC)
  useEffect(() => {
    if (isDbReady && FcDB) FcDB.set('fc_ai_harvest_pool', aiHarvestPool);
  }, [aiHarvestPool, isDbReady]);
  
  useEffect(() => {
    if (isDbReady && FcDB) FcDB.set('fc_global_retry_bag_' + lang, globalRetryBag);
  }, [globalRetryBag, isDbReady, lang]);

  useEffect(() => { Utils.safeLocalStorageSet('fc_data_mode', dataMode); }, [dataMode]);
  useEffect(() => { Utils.safeLocalStorageSet('fc_current_level_' + lang, currentLevel); }, [currentLevel, lang]);
  useEffect(() => { Utils.safeLocalStorageSet('fc_current_topic_' + lang, currentTopic); }, [currentTopic, lang]);

  // 5. Shuffle Effect
  useEffect(() => {
    if (isShuffle && cards.length > 1) {
      setCards(prev => Utils.shuffleArray([...prev]));
      setCurrentCardIndex(0);
    }
  }, [isShuffle]);

  // 6. Auto-load API Key
  useEffect(() => {
    const savedSheetUrl = localStorage.getItem(STORAGE_KEYS.API_KEY_SHEET || 'fc_apikey_sheet');
    if (savedSheetUrl && savedSheetUrl.trim().length > 5) {
      Utils.fetchWithFallback(savedSheetUrl)
        .then(res => res.text())
        .then(text => {
          const keys = text.split(/[\n,]/).map(k => k.trim()).filter(k => k.length > 20 && !k.includes(' '));
          if (keys.length > 0) {
            Utils.safeLocalStorageSet('fc_apikey_pool', keys);
            setApiKey(keys[0]);
            console.log(`[System] Auto-set API Key from Sheet (Pool size: ${keys.length})`);
            if (window.globalShowToast) window.globalShowToast(`Đã cập nhật ${keys.length} API Key từ Sheet`, "success");
          }
        })
        .catch(e => console.warn("Auto load API Key failed:", e));
    }
  }, []);

  return {
    // State
    viewMode, lang, uiLang, cards, notebook, mastered, masteredCount: mastered.length, isStudyingNotebook,
    incorrectList, studySourceName, apiKey, totalTokens, aiHarvestPool, globalRetryBag, systemLogs,
    isDbReady, aiConfig, aiModel, layoutAlign,
    
    // Multi-dimensional State
    dataMode, setDataMode,
    currentLevel, setCurrentLevel,
    currentTopic, setCurrentTopic,
    
    // UI Toggles
    showSettings, showApiKeyModal, showNotebook, showManual, showLinkManager, showWordSelect, showMastered, showIncorrectModal,
    showAiChat, showHelp, showSaveLoadModal, showHanziSelector, showHanziWriter, currentHanziChar, showExamPoolManager, showAiConfigModal,
    wordSelectTarget, toast, isAiLoading, isAiModeLearn, isAiModeGame, resetPending,
    importUrl, defaultUrl, exportUrl, apiKeySheetUrl,
    
    // Playback & Game State
    currentCardIndex, isFlipped, isAutoPlaying, isShuffle, isAutoMode, isFlipLocked,
    isMuted, isGamePlaying, settings, voices, DEFAULT_SETTINGS, isContentHidden, isBatterySaverMode, gameSessions,
    
    // Setters
    setViewMode, setLang, setUiLang, setCards, setNotebook, setMastered, setIsStudyingNotebook,
    setIncorrectList, setStudySourceName, setApiKey, setTotalTokens, setAiHarvestPool, setGlobalRetryBag, setSystemLogs, setAiConfig, setAiModel, setLayoutAlign,
    setShowSettings, setShowApiKeyModal, setShowNotebook, setShowManual, setShowLinkManager, setShowWordSelect, setShowMastered, setShowIncorrectModal,
    setShowAiChat, setShowHelp, setShowSaveLoadModal, setShowHanziSelector, setShowHanziWriter, setCurrentHanziChar, setShowExamPoolManager, setShowAiConfigModal,
    setWordSelectTarget, setToast, setIsAiLoading, setIsAiModeLearn, setIsAiModeGame, setResetPending,
    setImportUrl, setDefaultUrl, setExportUrl, setApiKeySheetUrl,
    setCurrentCardIndex, setIsFlipped, setIsAutoPlaying, setIsShuffle, setIsAutoMode, setIsFlipLocked,
    setIsMuted, setIsGamePlaying, setSettings, setIsContentHidden, setIsBatterySaverMode, setGameSessions,
    
    // Refs
    audioTimeoutRef, autoPlayTimeoutRef, processingCardsRef, resetTimeoutRef, aiQueueRef, isAiQueueProcessing
  };
};