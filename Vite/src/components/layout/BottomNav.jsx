import React from 'react';
import { Icons } from '../common/Icons';

/**
 * Widget tùy chỉnh vị trí căn lề Không gian học (Trái / Giữa / Phải) dành cho PC & iPad
 * Giúp tối ưu hóa màn hình khi mở song song cửa sổ Trợ lý AI Chat
 */
export const LayoutAlignWidget = ({ layoutAlign = 'center', setLayoutAlign, visible = true }) => {
  if (!visible || !setLayoutAlign) return null;

  return (
    <div className="fixed top-[15%] right-4 z-[40] hidden md:flex flex-col gap-1 bg-white/90 backdrop-blur shadow-lg rounded-xl p-1.5 border border-gray-200 animate-in fade-in slide-in-from-right-4">
      {/* Căn Trái */}
      <button
        onClick={() => setLayoutAlign('left')}
        title="Đẩy sang Trái (Mở rộng Không gian làm việc)"
        className={`p-2 rounded-lg transition-colors duration-200 ${
          layoutAlign === 'left'
            ? 'bg-indigo-100 text-indigo-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1={4} y1={6} x2={14} y2={6} />
          <line x1={4} y1={12} x2={20} y2={12} />
          <line x1={4} y1={18} x2={14} y2={18} />
        </svg>
      </button>

      {/* Căn Giữa */}
      <button
        onClick={() => setLayoutAlign('center')}
        title="Căn Giữa (Mặc định)"
        className={`p-2 rounded-lg transition-colors duration-200 ${
          layoutAlign === 'center'
            ? 'bg-indigo-100 text-indigo-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1={4} y1={6} x2={20} y2={6} />
          <line x1={8} y1={12} x2={16} y2={12} />
          <line x1={4} y1={18} x2={20} y2={18} />
        </svg>
      </button>

      {/* Căn Phải */}
      <button
        onClick={() => setLayoutAlign('right')}
        title="Đẩy sang Phải"
        className={`p-2 rounded-lg transition-colors duration-200 ${
          layoutAlign === 'right'
            ? 'bg-indigo-100 text-indigo-600'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1={10} y1={6} x2={20} y2={6} />
          <line x1={4} y1={12} x2={20} y2={12} />
          <line x1={10} y1={18} x2={20} y2={18} />
        </svg>
      </button>
    </div>
  );
};

/**
 * Thanh điều hướng dưới đáy ứng dụng (BottomNav)
 */
export const BottomNav = ({
  onNavigate,
  onApiKey,
  onOpenAiChat,
  t = (k) => k,
  mainColor = 'sky',
  currentMode = 'learn'
}) => (
  <div className="bg-white border-t border-gray-200 px-2 py-1 flex justify-around items-center z-[100] pb-safe shadow-[0_-5px_10px_rgba(0,0,0,0.05)] w-full">
    {/* Nút Chế độ Học (Learn Mode) */}
    <button
      onClick={() => onNavigate && onNavigate('learn')}
      className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all ${
        currentMode === 'learn'
          ? `text-${mainColor}-600 bg-${mainColor}-50`
          : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      <Icons.Book
        size={20}
        className={currentMode === 'learn' ? `fill-${mainColor}-100` : ''}
      />
      <span className="text-[10px] font-bold">{t('navLearn')}</span>
    </button>

    {/* Nút Chế độ Trò chơi & Khảo thí (Game Mode) */}
    <button
      onClick={() => onNavigate && onNavigate('game')}
      className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all ${
        currentMode === 'game'
          ? `text-${mainColor}-600 bg-${mainColor}-50`
          : 'text-gray-400 hover:text-orange-500'
      }`}
    >
      <Icons.Gamepad2
        size={20}
        className={currentMode === 'game' ? `fill-${mainColor}-100` : ''}
      />
      <span className="text-[10px] font-bold">{t('navGame')}</span>
    </button>

    {/* Nút Mở Trợ lý AI Chat */}
    <button
      onClick={onOpenAiChat}
      className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all text-gray-400 hover:text-purple-600 active:scale-95"
      title="Trợ lý AI"
    >
      <Icons.Sparkles size={20} />
      <span className="text-[10px] font-bold">AI Chat</span>
    </button>

    {/* Nút Quản lý API Key (Radar) */}
    <button
      onClick={onApiKey}
      className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all text-gray-400 hover:text-purple-600 active:scale-95"
      data-tooltip={t('ttKey')}
      title={t('ttKey')}
    >
      <Icons.Key size={20} />
      <span className="text-[10px] font-bold">{t('navKey')}</span>
    </button>

    {/* Nút Mở Cài đặt Hệ thống (Settings) */}
    <button
      onClick={() => onNavigate && onNavigate('settings')}
      className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all text-gray-400 hover:text-gray-600 active:scale-95"
    >
      <Icons.Settings size={20} />
      <span className="text-[10px] font-bold">{t('navSettings')}</span>
    </button>
  </div>
);

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.BottomNav = BottomNav;
  window.LayoutAlignWidget = LayoutAlignWidget;
}

export default BottomNav;