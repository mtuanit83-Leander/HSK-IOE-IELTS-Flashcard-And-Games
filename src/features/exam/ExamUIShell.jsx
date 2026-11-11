/**
 * @file src/features/exam/ExamUIShell.jsx
 * @description Khung phòng thi tổng hợp (Exam UI Shell). Render động các loại câu hỏi dựa trên metadata.type (Atomic Renderers).
 * @origin Tầng 5 - Block 5.14 (Exam UI Shell)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '@/components/common/Icons';
import { Utils } from '@/utils/helpers';

// ============================================================================
// ATOMIC RENDERER 1: MULTIPLE CHOICE QUESTION (Trắc nghiệm, Đoán hình, Ngữ âm, Nghe, Đọc hiểu)
// ============================================================================
const RenderMCQ = ({ content, metadata, answer, onAnswer, onSpeak, isReview = false, fontFamily }) => {
  const isImageQuiz = metadata.type.includes('image_quiz');
  const isListening = metadata.type.includes('listening');
  const isReading = metadata.type.includes('reading');
  const isPronunciation = metadata.type.includes('pronunciation');

  // Xử lý text câu hỏi
  let questionText = content.term || content.questionText || "Câu hỏi bị lỗi";
  if (isReading && content.passage && !content.term) questionText = "Đọc kỹ đoạn văn bên dưới (Không có câu hỏi con)";

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      {/* KHU VỰC CÂU HỎI */}
      <div className={`p-4 md:p-6 bg-blue-50/50 border border-blue-100 rounded-2xl mb-4 ${isReading ? 'flex-1 overflow-y-auto custom-scrollbar' : ''}`}>
        
        {/* Nhãn đặc thù cho từng loại */}
        {isListening && (
          <div className="flex flex-col items-center mb-4">
            <button
              type="button"
              onClick={() => onSpeak && onSpeak(content.audioScript)}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
              title="Nghe đoạn băng"
            >
              <Icons.Volume2 size={32} />
            </button>
            <span className="text-[10px] font-bold text-gray-400 mt-2 uppercase">Nghe đoạn băng</span>
          </div>
        )}
        
        {isPronunciation && (
           <div className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-2 flex items-center gap-1 justify-center">
             <Icons.Mic size={14} /> Chọn từ có phát âm khác
           </div>
        )}

        {/* Nội dung câu hỏi chính */}
        {isReading && content.passage && (
          <div className="text-sm md:text-base text-gray-700 leading-relaxed mb-4 whitespace-pre-wrap font-medium p-4 bg-white rounded-xl shadow-inner border border-gray-100">
            {content.passage}
          </div>
        )}

        <div style={{ fontFamily }} className={`text-lg md:text-2xl font-black text-gray-800 text-center leading-snug break-words ${isImageQuiz ? 'mb-2' : ''}`}>
          {questionText}
        </div>
        
        {onSpeak && !isListening && (
          <div className="flex justify-center mt-3">
            <button onClick={() => onSpeak(questionText)} className="p-2 rounded-full bg-white text-blue-500 shadow-sm border border-gray-200 hover:bg-blue-50 transition-colors">
              <Icons.Volume2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* KHU VỰC ĐÁP ÁN */}
      <div className={`grid gap-3 shrink-0 ${isImageQuiz ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {(content.options || []).map((opt, idx) => {
          const isSelected = answer?.text === opt.text;
          const isCorrect = isReview && (opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true');
          
          let btnClass = "bg-white border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-300";
          if (isReview) {
             if (isCorrect) btnClass = "bg-green-500 border-green-600 text-white shadow-md z-10";
             else if (isSelected && !isCorrect) btnClass = "bg-red-500 border-red-600 text-white shadow-md";
             else btnClass = "bg-gray-50 border-gray-200 text-gray-400 opacity-60";
          } else if (isSelected) {
             btnClass = "bg-blue-100 border-blue-500 text-blue-800 ring-2 ring-blue-200";
          }

          if (isImageQuiz) {
            return (
              <button
                key={idx}
                disabled={isReview}
                onClick={() => onAnswer(opt)}
                className={`relative aspect-square p-2 sm:p-3 rounded-2xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 group overflow-hidden ${btnClass}`}
              >
                <div className="w-full h-full relative rounded-xl overflow-hidden bg-white flex items-center justify-center">
                   {opt.image ? (
                     <img src={opt.image} alt={opt.text} className={`w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 ${isReview && !isCorrect && !isSelected ? 'grayscale opacity-50' : ''}`} onError={(e) => { e.target.style.display = 'none'; }} />
                   ) : <Icons.Image size={32} className="opacity-20" />}
                </div>
                <div className={`absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-sm p-1.5 sm:p-2 border-t border-gray-100 text-center transition-transform duration-300 ${isReview || isSelected ? 'translate-y-0' : 'translate-y-full group-hover:translate-y-0'}`}>
                    <span style={{ fontFamily: (isReview && isCorrect) || !opt.text.match(/[\u4e00-\u9fa5]/) ? 'inherit' : fontFamily }} className={`text-xs sm:text-sm font-bold truncate block px-1 ${isReview && isCorrect ? 'text-green-700' : 'text-gray-700'}`}>
                        {opt.text}
                    </span>
                </div>
                {isReview && isCorrect && <div className="absolute top-2 right-2 bg-white rounded-full shadow-sm z-10 p-0.5"><Icons.CheckCircle size={20} className="text-green-600"/></div>}
                {isReview && isSelected && !isCorrect && <div className="absolute top-2 right-2 bg-white rounded-full shadow-sm z-10 p-0.5"><Icons.X size={20} className="text-red-600"/></div>}
              </button>
            );
          }

          return (
            <button
              key={idx}
              disabled={isReview}
              onClick={() => onAnswer(opt)}
              style={{ fontFamily: (isReview && isCorrect) || !opt.text.match(/[\u4e00-\u9fa5]/) ? 'inherit' : fontFamily }}
              className={`relative min-h-[64px] p-3 pl-12 rounded-xl border-2 font-bold text-sm sm:text-base text-left flex items-center transition-all active:scale-95 break-words ${btnClass}`}
            >
              <span className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[10px] font-black rounded border border-current opacity-60">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="pr-6 w-full">{opt.text}</span>
              {isReview && isCorrect && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Icons.CheckCircle size={20} className="text-white"/></span>}
              {isReview && isSelected && !isCorrect && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Icons.X size={20} className="text-white"/></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// ATOMIC RENDERER 2: FILL IN THE BLANK (Điền từ khuyết)
// ============================================================================
const RenderFillBlank = ({ content, answer, onAnswer, onSpeak, isReview = false, fontFamily }) => {
  const displaySentence = content.displaySentence || "";
  const options = content.options || [];

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="flex-1 p-5 rounded-2xl bg-teal-50/50 border border-teal-100 flex flex-col items-center justify-center relative text-center mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-teal-500 mb-4 absolute top-3">
          Chọn từ điền vào chỗ trống
        </div>
        
        <div style={{ fontFamily }} className="text-xl sm:text-3xl font-black text-gray-800 leading-snug break-words mt-4">
          {isReview
            ? <span dangerouslySetInnerHTML={{ __html: displaySentence.replace(/\[__________\]/g, `<span class="text-${answer?.isCorrect || answer === content.targetWord ? 'green' : 'red'}-600 underline decoration-4 px-1">${answer?.text || answer || '___'}</span>`) }} />
            : <span dangerouslySetInnerHTML={{ __html: displaySentence.replace(/\[__________\]/g, answer ? `<span class="text-teal-600 underline decoration-2 px-1">${answer.text || answer}</span>` : '<span class="inline-block w-20 border-b-4 border-gray-300 align-bottom mx-1"></span>') }} />
          }
        </div>
        
        {content.hint && (
          <div className="mt-6 text-sm font-bold text-gray-500 bg-white/70 px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
            💡 {content.hint}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
        {options.map((opt, idx) => {
          const isSelected = answer?.text === opt.text || answer === opt.text;
          const isCorrect = isReview && (opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true' || opt.text === content.targetWord);
          
          let btnClass = "bg-white border-gray-200 text-gray-700 hover:bg-teal-50 hover:border-teal-300";
          if (isReview) {
             if (isCorrect) btnClass = "bg-green-500 border-green-600 text-white shadow-md z-10";
             else if (isSelected && !isCorrect) btnClass = "bg-red-500 border-red-600 text-white shadow-md";
             else btnClass = "bg-gray-50 border-gray-200 text-gray-400 opacity-60";
          } else if (isSelected) {
             btnClass = "bg-teal-100 border-teal-500 text-teal-800 ring-2 ring-teal-200";
          }

          return (
            <button
              key={idx}
              disabled={isReview}
              onClick={() => onAnswer(opt)}
              style={{ fontFamily: (isReview && isCorrect) || !opt.text.match(/[\u4e00-\u9fa5]/) ? 'inherit' : fontFamily }}
              className={`relative min-h-[64px] p-3 rounded-xl border-2 font-bold text-sm sm:text-base text-center flex items-center justify-center transition-all active:scale-95 break-words ${btnClass}`}
            >
              <span className="px-6">{opt.text}</span>
              {isReview && isCorrect && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Icons.CheckCircle size={20} className="text-white"/></span>}
              {isReview && isSelected && !isCorrect && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Icons.X size={20} className="text-white"/></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// ATOMIC RENDERER 3: SPOT MISTAKE (Tìm lỗi sai)
// ============================================================================
const RenderSpotMistake = ({ content, answer, onAnswer, onSpeak, isReview = false, fontFamily, lang }) => {
  const sentence = content.wrongSentence || "";
  
  // Băm câu thành các nút bấm
  const words = React.useMemo(() => {
    if (!sentence) return [];
    if (lang === 'zh') {
      return Array.from(sentence).map((char, idx) => ({ id: idx, display: char, original: char })).filter(i => i.original.trim() !== '');
    } else {
      return sentence.split(' ').map((word, idx) => ({ id: idx, display: word, original: word })).filter(i => i.original.trim() !== '');
    }
  }, [sentence, lang]);

  const targetWrongWord = content.wrongWord || '';

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="flex-1 p-5 rounded-2xl bg-orange-50/50 border border-orange-100 flex flex-col items-center justify-center relative text-center mb-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-orange-500 mb-6 absolute top-3">
          Chọn một từ bị sai trong câu
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-4 max-w-2xl mx-auto">
          {words.map((word) => {
            const isSelected = answer?.id === word.id || answer?.original === word.original;
            const isActuallyWrong = targetWrongWord && word.original.toLowerCase().includes(targetWrongWord.toLowerCase());
            
            let wordStyle = "bg-white text-gray-800 border-gray-200 hover:bg-gray-100 shadow-sm";
            if (isReview) {
              if (isActuallyWrong) {
                wordStyle = 'bg-green-500 text-white border-green-600 shadow-md scale-110 z-10';
              } else if (isSelected) {
                wordStyle = 'bg-red-500 text-white border-red-600 shadow-md animate-shake z-10';
              } else {
                wordStyle = 'bg-gray-50 text-gray-400 border-gray-200 opacity-50';
              }
            } else if (isSelected) {
              wordStyle = "bg-orange-100 border-orange-500 text-orange-800 ring-2 ring-orange-200 scale-105";
            }

            return (
              <button
                key={word.id}
                disabled={isReview}
                onClick={() => onAnswer(word)}
                style={{ fontFamily }}
                className={`px-3 py-2 sm:px-4 sm:py-3 rounded-lg border-2 text-xl sm:text-2xl font-bold transition-all active:scale-95 ${wordStyle}`}
              >
                {word.display}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Trong Exam Mode, không hiển thị options thay thế mà chỉ click chọn từ */}
      {!isReview && !answer && (
        <div className="h-[60px] flex items-center justify-center text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 rounded-xl border border-dashed border-gray-200 select-none shrink-0">
          Chạm vào từ sai để chọn
        </div>
      )}
      {!isReview && answer && (
        <div className="h-[60px] flex items-center justify-between px-6 bg-orange-100 rounded-xl border border-orange-200 shrink-0">
          <span className="font-bold text-orange-800 text-sm">Đã chọn: {answer.display}</span>
          <button onClick={() => onAnswer(null)} className="text-xs font-bold text-orange-600 hover:text-red-500">Đổi ý</button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ATOMIC RENDERER 4: ODD ONE OUT (Từ khác loại)
// ============================================================================
const RenderOddOneOut = ({ content, answer, onAnswer, onSpeak, isReview = false, fontFamily }) => {
  const wordsList = Array.isArray(content.words) ? content.words : [];
  
  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="shrink-0 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex flex-col items-center justify-center text-center mb-4">
        <div className="text-[11px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-1.5">
          <Icons.Eye size={16} /> Chọn từ không cùng nhóm
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 flex-1 content-center">
        {wordsList.map((wordStr, idx) => {
          const isCorrect = wordStr === content.oddWord;
          const isSelected = answer === wordStr || answer?.text === wordStr;
          
          let btnStyle = "bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50";
          if (isReview) {
             if (isCorrect) btnStyle = "bg-green-500 border-green-600 text-white shadow-md z-10 scale-[1.02]";
             else if (isSelected && !isCorrect) btnStyle = "bg-red-500 border-red-600 text-white shadow-md animate-shake";
             else btnStyle = "bg-gray-50 border-gray-200 text-gray-400 opacity-60 scale-95";
          } else if (isSelected) {
             btnStyle = "bg-indigo-100 border-indigo-500 text-indigo-800 ring-2 ring-indigo-200";
          }

          return (
            <button
              key={idx}
              disabled={isReview}
              onClick={() => onAnswer(wordStr)}
              style={{ fontFamily: (isReview && isCorrect) || !wordStr.match(/[\u4e00-\u9fa5]/) ? 'inherit' : fontFamily }}
              className={`relative min-h-[80px] p-4 rounded-xl border-2 font-bold text-lg sm:text-xl text-center flex items-center justify-center transition-all active:scale-95 break-words ${btnStyle}`}
            >
              <span className="px-6">{wordStr}</span>
              {isReview && isCorrect && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Icons.CheckCircle size={24} className="text-white"/></span>}
              {isReview && isSelected && !isCorrect && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Icons.X size={24} className="text-white"/></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// ATOMIC RENDERER 5: SCRAMBLE (Ghép câu / Từ)
// ============================================================================
const RenderScramble = ({ content, answer, onAnswer, onSpeak, isReview = false, fontFamily }) => {
  // Lấy danh sách mảnh ghép (Đảm bảo có id duy nhất)
  const poolTokens = React.useMemo(() => {
    return (content.parts || []).map((t, idx) => ({ id: `pt_${idx}`, text: t }));
  }, [content.parts]);
  
  // Trạng thái cục bộ cho mảnh ghép đang chọn
  const [selectedTokens, setSelectedTokens] = useState([]);
  
  useEffect(() => {
    if (answer && Array.isArray(answer)) {
      setSelectedTokens(answer);
    } else if (answer && typeof answer === 'string') {
      // Trường hợp gõ text (Nếu có hỗ trợ type mode trong Exam)
    }
  }, [answer]);

  const handleSelectPoolToken = (token) => {
    if (isReview) return;
    const newTokens = [...selectedTokens, token];
    setSelectedTokens(newTokens);
    onAnswer(newTokens); // Đẩy lên Shell
  };

  const handleRemoveSelectedToken = (indexToRemove) => {
    if (isReview) return;
    const newTokens = selectedTokens.filter((_, idx) => idx !== indexToRemove);
    setSelectedTokens(newTokens);
    onAnswer(newTokens.length > 0 ? newTokens : null);
  };

  if (isReview) {
    const isCorrect = answer && Array.isArray(answer) && answer.map(t => t.text).join('') === (content.term || content.origin?.term).replace(/\s/g, '');
    // Logic review đơn giản cho Scramble
    return (
      <div className="flex flex-col h-full animate-in fade-in items-center justify-center space-y-4">
        <div className={`w-full p-4 rounded-2xl border-2 text-center ${isCorrect ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800'}`}>
          <div className="text-xs font-bold uppercase mb-2 opacity-70">Đáp án của bạn:</div>
          <div style={{ fontFamily }} className="text-xl font-black">
            {Array.isArray(answer) ? answer.map(t => t.text).join(' ') : (answer || "Bỏ qua")}
          </div>
        </div>
        {!isCorrect && (
          <div className="w-full p-4 rounded-2xl border-2 border-blue-200 bg-blue-50 text-blue-800 text-center">
            <div className="text-xs font-bold uppercase mb-2 opacity-70">Đáp án chuẩn:</div>
            <div style={{ fontFamily }} className="text-xl font-black">
              {content.term || content.origin?.term}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-100 text-center mb-4 shrink-0">
        <div className="text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1">
          Nghĩa câu / từ mục tiêu
        </div>
        <div className="text-base sm:text-lg font-black text-gray-800 leading-snug break-words">
          {content.definition || content.origin?.definition || "Lắp ráp các mảnh vỡ"}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-6">
        <div className={`min-h-[100px] p-4 rounded-2xl border-2 border-dashed flex flex-wrap items-center justify-center gap-2 transition-all ${selectedTokens.length > 0 ? 'bg-white border-purple-300' : 'bg-gray-50/80 border-gray-300'}`}>
          {selectedTokens.length === 0 ? (
            <span className="text-xs font-bold text-gray-400 italic select-none">
              Chạm vào các mảnh từ bên dưới...
            </span>
          ) : (
            selectedTokens.map((tok, idx) => (
              <button
                key={tok.id + idx}
                onClick={() => handleRemoveSelectedToken(idx)}
                style={{ fontFamily }}
                className="px-3.5 py-2 rounded-xl font-bold text-base shadow-sm border border-purple-300 bg-purple-50 text-purple-800 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                {tok.text}
              </button>
            ))
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Kho mảnh ghép
            </span>
            {selectedTokens.length > 0 && (
              <button onClick={() => { setSelectedTokens([]); onAnswer(null); }} className="text-xs font-bold text-gray-400 hover:text-red-500">
                Làm lại
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 p-2">
            {poolTokens.map((tok) => {
              const isUsed = selectedTokens.some((s) => s.id === tok.id);
              return (
                <button
                  key={tok.id}
                  disabled={isUsed}
                  onClick={() => handleSelectPoolToken(tok)}
                  style={{ fontFamily }}
                  className={`px-3.5 py-2 rounded-xl font-bold text-base border-2 transition-all ${
                    isUsed
                      ? 'bg-gray-100 text-transparent border-gray-200 pointer-events-none scale-95'
                      : 'bg-white text-gray-800 border-gray-200 shadow-sm hover:border-blue-400 hover:bg-blue-50/40 active:scale-95'
                  }`}
                >
                  {tok.text}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// MAIN COMPONENT: EXAM UI SHELL
// ============================================================================
export const ExamUIShell = ({
  question,         // Dữ liệu câu hỏi từ QueueEngine
  currentIndex,     // Vị trí hiện tại
  totalQuestions,   // Tổng số câu
  timeLeft,         // Thời gian còn lại
  onAnswerSubmit,   // Hàm nộp bài (gọi khi bấm nút Tiếp theo)
  onSpeak,          // Hàm đọc âm thanh
  isReviewMode = false, // Cờ xem lại bài
  userAnswer = null,    // Đáp án của User (trong lúc thi hoặc lúc xem lại)
  isCorrect = null,     // Đúng/Sai (Lúc xem lại)
  fontFamily = 'inherit',
  lang = 'en'
}) => {
  // State quản lý đáp án được chọn hiện tại (chưa Submit)
  const [currentAnswer, setCurrentAnswer] = useState(null);

  // Sync answer state when question changes or in review mode
  useEffect(() => {
    setCurrentAnswer(userAnswer);
  }, [question, userAnswer]);

  if (!question || !question.metadata || !question.content) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-2xl border-2 border-gray-200 border-dashed">
        <Icons.AlertCircle size={48} className="text-gray-300 mb-4" />
        <p className="font-bold text-gray-400 uppercase tracking-widest">Lỗi kết xuất câu hỏi</p>
      </div>
    );
  }

  const meta = question.metadata;
  const content = question.content;
  const type = meta.type || 'unknown';

  // Điều phối Atomic Renderer
  const renderQuestionBody = () => {
    if (type.includes('multiple_choice') || type.includes('match') || type.includes('tfng') || type.includes('image_quiz') || type.includes('listening') || type.includes('pronunciation') || type.includes('reading')) {
      return <RenderMCQ content={content} metadata={meta} answer={currentAnswer} onAnswer={setCurrentAnswer} onSpeak={onSpeak} isReview={isReviewMode} fontFamily={fontFamily} lang={lang} />;
    }
    if (type.includes('fill_blank')) {
      return <RenderFillBlank content={content} answer={currentAnswer} onAnswer={setCurrentAnswer} onSpeak={onSpeak} isReview={isReviewMode} fontFamily={fontFamily} lang={lang} />;
    }
    if (type.includes('spot_mistake')) {
      return <RenderSpotMistake content={content} answer={currentAnswer} onAnswer={setCurrentAnswer} onSpeak={onSpeak} isReview={isReviewMode} fontFamily={fontFamily} lang={lang} />;
    }
    if (type.includes('odd_one_out')) {
      return <RenderOddOneOut content={content} answer={currentAnswer} onAnswer={setCurrentAnswer} onSpeak={onSpeak} isReview={isReviewMode} fontFamily={fontFamily} lang={lang} />;
    }
    if (type.includes('scramble')) {
      return <RenderScramble content={content} answer={currentAnswer} onAnswer={setCurrentAnswer} onSpeak={onSpeak} isReview={isReviewMode} fontFamily={fontFamily} lang={lang} />;
    }

    // Fallback Renderer
    return (
      <div className="p-6 text-center text-red-500 font-bold bg-red-50 rounded-xl">
        Không hỗ trợ hiển thị loại câu hỏi: {type}
      </div>
    );
  };

  // Xác định nút bấm Footer
  const canSubmit = currentAnswer !== null && currentAnswer !== undefined;

  const handleSubmit = () => {
    if (isReviewMode || !onAnswerSubmit) return;
    
    // Đánh giá Đúng/Sai cơ bản trước khi đẩy lên Logic
    let isCorrectLocal = false;
    
    if (type.includes('multiple_choice') || type.includes('match') || type.includes('tfng') || type.includes('image_quiz') || type.includes('listening') || type.includes('pronunciation') || type.includes('reading')) {
      isCorrectLocal = currentAnswer.isCorrect === true || String(currentAnswer.isCorrect).toLowerCase() === 'true';
    } else if (type.includes('fill_blank')) {
      isCorrectLocal = currentAnswer.isCorrect === true || String(currentAnswer.isCorrect).toLowerCase() === 'true' || currentAnswer.text === content.targetWord;
    } else if (type.includes('spot_mistake')) {
      const targetWrong = content.wrongWord || '';
      isCorrectLocal = targetWrong && currentAnswer.original && currentAnswer.original.toLowerCase().includes(targetWrong.toLowerCase());
    } else if (type.includes('odd_one_out')) {
      isCorrectLocal = currentAnswer === content.oddWord;
    } else if (type.includes('scramble')) {
      const uText = Array.isArray(currentAnswer) ? currentAnswer.map(t=>t.text).join('') : (currentAnswer || "");
      const cText = (content.term || content.origin?.term || "").replace(/\s/g, '');
      isCorrectLocal = uText.toLowerCase() === cText.toLowerCase();
    }
    
    onAnswerSubmit(currentAnswer, isCorrectLocal);
  };

  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl flex flex-col border border-gray-200 overflow-hidden relative">
      
      {/* 1. TOP HUD (Chỉ hiển thị khi đang thi) */}
      {!isReviewMode && (
        <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-md z-20">
           <div className="flex items-center gap-3">
             <div className="px-2.5 py-1 bg-white/20 rounded font-bold text-xs flex items-center gap-1 backdrop-blur-sm">
                <span>Câu</span>
                <span className="text-blue-300 font-black">{currentIndex + 1}</span>
                <span>/</span>
                <span>{totalQuestions}</span>
             </div>
             
             {/* Badge Cấp độ / Chặng */}
             <div className="hidden sm:block text-[10px] font-bold uppercase tracking-widest opacity-60">
                {meta.chapter || meta.phase || "Mock Test"}
             </div>
           </div>
           
           <div className="flex items-center gap-4">
             {timeLeft !== null && (
               <div className={`px-3 py-1 rounded font-mono font-bold text-sm flex items-center gap-1.5 transition-colors ${timeLeft <= 60 ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-800 text-green-400'}`}>
                 <Icons.Clock size={14} />
                 <span>{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
               </div>
             )}
           </div>
        </div>
      )}

      {/* 2. KHU VỰC CÂU HỎI TRUNG TÂM */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-5 relative bg-gray-50/30">
        
        {/* Banner Review Mode */}
        {isReviewMode && (
          <div className={`mb-4 p-3 rounded-xl border flex items-center gap-3 shadow-sm ${isCorrect ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
             <div className={`p-2 rounded-full ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {isCorrect ? <Icons.CheckCircle size={24} /> : <Icons.X size={24} />}
             </div>
             <div>
                <div className="font-black uppercase tracking-wider text-xs">Kết quả câu hỏi</div>
                <div className="text-sm font-medium opacity-80 mt-0.5">
                  {isCorrect ? "Bạn đã trả lời chính xác!" : "Sai rồi. Hãy xem lại phần giải thích bên dưới."}
                </div>
             </div>
          </div>
        )}

        {/* Gọi Component Render Câu hỏi tương ứng */}
        {renderQuestionBody()}

        {/* Giải thích (Chỉ hiện khi Review Mode) */}
        {isReviewMode && (content.explanation || content.analysis) && (
          <div className="mt-4 p-4 rounded-xl border border-purple-100 bg-purple-50/50 text-gray-700 text-sm whitespace-pre-wrap leading-relaxed shadow-inner">
            <div className="font-black text-purple-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1">
              <Icons.Sparkles size={14} /> Phân tích chuyên sâu
            </div>
            {content.explanation || content.analysis}
          </div>
        )}
      </div>

      {/* 3. FOOTER ĐIỀU KHIỂN */}
      {!isReviewMode && (
        <div className="p-4 bg-white border-t border-gray-100 shrink-0 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
           <button
             onClick={handleSubmit}
             disabled={!canSubmit}
             className={`w-full py-3.5 rounded-xl font-black text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-base ${canSubmit ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-gray-300 cursor-not-allowed'}`}
           >
             {canSubmit ? (
               <>Xác nhận đáp án <Icons.ChevronRight size={20} /></>
             ) : (
               "Chọn đáp án để tiếp tục"
             )}
           </button>
        </div>
      )}

    </div>
  );
};

export default ExamUIShell;