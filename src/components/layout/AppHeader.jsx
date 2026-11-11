/**
 * @file src/components/layout/AppHeader.jsx
 * @description Thanh tiêu đề chính chứa Logo, Nút Chọn Ngôn ngữ, và Các nút bật Modals.
 * @origin Tầng 3 - Block 3.2 (Layout & Control Components)
 */

import React from 'react';
import { Icons } from '@/components/common/Icons';
import { LevelSelector, TopicSelectorDropdown } from '@/components/common/Controls';

export const AppHeader = ({ 
  lang, setLang, notebookCount, masteredCount, incorrectCount, 
  onOpenNotebook, onOpenMastered, onOpenIncorrect, onOpenLinkManager, 
  onOpenManual, onOpenHelp, onReload, t, studySourceName, 
  onExitStudyMode, onOpenSaveLoad, dataMode, setDataMode, 
  currentLevel, setCurrentLevel, currentTopic, setCurrentTopic 
}) => {
  const colorMap = { zh: 'red', en: 'sky' };
  const mainColor = colorMap[lang] || 'sky';
  const safeDataMode = dataMode || 'vocab';
  const safeLevel = currentLevel || (lang === 'zh' ? 'zh_level_1' : 'en_level_4');
  const safeTopic = currentTopic || '';

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-2 mb-3 relative z-10 shrink-0">
      {studySourceName && (
        <div className="w-full bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-2 rounded shadow-sm flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Icons.BookOpen size={16} />
            <span className="font-bold text-xs">Đang ôn: {studySourceName}</span>
          </div>
          <button onClick={onExitStudyMode} className="bg-white text-orange-600 px-2 py-1 rounded border border-orange-200 text-[10px] font-bold hover:bg-orange-50 flex items-center gap-1 transition-colors shadow-sm"><Icons.RotateCcw size={12} /> Thoát</button>
        </div>
      )}
      
      {/* Hàng 1: Tiêu đề & Công cụ & Nút Ngôn ngữ */}
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center gap-2 sm:gap-3">
          <h1 className={`text-lg sm:text-xl font-black truncate text-${mainColor}-700 flex items-center gap-1`}><Icons.Layers size={20} className="hidden sm:block"/> Flashcard Lite</h1>
          {/* [NÂNG CẤP UI] Nút Ngôn Ngữ được dời lên đây, thu gọn kích thước */}
          <button onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')} className={`h-[32px] px-3 flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold bg-white border border-gray-200 shadow-sm text-${mainColor}-700 hover:bg-${mainColor}-50 transition-colors whitespace-nowrap`}>
            <Icons.Globe size={14} /> {lang === 'zh' ? 'CN' : 'EN'}
          </button>
        </div>
        <div className="flex gap-1 sm:gap-1.5 flex-wrap justify-end">
          <button onClick={onOpenNotebook} className="relative p-1.5 sm:p-2 bg-white text-orange-500 rounded-full shadow border hover:bg-orange-50"><Icons.BookOpen size={16} />{notebookCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold">{notebookCount}</span>}</button>
          <button onClick={onOpenIncorrect} className="relative p-1.5 sm:p-2 bg-white text-red-500 rounded-full shadow border hover:bg-red-50"><Icons.Brain size={16} />{incorrectCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 text-white text-[9px] flex items-center justify-center rounded-full font-bold">{incorrectCount}</span>}</button>
          {masteredCount > 0 && (<button onClick={onOpenMastered} className="relative p-1.5 sm:p-2 bg-white text-green-600 rounded-full shadow border hover:bg-green-50"><Icons.CheckCircle size={16} /><span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold">{masteredCount}</span></button>)}
          <button onClick={onReload} className="p-1.5 sm:p-2 bg-white text-blue-500 rounded-full shadow border hover:bg-blue-50 hover:rotate-180 transition-all duration-500"><Icons.RefreshCw size={16} /></button>
          <button onClick={onOpenLinkManager} className="p-1.5 sm:p-2 bg-white text-green-600 rounded-full shadow border hover:bg-green-50"><Icons.Link size={16} /></button>
          <button onClick={onOpenManual} className="p-1.5 sm:p-2 bg-white text-green-600 rounded-full shadow border hover:bg-green-50"><Icons.Upload size={16} /></button>
          <button onClick={onOpenSaveLoad} className="p-1.5 sm:p-2 bg-white text-blue-600 rounded-full shadow border hover:bg-blue-50"><Icons.Save size={16} /></button>
          <button onClick={onOpenHelp} className="p-1.5 sm:p-2 bg-white text-purple-600 rounded-full shadow border hover:bg-purple-50"><Icons.HelpCircle size={16} /></button>
        </div>
      </div>
      
      {/* Hàng 2: Filter Bar - Seamless Floating Layout */}
      {!studySourceName && (
        <div className="w-full flex flex-wrap justify-center items-center gap-2 sm:gap-3 mt-1 animate-in slide-in-from-top-2">
          {/* Nhóm Chế độ Data */}
          <div className="flex items-center justify-center sm:justify-start w-full sm:w-auto">
            {setDataMode && (
              <div className="h-[42px] flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm shrink-0">
                <button onClick={() => setDataMode('vocab')} className={`h-full px-4 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${safeDataMode === 'vocab' ? `bg-${mainColor}-100 text-${mainColor}-700 shadow-sm` : 'text-gray-500 hover:text-gray-700'}`}>Từ Vựng</button>
                <button onClick={() => setDataMode('sentence')} className={`h-full px-4 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${safeDataMode === 'sentence' ? `bg-${mainColor}-100 text-${mainColor}-700 shadow-sm` : 'text-gray-500 hover:text-gray-700'}`}>Câu Văn</button>
              </div>
            )}
          </div>
          {/* Nhóm Level & Topic */}
          <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
            {setCurrentLevel && (
              <div className="w-[calc(50%-4px)] sm:w-[140px] h-[42px]">
                <LevelSelector lang={lang} currentLevel={safeLevel} onSelectLevel={setCurrentLevel} mainColor={mainColor} />
              </div>
            )}
            {setCurrentTopic && (
              <div className="w-[calc(50%-4px)] sm:w-[180px] h-[42px]">
                <TopicSelectorDropdown currentLevel={safeLevel} currentTopic={safeTopic} onSelectTopic={setCurrentTopic} mainColor={mainColor} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};  