/**
 * @file src/features/games/SpotMistakeUI.jsx
 * @description Giao diện Setup & Bàn chơi của Mini-game Tìm Lỗi Sai (Spot Mistake).
 * @origin Tầng 5 - Block 5.10 (Spot Mistake UI)
 */

import React, { useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import {
  ResumeSessionBanner,
  SourceModeSelector,
  GrammarTrapSelector,
  GameTopHUD
} from './common/GameSharedUI';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT GAME TÌM LỖI SAI (SPOT MISTAKE SETUP)
// ============================================================================
export const SpotMistakeSetup = ({
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
  const minRequiredCards = 1;
  const canStart = config.sourceMode === 'ai' || cardsCount >= minRequiredCards;

  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl p-5 sm:p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar border-2 border-gray-100 animate-in fade-in">
      <div className="space-y-4">
        {/* Header Setup */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl bg-${mainColor}-100 text-${mainColor}-600 shadow-sm`}>
              <Icons.Target size={22} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight">
                Tìm Lỗi Sai
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Phát hiện từ sai ngữ pháp hoặc ngữ cảnh trong câu
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

        {/* Bộ chọn Chuyên đề Bẫy Ngữ pháp (Khi dùng AI hoặc chế độ Khó) */}
        {(config.sourceMode === 'ai' || config.difficulty === 'hard') && (
          <GrammarTrapSelector
            gameType="spotmistake"
            lang={lang}
            currentLevel={currentLevel}
            selectedTrap={config.grammarId}
            onSelectTrap={(val) => setConfig((prev) => ({ ...prev, grammarId: val }))}
            mainColor={mainColor}
          />
        )}

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
                ? `Giới hạn ${config.timeLimit || 45} giây mỗi câu`
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
          <Icons.Play size={20} fill="currentColor" /> BẮT ĐẦU ĐIỀN TỪ
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BÀN CHƠI TÌM LỖI SAI (SPOT MISTAKE BOARD)
// ============================================================================
export const SpotMistakeBoard = ({
  currentIndex = 0,
  totalQuestions = 20,
  isEndless = false,
  score = 0,
  streak = 0,
  timeLeft = null,
  ammoCount = 0,
  isAiSource = false,
  currentCard = null,
  sentenceWords = [],
  selectedWordIndex = null,
  isChecked = false,
  answerStatus = null, // null | 'correct' | 'wrong'
  grammarExplanation = null,
  isExplaining = false,
  cooldownLeft = 0,
  onSelectWord,
  onCheckAnswer,
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
  const questionData = currentCard || {};

  // Phím tắt bàn phím
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isChecked) {
        if (e.key === 'Enter' && cooldownLeft === 0) {
          onNextQuestion();
        }
        return;
      } else {
         if (e.key === 'Enter' && selectedWordIndex !== null) {
             onCheckAnswer();
         }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChecked, cooldownLeft, onNextQuestion, onCheckAnswer, selectedWordIndex]);

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
        <div className={`flex-1 min-h-[160px] p-5 rounded-2xl bg-${mainColor}-50/50 border border-${mainColor}-100 flex flex-col items-center justify-center relative text-center`}>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 absolute top-3">
            Chọn một từ bị sai trong câu
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 mt-4 max-w-2xl mx-auto">
            {sentenceWords.map((word, idx) => {
              const isSelected = selectedWordIndex === idx;
              // Nếu đã check, tô màu từ bị sai thực sự (correct) và từ user chọn
              let wordStyle = `bg-white text-gray-800 border-gray-200 hover:bg-gray-100 shadow-sm`;
              
              if (isChecked) {
                  const isActuallyWrongWord = questionData.wrongWord && word.original.toLowerCase().includes(questionData.wrongWord.toLowerCase());
                  
                  if (answerStatus === 'correct' && isSelected) {
                      wordStyle = 'bg-green-500 text-white border-green-600 shadow-md scale-110 z-10';
                  } else if (answerStatus === 'wrong') {
                      if (isSelected) wordStyle = 'bg-red-500 text-white border-red-600 shadow-md animate-shake z-10';
                      else if (isActuallyWrongWord) wordStyle = 'bg-yellow-100 text-yellow-800 border-yellow-400 ring-2 ring-yellow-300';
                      else wordStyle = 'bg-gray-50 text-gray-400 border-gray-200 opacity-50';
                  } else {
                       if (isActuallyWrongWord) wordStyle = 'bg-green-500 text-white border-green-600 shadow-md';
                       else wordStyle = 'bg-gray-50 text-gray-400 border-gray-200 opacity-50';
                  }
              } else if (isSelected) {
                  wordStyle = `bg-${mainColor}-100 border-${mainColor}-500 text-${mainColor}-800 ring-2 ring-${mainColor}-200 scale-105`;
              }
              
              return (
                  <button
                      key={idx}
                      type="button"
                      disabled={isChecked}
                      onClick={() => onSelectWord(idx)}
                      style={{ fontFamily }}
                      className={`px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-lg border-2 text-lg sm:text-xl font-bold transition-all active:scale-95 ${wordStyle}`}
                  >
                      {word.display}
                  </button>
              );
            })}
          </div>
          
          {onSpeak && questionData.correction && isChecked && (
            <button
              type="button"
              onClick={() => onSpeak(questionData.wrongSentence.replace(questionData.wrongWord, questionData.correction))}
              className={`mt-6 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-${mainColor}-600 border border-${mainColor}-200 text-xs font-bold shadow-sm hover:bg-${mainColor}-50 transition-all active:scale-95`}
            >
              <Icons.Volume2 size={14} />
              <span>Đọc câu đã sửa</span>
            </button>
          )}
        </div>
        
        {/* Khối Giải thích / Feedback */}
        {isChecked && (
          <div className="animate-in slide-in-from-bottom-2 shrink-0">
             <div className={`p-4 rounded-xl border text-left flex flex-col gap-2 ${
                answerStatus === 'correct'
                  ? 'bg-green-50/80 border-green-200 text-green-900'
                  : 'bg-red-50/80 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wider">
                    {answerStatus === 'correct' ? (
                      <>
                        <Icons.CheckCircle size={18} className="text-green-600" />
                        <span>Phát hiện xuất sắc!</span>
                      </>
                    ) : (
                      <>
                        <Icons.AlertCircle size={18} className="text-red-600" />
                        <span>Sai rồi!</span>
                      </>
                    )}
                  </div>
                  
                  {/* Nút giải thích ngữ pháp */}
                  {onExplainGrammar && (
                    <button
                      type="button"
                      disabled={isExplaining}
                      onClick={onExplainGrammar}
                      className="px-2.5 py-1 bg-white/60 hover:bg-white rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 shadow-sm disabled:opacity-50"
                    >
                      <Icons.Sparkles size={13} className={isExplaining ? 'animate-spin text-purple-600' : 'text-purple-600'} /> 
                      <span>{isExplaining ? 'Đang phân tích...' : 'Giải thích'}</span>
                    </button>
                  )}
                </div>
                
                <div className="text-xs sm:text-sm font-medium mt-1 bg-white/70 p-3 rounded-lg border border-black/5">
                   Sửa lại đúng phải là: <span className="font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded border border-green-200 ml-1">{questionData.correction}</span>
                </div>
                
                {/* Nội dung giải thích có sẵn từ thẻ */}
                {(grammarExplanation || questionData.explanation) && (
                  <div className="text-xs sm:text-sm mt-1 leading-relaxed bg-white/70 p-3 rounded-lg border border-black/5 whitespace-pre-wrap">
                    <div className="font-black opacity-60 mb-1 uppercase text-[10px]">Phân tích ngữ pháp:</div>
                    {grammarExplanation || questionData.explanation}
                  </div>
                )}
             </div>
          </div>
        )}
      </div>

      {/* Footer Nút Kiểm tra/Tiếp theo */}
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
          <button
             type="button"
             onClick={onCheckAnswer}
             disabled={selectedWordIndex === null}
             className={`w-full py-3.5 rounded-xl font-black text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed bg-${mainColor}-600 hover:bg-${mainColor}-700`}
          >
             <Icons.Check size={20} />
             <span>Kiểm tra đáp án (Enter)</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const SpotMistakeUI = {
  SpotMistakeSetup,
  SpotMistakeBoard
};