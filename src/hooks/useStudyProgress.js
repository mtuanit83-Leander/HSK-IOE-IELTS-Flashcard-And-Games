// ============================================================================
// FILE 78/85: src/hooks/useStudyProgress.js
// NGUỒN GỐC: Tầng 6 - Block 6.5 (Study Progress Logic - Version 1.02)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 16:48 (GMT+7)
// NHIỆM VỤ: Chuyên trách quản lý Hồ sơ học thuật của người dùng (Sổ tay,
//           Đã thuộc, Lỗi sai) và Thuật toán SRS.
//           Nâng cấp Ver 1.2 (Đồng bộ chuỗi 5 Hooks — Vá trọn SP1 & SP2):
//           1. [SP1] Bảo toàn 100% thứ tự gốc `fc_data_${lang}` khi đang bật
//              Trộn bài (`isShuffle === true`) trong toàn bộ 4 luồng:
//              `handleMarkMastered`, `handleRestoreMastered`,
//              `handleRestoreAllMastered` và `syncCardSrsAcrossStores`
//              (chỉ vá cục bộ trên bộ thẻ gốc, không ghi đè mảng đã trộn).
//           2. [SP2] Nâng cấp `resolveActiveApiKey` quét đủ 4 tầng chuẩn hệ thống
//              (`preferredKey` -> `STORAGE_KEYS.API_KEY` (`fc_gemini_api_key`)
//              -> `fc_apikey` (legacy) -> `fc_paid_apikey` -> `fc_apikey_pool`),
//              đồng bộ 100% với `useAiLogic Ver 1.4` & `gameHelpers`.
//           3. Chuẩn hóa JSDoc toàn tuyến (`0 Problems` `tsc --noEmit`),
//              giữ nguyên 0 CRITICAL StrictMode, 0 Lost Update, Local-First
//              Lookup 6 nguồn, tuyệt đối không gọi `bumpMasterDataVersion()`.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';

// ============================================================================
// MODULE HELPERS THUẦN KHIẾT (PURE & IMMUTABLE)
// ============================================================================

/**
 * Chuẩn hóa ngôn ngữ học hợp lệ của hệ thống ('en' | 'zh')
 * @param {any} lang
 * @returns {'en' | 'zh'}
 */
const normalizeLang = (lang) => (lang === 'zh' ? 'zh' : 'en');

/**
 * Chuẩn hóa chế độ dữ liệu hợp lệ ('vocab' | 'sentence', phòng thủ chuỗi số nhiều)
 * @param {any} mode
 * @returns {'vocab' | 'sentence'}
 */
const normalizeDataMode = (mode) =>
  mode === 'sentence' || mode === 'sentences' ? 'sentence' : 'vocab';

/**
 * Chuẩn hóa khóa văn bản theo Unicode NFC + trim + lowercase (đồng bộ 1:1 useAppLogic Ver 1.1)
 * @param {any} val
 * @returns {string}
 */
const normalizeKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

/**
 * Trích xuất mã ID chuẩn hóa của thẻ (nếu có)
 * @param {any} card
 * @returns {string}
 */
const getNormalizedCardId = (card) => {
  if (!card || card.id === undefined || card.id === null) return '';
  return String(card.id).trim();
};

/**
 * Đọc thống nhất danh sách mảng từ latestStateRef / coreRef
 * @param {Record<string, any> | null | undefined} activeCore
 * @param {Record<string, any> | null | undefined} activeState
 * @param {string} key
 * @returns {any[]}
 */
const getLiveList = (activeCore, activeState, key) => {
  if (activeState && Array.isArray(activeState[key])) {
    return activeState[key];
  }
  if (activeCore && Array.isArray(activeCore[key])) {
    return activeCore[key];
  }
  return [];
};

/**
 * Đọc thống nhất cờ chế độ Ôn tập (Sổ tay / Lỗi sai)
 * @param {Record<string, any> | null | undefined} activeCore
 * @param {Record<string, any> | null | undefined} activeState
 * @returns {boolean}
 */
const getIsReviewMode = (activeCore, activeState) =>
  Boolean(
    activeState?.isStudyingNotebook ||
      activeCore?.isStudyingNotebook ||
      activeState?.studySourceName ||
      activeCore?.studySourceName
  );

/**
 * [SP1] Đọc thống nhất cờ Trộn bài (isShuffle) từ coreRef / latestStateRef
 * @param {Record<string, any> | null | undefined} activeCore
 * @param {Record<string, any> | null | undefined} activeState
 * @returns {boolean}
 */
const getIsShuffleMode = (activeCore, activeState) =>
  Boolean(activeCore?.isShuffle ?? activeState?.isShuffle);

/**
 * Đối khớp thẻ an toàn chống đụng độ từ đồng âm:
 * - Khi CẢ 2 bên đều có id -> chỉ so khớp theo id (cấm fallthrough sang term)
 * - Chỉ fallback theo term chuẩn NFC khi ít nhất 1 bên không có id
 * @param {any} card
 * @param {string} targetId
 * @param {string} targetTermKey
 * @returns {boolean}
 */
const isMatchingCard = (card, targetId, targetTermKey) => {
  if (!card || typeof card !== 'object') return false;
  const cardId = getNormalizedCardId(card);
  if (targetId && cardId) {
    return cardId === targetId;
  }
  if (targetTermKey) {
    const cardTermKey = normalizeKey(card.term);
    if (cardTermKey && cardTermKey === targetTermKey) return true;
  }
  return false;
};

/**
 * Làm sạch chuỗi API Key (bóc dấu ngoặc kép/đơn và khoảng trắng thừa)
 * @param {any} val
 * @returns {string}
 */
const cleanApiKeyString = (val) =>
  typeof val === 'string' ? val.replace(/["'\s]/g, '').trim() : '';

/**
 * Đọc chuỗi khóa đơn từ localStorage (chỉ đọc, hỗ trợ cả chuỗi thô lẫn chuỗi JSON)
 * @param {string} key
 * @returns {string}
 */
const readSafeStorageString = (key) => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return '';
  }
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === 'string' ? parsed.trim() : '';
      } catch {
        return trimmed.replace(/^"+|"+$/g, '').trim();
      }
    }
    return trimmed;
  } catch {
    return '';
  }
};

/**
 * [VER 1.2 - DIỆT SP2] Quét API Key đủ 4 tầng tương thích kép:
 * preferredKey -> STORAGE_KEYS.API_KEY (fc_gemini_api_key) -> fc_apikey (legacy) -> fc_paid_apikey -> fc_apikey_pool
 * @param {string} [preferredKey='']
 * @returns {string}
 */
