// ============================================================================
// FILE 70/85: src/features/games/ReadingUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.23 - Reading Setup & PlayScreen UI V1.05)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 25/11/2026 - 21:38 (GMT+7)
// NHIỆM VỤ: Giao diện Cài đặt (ReadingSetup) và Màn hình chơi chia đôi
//           (ReadingPlayScreen - Split View) cho trò chơi Thám Tử Đọc Hiểu.
//           Nâng cấp Ver 1.1 (Vá sạch 3/3 lỗi tsc / checkJs):
//           1. Diệt ts(2741) tại <MenuToggle>: Truyền tường minh disabled={false}.
//           2. Diệt ts(2741) & ts(2739) tại 2 thẻ <GlobalLoadingScreen>:
//              Truyền tường minh onComplete={undefined} và onCancel={onBackAction}.
//           3. Gán mặc định = undefined cho toàn bộ prop tùy chọn của
//              ReadingSetup & ReadingPlayScreen đảm bảo 0 lỗi khi ReadingGame gọi.
//           4. Bảo toàn 100% nâng cấp Ver 1.0 (0/0/0 Radar, gỡ khóa oan Phanh AI
//              giữa các câu con, Utils.advancedNormalize, Bookmark TFNG chuẩn 12 cột,
//              bảng màu tĩnh READING_COLOR_THEMES & A11y Modal/Escape).
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getSafeLevelString, formatGameTime } from './common/gameHelpers';

// Bảng màu tĩnh an toàn tuyệt đối với Tailwind JIT Compiler
const READING_COLOR_THEMES = {
  slate: {
    selectedCard: 'border-slate-500 bg-slate-50 shadow-md',
    selectedIcon: 'bg-slate-600 text-white',
    selectedText: 'text-slate-700',
    checkIcon: 'text-slate-600',
    primaryBtn: 'bg-slate-700 hover:bg-slate-800',
    awardBadge: 'bg-slate-100 text-slate-600',
    scoreText: 'text-slate-700',
    progressBar: 'bg-slate-600',
    headerTitle: 'text-slate-700',
    timerNormal: 'text-slate-700',
    optionHover: 'hover:bg-slate-50 hover:border-slate-300',
    subHeaderLabel: 'text-slate-600',
    blankBorder: 'border-slate-400',
    inputNormal: 'border-slate-200 focus:border-slate-500'
  },
  indigo: {
    selectedCard: 'border-indigo-500 bg-indigo-50 shadow-md',
    selectedIcon: 'bg-indigo-600 text-white',
    selectedText: 'text-indigo-700',
    checkIcon: 'text-indigo-600',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700',
    awardBadge: 'bg-indigo-100 text-indigo-600',
    scoreText: 'text-indigo-600',
    progressBar: 'bg-indigo-500',
    headerTitle: 'text-indigo-700',
    timerNormal: 'text-indigo-700',
    optionHover: 'hover:bg-indigo-50 hover:border-indigo-300',
    subHeaderLabel: 'text-indigo-600',
    blankBorder: 'border-indigo-300',
    inputNormal: 'border-indigo-200 focus:border-indigo-500'
  },
  sky: {
    selectedCard: 'border-sky-500 bg-sky-50 shadow-md',
    selectedIcon: 'bg-sky-600 text-white',
    selectedText: 'text-sky-700',
    checkIcon: 'text-sky-600',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700',
    awardBadge: 'bg-sky-100 text-sky-600',
    scoreText: 'text-sky-600',
    progressBar: 'bg-sky-500',
    headerTitle: 'text-sky-700',
    timerNormal: 'text-sky-700',
    optionHover: 'hover:bg-sky-50 hover:border-sky-300',
    subHeaderLabel: 'text-sky-600',
    blankBorder: 'border-sky-300',
    inputNormal: 'border-sky-200 focus:border-sky-500'
  },
  red: {
    selectedCard: 'border-red-500 bg-red-50 shadow-md',
    selectedIcon: 'bg-red-600 text-white',
    selectedText: 'text-red-700',
    checkIcon: 'text-red-600',
    primaryBtn: 'bg-red-600 hover:bg-red-700',
    awardBadge: 'bg-red-100 text-red-600',
    scoreText: 'text-red-600',
    progressBar: 'bg-red-500',
    headerTitle: 'text-red-700',
    timerNormal: 'text-red-700',
    optionHover: 'hover:bg-red-50 hover:border-red-300',
    subHeaderLabel: 'text-red-600',
    blankBorder: 'border-red-300',
    inputNormal: 'border-red-200 focus:border-red-500'
  },
  emerald: {
    selectedCard: 'border-emerald-500 bg-emerald-50 shadow-md',
    selectedIcon: 'bg-emerald-600 text-white',
    selectedText: 'text-emerald-700',
    checkIcon: 'text-emerald-600',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700',
    awardBadge: 'bg-emerald-100 text-emerald-600',
    scoreText: 'text-emerald-600',
    progressBar: 'bg-emerald-500',
    headerTitle: 'text-emerald-700',
    timerNormal: 'text-emerald-700',
    optionHover: 'hover:bg-emerald-50 hover:border-emerald-300',
    subHeaderLabel: 'text-emerald-600',
    blankBorder: 'border-emerald-300',
    inputNormal: 'border-emerald-200 focus:border-emerald-500'
  }
};

