/* eslint-disable react-refresh/only-export-components */
// ============================================================================
// FILE 83/85: src/context/AppContext.jsx
// NGUỒN GỐC: Tầng 6 (Block 6.1 + 6.4) & Tầng 7 (Block 7.1 Interceptor)
// NHIỆM VỤ: Tạo AppProvider hợp nhất useCoreState + useAppLogic + Bộ đánh chặn
//           Toast/System Logs (Hộp đen sự kiện) và cung cấp useAppContext().
// ============================================================================

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo
} from 'react';
import { CONFIG_SAMPLES } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { useCoreState } from '@/hooks/useCoreState';
import { useAppLogic } from '@/hooks/useAppLogic';

export const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  // [CỜ BẢO VỆ THANH TRỪNG NGÔN NGỮ] Chặn lỗi dữ liệu 'vi' cũ gây màn hình trắng
  useEffect(() => {
    const savedLang = localStorage.getItem('fc_lang');
    if (savedLang === 'vi' || savedLang === '"vi"') {
      localStorage.setItem('fc_lang', JSON.stringify('en'));
      window.location.reload();
    }
  }, []);

  // 1. Khởi tạo Core State (Tầng 6 - Block 6.1)
  const coreState = useCoreState();
  const { setToast, setSystemLogs, setCards, lang } = coreState;

  // 2. [HỘP ĐEN SỰ KIỆN] Bộ Đánh chặn Toast (Toast Interceptor - Block 7.1)
  const handleGlobalToast = useCallback(
    (msg, type = 'success') => {
      const messageText =
        typeof msg === 'string'
          ? msg
          : msg?.text || msg?.message || 'Thông báo';
      const messageType =
        typeof msg === 'object' && msg?.type ? msg.type : type;

      setToast({ text: messageText, type: messageType, id: Date.now() });

      if (messageType === 'error' || messageType === 'warning') {
        setSystemLogs((prev) => {
          const newLog = {
            id: Date.now(),
            message: messageText,
            type: messageType,
            timeStr:
              new Date().toLocaleTimeString('vi-VN', { hour12: false }) +
              ' ' +
              new Date().toLocaleDateString('vi-VN')
          };
          return [newLog, ...prev].slice(0, 50);
        });
      }
    },
    [setToast, setSystemLogs]
  );

  // 3. Hệ thống Ghi log chuyên sâu (Deep-Logging - Block 7.1)
  const handleSystemEventLog = useCallback(
    (message, errorDetail = null) => {
      let detailStr = '';
      if (errorDetail) {
        detailStr =
          typeof errorDetail === 'object'
            ? errorDetail.message || JSON.stringify(errorDetail)
            : String(errorDetail);
      }
      const fullMessage = detailStr
        ? `${message} | Detail: ${detailStr}`
        : message;

      setSystemLogs((prev) => {
        const newLog = {
          id: Date.now() + Math.random(),
          message: fullMessage,
          type: 'error',
          timeStr:
            new Date().toLocaleTimeString('vi-VN', { hour12: false }) +
            ' ' +
            new Date().toLocaleDateString('vi-VN')
        };
        return [newLog, ...prev].slice(0, 50);
      });
    },
    [setSystemLogs]
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

  // 6. Đăng ký Global Toast & System Log lên window cho các Engine Tầng 2/5/6
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.globalShowToast = handleGlobalToast;
      window.logSystemEvent = handleSystemEventLog;
    }
  }, [handleGlobalToast, handleSystemEventLog]);

  // 7. Hàm xử lý Smart Bookmark dùng chung cho GameView & Modals (Block 7.1)
  const handleSmartBookmark = useCallback(
    (data) => {
      if (!data) return;
      if (typeof data === 'string') {
        if (logic.actions?.handleOpenWordSelector) {
          logic.actions.handleOpenWordSelector(data);
        }
      } else if (typeof data === 'object') {
        if (data.isSmartTarget) {
          if (logic.actions?.handleOpenWordSelector) {
            logic.actions.handleOpenWordSelector(data);
          }
        } else if (logic.actions?.handleNotebookSave) {
          logic.actions.handleNotebookSave(data);
        }
      }
    },
    [logic.actions]
  );

  // 8. Hàm cập nhật thẻ từ Mini-games (JIT Enrichment Sync - Block 7.1)
  const handleUpdateCards = useCallback(
    (updatedCards) => {
      if (!Array.isArray(updatedCards) || updatedCards.length === 0) return;
      setCards((prevCards) => {
        let nextCards;
        if (updatedCards.length >= prevCards.length) {
          nextCards = updatedCards;
        } else {
          const patchMap = new Map(
            updatedCards.map((item) => [item.term, item])
          );
          nextCards = prevCards.map((c) =>
            patchMap.has(c.term) ? { ...c, ...patchMap.get(c.term) } : c
          );
        }
        const dataKey =
          CONFIG_SAMPLES?.[lang]?.dataKey || `fc_data_${lang}`;
        Utils.safeLocalStorageSet(dataKey, nextCards);
        return nextCards;
      });
    },
    [lang, setCards]
  );

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