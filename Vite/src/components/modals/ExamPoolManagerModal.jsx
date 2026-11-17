// ============================================================================
// FILE 47/85: src/components/modals/ExamPoolManagerModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.9)
// NHIỆM VỤ: Trung tâm Quản trị Ngân hàng Đề thi Khảo thí (Dashboard thống kê,
//           Thanh trượt tỉ lệ Lai, Thu mua từ Game, Nhập/Xuất Excel Kho).
// ============================================================================

import React, { useState, useRef, useMemo } from 'react';
import { SafeIcon } from '../common/Icons';

/**
 * Modal Quản trị Ngân hàng Đề thi Khảo thí (Exam Harvest Pool Manager)
 */
export const ExamPoolManagerModal = ({
  isOpen,
  onClose,
  mainColor = 'blue',
  examPoolData
}) => {
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const [showPreview, setShowPreview] = useState(false);

  // Rã băng các dữ liệu và hàm điều khiển từ Hook useExamPoolLogic (Tầng 6)
  const {
    examPool = {},
    hybridRatio = 70,
    isPoolLoading = false,
    handleRatioChange = () => {},
    handleClearPool = () => {},
    handleImportFromMiniGame = () => {},
    handleExportExamPoolToExcel = () => {},
    handleImportFromExcel = () => {}
  } = examPoolData || {};

  // 1. TÍNH TOÁN THỐNG KÊ (DASHBOARD)
  const stats = useMemo(() => {
    let total = 0;
    const byLevel = {};

    if (examPool && typeof examPool === 'object') {
      Object.keys(examPool).forEach((lang) => {
        const langObj = examPool[lang];
        if (!langObj || typeof langObj !== 'object') return;

        Object.keys(langObj).forEach((level) => {
          if (!byLevel[level]) byLevel[level] = 0;
          const levelObj = langObj[level];
          if (!levelObj || typeof levelObj !== 'object') return;

          Object.keys(levelObj).forEach((topic) => {
            const topicObj = levelObj[topic];
            if (!topicObj || typeof topicObj !== 'object') return;

            Object.keys(topicObj).forEach((type) => {
              const items = topicObj[type];
              const count = Array.isArray(items) ? items.length : 0;
              total += count;
              byLevel[level] += count;
            });
          });
        });
      });
    }

    return { total, byLevel };
  }, [examPool]);

  // 2. HANDLER CHO FILE UPLOAD (THU MUA TỪ MINI GAME)
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file && handleImportFromMiniGame) {
      handleImportFromMiniGame(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 3. HANDLER CHO FILE UPLOAD (NHẬP EXCEL KHO ĐÃ QUA CHỈNH SỬA)
  const onExcelChange = (e) => {
    const file = e.target.files?.[0];
    if (file && handleImportFromExcel) {
      handleImportFromExcel(file);
      if (excelInputRef.current) excelInputRef.current.value = '';
    }
  };

  // Đóng Modal kèm reset trạng thái xem trước an toàn (không cần setState đồng bộ trong useEffect)
  const handleCloseModal = () => {
    setShowPreview(false);
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh] border border-gray-200 relative">
        {/* Màn hình Loading khi Import/Xử lý */}
        {isPoolLoading && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
            <div className={`w-16 h-16 border-4 border-${mainColor}-200 border-t-${mainColor}-600 rounded-full animate-spin mb-4`}></div>
            <p className={`text-${mainColor}-700 font-bold animate-pulse text-lg`}>
              Đang xử lý dữ liệu...
            </p>
          </div>
        )}

        {/* Header */}
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0 shadow-sm`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full bg-${mainColor}-100 text-${mainColor}-600 flex items-center justify-center shadow-inner`}>
              <SafeIcon name="Database" size={20} />
            </div>
            <div>
              <h3 className={`font-bold text-lg text-${mainColor}-800 leading-tight uppercase tracking-wide`}>
                Trung Tâm Đề Thi
              </h3>
              <p className="text-[10px] font-bold text-gray-500">
                Exam Harvest Pool Manager
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors active:scale-95"
            title="Đóng"
          >
            <SafeIcon name="X" size={24} />
          </button>
        </div>

        {/* Nội dung chính */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-50/50 space-y-6">
          {/* PHẦN 1: DASHBOARD THỐNG KÊ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`md:col-span-1 bg-gradient-to-br from-${mainColor}-500 to-${mainColor}-700 rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col items-center justify-center`}>
              <SafeIcon name="Layers" size={64} className="absolute -right-4 -bottom-4 opacity-10" />
              <span className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">
                Tổng Số Câu
              </span>
              <span className="text-5xl font-black tracking-tight">
                {stats.total}
              </span>
            </div>

            <div className="md:col-span-2 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-center">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-2">
                Phân bổ theo Cấp độ
              </span>
              {Object.keys(stats.byLevel).length === 0 ? (
                <div className="text-sm text-gray-400 italic text-center py-2">
                  Kho dữ liệu đang trống.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.byLevel).map(([lvl, count]) => (
                    <div
                      key={lvl}
                      className={`px-3 py-1.5 bg-${mainColor}-50 border border-${mainColor}-100 rounded-lg flex items-center gap-2`}
                    >
                      <span className={`text-[10px] font-bold text-${mainColor}-600 uppercase`}>
                        {lvl.replace('level_', '').replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm font-black text-gray-700 bg-white px-2 rounded shadow-sm">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PHẦN 2: RATIO CONTROLLER (ĐIỀU CHỈNH TỈ LỆ LAI) */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <SafeIcon name="Settings" size={20} className={`text-${mainColor}-500`} />
                <h4 className="font-bold text-gray-800 text-lg">
                  Cấu hình Thuật toán Lai
                </h4>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-black bg-${mainColor}-100 text-${mainColor}-700 shadow-sm`}>
                AI: {hybridRatio}% / Kho: {100 - hybridRatio}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-6 max-w-lg">
              Điều chỉnh tỉ lệ bốc câu hỏi giữa Kho Dữ liệu Offline và Máy chủ AI. Tỉ lệ AI càng cao, kho dữ liệu của bạn sẽ càng nhanh chóng phình to.
            </p>
            <div className="w-full px-2 mb-8">
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={hybridRatio}
                onChange={(e) => handleRatioChange(e.target.value)}
                className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${mainColor}-600`}
              />
              <div className="flex justify-between mt-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                <div className="flex flex-col items-center">
                  <span>0%</span>
                  <span className="text-gray-500">Offline 100%</span>
                </div>
                <div className="flex flex-col items-center">
                  <span>50%</span>
                  <span className="text-blue-500">Cân bằng</span>
                </div>
                <div className="flex flex-col items-center">
                  <span>100%</span>
                  <span className="text-purple-500">Cày AI</span>
                </div>
              </div>
            </div>
          </div>

          {/* PHẦN 3: I/O MANAGER (QUẢN LÝ LUỒNG DỮ LIỆU) */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
              <SafeIcon name="RefreshCw" size={20} className="text-green-500" /> Quản lý Luồng Dữ liệu
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={onFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full py-3 px-2 bg-green-50 text-green-700 border border-green-200 rounded-xl hover:bg-green-100 transition-all font-bold text-sm flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95"
                  title="Chuyển đổi dữ liệu đã chơi từ Mini Game thành câu hỏi Khảo thí"
                >
                  <SafeIcon name="Upload" size={24} /> Thu mua từ Game
                </button>
              </div>

              <div>
                <input
                  type="file"
                  ref={excelInputRef}
                  onChange={onExcelChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  onClick={() => excelInputRef.current?.click()}
                  className="w-full h-full py-3 px-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-all font-bold text-sm flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95"
                  title="Nhập lại file Excel Kho sau khi con người đã chỉnh sửa"
                >
                  <SafeIcon name="Database" size={24} /> Nhập Excel Kho
                </button>
              </div>

              <button
                onClick={handleExportExamPoolToExcel}
                disabled={stats.total === 0}
                className="w-full py-3 px-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-100 transition-all font-bold text-sm flex flex-col items-center justify-center gap-2 shadow-sm disabled:opacity-50 active:scale-95"
                title="Trích xuất cấu trúc chuẩn ra Excel"
              >
                <SafeIcon name="Download" size={24} /> Xuất Excel Kho
              </button>

              <button
                onClick={handleClearPool}
                disabled={stats.total === 0}
                className="w-full py-3 px-2 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition-all font-bold text-sm flex flex-col items-center justify-center gap-2 shadow-sm disabled:opacity-50 active:scale-95"
              >
                <SafeIcon name="Trash2" size={24} /> Reset Toàn bộ
              </button>
            </div>
          </div>

          {/* PHẦN 4: PREVIEW KHO DỮ LIỆU */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
            >
              <h4 className="font-bold text-gray-800 flex items-center gap-2">
                <SafeIcon name="Eye" size={20} className="text-gray-400" /> Xem trước nội dung kho
              </h4>
              <SafeIcon
                name="ChevronDown"
                size={20}
                className={`text-gray-400 transition-transform ${showPreview ? 'rotate-180' : ''}`}
              />
            </button>

            {showPreview && (
              <div className="p-4 border-t border-gray-100 bg-gray-50/50 max-h-[300px] overflow-y-auto custom-scrollbar">
                {stats.total === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-4 italic">
                    Kho hiện tại đang trống rỗng.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.keys(examPool).map((langKey) =>
                      Object.keys(examPool[langKey] || {}).map((lvlKey) => {
                        const lvlData = examPool[langKey][lvlKey] || {};
                        let flatItems = [];

                        Object.values(lvlData).forEach((topicObj) => {
                          if (!topicObj || typeof topicObj !== 'object') return;
                          Object.values(topicObj).forEach((typeArr) => {
                            if (Array.isArray(typeArr)) {
                              flatItems = flatItems.concat(typeArr);
                            }
                          });
                        });

                        return (
                          <div
                            key={`${langKey}-${lvlKey}`}
                            className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm"
                          >
                            <div className={`text-xs font-black text-${mainColor}-600 uppercase tracking-widest border-b pb-2 mb-2`}>
                              [{langKey.toUpperCase()}]{' '}
                              {lvlKey.replace('level_', '').replace(/_/g, ' ')} (
                              {flatItems.length} câu)
                            </div>
                            <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                              {flatItems.map((item, idx) => {
                                const c = item?.content || {};
                                const qText =
                                  c.term ||
                                  c.displaySentence ||
                                  c.wrongSentence ||
                                  (Array.isArray(c.words) ? c.words.join(' • ') : '') ||
                                  c.audioScript ||
                                  c.passage ||
                                  'Lỗi hiển thị';

                                let aText =
                                  c.definition ||
                                  c.targetWord ||
                                  c.correction ||
                                  c.oddWord ||
                                  c.correctAnswer ||
                                  '';

                                // Quét mảng Options để tìm đáp án đúng
                                if (Array.isArray(c.options)) {
                                  const correctOpt = c.options.find(
                                    (o) =>
                                      o.isCorrect === true ||
                                      String(o.isCorrect).toLowerCase() === 'true'
                                  );
                                  if (correctOpt) {
                                    aText = correctOpt.text;
                                  }
                                }

                                // Nếu là Tổ kén (Đoạn văn) không chứa câu hỏi con trực tiếp
                                if (!aText && c.passage && !c.term) {
                                  aText = 'Đoạn văn gốc (Reference)';
                                }
                                if (!aText) aText = 'Lỗi đáp án';

                                return (
                                  <div
                                    key={item.id || idx}
                                    className="text-[11px] bg-gray-50 p-2 rounded border border-gray-100"
                                  >
                                    <div className="font-bold text-gray-700 mb-0.5 line-clamp-2">
                                      {qText}
                                    </div>
                                    <div className="text-green-600 font-medium line-clamp-1">
                                      ➔ {aText}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.ExamPoolManagerModal = ExamPoolManagerModal;
}

export default ExamPoolManagerModal;