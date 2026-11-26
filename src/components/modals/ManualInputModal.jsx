// ============================================================================
// FILE 43/85: src/components/modals/ManualInputModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.6 - Version 2.00)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 16:43 (GMT+7)
// NHIỆM VỤ: Modal Nhập dữ liệu thủ công từng thẻ (có nút AI điền tự động)
//           hoặc nhập hàng loạt qua JSON.
//           Nâng cấp Ver 1.0 (Lượt 4.1 — Diệt 1H Radar & 0 Problems tsc):
//           1. Diệt 1/1 HIGH Radar (R05): Thay localStorage.setItem('fc_total_tokens')
//              bằng safeAddTotalTokens dùng Utils.safeLocalStorageSet (chống NaN).
//           2. Diệt 1/1 lỗi tsc(2322) (rows="2" -> rows={2}) & chuẩn hóa JSDoc.
//           3. Diệt F14 & S15: Truyền đủ 2 tham số onAutoFill(term, existingData)
//              khớp useAiLogic Ver 1.2; khóa Race Condition bằng fillRunIdRef,
//              isMountedRef, isOpenRef & latestTermRef chống ghi đè nhầm từ.
//           4. Diệt S14 & S16: Trim toàn bộ trường text, kiểm duyệt ảnh bằng
//              Utils.isValidImageUrl (hỗ trợ http/https & data:image), bổ sung
//              ô nhập URL ảnh minh họa kèm ảnh thu nhỏ xem trước.
//           5. Diệt F16 & F17: Bảng màu tĩnh MANUAL_MODAL_THEMES (xóa class động),
//              reset sạch qua prevIsOpenRef, hỗ trợ prop showToast tùy chọn và
//              đạt chuẩn A11y (role="dialog", aria-modal, đóng Backdrop/Escape).
//           Tinh chỉnh tối ưu Ver 1.1 (Thẩm định danhgia.md):
//           6. Diệt triệt để lỗi kẹt spinner isFilling khi bấm "Lưu thẻ" lúc AI
//              đang tải & mở khóa tức thì qua activeFillTermRef khi đổi từ mới.
//           7. Bảo vệ bộ gõ IME Tiếng Trung/Tiếng Việt: chỉ đóng bằng Escape
//              khi !e.isComposing.
//           8. Khóa đóng Backdrop 2 nhịp (backdropMouseDownRef) chống vô tình
//              đóng modal khi kéo chuột bôi đen văn bản ra ngoài nền tối.
// ============================================================================


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../common/Icons';
import { Utils, isValidImageUrl } from '../../utils/helpers';


/**
 * @typedef {Object} SingleCardFormData
 * @property {string} term
 * @property {string} pronunciation
 * @property {string} definition
 * @property {string} partOfSpeech
 * @property {string} topic
 * @property {string} analysis
 * @property {string} example
 * @property {string} sinoViet
 * @property {string} image
 * @property {string} grammar_type
 * @property {string} level
 * @property {string} language
 */


/** @type {Readonly<SingleCardFormData>} */
const EMPTY_SINGLE_DATA = Object.freeze({
  term: '',
  pronunciation: '',
  definition: '',
  partOfSpeech: '',
  topic: '',
  analysis: '',
  example: '',
  sinoViet: '',
  image: '',
  grammar_type: '',
  level: '',
  language: ''
});


/**
 * Bảng màu tĩnh 100% chống Tailwind JIT purge (Diệt F16)
 * @type {Record<string, { tabActive: string, primaryBtn: string }>}
 */
const MANUAL_MODAL_THEMES = {
  blue: {
    tabActive: 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700'
  },
  sky: {
    tabActive: 'text-sky-600 border-b-2 border-sky-600 bg-sky-50/50',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700'
  },
  red: {
    tabActive: 'text-red-600 border-b-2 border-red-600 bg-red-50/50',
    primaryBtn: 'bg-red-600 hover:bg-red-700'
  },
  indigo: {
    tabActive: 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700'
  },
  emerald: {
    tabActive: 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/50',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700'
  },
  purple: {
    tabActive: 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700'
  },
  orange: {
    tabActive: 'text-orange-600 border-b-2 border-orange-600 bg-orange-50/50',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700'
  },
  pink: {
    tabActive: 'text-pink-600 border-b-2 border-pink-600 bg-pink-50/50',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700'
  },
  cyan: {
    tabActive: 'text-cyan-600 border-b-2 border-cyan-600 bg-cyan-50/50',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700'
  },
  slate: {
    tabActive: 'text-slate-600 border-b-2 border-slate-600 bg-slate-50/50',
    primaryBtn: 'bg-slate-600 hover:bg-slate-700'
  }
};


