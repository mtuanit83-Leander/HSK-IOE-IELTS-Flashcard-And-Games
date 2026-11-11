/**
 * @file src/components/modals/SaveLoadModal.jsx
 * @description Quản lý tính năng Sao lưu (Backup) và Phục hồi (Restore) toàn bộ trạng thái dữ liệu của ứng dụng ra file JSON.
 * @origin Tầng 4 - Block 4.4 (Save/Load Modal)
 */

import React, { useState, useRef } from 'react';
import { Icons } from '@/components/common/Icons';

export const SaveLoadModal = ({ isOpen, onClose, onExport, onImport, t, mainColor }) => {
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  if (!isOpen) return null;
  
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    
    // Yêu cầu xác nhận từ người dùng trước khi tiến hành Import
    if (window.confirm("CẢNH BÁO: Dữ liệu phục hồi sẽ ghi đè và xóa hoàn toàn tiến trình học hiện tại của bạn. Bạn có chắc chắn muốn tiếp tục không?")) {
      try {
        await onImport(file);
      } catch (error) {
        console.error("Lỗi phục hồi:", error);
        if(window.globalShowToast) window.globalShowToast("Lỗi khi đọc file backup!", "error");
      }
    } else {
      // Hủy bỏ
      if (window.globalShowToast) window.globalShowToast("Đã hủy phục hồi dữ liệu.", "info");
    }
    
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
  };
  
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center`}>
          <h3 className={`font-bold text-${mainColor}-700 flex items-center gap-2 text-lg`}>
            <Icons.Save size={24} /> Sao lưu & Phục hồi
          </h3>
          <button onClick={onClose} disabled={isProcessing} className="text-gray-400 hover:text-gray-700 transition-colors">
            <Icons.X size={24} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 bg-gray-50">
          {/* Phần 1: Export (Lưu Game) */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <Icons.Download size={20} />
              </div>
              <div>
                <h4 className="font-bold text-gray-800">Tạo bản Sao lưu</h4>
                <p className="text-xs text-gray-500">Lưu toàn bộ thẻ, điểm số và cấu hình.</p>
              </div>
            </div>
            <button
              onClick={onExport}
              disabled={isProcessing}
              className="w-full mt-3 py-3 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              Tải file Backup (.json)
            </button>
          </div>
          
          {/* Phần 2: Import (Load Game) */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                <Icons.Upload size={20} />
              </div>
              <div>
                <h4 className="font-bold text-gray-800">Phục hồi dữ liệu</h4>
                <p className="text-xs text-gray-500">Tải lên file .json đã lưu trước đó.</p>
              </div>
            </div>
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full mt-3 py-3 bg-orange-500 text-white font-bold rounded-lg shadow hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Đang xử lý...</>
              ) : (
                "Chọn file Backup"
              )}
            </button>
            <p className="text-[10px] text-center text-red-500 mt-2 font-medium italic">
              Cảnh báo: Phục hồi sẽ ghi đè dữ liệu hiện tại!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};