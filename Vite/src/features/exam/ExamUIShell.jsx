/**
 * ============================================================================
 * FILE 72/85: src/features/exam/ExamUIShell.jsx
 * @description Khung giao diện bài thi tổng hợp. Bao gồm Header, Timer,
 *              SplitView và các Renderers nguyên tử.
 * @origin Tầng 5 - Block 5.14 (Exam UI Shell & Renderers - Version 1.07)
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '@/components/common/Icons';
import { Utils } from '@/utils/helpers';
import { ExamReportUI } from './ExamReportUI';

// ============================================================================
// 1. CÁC ATOMIC RENDERERS (GIAO DIỆN TỐI GIẢN CHO TỪNG DẠNG BÀI)
// ============================================================================

const MultipleChoiceRenderer = ({ content, onAnswer }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSelect = (opt) => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onAnswer(opt, opt.isCorrect);
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto animate-in zoom-in duration-300">
      <div className="text-2xl md:text-3xl font-bold text-gray-800 text-center leading-relaxed">
        {content?.term || 'Dữ liệu câu hỏi bị khuyết...'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {content?.options?.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(opt)}
            disabled={isSubmitted}
            className={`p-5 border-2 border-gray-200 rounded-2xl text-lg font-medium transition-all bg-white text-gray-700 shadow-sm ${
              isSubmitted
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:bg-blue-50 hover:border-blue-400 active:scale-95'
            }`}
          >
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
};

// LISTENING RENDERER (Chỉ giao tiếp qua Tầng 6, loại bỏ các hàm gọi trực tiếp WebSpeech API)
const ListeningRenderer = ({ content, onAnswer, onPlay }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const maxPlays = 3;
  const timeoutRef = useRef(null);

  const audioScript = content?.audioScript || '';
  const term = content?.term || 'Lỗi tải dữ liệu câu hỏi';

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handlePlay = () => {
    if (isPlaying || playCount >= maxPlays || !audioScript) return;
    setIsPlaying(true);
    setPlayCount((p) => p + 1);

    let isDone = false;
    const finishPlay = () => {
      if (!isDone) {
        isDone = true;
        setIsPlaying(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    };

    const durationMs = Math.max(10000, audioScript.length * 150);
    timeoutRef.current = setTimeout(() => {
      finishPlay();
    }, durationMs);

    if (onPlay) {
      onPlay(audioScript, 0.9, null, finishPlay);
    } else {
      finishPlay(); // Fallback an toàn nếu không có Tầng 6
    }
  };

  const handleSelect = (opt) => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onAnswer(opt, opt.isCorrect);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto animate-in zoom-in duration-300">
      <div className="text-sm font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-4 py-1.5 rounded-full border border-blue-200 flex items-center gap-2">
        <Icons.Headphones size={16} /> Kỹ năng Nghe
      </div>
      <div className="w-full bg-blue-50/50 border-2 border-blue-100 rounded-3xl p-8 flex flex-col items-center justify-center relative overflow-hidden">
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="w-24 h-24 bg-blue-500 rounded-full animate-ping absolute"></div>
            <div
              className="w-32 h-32 bg-blue-400 rounded-full animate-ping absolute"
              style={{ animationDelay: '0.2s' }}
            ></div>
          </div>
        )}
        <button
          type="button"
          onClick={handlePlay}
          disabled={isPlaying || playCount >= maxPlays || !audioScript}
          className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition-transform ${
            isPlaying
              ? 'bg-blue-400 text-white scale-110'
              : playCount >= maxPlays || !audioScript
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 active:scale-95'
          }`}
        >
          <Icons.Volume2 size={40} className={isPlaying ? 'animate-pulse' : ''} />
        </button>
        <div className="mt-4 text-sm font-bold text-blue-800">
          {!audioScript
            ? 'Lỗi: Không có kịch bản âm thanh'
            : isPlaying
            ? 'Đang phát âm thanh...'
            : playCount >= maxPlays
            ? 'Đã hết lượt nghe'
            : `Bấm để nghe (Lượt: ${playCount}/${maxPlays})`}
        </div>
      </div>
      <div className="text-xl md:text-2xl font-bold text-gray-800 text-center leading-relaxed mt-2">
        {term}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {content?.options?.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(opt)}
            disabled={isSubmitted}
            className={`p-5 border-2 border-gray-200 rounded-2xl text-lg font-medium transition-all bg-white text-gray-700 shadow-sm ${
              isSubmitted
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:bg-blue-50 hover:border-blue-400 active:scale-95'
            }`}
          >
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
};

// Pronunciation Renderer
const PronunciationRenderer = ({ content, onAnswer }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSelect = (opt) => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onAnswer(opt, opt.isCorrect);
  };

  const renderHighlighted = (text) => {
    if (!text) return '';
    const astCount = (text.match(/\*/g) || []).length;
    if (astCount === 2) {
      const parts = text.split('*');
      return (
        <>
          {parts[0]}
          <span className="text-red-500 font-black underline decoration-2 underline-offset-4">
            {parts[1]}
          </span>
          {parts[2]}
        </>
      );
    } else if (astCount === 1) {
      const idx = text.indexOf('*');
      if (idx > 0) {
        const before = text.substring(0, idx - 1);
        const target = text.substring(idx - 1, idx);
        const after = text.substring(idx + 1);
        return (
          <>
            {before}
            <span className="text-red-500 font-black underline decoration-2 underline-offset-4">
              {target}
            </span>
            {after}
          </>
        );
      }
    }
    return text.replace(/\*/g, '');
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto animate-in zoom-in duration-300">
      <div className="text-sm font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-4 py-1.5 rounded-full border border-indigo-200 flex items-center gap-2">
        <Icons.Volume2 size={16} /> Chọn từ có phần phát âm khác
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-2">
        {content?.options?.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(opt)}
            disabled={isSubmitted}
            className={`p-6 border-2 border-gray-200 rounded-2xl text-2xl font-bold transition-all bg-white text-gray-700 shadow-sm tracking-wide ${
              isSubmitted
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:bg-indigo-50 hover:border-indigo-400 active:scale-95'
            }`}
          >
            {renderHighlighted(opt.text)}
          </button>
        ))}
      </div>
    </div>
  );
};

