// ============================================================================
// FILE 56/85: src/features/games/QuizUI.jsx
// NGUỒN GỐC: tang_5.js (Block 5.5 - Quiz UI V1.35)
// NHIỆM VỤ: Giao diện Cài đặt (QuizSetup), Màn hình chơi (GamePlayScreen) và
//           Màn hình kết quả (GameResult) cho trò chơi Trắc Nghiệm (Multiple Choice).
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { getGrammarTopics } from '@/engines/microPrompts';
import { getSafeLevelString } from './common/gameHelpers';

// Đọc cấu hình đã lưu từ LocalStorage một cách an toàn
const getSavedQuizConfig = () => {
  try {
    const saved = localStorage.getItem('fc_quiz_config');
    return saved ? JSON.parse(saved) : {};
  } catch (e) {
    console.warn('Load quiz config failed:', e);
    return {};
  }
};

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT (QUIZ SETUP)
// ============================================================================
export const QuizSetup = ({
  mainColor = 'blue',
  lang = 'en',
  currentLevel,
  onStart,
  onBack,
  onOpenAiConfig
}) => {
  const initialCfg = useMemo(() => getSavedQuizConfig(), []);

  const [sourceMode, setSourceMode] = useState(() => initialCfg.sourceMode ?? 'card');
  const [timerMode, setTimerMode] = useState(() => initialCfg.timerMode ?? false);
  const [listenMode, setListenMode] = useState(() => initialCfg.listenMode ?? false);
  const [hardMode, setHardMode] = useState(() => initialCfg.hardMode ?? false);
  const [aiMode, setAiMode] = useState(() => initialCfg.aiMode ?? false);
  const [timeLimit, setTimeLimit] = useState(() => initialCfg.timeLimit ?? 30);
  const [askMode, setAskMode] = useState(() => initialCfg.askMode ?? 'term');
  const [showPronun, setShowPronun] = useState(() => initialCfg.showPronun ?? false);
  const [autoReadAnswer, setAutoReadAnswer] = useState(() => initialCfg.autoReadAnswer ?? false);
  const [suddenDeath, setSuddenDeath] = useState(() => initialCfg.suddenDeath ?? false);
  const [grammarFocus, setGrammarFocus] = useState(() => initialCfg.grammarFocus ?? 'random');

  // Lấy danh sách chuyên đề ngữ pháp theo trình độ hiện tại (sử dụng useMemo thay cho polling)
  const grammarTopics = useMemo(() => {
    const repLevel = getSafeLevelString(
      currentLevel,
      lang === 'zh' ? 'zh_level_1' : 'en_level_4'
    );
    if (typeof getGrammarTopics === 'function') {
      return getGrammarTopics('quiz', lang, repLevel) || [];
    }
    if (
      typeof window !== 'undefined' &&
      window.IoeDataEngine &&
      typeof window.IoeDataEngine.getGrammarTopics === 'function'
    ) {
      return window.IoeDataEngine.getGrammarTopics('quiz', lang, repLevel) || [];
    }
    return [];
  }, [lang, currentLevel]);

  const groupedTopics = useMemo(() => {
    return grammarTopics.reduce((acc, topic) => {
      const grp = topic.group || 'Chuyên đề Khác';
      if (!acc[grp]) acc[grp] = [];
      acc[grp].push(topic);
      return acc;
    }, {});
  }, [grammarTopics]);

  // [FORCED AI GUARD - V1.28] Ép bật AI nếu người dùng chọn Khó + Không Đảo Ngược ở chế độ Thẻ cá nhân
  const isAiForced = hardMode && askMode === 'term' && sourceMode === 'card';
  const effectiveAiMode = isAiForced ? true : aiMode;

  const handleStart = () => {
    const config = {
      timerMode,
      listenMode,
      hardMode,
      aiMode: effectiveAiMode,
      timeLimit,
      askMode,
      showPronun,
      autoReadAnswer,
      sourceMode,
      suddenDeath,
      grammarFocus
    };
    localStorage.setItem('fc_quiz_config', JSON.stringify(config));
    onStart('quiz', config);
  };

  const handleHardModeChange = (val) => {
    setHardMode(val);
    if (!val) {
      setAiMode(false);
    } else if (askMode === 'term' && sourceMode === 'card') {
      setAiMode(true);
    }
  };

  const handleAskModeToggle = (isDefMode) => {
    const nextAskMode = isDefMode ? 'def' : 'term';
    setAskMode(nextAskMode);
    if (hardMode && nextAskMode === 'term' && sourceMode === 'card') {
      setAiMode(true);
    }
  };

  // Chỉ hiển thị Dropdown Ngữ pháp khi dùng nguồn AI Tự sinh và bật Đảo ngược
  const showGrammarSection = sourceMode === 'ai_pure';
  const isGrammarDisabled = askMode !== 'def';

  let aiSubtitle = '';
  if (sourceMode === 'ai_pure') {
    aiSubtitle = '(Chế độ Tự sinh đã bao gồm AI)';
  } else if (!hardMode) {
    aiSubtitle = '(Yêu cầu bật Chế độ Khó)';
  } else if (isAiForced) {
    aiSubtitle = 'Bắt buộc dùng AI để chặn lỗi chính tả tiếng Việt';
  } else {
    aiSubtitle = effectiveAiMode ? 'AI tạo nhiễu thông minh' : 'Thuật toán nội bộ';
  }

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-3xl h-full animate-in slide-in-from-right-8 px-2 sm:px-4">
      <div className="w-full flex items-center justify-between mb-4 mt-2 shrink-0">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Icons.ChevronLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Cấu hình Trắc Nghiệm</h2>
        {onOpenAiConfig ? (
          <button
            onClick={onOpenAiConfig}
            className={`p-2 rounded-full hover:bg-${mainColor}-50 text-${mainColor}-600 transition-colors shadow-sm border border-${mainColor}-100`}
            title="Cài đặt Lõi AI (Tốc độ, Băng đạn)"
          >
            <Icons.Sparkles size={20} />
          </button>
        ) : (
          <div className="w-10"></div>
        )}
      </div>

      <div className="w-full space-y-4 flex-1 overflow-y-auto custom-scrollbar p-1 pb-4">
        {/* Bảng chọn Nguồn câu hỏi */}
        <div className="mb-2">
          <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">
            Nguồn câu hỏi
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSourceMode('card')}
              className={`p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
                sourceMode === 'card'
                  ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm`
                  : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
              } hover:scale-105`}
            >
              <Icons.Layers
                size={24}
                className={sourceMode === 'card' ? `text-${mainColor}-600` : 'text-gray-400'}
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">Thẻ của tôi</div>
                <div className="text-[10px] text-gray-500">Trắc nghiệm Flashcard</div>
              </div>
            </button>
            <button
              onClick={() => setSourceMode('ai_pure')}
              className={`p-2 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
                sourceMode === 'ai_pure'
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
              } hover:scale-105`}
            >
              <Icons.Sparkles
                size={24}
                className={sourceMode === 'ai_pure' ? 'text-blue-600' : 'text-gray-400'}
              />
              <div className="text-center">
                <div className="font-bold text-gray-800 text-sm">AI Tự Sinh</div>
                <div className="text-[10px] text-gray-500">Tạo câu đố mới vô tận</div>
              </div>
            </button>
          </div>
        </div>

        {/* Bảng chọn Ngữ pháp */}
        {showGrammarSection && grammarTopics.length > 0 && (
          <div className="mb-2 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl animate-in fade-in">
            <label className="flex items-center gap-1.5 text-sm font-bold text-indigo-800 mb-2">
              <Icons.Target size={16} /> Chuyên đề Ngữ pháp (Bẫy AI)
            </label>
            <select
              value={grammarFocus}
              onChange={(e) => setGrammarFocus(e.target.value)}
              disabled={isGrammarDisabled}
              className={`w-full p-3 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all ${
                isGrammarDisabled
                  ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-70 cursor-not-allowed'
                  : 'bg-white border-indigo-200 text-gray-700'
              }`}
            >
              <option value="random">🎲 Trộn ngẫu nhiên toàn bộ</option>
              {Object.keys(groupedTopics).map((group) => (
                <optgroup key={group} label={`--- ${group} ---`}>
                  {groupedTopics[group].map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {isGrammarDisabled ? (
              <p className="text-[10px] text-red-500 mt-1.5 italic font-bold">
                ⚠️ Bẫy ngữ pháp chỉ hoạt động khi bạn bật Chế độ Đảo ngược (Đáp án là ngoại ngữ).
              </p>
            ) : (
              <p className="text-[10px] text-indigo-500 mt-1.5 italic">
                * AI sẽ cố tình tạo đáp án sai xoay quanh ngữ pháp này.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          <div className="space-y-3">
            <MenuToggle
              active={askMode === 'def'}
              setActive={handleAskModeToggle}
              icon={Icons.RefreshCw}
              color="teal"
              title="Chế độ Đảo ngược"
              subtitle={askMode === 'def' ? 'Hỏi Nghĩa ➔ Chọn Từ' : 'Hỏi Từ ➔ Chọn Nghĩa'}
            />
            <MenuToggle
              active={hardMode}
              setActive={handleHardModeChange}
              icon={Icons.Layers}
              color="red"
              title="Chế độ Khó (Hard Mode)"
              subtitle={hardMode ? 'Bẫy thông minh, bóp méo từ' : 'Bẫy cơ bản'}
            />
            <MenuToggle
              active={effectiveAiMode}
              setActive={setAiMode}
              icon={Icons.Sparkles}
              color="purple"
              title="Thử thách AI"
              subtitle={aiSubtitle}
              disabled={!hardMode || sourceMode === 'ai_pure' || isAiForced}
            />
            <MenuToggle
              active={suddenDeath}
              setActive={setSuddenDeath}
              icon={Icons.AlertCircle}
              color="slate"
              title="Chế độ Địa ngục"
              subtitle="Sai 1 lần là mất điểm ngay lập tức"
            />
          </div>

          <div className="space-y-3">
            <MenuToggle
              active={listenMode}
              setActive={setListenMode}
              icon={Icons.Headphones}
              color="blue"
              title="Luyện Nghe"
              subtitle="Nghe âm thanh chọn đáp án"
            />
            <MenuToggle
              active={showPronun}
              setActive={setShowPronun}
              icon={Icons.Eye}
              color="indigo"
              title="Hiển thị phiên âm"
              subtitle="Gợi ý cách đọc (Tắt khi Luyện nghe)"
              disabled={askMode === 'def' || listenMode}
            />
            <MenuToggle
              active={autoReadAnswer}
              setActive={setAutoReadAnswer}
              icon={Icons.Volume2}
              color="pink"
              title="Đọc lại đáp án"
              subtitle="Chờ đọc xong đáp án mới chuyển câu"
            />
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
        </div>
      </div>

      <div className="w-full mt-2 pt-4 border-t border-gray-100 bg-white pb-safe shrink-0 flex justify-center">
        <button
          onClick={handleStart}
          className={`w-full max-w-sm py-4 bg-${mainColor}-600 text-white rounded-xl font-bold shadow-lg hover:bg-${mainColor}-700 flex items-center justify-center gap-2 active:scale-95 transition-transform`}
        >
          <Icons.Play size={24} /> BẮT ĐẦU CHƠI
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. MÀN HÌNH KẾT QUẢ (GAME RESULT)
// ============================================================================
export const GameResult = ({
  mainColor = 'blue',
  onBack,
  correctCount = 0,
  wrongCount = 0
}) => {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const totalPlayed = correctCount + wrongCount;
  const accuracy = totalPlayed > 0 ? Math.round((correctCount / totalPlayed) * 100) : 0;

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-sm text-center animate-in zoom-in">
      <div className="text-6xl mb-4">🎯</div>
      <h2 className="text-2xl font-black text-gray-800 mb-6">Kết quả</h2>
      <div className="w-full p-4 bg-gray-50 rounded-xl border border-gray-200 flex justify-around mb-8 shadow-sm">
        <div className="text-center">
          <div className="text-xs text-green-500 uppercase font-bold tracking-wider mb-1">
            Đúng
          </div>
          <div className="text-3xl font-black text-green-600">{correctCount}</div>
        </div>
        <div className="text-center border-l border-gray-300 pl-4">
          <div className="text-xs text-red-500 uppercase font-bold tracking-wider mb-1">
            Sai
          </div>
          <div className="text-3xl font-black text-red-500">{wrongCount}</div>
        </div>
        <div className="text-center border-l border-gray-300 pl-4">
          <div className="text-xs text-blue-500 uppercase font-bold tracking-wider mb-1">
            Tỷ lệ
          </div>
          <div className="text-3xl font-black text-blue-600">{accuracy}%</div>
        </div>
      </div>
      <button
        onClick={onBack}
        className={`w-full py-4 rounded-xl font-bold text-white bg-${mainColor}-600 hover:bg-${mainColor}-700 shadow-lg active:scale-95 transition-all`}
      >
        Hoàn tất
      </button>
    </div>
  );
};

// ============================================================================
// 3. MÀN HÌNH CHƠI (GAME PLAY SCREEN)
// ============================================================================
export const GamePlayScreen = ({
  t,
  mainColor = 'blue',
  currentQuestionData,
  streak = 0,
  gameMode,
  setGameMode,
  isAudioPlaying,
  playSequence,
  onBookmark,
  isInNotebook,
  onPlay,
  selectedOptionIndex,
  isChecking,
  clickedWrongIndices = new Set(),
  hasStartedListening,
  handleAnswer,
  isAiMode,
  showChanceToast,
  isGenerating,
  timerMode,
  timeLeft,
  totalTime,
  isRoundStarted,
  onStartRound,
  onEndGame,
  onPause,
  onBack,
  feedbackType,
  isPaused,
  correctCount = 0,
  wrongCount = 0,
  onSkip,
  settings,
  askMode,
  showPronun,
  hardMode,
  listenPlayCount = 0,
  sourceMode,
  config,
  aiWaitTime = 0,
  resultTimer = 0,
  isResultPaused = false,
  toggleResultPause,
  onNext,
  aiAmmoCount = 0,
  notebook = []
}) => {
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);

  const getTimerColor = (time, total) => {
    const ratio = time / total;
    if (ratio > 0.6) return 'text-green-600';
    if (ratio > 0.3) return 'text-orange-500';
    return 'text-red-600 animate-pulse';
  };

  // [SILENT OFFLINE] Chặn đứng GlobalLoadingScreen nếu là thẻ offline
  if (isGenerating && !currentQuestionData) {
    if (sourceMode === 'card' && !isAiMode) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center pointer-events-none"></div>
      );
    }

    const safeLevelStr = getSafeLevelString(config?.level, '');
    return (
      <GlobalLoadingScreen
        onCancel={() => onEndGame && onEndGame()}
        queueLength={aiAmmoCount}
        text={
          sourceMode === 'ai_pure'
            ? 'AI đang sáng tác câu đố...'
            : 'Đang thiết lập trò chơi...'
        }
        mainColor={mainColor}
        levelStr={
          config?.sourceMode === 'ai_pure' && safeLevelStr
            ? safeLevelStr.replace('level_', '').replace(/_/g, ' ').toUpperCase()
            : ''
        }
      />
    );
  }

  if (!isGenerating && !currentQuestionData) {
    return (
      <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 items-center justify-center animate-in fade-in p-6 text-center">
        <Icons.AlertCircle size={48} className="text-red-500 mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">Lỗi nạp dữ liệu</h3>
        <p className="text-gray-600 mb-6 text-sm max-w-sm">
          Hệ thống không thể tải được câu hỏi. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại.
        </p>
        <button
          onClick={() => onEndGame && onEndGame()}
          className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 transition-colors"
        >
          Thoát về Menu
        </button>
      </div>
    );
  }

  const isLocked = (timerMode && !isRoundStarted) || isPaused;
  const contentBlurClass = isLocked ? 'blur-sm opacity-50 pointer-events-none select-none' : '';
  const isReverse = askMode === 'def';
  const isReverseListen = gameMode === 'listen' && isReverse;

  // [CHỐT CHẶN BẢO MẬT BOOKMARK - V1.27]
  // Khóa Bookmark nếu chưa trả lời (isChecking = false) VÀ đang ở chế độ rủi ro lộ đáp án
  const isBookmarkLocked = !isChecking && (askMode === 'def' || gameMode === 'listen');

  const getOptionClass = (opt, i) => {
    const isListenLocked = gameMode === 'listen' && !hasStartedListening && !isReverseListen;
    if (isListenLocked) {
      return 'bg-gray-50 border-gray-200 text-gray-400 opacity-80 cursor-not-allowed select-none';
    }
    if (isChecking) {
      if (opt.isCorrect) {
        return 'bg-green-100 border-green-500 text-green-900 shadow-md transform scale-[1.02] font-bold cursor-default';
      }
      if (i === selectedOptionIndex && !opt.isCorrect) {
        return 'bg-red-100 border-red-500 text-red-900 font-bold cursor-default';
      }
      return 'bg-gray-50 border-gray-100 text-gray-300 opacity-60 cursor-default';
    }
    if (clickedWrongIndices.has(i)) {
      return 'bg-red-50 border-red-200 text-red-300 opacity-80 cursor-not-allowed';
    }
    return 'bg-white border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:shadow-md active:scale-95 cursor-pointer';
  };

  const getLabelClass = (opt, i) => {
    if (isChecking && opt.isCorrect) return 'bg-green-200 text-green-800';
    if (isChecking && i === selectedOptionIndex && !opt.isCorrect) return 'bg-red-200 text-red-800';
    return 'bg-white text-gray-500';
  };

  const totalOptions = currentQuestionData?.options?.length || 0;
  const isOddOptions = totalOptions % 2 !== 0;
  const labels = ['A', 'B', 'C', 'D', 'E'];

  const isSentenceMode = config?.dataMode === 'sentence';
  const questionText = isReverse
    ? currentQuestionData?.question?.definition || currentQuestionData?.question?.term || '...'
    : isSentenceMode && currentQuestionData?.question?.displaySentence
    ? currentQuestionData.question.displaySentence
    : currentQuestionData?.question?.term || '...';

  const showPronunciation =
    !isReverse && showPronun && currentQuestionData?.question?.pronunciation;
  const isLimitedListen = gameMode === 'listen' && hardMode && !timerMode;
  const isListenExhausted = isLimitedListen && listenPlayCount >= 2;

  // [ADAPTIVE TRIM - V1.31] Thuật toán nhận diện mất cân bằng hình thể đáp án (Meta-gaming)
  let delimCount = 0;
  const optionsList = currentQuestionData?.options || [];
  optionsList.forEach((opt) => {
    if (opt && opt.text && /[,/;]/.test(opt.text)) delimCount++;
  });
  const isImbalanced = !isSentenceMode && delimCount > 0 && delimCount < optionsList.length;

  return (
    <div className="w-full h-full bg-gray-50 rounded-2xl shadow-xl flex flex-col border-2 border-gray-200 animate-in overflow-hidden relative">
      {/* POPUP XÁC NHẬN THOÁT GAME */}
      {showConfirmEnd && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">Kết thúc sớm?</h3>
            <p className="text-gray-600 text-sm mb-6">
              Tiến trình của câu hỏi hiện tại sẽ không được lưu lại. Bạn có chắc chắn muốn thoát?
            </p>
            <div className="flex w-full gap-3">
              <button
                onClick={() => setShowConfirmEnd(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
              >
                Chơi tiếp
              </button>
              <button
                onClick={() => {
                  setShowConfirmEnd(false);
                  if (onEndGame) onEndGame();
                }}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
              >
                Thoát ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {showChanceToast && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-in fade-in">
          <div className="bg-orange-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border-2 border-white">
            <Icons.AlertCircle size={20} /> {t ? t('secondChance') : 'Cơ hội thứ 2!'}
          </div>
        </div>
      )}

      {feedbackType === 'timeout' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-in fade-in">
          <div className="bg-red-500 text-white px-6 py-3 rounded-full shadow-2xl font-bold flex items-center gap-2 border-2 border-white">
            <Icons.Clock size={20} /> HẾT GIỜ!
          </div>
        </div>
      )}

      {isPaused && (
        <div className="absolute inset-0 z-40 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border-2 border-gray-100 flex flex-col items-center gap-4">
            <h3 className="text-2xl font-black text-gray-700 tracking-widest uppercase">
              TẠM DỪNG
            </h3>
            <button
              onClick={onPause}
              className={`w-16 h-16 rounded-full bg-${mainColor}-600 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform`}
            >
              <Icons.Play size={32} fill="currentColor" />
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col bg-white border-b shadow-sm z-10">
        <div className="flex justify-between items-center p-3 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="text-gray-500 hover:text-gray-700 p-1"
              title={t ? t('backMenu') : 'Quay lại'}
            >
              <Icons.ChevronLeft size={24} />
            </button>
            <button
              onClick={onPause}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                isPaused
                  ? 'bg-green-100 text-green-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={isPaused ? 'Tiếp tục' : 'Tạm dừng'}
            >
              {isPaused ? <Icons.Play size={16} fill="currentColor" /> : <Icons.Pause size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-3 bg-gray-100 px-3 py-1.5 rounded-full shadow-inner">
            <div className="flex items-center gap-1">
              <span className="text-orange-500 font-bold">🔥 {streak}</span>
            </div>
            <span className="text-gray-300 text-xs">|</span>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="text-green-600">{correctCount}</span>
              <span className="text-gray-300">/</span>
              <span className="text-red-500">{wrongCount}</span>
            </div>
            {timerMode && (
              <>
                <span className="text-gray-300 text-xs">|</span>
                <div
                  className={`flex items-center gap-1 font-mono font-bold ${getTimerColor(
                    timeLeft,
                    totalTime
                  )}`}
                >
                  <Icons.Clock size={16} /> {timeLeft}s
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {!isBookmarkLocked ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentQuestionData?.question && onBookmark) {
                    onBookmark({
                      isSmartTarget: true,
                      display: currentQuestionData.question.term,
                      save: currentQuestionData.question.term,
                      analysis: currentQuestionData.question.definition
                    });
                  }
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isInNotebook
                    ? 'text-yellow-500 bg-yellow-50 hover:bg-yellow-100'
                    : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
                }`}
                title="Lưu vào Sổ tay"
              >
                <Icons.Bookmark size={20} fill={isInNotebook ? 'currentColor' : 'none'} />
              </button>
            ) : (
              <div
                className="p-2 text-gray-300 opacity-50"
                title={
                  gameMode === 'listen'
                    ? 'Đang ở chế độ Nghe. Trả lời xong mới được lưu!'
                    : 'Đang ở chế độ hỏi Nghĩa. Trả lời xong mới được lưu!'
                }
              >
                <Icons.Bookmark size={20} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-4 gap-2 relative">
        {isLocked && !isPaused && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/10 backdrop-blur-[2px]">
            <button
              onClick={onStartRound}
              className={`group relative flex items-center justify-center w-24 h-24 bg-${mainColor}-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300 border-4 border-white ring-4 ring-${mainColor}-200 animate-in zoom-in`}
            >
              <Icons.Play size={40} fill="currentColor" className="ml-1" />
              <span className="absolute -bottom-8 font-bold text-gray-600 bg-white px-3 py-1 rounded-full shadow text-sm">
                BẮT ĐẦU
              </span>
            </button>
          </div>
        )}

        <div className="w-full flex justify-end items-center mb-1 gap-2">
          {/* Nhãn diện nguồn gốc AI và Đồng hồ Throttling KÈM AMMO COUNTER */}
          {currentQuestionData?.question?._isRescued || currentQuestionData?._isRescued ? (
            <span
              className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm"
              title="Sử dụng dữ liệu dự phòng do mất kết nối"
            >
              <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
            </span>
          ) : currentQuestionData?.isAiGenerated ? (
            <span
              className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm"
              title="Câu hỏi hoặc đáp án được tạo bởi AI"
            >
              <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
            </span>
          ) : (
            <span
              className="text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm"
              title="Trích xuất từ Bộ thẻ của bạn"
            >
              <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
            </span>
          )}

          {(isAiMode || sourceMode === 'ai_pure') && aiAmmoCount > 0 && (
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200"
              title={`Đã nạp sẵn ${aiAmmoCount} câu AI`}
            >
              <Icons.Database size={12} className="text-blue-500" /> Đã nạp: {aiAmmoCount}
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

          <span
            className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider cursor-default ${
              hardMode
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-green-100 text-green-700 border border-green-200'
            }`}
          >
            {hardMode ? 'Khó' : 'Cơ bản'}
          </span>
        </div>

        {/* KHUNG CÂU HỎI CHÍNH */}
        <div
          className={`w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 relative min-h-[160px] flex items-center justify-center animate-in transition-all duration-300 ${
            isLocked ? 'blur-md' : ''
          }`}
        >
          {gameMode === 'read' && !isBookmarkLocked && (
            <button
              className={`absolute top-3 right-3 p-2 rounded-full transition-all ${
                isInNotebook
                  ? 'text-yellow-500 bg-yellow-50 shadow-sm'
                  : 'text-gray-300 hover:text-yellow-400 hover:bg-gray-50'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (currentQuestionData?.question && onBookmark) {
                  onBookmark({
                    isSmartTarget: true,
                    display: currentQuestionData.question.term,
                    save: currentQuestionData.question.term,
                    analysis: currentQuestionData.question.definition
                  });
                }
              }}
              title={t ? t('addToNotebook') : 'Lưu vào Sổ tay'}
            >
              <Icons.Bookmark size={22} fill={isInNotebook ? 'currentColor' : 'none'} />
            </button>
          )}

          <div className="text-center w-full px-6">
            {gameMode === 'read' || isChecking || isReverseListen ? (
              <div className="flex flex-col gap-2 animate-in fade-in items-center">
                <div
                  className="text-gray-800 break-words leading-tight"
                  style={{
                    fontWeight: settings?.fontWeight || 'bold',
                    fontFamily: isReverse ? 'inherit' : Utils.getFontFamily(settings),
                    fontSize: settings?.fontSize ? `${settings.fontSize}rem` : '1.875rem'
                  }}
                >
                  {questionText}
                </div>
                {showPronunciation && (
                  <div className="text-lg text-gray-500 font-medium">
                    {currentQuestionData.question.pronunciation}
                  </div>
                )}
                {gameMode === 'listen' && isChecking && (
                  <div className="text-xs text-gray-400 italic mt-1">
                    (Đáp án của âm thanh vừa nghe)
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in">
                <button
                  onClick={() => playSequence && playSequence()}
                  disabled={isAudioPlaying || isListenExhausted}
                  className={`flex flex-col items-center gap-1 p-5 rounded-full border-4 shadow-md transition-all ${
                    isListenExhausted
                      ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed'
                      : isAudioPlaying
                      ? 'opacity-50 cursor-not-allowed bg-blue-50 border-blue-200'
                      : `bg-white border-${mainColor}-100 hover:bg-${mainColor}-50 hover:scale-105 active:scale-95 text-${mainColor}-600`
                  }`}
                >
                  <Icons.Volume2 size={40} className={isAudioPlaying ? 'animate-pulse' : ''} />
                  <span className="text-xs font-bold uppercase">
                    {t ? t('startListen') : 'Nghe'}
                  </span>
                </button>
                {isLimitedListen && (
                  <div className="text-xs text-gray-500 font-bold mt-1">
                    Lượt nghe: {2 - listenPlayCount}/2
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAnswer(999, false, false, true);
                    setGameMode('read');
                  }}
                  className="text-[10px] sm:text-xs text-gray-400 hover:text-red-500 underline mt-2 font-medium transition-colors"
                  disabled={isPaused}
                >
                  Không nghe được? (Chấp nhận sai để xem chữ)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* LƯỚI ĐÁP ÁN */}
        <div className={`flex flex-col gap-3 w-full mt-2 transition-all duration-300 ${contentBlurClass}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {currentQuestionData?.options?.map((opt, i) => {
              const btnClass = getOptionClass(opt, i);
              const isLastAndOdd = isOddOptions && i === totalOptions - 1;
              const icon =
                isChecking && opt.isCorrect ? (
                  <Icons.CheckCircle size={20} className="text-green-700" />
                ) : (isChecking && i === selectedOptionIndex && !opt.isCorrect) ||
                  clickedWrongIndices.has(i) ? (
                  <Icons.X
                    size={20}
                    className={clickedWrongIndices.has(i) ? 'text-red-300' : 'text-red-700'}
                  />
                ) : null;

              const optionDisplayText =
                isReverseListen && !isChecking ? `Đáp án ${labels[i]}` : opt.text || '';

              // [ADAPTIVE TRIM - V1.32] Lưỡi kéo cắt tỉa chia tách văn bản
              let mainText = optionDisplayText;
              let subText = '';
              if (isImbalanced && !isReverseListen && optionDisplayText) {
                const match = optionDisplayText.match(/([,/;])/);
                if (match) {
                  mainText = optionDisplayText.substring(0, match.index).trim();
                  subText = optionDisplayText.substring(match.index).trim();
                }
              }

              // [POST-ANSWER AUDIO - V1.33] Tính toán hiển thị loa tại đáp án
              const showOptionSpeaker = (isReverseListen && !isChecking) || isChecking;
              let speakerColorClass = `text-${mainColor}-500 bg-${mainColor}-50 hover:bg-${mainColor}-100 border-${mainColor}-200`;
              if (isChecking) {
                if (opt.isCorrect) {
                  speakerColorClass =
                    'text-green-700 bg-green-200 hover:bg-green-300 border-green-300';
                } else if (i === selectedOptionIndex && !opt.isCorrect) {
                  speakerColorClass = 'text-red-700 bg-red-200 hover:bg-red-300 border-red-300';
                } else {
                  speakerColorClass =
                    'text-gray-500 bg-gray-100 hover:bg-gray-200 border-gray-200 opacity-80';
                }
              }

              // [SCAVENGING BOOKMARK - V1.35] Tính toán dữ liệu lưu Sổ tay trên từng đáp án
              const foreignWord = isReverse ? opt.text : opt.meaning;
              const vietnameseMeaning = isReverse ? opt.meaning : opt.text;
              const isOptInNotebook = notebook?.some((n) => n.term === foreignWord);

              const isListenLocked =
                gameMode === 'listen' && !hasStartedListening && !isReverseListen;
              const isDisabled = isChecking || clickedWrongIndices.has(i) || isListenLocked;

              return (
                <div
                  key={i}
                  role="button"
                  onClick={() => {
                    if (!isDisabled) {
                      handleAnswer(i, opt.isCorrect);
                    }
                  }}
                  className={`w-full p-4 border-2 rounded-xl shadow-sm transition-all text-left flex items-center justify-between outline-none focus:ring-2 focus:ring-${mainColor}-300 ${btnClass} ${
                    isLastAndOdd ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="flex items-center w-full">
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold mr-3 flex-none shadow-inner ${getLabelClass(
                        opt,
                        i
                      )}`}
                    >
                      {labels[i]}
                    </span>
                    <div className="flex flex-col flex-1">
                      <span
                        className={`break-words ${
                          clickedWrongIndices.has(i) ? 'line-through' : ''
                        } ${isReverse ? 'text-gray-800' : ''} ${
                          isReverseListen && !isChecking ? 'italic text-gray-500' : ''
                        }`}
                        style={{
                          fontWeight: settings?.fontWeight || 'normal',
                          fontSize: settings?.backFontSize
                            ? `${settings.backFontSize}rem`
                            : '1.125rem',
                          fontFamily:
                            isReverse && !isReverseListen
                              ? Utils.getFontFamily(settings)
                              : 'inherit'
                        }}
                      >
                        {mainText}
                      </span>
                      {subText && isChecking && (
                        <span
                          className={`text-[11px] mt-0.5 font-medium opacity-70 animate-in fade-in slide-in-from-top-1 ${
                            clickedWrongIndices.has(i) ? 'line-through' : ''
                          }`}
                        >
                          {subText}
                        </span>
                      )}
                      {isChecking && opt.meaning && (
                        <span className="text-sm text-gray-500 italic mt-0.5 animate-in fade-in slide-in-from-top-1 font-medium">
                          {opt.meaning}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center shrink-0 gap-1.5 ml-2">
                    {showOptionSpeaker && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const textToSpeak = isReverse ? opt.text : opt.meaning;
                          if (onPlay && textToSpeak) onPlay(textToSpeak);
                        }}
                        className={`p-2 rounded-full flex-none transition-transform active:scale-90 border shadow-sm cursor-pointer ${speakerColorClass}`}
                        title="Nghe phát âm"
                      >
                        <Icons.Volume2 size={20} />
                      </div>
                    )}
                    {isChecking && foreignWord && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onBookmark) {
                            onBookmark({
                              isSmartTarget: true,
                              display: foreignWord,
                              save: foreignWord,
                              analysis: vietnameseMeaning
                            });
                          }
                        }}
                        className={`p-2 rounded-full flex-none transition-transform active:scale-90 border shadow-sm cursor-pointer ${
                          isOptInNotebook
                            ? 'text-yellow-600 bg-yellow-100 hover:bg-yellow-200 border-yellow-300'
                            : 'text-gray-400 bg-gray-50 hover:bg-gray-100 border-gray-200 hover:text-yellow-500'
                        }`}
                        title={isOptInNotebook ? 'Đã lưu trong Sổ tay' : 'Lưu vào Sổ tay'}
                      >
                        <Icons.Bookmark
                          size={20}
                          fill={isOptInNotebook ? 'currentColor' : 'none'}
                        />
                      </div>
                    )}
                    {icon && <div className="flex-none">{icon}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="w-full p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-10 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        <button
          onClick={() => setShowConfirmEnd(true)}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>

        <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
          {isChecking ? (
            <div className="w-full flex gap-3">
              <button
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
                    <Icons.Pause size={16} fill="currentColor" /> Đợi ({resultTimer}s)
                  </>
                )}
              </button>
              <button
                onClick={onNext}
                disabled={isGenerating || aiWaitTime > 0}
                className={`flex-[2] py-3 sm:py-4 bg-${
                  feedbackType === 'correct' ? 'green-500' : `${mainColor}-600`
                } text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                  isGenerating || aiWaitTime > 0
                    ? 'opacity-70 cursor-not-allowed'
                    : `active:scale-95 hover:bg-${
                        feedbackType === 'correct' ? 'green-600' : `${mainColor}-700`
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
              onClick={onSkip}
              disabled={aiWaitTime > 0 || isGenerating}
              className={`w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ${
                aiWaitTime > 0 || isGenerating ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
              }`}
            >
              Bỏ qua câu này <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_5_QuizSetup = QuizSetup;
  window.QuizSetup = QuizSetup;
  window.Block5_5_GameResult = GameResult;
  window.GameResult = GameResult;
  window.Block5_5_GamePlayScreen = GamePlayScreen;
  window.GamePlayScreen = GamePlayScreen;
}

export default GamePlayScreen;