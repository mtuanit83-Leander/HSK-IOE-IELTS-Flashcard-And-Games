/**
 * @file src/App.jsx
 * @description Bo mạch chủ (Root Component) của Flashcard 3D. 
 * Lắp ráp toàn bộ Layout, Component, Modals và bọc trong Context Provider.
 * @origin Tầng 7 - Root App
 */

import React from 'react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary.jsx';
import { AppProvider, useAppContext } from '@/context/AppContext.jsx';
import { Icons } from '@/components/common/Icons.jsx';
import { Utils } from '@/utils/helpers'; // [BẢN VÁ] Import Utils để cứu sống LinkManagerModal

// Layout & UI
import { AppHeader } from '@/components/layout/AppHeader.jsx';
import { FlashcardDisplay } from '@/components/layout/FlashcardDisplay.jsx';
import { ControlBar } from '@/components/layout/ControlBar.jsx';
import { BottomNav } from '@/components/layout/BottomNav.jsx';
import { GameView } from '@/features/games/GameView.jsx';

// Modals
import { SettingsModal } from '@/components/modals/SettingsModal.jsx';
import { ApiKeyModal } from '@/components/modals/ApiKeyModal.jsx';
import { NotebookModal } from '@/components/modals/NotebookModal.jsx';
import { ManualInputModal } from '@/components/modals/ManualInputModal.jsx';
import { LinkManagerModal } from '@/components/modals/LinkManagerModal.jsx';
import { MasteredModal, IncorrectModal } from '@/components/modals/ProgressModals.jsx';
import { AiChatModal } from '@/components/modals/AiChatModal.jsx';
import { HelpModal } from '@/components/modals/HelpModal.jsx';
import { SaveLoadModal } from '@/components/modals/SaveLoadModal.jsx';
import { HanziWriterModal } from '@/components/modals/HanziWriterModal.jsx';
import { WordSelectorModal, HanziSelectorModal } from '@/components/modals/HelperModals.jsx';
import { ExamPoolManagerModal } from '@/components/modals/ExamPoolManagerModal.jsx';
import { AiConfigModal } from '@/components/modals/AiConfigModal.jsx';

