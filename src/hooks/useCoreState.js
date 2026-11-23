// ============================================================================
// FILE 75/85: src/hooks/useCoreState.js
// NGUỒN GỐC: Tầng 6 - Block 6.1 (Core State - Version 2.4)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 06:46 (GMT+7)
// NHIỆM VỤ: Quản lý toàn bộ State gốc, layoutAlign, khởi tạo & tự động di cư
//           4 Kho Master Data sang IndexedDB + RAM Mirror 0ms (FcDB),
//           vận hành Động cơ "Vòi nước" tách bạch tuyệt đối Từ Vựng <-> Câu Văn,
//           chốt chặn chống ghi đè chéo EN <-> CN, bảo vệ uiLang ('vi'|'en'|'zh'),
//           chống lỗi Regex link Publish CSV và giữ trạng thái Shuffle an toàn.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  STORAGE_KEYS,
  DEFAULT_API_KEY_SHEET,
  CONFIG_SAMPLES
} from '@/config/constants';
import {
  Utils,
  setMasterDataCache,
  getMasterDataCache,
  hasMasterDataCache
} from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { FcDB } from '@/services/db';
import { fetchWithFallback } from '@/services/geminiApi';
import { ExamEngine } from '@/engines/exam/index';

// Danh sách 4 kho Master Data 9 Levels (2 Ngôn ngữ x 2 Chế độ Từ Vựng / Câu Văn)
export const MASTER_DATA_KEYS = [
  'fc_master_data_en_vocab',
  'fc_master_data_en_sentence',
  'fc_master_data_zh_vocab',
  'fc_master_data_zh_sentence'
];

// Chuẩn hóa ngôn ngữ học (chỉ hỗ trợ en | zh)
const normalizeLang = (val) => (val === 'zh' ? 'zh' : 'en');

// Chuẩn hóa ngôn ngữ giao diện (hỗ trợ đầy đủ vi | en | zh)
const normalizeUiLang = (val) =>
  val === 'vi' || val === 'zh' || val === 'en' ? val : 'en';

// Chuẩn hóa chế độ dữ liệu (chỉ hỗ trợ vocab | sentence)
const normalizeDataMode = (val) => {
  const clean = typeof val === 'string' ? val.replace(/"/g, '').trim() : '';
  return clean === 'sentence' ? 'sentence' : 'vocab';
};

// Lấy cấp độ mặc định theo ngôn ngữ
const getDefaultLevelsForLang = (targetLang) =>
  targetLang === 'zh' ? ['zh_level_1'] : ['en_level_4'];

// Kiểm tra đối tượng Master Data hợp lệ (Plain Object có ít nhất 1 level chứa mảng thẻ)
const isValidMasterDataObject = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.values(obj).some((arr) => Array.isArray(arr) && arr.length > 0);
};

// Trình lấy FcDB an toàn
const getDbInstance = () =>
  FcDB || (typeof window !== 'undefined' ? window.FcDB : null);

// Hàm nạp Font chữ động cho Tiếng Trung / Thư pháp
const loadFont = (id, url) => {
  if (typeof document === 'undefined') return;
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

// [BẢN VÁ V2.1] Trình phân tích Storage thông minh, dọn dẹp rác chuỗi
const parseArrayStorage = (key, defaultArr) => {
  if (typeof localStorage === 'undefined') return defaultArr;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultArr;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) =>
            typeof item === 'string' ? item.trim() : String(item ?? '').trim()
          )
          .filter(Boolean);
      }
      if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
      return defaultArr;
    } catch {
      // Fallback cứu hộ: Lọc bỏ nháy kép và ngoặc vuông rác
      const cleanRaw = raw.replace(/["\\[\]]/g, '').trim();
      return cleanRaw ? [cleanRaw] : defaultArr;
    }
  } catch {
    return defaultArr;
  }
};

// Đọc chuỗi an toàn từ localStorage
const safeReadStringStorage = (key, fallback = '') => {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
};

// Chuẩn hóa URL Sheet thành endpoint GViz CSV (bảo vệ nguyên vẹn link Publish /d/e/.../pub?output=csv)
const resolveApiKeySheetFetchUrl = (rawUrl) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  const isPublishedOrCsv =
    /\/d\/e\//i.test(trimmed) ||
    trimmed.includes('/pub') ||
    trimmed.includes('output=csv') ||
    trimmed.includes('/gviz/tq');
  if (trimmed.includes('docs.google.com') && !isPublishedOrCsv) {
    const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1] && match[1].length > 10) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
    }
  }
  return trimmed;
};

