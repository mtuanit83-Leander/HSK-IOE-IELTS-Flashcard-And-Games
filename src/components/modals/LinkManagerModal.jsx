// ============================================================================
// FILE 42/85: src/components/modals/LinkManagerModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.6)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 22:50 (GMT+7)
// NHIỆM VỤ: Modal Quản lý Link Google Sheets (Nguồn Từ vựng/Câu văn 9 Tabs,
//           Nhập Sổ tay, Xem trước & Xuất Kho AI tự sinh ra Excel);
//           sạch 0 CRITICAL / 0 HIGH / 0 MEDIUM (gỡ 3/3 window.DEFAULT_SHEETS),
//           chỉ gắn drag listener khi mở (diệt rò rỉ listener), bọc safeReadStorage,
//           chuẩn hóa trim() URL, mở link an toàn (https?:// + noopener,noreferrer),
//           hỗ trợ nhập lại cùng tệp Excel và chuẩn A11y (Backdrop/Escape/role="dialog").
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../common/Icons';
import { STORAGE_KEYS, DEFAULT_SHEETS } from '../../config/constants';

/**
 * Helper hiển thị thông báo an toàn qua hệ thống Toast toàn cục
 */
const notify = (msg, type = 'info') => {
  if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
    window.globalShowToast(msg, type);
  } else {
    console.log(`[Toast - ${type}]:`, msg);
  }
};

/**
 * Đọc an toàn chuỗi từ localStorage (chống lỗi khi trình duyệt chặn Storage)
 */
