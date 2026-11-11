/**
 * @file src/features/exam/ExamReviewModal.jsx
 * @description Màn hình Xem lại bài thi (Review Mode) & Động cơ xuất bản PDF qua Iframe ẩn.
 * @origin Tầng 5 - Block 5.16 (Exam Review & PDF Export)
 */

import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { ExamUIShell } from './ExamUIShell'; // Tái sử dụng Vỏ phòng thi

export const ExamReviewModal = ({
  isOpen,
  onClose,
  examState,
  mainColor = 'blue'
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPrinting, setIsPrinting] = useState(false);
  
  // Trượt thanh điều hướng khi đổi câu
  const gridRef = useRef(null);
  
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    // Tự động cuộn lưới số câu hỏi đến vị trí đang xem
    if (gridRef.current) {
      const activeBtn = gridRef.current.querySelector(`button[data-index="${currentIndex}"]`);
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentIndex]);

  if (!isOpen || !examState || !examState.answers) return null;

  const { answers, profile, score } = examState;
  const currentAnswerData = answers[currentIndex];
  const totalQuestions = answers.length;

  // ============================================================================
  // ĐỘNG CƠ KẾT XUẤT PDF QUA IFRAME ẨN (HIDDEN IFRAME INJECTOR)
  // ============================================================================
  const handlePrintPDF = () => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      // 1. Khởi tạo Iframe Ẩn
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      // 2. Biên dịch Dữ liệu thành HTML Chuẩn In Ấn
      const dateStr = new Date().toLocaleString('vi-VN');
      const testName = profile?.name || "Bài thi Khảo thí";
      
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>${testName} - Flashcard Lite</title>
          <style>
            @page { margin: 20mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.5; font-size: 12pt; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
            .header h1 { margin: 0 0 5px 0; color: #1e3a8a; font-size: 20pt; text-transform: uppercase; }
            .meta-info { display: flex; justify-content: space-between; font-size: 10pt; color: #666; }
            .summary-box { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-around; font-weight: bold; }
            
            .question-block { page-break-inside: avoid; margin-bottom: 25px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; }
            .q-header { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 10px; font-size: 10pt; color: #64748b; font-weight: bold; }
            .q-content { font-size: 14pt; font-weight: bold; margin-bottom: 15px; color: #0f172a; }
            
            .ans-row { display: flex; margin-bottom: 5px; }
            .ans-label { width: 120px; font-weight: bold; color: #64748b; }
            .ans-val { flex: 1; }
            
            .status-correct { color: #16a34a; font-weight: bold; }
            .status-wrong { color: #dc2626; font-weight: bold; }
            
            .explanation { margin-top: 15px; background-color: #f3f4f6; border-left: 4px solid #8b5cf6; padding: 10px; font-size: 11pt; border-radius: 0 4px 4px 0; }
            .exp-label { font-size: 9pt; text-transform: uppercase; color: #8b5cf6; font-weight: bold; margin-bottom: 5px; }
            
            .footer { margin-top: 50px; text-align: center; font-size: 9pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${testName}</h1>
            <div class="meta-info">
              <span>Hệ thống: Flashcard 3D AI</span>
              <span>Ngày xuất: ${dateStr}</span>
            </div>
          </div>
          
          <div class="summary-box">
            <span>Tổng số câu: ${totalQuestions}</span>
            <span>Số câu đúng: ${answers.filter(a => a.isCorrect).length}</span>
            <span style="color: #2563eb;">Điểm số: ${score}</span>
          </div>

          ${answers.map((ans, idx) => {
            const meta = ans.questionMetadata || {};
            const content = ans.questionContent || {};
            
            // Xử lý text thô
            let qText = content.term || content.displaySentence || content.wrongSentence || (Array.isArray(content.words) ? content.words.join(' • ') : "Câu hỏi");
            let cText = content.targetWord || content.correction || content.oddWord || content.definition || "";
            
            if (meta.type?.includes('multiple_choice') || meta.type?.includes('match') || meta.type?.includes('image')) {
               if (content.options && Array.isArray(content.options)) {
                  const correctOpt = content.options.find(o => o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true');
                  if (correctOpt) cText = correctOpt.text;
               }
            }
            
            let uText = typeof ans.answer === 'object' ? (ans.answer?.text || ans.answer?.display || JSON.stringify(ans.answer)) : String(ans.answer || "Bỏ qua");
            if (meta.type?.includes('scramble') && Array.isArray(ans.answer)) uText = ans.answer.map(t=>t.text).join(' ');

            return `
              <div class="question-block">
                <div class="q-header">
                  <span>Câu ${idx + 1}</span>
                  <span>[${meta.chapter || meta.phase || meta.type || 'Tổng hợp'}]</span>
                </div>
                
                <div class="q-content">${qText.replace(/\[__________\]/g, '___')}</div>
                
                <div class="ans-row">
                  <div class="ans-label">Đáp án của bạn:</div>
                  <div class="ans-val ${ans.isCorrect ? 'status-correct' : 'status-wrong'}">${uText} ${ans.isCorrect ? '✓' : '✗'}</div>
                </div>
                
                ${!ans.isCorrect ? `
                <div class="ans-row">
                  <div class="ans-label">Đáp án chuẩn:</div>
                  <div class="ans-val status-correct">${cText}</div>
                </div>
                ` : ''}
                
                ${(content.explanation || content.analysis || content.hint) ? `
                <div class="explanation">
                  <div class="exp-label">Phân tích / Giải thích</div>
                  ${content.explanation || content.analysis || content.hint}
                </div>
                ` : ''}
              </div>
            `;
          }).join('')}
          
          <div class="footer">
            Tài liệu được kết xuất tự động bởi Động cơ Khảo thí AI - Flashcard Lite
          </div>
        </body>
        </html>
      `;

      // 3. Bơm nội dung vào Iframe
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      // 4. Kích hoạt In ấn sau khi load xong (Debounce nhẹ)
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        
        // Dọn dẹp Iframe sau khi in xong (hoặc khi user đóng hộp thoại in)
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsPrinting(false);
        }, 1000);
      }, 800);

    } catch (e) {
      console.error("PDF Print Error:", e);
      setIsPrinting(false);
      if (window.globalShowToast) window.globalShowToast("Lỗi khi tạo tài liệu PDF!", "error");
    }
  };

  // ============================================================================
  // ĐIỀU HƯỚNG CÂU HỎI (NAVIGATION)
  // ============================================================================
  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full h-full max-w-6xl flex flex-col overflow-hidden border border-gray-200 relative">
        
        {/* HEADER */}
        <div className={`p-4 border-b bg-${mainColor}-50 flex justify-between items-center shrink-0`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl bg-white text-${mainColor}-600 shadow-sm`}>
              <Icons.Eye size={24} />
            </div>
            <div>
              <h2 className={`font-black text-lg text-${mainColor}-800 leading-tight uppercase tracking-wider`}>
                Xem lại bài làm
              </h2>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Review Mode
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handlePrintPDF}
              disabled={isPrinting}
              className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50"
              title="Xuất File PDF (In ấn)"
            >
              {isPrinting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Icons.Download size={18} />}
              <span className="hidden sm:inline">Xuất PDF</span>
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Icons.X size={24} />
            </button>
          </div>
        </div>
        
        {/* MAIN LAYOUT: CHIA CỘT */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-gray-50/50">
          
          {/* CỘT TRÁI: Bảng điều hướng nhanh (Grid Picker) */}
          <div className="w-full md:w-64 lg:w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
            <div className="p-3 border-b border-gray-100 bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-widest text-center shrink-0">
              Danh sách câu hỏi
            </div>
            
            <div ref={gridRef} className="flex-1 overflow-y-auto custom-scrollbar p-3">
              <div className="grid grid-cols-5 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {answers.map((ans, idx) => {
                  const isActive = idx === currentIndex;
                  const isCorrect = ans.isCorrect;
                  
                  let btnClass = "bg-white border-gray-200 text-gray-600 hover:bg-gray-50";
                  if (isActive) {
                    btnClass = `bg-${mainColor}-600 text-white border-${mainColor}-700 shadow-md scale-110 z-10 font-black ring-2 ring-${mainColor}-200`;
                  } else if (isCorrect) {
                    btnClass = "bg-green-50 border-green-200 text-green-700 font-bold opacity-80 hover:opacity-100";
                  } else {
                    btnClass = "bg-red-50 border-red-200 text-red-700 font-bold opacity-80 hover:opacity-100";
                  }

                  return (
                    <button
                      key={idx}
                      data-index={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`aspect-square rounded-xl border transition-all flex items-center justify-center text-sm ${btnClass}`}
                      title={isCorrect ? `Câu ${idx + 1}: Đúng` : `Câu ${idx + 1}: Sai`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="p-3 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-center gap-4 text-xs font-bold">
               <div className="flex items-center gap-1.5 text-green-600"><div className="w-3 h-3 bg-green-200 rounded"></div> Đúng</div>
               <div className="flex items-center gap-1.5 text-red-600"><div className="w-3 h-3 bg-red-200 rounded"></div> Sai</div>
            </div>
          </div>

          {/* CỘT PHẢI: Nội dung câu hỏi (Sử dụng ExamUIShell) */}
          <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-5 relative">
            <div className="flex-1 rounded-2xl shadow-sm overflow-hidden bg-white border border-gray-200 relative">
               {currentAnswerData ? (
                 <ExamUIShell
                    question={{ 
                      metadata: currentAnswerData.questionMetadata, 
                      content: currentAnswerData.questionContent 
                    }}
                    currentIndex={currentIndex}
                    totalQuestions={totalQuestions}
                    isReviewMode={true}
                    userAnswer={currentAnswerData.answer}
                    isCorrect={currentAnswerData.isCorrect}
                 />
               ) : (
                 <div className="flex items-center justify-center h-full text-gray-400 font-bold">Lỗi truy xuất dữ liệu</div>
               )}
            </div>

            {/* Điều hướng Trái / Phải dưới đáy Shell */}
            <div className="flex justify-between items-center mt-4 shrink-0 px-2">
              <button 
                onClick={handlePrev} 
                disabled={currentIndex === 0}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Icons.ChevronLeft size={18} /> Câu trước
              </button>
              
              <span className="text-sm font-bold text-gray-500 bg-white px-4 py-1.5 rounded-full shadow-sm border border-gray-100">
                {currentIndex + 1} / {totalQuestions}
              </span>
              
              <button 
                onClick={handleNext} 
                disabled={currentIndex === totalQuestions - 1}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Câu sau <Icons.ChevronRight size={18} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ExamReviewModal;