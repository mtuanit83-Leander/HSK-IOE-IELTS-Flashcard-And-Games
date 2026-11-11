/**
 * @file src/hooks/useExamLogic.js
 * @description Bộ tổng tham mưu điều phối kỳ thi Mock Test (Exam Logic). Quản lý tiến trình, pre-fetch, tự động lưu Snapshot và Xuất dữ liệu.
 * @origin Tầng 6 - Block 6.7 (useExamLogic)
 */


import React from 'react';
import * as XLSX from 'xlsx';
import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { ExamEngine } from '@/engines/exam';
import { ExamProfiles } from '@/engines/examProfiles';
import { AiFactoryEngine } from '@/engines/aiFactory';
import { QueueEngine } from '@/engines/queueEngine';
import { FallbackDataEngine } from '@/engines/fallbackData';


export const useExamLogic = (apiKey, handleAutoHarvestToPool) => {
  const [examState, setExamState] = React.useState({
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


  const [currentQuestion, setCurrentQuestion] = React.useState(null);
  const [isHydrating, setIsHydrating] = React.useState(false);
  const [cachedCount, setCachedCount] = React.useState(0); // Biến đếm đạn AI
  const [examCooldown, setExamCooldown] = React.useState(0);


  // ============================================================================
  // KIẾN TRÚC QUEUE ENGINE & BLUEPRINT POINTER
  // ============================================================================
  const coordinatorRef = React.useRef(null);
  const currentBlueprintRef = React.useRef([]);
  const blueprintIndexRef = React.useRef(0);
  const uiIndexRef = React.useRef(0); // [PHASE-GATED] Đồng bộ tức thời Index của UI để FetchTask dò đường
 
  // [CHUẨN HÓA ANTI-STREAK] Trí nhớ lưu vết vị trí đáp án đúng 2 lượt gần nhất
  const streakTrackerRef = React.useRef([]);
  const timerRef = React.useRef(null);
 
  const isExamActiveRef = React.useRef(false); // Cờ trạng thái sinh tồn của bài thi
  const isTransitioningRef = React.useRef(false); // Khóa luồng submit chống Rage-click
 
  React.useEffect(() => {
    return () => {
      isExamActiveRef.current = false;
      isTransitioningRef.current = false;
      if (coordinatorRef.current) coordinatorRef.current.destroy();
    };
  }, []);


  // ------------------------------------------------------------------------
  // 1. HỆ THỐNG ĐẾM NGƯỢC BÀI THI (COUNTDOWN TIMER)
  // ------------------------------------------------------------------------
  React.useEffect(() => {
    const isTimerAllowedToRun = examState.status === 'playing' && !isHydrating && currentQuestion !== null && !examState.isTransitioning && examCooldown === 0;
   
    if (isTimerAllowedToRun) {
      timerRef.current = setInterval(() => {
        setExamState(prev => {
          if (prev.timeRemaining <= 1) {
            clearInterval(timerRef.current);
            const updatedState = { ...prev, timeRemaining: 0, status: 'completed' };
            isExamActiveRef.current = false;
            isTransitioningRef.current = false;
           
            if (FcDB && prev.sessionId) {
              FcDB.set(prev.sessionId, updatedState, 'exam_sessions').catch(e => console.warn("[useExamLogic] Timeout autosave failed:", e));
            }
            if (STORAGE_KEYS && STORAGE_KEYS.ACTIVE_EXAM) {
              localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXAM);
            }
           
            // Dọn dẹp bộ nhớ AI khi hết giờ (Cách ly ngôn ngữ)
            localStorage.setItem('fc_ai_memory_en', '[]');
            localStorage.setItem('fc_ai_memory_zh', '[]');
            localStorage.removeItem('fc_ai_memory');
            if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
              ExamEngine.clearVolatileMemory();
            }
            return updatedState;
          }
          return { ...prev, timeRemaining: prev.timeRemaining - 1 };
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
   
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [examState.status, isHydrating, currentQuestion, examState.isTransitioning, examCooldown]);


  // ------------------------------------------------------------------------
  // 1.5. ĐỒNG HỒ QUÉT ĐẠN NGẦM (HONEST AMMO SCANNER 500ms)
  // ------------------------------------------------------------------------
  React.useEffect(() => {
    const queueScanner = setInterval(() => {
      if (coordinatorRef.current && coordinatorRef.current.queue) {
        let aiCount = 0;
        // Lọc đạn trung thực: CHỈ đếm nếu viên đạn thực sự do AI đúc ra (không phải đồ cứu hộ)
        coordinatorRef.current.queue.forEach(item => {
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
  const fetchTask = React.useCallback(async () => {
    if (!isExamActiveRef.current) return null;
    if (blueprintIndexRef.current >= currentBlueprintRef.current.length) return null;


    // HÀNG RÀO NGỮ CẢNH MỀM (Soft Phase Barrier)
    const currentUiIndex = uiIndexRef.current;
    const currentUiPhase = currentBlueprintRef.current[currentUiIndex]?.phase;
    const targetFetchPhase = currentBlueprintRef.current[blueprintIndexRef.current]?.phase;
   
    if (currentUiPhase && targetFetchPhase && currentUiPhase !== targetFetchPhase) {
      // Chỉ cho phép nạp đạn của Phase tiếp theo nếu UI đang hiển thị câu hỏi CUỐI CÙNG của Phase hiện tại.
      const nextUiPhase = currentBlueprintRef.current[currentUiIndex + 1]?.phase;
      if (nextUiPhase !== targetFetchPhase) {
        return null; // Tạm ngủ để tránh ô nhiễm băng đạn
      }
    }


    // Tịnh tiến Pointer ĐỒNG BỘ để chống Race Condition khi Worker đa luồng gọi hàm
    const targetIndex = blueprintIndexRef.current;
    blueprintIndexRef.current += 1;
    const meta = currentBlueprintRef.current[targetIndex];


    try {
      // Khử Thundering Herd bằng Staggered Delay ngẫu nhiên (200ms - 800ms)
      const staggerDelay = Math.floor(Math.random() * 600) + 200;
      await new Promise(r => setTimeout(r, staggerDelay));
     
      // Bắt buộc trích xuất RAM mới nhất trước MỖI VIÊN ĐẠN để cập nhật trí nhớ AI (Định tuyến ngôn ngữ)
      const trackLang = meta.track === 'hsk' ? 'zh' : 'en';
      const freshHistory = Utils ? Utils.safeJsonParse(`fc_ai_memory_${trackLang}`, []) : [];
      const qData = await ExamEngine.hydrateQuestion(meta, apiKey, freshHistory);
     
      if (isExamActiveRef.current && qData) {
        // Gửi hàng vào Kho thu hoạch AI
        if (qData.isNewHarvest && typeof handleAutoHarvestToPool === 'function') {
          try {
            const targetLang = meta.track === 'hsk' ? 'zh' : 'en';
            const contentToHarvest = qData.content._fullPassageData || qData.content;
            const typeToHarvest = qData.content._fullPassageData ? (meta.type.includes('reading') ? 'ielts_reading_passage' : meta.type) : meta.type;
            const safeTopic = meta.topic || 'General';
           
            const payloadToHarvest = {
              id: qData.harvestId || qData.id,
              content: contentToHarvest
            };
           
            handleAutoHarvestToPool(payloadToHarvest, targetLang, meta.level, safeTopic, typeToHarvest);
          } catch (harvestErr) {
            console.error("[useExamLogic] Harvest delegation failed:", harvestErr);
          }
        }
        return qData;
      }
    } catch (e) {
      console.warn(`[useExamLogic] Fetch task failed for index ${targetIndex}. Bỏ qua câu này để nạp câu tiếp theo. Lỗi:`, e.message);
      // [BẢN VÁ 1.23] Ném thẳng lỗi ra ngoài để QueueEngine đếm Bankrupt. Cấm tạo phao cứu sinh tại đây.
      throw e;
    }
   
    return null;
  }, [apiKey, handleAutoHarvestToPool]);


  // ------------------------------------------------------------------------
  // 3. LOGIC NẠP CÂU HỎI HIỆN TẠI VÀO UI (THUẬT TOÁN EXTRACT BEST BULLET)
  // ------------------------------------------------------------------------
  const loadQuestion = async (index, currentState) => {
    const targetState = currentState || examState;
    if (!targetState.blueprint || index >= targetState.blueprint.length) {
      setExamState(prev => ({ ...prev, status: 'completed' }));
      // Dọn dẹp bộ nhớ AI khi kết thúc (Cách ly ngôn ngữ)
      localStorage.setItem('fc_ai_memory_en', '[]');
      localStorage.setItem('fc_ai_memory_zh', '[]');
      localStorage.removeItem('fc_ai_memory');
      if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
        ExamEngine.clearVolatileMemory();
      }
      return false;
    }


    setIsHydrating(true);
    const meta = targetState.blueprint[index];
   
    // --- THUẬT TOÁN MÀNG LỌC ĐẠN (EXTRACT BEST BULLET) ---
    const extractBestBullet = () => {
      if (!coordinatorRef.current || !coordinatorRef.current.queue) return null;
      const queue = coordinatorRef.current.queue;
     
      // Kẻ dọn xác: Tiêu diệt đạn AI đến muộn (index cũ) để giải phóng Băng đạn
      for (let i = queue.length - 1; i >= 0; i--) {
        const itemMeta = queue[i].metadata;
        if (itemMeta && itemMeta.index < meta.index) {
          queue.splice(i, 1);
        }
      }
     
      // 1. TÌM KIẾM CHÍNH XÁC (STRICT EXTRACTION) - LUẬT CẤM CƯỚP ĐẠN
      let validBullets = queue.filter(item => item.metadata && item.metadata.index === meta.index);
     
      if (validBullets.length === 0) return null;
     
      // 2. Vì băng đạn giờ CHỈ chứa đạn AI, ta bốc thẳng viên đầu tiên
      let selectedBullet = validBullets[0];
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
      if (window.globalShowToast && index > 0) window.globalShowToast("Máy chủ bận, đã kích hoạt dữ liệu dự phòng!", "warning");
     
      // Kích hoạt động cơ background nạp đạn cho tương lai
      if (coordinatorRef.current && typeof coordinatorRef.current.maintain === 'function') {
        coordinatorRef.current.maintain(false, 30000);
      }
     
      const localLang = window.localStorage ? localStorage.getItem('fc_lang') : 'en';
      const targetLang = meta.lang || meta.language || (meta.track === 'hsk' || String(meta.level).startsWith('zh') ? 'zh' : localLang);
      const localDeck = Utils ? Utils.safeJsonParse('fc_data_' + targetLang, []) : [];
     
      // Gọi Bộ máy Cứu hộ Toàn cục
      if (ExamEngine && ExamEngine.getEmergencyFallback) {
        qData = ExamEngine.getEmergencyFallback(meta, localDeck, index);
      }
     
      // Cứu cánh OS nếu getEmergencyFallback hỏng
      if (!qData) {
        const fbData = ExamEngine._generateFallbackData ? ExamEngine._generateFallbackData(meta.type, meta.level, meta.track, index) : { term: "Lỗi mạng", definition: "Vui lòng kiểm tra kết nối" };
        qData = {
          id: meta.id,
          metadata: meta,
          content: { ...fbData, isAiGenerated: false, _isRescued: true },
          timestamp: Date.now()
        };
      }
    } else {
      // Ghi đè id và metadata để đồng bộ hoàn hảo với index hiện tại (Bảo vệ UI)
      qData.id = meta.id;
      qData.metadata = meta;
    }


    // ============================================================================
    // [CHUẨN HÓA ANTI-STREAK] KÍCH HOẠT THUẬT TOÁN "TRỘN CÓ TRÍ NHỚ"
    // ============================================================================
    if (qData && qData.content && Array.isArray(qData.content.options) && qData.metadata && !qData.metadata.type.includes('tfng')) {
      const options = qData.content.options;
      let correctIdx = options.findIndex(o => o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true');
     
      if (correctIdx !== -1 && options.length > 1) {
        const streak = streakTrackerRef.current;
        let shuffleCount = 0;
       
        // Kích hoạt nều 2 câu liên tiếp trước đó có cùng vị trí đáp án
        while (streak.length >= 2 && streak[0] === correctIdx && streak[1] === correctIdx && shuffleCount < 5) {
          let swapIdx = Math.floor(Math.random() * options.length);
          while (swapIdx === correctIdx) {
            swapIdx = Math.floor(Math.random() * options.length);
          }
          // Hoán đổi phần tử
          const temp = options[correctIdx];
          options[correctIdx] = options[swapIdx];
          options[swapIdx] = temp;
          // Cập nhật lại Index mới
          correctIdx = swapIdx;
          shuffleCount++;
          console.log(`[Anti-Streak] Mock Test: Bẻ gãy chuỗi đáp án tại vị trí mới: ${correctIdx}`);
        }
        // Ghi vào lịch sử, giữ lại 2 bước
        streakTrackerRef.current = [correctIdx, ...streak].slice(0, 2);
      }
    }


    setCurrentQuestion(qData);
    setIsHydrating(false);
    return true;
  };


  // ------------------------------------------------------------------------
  // 4. ĐIỀU KHIỂN VÒNG ĐỜI BÀI THI (START, RESUME, SUBMIT)
  // ------------------------------------------------------------------------
  const setTransitionState = React.useCallback((isTrans) => {
    setExamState(prev => ({ ...prev, isTransitioning: isTrans }));
  }, []);


  // BẮT ĐẦU BÀI THI MỚI
  const startExam = async (profileId, level, topic) => {
    if (!navigator.onLine) {
      if (window.globalShowToast) window.globalShowToast("Không có kết nối mạng. Vui lòng kiểm tra Internet.", "error");
      setExamState(prev => ({ ...prev, status: 'error' }));
      return;
    }
   
    if (!apiKey) {
      if (window.globalShowToast) window.globalShowToast("Thiếu API Key. Vui lòng cấu hình trong Cài đặt.", "error");
      setExamState(prev => ({ ...prev, status: 'error' }));
      return;
    }


    isExamActiveRef.current = true;
    isTransitioningRef.current = false;
   
    // [ĐÁNH THỨC AUDIO PHẦN CỨNG] Mở khóa loa cho iOS/Safari/Edge ngay khi bắt đầu bài thi
    if (window.fc_audioCtx && window.fc_audioCtx.state === 'suspended') {
      window.fc_audioCtx.resume();
    }
   
    setCurrentQuestion(null);
    setCachedCount(0);
    setExamCooldown(0);
    streakTrackerRef.current = []; // Reset trí nhớ Anti-Streak
   
    // Tẩy não AI triệt để ngay khi bắt đầu bài thi mới (Cách ly ngôn ngữ)
    localStorage.setItem('fc_ai_memory_en', '[]');
    localStorage.setItem('fc_ai_memory_zh', '[]');
    localStorage.removeItem('fc_ai_memory');
    if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
      ExamEngine.clearVolatileMemory();
    }


    const profile = ExamProfiles.PROFILES[profileId];
    if (!profile) {
      if (window.globalShowToast) window.globalShowToast("Lỗi dữ liệu: Cấu hình bài thi không tồn tại.", "error");
      setExamState(prev => ({ ...prev, status: 'error' }));
      return;
    }


    const blueprint = ExamProfiles.generateBlueprint(profileId, level, topic);
   
    // Ép thuộc tính 'phase' = 'chapter' để kích hoạt trạm gác và màn hình 20s cho MỌI lần đổi kỹ năng hoặc đổi đoạn văn đọc hiểu.
    blueprint.forEach(item => {
      if (item.chapter) item.phase = item.chapter;
    });


    const sessionId = `exam_${profileId}_${Date.now()}`;
    const loadingState = {
      status: 'loading', sessionId: sessionId, profile: profile, blueprint: blueprint,
      currentIndex: 0, answers: [], timeRemaining: profile.timeLimit, score: 0,
      isTransitioning: false, preloadCountdown: 30
    };
    setExamState(loadingState);


    // Khởi tạo Blueprint Pointer & QueueEngine
    currentBlueprintRef.current = blueprint;
    blueprintIndexRef.current = 0;
    uiIndexRef.current = 0;
   
    if (coordinatorRef.current) coordinatorRef.current.destroy();
   
    if (QueueEngine && QueueEngine.createQueueCoordinator) {
      coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
    } else {
      if (window.globalShowToast) window.globalShowToast("Lỗi hệ thống: Không tìm thấy QueueEngine", "error");
      setExamState(prev => ({ ...prev, status: 'error' }));
      isExamActiveRef.current = false;
      return;
    }


    let countdownInterval;
    try {
      let aiConfig = { loadingTime: 22 };
      try {
        const cfg = JSON.parse(localStorage.getItem('fc_ai_config'));
        if (cfg && cfg.loadingTime) aiConfig.loadingTime = cfg.loadingTime;
      } catch(e){}
     
      const timeoutMs = aiConfig.loadingTime * 1000;
     
      // Đồng hồ đếm lùi Timeout cứng cho Màn hình khởi tạo
      const timeoutPromise = new Promise(resolve => {
        let secondsLeft = aiConfig.loadingTime;
        setExamState(prev => ({ ...prev, preloadCountdown: secondsLeft }));
       
        countdownInterval = setInterval(() => {
          secondsLeft--;
          setExamState(prev => ({ ...prev, preloadCountdown: secondsLeft }));
          if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
            resolve('TIMEOUT');
          }
        }, 1000);
      });
     
      const maintainPromise = coordinatorRef.current.maintain(true, timeoutMs);
     
      // [KHÓA CỬA PHÒNG CHỜ] Ép buộc chờ thời gian Load đầu game hoặc đi tiếp nếu AI nạp xong sớm
      await Promise.race([maintainPromise, timeoutPromise]);
    } catch (e) {
      console.error("Initial preload failed:", e);
    } finally {
      if (countdownInterval) clearInterval(countdownInterval);
    }


    if (!isExamActiveRef.current) return;


    // Rút phát đạn đầu tiên
    const isLoaded = await loadQuestion(0, loadingState);
    if (!isExamActiveRef.current) return;
   
    if (isLoaded && isExamActiveRef.current) {
      const playingState = { ...loadingState, status: 'playing' };
      setExamState(playingState);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_EXAM, sessionId);
      if (FcDB) {
        await FcDB.set(sessionId, playingState, 'exam_sessions');
      }
    }
  };


  const submitAnswer = async (answerObj, isCorrect) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
   
    const activeMeta = currentQuestion?.metadata;
    const activeContent = currentQuestion?.content;
    const prev = examState;


    // Ghi nhận Sổ luân hồi (User Exam History)
    if (currentQuestion && currentQuestion.harvestId && FcDB) {
      FcDB.get('fc_user_exam_history').then(hist => {
        let currentHist = Array.isArray(hist) ? hist : [];
        if (!currentHist.includes(currentQuestion.harvestId)) {
          currentHist.push(currentQuestion.harvestId);
          if (currentHist.length > 5000) currentHist.shift();
          FcDB.set('fc_user_exam_history', currentHist).catch(e => {});
        }
      }).catch(e => console.warn("[useExamLogic] Sổ luân hồi lưu thất bại", e));
    }
   
    // Cắt tỉa Payload (Hút mỡ State) để giải phóng RAM
    let contentToSave = activeContent;
    if (activeContent) {
      const hasExtraInfo = activeContent.explanation || activeContent.audioScript || activeContent.passage;
      if (isCorrect && !hasExtraInfo) {
        let safeDef = activeContent.definition || activeContent.targetWord || activeContent.correction || activeContent.oddWord || "";
        if (activeContent.options && Array.isArray(activeContent.options)) {
          const cOpt = activeContent.options.find(o => o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true');
          if (cOpt) safeDef = cOpt.text;
        }
        contentToSave = { term: activeContent.term || activeContent.displaySentence || activeContent.wrongSentence || (Array.isArray(activeContent.words) ? activeContent.words.join(' • ') : "") || "Câu hỏi", definition: safeDef, _isLightweight: true };
      }
    }


    const newAnswers = [...prev.answers, {
      index: prev.currentIndex,
      answer: answerObj,
      isCorrect: isCorrect,
      questionMetadata: activeMeta,
      questionContent: contentToSave // Đã hút mỡ, giảm 90% dung lượng
    }];
   
    const newScore = isCorrect ? prev.score + 1 : prev.score;
    const nextIndex = prev.currentIndex + 1;
    const isFinished = nextIndex >= prev.blueprint.length;
   
    const updatedState = { ...prev, answers: newAnswers, score: newScore, currentIndex: nextIndex };
   
    uiIndexRef.current = nextIndex; // Đồng bộ tức thời Pointer UI cho FetchTask
   
    if (isFinished) {
      isExamActiveRef.current = false;
      const completedState = { ...updatedState, status: 'completed' };
      setExamState(completedState);
      if (FcDB && completedState.sessionId) {
        FcDB.set(completedState.sessionId, completedState, 'exam_sessions').catch(e => {});
      }
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXAM);
      isTransitioningRef.current = false;
     
      // Dọn dẹp bộ nhớ AI khi kết thúc tự nhiên (Cách ly ngôn ngữ)
      localStorage.setItem('fc_ai_memory_en', '[]');
      localStorage.setItem('fc_ai_memory_zh', '[]');
      localStorage.removeItem('fc_ai_memory');
      if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
        ExamEngine.clearVolatileMemory();
      }
    } else {
      // KIỂM TRA RANH GIỚI CHUYỂN CHẶNG (PHASE TRANSITION)
      const currentPhase = prev.blueprint[prev.currentIndex]?.phase;
      const nextPhase = prev.blueprint[nextIndex]?.phase;
      const isPhaseTransition = currentPhase && nextPhase && currentPhase !== nextPhase;
     
      if (isPhaseTransition) {
        console.log(`[Phase Transition] Chuyển từ Phase ${currentPhase} sang Phase ${nextPhase}. Đang tiến hành tẩy não AI...`);
       
        // 1. Tẩy não AI trên Ổ cứng và RAM (Cách ly ngôn ngữ)
        localStorage.setItem('fc_ai_memory_en', '[]');
        localStorage.setItem('fc_ai_memory_zh', '[]');
        localStorage.removeItem('fc_ai_memory');
        if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
          ExamEngine.clearVolatileMemory();
        }
       
        // 2. Bảo tồn Pre-fetch: Xóa rác của Phase cũ, giữ lại đạn của Phase mới
        if (coordinatorRef.current) {
          coordinatorRef.current.queue = coordinatorRef.current.queue.filter(item => item.metadata && item.metadata.phase === nextPhase);
        }
       
        // 3. Ép Pointer FetchTask chỉ định vào câu đầu tiên của Chặng mới
        blueprintIndexRef.current = Math.max(blueprintIndexRef.current, nextIndex);
       
        // Lưu State và DB
        setExamState(updatedState);
        if (FcDB) {
          FcDB.set(updatedState.sessionId, updatedState, 'exam_sessions').catch(e => console.warn("[useExamLogic] Autosave failed:", e));
        }
       
        // Gắn câu hỏi ảo để kích hoạt màn hình Intermission 20s của Tầng 5
        const nextMeta = prev.blueprint[nextIndex];
        setCurrentQuestion({ id: `optimistic_${nextMeta.id}`, metadata: nextMeta, content: null });
       
        // Mở khe cửa 20s cho AI nạp đạn của chặng mới trong lúc màn hình Intermission đang chạy
        if (coordinatorRef.current && typeof coordinatorRef.current.maintain === 'function') {
          const maintainPromise = coordinatorRef.current.maintain(true, 20000);
          const emergencyTimeout = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 20000));
          Promise.race([maintainPromise, emergencyTimeout]).then(() => {
            loadQuestion(nextIndex, updatedState).then(() => {
              isTransitioningRef.current = false;
            });
          });
        } else {
          loadQuestion(nextIndex, updatedState).then(() => {
            isTransitioningRef.current = false;
          });
        }
      } else {
        // Cooldown Lock (Thời gian chờ chuyển câu thông thường)
        const delaySecStr = localStorage.getItem('fc_mock_delay');
        const delaySec = parseInt(delaySecStr !== null ? delaySecStr : '3', 10);
       
        if (delaySec > 0) {
          setExamCooldown(delaySec);
          for (let i = delaySec; i > 0; i--) {
            if (!isExamActiveRef.current) {
              setExamCooldown(0);
              return;
            }
            await new Promise(r => setTimeout(r, 1000));
            setExamCooldown(prev => prev - 1);
          }
          setExamCooldown(0);
        }
       
        // Bốc đạn cho câu tiếp theo
        loadQuestion(nextIndex, updatedState).then(() => {
          isTransitioningRef.current = false;
        });
      }
    }
  };


  const forceSubmitExam = () => {
    isExamActiveRef.current = false;
    isTransitioningRef.current = false;
   
    setTimeout(() => {
      setExamState(prev => {
        const updatedState = { ...prev, status: 'completed' };
        if (FcDB && prev.sessionId) {
          FcDB.set(prev.sessionId, updatedState, 'exam_sessions').catch(e => {});
        }
        return updatedState;
      });
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXAM);
    }, 0);
   
    // Dọn dẹp bộ nhớ AI khi nộp bài sớm (Cách ly ngôn ngữ)
    localStorage.setItem('fc_ai_memory_en', '[]');
    localStorage.setItem('fc_ai_memory_zh', '[]');
    localStorage.removeItem('fc_ai_memory');
    if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
      ExamEngine.clearVolatileMemory();
    }
  };


  const resumeExam = async (sessionId) => {
    isExamActiveRef.current = true;
    isTransitioningRef.current = false;
   
    // [ĐÁNH THỨC AUDIO PHẦN CỨNG] Mở khóa loa khi tiếp tục bài thi
    if (window.fc_audioCtx && window.fc_audioCtx.state === 'suspended') {
      window.fc_audioCtx.resume();
    }
   
    setExamState(prev => ({ ...prev, status: 'loading', preloadCountdown: 30 }));
    setCurrentQuestion(null);
    setExamCooldown(0);
    streakTrackerRef.current = []; // Reset trí nhớ Anti-Streak
   
    try {
      if (FcDB) {
        const savedState = await FcDB.get(sessionId, 'exam_sessions');
        if (savedState && savedState.status !== 'completed') {
          const loadingState = { ...savedState, status: 'loading', isTransitioning: false, preloadCountdown: 30 };
          setExamState(loadingState);
         
          // Phục hồi Con trỏ Blueprint
          currentBlueprintRef.current = savedState.blueprint;
          blueprintIndexRef.current = savedState.currentIndex;
          uiIndexRef.current = savedState.currentIndex;
         
          if (coordinatorRef.current) coordinatorRef.current.destroy();
          if (QueueEngine && QueueEngine.createQueueCoordinator) {
            coordinatorRef.current = QueueEngine.createQueueCoordinator(fetchTask, 4);
          }
         
          // [ĐỒNG HỒ ĐẾM NGƯỢC KHI RESUME]
          let aiConfig = { loadingTime: 22 };
          try {
            const cfg = JSON.parse(localStorage.getItem('fc_ai_config'));
            if (cfg && cfg.loadingTime) aiConfig.loadingTime = cfg.loadingTime;
          } catch(e){}
         
          let countdownInterval;
          try {
            const timeoutPromise = new Promise(resolve => {
              let secondsLeft = aiConfig.loadingTime;
              setExamState(prev => ({ ...prev, preloadCountdown: secondsLeft }));
             
              countdownInterval = setInterval(() => {
                secondsLeft--;
                setExamState(prev => ({ ...prev, preloadCountdown: secondsLeft }));
                if (secondsLeft <= 0) {
                  clearInterval(countdownInterval);
                  resolve('TIMEOUT');
                }
              }, 1000);
            });
           
            const maintainPromise = coordinatorRef.current.maintain(true, aiConfig.loadingTime * 1000);
            await Promise.race([maintainPromise, timeoutPromise]);
          } finally {
            if (countdownInterval) clearInterval(countdownInterval);
          }
         
          const isLoaded = await loadQuestion(savedState.currentIndex, loadingState);
          if (!isExamActiveRef.current) return false;
         
          if (isLoaded && isExamActiveRef.current) {
            setExamState({ ...loadingState, status: 'playing' });
            localStorage.setItem(STORAGE_KEYS.ACTIVE_EXAM, sessionId);
          }
          return isLoaded;
        }
      }
    } catch (e) {
      console.error("[useExamLogic] Resume Exam failed:", e);
    }
   
    if (window.globalShowToast) window.globalShowToast("Không thể khôi phục phiên thi. Phiên đã bị lỗi hoặc hết hạn.", "error");
    setExamState(prev => ({ ...prev, status: 'error' }));
    isExamActiveRef.current = false;
    return false;
  };


  const quitExam = () => {
    isExamActiveRef.current = false;
    isTransitioningRef.current = false;
    setExamState({ status: 'idle', sessionId: null, profile: null, blueprint: [], currentIndex: 0, answers: [], timeRemaining: 0, score: 0, isTransitioning: false, preloadCountdown: 30 });
    setCurrentQuestion(null);
    setExamCooldown(0);
    streakTrackerRef.current = []; // Reset trí nhớ
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXAM);
   
    if (coordinatorRef.current) coordinatorRef.current.destroy();
    setCachedCount(0);
   
    // Dọn dẹp bộ nhớ AI khi thoát ngang (Cách ly ngôn ngữ)
    localStorage.setItem('fc_ai_memory_en', '[]');
    localStorage.setItem('fc_ai_memory_zh', '[]');
    localStorage.removeItem('fc_ai_memory');
    if (ExamEngine && typeof ExamEngine.clearVolatileMemory === 'function') {
      ExamEngine.clearVolatileMemory();
    }
  };


  // ------------------------------------------------------------------------
  // 5. ĐỘNG CƠ XUẤT BÁO CÁO EXCEL (EXPORT EXPORT)
  // ------------------------------------------------------------------------
  const exportExamToExcel = React.useCallback(() => {
    if (!XLSX) {
      if (window.globalShowToast) window.globalShowToast("Thư viện Excel chưa sẵn sàng!", "error");
      return;
    }
    const answersList = examState.answers || [];
    if (answersList.length === 0) {
      if (window.globalShowToast) window.globalShowToast("Chưa có dữ liệu bài làm để xuất!", "warning");
      return;
    }
   
    const excelData = answersList.map((ans, idx) => {
      const meta = ans.questionMetadata || {};
      const content = ans.questionContent || {};
      const type = meta.type || 'unknown';
      const isCorrect = ans.isCorrect;
      const userAns = ans.answer;
     
      let questionText = "Dữ liệu câu hỏi bị khuyết";
      let correctText = "";
      let userText = "";
      let explanation = content.explanation || content.analysis || "";
     
      // Phục hồi dữ liệu từ Lightweight DTO (Skeleton Save)
      if (content._isLightweight) {
        questionText = content.term || "Câu hỏi";
        correctText = content.definition || "Đáp án đúng";
        userText = typeof userAns === 'object' ? (userAns.text || JSON.stringify(userAns)) : String(userAns);
      } else {
        // Phân tích dữ liệu gốc phức hợp theo từng dạng bài
        if (type.includes('multiple_choice') || type.includes('mcq') || type.includes('tfng') || type.includes('pronunciation') || type.includes('image_quiz') || type.includes('match') || type.includes('listening')) {
          questionText = (content.term || content.questionText || "Câu hỏi trắc nghiệm").replace(/\*/g, '');
          const correctOpt = content.options?.find(o => o.isCorrect);
          correctText = correctOpt ? correctOpt.text.replace(/\*/g, '') : (content.correctAnswer || content.definition || "Không rõ đáp án");
          userText = typeof userAns === 'object' ? (userAns.text?.replace(/\*/g, '') || "Đã chọn") : String(userAns || "Bỏ qua").replace(/\*/g, '');
        } else if (type.includes('fill_blank')) {
          questionText = content.displaySentence ? content.displaySentence.replace(/\[__________\]/g, ' [___] ') : (content.term || "Câu điền từ");
          correctText = content.targetWord || content.correctAnswer || content.definition || "Không rõ đáp án";
          userText = (typeof userAns === 'string' && userAns.trim() !== '') ? userAns : "Bỏ qua";
          explanation = content.hint || explanation;
        } else if (type.includes('spot_mistake')) {
          questionText = content.wrongSentence || content.term || "Câu tìm lỗi sai";
          correctText = content.correction ? `Sửa: ${content.wrongWord} ➔ ${content.correction}` : (content.definition || "Không rõ đáp án");
          if (userAns && userAns.correction) { userText = `Sửa thành: ${userAns.correction}`; }
          else if (userAns && userAns.selectedWord) { userText = `Chọn sai ở: ${userAns.selectedWord}`; }
          else { userText = "Bỏ qua"; }
        } else if (type.includes('scramble')) {
          questionText = content.definition ? `Ý nghĩa: ${content.definition}` : "Câu ghép từ";
          correctText = content.term || "Không rõ đáp án";
          userText = (typeof userAns === 'string' && userAns.trim() !== '') ? userAns : "Bỏ qua";
        } else if (type.includes('odd_one_out')) {
          questionText = Array.isArray(content.words) ? content.words.join(' • ') : (content.words || "Nhóm từ khác loại");
          correctText = content.oddWord || content.definition || "Không rõ đáp án";
          userText = (typeof userAns === 'string' && userAns.trim() !== '') ? userAns : "Bỏ qua";
        }
      }
     
      // Lách màng lọc
      const rowData = {};
      rowData["STT"] = ans.index !== undefined ? ans.index + 1 : idx + 1;
      rowData["Kỹ năng / Chặng"] = meta.chapter || meta.phase || "Chung";
      rowData["Câu hỏi"] = questionText;
      rowData["Đáp án bạn chọn"] = userText;
      rowData["Đáp án đúng"] = correctText;
      rowData["Trạng thái"] = isCorrect ? "Đúng" : "Sai";
      rowData["Phân tích / Giải thích"] = explanation;
      return rowData;
    });
   
    const ws = XLSX.utils.json_to_sheet(excelData);
    ws['!cols'] = [ {wch: 5}, {wch: 25}, {wch: 45}, {wch: 20}, {wch: 20}, {wch: 10}, {wch: 50} ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ChiTietBaiThi");
   
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `Chi_Tiet_Bai_Thi_${dateStr}.xlsx`);
   
    if (window.globalShowToast) window.globalShowToast("Đã tải xuống file Excel!", "success");
  }, [examState.answers]);


  return {
    examState, currentQuestion, isHydrating, cachedCount, examCooldown,
    startExam, resumeExam, submitAnswer, forceSubmitExam, quitExam, setTransitionState,
    exportExamToExcel
  };
};