const safeReadStorage = (key, fallback = '') => {
  if (!key || typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Lấy đường dẫn Google Sheet mặc định trực tiếp từ ES Module DEFAULT_SHEETS
 */
const getDefaultSheetUrl = (lang, mode) => {
  if (!DEFAULT_SHEETS || typeof DEFAULT_SHEETS !== 'object') return '';
  const langEntry = DEFAULT_SHEETS[lang];
  if (!langEntry || typeof langEntry !== 'object') return '';
  const raw = langEntry[mode];
  return typeof raw === 'string' ? raw.trim() : '';
};

/**
 * Chuẩn hóa chuỗi đường dẫn (gọt khoảng trắng đầu/cuối an toàn)
 */
const cleanUrl = (val) => {
  return typeof val === 'string' ? val.trim() : '';
};

/**
 * Mở liên kết ngoài an toàn: chỉ chấp nhận giao thức http/https và khóa tabnabbing
 */
const openSafeExternalUrl = (rawUrl) => {
  const url = cleanUrl(rawUrl);
  if (!url) {
    notify('Chưa có đường dẫn để mở!', 'warning');
    return false;
  }
  if (!/^https?:\/\/.+/i.test(url)) {
    notify('Đường dẫn không hợp lệ (phải bắt đầu bằng http:// hoặc https://)!', 'warning');
    return false;
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    const openedWin = window.open(url, '_blank', 'noopener,noreferrer');
    if (openedWin) {
      try {
        openedWin.opener = null;
      } catch {
        // Trình duyệt đã tự cô lập cross-origin opener
      }
    }
    return true;
  }
  return false;
};

/**
 * Modal Quản lý Dữ liệu & Liên kết Google Sheets (LinkManagerModal)
 */
export const LinkManagerModal = ({
  isOpen,
  onClose,
  t = (k) => k,
  exportUrl,
  setExportUrl,
  apiKeySheetUrl,
  setApiKeySheetUrl,
  onImport,
  onExportLink,
  onExportExcel,
  onFileImport,
  onSaveSettings,
  onFetchKey,
  onDownloadTemplate,
  lang = 'en',
  onImportToNotebook,
  aiHarvestPool = {},
  onExportHarvestToExcel,
  onClearHarvestPool
}) => {
  const fileInputRef = useRef(null);
  const [notebookUrl, setNotebookUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // State và Ref phục vụ kéo thả cửa sổ (Draggable Modal)
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    isDragging: false,
    didMove: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0
  });

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const baseDefaultUrlKey = STORAGE_KEYS?.DEFAULT_URL || 'fc_default_url';
  const defaultVocabKey = `${baseDefaultUrlKey}_${lang}_vocab`;
  const defaultSentenceKey = `${baseDefaultUrlKey}_${lang}_sentence`;

  const [vocabUrl, setVocabUrl] = useState(() => {
    return (
      cleanUrl(safeReadStorage(defaultVocabKey, '')) ||
      getDefaultSheetUrl(lang, 'vocab')
    );
  });

  const [sentenceUrl, setSentenceUrl] = useState(() => {
    return (
      cleanUrl(safeReadStorage(defaultSentenceKey, '')) ||
      getDefaultSheetUrl(lang, 'sentence')
    );
  });

  // Đồng bộ đường dẫn mặc định & đặt lại tọa độ khi mở Modal hoặc đổi ngôn ngữ
  useEffect(() => {
    if (!isOpen) {
      dragRef.current.isDragging = false;
      dragRef.current.didMove = false;
      setIsDragging(false);
      return;
    }

    setVocabUrl(
      cleanUrl(safeReadStorage(defaultVocabKey, '')) ||
        getDefaultSheetUrl(lang, 'vocab')
    );
    setSentenceUrl(
      cleanUrl(safeReadStorage(defaultSentenceKey, '')) ||
        getDefaultSheetUrl(lang, 'sentence')
    );
    setShowPreview(false);
    setPosition({ x: 0, y: 0 });
    dragRef.current.isDragging = false;
    dragRef.current.didMove = false;
    setIsDragging(false);
  }, [isOpen, lang, defaultVocabKey, defaultSentenceKey]);

  // Chỉ gắn các listener kéo thả & phím Escape khi Modal đang mở (diệt 100% rò rỉ)
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const handleMouseMove = (e) => {
      if (!dragRef.current.isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.didMove = true;
      }
      setPosition({
        x: dragRef.current.initialX + dx,
        y: dragRef.current.initialY + dy
      });
    };

    const stopDragging = () => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;
      setIsDragging(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (typeof onCloseRef.current === 'function') {
          onCloseRef.current();
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      dragRef.current.isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Bắt đầu kéo cửa sổ tại thanh tiêu đề
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    dragRef.current.isDragging = true;
    dragRef.current.didMove = false;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.initialX = position.x;
    dragRef.current.initialY = position.y;
    setIsDragging(true);
  };

  // Đóng Modal khi click lớp nền (chống đóng nhầm ngay sau khi thả thao tác kéo)
  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (dragRef.current.didMove) {
      dragRef.current.didMove = false;
      return;
    }
    if (onClose) onClose();
  };

  // Lưu đường dẫn đã được gọt khoảng trắng xuống Settings
  const handleSaveSettingUrl = (storageKey, rawVal) => {
    if (typeof onSaveSettings !== 'function') return;
    onSaveSettings(storageKey, cleanUrl(rawVal));
  };

  // Nạp API Key từ Google Sheet
  const handleFetchKeyClick = () => {
    const trimmed = cleanUrl(apiKeySheetUrl);
    if (!trimmed) {
      notify('Vui lòng nhập link Google Sheet chứa API Key!', 'warning');
      return;
    }
    if (onFetchKey) onFetchKey(trimmed);
  };

  // Áp dụng nhập Master File (Từ vựng hoặc Câu văn)
  const handleImportMasterClick = (rawUrl, mode) => {
    const trimmed = cleanUrl(rawUrl);
    if (!trimmed) {
      notify('Vui lòng nhập link Google Sheet trước khi áp dụng!', 'warning');
      return;
    }
    if (onImport) onImport(trimmed, mode);
  };

  // Gộp dữ liệu từ Google Sheet vào Sổ tay
  const handleImportNotebookClick = () => {
    const trimmed = cleanUrl(notebookUrl);
    if (!trimmed) {
      notify('Vui lòng nhập link Google Sheet để gộp vào Sổ tay!', 'warning');
      return;
    }
    if (onImportToNotebook) onImportToNotebook(trimmed);
  };

  // Mở hộp thoại chọn tệp Excel/CSV (reset value trước khi chọn để hỗ trợ chọn lại cùng tệp)
  const handleTriggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Tính tổng số câu hỏi đã thu hoạch trong Kho AI tự sinh (phòng thủ dữ liệu null/lạ)
  const safeHarvestPool =
    aiHarvestPool && typeof aiHarvestPool === 'object' && !Array.isArray(aiHarvestPool)
      ? aiHarvestPool
      : {};

  const totalHarvested = Object.values(safeHarvestPool).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0
  );

  if (!isOpen) return null;

  const trimmedVocabUrl = cleanUrl(vocabUrl);
  const trimmedSentenceUrl = cleanUrl(sentenceUrl);
  const trimmedExportUrl = cleanUrl(exportUrl);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-manager-modal-title"
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        {/* Header (Hỗ trợ kéo thả) */}
        <div
          className="flex justify-between items-center p-4 border-b bg-green-50 shrink-0 rounded-t-xl cursor-move select-none"
          onMouseDown={handleMouseDown}
        >
          <h3
            id="link-manager-modal-title"
            className="font-bold text-lg flex items-center gap-2 text-green-700 pointer-events-none"
          >
            <Icons.Link /> {t('importTitle') || 'Quản lý Dữ liệu & Liên kết'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            data-tooltip={t('ttClose')}
            aria-label="Đóng"
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-200 p-1.5 rounded transition-colors"
          >
            <Icons.X />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
          {/* 1. API Key Google Sheet Link */}
          <div className="mb-4 bg-purple-50 p-3 rounded-lg border border-purple-100">
            <label className="block text-sm font-bold text-purple-700 mb-1">
              {t('apiKeySheetLabel') || 'Link Google Sheet chứa API Key'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={apiKeySheetUrl || ''}
                onChange={(e) =>
                  setApiKeySheetUrl && setApiKeySheetUrl(e.target.value)
                }
                className="w-full p-2 border rounded bg-white font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleFetchKeyClick}
                className="p-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                title="Nạp lại API Key"
                aria-label="Nạp lại API Key"
              >
                <Icons.RefreshCw size={16} />
              </button>
              <button
                type="button"
                onClick={onDownloadTemplate}
                className="p-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                title={t('downloadTemplate') || 'Tải mẫu'}
                aria-label={t('downloadTemplate') || 'Tải mẫu'}
              >
                <Icons.Download size={16} />
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSaveSettingUrl(
                    STORAGE_KEYS?.API_KEY_SHEET || 'fc_apikey_sheet_url',
                    apiKeySheetUrl
                  )
                }
                className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                title="Lưu làm mặc định"
                aria-label="Lưu làm mặc định"
              >
                <Icons.Save size={16} />
              </button>
            </div>
          </div>

          {/* 2. Nguồn Từ Vựng (Master File 9 Tabs) */}
          <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100 shadow-sm">
            <label className="text-sm font-bold text-blue-800 mb-1 flex items-center gap-2">
              <Icons.Layers size={16} /> Nguồn Từ Vựng (Master File)
            </label>
            <p className="text-[11px] text-blue-600 mb-2 italic">
              1 Link Google Sheet chứa 9 Tab Level (Từ vựng).
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={vocabUrl}
                onChange={(e) => setVocabUrl(e.target.value)}
                className="w-full p-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                placeholder="Dán link Google Sheet (.xlsx)..."
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() =>
                    handleSaveSettingUrl(defaultVocabKey, vocabUrl)
                  }
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 text-xs flex items-center gap-1 transition-colors"
                  title="Lưu làm mặc định"
                >
                  <Icons.Save size={14} /> Lưu
                </button>
                <button
                  type="button"
                  onClick={() => openSafeExternalUrl(vocabUrl)}
                  disabled={!trimmedVocabUrl}
                  className="px-3 py-1.5 bg-orange-100 text-orange-600 font-bold rounded-lg hover:bg-orange-200 text-xs flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Mở Link"
                >
                  <Icons.ExternalLink size={14} /> Mở
                </button>
                <button
                  type="button"
                  onClick={() => handleImportMasterClick(vocabUrl, 'vocab')}
                  className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 text-xs flex items-center gap-1 shadow-md transition-colors"
                  title="Tải và bóc tách tất cả Tab"
                >
                  <Icons.RefreshCw size={14} /> Áp dụng
                </button>
              </div>
            </div>
          </div>

          {/* 3. Nguồn Câu Văn (Master File 9 Tabs) */}
          <div className="mb-4 bg-teal-50 p-3 rounded-lg border border-teal-100 shadow-sm">
            <label className="text-sm font-bold text-teal-800 mb-1 flex items-center gap-2">
              <Icons.BookOpen size={16} /> Nguồn Câu Văn (Master File)
            </label>
            <p className="text-[11px] text-teal-600 mb-2 italic">
              1 Link Google Sheet chứa 9 Tab Level (Câu văn).
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={sentenceUrl}
                onChange={(e) => setSentenceUrl(e.target.value)}
                className="w-full p-2.5 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-200 outline-none"
                placeholder="Dán link Google Sheet (.xlsx)..."
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() =>
                    handleSaveSettingUrl(defaultSentenceKey, sentenceUrl)
                  }
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 text-xs flex items-center gap-1 transition-colors"
                  title="Lưu làm mặc định"
                >
                  <Icons.Save size={14} /> Lưu
                </button>
                <button
                  type="button"
                  onClick={() => openSafeExternalUrl(sentenceUrl)}
                  disabled={!trimmedSentenceUrl}
                  className="px-3 py-1.5 bg-orange-100 text-orange-600 font-bold rounded-lg hover:bg-orange-200 text-xs flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Mở Link"
                >
                  <Icons.ExternalLink size={14} /> Mở
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleImportMasterClick(sentenceUrl, 'sentence')
                  }
                  className="px-4 py-1.5 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 text-xs flex items-center gap-1 shadow-md transition-colors"
                  title="Tải và bóc tách tất cả Tab"
                >
                  <Icons.RefreshCw size={14} /> Áp dụng
                </button>
              </div>
            </div>
          </div>

          {/* 4. Nhập thêm vào Sổ tay */}
          <div className="mb-4 bg-orange-50 p-3 rounded-lg border border-orange-100">
            <label className="text-sm font-bold text-orange-700 mb-1 flex items-center gap-2">
              <Icons.BookOpen size={16} /> Nhập thêm vào Sổ tay
            </label>
            <p className="text-xs text-orange-600 mb-2 italic">
              Gộp dữ liệu từ link mới vào sổ tay hiện có (Tự động lọc trùng).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={notebookUrl}
                onChange={(e) => setNotebookUrl(e.target.value)}
                className="w-full p-2 border rounded text-sm bg-white"
                placeholder="Dán link Google Sheet..."
              />
              <button
                type="button"
                onClick={handleImportNotebookClick}
                className="p-2 bg-orange-500 text-white rounded hover:bg-orange-600 font-bold whitespace-nowrap text-xs flex items-center gap-1 transition-colors"
              >
                <Icons.CloudUpload size={16} /> Gộp
              </button>
            </div>
          </div>

          {/* 5. Kho Dữ Liệu AI Tự Sinh */}
          <div className="mb-4 bg-indigo-50 p-3 rounded-lg border border-indigo-200 shadow-sm relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-10 pointer-events-none">
              <Icons.Sparkles size={64} />
            </div>
            <label className="text-sm font-bold text-indigo-800 mb-1 flex items-center gap-2 relative z-10">
              <Icons.Sparkles size={16} /> Kho Dữ Liệu AI Tự Sinh
            </label>
            <p className="text-[11px] text-indigo-600 mb-3 leading-tight relative z-10">
              Tự động thu thập các câu hỏi/thử thách do AI sáng tác trong quá
              trình chơi game ở chế độ &quot;AI Tự Sinh&quot;.
            </p>
            <div className="flex justify-between items-center bg-white p-2 rounded border border-indigo-100 mb-3 relative z-10">
              <span className="text-xs font-bold text-gray-600">
                Tổng số câu đã thu hoạch:
              </span>
              <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {totalHarvested}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2 relative z-10">
              <button
                type="button"
                onClick={() => setShowPreview((prev) => !prev)}
                disabled={totalHarvested === 0}
                className={`p-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all shadow-sm border ${
                  showPreview
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                <Icons.Eye size={14} />{' '}
                {showPreview ? 'Đóng xem trước' : 'Xem trước'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearHarvestPool) onClearHarvestPool();
                  setShowPreview(false);
                }}
                disabled={totalHarvested === 0}
                className="p-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-xs flex items-center justify-center gap-1 transition-all shadow-sm disabled:opacity-50"
              >
                <Icons.Trash2 size={14} /> Làm rỗng
              </button>
            </div>

            <button
              type="button"
              onClick={onExportHarvestToExcel}
              disabled={totalHarvested === 0}
              className="w-full p-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:from-gray-400 disabled:to-gray-500 shadow-md transition-all active:scale-95 relative z-10"
            >
              <Icons.Download size={18} /> Xuất Kho AI ra Excel
            </button>

            {showPreview && totalHarvested > 0 && (
              <div className="mt-3 bg-white border border-indigo-100 rounded-lg p-2 max-h-[250px] overflow-y-auto custom-scrollbar relative z-10 animate-in slide-in-from-top-2">
                {Object.entries(safeHarvestPool).map(([level, items]) => {
                  if (!Array.isArray(items) || items.length === 0) return null;
                  const cleanLvl = String(level)
                    .replace('level_', '')
                    .replace(/_/g, ' ')
                    .toUpperCase();
                  return (
                    <div key={level} className="mb-3 last:mb-0">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 border-b border-indigo-50 pb-1 sticky top-0 bg-white/90 backdrop-blur-sm z-20">
                        {cleanLvl} ({items.length})
                      </div>
                      <div className="space-y-2">
                        {items.map((item, idx) => {
                          if (!item || typeof item !== 'object') return null;
                          const qText =
                            item.wrongSentence ||
                            item.displaySentence ||
                            item.term ||
                            'Chưa rõ';
                          const aText =
                            item.correction ||
                            item.targetWord ||
                            item.oddWord ||
                            item.definition ||
                            'Chưa rõ';
                          const isWordsArray =
                            Array.isArray(item.words) && item.words.length > 0;
                          const displayQ = isWordsArray
                            ? item.words.filter(Boolean).join(' • ')
                            : qText;

                          return (
                            <div
                              key={`${level}_${idx}`}
                              className="bg-gray-50 p-2 rounded border border-gray-100 text-[10px]"
                            >
                              <div className="font-bold text-gray-700 mb-0.5 line-clamp-2">
                                {displayQ}
                              </div>
                              <div className="flex items-center gap-1 text-green-600 font-bold">
                                <Icons.ChevronRight
                                  size={10}
                                  className="shrink-0"
                                />{' '}
                                <span className="line-clamp-1">{aText}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 6. Xuất dữ liệu & Nhập/Xuất Excel */}
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-700 mb-1">
              {t('exportSheetLabel') || 'Link xuất dữ liệu Google Sheet'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={exportUrl || ''}
                onChange={(e) => setExportUrl && setExportUrl(e.target.value)}
                className="w-full p-2 border rounded text-sm bg-gray-50"
              />
              <button
                type="button"
                onClick={() =>
                  handleSaveSettingUrl(
                    `${STORAGE_KEYS?.EXPORT_URL || 'fc_export_url'}_${lang}`,
                    exportUrl
                  )
                }
                className="p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                title="Lưu link xuất"
                aria-label="Lưu link xuất"
              >
                <Icons.Save size={16} />
              </button>
              <button
                type="button"
                onClick={onExportLink}
                className="p-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                data-tooltip={t('ttExportToLink')}
                title="Copy dữ liệu TSV để dán vào Sheet"
                aria-label="Copy dữ liệu TSV để dán vào Sheet"
              >
                <Icons.CloudUpload size={16} />
              </button>
              <button
                type="button"
                onClick={() => openSafeExternalUrl(exportUrl)}
                disabled={!trimmedExportUrl}
                className="p-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mở Sheet"
                aria-label="Mở Sheet"
              >
                <Icons.ExternalLink size={16} />
              </button>
            </div>

            <div className="mt-2 flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={onFileImport}
                className="hidden"
                accept=".xlsx, .xls, .csv"
              />
              <button
                type="button"
                onClick={handleTriggerFileUpload}
                className="flex-1 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700 flex items-center justify-center gap-2 transition-colors"
                title={t('ttUpload')}
              >
                <Icons.Upload size={16} /> Nhập Excel
              </button>
              <button
                type="button"
                onClick={onExportExcel}
                className="flex-1 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
                title={t('ttExport')}
              >
                <Icons.Download size={16} /> Xuất Excel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.LinkManagerModal = LinkManagerModal;
}

export default LinkManagerModal;