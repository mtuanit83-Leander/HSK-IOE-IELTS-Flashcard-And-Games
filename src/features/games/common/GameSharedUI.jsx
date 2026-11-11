/**
 * @file src/features/games/common/GameSharedUI.jsx
 * @description Kho Giao diện Dùng chung cho toàn bộ 10 Mini-games (Màn hình Tổng kết, Banner Phục hồi phiên, Bộ chọn Bẫy ngữ pháp, Chọn Nguồn Dữ liệu và Thanh Top HUD).
 * @origin Tầng 5 - Nhóm 5A (Shared Game UI Components)
 */

import React, { useMemo } from 'react';
import { Icons } from '@/components/common/Icons';
import { LevelSelector, TopicSelectorDropdown } from '@/components/common/Controls';
import { getGrammarTopics } from '@/engines/microPrompts';

// ============================================================================
// 1. MÀN HÌNH TỔNG KẾT ĐIỂM DÙNG CHUNG (GAME SUMMARY SCREEN)
// ============================================================================
export const GameSummaryScreen = ({
  score = 0,
  correctCount = 0,
  totalQuestions = 0,
  onRestart,
  onBack,
  mainColor = 'blue',
  t,
  title = null,
  subtitle = null
}) => {
  const safeTotal = Math.max(1, totalQuestions || 1);
  const accuracy = Math.round((correctCount / safeTotal) * 100);

  let badgeColor = 'yellow';
  let rankLabel = 'Hoàn thành xuất sắc!';
  if (accuracy < 50) {
    badgeColor = 'orange';
    rankLabel = 'Cần cố gắng thêm!';
  } else if (accuracy < 80) {
    badgeColor = 'blue';
    rankLabel = 'Làm tốt lắm!';
  }

  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl p-6 flex flex-col items-center justify-center text-center animate-in zoom-in border-2 border-gray-100">
      <div className={`w-24 h-24 rounded-full bg-${badgeColor}-100 text-${badgeColor}-500 flex items-center justify-center mb-4 shadow-inner border-4 border-${badgeColor}-200 animate-bounce`}>
        <Icons.Award size={48} />
      </div>

      <h2 className="text-2xl sm:text-3xl font-black text-gray-800 mb-1">
        {title || (t ? t('finishTitle') : 'Hoàn thành!')}
      </h2>
      <p className="text-sm font-bold text-gray-500 mb-6">
        {subtitle || rankLabel}
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
        <div className={`p-4 rounded-2xl bg-${mainColor}-50 border border-${mainColor}-100 flex flex-col items-center`}>
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            {t ? t('score') : 'Tổng Điểm'}
          </span>
          <span className={`text-3xl font-black text-${mainColor}-600 font-mono`}>
            {score}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-green-50 border border-green-100 flex flex-col items-center">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Độ chính xác
          </span>
          <span className="text-3xl font-black text-green-600 font-mono">
            {correctCount}/{totalQuestions}
          </span>
          <span className="text-[10px] font-bold text-green-500 mt-0.5">
            ({accuracy}%)
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        {onRestart && (
          <button
            onClick={onRestart}
            className={`flex-1 py-3.5 px-6 bg-${mainColor}-600 text-white font-bold rounded-xl shadow-lg hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center justify-center gap-2`}
          >
            <Icons.RotateCcw size={18} /> Chơi lại
          </button>
        )}
        <button
          onClick={onBack}
          className="flex-1 py-3.5 px-6 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Icons.ChevronLeft size={18} /> {t ? t('backMenu') : 'Về Menu'}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BANNER KHÔI PHỤC PHIÊN CHƠI ĐANG DANG DỞ (RESUME SESSION BANNER)
// ============================================================================
export const ResumeSessionBanner = ({
  savedSession,
  onResume,
  onClear,
  mainColor = 'blue'
}) => {
  if (!savedSession) return null;

  const currentStep = (savedSession.currentIndex || savedSession.round || 0) + 1;
  const totalStep = savedSession.totalQuestions || savedSession.maxRounds || '∞';
  const savedScore = savedSession.score || 0;

  return (
    <div className={`w-full p-3.5 mb-4 rounded-xl bg-gradient-to-r from-${mainColor}-50 to-indigo-50 border-2 border-${mainColor}-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-full bg-${mainColor}-600 text-white shadow`}>
          <Icons.Clock size={20} />
        </div>
        <div className="text-left">
          <div className={`text-xs font-black uppercase tracking-wider text-${mainColor}-800`}>
            Phát hiện phiên chơi đang dở!
          </div>
          <div className="text-xs text-gray-600 font-medium mt-0.5">
            Tiến trình: <b className="text-gray-800">Câu {currentStep}/{totalStep}</b> • Điểm: <b className="text-orange-600">{savedScore}</b>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          onClick={onResume}
          className={`flex-1 sm:flex-initial px-4 py-2 bg-${mainColor}-600 text-white text-xs font-bold rounded-lg shadow hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center justify-center gap-1`}
        >
          <Icons.Play size={14} fill="currentColor" /> Tiếp tục
        </button>
        {onClear && (
          <button
            onClick={onClear}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Xóa phiên chơi cũ"
          >
            <Icons.Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. BỘ CHỌN CHUYÊN ĐỀ BẪY NGỮ PHÁP (GRAMMAR TRAP SELECTOR)
// ============================================================================
export const GrammarTrapSelector = ({
  gameType = 'quiz',
  lang = 'en',
  currentLevel,
  selectedTrap,
  onSelectTrap,
  mainColor = 'purple'
}) => {
  const topics = useMemo(() => {
    const repLevel = Array.isArray(currentLevel) ? currentLevel[0] : currentLevel;
    return getGrammarTopics(gameType, lang, repLevel);
  }, [gameType, lang, currentLevel]);

  const groupedTopics = useMemo(() => {
    const groups = {};
    topics.forEach((item) => {
      const g = item.group || 'Chuyên đề Khác';
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    });
    return groups;
  }, [topics]);

  if (!topics || topics.length === 0) return null;

  return (
    <div className="w-full bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 text-left space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-purple-800 uppercase tracking-wider flex items-center gap-1.5">
          <Icons.Target size={15} className="text-purple-600" />
          Trọng tâm Ngữ pháp (Tùy chọn)
        </label>
        {selectedTrap && (
          <button
            onClick={() => onSelectTrap('')}
            className="text-[10px] font-bold text-purple-600 hover:text-red-500 underline"
          >
            Đặt lại ngẫu nhiên
          </button>
        )}
      </div>

      <select
        value={selectedTrap || ''}
        onChange={(e) => onSelectTrap(e.target.value)}
        className="w-full p-2.5 bg-white border border-purple-200 rounded-lg text-xs sm:text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-purple-300 shadow-sm"
      >
        <option value="">🎲 Ngẫu nhiên thông minh theo cấp độ (Khuyên dùng)</option>
        {Object.entries(groupedTopics).map(([groupName, items]) => (
          <optgroup key={groupName} label={`── ${groupName} ──`}>
            {items.map((tItem) => (
              <option key={tItem.id} value={tItem.id}>
                🎯 {tItem.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

// ============================================================================
// 4. BỘ CHỌN NGUỒN DỮ LIỆU & BỘ LỌC CẤP ĐỘ (SOURCE MODE SELECTOR)
// ============================================================================
export const SourceModeSelector = ({
  sourceMode,
  setSourceMode,
  cardsCount = 0,
  minCards = 4,
  lang = 'en',
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  dataMode,
  setDataMode,
  mainColor = 'blue',
  onMissingKey,
  hideDataModeToggle = false
}) => {
  const hasEnoughLocalCards = cardsCount >= minCards;

  const handleSelectAiSource = () => {
    const hasKey =
      localStorage.getItem('fc_gemini_api_key') ||
      localStorage.getItem('fc_apikey') ||
      localStorage.getItem('fc_apikey_pool');
    if (!hasKey && onMissingKey) {
      onMissingKey();
      return;
    }
    setSourceMode('ai');
  };

  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-2 gap-2.5 bg-gray-100 p-1.5 rounded-xl border border-gray-200">
        <button
          type="button"
          onClick={() => setSourceMode('local')}
          className={`py-2.5 px-3 rounded-lg font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 transition-all ${
            sourceMode === 'local'
              ? `bg-white text-${mainColor}-700 shadow-sm border border-${mainColor}-200`
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Icons.Book size={15} />
            <span>Thẻ của tôi</span>
          </div>
          <span className={`text-[10px] font-medium ${hasEnoughLocalCards ? 'text-gray-400' : 'text-red-500'}`}>
            ({cardsCount} thẻ khả dụng)
          </span>
        </button>

        <button
          type="button"
          onClick={handleSelectAiSource}
          className={`py-2.5 px-3 rounded-lg font-bold text-xs sm:text-sm flex flex-col items-center justify-center gap-0.5 transition-all ${
            sourceMode === 'ai'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
              : 'text-gray-600 hover:text-purple-700'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Icons.Sparkles size={15} />
            <span>AI Tự Sinh</span>
          </div>
          <span className={`text-[10px] font-medium ${sourceMode === 'ai' ? 'text-purple-100' : 'text-gray-400'}`}>
            (Đề mới vô hạn)
          </span>
        </button>
      </div>

      {/* Bộ lọc Cấp độ, Chủ đề & Chế độ Từ/Câu khi bật AI Tự Sinh */}
      {sourceMode === 'ai' && (
        <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1">
              <Icons.Sparkles size={13} className="text-indigo-600" /> Cấu hình Lò đúc AI
            </span>
            {!hideDataModeToggle && setDataMode && (
              <div className="flex bg-white p-0.5 rounded-lg border border-indigo-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setDataMode('vocab')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                    dataMode === 'vocab' ? 'bg-indigo-600 text-white' : 'text-gray-500'
                  }`}
                >
                  Từ vựng
                </button>
                <button
                  type="button"
                  onClick={() => setDataMode('sentence')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                    dataMode === 'sentence' ? 'bg-indigo-600 text-white' : 'text-gray-500'
                  }`}
                >
                  Câu văn
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {setCurrentLevel && (
              <div className="h-[42px]">
                <LevelSelector
                  lang={lang}
                  currentLevel={currentLevel}
                  onSelectLevel={setCurrentLevel}
                  mainColor="indigo"
                />
              </div>
            )}
            {setCurrentTopic && (
              <div className="h-[42px]">
                <TopicSelectorDropdown
                  currentLevel={currentLevel}
                  currentTopic={currentTopic}
                  onSelectTopic={setCurrentTopic}
                  mainColor="indigo"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 5. THANH TRẠNG THÁI ĐỈNH TRONG GAME (IN-GAME TOP HUD BAR)
// ============================================================================
export const GameTopHUD = ({
  onExit,
  currentRound = 1,
  maxRounds = 20,
  isEndless = false,
  score = 0,
  streak = 0,
  timeLeft = null,
  ammoCount = 0,
  isAiSource = false,
  onSaveWord = null,
  onOpenHanzi = null,
  lang = 'en',
  mainColor = 'blue'
}) => {
  return (
    <div className="w-full flex items-center justify-between gap-2 pb-3 mb-3 border-b border-gray-100 shrink-0">
      {/* Nút Thoát & Tiến độ câu */}
      <div className="flex items-center gap-2">
        <button
          onClick={onExit}
          className="p-2 bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors active:scale-95"
          title="Thoát màn chơi"
        >
          <Icons.X size={18} />
        </button>

        <div className="px-3 py-1.5 bg-gray-100 rounded-xl font-bold text-xs text-gray-700 flex items-center gap-1">
          <span>Câu</span>
          <span className={`text-${mainColor}-600 font-black`}>{currentRound}</span>
          <span>/</span>
          <span>{isEndless ? '∞' : maxRounds}</span>
        </div>

        {/* Huy hiệu Đạn AI dự trữ */}
        {isAiSource && (
          <div
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[10px] font-bold"
            title="Số câu hỏi AI đã nạp sẵn trong băng đạn"
          >
            <Icons.Database size={12} />
            <span>Đạn: {ammoCount}</span>
          </div>
        )}
      </div>

      {/* Khu vực Điểm số, Combo, Đồng hồ & Tiện ích */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {timeLeft !== null && (
          <div
            className={`px-2.5 py-1 rounded-xl font-mono font-bold text-xs flex items-center gap-1 border ${
              timeLeft <= 5
                ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}
          >
            <Icons.Clock size={13} />
            <span>{timeLeft}s</span>
          </div>
        )}

        {streak > 1 && (
          <div className="px-2.5 py-1 bg-orange-100 text-orange-600 border border-orange-200 rounded-xl font-black text-xs flex items-center gap-0.5 animate-bounce">
            <Icons.Zap size={13} fill="currentColor" />
            <span>x{streak}</span>
          </div>
        )}

        <div className={`px-3 py-1.5 bg-${mainColor}-50 text-${mainColor}-700 border border-${mainColor}-200 rounded-xl font-mono font-black text-xs sm:text-sm`}>
          {score} đ
        </div>

        {onSaveWord && (
          <button
            onClick={onSaveWord}
            className="p-2 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors"
            title="Lưu từ vào Sổ tay"
          >
            <Icons.Bookmark size={16} />
          </button>
        )}

        {lang === 'zh' && onOpenHanzi && (
          <button
            onClick={onOpenHanzi}
            className="p-2 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
            title="Tập viết chữ Hán"
          >
            <Icons.Brush size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export const GameSharedUI = {
  GameSummaryScreen,
  ResumeSessionBanner,
  GrammarTrapSelector,
  SourceModeSelector,
  GameTopHUD
};