/**
 * @file src/components/modals/ProgressModals.jsx
 * @description Các Modals hiển thị Thẻ Đã thuộc (Mastered) và Thẻ Lỗi sai (Incorrect).
 * @origin Tầng 4 - Block 4.3 (Learning Tracking Modals)
 */

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';

// ==================================================================================
// Component con dùng chung: Review Dropdown
// ==================================================================================
const ReviewDropdown = ({ onSelect, dataLength, mainColor = 'blue' }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const games = [
    { id: 'flashcard', name: 'Học Thẻ Lật', min: 1, icon: 'BookOpen' },
    { id: 'quiz', name: 'Trắc Nghiệm', min: 2, icon: 'Layers' },
    { id: 'match', name: 'Nối Ô', min: 2, icon: 'Link' },
    { id: 'scramble', name: 'Ghép Câu', min: 1, icon: 'Shuffle' },
    { id: 'fillblank', name: 'Điền Từ', min: 1, icon: 'Keyboard' },
    { id: 'spotmistake', name: 'Tìm Lỗi Sai', min: 1, icon: 'Brain' },
    { id: 'oddoneout', name: 'Từ Khác Loại', min: 4, icon: 'Eye' },
    { id: 'imagequiz', name: 'Đoán Hình', min: 2, icon: 'Image' },
    { id: 'pronunciation', name: 'Vua Ngữ Âm', min: 1, icon: 'Mic' },
    { id: 'listening', name: 'Đôi Tai Vàng', min: 1, icon: 'Headphones' },
    { id: 'reading', name: 'Đọc Hiểu', min: 1, icon: 'BookOpen' }
  ];
  
  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={dataLength === 0}
        className={`px-3 sm:px-4 py-2 bg-${mainColor}-600 text-white font-bold rounded-lg shadow-md hover:bg-${mainColor}-700 flex items-center justify-center gap-2 disabled:opacity-50 text-xs sm:text-base transition-all active:scale-95 h-full`}
      >
        <Icons.Gamepad2 size={16} className="sm:w-[18px] sm:h-[18px]" />
        <span>Ôn tập lại</span>
        <Icons.ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
      )}
      
      {isOpen && (
        <div className="absolute bottom-full right-0 sm:left-0 sm:right-auto mb-2 w-[220px] bg-white border border-gray-100 rounded-xl shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-bottom-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
            Chọn chế độ ôn tập
          </div>
          {games.map(game => {
            const IconComp = Icons[game.icon] || Icons.Gamepad2;
            const isDisabled = dataLength < game.min;
            return (
              <button
                key={game.id}
                onClick={() => {
                  if (!isDisabled) {
                    onSelect(game.id);
                    setIsOpen(false);
                  }
                }}
                disabled={isDisabled}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${isDisabled ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400' : `text-gray-700 hover:bg-${mainColor}-50 hover:text-${mainColor}-700`}`}
                title={isDisabled ? `Cần ít nhất ${game.min} từ để chơi` : ''}
              >
                <IconComp size={16} className={isDisabled ? "text-gray-400" : `text-${mainColor}-500`} />
                <div className="flex flex-col">
                  <span className="font-bold text-sm leading-tight">{game.name}</span>
                  {isDisabled && <span className="text-[9px] text-red-400 font-medium leading-tight mt-0.5">Cần {game.min} từ</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==================================================================================
// 1. MASTERED MODAL (DANH SÁCH ĐÃ THUỘC)
// ==================================================================================
export const MasteredModal = ({ isOpen, onClose, data, onRestore, onRestoreAll, t, mainColor }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-green-50 flex justify-between items-center">
          <h2 className="font-bold flex gap-2 text-green-700 text-lg">
            <Icons.CheckCircle /> Đã Thuộc ({data.length})
          </h2>
          <button onClick={onClose}><Icons.X /></button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-50">
          {data.length === 0 ? (
            <div className="text-center text-gray-400 mt-10 italic">Chưa có từ nào được đánh dấu đã thuộc!</div>
          ) : (
            <div className="space-y-2">
              {data.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{item.term}</div>
                    <div className="text-xs text-gray-500 truncate">{item.definition}</div>
                  </div>
                  <button onClick={() => onRestore(item)} className="p-2 text-orange-500 hover:bg-orange-50 rounded-full" title="Học lại từ này">
                    <Icons.RotateCcw size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex gap-2">
          <button onClick={onRestoreAll} disabled={data.length === 0} title="Khôi phục toàn bộ về danh sách đang học" className="px-4 py-2 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 border border-red-200 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap transition-colors active:scale-95 shadow-sm">
            <Icons.RotateCcw size={18} /> Khôi phục tất cả
          </button>
          <button onClick={onClose} className="flex-1 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors active:scale-95 shadow-sm">{t('close')}</button>
        </div>
      </div>
    </div>
  );
};

// ==================================================================================
// 2. INCORRECT MODAL (SỔ TAY CẦN NHỚ / LỖI SAI)
// ==================================================================================
export const IncorrectModal = ({ isOpen, onClose, data, onRemove, onRemoveAll, onOpenHanzi, t, mainColor, onReviewGame }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0`}>
          <h2 className={`font-bold flex gap-2 text-${mainColor}-700 text-lg items-center`}>
            <Icons.Brain size={24} className="text-red-500" /> Sổ tay cần nhớ ({data.length})
          </h2>
          <button onClick={onClose}><Icons.X /></button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-50">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Icons.Brain size={64} className="mb-4 opacity-20" />
              <p>Bạn chưa có từ nào cần lưu ý!</p>
              <p className="text-xs">Hãy chơi game, hệ thống sẽ tự động lưu các câu sai vào đây.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 font-bold text-xs text-gray-500 uppercase px-2 mb-1">
                <div className="col-span-1 text-center">Sai</div>
                <div className="col-span-4">Từ vựng</div>
                <div className="col-span-6">Nghĩa</div>
                <div className="col-span-1"></div>
              </div>
              {data.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-white p-3 rounded-lg shadow-sm border border-gray-100 items-center hover:shadow-md transition-shadow">
                  <div className="col-span-1 flex justify-center">
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full border border-red-200">
                      {item.count || 1}
                    </span>
                  </div>
                  <div className="col-span-4 font-bold text-gray-800 break-words">{item.term}</div>
                  <div className="col-span-6 text-sm text-gray-600 break-words">{item.definition}</div>
                  <div className="col-span-1 flex justify-center gap-1">
                    {item.term && mainColor === 'red' && (
                      <button onClick={() => onOpenHanzi(item.term)} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Tập viết chữ Hán">
                        <Icons.Brush size={18} />
                      </button>
                    )}
                    <button onClick={() => onRemove(item.term)} className="text-gray-400 hover:text-red-500 p-1 rounded-full transition-colors" title="Đã thuộc, xóa đi">
                      <Icons.Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-white flex justify-between items-center gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
          <div className="flex gap-2">
            <button onClick={onRemoveAll} disabled={data.length === 0} className="px-4 py-2 text-red-500 font-bold border border-red-100 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 flex items-center gap-2 transition-colors active:scale-95 shadow-sm">
              <Icons.Trash2 size={18} /> <span className="hidden sm:inline">Xóa hết</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors active:scale-95">Đóng</button>
            <ReviewDropdown onSelect={(type) => onReviewGame && onReviewGame(type, data, 'Sổ tay cần nhớ')} dataLength={data.length} mainColor={mainColor} />
          </div>
        </div>
      </div>
    </div>
  );
};