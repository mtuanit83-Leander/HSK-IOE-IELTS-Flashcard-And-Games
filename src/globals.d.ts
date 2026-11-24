/// <reference types="vite/client" />

// ============================================================================
// FILE: src/globals.d.ts
// NGUỒN GỐC: Bộ Công cụ Rà soát Lỗi Toàn Ứng dụng (Bước 2 — Tầng Kiểm định Tĩnh)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 07:37 (GMT+7)
// NHIỆM VỤ: Khai báo hợp lệ toàn bộ biến toàn cục (window.* / globalThis.*),
//           cầu nối tương thích di sản Tầng 1 -> Tầng 7, Web APIs mở rộng
//           và tham chiếu chuẩn `vite/client` (*.css, *.svg, *.png, import.meta.*)
//           nhằm xóa sạch lỗi TS2882 và triệt tiêu ~95 cảnh báo nhiễu giả của `tsc`.
// LƯU Ý CHỦ ĐÍCH: KHÔNG khai báo `window.handleSaveToNotebook` để `tsc` tiếp tục
//                 giữ cờ cảnh báo lỗi lưu Sổ tay tại 5 Mini-Games cho Giai đoạn 4.
// ============================================================================

declare var __fcMasterDataCache: Map<string, any> | Record<string, any> | undefined;

interface Window {
  // 1. Thư viện bên thứ 3 & Web APIs mở rộng trên Safari/Chrome/iOS
  XLSX?: any;
  HanziWriter?: any;
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
  webkitAudioContext?: typeof AudioContext;

  // 2. Hằng số, Tiện ích & Dịch vụ hạ tầng (Tầng 1 & Tầng 2)
  Utils?: any;
  AiMemoryManager?: any;
  OfflineDistractorEngine?: any;
  FcDB?: any;
  pullRetryCardWithLock?: (...args: any[]) => any;
  RPDTracker?: any;
  GeminiApiService?: any;
  STORAGE_KEYS?: any;
  AI_MODELS?: any;
  DEFAULT_SHEETS?: any;
  DEFAULT_API_KEY_SHEET?: string;
  CONFIG_SAMPLES?: any;
  DEFAULT_PROMPTS?: any;
  UI_TEXT?: any;
  IoeEnumRegistry?: any;

  // 3. Động cơ Sư phạm, Trò chơi & Khảo thí (Engines)
  IoeDataEngine?: any;
  PedagogyEngine?: any;
  MICRO_PROMPTS?: any;
  GameAiEngine?: any;
  GameOfflineEngine?: any;
  GameAlgoEngine?: any;
  FallbackDataEngine?: any;
  QueueEngine?: any;
  AiFactoryEngine?: any;
  ExamProfiles?: any;
  ExamMemory?: any;
  ExamFallback?: any;
  ExamNormalizer?: any;
  ExamEngine?: any;

  // 4. Thành phần giao diện dùng chung, Bố cục & Hộp thoại (Tầng 3 & Tầng 4)
  Icons?: any;
  GlobalLoadingScreen?: any;
  AiModeSwitch?: any;
  MenuToggle?: any;
  LevelSelector?: any;
  TopicSelectorDropdown?: any;
  TopicSelector?: any;
  AppHeader?: any;
  BottomNav?: any;
  LayoutAlignWidget?: any;
  ControlBar?: any;
  FlashcardDisplay?: any;
  AiChatModal?: any;
  AiConfigModal?: any;
  ApiKeyModal?: any;
  ExamPoolManagerModal?: any;
  HanziWriterModal?: any;
  HelpModal?: any;
  WordSelectorModal?: any;
  HanziSelectorModal?: any;
  LinkManagerModal?: any;
  ManualInputModal?: any;
  ReviewDropdown?: any;
  NotebookModal?: any;
  MasteredModal?: any;
  IncorrectModal?: any;
  SaveLoadModal?: any;
  SettingsModal?: any;

  // 5. Thành phần Mini-Games & Phòng thi Khảo thí (Tầng 5)
  GameSharedUI?: any;
  GameHelpers?: any;
  GameMenu?: any;
  Block5_7_GameMenu?: any;
  GameView?: any;
  Block5_7_GameView?: any;

  MatchSetup?: any;
  MatchPlayScreen?: any;
  Block5_1_MatchSetup?: any;
  Block5_1_MatchPlayScreen?: any;
  MatchGame?: any;
  Block5_1_MatchGame?: any;
  Block5_2_MatchGame?: any;

  ScrambleSetup?: any;
  ScramblePlayScreen?: any;
  Block5_3_ScrambleSetup?: any;
  Block5_3_ScramblePlayScreen?: any;
  ScrambleGame?: any;
  Block5_4_ScrambleGame?: any;

