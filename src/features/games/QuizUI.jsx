/**
 * @file src/features/games/QuizUI.jsx
 * @description Giao diện Setup & Bàn chơi của Mini-game Trắc Nghiệm (Quiz Game).
 * @origin Tầng 5 - Block 5.5 (Quiz UI)
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
// 1. MÀN HÌNH CÀI ĐẶT GAME TRẮC NGHIỆM (QUIZ SETUP)
// ============================================================================
export const QuizSetup = ({
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
              <Icons.Layers size={22} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight">
                {t ? t('modeQuiz') || 'Trắc Nghiệm 4 Đáp Án' : 'Trắc Nghiệm 4 Đáp Án'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {t ? t('descQuiz') || 'Chọn đáp án chính xác nhất' : 'Chọn đáp án chính xác nhất'}
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
            gameType="quiz"
            lang={lang}
            currentLevel={currentLevel}
            selectedTrap={config.grammarId}
            onSelectTrap={(val) => setConfig((prev) => ({ ...prev, grammarId: val }))}
            mainColor={mainColor}
          />
        )}

        {/* Các Tùy chọn Chế độ chơi */}
        <div className="space-y-2.5 pt-1">
          {/* Chiều Hỏi (Ask Mode) */}
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-full bg-indigo-100 text-indigo-600">
                <Icons.RefreshCcw size={18} />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-gray-700">Chiều hỏi đáp</div>
                <div className="text-[11px] text-gray-500">
                  {config.askMode === 'def'
                    ? 'Hỏi Tiếng Việt, chọn Ngoại ngữ'
                    : 'Hỏi Ngoại ngữ, chọn Tiếng Việt'}
                </div>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, askMode: 'term' }))}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  config.askMode !== 'def'
                    ? `bg-${mainColor}-600 text-white shadow-sm`
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Hỏi từ
              </button>
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, askMode: 'def' }))}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  config.askMode === 'def'
                    ? `bg-${mainColor}-600 text-white shadow-sm`
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Hỏi nghĩa
              </button>
            </div>
          </div>

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
            subtitle="Đọc câu hỏi / đáp án ngay khi hiển thị"
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
          <Icons.Play size={20} fill="currentColor" /> BẮT ĐẦU THỬ THÁCH
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BÀN CHƠI TRẮC NGHIỆM (QUIZ BOARD)
// ============================================================================
export const QuizBoard = ({
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
  
  // Xác định text câu hỏi dựa trên cấu trúc sinh ra từ ExamNormalizer
  let questionText = questionData.term;
  if (currentCard?.term) questionText = currentCard.term; // Dữ liệu AI tự sinh
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
        <div className={`flex-1 min-h-[120px] p-5 rounded-2xl bg-${mainColor}-50/50 border border-${mainColor}-100 flex flex-col items-center justify-center relative text-center`}>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 absolute top-3">
            {t ? t('question') || 'Câu hỏi' : 'Câu hỏi'}
          </div>
          
          <div 
            style={{ fontFamily }}
            className="text-lg sm:text-2xl font-black text-gray-800 leading-snug break-words mt-4"
          >
            {questionText}
          </div>
          
          {onSpeak && questionData.term && (
            <button
              type="button"
              onClick={() => onSpeak(questionText)}
              className={`mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-${mainColor}-600 border border-${mainColor}-200 text-xs font-bold shadow-sm hover:bg-${mainColor}-50 transition-all active:scale-95`}
            >
              <Icons.Volume2 size={14} />
              <span>{t ? t('listenAgain') : 'Nghe phát âm'}</span>
            </button>
          )}
        </div>

        {/* Khối Đáp án */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
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
                className={`relative min-h-[64px] p-3 rounded-xl border-2 font-bold text-sm sm:text-base text-center flex items-center justify-center transition-all active:scale-95 break-words ${btnStyle}`}
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
            Chọn 1 đáp án để tiếp tục
          </div>
        )}
      </div>
    </div>
  );
};

export const QuizUI = {
  QuizSetup,
  QuizBoard
};