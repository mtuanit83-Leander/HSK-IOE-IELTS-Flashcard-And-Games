/* eslint-disable react-refresh/only-export-components */
// ============================================================================
// FILE 83/85: src/context/AppContext.jsx
// NGUỒN GỐC: Tầng 6 (Block 6.1 + 6.4) & Tầng 7 (Block 7.1 Interceptor)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 14:38 (GMT+7)
// NHIỆM VỤ: Tạo AppProvider hợp nhất useCoreState + useAppLogic + Bộ đánh chặn
//           Toast/System Logs (Hộp đen sự kiện) và cung cấp useAppContext().
//           Nâng cấp Ver 1.1 (Gia cố Production — 0 CRITICAL / 0 HIGH):
//           1. Diệt 100% bẫy treo pendingCardsPersistRef khi React bail-out
//              bằng nhịp persistSeq (useState) + dọn sạch ref ngay đầu useEffect.
//           2. Khóa đối chiếu trọn bộ 4 trục ngữ cảnh (lang, dataMode,
//              isReviewMode, studySourceName) và chặn safePrev.length === 0
//              trong mergeCardsForView chống ghi đè nhầm fc_data_${lang}.
//           3. Đồng bộ bản vá JIT Enrichment bất biến vào Kho Master Lai
//              (fc_master_data_${lang}_${mode}) qua RAM Mirror 0ms + IndexedDB
//              (chỉ ghi khi thực sự có delta trường, không gọi bumpMasterDataVersion).
//           4. Kế thừa toàn bộ nền tảng Ver 1.0: 0 CRITICAL StrictMode,
//              0 HIGH cờ 'vi' cũ, đối khớp card.id -> term NFC, ID log đơn điệu,
//              chống circular JSON & cleanup an toàn window hooks.
// ============================================================================

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { CONFIG_SAMPLES } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { useCoreState } from '@/hooks/useCoreState';
import { useAppLogic } from '@/hooks/useAppLogic';

// Chuẩn hóa khóa văn bản theo Unicode NFC + trim + lowercase (đồng bộ useAppLogic Ver 1.1)
const normalizeCardKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

// Trích xuất mã ID chuẩn hóa của thẻ (nếu có)
const getNormalizedCardId = (card) => {
  if (!card || card.id === undefined || card.id === null) return '';
  return String(card.id).trim();
};

// Chuẩn hóa tên ngôn ngữ học hợp lệ của hệ thống ('en' | 'zh')
const normalizeActiveLang = (lang) => (lang === 'zh' ? 'zh' : 'en');

// Chuẩn hóa chế độ dữ liệu hợp lệ của hệ thống ('vocab' | 'sentence')
const normalizeDataMode = (mode) => (mode === 'sentence' ? 'sentence' : 'vocab');

// Định dạng dấu thời gian hiển thị trong Hộp đen hệ thống
const formatLogTimestamp = () => {
  const now = new Date();
  return (
    now.toLocaleTimeString('vi-VN', { hour12: false }) +
    ' ' +
    now.toLocaleDateString('vi-VN')
  );
};

// Kiểm tra bản vá có thực sự mang lại ít nhất 1 trường thay đổi so với thẻ gốc hay không
const hasCardFieldDelta = (card, patch) => {
  if (!card || typeof card !== 'object' || !patch || typeof patch !== 'object') {
    return false;
  }
  const patchKeys = Object.keys(patch);
  for (const key of patchKeys) {
    if (card[key] !== patch[key]) {
      return true;
    }
  }
  return false;
};

// Tạo cặp bản đồ đối khớp bản vá thẻ: ưu tiên card.id trước, fallback theo term NFC
const buildPatchLookupMaps = (patches) => {
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {Map<string, any>} */
  const byTerm = new Map();

  if (!Array.isArray(patches)) {
    return { byId, byTerm };
  }

  for (const item of patches) {
    if (!item || typeof item !== 'object') continue;
    const cardId = getNormalizedCardId(item);
    if (cardId) {
      byId.set(cardId, item);
    }
    const termKey = normalizeCardKey(item.term);
    if (termKey) {
      byTerm.set(termKey, item);
    }
  }

  return { byId, byTerm };
};