const resolveActiveApiKey = (preferredKey = '') => {
  const fromPreferred = cleanApiKeyString(preferredKey);
  if (fromPreferred.length >= 10) return fromPreferred;

  const primaryStorageKey = STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key';
  const fromPrimary = cleanApiKeyString(readSafeStorageString(primaryStorageKey));
  if (fromPrimary.length >= 10) return fromPrimary;

  if (primaryStorageKey !== 'fc_apikey') {
    const fromLegacy = cleanApiKeyString(readSafeStorageString('fc_apikey'));
    if (fromLegacy.length >= 10) return fromLegacy;
  }

  const fromPaid = cleanApiKeyString(readSafeStorageString('fc_paid_apikey'));
  if (fromPaid.length >= 10) return fromPaid;

  const pool =
    Utils && typeof Utils.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_apikey_pool', [])
      : [];
  if (Array.isArray(pool)) {
    for (const entry of pool) {
      const candidate =
        typeof entry === 'string'
          ? cleanApiKeyString(entry)
          : entry && typeof entry === 'object'
          ? cleanApiKeyString(entry.key)
          : '';
      if (candidate.length >= 10) {
        return candidate;
      }
    }
  }
  return '';
};

/**
 * Ghi IndexedDB an toàn kèm try/catch chống Unhandled Promise Rejection
 * @param {string} key
 * @param {any} value
 * @param {string} [label=key]
 * @returns {Promise<boolean>}
 */
const safeDbSet = async (key, value, label = key) => {
  if (!FcDB || typeof FcDB.set !== 'function') return false;
  try {
    await FcDB.set(key, value);
    return true;
  } catch (err) {
    console.warn(`[useStudyProgress] FcDB.set(${label}) failed:`, err);
    return false;
  }
};

/**
 * Tính điểm độ giàu dữ liệu của một thẻ để ưu tiên chọn bản đầy đủ khi Local-First Lookup
 * @param {any} card
 * @returns {number}
 */
const getCardRichnessScore = (card) => {
  if (!card || typeof card !== 'object') return 0;
  let score = 0;
  if (typeof card.definition === 'string' && card.definition.trim()) score += 4;
  if (typeof card.pronunciation === 'string' && card.pronunciation.trim()) score += 2;
  if (typeof card.example === 'string' && card.example.trim()) score += 2;
  if (typeof card.analysis === 'string' && card.analysis.trim()) score += 1;
  if (typeof card.image === 'string' && card.image.trim()) score += 1;
  return score;
};

/**
 * Gom toàn bộ thẻ từ 6 nguồn nội bộ (Active View + mastered + incorrectList + fc_data_ + 2 Kho Master Lai)
 * @param {any} targetLang
 * @param {any[]} [activeViewCards=[]]
 * @param {any[][]} [extraDecks=[]]
 * @returns {Map<string, any>}
 */
const buildGlobalLookupMap = (
  targetLang,
  activeViewCards = [],
  extraDecks = []
) => {
  const safeLang = normalizeLang(targetLang);
  /** @type {Map<string, any>} */
  const lookupMap = new Map();

  /** @param {any} card */
  const registerCard = (card) => {
    if (!card || typeof card !== 'object') return;
    const key = normalizeKey(card.term);
    if (!key) return;
    const existing = lookupMap.get(key);
    if (!existing || getCardRichnessScore(card) > getCardRichnessScore(existing)) {
      lookupMap.set(key, card);
    }
  };

  if (Array.isArray(activeViewCards)) {
    activeViewCards.forEach(registerCard);
  }

  if (Array.isArray(extraDecks)) {
    extraDecks.forEach((deck) => {
      if (Array.isArray(deck)) {
        deck.forEach(registerCard);
      }
    });
  }

  if (Utils && typeof Utils.safeJsonParse === 'function') {
    const activeDeck = Utils.safeJsonParse(`fc_data_${safeLang}`, []);
    if (Array.isArray(activeDeck)) {
      activeDeck.forEach(registerCard);
    }

    ['vocab', 'sentence'].forEach((mode) => {
      const masterData = Utils.safeJsonParse(
        `fc_master_data_${safeLang}_${mode}`,
        null
      );
      if (
        masterData &&
        typeof masterData === 'object' &&
        !Array.isArray(masterData)
      ) {
        Object.values(masterData).forEach((levelArr) => {
          if (Array.isArray(levelArr)) {
            levelArr.forEach(registerCard);
          }
        });
      }
    });
  }

  return lookupMap;
};

/**
 * Áp dụng biến đổi thuần khiết & bất biến lên một mảng thẻ phẳng
 * @param {any[]} list
 * @param {string} targetId
 * @param {string} targetTermKey
 * @param {(card: any) => any} transformFn
 * @returns {{ list: any[], changed: boolean }}
 */
const applyTransformToList = (list, targetId, targetTermKey, transformFn) => {
  const safeList = Array.isArray(list) ? list : [];
  if (safeList.length === 0) {
    return { list: safeList, changed: false };
  }

  let changed = false;
  const nextList = safeList.map((card) => {
    if (isMatchingCard(card, targetId, targetTermKey)) {
      changed = true;
      return transformFn(card);
    }
    return card;
  });

  return { list: changed ? nextList : safeList, changed };
};

/**
 * Áp dụng thao tác lọc xóa thuần khiết & bất biến lên một mảng thẻ phẳng
 * @param {any[]} list
 * @param {string} targetId
 * @param {string} targetTermKey
 * @returns {{ list: any[], changed: boolean }}
 */
const applyRemoveFromList = (list, targetId, targetTermKey) => {
  const safeList = Array.isArray(list) ? list : [];
  if (safeList.length === 0 || (!targetId && !targetTermKey)) {
    return { list: safeList, changed: false };
  }

  const nextList = safeList.filter(
    (card) => !isMatchingCard(card, targetId, targetTermKey)
  );
  const changed = nextList.length !== safeList.length;
  return { list: changed ? nextList : safeList, changed };
};

/**
 * Áp dụng ghi nhận câu sai thuần khiết & bất biến (hỗ trợ cả đơn lẻ lẫn batch nhiều thẻ)
 * @param {any[]} list
 * @param {Array<{ card: any, cardId: string, termKey: string, timestamp: number }>} entries
 * @returns {{ list: any[], changed: boolean }}
 */
