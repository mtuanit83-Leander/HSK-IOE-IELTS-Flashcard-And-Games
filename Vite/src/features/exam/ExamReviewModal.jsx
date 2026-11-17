/**
 * ============================================================================
 * FILE 74/85: src/features/exam/ExamReviewModal.jsx
 * @description Màn hình Xem lại chi tiết bài thi (Exam Review Modal).
 *              Hiển thị ngữ cảnh câu hỏi, đáp án, giải thích AI, Xuất Excel,
 *              In PDF qua Iframe tàng hình và Smart Bookmark.
 * @origin Tầng 5 - Block 5.16 (Mock Test Review UI - Version 1.06)
 * ============================================================================
 */

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';

// Icon Máy in (Printer) nội bộ
const PrinterIcon = ({ size = 20, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="6 9 6 2 18 2 18 9"></polyline>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
    <rect x="6" y="14" width="12" height="8"></rect>
  </svg>
);

export const ExamReviewModal = ({
  isOpen,
  onClose,
  examState,
  mainColor = 'blue',
  onBookmark,
  notebook,
  onExportExcel
}) => {
  // [KIẾN TRÚC MỚI] ĐỘNG CƠ IN ẤN QUA IFRAME (HIDDEN PRINT IFRAME PATTERN)
  // Đặt Hook lên đầu hàm để tuân thủ nghiêm ngặt Rules of Hooks
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen || !examState) return null;

  // Helper: Trích xuất và định dạng dữ liệu từ answerItem
  const parseQuestionData = (ansItem) => {
    const type = ansItem.questionMetadata?.type || 'unknown';
    const content = ansItem.questionContent || {};
    const userAns = ansItem.answer;
    const isCorrect = ansItem.isCorrect;

    let questionText = 'Dữ liệu câu hỏi bị khuyết.';
    let correctText = '';
    let userText = '';
    let explanation = content.explanation || content.analysis || '';
    let bookmarkPayload = null;

    if (
      type.includes('multiple_choice') ||
      type.includes('mcq') ||
      type.includes('tfng') ||
      type.includes('pronunciation') ||
      type.includes('image_quiz') ||
      type.includes('match') ||
      type.includes('listening')
    ) {
      questionText = (
        content.term ||
        content.questionText ||
        'Câu hỏi trắc nghiệm / Nối ô / Đọc hiểu'
      ).replace(/\*/g, '');
      const correctOpt = content.options?.find((o) => o.isCorrect);
      correctText = correctOpt
        ? correctOpt.text.replace(/\*/g, '')
        : content.correctAnswer || content.definition || 'Không rõ đáp án';
      if (userAns) {
        userText =
          typeof userAns === 'object'
            ? userAns.text?.replace(/\*/g, '') || 'Đã chọn'
            : String(userAns).replace(/\*/g, '');
      } else {
        userText = 'Bỏ qua';
      }
      bookmarkPayload = {
        isSmartTarget: true,
        display: questionText,
        save: correctText,
        analysis: explanation
      };
    } else if (type.includes('fill_blank')) {
      const underlinedTarget = content.targetWord
        ? content.targetWord
            .split('')
            .map((c) => c + '\u0332')
            .join('')
        : '';
      questionText = content.displaySentence
        ? content.displaySentence.replace(/\[__________\]/g, ' [___] ')
        : content.term || 'Câu điền từ';
      correctText =
        content.targetWord || content.correctAnswer || content.definition || 'Không rõ đáp án';
      userText = typeof userAns === 'string' && userAns.trim() !== '' ? userAns : 'Bỏ qua';
      explanation = content.hint || explanation;
      const cleanSentence = content.displaySentence
        ? content.displaySentence.replace(/\[__________\]/g, content.targetWord)
        : questionText;
      const displaySentence = content.displaySentence
        ? content.displaySentence.replace(/\[__________\]/g, underlinedTarget)
        : questionText;
      bookmarkPayload = {
        isSmartTarget: true,
        display: displaySentence,
        save: cleanSentence,
        analysis: explanation
      };
    } else if (type.includes('spot_mistake')) {
      questionText = content.wrongSentence || content.term || 'Câu tìm lỗi sai';
      correctText = content.correction
        ? `Sửa: ${content.wrongWord} ➔ ${content.correction}`
        : content.definition || 'Không rõ đáp án';
      if (userAns && userAns.correction) {
        userText = `Sửa thành: ${userAns.correction}`;
      } else if (userAns && userAns.selectedWord) {
        userText = `Chọn sai ở: ${userAns.selectedWord}`;
      } else {
        userText = 'Bỏ qua';
      }
      let cleanCorrectSentence = '';
      let correctSentenceWithUnderline = '';
      if (content.wrongSentence && content.wrongWord) {
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const safeWrong = escapeRegExp(content.wrongWord);
        let regex;
        try {
          regex = new RegExp(`\\b${safeWrong}\\b`, 'ig');
        } catch {
          regex = new RegExp(safeWrong, 'i');
        }
        let testRegex;
        try {
          testRegex = new RegExp(`\\b${safeWrong}\\b`, 'i');
        } catch {
          testRegex = new RegExp(safeWrong, 'i');
        }
        if (!testRegex.test(content.wrongSentence)) {
          regex = new RegExp(safeWrong, 'ig');
        }
        cleanCorrectSentence = content.wrongSentence.replace(regex, content.correction || '');
        regex.lastIndex = 0;
        const underlinedCorrection = content.correction
          ? content.correction
              .split('')
              .map((c) => c + '\u0332')
              .join('')
          : '';
        correctSentenceWithUnderline = content.wrongSentence.replace(regex, underlinedCorrection);
      }
      bookmarkPayload = {
        isSmartTarget: true,
        display: correctSentenceWithUnderline || questionText,
        save: cleanCorrectSentence || questionText,
        analysis: explanation
      };
    } else if (type.includes('scramble')) {
      questionText = content.definition ? `Ý nghĩa: ${content.definition}` : 'Câu ghép từ';
      correctText = content.term || 'Không rõ đáp án';
      userText = typeof userAns === 'string' && userAns.trim() !== '' ? userAns : 'Bỏ qua';
      bookmarkPayload = {
        isSmartTarget: true,
        display: content.term || questionText,
        save: correctText,
        analysis: explanation
      };
    } else if (type.includes('odd_one_out')) {
      questionText = Array.isArray(content.words)
        ? content.words.join(' • ')
        : content.words || 'Nhóm từ khác loại';
      correctText = content.oddWord || content.definition || 'Không rõ đáp án';
      userText = typeof userAns === 'string' && userAns.trim() !== '' ? userAns : 'Bỏ qua';
      bookmarkPayload = {
        isSmartTarget: true,
        display: questionText,
        save: correctText,
        analysis: explanation
      };
    }

    return {
      questionText,
      correctText,
      userText,
      explanation,
      bookmarkPayload,
      isCorrect,
      content
    };
  };

  const checkIsBookmarked = (payload) => {
    if (!notebook || !Array.isArray(notebook) || !payload) return false;
    const target = payload.save || payload.display;
    return notebook.some((n) => n.term === target || (n.term && n.term.includes(target)));
  };

  const handleExportClick = () => {
    if (onExportExcel) {
      onExportExcel();
    } else if (typeof window !== 'undefined' && window.globalShowToast) {
      window.globalShowToast(
        'Vui lòng đợi cập nhật Tầng 5.15 để nối cáp chức năng này!',
        'warning'
      );
    }
  };

  const handlePrintViaIframe = () => {
    if (isPrinting) return;
    setIsPrinting(true);
    if (typeof window !== 'undefined' && window.globalShowToast) {
      window.globalShowToast('Đang chuẩn bị trang in (Phân trang tự động)...', 'info');
    }

    const listNode = document.getElementById('printable-review-list');
    if (!listNode) {
      setIsPrinting(false);
      return;
    }

    // Lấy HTML thô của danh sách câu hỏi
    const contentHtml = listNode.innerHTML;

    // Tạo Iframe tàng hình
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const titleStr = 'BÁO CÁO CHI TIẾT BÀI THI';
    const subtitleStr = `Tổng số câu: ${examState.answers?.length || 0} câu`;

    // Xây dựng Document độc lập cho Iframe
    // [VÁ LỖI SCRIPT TAG TRAP] Sử dụng <\/script> thay vì thẻ đóng bình thường
    const iframeHtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>${titleStr}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
body { background-color: white; padding: 20mm; font-family: sans-serif; -webkit-print-color-adjust: exact; color-adjust: exact; }
.print-header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
.print-title { font-size: 28px; font-weight: 900; color: #111827; }
.print-subtitle { font-size: 14px; color: #6b7280; margin-top: 8px; }
/* Ghi đè các class chống in */
.print\\:hidden { display: none !important; }
/* Vô hiệu hóa hover/transitions */
* { transition: none !important; }
/* Ép viền và màu nền tĩnh cho các khối */
.shadow-sm, .shadow-md { box-shadow: none !important; border: 1px solid #d1d5db !important; }
/* Quy tắc ngắt trang thép */
@media print {
.print-item-wrapper { page-break-inside: avoid; break-inside: avoid; display: block; margin-bottom: 1.5rem; }
}
</style>
</head>
<body>
<div class="print-header">
<div class="print-title">${titleStr}</div>
<div class="print-subtitle">${subtitleStr}</div>
</div>
<div class="print-content">
${contentHtml}
</div>
<script>
// Đợi Tailwind tải CDN xong rồi mới in
window.onload = function() {
setTimeout(function() {
window.print();
}, 800);
};
<\/script>
</body>
</html>
`;

    doc.open();
    doc.write(iframeHtml);
    doc.close();

    // Dọn dẹp Iframe sau khi hộp thoại in đóng lại (Dự phòng 15s)
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      setIsPrinting(false);
    }, 15000);
  };

  const answersList = examState.answers || [];

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-gray-50/95 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300">
      <div className="w-full h-full max-w-4xl bg-white shadow-2xl flex flex-col relative md:rounded-2xl md:h-[90vh] md:my-6 overflow-hidden border border-gray-200">
        {/* Header Topside */}
        <div
          className={`w-full p-3 sm:p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0 z-10 shadow-sm`}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-${mainColor}-100 text-${mainColor}-600 flex items-center justify-center font-black shrink-0`}
            >
              <Icons.BookOpen size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className={`font-bold text-sm sm:text-lg text-${mainColor}-800 leading-tight`}>
                Chi tiết Bài thi
              </h2>
              <p className="text-[9px] sm:text-xs font-bold text-gray-500">
                Xem lại {answersList.length} câu
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={handleExportClick}
              className="px-2 py-1.5 sm:px-4 sm:py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors shadow-sm flex items-center gap-1.5 sm:gap-2 active:scale-95"
              title="Xuất ra Excel"
            >
              <Icons.Download size={16} />{' '}
              <span className="hidden sm:inline text-xs sm:text-sm">Xuất Excel</span>
            </button>
            <button
              type="button"
              onClick={handlePrintViaIframe}
              disabled={isPrinting}
              className={`px-2 py-1.5 sm:px-4 sm:py-2 bg-gray-800 text-white rounded-lg font-bold shadow-sm flex items-center gap-1.5 sm:gap-2 active:scale-95 transition-colors ${
                isPrinting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-900'
              }`}
              title="In báo cáo (PDF tự động phân trang)"
            >
              {isPrinting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <PrinterIcon size={16} />
              )}
              <span className="hidden sm:inline text-xs sm:text-sm">
                {isPrinting ? 'Đang tạo...' : 'In PDF'}
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 ml-1 sm:ml-2 bg-white text-gray-500 rounded-full shadow-sm border border-gray-200 hover:text-red-500 hover:bg-red-50 transition-colors active:scale-95"
            >
              <Icons.X size={20} className="sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Danh sách Câu hỏi Cuộn */}
        <div
          id="printable-review-list"
          className="flex-1 w-full overflow-y-auto custom-scrollbar p-4 md:p-6 bg-gray-50/50 space-y-4 md:space-y-6"
        >
          {answersList.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4 print:hidden">
              <Icons.Layers size={48} className="opacity-20" />
              <p className="font-bold">Chưa có dữ liệu câu trả lời nào được ghi nhận.</p>
            </div>
          ) : (
            answersList.map((ans, idx) => {
              const {
                questionText,
                correctText,
                userText,
                explanation,
                bookmarkPayload,
                isCorrect,
                content
              } = parseQuestionData(ans);
              const isBookmarked = checkIsBookmarked(bookmarkPayload);

              // [CHIẾN DỊCH SKELETON SAVE] Điều kiện kích hoạt Render Phân mảnh (Compact Row UI)
              const isCompact =
                isCorrect &&
                (!explanation || explanation.trim() === '') &&
                !content?.audioScript &&
                !content?.passage;

              if (isCompact) {
                return (
                  <div
                    key={idx}
                    className="print-item-wrapper w-full bg-white rounded-xl shadow-sm border border-green-200 p-3 sm:px-5 sm:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-green-300 transition-colors"
                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                  >
                    <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden flex-1">
                      <span className="font-black text-green-600/70 text-xs sm:text-sm shrink-0 w-12 sm:w-16 flex items-center gap-1">
                        <Icons.CheckCircle size={14} className="hidden sm:block print:hidden" /> C.
                        {ans.index !== undefined ? ans.index + 1 : idx + 1}
                      </span>
                      <span
                        className="text-gray-700 font-bold text-sm sm:text-base truncate flex-1 print:whitespace-normal"
                        title={questionText}
                      >
                        {questionText}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto justify-between sm:justify-start border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                      <span
                        className="text-green-600 font-bold text-sm truncate max-w-[200px] sm:max-w-[250px] px-2 py-1 bg-green-50 rounded border border-green-100 print:whitespace-normal"
                        title={correctText}
                      >
                        ➔ {correctText}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (bookmarkPayload && onBookmark) onBookmark(bookmarkPayload);
                        }}
                        className={`print:hidden p-1.5 rounded-lg transition-colors ${
                          isBookmarked
                            ? 'text-yellow-500 bg-yellow-50'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-800'
                        }`}
                        title={isBookmarked ? 'Đã lưu' : 'Lưu vào Sổ tay'}
                      >
                        <Icons.Bookmark
                          size={16}
                          fill={isBookmarked ? 'currentColor' : 'none'}
                        />
                      </button>
                    </div>
                  </div>
                );
              }

              // Nếu không thỏa mãn Compact, render Full Card UI
              return (
                <div
                  key={idx}
                  className={`print-item-wrapper w-full bg-white rounded-2xl shadow-sm border-2 transition-all ${
                    isCorrect
                      ? 'border-green-100 hover:border-green-300'
                      : 'border-red-100 hover:border-red-300'
                  } overflow-hidden flex flex-col`}
                  style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '1.5rem' }}
                >
                  <div
                    className={`w-full px-4 py-2 border-b flex justify-between items-center ${
                      isCorrect ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
                    }`}
                  >
                    <span className="font-black text-gray-700 text-sm">
                      Câu {ans.index !== undefined ? ans.index + 1 : idx + 1}
                    </span>
                    {isCorrect ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-green-600 uppercase tracking-wider bg-white px-2 py-1 rounded-full shadow-sm border border-green-200">
                        <Icons.CheckCircle size={14} className="print:hidden" /> Chính xác
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-600 uppercase tracking-wider bg-white px-2 py-1 rounded-full shadow-sm border border-red-200">
                        <Icons.X size={14} className="print:hidden" /> Chưa đúng
                      </span>
                    )}
                  </div>
                  <div className="p-4 md:p-6 flex flex-col gap-4">
                    <div className="text-base md:text-lg font-bold text-gray-800 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
                      {questionText}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1 p-3 rounded-xl border border-gray-100 bg-white">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Đáp án của bạn
                        </span>
                        <span
                          className={`text-base font-bold ${
                            isCorrect ? 'text-green-600' : 'text-red-500'
                          }`}
                        >
                          {userText}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 p-3 rounded-xl border border-green-200 bg-green-50 shadow-inner">
                        <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">
                          Đáp án đúng
                        </span>
                        <span className="text-base font-bold text-green-800">{correctText}</span>
                      </div>
                    </div>
                    {content?.audioScript && (
                      <div className="mt-2 bg-purple-50 p-4 rounded-xl border border-purple-100 text-left animate-in slide-in-from-bottom-2">
                        <span className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Icons.Headphones size={14} className="print:hidden" /> Transcript (Kịch
                          bản Nghe)
                        </span>
                        <p className="text-purple-900 text-sm leading-relaxed font-medium whitespace-pre-wrap">
                          {content.audioScript}
                        </p>
                      </div>
                    )}
                    {content?.passage && (
                      <div className="mt-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-left animate-in slide-in-from-bottom-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Icons.BookOpen size={14} className="print:hidden" /> Đoạn văn tham chiếu
                          (Passage)
                        </span>
                        <div className="text-slate-700 text-sm leading-relaxed font-serif max-h-32 overflow-y-auto custom-scrollbar pr-2 whitespace-pre-wrap print:max-h-none print:overflow-visible">
                          {content.passage}
                        </div>
                      </div>
                    )}
                    {explanation && explanation.trim() !== '' && (
                      <div className="mt-2 bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-left">
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Icons.Sparkles size={14} className="print:hidden" /> Phân tích chi tiết
                        </span>
                        <p className="text-blue-900 text-sm leading-relaxed font-medium whitespace-pre-wrap">
                          {explanation}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="w-full p-3 border-t bg-gray-50 flex justify-end print:hidden">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (bookmarkPayload && onBookmark) {
                          onBookmark(bookmarkPayload);
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm ${
                        isBookmarked
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 hover:text-gray-800'
                      }`}
                    >
                      <Icons.Bookmark
                        size={16}
                        fill={isBookmarked ? 'currentColor' : 'none'}
                      />
                      {isBookmarked ? 'Đã lưu trong Sổ tay' : 'Lưu vào Sổ tay'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
          <div className="w-full h-8 shrink-0 print:hidden"></div>
        </div>
      </div>
    </div>
  );
};

if (typeof window !== 'undefined') {
  window.Block5_16_ExamReviewModal = ExamReviewModal;
  window.ExamReviewModal = ExamReviewModal;
}

export default ExamReviewModal;