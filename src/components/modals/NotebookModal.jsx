// ============================================================================
// FILE 37/85: src/components/modals/NotebookModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.3 - Version 1.05)
// NHIỆM VỤ: Modal Sổ tay từ vựng (kèm ReviewDropdown ôn tập vạn năng,
//           Global Local-First Lookup và tính năng AI Tự điền hàng loạt có chống spam).
// ============================================================================


import React, { useState, useEffect } from 'react';
import { Icons } from '../common/Icons';
import { Utils } from '../../utils/helpers';
import { fillCardWithAi } from '../../services/geminiApi';


/**
 * Helper hiển thị thông báo an toàn qua hệ thống Toast toàn cục
 */
const notify = (msg, type = 'info') => {
  if (typeof window !== 'undefined' && window.globalShowToast) {
    window.globalShowToast(msg, type);
  } else {
    console.log(`[Toast - ${type}]:`, msg);
  }
};


/**
 * Đọc trực tiếp ngữ cảnh cấp độ hiện tại từ LocalStorage (Đồng bộ với useAiLogic)
 */
const getDirectLevelContext = (lang) => {
  const defaultLvl = lang === 'zh' ? 'zh_level_1' : 'en_level_4';
  try {
    const saved = localStorage.getItem('fc_current_level_' + lang);
    if (!saved) return [defaultLvl];
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    if (typeof parsed === 'string' && parsed.trim() !== '') return [parsed];
  } catch (e) {
    const raw = localStorage.getItem('fc_current_level_' + lang);
    if (raw && typeof raw === 'string') {
      const clean = raw.replace(/["[\]]/g, '').trim();
      if (clean) return [clean];
    }
  }
  return [defaultLvl];
};


/**
 * Tra cứu thẻ trong toàn bộ các kho dữ liệu cục bộ (Local-First Lookup)
 */
const findCardInLocalPools = (term, lang, sourceData = []) => {
  if (!term || typeof term !== 'string') return null;
  const target = term.toLowerCase().trim();
  if (!target) return null;


  const safeParse =
    Utils?.safeJsonParse ||
    (typeof window !== 'undefined' && window.Utils?.safeJsonParse) ||
    ((key, def) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : def;
      } catch (e) {
        return def;
      }
    });


  // 1. Tìm trong sourceData (danh sách thẻ đang hiển thị) và fc_data_${lang}
  const activeDeck = safeParse('fc_data_' + lang, []);
  const primaryList = [
    ...(Array.isArray(sourceData) ? sourceData : []),
    ...(Array.isArray(activeDeck) ? activeDeck : [])
  ];


  const directMatch = primaryList.find(
    (c) =>
      c &&
      c.term &&
      c.term.toLowerCase().trim() === target &&
      c.definition &&
      c.definition.toString().trim() !== ''
  );
  if (directMatch) return directMatch;


  // 2. Quét sâu vào Kho Master Data 9 cấp độ (Từ vựng & Câu văn)
  const masterKeys = [
    `fc_master_data_${lang}_vocab`,
    `fc_master_data_${lang}_sentence`
  ];
  for (const key of masterKeys) {
    const pool = safeParse(key, null);
    if (pool && typeof pool === 'object') {
      for (const levelArr of Object.values(pool)) {
        if (Array.isArray(levelArr)) {
          const found = levelArr.find(
            (c) =>
              c &&
              c.term &&
              c.term.toLowerCase().trim() === target &&
              c.definition &&
              c.definition.toString().trim() !== ''
          );
          if (found) return found;
        }
      }
    }
  }


  return null;
};


/**
 * Tạo dòng trống mặc định ở cuối bảng Sổ tay
 */
const createBlankNotebookRow = (seed = 0) => ({
  term: '',
  pronunciation: '',
  definition: '',
  partOfSpeech: '',
  topic: '',
  analysis: '',
  example: '',
  sinoViet: '',
  image: '',
  grammar_type: [],
  _tempId: Date.now() + seed
});


