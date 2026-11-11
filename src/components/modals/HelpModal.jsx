/**
 * @file src/components/modals/HelpModal.jsx
 * @description Tài liệu hướng dẫn sử dụng toàn diện, giải thích luật chơi và phím tắt.
 * @origin Tầng 4 - Block 4.8 (User Guide & Documentation)
 */

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';

export const HelpModal = ({ isOpen, onClose, t, mainColor = 'blue' }) => {
  const [activeTab, setActiveTab] = useState('learn');
  if (!isOpen) return null;
  
  // Màng lọc an toàn chống lỗi Crash do thiếu Icon (Polyfill fallback)
  const SafeIcon = ({ name, size = 16, className = "" }) => {
    const Comp = Icons[name];
    if (!Comp) {
      return <span style={{width: size, height: size}} className={`inline-block border-2 border-current rounded-sm opacity-40 ${className}`}></span>;
    }
    return <Comp size={size} className={className} />;
  };
  
  const tabs = [
    { id: 'learn', label: 'Học & SRS', icon: <SafeIcon name="Book" size={16} /> },
    { id: 'game', label: 'Mini-Games', icon: <SafeIcon name="Gamepad2" size={16} /> },
    { id: 'ai', label: 'AI & Dữ liệu', icon: <SafeIcon name="Sparkles" size={16} /> },
    { id: 'keys', label: 'Phím tắt', icon: <SafeIcon name="Keyboard" size={16} /> }
  ];
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'learn':
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
              <h3 className="font-bold text-blue-800 flex items-center gap-2 mb-2"><SafeIcon name="Layers" size={18}/> Thuật toán Lặp lại Ngắt quãng (SRS)</h3>
              <p className="text-sm text-blue-700 leading-relaxed mb-3">
                Flashcard Lite sử dụng thuật toán SRS (Spaced Repetition System) thông minh để tối ưu hóa trí nhớ của bạn. Khi lật thẻ, bạn sẽ tự đánh giá mức độ nhớ:
              </p>
              <ul className="grid grid-cols-2 gap-2 text-xs">
                <li className="bg-white p-2 rounded shadow-sm border-l-4 border-red-400"><b>Lại (Again):</b> Chưa thuộc, học lại ngay.</li>
                <li className="bg-white p-2 rounded shadow-sm border-l-4 border-orange-400"><b>Khó (Hard):</b> Nhớ mang máng, lặp lại ngắn.</li>
                <li className="bg-white p-2 rounded shadow-sm border-l-4 border-blue-400"><b>Tốt (Good):</b> Đã thuộc, lặp lại vừa phải.</li>
                <li className="bg-white p-2 rounded shadow-sm border-l-4 border-green-400"><b>Dễ (Easy):</b> Thuộc làu, lặp lại rất thưa.</li>
              </ul>
            </div>
            
            <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`p-3 bg-white rounded-full shadow-sm text-gray-500 border border-gray-200 shrink-0 h-fit`}>
                <SafeIcon name="Smartphone" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">Thao tác trên Điện thoại</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Vuốt sang <b>Trái</b> để sang thẻ tiếp theo. Vuốt sang <b>Phải</b> để quay lại thẻ trước. Chạm vào giữa màn hình để lật thẻ.
                  Giao diện đã khóa thanh cuộn để chống hiện tượng giật màn hình (Layout Shift).
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`p-3 bg-white rounded-full shadow-sm text-gray-500 border border-gray-200 shrink-0 h-fit`}>
                <SafeIcon name="PlayCircle" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">Chế độ Rảnh tay (Auto-Play)</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Bật chế độ Tự động chạy, ứng dụng sẽ tự lật thẻ và đọc phát âm. Bạn có thể bấm nút hình <b>Mặt trăng (Battery Saver)</b> để làm mờ màn hình, tiết kiệm pin khi chỉ muốn nghe thụ động.
                </p>
              </div>
            </div>
          </div>
        );
        
      case 'game':
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl">
              <h3 className="font-bold text-purple-800 flex items-center gap-2 mb-2"><SafeIcon name="Gamepad2" size={18}/> Hệ sinh thái 10 Mini-Games</h3>
              <p className="text-sm text-purple-700 leading-relaxed">
                Ứng dụng sở hữu 10 trò chơi (Nối ô, Ghép câu, Điền từ, Đoán hình, Nghe hiểu...) giúp biến từ vựng thành phản xạ. Bạn có thể chọn chế độ <b>Theo Session (20 câu)</b> để ôn nhẹ nhàng hoặc <b>Vô tận (Endless)</b> để cày toàn bộ kho từ.
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                <h4 className="font-bold text-gray-800 text-sm mb-1 flex items-center gap-2"><SafeIcon name="ShieldAlert" size={16} className="text-orange-500"/> Cơ chế Kỷ luật & Chống lặp</h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  - <b>Anti-Streak:</b> AI sẽ tự động xáo trộn vị trí nếu một đáp án đúng (VD: luôn nằm ở nút A) xuất hiện quá 2 lần liên tiếp.<br/>
                  - <b>Kỷ luật thoát ngang:</b> Nếu bạn thoát game khi chưa trả lời xong một câu hỏi, ứng dụng sẽ ghi nhận đó là 1 lần sai và lưu từ vựng đó vào danh sách ôn tập.
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                <h4 className="font-bold text-gray-800 text-sm mb-1 flex items-center gap-2"><SafeIcon name="Cpu" size={16} className="text-blue-500"/> Động cơ Nạp đạn ngầm (Queue Engine)</h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Khi bạn đang chơi, ứng dụng luôn âm thầm nạp trước 3-4 câu hỏi AI tiếp theo ở chế độ nền. Giúp triệt tiêu hoàn toàn thời gian chờ (Loading) giữa các câu, tạo cảm giác mượt mà như game Offline.
                </p>
              </div>
            </div>
          </div>
        );
        
      case 'ai':
        return (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-teal-50 border border-teal-100 p-4 rounded-xl">
              <h3 className="font-bold text-teal-800 flex items-center gap-2 mb-2"><SafeIcon name="MessageSquare" size={18}/> Trợ lý AI Chat Đa nhiệm</h3>
              <p className="text-sm text-teal-700 leading-relaxed">
                Cửa sổ AI Chat được thiết kế như một ứng dụng Windows thu nhỏ. Bạn có thể <b>Kéo thả</b>, <b>Co giãn</b>, bấm nút <b>Phóng to/Thu nhỏ</b> hoặc nháy đúp vào thanh tiêu đề. Thoải mái bôi đen và copy các đoạn giải thích ngữ pháp do AI cung cấp.
              </p>
            </div>
            
            <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`p-3 bg-white rounded-full shadow-sm text-yellow-500 border border-yellow-200 shrink-0 h-fit`}>
                <SafeIcon name="Zap" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">Làm giàu thẻ (Enrichment)</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Bấm nút có biểu tượng AI trên Flashcard, hệ thống sẽ tự động phân tích từ loại, viết phiên âm, dịch nghĩa chuẩn, tra cứu âm Hán Việt (nếu học tiếng Trung) và đặt câu ví dụ minh họa.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className={`p-3 bg-white rounded-full shadow-sm text-green-500 border border-green-200 shrink-0 h-fit`}>
                <SafeIcon name="Database" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-gray-800 mb-1">Kho Dữ Liệu Google Sheets & Thu hoạch</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Lõi ứng dụng đọc dữ liệu trực tiếp từ Google Sheets của bạn. Trong quá trình chơi game, mọi câu hỏi hay do AI tự sáng tác đều được thu hoạch vào <b>Kho Dữ liệu AI</b>. Bạn có thể xuất Kho này ra file Excel bất cứ lúc nào để làm giàu bộ bài cá nhân.
                </p>
              </div>
            </div>
          </div>
        );
        
      case 'keys':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-800 text-gray-200 rounded-xl p-5 shadow-inner">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wider border-b border-gray-600 pb-2">
                <SafeIcon name="Navigation" size={18} className="text-blue-400"/> Điều hướng Thẻ
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-sm font-mono">
                <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Thẻ tiếp theo</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-green-400">D / Mũi tên Phải</kbd>
                </div>
                <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Thẻ trước đó</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-red-400">A / Mũi tên Trái</kbd>
                </div>
                <div className="col-span-1 sm:col-span-2 flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Lật thẻ / Kiểm tra</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-blue-400">Space / Enter</kbd>
                </div>
              </div>
              
              <h3 className="font-bold text-white mt-6 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider border-b border-gray-600 pb-2">
                <SafeIcon name="Settings" size={18} className="text-orange-400"/> Tính năng
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-sm font-mono">
                <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Nghe phát âm</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-yellow-400">S</kbd>
                </div>
                <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Auto-Play</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-purple-400">P</kbd>
                </div>
                <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Khóa lật thẻ</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-cyan-400">L</kbd>
                </div>
                <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Trộn bài (Shuffle)</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-pink-400">R</kbd>
                </div>
                <div className="col-span-1 sm:col-span-2 flex justify-between items-center bg-gray-700/50 p-2 rounded">
                  <span className="text-gray-300 font-sans">Tắt/Bật âm (Mute)</span>
                  <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-gray-400">M</kbd>
                </div>
              </div>
              
              <h3 className="font-bold text-white mt-6 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider border-b border-gray-600 pb-2">
                <SafeIcon name="Edit3" size={18} className="text-green-400"/> Nhập liệu
              </h3>
              <div className="col-span-1 sm:col-span-2 flex justify-between items-center bg-gray-700/50 p-2 rounded text-sm font-mono">
                <span className="text-gray-300 font-sans">Xóa nhanh ô gõ & Focus</span>
                <kbd className="bg-gray-900 px-2 py-1 rounded border border-gray-600 text-rose-400 font-bold">Delete</kbd>
              </div>
            </div>
          </div>
        );
    }
  };
  
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0`}>
          <h2 className={`font-bold flex gap-2 text-${mainColor}-700 text-lg items-center`}>
            <SafeIcon name="HelpCircle" size={24} /> Tài liệu Hướng dẫn Toàn diện
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors p-1"><SafeIcon name="X" /></button>
        </div>
        
        {/* Tabs Control */}
        <div className="flex border-b bg-gray-50 overflow-x-auto custom-scrollbar shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[120px] py-3 px-4 text-sm font-bold flex justify-center items-center gap-2 transition-all border-b-2
                ${activeTab === tab.id
                  ? `text-${mainColor}-600 border-${mainColor}-600 bg-white`
                  : 'text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        
        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 custom-scrollbar bg-white">
          {renderTabContent()}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 text-center shrink-0 flex justify-end">
          <button onClick={onClose} className={`px-8 py-2.5 bg-${mainColor}-600 text-white font-bold rounded-xl shadow-md hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center gap-2`}>
            <SafeIcon name="Check" size={18} /> Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};