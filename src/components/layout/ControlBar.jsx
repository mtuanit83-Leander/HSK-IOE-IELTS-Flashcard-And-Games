/**
 * @file src/components/layout/ControlBar.jsx
 * @description Thanh điều khiển phát nằm ở đáy thẻ Flashcard (Play, Pause, Lock, Shuffle, Bookmark).
 * @origin Tầng 3 - Block 3.2 (Layout & Control Components)
 */

import React from 'react';
import { Icons } from '@/components/common/Icons';

export const ControlBar = ({ 
  isShuffle, setIsShuffle, handlePrev, handleNext, isAutoPlaying, 
  toggleAutoPlay, isAutoMode, handleStopAutoPlay, isFlipLocked, 
  setIsFlipLocked, handleOpenWordSelector, handleMarkMastered, 
  t, mainColor, isCurrentCardInNotebook, onToggleBatterySaver 
}) => {
  const btnClass = "w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-full shadow transition-all active:scale-95";
  
  return (
    <div className="py-2 flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 shrink-0">
      <button 
        onClick={() => setIsShuffle(!isShuffle)} 
        className={`${btnClass} ${isShuffle ? 'bg-' + mainColor + '-100 text-' + mainColor + '-600' : 'bg-white text-gray-400 border border-gray-200 hover:text-gray-600'}`} 
        title={t('ttShuffle')}
      >
        <Icons.Shuffle size={18} className="sm:w-5 sm:h-5" />
      </button>
      
      <button 
        onClick={handlePrev} 
        className={`${btnClass} bg-white text-gray-400 border border-gray-200 hover:text-gray-600`} 
        title={t('ttPrev')}
      >
        <Icons.ChevronLeft size={18} className="sm:w-5 sm:h-5" />
      </button>
      
      <button 
        onClick={toggleAutoPlay} 
        className={`w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center rounded-full shadow-lg border-2 transition-all transform hover:scale-105 active:scale-95 ${isAutoPlaying ? 'bg-orange-100 border-orange-400 text-orange-600 animate-pulse' : 'bg-white border-' + mainColor + '-100 text-' + mainColor + '-600'}`} 
        title={t('ttAutoPlay')}
      >
        {isAutoPlaying ? <Icons.Pause size={24} fill="currentColor" className="sm:w-7 sm:h-7" /> : <Icons.Play size={24} fill="currentColor" className="sm:w-7 sm:h-7" />}
      </button>
      
      {isAutoMode && (
        <button 
          onClick={() => setIsFlipLocked(!isFlipLocked)} 
          className={`${btnClass} ${isFlipLocked ? 'bg-red-100 text-red-600 border-red-400' : 'bg-white text-gray-400 border border-gray-200 hover:text-red-400'}`} 
          title={t('ttFlipLock')}
        >
          {isFlipLocked ? <Icons.Lock size={18} className="sm:w-5 sm:h-5" /> : <Icons.Unlock size={18} className="sm:w-5 sm:h-5" />}
        </button>
      )}
      
      {isAutoMode && (
        <button 
          onClick={onToggleBatterySaver} 
          className={`${btnClass} bg-gray-800 text-yellow-400 border border-gray-600 hover:bg-black hover:text-yellow-300`} 
          title="Chế độ Rảnh tay (Giữ màn hình sáng + Tiết kiệm pin)"
        >
          <Icons.Moon size={18} fill="currentColor" className="sm:w-5 sm:h-5" />
        </button>
      )}
      
      {isAutoMode && (
        <button 
          onClick={handleStopAutoPlay} 
          className={`${btnClass} bg-white border border-gray-200 text-red-500 hover:bg-red-50 hover:text-red-700`} 
          title={t('ttStop')}
        >
          <Icons.Square size={18} fill="currentColor" className="sm:w-5 sm:h-5" />
        </button>
      )}
      
      <button 
        onClick={handleOpenWordSelector} 
        className={`${btnClass} ${isCurrentCardInNotebook ? 'bg-yellow-100 text-yellow-600 border-yellow-400 scale-110 hover:scale-100' : 'bg-white text-gray-400 border border-gray-200 hover:text-yellow-400'}`} 
        data-tooltip={t('ttBookmark')}
      >
        <Icons.Bookmark size={18} fill={isCurrentCardInNotebook ? "currentColor" : "none"} className="sm:w-5 sm:h-5" />
      </button>
      
      <button 
        onClick={handleNext} 
        className={`${btnClass} bg-white text-gray-400 border border-gray-200 hover:text-gray-600`} 
        title={t('ttNext')}
      >
        <Icons.ChevronRight size={18} className="sm:w-5 sm:h-5" />
      </button>
      
      <button 
        onClick={handleMarkMastered} 
        className={`${btnClass} bg-white border border-gray-200 text-green-500 hover:bg-green-50 hover:text-green-700`} 
        data-tooltip="Đánh dấu đã thuộc"
      >
        <Icons.CheckCircle size={18} className="sm:w-5 sm:h-5" />
      </button>
    </div>
  );
};