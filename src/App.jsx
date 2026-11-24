// ============================================================================
// FILE 84/85: src/App.jsx
// NGUỒN GỐC: Tầng 7 (Block 7.1 - Version 1.15)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 22:00 (GMT+7)
// NHIỆM VỤ: Điểm lắp ráp chính (Main Entry Point), điều phối Layout
//           (Trái/Giữa/Phải), Learn/Game View và hệ thống 15 Modals;
//           vá trọn vẹn 3/3 lỗi Hợp đồng Props (ApiKeyModal, NotebookModal,
//           LinkManagerModal), diệt 1/1 lỗi HIGH localStorage.setItem trần qua
//           Utils.safeLocalStorageSet, tĩnh hóa nền Tailwind và gia cố Toast.
// ============================================================================


import React, { useContext } from 'react';
import { AppContext, AppProvider, useAppContext } from '@/context/AppContext';
import { Utils } from '@/utils/helpers';


// Common & Layout Components (Giai đoạn 4A)
import { AiModeSwitch } from '@/components/common/Controls';
import { AppHeader } from '@/components/layout/AppHeader';
import { FlashcardDisplay } from '@/components/layout/FlashcardDisplay';
import { ControlBar } from '@/components/layout/ControlBar';
import { BottomNav } from '@/components/layout/BottomNav';


// Game Router (Giai đoạn 5A)
import { GameView } from '@/features/games/GameView';


// Feature Modals (Giai đoạn 4B)
import { HanziWriterModal } from '@/components/modals/HanziWriterModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { NotebookModal } from '@/components/modals/NotebookModal';
import { MasteredModal, IncorrectModal } from '@/components/modals/ProgressModals';
import { SaveLoadModal } from '@/components/modals/SaveLoadModal';
import { AiChatModal } from '@/components/modals/AiChatModal';
import { ApiKeyModal } from '@/components/modals/ApiKeyModal';
import { LinkManagerModal } from '@/components/modals/LinkManagerModal';
import { ManualInputModal } from '@/components/modals/ManualInputModal';
import { AiConfigModal } from '@/components/modals/AiConfigModal';
import { WordSelectorModal, HanziSelectorModal } from '@/components/modals/HelperModals';
import { HelpModal } from '@/components/modals/HelpModal';
import { ExamPoolManagerModal } from '@/components/modals/ExamPoolManagerModal';


// Bảng tra cứu tĩnh màu nền ứng dụng (chống Tailwind CSS purge class động)
const APP_BG_CLASSES = {
  red: 'bg-red-50',
  sky: 'bg-sky-50'
};


// Bảng tra cứu tĩnh màu nền Toast
const TOAST_BG_CLASSES = {
  error: 'bg-red-500',
  success: 'bg-green-500',
  warning: 'bg-orange-500',
  info: 'bg-gray-800'
};