// --- COMPONENT LÕI ĐÃ KẾT NỐI CONTEXT ---
const MainApp = () => {
  const { state, actions, setters, examPoolData } = useAppContext();

  // Bắt sự kiện click để đóng WordSelector nếu click ra ngoài
  const handleGlobalClick = () => {
    if (state.showWordSelect) {
      setters.setShowWordSelect(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 overflow-hidden font-sans selection:bg-blue-200" onClick={handleGlobalClick}>
      
      {/* 1. HEADER (Khu vực Top) */}
      <div className="p-3 pb-0 sm:p-4 sm:pb-0 shrink-0">
        <AppHeader 
          lang={state.lang} 
          setLang={setters.setLang} 
          notebookCount={state.notebook.length} 
          masteredCount={state.masteredCount}
          incorrectCount={state.incorrectCount}
          onOpenNotebook={() => setters.setShowNotebook(true)} 
          onOpenMastered={() => setters.setShowMastered(true)} 
          onOpenIncorrect={actions.handleOpenIncorrect}
          onOpenLinkManager={() => setters.setShowLinkManager(true)} 
          onOpenManual={() => setters.setShowManual(true)} 
          onOpenHelp={actions.handleOpenHelp}
          onReload={actions.handleReloadDefault}
          t={actions.t} 
          studySourceName={state.studySourceName} 
          onExitStudyMode={actions.handleExitStudyMode}
          onOpenSaveLoad={actions.handleOpenSaveLoad}
          dataMode={state.dataMode}
          setDataMode={setters.setDataMode}
          currentLevel={state.currentLevel}
          setCurrentLevel={setters.setCurrentLevel}
          currentTopic={state.currentTopic}
          setCurrentTopic={setters.setCurrentTopic}
        />
      </div>

      {/* 2. BODY (Khu vực Main Content) */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col relative overflow-hidden custom-scrollbar px-3 pb-3 pt-1">
        {state.viewMode === 'game' ? (
          <GameView state={state} actions={actions} setters={setters} />
        ) : (
          <div className="flex-1 flex flex-col h-full animate-in fade-in">
            {state.cards.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm border border-gray-100">
                  <div className="text-6xl mb-4">📭</div>
                  <h3 className="text-xl font-bold text-gray-700 mb-2">Chưa có dữ liệu</h3>
                  <p className="text-sm text-gray-500 mb-6">Hãy thêm thẻ thủ công, tải lên file Excel hoặc đồng bộ từ Google Sheets.</p>
                  <button onClick={() => setters.setShowLinkManager(true)} className={`w-full py-3 bg-${state.mainColor}-600 text-white font-bold rounded-xl shadow-md hover:bg-${state.mainColor}-700 transition-colors`}>
                    Nạp Dữ Liệu Ngay
                  </button>
                </div>
              </div>
            ) : (
              <>
                <FlashcardDisplay 
                  isFlipped={state.isFlipped} setIsFlipped={setters.setIsFlipped} 
                  isAutoPlaying={state.isAutoPlaying} currentCardIndex={state.currentCardIndex} 
                  cards={state.cards} settings={state.settings} mainColor={state.mainColor} 
                  speak={actions.speak} getCardStyle={actions.getCardStyle} 
                  isAiMode={state.isAiModeLearn} setAiMode={setters.setIsAiModeLearn} 
                  t={actions.t} onMissingKey={actions.onMissingKey} isLoading={state.isAiLoading}
                  onEnrichCard={actions.handleAiEnrichCard}
                  onNext={actions.handleNext} onPrev={actions.handlePrev}
                  onExplainGrammar={actions.handleExplainGrammar}
                  onSrsGrade={actions.handleSrsGrade} onResetSrs={actions.handleResetSrs}
                  isContentHidden={state.isContentHidden}
                  isMuted={state.isMuted} onToggleMute={actions.handleToggleMute}
                  lang={state.lang}
                  onOpenHanzi={actions.handleOpenHanziStudy}
                  onJumpToCard={actions.handleJumpToCard}
                />
                <ControlBar 
                  isShuffle={state.isShuffle} setIsShuffle={setters.setIsShuffle} 
                  handlePrev={actions.handlePrev} handleNext={actions.handleNext} 
                  isAutoPlaying={state.isAutoPlaying} toggleAutoPlay={actions.toggleAutoPlay} 
                  isAutoMode={state.isAutoMode} handleStopAutoPlay={actions.handleStopAutoPlay}
                  isFlipLocked={state.isFlipLocked} setIsFlipLocked={setters.setIsFlipLocked}
                  handleOpenWordSelector={actions.handleOpenWordSelector}
                  handleMarkMastered={actions.handleMarkMastered}
                  t={actions.t} mainColor={state.mainColor}
                  isCurrentCardInNotebook={state.isCurrentCardInNotebook}
                  onToggleBatterySaver={actions.toggleBatterySaver}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* 3. FOOTER (Bottom Navigation) */}
      <BottomNav 
        onNavigate={setters.setViewMode} 
        onApiKey={() => setters.setShowApiKeyModal(true)} 
        onOpenAiChat={() => setters.setShowAiChat(true)}
        onSettings={actions.handleOpenSettings}
        t={actions.t} 
        mainColor={state.mainColor}
        currentMode={state.viewMode}
      />

      {/* 4. HỆ THỐNG MODALS (Portals) */}
      <SettingsModal 
        isOpen={state.showSettings} onClose={actions.handleCloseSettings} 
        onApply={actions.handleCloseSettings} initialSettings={state.settings} 
        voices={state.voices} testSpeak={actions.speak} 
        onResetData={actions.handleResetSettings} currentLang={state.lang} t={actions.t} 
        uiLang={state.uiLang} setUiLang={setters.setUiLang} mainColor={state.mainColor}
        onDone={actions.handleCloseSettings} onUpdate={setters.setSettings}
        totalTokens={state.totalTokens} onResetTokens={setters.setTotalTokens}
        systemLogs={state.systemLogs} onClearLogs={() => setters.setSystemLogs([])}
      />
      <ApiKeyModal 
        isOpen={state.showApiKeyModal} onClose={() => setters.setShowApiKeyModal(false)} 
        apiKey={state.apiKey} setApiKey={setters.setApiKey} t={actions.t}
        aiModel={state.aiModel} setAiModel={setters.setAiModel}
      />
      <NotebookModal 
        isOpen={state.showNotebook} onClose={() => setters.setShowNotebook(false)} 
        data={state.notebook} onSave={actions.handleNotebookSave} onPlay={actions.speak} 
        t={actions.t} mainColor={state.mainColor} apiKey={state.apiKey} lang={state.lang}
        onCopy={actions.handleCopyForSheet} sourceData={state.cards} 
        onOpenHanzi={actions.handleOpenHanziStudy}
        onReviewGame={actions.handleReviewWithGame}
        dataMode={state.dataMode}
      />
      <ManualInputModal 
        isOpen={state.showManual} onClose={() => setters.setShowManual(false)} 
        onImport={actions.handleManualImport} onAddCard={actions.handleAddCard} 
        onAutoFill={actions.handleManualAiFill} t={actions.t} mainColor={state.mainColor}
      />
      <LinkManagerModal 
        isOpen={state.showLinkManager} onClose={() => setters.setShowLinkManager(false)} 
        t={actions.t} defaultUrl={state.defaultUrl} setDefaultUrl={setters.setDefaultUrl} 
        exportUrl={state.exportUrl} setExportUrl={setters.setExportUrl} 
        importUrl={state.importUrl} setImportUrl={setters.setImportUrl} 
        apiKeySheetUrl={state.apiKeySheetUrl} setApiKeySheetUrl={setters.setApiKeySheetUrl} 
        onImport={actions.handleImport} onExportLink={actions.handleExportLink} 
        onExportExcel={actions.handleExportExcel} onFileImport={actions.handleFileImport} 
        onSaveSettings={Utils.safeLocalStorageSet} onFetchKey={actions.handleFetchApiKey} 
        onDownloadTemplate={actions.handleDownloadTemplate} lang={state.lang}
        onImportToNotebook={actions.handleImportToNotebook}
        aiHarvestPool={state.aiHarvestPool}
        onExportHarvestToExcel={actions.handleExportHarvestToExcel}
        onClearHarvestPool={actions.handleClearHarvestPool}
      />
      <MasteredModal 
        isOpen={state.showMastered} onClose={() => setters.setShowMastered(false)} 
        data={state.mastered} onRestore={actions.handleRestoreMastered} 
        onRestoreAll={actions.handleRestoreAllMastered} t={actions.t} mainColor={state.mainColor} 
      />
      <IncorrectModal 
        isOpen={state.showIncorrectModal} onClose={actions.handleCloseIncorrect} 
        data={state.incorrectList} onRemove={actions.handleRemoveWrong} 
        onRemoveAll={actions.handleRemoveAllIncorrect} 
        onOpenHanzi={actions.handleOpenHanziStudy} t={actions.t} mainColor={state.mainColor}
        onReviewGame={actions.handleReviewWithGame}
      />
      <AiChatModal 
        isOpen={state.showAiChat} onClose={() => setters.setShowAiChat(false)} 
        apiKey={state.apiKey} lang={state.lang} t={actions.t} mainColor={state.mainColor} 
      />
      <HelpModal 
        isOpen={state.showHelp} onClose={actions.handleCloseHelp} 
        t={actions.t} mainColor={state.mainColor} 
      />
      <SaveLoadModal 
        isOpen={state.showSaveLoadModal} onClose={actions.handleCloseSaveLoad} 
        onExport={actions.handleExportSaveFile} onImport={actions.handleImportSaveFile} 
        t={actions.t} mainColor={state.mainColor} 
      />
      <HanziWriterModal 
        isOpen={state.showHanziWriter} onClose={actions.handleCloseHanziWriter} 
        char={state.currentHanziChar} t={actions.t} mainColor="red" 
      />
      <WordSelectorModal 
        isOpen={state.showWordSelect} onClose={() => setters.setShowWordSelect(false)} 
        onSave={actions.handleSaveWords} text={state.wordSelectTarget} 
        currentLang={state.lang} t={actions.t} mainColor={state.mainColor} 
      />
      <HanziSelectorModal 
        isOpen={state.showHanziSelector} onClose={actions.handleCloseHanziSelector} 
        text={state.wordSelectTarget} onSelect={actions.handleStartWriting} t={actions.t} 
      />
      <ExamPoolManagerModal
        isOpen={state.showExamPoolManager} onClose={actions.handleCloseExamPoolManager}
        mainColor={state.mainColor} examPoolData={examPoolData}
      />
      <AiConfigModal
        isOpen={state.showAiConfigModal} onClose={() => setters.setShowAiConfigModal(false)}
        aiConfig={state.aiConfig} setAiConfig={setters.setAiConfig} mainColor="purple"
      />

      {/* 5. GLOBAL TOAST NOTIFICATIONS */}
      {state.toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`px-6 py-3 rounded-full shadow-xl font-bold flex items-center gap-2 border ${state.toast.type === 'error' ? 'bg-red-500 text-white border-red-600' : state.toast.type === 'warning' ? 'bg-orange-500 text-white border-orange-600' : 'bg-gray-800 text-white border-gray-900'}`}>
            {state.toast.type === 'error' ? <Icons.X size={18} /> : state.toast.type === 'warning' ? <Icons.AlertCircle size={18} /> : <Icons.Check size={18} />}
            {state.toast.text}
          </div>
        </div>
      )}
    </div>
  );
};

// Bọc Ứng dụng trong ErrorBoundary và Provider
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainApp />
      </AppProvider>
    </ErrorBoundary>
  );
}