// Áp dụng bản vá cục bộ lên một danh sách thẻ bằng cặp bản đồ đối khớp sẵn có (thuần khiết, bất biến)
const applyLookupMapsToDeck = (sourceDeck, byId, byTerm) => {
  const safeDeck = Array.isArray(sourceDeck) ? sourceDeck : [];
  if (safeDeck.length === 0 || (byId.size === 0 && byTerm.size === 0)) {
    return { cards: safeDeck, changed: false };
  }

  let changed = false;
  const nextDeck = safeDeck.map((card) => {
    if (!card || typeof card !== 'object') return card;
    const cardId = getNormalizedCardId(card);
    const patchById = cardId ? byId.get(cardId) : undefined;
    const termKey = normalizeCardKey(card.term);
    const patch = patchById || (termKey ? byTerm.get(termKey) : undefined);

    if (patch && hasCardFieldDelta(card, patch)) {
      changed = true;
      return { ...card, ...patch };
    }
    return card;
  });

  return { cards: changed ? nextDeck : safeDeck, changed };
};

// Áp dụng bản vá cục bộ lên một danh sách thẻ phẳng (thuần khiết, bất biến)
const applyCardPatchesToDeck = (sourceDeck, patches) => {
  const { byId, byTerm } = buildPatchLookupMaps(patches);
  return applyLookupMapsToDeck(sourceDeck, byId, byTerm);
};

// Áp dụng bản vá bất biến lên Kho Master Lai dạng { [levelKey]: Card[] } (chỉ clone level có thay đổi)
const applyCardPatchesToMasterData = (masterData, patches) => {
  if (!masterData || typeof masterData !== 'object' || Array.isArray(masterData)) {
    return { masterData, changed: false };
  }

  const { byId, byTerm } = buildPatchLookupMaps(patches);
  if (byId.size === 0 && byTerm.size === 0) {
    return { masterData, changed: false };
  }

  let changed = false;
  /** @type {Record<string, any> | null} */
  let nextMaster = null;

  const levelKeys = Object.keys(masterData);
  for (const levelKey of levelKeys) {
    const levelDeck = masterData[levelKey];
    if (!Array.isArray(levelDeck) || levelDeck.length === 0) continue;

    const { cards: patchedLevel, changed: levelChanged } = applyLookupMapsToDeck(
      levelDeck,
      byId,
      byTerm
    );

    if (levelChanged) {
      if (!nextMaster) {
        nextMaster = { ...masterData };
      }
      nextMaster[levelKey] = patchedLevel;
      changed = true;
    }
  }

  return { masterData: changed && nextMaster ? nextMaster : masterData, changed };
};

// Hợp nhất mảng thẻ cập nhật vào mảng thẻ hiện tại trên màn hình (thuần khiết 100%)
const mergeCardsForView = (prevCards, updatedCards) => {
  const safePrev = Array.isArray(prevCards) ? prevCards : [];
  // Chặn sớm khi màn hình hiện tại rỗng để Mini-Game ai_pure không nhét patch lẻ vào kho trống
  if (
    safePrev.length === 0 ||
    !Array.isArray(updatedCards) ||
    updatedCards.length === 0
  ) {
    return safePrev;
  }

  // Trường hợp Mini-Game trả về toàn bộ bộ bài đã làm giàu (đủ/lớn hơn bộ bài hiện tại)
  if (updatedCards.length >= safePrev.length) {
    return [...updatedCards];
  }

  // Trường hợp Mini-Game trả về tập con các thẻ vừa được làm giàu (partial patch)
  const { cards: patchedDeck, changed } = applyCardPatchesToDeck(
    safePrev,
    updatedCards
  );
  return changed ? patchedDeck : safePrev;
};

