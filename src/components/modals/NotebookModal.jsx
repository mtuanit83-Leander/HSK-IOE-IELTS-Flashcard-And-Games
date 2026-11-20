// ============================================================================
// FILE 37/85: src/components/modals/NotebookModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.3 - Version 1.05)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 20/11/2026 - 05:22 (GMT+7)
// NHIỆM VỤ: Modal Sổ tay từ vựng (ReviewDropdown ôn tập vạn năng, Global
//           Local-First Lookup, hợp nhất tiêu chí thiếu trường chống bẫy Token
//           grammar_type:[], chống reset bản nháp bằng prevIsOpenRef, dừng Batch
//           mượt mà với isStoppingBatch, lọc chặt từ khóa ảnh rác và siết Retry).
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../common/Icons';
import { STORAGE_KEYS } from '../../config/constants';
import {
  Utils,
  isValidImageUrl,
  buildSmartImageUrl
} from '../../utils/helpers';
import { fillCardWithAi } from '../../services/geminiApi';

// Giới hạn số lần tạm nghỉ GLOBAL_PAUSE (429) liên tiếp để tránh treo vòng lặp vô hạn
const MAX_GLOBAL_PAUSE_RETRIES = 4;

// Danh sách chuỗi rác không được phép dùng làm từ khóa tìm ảnh
const INVALID_IMAGE_KEYWORDS = new Set([
  'null',
  'undefined',
  'none',
  'n/a',
  'na',
  'false',
  'true',
  'empty',
  'no image',
  '-'
]);

// Bộ đếm sinh mã định danh dòng tạm duy nhất trong phiên soạn thảo
let notebookRowUidCounter = 1;

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
 * Đọc API Key khả dụng đồng nhất (Props -> fc_apikey -> Paid Key -> Key Pool)
 */
const resolveActiveApiKey = (propApiKey = '') => {
  const cleanKey = (val) =>
    typeof val === 'string' ? val.replace(/["'\s]/g, '').trim() : '';

  const fromProp = cleanKey(propApiKey);
  if (fromProp.length >= 10) return fromProp;

  try {
    const fromPrimary = cleanKey(
      localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_apikey')
    );
    if (fromPrimary.length >= 10) return fromPrimary;

    const fromPaid = cleanKey(localStorage.getItem('fc_paid_apikey'));
    if (fromPaid.length >= 10) return fromPaid;

    const pool = Utils?.safeJsonParse
      ? Utils.safeJsonParse('fc_apikey_pool', [])
      : [];
    if (Array.isArray(pool)) {
      const firstValid = pool.find((k) => cleanKey(k).length >= 10);
      if (firstValid) return cleanKey(firstValid);
    }
  } catch (e) {
    // Bỏ qua lỗi truy cập storage
  }

  return '';
};

/**
 * Đọc động khoảng nghỉ giữa các thẻ từ fc_ai_config (luôn chặn sàn nhất quán ở 3000ms)
 */
const getDynamicBatchDelayMs = (defaultMs = 4000) => {
  try {
    const aiCfg = Utils?.safeJsonParse
      ? Utils.safeJsonParse('fc_ai_config', null)
      : null;
    const configured = parseInt(aiCfg?.delayMs, 10);
    if (!isNaN(configured) && configured >= 0) {
      return Math.max(3000, configured);
    }
  } catch (e) {
    // Bỏ qua lỗi đọc cấu hình
  }
  return defaultMs;
};

/**
 * Kiểm tra đường dẫn ảnh hợp lệ (hỗ trợ http/https/data:image và loại bỏ chuỗi rác)
 */
const checkIsValidImage = (val) => {
  if (typeof isValidImageUrl === 'function') return isValidImageUrl(val);
  if (typeof Utils?.isValidImageUrl === 'function') {
    return Utils.isValidImageUrl(val);
  }
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (
    /^https?:\/\/.+/i.test(trimmed) ||
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(trimmed)
  );
};

/**
 * [VER 1.1] Lọc sạch ứng viên từ khóa ảnh:
 * Chặn chuỗi rác, đường dẫn file tương đối, đuôi tệp ảnh, tiền tố URL gãy và chữ Hán
 */
const sanitizeImageKeywordCandidate = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (INVALID_IMAGE_KEYWORDS.has(lower)) return '';

  // Chặn chữ Hán (tránh bẫy ảnh meme chữ Hán)
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return '';

  // Chặn đường dẫn tương đối, đường dẫn ổ đĩa, URL hỏng hoặc tên tệp ảnh
  if (/(^\/|^\.\.?\/|:\\|:\/\/|\bwww\.)/i.test(trimmed)) return '';
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?.*|#.*)?$/i.test(trimmed)) {
    return '';
  }

  // Phải chứa ít nhất 1 cụm từ Latinh có nghĩa (>= 2 ký tự chữ cái)
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return '';

  return trimmed;
};

