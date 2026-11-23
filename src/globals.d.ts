// ============================================================================
// FILE: src/globals.d.ts
// NGUỒN GỐC: Bộ Công cụ Rà soát Lỗi Toàn Ứng dụng (Bước 2 — Tầng Kiểm định Tĩnh)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 07:38 (GMT+7)
// NHIỆM VỤ: Khai báo hợp lệ toàn bộ biến toàn cục (window.*), cầu nối di sản
//           từ bản HTML 1 file, Web APIs mở rộng (SpeechRecognition/AudioContext)
//           và khai báo asset (.css/.svg/.png...) để `tsc -p jsconfig.json --noEmit`
//           triệt tiêu 99% báo động giả và tập trung bắt sống lỗi thật trên 85 files.
// ============================================================================

declare global {
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
    RPDTracker?: any;
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

    // 4. Cầu nối tương thích các Hooks Tầng 6 & Tầng 7
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

    // 5. Bộ nhớ đệm RAM Mirror, Tín hiệu Runtime & Khiên âm thanh
    globalShowToast?: (message: string, type?: string) => void;
    logSystemEvent?: (...args: any[]) => void;
    __fcMasterDataCache?: Record<string, any>;
    __currentGameAbortController?: AbortController | null;
    __pendingGameRoute?: string | null;
    __retryLocks?: Set<string> | Record<string, any>;
    fc_tingAudio?: HTMLAudioElement | null;
    fc_tingAudioTimeout?: ReturnType<typeof setTimeout> | null;
    fc_currentUtterance?: SpeechSynthesisUtterance | null;
    fc_audioCtx?: AudioContext | null;
    fc_harvest_warned?: boolean;
  }
}

// Khai báo module tài nguyên tĩnh cho Vite (chặn lỗi TS2307 khi import CSS/ảnh)
declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

declare module '*.scss' {
  const styles: Record<string, string>;
  export default styles;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

export {};