// Image Choice Renderer
const ImageChoiceRenderer = ({ content, onAnswer }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [imageErrors, setImageErrors] = useState({});
  const [imageLoaded, setImageLoaded] = useState({});

  const handleSelect = (opt) => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onAnswer(opt, opt.isCorrect);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto animate-in zoom-in duration-300">
      <div className="text-sm font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-200 flex items-center gap-2">
        <Icons.Eye size={16} /> Chọn hình ảnh tương ứng
      </div>
      <div className="text-3xl md:text-4xl font-black text-gray-800 text-center leading-relaxed py-4 border-b-2 border-gray-100 w-full capitalize">
        {content?.term || 'Dữ liệu bị khuyết'}
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-6 w-full mt-2 max-w-2xl">
        {content?.options?.map((opt, i) => {
          const isError = imageErrors[i];
          const isLoaded = imageLoaded[i];
          const hasImage = opt.image && opt.image.trim() !== '';
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(opt)}
              disabled={isSubmitted}
              className={`relative flex flex-col items-center justify-center p-2 border-4 border-gray-100 rounded-3xl overflow-hidden transition-all bg-white group ${
                isSubmitted
                  ? 'opacity-70 cursor-not-allowed'
                  : 'hover:border-emerald-400 hover:shadow-xl active:scale-95'
              }`}
              style={{ aspectRatio: '1/1', maxHeight: '28vh' }}
            >
              {hasImage && !isError ? (
                <>
                  {!isLoaded && (
                    <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-0">
                      <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
                    </div>
                  )}
                  <img
                    src={opt.image}
                    alt="Option"
                    className={`w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500 z-10 ${
                      isLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setImageLoaded((prev) => ({ ...prev, [i]: true }))}
                    onError={() => setImageErrors((prev) => ({ ...prev, [i]: true }))}
                  />
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold text-lg md:text-xl uppercase bg-gray-50 p-4 text-center break-words z-20">
                  {opt.text}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// MiniMatch Renderer
const MiniMatchRenderer = ({ content, onAnswer }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const safeTerm =
    content?.term ||
    (content?.pairs && content.pairs.length > 0 ? content.pairs[0].term : 'Dữ liệu bị khuyết...');

  const [safeOptions] = useState(() => {
    if (content?.options) return content.options;
    if (content?.pairs) {
      return Utils.shuffleArray(
        content.pairs.map((p) => ({
          text: p.definition,
          isCorrect: p.term === safeTerm
        }))
      );
    }
    return [];
  });

  const handleSelect = (opt) => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    onAnswer(opt, opt.isCorrect);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto animate-in zoom-in duration-300">
      <div className="text-sm font-bold text-purple-500 uppercase tracking-widest bg-purple-50 px-4 py-1.5 rounded-full border border-purple-200 flex items-center gap-2 shadow-sm">
        <Icons.Link size={16} /> Nối với nghĩa đúng
      </div>
      <div className="text-3xl md:text-4xl font-black text-gray-800 text-center leading-relaxed py-4 border-b-2 border-purple-100 w-full">
        {safeTerm}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-2">
        {safeOptions?.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(opt)}
            disabled={isSubmitted}
            className={`p-5 border-2 border-purple-100 rounded-2xl text-lg font-bold transition-all bg-white text-gray-600 shadow-sm ${
              isSubmitted
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 active:scale-95'
            }`}
          >
            {opt.text}
          </button>
        ))}
      </div>
    </div>
  );
};

// FillBlank Renderer
const FillBlankRenderer = ({ content, onAnswer, lang }) => {
  const [val, setVal] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const inputRef = useRef(null);

  const displaySentence = content?.displaySentence || 'Dữ liệu câu hỏi bị khuyết [__________]';
  const targetWord = content?.targetWord || '';

  const handleSubmit = () => {
    if (!val.trim() || isSubmitted) return;
    setIsSubmitted(true);
    if (inputRef.current) inputRef.current.blur();
    const isCorrect =
      Utils.advancedNormalize(val, lang) === Utils.advancedNormalize(targetWord, lang);
    onAnswer(val, isCorrect);
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto animate-in zoom-in duration-300">
      <div className="text-2xl md:text-3xl font-bold text-gray-800 text-center leading-relaxed bg-white p-6 rounded-2xl shadow-sm border border-gray-100 w-full">
        {displaySentence.split('[__________]').map((part, i, arr) => (
          <React.Fragment key={i}>
            {part}
            {i < arr.length - 1 && (
              <span className="inline-block w-24 border-b-4 border-gray-300 mx-2 mb-1"></span>
            )}
          </React.Fragment>
        ))}
      </div>
      {content?.hint && (
        <div className="text-sm md:text-base text-gray-500 italic font-medium">
          &ldquo;{content.hint}&rdquo;
        </div>
      )}
      <div className="flex gap-3 w-full max-w-md">
        <input
          ref={inputRef}
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={isSubmitted}
          className={`flex-1 p-4 text-center text-xl font-bold border-4 rounded-2xl outline-none shadow-inner transition-colors ${
            isSubmitted
              ? 'border-gray-200 bg-gray-50 text-gray-400'
              : 'border-blue-200 focus:border-blue-500 text-gray-800'
          }`}
          placeholder="Nhập từ còn thiếu..."
          autoComplete="off"
          spellCheck="false"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!val.trim() || isSubmitted}
          className="px-6 bg-blue-600 text-white rounded-2xl font-bold shadow-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Icons.Check size={28} />
        </button>
      </div>
    </div>
  );
};

// SpotMistake Renderer
const SpotMistakeRenderer = ({ content, onAnswer, lang }) => {
  const [step, setStep] = useState(1);
  const [selectedWord, setSelectedWord] = useState('');
  const [correction, setCorrection] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const inputRef = useRef(null);

  const wrongSentence = content?.wrongSentence || 'Dữ liệu câu hỏi bị khuyết';
  const wrongWord = content?.wrongWord || '';
  const correctWord = content?.correction || '';
  const isChinese = /[\u4e00-\u9fa5]/.test(wrongSentence);
  const separator = isChinese ? '' : ' ';
  const words = wrongSentence.split(separator).filter((w) => w.trim().length > 0 || isChinese);

  const handleSubmit = () => {
    if (!correction.trim() || isSubmitted) return;
    setIsSubmitted(true);
    if (inputRef.current) inputRef.current.blur();
    const isCorrectWord =
      Utils.advancedNormalize(selectedWord, lang) === Utils.advancedNormalize(wrongWord, lang);
    const isCorrectFix =
      Utils.advancedNormalize(correction, lang) === Utils.advancedNormalize(correctWord, lang);
    onAnswer({ selectedWord, correction }, isCorrectWord && isCorrectFix);
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-3xl mx-auto animate-in zoom-in duration-300">
      <div className="text-sm font-bold text-red-500 uppercase tracking-widest bg-red-50 px-4 py-1.5 rounded-full border border-red-200">
        {step === 1 ? 'Bước 1: Chọn từ bị sai' : 'Bước 2: Gõ lại cho đúng'}
      </div>
      <div className="flex flex-wrap justify-center gap-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        {words.map((w, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setSelectedWord(w);
              setStep(2);
            }}
            disabled={step === 2 || isSubmitted}
            className={`px-4 py-3 text-xl md:text-2xl font-bold rounded-xl border-2 transition-colors ${
              step === 1 && !isSubmitted
                ? 'bg-gray-50 hover:bg-red-50 hover:border-red-300 hover:text-red-600 border-gray-200 text-gray-700'
                : w === selectedWord
                ? 'bg-red-100 border-red-500 text-red-700 shadow-md scale-105'
                : 'bg-gray-100 text-gray-300 border-gray-100 opacity-50'
            }`}
          >
            {w}
          </button>
        ))}
      </div>
      {step === 2 && (
        <div className="flex gap-3 w-full max-w-md animate-in slide-in-from-bottom-4">
          <input
            ref={inputRef}
            type="text"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            disabled={isSubmitted}
            className={`flex-1 p-4 text-center text-xl font-bold border-4 rounded-2xl outline-none shadow-inner transition-colors ${
              isSubmitted
                ? 'border-gray-200 bg-gray-50 text-gray-400'
                : 'border-red-200 focus:border-red-500 text-gray-800'
            }`}
            placeholder={`Sửa "${selectedWord}" thành...`}
            autoComplete="off"
            spellCheck="false"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!correction.trim() || isSubmitted}
            className="px-6 bg-red-600 text-white rounded-2xl font-bold shadow-lg hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-transform"
          >
            <Icons.Check size={28} />
          </button>
        </div>
      )}
    </div>
  );
};

// Scramble Renderer
const ScrambleRenderer = ({ content, onAnswer, lang }) => {
  const term = content?.term || 'Lỗi khuyết dữ liệu';
  const definition = content?.definition || 'Lỗi tải giải nghĩa';

  const [parts, setParts] = useState(() => {
    const isChinese = /[\u4e00-\u9fa5]/.test(term);
    const separator = isChinese ? '' : ' ';
    let words = [];
    if (content && content.parts && content.parts.length > 0) {
      words = content.parts;
    } else {
      words = term.split(separator).filter((w) => w.trim().length > 0 || isChinese);
    }
    return Utils.shuffleArray(words).map((w, i) => ({ id: i, text: w }));
  });
  const [userAnswer, setUserAnswer] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSelect = (part) => {
    if (isSubmitted) return;
    setUserAnswer([...userAnswer, part]);
    setParts(parts.filter((p) => p.id !== part.id));
  };

  const handleDeselect = (part) => {
    if (isSubmitted) return;
    setParts([...parts, part]);
    setUserAnswer(userAnswer.filter((p) => p.id !== part.id));
  };

  const handleSubmit = () => {
    if (userAnswer.length === 0 || isSubmitted) return;
    setIsSubmitted(true);
    const isChinese = /[\u4e00-\u9fa5]/.test(term);
    const separator = isChinese ? '' : ' ';
    const ansStr = userAnswer.map((p) => p.text).join(separator);
    onAnswer(
      ansStr,
      Utils.advancedNormalize(ansStr, lang) === Utils.advancedNormalize(term, lang)
    );
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-3xl mx-auto animate-in zoom-in duration-300">
      <div className="text-lg text-gray-500 font-medium italic text-center px-4 bg-gray-50 p-4 rounded-xl border border-gray-200 w-full">
        {definition}
      </div>
      <div className="min-h-[120px] w-full border-4 border-dashed border-orange-200 rounded-2xl p-4 flex flex-wrap items-center justify-center gap-3 bg-orange-50/30">
        {userAnswer.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleDeselect(p)}
            disabled={isSubmitted}
            className={`px-5 py-3 text-white text-xl font-bold rounded-xl shadow-md transition-transform animate-in zoom-in ${
              isSubmitted
                ? 'bg-orange-300 cursor-not-allowed'
                : 'bg-orange-500 active:scale-95 hover:bg-orange-600'
            }`}
          >
            {p.text}
          </button>
        ))}
        {userAnswer.length === 0 && (
          <span className="text-gray-400 text-lg font-bold mb-3 uppercase tracking-widest opacity-50">
            Khu vực ghép câu
          </span>
        )}
      </div>
      <div className="w-full flex flex-col items-center border-t-2 border-gray-100 pt-6">
        {parts.length > 0 && (
          <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4 text-center w-full flex items-center justify-center gap-1">
            <Icons.Layers size={14} /> Các từ để chọn (Lưu ý: Có thể chứa từ nhiễu)
          </span>
        )}
        <div className="flex flex-wrap justify-center gap-3 min-h-[60px] p-4 bg-gray-50 rounded-2xl w-full border border-gray-100 shadow-inner">
          {parts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              disabled={isSubmitted}
              className={`px-5 py-3 text-gray-700 border-2 text-xl font-bold rounded-xl shadow-sm transition-all ${
                isSubmitted
                  ? 'bg-gray-100 border-gray-100 opacity-50 cursor-not-allowed'
                  : 'bg-white border-gray-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 active:scale-95'
              }`}
            >
              {p.text}
            </button>
          ))}
          {parts.length === 0 && (
            <span className="text-gray-300 text-sm font-medium italic">Đã lấy hết từ</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={userAnswer.length === 0 || isSubmitted}
        className="mt-2 px-10 py-4 bg-green-500 text-white text-xl font-bold rounded-2xl shadow-lg shadow-green-200 hover:bg-green-600 animate-in zoom-in active:scale-95 transition-transform flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Icons.CheckCircle size={24} /> Nộp câu trả lời
      </button>
    </div>
  );
};

// OddOneOut Renderer
const OddOneOutRenderer = ({ content, onAnswer, lang }) => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const oddWord = content?.oddWord || '';

  const handleSelect = (w) => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    const isCorrect =
      Utils.advancedNormalize(w, lang || 'en') ===
      Utils.advancedNormalize(oddWord, lang || 'en');
    onAnswer(w, isCorrect);
  };

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto animate-in zoom-in duration-300">
      <div className="text-sm font-bold text-pink-500 uppercase tracking-widest bg-pink-50 px-4 py-1.5 rounded-full border border-pink-200">
        Chọn từ khác loại
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full">
        {content?.words?.map((w, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelect(w)}
            disabled={isSubmitted}
            className={`p-6 md:p-8 border-2 rounded-2xl text-xl sm:text-2xl font-bold transition-all shadow-sm break-words flex items-center justify-center text-center ${
              isSubmitted
                ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white border-gray-200 hover:bg-pink-50 hover:border-pink-400 hover:text-pink-700 text-gray-700 active:scale-95'
            }`}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 2. SPLIT VIEW CONTAINER (Cho IELTS Reading)
// ============================================================================
const SplitViewContainer = ({ passage, children }) => {
  return (
    <div className="flex flex-col lg:flex-row w-full h-full gap-4 p-4 lg:p-6 bg-gray-50">
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 p-6 overflow-y-auto custom-scrollbar">
        <h2 className="text-xl font-black mb-4 font-serif text-gray-800 border-b pb-2 flex items-center gap-2">
          <Icons.BookOpen size={24} className="text-blue-600" /> Reading Passage
        </h2>
        <div className="text-gray-700 leading-loose text-justify font-serif text-base md:text-lg">
          {passage
            ? passage.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))
            : 'Không có dữ liệu bài đọc.'}
        </div>
      </div>
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-gray-200 p-6 flex flex-col justify-center overflow-y-auto custom-scrollbar relative">
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// 3. EXAM UI SHELL (VỎ BỌC CHÍNH ĐIỀU PHỐI)
// ============================================================================
export const ExamUIShell = ({
  examLogic = {},
  mainColor = 'blue',
  onExit,
  onOpenIncorrect,
  onBookmark,
  notebook,
  onPlay,
  onSpeak,
  lang
}) => {
  const {
    examState = { status: 'idle', blueprint: [], answers: [], currentIndex: 0, timeRemaining: 0 },
    currentQuestion,
    isHydrating,
    submitAnswer,
    quitExam,
    forceSubmitExam,
    setTransitionState,
    cachedCount = 0,
    examCooldown = 0,
    exportExamToExcel
  } = examLogic;

  const effectivePlay = onPlay || onSpeak;
  const handleExitExam = onExit || quitExam;

  const derivedLang =
    lang ||
    (examState.blueprint?.[0]?.level?.startsWith('zh')
      ? 'zh'
      : examState.blueprint?.[0]?.level?.startsWith('vi')
      ? 'vi'
      : 'en');

  // [GIAI ĐOẠN 2 - CHIẾN DỊCH PHÂN CHẶNG] State quản lý màn hình nghỉ 20s & Modal xác nhận nộp bài
  const [chapterOverlay, setChapterOverlay] = useState(null);
  const [phaseIntermission, setPhaseIntermission] = useState(null); // { chapter: '...', countdown: 20 }
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  const prevChapterRef = useRef(null);
  const prevPhaseRef = useRef(null);

  // Lắng nghe sự thay đổi của câu hỏi để bật Màn hình chuyển chặng
  useEffect(() => {
    let initTimerId;
    let overlayTimerId;

    if (currentQuestion && currentQuestion.metadata) {
      const currentChap = currentQuestion.metadata.chapter;
      const currentPhase = currentQuestion.metadata.phase;

      // KÍCH HOẠT MÀN HÌNH NGHỈ 20s (Chỉ khi phase thay đổi và không phải câu đầu tiên)
      if (prevPhaseRef.current !== null && currentPhase !== prevPhaseRef.current) {
        initTimerId = setTimeout(() => {
          setPhaseIntermission({ chapter: currentChap, countdown: 20 });
          if (setTransitionState) setTransitionState(true); // Đóng băng timer chính
        }, 0);
      }
      // NẾU CHỈ LÀ ĐỔI CHAPTER BÌNH THƯỜNG (Chớp 2.5s)
      else if (
        currentChap &&
        currentChap !== prevChapterRef.current &&
        prevPhaseRef.current !== null
      ) {
        initTimerId = setTimeout(() => {
          setChapterOverlay(currentChap);
          if (setTransitionState) setTransitionState(true);
          overlayTimerId = setTimeout(() => {
            setChapterOverlay(null);
            if (setTransitionState) setTransitionState(false);
          }, 2500);
        }, 0);
      }

      prevChapterRef.current = currentChap;
      prevPhaseRef.current = currentPhase;
    }

    return () => {
      if (initTimerId) clearTimeout(initTimerId);
      if (overlayTimerId) clearTimeout(overlayTimerId);
    };
  }, [currentQuestion, setTransitionState]);

  // Động cơ đếm ngược cho Màn hình nghỉ 20s
  useEffect(() => {
    let tId;
    if (phaseIntermission && phaseIntermission.countdown > 0) {
      tId = setTimeout(() => {
        setPhaseIntermission((prev) =>
          prev ? { ...prev, countdown: prev.countdown - 1 } : null
        );
      }, 1000);
    } else if (phaseIntermission && phaseIntermission.countdown === 0) {
      // Hết thời gian nghỉ, mở khóa
      tId = setTimeout(() => {
        setPhaseIntermission(null);
        if (setTransitionState) setTransitionState(false);
      }, 0);
    }
    return () => {
      if (tId) clearTimeout(tId);
    };
  }, [phaseIntermission, setTransitionState]);

  if (examState.status === 'loading') {
    const timeLeft = examState.preloadCountdown !== undefined ? examState.preloadCountdown : 30;
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 z-[999] absolute inset-0 animate-in fade-in duration-300">
        <div className="relative mb-6 flex items-center justify-center">
          <div className={`absolute w-24 h-24 border-4 border-${mainColor}-100 rounded-full`}></div>
          <div
            className={`absolute w-24 h-24 border-4 border-${mainColor}-500 border-t-transparent rounded-full animate-spin`}
          ></div>
          <div
            className={`relative z-10 font-black text-3xl text-${mainColor}-600 drop-shadow-sm`}
          >
            {timeLeft}
          </div>
        </div>
        <h2 className="text-xl font-black text-gray-800 mb-2 tracking-wide uppercase">
          Đang thiết lập đề thi
        </h2>
        <p className={`text-${mainColor}-600 text-sm font-bold animate-pulse mb-6`}>
          Khởi tạo dữ liệu vòng 1...
        </p>
        {/* [NEW v1.06] Bộ giám sát nạp đạn */}
        <div className="px-5 py-2.5 bg-blue-50 border border-blue-200 rounded-full flex items-center gap-2.5 shadow-sm animate-in slide-in-from-bottom-4">
          <Icons.Database size={18} className="text-blue-500 animate-bounce" />
          <span className="text-sm font-black text-blue-700 uppercase tracking-widest">
            Đã nạp sẵn: {cachedCount} câu AI
          </span>
        </div>
      </div>
    );
  }

  if (
    examState.status === 'error' ||
    (examState.status === 'playing' && !currentQuestion && !isHydrating)
  ) {
    const handleSkipError = () => {
      if (submitAnswer) {
        submitAnswer({ error: 'Lỗi hệ thống/mạng' }, false);
      }
    };
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 z-[999] absolute inset-0 animate-in zoom-in p-6 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <Icons.AlertCircle size={40} />
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-2">Gián đoạn nạp dữ liệu!</h2>
        <p className="text-gray-500 mb-8 max-w-sm leading-relaxed">
          Hệ thống không thể kết nối đến Máy chủ AI hoặc Kho lưu trữ để nạp câu hỏi này. Bạn muốn
          xử lý thế nào?
        </p>
        <div className="flex gap-3 w-full max-w-sm">
          <button
            type="button"
            onClick={handleSkipError}
            className={`flex-1 py-3 bg-${mainColor}-100 text-${mainColor}-700 font-bold rounded-xl shadow-sm hover:bg-${mainColor}-200 transition-colors flex items-center justify-center gap-2`}
          >
            <Icons.SkipForward size={18} /> Bỏ qua câu này
          </button>
          <button
            type="button"
            onClick={handleExitExam}
            className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
          >
            <Icons.X size={18} /> Thoát bài thi
          </button>
        </div>
      </div>
    );
  }

  if (examState.status === 'completed') {
    const SafeExamReportUI =
      ExamReportUI ||
      (typeof window !== 'undefined' && (window.Block5_15_ExamReportUI || window.ExamReportUI));
    if (SafeExamReportUI) {
      return (
        <SafeExamReportUI
          examState={examState}
          onExit={handleExitExam}
          mainColor={mainColor}
          onBookmark={onBookmark}
          notebook={notebook}
          exportExamToExcel={exportExamToExcel}
        />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 z-[999] absolute inset-0 animate-in zoom-in">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-600 rounded-full flex items-center justify-center mb-6`}
        >
          <Icons.CheckCircle size={48} />
        </div>
        <h2 className="text-3xl font-black text-gray-800 mb-2">Đã nộp bài!</h2>
        <div className="flex gap-4">
          <button
            type="button"
            onClick={handleExitExam}
            className={`px-8 py-3 bg-${mainColor}-600 text-white font-bold rounded-xl shadow-lg hover:bg-${mainColor}-700`}
          >
            Quay về Menu
          </button>
          <button
            type="button"
            onClick={() => {
              if (handleExitExam) handleExitExam();
              if (onOpenIncorrect) onOpenIncorrect();
            }}
            className="px-8 py-3 bg-white text-red-500 border border-red-200 font-bold rounded-xl shadow-sm hover:bg-red-50"
          >
            Xem lại lỗi sai
          </button>
        </div>
      </div>
    );
  }

  const totalQ = examState.blueprint.length;
  const currentQ = examState.currentIndex;
  const progressPct = totalQ > 0 ? (currentQ / totalQ) * 100 : 0;

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isUrgent = examState.timeRemaining < 300 && examState.timeRemaining > 0;
  const timerClass = isUrgent
    ? 'text-red-600 animate-pulse font-black'
    : `text-${mainColor}-700 font-bold`;

  // CHỌN RENDERER
  let Renderer = null;
  if (currentQuestion) {
    const type = currentQuestion.metadata?.type || '';
    if (type.includes('listening')) Renderer = ListeningRenderer;
    else if (type.includes('multiple_choice') || type.includes('mcq'))
      Renderer = MultipleChoiceRenderer;
    else if (type.includes('fill_blank') || type.includes('tfng')) Renderer = FillBlankRenderer;
    else if (type.includes('spot_mistake')) Renderer = SpotMistakeRenderer;
    else if (type.includes('scramble')) Renderer = ScrambleRenderer;
    else if (type.includes('odd_one_out')) Renderer = OddOneOutRenderer;
    else if (type.includes('match')) Renderer = MiniMatchRenderer;
    else if (type.includes('pronunciation')) Renderer = PronunciationRenderer;
    else if (type.includes('image_quiz')) Renderer = ImageChoiceRenderer;
    else Renderer = MultipleChoiceRenderer;
  }

  const questionContent = (
    <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar relative bg-gray-50/30">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-4 sm:p-6 pb-12">
        {isHydrating ? (
          <div className="flex flex-col items-center gap-4 animate-in fade-in my-auto">
            <div
              className={`w-12 h-12 border-4 border-${mainColor}-200 border-t-${mainColor}-600 rounded-full animate-spin`}
            ></div>
            <div
              className={`text-${mainColor}-600 font-bold animate-pulse uppercase tracking-widest text-sm`}
            >
              Đang tải câu hỏi...
            </div>
          </div>
        ) : currentQuestion && Renderer ? (
          <Renderer
            key={currentQuestion.id}
            content={currentQuestion.content}
            onAnswer={(ans, isCorrect) => submitAnswer(ans, isCorrect)}
            onPlay={effectivePlay}
            lang={derivedLang}
          />
        ) : null}
      </div>
    </div>
  );

  const hasPassage = currentQuestion?.content?.passage;

  return (
    <div className="fixed inset-0 z-[1000] bg-gray-50 flex flex-col overflow-hidden">
      {/* MODAL XÁC NHẬN NỘP BÀI SỚM (Thay thế window.confirm) */}
      {showConfirmSubmit && (
        <div
          className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowConfirmSubmit(false)}
        >
          <div
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-gray-100 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={28} />
            </div>
            <h3 className="text-lg font-black text-gray-800 mb-2">Nộp bài sớm?</h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed">
              Bạn có chắc chắn muốn nộp bài sớm? Tiến trình hiện tại sẽ được tổng hợp.
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-colors"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSubmit(false);
                  if (forceSubmitExam) forceSubmitExam();
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm shadow-md transition-colors"
              >
                Nộp bài ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GIAI ĐOẠN 2: MÀN HÌNH CHUYỂN CHẶNG (PHASE INTERMISSION SCREEN 20s) */}
      {phaseIntermission && (
        <div className="absolute inset-0 z-[1050] bg-gray-50 flex flex-col items-center justify-center animate-in fade-in duration-300 p-6">
          <div
            className={`w-32 h-32 rounded-full border-8 border-${mainColor}-100 flex items-center justify-center mb-8 relative shadow-inner`}
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="60"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray="377"
                strokeDashoffset={377 - (377 * phaseIntermission.countdown) / 20}
                className={`text-${mainColor}-500 transition-all duration-1000 linear`}
              />
            </svg>
            <span className={`text-4xl font-black text-${mainColor}-600`}>
              {phaseIntermission.countdown}
            </span>
          </div>
          <Icons.Layers size={48} className={`text-${mainColor}-400 mb-4`} />
          <h2 className="text-xl md:text-2xl font-bold text-gray-500 mb-2 uppercase tracking-widest text-center">
            Chuẩn bị chuyển sang
          </h2>
          <p
            className={`text-3xl md:text-4xl font-black text-${mainColor}-700 text-center px-4 leading-tight mb-12 max-w-2xl`}
          >
            {phaseIntermission.chapter}
          </p>
          {/* [NEW v1.06] Bộ giám sát nạp đạn */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-400 animate-pulse">
              <Icons.Clock size={16} /> Vui lòng chờ để AI chuẩn bị dữ liệu...
            </div>
            <div className="px-5 py-2.5 bg-blue-50 border border-blue-200 rounded-full flex items-center gap-2.5 shadow-sm animate-in slide-in-from-bottom-2">
              <Icons.Database size={18} className="text-blue-500 animate-bounce" />
              <span className="text-sm font-black text-blue-700 uppercase tracking-widest">
                Đã nạp sẵn: {cachedCount} câu AI
              </span>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY CHUYỂN CHAPTER NHỎ (Giữ nguyên logic cũ chớp 2.5s) */}
      {chapterOverlay && !phaseIntermission && (
        <div
          className={`absolute inset-0 z-[1050] bg-${mainColor}-600 text-white flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300`}
        >
          <Icons.Layers size={64} className="mb-6 opacity-80" />
          <h2 className="text-xl md:text-2xl font-bold mb-2 uppercase tracking-widest opacity-80">
            Phần tiếp theo
          </h2>
          <p className="text-3xl md:text-5xl font-black text-center px-4 leading-tight">
            {chapterOverlay}
          </p>
        </div>
      )}

      {/* HEADER */}
      <div className="w-full bg-white border-b border-gray-200 shadow-sm shrink-0 z-50">
        <div className="w-full h-1.5 bg-gray-100 flex">
          <div
            className={`h-full bg-${mainColor}-500 transition-all duration-500 ease-out`}
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>
        <div className="flex justify-between items-center p-3 md:p-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full bg-${mainColor}-100 text-${mainColor}-600 flex items-center justify-center font-black text-sm border-2 border-${mainColor}-200 shrink-0`}
              >
                {currentQ + 1}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Tiến trình
                </div>
                <div className="text-sm font-bold text-gray-700">
                  {currentQ + 1} / {totalQ} câu
                </div>
              </div>
            </div>
            {currentQuestion?.content && (
              <div className="mt-1.5 sm:ml-[52px] flex items-center gap-2 animate-in fade-in flex-wrap">
                {/* 1. Nguồn câu hỏi hiện tại */}
                {currentQuestion.content._isRescued ? (
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
                    title="Sử dụng dữ liệu dự phòng do mất kết nối"
                  >
                    <Icons.AlertCircle size={10} className="text-orange-500" /> Nguồn: Dự phòng
                  </span>
                ) : currentQuestion.content.isAiGenerated ? (
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
                    title="Câu hỏi được tạo bởi AI"
                  >
                    <Icons.Sparkles size={10} className="text-indigo-500" /> Nguồn: AI
                  </span>
                ) : (
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200"
                    title="Trích xuất từ Bộ thẻ"
                  >
                    <Icons.Layers size={10} className="text-slate-400" /> Nguồn: Thẻ gốc
                  </span>
                )}
                {/* 2. Băng đạn AI đang chờ */}
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 shadow-sm"
                  title={`Có ${cachedCount} câu hỏi do AI tạo đã sẵn sàng trong băng đạn`}
                >
                  <Icons.Database size={10} className="text-blue-500" /> Đã nạp sẵn: {cachedCount}{' '}
                  câu AI
                </span>
                {/* 3. Đồng hồ Cooldown (Nếu có) */}
                {examCooldown > 0 && (
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 shadow-sm animate-pulse"
                    title="Tạo thời gian nghỉ để AI sinh câu hỏi"
                  >
                    <Icons.Clock size={10} /> Chờ chuyển câu: {examCooldown}s
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
              Thời gian còn lại
            </div>
            <div
              className={`text-xl sm:text-2xl font-mono flex items-center gap-2 bg-gray-50 px-4 py-1 rounded-xl border border-gray-100 shadow-inner ${timerClass}`}
            >
              <Icons.Clock size={20} /> {formatTime(examState.timeRemaining)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowConfirmSubmit(true)}
              className="text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-xl border border-red-200 hover:bg-red-100 transition-colors flex items-center gap-1"
            >
              <Icons.CheckCircle size={16} /> <span className="hidden sm:inline">Nộp bài</span>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 w-full h-full relative">
        {hasPassage ? (
          <SplitViewContainer passage={currentQuestion?.content?.passage || ''}>
            {questionContent}
          </SplitViewContainer>
        ) : (
          questionContent
        )}
      </div>
    </div>
  );
};

if (typeof window !== 'undefined') {
  window.ExamUIShell = ExamUIShell;
  window.Block5_14_ExamUIShell = ExamUIShell;
}

export default ExamUIShell;