/**
 * Dựng URL ảnh sạch qua buildSmartImageUrl, chặn tuyệt đối fallback bằng chữ Hán,
 * đường dẫn hỏng hoặc câu văn dài
 */
const resolveSafeNotebookImage = (
  aiImage,
  existingImage,
  fallbackTerm,
  lang,
  dataMode
) => {
  if (checkIsValidImage(aiImage)) return aiImage.trim();
  if (checkIsValidImage(existingImage)) return existingImage.trim();

  const smartBuilder =
    typeof buildSmartImageUrl === 'function'
      ? buildSmartImageUrl
      : typeof Utils?.buildSmartImageUrl === 'function'
      ? Utils.buildSmartImageUrl
      : null;

  if (!smartBuilder) return '';

  // 1. Ưu tiên ứng viên từ khóa tiếng Anh sạch từ AI trước, rồi mới tới dữ liệu cũ
  const candidateKeyword =
    sanitizeImageKeywordCandidate(aiImage) ||
    sanitizeImageKeywordCandidate(existingImage);

  if (candidateKeyword) {
    const builtFromKeyword = smartBuilder(candidateKeyword, '', dataMode);
    if (builtFromKeyword) return builtFromKeyword;
  }

  // 2. Chỉ fallback bằng term ở chế độ Từ vựng Tiếng Anh (cấm tuyệt đối chữ Hán & Câu văn)
  if (lang !== 'zh' && dataMode !== 'sentence') {
    const safeFallbackTerm = sanitizeImageKeywordCandidate(fallbackTerm);
    if (safeFallbackTerm) {
      return smartBuilder('', safeFallbackTerm, dataMode) || '';
    }
  }

  return '';
};

/**
 * Lọc bỏ các trường nháp/metadata trước khi lưu thẻ vào Sổ tay
 */
const sanitizeCardForStorage = (card) => {
  if (!card || typeof card !== 'object') return card;
  const { _tempId, _tokenUsage, posAnalysis, image_keyword, ...cleanCard } =
    card;
  return cleanCard;
};

/**
 * [VER 1.1] Bộ kiểm tra trường lõi còn thiếu dùng chung cho cả điền lẻ & điền hàng loạt.
 * Lưu ý: KHÔNG đưa điều kiện grammar_type.length === 0 vào cổng kích hoạt để tránh
 * lặp gọi AI vô hạn trên các câu giao tiếp bình thường (vốn hợp lệ với grammar_type: []).
 */
const getCoreMissingFieldsForRow = (item, lang, dataMode) => {
  const isSentenceMode = dataMode === 'sentence';
  const coreFields = [
    'pronunciation',
    'definition',
    'partOfSpeech',
    'topic',
    'example',
    'analysis'
  ];

  if (!isSentenceMode) {
    coreFields.push('image');
    if (lang === 'zh') {
      coreFields.push('sinoViet');
    }
  }

  return coreFields.filter((field) => {
    const val = item?.[field];
    if (field === 'image') {
      return !checkIsValidImage(val);
    }
    return !val || val.toString().trim() === '';
  });
};

/**
 * Xây dựng danh sách đầy đủ các trường gửi lên AI khi đã qua cổng kích hoạt.
 * Tự động đính kèm 'grammar_type' ở chế độ câu văn để AI điền kèm trong cùng 1 lượt gọi.
 */
