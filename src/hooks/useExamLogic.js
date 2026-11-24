// ============================================================================
// FILE 80/85: src/hooks/useExamLogic.js
// NGUỒN GỐC: Tầng 6 - Block 6.7 (useExamLogic - Version 1.24)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 14:25 (GMT+7)
// NHIỆM VỤ: Bộ Tổng Tham Mưu Bài Thi (Mock Test Controller). Điều phối luồng
//           bài thi, quản lý tiến trình, pre-fetch, tự động lưu Snapshot và
//           Xuất báo cáo Excel.
//           Nâng cấp Ver 1.1 (Chốt 5 tinh chỉnh tối ưu DanhGiaCode.md Mục 5.2):
//           1. Diệt Timer Drift: tách cờ boolean hasTimeRemaining khỏi deps
//              đồng hồ đếm ngược (chỉ khởi tạo 1 setInterval duy nhất/câu).
//           2. Chốt chặn Blueprint rỗng & chỉ mục vượt biên ở cả startExam
//              và resumeExam (dọn khóa lỗi ngay, không chờ 22s vô ích).
//           3. Dọn bộ nhớ tạm có chọn lọc (ExamEngine.clearVolatileMemory)
//              khi resumeExam, giữ nguyên fc_ai_memory_en/zh nửa đầu bài thi.
//           4. Chống nộp nhầm trên màn hình chuyển chặng ảo optimistic_*.
//           5. Nâng cấp getConfiguredMockDelaySeconds() đọc đa định dạng
//              (raw string, JSON number, JSON string) miễn nhiễm dài hạn.
//           (Bảo toàn trọn vẹn Ver 1.0: 0 CRITICAL StrictMode, 0 HIGH Radar,
//           0 Worker leak, AiMemoryManager.clear(), examRunSeqRef, API Key 4 tầng).
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { FcDB } from '@/services/db';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamProfiles } from '@/engines/examProfiles';
import { ExamEngine } from '@/engines/exam';

const ACTIVE_EXAM_KEY = STORAGE_KEYS?.ACTIVE_EXAM || 'fc_active_exam_session';

// Trình lấy thư viện XLSX an toàn (Hỗ trợ cả ES Module lẫn Global Window)
const getXlsx = () => {
  if (XLSX && XLSX.utils) return XLSX;
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  return null;
};

// Trình phát Toast toàn cục an toàn
const notifyToast = (msg, type = 'info') => {
  if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
    window.globalShowToast(msg, type);
  }
};

// Đọc chuỗi khóa từ localStorage an toàn (hỗ trợ cả raw string lẫn JSON stringified)
const readSafeStringStorage = (key) => {
  if (typeof localStorage === 'undefined') return '';
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[')
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return typeof parsed === 'string' ? parsed.trim() : '';
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  } catch {
    return '';
  }
};

// Chuẩn hóa sessionId (tương thích cả chuỗi thô lẫn chuỗi JSON có dấu ngoặc kép)
const normalizeSessionId = (rawId) => {
  if (rawId === undefined || rawId === null) return '';
  const trimmed = String(rawId).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    } catch {
      return trimmed.replace(/^"+|"+$/g, '').trim();
    }
  }
  return trimmed;
};

// Quét API Key đủ 4 tầng (preferredKey -> fc_apikey -> fc_paid_apikey -> fc_apikey_pool)
const resolveExamApiKey = (preferredKey = '') => {
  if (typeof preferredKey === 'string' && preferredKey.trim()) {
    return preferredKey.trim();
  }

  const mainKey = readSafeStringStorage('fc_apikey');
  if (mainKey) return mainKey;

  const paidKey = readSafeStringStorage('fc_paid_apikey');
  if (paidKey) return paidKey;

  const pool = Utils ? Utils.safeJsonParse('fc_apikey_pool', []) : [];
  if (Array.isArray(pool)) {
    for (const item of pool) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object' && typeof item.key === 'string' && item.key.trim()) {
        return item.key.trim();
      }
    }
  }

  return '';
};

// Xóa an toàn khóa phiên thi đang hoạt động
const clearActiveExamSessionKey = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_EXAM_KEY);
  } catch (e) {
    console.warn('[useExamLogic] Failed to remove active exam key:', e);
  }
};

// Tẩy não đồng bộ bộ nhớ AI trên cả RAM (hủy debounce 3s), localStorage và ExamEngine
const clearExamAiMemory = () => {
  if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_ai_memory_en', []);
    Utils.safeLocalStorageSet('fc_ai_memory_zh', []);
  }
  if (AiMemoryManager && typeof AiMemoryManager.clear === 'function') {
    AiMemoryManager.clear();
  } else if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('fc_ai_memory');
    } catch {
      // Bỏ qua an toàn
    }
  }
  if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
    ExamEngine.clearVolatileMemory();
  }
};

// Đọc thời gian nạp khởi động an toàn từ fc_ai_config
const getConfiguredLoadingSeconds = () => {
  const cfg = Utils ? Utils.safeJsonParse('fc_ai_config', {}) : {};
  const raw = Number(cfg?.loadingTime);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 22;
};

// Đọc thời gian chờ chuyển câu đa định dạng từ fc_mock_delay (hỗ trợ raw '3', JSON 3 và JSON '"3"')
const getConfiguredMockDelaySeconds = () => {
  if (typeof localStorage === 'undefined') return 3;
  try {
    if (Utils && typeof Utils.safeJsonParse === 'function') {
      const parsedVal = Utils.safeJsonParse('fc_mock_delay', null);
      if (parsedVal !== null && parsedVal !== undefined && parsedVal !== '') {
        const num = Number(parsedVal);
        if (Number.isFinite(num) && num >= 0) {
          return Math.floor(num);
        }
      }
    }
    const raw = localStorage.getItem('fc_mock_delay');
    if (raw === null || raw === '') return 3;
    const cleaned = raw.trim().replace(/^"+|"+$/g, '');
    const parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;
  } catch {
    return 3;
  }
};

