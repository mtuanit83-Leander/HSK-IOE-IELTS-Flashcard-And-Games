// ============================================================================
// FILE 58/85: src/features/games/FillBlankUI.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.8 - Fill Blank Game UI V2.63)
// NHIỆM VỤ: Giao diện Cấu hình (FillBlankSetup) và Màn hình chơi chính
//           (FillBlankPlayScreen) cho Game Điền Từ (Hỗ trợ chế độ Dễ, Khó,
//           Địa Ngục & Khóa chống gian lận Bookmark).
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';

// Helper đọc cấu hình đã lưu từ LocalStorage an toàn
const getSavedFillBlankConfig = () => {
  try {
    const saved = localStorage.getItem('fc_fillblank_config');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (FILL BLANK SETUP)
// ============================================================================
export const FillBlankSetup = ({ mainColor = 'blue', onStart, onBack }) => {
  const initialCfg = useMemo(() => getSavedFillBlankConfig(), []);

  const [mode, setMode] = useState(() =>
    initialCfg.sourceMode === 'card' ? 'cards' : 'ai'
  );
  const [timerMode, setTimerMode] = useState(() => initialCfg.timerMode ?? false);
  const [timeLimit, setTimeLimit] = useState(() => initialCfg.timeLimit ?? 30);
  const [difficulty, setDifficulty] = useState(() => initialCfg.difficulty || 'easy');
  const [aiChallenge, setAiChallenge] = useState(() => initialCfg.aiChallenge || false);

  const handleStart = () => {
    const config = {
      sourceMode: mode === 'ai' ? 'ai_pure' : 'card',
      aiMode: mode === 'ai' || (mode === 'cards' && aiChallenge),
      timerMode,
      timeLimit,
      difficulty,
      aiChallenge
    };
    localStorage.setItem('fc_fillblank_config', JSON.stringify(config));
    if (onStart) onStart(config);
  };

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div className="w-full max-w-md mx-auto bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center animate-in zoom-in duration-300 h-full max-h-screen">
        <div className="w-full flex items-center justify-between mb-4 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <div className="w-10"></div>
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-gray-800 mb-2 text-center shrink-0">
          Luyện Điền Từ
        </h2>
        <p className="text-gray-500 text-sm mb-6 text-center px-4 shrink-0">
          Luyện tập gõ chính xác từ vựng trong ngữ cảnh câu hoàn chỉnh.
        </p>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar space-y-4 px-1 pb-4">
          <button
            type="button"
            onClick={() => setMode('ai')}
            className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
              mode === 'ai'
                ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-md`
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div
              className={`p-3 rounded-xl ${
                mode === 'ai'
                  ? `bg-${mainColor}-500 text-white`
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Icons.Sparkles size={24} />
            </div>
            <div className="text-left flex-1">
              <div
                className={`font-bold text-lg ${
                  mode === 'ai' ? `text-${mainColor}-700` : 'text-gray-700'
                }`}
              >
                AI Sinh Câu Hỏi
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Vô hạn ngữ cảnh thông minh
              </div>
            </div>
            {mode === 'ai' && (
              <Icons.CheckCircle size={20} className={`text-${mainColor}-500`} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMode('cards')}
            className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
              mode === 'cards'
                ? 'border-gray-800 bg-gray-50 shadow-md'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div
              className={`p-3 rounded-xl ${
                mode === 'cards'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <Icons.Layers size={24} />
            </div>
            <div className="text-left flex-1">
              <div
                className={`font-bold text-lg ${
                  mode === 'cards' ? 'text-gray-800' : 'text-gray-700'
                }`}
              >
                Dùng Bộ Thẻ Gốc
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Ôn tập chính xác từ đã lưu
              </div>
            </div>
            {mode === 'cards' && (
              <Icons.CheckCircle size={20} className="text-gray-800" />
            )}
          </button>

          {mode === 'cards' && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <MenuToggle
                active={aiChallenge}
                setActive={setAiChallenge}
                icon={Icons.Sparkles}
                color="indigo"
                title="Thử Thách AI Đục Lỗ"
                subtitle="AI tự chọn từ cốt lõi để đục lỗ thay vì chọn ngẫu nhiên."
              />
            </div>
          )}

          {/* Chọn Độ Khó: Dễ / Khó / Địa Ngục */}
          <div className="w-full flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDifficulty('easy')}
              className={`flex-1 py-3 px-1 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                difficulty === 'easy'
                  ? 'border-green-500 bg-green-50 shadow-md text-green-700'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500'
              }`}
            >
              <Icons.CheckCircle size={20} className="mb-1" />
              <span className="font-bold text-sm">Dễ</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">Có gợi ý</span>
            </button>

            <button
              type="button"
              onClick={() => setDifficulty('hard')}
              className={`flex-1 py-3 px-1 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                difficulty === 'hard'
                  ? 'border-red-500 bg-red-50 shadow-md text-red-700'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500'
              }`}
            >
              <Icons.AlertCircle size={20} className="mb-1" />
              <span className="font-bold text-sm">Khó</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">Khóa gợi ý</span>
            </button>

            <button
              type="button"
              onClick={() => setDifficulty('hell')}
              className={`flex-1 py-3 px-1 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                difficulty === 'hell'
                  ? 'border-purple-600 bg-purple-50 shadow-md text-purple-800'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-500'
              }`}
            >
              <Icons.Zap size={20} className="mb-1" />
              <span className="font-bold text-sm">Địa Ngục</span>
              <span className="text-[9px] sm:text-[10px] opacity-70">Ẩn 4 đáp án</span>
            </button>
          </div>

          <MenuToggle
            active={timerMode}
            setActive={setTimerMode}
            icon={Icons.Clock}
            color="orange"
            title="Giới hạn thời gian"
            subtitle={timerMode ? `${timeLimit} giây / câu` : 'Thoải mái thời gian'}
            extra={
              <div className="mt-3 pt-2 border-t border-orange-100 flex justify-between items-center animate-in fade-in">
                <span className="text-[10px] font-bold text-orange-400 uppercase">
                  Chọn thời gian:
                </span>
                <div className="flex gap-1">
                  {[15, 30, 45, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimeLimit(sec);
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                        timeLimit === sec
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            }
          />
        </div>

        <div className="w-full pt-4 shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 bg-${mainColor}-600 text-white font-bold rounded-2xl shadow-lg shadow-${mainColor}-200 hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center justify-center gap-2 text-lg`}
          >
            <Icons.Play size={24} fill="currentColor" /> Bắt đầu
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (FILL BLANK PLAY SCREEN)
// ============================================================================
export const FillBlankPlayScreen = ({
  currentQuestion,
  inputBuffer,
  setInputBuffer,
  checkStatus,
  attempts,
  time,
  combo,
  playedCount,
  isFinished,
  isGenerating,
  aiCountdown,
  correctCount,
  wrongCount,
  resultTimer,
  isResultPaused,
  toggleResultPause,
  timeLeft,
  aiAmmoCount,
  aiWaitTime,
  checkAnswer,
  handleNext,
  handleSkip,
  handleSaveAndBack,
  onSaveToNotebook,
  isBookmarked,
  settings,
  onEndGame,
  mainColor = 'blue',
  config
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef(null);

  // Tự động đóng gợi ý và focus vào ô nhập liệu khi sang câu mới
  useEffect(() => {
    const focusTimer = setTimeout(() => {
      setShowHint(false);
      if (checkStatus === 'idle' && inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);
    return () => clearTimeout(focusTimer);
  }, [currentQuestion, checkStatus]);

  // Tổng hợp 4 từ gợi ý (1 từ đúng + 3 từ nhiễu)
  const displayOptions = useMemo(() => {
    if (!currentQuestion) return [];
    let opts = [];
    if (currentQuestion.distractors && currentQuestion.distractors.length > 0) {
      opts = [currentQuestion.targetWord, ...currentQuestion.distractors];
    } else if (currentQuestion.options) {
      opts = currentQuestion.options.map((o) => o.text);
    }
    opts = opts.filter(Boolean).slice(0, 4);
    if (opts.length === 0) return [];
    if (!opts.includes(currentQuestion.targetWord)) {
      opts[0] = currentQuestion.targetWord;
    }
    return Utils && typeof Utils.shuffleArray === 'function'
      ? Utils.shuffleArray(opts)
      : opts;
  }, [currentQuestion]);

  const isHellMode = config?.difficulty === 'hell';
  const isHintDisabled = config?.difficulty === 'hard' || isHellMode;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    if (!onSaveToNotebook || !currentQuestion) return;

    const cleanSentence = currentQuestion.displaySentence
      ? currentQuestion.displaySentence.replace(/\[__________\]/g, currentQuestion.targetWord)
      : currentQuestion.targetWord;

    const underlinedTarget = currentQuestion.targetWord
      ? currentQuestion.targetWord
          .split('')
          .map((c) => c + '\u0332')
          .join('')
      : '';

    const displaySentence = currentQuestion.displaySentence
      ? currentQuestion.displaySentence.replace(/\[__________\]/g, underlinedTarget)
      : currentQuestion.targetWord;

    onSaveToNotebook({
      isSmartTarget: true,
      display: displaySentence,
      save: cleanSentence,
      analysis: currentQuestion.hint || currentQuestion.explanation || ''
    });
  };

  // Màn hình chờ khi đang khởi tạo câu hỏi đầu tiên
  if (isGenerating && !currentQuestion) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }

    let levelStr = 'TẤT CẢ';
    if (config?.level) {
      if (Array.isArray(config.level) && config.level.length > 0) {
        levelStr = `${config.level.length} CẤP ĐỘ`;
      } else if (typeof config.level === 'string') {
        levelStr = config.level.replace('level_', '').replace(/_/g, ' ').toUpperCase();
      }
    }

    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onCancel={handleSaveAndBack}
        queueLength={aiAmmoCount}
        text={
          aiCountdown > 0
            ? 'AI đang phân tích dữ liệu...'
            : config?.sourceMode === 'ai_pure'
            ? 'AI đang tạo câu đố...'
            : 'Đang thiết lập trò chơi...'
        }
        subText={
          aiCountdown > 0 ? '(Vui lòng đợi giây lát để có câu hỏi hay)' : ''
        }
        mainColor={mainColor}
        levelStr={config?.sourceMode === 'ai_pure' ? levelStr : ''}
      />
    );
  }

  // Màn hình tổng kết khi hoàn thành
  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-500 rounded-full flex items-center justify-center mb-6 shadow-inner`}
        >
          <Icons.Award size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Hoàn thành!</h2>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8 mt-6">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Thời gian
            </div>
            <div className={`text-xl font-bold text-${mainColor}-600`}>
              {formatTime(time)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm text-center">
            <div className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.Check size={12} /> Đúng
            </div>
            <div className="text-xl font-bold text-green-600">
              {correctCount || 0}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm text-center">
            <div className="text-[10px] text-red-400 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.X size={12} /> Sai
            </div>
            <div className="text-xl font-bold text-red-500">
              {wrongCount || 0}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onEndGame({ correct: correctCount, time: time, wrong: wrongCount })
          }
          className={`w-full max-w-xs py-4 rounded-xl bg-${mainColor}-600 text-white font-bold text-lg hover:bg-${mainColor}-700 shadow-lg shadow-${mainColor}-200 transition-all active:scale-95 flex items-center justify-center gap-2`}
        >
          <Icons.CheckCircle size={24} /> Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto bg-gray-50 relative overflow-hidden">
      {/* Thanh đếm ngược thời gian */}
      {config?.timerMode &&
        checkStatus !== 'correct' &&
        checkStatus !== 'wrong' &&
        !isGenerating && (
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                timeLeft <= 5 ? 'bg-red-500' : `bg-${mainColor}-500`
              }`}
              style={{ width: `${(timeLeft / config.timeLimit) * 100}%` }}
            ></div>
          </div>
        )}

      {/* Popup xác nhận kết thúc sớm */}
      {showConfirmEnd && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">
              Kết thúc phiên học?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Tiến trình của câu này sẽ không được lưu. Bạn có chắc chắn muốn thoát?
            </p>
            <div className="flex w-full gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Chơi tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmEnd(false);
                  onEndGame({
                    correct: correctCount,
                    time: time,
                    wrong: wrongCount
                  });
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Kết thúc
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10 relative">
        <button
          type="button"
          onClick={handleSaveAndBack}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Quay lại"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL{' '}
            {(Array.isArray(config?.level)
              ? config.level[0]
              : config?.level || '4'
            ).match(/\d+/)?.[0] || '4'}
          </div>

          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
            Câu {playedCount + 1}{' '}
            <span className="font-serif text-lg leading-none text-gray-400 ml-0.5">
              ∞
            </span>
          </div>

          {isHellMode && (
            <div className="text-[10px] font-bold text-purple-100 bg-purple-600 border border-purple-800 px-2 py-1 rounded hidden sm:flex items-center gap-1 animate-pulse shadow-sm">
              <Icons.Zap size={12} /> ĐỊA NGỤC
            </div>
          )}

          <div className="flex items-center gap-2 bg-white border px-3 py-1 rounded-full shadow-sm">
            <span className="text-xs sm:text-sm font-bold text-green-600 flex items-center gap-1">
              <Icons.Check size={14} /> {correctCount || 0}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-xs sm:text-sm font-bold text-red-500 flex items-center gap-1">
              <Icons.X size={14} /> {wrongCount || 0}
            </span>
          </div>

          <div
            className={`hidden sm:flex items-center gap-1 font-bold ${
              combo > 1 ? 'text-orange-500 scale-110' : 'text-gray-400'
            } transition-all`}
          >
            <Icons.Sparkles size={18} /> x{combo}
          </div>

          <div
            className={`text-lg sm:text-xl font-mono font-bold text-${mainColor}-600 w-12 text-right hidden sm:block`}
          >
            {time}s
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {currentQuestion?.origin?._isRescued || currentQuestion?._isRescued ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
            </span>
          ) : currentQuestion?.isAiGenerated ? (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
              title="Câu hỏi được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(config?.aiMode || config?.sourceMode === 'ai_pure') && aiAmmoCount > 0 && (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider hidden sm:flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
              title={`Có ${aiAmmoCount} câu AI đã sẵn sàng`}
            >
              <Icons.Database size={12} className="text-blue-500" /> Đạn AI: {aiAmmoCount}
            </span>
          )}

          {aiWaitTime > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          {/* [ANTI-CHEAT LOCK]: Chỉ hiển thị nút Bookmark khi đã chốt đáp án để tránh lộ nguyên văn từ vựng */}
          {(checkStatus === 'correct' || checkStatus === 'wrong') && (
            <button
              type="button"
              onClick={handleBookmark}
              className={`p-2 rounded-lg transition-colors ${
                isBookmarked
                  ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                  : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
              }`}
              title="Lưu vào Sổ tay"
            >
              <Icons.Bookmark
                size={20}
                fill={isBookmarked ? 'currentColor' : 'none'}
              />
            </button>
          )}
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 flex flex-col items-center justify-center relative">
        <div className="w-full max-w-3xl bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center relative animate-in zoom-in duration-300">
          <div className="flex flex-col items-center gap-2 w-full mb-6 relative">
            <button
              type="button"
              onClick={() => !isHintDisabled && setShowHint(!showHint)}
              disabled={isHintDisabled}
              className={`p-3 rounded-full flex items-center justify-center transition-all shadow-sm ${
                isHintDisabled
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'
                  : showHint
                  ? 'bg-yellow-100 text-yellow-600 border border-yellow-300'
                  : 'bg-white border border-gray-200 text-gray-400 hover:text-yellow-500 hover:border-yellow-300 hover:shadow-md active:scale-95'
              }`}
              title={
                isHintDisabled
                  ? 'Gợi ý bị khóa ở chế độ Khó/Địa Ngục'
                  : 'Bật/Tắt gợi ý dịch nghĩa'
              }
            >
              <Icons.Info
                size={24}
                className={showHint && !isHintDisabled ? 'animate-pulse' : ''}
              />
            </button>

            {showHint && !isHintDisabled && currentQuestion.hint && (
              <div className="absolute top-14 z-20 px-6 py-3 bg-yellow-50 rounded-2xl text-sm md:text-base text-yellow-800 italic font-medium border border-yellow-200 text-center shadow-lg max-w-2xl w-full animate-in slide-in-from-top-2">
                {currentQuestion.hint}
              </div>
            )}

            <div className="mt-4 text-2xl md:text-3xl font-bold text-gray-800 text-center leading-relaxed w-full">
              {(currentQuestion.displaySentence || '')
                .split(/\[__________\]/g)
                .map((part, i, arr) => (
                  <React.Fragment key={i}>
                    <span
                      style={{
                        fontFamily: Utils?.getFontFamily(settings) || 'inherit',
                        fontWeight: settings?.fontWeight || 'bold'
                      }}
                    >
                      {part}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="inline-block w-32 border-b-4 border-gray-300 mx-2 mb-1"></span>
                    )}
                  </React.Fragment>
                ))}
            </div>
          </div>

          {/* 4 Từ gợi ý (Ẩn khi ở chế độ Địa Ngục) */}
          {displayOptions.length > 0 && !isHellMode && (
            <div className="w-full max-w-xl mx-auto mt-2 grid grid-cols-2 gap-3 px-4 animate-in fade-in">
              {displayOptions.map((opt, i) => (
                <div
                  key={i}
                  className="bg-gray-50 border-2 border-dashed border-gray-200 text-gray-600 font-bold py-3 px-4 rounded-xl text-center flex items-center justify-center min-h-[3.5rem] break-words shadow-sm opacity-90 cursor-not-allowed select-none"
                  title="Chỉ để nhìn, hãy gõ đáp án vào ô bên dưới"
                >
                  <span className="opacity-40 mr-2 text-xs bg-gray-200 px-1.5 py-0.5 rounded-md font-black">
                    {['A', 'B', 'C', 'D'][i]}
                  </span>
                  <span>{opt}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ô gõ đáp án */}
          <div className="mt-8 flex gap-3 w-full max-w-md animate-in slide-in-from-bottom-4">
            <input
              ref={inputRef}
              type="text"
              value={inputBuffer}
              onChange={(e) => setInputBuffer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkAnswer()}
              disabled={checkStatus === 'correct' || checkStatus === 'wrong'}
              className={`flex-1 p-5 text-center text-xl md:text-2xl font-bold border-4 rounded-2xl outline-none shadow-inner transition-colors ${
                checkStatus === 'correct'
                  ? 'border-green-400 bg-green-50 text-green-700'
                  : checkStatus === 'wrong'
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : checkStatus === 'wrong_retry'
                  ? 'border-orange-400 bg-orange-50 text-orange-700 animate-[shake_0.4s_ease-in-out]'
                  : isHellMode
                  ? 'border-purple-500 focus:border-purple-600 bg-purple-50 text-purple-900 placeholder-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                  : `border-${mainColor}-200 focus:border-${mainColor}-500 bg-white text-gray-800`
              }`}
              placeholder={
                isHellMode
                  ? 'ĐỊA NGỤC: Gõ đáp án...'
                  : 'Gõ đáp án (hoặc Pinyin: xiangzi)...'
              }
              autoComplete="off"
              spellCheck="false"
            />
            <button
              type="button"
              onClick={checkAnswer}
              disabled={
                !inputBuffer.trim() ||
                checkStatus === 'correct' ||
                checkStatus === 'wrong'
              }
              className={`px-6 bg-${
                isHellMode && checkStatus !== 'correct' && checkStatus !== 'wrong'
                  ? 'purple-600 hover:bg-purple-700'
                  : mainColor + '-600 hover:bg-' + mainColor + '-700'
              } text-white rounded-2xl font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-all`}
            >
              <Icons.Check size={32} />
            </button>
          </div>

          {checkStatus !== 'correct' && checkStatus !== 'wrong' && (
            <p
              className={`text-xs text-center font-medium mt-4 ${
                isHellMode ? 'text-purple-400' : 'text-gray-400'
              }`}
            >
              Bạn có {3 - attempts} lượt thử. Bấm Enter để kiểm tra.
            </p>
          )}

          {(checkStatus === 'correct' || checkStatus === 'wrong') && (
            <div
              className={`mt-8 w-full rounded-2xl animate-in slide-in-from-bottom-4 flex flex-col shadow-lg border-2 ${
                checkStatus === 'correct' ? 'border-green-200' : 'border-red-200'
              }`}
            >
              <div
                className={`p-4 ${
                  checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500'
                } text-white flex items-center justify-between px-6 font-bold rounded-t-xl relative`}
              >
                <div className="flex items-center gap-2 text-lg">
                  {checkStatus === 'correct' ? (
                    <Icons.CheckCircle size={24} />
                  ) : (
                    <Icons.X size={24} />
                  )}
                  {checkStatus === 'correct' ? 'CHÍNH XÁC!' : 'HẾT LƯỢT!'}
                </div>
              </div>
              <div className="p-6 bg-white rounded-b-xl flex flex-col items-center gap-4 text-center">
                <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                  Đáp án đúng là
                </span>
                <span className="text-3xl font-black text-green-600 tracking-wider bg-green-50 px-6 py-2 rounded-2xl border border-green-100">
                  {currentQuestion.targetWord}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-10 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
          {checkStatus === 'correct' || checkStatus === 'wrong' ? (
            <div className="w-full flex gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                  isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Xem ({resultTimer}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 bg-${
                  checkStatus === 'correct' ? 'green-500' : mainColor + '-600'
                } text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${
                        checkStatus === 'correct' ? 'green-600' : mainColor + '-700'
                      }`
                }`}
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                    Đang tải...
                  </>
                ) : (
                  <>
                    Tiếp theo <Icons.ChevronRight size={20} className="sm:w-6 sm:h-6" />
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSkip}
              disabled={aiWaitTime > 0 || isGenerating}
              className={`w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ${
                aiWaitTime > 0 || isGenerating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95'
              }`}
            >
              Bỏ qua <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_8_FillBlankSetup = FillBlankSetup;
  window.FillBlankSetup = FillBlankSetup;
  window.Block5_8_FillBlankPlayScreen = FillBlankPlayScreen;
  window.FillBlankPlayScreen = FillBlankPlayScreen;
}

export default FillBlankPlayScreen;