const getMissingFieldsForRow = (item, lang, dataMode) => {
  const missing = getCoreMissingFieldsForRow(item, lang, dataMode);
  if (dataMode === 'sentence') {
    const gt = item?.grammar_type;
    if (!Array.isArray(gt) || gt.length === 0) {
      missing.push('grammar_type');
    }
  }
  return missing;
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
 * Tạo dòng trống mặc định ở cuối bảng Sổ tay với mã _tempId duy nhất
 */
const createBlankNotebookRow = () => ({
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
  _tempId: `nb_${Date.now()}_${notebookRowUidCounter++}`
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
  const [fillingRowIds, setFillingRowIds] = useState(new Set());
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [pendingFillRowIds, setPendingFillRowIds] = useState(null);
  const [isAutoFillingAll, setIsAutoFillingAll] = useState(false);
  const [isStoppingBatch, setIsStoppingBatch] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0 });

  // Ref giữ trạng thái mới nhất chống Stale Closure & bảo vệ bản nháp chưa lưu
  const editingDataRef = useRef(editingData);
  editingDataRef.current = editingData;

  const dataRef = useRef(data);
  dataRef.current = data;

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const prevIsOpenRef = useRef(false);

  const isBatchCancelledRef = useRef(false);
  const batchTimerRef = useRef(null);
  const batchTimerResolveRef = useRef(null);

  const isSentenceMode = dataMode === 'sentence';
  const ImageIcon = Icons.Image || null;

  // Chỉ hiển thị Toast khi Modal vẫn đang mở (chặn Toast muộn sau khi đóng)
  const safeNotify = (msg, type = 'info') => {
    if (isOpenRef.current) {
      notify(msg, type);
    }
  };

  // Hủy ngay bộ đếm ngủ giữa 2 thẻ trong vòng lặp Batch (khi đóng Modal hoặc bấm dừng)
  const cancelBatchWorker = () => {
    isBatchCancelledRef.current = true;
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    if (batchTimerResolveRef.current) {
      const resolveFn = batchTimerResolveRef.current;
      batchTimerResolveRef.current = null;
      resolveFn();
    }
  };

  // Hàm chờ có thể đánh thức lập tức khi người dùng hủy hoặc đóng Modal
  const cancellableBatchDelay = (ms) =>
    new Promise((resolve) => {
      if (isBatchCancelledRef.current) {
        resolve();
        return;
      }
      batchTimerResolveRef.current = resolve;
      batchTimerRef.current = setTimeout(() => {
        batchTimerRef.current = null;
        batchTimerResolveRef.current = null;
        resolve();
      }, ms);
    });

  // Dọn dẹp vòng lặp Batch nếu component unmount
  useEffect(() => {
    return () => {
      cancelBatchWorker();
    };
  }, []);

  // [VER 1.1] Chỉ khởi tạo bản nháp khi isOpen chuyển false -> true (chống reset khi data đổi từ nền)
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      cancelBatchWorker();
      isBatchCancelledRef.current = false;

      const safeData = Array.isArray(dataRef.current) ? dataRef.current : [];
      const loaded = JSON.parse(JSON.stringify(safeData)).map((item) => ({
        ...item,
        _tempId: `nb_${Date.now()}_${notebookRowUidCounter++}`
      }));
      loaded.push(createBlankNotebookRow());

      editingDataRef.current = loaded;
      setEditingData(loaded);
      setFillingRowIds(new Set());
      setShowConfirmDelete(false);
      setPendingFillRowIds(null);
      setIsAutoFillingAll(false);
      setIsStoppingBatch(false);
      setFillProgress({ current: 0, total: 0 });
    } else if (!isOpen && wasOpen) {
      cancelBatchWorker();
      setIsAutoFillingAll(false);
      setIsStoppingBatch(false);
      setFillProgress({ current: 0, total: 0 });
    }
  }, [isOpen]);

  // Danh sách các thẻ hợp lệ đang có trên bảng soạn thảo
  const validEditingItems = editingData.filter(
    (item) => item && item.term && item.term.trim() !== ''
  );
  const validCount = validEditingItems.length;

  const handleChange = (index, field, value) => {
    setEditingData((prev) => {
      const newData = [...prev];
      if (!newData[index]) return prev;
      newData[index] = {
        ...newData[index],
        [field]: value
      };
      if (index === newData.length - 1 && value.trim() !== '') {
        newData.push(createBlankNotebookRow());
      }
      editingDataRef.current = newData;
      return newData;
    });
  };

  // Xóa 1 dòng trên bản nháp editingData (Chỉ lưu chính thức khi bấm handleSave)
  const handleDelete = (index) => {
    if (isAutoFillingAll) return;
    setEditingData((prev) => {
      const newData = [...prev];
      newData.splice(index, 1);
      if (newData.length === 0) {
        newData.push(createBlankNotebookRow());
      }
      editingDataRef.current = newData;
      return newData;
    });
  };

  const handleDeleteAllClick = () => {
    setShowConfirmDelete(true);
  };

  const confirmDeleteAll = () => {
    const resetRows = [createBlankNotebookRow()];
    editingDataRef.current = resetRows;
    setEditingData(resetRows);
    setShowConfirmDelete(false);
  };

  const handleSave = () => {
    const cleanData = validEditingItems.map(sanitizeCardForStorage);
    if (onSave) {
      onSave(cleanData);
    }
    if (onClose) onClose();
  };

  const handleCloseModal = () => {
    cancelBatchWorker();
    if (onClose) onClose();
  };

  /**
   * Tự động điền thông minh cho 1 dòng (Hỗ trợ truyền index hoặc _tempId)
   * Trả về { filled: boolean, apiHit: boolean } để vòng lặp Batch kiểm soát Retry & Delay chính xác
   */
  const handleAiFill = async (indexOrRowId, isBatch = false) => {
    const currentRows = editingDataRef.current;
    let targetIndex = -1;
    if (typeof indexOrRowId === 'string') {
      targetIndex = currentRows.findIndex((r) => r && r._tempId === indexOrRowId);
    } else if (typeof indexOrRowId === 'number') {
      targetIndex = indexOrRowId;
    }

    let item = targetIndex >= 0 ? currentRows[targetIndex] : null;
    if (!item || !item.term || item.term.trim() === '') {
      if (!isBatch) safeNotify('Vui lòng nhập từ vựng trước khi gọi AI!', 'warning');
      return { filled: false, apiHit: false };
    }

    const rowId = item._tempId;

    // Helper cập nhật đúng dòng theo _tempId (an toàn tuyệt đối chống lệch chỉ mục)
    const patchRowById = (updaterFn) => {
      setEditingData((prev) => {
        const idx = prev.findIndex((r) => r && r._tempId === rowId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = updaterFn(next[idx]);
        editingDataRef.current = next;
        return next;
      });
    };

    // [BẢN VÁ V1.04+: GLOBAL LOCAL-FIRST LOOKUP TOÀN DIỆN]
    let localUpdated = false;
    const localMatch = findCardInLocalPools(item.term, lang, sourceData);
    if (localMatch) {
      const nextImage =
        !checkIsValidImage(item.image) && checkIsValidImage(localMatch.image)
          ? localMatch.image.trim()
          : item.image;
      const nextGrammarType =
        Array.isArray(item.grammar_type) && item.grammar_type.length > 0
          ? item.grammar_type
          : Array.isArray(localMatch.grammar_type)
          ? [...localMatch.grammar_type]
          : [];

      const mergedItem = {
        ...item,
        definition: item.definition || localMatch.definition || '',
        pronunciation: item.pronunciation || localMatch.pronunciation || '',
        partOfSpeech: item.partOfSpeech || localMatch.partOfSpeech || '',
        topic: item.topic || localMatch.topic || '',
        analysis: item.analysis || localMatch.analysis || '',
        example: item.example || localMatch.example || '',
        sinoViet: item.sinoViet || localMatch.sinoViet || '',
        grammar_type: nextGrammarType,
        level: item.level || localMatch.level || undefined,
        language: item.language || localMatch.language || lang,
        image: nextImage
      };

      const checkChangedKeys = [
        'definition',
        'pronunciation',
        'partOfSpeech',
        'topic',
        'analysis',
        'example',
        'sinoViet',
        'image'
      ];
      localUpdated =
        checkChangedKeys.some((k) => (mergedItem[k] || '') !== (item[k] || '')) ||
        (nextGrammarType.length > 0 &&
          (!Array.isArray(item.grammar_type) || item.grammar_type.length === 0));

      if (localUpdated) {
        patchRowById(() => mergedItem);
      }
      item = mergedItem;
    }

    // [VER 1.1] Dùng chung 1 tiêu chí thiếu trường lõi (có hỗ trợ bổ sung ảnh cho vocab, không dính bẫy grammar_type: [])
    const coreMissing = getCoreMissingFieldsForRow(item, lang, dataMode);
    if (coreMissing.length === 0) {
      if (!isBatch) {
        safeNotify(
          localUpdated
            ? 'Đã tự động điền đầy đủ từ kho cục bộ (0 Token)!'
            : 'Thông tin đã đầy đủ, không cần gọi AI!',
          'success'
        );
      }
      return { filled: true, apiHit: false };
    }

    const isOnlyImageMissing =
      !isSentenceMode &&
      coreMissing.length === 1 &&
      coreMissing[0] === 'image';

    // Danh sách trường thực gửi lên AI (kèm grammar_type nếu ở chế độ câu văn)
    const missingFields = getMissingFieldsForRow(item, lang, dataMode);

    const effectiveApiKey = resolveActiveApiKey(apiKey);
    if (!effectiveApiKey) {
      if (!isBatch) {
        safeNotify(
          'Vui lòng nhập API Key để AI điền nốt thông tin còn thiếu!',
          'warning'
        );
      }
      if (isBatch) {
        throw new Error('Missing API Key');
      }
      return { filled: false, apiHit: false };
    }

    setFillingRowIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });

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

      // Truyền đầy đủ 7 tham số (bao gồm item làm existingData) để AI vẽ ảnh sát nghĩa
      const result = await aiFillFn(
        item.term,
        lang,
        effectiveApiKey,
        missingFields,
        dataMode,
        levelContext,
        item
      );

      if (result && typeof result === 'object') {
        if (result._tokenUsage?.totalTokenCount) {
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

        patchRowById((currentRow) => {
          const updatedRow = {
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

          if (missingFields.includes('image')) {
            const safeImg = resolveSafeNotebookImage(
              result.image,
              currentRow.image,
              currentRow.term,
              lang,
              dataMode
            );
            if (safeImg) {
              updatedRow.image = safeImg;
            }
          }

          return updatedRow;
        });

        if (!isBatch && isOnlyImageMissing) {
          safeNotify('Đã bổ sung ảnh minh họa cho thẻ!', 'success');
        }
        return { filled: true, apiHit: true };
      }

      return { filled: false, apiHit: true };
    } catch (e) {
      console.error(e);
      if (!isBatch) {
        safeNotify('Lỗi AI: ' + e.message, 'error');
        return { filled: false, apiHit: true };
      }
      throw e;
    } finally {
      setFillingRowIds((prev) => {
        const next = new Set(prev);
        next.delete(rowId);
        return next;
      });
    }
  };

  const handleAiFillAll = () => {
    if (isAutoFillingAll) {
      if (isStoppingBatch) return;
      setIsStoppingBatch(true);
      cancelBatchWorker();
      safeNotify('Đang dừng tiến trình AI Tự điền hàng loạt...', 'info');
      return;
    }

    const effectiveApiKey = resolveActiveApiKey(apiKey);
    if (!effectiveApiKey) {
      safeNotify('Vui lòng nhập API Key trước!', 'warning');
      return;
    }

    // [VER 1.1] Đồng bộ tuyệt đối với getCoreMissingFieldsForRow (bao gồm analysis, partOfSpeech, topic, sinoViet, image)
    const rowIdsToFill = editingDataRef.current
      .filter((item) => {
        if (!item || !item.term || item.term.trim() === '') return false;
        return getCoreMissingFieldsForRow(item, lang, dataMode).length > 0;
      })
      .map((item) => item._tempId);

    if (rowIdsToFill.length === 0) {
      safeNotify(
        'Sổ tay đã đầy đủ thông tin (hoặc chưa nhập từ vựng)!',
        'info'
      );
      return;
    }

    setPendingFillRowIds(rowIdsToFill);
  };

  const executeAiFillAll = async () => {
    const rowIdsToFill = pendingFillRowIds;
    setPendingFillRowIds(null);
    if (!rowIdsToFill || rowIdsToFill.length === 0) return;

    isBatchCancelledRef.current = false;
    setIsStoppingBatch(false);
    setIsAutoFillingAll(true);
    setFillProgress({ current: 0, total: rowIdsToFill.length });

    let consecutiveCardFailures = 0;
    let stoppedByOverload = false;

    try {
      for (let i = 0; i < rowIdsToFill.length; i++) {
        if (isBatchCancelledRef.current) break;

        const rowId = rowIdsToFill[i];
        setFillProgress({ current: i + 1, total: rowIdsToFill.length });

        let attempts = 0;
        let globalPauseRetries = 0;
        const maxAttempts = 3;
        let success = false;
        let apiHit = false;

        while (
          attempts < maxAttempts &&
          !success &&
          !isBatchCancelledRef.current
        ) {
          try {
            const res = await handleAiFill(rowId, true);

            // [VER 1.1] Nếu đã gọi AI nhưng kết quả trả về rỗng/không hợp lệ -> kích hoạt luồng Retry chuẩn
            if (res && !res.filled && res.apiHit) {
              throw new Error('AI không trả về dữ liệu hợp lệ');
            }

            success = true;
            apiHit = Boolean(res?.apiHit);
            consecutiveCardFailures = 0;
          } catch (err) {
            const currentTerm =
              editingDataRef.current.find((r) => r && r._tempId === rowId)
                ?.term || rowId;

            if (err?.message && err.message.includes('GLOBAL_PAUSE')) {
              globalPauseRetries++;
              if (globalPauseRetries >= MAX_GLOBAL_PAUSE_RETRIES) {
                stoppedByOverload = true;
                safeNotify(
                  'Máy chủ AI đang giới hạn tần suất (429) kéo dài. Đã tạm dừng tự điền hàng loạt!',
                  'error'
                );
                break;
              }
              console.warn(
                `[Notebook Batch] Tạm nghỉ 15.5s né 429 (${globalPauseRetries}/${MAX_GLOBAL_PAUSE_RETRIES}) cho thẻ: ${currentTerm}`
              );
              await cancellableBatchDelay(15500);
              continue;
            }

            if (err?.message === 'Missing API Key') {
              stoppedByOverload = true;
              safeNotify('Thiếu API Key khả dụng. Đã dừng tự điền!', 'warning');
              break;
            }

            attempts++;
            console.warn(
              `Lỗi AI cho thẻ ${currentTerm}, thử lại lần ${attempts}/${maxAttempts}...`,
              err
            );
            if (attempts < maxAttempts && !isBatchCancelledRef.current) {
              const retryDelayMs = attempts === 1 ? 5000 : 10000;
              await cancellableBatchDelay(retryDelayMs);
            } else {
              console.error(
                `Bỏ qua thẻ ${currentTerm} sau ${maxAttempts} lần thử thất bại.`
              );
            }
          }
        }

        if (stoppedByOverload || isBatchCancelledRef.current) break;

        if (!success) {
          consecutiveCardFailures++;
          if (consecutiveCardFailures >= 3) {
            stoppedByOverload = true;
            safeNotify(
              'Máy chủ AI quá tải liên tiếp. Đã tự động dừng điền hàng loạt!',
              'error'
            );
            break;
          }
        }

        // Chỉ nghỉ làm nguội API khi thực sự có gọi mạng (bỏ qua delay 0ms nếu điền từ Local-First)
        if (apiHit && i < rowIdsToFill.length - 1 && !isBatchCancelledRef.current) {
          await cancellableBatchDelay(getDynamicBatchDelayMs(4000));
        }
      }
    } finally {
      setIsAutoFillingAll(false);
      setIsStoppingBatch(false);
      setFillProgress({ current: 0, total: 0 });
    }

    if (isBatchCancelledRef.current) {
      safeNotify('Đã dừng tiến trình AI Tự điền hàng loạt!', 'info');
    } else if (!stoppedByOverload) {
      safeNotify('Đã hoàn tất quá trình AI tự điền hàng loạt!', 'success');
    }
  };

  // Xử lý khi chọn chế độ Ôn tập lại từ Sổ tay (Tự động lấy danh sách thẻ đang soạn thảo)
  const handleSelectReviewGame = (type) => {
    cancelBatchWorker();
    const cleanData = validEditingItems.map(sanitizeCardForStorage);
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
        {pendingFillRowIds && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white p-6 rounded-xl shadow-2xl max-w-sm w-full text-center border-2 border-purple-100">
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icons.Sparkles size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                AI Tự điền hàng loạt?
              </h3>
              <p className="text-gray-600 mb-6 text-sm">
                Hệ thống sẽ tự động gọi AI điền thông tin
                {!isSentenceMode ? ' & ảnh minh họa' : ''} cho{' '}
                <b>{pendingFillRowIds.length}</b> thẻ còn thiếu. Việc này có thể
                tốn nhiều Token. Bạn có muốn tiếp tục?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingFillRowIds(null)}
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
          <button onClick={handleCloseModal} data-tooltip={t('ttClose')}>
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
              {editingData.map((item, idx) => {
                const isRowFilling = fillingRowIds.has(item._tempId);
                const hasValidImg = checkIsValidImage(item.image);
                return (
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
                      <div className="flex items-center gap-2 mt-1">
                        {item.term && (
                          <button
                            onClick={() => onPlay && onPlay(item.term)}
                            className={`text-${mainColor}-500 hover:bg-${mainColor}-50 p-1 rounded`}
                            title="Nghe phát âm"
                          >
                            <Icons.Volume2 size={16} />
                          </button>
                        )}
                        {item.term && (
                          <button
                            onClick={() => handleAiFill(item._tempId)}
                            disabled={isRowFilling || isAutoFillingAll}
                            className={`text-purple-500 hover:bg-purple-50 p-1 rounded transition-colors ${
                              isRowFilling ? 'animate-spin' : ''
                            } disabled:opacity-50`}
                            title={
                              !isSentenceMode && !hasValidImg
                                ? 'AI tự điền thông tin & ảnh minh họa'
                                : 'Tự động điền thông minh (Smart Fill)'
                            }
                          >
                            <Icons.Sparkles size={16} />
                          </button>
                        )}
                        {item.term && lang === 'zh' && (
                          <button
                            onClick={() =>
                              onOpenHanzi && onOpenHanzi(item.term)
                            }
                            className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                            title="Tập viết chữ Hán"
                          >
                            <Icons.Brush size={16} />
                          </button>
                        )}
                        {item.term && !isSentenceMode && ImageIcon && (
                          <span
                            className={`p-1 rounded inline-flex items-center ${
                              hasValidImg
                                ? 'text-emerald-500 bg-emerald-50'
                                : 'text-amber-400 bg-amber-50/70'
                            }`}
                            title={
                              hasValidImg
                                ? 'Thẻ đã có ảnh minh họa hợp lệ'
                                : 'Chưa có ảnh minh họa — bấm biểu tượng AI để bổ sung'
                            }
                          >
                            <ImageIcon size={15} />
                          </span>
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
                          disabled={isAutoFillingAll}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full disabled:opacity-40"
                          title={t('removeFromNotebook')}
                        >
                          <Icons.Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
              disabled={(validCount === 0 && !isAutoFillingAll) || isStoppingBatch}
              title={
                isStoppingBatch
                  ? 'Đang chờ thẻ hiện tại hoàn tất để dừng an toàn...'
                  : isAutoFillingAll
                  ? 'Bấm để dừng tiến trình AI Tự điền'
                  : 'AI Tự điền hàng loạt'
              }
              className={`px-2 sm:px-4 py-2 border font-bold rounded-lg flex items-center justify-center gap-2 text-xs sm:text-base shadow-sm transition-all active:scale-95 disabled:opacity-50 ${
                isStoppingBatch
                  ? 'bg-amber-100 text-amber-700 border-amber-300 cursor-wait'
                  : isAutoFillingAll
                  ? 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200'
                  : 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200'
              }`}
            >
              <Icons.Sparkles
                size={16}
                className={`sm:w-[18px] sm:h-[18px] ${
                  isAutoFillingAll ? 'animate-pulse' : ''
                }`}
              />
              <span className="hidden sm:inline">
                {isStoppingBatch
                  ? 'Đang dừng...'
                  : isAutoFillingAll
                  ? `Dừng AI (${fillProgress.current}/${fillProgress.total})`
                  : 'AI Tự điền'}
              </span>
              <span className="sm:hidden">
                {isStoppingBatch
                  ? 'Dừng...'
                  : isAutoFillingAll
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
                onCopy(validEditingItems.map(sanitizeCardForStorage))
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