/**
 * Chuẩn hóa chuỗi đầu vào an toàn
 * @param {any} val
 * @returns {string}
 */
const safeTrim = (val) => (typeof val === 'string' ? val.trim() : '');


/**
 * Chuẩn hóa khóa từ để đối khớp chống race condition (NFC + trim + lowercase)
 * @param {any} val
 * @returns {string}
 */
const normalizeTermCompare = (val) =>
  safeTrim(val).normalize('NFC').toLowerCase();


/**
 * Đọc an toàn từ localStorage
 * @param {string} key
 * @returns {string}
 */
const safeStorageGet = (key) => {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};


/**
 * Cộng dồn tổng số Token an toàn qua Utils.safeLocalStorageSet + chống NaN (Diệt 1H Radar)
 * @param {any} tokenUsage
 */
const safeAddTotalTokens = (tokenUsage) => {
  const used = Number(tokenUsage?.totalTokenCount);
  if (!Number.isFinite(used) || used <= 0) return;


  const rawPrev = Number(safeStorageGet('fc_total_tokens'));
  const prevSafe = Number.isFinite(rawPrev) && rawPrev > 0 ? Math.floor(rawPrev) : 0;
  Utils?.safeLocalStorageSet?.('fc_total_tokens', String(prevSafe + Math.floor(used)));
};


/**
 * Kiểm tra URL ảnh hợp lệ (hỗ trợ http/https và data:image/...;base64,...)
 * @param {any} val
 * @returns {boolean}
 */
const checkValidImageUrl = (val) => {
  if (typeof isValidImageUrl === 'function') return isValidImageUrl(val);
  if (typeof Utils?.isValidImageUrl === 'function') return Utils.isValidImageUrl(val);
  const str = safeTrim(val);
  if (!str) return false;
  return (
    /^https?:\/\/.+/i.test(str) ||
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(str)
  );
};


/**
 * Trích xuất thông điệp lỗi an toàn cho tsc/checkJs
 * @param {unknown} err
 * @returns {string}
 */
const getErrorMessage = (err) => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String(/** @type {{ message?: any }} */ (err).message || 'Không xác định');
  }
  return String(err || 'Không xác định');
};


/**
 * Modal Nhập dữ liệu thủ công từng thẻ hoặc nhập hàng loạt qua JSON
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {(() => void) | undefined} [props.onClose]
 * @param {((jsonText: string) => void) | undefined} [props.onImport]
 * @param {((cardPayload: Record<string, any>) => void) | undefined} [props.onAddCard]
 * @param {((term: string, existingData?: Record<string, any> | null) => Promise<Record<string, any> | null>) | undefined} [props.onAutoFill]
 * @param {((key: string) => string) | undefined} [props.t]
 * @param {string | undefined} [props.mainColor]
 * @param {((msg: string, type?: string) => void) | undefined} [props.showToast]
 */