// Đánh thức phần cứng âm thanh an toàn (bắt lỗi Promise bị từ chối trên iOS/Safari)
const resumeHardwareAudioContext = () => {
  if (
    typeof window !== 'undefined' &&
    window.fc_audioCtx &&
    window.fc_audioCtx.state === 'suspended' &&
    typeof window.fc_audioCtx.resume === 'function'
  ) {
    Promise.resolve(window.fc_audioCtx.resume()).catch(() => {});
  }
};

/** @returns {any} */
const createInitialExamState = () => ({
  status: 'idle', // Các trạng thái: idle, loading, playing, completed, error
  sessionId: null,
  profile: null,
  blueprint: [],
  currentIndex: 0,
  answers: [],
  timeRemaining: 0,
  score: 0,
  isTransitioning: false,
  preloadCountdown: 30
});

export const useExamLogic = function (apiKey, handleAutoHarvestToPool) {
  const [examState, setExamState] = useState(createInitialExamState);
  const [currentQuestion, setCurrentQuestion] = useState(/** @type {any} */ (null));
  const [isHydrating, setIsHydrating] = useState(false);
  const [cachedCount, setCachedCount] = useState(0); // Biến đếm đạn AI
  const [examCooldown, setExamCooldown] = useState(0);

  // ============================================================================
  // KIẾN TRÚC QUEUE ENGINE, BLUEPRINT POINTER & KHÓA PHIÊN ĐƠN ĐIỆU
  // ============================================================================
  /** @type {import('react').MutableRefObject<any>} */
  const coordinatorRef = useRef(null);
  /** @type {import('react').MutableRefObject<any[]>} */
  const currentBlueprintRef = useRef([]);
  const blueprintIndexRef = useRef(0);
  const uiIndexRef = useRef(0); // [PHASE-GATED] Đồng bộ tức thời Index của UI để FetchTask dò đường
  /** @type {import('react').MutableRefObject<number[]>} */
  const streakTrackerRef = useRef([]); // [ANTI-STREAK] Lưu vết vị trí đáp án đúng 2 lượt gần nhất
  /** @type {import('react').MutableRefObject<ReturnType<typeof setInterval> | null>} */
  const timerRef = useRef(null);
  const isExamActiveRef = useRef(false); // Cờ trạng thái sinh tồn của bài thi
  const isTransitioningRef = useRef(false); // Khóa luồng submit chống Rage-click
  const examRunSeqRef = useRef(0); // Khóa phiên đơn điệu chống Ghost Session Hijack
  const examStateRef = useRef(examState);

  useEffect(() => {
    examStateRef.current = examState;
  }, [examState]);

  // Hủy Worker AI an toàn và giải phóng tham chiếu
  const destroyCoordinatorSafely = useCallback(() => {
    if (coordinatorRef.current) {
      try {
        if (typeof coordinatorRef.current.destroy === 'function') {
          coordinatorRef.current.destroy();
        }
      } catch (e) {
        console.warn('[useExamLogic] Coordinator destroy error:', e);
      }
      coordinatorRef.current = null;
    }
  }, []);

  // Trung tâm chốt phiên thi (đặt 100% side-effect NGOÀI mọi React state updater)
  const finalizeExamSession = useCallback(
    (finalState, options = /** @type {{ persist?: boolean, clearActiveKey?: boolean }} */ ({})) => {
      const { persist = true, clearActiveKey = true } = options;

      examRunSeqRef.current += 1;
      isExamActiveRef.current = false;
      isTransitioningRef.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      destroyCoordinatorSafely();
      setCachedCount(0);
      setExamCooldown(0);
      setIsHydrating(false);

      if (clearActiveKey) {
        clearActiveExamSessionKey();
      }

      clearExamAiMemory();

      if (persist && FcDB && finalState && finalState.sessionId) {
        FcDB.set(finalState.sessionId, finalState, 'exam_sessions').catch((e) =>
          console.warn('[useExamLogic] Finalize session autosave failed:', e)
        );
      }
    },
    [destroyCoordinatorSafely]
  );

  // Dọn dẹp triệt để khi unmount
  useEffect(() => {
    return () => {
      examRunSeqRef.current += 1;
      isExamActiveRef.current = false;
      isTransitioningRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      destroyCoordinatorSafely();
    };
  }, [destroyCoordinatorSafely]);

  // ------------------------------------------------------------------------
  // 1. HỆ THỐNG ĐẾM NGƯỢC BÀI THI (COUNTDOWN TIMER — ZERO TIMER DRIFT)
  // ------------------------------------------------------------------------
  const hasTimeRemaining = examState.timeRemaining > 0;

  useEffect(() => {
    const isTimerAllowedToRun =
      examState.status === 'playing' &&
      !isHydrating &&
      currentQuestion !== null &&
      !examState.isTransitioning &&
      examCooldown === 0 &&
      hasTimeRemaining;

    if (isTimerAllowedToRun) {
      timerRef.current = setInterval(() => {
        setExamState((prev) => {
          if (prev.status !== 'playing' || prev.timeRemaining <= 0) {
            return prev;
          }
          return { ...prev, timeRemaining: Math.max(0, prev.timeRemaining - 1) };
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    examState.status,
    examState.isTransitioning,
    hasTimeRemaining,
    isHydrating,
    currentQuestion,
    examCooldown
  ]);

  // Hiệu ứng chốt bài khi đồng hồ chạm 0 (tách riêng 100% khỏi state updater)
  useEffect(() => {
    if (
      examState.status === 'playing' &&
      examState.timeRemaining <= 0 &&
      isExamActiveRef.current
    ) {
      const completedState = {
        ...examStateRef.current,
        timeRemaining: 0,
        status: 'completed',
        isTransitioning: false
      };
      finalizeExamSession(completedState, { persist: true, clearActiveKey: true });
      setExamState(completedState);
    }
  }, [examState.status, examState.timeRemaining, finalizeExamSession]);

  // ------------------------------------------------------------------------
  // 1.5. ĐỒNG HỒ QUÉT ĐẠN NGẦM (HONEST AMMO SCANNER 500ms)
  // ------------------------------------------------------------------------
  useEffect(() => {
    const queueScanner = setInterval(() => {
      if (coordinatorRef.current && Array.isArray(coordinatorRef.current.queue)) {
        let aiCount = 0;
        // Lọc đạn trung thực: CHỈ đếm nếu viên đạn thực sự do AI đúc ra (không phải đồ cứu hộ)
        coordinatorRef.current.queue.forEach((item) => {
          if (item && item.content && item.content.isAiGenerated) {
            aiCount++;
          }
        });
        setCachedCount(aiCount);
      } else {
        setCachedCount(0);
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // ------------------------------------------------------------------------
  // 2. HÀM TÌM NẠP CẤP TẤP (FETCH TASK FOR QUEUE ENGINE)
  // ------------------------------------------------------------------------
  const fetchTask = useCallback(async () => {
    const taskRunSeq = examRunSeqRef.current;
    if (!isExamActiveRef.current) return null;
    if (blueprintIndexRef.current >= currentBlueprintRef.current.length) return null;

    // HÀNG RÀO NGỮ CẢNH MỀM (Soft Phase Barrier)
    const currentUiIndex = uiIndexRef.current;
    const currentUiPhase = currentBlueprintRef.current[currentUiIndex]?.phase;
    const targetFetchPhase =
      currentBlueprintRef.current[blueprintIndexRef.current]?.phase;

    if (currentUiPhase && targetFetchPhase && currentUiPhase !== targetFetchPhase) {
      // Chỉ cho phép nạp đạn của Phase tiếp theo nếu UI đang hiển thị câu hỏi CUỐI CÙNG của Phase hiện tại
      const nextUiPhase = currentBlueprintRef.current[currentUiIndex + 1]?.phase;
      if (nextUiPhase !== targetFetchPhase) {
        return null; // Tạm ngủ để tránh ô nhiễm băng đạn
      }
    }

    // Tịnh tiến Pointer ĐỒNG BỘ để chống Race Condition khi Worker đa luồng gọi hàm
    const targetIndex = blueprintIndexRef.current;
    blueprintIndexRef.current += 1;
    const meta = currentBlueprintRef.current[targetIndex];
    if (!meta) return null;

    try {
      // Khử Thundering Herd bằng Staggered Delay ngẫu nhiên (200ms - 800ms)
      const staggerDelay = Math.floor(Math.random() * 600) + 200;
      await new Promise((r) => setTimeout(() => r(undefined), staggerDelay));

      if (!isExamActiveRef.current || taskRunSeq !== examRunSeqRef.current) {
        return null;
      }

      // Bắt buộc trích xuất RAM mới nhất trước MỖI VIÊN ĐẠN để cập nhật trí nhớ AI (Định tuyến ngôn ngữ)
      const trackLang = meta.track === 'hsk' ? 'zh' : 'en';
      const freshHistory = Utils
        ? Utils.safeJsonParse(`fc_ai_memory_${trackLang}`, [])
        : [];
      const effectiveApiKey = resolveExamApiKey(apiKey);
      const qData = await ExamEngine.hydrateQuestion(meta, effectiveApiKey, freshHistory);

      if (isExamActiveRef.current && taskRunSeq === examRunSeqRef.current && qData) {
        // Gửi hàng vào Kho thu hoạch AI
        if (qData.isNewHarvest && typeof handleAutoHarvestToPool === 'function') {
          try {
            const targetLang = meta.track === 'hsk' ? 'zh' : 'en';
            const contentToHarvest = qData.content?._fullPassageData || qData.content;
            const typeToHarvest = qData.content?._fullPassageData
              ? String(meta.type || '').includes('reading')
                ? 'ielts_reading_passage'
                : meta.type
              : meta.type;
            const safeTopic = meta.topic || 'General';
            const payloadToHarvest = {
              id: qData.harvestId || qData.id,
              content: contentToHarvest
            };
            handleAutoHarvestToPool(
              payloadToHarvest,
              targetLang,
              meta.level,
              safeTopic,
              typeToHarvest
            );
          } catch (harvestErr) {
            console.error('[useExamLogic] Harvest delegation failed:', harvestErr);
          }
        }
        return qData;
      }
    } catch (e) {
      const errMsg = e && typeof e === 'object' && 'message' in e ? e.message : String(e);
      console.warn(
        `[useExamLogic] Fetch task failed for index ${targetIndex}. Bỏ qua câu này để nạp câu tiếp theo. Lỗi:`,
        errMsg
      );
      // [BẢN VÁ 1.23] Ném thẳng lỗi ra ngoài để QueueEngine đếm Bankrupt. Cấm tạo phao cứu sinh tại đây.
      throw e;
    }
    return null;
  }, [apiKey, handleAutoHarvestToPool]);

  // ------------------------------------------------------------------------
  // 3. LOGIC NẠP CÂU HỎI HIỆN TẠI VÀO UI (THUẬT TOÁN EXTRACT BEST BULLET)
  // ------------------------------------------------------------------------
  const loadQuestion = useCallback(
    async (index, currentState) => {
      const targetState = currentState || examStateRef.current;
      const blueprint = Array.isArray(targetState?.blueprint) ? targetState.blueprint : [];

      if (blueprint.length === 0 || index >= blueprint.length) {
        const completedState = {
          ...targetState,
          status: 'completed',
          isTransitioning: false
        };
        finalizeExamSession(completedState, {
          persist: Boolean(completedState.sessionId),
          clearActiveKey: true
        });
        setExamState(completedState);
        return false;
      }

      setIsHydrating(true);
      const meta = blueprint[index];

      // --- THUẬT TOÁN MÀNG LỌC ĐẠN (EXTRACT BEST BULLET) ---
      const extractBestBullet = () => {
        if (!coordinatorRef.current || !Array.isArray(coordinatorRef.current.queue)) {
          return null;
        }
        const queue = coordinatorRef.current.queue;

        // Kẻ dọn xác: Tiêu diệt đạn AI đến muộn (index cũ) để giải phóng Băng đạn
        for (let i = queue.length - 1; i >= 0; i--) {
          const itemMeta = queue[i]?.metadata;
          if (itemMeta && itemMeta.index < meta.index) {
            queue.splice(i, 1);
          }
        }

        // 1. TÌM KIẾM CHÍNH XÁC (STRICT EXTRACTION) - LUẬT CẤM CƯỚP ĐẠN
        const validBullets = queue.filter(
          (item) => item && item.metadata && item.metadata.index === meta.index
        );
        if (validBullets.length === 0) return null;

        // 2. Vì băng đạn giờ CHỈ chứa đạn AI, ta bốc thẳng viên đầu tiên
        const selectedBullet = validBullets[0];
        const actualIdx = queue.indexOf(selectedBullet);
        if (actualIdx !== -1) {
          queue.splice(actualIdx, 1); // Trích xuất viên đạn khỏi băng đạn chung
          return selectedBullet;
        }
        return null;
      };

      let qData = extractBestBullet();

      // [BẢN VÁ 1.23] JIT FALLBACK TỨC THỜI (ZERO-LATENCY)
      // Băng đạn rỗng -> Không bắt người chơi chờ đợi 30s giữa game nữa, gọi cứu hộ lập tức!
      if (!qData) {
        if (index > 0) {
          notifyToast('Máy chủ bận, đã kích hoạt dữ liệu dự phòng!', 'warning');
        }
        // Kích hoạt động cơ background nạp đạn cho tương lai
        if (
          coordinatorRef.current &&
          typeof coordinatorRef.current.maintain === 'function'
        ) {
          coordinatorRef.current.maintain(false, 30000);
        }

        const localLang = readSafeStringStorage('fc_lang') || 'en';
        const targetLang =
          meta.lang ||
          meta.language ||
          (meta.track === 'hsk' || String(meta.level || '').startsWith('zh')
            ? 'zh'
            : localLang === 'zh'
            ? 'zh'
            : 'en');
        const localDeck = Utils
          ? Utils.safeJsonParse('fc_data_' + targetLang, [])
          : [];

        // Gọi Bộ máy Cứu hộ Toàn cục
        if (ExamEngine && typeof ExamEngine.getEmergencyFallback === 'function') {
          qData = ExamEngine.getEmergencyFallback(meta, localDeck, index);
        }

        // Cứu cánh OS nếu getEmergencyFallback hỏng
        if (!qData) {
          const fbData =
            ExamEngine && typeof ExamEngine._generateFallbackData === 'function'
              ? ExamEngine._generateFallbackData(
                  meta.type,
                  meta.level,
                  meta.track,
                  index
                )
              : { term: 'Lỗi mạng', definition: 'Vui lòng kiểm tra kết nối' };
          qData = {
            id: meta.id,
            metadata: meta,
            content: { ...fbData, isAiGenerated: false, _isRescued: true },
            timestamp: Date.now()
          };
        }
      } else {
        // Ghi đè bất biến id và metadata để đồng bộ hoàn hảo với index hiện tại (Bảo vệ UI)
        qData = {
          ...qData,
          id: meta.id,
          metadata: meta
        };
      }

      // ============================================================================
      // [CHUẨN HÓA ANTI-STREAK] KÍCH HOẠT THUẬT TOÁN "TRỘN CÓ TRÍ NHỚ" (IMMUTABLE)
      // ============================================================================
      const metaTypeStr = String(qData?.metadata?.type || '');
      if (
        qData &&
        qData.content &&
        Array.isArray(qData.content.options) &&
        !metaTypeStr.includes('tfng')
      ) {
        const options = [...qData.content.options];
        let correctIdx = options.findIndex(
          (o) =>
            o &&
            (o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true')
        );
        if (correctIdx !== -1 && options.length > 1) {
          const streak = streakTrackerRef.current;
          let shuffleCount = 0;
          // Kích hoạt nếu 2 câu liên tiếp trước đó có cùng vị trí đáp án
          while (
            streak.length >= 2 &&
            streak[0] === correctIdx &&
            streak[1] === correctIdx &&
            shuffleCount < 5
          ) {
            let swapIdx = Math.floor(Math.random() * options.length);
            while (swapIdx === correctIdx) {
              swapIdx = Math.floor(Math.random() * options.length);
            }
            const temp = options[correctIdx];
            options[correctIdx] = options[swapIdx];
            options[swapIdx] = temp;
            correctIdx = swapIdx;
            shuffleCount++;
            console.log(
              `[Anti-Streak] Mock Test: Bẻ gãy chuỗi đáp án tại vị trí mới: ${correctIdx}`
            );
          }
          qData = {
            ...qData,
            content: {
              ...qData.content,
              options
            }
          };
          // Ghi vào lịch sử, giữ lại 2 bước
          streakTrackerRef.current = [correctIdx, ...streak].slice(0, 2);
        }
      }

      setCurrentQuestion(qData);
      setIsHydrating(false);
      return true;
    },
    [finalizeExamSession]
  );

  // ------------------------------------------------------------------------
  // 4. ĐIỀU KHIỂN VÒNG ĐỜI BÀI THI (START, RESUME, SUBMIT, FORCE SUBMIT, QUIT)
  // ------------------------------------------------------------------------
  const setTransitionState = useCallback((isTrans) => {
    setExamState((prev) => ({ ...prev, isTransitioning: Boolean(isTrans) }));
  }, []);

  // BẮT ĐẦU BÀI THI MỚI
  const startExam = useCallback(
    async (profileId, level, topic) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        notifyToast('Không có kết nối mạng. Vui lòng kiểm tra Internet.', 'error');
        setExamState((prev) => ({ ...prev, status: 'error' }));
        return;
      }

      const effectiveApiKey = resolveExamApiKey(apiKey);
      if (!effectiveApiKey) {
        notifyToast('Thiếu API Key. Vui lòng cấu hình trong Cài đặt.', 'error');
        setExamState((prev) => ({ ...prev, status: 'error' }));
        return;
      }

      const profile = ExamProfiles?.PROFILES?.[profileId];
      if (!profile) {
        notifyToast('Lỗi dữ liệu: Cấu hình bài thi không tồn tại.', 'error');
        setExamState((prev) => ({ ...prev, status: 'error' }));
        return;
      }

      const rawBlueprint = ExamProfiles.generateBlueprint(profileId, level, topic);
      const blueprint = Array.isArray(rawBlueprint) ? rawBlueprint : [];
      if (blueprint.length === 0) {
        notifyToast('Lỗi dữ liệu: Không thể tạo danh sách câu hỏi cho bài thi.', 'error');
        setExamState((prev) => ({ ...prev, status: 'error' }));
        return;
      }

      // Ép thuộc tính 'phase' = 'chapter' để kích hoạt trạm gác và màn hình 20s cho MỌI lần đổi kỹ năng/đoạn văn
      blueprint.forEach((item) => {
        if (item && item.chapter) item.phase = item.chapter;
      });

      const runSeq = ++examRunSeqRef.current;
      isExamActiveRef.current = true;
      isTransitioningRef.current = false;

      // [ĐÁNH THỨC AUDIO PHẦN CỨNG] Mở khóa loa cho iOS/Safari/Edge ngay khi bắt đầu bài thi
      resumeHardwareAudioContext();

      setCurrentQuestion(null);
      setCachedCount(0);
      setExamCooldown(0);
      streakTrackerRef.current = []; // Reset trí nhớ Anti-Streak

      // Tẩy não AI triệt để ngay khi bắt đầu bài thi mới (Cách ly ngôn ngữ & xả RAM 3s)
      clearExamAiMemory();

      const sessionId = `exam_${profileId}_${Date.now()}`;
      const loadingSeconds = getConfiguredLoadingSeconds();
      const loadingState = {
        status: 'loading',
        sessionId: sessionId,
        profile: profile,
        blueprint: blueprint,
        currentIndex: 0,
        answers: [],
        timeRemaining: profile.timeLimit,
        score: 0,
        isTransitioning: false,
        preloadCountdown: loadingSeconds
      };
      setExamState(loadingState);

      // Khởi tạo Blueprint Pointer & QueueEngine
      currentBlueprintRef.current = blueprint;
      blueprintIndexRef.current = 0;
      uiIndexRef.current = 0;

      destroyCoordinatorSafely();
      if (QueueEngine && typeof QueueEngine.createQueueCoordinator === 'function') {
        coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
      } else {
        notifyToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
        setExamState((prev) => ({ ...prev, status: 'error' }));
        isExamActiveRef.current = false;
        return;
      }

      /** @type {ReturnType<typeof setInterval> | null} */
      let countdownInterval = null;
      try {
        const timeoutMs = loadingSeconds * 1000;

        // Đồng hồ đếm lùi Timeout cứng cho Màn hình khởi tạo
        const timeoutPromise = new Promise((resolve) => {
          let secondsLeft = loadingSeconds;
          setExamState((prev) => ({ ...prev, preloadCountdown: secondsLeft }));
          countdownInterval = setInterval(() => {
            if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) {
              if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
              }
              resolve('CANCELLED');
              return;
            }
            secondsLeft -= 1;
            setExamState((prev) => ({ ...prev, preloadCountdown: Math.max(0, secondsLeft) }));
            if (secondsLeft <= 0) {
              if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
              }
              resolve('TIMEOUT');
            }
          }, 1000);
        });

        const maintainPromise = coordinatorRef.current.maintain(true, timeoutMs);
        // [KHÓA CỬA PHÒNG CHỜ] Ép buộc chờ thời gian Load đầu game hoặc đi tiếp nếu AI nạp xong sớm
        await Promise.race([maintainPromise, timeoutPromise]);
      } catch (e) {
        console.error('[useExamLogic] Initial preload failed:', e);
      } finally {
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }

      if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) return;

      // Rút phát đạn đầu tiên
      const isLoaded = await loadQuestion(0, loadingState);
      if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) return;

      if (isLoaded) {
        const playingState = { ...loadingState, status: 'playing' };
        setExamState(playingState);
        if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
          Utils.safeLocalStorageSet(ACTIVE_EXAM_KEY, sessionId);
        }
        if (FcDB) {
          await FcDB.set(sessionId, playingState, 'exam_sessions').catch((e) =>
            console.warn('[useExamLogic] Initial session save failed:', e)
          );
        }
      }
    },
    [apiKey, destroyCoordinatorSafely, fetchTask, loadQuestion]
  );

  // NỘP ĐÁP ÁN TỪNG CÂU (CHỐNG NỘP NHẦM TRÊN MÀN HÌNH CHUYỂN CHẶNG ẢO OPTIMISTIC_*)
  const submitAnswer = useCallback(
    async (answerObj, isCorrect) => {
      if (
        isTransitioningRef.current ||
        !isExamActiveRef.current ||
        !currentQuestion ||
        !currentQuestion.content ||
        String(currentQuestion.id || '').startsWith('optimistic_')
      ) {
        return;
      }

      isTransitioningRef.current = true;
      const submitRunSeq = examRunSeqRef.current;

      try {
        const activeMeta = currentQuestion.metadata;
        const activeContent = currentQuestion.content;
        const prev = examStateRef.current;

        // Ghi nhận Sổ luân hồi (User Exam History)
        if (currentQuestion.harvestId && FcDB) {
          FcDB.get('fc_user_exam_history')
            .then((hist) => {
              const currentHist = Array.isArray(hist) ? hist : [];
              if (!currentHist.includes(currentQuestion.harvestId)) {
                currentHist.push(currentQuestion.harvestId);
                if (currentHist.length > 5000) currentHist.shift();
                FcDB.set('fc_user_exam_history', currentHist).catch(() => {});
              }
            })
            .catch((e) =>
              console.warn('[useExamLogic] Sổ luân hồi lưu thất bại', e)
            );
        }

        // Cắt tỉa Payload (Hút mỡ State) để giải phóng RAM
        let contentToSave = activeContent;
        if (activeContent) {
          const hasExtraInfo =
            activeContent.explanation ||
            activeContent.audioScript ||
            activeContent.passage;
          if (isCorrect && !hasExtraInfo) {
            let safeDef =
              activeContent.definition ||
              activeContent.targetWord ||
              activeContent.correction ||
              activeContent.oddWord ||
              '';
            if (activeContent.options && Array.isArray(activeContent.options)) {
              const cOpt = activeContent.options.find(
                (o) =>
                  o &&
                  (o.isCorrect === true ||
                    String(o.isCorrect).toLowerCase() === 'true')
              );
              if (cOpt) safeDef = cOpt.text;
            }
            contentToSave = {
              term:
                activeContent.term ||
                activeContent.displaySentence ||
                activeContent.wrongSentence ||
                (Array.isArray(activeContent.words)
                  ? activeContent.words.join(' • ')
                  : '') ||
                'Câu hỏi',
              definition: safeDef,
              _isLightweight: true
            };
          }
        }

        const prevAnswers = Array.isArray(prev.answers) ? prev.answers : [];
        const prevBlueprint = Array.isArray(prev.blueprint) ? prev.blueprint : [];

        const newAnswers = [
          ...prevAnswers,
          {
            index: prev.currentIndex,
            answer: answerObj,
            isCorrect: Boolean(isCorrect),
            questionMetadata: activeMeta,
            questionContent: contentToSave // Đã hút mỡ, giảm 90% dung lượng
          }
        ];
        const newScore = isCorrect ? prev.score + 1 : prev.score;
        const nextIndex = prev.currentIndex + 1;
        const isFinished = nextIndex >= prevBlueprint.length;
        const updatedState = {
          ...prev,
          answers: newAnswers,
          score: newScore,
          currentIndex: nextIndex
        };

        uiIndexRef.current = nextIndex; // Đồng bộ tức thời Pointer UI cho FetchTask

        if (isFinished) {
          const completedState = {
            ...updatedState,
            status: 'completed',
            isTransitioning: false
          };
          finalizeExamSession(completedState, {
            persist: Boolean(completedState.sessionId),
            clearActiveKey: true
          });
          setExamState(completedState);
          return;
        }

        // KIỂM TRA RANH GIỚI CHUYỂN CHẶNG (PHASE TRANSITION)
        const currentPhase = prevBlueprint[prev.currentIndex]?.phase;
        const nextPhase = prevBlueprint[nextIndex]?.phase;
        const isPhaseTransition =
          Boolean(currentPhase && nextPhase && currentPhase !== nextPhase);

        if (isPhaseTransition) {
          console.log(
            `[Phase Transition] Chuyển từ Phase ${currentPhase} sang Phase ${nextPhase}. Đang tiến hành tẩy não AI...`
          );

          // 1. Tẩy não AI trên Ổ cứng và RAM (Cách ly ngôn ngữ + xả RAM 3s)
          clearExamAiMemory();

          // 2. Bảo tồn Pre-fetch: Xóa rác của Phase cũ, giữ lại đạn của Phase mới
          if (coordinatorRef.current && Array.isArray(coordinatorRef.current.queue)) {
            coordinatorRef.current.queue = coordinatorRef.current.queue.filter(
              (item) => item && item.metadata && item.metadata.phase === nextPhase
            );
          }

          // 3. Ép Pointer FetchTask chỉ định vào câu đầu tiên của Chặng mới
          blueprintIndexRef.current = Math.max(blueprintIndexRef.current, nextIndex);

          // Lưu State và DB
          setExamState(updatedState);
          if (FcDB && updatedState.sessionId) {
            FcDB.set(updatedState.sessionId, updatedState, 'exam_sessions').catch(
              (e) => console.warn('[useExamLogic] Autosave failed:', e)
            );
          }

          // Gắn câu hỏi ảo để kích hoạt màn hình Intermission 20s của Tầng 5
          const nextMeta = prevBlueprint[nextIndex];
          setCurrentQuestion({
            id: `optimistic_${nextMeta.id}`,
            metadata: nextMeta,
            content: null
          });

          // Mở khe cửa 20s cho AI nạp đạn của chặng mới trong lúc màn hình Intermission đang chạy
          if (
            coordinatorRef.current &&
            typeof coordinatorRef.current.maintain === 'function'
          ) {
            /** @type {ReturnType<typeof setTimeout> | null} */
            let emergencyTimeoutId = null;
            try {
              const maintainPromise = coordinatorRef.current.maintain(true, 20000);
              const emergencyTimeout = new Promise((resolve) => {
                emergencyTimeoutId = setTimeout(() => resolve('TIMEOUT'), 20000);
              });
              await Promise.race([maintainPromise, emergencyTimeout]);
            } finally {
              if (emergencyTimeoutId !== null) {
                clearTimeout(emergencyTimeoutId);
                emergencyTimeoutId = null;
              }
            }
          }

          if (!isExamActiveRef.current || submitRunSeq !== examRunSeqRef.current) {
            return;
          }

          await loadQuestion(nextIndex, updatedState);
        } else {
          // Lưu State trước khi chạy Cooldown
          setExamState(updatedState);
          if (FcDB && updatedState.sessionId) {
            FcDB.set(updatedState.sessionId, updatedState, 'exam_sessions').catch(
              () => {}
            );
          }

          // Cooldown Lock (Thời gian chờ chuyển câu thông thường)
          const delaySec = getConfiguredMockDelaySeconds();
          if (delaySec > 0) {
            setExamCooldown(delaySec);
            for (let i = delaySec; i > 0; i--) {
              if (!isExamActiveRef.current || submitRunSeq !== examRunSeqRef.current) {
                setExamCooldown(0);
                return;
              }
              await new Promise((r) => setTimeout(() => r(undefined), 1000));
              if (!isExamActiveRef.current || submitRunSeq !== examRunSeqRef.current) {
                setExamCooldown(0);
                return;
              }
              setExamCooldown((prevCd) => Math.max(0, prevCd - 1));
            }
            setExamCooldown(0);
          }

          if (!isExamActiveRef.current || submitRunSeq !== examRunSeqRef.current) {
            return;
          }

          // Bốc đạn cho câu tiếp theo
          await loadQuestion(nextIndex, updatedState);
        }
      } catch (err) {
        console.error('[useExamLogic] submitAnswer failed:', err);
      } finally {
        if (submitRunSeq === examRunSeqRef.current) {
          isTransitioningRef.current = false;
        }
      }
    },
    [currentQuestion, finalizeExamSession, loadQuestion]
  );

  // NỘP BÀI SỚM (HOÀN TOÀN THUẦN KHIẾT STRICTMODE + HỦY WORKER)
  const forceSubmitExam = useCallback(() => {
    const prev = examStateRef.current;
    if (!prev || prev.status === 'idle' || prev.status === 'completed') return;
    const completedState = {
      ...prev,
      status: 'completed',
      isTransitioning: false
    };
    finalizeExamSession(completedState, {
      persist: Boolean(prev.sessionId),
      clearActiveKey: true
    });
    setExamState(completedState);
  }, [finalizeExamSession]);

  // KHÔI PHỤC PHIÊN THI ĐANG DỞ
  const resumeExam = useCallback(
    async (rawSessionId) => {
      const normalizedId = normalizeSessionId(rawSessionId);
      if (!normalizedId) {
        clearActiveExamSessionKey();
        notifyToast(
          'Không thể khôi phục phiên thi. Phiên đã bị lỗi hoặc hết hạn.',
          'error'
        );
        setExamState((prev) => ({ ...prev, status: 'error' }));
        return false;
      }

      const runSeq = ++examRunSeqRef.current;
      isExamActiveRef.current = true;
      isTransitioningRef.current = false;

      // [ĐÁNH THỨC AUDIO PHẦN CỨNG] Mở khóa loa khi tiếp tục bài thi
      resumeHardwareAudioContext();

      // Dọn bộ nhớ tạm có chọn lọc (tránh rác ngữ cảnh từ Mini-Game khác nhưng GIỮ nguyên fc_ai_memory_en/zh của bài thi)
      if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
        ExamEngine.clearVolatileMemory();
      }

      const loadingSeconds = getConfiguredLoadingSeconds();
      setExamState((prev) => ({
        ...prev,
        status: 'loading',
        preloadCountdown: loadingSeconds
      }));
      setCurrentQuestion(null);
      setCachedCount(0);
      setExamCooldown(0);
      streakTrackerRef.current = []; // Reset trí nhớ Anti-Streak

      try {
        if (FcDB) {
          let savedState = await FcDB.get(normalizedId, 'exam_sessions');
          if (!savedState && rawSessionId !== normalizedId) {
            savedState = await FcDB.get(rawSessionId, 'exam_sessions');
          }

          if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) {
            return false;
          }

          if (savedState && savedState.status !== 'completed') {
            const savedBlueprint = Array.isArray(savedState.blueprint)
              ? savedState.blueprint
              : [];
            const rawResumeIndex = Number(savedState.currentIndex);
            const resumeIndex =
              Number.isFinite(rawResumeIndex) && rawResumeIndex >= 0
                ? Math.floor(rawResumeIndex)
                : 0;

            // Chốt chặn sớm Blueprint rỗng hoặc chỉ mục vượt biên (không chờ 22s vô ích)
            if (savedBlueprint.length === 0 || resumeIndex >= savedBlueprint.length) {
              clearActiveExamSessionKey();
              isExamActiveRef.current = false;
              notifyToast(
                'Phiên thi đã hoàn tất hoặc dữ liệu câu hỏi không hợp lệ.',
                'error'
              );
              setExamState((prev) => ({ ...prev, status: 'error' }));
              return false;
            }

            const loadingState = {
              ...savedState,
              sessionId: savedState.sessionId || normalizedId,
              blueprint: savedBlueprint,
              currentIndex: resumeIndex,
              status: 'loading',
              isTransitioning: false,
              preloadCountdown: loadingSeconds
            };
            setExamState(loadingState);

            // Phục hồi Con trỏ Blueprint
            currentBlueprintRef.current = savedBlueprint;
            blueprintIndexRef.current = resumeIndex;
            uiIndexRef.current = resumeIndex;

            destroyCoordinatorSafely();
            if (QueueEngine && typeof QueueEngine.createQueueCoordinator === 'function') {
              coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
            } else {
              notifyToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
              setExamState((prev) => ({ ...prev, status: 'error' }));
              isExamActiveRef.current = false;
              return false;
            }

            // [ĐỒNG HỒ ĐẾM NGƯỢC KHI RESUME]
            /** @type {ReturnType<typeof setInterval> | null} */
            let countdownInterval = null;
            try {
              const timeoutPromise = new Promise((resolve) => {
                let secondsLeft = loadingSeconds;
                setExamState((prev) => ({
                  ...prev,
                  preloadCountdown: secondsLeft
                }));
                countdownInterval = setInterval(() => {
                  if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) {
                    if (countdownInterval) {
                      clearInterval(countdownInterval);
                      countdownInterval = null;
                    }
                    resolve('CANCELLED');
                    return;
                  }
                  secondsLeft -= 1;
                  setExamState((prev) => ({
                    ...prev,
                    preloadCountdown: Math.max(0, secondsLeft)
                  }));
                  if (secondsLeft <= 0) {
                    if (countdownInterval) {
                      clearInterval(countdownInterval);
                      countdownInterval = null;
                    }
                    resolve('TIMEOUT');
                  }
                }, 1000);
              });
              const maintainPromise = coordinatorRef.current.maintain(
                true,
                loadingSeconds * 1000
              );
              await Promise.race([maintainPromise, timeoutPromise]);
            } finally {
              if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
              }
            }

            if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) {
              return false;
            }

            const isLoaded = await loadQuestion(resumeIndex, loadingState);
            if (!isExamActiveRef.current || runSeq !== examRunSeqRef.current) {
              return false;
            }
            if (isLoaded) {
              setExamState({ ...loadingState, status: 'playing' });
              if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
                Utils.safeLocalStorageSet(ACTIVE_EXAM_KEY, loadingState.sessionId);
              }
            }
            return isLoaded;
          }
        }
      } catch (e) {
        console.error('[useExamLogic] Resume Exam failed:', e);
      }

      if (runSeq === examRunSeqRef.current) {
        clearActiveExamSessionKey();
        notifyToast(
          'Không thể khôi phục phiên thi. Phiên đã bị lỗi hoặc hết hạn.',
          'error'
        );
        setExamState((prev) => ({ ...prev, status: 'error' }));
        isExamActiveRef.current = false;
      }
      return false;
    },
    [destroyCoordinatorSafely, fetchTask, loadQuestion]
  );

  // THOÁT NGANG PHÒNG THI
  const quitExam = useCallback(() => {
    const initialState = createInitialExamState();
    finalizeExamSession(initialState, { persist: false, clearActiveKey: true });
    streakTrackerRef.current = [];
    setCurrentQuestion(null);
    setExamState(initialState);
  }, [finalizeExamSession]);

  // ------------------------------------------------------------------------
  // 5. ĐỘNG CƠ XUẤT BÁO CÁO EXCEL (EXPORT EXCEL — SẠCH 0 LỖI TSC)
  // ------------------------------------------------------------------------
  const exportExamToExcel = useCallback(() => {
    const xlsxLib = getXlsx();
    if (!xlsxLib) {
      notifyToast('Thư viện Excel chưa sẵn sàng!', 'error');
      return;
    }
    const answersList = Array.isArray(examState.answers) ? examState.answers : [];
    if (answersList.length === 0) {
      notifyToast('Chưa có dữ liệu bài làm để xuất!', 'warning');
      return;
    }

    const excelData = answersList.map((ans, idx) => {
      const meta = ans?.questionMetadata || {};
      const content = ans?.questionContent || {};
      const type = String(meta.type || 'unknown');
      const isCorrect = Boolean(ans?.isCorrect);
      const userAns = ans?.answer;
      let questionText = 'Dữ liệu câu hỏi bị khuyết';
      let correctText = '';
      let userText = '';
      let explanation = content.explanation || content.analysis || '';

      // Phục hồi dữ liệu từ Lightweight DTO (Skeleton Save)
      if (content._isLightweight) {
        questionText = content.term || 'Câu hỏi';
        correctText = content.definition || 'Đáp án đúng';
        userText =
          userAns && typeof userAns === 'object'
            ? userAns.text || JSON.stringify(userAns)
            : userAns !== undefined && userAns !== null
            ? String(userAns)
            : 'Bỏ qua';
      } else {
        // Phân tích dữ liệu gốc phức hợp theo từng dạng bài
        if (
          type.includes('multiple_choice') ||
          type.includes('mcq') ||
          type.includes('tfng') ||
          type.includes('pronunciation') ||
          type.includes('image_quiz') ||
          type.includes('match') ||
          type.includes('listening')
        ) {
          questionText = String(
            content.term || content.questionText || 'Câu hỏi trắc nghiệm'
          ).replace(/\*/g, '');
          const correctOpt = Array.isArray(content.options)
            ? content.options.find(
                (o) =>
                  o &&
                  (o.isCorrect === true ||
                    String(o.isCorrect).toLowerCase() === 'true')
              )
            : null;
          correctText = correctOpt
            ? String(correctOpt.text || '').replace(/\*/g, '')
            : content.correctAnswer ||
              content.definition ||
              'Không rõ đáp án';
          userText =
            userAns && typeof userAns === 'object'
              ? String(userAns.text || 'Đã chọn').replace(/\*/g, '')
              : String(userAns || 'Bỏ qua').replace(/\*/g, '');
        } else if (type.includes('fill_blank')) {
          questionText = content.displaySentence
            ? String(content.displaySentence).replace(/\[__________\]/g, ' [___] ')
            : content.term || 'Câu điền từ';
          correctText =
            content.targetWord ||
            content.correctAnswer ||
            content.definition ||
            'Không rõ đáp án';
          userText =
            typeof userAns === 'string' && userAns.trim() !== ''
              ? userAns
              : 'Bỏ qua';
          explanation = content.hint || explanation;
        } else if (type.includes('spot_mistake')) {
          questionText =
            content.wrongSentence || content.term || 'Câu tìm lỗi sai';
          correctText = content.correction
            ? `Sửa: ${content.wrongWord} ➔ ${content.correction}`
            : content.definition || 'Không rõ đáp án';
          if (userAns && typeof userAns === 'object' && userAns.correction) {
            userText = `Sửa thành: ${userAns.correction}`;
          } else if (userAns && typeof userAns === 'object' && userAns.selectedWord) {
            userText = `Chọn sai ở: ${userAns.selectedWord}`;
          } else {
            userText = 'Bỏ qua';
          }
        } else if (type.includes('scramble')) {
          questionText = content.definition
            ? `Ý nghĩa: ${content.definition}`
            : 'Câu ghép từ';
          correctText = content.term || 'Không rõ đáp án';
          userText =
            typeof userAns === 'string' && userAns.trim() !== ''
              ? userAns
              : 'Bỏ qua';
        } else if (type.includes('odd_one_out')) {
          questionText = Array.isArray(content.words)
            ? content.words.join(' • ')
            : content.words || 'Nhóm từ khác loại';
          correctText =
            content.oddWord || content.definition || 'Không rõ đáp án';
          userText =
            typeof userAns === 'string' && userAns.trim() !== ''
              ? userAns
              : 'Bỏ qua';
        }
      }

      return {
        STT: ans?.index !== undefined ? ans.index + 1 : idx + 1,
        'Kỹ năng / Chặng': meta.chapter || meta.phase || 'Chung',
        'Câu hỏi': questionText,
        'Đáp án bạn chọn': userText,
        'Đáp án đúng': correctText,
        'Trạng thái': isCorrect ? 'Đúng' : 'Sai',
        'Phân tích / Giải thích': explanation
      };
    });

    const ws = xlsxLib.utils.json_to_sheet(excelData);
    ws['!cols'] = [
      { wch: 5 },
      { wch: 25 },
      { wch: 45 },
      { wch: 20 },
      { wch: 20 },
      { wch: 10 },
      { wch: 50 }
    ];
    const wb = xlsxLib.utils.book_new();
    xlsxLib.utils.book_append_sheet(wb, ws, 'ChiTietBaiThi');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    xlsxLib.writeFile(wb, `Chi_Tiet_Bai_Thi_${dateStr}.xlsx`);
    notifyToast('Đã tải xuống file Excel!', 'success');
  }, [examState.answers]);

  return {
    examState,
    currentQuestion,
    isHydrating,
    cachedCount,
    examCooldown,
    startExam,
    resumeExam,
    submitAnswer,
    forceSubmitExam,
    quitExam,
    setTransitionState,
    exportExamToExcel
  };
};

export const Block6_7_useExamLogic = useExamLogic;

if (typeof window !== 'undefined') {
  window.Block6_7_useExamLogic = useExamLogic;
  window.useExamLogic = useExamLogic;
}

export default useExamLogic;