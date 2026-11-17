// ============================================================================
// FILE 49/85: src/features/games/common/GameSharedUI.jsx
// NGUỒN GỐC: tang_5.js (Rút trích từ 10 Mini-Games) + transshipment-03.js
// NHIỆM VỤ: Chứa các Sub-components giao diện dùng chung cho 10 Mini-Games:
//           Popup xác nhận thoát sớm (ConfirmExitModal), Huy hiệu nguồn câu hỏi
//           & đếm đạn (SourceAndAmmoBadges), Footer điều khiển kết quả
//           (GameResultFooter), Màn hình tổng kết (GameSummaryScreen),
//           Banner khôi phục phiên (ResumeSessionBanner), Bộ chọn bẫy ngữ pháp
//           (GrammarTrapSelector), Bộ chọn nguồn dữ liệu (SourceModeSelector)
//           và Thanh trạng thái đỉnh (GameTopHUD).
// ============================================================================

import React, { useMemo } from 'react';
import { Icons } from '../../../components/common/Icons';
import { LevelSelector, TopicSelectorDropdown } from '../../../components/common/Controls';
import { getGrammarTopics } from '../../../engines/microPrompts';

// ============================================================================
// 1. POPUP XÁC NHẬN THOÁT SỚM (CONFIRM EXIT MODAL - CHUẨN TANG_5.JS)
// ============================================================================
export const ConfirmExitModal = ({
  isOpen = false,
  onCancel,
  onConfirm,
  title = 'Kết thúc sớm?',
  message = 'Tiến trình của câu hỏi hiện tại sẽ không được lưu lại. Bạn có chắc chắn muốn thoát?',
  cancelText = 'Chơi tiếp',
  confirmText = 'Thoát ngay'
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border-2 border-red-100 flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-4">
          <Icons.AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-black text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 text-sm mb-6">{message}</p>
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. HUY HIỆU NGUỒN CÂU HỎI, BĂNG ĐẠN AI & ĐỒNG HỒ PHANH UI
// ============================================================================
export const SourceAndAmmoBadges = ({
  isRescued = false,
  isAiGenerated = false,
  showAmmo = false,
  queueLength = 0,
  ammoLabel = 'Đã nạp',
  aiWaitTime = 0,
  hideOnMobile = false
}) => {
  const displayClass = hideOnMobile ? 'hidden sm:flex' : 'flex';

  return (
    <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
      {isRescued ? (
        <span
          className={`${displayClass} text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 bg-orange-100 text-orange-700 border border-orange-200 shadow-sm`}
          title="Sử dụng dữ liệu dự phòng do mất kết nối"
        >
          <Icons.AlertCircle size={12} className="text-orange-500" /> Nguồn: Dự phòng
        </span>
      ) : isAiGenerated ? (
        <span
          className={`${displayClass} text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm`}
          title="Câu hỏi được tạo bởi AI"
        >
          <Icons.Sparkles size={12} className="text-indigo-500" /> Nguồn: AI
        </span>
      ) : (
        <span
          className={`${displayClass} text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 shadow-sm`}
          title="Trích xuất từ Bộ thẻ"
        >
          <Icons.Layers size={12} className="text-slate-400" /> Nguồn: Thẻ gốc
        </span>
      )}

      {showAmmo && queueLength > 0 && (
        <span
          className={`${displayClass} text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 shadow-sm bg-blue-50 text-blue-600 border border-blue-200`}
          title={`Đã nạp sẵn ${queueLength} câu`}
        >
          <Icons.Database size={12} className="text-blue-500" /> {ammoLabel}: {queueLength}
        </span>
      )}

      {aiWaitTime > 0 && (
        <span
          className={`${displayClass} text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider items-center gap-1 shadow-sm bg-indigo-50 text-indigo-600 border border-indigo-200 animate-pulse`}
          title="Thời gian chờ an toàn"
        >
          <Icons.Clock size={12} className="text-indigo-500" /> {aiWaitTime}s
        </span>
      )}
    </div>
  );
};

// ============================================================================
// 3. FOOTER ĐIỀU KHIỂN KẾT QUẢ & CHUYỂN CÂU (GAME RESULT FOOTER - CHUẨN VÀNG)
// ============================================================================
export const GameResultFooter = ({
  isFinishedState = false,
  isCorrect = false,
  isGenerating = false,
  aiWaitTime = 0,
  resultTimer = 0,
  isResultPaused = false,
  onToggleResultPause,
  onNext,
  onSkip,
  onRequestEnd,
  nextLabel = 'Tiếp theo',
  skipLabel = 'Bỏ qua câu này',
  pauseLabel = 'Xem',
  mainColor = 'blue',
  extraResultButtons = null,
  customActionContent = null
}) => {
  const nextBtnBg = isCorrect
    ? 'bg-green-500 hover:bg-green-600'
    : `bg-${mainColor}-600 hover:bg-${mainColor}-700`;

  return (
    <div className="w-full p-3 sm:p-4 bg-white border-t border-gray-200 shrink-0 flex items-center justify-between z-40 pb-safe shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
      {/* Nút Kết thúc (Bên trái) */}
      {onRequestEnd && (
        <button
          type="button"
          onClick={onRequestEnd}
          className="absolute left-2 sm:left-4 text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 transition-colors px-2 py-2 hover:bg-red-50 rounded-lg"
          title="Kết thúc"
        >
          <Icons.X size={16} /> <span className="hidden sm:inline">Kết thúc</span>
        </button>
      )}

      {/* Khu vực điều khiển chính (Căn giữa/phải) */}
      <div className="flex-1 flex justify-center sm:justify-end max-w-md ml-auto">
        {customActionContent ? (
          customActionContent
        ) : isFinishedState ? (
          <div className="w-full flex gap-2 sm:gap-3">
            {extraResultButtons}
            {onToggleResultPause && (
              <button
                type="button"
                onClick={onToggleResultPause}
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
                    <Icons.Pause size={16} fill="currentColor" /> {pauseLabel} ({resultTimer}s)
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onNext}
              disabled={isGenerating || aiWaitTime > 0}
              className={`flex-[2] py-3 sm:py-4 text-white font-bold text-sm sm:text-lg rounded-xl shadow-lg flex justify-center items-center gap-1.5 sm:gap-2 transition-transform ${
                isGenerating || aiWaitTime > 0
                  ? 'bg-gray-400 opacity-70 cursor-not-allowed'
                  : `active:scale-95 ${nextBtnBg}`
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{' '}
                  Đang tải...
                </>
              ) : (
                <>
                  {nextLabel} <Icons.ChevronRight size={20} className="sm:w-6 sm:h-6" />
                </>
              )}
            </button>
          </div>
        ) : (
          onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={aiWaitTime > 0 || isGenerating}
              className={`w-full py-3 sm:py-4 bg-gray-100 text-gray-600 font-bold text-xs sm:text-sm rounded-xl hover:bg-gray-200 transition-all border border-gray-200 flex items-center justify-center gap-2 ${
                aiWaitTime > 0 || isGenerating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'active:scale-95'
              }`}
            >
              {skipLabel} <Icons.SkipForward size={18} className="sm:w-5 sm:h-5" />
            </button>
          )
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 4. MÀN HÌNH TỔNG KẾT ĐIỂM DÙNG CHUNG (GAME SUMMARY SCREEN)
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
      <div
        className={`w-24 h-24 rounded-full bg-${badgeColor}-100 text-${badgeColor}-500 flex items-center justify-center mb-4 shadow-inner border-4 border-${badgeColor}-200 animate-bounce`}
      >
        <Icons.Award size={48} />
      </div>

      <h2 className="text-2xl sm:text-3xl font-black text-gray-800 mb-1">
        {title || (t ? t('finishTitle') : 'Hoàn thành!')}
      </h2>
      <p className="text-sm font-bold text-gray-500 mb-6">{subtitle || rankLabel}</p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm mb-8">
        <div
          className={`p-4 rounded-2xl bg-${mainColor}-50 border border-${mainColor}-100 flex flex-col items-center`}
        >
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
            type="button"
            onClick={onRestart}
            className={`flex-1 py-3.5 px-6 bg-${mainColor}-600 text-white font-bold rounded-xl shadow-lg hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center justify-center gap-2`}
          >
            <Icons.RotateCcw size={18} /> Chơi lại
          </button>
        )}
        <button
          type="button"
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
// 5. BANNER KHÔI PHỤC PHIÊN CHƠI ĐANG DANG DỞ (RESUME SESSION BANNER)
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
  const savedScore = savedSession.score || savedSession.stats?.correct || 0;

  return (
    <div
      className={`w-full p-3.5 mb-4 rounded-xl bg-gradient-to-r from-${mainColor}-50 to-indigo-50 border-2 border-${mainColor}-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-full bg-${mainColor}-600 text-white shadow`}>
          <Icons.Clock size={20} />
        </div>
        <div className="text-left">
          <div className={`text-xs font-black uppercase tracking-wider text-${mainColor}-800`}>
            Phát hiện phiên chơi đang dở!
          </div>
          <div className="text-xs text-gray-600 font-medium mt-0.5">
            Tiến trình: <b className="text-gray-800">Câu {currentStep}/{totalStep}</b> • Điểm:{' '}
            <b className="text-orange-600">{savedScore}</b>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          onClick={onResume}
          className={`flex-1 sm:flex-initial px-4 py-2 bg-${mainColor}-600 text-white text-xs font-bold rounded-lg shadow hover:bg-${mainColor}-700 transition-all active:scale-95 flex items-center justify-center gap-1`}
        >
          <Icons.Play size={14} fill="currentColor" /> Tiếp tục
        </button>
        {onClear && (
          <button
            type="button"
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
// 6. BỘ CHỌN CHUYÊN ĐỀ BẪY NGỮ PHÁP (GRAMMAR TRAP SELECTOR)
// ============================================================================
export const GrammarTrapSelector = ({
  gameType = 'quiz',
  lang = 'en',
  currentLevel,
  selectedTrap,
  onSelectTrap,
  disabled = false
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
    <div className="w-full bg-indigo-50 p-3.5 rounded-2xl border border-indigo-100 text-left space-y-2 animate-in fade-in">
      <div className="flex items-center justify-between">
        <label className="text-xs sm:text-sm font-bold text-indigo-800 flex items-center gap-1.5">
          <Icons.Target size={16} className="text-indigo-600" />
          Chuyên đề Ngữ pháp (Bẫy AI)
        </label>
        {selectedTrap && selectedTrap !== 'random' && !disabled && (
          <button
            type="button"
            onClick={() => onSelectTrap('random')}
            className="text-[10px] font-bold text-indigo-600 hover:text-red-500 underline"
          >
            Đặt lại ngẫu nhiên
          </button>
        )}
      </div>

      <select
        value={selectedTrap || 'random'}
        onChange={(e) => onSelectTrap(e.target.value)}
        disabled={disabled}
        className={`w-full p-2.5 border rounded-xl text-xs sm:text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all ${
          disabled
            ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-70 cursor-not-allowed'
            : 'bg-white border-indigo-200 text-gray-700'
        }`}
      >
        <option value="random">🎲 Trộn ngẫu nhiên toàn bộ</option>
        {Object.entries(groupedTopics).map(([groupName, items]) => (
          <optgroup key={groupName} label={`--- ${groupName} ---`}>
            {items.map((tItem) => (
              <option key={tItem.id} value={tItem.id}>
                {tItem.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

// ============================================================================
// 7. BỘ CHỌN NGUỒN DỮ LIỆU & BỘ LỌC CẤP ĐỘ (SOURCE MODE SELECTOR)
// ============================================================================
export const SourceModeSelector = ({
  sourceMode = 'card',
  setSourceMode,
  cardsCount = 0,
  minCards = 2,
  lang = 'en',
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  dataMode,
  setDataMode,
  mainColor = 'blue',
  onMissingKey,
  hideDataModeToggle = false,
  cardSubtitle = 'Ôn tập trong Flashcard',
  aiSubtitle = 'Tạo thử thách mới vô tận'
}) => {
  const isCardSource = sourceMode === 'card' || sourceMode === 'local';
  const isAiPureSource = sourceMode === 'ai_pure' || sourceMode === 'ai';
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
    setSourceMode('ai_pure');
  };

  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSourceMode('card')}
          className={`p-2.5 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
            isCardSource
              ? `border-${mainColor}-500 bg-${mainColor}-50 shadow-sm`
              : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
          } hover:scale-105`}
        >
          <Icons.Layers
            size={24}
            className={isCardSource ? `text-${mainColor}-600` : 'text-gray-400'}
          />
          <div className="text-center">
            <div className="font-bold text-gray-800 text-sm">Thẻ của tôi</div>
            <div
              className={`text-[10px] ${
                hasEnoughLocalCards ? 'text-gray-500' : 'text-orange-500 font-medium'
              }`}
            >
              {cardsCount > 0 ? `${cardSubtitle} (${cardsCount})` : cardSubtitle}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleSelectAiSource}
          className={`p-2.5 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${
            isAiPureSource
              ? 'border-blue-500 bg-blue-50 shadow-sm'
              : 'border-gray-100 bg-white opacity-60 hover:opacity-100'
          } hover:scale-105`}
        >
          <Icons.Sparkles
            size={24}
            className={isAiPureSource ? 'text-blue-600' : 'text-gray-400'}
          />
          <div className="text-center">
            <div className="font-bold text-gray-800 text-sm">AI Tự Sinh</div>
            <div className="text-[10px] text-gray-500">{aiSubtitle}</div>
          </div>
        </button>
      </div>

      {/* Bộ lọc Cấp độ, Chủ đề & Chế độ Từ/Câu tùy chọn khi bật AI Tự Sinh */}
      {isAiPureSource && (setCurrentLevel || setCurrentTopic || setDataMode) && (
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
// 8. THANH TRẠNG THÁI ĐỈNH TRONG GAME (IN-GAME TOP HUD BAR)
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
          type="button"
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

        <div
          className={`px-3 py-1.5 bg-${mainColor}-50 text-${mainColor}-700 border border-${mainColor}-200 rounded-xl font-mono font-black text-xs sm:text-sm`}
        >
          {score} đ
        </div>

        {onSaveWord && (
          <button
            type="button"
            onClick={onSaveWord}
            className="p-2 bg-yellow-50 text-yellow-600 border border-yellow-200 rounded-xl hover:bg-yellow-100 transition-colors"
            title="Lưu từ vào Sổ tay"
          >
            <Icons.Bookmark size={16} />
          </button>
        )}

        {lang === 'zh' && onOpenHanzi && (
          <button
            type="button"
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
  ConfirmExitModal,
  SourceAndAmmoBadges,
  GameResultFooter,
  GameSummaryScreen,
  ResumeSessionBanner,
  GrammarTrapSelector,
  SourceModeSelector,
  GameTopHUD
};

if (typeof window !== 'undefined') {
  window.GameSharedUI = GameSharedUI;
}

export default GameSharedUI;