export const ManualInputModal = ({
  isOpen,
  onClose = undefined,
  onImport = undefined,
  onAddCard = undefined,
  onAutoFill = undefined,
  t = (k) => k,
  mainColor = 'blue',
  showToast = undefined
}) => {
  const [mode, setMode] = useState(/** @type {'single' | 'batch'} */ ('single'));
  const [text, setText] = useState('');
  const [isFilling, setIsFilling] = useState(false);
  const [singleData, setSingleData] = useState(
    /** @type {SingleCardFormData} */ ({ ...EMPTY_SINGLE_DATA })
  );
  const [imgPreviewError, setImgPreviewError] = useState(false);


  // Refs bảo vệ vòng đời, khóa Backdrop 2 nhịp & chống Race Condition AI (Diệt S15, F17 & Ver 1.1)
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(Boolean(isOpen));
  const prevIsOpenRef = useRef(false);
  const fillRunIdRef = useRef(0);
  const activeFillTermRef = useRef('');
  const latestTermRef = useRef('');
  const backdropMouseDownRef = useRef(false);


  isOpenRef.current = Boolean(isOpen);
  latestTermRef.current = singleData.term;


  const theme = MANUAL_MODAL_THEMES[mainColor] || MANUAL_MODAL_THEMES.blue;


  // Helper hiển thị Toast ưu tiên prop showToast -> fallback globalShowToast
  const notify = useCallback(
    (msg, type = 'warning') => {
      if (typeof showToast === 'function') {
        showToast(msg, type);
        return;
      }
      if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
        window.globalShowToast(msg, type);
      } else {
        console.warn(`[Toast - ${type}]:`, msg);
      }
    },
    [showToast]
  );


  // Theo dõi mount/unmount chuẩn React 18 StrictMode
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      fillRunIdRef.current += 1;
      activeFillTermRef.current = '';
      backdropMouseDownRef.current = false;
    };
  }, []);


  // Reset sạch form đúng thời điểm chuyển trạng thái mở/đóng (Diệt F17, không dùng setTimeout 0)
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = Boolean(isOpen);


    if (isOpen && !wasOpen) {
      fillRunIdRef.current += 1;
      activeFillTermRef.current = '';
      backdropMouseDownRef.current = false;
      setText('');
      setSingleData({ ...EMPTY_SINGLE_DATA });
      setMode('single');
      setIsFilling(false);
      setImgPreviewError(false);
    } else if (!isOpen && wasOpen) {
      // Hủy hiệu lực mọi yêu cầu AI đang bay khi người dùng đóng modal
      fillRunIdRef.current += 1;
      activeFillTermRef.current = '';
      backdropMouseDownRef.current = false;
      setIsFilling(false);
    }
  }, [isOpen]);


  // Hỗ trợ đóng Modal bằng phím Escape chuẩn A11y & bảo vệ bộ gõ IME Tiếng Trung/Việt (Ver 1.1)
  useEffect(() => {
    if (!isOpen) return undefined;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.stopPropagation();
        if (typeof onClose === 'function') onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);


  /**
   * Cập nhật từng trường trong form nhập đơn
   * @param {keyof SingleCardFormData} field
   * @param {string} value
   */
  const handleSingleChange = (field, value) => {
    if (field === 'image') {
      setImgPreviewError(false);
    }
    if (
      field === 'term' &&
      isFilling &&
      normalizeTermCompare(value) !== activeFillTermRef.current
    ) {
      // Hủy lượt AI cũ & mở khóa nút AI ngay khi người dùng chuyển sang từ mới (Ver 1.1)
      fillRunIdRef.current += 1;
      activeFillTermRef.current = '';
      setIsFilling(false);
    }
    setSingleData((prev) => ({ ...prev, [field]: value }));
  };


  const handleSingleSubmit = () => {
    const cleanTerm = safeTrim(singleData.term);
    if (!cleanTerm) return;


    // Chuẩn hóa grammar_type về đúng mảng Array<string> theo Schema 12 trường
    const rawGrammar = singleData.grammar_type;
    const normalizedGrammarType = Array.isArray(rawGrammar)
      ? rawGrammar.map((s) => safeTrim(s)).filter(Boolean)
      : typeof rawGrammar === 'string' && rawGrammar.trim() !== ''
      ? rawGrammar
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];


    // Kiểm duyệt & chuẩn hóa trường ảnh (Diệt S14)
    const rawImage = safeTrim(singleData.image);
    const cleanImage = checkValidImageUrl(rawImage) ? rawImage : '';


    /** @type {Record<string, any>} */
    const payload = {
      term: cleanTerm,
      pronunciation: safeTrim(singleData.pronunciation),
      definition: safeTrim(singleData.definition),
      partOfSpeech: safeTrim(singleData.partOfSpeech),
      topic: safeTrim(singleData.topic),
      analysis: safeTrim(singleData.analysis),
      example: safeTrim(singleData.example),
      sinoViet: safeTrim(singleData.sinoViet),
      image: cleanImage,
      grammar_type: normalizedGrammarType
    };


    const cleanLevel = safeTrim(singleData.level);
    const cleanLanguage = safeTrim(singleData.language);
    if (cleanLevel) payload.level = cleanLevel;
    if (cleanLanguage) payload.language = cleanLanguage;


    if (typeof onAddCard === 'function') {
      onAddCard(payload);
    }


    // Tăng runId & giải phóng spinner ngay lập tức để tránh kẹt nút AI nếu lưu khi AI đang tải (Ver 1.1)
    fillRunIdRef.current += 1;
    activeFillTermRef.current = '';
    setIsFilling(false);
    setSingleData({ ...EMPTY_SINGLE_DATA });
    setImgPreviewError(false);
  };


  const handleAutoFillClick = async () => {
    const requestedTerm = safeTrim(singleData.term);
    if (!requestedTerm) return;


    if (typeof onAutoFill !== 'function') {
      notify('Chức năng AI chưa được kết nối!', 'warning');
      return;
    }


    // Chụp runId & ngữ cảnh hiện có để truyền đủ 2 tham số + chống Race Condition (Diệt F14 & S15)
    const runId = ++fillRunIdRef.current;
    const requestedNorm = normalizeTermCompare(requestedTerm);
    activeFillTermRef.current = requestedNorm;


    /** @type {Record<string, any>} */
    const existingData = {
      definition: safeTrim(singleData.definition),
      partOfSpeech: safeTrim(singleData.partOfSpeech),
      topic: safeTrim(singleData.topic),
      pronunciation: safeTrim(singleData.pronunciation),
      analysis: safeTrim(singleData.analysis),
      example: safeTrim(singleData.example),
      sinoViet: safeTrim(singleData.sinoViet),
      image: safeTrim(singleData.image)
    };


    setIsFilling(true);
    try {
      const result = await onAutoFill(requestedTerm, existingData);


      // Cộng token an toàn nếu caller tùy chỉnh trả kèm _tokenUsage (useAiLogic Ver 1.2 đã xử lý & strip)
      if (result && result._tokenUsage) {
        safeAddTotalTokens(result._tokenUsage);
      }


      // Chốt chặn Race Condition: bỏ qua nếu đã unmount, đã đóng modal, có lượt chạy mới hơn hoặc user đã sửa sang từ khác
      if (
        !isMountedRef.current ||
        !isOpenRef.current ||
        fillRunIdRef.current !== runId ||
        normalizeTermCompare(latestTermRef.current) !== requestedNorm
      ) {
        return;
      }


      if (result && typeof result === 'object') {
        const aiImage = safeTrim(result.image);
        const hasValidAiImage = checkValidImageUrl(aiImage);


        if (hasValidAiImage) {
          setImgPreviewError(false);
        }


        setSingleData((prev) => ({
          ...prev,
          pronunciation: safeTrim(result.pronunciation) || prev.pronunciation,
          definition: safeTrim(result.definition) || prev.definition,
          partOfSpeech: safeTrim(result.partOfSpeech) || prev.partOfSpeech,
          topic: safeTrim(result.topic) || prev.topic,
          analysis: safeTrim(result.analysis) || prev.analysis,
          example: safeTrim(result.example) || prev.example,
          sinoViet: safeTrim(result.sinoViet) || prev.sinoViet,
          image: hasValidAiImage ? aiImage : prev.image,
          grammar_type: result.grammar_type
            ? Array.isArray(result.grammar_type)
              ? result.grammar_type.map((g) => safeTrim(g)).filter(Boolean).join(', ')
              : safeTrim(result.grammar_type)
            : prev.grammar_type,
          level: safeTrim(result.level) || prev.level,
          language: safeTrim(result.language) || prev.language
        }));
      }
    } catch (e) {
      console.error(e);
      if (isMountedRef.current && fillRunIdRef.current === runId) {
        notify('Lỗi AI tự điền: ' + getErrorMessage(e), 'error');
      }
    } finally {
      if (isMountedRef.current && fillRunIdRef.current === runId) {
        activeFillTermRef.current = '';
        setIsFilling(false);
      }
    }
  };


  if (!isOpen) return null;


  const trimmedImage = safeTrim(singleData.image);
  const canPreviewImage = checkValidImageUrl(trimmedImage) && !imgPreviewError;


  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-input-modal-title"
      onMouseDown={(e) => {
        backdropMouseDownRef.current =
          e.button === 0 && e.target === e.currentTarget;
      }}
      onClick={(e) => {
        const shouldClose =
          backdropMouseDownRef.current && e.target === e.currentTarget;
        backdropMouseDownRef.current = false;
        if (shouldClose && typeof onClose === 'function') {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h3
            id="manual-input-modal-title"
            className="font-bold text-gray-700 flex items-center gap-2"
          >
            <Icons.Upload size={20} /> Thêm dữ liệu
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded"
          >
            <Icons.X size={20} />
          </button>
        </div>


        {/* Chuyển chế độ Nhập đơn / Nhập hàng loạt */}
        <div className="flex border-b" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              mode === 'single'
                ? theme.tabActive
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            onClick={() => setMode('single')}
          >
            Nhập thủ công
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'batch'}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              mode === 'batch'
                ? theme.tabActive
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            onClick={() => setMode('batch')}
          >
            Nhập JSON (Nâng cao)
          </button>
        </div>


        {/* Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {mode === 'single' ? (
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                  Từ vựng / Câu văn <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none font-medium"
                    placeholder="Ví dụ: Hello / 你好"
                    value={singleData.term}
                    onChange={(e) => handleSingleChange('term', e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAutoFillClick}
                    disabled={isFilling || !singleData.term.trim()}
                    className={`p-3 rounded-lg border-2 shrink-0 ${
                      isFilling
                        ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                        : 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 disabled:opacity-50'
                    }`}
                    title="Tự động điền bằng AI"
                    aria-label="Tự động điền bằng AI"
                  >
                    {isFilling ? (
                      <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Icons.Sparkles size={20} />
                    )}
                  </button>
                </div>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    Từ loại
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 font-sans text-sm"
                    placeholder="n., v., adj..."
                    value={singleData.partOfSpeech}
                    onChange={(e) =>
                      handleSingleChange('partOfSpeech', e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    Phiên âm
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 font-sans text-sm"
                    placeholder="/həˈloʊ/"
                    value={singleData.pronunciation}
                    onChange={(e) =>
                      handleSingleChange('pronunciation', e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    Hán Việt / Dịch sát nghĩa
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 text-sm"
                    placeholder="Nhĩ hảo"
                    value={singleData.sinoViet}
                    onChange={(e) =>
                      handleSingleChange('sinoViet', e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    Chủ đề
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 text-sm"
                    placeholder="Daily Life, Education..."
                    value={singleData.topic}
                    onChange={(e) =>
                      handleSingleChange('topic', e.target.value)
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    Nhãn ngữ pháp (Cách nhau bởi dấu phẩy)
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 text-sm"
                    placeholder="present_simple, passive_voice, ba_sentence..."
                    value={singleData.grammar_type}
                    onChange={(e) =>
                      handleSingleChange('grammar_type', e.target.value)
                    }
                  />
                </div>


                {/* Ô nhập & xem trước Ảnh minh họa (Diệt S16) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                    URL Ảnh minh họa (Tùy chọn)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none text-gray-600 text-sm"
                      placeholder="https://... hoặc data:image/..."
                      value={singleData.image}
                      onChange={(e) =>
                        handleSingleChange('image', e.target.value)
                      }
                    />
                    {canPreviewImage && (
                      <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={trimmedImage}
                          alt="Xem trước"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={() => setImgPreviewError(true)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>


              <div>
                <label className="block text-xs font-bold text-blue-600 mb-1 uppercase">
                  Nghĩa ngắn gọn (Cho Game)
                </label>
                <textarea
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                  rows={2}
                  placeholder="Ví dụ: Xin chào"
                  value={singleData.definition}
                  onChange={(e) =>
                    handleSingleChange('definition', e.target.value)
                  }
                />
              </div>


              <div>
                <label className="block text-xs font-bold text-purple-600 mb-1 uppercase">
                  Phân tích chi tiết / Ngữ pháp
                </label>
                <textarea
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-purple-200 outline-none resize-none h-20 text-sm"
                  placeholder="Cấu trúc ngữ pháp, cách dùng hoặc từ đồng nghĩa..."
                  value={singleData.analysis}
                  onChange={(e) =>
                    handleSingleChange('analysis', e.target.value)
                  }
                />
              </div>


              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                  Câu ví dụ minh họa
                </label>
                <textarea
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-200 outline-none resize-none h-24 text-sm"
                  placeholder={'- Hello world! (Chào thế giới!)'}
                  value={singleData.example}
                  onChange={(e) =>
                    handleSingleChange('example', e.target.value)
                  }
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-2">
                Dán danh sách từ vựng dạng JSON vào bên dưới:
              </p>
              <textarea
                className="w-full p-3 border rounded-lg text-sm font-mono h-60 focus:ring-2 focus:ring-blue-200 outline-none resize-none bg-gray-50"
                placeholder='[{"term":"Hello", "definition":"Xin chào", "pronunciation":"/həˈloʊ/", "partOfSpeech":"n."}, ...]'
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </>
          )}
        </div>


        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-gray-600 font-bold hover:bg-gray-200 transition-colors"
          >
            {t('cancel')}
          </button>
          {mode === 'single' ? (
            <button
              type="button"
              onClick={handleSingleSubmit}
              disabled={!singleData.term.trim()}
              className={`px-6 py-2 rounded ${theme.primaryBtn} text-white font-bold disabled:opacity-50 flex items-center gap-2 shadow-lg transition-colors`}
            >
              <Icons.Check size={18} /> Lưu thẻ
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (typeof onImport === 'function' && text.trim()) {
                  onImport(text);
                }
              }}
              disabled={!text.trim()}
              className={`px-6 py-2 rounded ${theme.primaryBtn} text-white font-bold disabled:opacity-50 flex items-center gap-2 shadow-lg transition-colors`}
            >
              <Icons.Upload size={18} /> Nhập JSON
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).ManualInputModal = ManualInputModal;
}


export default ManualInputModal;