/** @type {import('react').Context<any>} */
export const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  // [CỜ BẢO VỆ THANH TRỪNG NGÔN NGỮ] Chặn lỗi dữ liệu 'vi' cũ gây màn hình trắng
  useEffect(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    try {
      const savedLang = localStorage.getItem('fc_lang');
      if (savedLang === 'vi' || savedLang === '"vi"') {
        const persisted =
          Utils && typeof Utils.safeLocalStorageSet === 'function'
            ? Utils.safeLocalStorageSet('fc_lang', 'en')
            : false;
        if (persisted) {
          window.location.reload();
        }
      }
    } catch (err) {
      console.warn('[AppContext] Legacy language guard failed:', err);
    }
  }, []);

  // 1. Khởi tạo Core State (Tầng 6 - Block 6.1)
  const coreState = useCoreState();
  const {
    setToast,
    setSystemLogs,
    setCards,
    cards,
    lang,
    dataMode,
    isStudyingNotebook,
    studySourceName
  } = coreState;

  // Nhịp kích hoạt ép useEffect luôn kiểm duyệt & xả sạch pendingCardsPersistRef kể cả khi React bail-out
  const [persistSeq, setPersistSeq] = useState(0);

  // Bộ đếm đơn điệu chống trùng ID khi nhiều sự kiện xảy ra trong cùng 1ms
  const logSeqRef = useRef(0);
  const nextUniqueId = useCallback(() => {
    const base = Date.now() * 1000;
    logSeqRef.current = Math.max(logSeqRef.current + 1, base);
    return logSeqRef.current;
  }, []);

  // Ref đồng bộ 4 trục ngữ cảnh lưu trữ để handleUpdateCards có tham chiếu ổn định
  const persistContextRef = useRef({
    lang: normalizeActiveLang(lang),
    dataMode: normalizeDataMode(dataMode),
    isStudyingNotebook: Boolean(isStudyingNotebook),
    studySourceName: studySourceName || null
  });
  persistContextRef.current = {
    lang: normalizeActiveLang(lang),
    dataMode: normalizeDataMode(dataMode),
    isStudyingNotebook: Boolean(isStudyingNotebook),
    studySourceName: studySourceName || null
  };

  // Ý định lưu trữ thẻ tách hoàn toàn khỏi React state updater (0 CRITICAL StrictMode)
  /** @type {import('react').MutableRefObject<{ dataKey: string, targetLang: string, targetMode: string, isReviewMode: boolean, studySourceName: string | null, patches: any[] } | null>} */
  const pendingCardsPersistRef = useRef(null);

  // 2. [HỘP ĐEN SỰ KIỆN] Bộ Đánh chặn Toast (Toast Interceptor - Block 7.1)
  const handleGlobalToast = useCallback(
    (msg, type = 'success') => {
      let messageText = 'Thông báo';
      let messageType =
        typeof type === 'string' && type.trim() ? type : 'success';

      if (typeof msg === 'string') {
        messageText = msg;
      } else if (msg && typeof msg === 'object') {
        messageText = String(msg.text ?? msg.message ?? 'Thông báo');
        if (typeof msg.type === 'string' && msg.type.trim()) {
          messageType = msg.type;
        }
      } else if (msg !== null && msg !== undefined) {
        messageText = String(msg);
      }

      const eventId = nextUniqueId();
      setToast({ text: messageText, type: messageType, id: eventId });

      if (messageType === 'error' || messageType === 'warning') {
        const timeStr = formatLogTimestamp();
        setSystemLogs((prev) => {
          const safePrev = Array.isArray(prev) ? prev : [];
          const newLog = {
            id: eventId,
            message: messageText,
            type: messageType,
            timeStr
          };
          return [newLog, ...safePrev].slice(0, 50);
        });
      }
    },
    [nextUniqueId, setToast, setSystemLogs]
  );

  // 3. Hệ thống Ghi log chuyên sâu (Deep-Logging - Block 7.1)
  const handleSystemEventLog = useCallback(
    (message, errorDetail = null) => {
      let detailStr = '';
      if (errorDetail !== null && errorDetail !== undefined) {
        if (typeof errorDetail === 'object') {
          if (
            typeof errorDetail.message === 'string' &&
            errorDetail.message.trim()
          ) {
            detailStr = errorDetail.message.trim();
          } else {
            try {
              detailStr = JSON.stringify(errorDetail);
            } catch {
              detailStr = String(errorDetail);
            }
          }
        } else {
          detailStr = String(errorDetail);
        }
      }

      const safeMsg =
        typeof message === 'string'
          ? message
          : message !== null && message !== undefined
          ? String(message)
          : 'System Event';
      const fullMessage = detailStr ? `${safeMsg} | Detail: ${detailStr}` : safeMsg;
      const eventId = nextUniqueId();
      const timeStr = formatLogTimestamp();

      setSystemLogs((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const newLog = {
          id: eventId,
          message: fullMessage,
          type: 'error',
          timeStr
        };
        return [newLog, ...safePrev].slice(0, 50);
      });
    },
    [nextUniqueId, setSystemLogs]
  );

  // 4. Cấy ghép Interceptor vào Core State trước khi truyền sang useAppLogic
  const coreWithInterceptor = useMemo(
    () => ({
      ...coreState,
      setToast: handleGlobalToast
    }),
    [coreState, handleGlobalToast]
  );

  // 5. Khởi tạo Main Switchboard (Tầng 6 - Block 6.4)
  const logic = useAppLogic(coreWithInterceptor);

  // Giữ tham chiếu actions mới nhất giúp handleSmartBookmark ổn định danh tính
  const actionsRef = useRef(logic.actions);
  actionsRef.current = logic.actions;

  // 6. Đăng ký & dọn dẹp an toàn Global Toast & System Log lên window cho Tầng 2/5/6
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.globalShowToast = handleGlobalToast;
    window.logSystemEvent = handleSystemEventLog;

    return () => {
      if (window.globalShowToast === handleGlobalToast) {
        window.globalShowToast = undefined;
      }
      if (window.logSystemEvent === handleSystemEventLog) {
        window.logSystemEvent = undefined;
      }
    };
  }, [handleGlobalToast, handleSystemEventLog]);

  // 7. Hàm xử lý Smart Bookmark dùng chung cho GameView & Modals (Block 7.1)
  const handleSmartBookmark = useCallback((data) => {
    if (!data) return;
    const currentActions = actionsRef.current;
    if (!currentActions) return;

    if (typeof data === 'string') {
      if (data.trim() && typeof currentActions.handleOpenWordSelector === 'function') {
        currentActions.handleOpenWordSelector(data);
      }
    } else if (typeof data === 'object') {
      if (data.isSmartTarget) {
        if (typeof currentActions.handleOpenWordSelector === 'function') {
          currentActions.handleOpenWordSelector(data);
        }
      } else if (typeof currentActions.handleNotebookSave === 'function') {
        currentActions.handleNotebookSave(data);
      }
    }
  }, []);

  // 8. Hàm cập nhật thẻ từ Mini-games (JIT Enrichment Sync — 100% Pure StrictMode)
  const handleUpdateCards = useCallback(
    (updatedCards) => {
      if (!Array.isArray(updatedCards) || updatedCards.length === 0) return;

      const ctx = persistContextRef.current;
      const targetLang = normalizeActiveLang(ctx.lang);
      const targetMode = normalizeDataMode(ctx.dataMode);
      const dataKey =
        CONFIG_SAMPLES?.[targetLang]?.dataKey || `fc_data_${targetLang}`;
      const isReviewMode = Boolean(
        ctx.isStudyingNotebook || ctx.studySourceName
      );
      const sourceName = ctx.studySourceName || null;

      // Ghi nhận ý định lưu trữ NGOÀI state updater (hỗ trợ gộp an toàn khi React batch)
      const prevIntent = pendingCardsPersistRef.current;
      const samePartition =
        prevIntent &&
        prevIntent.targetLang === targetLang &&
        prevIntent.targetMode === targetMode;

      const accumulatedPatches = samePartition
        ? [...prevIntent.patches, ...updatedCards]
        : [...updatedCards];
      const mergedIsReviewMode = samePartition
        ? Boolean(prevIntent.isReviewMode || isReviewMode)
        : isReviewMode;
      const mergedSourceName =
        samePartition && prevIntent.studySourceName !== sourceName
          ? prevIntent.studySourceName || sourceName
          : sourceName;

      pendingCardsPersistRef.current = {
        dataKey,
        targetLang,
        targetMode,
        isReviewMode: mergedIsReviewMode,
        studySourceName: mergedSourceName,
        patches: accumulatedPatches
      };

      // Updater thuần khiết 100% — KHÔNG chứa side-effect
      setCards((prevCards) => mergeCardsForView(prevCards, updatedCards));

      // Kích hoạt nhịp commit để bảo đảm ref luôn được xử lý & dọn sạch kể cả khi setCards bail-out
      setPersistSeq((seq) => seq + 1);
    },
    [setCards]
  );

  // 8.5. Hiệu ứng đồng bộ thẻ xuống bộ nhớ sau khi React commit (Bảo vệ 4 trục ngữ cảnh + Kho Master Lai)
  useEffect(() => {
    const intent = pendingCardsPersistRef.current;
    if (!intent) return;
    // Dọn sạch ý định ngay lập tức để không bao giờ bị tồn dư sang render kế tiếp
    pendingCardsPersistRef.current = null;

    const activeLang = normalizeActiveLang(lang);
    const activeDataMode = normalizeDataMode(dataMode);
    const activeIsReviewMode = Boolean(isStudyingNotebook || studySourceName);
    const activeSourceName = studySourceName || null;

    // Chặn ghi chéo phân vùng khi người dùng vừa đổi Ngôn ngữ (EN <-> ZH) hoặc Chế độ (Vocab <-> Sentence)
    if (
      intent.targetLang !== activeLang ||
      intent.targetMode !== activeDataMode
    ) {
      return;
    }

    if (!Utils || typeof Utils.safeLocalStorageSet !== 'function') return;

    const canOverwriteActiveDeck =
      !intent.isReviewMode &&
      !activeIsReviewMode &&
      intent.studySourceName === activeSourceName &&
      Array.isArray(cards) &&
      cards.length > 0;

    if (canOverwriteActiveDeck) {
      // Màn hình học chính đang khớp trọn vẹn 4 trục ngữ cảnh -> lưu danh sách phẳng hiện tại
      Utils.safeLocalStorageSet(intent.dataKey, cards);
    } else if (typeof Utils.safeJsonParse === 'function') {
      // Chế độ ôn tập Sổ tay/Lỗi sai hoặc ngữ cảnh vừa chuyển -> TUYỆT ĐỐI không ghi đè toàn kho;
      // chỉ vá cục bộ những thẻ khớp ID / term NFC đang tồn tại trong fc_data_${lang}.
      const savedMainDeck = Utils.safeJsonParse(intent.dataKey, null);
      if (Array.isArray(savedMainDeck) && savedMainDeck.length > 0) {
        const { cards: patchedMain, changed } = applyCardPatchesToDeck(
          savedMainDeck,
          intent.patches
        );
        if (changed) {
          Utils.safeLocalStorageSet(intent.dataKey, patchedMain);
        }
      }
    }

    // Đồng bộ bất biến bản vá JIT Enrichment vào Kho Master Lai (IndexedDB + RAM Mirror 0ms)
    // để chống Động cơ Vòi Nước rửa trôi sau F5 / đổi Level (KHÔNG gọi bumpMasterDataVersion tránh giật game).
    if (typeof Utils.safeJsonParse === 'function') {
      const masterKey = `fc_master_data_${activeLang}_${activeDataMode}`;
      const savedMasterData = Utils.safeJsonParse(masterKey, null);
      if (
        savedMasterData &&
        typeof savedMasterData === 'object' &&
        !Array.isArray(savedMasterData)
      ) {
        const { masterData: patchedMaster, changed: masterChanged } =
          applyCardPatchesToMasterData(savedMasterData, intent.patches);
        if (masterChanged) {
          Utils.safeLocalStorageSet(masterKey, patchedMaster);
        }
      }
    }
  }, [
    cards,
    lang,
    dataMode,
    isStudyingNotebook,
    studySourceName,
    persistSeq
  ]);

  const contextValue = useMemo(
    () => ({
      coreState: coreWithInterceptor,
      state: logic.state,
      setters: logic.setters,
      actions: {
        ...logic.actions,
        handleSmartBookmark,
        handleUpdateCards,
        handleGlobalToast,
        handleSystemEventLog
      },
      examPoolData: logic.examPoolData,
      refs: logic.refs,
      handleGlobalToast,
      handleSystemEventLog,
      handleSmartBookmark,
      handleUpdateCards
    }),
    [
      coreWithInterceptor,
      logic,
      handleSmartBookmark,
      handleUpdateCards,
      handleGlobalToast,
      handleSystemEventLog
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext phải được sử dụng bên trong <AppProvider>');
  }
  return context;
};

export default AppContext;