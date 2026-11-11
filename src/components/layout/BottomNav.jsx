/**
 * @file src/components/layout/BottomNav.jsx
 * @description Thanh điều hướng đáy màn hình, chứa các nút Learn, Game, Settings, AI Chat.
 * @origin Tầng 3 - Block 3.2 (Layout & Control Components)
 */

import React from 'react';
import { Icons } from '@/components/common/Icons';

export const BottomNav = ({ onNavigate, onApiKey, onOpenAiChat, onSettings, t, mainColor, currentMode }) => (
  <div className="bg-white border-t border-gray-200 px-2 py-1 flex justify-around items-center z-[100] pb-safe shadow-[0_-5px_10px_rgba(0,0,0,0.05)] w-full">
    <button onClick={() => onNavigate('learn')} className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all ${currentMode === 'learn' ? `text-${mainColor}-600 bg-${mainColor}-50` : 'text-gray-400 hover:text-gray-600'}`}>
      <Icons.Book size={20} className={currentMode === 'learn' ? `fill-${mainColor}-100` : ''} />
      <span className={`text-[10px] font-bold`}>{t('navLearn')}</span>
    </button>
    
    <button onClick={() => onNavigate('game')} className={`flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all ${currentMode === 'game' ? `text-${mainColor}-600 bg-${mainColor}-50` : 'text-gray-400 hover:text-orange-500'}`}>
      <Icons.Gamepad2 size={20} className={currentMode === 'game' ? `fill-${mainColor}-100` : ''} />
      <span className="text-[10px] font-bold">{t('navGame')}</span>
    </button>
    
    <button onClick={onOpenAiChat} className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all text-gray-400 hover:text-purple-600 active:scale-95" title="Trợ lý AI">
      <Icons.Sparkles size={20} />
      <span className="text-[10px] font-bold">AI Chat</span>
    </button>
    
    <button onClick={onApiKey} className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all text-gray-400 hover:text-purple-600 active:scale-95" data-tooltip={t('ttKey')}>
      <Icons.Key size={20} />
      <span className="text-[10px] font-bold">{t('navKey')}</span>
    </button>
    
    <button onClick={onSettings} className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl transition-all text-gray-400 hover:text-gray-600 active:scale-95">
      <Icons.Settings size={20} />
      <span className="text-[10px] font-bold">{t('navSettings')}</span>
    </button>
  </div>
);