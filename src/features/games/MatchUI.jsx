/**
 * @file src/features/games/MatchUI.jsx
 * @description Giao diện Setup & Bàn chơi của Mini-game Nối Ô (Match Game).
 * @origin Tầng 5 - Block 5.1 (Match UI)
 */

import React from 'react';
import { Icons } from '@/components/common/Icons';
import { MenuToggle } from '@/components/common/Controls';
import { ResumeSessionBanner, SourceModeSelector, GameTopHUD } from './common/GameSharedUI';

// ============================================================================
// 1. MÀN HÌNH CÀI ĐẶT GAME NỐI Ô (MATCH SETUP)
// ============================================================================
export const MatchSetup = ({
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
              <Icons.Link size={22} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight">
                {t ? t('modeMatch') : 'Nối Ô Từ Vựng'}
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {t ? t('descMatch') : 'Kết nối từ vựng và nghĩa tương ứng'}
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

        {/* Cấu hình Chế độ chơi & Độ khó */}
        <div className="space-y-2.5 pt-1">
          {/* Độ khó: Dễ (5 cặp chuẩn) vs Khó (4 cặp + 2 bẫy nhiễu) */}
          <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-full bg-orange-100 text-orange-600">
                <Icons.Zap size={18} />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-gray-700">
                  {t ? t('matchDiff') : 'Độ khó bàn chơi'}
                </div>
                <div className="text-[11px] text-gray-500">
                  {config.difficulty === 'hard'
                    ? 'Khó: Có cài thêm 2 ô bẫy chính tả/ngữ pháp'
                    : 'Dễ: Ghép nối trực tiếp 5 cặp từ chuẩn'}
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
                {t ? t('matchEasy') : 'Dễ'}
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
                {t ? t('matchHard') : 'Khó'}
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
                ? 'Chơi liên tục không giới hạn số màn'
                : `Chơi theo phiên tiêu chuẩn (${config.maxRounds || 5} màn)`
            }
          />

          {/* Giới hạn thời gian mỗi màn */}
          <MenuToggle
            active={config.timerEnabled}
            setActive={(val) => setConfig((prev) => ({ ...prev, timerEnabled: val }))}
            icon={Icons.Clock}
            color="orange"
            title=" Đếm ngược thời gian"
            subtitle={
              config.timerEnabled
                ? `Giới hạn ${config.timeLimit || 60} giây mỗi màn chơi`
                : 'Tắt đồng hồ đếm ngược, thoải mái suy nghĩ'
            }
          />

          {/* Tự động đọc phát âm khi ghép đúng */}
          <MenuToggle
            active={config.autoSpeak}
            setActive={(val) => setConfig((prev) => ({ ...prev, autoSpeak: val }))}
            icon={Icons.Volume2}
            color="blue"
            title="Phát âm tự động"
            subtitle="Đọc phát âm từ vựng ngay khi nối cặp chính xác"
          />
        </div>
      </div>

      {/* Footer Nút Bắt đầu */}
      <div className="pt-4 mt-4 border-t border-gray-100">
        {!canStart && (
          <p className="text-xs font-bold text-red-500 text-center mb-2">
            ⚠️ Cần tối thiểu {minRequiredCards} thẻ trong danh sách học hoặc chuyển sang chế độ AI Tự Sinh!
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
// 2. BÀN CHƠI NỐI Ô (MATCH BOARD)
// ============================================================================
export const MatchBoard = ({
  round = 1,
  maxRounds = 5,
  isEndless = false,
  score = 0,
  streak = 0,
  timeLeft = null,
  ammoCount = 0,
  isAiSource = false,
  leftItems = [],
  rightItems = [],
  selectedLeft = null,
  selectedRight = null,
  matchedLeftIds = [],
  matchedRightIds = [],
  wrongPair = null,
  trapFeedback = null,
  isRoundComplete = false,
  cooldownLeft = 0,
  onSelectLeft,
  onSelectRight,
  onNextRound,
  onExit,
  onSaveWord,
  onOpenHanzi,
  onSpeak,
  fontFamily = 'inherit',
  lang = 'en',
  mainColor = 'blue',
  t
}) => {
  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl p-4 sm:p-6 flex flex-col justify-between border-2 border-gray-100 overflow-hidden animate-in fade-in">
      {/* Thanh Top HUD Dùng chung */}
      <GameTopHUD
        onExit={onExit}
        currentRound={round}
        maxRounds={maxRounds}
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

      {/* Hướng dẫn ngắn */}
      <div className="flex items-center justify-between text-xs text-gray-500 font-bold mb-2 px-1 shrink-0">
        <span>Chọn 1 ô Nghĩa bên trái và nối với Từ tương ứng bên phải</span>
        <span className={`text-${mainColor}-600`}>
          Đã nối: {matchedLeftIds.length}/{leftItems.filter((i) => !i.isTrap).length}
        </span>
      </div>

      {/* Khu vực 2 cột Nối Ô */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 my-1">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 items-start">
          {/* CỘT TRÁI: ĐỊNH NGHĨA TIẾNG VIỆT */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400 text-center pb-1 border-b border-gray-100">
              Nghĩa Tiếng Việt
            </div>
            {leftItems
              .filter((item) => !item.isTrap)
              .map((item) => {
                const isMatched = matchedLeftIds.includes(item.id);
                const isSelected = selectedLeft?.id === item.id;
                const isWrong = wrongPair?.leftId === item.id;

                let cardStyle = 'bg-gray-50 border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50/40';
                if (isMatched) {
                  cardStyle = 'bg-green-50 border-green-300 text-green-700 opacity-45 pointer-events-none scale-95';
                } else if (isWrong) {
                  cardStyle = 'bg-red-50 border-red-500 text-red-700 animate-shake';
                } else if (isSelected) {
                  cardStyle = `bg-${mainColor}-50 border-${mainColor}-500 text-${mainColor}-800 ring-2 ring-${mainColor}-200 shadow-md`;
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isMatched || isRoundComplete}
                    onClick={() => onSelectLeft(item)}
                    className={`w-full min-h-[60px] p-3 rounded-xl border-2 font-bold text-xs sm:text-sm text-center flex items-center justify-center transition-all active:scale-95 break-words ${cardStyle}`}
                  >
                    <span>{item.definition}</span>
                  </button>
                );
              })}
          </div>

          {/* CỘT PHẢI: TỪ VỰNG / CÂU NGOẠI NGỮ (CÓ THỂ CHỨA BẪY Ở CHẾ ĐỘ HARD) */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-black uppercase tracking-wider text-gray-400 text-center pb-1 border-b border-gray-100">
              Từ / Câu ({lang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh'})
            </div>
            {rightItems.map((item) => {
              const isMatched = matchedRightIds.includes(item.id);
              const isSelected = selectedRight?.id === item.id;
              const isWrong = wrongPair?.rightId === item.id;

              let cardStyle = 'bg-white border-gray-200 text-gray-800 hover:border-indigo-300 hover:bg-indigo-50/30 shadow-sm';
              if (isMatched) {
                cardStyle = 'bg-green-50 border-green-300 text-green-700 opacity-45 pointer-events-none scale-95';
              } else if (isWrong) {
                cardStyle = 'bg-red-50 border-red-500 text-red-700 animate-shake';
              } else if (isSelected) {
                cardStyle = `bg-${mainColor}-50 border-${mainColor}-500 text-${mainColor}-800 ring-2 ring-${mainColor}-200 shadow-md`;
              } else if (isRoundComplete && item.isTrap) {
                cardStyle = 'bg-orange-50 border-orange-300 text-orange-700 opacity-75';
              }

              return (
                <div key={item.id} className="relative group">
                  <button
                    type="button"
                    disabled={isMatched || isRoundComplete}
                    onClick={() => onSelectRight(item)}
                    style={{ fontFamily }}
                    className={`w-full min-h-[60px] p-3 rounded-xl border-2 font-bold text-sm sm:text-base text-center flex items-center justify-center transition-all active:scale-95 break-words ${cardStyle}`}
                  >
                    <span>{item.term}</span>
                  </button>

                  {/* Nút nghe nhanh phát âm của ô bên phải */}
                  {onSpeak && !item.isTrap && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSpeak(item.term);
                      }}
                      className="absolute right-1.5 top-1.5 p-1 text-gray-300 hover:text-blue-500 rounded-full bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Nghe phát âm"
                    >
                      <Icons.Volume2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hộp cảnh báo khi người chơi bấm trúng Ô Bẫy (Hard Mode) */}
      {trapFeedback && (
        <div className="mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-left flex items-start gap-2.5 animate-in slide-in-from-bottom-2 shrink-0">
          <Icons.AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <div className="font-black uppercase tracking-wider">Bẫy chính tả / ngữ pháp!</div>
            <div className="mt-0.5">
              Từ <b className="underline">{trapFeedback.term}</b> là bẫy.{' '}
              {trapFeedback.originalTerm && (
                <span>
                  Từ đúng phải là: <b className="text-green-700">{trapFeedback.originalTerm}</b>.{' '}
                </span>
              )}
              {trapFeedback.explanation && <span>({trapFeedback.explanation})</span>}
            </div>
          </div>
        </div>
      )}

      {/* Thanh điều khiển qua màn khi hoàn thành bàn chơi */}
      {isRoundComplete && (
        <div className="pt-3 mt-2 border-t border-gray-100 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 shrink-0">
          <div className="flex items-center gap-2 text-green-600 font-black text-sm">
            <Icons.CheckCircle size={20} />
            <span>Hoàn thành bàn {round}!</span>
          </div>

          <button
            onClick={onNextRound}
            disabled={cooldownLeft > 0}
            className={`px-6 py-2.5 rounded-xl font-black text-white shadow-md transition-all active:scale-95 flex items-center gap-2 text-sm ${
              cooldownLeft > 0
                ? 'bg-gray-400 cursor-wait'
                : `bg-${mainColor}-600 hover:bg-${mainColor}-700`
            }`}
          >
            <span>
              {cooldownLeft > 0
                ? `Đợi nạp đạn (${cooldownLeft}s)...`
                : t
                ? t('matchNextBtn')
                : 'Màn tiếp theo'}
            </span>
            <Icons.ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export const MatchUI = {
  MatchSetup,
  MatchBoard
};