const applyUpsertIncorrectList = (list, entries) => {
  const safeList = Array.isArray(list) ? list : [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return { list: safeList, changed: false };
  }

  /** @type {any[] | null} */
  let nextList = null;
  let changed = false;

  for (const entry of entries) {
    const working = nextList || safeList;
    const idx = working.findIndex((c) =>
      isMatchingCard(c, entry.cardId, entry.termKey)
    );
    if (!nextList) {
      nextList = [...safeList];
    }
    if (idx > -1) {
      nextList[idx] = {
        ...nextList[idx],
        count: (nextList[idx].count || 1) + 1,
        lastWrong: entry.timestamp
      };
    } else {
      nextList.push({
        ...entry.card,
        count: 1,
        lastWrong: entry.timestamp
      });
    }
    changed = true;
  }

  return { list: changed && nextList ? nextList : safeList, changed };
};

/**
 * Áp dụng biến đổi thuần khiết & bất biến lên Kho Master Lai dạng { [levelKey]: Card[] }
 * @param {any} masterData
 * @param {string} targetId
 * @param {string} targetTermKey
 * @param {(card: any) => any} transformFn
 * @returns {{ masterData: any, changed: boolean }}
 */
const applyTransformToMasterData = (
  masterData,
  targetId,
  targetTermKey,
  transformFn
) => {
  if (!masterData || typeof masterData !== 'object' || Array.isArray(masterData)) {
    return { masterData, changed: false };
  }

  let changed = false;
  /** @type {Record<string, any> | null} */
  let nextMaster = null;

  const levelKeys = Object.keys(masterData);
  for (const levelKey of levelKeys) {
    const levelArr = masterData[levelKey];
    if (!Array.isArray(levelArr) || levelArr.length === 0) continue;

    const { list: nextLevelArr, changed: levelChanged } = applyTransformToList(
      levelArr,
      targetId,
      targetTermKey,
      transformFn
    );
    if (levelChanged) {
      if (!nextMaster) {
        nextMaster = { ...masterData };
      }
      nextMaster[levelKey] = nextLevelArr;
      changed = true;
    }
  }

  return {
    masterData: changed && nextMaster ? nextMaster : masterData,
    changed
  };
};

// ============================================================================
// MAIN HOOK: useStudyProgress
// ============================================================================

/**
 * Hook quản lý Hồ sơ học thuật (Sổ tay, Đã thuộc, Lỗi sai) và Thuật toán SRS
 * @param {Record<string, any>} core
 * @param {import('react').MutableRefObject<any>} latestStateRef
 * @param {Record<string, any>} [callbacks={}]
 */
