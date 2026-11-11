/**
 * @file src/components/modals/NotebookModal.jsx
 * @description Quản lý Sổ tay từ vựng & Tính năng AI Smart Fill (Điền từ tự động).
 * @origin Tầng 4 - Block 4.3 (Learning Tracking Modals)
 */

import React, { useState, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { Utils } from '@/utils/helpers';

// Component con: Review Dropdown
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

export const NotebookModal = ({ isOpen, onClose, data, onSave, onPlay, t, mainColor, onDelete, apiKey, lang, onCopy, sourceData, onOpenHanzi, onReviewGame, dataMode }) => {
  const [editingData, setEditingData] = useState([]);
  const [fillingIndices, setFillingIndices] = useState(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isAutoFillingAll, setIsAutoFillingAll] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0 });
  
  useEffect(() => {
    if (isOpen) {
      const loaded = JSON.parse(JSON.stringify(data)).map((item, index) => ({
        ...item,
        _tempId: Date.now() + index
      }));
      loaded.push({ term: '', pronunciation: '', definition: '', partOfSpeech: '', topic: '', example: '', sinoViet: '', image: '', _tempId: Date.now() + 999999 });
      setEditingData(loaded);
      setShowConfirmDelete(false);
      setIsAutoFillingAll(false);
      setFillProgress({ current: 0, total: 0 });
    }
  }, [isOpen, data]);
  
  const handleChange = (index, field, value) => {
    const newData = [...editingData];
    newData[index][field] = value;
    if (index === newData.length - 1 && value.trim() !== "") {
      newData.push({ term: '', pronunciation: '', definition: '', partOfSpeech: '', topic: '', example: '', sinoViet: '', image: '', _tempId: Date.now() + Math.random() });
    }
    setEditingData(newData);
  };
  
  const handleDelete = (index) => {
    const newData = [...editingData];
    newData.splice(index, 1);
    if (newData.length === 0) {
      newData.push({ term: '', pronunciation: '', definition: '', partOfSpeech: '', topic: '', example: '', sinoViet: '', image: '', _tempId: Date.now() });
    }
    setEditingData(newData);
  };
  
  const handleDeleteAllClick = () => {
    setShowConfirmDelete(true);
  };
  
  const confirmDeleteAll = () => {
    setEditingData([{ term: '', pronunciation: '', definition: '', partOfSpeech: '', topic: '', example: '', sinoViet: '', image: '', _tempId: Date.now() }]);
    setShowConfirmDelete(false);
  };
  
  const handleSave = () => {
    const validData = editingData.filter(item => item.term && item.term.trim() !== "");
    onSave(validData.map(({ _tempId, ...rest }) => rest));
    onClose();
  };
  
  const handleAiFill = async (index, isBatch = false) => {
    let item = editingData[index];
    if (!item.term || item.term.trim() === "") {
      if (!isBatch) alert("Vui lòng nhập từ vựng trước khi gọi AI!");
      return false;
    }
    
    // [BẢN VÁ V1.04: GLOBAL LOCAL-FIRST LOOKUP]
    // Kéo toàn bộ kho tổng làm màng lọc, kết hợp với sourceData (đề phòng có thẻ mới chưa lưu)
    const globalDeck = Utils.safeJsonParse('fc_data_' + lang, []) || [];
    const combinedData = [...(sourceData || []), ...globalDeck];
    if (combinedData.length > 0) {
      const localMatch = combinedData.find(c => c.term.toLowerCase().trim() === item.term.toLowerCase().trim());
      if (localMatch) {
        console.log("Found in global/source data, merging local data...");
        const mergedItem = {
          ...item,
          definition: item.definition || localMatch.definition,
          pronunciation: item.pronunciation || localMatch.pronunciation,
          partOfSpeech: item.partOfSpeech || localMatch.partOfSpeech,
          topic: item.topic || localMatch.topic,
          analysis: item.analysis || localMatch.analysis,
          example: item.example || localMatch.example,
          sinoViet: item.sinoViet || localMatch.sinoViet,
          image: (localMatch.image && localMatch.image.startsWith('http') && !item.image) ? localMatch.image : item.image
        };
        setEditingData(prev => {
          const newData = [...prev];
          newData[index] = mergedItem;
          return newData;
        });
        item = mergedItem;
      }
    }
    
    const requiredFields = ['pronunciation', 'definition', 'partOfSpeech', 'topic', 'analysis', 'sinoViet', 'example'];
    const missingFields = requiredFields.filter(field => !item[field] || item[field].toString().trim() === "");
    if (!item.image || !item.image.startsWith('http')) {
      missingFields.push('image');
    }
    
    if (missingFields.length === 0) {
      if (!isBatch) alert("Thông tin đã đầy đủ, không cần gọi AI!");
      return true;
    }
    
    if (!apiKey) {
      if (!isBatch) alert("Vui lòng nhập API Key để AI điền nốt thông tin còn thiếu!");
      throw new Error("Missing API Key");
    }
    
    setFillingIndices(prev => new Set(prev).add(index));
    try {
      const result = await Utils.fillCardWithAi(item.term, lang, apiKey, missingFields, dataMode);
      if (result) {
        if (result._tokenUsage) {
          const used = result._tokenUsage.totalTokenCount || 0;
          const currentTotal = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
          localStorage.setItem('fc_total_tokens', currentTotal + used);
        }
        setEditingData(prev => {
          const newData = [...prev];
          newData[index] = {
            ...newData[index],
            definition: newData[index].definition || result.definition,
            pronunciation: newData[index].pronunciation || result.pronunciation,
            partOfSpeech: newData[index].partOfSpeech || result.partOfSpeech,
            topic: newData[index].topic || result.topic,
            analysis: newData[index].analysis || result.analysis,
            example: newData[index].example || result.example,
            sinoViet: newData[index].sinoViet || result.sinoViet
          };
          if (result.image && result.image.startsWith('http')) {
            newData[index].image = result.image;
          }
          return newData;
        });
        return true;
      }
    } catch (e) {
      console.error(e);
      if (!isBatch) alert("Lỗi AI: " + e.message);
      throw e;
    } finally {
      setFillingIndices(prev => { const next = new Set(prev); next.delete(index); return next; });
    }
  };
  
  const handleAiFillAll = async () => {
    if (!apiKey) { alert("Vui lòng nhập API Key trước!"); return; }
    if (isAutoFillingAll) return; // Chống spam click
    
    const indicesToFill = editingData.map((item, idx) => {
      if (!item.term || item.term.trim() === "") return -1;
      const required = ['definition', 'pronunciation', 'example'];
      const isMissing = required.some(f => !item[f] || item[f].trim() === "");
      return isMissing ? idx : -1;
    }).filter(idx => idx !== -1);
    
    if (indicesToFill.length === 0) { alert("Sổ tay đã đầy đủ thông tin (hoặc chưa nhập từ vựng)!"); return; }
    
    if (!window.confirm(`Hệ thống sẽ tự động gọi AI điền thông tin cho ${indicesToFill.length} thẻ còn thiếu. Việc này có thể tốn nhiều Token. Bạn có muốn tiếp tục?`)) return;
    
    setIsAutoFillingAll(true);
    setFillProgress({ current: 0, total: indicesToFill.length });
    
    for (let i = 0; i < indicesToFill.length; i++) {
      const idx = indicesToFill[i];
      setFillProgress({ current: i + 1, total: indicesToFill.length });
      
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      
      while (attempts < maxAttempts && !success) {
        try {
          await handleAiFill(idx, true); // true = isBatch (Tắt alert)
          success = true;
          // Nghỉ làm nguội API an toàn sau khi thành công
          if (i < indicesToFill.length - 1) {
            await new Promise(r => setTimeout(r, 4000));
          }
        } catch (err) {
          attempts++;
          console.warn(`Lỗi AI cho thẻ ${editingData[idx]?.term}, thử lại lần ${attempts}/${maxAttempts}...`);
          
          if (attempts < maxAttempts) {
            // Exponential Backoff: Chờ 5s rồi 10s trước khi thử lại
            const delayMs = attempts === 1 ? 5000 : 10000;
            await new Promise(r => setTimeout(r, delayMs));
          } else {
            console.error(`Bỏ qua thẻ ${editingData[idx]?.term} sau 3 lần thử thất bại.`);
          }
        }
      }
    }
    
    setIsAutoFillingAll(false);
    setFillProgress({ current: 0, total: 0 });
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative">
        {showConfirmDelete && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icons.Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Xóa toàn bộ sổ tay?</h3>
              <p className="text-gray-600 mb-6 text-sm">Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa tất cả từ vựng đang soạn thảo không?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirmDelete(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">
                  Hủy bỏ
                </button>
                <button onClick={confirmDeleteAll} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200">
                  Xóa hết
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center`}>
          <h2 className={`font-bold flex gap-2 text-${mainColor}-700 text-lg`}>
            <Icons.BookOpen /> {t('notebookTitle')} ({editingData.filter(i => i.term).length})
          </h2>
          <button onClick={onClose} data-tooltip={t('ttClose')}><Icons.X /></button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-gray-50">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-12 gap-2 font-bold text-sm text-gray-500 mb-2 px-2">
              <div className="col-span-3">{t('colTerm')}</div>
              <div className="col-span-1">Từ loại</div>
              <div className="col-span-2">{t('colPronun')}</div>
              <div className="col-span-3">{t('colDef')}</div>
              <div className="col-span-2">Chủ đề</div>
              <div className="col-span-1 text-center"></div>
            </div>
            <div className="space-y-2">
              {editingData.map((item, idx) => (
                <div key={item._tempId || idx} className={`grid grid-cols-12 gap-2 bg-white p-2 rounded-lg shadow-sm items-start transition-all ${!item.term ? 'opacity-70 border-2 border-dashed border-gray-200 hover:opacity-100 hover:border-blue-200' : ''}`}>
                  <div className="col-span-3">
                    <textarea className="w-full p-2 border rounded text-sm font-medium focus:ring-2 focus:ring-blue-200 outline-none resize-none placeholder-gray-300" rows="2" value={item.term} onChange={(e) => handleChange(idx, 'term', e.target.value)} placeholder={idx === editingData.length - 1 ? "+ Thêm từ mới..." : ""} />
                    <div className="flex gap-2 mt-1">
                      {item.term && (
                        <button onClick={() => onPlay(item.term)} className={`text-${mainColor}-500 hover:bg-${mainColor}-50 p-1 rounded`}>
                          <Icons.Volume2 size={16} />
                        </button>
                      )}
                      {item.term && (
                        <button onClick={() => handleAiFill(idx)} disabled={fillingIndices.has(idx) || isAutoFillingAll} className={`text-purple-500 hover:bg-purple-50 p-1 rounded transition-colors ${fillingIndices.has(idx) ? 'animate-spin' : ''} disabled:opacity-50`} title="Tự động điền thông minh (Smart Fill)">
                          <Icons.Sparkles size={16} />
                        </button>
                      )}
                      {item.term && lang === 'zh' && (
                        <button onClick={() => onOpenHanzi(item.term)} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Tập viết chữ Hán">
                          <Icons.Brush size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1">
                    <textarea className="w-full p-2 border rounded text-sm text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none resize-none placeholder-gray-300" rows="2" value={item.partOfSpeech || ''} onChange={(e) => handleChange(idx, 'partOfSpeech', e.target.value)} placeholder="Từ loại..." />
                  </div>
                  <div className="col-span-2">
                    <textarea className="w-full p-2 border rounded text-sm text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none resize-none" rows="2" value={item.pronunciation} onChange={(e) => handleChange(idx, 'pronunciation', e.target.value)} />
                  </div>
                  <div className="col-span-3">
                    <textarea className="w-full p-2 border rounded text-sm text-gray-700 focus:ring-2 focus:ring-blue-200 outline-none resize-none" rows="3" value={item.definition} onChange={(e) => handleChange(idx, 'definition', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <textarea className="w-full p-2 border rounded text-sm text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none resize-none placeholder-gray-300" rows="3" value={item.topic || ''} onChange={(e) => handleChange(idx, 'topic', e.target.value)} placeholder="Chủ đề..." />
                  </div>
                  <div className="col-span-1 flex justify-center items-center h-full">
                    {(idx !== editingData.length - 1 || item.term) && (
                      <button onClick={() => handleDelete(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full" title={t('removeFromNotebook')}>
                        <Icons.Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t bg-gray-50 flex flex-col sm:flex-row justify-between gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
          <div className="flex gap-2 w-full sm:w-auto">
            <ReviewDropdown onSelect={(type) => onReviewGame && onReviewGame(type, data, 'Sổ tay từ vựng')} dataLength={data.length} mainColor={mainColor} />
            
            <button onClick={handleAiFillAll} disabled={data.length === 0 || isAutoFillingAll} title="AI Tự điền hàng loạt" className={`px-2 sm:px-4 py-2 bg-purple-100 text-purple-700 border border-purple-200 font-bold rounded-lg hover:bg-purple-200 flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait`}>
              {isAutoFillingAll ? (
                <Icons.Sparkles size={16} className="sm:w-[18px] sm:h-[18px] animate-pulse" />
              ) : (
                <Icons.Sparkles size={16} className="sm:w-[18px] sm:h-[18px]" />
              )}
              <span className="hidden sm:inline">
                {isAutoFillingAll ? `Xử lý AI (${fillProgress.current}/${fillProgress.total})` : 'AI Tự điền'}
              </span>
              <span className="sm:hidden">
                {isAutoFillingAll ? `${fillProgress.current}/${fillProgress.total}` : 'AI'}
              </span>
            </button>
            
            <button onClick={handleDeleteAllClick} disabled={editingData.filter(i => i.term).length === 0 || isAutoFillingAll} title="Xóa toàn bộ" className={`px-2 sm:px-4 py-2 bg-red-100 text-red-600 border border-red-200 font-bold rounded-lg hover:bg-red-200 flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm transition-all active:scale-95 disabled:opacity-50`}>
              <Icons.Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" /> Xóa
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <button onClick={() => onCopy && onCopy(editingData.filter(i => i.term))} disabled={data.length === 0} title="Copy Sheet" className={`px-2 sm:px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 font-bold rounded-lg hover:bg-teal-100 flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm active:scale-95 transition-all`}>
              <Icons.ExternalLink size={16} className="sm:w-[18px] sm:h-[18px]" /> Copy
            </button>
            <button onClick={handleSave} disabled={isAutoFillingAll} className={`px-2 sm:px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 flex items-center justify-center gap-2 text-xs sm:text-base active:scale-95 transition-all disabled:opacity-50`}>
              <Icons.Save size={16} className="sm:w-[18px] sm:h-[18px]" /> {t('saveChanges')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};