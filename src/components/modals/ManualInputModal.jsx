/**
 * @file src/components/modals/ManualInputModal.jsx
 * @description Nhập thẻ thủ công & Batch JSON. Cung cấp tính năng gọi AI tự động điền các trường còn thiếu ngay trong Modal.
 * @origin Tầng 4 - Block 4.6 (Sync & Import Modals)
 */

import React, { useState, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';

export const ManualInputModal = ({ isOpen, onClose, onImport, onAddCard, onAutoFill, t, mainColor }) => {
  const [mode, setMode] = useState('single');
  const [text, setText] = useState('');
  const [isFilling, setIsFilling] = useState(false);
  const [singleData, setSingleData] = useState({ 
    term: '', pronunciation: '', definition: '', partOfSpeech: '', example: '', sinoViet: '', grammar_type: '' 
  });
  
  useEffect(() => {
    if (isOpen) {
      setText('');
      setSingleData({ term: '', pronunciation: '', definition: '', partOfSpeech: '', example: '', sinoViet: '', grammar_type: '' });
      setMode('single');
      setIsFilling(false);
    }
  }, [isOpen]);
  
  const handleSingleChange = (field, value) => setSingleData(prev => ({ ...prev, [field]: value }));
  
  const handleSingleSubmit = () => {
    if (!singleData.term.trim()) return;
    onAddCard(singleData);
    setSingleData({ term: '', pronunciation: '', definition: '', partOfSpeech: '', example: '', sinoViet: '', grammar_type: '' });
  };
  
  const handleAutoFillClick = async () => {
    if (!singleData.term.trim()) return;
    if (!onAutoFill) { alert("Chức năng AI chưa được kết nối!"); return; }
    
    setIsFilling(true);
    try {
      const result = await onAutoFill(singleData.term);
      if (result) {
        if (result._tokenUsage) {
          const used = result._tokenUsage.totalTokenCount || 0;
          const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
          localStorage.setItem('fc_total_tokens', currentTotal + used);
        }
        setSingleData(prev => ({
          ...prev,
          pronunciation: result.pronunciation || prev.pronunciation,
          definition: result.definition || prev.definition,
          partOfSpeech: result.partOfSpeech || prev.partOfSpeech,
          example: result.example || prev.example,
          sinoViet: result.sinoViet || prev.sinoViet,
          grammar_type: result.grammar_type ? (Array.isArray(result.grammar_type) ? result.grammar_type.join(', ') : result.grammar_type) : prev.grammar_type
        }));
      }
    }
    catch (e) { console.error(e); }
    finally { setIsFilling(false); }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700 flex items-center gap-2"><Icons.Upload size={20} /> Thêm dữ liệu</h3>
          <button onClick={onClose}><Icons.X size={20} /></button>
        </div>
        
        <div className="flex border-b">
          <button className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'single' ? `text-${mainColor}-600 border-b-2 border-${mainColor}-600 bg-blue-50/50` : 'text-gray-500 hover:bg-gray-50'}`} onClick={() => setMode('single')}>Nhập thủ công</button>
          <button className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'batch' ? `text-${mainColor}-600 border-b-2 border-${mainColor}-600 bg-blue-50/50` : 'text-gray-500 hover:bg-gray-50'}`} onClick={() => setMode('batch')}>Nhập JSON (Nâng cao)</button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {mode === 'single' ? (
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Từ vựng <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input type="text" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none font-medium" placeholder="Ví dụ: Hello / 你好" value={singleData.term} onChange={(e) => handleSingleChange('term', e.target.value)} autoFocus />
                  <button onClick={handleAutoFillClick} disabled={isFilling || !singleData.term.trim()} className={`p-3 rounded-lg border-2 ${isFilling ? 'bg-gray-100 border-gray-200 cursor-not-allowed' : `bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100`}`} title="Tự động điền bằng AI">
                    {isFilling ? <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div> : <Icons.Sparkles size={20} />}
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Từ loại</label>
                  <input type="text" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 font-sans text-sm" placeholder="Danh từ..." value={singleData.partOfSpeech || ''} onChange={(e) => handleSingleChange('partOfSpeech', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Phiên âm</label>
                  <input type="text" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 font-sans text-sm" placeholder="/həˈloʊ/" value={singleData.pronunciation} onChange={(e) => handleSingleChange('pronunciation', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Hán Việt</label>
                  <input type="text" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 text-sm" placeholder="Nhĩ hảo" value={singleData.sinoViet} onChange={(e) => handleSingleChange('sinoViet', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Nhãn ngữ pháp</label>
                  <input type="text" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 text-sm" placeholder="ba_sentence, verb..." value={singleData.grammar_type} onChange={(e) => handleSingleChange('grammar_type', e.target.value)} />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-blue-600 mb-1 uppercase">Nghĩa ngắn gọn (Cho Game)</label>
                <textarea className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none resize-none" rows="2" placeholder="Ví dụ: Xin chào" value={singleData.definition} onChange={(e) => handleSingleChange('definition', e.target.value)} />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Giải thích chi tiết & Ví dụ</label>
                <textarea className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none resize-none h-24" placeholder="Ví dụ: Lời chào phổ biến...\n\nHello world!" value={singleData.example} onChange={(e) => handleSingleChange('example', e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-2">Dán danh sách từ vựng dạng JSON vào bên dưới:</p>
              <textarea className="w-full p-3 border rounded-lg text-sm font-mono h-60 focus:ring-2 focus:ring-blue-200 outline-none resize-none bg-gray-50" placeholder='[{"term":"Hello", "definition":"Xin chào", "pronunciation":"/həˈloʊ/", "partOfSpeech":"Danh từ"}, ...]' value={text} onChange={(e) => setText(e.target.value)} />
            </>
          )}
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded text-gray-600 font-bold hover:bg-gray-200">{t('cancel')}</button>
          {mode === 'single' ? (
            <button onClick={handleSingleSubmit} disabled={!singleData.term.trim()} className={`px-6 py-2 rounded bg-${mainColor}-600 text-white font-bold hover:bg-${mainColor}-700 disabled:opacity-50 flex items-center gap-2 shadow-lg`}><Icons.Check size={18} /> Lưu thẻ</button>
          ) : (
            <button onClick={() => onImport(text)} disabled={!text.trim()} className={`px-6 py-2 rounded bg-${mainColor}-600 text-white font-bold hover:bg-${mainColor}-700 disabled:opacity-50 flex items-center gap-2 shadow-lg`}><Icons.Upload size={18} /> Nhập JSON</button>
          )}
        </div>
      </div>
    </div>
  );
};