export const useStudyProgress = (core, latestStateRef, callbacks = {}) => {
  // Giữ tham chiếu mới nhất tới core & callbacks để toàn bộ action có danh tính ổn định
  /** @type {import('react').MutableRefObject<any>} */
  const coreRef = useRef(core);
  coreRef.current = core;

  /** @type {import('react').MutableRefObject<any>} */
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Hàng đợi lưu trữ thống nhất sau commit cho SRS & incorrectList (0 CRITICAL StrictMode, 0 Lost Update)
  /** @type {import('react').MutableRefObject<Array<any>>} */
  const pendingPersistTasksRef = useRef([]);
  const [persistSeq, setPersistSeq] = useState(0);

  // Helper phát thông báo an toàn
  const notifyToast = useCallback(
    /**
     * @param {string} msg
     * @param {string} [type='success']
     */
    (msg, type = 'success') => {
      const fn = callbacksRef.current?.showToast;
      if (typeof fn === 'function') {
        fn(msg, type);
      }
    },
    []
  );

  // ==========================================================================
  // 0. HIỆU ỨNG ĐỒNG BỘ LƯU TRỮ SAU KHI REACT COMMIT (SRS + INCORRECT PIPELINE)
  // ==========================================================================
  useEffect(() => {
    if (pendingPersistTasksRef.current.length === 0) return;

    // Rút cạn hàng đợi ngay đầu effect (idempotent & miễn nhiễm hoàn toàn với React bail-out)
    const tasks = pendingPersistTasksRef.current.splice(0);
    const activeCore = coreRef.current || {};
    const activeState = latestStateRef?.current || {};
    const currentLang = normalizeLang(activeCore.lang ?? activeState.lang);
    const currentIsReviewMode = getIsReviewMode(activeCore, activeState);
    const currentIsShuffle = getIsShuffleMode(activeCore, activeState);
    const dbReady = Boolean(activeCore.isDbReady ?? activeState.isDbReady);

    /** @type {Set<string>} */
    const dirtyNotebookLangs = new Set();
    /** @type {Set<string>} */
    const dirtyIncorrectLangs = new Set();
    /** @type {Map<string, Array<any>>} */
    const crossLangNotebookOps = new Map();
    /** @type {Map<string, Array<any>>} */
    const crossLangIncorrectOps = new Map();

    for (const task of tasks) {
      if (task.type === 'srs') {
        const {
          targetLang,
          targetMode,
          isReviewMode,
          isShuffle,
          cardId,
          cardTermKey,
          transformCardFn,
          syncNotebook,
          syncIncorrect
        } = task;

        // A. Đồng bộ bộ thẻ phẳng fc_data_${targetLang} (bảo vệ thứ tự gốc khi ở Review Mode hoặc đang Shuffle)
        if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
          const dataKey = `fc_data_${targetLang}`;
          const savedMainDeck =
            typeof Utils.safeJsonParse === 'function'
              ? Utils.safeJsonParse(dataKey, null)
              : null;

          if (Array.isArray(savedMainDeck) && savedMainDeck.length > 0) {
            const { list: updatedMain, changed } = applyTransformToList(
              savedMainDeck,
              cardId,
              cardTermKey,
              transformCardFn
            );
            if (changed) {
              Utils.safeLocalStorageSet(dataKey, updatedMain);
            }
          } else if (
            !isReviewMode &&
            !currentIsReviewMode &&
            !isShuffle &&
            !currentIsShuffle &&
            targetLang === currentLang
          ) {
            const liveCards = getLiveList(activeCore, activeState, 'cards');
            if (liveCards.length > 0) {
              Utils.safeLocalStorageSet(dataKey, liveCards);
            }
          }

          // B. Tiêm bất biến dữ liệu SRS vào Kho Master Lai (IndexedDB + RAM Mirror 0ms)
          // Review Mode quét đủ cả [targetMode, otherMode] (không break) để không bỏ sót câu 1 từ
          // TUYỆT ĐỐI KHÔNG gọi bumpMasterDataVersion() (chống đẩy về Thẻ 1)
          if (typeof Utils.safeJsonParse === 'function') {
            const otherMode = targetMode === 'sentence' ? 'vocab' : 'sentence';
            const modesToCheck = isReviewMode
              ? [targetMode, otherMode]
              : [targetMode];

            for (const mode of modesToCheck) {
              const masterDataKey = `fc_master_data_${targetLang}_${mode}`;
              const savedMaster = Utils.safeJsonParse(masterDataKey, null);
              const { masterData: patchedMaster, changed: masterChanged } =
                applyTransformToMasterData(
                  savedMaster,
                  cardId,
                  cardTermKey,
                  transformCardFn
                );
              if (masterChanged) {
                Utils.safeLocalStorageSet(masterDataKey, patchedMaster);
              }
            }
          }
        }

        // C. Ghi nhận đồng bộ IndexedDB cho Notebook & IncorrectList
        if (syncNotebook) {
          if (targetLang === currentLang) {
            dirtyNotebookLangs.add(targetLang);
          } else {
            const bucket = crossLangNotebookOps.get(targetLang) || [];
            bucket.push({
              op: 'transform',
              cardId,
              cardTermKey,
              transformCardFn
            });
            crossLangNotebookOps.set(targetLang, bucket);
          }
        }

        if (syncIncorrect) {
          if (targetLang === currentLang) {
            dirtyIncorrectLangs.add(targetLang);
          } else {
            const bucket = crossLangIncorrectOps.get(targetLang) || [];
            bucket.push({
              op: 'transform',
              cardId,
              cardTermKey,
              transformCardFn
            });
            crossLangIncorrectOps.set(targetLang, bucket);
          }
        }
      } else if (task.type === 'incorrect_upsert') {
        const { targetLang, entries } = task;
        if (targetLang === currentLang) {
          dirtyIncorrectLangs.add(targetLang);
        } else {
          const bucket = crossLangIncorrectOps.get(targetLang) || [];
          bucket.push({ op: 'upsert', entries });
          crossLangIncorrectOps.set(targetLang, bucket);
        }
      } else if (task.type === 'incorrect_remove') {
        const { targetLang, cardId, cardTermKey } = task;
        if (targetLang === currentLang) {
          dirtyIncorrectLangs.add(targetLang);
        } else {
          const bucket = crossLangIncorrectOps.get(targetLang) || [];
          bucket.push({ op: 'remove', cardId, cardTermKey });
          crossLangIncorrectOps.set(targetLang, bucket);
        }
      }
    }

    if (!dbReady || !FcDB || typeof FcDB.set !== 'function') return;

    // Ghi Sổ tay ngôn ngữ hiện tại (gom 1 lần ghi duy nhất sau commit)
    dirtyNotebookLangs.forEach((targetLang) => {
      const latestNote = getLiveList(activeCore, activeState, 'notebook');
      safeDbSet(`fc_notebook_${targetLang}`, latestNote, 'persist_notebook');
    });

    // Ghi Danh sách lỗi sai ngôn ngữ hiện tại (gom toàn bộ batch/remove/SRS thành 1 lần ghi duy nhất)
    dirtyIncorrectLangs.forEach((targetLang) => {
      const latestInc = getLiveList(activeCore, activeState, 'incorrectList');
      const incKey = `${STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list'}_${targetLang}`;
      safeDbSet(incKey, latestInc, 'persist_incorrect');
    });

    // Chốt chặn biên Cross-Lang: nếu đổi ngôn ngữ ngay trong tick vừa thao tác -> phát lại tuần tự trên IndexedDB
    if (typeof FcDB.get === 'function') {
      crossLangNotebookOps.forEach((ops, targetLang) => {
        const noteKey = `fc_notebook_${targetLang}`;
        FcDB.get(noteKey)
          .then((savedNote) => {
            if (!Array.isArray(savedNote) || savedNote.length === 0) return;
            let working = savedNote;
            let anyChanged = false;
            for (const step of ops) {
              const res = applyTransformToList(
                working,
                step.cardId,
                step.cardTermKey,
                step.transformCardFn
              );
              if (res.changed) {
                working = res.list;
                anyChanged = true;
              }
            }
            if (anyChanged) {
              return safeDbSet(noteKey, working, 'notebook_cross_lang');
            }
            return undefined;
          })
          .catch((err) => {
            console.warn(
              '[useStudyProgress] Cross-lang notebook sync failed:',
              err
            );
          });
      });

      crossLangIncorrectOps.forEach((ops, targetLang) => {
        const incKey = `${STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list'}_${targetLang}`;
        FcDB.get(incKey)
          .then((savedInc) => {
            let working = Array.isArray(savedInc) ? savedInc : [];
            let anyChanged = false;
            for (const step of ops) {
              if (step.op === 'upsert') {
                const res = applyUpsertIncorrectList(working, step.entries);
                if (res.changed) {
                  working = res.list;
                  anyChanged = true;
                }
              } else if (step.op === 'remove') {
                const res = applyRemoveFromList(
                  working,
                  step.cardId,
                  step.cardTermKey
                );
                if (res.changed) {
                  working = res.list;
                  anyChanged = true;
                }
              } else if (step.op === 'transform') {
                const res = applyTransformToList(
                  working,
                  step.cardId,
                  step.cardTermKey,
                  step.transformCardFn
                );
                if (res.changed) {
                  working = res.list;
                  anyChanged = true;
                }
              }
            }
            if (anyChanged) {
              return safeDbSet(incKey, working, 'incorrect_cross_lang');
            }
            return undefined;
          })
          .catch((err) => {
            console.warn(
              '[useStudyProgress] Cross-lang incorrect sync failed:',
              err
            );
          });
      });
    }
  }, [persistSeq, latestStateRef]);

  // Trình điều phối đồng bộ SRS xuyên kho (Updater thuần khiết 100%, 0 side-effect)
  const syncCardSrsAcrossStores = useCallback(
    /**
     * @param {any} sourceCard
     * @param {(card: any) => any} transformCardFn
     */
    (sourceCard, transformCardFn) => {
      const cardTermKey = normalizeKey(sourceCard?.term);
      const cardId = getNormalizedCardId(sourceCard);
      if ((!cardTermKey && !cardId) || typeof transformCardFn !== 'function') {
        return;
      }

      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const targetLang = normalizeLang(activeCore.lang ?? state.lang);
      const targetMode = normalizeDataMode(activeCore.dataMode);
      const isReviewMode = getIsReviewMode(activeCore, state);
      const isShuffle = getIsShuffleMode(activeCore, state);

      // 1. Cập nhật mảng thẻ trên màn hình (thuần khiết 100%)
      if (typeof activeCore.setCards === 'function') {
        activeCore.setCards((/** @type {any[]} */ prev) => {
          const { list, changed } = applyTransformToList(
            prev,
            cardId,
            cardTermKey,
            transformCardFn
          );
          return changed ? list : prev;
        });
      }

      // 2. Đồng bộ vào Sổ tay nếu thẻ tồn tại trong Sổ tay (thuần khiết 100%)
      const liveNotebook = getLiveList(activeCore, state, 'notebook');
      const hasInNotebook = liveNotebook.some((c) =>
        isMatchingCard(c, cardId, cardTermKey)
      );
      if (hasInNotebook && typeof activeCore.setNotebook === 'function') {
        activeCore.setNotebook((/** @type {any[]} */ prev) => {
          const { list, changed } = applyTransformToList(
            prev,
            cardId,
            cardTermKey,
            transformCardFn
          );
          return changed ? list : prev;
        });
      }

      // 3. Đồng bộ vào Danh sách lỗi sai nếu thẻ tồn tại hoặc vừa được đẩy batch trong cùng tick
      const liveIncorrect = getLiveList(activeCore, state, 'incorrectList');
      const hasPendingIncorrectUpsert = pendingPersistTasksRef.current.some(
        (t) => t.type === 'incorrect_upsert' && t.targetLang === targetLang
      );
      const hasInIncorrect =
        hasPendingIncorrectUpsert ||
        liveIncorrect.some((c) => isMatchingCard(c, cardId, cardTermKey));
      if (hasInIncorrect && typeof activeCore.setIncorrectList === 'function') {
        activeCore.setIncorrectList((/** @type {any[]} */ prev) => {
          const { list, changed } = applyTransformToList(
            prev,
            cardId,
            cardTermKey,
            transformCardFn
          );
          return changed ? list : prev;
        });
      }

      // 4. Ghi nhận tác vụ lưu trữ NGOÀI updater và ép nhịp commit
      pendingPersistTasksRef.current.push({
        type: 'srs',
        targetLang,
        targetMode,
        isReviewMode,
        isShuffle,
        cardId,
        cardTermKey,
        transformCardFn,
        syncNotebook: hasInNotebook,
        syncIncorrect: hasInIncorrect
      });
      setPersistSeq((seq) => seq + 1);
    },
    [latestStateRef]
  );

  // ==========================================================================
  // 1. QUẢN LÝ SỔ TAY TỪ VỰNG (NOTEBOOK ACTIONS)
  // ==========================================================================
  // Hàm lưu Sổ tay (Hỗ trợ cả Toggle đơn lẻ theo NFC 1:1 với useAppLogic Ver 1.1 và Cập nhật hàng loạt)
  const handleNotebookSave = useCallback(
    /** @param {any} payload */
    async (payload) => {
      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const safeLang = normalizeLang(activeCore.lang ?? state.lang);
      const dbReady = Boolean(activeCore.isDbReady ?? state.isDbReady);

      if (Array.isArray(payload)) {
        // Trường hợp 1: Cập nhật hàng loạt (từ Modal Sổ tay)
        const nextPayload = [...payload];
        if (typeof activeCore.setNotebook === 'function') {
          activeCore.setNotebook(nextPayload);
        }
        if (dbReady) {
          await safeDbSet(`fc_notebook_${safeLang}`, nextPayload, 'notebook_batch');
        }
        notifyToast('Đã cập nhật sổ tay!', 'success');
        return;
      }

      // Trường hợp 2: Toggle (Thêm/Xóa nhanh từ Flashcard/Game — khớp 1:1 cờ isCurrentCardInNotebookDerived)
      const rawCard =
        typeof payload === 'string' ? { term: payload.trim() } : payload;
      const targetKey = normalizeKey(rawCard?.term);
      if (!rawCard || typeof rawCard !== 'object' || !targetKey) return;

      const currentNotebook = getLiveList(activeCore, state, 'notebook');
      const exists = currentNotebook.some(
        (c) => normalizeKey(c?.term) === targetKey
      );

      let newNote;
      if (exists) {
        newNote = currentNotebook.filter(
          (c) => normalizeKey(c?.term) !== targetKey
        );
        notifyToast('Đã xóa khỏi sổ tay', 'info');
      } else {
        const cleanTerm = String(rawCard.term).trim();
        newNote = [...currentNotebook, { ...rawCard, term: cleanTerm }];
        notifyToast('Đã thêm vào sổ tay', 'success');
      }

      if (typeof activeCore.setNotebook === 'function') {
        activeCore.setNotebook(newNote);
      }
      if (dbReady) {
        await safeDbSet(`fc_notebook_${safeLang}`, newNote, 'notebook_toggle');
      }
    },
    [latestStateRef, notifyToast]
  );

  // Hàm lưu từ vựng từ bộ chọn (Word Selector) - 6-Source Local-First Lookup + 4-Tier API Key
  const handleSaveWords = useCallback(
    /**
     * @param {any} items
     * @param {boolean} [isPhrase=false]
     */
    async (items, isPhrase = false) => {
      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const safeLang = normalizeLang(activeCore.lang ?? state.lang);
      const dbReady = Boolean(activeCore.isDbReady ?? state.isDbReady);

      /** @type {Array<any>} */
      let wordsToSave = [];
      if (isPhrase && Array.isArray(items)) {
        const separator = safeLang === 'zh' ? '' : ' ';
        const phraseParts = items
          .map((it) => {
            const raw = it && typeof it === 'object' ? it.term : it;
            return typeof raw === 'string'
              ? raw.trim()
              : raw !== null && raw !== undefined
              ? String(raw).trim()
              : '';
          })
          .filter(Boolean);
        const phrase = phraseParts.join(separator).trim();
        wordsToSave = phrase ? [phrase] : [];
      } else {
        wordsToSave = Array.isArray(items) ? items : [items];
      }

      const currentNotebook = getLiveList(activeCore, state, 'notebook');
      const liveCards = getLiveList(activeCore, state, 'cards');
      const liveMastered = getLiveList(activeCore, state, 'mastered');
      const liveIncorrect = getLiveList(activeCore, state, 'incorrectList');

      const existingKeys = new Set(
        currentNotebook.map((i) => normalizeKey(i?.term)).filter(Boolean)
      );

      // Kéo toàn bộ 6 nguồn nội bộ làm khiên lọc O(1) chống lãng phí Token AI
      const globalLookupMap = buildGlobalLookupMap(safeLang, liveCards, [
        liveMastered,
        liveIncorrect
      ]);
      /** @type {Array<any>} */
      const unique = [];
      /** @type {Array<string>} */
      const aiQueueTargets = [];
      const baseTimestamp = Date.now();

      wordsToSave.forEach((w) => {
        const rawTerm = w && typeof w === 'object' ? w.term : w;
        const term =
          typeof rawTerm === 'string'
            ? rawTerm.trim()
            : rawTerm !== null && rawTerm !== undefined
            ? String(rawTerm).trim()
            : '';
        const termKey = normalizeKey(term);
        if (!termKey || existingKeys.has(termKey)) return;

        const itemTimestamp = baseTimestamp + unique.length;
        const localMatch = globalLookupMap.get(termKey);
        if (localMatch) {
          unique.push({
            ...localMatch,
            term,
            timestamp: itemTimestamp
          });
          // Chỉ đẩy AI nếu bản nội bộ vẫn đang trống hoàn toàn nghĩa tiếng Việt
          const hasDef =
            typeof localMatch.definition === 'string' &&
            localMatch.definition.trim() !== '';
          if (!hasDef) {
            aiQueueTargets.push(term);
          }
          existingKeys.add(termKey);
        } else {
          unique.push({
            term,
            definition: '',
            pronunciation: '',
            example: '',
            timestamp: itemTimestamp
          });
          aiQueueTargets.push(term);
          existingKeys.add(termKey);
        }
      });

      if (unique.length === 0) {
        notifyToast('Từ vựng đã có trong sổ tay!', 'info');
        if (typeof activeCore.setShowWordSelect === 'function') {
          activeCore.setShowWordSelect(false);
        }
        return;
      }

      const updated = [...currentNotebook, ...unique];
      if (typeof activeCore.setNotebook === 'function') {
        activeCore.setNotebook(updated);
      }
      if (dbReady) {
        await safeDbSet(`fc_notebook_${safeLang}`, updated, 'save_words');
      }

      notifyToast(`Đã thêm ${unique.length} mục vào sổ tay`, 'success');
      if (typeof activeCore.setShowWordSelect === 'function') {
        activeCore.setShowWordSelect(false);
      }

      // Quét API Key đủ 4 tầng (đã vá SP2) & kích hoạt AI dịch ngầm CHỈ cho những từ thực sự cần dịch
      const activeApiKey = resolveActiveApiKey(activeCore.apiKey);
      const processAiQueue = callbacksRef.current?.processAiQueue;
      if (
        activeApiKey &&
        typeof processAiQueue === 'function' &&
        aiQueueTargets.length > 0 &&
        activeCore.aiQueueRef &&
        Array.isArray(activeCore.aiQueueRef.current)
      ) {
        const queuedKeys = new Set(
          activeCore.aiQueueRef.current
            .map((/** @type {any} */ entry) => normalizeKey(entry))
            .filter(Boolean)
        );
        aiQueueTargets.forEach((term) => {
          const k = normalizeKey(term);
          if (k && !queuedKeys.has(k)) {
            activeCore.aiQueueRef.current.push(term);
            queuedKeys.add(k);
          }
        });
        processAiQueue();
      }
    },
    [latestStateRef, notifyToast]
  );

  // ==========================================================================
  // 2. QUẢN LÝ THẺ ĐÃ THUỘC (MASTERED ACTIONS — VÁ SP1 BẢO TOÀN THỨ TỰ GỐC)
  // ==========================================================================
  // Đánh dấu thẻ là đã thuộc (Xóa khỏi danh sách học, thêm vào Mastered & tự gỡ khỏi Lỗi sai)
  const handleMarkMastered = useCallback(
    /** @param {any} [card] */
    async (card) => {
      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const safeLang = normalizeLang(activeCore.lang ?? state.lang);
      const dbReady = Boolean(activeCore.isDbReady ?? state.isDbReady);

      const safeCards = getLiveList(activeCore, state, 'cards');
      const safeMastered = getLiveList(activeCore, state, 'mastered');
      const safeIncorrect = getLiveList(activeCore, state, 'incorrectList');
      const currentCardIndex =
        typeof state.currentCardIndex === 'number'
          ? state.currentCardIndex
          : typeof activeCore.currentCardIndex === 'number'
          ? activeCore.currentCardIndex
          : 0;

      const target =
        card &&
        typeof card === 'object' &&
        (normalizeKey(card.term) || getNormalizedCardId(card))
          ? card
          : safeCards[currentCardIndex];
      const targetKey = normalizeKey(target?.term);
      const targetId = getNormalizedCardId(target);
      if (!target || (!targetKey && !targetId)) return;

      const newCards = safeCards.filter(
        (c) => !isMatchingCard(c, targetId, targetKey)
      );
      const existsInMastered = safeMastered.some((c) =>
        isMatchingCard(c, targetId, targetKey)
      );
      const newMastered = existsInMastered
        ? safeMastered
        : [...safeMastered, target];

      if (typeof activeCore.setCards === 'function') {
        activeCore.setCards(newCards);
      }
      if (typeof activeCore.setMastered === 'function') {
        activeCore.setMastered(newMastered);
      }
      if (typeof activeCore.setIsFlipped === 'function') {
        activeCore.setIsFlipped(false);
      }

      // [VER 1.2 - DIỆT SP1] Bảo vệ thứ tự gốc fc_data_${lang} khi ở Review Mode HOẶC đang bật Shuffle
      const isReviewMode = getIsReviewMode(activeCore, state);
      const isShuffleNow = getIsShuffleMode(activeCore, state);
      const dataKey = `fc_data_${safeLang}`;

      if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
        if (!isReviewMode && !isShuffleNow) {
          Utils.safeLocalStorageSet(dataKey, newCards);
        } else if (typeof Utils.safeJsonParse === 'function') {
          const savedMainDeck = Utils.safeJsonParse(dataKey, null);
          if (Array.isArray(savedMainDeck) && savedMainDeck.length > 0) {
            const filteredMain = savedMainDeck.filter(
              (c) => !isMatchingCard(c, targetId, targetKey)
            );
            if (filteredMain.length !== savedMainDeck.length) {
              Utils.safeLocalStorageSet(dataKey, filteredMain);
            }
          }
        }
      }

      // Tự động gỡ khỏi Danh sách lỗi sai qua pipeline functional updater (0 Lost Update)
      const hasPendingIncorrectUpsert = pendingPersistTasksRef.current.some(
        (t) => t.type === 'incorrect_upsert' && t.targetLang === safeLang
      );
      const mightBeInIncorrect =
        hasPendingIncorrectUpsert ||
        safeIncorrect.some((c) => isMatchingCard(c, targetId, targetKey));
      if (mightBeInIncorrect) {
        if (typeof activeCore.setIncorrectList === 'function') {
          activeCore.setIncorrectList((/** @type {any[]} */ prev) => {
            const { list, changed } = applyRemoveFromList(
              prev,
              targetId,
              targetKey
            );
            return changed ? list : prev;
          });
        }
        pendingPersistTasksRef.current.push({
          type: 'incorrect_remove',
          targetLang: safeLang,
          cardId: targetId,
          cardTermKey: targetKey
        });
        setPersistSeq((seq) => seq + 1);
      }

      // [INDEXEDDB] Lưu kho Thẻ đã thuộc
      if (dbReady) {
        await safeDbSet(`fc_mastered_${safeLang}`, newMastered, 'mark_mastered');
      }

      if (
        currentCardIndex >= newCards.length &&
        typeof activeCore.setCurrentCardIndex === 'function'
      ) {
        activeCore.setCurrentCardIndex(Math.max(0, newCards.length - 1));
      }

      notifyToast('Đã đánh dấu thuộc bài!', 'success');
    },
    [latestStateRef, notifyToast]
  );

  // Khôi phục thẻ từ Mastered về danh sách học
  const handleRestoreMastered = useCallback(
    /** @param {any} card */
    async (card) => {
      const targetKey = normalizeKey(card?.term);
      const targetId = getNormalizedCardId(card);
      if (!card || typeof card !== 'object' || (!targetKey && !targetId)) return;

      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const safeLang = normalizeLang(activeCore.lang ?? state.lang);
      const dbReady = Boolean(activeCore.isDbReady ?? state.isDbReady);

      const safeCards = getLiveList(activeCore, state, 'cards');
      const safeMastered = getLiveList(activeCore, state, 'mastered');

      const newMaster = safeMastered.filter(
        (c) => !isMatchingCard(c, targetId, targetKey)
      );
      const newCards = [
        card,
        ...safeCards.filter((c) => !isMatchingCard(c, targetId, targetKey))
      ];

      if (typeof activeCore.setMastered === 'function') {
        activeCore.setMastered(newMaster);
      }
      if (typeof activeCore.setCards === 'function') {
        activeCore.setCards(newCards);
      }
      if (typeof activeCore.setIsFlipped === 'function') {
        activeCore.setIsFlipped(false);
      }

      // [VER 1.2 - DIỆT SP1] Không ghi mảng đã trộn đè lên fc_data_${lang} khi đang bật Shuffle
      const isReviewMode = getIsReviewMode(activeCore, state);
      const isShuffleNow = getIsShuffleMode(activeCore, state);
      const dataKey = `fc_data_${safeLang}`;

      if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
        if (!isReviewMode && !isShuffleNow) {
          Utils.safeLocalStorageSet(dataKey, newCards);
        } else if (typeof Utils.safeJsonParse === 'function') {
          const savedMainDeck = Utils.safeJsonParse(dataKey, []);
          const safeMain = Array.isArray(savedMainDeck) ? savedMainDeck : [];
          const restoredMain = [
            card,
            ...safeMain.filter((c) => !isMatchingCard(c, targetId, targetKey))
          ];
          Utils.safeLocalStorageSet(dataKey, restoredMain);
        }
      }

      if (dbReady) {
        await safeDbSet(`fc_mastered_${safeLang}`, newMaster, 'restore_mastered');
      }

      if (typeof activeCore.setCurrentCardIndex === 'function') {
        activeCore.setCurrentCardIndex(0);
      }
      notifyToast('Đã khôi phục thẻ (Lên đầu danh sách)!', 'success');
    },
    [latestStateRef, notifyToast]
  );

  // Khôi phục toàn bộ thẻ đã thuộc (Thuật toán O(1) 3 tập bảo vệ tuyệt đối từ đồng âm khác id)
  const handleRestoreAllMastered = useCallback(async () => {
    const activeCore = coreRef.current || {};
    const state = latestStateRef?.current || {};
    const safeLang = normalizeLang(activeCore.lang ?? state.lang);
    const dbReady = Boolean(activeCore.isDbReady ?? state.isDbReady);

    const safeCards = getLiveList(activeCore, state, 'cards');
    const safeMastered = getLiveList(activeCore, state, 'mastered');

    if (safeMastered.length === 0) {
      notifyToast('Danh sách trống!', 'warning');
      return;
    }

    const restoredCount = safeMastered.length;
    /** @type {Set<string>} */
    const masteredIds = new Set();
    /** @type {Set<string>} */
    const masteredNoIdKeys = new Set();
    /** @type {Set<string>} */
    const masteredAllKeys = new Set();

    safeMastered.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const mid = getNormalizedCardId(m);
      const mk = normalizeKey(m.term);
      if (mid) {
        masteredIds.add(mid);
      } else if (mk) {
        masteredNoIdKeys.add(mk);
      }
      if (mk) {
        masteredAllKeys.add(mk);
      }
    });

    /**
     * Tương đương logic 1:1 với isMatchingCard(c, mid, mk) nhưng đạt tốc độ O(1)
     * @param {any} c
     * @returns {boolean}
     */
    const isInMastered = (c) => {
      if (!c || typeof c !== 'object') return false;
      const cid = getNormalizedCardId(c);
      const ck = normalizeKey(c.term);
      if (cid) {
        if (masteredIds.has(cid)) return true;
        return Boolean(ck && masteredNoIdKeys.has(ck));
      }
      return Boolean(ck && masteredAllKeys.has(ck));
    };

    const newCards = [
      ...safeMastered,
      ...safeCards.filter((c) => !isInMastered(c))
    ];

    if (typeof activeCore.setMastered === 'function') {
      activeCore.setMastered([]);
    }
    if (typeof activeCore.setCards === 'function') {
      activeCore.setCards(newCards);
    }
    if (typeof activeCore.setIsFlipped === 'function') {
      activeCore.setIsFlipped(false);
    }

    // [VER 1.2 - DIỆT SP1] Bảo toàn thứ tự gốc fc_data_${lang} khi đang ở Review Mode HOẶC đang Shuffle
    const isReviewMode = getIsReviewMode(activeCore, state);
    const isShuffleNow = getIsShuffleMode(activeCore, state);
    const dataKey = `fc_data_${safeLang}`;

    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      if (!isReviewMode && !isShuffleNow) {
        Utils.safeLocalStorageSet(dataKey, newCards);
      } else if (typeof Utils.safeJsonParse === 'function') {
        const savedMainDeck = Utils.safeJsonParse(dataKey, []);
        const safeMain = Array.isArray(savedMainDeck) ? savedMainDeck : [];
        const restoredMain = [
          ...safeMastered,
          ...safeMain.filter((c) => !isInMastered(c))
        ];
        Utils.safeLocalStorageSet(dataKey, restoredMain);
      }
    }

    if (dbReady) {
      await safeDbSet(`fc_mastered_${safeLang}`, [], 'restore_all_mastered');
    }

    if (typeof activeCore.setCurrentCardIndex === 'function') {
      activeCore.setCurrentCardIndex(0);
    }
    notifyToast(
      `Đã khôi phục ${restoredCount} thẻ lên đầu danh sách!`,
      'success'
    );
  }, [latestStateRef, notifyToast]);

  // ==========================================================================
  // 3. QUẢN LÝ LỖI SAI (MISTAKE TRACKING — 0 LOST UPDATE / BATCH-SAFE)
  // ==========================================================================
  // Ghi nhận câu sai vào Sổ tay lỗi sai (Hỗ trợ cả 1 thẻ đơn lẻ lẫn mảng thẻ batch trong 1 tick)
  const handleLogWrong = useCallback(
    /** @param {any} cardOrCards */
    async (cardOrCards) => {
      const rawItems = Array.isArray(cardOrCards) ? cardOrCards : [cardOrCards];
      const baseNow = Date.now();
      /** @type {Array<{ card: any, cardId: string, termKey: string, timestamp: number }>} */
      const entries = [];

      rawItems.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const termKey = normalizeKey(item.term);
        const cardId = getNormalizedCardId(item);
        if (!termKey && !cardId) return;

        const cleanTerm =
          item.term !== undefined && item.term !== null
            ? String(item.term).trim()
            : '';
        entries.push({
          card: cleanTerm ? { ...item, term: cleanTerm } : { ...item },
          cardId,
          termKey,
          timestamp: baseNow + idx
        });
      });

      if (entries.length === 0) return;

      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const safeLang = normalizeLang(activeCore.lang ?? state.lang);

      // Updater thuần khiết 100%: gọi liên tiếp trong cùng 1 vòng lặp vẫn tích lũy đầy đủ 0 mất dữ liệu
      if (typeof activeCore.setIncorrectList === 'function') {
        activeCore.setIncorrectList((/** @type {any[]} */ prev) => {
          const { list, changed } = applyUpsertIncorrectList(prev, entries);
          return changed ? list : prev;
        });
      }

      // Đẩy vào hàng đợi sau commit -> gom toàn bộ batch thành 1 lần ghi IndexedDB duy nhất
      pendingPersistTasksRef.current.push({
        type: 'incorrect_upsert',
        targetLang: safeLang,
        entries
      });
      setPersistSeq((seq) => seq + 1);
    },
    [latestStateRef]
  );

  // Xóa một từ khỏi danh sách lỗi sai (chấp nhận cả chuỗi term lẫn object thẻ, 0 Lost Update)
  const handleRemoveWrong = useCallback(
    /** @param {any} termOrCard */
    async (termOrCard) => {
      const isObj = Boolean(termOrCard && typeof termOrCard === 'object');
      const targetId = isObj ? getNormalizedCardId(termOrCard) : '';
      const rawTerm = isObj ? termOrCard.term : termOrCard;
      const targetKey = normalizeKey(rawTerm);
      if (!targetKey && !targetId) return;

      const activeCore = coreRef.current || {};
      const state = latestStateRef?.current || {};
      const safeLang = normalizeLang(activeCore.lang ?? state.lang);

      if (typeof activeCore.setIncorrectList === 'function') {
        activeCore.setIncorrectList((/** @type {any[]} */ prev) => {
          const { list, changed } = applyRemoveFromList(
            prev,
            targetId,
            targetKey
          );
          return changed ? list : prev;
        });
      }

      pendingPersistTasksRef.current.push({
        type: 'incorrect_remove',
        targetLang: safeLang,
        cardId: targetId,
        cardTermKey: targetKey
      });
      setPersistSeq((seq) => seq + 1);

      notifyToast('Đã xóa khỏi danh sách cần nhớ', 'success');
    },
    [latestStateRef, notifyToast]
  );

  // ==========================================================================
  // 4. THUẬT TOÁN SRS (SPACED REPETITION SYSTEM)
  // ==========================================================================
  // Chấm điểm SRS cho thẻ hiện tại
  const handleSrsGrade = useCallback(
    /** @param {any} grade */
    (grade) => {
      const activeCore = coreRef.current || {};
      const current = latestStateRef?.current || {};
      const safeCards = getLiveList(activeCore, current, 'cards');
      const cardIndex =
        typeof current.currentCardIndex === 'number'
          ? current.currentCardIndex
          : typeof activeCore.currentCardIndex === 'number'
          ? activeCore.currentCardIndex
          : 0;
      const card = safeCards[cardIndex];
      if (!card || (!normalizeKey(card.term) && !getNormalizedCardId(card))) {
        return;
      }
      if (!Utils || typeof Utils.calculateSRS !== 'function') return;

      const srsResult = Utils.calculateSRS(
        card,
        grade,
        current.settings ?? activeCore.settings
      );
      if (!srsResult || typeof srsResult !== 'object') return;

      syncCardSrsAcrossStores(card, (targetCard) => ({
        ...targetCard,
        ...srsResult
      }));

      const nextFn = callbacksRef.current?.handleNext;
      if (typeof nextFn === 'function') {
        nextFn();
      }
    },
    [latestStateRef, syncCardSrsAcrossStores]
  );

  // Reset thẻ về trạng thái "Mới" (Xóa dữ liệu SRS xuyên kho bất biến)
  const handleResetSrs = useCallback(() => {
    const activeCore = coreRef.current || {};
    const current = latestStateRef?.current || {};
    const safeCards = getLiveList(activeCore, current, 'cards');
    const cardIndex =
      typeof current.currentCardIndex === 'number'
        ? current.currentCardIndex
        : typeof activeCore.currentCardIndex === 'number'
        ? activeCore.currentCardIndex
        : 0;
    const card = safeCards[cardIndex];
    if (!card || (!normalizeKey(card.term) && !getNormalizedCardId(card))) {
      return;
    }

    syncCardSrsAcrossStores(card, (targetCard) => {
      const cleaned = { ...targetCard };
      delete cleaned.srs_interval;
      delete cleaned.srs_repetition;
      delete cleaned.srs_ease;
      delete cleaned.srs_due;
      return cleaned;
    });

    notifyToast('Đã reset về trạng thái Mới', 'info');
  }, [latestStateRef, syncCardSrsAcrossStores, notifyToast]);

  // TRẢ VỀ API CHO MAIN CONTROLLER (BẢO TOÀN 100% HỢP ĐỒNG 9 HÀM)
  return {
    handleNotebookSave,
    handleSaveWords,
    handleMarkMastered,
    handleRestoreMastered,
    handleRestoreAllMastered,
    handleLogWrong,
    handleRemoveWrong,
    handleSrsGrade,
    handleResetSrs
  };
};

export const Block6_5_useStudyProgress = useStudyProgress;

if (typeof window !== 'undefined') {
  const win = /** @type {any} */ (window);
  win.Block6_5_useStudyProgress = useStudyProgress;
  win.useStudyProgress = useStudyProgress;
}

export default useStudyProgress;