/**
 * Component Menu Ôn Tập Vạn Năng (ReviewDropdown)
 * Dùng chung cho cả Sổ tay từ vựng (NotebookModal) và Sổ tay cần nhớ (IncorrectModal)
 */
export const ReviewDropdown = ({
  onSelect,
  dataLength = 0,
  mainColor = 'blue'
}) => {
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
        <Icons.ChevronDown
          size={14}
          className={`transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>


      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        ></div>
      )}


      {isOpen && (
        <div className="absolute bottom-full right-0 sm:left-0 sm:right-auto mb-2 w-[220px] bg-white border border-gray-100 rounded-xl shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-bottom-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
            Chọn chế độ ôn tập
          </div>
          {games.map((game) => {
            const IconComp = Icons[game.icon] || Icons.Gamepad2;
            const isDisabled = dataLength < game.min;
            return (
              <button
                key={game.id}
                onClick={() => {
                  if (!isDisabled) {
                    if (onSelect) onSelect(game.id);
                    setIsOpen(false);
                  }
                }}
                disabled={isDisabled}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed bg-gray-50 text-gray-400'
                    : `text-gray-700 hover:bg-${mainColor}-50 hover:text-${mainColor}-700`
                }`}
                title={isDisabled ? `Cần ít nhất ${game.min} từ để chơi` : ''}
              >
                <IconComp
                  size={16}
                  className={
                    isDisabled ? 'text-gray-400' : `text-${mainColor}-500`
                  }
                />
                <div className="flex flex-col">
                  <span className="font-bold text-sm leading-tight">
                    {game.name}
                  </span>
                  {isDisabled && (
                    <span className="text-[9px] text-red-400 font-medium leading-tight mt-0.5">
                      Cần {game.min} từ
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};


/**
 * Modal Sổ Tay Từ Vựng (NotebookModal)
 */
export const NotebookModal = ({
  isOpen,
  onClose,
  data = [],
  onSave,
  onPlay,
  t = (k) => k,
  mainColor = 'sky',
  apiKey = '',
  lang = 'en',
  onCopy,
  sourceData = [],
  onOpenHanzi,
  onReviewGame,
  dataMode = 'vocab'
}) => {
  const [editingData, setEditingData] = useState([]);
  const [fillingIndices, setFillingIndices] = useState(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [pendingFillIndices, setPendingFillIndices] = useState(null);
  const [isAutoFillingAll, setIsAutoFillingAll] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0 });


  useEffect(() => {
    if (isOpen) {
      const safeData = Array.isArray(data) ? data : [];
      const loaded = JSON.parse(JSON.stringify(safeData)).map(
        (item, index) => ({
          ...item,
          _tempId: Date.now() + index
        })
      );
      loaded.push(createBlankNotebookRow(999999));
      setEditingData(loaded);
      setShowConfirmDelete(false);
      setPendingFillIndices(null);
      setIsAutoFillingAll(false);
      setFillProgress({ current: 0, total: 0 });
    }
  }, [isOpen, data]);


  // Danh sách các thẻ hợp lệ đang có trên bảng soạn thảo
  const validEditingItems = editingData.filter(
    (item) => item && item.term && item.term.trim() !== ''
  );
  const validCount = validEditingItems.length;


  const handleChange = (index, field, value) => {
    const newData = [...editingData];
    newData[index] = {
      ...newData[index],
      [field]: value
    };
    if (index === newData.length - 1 && value.trim() !== '') {
      newData.push(createBlankNotebookRow(Math.random()));
    }
    setEditingData(newData);
  };


  // Xóa 1 dòng trên bản nháp editingData (Chỉ lưu chính thức khi bấm handleSave)
  const handleDelete = (index) => {
    const newData = [...editingData];
    newData.splice(index, 1);
    if (newData.length === 0) {
      newData.push(createBlankNotebookRow(0));
    }
    setEditingData(newData);
  };


  const handleDeleteAllClick = () => {
    setShowConfirmDelete(true);
  };


  const confirmDeleteAll = () => {
    setEditingData([createBlankNotebookRow(0)]);
    setShowConfirmDelete(false);
  };


  const handleSave = () => {
    const cleanData = validEditingItems.map(({ _tempId, ...rest }) => rest);
    if (onSave) {
      onSave(cleanData);
    }
    if (onClose) onClose();
  };


  const handleAiFill = async (index, isBatch = false) => {
    let item = editingData[index];
    if (!item || !item.term || item.term.trim() === '') {
      if (!isBatch) notify('Vui lòng nhập từ vựng trước khi gọi AI!', 'warning');
      return false;
    }


    // [BẢN VÁ V1.04+: GLOBAL LOCAL-FIRST LOOKUP TOÀN DIỆN]
    const localMatch = findCardInLocalPools(item.term, lang, sourceData);
    if (localMatch) {
      const mergedItem = {
        ...item,
        definition: item.definition || localMatch.definition || '',
        pronunciation: item.pronunciation || localMatch.pronunciation || '',
        partOfSpeech: item.partOfSpeech || localMatch.partOfSpeech || '',
        topic: item.topic || localMatch.topic || '',
        analysis: item.analysis || localMatch.analysis || '',
        example: item.example || localMatch.example || '',
        sinoViet: item.sinoViet || localMatch.sinoViet || '',
        grammar_type:
          Array.isArray(item.grammar_type) && item.grammar_type.length > 0
            ? item.grammar_type
            : Array.isArray(localMatch.grammar_type)
            ? localMatch.grammar_type
            : [],
        level: item.level || localMatch.level || undefined,
        language: item.language || localMatch.language || lang,
        image:
          localMatch.image &&
          localMatch.image.startsWith('http') &&
          !item.image
            ? localMatch.image
            : item.image
      };
      setEditingData((prev) => {
        const newData = [...prev];
        newData[index] = mergedItem;
        return newData;
      });
      item = mergedItem;
    }


    const requiredFields = [
      'pronunciation',
      'definition',
      'partOfSpeech',
      'topic',
      'analysis',
      'sinoViet',
      'example',
      'grammar_type'
    ];
    const missingFields = requiredFields.filter((field) => {
      if (field === 'grammar_type') {
        return !Array.isArray(item.grammar_type) || item.grammar_type.length === 0;
      }
      return !item[field] || item[field].toString().trim() === '';
    });


    if (!item.image || !item.image.startsWith('http')) {
      missingFields.push('image');
    }


    // Nếu các trường cốt lõi đã đầy đủ từ Local-First thì không cần gọi API tốn Token
    const coreRequired = ['pronunciation', 'definition', 'example', 'analysis'];
    const isCoreStillMissing = coreRequired.some(
      (f) => !item[f] || item[f].toString().trim() === ''
    );
    if (!isCoreStillMissing) {
      if (!isBatch) {
        notify('Thông tin đã đầy đủ, không cần gọi AI!', 'success');
      }
      return true;
    }


    if (!apiKey) {
      if (!isBatch) {
        notify(
          'Vui lòng nhập API Key để AI điền nốt thông tin còn thiếu!',
          'warning'
        );
      }
      throw new Error('Missing API Key');
    }


    setFillingIndices((prev) => new Set(prev).add(index));
    try {
      const aiFillFn =
        fillCardWithAi ||
        (typeof window !== 'undefined' && window.Utils?.fillCardWithAi);
      if (!aiFillFn) {
        throw new Error('Chức năng fillCardWithAi chưa sẵn sàng.');
      }


      // Xác định ngữ cảnh cấp độ (Ưu tiên level riêng của thẻ hoặc level đang chọn)
      const levelContext = item.level
        ? [item.level]
        : getDirectLevelContext(lang);


      // [V1.05 STRICT DATA ROUTING + LEVEL CONTEXT]
      const result = await aiFillFn(
        item.term,
        lang,
        apiKey,
        missingFields,
        dataMode,
        levelContext
      );


      if (result) {
        if (result._tokenUsage) {
          const used = result._tokenUsage.totalTokenCount || 0;
          const currentTotal = parseInt(
            localStorage.getItem('fc_total_tokens') || '0',
            10
          );
          localStorage.setItem(
            'fc_total_tokens',
            String(currentTotal + used)
          );
        }


        setEditingData((prev) => {
          const newData = [...prev];
          const currentRow = newData[index] || item;
          newData[index] = {
            ...currentRow,
            definition: currentRow.definition || result.definition || '',
            pronunciation:
              currentRow.pronunciation || result.pronunciation || '',
            partOfSpeech: currentRow.partOfSpeech || result.partOfSpeech || '',
            topic: currentRow.topic || result.topic || '',
            analysis: currentRow.analysis || result.analysis || '',
            example: currentRow.example || result.example || '',
            sinoViet: currentRow.sinoViet || result.sinoViet || '',
            grammar_type:
              Array.isArray(currentRow.grammar_type) &&
              currentRow.grammar_type.length > 0
                ? currentRow.grammar_type
                : Array.isArray(result.grammar_type)
                ? result.grammar_type
                : [],
            level:
              currentRow.level ||
              (Array.isArray(levelContext) ? levelContext[0] : levelContext),
            language: currentRow.language || lang
          };
          if (result.image && result.image.startsWith('http')) {
            newData[index].image = result.image;
          }
          return newData;
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      if (!isBatch) notify('Lỗi AI: ' + e.message, 'error');
      throw e;
    } finally {
      setFillingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };


  const handleAiFillAll = () => {
    if (!apiKey) {
      notify('Vui lòng nhập API Key trước!', 'warning');
      return;
    }
    if (isAutoFillingAll) return;


    const indicesToFill = editingData
      .map((item, idx) => {
        if (!item.term || item.term.trim() === '') return -1;
        const required = ['definition', 'pronunciation', 'example'];
        const isMissing = required.some(
          (f) => !item[f] || item[f].toString().trim() === ''
        );
        return isMissing ? idx : -1;
      })
      .filter((idx) => idx !== -1);


    if (indicesToFill.length === 0) {
      notify(
        'Sổ tay đã đầy đủ thông tin (hoặc chưa nhập từ vựng)!',
        'info'
      );
      return;
    }


    setPendingFillIndices(indicesToFill);
  };


  const executeAiFillAll = async () => {
    const indicesToFill = pendingFillIndices;
    setPendingFillIndices(null);
    if (!indicesToFill || indicesToFill.length === 0) return;


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
          await handleAiFill(idx, true);
          success = true;
          // Nghỉ làm nguội API an toàn sau khi thành công
          if (i < indicesToFill.length - 1) {
            await new Promise((r) => setTimeout(r, 4000));
          }
        } catch (err) {
          attempts++;
          console.warn(
            `Lỗi AI cho thẻ ${editingData[idx]?.term}, thử lại lần ${attempts}/${maxAttempts}...`
          );
          if (attempts < maxAttempts) {
            const delayMs = attempts === 1 ? 5000 : 10000;
            await new Promise((r) => setTimeout(r, delayMs));
          } else {
            console.error(
              `Bỏ qua thẻ ${editingData[idx]?.term} sau 3 lần thử thất bại.`
            );
          }
        }
      }
    }


    setIsAutoFillingAll(false);
    setFillProgress({ current: 0, total: 0 });
    notify('Đã hoàn tất quá trình AI tự điền hàng loạt!', 'success');
  };


  // Xử lý khi chọn chế độ Ôn tập lại từ Sổ tay (Tự động lấy danh sách thẻ đang soạn thảo)
  const handleSelectReviewGame = (type) => {
    const cleanData = validEditingItems.map(({ _tempId, ...rest }) => rest);
    if (onSave) {
      onSave(cleanData);
    }
    if (onReviewGame) {
      onReviewGame(type, cleanData, 'Sổ tay từ vựng');
    }
  };


  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden relative">
        {/* Popup xác nhận xóa toàn bộ */}
        {showConfirmDelete && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icons.Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Xóa toàn bộ sổ tay?
              </h3>
              <p className="text-gray-600 mb-6 text-sm">
                Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa tất
                cả từ vựng đang soạn thảo không?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={confirmDeleteAll}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                >
                  Xóa hết
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Popup xác nhận AI Tự điền hàng loạt */}
        {pendingFillIndices && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center border-2 border-purple-100">
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icons.Sparkles size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                AI Tự điền hàng loạt?
              </h3>
              <p className="text-gray-600 mb-6 text-sm">
                Hệ thống sẽ tự động gọi AI điền thông tin cho{' '}
                <b>{pendingFillIndices.length}</b> thẻ còn thiếu. Việc này có
                thể tốn nhiều Token. Bạn có muốn tiếp tục?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingFillIndices(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={executeAiFillAll}
                  className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200"
                >
                  Bắt đầu
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Header */}
        <div
          className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center`}
        >
          <h2
            className={`font-bold flex gap-2 text-${mainColor}-700 text-lg items-center`}
          >
            <Icons.BookOpen /> {t('notebookTitle')} ({validCount})
          </h2>
          <button onClick={onClose} data-tooltip={t('ttClose')}>
            <Icons.X />
          </button>
        </div>


        {/* Danh sách từ vựng */}
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
                <div
                  key={item._tempId || idx}
                  className={`grid grid-cols-12 gap-2 bg-white p-2 rounded-lg shadow-sm items-start transition-all ${
                    !item.term
                      ? 'opacity-70 border-2 border-dashed border-gray-200 hover:opacity-100 hover:border-blue-200'
                      : ''
                  }`}
                >
                  <div className="col-span-3">
                    <textarea
                      className="w-full p-2 border rounded text-sm font-medium focus:ring-2 focus:ring-blue-200 outline-none resize-none placeholder-gray-300"
                      rows="2"
                      value={item.term || ''}
                      onChange={(e) =>
                        handleChange(idx, 'term', e.target.value)
                      }
                      placeholder={
                        idx === editingData.length - 1
                          ? '+ Thêm từ mới...'
                          : ''
                      }
                    />
                    <div className="flex gap-2 mt-1">
                      {item.term && (
                        <button
                          onClick={() => onPlay && onPlay(item.term)}
                          className={`text-${mainColor}-500 hover:bg-${mainColor}-50 p-1 rounded`}
                        >
                          <Icons.Volume2 size={16} />
                        </button>
                      )}
                      {item.term && (
                        <button
                          onClick={() => handleAiFill(idx)}
                          disabled={
                            fillingIndices.has(idx) || isAutoFillingAll
                          }
                          className={`text-purple-500 hover:bg-purple-50 p-1 rounded transition-colors ${
                            fillingIndices.has(idx) ? 'animate-spin' : ''
                          } disabled:opacity-50`}
                          title="Tự động điền thông minh (Smart Fill)"
                        >
                          <Icons.Sparkles size={16} />
                        </button>
                      )}
                      {item.term && lang === 'zh' && (
                        <button
                          onClick={() => onOpenHanzi && onOpenHanzi(item.term)}
                          className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                          title="Tập viết chữ Hán"
                        >
                          <Icons.Brush size={16} />
                        </button>
                      )}
                    </div>
                  </div>


                  <div className="col-span-1">
                    <textarea
                      className="w-full p-2 border rounded text-sm text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none resize-none placeholder-gray-300"
                      rows="2"
                      value={item.partOfSpeech || ''}
                      onChange={(e) =>
                        handleChange(idx, 'partOfSpeech', e.target.value)
                      }
                      placeholder="Từ loại..."
                    />
                  </div>


                  <div className="col-span-2">
                    <textarea
                      className="w-full p-2 border rounded text-sm text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                      rows="2"
                      value={item.pronunciation || ''}
                      onChange={(e) =>
                        handleChange(idx, 'pronunciation', e.target.value)
                      }
                    />
                  </div>


                  <div className="col-span-3">
                    <textarea
                      className="w-full p-2 border rounded text-sm text-gray-700 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                      rows="3"
                      value={item.definition || ''}
                      onChange={(e) =>
                        handleChange(idx, 'definition', e.target.value)
                      }
                    />
                  </div>


                  <div className="col-span-2">
                    <textarea
                      className="w-full p-2 border rounded text-sm text-gray-600 focus:ring-2 focus:ring-blue-200 outline-none resize-none placeholder-gray-300"
                      rows="3"
                      value={item.topic || ''}
                      onChange={(e) =>
                        handleChange(idx, 'topic', e.target.value)
                      }
                      placeholder="Chủ đề..."
                    />
                  </div>


                  <div className="col-span-1 flex justify-center items-center h-full">
                    {(idx !== editingData.length - 1 || item.term) && (
                      <button
                        onClick={() => handleDelete(idx)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                        title={t('removeFromNotebook')}
                      >
                        <Icons.Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>


        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex flex-col sm:flex-row justify-between gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-10">
          <div className="flex gap-2 w-full sm:w-auto">
            <ReviewDropdown
              onSelect={handleSelectReviewGame}
              dataLength={validCount}
              mainColor={mainColor}
            />
            <button
              onClick={handleAiFillAll}
              disabled={validCount === 0 || isAutoFillingAll}
              title="AI Tự điền hàng loạt"
              className="px-2 sm:px-4 py-2 bg-purple-100 text-purple-700 border border-purple-200 font-bold rounded-lg hover:bg-purple-200 flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            >
              {isAutoFillingAll ? (
                <Icons.Sparkles
                  size={16}
                  className="sm:w-[18px] sm:h-[18px] animate-pulse"
                />
              ) : (
                <Icons.Sparkles
                  size={16}
                  className="sm:w-[18px] sm:h-[18px]"
                />
              )}
              <span className="hidden sm:inline">
                {isAutoFillingAll
                  ? `Xử lý AI (${fillProgress.current}/${fillProgress.total})`
                  : 'AI Tự điền'}
              </span>
              <span className="sm:hidden">
                {isAutoFillingAll
                  ? `${fillProgress.current}/${fillProgress.total}`
                  : 'AI'}
              </span>
            </button>
            <button
              onClick={handleDeleteAllClick}
              disabled={validCount === 0 || isAutoFillingAll}
              title="Xóa toàn bộ"
              className="px-2 sm:px-4 py-2 bg-red-100 text-red-600 border border-red-200 font-bold rounded-lg hover:bg-red-200 flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Icons.Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" /> Xóa
            </button>
          </div>


          <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <button
              onClick={() =>
                onCopy &&
                onCopy(validEditingItems.map(({ _tempId, ...rest }) => rest))
              }
              disabled={validCount === 0}
              title="Copy Sheet"
              className="px-2 sm:px-4 py-2 bg-teal-50 text-teal-700 border border-teal-200 font-bold rounded-lg hover:bg-teal-100 flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              <Icons.ExternalLink
                size={16}
                className="sm:w-[18px] sm:h-[18px]"
              />{' '}
              Copy
            </button>
            <button
              onClick={handleSave}
              disabled={isAutoFillingAll}
              className="px-2 sm:px-6 py-2 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 flex items-center justify-center gap-2 text-xs sm:text-base active:scale-95 transition-all disabled:opacity-50"
            >
              <Icons.Save size={16} className="sm:w-[18px] sm:h-[18px]" />{' '}
              {t('saveChanges')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// Gắn vào window để tương thích ngược
if (typeof window !== 'undefined') {
  window.ReviewDropdown = ReviewDropdown;
  window.NotebookModal = NotebookModal;
}


export default NotebookModal;