  QuizSetup?: any;
  Block5_5_QuizSetup?: any;
  GameResult?: any;
  Block5_5_GameResult?: any;
  GamePlayScreen?: any;
  Block5_5_GamePlayScreen?: any;
  QuizGame?: any;
  Block5_6_QuizGame?: any;

  FillBlankSetup?: any;
  Block5_8_FillBlankSetup?: any;
  FillBlankPlayScreen?: any;
  Block5_8_FillBlankPlayScreen?: any;
  useFillBlankLogic?: any;
  Block5_9_useFillBlankLogic?: any;
  FillBlankGame?: any;
  Block5_9_FillBlankGame?: any;

  SpotMistakeSetup?: any;
  Block5_10_SpotMistakeSetup?: any;
  SpotMistakePlayScreen?: any;
  Block5_10_SpotMistakePlayScreen?: any;
  useSpotMistakeLogic?: any;
  Block5_11_useSpotMistakeLogic?: any;
  SpotMistakeGame?: any;
  Block5_11_SpotMistakeGame?: any;

  OddOneOutSetup?: any;
  Block5_12_OddOneOutSetup?: any;
  OddOneOutPlayScreen?: any;
  Block5_12_OddOneOutPlayScreen?: any;
  useOddOneOutLogic?: any;
  Block5_13_useOddOneOutLogic?: any;
  OddOneOutGame?: any;
  Block5_13_OddOneOutGame?: any;

  ExamUIShell?: any;
  Block5_14_ExamUIShell?: any;
  ExamReportUI?: any;
  Block5_15_ExamReportUI?: any;
  ExamReviewModal?: any;
  Block5_16_ExamReviewModal?: any;

  ImageQuizSetup?: any;
  Block5_17_ImageQuizSetup?: any;
  ImageQuizPlayScreen?: any;
  Block5_17_ImageQuizPlayScreen?: any;
  useImageQuizLogic?: any;
  Block5_18_useImageQuizLogic?: any;
  ImageQuizGame?: any;
  Block5_18_ImageQuizGame?: any;

  PronunciationSetup?: any;
  Block5_19_PronunciationSetup?: any;
  PronunciationPlayScreen?: any;
  Block5_19_PronunciationPlayScreen?: any;
  usePronunciationLogic?: any;
  Block5_20_usePronunciationLogic?: any;
  PronunciationGame?: any;
  Block5_20_PronunciationGame?: any;

  ListeningSetup?: any;
  Block5_21_ListeningSetup?: any;
  ListeningPlayScreen?: any;
  Block5_21_ListeningPlayScreen?: any;
  useListeningLogic?: any;
  Block5_22_useListeningLogic?: any;
  ListeningGame?: any;
  Block5_22_ListeningGame?: any;

  ReadingSetup?: any;
  Block5_23_ReadingSetup?: any;
  ReadingPlayScreen?: any;
  Block5_23_ReadingPlayScreen?: any;
  useReadingLogic?: any;
  Block5_24_useReadingLogic?: any;
  ReadingGame?: any;
  Block5_24_ReadingGame?: any;

  // 6. Cầu nối tương thích các Hooks Tầng 6 & Tầng 7
  useCoreState?: any;
  Block6_1_useCoreState?: any;
  useAiLogic?: any;
  Block6_2_useAiLogic?: any;
  Block14_useAiLogic?: any;
  useDataIO?: any;
  useDataLogic?: any;
  Block6_3_useDataIO?: any;
  Block15_useDataLogic?: any;
  useAppLogic?: any;
  Block6_4_useAppLogic?: any;
  useStudyProgress?: any;
  Block6_5_useStudyProgress?: any;
  useAiCurator?: any;
  Block6_6_useAiCurator?: any;
  useExamLogic?: any;
  Block6_7_useExamLogic?: any;
  useExamPoolLogic?: any;
  Block6_8_useExamPoolLogic?: any;
  Block7_1_App?: any;

  // 7. Bộ nhớ đệm RAM Mirror, Tín hiệu Runtime & Khiên âm thanh
  globalShowToast?: (message: string, type?: string) => void;
  logSystemEvent?: (...args: any[]) => void;
  __fcMasterDataCache?: Map<string, any> | Record<string, any>;
  __zombieKillerActive?: boolean;
  __currentGameAbortController?: AbortController | null;
  __pendingGameRoute?: string | null;
  __retryLocks?: Set<string> | Record<string, any>;
  fc_tingAudio?: HTMLAudioElement | null;
  fc_tingAudioTimeout?: ReturnType<typeof setTimeout> | null;
  fc_currentUtterance?: SpeechSynthesisUtterance | null;
  fc_audioCtx?: AudioContext | null;
  fc_harvest_warned?: boolean;
}