/**
 * @file src/features/games/ScrambleUI.jsx
 * @description Giao diện Setup & Bàn chơi của Mini-game Ghép Câu / Sắp Xếp Từ (Scramble Game).
 * @origin Tầng 5 - Block 5.3 (Scramble UI)
 */

import React, { useRef, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import {
  ResumeSessionBanner,
  SourceModeSelector,
  GrammarTrapSelector,
  GameTopHUD
} from './common/GameSharedUI';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT GAME GHÉP CÂU (SCRAMBLE SETUP)
// ============================================================================
export const ScrambleSetup = ({
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
              <Icons.Shuffle size={22} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight">
                {t ? t('modeScramble') : 'Ghép Câu & Từ'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {t ? t('descScramble') : 'Sắp xếp các mảnh từ thành câu/từ hoàn chỉnh'}
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
            gameType="scramble"
            lang={lang}
            currentLevel={currentLevel}
            selectedTrap={config.grammarId}
            onSelectTrap={(val) => setConfig((prev) => ({ ...prev, grammarId: val }))}
            mainColor={mainColor}
          />
        )}

        {/* Các Tùy chọn Chế độ chơi */}
        <div className="space-y-2.5 pt-1">
          {/* Phương thức thao tác: Chạm chọn từ (Tap) vs Gõ phím (Type) */}
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-full bg-indigo-100 text-indigo-600">
                <Icons.Keyboard size={18} />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-gray-700">Phương thức trả lời</div>
                <div className="text-[11px] text-gray-500">
                  {config.inputMethod === 'type'
                    ? 'Tự gõ lại toàn bộ từ/câu bằng bàn phím'
                    : 'Chạm chọn các mảnh từ bị xáo trộn'}
                </div>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm shrink-0">
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, inputMethod: 'tap' }))}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  config.inputMethod !== 'type'
                    ? `bg-${mainColor}-600 text-white shadow-sm`
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Chạm từ
              </button>
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, inputMethod: 'type' }))}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  config.inputMethod === 'type'
                    ? `bg-${mainColor}-600 text-white shadow-sm`
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Gõ phím
              </button>
            </div>
          </div>

          {/* Độ khó: Dễ (Không có từ rác) vs Khó (Trộn thêm từ nhiễu) */}
          {config.inputMethod !== 'type' && (
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-full bg-orange-100 text-orange-600">
                  <Icons.Zap size={18} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-gray-700">Độ khó mảnh ghép</div>
                  <div className="text-[11px] text-gray-500">
                    {config.difficulty === 'hard'
                      ? 'Khó: Cài thêm các mảnh từ rác gây nhiễu'
                      : 'Dễ: Chỉ chứa đúng các mảnh của câu gốc'}
                  </div>
                </div>
              </div>

              <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm shrink-0">
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, difficulty: 'easy' }))}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    config.difficulty === 'easy'
                      ? 'bg-green-500 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Dễ
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, difficulty: 'hard' }))}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    config.difficulty === 'hard'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Khó (+Bẫy)
                </button>
              </div>
            </div>
          )}

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
            ⚠️ Danh sách học đang trống! Hãy thêm thẻ hoặc chuyển sang chế độ AI Tự Sinh.
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
          <Icons.Play size={20} fill="currentColor" /> BẮT ĐẦU GHÉP CÂU
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. BÀN CHƠI GHÉP CÂU (SCRAMBLE BOARD)
// ============================================================================
export const ScrambleBoard = ({
  currentIndex = 0,
  totalQuestions = 20,
  isEndless = false,
  score = 0,
  streak = 0,
  timeLeft = null,
  ammoCount = 0,
  isAiSource = false,
  currentCard = null,
  inputMethod = 'tap',
  poolTokens = [],
  selectedTokens = [],
  typedAnswer = '',
  setTypedAnswer,
  answerStatus = null, // null | 'correct' | 'wrong'
  grammarExplanation = '',
  isExplaining = false,
  cooldownLeft = 0,
  onSelectPoolToken,
  onRemoveSelectedToken,
  onClearSelected,
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
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputMethod === 'type' && answerStatus === null) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [currentIndex, inputMethod, answerStatus]);

  const originCard = currentCard?.origin || currentCard || {};
  const promptMeaning = originCard.definition || 'Sắp xếp thành từ/câu hoàn chỉnh';
  const targetTerm = originCard.term || '';

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

      {/* Khu vực trung tâm bàn chơi */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1 my-1 flex flex-col justify-center">
        {/* Đề bài: Nghĩa Tiếng Việt + Nút nghe gợi ý */}
        <div className={`p-4 rounded-2xl bg-${mainColor}-50/70 border border-${mainColor}-100 text-center relative`}>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">
            {t ? t('meaning') : 'Nghĩa câu / từ mục tiêu'}
          </div>
          <div className="text-base sm:text-xl font-black text-gray-800 leading-snug break-words">
            {promptMeaning}
          </div>

          {onSpeak && targetTerm && (
            <button
              type="button"
              onClick={() => onSpeak(targetTerm)}
              className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-${mainColor}-600 border border-${mainColor}-200 text-xs font-bold shadow-sm hover:bg-${mainColor}-50 transition-all active:scale-95`}
            >
              <Icons.Volume2 size={14} />
              <span>{t ? t('listenAgain') : 'Nghe phát âm'}</span>
            </button>
          )}
        </div>

        {/* Khu vực lắp ráp câu (Tap Mode) hoặc Ô gõ chữ (Type Mode) */}
        {inputMethod === 'type' ? (
          <div className="space-y-2">
            <textarea
              ref={inputRef}
              rows={3}
              disabled={answerStatus !== null}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (answerStatus === null) onCheckAnswer();
                  else if (cooldownLeft === 0) onNextQuestion();
                }
              }}
              style={{ fontFamily }}
              placeholder="Gõ câu hoặc từ trả lời của bạn vào đây..."
              className={`w-full p-4 rounded-2xl border-2 text-base sm:text-lg font-bold outline-none resize-none transition-all ${
                answerStatus === 'correct'
                  ? 'bg-green-50 border-green-500 text-green-800'
                  : answerStatus === 'wrong'
                  ? 'bg-red-50 border-red-500 text-red-800'
                  : `bg-gray-50 border-gray-200 focus:bg-white focus:border-${mainColor}-400`
              }`}
            />
          </div>
        ) : (
          <>
            {/* Khay chứa các từ đã chọn */}
            <div
              className={`min-h-[84px] p-3.5 rounded-2xl border-2 border-dashed flex flex-wrap items-center justify-center gap-2 transition-all ${
                answerStatus === 'correct'
                  ? 'bg-green-50 border-green-400'
                  : answerStatus === 'wrong'
                  ? 'bg-red-50 border-red-400'
                  : 'bg-gray-50/80 border-gray-300'
              }`}
            >
              {selectedTokens.length === 0 ? (
                <span className="text-xs font-bold text-gray-400 italic select-none">
                  Chạm vào các mảnh từ bên dưới để ghép thành câu...
                </span>
              ) : (
                selectedTokens.map((tok, idx) => (
                  <button
                    key={tok.id}
                    type="button"
                    disabled={answerStatus !== null}
                    onClick={() => onRemoveSelectedToken(tok, idx)}
                    style={{ fontFamily }}
                    className={`px-3.5 py-2 rounded-xl font-bold text-sm sm:text-base shadow-sm border transition-all active:scale-95 ${
                      answerStatus === 'correct'
                        ? 'bg-green-600 text-white border-green-700'
                        : answerStatus === 'wrong'
                        ? 'bg-red-600 text-white border-red-700'
                        : `bg-white text-${mainColor}-700 border-${mainColor}-300 hover:bg-red-50 hover:border-red-300`
                    }`}
                  >
                    {tok.text}
                  </button>
                ))
              )}
            </div>

            {/* Kho các mảnh từ xáo trộn bên dưới */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Các mảnh ghép khả dụng
                </span>
                {selectedTokens.length > 0 && answerStatus === null && (
                  <button
                    type="button"
                    onClick={onClearSelected}
                    className="text-xs font-bold text-gray-400 hover:text-red-500 flex items-center gap-1"
                  >
                    <Icons.RotateCcw size={12} /> Làm lại
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 p-2">
                {poolTokens.map((tok) => {
                  const isUsed = selectedTokens.some((s) => s.id === tok.id);
                  return (
                    <button
                      key={tok.id}
                      type="button"
                      disabled={isUsed || answerStatus !== null}
                      onClick={() => onSelectPoolToken(tok)}
                      style={{ fontFamily }}
                      className={`px-3.5 py-2 rounded-xl font-bold text-sm sm:text-base border-2 transition-all ${
                        isUsed
                          ? 'bg-gray-100 text-transparent border-gray-200 pointer-events-none scale-95'
                          : 'bg-white text-gray-800 border-gray-200 shadow-sm hover:border-blue-400 hover:bg-blue-50/40 active:scale-95'
                      }`}
                    >
                      {tok.text}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Khối hiển thị Đáp án chuẩn & Phân tích Ngữ pháp sau khi kiểm tra */}
        {answerStatus !== null && (
          <div
            className={`p-3.5 rounded-2xl border text-left space-y-2 animate-in slide-in-from-bottom-2 ${
              answerStatus === 'correct'
                ? 'bg-green-50/90 border-green-200 text-green-900'
                : 'bg-red-50/90 border-red-200 text-red-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-sm">
                {answerStatus === 'correct' ? (
                  <>
                    <Icons.CheckCircle size={18} className="text-green-600" />
                    <span>{t ? t('scrambleCorrect') : 'Chính xác tuyệt đối!'}</span>
                  </>
                ) : (
                  <>
                    <Icons.AlertCircle size={18} className="text-red-600" />
                    <span>{t ? t('scrambleWrong') : 'Chưa chính xác!'}</span>
                  </>
                )}
              </div>

              {onExplainGrammar && (
                <button
                  type="button"
                  disabled={isExplaining}
                  onClick={onExplainGrammar}
                  className="px-2.5 py-1 bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold hover:bg-purple-200 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Icons.Sparkles size={13} className={isExplaining ? 'animate-spin' : ''} />
                  <span>{isExplaining ? 'Đang phân tích...' : t ? t('explainBtn') : 'Giải thích'}</span>
                </button>
              )}
            </div>

            <div className="text-xs sm:text-sm">
              <span className="font-bold opacity-75">Đáp án chuẩn: </span>
              <b style={{ fontFamily }} className="text-sm sm:text-base underline decoration-dotted">
                {targetTerm}
              </b>
            </div>

            {(grammarExplanation || originCard.analysis) && (
              <div className="p-2.5 bg-white/90 rounded-xl border border-purple-100 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                <div className="font-black text-purple-700 mb-0.5 flex items-center gap-1">
                  <Icons.Sparkles size={12} /> Phân tích cấu trúc:
                </div>
                {grammarExplanation || originCard.analysis}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Nút Kiểm tra / Câu tiếp theo */}
      <div className="pt-3 mt-2 border-t border-gray-100 shrink-0">
        {answerStatus === null ? (
          <button
            type="button"
            onClick={onCheckAnswer}
            disabled={
              inputMethod === 'type' ? !typedAnswer.trim() : selectedTokens.length === 0
            }
            className={`w-full py-3.5 rounded-xl font-black text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed bg-${mainColor}-600 hover:bg-${mainColor}-700`}
          >
            <Icons.Check size={20} />
            <span>{t ? t('matchCheckBtn') : 'Kiểm tra đáp án'}</span>
          </button>
        ) : (
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
                : 'Câu tiếp theo'}
            </span>
            <Icons.ChevronRight size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export const ScrambleUI = {
  ScrambleSetup,
  ScrambleBoard
};