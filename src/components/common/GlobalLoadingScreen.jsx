import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';

/**
 * Màn hình chờ đếm ngược toàn cục khi khởi tạo hoặc nạp đạn AI cho Mini-Games
 */
export const GlobalLoadingScreen = ({
  duration = 0,
  onComplete,
  onCancel,
  queueLength = 0,
  text = 'Hệ thống đang đúc dữ liệu...',
  subText = 'Vui lòng đợi trong giây lát',
  mainColor = 'blue',
  levelStr = '',
  engine = null
}) => {
  const getSafeDuration = () => {
    try {
      const cfg = JSON.parse(localStorage.getItem('fc_ai_config'));
      if (cfg && cfg.loadingTime) return Number(cfg.loadingTime);
    } catch (e) {}
    if (duration > 0) return Number(duration);
    return 22;
  };

  const [timeLeft, setTimeLeft] = useState(getSafeDuration);
  const [localQueueLength, setLocalQueueLength] = useState(queueLength);

  // Đồng bộ số lượng đạn đã nạp trong QueueEngine (nếu truyền trực tiếp engine hoặc qua prop queueLength)
  useEffect(() => {
    if (engine && typeof engine.length === 'function') {
      const id = setInterval(() => setLocalQueueLength(engine.length()), 500);
      return () => clearInterval(id);
    } else {
      setLocalQueueLength(queueLength);
    }
  }, [engine, queueLength]);

  // Bộ đếm lùi thời gian chờ
  useEffect(() => {
    if (timeLeft <= 0) {
      if (onComplete) onComplete();
      return;
    }
    const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, onComplete]);

  // Chuẩn hóa chuỗi hiển thị cấp độ an toàn (phòng trường hợp nhận mảng Multi-select)
  const displayLevelStr = Array.isArray(levelStr) ? levelStr.join(', ') : levelStr;

  return (
    <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 items-center justify-center animate-in fade-in p-6 text-center absolute inset-0 z-50">
      <div className="relative mb-6 flex items-center justify-center">
        <div className={`absolute w-24 h-24 border-4 border-${mainColor}-100 rounded-full`}></div>
        <div
          className={`absolute w-24 h-24 border-4 border-${mainColor}-500 border-t-transparent rounded-full animate-spin`}
        ></div>
        <div className={`relative z-10 font-black text-3xl text-${mainColor}-600 drop-shadow-sm`}>
          {timeLeft}
        </div>
      </div>

      <h2 className="text-xl font-black text-gray-800 mb-2 tracking-wide uppercase">{text}</h2>
      <p className={`text-${mainColor}-600 text-sm font-bold animate-pulse mb-6`}>{subText}</p>

      {localQueueLength > 0 && (
        <div
          className={`px-5 py-2.5 bg-white border border-${mainColor}-200 rounded-full flex items-center gap-2.5 shadow-sm animate-in slide-in-from-bottom-4`}
        >
          <Icons.Database size={18} className={`text-${mainColor}-500 animate-bounce`} />
          <span className={`text-sm font-black text-${mainColor}-700 uppercase tracking-widest`}>
            Đã nạp sẵn: {localQueueLength} câu AI
          </span>
        </div>
      )}

      {displayLevelStr && (
        <p className="text-gray-400 text-xs mt-4 italic">(Cấp độ: {displayLevelStr})</p>
      )}

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-8 text-sm text-gray-400 hover:text-red-500 font-bold border px-6 py-3 rounded-xl transition-colors hover:bg-red-50 bg-white shadow-sm"
        >
          Hủy bỏ
        </button>
      )}
    </div>
  );
};

// Gắn vào window để tương thích ngược với các module đang chuyển đổi
if (typeof window !== 'undefined') {
  window.GlobalLoadingScreen = GlobalLoadingScreen;
}

export default GlobalLoadingScreen;