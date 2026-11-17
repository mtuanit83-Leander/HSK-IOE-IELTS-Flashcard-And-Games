// ============================================================================
// FILE 60/85: src/features/games/SpotMistakeUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.10 - SpotMistake Setup & PlayScreen UI V3.6)
// NHIỆM VỤ: Giao diện Cài đặt (SpotMistakeSetup) và Màn hình chơi chính
//           (SpotMistakePlayScreen) của trò chơi Tìm Lỗi Sai, hỗ trợ Shadow
//           Chunking đa hình Anh/Trung và gọi AI dịch/giải thích On-Demand.
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icons, SafeIcon } from '@/components/common/Icons';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

// Helper đọc cấu hình đã lưu từ LocalStorage an toàn
const getSavedSpotMistakeConfig = () => {
  try {
    const saved = localStorage.getItem('fc_spotmistake_config');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (SPOT MISTAKE SETUP)
// ============================================================================
export const SpotMistakeSetup = ({ mainColor = 'red', onStart, onBack }) => {
  const initialCfg = useMemo(() => getSavedSpotMistakeConfig(), []);

  const [sourceMode, setSourceMode] = useState(
    () => initialCfg.sourceMode ?? 'card'
  );
  const [difficulty, setDifficulty] = useState(
    () => initialCfg.difficulty ?? 'easy'
  ); // 'easy' | 'hard'
  const [timerMode, setTimerMode] = useState(
    () => initialCfg.timerMode ?? false
  );
  const [timeLimit, setTimeLimit] = useState(
    () => initialCfg.timeLimit ?? 30
  );

  const handleStart = () => {
    const config = {
      sourceMode,
      difficulty,
      timerMode,
      timeLimit
    };
    try {
      localStorage.setItem('fc_spotmistake_config', JSON.stringify(config));
    } catch (e) {
      console.warn('Save spotmistake config failed', e);
    }
    if (onStart) onStart(config);
  };

  // Vô hiệu hóa nút Chế độ nếu chọn AI Tự Sinh (vì mặc định dùng AI tạo lỗi)
  const isAiPure = sourceMode === 'ai_pure';

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-8 shrink-0 mt-2">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            Cấu hình Tìm Lỗi Sai
          </h2>
          <div className="w-10"></div>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {/* NGUỒN CÂU HỎI */}
          <div className="mb-6">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Nguồn câu hỏi
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode('card')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  sourceMode === 'card'
                    ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm text-${mainColor}-700`
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } active:scale-95`}
              >
                <Icons.Layers size={28} />
                <div className="text-center">
                  <div className="font-bold text-sm">Thẻ của tôi</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Dựa trên Flashcard có sẵn
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSourceMode('ai_pure')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  sourceMode === 'ai_pure'
                    ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm text-${mainColor}-700`
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } active:scale-95`}
              >
                <Icons.Sparkles size={28} />
                <div className="text-center">
                  <div className="font-bold text-sm">AI Tự Sinh</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Tạo lỗi sai mới vô tận
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* CHẾ ĐỘ ĐỘ KHÓ */}
          <div
            className={`mb-8 transition-all duration-300 ${
              isAiPure ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'
            }`}
          >
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDifficulty('easy')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  difficulty === 'easy'
                    ? 'border-emerald-500 bg-emerald-50 shadow-sm text-emerald-700'
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } active:scale-95`}
              >
                <Icons.CheckCircle size={24} />
                <div className="text-center">
                  <div className="font-bold text-sm">Chế độ Dễ</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Mở gợi ý & Bóp méo cơ bản
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDifficulty('hard')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                  difficulty === 'hard'
                    ? 'border-red-500 bg-red-50 shadow-sm text-red-600'
                    : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
                } active:scale-95`}
              >
                <Icons.AlertCircle size={24} />
                <div className="text-center">
                  <div className="font-bold text-sm">Chế độ Khó</div>
                  <div className="text-[10px] mt-0.5 opacity-70">
                    Khóa gợi ý & Thử thách AI
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* CẤU HÌNH THỜI GIAN */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 transition-all mb-6">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span
                  className={`font-bold flex items-center gap-2 text-${mainColor}-700`}
                >
                  <Icons.Clock size={18} /> Giới hạn thời gian
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  {timerMode ? `${timeLimit} giây / câu` : 'Không giới hạn'}
                </span>
              </div>
              <div
                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors relative flex items-center ${
                  timerMode ? `bg-${mainColor}-500` : 'bg-gray-300'
                }`}
                onClick={() => setTimerMode(!timerMode)}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                    timerMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                ></div>
              </div>
            </div>

            {timerMode && (
              <div className="flex justify-center gap-2 mt-4 pt-4 border-t border-gray-200/60 animate-in fade-in">
                <span className="text-xs font-bold text-gray-400 self-center mr-2 uppercase tracking-wide">
                  Chọn mức:
                </span>
                {[15, 30, 45, 60].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTimeLimit(sec)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      timeLimit === sec
                        ? `bg-${mainColor}-500 text-white shadow-md scale-105`
                        : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full pt-4 shrink-0 bg-white pb-safe mt-auto">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 bg-${mainColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg`}
          >
            <Icons.Play size={24} fill="currentColor" /> BẮT ĐẦU SĂN LỖI
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (SPOT MISTAKE PLAY SCREEN)
// ============================================================================
export const SpotMistakePlayScreen = ({
  mainColor = 'red',
  config,
  currentQuestion,
  chunks,
  stage,
  selectedIndices = [],
  inputBuffer,
  setInputBuffer,
  checkStatus,
  attempts,
  combo,
  playedCount,
  time,
  isFinished,
  isGenerating,
  correctCount,
  wrongCount,
  handleSpotClick,
  handleCheckSpot,
  handleCorrectionSubmit,
  handleSkip,
  nextRound,
  onBack,
  onEndGame,
  onSaveToNotebook,
  isBookmarked,
  resultTimer,
  isResultPaused,
  toggleResultPause,
  timeLeft,
  queueLength,
  aiWaitTime,
  onRequestExplanation,
  isExplaining,
  handleRequestHint,
  isTranslating
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const inputRef = useRef(null);

  // [VẮC-XIN PHÒNG THỦ ĐA NHIỆM] Đảm bảo luôn trích xuất 1 Chuỗi duy nhất từ Level
  const safeLevelStr = getSafeLevelString(config?.level, 'level_4');

  // Auto-focus ô nhập liệu ở Giai đoạn 2
  useEffect(() => {
    if (
      stage === 'correct' &&
      inputRef.current &&
      checkStatus !== 'success' &&
      checkStatus !== 'failed'
    ) {
      inputRef.current.focus();
    }
  }, [stage, checkStatus]);

  // Tắt Hint khi sang câu mới (Bọc bất đồng bộ chuẩn React Hooks)
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentQuestion]);

  const isHardMode = config?.difficulty === 'hard';

  // THUẬT TOÁN SHADOW CHUNKING ĐA HÌNH
  const isChinese = /[\u4e00-\u9fa5]/.test(currentQuestion?.wrongSentence || '');
  const displayChunks = useMemo(() => {
    if (!currentQuestion || !chunks) return [];
    const wrongWordStr = String(currentQuestion.wrongWord || '');
    const wrongWordLower = wrongWordStr.toLowerCase();

    if (isChinese) {
      const charArray = [];
      chunks.forEach((chunk, chunkIdx) => {
        const chars = Array.from(chunk.text || '');
        chars.forEach((char, charIdx) => {
          charArray.push({
            id: `char_${chunkIdx}_${charIdx}`,
            text: char,
            parentChunkIndex: chunkIdx,
            isTargetMatch:
              (chunk.text || '').toLowerCase().includes(wrongWordLower) ||
              char === wrongWordStr
          });
        });
      });
      return charArray;
    }

    return chunks.map((chunk, idx) => ({
      ...chunk,
      parentChunkIndex: idx,
      isTargetMatch: (chunk.text || '').toLowerCase().includes(wrongWordLower)
    }));
  }, [currentQuestion, chunks, isChinese]);

  // Tính toán chuỗi văn bản đang được chọn để hiển thị ở Giai đoạn 2
  const textToFix = useMemo(() => {
    if (!chunks || selectedIndices.length === 0) return '';
    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
    return sortedIndices
      .map((idx) => chunks[idx]?.text)
      .filter(Boolean)
      .join(isChinese ? '' : ' ');
  }, [selectedIndices, chunks, isChinese]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (
        stage === 'correct' &&
        (checkStatus === 'correct_spot' || checkStatus === 'wrong_correct')
      ) {
        handleCorrectionSubmit(textToFix);
      } else if (checkStatus === 'success' || checkStatus === 'failed') {
        nextRound();
      }
    }
  };

  // Hàm xử lý Bookmark thông minh
  const handleBookmarkClick = (e) => {
    e.stopPropagation();
    if (!currentQuestion || !onSaveToNotebook) return;

    let cleanCorrectSentence = '';
    let correctSentenceWithUnderline = '';

    if (currentQuestion.wrongSentence && currentQuestion.wrongWord) {
      const escapeRegExp = (string) =>
        String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeWrong = escapeRegExp(currentQuestion.wrongWord);
      let regex;
      try {
        regex = new RegExp(`\\b${safeWrong}\\b`, 'ig');
      } catch {
        regex = new RegExp(safeWrong, 'i');
      }
      if (!regex.test(currentQuestion.wrongSentence)) {
        regex = new RegExp(safeWrong, 'i');
      }

      cleanCorrectSentence = currentQuestion.wrongSentence.replace(
        regex,
        currentQuestion.correction || ''
      );
      regex.lastIndex = 0;
      const underlinedCorrection = currentQuestion.correction
        ? currentQuestion.correction
            .split('')
            .map((c) => c + '\u0332')
            .join('')
        : '';
      correctSentenceWithUnderline = currentQuestion.wrongSentence.replace(
        regex,
        underlinedCorrection
      );
    }

    onSaveToNotebook({
      isSmartTarget: true,
      display: correctSentenceWithUnderline || currentQuestion.wrongSentence,
      save: cleanCorrectSentence || currentQuestion.wrongSentence,
      analysis: currentQuestion.explanation || ''
    });
  };

  if (isGenerating && !currentQuestion) {
    // Nếu là chế độ Dễ Offline, hiển thị lớp phủ mờ nhanh
    if (config?.sourceMode === 'card' && config?.difficulty === 'easy') {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none animate-pulse">
          <div
            className={`w-8 h-8 border-4 border-${mainColor}-200 border-t-${mainColor}-500 rounded-full animate-spin`}
          ></div>
        </div>
      );
    }

    return (
      <GlobalLoadingScreen
        onCancel={onBack}
        queueLength={queueLength}
        text={
          config?.sourceMode === 'ai_pure'
            ? 'AI đang sáng tác thử thách...'
            : 'Đang thiết lập trò chơi...'
        }
        mainColor={mainColor}
        levelStr={
          config?.sourceMode === 'ai_pure'
            ? safeLevelStr.replace('level_', '').replace(/_/g, ' ').toUpperCase()
            : ''
        }
      />
    );
  }

  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300">
        <div
          className={`w-24 h-24 bg-${mainColor}-100 text-${mainColor}-500 rounded-full flex items-center justify-center mb-6 shadow-inner`}
        >
          <SafeIcon name="Brain" size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">
          Thử thách kết thúc!
        </h2>
        <p className="text-gray-500 mb-8 text-center max-w-xs">
          Bạn đã hoàn thành việc rà soát lỗi sai xuất sắc!
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Thời gian
            </div>
            <div className={`text-xl font-bold text-${mainColor}-600`}>
              {formatGameTime(time)}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm text-center">
            <div className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.Check size={12} /> Đúng
            </div>
            <div className="text-xl font-bold text-green-600">
              {correctCount}
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm text-center">
            <div className="text-[10px] text-red-400 font-bold uppercase mb-1 flex items-center justify-center gap-1">
              <Icons.X size={12} /> Sai
            </div>
            <div className="text-xl font-bold text-red-500">{wrongCount}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            onEndGame({ correct: correctCount, time: time, wrong: wrongCount })
          }
          className={`w-full max-w-xs py-4 rounded-xl bg-${mainColor}-600 text-white font-bold text-lg hover:bg-${mainColor}-700 shadow-lg transition-all active:scale-95`}
        >
          Hoàn tất
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="w-full flex flex-col h-full bg-gray-50 relative overflow-hidden">
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
              Bạn đang ở chế độ vô tận. Bấm Kết thúc để xem tổng hợp kết quả của
              phiên này.
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
      <div className="flex justify-between items-center p-3 sm:p-4 bg-white border-b border-gray-200 shrink-0 z-10 shadow-sm relative">
        <button
          type="button"
          onClick={onBack}
          className="p-2 text-gray-400 hover:text-red-500 rounded-lg transition-colors hover:bg-gray-100"
          title="Tạm dừng / Quay lại"
        >
          <SafeIcon name="ChevronLeft" size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-center">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-50 border px-2 py-1 rounded hidden sm:block">
            LEVEL {safeLevelStr.match(/\d+/)?.[0] || '4'}
          </div>
          <div className="text-xs sm:text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full shadow-inner flex items-center gap-1">
            Câu {playedCount + 1}{' '}
            <Icons.InfinityIcon size={14} className="text-gray-400 ml-0.5" />
          </div>
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
            🔥 x{combo}
          </div>
          <div
            className={`text-lg sm:text-xl font-mono font-bold text-${mainColor}-600 w-12 text-right hidden sm:block`}
          >
            {time}s
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {currentQuestion?.origin?._isRescued || currentQuestion?._isRescued ? (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 shadow-sm">
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn:
              Dự phòng
            </span>
          ) : currentQuestion?.isAiGenerated ? (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm">
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-blue-50 text-blue-600 border border-blue-200">
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {aiWaitTime > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse">
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}

          <button
            type="button"
            onClick={handleBookmarkClick}
            className={`p-2 rounded-lg transition-colors ${
              isBookmarked
                ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
            }`}
          >
            <Icons.Bookmark
              size={20}
              fill={isBookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>

      {/* BODY: KHU VỰC NỘI DUNG CHÍNH */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 flex flex-col items-center gap-8 relative">
        {config?.timerMode &&
          checkStatus !== 'success' &&
          checkStatus !== 'failed' &&
          !isGenerating && (
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
              <div
                className={`h-full transition-all duration-1000 ease-linear ${
                  timeLeft <= 5 ? 'bg-red-500' : `bg-${mainColor}-500`
                }`}
                style={{
                  width: `${(timeLeft / (config.timeLimit || 30)) * 100}%`
                }}
              ></div>
            </div>
          )}

        {/* 1. KHU VỰC BÓNG ĐÈN GỢI Ý & DỊCH THUẬT ON-DEMAND */}
        <div className="flex flex-col items-center gap-2 w-full mb-2 mt-2 relative">
          <button
            type="button"
            onClick={() => !isHardMode && setShowHint(!showHint)}
            disabled={isHardMode}
            className={`p-3 rounded-full flex items-center justify-center transition-all shadow-sm border ${
              isHardMode
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed border border-gray-200'
                : showHint
                ? 'bg-yellow-100 text-yellow-600 border border-yellow-300'
                : 'bg-white border border-gray-200 text-gray-400 hover:text-yellow-500 hover:border-yellow-300 hover:shadow-md active:scale-95'
            }`}
            title={
              isHardMode
                ? 'Gợi ý bị khóa ở chế độ Khó'
                : 'Bật/Tắt gợi ý dịch nghĩa'
            }
          >
            <Icons.Info
              size={24}
              className={showHint && !isHardMode ? 'animate-pulse' : ''}
            />
          </button>

          {showHint && !isHardMode && (
            <div className="absolute top-14 z-20 px-6 py-3 bg-yellow-50 rounded-2xl text-sm md:text-base text-yellow-800 italic font-medium border border-yellow-200 text-center shadow-lg max-w-2xl w-full animate-in slide-in-from-top-2">
              {currentQuestion.origin?.definition || currentQuestion.hint ? (
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-1">
                    — Ý NGHĨA CÂU VĂN —
                  </span>
                  {currentQuestion.origin?.definition || currentQuestion.hint}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-gray-500 text-sm">
                    Câu này chưa có bản dịch.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRequestHint && handleRequestHint()}
                    disabled={isTranslating}
                    className="px-4 py-2 bg-yellow-400 text-yellow-900 font-bold rounded-lg shadow-sm hover:bg-yellow-500 transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    {isTranslating ? (
                      <div className="w-4 h-4 border-2 border-yellow-900 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Icons.Sparkles size={16} />
                    )}
                    Nhờ AI dịch nghĩa
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. KHU VỰC WORD BRICKS ĐA HÌNH (Language-Aware & Multi-Select Chunking) */}
        <div
          className={`w-full max-w-4xl flex flex-wrap justify-center relative z-10 ${
            isChinese ? 'gap-0 md:gap-0.5' : 'gap-3'
          }`}
        >
          {displayChunks.map((chunkObj) => {
            const isSelected = selectedIndices?.includes(
              chunkObj.parentChunkIndex
            );
            const isFailed = checkStatus === 'failed';
            const isSuccess = checkStatus === 'success';
            let brickClass = '';

            if (isChinese) {
              // --- Giao diện Tiếng Trung ---
              brickClass = `text-2xl md:text-3xl lg:text-4xl font-bold transition-all duration-200 border-b-[3px] border-transparent hover:text-${mainColor}-500 px-0.5 cursor-pointer leading-loose`;
              if (stage === 'spot') {
                if (isSelected) {
                  if (checkStatus === 'wrong_spot') {
                    brickClass =
                      'text-red-500 bg-red-50 rounded animate-[shake_0.4s_ease-in-out] border-b-[3px] border-red-500 px-1 mx-0.5 z-20 relative';
                  } else {
                    brickClass =
                      'text-yellow-600 bg-yellow-100 rounded scale-110 shadow-sm border-b-[3px] border-yellow-400 z-20 relative px-1 mx-0.5';
                  }
                }
              } else if (stage === 'correct') {
                if (isSelected) {
                  brickClass =
                    'text-yellow-600 bg-yellow-100 rounded scale-110 shadow-sm border-b-[3px] border-yellow-400 z-20 relative px-1 mx-0.5';
                } else {
                  brickClass =
                    'text-gray-300 opacity-40 blur-[1px] cursor-not-allowed';
                }
              }
              if (isFailed || isSuccess) {
                if (chunkObj.isTargetMatch) {
                  brickClass = isSuccess
                    ? 'text-green-600 bg-green-100 rounded border-b-[3px] border-green-500 px-1 mx-0.5'
                    : 'text-red-500 bg-red-100 rounded border-b-[3px] border-red-500 line-through px-1 mx-0.5';
                } else {
                  brickClass = 'text-gray-300 opacity-50 blur-[1px]';
                }
              }
            } else {
              // --- Giao diện Tiếng Anh/Việt ---
              brickClass = `px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-white border-gray-200 text-gray-800 hover:border-${mainColor}-400 hover:shadow-md`;
              if (stage === 'spot') {
                if (isSelected) {
                  if (checkStatus === 'wrong_spot') {
                    brickClass =
                      'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-red-50 border-red-500 text-red-700 animate-[shake_0.4s_ease-in-out] z-20 relative';
                  } else {
                    brickClass =
                      'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-yellow-50 border-yellow-400 text-yellow-700 scale-105 shadow-md font-bold ring-2 ring-yellow-200 z-20 relative';
                  }
                }
              } else if (stage === 'correct') {
                if (isSelected) {
                  brickClass =
                    'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-yellow-50 border-yellow-400 text-yellow-700 scale-105 shadow-md font-bold ring-2 ring-yellow-200 z-20 relative';
                } else {
                  brickClass =
                    'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-gray-100 border-gray-200 text-gray-400 opacity-30 blur-[1px] cursor-not-allowed';
                }
              }
              if (isFailed || isSuccess) {
                if (chunkObj.isTargetMatch) {
                  brickClass = isSuccess
                    ? 'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-green-500 border-green-600 text-white shadow-md font-bold'
                    : 'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-red-500 border-red-600 text-white line-through font-bold shadow-md';
                } else {
                  brickClass =
                    'px-4 py-3 rounded-xl border-2 text-xl md:text-2xl transition-all duration-300 active:scale-95 bg-gray-100 border-gray-200 text-gray-400 opacity-50 blur-[1px]';
                }
              }
            }

            return (
              <button
                key={chunkObj.id}
                type="button"
                onClick={() =>
                  handleSpotClick && handleSpotClick(chunkObj.parentChunkIndex)
                }
                disabled={stage !== 'spot' || isFailed || isSuccess}
                className={brickClass}
              >
                {chunkObj.text}
              </button>
            );
          })}
        </div>

        {/* 2.5 NÚT KIỂM TRA THỦ CÔNG (MANUAL CHECK) */}
        {stage === 'spot' &&
          checkStatus !== 'success' &&
          checkStatus !== 'failed' && (
            <div className="w-full flex justify-center mt-6 animate-in slide-in-from-bottom-4 z-20">
              <button
                type="button"
                onClick={handleCheckSpot}
                disabled={
                  !selectedIndices ||
                  selectedIndices.length === 0 ||
                  checkStatus === 'wrong_spot'
                }
                className={`px-8 py-4 rounded-2xl font-bold text-xl flex items-center gap-2 shadow-lg transition-all ${
                  selectedIndices?.length > 0
                    ? `bg-${mainColor}-600 text-white hover:bg-${mainColor}-700 active:scale-95`
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Icons.CheckCircle size={28} /> Kiểm tra
              </button>
            </div>
          )}

        {stage === 'spot' &&
          checkStatus !== 'success' &&
          checkStatus !== 'failed' && (
            <p className="text-xs text-gray-400 italic mt-2">
              Chạm để chọn các từ bị sai. Bấm lần nữa để hủy chọn.
            </p>
          )}

        {/* 3. KHU VỰC NHẬP LIỆU (GIAI ĐOẠN 2) */}
        {stage === 'correct' &&
          checkStatus !== 'success' &&
          checkStatus !== 'failed' && (
            <div className="w-full max-w-lg mt-4 animate-in zoom-in relative z-20">
              <div className="flex flex-col items-center gap-4">
                <div className="text-center mb-1">
                  <span className="text-gray-500 text-sm font-bold uppercase tracking-widest block mb-1">
                    Sửa lại cụm:
                  </span>
                  <div className="text-2xl font-black text-red-500 line-through bg-red-50 px-4 py-2 rounded-xl border border-red-100">
                    {textToFix}
                  </div>
                </div>
                <div className="flex w-full gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputBuffer}
                    onChange={(e) => setInputBuffer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`flex-1 p-4 text-center text-2xl font-bold border-4 rounded-2xl outline-none transition-all ${
                      checkStatus === 'wrong_correct'
                        ? 'border-orange-400 bg-orange-50 text-orange-700 animate-[shake_0.4s_ease-in-out]'
                        : `border-${mainColor}-200 focus:border-${mainColor}-500 focus:ring-4 focus:ring-${mainColor}-100 bg-white text-gray-800 shadow-xl`
                    }`}
                    placeholder="Nhập từ đúng..."
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <button
                    type="button"
                    onClick={() => handleCorrectionSubmit(textToFix)}
                    className={`px-6 bg-${mainColor}-600 text-white rounded-2xl font-bold shadow-lg hover:bg-${mainColor}-700 transition-all active:scale-95`}
                  >
                    <Icons.Check size={28} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 italic">
                  Gợi ý: Bạn còn {3 - attempts} lượt thử sửa lỗi.
                </p>
              </div>
            </div>
          )}

        {/* 4. HIỂN THỊ GIẢI THÍCH & NÚT LƯU THẺ */}
        {(checkStatus === 'success' || checkStatus === 'failed') && (
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-gray-100 overflow-visible animate-in slide-in-from-bottom-6 z-30 mt-6">
            <div
              className={`p-4 ${
                checkStatus === 'success' ? 'bg-green-500' : 'bg-red-500'
              } text-white flex items-center justify-between px-6 font-bold rounded-t-2xl relative`}
            >
              <div className="flex items-center gap-2">
                {checkStatus === 'success' ? <Icons.CheckCircle /> : <Icons.X />}
                {checkStatus === 'success' ? 'SỬA LỖI XUẤT SẮC!' : 'HẾT LƯỢT!'}
              </div>
              <button
                type="button"
                onClick={handleBookmarkClick}
                className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors shadow-sm"
              >
                <Icons.Bookmark
                  size={14}
                  fill={isBookmarked ? 'white' : 'none'}
                />{' '}
                {isBookmarked ? 'Đã lưu' : 'Lưu vào Sổ tay'}
              </button>
            </div>

            <div className="p-6 space-y-4 bg-white rounded-b-2xl">
              <div className="flex justify-between items-center border-b pb-4">
                <div className="text-center flex-1 border-r px-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                    Bị sai
                  </div>
                  <div className="text-xl font-bold text-red-500 line-through break-words">
                    {currentQuestion.wrongWord}
                  </div>
                </div>
                <div className="text-center flex-1 px-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                    Sửa đúng
                  </div>
                  <div className="text-xl font-bold text-green-600 break-words">
                    {currentQuestion.correction}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {currentQuestion.explanation &&
                currentQuestion.explanation.length > 10 ? (
                  <div>
                    <div
                      className={`text-xs font-bold text-${mainColor}-400 uppercase mb-1 flex items-center gap-1`}
                    >
                      <Icons.Sparkles size={14} /> Phân tích ngữ pháp
                    </div>
                    <p className="text-gray-700 leading-relaxed italic text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                ) : (
                  <div className="flex justify-center w-full mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        onRequestExplanation && onRequestExplanation()
                      }
                      disabled={isExplaining}
                      className={`w-full py-3 bg-${mainColor}-50 text-${mainColor}-700 rounded-xl text-sm font-bold border border-${mainColor}-200 hover:bg-${mainColor}-100 flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50`}
                    >
                      {isExplaining ? (
                        <>
                          <div
                            className={`w-4 h-4 border-2 border-${mainColor}-600 border-t-transparent rounded-full animate-spin`}
                          ></div>{' '}
                          Đang nhờ AI phân tích...
                        </>
                      ) : (
                        <>
                          <Icons.Sparkles size={18} /> Gọi AI phân tích lỗi sai
                          này
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        <button
          type="button"
          onClick={() => setShowConfirmEnd(true)}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
          {checkStatus === 'success' || checkStatus === 'failed' ? (
            <div className="w-full flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => toggleResultPause && toggleResultPause()}
                className={`flex-1 py-3 sm:py-4 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                  isResultPaused
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-300 shadow-inner'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isResultPaused ? (
                  <>
                    <Icons.Play size={16} fill="currentColor" /> Đã dừng
                  </>
                ) : (
                  <>
                    <Icons.Pause size={16} fill="currentColor" /> Xem (
                    {resultTimer}s)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={nextRound}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 bg-${
                  checkStatus === 'success' ? 'green-500' : mainColor + '-600'
                } text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${
                        checkStatus === 'success'
                          ? 'green-600'
                          : mainColor + '-700'
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
                    Tiếp theo{' '}
                    <Icons.ChevronRight size={20} className="sm:w-6 sm:h-6" />
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
              Bỏ qua câu này{' '}
              <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
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
  window.Block5_10_SpotMistakeSetup = SpotMistakeSetup;
  window.SpotMistakeSetup = SpotMistakeSetup;
  window.Block5_10_SpotMistakePlayScreen = SpotMistakePlayScreen;
  window.SpotMistakePlayScreen = SpotMistakePlayScreen;
}

export default SpotMistakePlayScreen;