const VALID_TIME_LIMITS = [180, 300, 420, 600];
const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Trích xuất tiêu đề hiển thị sạch cho bài đọc
const resolvePassageTitle = (passageData) => {
  const explicitTitle = String(passageData?.title || '').trim();
  if (explicitTitle) return explicitTitle;

  const firstLine = String(passageData?.passage || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return 'Reading Passage';
  return firstLine.length > 65 ? `${firstLine.slice(0, 65).trim()}...` : firstLine;
};

// Định dạng nhãn cấp độ đẹp cho màn hình chờ
const formatReadingLevelBadge = (levelStr) => {
  const cleaned = String(levelStr || '')
    .replace(/^(en|zh)_/i, '')
    .replace(/^level_/i, 'LEVEL ')
    .replace(/_/g, ' ')
    .trim();
  return cleaned.toUpperCase();
};

// Lấy chuỗi văn bản sạch từ phương án (hỗ trợ cả string lẫn object { text })
const extractOptionText = (opt) =>
  typeof opt === 'object' && opt !== null ? String(opt.text || opt.term || '') : String(opt || '');

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (READING SETUP)
// ============================================================================
export const ReadingSetup = ({
  mainColor = 'slate',
  onStart = undefined,
  onBack = undefined
}) => {
  const theme = READING_COLOR_THEMES[mainColor] || READING_COLOR_THEMES.slate;

  const savedConfig = useMemo(() => {
    const parsed = Utils.safeJsonParse('fc_reading_config', null);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }, []);

  const [sourceMode, setSourceMode] = useState(
    () => savedConfig?.sourceMode || 'ai_pure'
  );
  // Đọc hiểu thường cần canh giờ tổng cho cả đoạn văn (Mặc định: 5 phút = 300s)
  const [timerMode, setTimerMode] = useState(
    () => (savedConfig?.timerMode !== undefined ? Boolean(savedConfig.timerMode) : true)
  );
  const [timeLimit, setTimeLimit] = useState(() => {
    const num = Number(savedConfig?.timeLimit);
    return VALID_TIME_LIMITS.includes(num) ? num : 300;
  });

  const handleStart = () => {
    const safeLimit = VALID_TIME_LIMITS.includes(Number(timeLimit))
      ? Number(timeLimit)
      : 300;
    const config = {
      sourceMode,
      aiMode: true,
      timerMode: Boolean(timerMode),
      timeLimit: safeLimit
    };
    Utils.safeLocalStorageSet('fc_reading_config', config);
    if (typeof onStart === 'function') onStart(config);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col items-center mx-auto w-full max-w-2xl h-full animate-in slide-in-from-right-8 p-4">
        <div className="w-full flex items-center justify-between mb-6 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
            title="Quay lại"
            aria-label="Quay lại Menu"
          >
            <Icons.ChevronLeft size={24} />
          </button>
          <h2 className="text-xl font-bold text-gray-800">
            Cấu hình: Thám Tử Đọc Hiểu
          </h2>
          <div className="w-10"></div>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {/* Nguồn dữ liệu */}
          <div className="mb-6">
            <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
              Nguồn dữ liệu
            </label>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode('ai_pure')}
                className={`p-4 rounded-2xl border-2 flex items-center gap-4 transition-all ${
                  sourceMode === 'ai_pure'
                    ? theme.selectedCard
                    : 'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <div
                  className={`p-3 rounded-xl ${
                    sourceMode === 'ai_pure'
                      ? theme.selectedIcon
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <Icons.Sparkles size={24} />
                </div>
                <div className="text-left flex-1">
                  <div
                    className={`font-bold text-lg ${
                      sourceMode === 'ai_pure'
                        ? theme.selectedText
                        : 'text-gray-700'
                    }`}
                  >
                    AI Sáng Tác Đoạn Văn
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Tạo bài đọc học thuật & câu hỏi (TFNG, MCQ, Điền từ) vô tận
                  </div>
                </div>
                {sourceMode === 'ai_pure' && (
                  <Icons.CheckCircle size={20} className={theme.checkIcon} />
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 italic text-center">
              * Dạng bài Đọc Hiểu đòi hỏi xử lý văn bản lớn, cần API Key để hoạt
              động.
            </p>
          </div>

          {/* Cấu hình Timer (Canh giờ tổng cho nguyên đoạn văn) */}
          {MenuToggle && (
            <MenuToggle
              active={timerMode}
              setActive={setTimerMode}
              icon={Icons.Clock}
              color="orange"
              disabled={false}
              title="Canh giờ (Cho 1 Đoạn Văn)"
              subtitle={
                timerMode
                  ? `${Math.round(timeLimit / 60)} phút / đoạn`
                  : 'Thoải mái thời gian'
              }
              extra={
                <div className="mt-3 pt-2 border-t border-orange-100 flex flex-col gap-2 animate-in fade-in">
                  <span className="text-[10px] font-bold text-orange-400 uppercase">
                    Khuyến nghị: 5 phút/đoạn (IELTS)
                  </span>
                  <div className="flex gap-2 w-full">
                    {VALID_TIME_LIMITS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTimeLimit(sec);
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                          timeLimit === sec
                            ? 'bg-orange-500 text-white border-orange-500 shadow-md scale-105'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50'
                        }`}
                      >
                        {sec / 60} phút
                      </button>
                    ))}
                  </div>
                </div>
              }
            />
          )}
        </div>

        <div className="w-full mt-4 pt-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={handleStart}
            className={`w-full py-4 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-transform text-lg ${theme.primaryBtn}`}
          >
            <Icons.BookOpen size={24} fill="currentColor" /> LUYỆN ĐỌC NGAY
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH CHƠI CHÍNH (READING PLAY SCREEN - SPLIT VIEW)
// ============================================================================
export const ReadingPlayScreen = ({
  mainColor = 'slate',
  config = undefined,
  passageData = undefined,
  currentSubQuestion = undefined,
  subIndex = 0,
  totalSubQuestions = 0,
  inputBuffer = '',
  setInputBuffer = undefined,
  typeInputRef = undefined,
  checkStatus = 'idle',
  selectedOptionIndex = null,
  attempts = 0,
  score = 0,
  combo = 1,
  playedCount = 0,
  time = 0,
  timeLeft = 300,
  isFinished = false,
  isGenerating = false,
  aiCountdown = 0,
  queueLength = 0,
  correctCount = 0,
  wrongCount = 0,
  resultTimer = 0,
  isResultPaused = false,
  aiWaitTime = 0,
  handleOptionClick = undefined,
  handleFillSubmit = undefined,
  handleSkip = undefined,
  nextRound = undefined,
  handleNext = undefined,
  handleSaveAndBack = undefined,
  onBack = undefined,
  onSaveToNotebook = undefined,
  isBookmarked = false,
  toggleResultPause = undefined,
  onEndGame = undefined
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  const theme = READING_COLOR_THEMES[mainColor] || READING_COLOR_THEMES.slate;
  const effectiveLang = config?.lang === 'zh' ? 'zh' : 'en';
  const safeLevelStr = getSafeLevelString(config?.level, 'level_8_academic');
  const onBackAction = onBack || handleSaveAndBack;
  const onNextAction = nextRound || handleNext;

  // Chỉ áp dụng Phanh AI (aiWaitTime) ở câu cuối cùng trước khi chuyển sang đoạn văn mới
  const isLastSubQuestion =
    totalSubQuestions > 0 && subIndex >= totalSubQuestions - 1;
  const isBlockedByAiCooldown = isLastSubQuestion && aiWaitTime > 0;

  // Đóng Modal xác nhận thoát bằng phím Escape (A11y)
  useEffect(() => {
    if (!showConfirmEnd) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowConfirmEnd(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showConfirmEnd]);

  // So sánh chuẩn hóa NFC / không phân biệt hoa thường / dấu câu khớp 100% ReadingGame.jsx
  const isMatchingAnswer = (optVal, expectedVal) => {
    const cleanOpt = Utils.advancedNormalize(extractOptionText(optVal), effectiveLang);
    const cleanTarget = Utils.advancedNormalize(String(expectedVal || ''), effectiveLang);
    return Boolean(cleanTarget) && cleanOpt === cleanTarget;
  };

  // Lưu câu hỏi / đáp án vào Sổ tay (nâng cấp riêng cho dạng TFNG tránh lưu độc chữ "True"/"False")
  const handleBookmark = (e) => {
    e.stopPropagation();
    if (typeof onSaveToNotebook !== 'function' || !currentSubQuestion) return;

    const isTfng = currentSubQuestion.type === 'tfng';
    const qText = String(currentSubQuestion.questionText || '').trim();
    const ansText = String(currentSubQuestion.correctAnswer || '').trim();
    const expText = String(currentSubQuestion.explanation || '').trim();

    if (isTfng) {
      const saveTerm = qText || ansText || 'Đọc hiểu';
      const tfngDef = `Đáp án: ${ansText || 'True'}${expText ? ` — ${expText}` : ''}`;
      onSaveToNotebook({
        isSmartTarget: true,
        save: saveTerm,
        term: saveTerm,
        display: `[${ansText || 'TFNG'}] ${qText}`,
        definition: tfngDef,
        meaning: tfngDef,
        analysis: `Trích dẫn trong bài: "${expText}"`,
        language: effectiveLang
      });
      return;
    }

    const saveTerm = ansText || qText || 'Đọc hiểu';
    const defText = expText || qText || 'Kiến thức Đọc hiểu';
    onSaveToNotebook({
      isSmartTarget: true,
      save: saveTerm,
      term: saveTerm,
      display: qText || 'Câu hỏi đọc hiểu',
      definition: defText,
      meaning: defText,
      analysis: `Trích dẫn trong bài: "${expText}"`,
      language: effectiveLang
    });
  };

  const getOptionClass = (opt, i) => {
    if (checkStatus === 'correct' || checkStatus === 'failed') {
      const isCorrectOpt = isMatchingAnswer(opt, currentSubQuestion?.correctAnswer);
      if (isCorrectOpt) {
        return 'bg-green-100 border-green-500 text-green-900 shadow-md transform scale-[1.02] font-bold z-10';
      }
      if (i === selectedOptionIndex && !isCorrectOpt) {
        return 'bg-red-100 border-red-500 text-red-900 font-bold opacity-80 animate-[shake_0.4s_ease-in-out]';
      }
      return 'bg-gray-50 border-gray-100 text-gray-300 opacity-60';
    }
    if (checkStatus === 'wrong_retry' && i === selectedOptionIndex) {
      return 'bg-red-50 border-red-300 text-red-400 opacity-80 cursor-not-allowed animate-[shake_0.4s_ease-in-out]';
    }
    return `bg-white border-gray-200 text-gray-700 ${theme.optionHover} hover:shadow-md active:scale-95`;
  };

  // MÀN HÌNH CHỜ (LOADING) ĐẦU GAME
  if (isGenerating && !passageData) {
    if (config?.sourceMode === 'card' && !config?.aiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }
    return (
      <GlobalLoadingScreen
        duration={aiCountdown > 0 ? aiCountdown : 0}
        onComplete={undefined}
        onCancel={onBackAction}
        queueLength={queueLength}
        text={
          aiCountdown > 0
            ? 'AI đang soạn thảo văn bản...'
            : config?.sourceMode === 'ai_pure'
            ? 'Đang trích xuất câu hỏi...'
            : 'Đang tải đoạn văn...'
        }
        subText={
          aiCountdown > 0
            ? '(Việc tạo một tổ kén học thuật cần một chút thời gian)'
            : ''
        }
        mainColor={mainColor}
        levelStr={
          config?.sourceMode === 'ai_pure' && safeLevelStr
            ? formatReadingLevelBadge(safeLevelStr)
            : ''
        }
      />
    );
  }

  // FALLBACK KHI LỖI KHÔNG NẠP ĐƯỢC TỔ KÉN
  if (!isGenerating && !passageData) {
    return (
      <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center animate-in fade-in p-6 text-center absolute inset-0 z-50">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          Lỗi nạp dữ liệu
        </h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được tổ kén đọc hiểu. Vui lòng kiểm tra lại kết
          nối mạng hoặc thử lại.
        </p>
        <button
          type="button"
          onClick={() =>
            onEndGame &&
            onEndGame({
              correct: correctCount,
              score: score,
              time: time,
              wrong: wrongCount
            })
          }
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  // MÀN HÌNH HOÀN THÀNH
  if (isFinished) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl animate-in fade-in zoom-in duration-300 absolute inset-0 z-50">
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner ${theme.awardBadge}`}
        >
          <Icons.Award size={48} />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 mb-2">Tuyệt vời!</h2>
        <p className="text-gray-500 mb-8 text-center">
          Bạn đã hoàn thành chặng đọc hiểu.
        </p>
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-8">
          <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-bold uppercase mb-1">
              Điểm
            </div>
            <div className={`text-xl font-bold ${theme.scoreText}`}>
              {score || 0}
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
            onEndGame &&
            onEndGame({
              correct: correctCount,
              score: score,
              time: time,
              wrong: wrongCount
            })
          }
          className={`w-full max-w-xs py-4 rounded-xl text-white font-bold text-lg shadow-lg active:scale-95 transition-all ${theme.primaryBtn}`}
        >
          Hoàn tất
        </button>
      </div>
    );
  }

  if (!passageData || !currentSubQuestion) return null;

  const isFillBlank = currentSubQuestion.type === 'fill_blank';
  const isInteractive =
    checkStatus !== 'correct' && checkStatus !== 'failed' && !isGenerating;
  const safeTotalTime = Math.max(1, Number(config?.timeLimit) || 300);
  const passageTitle = resolvePassageTitle(passageData);
  const blankParts = isFillBlank
    ? String(currentSubQuestion.questionText || '').split(/(?:\[[\s_]+\]|_{3,})/g)
    : [];

  return (
    <div className="flex flex-col h-full w-full mx-auto bg-gray-100 relative overflow-hidden">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
      `}</style>

      {/* Thanh Tiến Trình Thời Gian Tổng */}
      {config?.timerMode && !isGenerating && (
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-200 z-50">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 30 ? 'bg-red-500' : theme.progressBar
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, (timeLeft / safeTotalTime) * 100))}%`
            }}
          ></div>
        </div>
      )}

      {/* POPUP Xác nhận thoát */}
      {showConfirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reading-exit-modal-title"
          className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowConfirmEnd(false)}
        >
          <div
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3
              id="reading-exit-modal-title"
              className="text-xl font-black text-gray-800 mb-2"
            >
              Thoát ngay?
            </h3>
            <p className="text-gray-600 text-sm mb-6">
              Bạn sẽ kết thúc phiên luyện đọc và tổng kết điểm hiện tại. Bạn có chắc không?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200"
              >
                Chơi tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmEnd(false);
                  if (onEndGame) {
                    onEndGame({
                      correct: correctCount,
                      score: score,
                      time: time,
                      wrong: wrongCount
                    });
                  }
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay chuyển tổ kén */}
      {isGenerating &&
        passageData &&
        (config?.sourceMode === 'card' && !config?.aiMode ? (
          <div className="absolute inset-0 z-[150] bg-transparent pointer-events-none"></div>
        ) : (
          <GlobalLoadingScreen
            duration={0}
            onComplete={undefined}
            onCancel={onBackAction}
            queueLength={queueLength}
            text="Đang chuyển sang tổ kén mới..."
            mainColor={mainColor}
          />
        ))}

      {/* HEADER TỔNG */}
      <div className="flex justify-between items-center p-2 sm:p-3 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10">
        <button
          type="button"
          onClick={onBackAction}
          className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
          title="Quay lại (Tự lưu tiến độ)"
          aria-label="Quay lại Menu"
        >
          <Icons.ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`text-sm font-black uppercase tracking-widest hidden sm:block ${theme.headerTitle}`}
          >
            Reading Passage
          </div>
          <div className="flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full shadow-inner">
            <span className="text-xs font-bold text-gray-600">
              Đoạn {playedCount + 1}
            </span>
            <span className="text-gray-300">|</span>
            <span className="text-xs font-bold text-green-600 flex items-center gap-1">
              <Icons.Check size={12} /> {correctCount}
            </span>
            <span className="text-xs font-bold text-red-500 flex items-center gap-1">
              <Icons.X size={12} /> {wrongCount}
            </span>
          </div>
          {combo > 1 && (
            <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-orange-500">
              🔥 x{combo}
            </div>
          )}
          {config?.timerMode && (
            <div
              className={`text-sm font-mono font-bold ${
                timeLeft <= 30 ? 'text-red-500 animate-pulse' : theme.timerNormal
              } flex items-center gap-1`}
            >
              <Icons.Clock size={16} /> {formatGameTime(timeLeft)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {passageData._isRescued ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn:
              Dự phòng
            </span>
          ) : passageData.isAiGenerated ? (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 shadow-sm"
              title="Câu hỏi được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600 shadow-sm"
              title="Trích xuất từ Bộ thẻ"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {/* Chỉ hiện băng đạn nếu có dùng AI */}
          {(config?.aiMode || config?.sourceMode === 'ai_pure') &&
            queueLength > 0 && (
              <span
                className="hidden sm:flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
                title={`Đã nạp sẵn ${queueLength} đoạn văn`}
              >
                <Icons.Database size={12} className="text-blue-500" /> Đã nạp:{' '}
                {queueLength}
              </span>
            )}

          {/* ĐỒNG HỒ PHANH AI GÓC PHẢI (Chỉ báo khi cần chờ chuyển đoạn mới) */}
          {isBlockedByAiCooldown && (
            <span
              className="hidden sm:flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse"
              title="Thời gian chờ an toàn trước khi nạp đoạn văn mới"
            >
              <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
            </span>
          )}
        </div>
      </div>

      {/* KIẾN TRÚC SPLIT VIEW */}
      <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden relative">
        {/* NỬA TRÁI: ĐOẠN VĂN (SCROLLABLE) */}
        <div className="flex-1 lg:w-1/2 h-1/2 lg:h-full bg-white border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto custom-scrollbar p-5 md:p-8">
          <div className="w-full max-w-2xl mx-auto pb-safe">
            <h2 className="text-xl md:text-2xl font-serif font-black text-gray-800 mb-6 pb-4 border-b-2 border-gray-100 leading-tight">
              {passageTitle}
            </h2>
            <div className="text-base md:text-lg text-gray-700 font-serif leading-loose text-justify whitespace-pre-wrap">
              {passageData.passage}
            </div>
          </div>
        </div>

        {/* NỬA PHẢI: CÂU HỎI CON VÀ CONTROL (SCROLLABLE) */}
        <div className="flex-1 lg:w-1/2 h-1/2 lg:h-full bg-gray-50 flex flex-col relative overflow-hidden">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-24">
            <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
              {/* Header câu hỏi con */}
              <div className="flex items-center justify-between bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${theme.subHeaderLabel}`}
                >
                  {currentSubQuestion.type === 'tfng'
                    ? 'True / False / Not Given'
                    : currentSubQuestion.type === 'fill_blank'
                    ? 'Điền từ khuyết'
                    : 'Trắc nghiệm'}
                </span>
                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  Câu {subIndex + 1} / {totalSubQuestions}
                </span>
              </div>

              {/* Nội dung câu hỏi */}
              <div className="text-lg md:text-xl font-bold text-gray-800 leading-snug">
                {isFillBlank && blankParts.length > 1
                  ? blankParts.map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span
                            className={`inline-block w-20 border-b-4 mx-1 align-baseline ${
                              checkStatus === 'correct'
                                ? 'border-green-400'
                                : checkStatus === 'failed'
                                ? 'border-red-400'
                                : theme.blankBorder
                            }`}
                          ></span>
                        )}
                      </React.Fragment>
                    ))
                  : currentSubQuestion.questionText}
              </div>

              {/* Khu vực tương tác */}
              {isFillBlank ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2 w-full animate-in slide-in-from-bottom-2">
                    <input
                      ref={typeInputRef}
                      type="text"
                      value={inputBuffer}
                      onChange={(e) =>
                        setInputBuffer && setInputBuffer(e.target.value)
                      }
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        handleFillSubmit &&
                        handleFillSubmit()
                      }
                      disabled={!isInteractive}
                      className={`flex-1 p-4 text-center text-lg font-bold border-4 rounded-xl outline-none shadow-inner transition-colors ${
                        checkStatus === 'correct'
                          ? 'border-green-400 bg-green-50 text-green-700'
                          : checkStatus === 'failed'
                          ? 'border-red-400 bg-red-50 text-red-700'
                          : checkStatus === 'wrong_retry'
                          ? 'border-orange-400 bg-orange-50 text-orange-700 animate-[shake_0.4s_ease-in-out]'
                          : `${theme.inputNormal} bg-white text-gray-800`
                      }`}
                      placeholder="Gõ đáp án..."
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      onClick={handleFillSubmit}
                      disabled={!inputBuffer.trim() || !isInteractive}
                      className={`px-5 text-white rounded-xl font-bold shadow-md disabled:opacity-50 active:scale-95 transition-transform shrink-0 ${theme.primaryBtn}`}
                      aria-label="Kiểm tra đáp án"
                    >
                      <Icons.Check size={24} />
                    </button>
                  </div>
                  {attempts > 0 && isInteractive && (
                    <p className="text-xs text-orange-500 font-bold text-center">
                      Còn {Math.max(1, 3 - attempts)} lượt sửa.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {(currentSubQuestion.options || []).map((optItem, i) => {
                    const optText = extractOptionText(optItem);
                    const btnClass = getOptionClass(optItem, i);
                    const isRightAnswer = isMatchingAnswer(
                      optItem,
                      currentSubQuestion.correctAnswer
                    );
                    const isCorrectOpt = checkStatus !== 'idle' && isRightAnswer;
                    const isSelectedWrong =
                      checkStatus !== 'idle' &&
                      i === selectedOptionIndex &&
                      !isRightAnswer;

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          isInteractive &&
                          handleOptionClick &&
                          handleOptionClick(i, isRightAnswer)
                        }
                        disabled={!isInteractive}
                        className={`w-full p-4 border-2 rounded-xl transition-all text-left flex items-center justify-between shadow-sm ${btnClass}`}
                      >
                        <div className="flex items-center gap-3">
                          {currentSubQuestion.type !== 'tfng' && (
                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold flex-none ${
                                isCorrectOpt
                                  ? 'bg-green-200 text-green-800'
                                  : isSelectedWrong
                                  ? 'bg-red-200 text-red-800'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {OPTION_LABELS[i] || i + 1}
                            </span>
                          )}
                          <span className="text-base font-bold leading-snug">
                            {optText}
                          </span>
                        </div>
                        {(checkStatus === 'correct' ||
                          checkStatus === 'failed') &&
                          (isCorrectOpt ? (
                            <Icons.CheckCircle
                              size={20}
                              className="text-green-600 flex-none"
                            />
                          ) : isSelectedWrong ? (
                            <Icons.X
                              size={20}
                              className="text-red-500 flex-none"
                            />
                          ) : null)}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* BẢNG GIẢI THÍCH KIẾN THỨC (Hiện khi trả lời xong) */}
              {(checkStatus === 'correct' || checkStatus === 'failed') && (
                <div
                  className={`mt-4 w-full rounded-2xl border-2 animate-in slide-in-from-bottom-4 shadow-md bg-white overflow-hidden ${
                    checkStatus === 'correct'
                      ? 'border-green-200'
                      : 'border-red-200'
                  }`}
                >
                  <div
                    className={`p-3 ${
                      checkStatus === 'correct' ? 'bg-green-500' : 'bg-red-500'
                    } text-white flex items-center justify-between px-5 font-bold`}
                  >
                    <div className="flex items-center gap-2 text-base">
                      {checkStatus === 'correct' ? (
                        <Icons.CheckCircle size={20} />
                      ) : (
                        <Icons.X size={20} />
                      )}
                      {checkStatus === 'correct' ? 'CHÍNH XÁC!' : 'SAI RỒI!'}
                    </div>
                    <button
                      type="button"
                      onClick={handleBookmark}
                      className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg flex items-center gap-1.5 text-xs transition-colors shadow-sm"
                      aria-label={isBookmarked ? 'Đã lưu vào Sổ tay' : 'Lưu vào Sổ tay'}
                    >
                      <Icons.Bookmark
                        size={12}
                        fill={isBookmarked ? 'white' : 'none'}
                      />{' '}
                      {isBookmarked ? 'Đã lưu' : 'Lưu'}
                    </button>
                  </div>

                  <div className="p-5 flex flex-col gap-4">
                    {checkStatus === 'failed' && (
                      <div className="text-center pb-3 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1">
                          Đáp án đúng là
                        </span>
                        <span className="text-xl font-black text-green-600">
                          {currentSubQuestion.correctAnswer}
                        </span>
                      </div>
                    )}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-left">
                      <span className="flex items-center gap-1 text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                        <Icons.Sparkles size={14} /> Trích dẫn trong bài
                      </span>
                      <p className="text-blue-900 text-sm leading-relaxed font-medium">
                        {currentSubQuestion.explanation ||
                          'Hãy đối chiếu trực tiếp thông tin trong đoạn văn bên trái.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="h-10 w-full shrink-0"></div>
            </div>
          </div>

          {/* FOOTER CỦA CỘT PHẢI */}
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-white/90 backdrop-blur-md border-t border-gray-200 flex items-center justify-between z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            {/* Nút Kết thúc (Bên trái) */}
            <button
              type="button"
              onClick={() => setShowConfirmEnd(true)}
              className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
              title="Kết thúc"
              aria-label="Kết thúc phiên luyện đọc"
            >
              <Icons.X size={16} />{' '}
              <span className="hidden sm:inline">Kết thúc</span>
            </button>

            {/* Khu vực điều khiển chính (Căn giữa/phải) */}
            <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
              {checkStatus === 'correct' || checkStatus === 'failed' ? (
                <div className="w-full flex gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => toggleResultPause && toggleResultPause()}
                    className={`flex-1 py-3 font-bold text-xs sm:text-sm rounded-xl border-2 transition-all flex items-center justify-center gap-1.5 sm:gap-2 ${
                      isResultPaused
                        ? 'bg-orange-50 text-orange-600 border-orange-200'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {isResultPaused ? (
                      <>
                        <Icons.Play size={16} /> Đã dừng
                      </>
                    ) : resultTimer === 0 && isBlockedByAiCooldown ? (
                      <>
                        <Icons.Clock size={16} /> Đợi AI ({aiWaitTime}s)
                      </>
                    ) : (
                      <>
                        <Icons.Pause size={16} /> Đợi ({resultTimer}s)
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onNextAction}
                    disabled={isGenerating || isBlockedByAiCooldown}
                    className={`flex-[2] py-3 text-white font-bold text-sm sm:text-base rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-all ${
                      checkStatus === 'correct'
                        ? 'bg-green-500 hover:bg-green-600'
                        : theme.primaryBtn
                    } ${
                      isGenerating || isBlockedByAiCooldown
                        ? 'opacity-70 cursor-not-allowed'
                        : 'active:scale-95'
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                        Đang tải...
                      </>
                    ) : isBlockedByAiCooldown ? (
                      <>
                        <Icons.Clock size={18} /> Đợi AI ({aiWaitTime}s)
                      </>
                    ) : (
                      <>
                        {isLastSubQuestion
                          ? 'Hoàn thành Đoạn văn'
                          : 'Câu tiếp theo'}{' '}
                        <Icons.ChevronRight size={20} />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={isGenerating}
                  className={`w-full py-3 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 border border-gray-200 flex items-center justify-center gap-2 ${
                    isGenerating
                      ? 'opacity-50 cursor-not-allowed'
                      : 'active:scale-95'
                  }`}
                >
                  Bỏ qua câu này <Icons.SkipForward size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_23_ReadingSetup = ReadingSetup;
  window.ReadingSetup = ReadingSetup;
  window.Block5_23_ReadingPlayScreen = ReadingPlayScreen;
  window.ReadingPlayScreen = ReadingPlayScreen;
}

export default {
  ReadingSetup,
  ReadingPlayScreen
};