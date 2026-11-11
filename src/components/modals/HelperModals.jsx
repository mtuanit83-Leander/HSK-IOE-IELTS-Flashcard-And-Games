/**
 * @file src/components/modals/HelperModals.jsx
 * @description Các công cụ phụ trợ bật lên trong quá trình học. Bao gồm: WordSelectorModal (Chọn từ lưu Sổ tay), HanziSelectorModal (Chọn chữ Hán tập viết).
 * @origin Tầng 4 - Block 4.7 (In-game Helper Modals)
 */

import React, { useState, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';

// ==================================================================================
// 1. WORD SELECTOR MODAL (Chọn từ lưu Sổ tay - Tích hợp Auto-capture Highlight)
// ==================================================================================
export const WordSelectorModal = ({ isOpen, onClose, onSave, text, currentLang, t, mainColor }) => {
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [words, setWords] = useState([]);
  const [customInput, setCustomInput] = useState('');
  
  // Xử lý Dual-Payload
  const isSmartObject = typeof text === 'object' && text !== null && text.isSmartTarget;
  const displayText = isSmartObject ? text.display : (text || "");
  const saveText = isSmartObject ? text.save : (text || "");
  
  useEffect(() => {
    if (!displayText) { setWords([]); return; }
    
    if (currentLang === 'zh') { 
      setWords([...displayText].filter(c => c.trim().length > 0)); 
    } else { 
      setWords(displayText.split(' ').filter(w => w.length > 0)); 
    }
    
    setSelectedIndices(new Set());
    
    // Auto-capture Highlighted Text (Chộp lấy đoạn text đang bôi đen trên trình duyệt)
    if (isOpen) {
      try {
        const highlighted = window.getSelection().toString().trim();
        if (highlighted) {
          setCustomInput(highlighted);
        } else {
          setCustomInput('');
        }
      } catch (e) {
        setCustomInput('');
      }
    }
  }, [displayText, currentLang, isOpen]);
  
  const toggleWord = (index) => {
    const newSet = new Set(selectedIndices);
    newSet.has(index) ? newSet.delete(index) : newSet.add(index);
    setSelectedIndices(newSet);
  };
  
  const handleCustomSave = () => {
    if (!customInput.trim()) return;
    onSave([customInput.trim()], false);
    setCustomInput('');
  };
  
  if (!isOpen) return null;
  
  const selectedWordsList = words.filter((_, i) => selectedIndices.has(i));
  
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-gray-700">{t('selectWordsToSave') || 'Lưu Sổ Tay'}</h3>
          <button onClick={onClose} data-tooltip={t('ttClose')} className="text-gray-400 hover:text-red-500 transition-colors">
            <Icons.X size={20} />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto max-h-[60vh] custom-scrollbar flex flex-col gap-6">
          {/* Phần 1: Các từ có sẵn từ Câu hỏi */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 text-center">Chọn từ trong câu</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {words.map((word, idx) => (
                <button 
                  key={idx} 
                  onClick={() => toggleWord(idx)} 
                  className={`px-3 py-2 rounded-lg border transition-all text-base sm:text-lg font-medium ${selectedIndices.has(idx) ? `bg-orange-100 border-${mainColor}-500 text-${mainColor}-700 shadow-md` : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
          
          {/* Phần 2: Nhập từ tùy chọn (Custom Input) */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 text-center">Hoặc lưu từ tùy chọn</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSave()}
                placeholder="Gõ hoặc bôi đen từ..."
                className={`flex-1 p-3 border-2 border-gray-200 rounded-xl outline-none focus:border-${mainColor}-500 focus:ring-2 focus:ring-${mainColor}-100 transition-all font-bold text-gray-700 shadow-inner`}
              />
              <button
                onClick={handleCustomSave}
                disabled={!customInput.trim()}
                className={`px-4 bg-${mainColor}-600 text-white rounded-xl font-bold shadow-md hover:bg-${mainColor}-700 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center`}
                title="Lưu từ này"
              >
                <Icons.Save size={20} />
              </button>
            </div>
            {customInput && <p className="text-[10px] text-blue-500 mt-2 font-bold italic text-center animate-in fade-in">Hệ thống AI sẽ tự động tra nghĩa cho từ này!</p>}
          </div>
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex flex-col gap-2 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
          <div className="flex gap-2">
            <button 
              onClick={() => onSave(selectedWordsList, false)} 
              disabled={selectedIndices.size === 0} 
              className={`flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold disabled:opacity-50 hover:bg-orange-600 shadow-md transition-all active:scale-95`}
            >
              {t('saveSelected')} ({selectedIndices.size})
            </button>
            <button 
              onClick={() => onSave(selectedWordsList, true)} 
              disabled={selectedIndices.size < 2} 
              className={`flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold disabled:opacity-50 hover:bg-purple-700 shadow-md transition-all active:scale-95 flex items-center justify-center gap-1`} 
              title="Ghép các từ đã chọn thành 1 từ vựng mới"
            >
              <Icons.Link size={18} /> Lưu cụm
            </button>
          </div>
          {/* Bấm nút này sẽ lưu chuỗi "saveText" (có thể chứa đáp án ẩn) */}
          <button 
            onClick={() => onSave([saveText])} 
            className="w-full py-3 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-colors"
          >
            {t('saveWholeSentence')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================================================================================
// 2. HANZI SELECTOR MODAL (Cửa sổ bật lên chọn chữ Hán tập viết)
// ==================================================================================
export const HanziSelectorModal = ({ isOpen, onClose, text, onSelect, t }) => {
  const [chars, setChars] = useState([]);
  
  useEffect(() => {
    if (isOpen && text) {
      const hanziRegex = /[\u4e00-\u9fa5]/g;
      const found = text.match(hanziRegex);
      if (found) {
        setChars([...new Set(found)]);
      } else {
        setChars([]);
      }
    }
  }, [isOpen, text]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">Chọn chữ để tập viết</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors">
            <Icons.X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          {chars.length === 0 ? (
            <p className="text-center text-gray-500 italic">Không tìm thấy chữ Hán nào trong thẻ này.</p>
          ) : (
            <div className="flex flex-wrap gap-3 justify-center">
              {chars.map((char, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelect(char)}
                  className="w-16 h-16 text-3xl font-serif border-2 border-gray-200 rounded-xl hover:border-red-500 hover:bg-red-50 hover:text-red-600 transition-all shadow-sm flex items-center justify-center"
                >
                  {char}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t bg-gray-50 text-center">
          <button onClick={onClose} className="w-full py-3 bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 rounded-xl transition-colors">Đóng</button>
        </div>
      </div>
    </div>
  );
};