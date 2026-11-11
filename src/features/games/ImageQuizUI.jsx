/**
 * @file src/features/games/ImageQuizUI.jsx
 * @description Giao diện Setup & Bàn chơi của Mini-game Đoán Hình (Image Quiz).
 * @origin Tầng 5 - Block 5.17 (Image Quiz UI)
 */

import React, { useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import {
  ResumeSessionBanner,
  SourceModeSelector,
  GameTopHUD
} from './common/GameSharedUI';

// Icon Hình ảnh nội bộ (phòng trường hợp Icons chung không có)
const LocalImageIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT GAME ĐOÁN HÌNH (IMAGE QUIZ SETUP)
// ============================================================================
export const ImageQuizSetup = ({
  config,
  setConfig,
  cardsCount = 0,
  lang = 'en',
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  dataMode,
  setDataMode,
  savedSession,
  onResumeSession,
  onClearSession,
  onStartGame,
  onBack,
  onMissingKey,
  mainColor = 'blue',
  t
}) => {
  const minRequiredCards = 4;
  const canStart = config.sourceMode === 'ai' || cardsCount >= minRequiredCards;

  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl p-5 sm:p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar border-2 border-gray-100 animate-in fade-in">
      <div className="space-y-4">
        {/* Header Setup */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl bg-${mainColor}-100 text-${mainColor}-600 shadow-sm`}>
              <LocalImageIcon size={22} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight">
                Đoán Hình Trực Quan
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Chọn hình ảnh minh họa đúng nhất cho từ vựng
              </p>
            </div>
          </div>

          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            title="Quay lại Menu Game"
          >
            <Icons.X size={22} />
          </button>
        </div>

        {/* Banner Khôi phục phiên chơi cũ */}
        <ResumeSessionBanner
          savedSession={savedSession}
          onResume={onResumeSession}
          onClear={onClearSession}
          mainColor={mainColor}
        />

        {/* Bộ chọn Nguồn Dữ Liệu (Thẻ của tôi vs AI Tự Sinh) */}
        <SourceModeSelector
          sourceMode={config.sourceMode}
          setSourceMode={(val) => setConfig((prev) => ({ ...prev, sourceMode: val }))}
          cardsCount={cardsCount}
          minCards={minRequiredCards}
          lang={lang}
          currentLevel={currentLevel}
          setCurrentLevel={setCurrentLevel}
          currentTopic={currentTopic}
          setCurrentTopic={setCurrentTopic}
          dataMode={dataMode}
          setDataMode={setDataMode}
          mainColor={mainColor}
          onMissingKey={onMissingKey}
          hideDataModeToggle={true} // Game này thường chỉ dùng cho từ vựng
        />

        {/* Các Tùy chọn Chế độ chơi */}
        <div className="space-y-2.5 pt-1">
          {/* Chế độ Vô tận (Endless Mode) */}
          <MenuToggle
            active={config.isEndless}
            setActive={(val) => setConfig((prev) => ({ ...prev, isEndless: val }))}
            icon={Icons.InfinityIcon}
            color={mainColor}
            title="Chế độ Vô tận (Endless)"
            subtitle={
              config.isEndless
                ? 'Chơi liên tục không giới hạn số câu'
                : `Chơi theo phiên (${config.totalQuestions || 20} câu)`
            }
          />

          {/* Giới hạn thời gian */}
          <MenuToggle
            active={config.timerEnabled}
            setActive={(val) => setConfig((prev) => ({ ...prev, timerEnabled: val }))}
            icon={Icons.Clock}
            color="orange"
            title="Đếm ngược thời gian"
            subtitle={
              config.timerEnabled
                ? `Giới hạn ${config.timeLimit || 20} giây mỗi câu`
                : 'Tắt đồng hồ đếm ngược'
            }
          />
          
          {/* Nút phát âm (Auto Speak) */}
          <MenuToggle
            active={config.autoSpeak}
            setActive={(val) => setConfig((prev) => ({ ...prev, autoSpeak: val }))}
            icon={Icons.Volume2}
            color="blue"
            title="Phát âm tự động"
            subtitle="Đọc từ khóa ngay khi hiển thị câu hỏi"
          />
        </div>
      </div>

      {/* Footer Nút Bắt đầu */}
      <div className="pt-4 mt-4 border-t border-gray-100">
        {!canStart && (
          <p className="text-xs font-bold text-red-500 text-center mb-2">
            ⚠️ Cần tối thiểu {minRequiredCards} thẻ để chơi hoặc chuyển sang chế độ AI Tự Sinh!
          </p>
        )}
        <button
          onClick={onStartGame}
          disabled={!canStart}
          className={`w-full py-3.5 rounded-xl font-black text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-base ${
            canStart
              ? `bg-${mainColor}-600 hover:bg-${mainColor}-700 shadow-${mainColor}-200`
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          <Icons.Play size={20} fill="currentColor" /> BẮT ĐẦU ĐOÁN HÌNH
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BÀN CHƠI ĐOÁN HÌNH (IMAGE QUIZ BOARD)
// ============================================================================
export const ImageQuizBoard = ({
  currentIndex = 0,
  totalQuestions = 20,
  isEndless = false,
  score = 0,
  streak = 0,
  timeLeft = null,
  ammoCount = 0,
  isAiSource = false,
  currentCard = null,
  selectedOption = null,
  isChecked = false,
  wrongFeedback = null,
  cooldownLeft = 0,
  onSelectOption,
  onNextQuestion,
  onExplainGrammar,
  onSpeak,
  onSaveWord,
  onOpenHanzi,
  onExit,
  fontFamily = 'inherit',
  lang = 'en',
  mainColor = 'blue',
  t
}) => {
  const questionData = currentCard?.origin || currentCard?.question || currentCard || {};
  const options = currentCard?.options || [];
  
  // Xác định text câu hỏi
  let questionText = questionData.term || questionData.definition;
  if (currentCard?.term) questionText = currentCard.term;
  if (!questionText) questionText = "Câu hỏi bị lỗi";

  // Phím tắt bàn phím (1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isChecked) {
        if (e.key === 'Enter' && cooldownLeft === 0) {
          onNextQuestion();
        }
        return;
      }
      
      const key = parseInt(e.key, 10);
      if (!isNaN(key) && key >= 1 && key <= options.length) {
        onSelectOption(options[key - 1]);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChecked, cooldownLeft, onNextQuestion, onSelectOption, options]);

  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl p-4 sm:p-6 flex flex-col justify-between border-2 border-gray-100 overflow-hidden animate-in fade-in">
      {/* Thanh Top HUD Dùng chung */}
      <GameTopHUD
        onExit={onExit}
        currentRound={currentIndex + 1}
        maxRounds={totalQuestions}
        isEndless={isEndless}
        score={score}
        streak={streak}
        timeLeft={timeLeft}
        ammoCount={ammoCount}
        isAiSource={isAiSource}
        onSaveWord={onSaveWord}
        onOpenHanzi={onOpenHanzi}
        lang={lang}
        mainColor={mainColor}
      />

      {/* Khu vực Câu hỏi */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1 my-1 flex flex-col">
        <div className={`shrink-0 min-h-[90px] p-4 rounded-2xl bg-${mainColor}-50/50 border border-${mainColor}-100 flex flex-col items-center justify-center relative text-center`}>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 absolute top-2">
            Tìm hình ảnh cho từ này
          </div>
          
          <div 
            style={{ fontFamily }}
            className="text-xl sm:text-3xl font-black text-gray-800 leading-snug break-words mt-3"
          >
            {questionText}
          </div>
          
          {onSpeak && questionData.term && (
            <button
              type="button"
              onClick={() => onSpeak(questionText)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white text-${mainColor}-600 border border-${mainColor}-200 shadow-sm hover:bg-${mainColor}-50 transition-all active:scale-95`}
              title="Nghe phát âm"
            >
              <Icons.Volume2 size={16} />
            </button>
          )}
        </div>

        {/* Khối Đáp án Hình ảnh (Grid 2x2) */}
        <div className="grid grid-cols-2 gap-3 shrink-0 flex-1 content-center">
          {options.map((opt, idx) => {
            const isCorrectOption = opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true';
            const isSelected = selectedOption === opt;
            
            let btnStyle = `bg-gray-50 border-gray-200 hover:border-${mainColor}-400 hover:bg-${mainColor}-50/20`;
            let imgStyle = `opacity-90`;
            
            if (isChecked) {
              if (isCorrectOption) {
                btnStyle = 'bg-green-50 border-green-500 shadow-md scale-[1.02] z-10';
                imgStyle = 'opacity-100';
              } else if (isSelected && !isCorrectOption) {
                btnStyle = 'bg-red-50 border-red-500 shadow-md animate-shake';
                imgStyle = 'opacity-80 grayscale';
              } else {
                btnStyle = 'bg-gray-50 border-gray-200 opacity-60 scale-95';
                imgStyle = 'opacity-40 grayscale';
              }
            } else if (isSelected) {
              btnStyle = `bg-${mainColor}-50 border-${mainColor}-500 ring-2 ring-${mainColor}-200 shadow-sm`;
              imgStyle = 'opacity-100';
            }

            const OptionIcon = isChecked && isCorrectOption ? Icons.CheckCircle : (isChecked && isSelected ? Icons.X : null);
            const iconColor = isCorrectOption ? 'text-green-600' : 'text-red-600';

            return (
              <button
                key={idx}
                type="button"
                disabled={isChecked}
                onClick={() => onSelectOption(opt)}
                className={`relative aspect-square p-2 sm:p-3 rounded-2xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 overflow-hidden group ${btnStyle}`}
              >
                {/* Chỉ mục bàn phím */}
                <span className="absolute left-2 top-2 w-5 h-5 flex items-center justify-center text-[10px] font-black bg-white/80 rounded border border-gray-200 text-gray-500 z-10 shadow-sm backdrop-blur-sm">
                  {idx + 1}
                </span>
                
                {/* Hình ảnh */}
                <div className="w-full h-full relative rounded-xl overflow-hidden bg-white flex items-center justify-center">
                   {opt.image ? (
                     <img 
                       src={opt.image} 
                       alt={opt.text} 
                       className={`w-full h-full object-contain p-2 transition-all duration-300 group-hover:scale-105 ${imgStyle}`}
                       onError={(e) => { 
                         e.target.style.display = 'none'; 
                         e.target.nextSibling.style.display = 'flex'; 
                       }} 
                     />
                   ) : null}
                   
                   {/* Fallback khi không có ảnh hoặc ảnh lỗi */}
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-400" style={{ display: opt.image ? 'none' : 'flex' }}>
                      <LocalImageIcon size={32} className="opacity-30 mb-1" />
                      <span className="text-[10px] font-bold uppercase">No Image</span>
                   </div>
                </div>
                
                {/* Nhãn text hiển thị sau khi chọn hoặc hover */}
                <div className={`absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-sm p-1.5 sm:p-2 border-t border-gray-100 text-center transition-transform duration-300 ${isChecked || isSelected ? 'translate-y-0' : 'translate-y-full group-hover:translate-y-0'}`}>
                    <span style={{ fontFamily: (isChecked && isCorrectOption) || !opt.text.match(/[\u4e00-\u9fa5]/) ? 'inherit' : fontFamily }} className={`text-xs sm:text-sm font-bold truncate block px-1 ${isChecked && isCorrectOption ? 'text-green-700' : 'text-gray-700'}`}>
                        {opt.text}
                    </span>
                </div>
                
                {/* Icon Kết quả */}
                {OptionIcon && (
                  <div className="absolute top-2 right-2 bg-white rounded-full shadow-sm z-10">
                    <OptionIcon size={24} className={iconColor} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        
        {/* Khối Giải thích / Feedback */}
        {isChecked && (
          <div className="animate-in slide-in-from-bottom-2 shrink-0">
             <div className={`p-4 rounded-xl border text-left flex flex-col gap-2 ${
                selectedOption?.isCorrect === true || String(selectedOption?.isCorrect).toLowerCase() === 'true'
                  ? 'bg-green-50/80 border-green-200 text-green-900'
                  : 'bg-red-50/80 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wider">
                    {selectedOption?.isCorrect === true || String(selectedOption?.isCorrect).toLowerCase() === 'true' ? (
                      <>
                        <Icons.CheckCircle size={18} className="text-green-600" />
                        <span>Chính xác!</span>
                      </>
                    ) : (
                      <>
                        <Icons.AlertCircle size={18} className="text-red-600" />
                        <span>Chưa chính xác!</span>
                      </>
                    )}
                  </div>
                  
                  {/* Nút giải thích ngữ pháp */}
                  {onExplainGrammar && (
                    <button
                      type="button"
                      onClick={onExplainGrammar}
                      className="px-2.5 py-1 bg-white/60 hover:bg-white rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <Icons.Sparkles size={13} className="text-purple-600" /> Giải thích
                    </button>
                  )}
                </div>
                
                {/* Nội dung giải thích có sẵn từ thẻ */}
                {(questionData.explanation || questionData.analysis || wrongFeedback) && (
                  <div className="text-xs sm:text-sm mt-1 leading-relaxed bg-white/70 p-3 rounded-lg border border-black/5 whitespace-pre-wrap">
                    {questionData.explanation || questionData.analysis || wrongFeedback}
                  </div>
                )}
             </div>
          </div>
        )}
      </div>

      {/* Footer Nút Tiếp theo */}
      <div className="pt-3 mt-2 border-t border-gray-100 shrink-0 h-[60px]">
        {isChecked ? (
          <button
            type="button"
            onClick={onNextQuestion}
            disabled={cooldownLeft > 0}
            className={`w-full py-3.5 rounded-xl font-black text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base ${
              cooldownLeft > 0
                ? 'bg-gray-400 cursor-wait'
                : `bg-${mainColor}-600 hover:bg-${mainColor}-700`
            }`}
          >
            <span>
              {cooldownLeft > 0
                ? `Đợi nạp đạn (${cooldownLeft}s)...`
                : 'Câu tiếp theo (Enter)'}
            </span>
            <Icons.ChevronRight size={20} />
          </button>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 rounded-xl border border-dashed border-gray-200 select-none">
            Chọn 1 hình ảnh để tiếp tục
          </div>
        )}
      </div>
    </div>
  );
};

export const ImageQuizUI = {
  ImageQuizSetup,
  ImageQuizBoard
};