export const DEFAULT_SETTINGS = {
  rate: 0.8,
  pitch: 1,
  selectedVoice: null,
  delayAfterRead: 1000,
  delayFlip: 2000,
  delayNext: 1500,
  repeatCount: 1,
  startSide: 'term',
  fontFamily: 'sans',
  fontSize: 3,
  backFontSize: 1.25,
  cardSize: 1,
  fontWeight: 'bold',
  srsEnabled: true,
  srsHard: '2d',
  srsGood: '4d',
  srsEasy: '7d'
};

export const DEFAULT_AI_CONFIG = {
  loadingTime: 22,
  delayMs: 2500,
  maxAmmo: 4,
  uiCooldown: 9
};

export const useCoreState = () => {
  // --- STATE DEFINITIONS ---
  const [viewMode, setViewMode] = useState('learn');
  const [lang, setLang] = useState(() => {
    const saved = Utils?.safeJsonParse(STORAGE_KEYS?.LANG || 'fc_lang', 'en');
    return normalizeLang(saved);
  });

  // Chốt chặn đồng bộ ngôn ngữ: Ngăn Effect lưu nhầm Level/Topic/RetryBag của ngôn ngữ cũ sang ngôn ngữ mới
  const prevLangRef = useRef(lang);
  const [syncedLang, setSyncedLang] = useState(lang);
  const [hydratedUserLang, setHydratedUserLang] = useState(null);
  const [isHarvestHydrated, setIsHarvestHydrated] = useState(false);

  const [uiLang, setUiLang] = useState(() => {
    const saved = Utils?.safeJsonParse(
      STORAGE_KEYS?.UI_LANG || 'fc_ui_lang',
      'en'
    );
    return normalizeUiLang(saved);
  });

  const [dataMode, setDataMode] = useState(() => {
    const saved = safeReadStringStorage('fc_data_mode', 'vocab');
    return normalizeDataMode(saved);
  });

  // [BẢN VÁ V2.3] BOOT HYDRATION DESYNC FIX - Khởi tạo Level với độ tin cậy 100%
  const [currentLevel, setCurrentLevel] = useState(() => {
    const def = getDefaultLevelsForLang(lang);
    const expectedPrefix = lang === 'zh' ? 'zh_level_' : 'en_level_';
    let initialVal = parseArrayStorage('fc_current_level_' + lang, null);

    // Quét dự phòng: Nếu chưa có trong storage chuẩn, thử tìm trong settings cũ
    if (!initialVal) {
      try {
        const settingsStr = safeReadStringStorage('fc_settings', '');
        if (settingsStr) {
          const settingsObj = JSON.parse(settingsStr);
          if (settingsObj?.currentLevel) {
            initialVal = Array.isArray(settingsObj.currentLevel)
              ? settingsObj.currentLevel
              : [settingsObj.currentLevel];
          }
        }
      } catch {
        // Bỏ qua lỗi JSON cũ
      }
    }

    // Lọc đúng cấp độ thuộc ngôn ngữ hiện hành (tránh nhiễm chéo en_level_* <-> zh_level_*)
    if (Array.isArray(initialVal)) {
      initialVal = initialVal.filter(
        (lv) => typeof lv === 'string' && lv.startsWith(expectedPrefix)
      );
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

  // INDEXEDDB ASYNC STATE & TÍN HIỆU PHIÊN BẢN KHO MASTER
  const [isDbReady, setIsDbReady] = useState(false);
  const [masterDataVersion, setMasterDataVersion] = useState(0);
  const bumpMasterDataVersion = useCallback(() => {
    setMasterDataVersion((v) => v + 1);
  }, []);

  const [aiHarvestPool, setAiHarvestPool] = useState({});
  const [globalRetryBag, setGlobalRetryBag] = useState({});

  // SYSTEM EVENT LOGS STATE
  const [systemLogs, setSystemLogs] = useState(() => {
    const logs = Utils?.safeJsonParse('fc_system_logs', []);
    return Array.isArray(logs) ? logs : [];
  });

  // Config & Token
  const [apiKey, setApiKey] = useState(() =>
    safeReadStringStorage(STORAGE_KEYS?.API_KEY || 'fc_apikey', '')
  );
  const [totalTokens, setTotalTokens] = useState(() => {
    const parsed = parseInt(safeReadStringStorage('fc_total_tokens', '0'), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const [aiConfig, setAiConfig] = useState(() => {
    const saved = Utils?.safeJsonParse('fc_ai_config', DEFAULT_AI_CONFIG);
    return {
      ...DEFAULT_AI_CONFIG,
      ...(saved && typeof saved === 'object' && !Array.isArray(saved)
        ? saved
        : {})
    };
  });

  // [V2.3] Bổ sung State quản lý Mô hình AI
  const [aiModel, setAiModel] = useState(
    () =>
      safeReadStringStorage('fc_ai_model', 'gemini-3.5-flash-lite') ||
      'gemini-3.5-flash-lite'
  );

  // [V2.4] Bổ sung State quản lý vị trí Không gian học (Responsive Layout Alignment)
  const [layoutAlign, setLayoutAlign] = useState(() => {
    const saved = safeReadStringStorage('fc_layout_align', 'center');
    return saved === 'left' || saved === 'right' ? saved : 'center';
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
  const [exportUrl, setExportUrl] = useState(() =>
    safeReadStringStorage(STORAGE_KEYS?.EXPORT_URL || 'fc_export_url', '')
  );
  const [apiKeySheetUrl, setApiKeySheetUrl] = useState(
    () =>
      safeReadStringStorage(
        STORAGE_KEYS?.API_KEY_SHEET || 'fc_apikey_sheet',
        ''
      ) ||
      DEFAULT_API_KEY_SHEET ||
      ''
  );
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

  // Quản lý Sessions đa ngôn ngữ (kiểm tra chặt Plain Object)
  const [globalGameSessions, setGlobalGameSessions] = useState(() => {
    const data = Utils?.safeJsonParse('fc_game_sessions', {});
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    if (data.quiz || data.match || data.scramble) return {};
    return data;
  });

  // Proxy các biến state cho riêng ngôn ngữ hiện tại (ổn định tham chiếu theo lang)
  const gameSessions = globalGameSessions[lang] || {};
  const setGameSessions = useCallback(
    (updater) => {
      setGlobalGameSessions((prev) => {
        const currentLangSessions = prev[lang] || {};
        const nextLangSessions =
          typeof updater === 'function' ? updater(currentLangSessions) : updater;
        return { ...prev, [lang]: nextLangSessions };
      });
    },
    [lang]
  );

  const [isMuted, setIsMuted] = useState(false);

  // Khởi tạo Settings kèm cơ chế tự làm sạch nếu bị nhiễm thông số lệch (VD: backFontSize = 26)
  const [settings, setSettings] = useState(() => {
    const raw = Utils?.safeJsonParse(
      STORAGE_KEYS?.SETTINGS || 'fc_settings',
      DEFAULT_SETTINGS
    );
    const merged = {
      ...DEFAULT_SETTINGS,
      ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})
    };
    if (typeof merged.backFontSize === 'number' && merged.backFontSize > 8) {
      merged.backFontSize = DEFAULT_SETTINGS.backFontSize;
    }
    if (typeof merged.fontSize === 'number' && merged.fontSize > 10) {
      merged.fontSize = DEFAULT_SETTINGS.fontSize;
    }
    return merged;
  });

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
  const userLoadSeqRef = useRef(0);
  const isShuffleRef = useRef(isShuffle);

  // Đồng bộ Ref trạng thái trộn bài để Động cơ Vòi nước đọc mà không bị double-shuffle
  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  // --- INITIALIZATION EFFECTS ---
  // ĐỘNG CƠ KHỞI TẠO CƠ SỞ DỮ LIỆU & TỰ ĐỘNG DI CƯ 4 KHO MASTER DATA (INDEXEDDB + RAM MIRROR)
  useEffect(() => {
    let cancelled = false;

    const hydrateLegacyMasterDataToRam = () => {
      if (typeof localStorage === 'undefined') return;
      MASTER_DATA_KEYS.forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (isValidMasterDataObject(parsed)) {
            setMasterDataCache(key, parsed);
          }
        } catch {
          // Bỏ qua bản ghi hỏng trên localStorage
        }
      });
    };

    const initPersistence = async () => {
      const dbInstance = getDbInstance();
      if (!dbInstance) {
        console.error(
          '[CoreState] FcDB not found. Falling back to RAM + LocalStorage.'
        );
        hydrateLegacyMasterDataToRam();
        if (!cancelled) {
          setIsHarvestHydrated(true);
          setMasterDataVersion((v) => v + 1);
          setIsDbReady(true);
        }
        return;
      }

      try {
        await dbInstance.init();

        // 1. Nạp Kho Thu Hoạch AI từ IndexedDB
        const pool = await dbInstance.get('fc_ai_harvest_pool');
        if (
          !cancelled &&
          pool &&
          typeof pool === 'object' &&
          !Array.isArray(pool)
        ) {
          setAiHarvestPool(pool);
        }

        // 2. Nạp & Tự động Di cư 4 Kho Master Data sang IndexedDB + RAM Mirror 0ms
        let migratedCount = 0;
        for (const key of MASTER_DATA_KEYS) {
          try {
            const dbData = await dbInstance.get(key);
            let legacyData = null;
            let hasLegacyKey = false;

            if (typeof localStorage !== 'undefined') {
              try {
                const rawLegacy = localStorage.getItem(key);
                if (rawLegacy !== null) {
                  hasLegacyKey = true;
                  if (rawLegacy.trim()) {
                    const parsed = JSON.parse(rawLegacy);
                    if (isValidMasterDataObject(parsed)) {
                      legacyData = parsed;
                    }
                  }
                }
              } catch {
                // Dữ liệu legacy bị cắt cụt/hỏng JSON
              }
            }

            if (isValidMasterDataObject(dbData)) {
              setMasterDataCache(key, dbData);
              // Đã có bản chuẩn trên IndexedDB -> Dọn sạch bản cũ khỏi localStorage giải phóng 5MB
              if (hasLegacyKey && typeof localStorage !== 'undefined') {
                try {
                  localStorage.removeItem(key);
                } catch {
                  // Bỏ qua lỗi xóa storage
                }
              }
            } else if (isValidMasterDataObject(legacyData)) {
              // Di cư tự động từ localStorage sang IndexedDB + nạp ngay vào RAM Cache
              setMasterDataCache(key, legacyData);
              await dbInstance.set(key, legacyData);
              migratedCount++;
              if (typeof localStorage !== 'undefined') {
                try {
                  localStorage.removeItem(key);
                } catch {
                  // Bỏ qua lỗi xóa storage
                }
              }
            } else if (hasLegacyKey && typeof localStorage !== 'undefined') {
              // Dọn bản ghi rỗng/hỏng còn sót trên localStorage
              try {
                localStorage.removeItem(key);
              } catch {
                // Bỏ qua lỗi xóa storage
              }
            }
          } catch (masterErr) {
            console.warn(
              `[CoreState] MasterData hydrate error (${key}):`,
              masterErr
            );
          }
        }

        // 3. Thanh trừng rác ngôn ngữ Tiếng Việt (vi) cũ
        try {
          const viKeys = [
            'fc_data_vi',
            'fc_current_level_vi',
            'fc_current_topic_vi',
            'fc_master_data_vi_vocab',
            'fc_master_data_vi_sentence',
            'fc_ai_memory_vi'
          ];
          if (typeof localStorage !== 'undefined') {
            viKeys.forEach((k) => {
              try {
                localStorage.removeItem(k);
              } catch {
                // Bỏ qua lỗi quyền truy cập
              }
            });
          }
          await dbInstance.set('fc_notebook_vi', []);
          await dbInstance.set('fc_mastered_vi', []);
          const incorrectKey =
            STORAGE_KEYS && STORAGE_KEYS.INCORRECT_LIST
              ? STORAGE_KEYS.INCORRECT_LIST + '_vi'
              : 'fc_incorrect_list_vi';
          await dbInstance.set(incorrectKey, []);
          await dbInstance.set('fc_global_retry_bag_vi', {});
        } catch (err) {
          console.warn('[CoreState] Silenced Cleanup Error:', err);
        }

        if (!cancelled) {
          setIsHarvestHydrated(true);
          setMasterDataVersion((v) => v + 1);
          setIsDbReady(true);
          console.log(
            `[CoreState] IndexedDB ready. MasterData RAM Mirror synced${
              migratedCount > 0 ? ` (migrated ${migratedCount} legacy stores)` : ''
            }.`
          );
        }
      } catch (e) {
        console.error('[CoreState] IndexedDB Init Error:', e);
        hydrateLegacyMasterDataToRam();
        if (!cancelled) {
          setIsHarvestHydrated(true);
          setMasterDataVersion((v) => v + 1);
          setIsDbReady(true);
        }
      }
    };

    initPersistence();
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Load Fonts
  useEffect(() => {
    const googleId = 'fc-google-fonts';
    const googleUrl =
      'https://fonts.googleapis.com/css2?family=Long+Cang&family=Noto+Serif+SC:wght@400;700&display=swap';
    const kaitiId = 'fc-kaiti-font';
    const kaitiUrl =
      'https://cdn.jsdelivr.net/npm/lxgw-wenkai-lite-webfont@1.7.0/style.css';
    loadFont(googleId, googleUrl);
    loadFont(kaitiId, kaitiUrl);
  }, []);

  // 2. Load Voices (sử dụng addEventListener để không ghi đè listener của module khác)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      try {
        setVoices(synth.getVoices() || []);
      } catch {
        setVoices([]);
      }
    };
    loadVoices();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadVoices);
      return () => synth.removeEventListener('voiceschanged', loadVoices);
    }
    synth.onvoiceschanged = loadVoices;
    return () => {
      if (synth.onvoiceschanged === loadVoices) {
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  // Lưu UI Lang riêng biệt (hỗ trợ đầy đủ vi | en | zh)
  useEffect(() => {
    Utils?.safeLocalStorageSet(
      STORAGE_KEYS?.UI_LANG || 'fc_ui_lang',
      JSON.stringify(normalizeUiLang(uiLang))
    );
  }, [uiLang]);

  // 3. EFFECT: Đổi Ngôn Ngữ -> Tải các Sổ tay, Túi Nháp và Khởi tạo Level/Topic an toàn
  useEffect(() => {
    let cancelled = false;
    Utils?.safeLocalStorageSet(
      STORAGE_KEYS?.LANG || 'fc_lang',
      JSON.stringify(lang)
    );

    const dbInstance = getDbInstance();
    const isLangChanged = prevLangRef.current !== lang;

    // Cầu dao bảo vệ: Chỉ reset các trạng thái khi THỰC SỰ đổi ngôn ngữ
    if (isLangChanged) {
      setHydratedUserLang(null);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      setIsContentHidden(false);
      setIsStudyingNotebook(false);
      setStudySourceName(null);
      aiQueueRef.current = [];
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('fc_ai_memory');
        } catch {
          // Bỏ qua lỗi storage
        }
      }

      if (
        ExamEngine &&
        typeof ExamEngine.clearVolatileMemory === 'function'
      ) {
        ExamEngine.clearVolatileMemory();
      }
      if (AiMemoryManager && typeof AiMemoryManager.clear === 'function') {
        AiMemoryManager.clear();
      }

      // Khởi tạo Level & Topic của ngôn ngữ mới (lọc đúng prefix ngôn ngữ)
      const defLvl = getDefaultLevelsForLang(lang);
      const expectedPrefix = lang === 'zh' ? 'zh_level_' : 'en_level_';
      const savedLevels = parseArrayStorage(
        'fc_current_level_' + lang,
        defLvl
      ).filter((lv) => typeof lv === 'string' && lv.startsWith(expectedPrefix));
      setCurrentLevel(savedLevels.length > 0 ? savedLevels : defLvl);
      setCurrentTopic(parseArrayStorage('fc_current_topic_' + lang, []));
      prevLangRef.current = lang;
      setSyncedLang(lang);
    }

    const loadUserData = async () => {
      if (!isDbReady) return;
      const seq = ++userLoadSeqRef.current;

      if (!dbInstance) {
        if (!cancelled && seq === userLoadSeqRef.current) {
          setHydratedUserLang(lang);
        }
        return;
      }

      try {
        const incorrectKey =
          (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang;
        const [savedNote, savedMaster, savedIncorrect, savedRetryBag] =
          await Promise.all([
            dbInstance.get('fc_notebook_' + lang),
            dbInstance.get('fc_mastered_' + lang),
            dbInstance.get(incorrectKey),
            dbInstance.get('fc_global_retry_bag_' + lang)
          ]);

        if (cancelled || seq !== userLoadSeqRef.current) return;

        setNotebook(Array.isArray(savedNote) ? savedNote : []);
        setMastered(Array.isArray(savedMaster) ? savedMaster : []);
        setIncorrectList(Array.isArray(savedIncorrect) ? savedIncorrect : []);
        setGlobalRetryBag(
          savedRetryBag &&
            typeof savedRetryBag === 'object' &&
            !Array.isArray(savedRetryBag)
            ? savedRetryBag
            : {}
        );
        setHydratedUserLang(lang);
      } catch (err) {
        console.warn(`[CoreState] Load user data failed (${lang}):`, err);
        if (!cancelled && seq === userLoadSeqRef.current) {
          setHydratedUserLang(lang);
        }
      }
    };

    loadUserData();
    return () => {
      cancelled = true;
    };
  }, [lang, isDbReady]);

  // [ĐẠI PHẪU VER 1.1] ĐỘNG CƠ "VÒI NƯỚC" - ĐỒNG BỘ DỮ LIỆU ĐA CHIỀU (TÁCH BẠCH 100% VOCAB <-> SENTENCE)
  useEffect(() => {
    if (isStudyingNotebook || studySourceName) return;
    // Chờ ngôn ngữ đồng bộ xong Level/Topic để không lọc nhầm bằng bộ lọc của ngôn ngữ cũ
    if (syncedLang !== lang) return;

    const safeMode = normalizeDataMode(dataMode);
    const storageKey = `fc_master_data_${lang}_${safeMode}`;

    // Chờ IndexedDB nạp RAM Mirror hoàn tất lần đầu (tránh nháy màn hình trống hoặc xóa nhầm fc_data_${lang})
    if (!isDbReady && !hasMasterDataCache(storageKey)) return;

    const masterData =
      getMasterDataCache(storageKey, null) ||
      Utils?.safeJsonParse(storageKey, null);

    let targetCards = [];

    if (isValidMasterDataObject(masterData)) {
      // Cưỡng chế Mảng, đề phòng lỗi State bất thường
      const levelsArr = Array.isArray(currentLevel)
        ? currentLevel
        : currentLevel
        ? [currentLevel]
        : [];
      const topicsArr = Array.isArray(currentTopic)
        ? currentTopic
        : currentTopic
        ? [currentTopic]
        : [];

      // BƯỚC 1: Lọc theo Level - Gộp các mảng lại với nhau
      if (levelsArr.length === 0) {
        Object.values(masterData).forEach((arr) => {
          if (Array.isArray(arr)) targetCards = targetCards.concat(arr);
        });
      } else {
        levelsArr.forEach((lv) => {
          if (masterData[lv] && Array.isArray(masterData[lv])) {
            targetCards = targetCards.concat(masterData[lv]);
          }
        });
      }

      // BƯỚC 2: Lọc theo Topic
      if (topicsArr.length > 0) {
        targetCards = targetCards.filter((c) => topicsArr.includes(c.topic));
      }
    } else {
      // [CHỐT CHẶN CHỐNG NHIỄM CHÉO]
      // Tuyệt đối KHÔNG đọc ngược fc_data_${lang} dùng chung (gây trộn Câu Văn <-> Từ Vựng).
      // Chỉ hiển thị bộ thẻ mẫu CONFIG_SAMPLES khi người dùng lần đầu mở App (chưa nạp cả 2 kho vocab & sentence)
      // và đang ở tab Từ Vựng (vocab).
      const vocabKey = `fc_master_data_${lang}_vocab`;
      const sentenceKey = `fc_master_data_${lang}_sentence`;
      const hasAnyMasterForLang =
        isValidMasterDataObject(
          getMasterDataCache(vocabKey, null) ||
            Utils?.safeJsonParse(vocabKey, null)
        ) ||
        isValidMasterDataObject(
          getMasterDataCache(sentenceKey, null) ||
            Utils?.safeJsonParse(sentenceKey, null)
        );

      if (
        !hasAnyMasterForLang &&
        safeMode === 'vocab' &&
        CONFIG_SAMPLES?.[lang]?.cards
      ) {
        targetCards = CONFIG_SAMPLES[lang].cards;
      }
    }

    // Luôn lưu bản gốc chưa xáo trộn cho fc_data_${lang} để khi tắt Shuffle vẫn về đúng thứ tự gốc.
    // Nếu bộ thẻ quá lớn vượt trần localStorage (VD: chọn cả 9 Level), xóa khóa cũ để chống đọc nhầm dữ liệu tab trước.
    const savedFlat = Utils?.safeLocalStorageSet
      ? Utils.safeLocalStorageSet('fc_data_' + lang, targetCards)
      : false;
    if (savedFlat === false && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('fc_data_' + lang);
      } catch {
        // Bỏ qua lỗi xóa storage
      }
    }

    // Nếu người dùng đang bật chế độ Trộn bài (isShuffle), tự động xáo trộn bộ thẻ mới hiển thị
    const displayCards =
      isShuffleRef.current && targetCards.length > 1 && Utils?.shuffleArray
        ? Utils.shuffleArray(targetCards)
        : targetCards;

    setCards(displayCards);
    setCurrentCardIndex(0);
    setIsFlipped(false);
  }, [
    lang,
    syncedLang,
    dataMode,
    currentLevel,
    currentTopic,
    isStudyingNotebook,
    studySourceName,
    isDbReady,
    masterDataVersion
  ]);

  // 4. Persistence Effects (an toàn Quota & chống ghi đè chéo đa ngôn ngữ)
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    Utils?.safeLocalStorageSet(
      STORAGE_KEYS?.SETTINGS || 'fc_settings',
      settings
    );
  }, [settings]);

  useEffect(() => {
    Utils?.safeLocalStorageSet(STORAGE_KEYS?.API_KEY || 'fc_apikey', apiKey);
  }, [apiKey]);

  useEffect(() => {
    Utils?.safeLocalStorageSet('fc_game_sessions', globalGameSessions);
  }, [globalGameSessions]);

  // SYSTEM LOGS PERSISTENCE
  useEffect(() => {
    Utils?.safeLocalStorageSet('fc_system_logs', systemLogs);
  }, [systemLogs]);

  // AI CONFIG PERSISTENCE
  useEffect(() => {
    Utils?.safeLocalStorageSet('fc_ai_config', aiConfig);
  }, [aiConfig]);

  // [V2.3] AI MODEL PERSISTENCE
  useEffect(() => {
    Utils?.safeLocalStorageSet('fc_ai_model', aiModel);
  }, [aiModel]);

  // [V2.4] LAYOUT ALIGN PERSISTENCE
  useEffect(() => {
    Utils?.safeLocalStorageSet('fc_layout_align', layoutAlign);
  }, [layoutAlign]);

  // LƯU TRỮ TRÊN INDEXEDDB (ASYNC - CHỐNG GHI ĐÈ KHI CHƯA HYDRATE XONG)
  useEffect(() => {
    const dbInstance = getDbInstance();
    if (isDbReady && isHarvestHydrated && dbInstance) {
      Promise.resolve(dbInstance.set('fc_ai_harvest_pool', aiHarvestPool)).catch(
        (err) => console.warn('[CoreState] Persist aiHarvestPool failed:', err)
      );
    }
  }, [aiHarvestPool, isDbReady, isHarvestHydrated]);

  useEffect(() => {
    const dbInstance = getDbInstance();
    // Chốt chặn tuyệt đối: Chỉ lưu Túi Nháp xuống IndexedDB khi đã nạp đúng dữ liệu của `lang` hiện tại
    if (isDbReady && hydratedUserLang === lang && dbInstance) {
      Promise.resolve(
        dbInstance.set('fc_global_retry_bag_' + lang, globalRetryBag)
      ).catch((err) =>
        console.warn(`[CoreState] Persist retryBag (${lang}) failed:`, err)
      );
    }
  }, [globalRetryBag, isDbReady, hydratedUserLang, lang]);

  useEffect(() => {
    Utils?.safeLocalStorageSet('fc_data_mode', normalizeDataMode(dataMode));
  }, [dataMode]);

  useEffect(() => {
    if (syncedLang !== lang) return;
    Utils?.safeLocalStorageSet('fc_current_level_' + lang, currentLevel);
  }, [currentLevel, lang, syncedLang]);

  useEffect(() => {
    if (syncedLang !== lang) return;
    Utils?.safeLocalStorageSet('fc_current_topic_' + lang, currentTopic);
  }, [currentTopic, lang, syncedLang]);

  // 5. Shuffle Effect
  useEffect(() => {
    if (isShuffle) {
      setCards((prev) =>
        Array.isArray(prev) && prev.length > 1 && Utils?.shuffleArray
          ? Utils.shuffleArray(prev)
          : prev
      );
      setCurrentCardIndex(0);
      setIsFlipped(false);
    }
  }, [isShuffle]);

  // 6. Auto-load API Key (hỗ trợ chuẩn GViz & Publish CSV, lọc regex chặt & khử trùng lặp)
  useEffect(() => {
    let cancelled = false;
    const savedSheetUrl = safeReadStringStorage(
      STORAGE_KEYS?.API_KEY_SHEET || 'fc_apikey_sheet',
      ''
    );
    const fetchFn = fetchWithFallback || Utils?.fetchWithFallback;
    if (
      savedSheetUrl &&
      savedSheetUrl.trim().length > 5 &&
      typeof fetchFn === 'function'
    ) {
      const targetUrl = resolveApiKeySheetFetchUrl(savedSheetUrl);
      fetchFn(targetUrl)
        .then((res) => {
          if (!res || !res.ok) throw new Error(`HTTP ${res?.status || 'ERR'}`);
          return res.text();
        })
        .then((text) => {
          if (cancelled || !text || text.trim().startsWith('<')) return;
          const keys = Array.from(
            new Set(
              text
                .split(/[\r\n,]+/)
                .map((k) => k.replace(/^["'\s]+|["'\s]+$/g, ''))
                .filter((k) => /^[A-Za-z0-9_-]{20,}$/.test(k))
            )
          );
          if (keys.length > 0) {
            Utils?.safeLocalStorageSet('fc_apikey_pool', keys);
            setApiKey(keys[0]);
            console.log(
              `[System] Auto-set API Key from Sheet (Pool size: ${keys.length})`
            );
            if (typeof window !== 'undefined' && window.globalShowToast) {
              window.globalShowToast(
                `Đã cập nhật ${keys.length} API Key từ Sheet`,
                'success'
              );
            }
          }
        })
        .catch((e) => console.warn('Auto load API Key failed:', e));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    // State
    viewMode,
    lang,
    uiLang,
    cards,
    notebook,
    mastered,
    masteredCount: mastered.length,
    isStudyingNotebook,
    incorrectList,
    studySourceName,
    apiKey,
    totalTokens,
    aiHarvestPool,
    globalRetryBag,
    systemLogs,
    isDbReady,
    masterDataVersion,
    bumpMasterDataVersion,
    aiConfig,
    aiModel,
    layoutAlign,
    // Multi-dimensional State
    dataMode,
    setDataMode,
    currentLevel,
    setCurrentLevel,
    currentTopic,
    setCurrentTopic,
    // UI Toggles
    showSettings,
    showApiKeyModal,
    showNotebook,
    showManual,
    showLinkManager,
    showWordSelect,
    showMastered,
    showIncorrectModal,
    showAiChat,
    showHelp,
    showSaveLoadModal,
    showHanziSelector,
    showHanziWriter,
    currentHanziChar,
    showExamPoolManager,
    showAiConfigModal,
    wordSelectTarget,
    toast,
    isAiLoading,
    isAiModeLearn,
    isAiModeGame,
    resetPending,
    importUrl,
    defaultUrl,
    exportUrl,
    apiKeySheetUrl,
    currentCardIndex,
    isFlipped,
    isAutoPlaying,
    isShuffle,
    isAutoMode,
    isFlipLocked,
    isMuted,
    isGamePlaying,
    settings,
    voices,
    DEFAULT_SETTINGS,
    isContentHidden,
    isBatterySaverMode,
    gameSessions,
    // Setters
    setViewMode,
    setLang,
    setUiLang,
    setCards,
    setNotebook,
    setMastered,
    setIsStudyingNotebook,
    setIncorrectList,
    setStudySourceName,
    setApiKey,
    setTotalTokens,
    setAiHarvestPool,
    setGlobalRetryBag,
    setSystemLogs,
    setAiConfig,
    setAiModel,
    setLayoutAlign,
    setShowSettings,
    setShowApiKeyModal,
    setShowNotebook,
    setShowManual,
    setShowLinkManager,
    setShowWordSelect,
    setShowMastered,
    setShowIncorrectModal,
    setShowAiChat,
    setShowHelp,
    setShowSaveLoadModal,
    setShowHanziSelector,
    setShowHanziWriter,
    setCurrentHanziChar,
    setShowExamPoolManager,
    setShowAiConfigModal,
    setWordSelectTarget,
    setToast,
    setIsAiLoading,
    setIsAiModeLearn,
    setIsAiModeGame,
    setResetPending,
    setImportUrl,
    setDefaultUrl,
    setExportUrl,
    setApiKeySheetUrl,
    setCurrentCardIndex,
    setIsFlipped,
    setIsAutoPlaying,
    setIsShuffle,
    setIsAutoMode,
    setIsFlipLocked,
    setIsMuted,
    setIsGamePlaying,
    setSettings,
    setIsContentHidden,
    setIsBatterySaverMode,
    setGameSessions,
    // Refs
    audioTimeoutRef,
    autoPlayTimeoutRef,
    processingCardsRef,
    resetTimeoutRef,
    aiQueueRef,
    isAiQueueProcessing
  };
};

export const Block6_1_useCoreState = useCoreState;

if (typeof window !== 'undefined') {
  window.Block6_1_useCoreState = useCoreState;
  window.useCoreState = useCoreState;
}

export default useCoreState;