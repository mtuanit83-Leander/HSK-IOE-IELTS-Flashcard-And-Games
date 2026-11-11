/**
 * @file src/context/AppContext.jsx
 * @description Điểm neo Context API (Single Source of Truth) bọc toàn bộ ứng dụng. 
 * Giải quyết triệt để tình trạng "Prop Drilling", phân phối State và Action đi muôn nơi.
 * @origin Tầng 6 - Kiến trúc Mới (React Context)
 */

import React, { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { useCoreState } from '@/hooks/useCoreState';
import { useAppLogic } from '@/hooks/useAppLogic';

// 1. Khởi tạo Context
const AppContext = createContext(null);

// 2. Provider bọc ngoài cùng ứng dụng
export const AppProvider = ({ children }) => {
  // Khởi tạo gốc rễ State
  const coreState = useCoreState();
  const coreStateRef = useRef(coreState);

  useEffect(() => {
    coreStateRef.current = coreState;
  }, [coreState]);

  // ============================================================================
  // HỘP ĐEN SỰ KIỆN (INTERCEPTORS) - Bắt mọi tín hiệu Toast & Log từ mọi nơi
  // ============================================================================
  const handleGlobalToast = useCallback((msg, type = 'success') => {
    const messageText = typeof msg === 'string' ? msg : (msg?.text || msg?.message || 'Thông báo');
    const messageType = (typeof msg === 'object' && msg?.type) ? msg.type : type;
    
    // Gắn vào Toast Queue của UI
    coreState.setToast({ text: messageText, type: messageType, id: Date.now() });
    
    // Tự động sao lưu vào System Logs nếu là lỗi
    if (messageType === 'error' || messageType === 'warning') {
      coreState.setSystemLogs(prev => {
        const newLog = {
          id: Date.now(),
          message: messageText,
          type: messageType,
          timeStr: new Date().toLocaleTimeString('vi-VN', { hour12: false }) + ' ' + new Date().toLocaleDateString('vi-VN')
        };
        return [newLog, ...prev].slice(0, 50);
      });
    }
  }, [coreState.setToast, coreState.setSystemLogs]);

  const handleSystemEventLog = useCallback((message, errorDetail = null) => {
    let detailStr = "";
    if (errorDetail) {
      detailStr = typeof errorDetail === 'object' ? (errorDetail.message || JSON.stringify(errorDetail)) : String(errorDetail);
    }
    const fullMessage = detailStr ? `${message} | Detail: ${detailStr}` : message;
    
    coreState.setSystemLogs(prev => {
      const newLog = {
        id: Date.now() + Math.random(),
        message: fullMessage,
        type: 'error',
        timeStr: new Date().toLocaleTimeString('vi-VN', { hour12: false }) + ' ' + new Date().toLocaleDateString('vi-VN')
      };
      return [newLog, ...prev].slice(0, 50);
    });
  }, [coreState.setSystemLogs]);

  // Ép Interceptor vào Core State trước khi đẩy vào Main Switchboard
  const coreWithInterceptor = { ...coreState, setToast: handleGlobalToast };
  
  // Khởi động Động cơ điều phối chính
  const appLogic = useAppLogic(coreWithInterceptor);

  // Đăng ký các hàm cứu hộ lên Window cho các tệp Non-React (Ngoại lệ Điều 2.2)
  useEffect(() => {
    window.globalShowToast = handleGlobalToast;
    window.logSystemEvent = handleSystemEventLog;
    
    // Polyfill tương thích ngược cho cấu trúc truyền Toast kiểu cũ
    const originalToast = window.globalShowToast;
    window.globalShowToast = (msg, type = 'success') => {
      if (typeof msg === 'object' && msg !== null) {
        handleGlobalToast(msg.text || msg.message || '', msg.type || type);
      } else {
        handleGlobalToast(String(msg), type);
      }
    };
    
    return () => {
      window.globalShowToast = originalToast;
    };
  }, [handleGlobalToast, handleSystemEventLog]);

  // 3. Đóng gói Giá trị (Value) để cấp phát cho toàn mạng lưới
  const contextValue = {
    state: appLogic.state,
    actions: appLogic.actions,
    setters: appLogic.setters,
    examPoolData: appLogic.examPoolData,
    refs: appLogic.refs,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {/* Cầu dao chờ Cơ sở dữ liệu IndexedDB nạp xong */}
      {!coreState.isDbReady ? (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-blue-600 font-bold animate-pulse tracking-widest uppercase text-sm">Nạp CSDL IndexedDB...</p>
        </div>
      ) : (
        children
      )}
    </AppContext.Provider>
  );
};

// 4. Custom Hook rút gọn để truy xuất Context từ các Component con
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext phải được sử dụng bên trong một AppProvider!");
  }
  return context;
};