const MainAppContent = () => {
  const {
    coreState,
    state,
    setters,
    actions,
    examPoolData,
    handleGlobalToast,
    handleSmartBookmark,
    handleUpdateCards
  } = useAppContext();


  // ============================================================================
  // 1. CHỐT CHẶN CƠ SỞ DỮ LIỆU INDEXEDDB (EARLY RETURN)
  // ============================================================================
  if (!coreState.isDbReady) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-blue-600 font-bold animate-pulse tracking-widest uppercase text-sm">
          Nạp CSDL IndexedDB...
        </p>
      </div>
    );
  }


  // ============================================================================
  // 2. TÍNH TOÁN RENDER, MÀU CHỦ ĐẠO & BỐ CỤC KHÔNG GIAN
  // ============================================================================
  const appMainColor = coreState.lang === 'zh' ? 'red' : 'sky';
  const appBgClass = APP_BG_CLASSES[appMainColor] || APP_BG_CLASSES.sky;


  const notebookCount = Array.isArray(coreState.notebook)
    ? coreState.notebook.length
    : 0;
  const masteredCount = Array.isArray(coreState.mastered)
    ? coreState.mastered.length
    : 0;
  const incorrectCount = Array.isArray(coreState.incorrectList)
    ? coreState.incorrectList.length
    : 0;


  // Fallback mở hộp thoại API Key an toàn cho Learn Mode
  const handleMissingKey =
    actions?.onMissingKey || (() => coreState.setShowApiKeyModal(true));


  // Lưu cài đặt liên kết qua Utils.safeLocalStorageSet (diệt lỗi HIGH Quota)
  const handleSaveLinkSetting = (key, value) => {
    if (!key || typeof key !== 'string') return;
    const cleanValue =
      typeof value === 'string'
        ? value.trim()
        : value == null
        ? ''
        : value;


    const saved = Utils.safeLocalStorageSet(key, cleanValue);
    if (saved) {
      handleGlobalToast?.('Đã lưu cài đặt liên kết mặc định!', 'success');
    } else {
      handleGlobalToast?.(
        'Không thể lưu liên kết (bộ nhớ trình duyệt bị chặn hoặc đã đầy).',
        'warning'
      );
    }
  };


  let alignClass = 'mx-auto';
  let mainParentClass =
    'flex-1 w-full max-w-7xl mx-auto p-4 flex flex-col overflow-y-scroll overflow-x-hidden custom-scrollbar pb-6';
  let bottomWrapperClass =
    'w-full max-w-4xl px-4 mb-3 transition-all duration-500 ease-in-out ';


  if (coreState.viewMode === 'learn' && coreState.layoutAlign) {
    if (coreState.layoutAlign === 'left') {
      alignClass = 'md:ml-[2vw] lg:ml-[4vw] md:mr-auto';
      mainParentClass =
        'flex-1 w-full px-2 md:px-0 py-4 flex flex-col overflow-y-scroll overflow-x-hidden custom-scrollbar pb-6 transition-all duration-500';
    } else if (coreState.layoutAlign === 'right') {
      alignClass = 'md:mr-[2vw] lg:mr-[4vw] md:ml-auto';
      mainParentClass =
        'flex-1 w-full px-2 md:px-0 py-4 flex flex-col overflow-y-scroll overflow-x-hidden custom-scrollbar pb-6 transition-all duration-500';
    }
  }
  bottomWrapperClass += alignClass;


  // Chuẩn hóa an toàn dữ liệu Toast (chấp nhận cả chuỗi lẫn object { text, message, type })
  const toastContent =
    typeof coreState.toast === 'string'
      ? coreState.toast
      : coreState.toast?.text || coreState.toast?.message || '';
  const toastType =
    typeof coreState.toast === 'object' && coreState.toast !== null
      ? coreState.toast.type || 'info'
      : 'info';
  const toastBgClass = TOAST_BG_CLASSES[toastType] || TOAST_BG_CLASSES.info;


  // ============================================================================
  // 3. VIEW ROUTING (LEARN MODE vs GAME MODE)
  // ============================================================================
  let mainContent = null;


  if (coreState.viewMode === 'game') {
    mainContent = (
      <GameView
        state={state}
        setters={setters}
        actions={actions}
        t={actions?.t || ((k) => k)}
        mainColor="indigo"
        isAiMode={coreState.isAiModeGame}
        setAiMode={coreState.setIsAiModeGame}
        onMissingKey={() => coreState.setShowApiKeyModal(true)}
        isLoading={coreState.isAiLoading}
        cards={coreState.cards}
        lang={coreState.lang}
        onPlay={actions?.speak}
        onBookmark={handleSmartBookmark}
        notebook={coreState.notebook}
        showToast={handleGlobalToast}
        onLogWrong={actions?.handleLogWrong}
        onOpenIncorrect={actions?.handleOpenIncorrect}
        globalRetryBag={coreState.globalRetryBag}
        addToRetryBag={actions?.addToRetryBag}
        removeFromRetryBag={actions?.removeFromRetryBag}
        gameSessions={coreState.gameSessions}
        setGameSessions={coreState.setGameSessions}
        setIsGamePlaying={coreState.setIsGamePlaying}
        settings={coreState.settings}
        onUpdateCards={handleUpdateCards}
        onSaveToHarvest={actions?.handleSaveToHarvest}
        currentLevel={coreState.currentLevel}
        currentTopic={coreState.currentTopic}
        dataMode={coreState.dataMode}
        onOpenExamPoolManager={actions?.handleOpenExamPoolManager}
        examLogic={state?.examLogic}
        onOpenAiConfig={actions?.handleOpenAiConfig}
      />
    );
  } else {
    mainContent = (
      <div
        className={`w-full max-w-4xl flex flex-col h-full transition-all duration-500 ease-in-out min-w-0 ${alignClass}`}
      >
        <AppHeader
          lang={coreState.lang}
          setLang={coreState.setLang}
          notebookCount={notebookCount}
          masteredCount={masteredCount}
          incorrectCount={incorrectCount}
          onOpenNotebook={() => coreState.setShowNotebook(true)}
          onOpenMastered={() => coreState.setShowMastered(true)}
          onOpenIncorrect={actions?.handleOpenIncorrect}
          onOpenLinkManager={() => coreState.setShowLinkManager(true)}
          onOpenManual={() => coreState.setShowManual(true)}
          onOpenHelp={actions?.handleOpenHelp}
          onReload={actions?.handleReloadDefault}
          t={actions?.t}
          studySourceName={coreState.studySourceName}
          onExitStudyMode={actions?.handleExitStudyMode}
          onOpenSaveLoad={actions?.handleOpenSaveLoad}
          dataMode={coreState.dataMode}
          setDataMode={coreState.setDataMode}
          currentLevel={coreState.currentLevel}
          setCurrentLevel={coreState.setCurrentLevel}
          currentTopic={coreState.currentTopic}
          setCurrentTopic={coreState.setCurrentTopic}
        />
        <div className="flex-1 flex flex-col justify-center min-h-[400px]">
          <FlashcardDisplay
            isFlipped={coreState.isFlipped}
            setIsFlipped={coreState.setIsFlipped}
            isAutoPlaying={coreState.isAutoPlaying}
            currentCardIndex={coreState.currentCardIndex}
            cards={coreState.cards}
            settings={coreState.settings}
            mainColor={appMainColor}
            speak={actions?.speak}
            getCardStyle={actions?.getCardStyle}
            isAiMode={coreState.isAiModeLearn}
            setAiMode={coreState.setIsAiModeLearn}
            t={actions?.t}
            onMissingKey={handleMissingKey}
            isLoading={coreState.isAiLoading}
            AiModeSwitch={AiModeSwitch}
            onEnrichCard={actions?.handleAiEnrichCard}
            onNext={actions?.handleNext}
            onPrev={actions?.handlePrev}
            onExplainGrammar={() =>
              actions?.handleExplainGrammar?.(coreState.currentCardIndex)
            }
            onSrsGrade={actions?.handleSrsGrade}
            onResetSrs={actions?.handleResetSrs}
            isContentHidden={coreState.isContentHidden}
            isMuted={coreState.isMuted}
            onToggleMute={actions?.handleToggleMute}
            lang={coreState.lang}
            onOpenHanzi={actions?.handleOpenHanziStudy}
            onJumpToCard={actions?.handleJumpToCard}
          />
        </div>
      </div>
    );
  }


  // ============================================================================
  // 3.5. WIDGET TÙY CHỈNH LAYOUT CĂN LỀ (TRÁI / GIỮA / PHẢI)
  // ============================================================================
  const layoutWidget =
    coreState.viewMode === 'learn' && coreState.setLayoutAlign ? (
      <div className="fixed top-[15%] right-4 z-[40] hidden md:flex flex-col gap-1 bg-white/90 backdrop-blur shadow-lg rounded-xl p-1.5 border border-gray-200 animate-in fade-in slide-in-from-right-4">
        <button
          type="button"
          onClick={() => coreState.setLayoutAlign('left')}
          title="Đẩy sang Trái (Mở rộng Không gian làm việc)"
          className={`p-2 rounded-lg transition-colors duration-200 ${
            coreState.layoutAlign === 'left'
              ? 'bg-indigo-100 text-indigo-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1={4} y1={6} x2={14} y2={6} />
            <line x1={4} y1={12} x2={20} y2={12} />
            <line x1={4} y1={18} x2={14} y2={18} />
          </svg>
        </button>


        <button
          type="button"
          onClick={() => coreState.setLayoutAlign('center')}
          title="Căn Giữa (Mặc định)"
          className={`p-2 rounded-lg transition-colors duration-200 ${
            coreState.layoutAlign === 'center'
              ? 'bg-indigo-100 text-indigo-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1={4} y1={6} x2={20} y2={6} />
            <line x1={8} y1={12} x2={16} y2={12} />
            <line x1={4} y1={18} x2={20} y2={18} />
          </svg>
        </button>


        <button
          type="button"
          onClick={() => coreState.setLayoutAlign('right')}
          title="Đẩy sang Phải"
          className={`p-2 rounded-lg transition-colors duration-200 ${
            coreState.layoutAlign === 'right'
              ? 'bg-indigo-100 text-indigo-600'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1={10} y1={6} x2={20} y2={6} />
            <line x1={4} y1={12} x2={20} y2={12} />
            <line x1={10} y1={18} x2={20} y2={18} />
          </svg>
        </button>
      </div>
    ) : null;


  // ============================================================================
  // 4. BẢNG ĐIỀU KHIỂN ĐÁY (CONTROL BAR + BOTTOM NAV)
  // ============================================================================
  const bottomArea = !coreState.isGamePlaying ? (
    <div className="w-full flex flex-col shrink-0 bg-transparent z-50 relative">
      {coreState.viewMode === 'learn' && (
        <div className={bottomWrapperClass}>
          <ControlBar
            isShuffle={coreState.isShuffle}
            setIsShuffle={setters?.setIsShuffle || coreState.setIsShuffle}
            handlePrev={actions?.handlePrev}
            handleNext={actions?.handleNext}
            isAutoPlaying={coreState.isAutoPlaying}
            toggleAutoPlay={actions?.toggleAutoPlay}
            isAutoMode={coreState.isAutoMode}
            handleStopAutoPlay={actions?.handleStopAutoPlay}
            isFlipLocked={coreState.isFlipLocked}
            setIsFlipLocked={coreState.setIsFlipLocked}
            handleOpenWordSelector={actions?.handleOpenWordSelector}
            handleMarkMastered={actions?.handleMarkMastered}
            t={actions?.t}
            mainColor={appMainColor}
            isCurrentCardInNotebook={state?.isCurrentCardInNotebook}
            onToggleBatterySaver={actions?.toggleBatterySaver}
          />
        </div>
      )}
      <BottomNav
        onNavigate={(mode) => {
          if (mode === 'learn') coreState.setViewMode('learn');
          if (mode === 'game') coreState.setViewMode('game');
          if (mode === 'settings') coreState.setShowSettings(true);
        }}
        onApiKey={() => coreState.setShowApiKeyModal(true)}
        onOpenAiChat={() => coreState.setShowAiChat(true)}
        t={actions?.t}
        mainColor={appMainColor}
        currentMode={coreState.viewMode}
      />
    </div>
  ) : null;


  // ============================================================================
  // 5. MAIN LAYOUT & MODALS (KHỚP 100% HỢP ĐỒNG PROPS)
  // ============================================================================
  return (
    <div
      className={`w-full h-[100dvh] flex flex-col relative overflow-hidden ${appBgClass}`}
    >
      {layoutWidget}
      <div className={mainParentClass}>{mainContent}</div>
      {bottomArea}


      {coreState.showSettings && (
        <SettingsModal
          isOpen={true}
          onClose={() => coreState.setShowSettings(false)}
          onApply={() => coreState.setShowSettings(false)}
          initialSettings={coreState.settings}
          onUpdate={coreState.setSettings}
          onResetData={actions?.handleResetSettings}
          currentLang={coreState.lang}
          t={actions?.t}
          uiLang={coreState.uiLang}
          setUiLang={coreState.setUiLang}
          mainColor={appMainColor}
          onDone={() => coreState.setShowSettings(false)}
          totalTokens={coreState.totalTokens}
          onResetTokens={() => coreState.setTotalTokens(0)}
          voices={coreState.voices}
          testSpeak={actions?.speak}
          systemLogs={coreState.systemLogs}
          onClearLogs={() => coreState.setSystemLogs([])}
        />
      )}


      {coreState.showApiKeyModal && (
        <ApiKeyModal
          isOpen={true}
          onClose={() => coreState.setShowApiKeyModal(false)}
          apiKey={coreState.apiKey}
          setApiKey={coreState.setApiKey}
          aiModel={coreState.aiModel}
          setAiModel={coreState.setAiModel}
          t={actions?.t}
        />
      )}


      {coreState.showNotebook && (
        <NotebookModal
          isOpen={true}
          onClose={() => coreState.setShowNotebook(false)}
          data={coreState.notebook}
          onSave={actions?.handleNotebookSave}
          onPlay={actions?.speak}
          t={actions?.t}
          mainColor={appMainColor}
          apiKey={coreState.apiKey}
          lang={coreState.lang}
          onCopy={actions?.handleCopyForSheet}
          sourceData={coreState.cards}
          onOpenHanzi={actions?.handleOpenHanziStudy}
          onReviewGame={actions?.handleReviewWithGame}
          dataMode={coreState.dataMode}
        />
      )}


      {coreState.showLinkManager && (
        <LinkManagerModal
          isOpen={true}
          onClose={() => coreState.setShowLinkManager(false)}
          t={actions?.t}
          exportUrl={coreState.exportUrl}
          setExportUrl={coreState.setExportUrl}
          apiKeySheetUrl={coreState.apiKeySheetUrl}
          setApiKeySheetUrl={coreState.setApiKeySheetUrl}
          onImport={actions?.handleImport}
          onImportToNotebook={actions?.handleImportToNotebook}
          onExportLink={actions?.handleExportLink}
          onExportExcel={actions?.handleExportExcel}
          onFileImport={actions?.handleFileImport}
          onSaveSettings={handleSaveLinkSetting}
          onFetchKey={actions?.handleFetchApiKey}
          onDownloadTemplate={actions?.handleDownloadTemplate}
          lang={coreState.lang}
          aiHarvestPool={coreState.aiHarvestPool}
          onExportHarvestToExcel={actions?.handleExportHarvestToExcel}
          onClearHarvestPool={actions?.handleClearHarvestPool}
        />
      )}


      {coreState.showManual && (
        <ManualInputModal
          isOpen={true}
          onClose={() => coreState.setShowManual(false)}
          onImport={actions?.handleManualImport}
          onAddCard={actions?.handleAddCard}
          onAutoFill={actions?.handleManualAiFill}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showIncorrectModal && (
        <IncorrectModal
          isOpen={true}
          onClose={actions?.handleCloseIncorrect}
          data={coreState.incorrectList}
          onRemove={actions?.handleRemoveWrong}
          onRemoveAll={actions?.handleRemoveAllIncorrect}
          onOpenHanzi={actions?.handleOpenHanziStudy}
          t={actions?.t}
          mainColor={appMainColor}
          onReviewGame={actions?.handleReviewWithGame}
        />
      )}


      {coreState.showMastered && (
        <MasteredModal
          isOpen={true}
          onClose={() => coreState.setShowMastered(false)}
          data={coreState.mastered}
          onRestore={actions?.handleRestoreMastered}
          onRestoreAll={actions?.handleRestoreAllMastered}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showWordSelect && (
        <WordSelectorModal
          isOpen={true}
          onClose={() => coreState.setShowWordSelect(false)}
          text={coreState.wordSelectTarget}
          currentLang={coreState.lang}
          onSave={actions?.handleSaveWords}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showHelp && (
        <HelpModal
          isOpen={true}
          onClose={actions?.handleCloseHelp}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showHanziSelector && (
        <HanziSelectorModal
          isOpen={true}
          onClose={actions?.handleCloseHanziSelector}
          text={coreState.wordSelectTarget}
          onSelect={actions?.handleStartWriting}
        
        />
      )}


      {coreState.showHanziWriter && (
        <HanziWriterModal
          isOpen={true}
          onClose={actions?.handleCloseHanziWriter}
          char={coreState.currentHanziChar}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showAiChat && (
        <AiChatModal
          isOpen={true}
          onClose={() => coreState.setShowAiChat(false)}
          apiKey={coreState.apiKey}
          lang={coreState.lang}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showSaveLoadModal && (
        <SaveLoadModal
          isOpen={true}
          onClose={actions?.handleCloseSaveLoad}
          onExport={actions?.handleExportSaveFile}
          onImport={actions?.handleImportSaveFile}
          t={actions?.t}
          mainColor={appMainColor}
        />
      )}


      {coreState.showExamPoolManager && (
        <ExamPoolManagerModal
          isOpen={true}
          onClose={actions?.handleCloseExamPoolManager}
          mainColor={appMainColor}
          examPoolData={examPoolData}
        />
      )}


      {coreState.showAiConfigModal && (
        <AiConfigModal
          isOpen={true}
          onClose={() => coreState.setShowAiConfigModal(false)}
          aiConfig={coreState.aiConfig}
          setAiConfig={coreState.setAiConfig}
          mainColor={appMainColor}
        />
      )}


      {toastContent && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl z-[300] font-bold text-white animate-in slide-in-from-top-4 fade-in duration-300 flex items-center gap-2 ${toastBgClass}`}
        >
          {toastContent}
        </div>
      )}
    </div>
  );
};


export const App = () => {
  const existingContext = useContext(AppContext);
  if (existingContext) {
    return <MainAppContent />;
  }
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
};


export default App;

