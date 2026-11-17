// ============================================================================
// FILE 38/85: src/components/modals/ProgressModals.jsx
// NGUỒN GỐC: tang_4.js (Block 4.3)
// NHIỆM VỤ: Export MasteredModal (Danh sách đã thuộc) và IncorrectModal
//           (Sổ tay cần nhớ / Lỗi sai).
// ============================================================================

import React from 'react';
import { Icons } from '../common/Icons';
import { ReviewDropdown } from './NotebookModal';

/**
 * 1. Modal Danh Sách Đã Thuộc (MasteredModal)
 * Quản lý các thẻ từ vựng/câu văn đã được người dùng đánh dấu thuộc bài,
 * hỗ trợ khôi phục từng thẻ hoặc khôi phục toàn bộ về danh sách đang học.
 */
export const MasteredModal = ({
  isOpen,
  onClose,
  data = [],
  onRestore,
  onRestoreAll,
  t = (k) => k,
  mainColor = 'sky'
}) => {
  if (!isOpen) return null;

  const safeData = Array.isArray(data) ? data : [];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-green-50 flex justify-between items-center">
          <h2 className="font-bold flex gap-2 text-green-700 text-lg items-center">
            <Icons.CheckCircle /> Đã Thuộc ({safeData.length})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Icons.X />
          </button>
        </div>

        {/* Danh sách thẻ đã thuộc */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-50">
          {safeData.length === 0 ? (
            <div className="text-center text-gray-400 mt-10 italic">
              Chưa có từ nào được đánh dấu đã thuộc!
            </div>
          ) : (
            <div className="space-y-2">
              {safeData.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm border border-gray-100"
                >
                  <div className="flex-1 pr-2 overflow-hidden">
                    <div className="font-bold text-gray-800 break-words">
                      {item.term}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {item.definition}
                    </div>
                  </div>
                  <button
                    onClick={() => onRestore && onRestore(item)}
                    className="p-2 text-orange-500 hover:bg-orange-50 rounded-full transition-colors shrink-0"
                    title="Học lại từ này"
                  >
                    <Icons.RotateCcw size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex gap-2">
          <button
            onClick={onRestoreAll}
            disabled={safeData.length === 0}
            title="Khôi phục toàn bộ về danh sách đang học"
            className="px-4 py-2 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 border border-red-200 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap transition-colors active:scale-95 shadow-sm"
          >
            <Icons.RotateCcw size={18} /> Khôi phục tất cả
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition-colors active:scale-95 shadow-sm"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * 2. Modal Sổ Tay Cần Nhớ / Lỗi Sai (IncorrectModal)
 * Tự động thống kê số lần làm sai trong các Mini-Games và Khảo thí,
 * hỗ trợ luyện viết chữ Hán và chuyển thẳng sang 11 chế độ Ôn tập lại.
 */
export const IncorrectModal = ({
  isOpen,
  onClose,
  data = [],
  onRemove,
  onRemoveAll,
  onOpenHanzi,
  t = (k) => k,
  mainColor = 'sky',
  onReviewGame
}) => {
  if (!isOpen) return null;

  const safeData = Array.isArray(data) ? data : [];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0`}
        >
          <h2
            className={`font-bold flex gap-2 text-${mainColor}-700 text-lg items-center`}
          >
            <Icons.Brain size={24} className="text-red-500" /> Sổ tay cần nhớ (
            {safeData.length})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Icons.X />
          </button>
        </div>

        {/* Danh sách các mục cần nhớ */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-50">
          {safeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Icons.Brain size={64} className="mb-4 opacity-20" />
              <p>Bạn chưa có từ nào cần lưu ý!</p>
              <p className="text-xs">
                Hãy chơi game, hệ thống sẽ tự động lưu các câu sai vào đây.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 font-bold text-xs text-gray-500 uppercase px-2 mb-1">
                <div className="col-span-1 text-center">Sai</div>
                <div className="col-span-4">Từ vựng</div>
                <div className="col-span-6">Nghĩa</div>
                <div className="col-span-1"></div>
              </div>
              {safeData.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 bg-white p-3 rounded-lg shadow-sm border border-gray-100 items-center hover:shadow-md transition-shadow"
                >
                  <div className="col-span-1 flex justify-center">
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full border border-red-200">
                      {item.count || 1}
                    </span>
                  </div>
                  <div className="col-span-4 font-bold text-gray-800 break-words">
                    {item.term}
                  </div>
                  <div className="col-span-6 text-sm text-gray-600 break-words">
                    {item.definition}
                  </div>
                  <div className="col-span-1 flex justify-center gap-1">
                    {item.term && mainColor === 'red' && (
                      <button
                        onClick={() => onOpenHanzi && onOpenHanzi(item.term)}
                        className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                        title="Tập viết chữ Hán"
                      >
                        <Icons.Brush size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => onRemove && onRemove(item.term)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded-full transition-colors"
                      title="Đã thuộc, xóa đi"
                    >
                      <Icons.Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white flex justify-between items-center gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
          <div className="flex gap-2">
            <button
              onClick={onRemoveAll}
              disabled={safeData.length === 0}
              className="px-4 py-2 text-red-500 font-bold border border-red-100 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 flex items-center gap-2 transition-colors active:scale-95 shadow-sm"
            >
              <Icons.Trash2 size={18} />{' '}
              <span className="hidden sm:inline">Xóa hết</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-colors active:scale-95"
            >
              Đóng
            </button>
            <ReviewDropdown
              onSelect={(type) =>
                onReviewGame && onReviewGame(type, safeData, 'Sổ tay cần nhớ')
              }
              dataLength={safeData.length}
              mainColor={mainColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.MasteredModal = MasteredModal;
  window.IncorrectModal = IncorrectModal;
}

export default { MasteredModal, IncorrectModal };