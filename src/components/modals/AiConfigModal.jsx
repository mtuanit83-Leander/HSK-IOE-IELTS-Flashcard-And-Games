/**
 * @file src/components/modals/AiConfigModal.jsx
 * @description Bảng điều khiển thông số Lõi AI (Độ trễ chờ mạng, Băng đạn tải trước, v.v.).
 * @origin Tầng 4 - Block 4.6 (Sync & Import Modals)
 */

import React, { useState, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';

export const AiConfigModal = ({ isOpen, onClose, aiConfig, setAiConfig, mainColor = 'purple' }) => {
  // Khởi tạo localConfig. Cooldown 429 đã dời sang Radar, nhưng vẫn giữ trong State để tương thích hàm Lưu
  const [localConfig, setLocalConfig] = useState(aiConfig || { loadingTime: 22, delayMs: 2500, maxAmmo: 4, uiCooldown: 9, cooldown429: 120 });
  
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(aiConfig || { loadingTime: 22, delayMs: 2500, maxAmmo: 4, uiCooldown: 9, cooldown429: 120 });
    }
  }, [isOpen, aiConfig]);
  
  if (!isOpen) return null;
  
  const handleChange = (key, val) => {
    setLocalConfig(prev => ({ ...prev, [key]: Number(val) }));
  };
  
  const handleSave = () => {
    setAiConfig(localConfig);
    if (window.globalShowToast) window.globalShowToast("Đã lưu cấu hình Lõi AI!", "success");
    onClose();
  };
  
  const handleReset = () => {
    const def = { loadingTime: 22, delayMs: 2500, maxAmmo: 4, uiCooldown: 9, cooldown429: 120 };
    setLocalConfig(def);
  };
  
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0`}>
          <h3 className={`font-bold text-${mainColor}-700 flex items-center gap-2 text-lg`}>
            <Icons.Sparkles size={24} /> Bảng Điều Khiển Lõi AI
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <Icons.X size={24} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-gray-50/50">
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-xs text-yellow-800 font-medium">
            Cảnh báo: Thay đổi các thông số này có thể ảnh hưởng đến trải nghiệm game hoặc gây lỗi giới hạn API (Rate Limit).
          </div>
          
          {/* Loading Time */}
          <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-700">Thời gian đếm ngược (Loading)</label>
              <span className={`text-sm font-mono font-bold text-${mainColor}-600`}>{localConfig.loadingTime}s</span>
            </div>
            <p className="text-[10px] text-gray-500">Đồng hồ đếm lùi giả lập trong lúc chờ nạp đạn AI (Mặc định: 22s).</p>
            <input type="range" min="5" max="60" step="1" value={localConfig.loadingTime} onChange={(e) => handleChange('loadingTime', e.target.value)} className={`w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${mainColor}-500`} />
          </div>
          
          {/* Delay Ms */}
          <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-700">Thời gian tản nhiệt (Delay)</label>
              <span className={`text-sm font-mono font-bold text-${mainColor}-600`}>{localConfig.delayMs}ms</span>
            </div>
            <p className="text-[10px] text-gray-500">Khoảng nghỉ giữa 2 lần gọi API để tránh lỗi Spam 429 (Mặc định: 2500ms).</p>
            <input type="range" min="1500" max="10000" step="500" value={localConfig.delayMs} onChange={(e) => handleChange('delayMs', e.target.value)} className={`w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${mainColor}-500`} />
          </div>
          
          {/* Max Ammo */}
          <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-700">Băng đạn tối đa (Max Ammo)</label>
              <span className={`text-sm font-mono font-bold text-${mainColor}-600`}>{localConfig.maxAmmo} viên</span>
            </div>
            <p className="text-[10px] text-gray-500">Số lượng câu hỏi được AI tải sẵn dưới nền (Mặc định: 4 viên).</p>
            <input type="range" min="2" max="6" step="1" value={localConfig.maxAmmo} onChange={(e) => handleChange('maxAmmo', e.target.value)} className={`w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${mainColor}-500`} />
          </div>
          
          {/* UI Cooldown */}
          <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-gray-700">Thời gian làm nguội (UI Cooldown)</label>
              <span className={`text-sm font-mono font-bold text-${mainColor}-600`}>{localConfig.uiCooldown || 9}s</span>
            </div>
            <p className="text-[10px] text-gray-500">Thời gian khóa nút chuyển câu để chống spam, bảo vệ băng đạn (Mặc định: 9s).</p>
            <input type="range" min="1" max="15" step="1" value={localConfig.uiCooldown || 9} onChange={(e) => handleChange('uiCooldown', e.target.value)} className={`w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${mainColor}-500`} />
          </div>
        </div>
        
        <div className="p-4 border-t bg-white shrink-0 rounded-b-xl flex justify-between gap-3">
          <button onClick={handleReset} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold hover:bg-gray-200 transition-colors">
            Mặc định
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-lg transition-colors">
              Hủy
            </button>
            <button onClick={handleSave} className={`px-6 py-2 bg-${mainColor}-600 text-white rounded-lg font-bold shadow-md hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center gap-2`}>
              <Icons.Check size={18} /> Lưu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};