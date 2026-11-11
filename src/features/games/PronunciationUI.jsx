/**
 * @file src/features/games/PronunciationUI.jsx
 * @description Giao diện Setup & Bàn chơi của Mini-game Vua Ngữ Âm (Pronunciation Game).
 * @origin Tầng 5 - Block 5.19 (Pronunciation UI)
 */

import React, { useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import {
  ResumeSessionBanner,
  SourceModeSelector,
  GameTopHUD
} from './common/GameSharedUI';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT GAME VUA NGỮ ÂM (PRONUNCIATION SETUP)
// ============================================================================
export const PronunciationSetup = ({
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
              <Icons.Mic size={22} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight">
                Vua Ngữ Âm
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Tìm từ có cách phát âm khác biệt
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
          <Icons.Play size={20} fill="currentColor" /> BẮT ĐẦU CHƠI
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BÀN CHƠI NGỮ ÂM (PRONUNCIATION BOARD)
// ============================================================================
export const PronunciationBoard = ({
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
  cooldownLeft = 0,
  onSelectOption,
  onNextQuestion,
  onSpeak,
  onSaveWord,
  onOpenHanzi,
  onExit,
  fontFamily = 'inherit',
  lang = 'en',
  mainColor = 'blue',
  t
}) => {
  const questionData = currentCard || {};
  const options = Array.isArray(questionData.options) ? questionData.options : [];
  
  // Xác định text câu hỏi
  let questionText = questionData.term;
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
        <div className={`shrink-0 p-4 rounded-2xl bg-${mainColor}-50/50 border border-${mainColor}-100 flex flex-col items-center justify-center text-center`}>
          <div className="text-[11px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
            <Icons.Mic size={16} className={`text-${mainColor}-500`} />
            Chọn từ có phần phát âm khác với các từ còn lại
          </div>
        </div>

        {/* Khối Đáp án */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0 flex-1 content-center">
          {options.map((opt, idx) => {
            const isCorrectOption = opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true';
            const isSelected = selectedOption === opt;
            
            let btnStyle = `bg-white border-gray-200 text-gray-700 hover:border-${mainColor}-400 hover:bg-${mainColor}-50/40`;
            
            if (isChecked) {
              if (isCorrectOption) {
                btnStyle = 'bg-green-500 border-green-600 text-white shadow-md scale-[1.02] z-10';
              } else if (isSelected && !isCorrectOption) {
                btnStyle = 'bg-red-500 border-red-600 text-white shadow-md animate-shake';
              } else {
                btnStyle = 'bg-gray-50 border-gray-200 text-gray-400 opacity-60 scale-95';
              }
            } else if (isSelected) {
              btnStyle = `bg-${mainColor}-100 border-${mainColor}-500 text-${mainColor}-800 ring-2 ring-${mainColor}-200`;
            }

            const OptionIcon = isChecked && isCorrectOption ? Icons.CheckCircle : (isChecked && isSelected ? Icons.X : null);

            return (
              <button
                key={idx}
                type="button"
                disabled={isChecked}
                onClick={() => onSelectOption(opt)}
                style={{ fontFamily: (isChecked && isCorrectOption) || !opt.text.match(/[\u4e00-\u9fa5]/) ? 'inherit' : fontFamily }}
                className={`relative min-h-[80px] p-4 rounded-xl border-2 font-bold text-lg sm:text-xl text-center flex items-center justify-center transition-all active:scale-95 break-words ${btnStyle}`}
              >
                <span className="absolute left-3 top-3 text-[10px] opacity-50 font-black px-1.5 py-0.5 rounded border border-current">
                  {idx + 1}
                </span>
                
                <span className="px-6">{opt.text}</span>
                
                {OptionIcon && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <OptionIcon size={20} className={isCorrectOption ? 'text-white' : 'text-white'} />
                  </span>
                )}

                {/* Nút nghe nhanh */}
                {onSpeak && !isChecked && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onSpeak(opt.text);
                      }}
                      className={`absolute right-3 top-3 p-1.5 rounded-full hover:bg-gray-200 transition-colors ${isSelected ? `text-${mainColor}-600 hover:bg-${mainColor}-200` : 'text-gray-400'}`}
                      title="Nghe phát âm"
                    >
                      <Icons.Volume2 size={16} />
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
                </div>
                
                {/* Nội dung giải thích có sẵn từ thẻ */}
                {(questionData.explanation || questionData.definition) && (
                  <div className="text-xs sm:text-sm mt-1 leading-relaxed bg-white/70 p-3 rounded-lg border border-black/5 whitespace-pre-wrap">
                    <div className="font-black opacity-60 mb-1 uppercase text-[10px]">Giải thích:</div>
                    {questionData.explanation || questionData.definition}
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
            Chọn 1 đáp án để tiếp tục
          </div>
        )}
      </div>
    </div>
  );
};

export const PronunciationUI = {
  PronunciationSetup,
  PronunciationBoard
};