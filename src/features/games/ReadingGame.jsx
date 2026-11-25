// ============================================================================
// FILE 71/85: src/features/games/ReadingGame.jsx
// NGUỒN GỐC: tang_5.js (Sheet 5.24 - Reading Logic & Wrapper V1.08)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 25/11/2026 - 22:10 (GMT+7)
// NHIỆM VỤ: Động cơ điều khiển trò chơi Thám Tử Đọc Hiểu (useReadingLogic &
//           ReadingGame). Vận hành kiến trúc "Tổ kén" (1 đoạn văn lớn - nhiều
//           câu hỏi con), đồng hồ canh giờ tổng và thu hoạch dữ liệu AI.
//           Nâng cấp Ver 1.0:
//           1. Đồng bộ 100% API với QueueEngine (maintain, pop, getPendingItems,
//              destroy) & miễn nhiễm _triggerZombieKiller dưới React 18 StrictMode.
//           2. Sửa đúng chữ ký 3 tham số ExamEngine.hydrateQuestion(meta, apiKey,
//              history) với resolveActiveApiKey 4 tầng & bóc chuẩn Schema Tổ kén.
//           3. Sửa đúng chữ ký 3 tham số pullRetryCardWithLock('reading', bag, lang).
//           4. Ổn định hóa fetchTask & memoize mergedConfig diệt vòng lặp hủy/tạo
//              QueueCoordinator mỗi giây.
//           5. Tách side-effect handlePassageTimeUp ra khỏi setTimeLeft updater
//              (chuẩn React 18 StrictMode), thay toàn bộ setTimeout trần bằng
//              safeSetTimeout & bổ sung chống cày điểm needsNextOnResume.
//           6. Bổ sung handleNext, fallback onBookmark, gỡ khóa oan Phanh AI giữa
//              các câu con nội bộ, chuẩn hóa 12 cột & sạch 0 Problems tsc / Radar.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { QueueEngine } from '@/engines/queueEngine';
import { ExamEngine } from '@/engines/exam';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { ReadingSetup, ReadingPlayScreen } from './ReadingUI';
import {
  getSafeLevelString,
  resolveActiveApiKey,
  getConfiguredUiCooldown
} from './common/gameHelpers';

// ============================================================================
// TIỆN ÍCH NỘI BỘ (CHUẨN HÓA DỮ LIỆU, TỔ KÉN & PHÒNG THỦ STRICTMODE)
// ============================================================================
const normalizeNfcKey = (val) =>
  String(val || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Đọc an toàn thời gian chờ đọc giải thích từ fc_mock_delay (chống NaN)
const readSafeMockDelay = () => {
  try {
    if (typeof localStorage === 'undefined') return 4;
    const raw = localStorage.getItem('fc_mock_delay');
    if (raw === null || raw === '') return 4;
    let parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      parsed = Number(JSON.parse(raw));
    }
    if (!Number.isFinite(parsed) || parsed < 0) return 4;
    return Math.min(30, Math.floor(parsed));
  } catch {
    return 4;
  }
};

// Đọc an toàn tham số thời gian chờ AI từ fc_ai_config
const readSafeAiTimings = () => {
  const aiConfig = Utils.safeJsonParse('fc_ai_config', {});
  const rawInit = Number(aiConfig?.loadingTime ?? aiConfig?.initWait);
  const initWait =
    Number.isFinite(rawInit) && rawInit >= 0
      ? Math.min(60, Math.floor(rawInit))
      : 22;

  const rawCooldown =
    typeof getConfiguredUiCooldown === 'function'
      ? Number(getConfiguredUiCooldown())
      : Number(aiConfig?.uiCooldown);
  const uiCooldown =
    Number.isFinite(rawCooldown) && rawCooldown >= 0
      ? Math.min(60, Math.floor(rawCooldown))
      : 9;

  return { initWait, uiCooldown };
};

// Chuẩn hóa Tổ kén Đọc Hiểu từ mọi nguồn (ExamEngine / FallbackDataEngine / RetryBag)
const normalizeReadingCocoon = (raw, overrides = {}) => {
  if (!raw || typeof raw !== 'object') return null;

  const src =
    raw.content && typeof raw.content === 'object'
      ? raw.content
      : raw.passageData && typeof raw.passageData === 'object'
      ? raw.passageData
      : raw;

  const passage = String(src.passage || src.text || '').trim();
  const rawList = Array.isArray(src.questions)
    ? src.questions
    : Array.isArray(src.subQuestions)
    ? src.subQuestions
    : [];

  if (!passage || rawList.length === 0) return null;

  const questions = rawList
    .map((sq) => {
      if (!sq || typeof sq !== 'object') return null;
      const rawType = String(sq.type || sq.subType || 'mcq')
        .toLowerCase()
        .trim();

      let type = 'mcq';
      if (rawType.includes('fill')) {
        type = 'fill_blank';
      } else if (rawType.includes('tfng') || rawType.includes('true_false')) {
        type = 'tfng';
      }

      const questionText = String(
        sq.questionText || sq.question || sq.displaySentence || sq.term || ''
      ).trim();
      const correctAnswer = String(
        sq.correctAnswer || sq.answer || sq.targetWord || ''
      ).trim();

      if (!questionText || !correctAnswer) return null;

      let options = [];
      if (type === 'tfng') {
        options = ['True', 'False', 'Not Given'];
      } else if (Array.isArray(sq.options) && sq.options.length > 0) {
        options = sq.options
          .map((opt) =>
            typeof opt === 'object' && opt !== null
              ? String(opt.text || opt.term || '').trim()
              : String(opt || '').trim()
          )
          .filter(Boolean);
      }

      if (type === 'mcq' && options.length < 2) {
        return null;
      }

      return {
        type,
        questionText,
        options,
        correctAnswer,
        explanation: String(sq.explanation || sq.analysis || '').trim()
      };
    })
    .filter(Boolean);

  if (questions.length === 0) return null;

  const isRescued =
    overrides._isRescued !== undefined
      ? Boolean(overrides._isRescued)
      : Boolean(src._isRescued || src._isFallback || raw._isRescued);

  const isAiGenerated =
    overrides.isAiGenerated !== undefined
      ? Boolean(overrides.isAiGenerated)
      : src.isAiGenerated !== undefined
      ? Boolean(src.isAiGenerated)
      : !isRescued;

  return {
    title: String(src.title || '').trim(),
    passage,
    questions,
    isAiGenerated,
    _isRescued: isRescued
  };
};

// Kiểm tra cờ _triggerZombieKiller của QueueEngine (tránh xung đột StrictMode double-mount)
const isZombieKillerActive = () =>
  typeof globalThis !== 'undefined' &&
  Boolean(/** @type {any} */ (globalThis).__zombieKillerActive);

const delayMsSafe = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// 1. CUSTOM HOOK: ĐỘNG CƠ LOGIC ĐỌC HIỂU (useReadingLogic)
// ============================================================================
export const useReadingLogic = ({
  config = undefined,
  apiKey = '',
  onBack = undefined,
  onAutoSave = undefined,
  savedState = undefined,
  onSaveToNotebook = undefined,
  onBookmark = undefined,
  notebook = undefined,
  showToast = undefined,
  onLogWrong = undefined,
  globalRetryBag = undefined,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined,
  onSaveToHarvest = undefined
} = {}) => {
  const { initWait: configuredInitWait, uiCooldown: configuredCooldown } =
    useMemo(() => readSafeAiTimings(), []);

  // Phục hồi an toàn phiên đang dở + Chống cày điểm vô hạn (needsNextOnResume)
  const initialResumePlan = useMemo(() => {
    const rs = savedState?.readingState;
    const restoredPassage = normalizeReadingCocoon(rs?.passageData);
    if (!restoredPassage) {
      return {
        hasSavedPassage: false,
        passageData: null,
        subIndex: 0,
        playedCount: rs?.playedCount || 0
      };
    }

    const savedSubIdx = Math.max(0, Number(rs?.subIndex) || 0);
    const needsNext = Boolean(rs?.needsNextOnResume);

    if (needsNext) {
      if (savedSubIdx + 1 < restoredPassage.questions.length) {
        return {
          hasSavedPassage: true,
          passageData: restoredPassage,
          subIndex: savedSubIdx + 1,
          playedCount: rs?.playedCount || 0
        };
      }
      // Câu cuối của đoạn văn đã chấm xong trước khi thoát -> Nạp đoạn văn mới
      return {
        hasSavedPassage: false,
        passageData: null,
        subIndex: 0,
        playedCount: (rs?.playedCount || 0) + 1
      };
    }

    return {
      hasSavedPassage: true,
      passageData: restoredPassage,
      subIndex: Math.min(savedSubIdx, restoredPassage.questions.length - 1),
      playedCount: rs?.playedCount || 0
    };
  }, [savedState]);

  const hasSavedPassage = initialResumePlan.hasSavedPassage;
  const saveNotebookFn = onSaveToNotebook || onBookmark;

  // State quản lý Tổ kén (Đoạn văn & Danh sách câu hỏi con)
  const [passageData, setPassageData] = useState(
    /** @type {any} */ (() => initialResumePlan.passageData)
  );
  const [subIndex, setSubIndex] = useState(() => initialResumePlan.subIndex);

  // State tương tác của câu hỏi con hiện tại
  const [inputBuffer, setInputBuffer] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(
    /** @type {number | null} */ (null)
  );
  const [checkStatus, setCheckStatus] = useState('idle'); // 'idle' | 'wrong_retry' | 'correct' | 'failed'
  const [attempts, setAttempts] = useState(0);

  // State thống kê & Thời gian
  const [score, setScore] = useState(() => savedState?.score || 0);
  const [combo, setCombo] = useState(() => savedState?.readingState?.combo || 1);
  const [playedCount, setPlayedCount] = useState(
    () => initialResumePlan.playedCount
  );
  const [time, setTime] = useState(() => savedState?.time || 0);
  const [timeLeft, setTimeLeft] = useState(() =>
    hasSavedPassage && savedState?.readingState?.timeLeft !== undefined
      ? Math.max(0, Number(savedState.readingState.timeLeft) || 0)
      : Number(config?.timeLimit) || 300
  );
  const [isFinished, setIsFinished] = useState(false);

  // State điều phối Hàng đợi AI
  const [isGenerating, setIsGenerating] = useState(() => !hasSavedPassage);
  const [aiCountdown, setAiCountdown] = useState(() =>
    !hasSavedPassage ? configuredInitWait : 0
  );
  const [queueLength, setQueueLength] = useState(0);
  const [correctCount, setCorrectCount] = useState(
    () => savedState?.readingState?.correctCount || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => savedState?.readingState?.wrongCount || 0
  );

  // State đếm ngược chuyển câu & Phanh AI
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [aiWaitTime, setAiWaitTime] = useState(0);

  // Refs quản lý bất đồng bộ & ổn định hóa dependencies (diệt vòng lặp hủy/tạo Coordinator)
  const queueCoordinatorRef = useRef(/** @type {any} */ (null));
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const timeUpHandledRef = useRef(false);
  const typeInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const seenSignaturesRef = useRef(/** @type {Set<string>} */ (new Set()));
  const latestStateRef = useRef(/** @type {Record<string, any>} */ ({}));
  const timeoutIdsRef = useRef(
    /** @type {ReturnType<typeof setTimeout>[]} */ ([])
  );

  const configRef = useRef(config);
  const apiKeyRef = useRef(apiKey);
  const retryBagRef = useRef(globalRetryBag);
  const removeRetryRef = useRef(removeFromRetryBag);
  const addRetryRef = useRef(addToRetryBag);
  const harvestRef = useRef(onSaveToHarvest);
  const toastRef = useRef(showToast);

  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  useEffect(() => {
    retryBagRef.current = globalRetryBag;
  }, [globalRetryBag]);
  useEffect(() => {
    removeRetryRef.current = removeFromRetryBag;
  }, [removeFromRetryBag]);
  useEffect(() => {
    addRetryRef.current = addToRetryBag;
  }, [addToRetryBag]);
  useEffect(() => {
    harvestRef.current = onSaveToHarvest;
  }, [onSaveToHarvest]);
  useEffect(() => {
    toastRef.current = showToast;
  }, [showToast]);

  const notifyToast = useCallback((msg, type = 'info') => {
    const fn = toastRef.current;
    if (typeof fn === 'function') {
      fn(msg, type);
    }
  }, []);

  const safeSetTimeout = useCallback((fn, delay) => {
    const id = setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((t) => t !== id);
      if (isMountedRef.current) fn();
    }, delay);
    timeoutIdsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach(clearTimeout);
    timeoutIdsRef.current = [];
  }, []);

  // Trích xuất câu hỏi con hiện tại từ Tổ kén
  const currentSubQuestion = useMemo(() => {
    return passageData && Array.isArray(passageData.questions)
      ? passageData.questions[subIndex] || null
      : null;
  }, [passageData, subIndex]);

  const totalSubQuestions = useMemo(() => {
    return passageData && Array.isArray(passageData.questions)
      ? passageData.questions.length
      : 0;
  }, [passageData]);

  const isLastSubQuestion =
    totalSubQuestions > 0 && subIndex >= totalSubQuestions - 1;

  // Kiểm tra trạng thái đã lưu Sổ tay chuẩn Unicode NFC (hỗ trợ cả MCQ/FillBlank lẫn TFNG)
  const isBookmarked = useMemo(() => {
    if (!currentSubQuestion || !Array.isArray(notebook)) return false;
    const isTfng = currentSubQuestion.type === 'tfng';
    const primaryTarget = normalizeNfcKey(currentSubQuestion.correctAnswer);
    const tfngTarget = isTfng
      ? normalizeNfcKey(
          `[TFNG] ${currentSubQuestion.questionText || ''} (${
            currentSubQuestion.correctAnswer || ''
          })`
        )
      : '';

    return notebook.some((item) => {
      const itemKey = normalizeNfcKey(item?.term);
      if (!itemKey) return false;
      return itemKey === primaryTarget || (Boolean(tfngTarget) && itemKey === tfngTarget);
    });
  }, [currentSubQuestion, notebook]);

  // Đồng bộ chỉ số băng đạn AI thật từ QueueCoordinator
  const syncQueueLength = useCallback((coordinator) => {
    if (!isMountedRef.current || !coordinator) return;
    const pending =
      typeof coordinator.getPendingItems === 'function'
        ? coordinator.getPendingItems()
        : Array.isArray(coordinator.queue)
        ? coordinator.queue
        : [];
    const realAiCount = pending.filter(
      (item) =>
        item &&
        item.passageData &&
        !item.passageData._isRescued &&
        item.passageData.isAiGenerated
    ).length;
    setQueueLength(realAiCount);
  }, []);

  // Dựng tổ kén dự phòng ngoại tuyến 0ms khi mất mạng hoặc cạn API Key
  const buildEmergencyCocoon = useCallback(() => {
    const activeCfg = configRef.current || {};
    const activeLang = activeCfg.lang === 'zh' ? 'zh' : 'en';
    const activeLevel =
      activeCfg.level || (activeLang === 'zh' ? 'zh_level_4' : 'en_level_8');

    if (
      FallbackDataEngine &&
      typeof FallbackDataEngine.getGameReadyFallback === 'function'
    ) {
      try {
        const fbRaw = FallbackDataEngine.getGameReadyFallback(
          'reading',
          activeLang,
          activeLevel
        );
        const normalized = normalizeReadingCocoon(fbRaw, {
          isAiGenerated: false,
          _isRescued: true
        });
        if (normalized) return { passageData: normalized };
      } catch (e) {
        console.warn('[Reading] FallbackDataEngine warning:', e);
      }
    }

    if (ExamEngine && typeof ExamEngine.getEmergencyFallback === 'function') {
      try {
        const emRaw = ExamEngine.getEmergencyFallback({
          type: 'reading',
          mode: 'minigame',
          lang: activeLang,
          level: activeLevel
        });
        const normalized = normalizeReadingCocoon(emRaw, {
          isAiGenerated: false,
          _isRescued: true
        });
        if (normalized) return { passageData: normalized };
      } catch (e) {
        console.warn('[Reading] ExamEngine.getEmergencyFallback warning:', e);
      }
    }

    return null;
  }, []);

  // Đồng hồ đếm ngược chờ AI khởi tạo lần đầu
  useEffect(() => {
    if (!isGenerating || aiCountdown <= 0) return undefined;
    const timer = setInterval(() => {
      setAiCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isGenerating, aiCountdown]);

  // Đồng hồ đếm ngược Phanh AI (Cooldown)
  useEffect(() => {
    if (aiWaitTime <= 0) return undefined;
    const timer = setInterval(() => {
      setAiWaitTime((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [aiWaitTime]);

  // ==========================================================================
  // HÀM NẠP ĐẠN TỔ KÉN ĐỌC HIỂU (FETCH TASK — ỔN ĐỊNH 100% QUA REFS)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    const activeCfg = configRef.current || {};
    const activeLang = activeCfg.lang === 'zh' ? 'zh' : 'en';
    const activeLevel =
      activeCfg.level || (activeLang === 'zh' ? 'zh_level_4' : 'en_level_8');
    const activeTopic = activeCfg.topic || 'general';
    const currentRetryBag = retryBagRef.current;

    // 1. Ưu tiên bốc từ Túi nháp lỗi sai (Xác suất 30%) theo ĐÚNG chữ ký db.js Ver 1.1
    if (
      currentRetryBag &&
      Array.isArray(currentRetryBag.reading) &&
      currentRetryBag.reading.length > 0 &&
      Math.random() < 0.3
    ) {
      try {
        const retryItem = await pullRetryCardWithLock(
          'reading',
          currentRetryBag,
          activeLang
        );
        const normalizedRetry = normalizeReadingCocoon(retryItem);
        if (normalizedRetry) {
          const sig = normalizedRetry.passage.substring(0, 40);
          if (sig && !seenSignaturesRef.current.has(sig)) {
            seenSignaturesRef.current.add(sig);
            if (typeof removeRetryRef.current === 'function') {
              removeRetryRef.current('reading', sig, retryItem);
            }
            return {
              passageData: normalizedRetry,
              isRetry: true
            };
          }
        }
      } catch (e) {
        console.warn('[Reading] Pull retry bag warning:', e);
      }
    }

    // 2. Gọi ExamEngine đúc Tổ kén Đọc hiểu mới (Đúng 3 tham số + Miễn nhiễm StrictMode ZombieKiller)
    if (ExamEngine && typeof ExamEngine.hydrateQuestion === 'function') {
      const invokeHydrate = async () => {
        if (isZombieKillerActive()) {
          await delayMsSafe(1650);
          if (!isMountedRef.current) {
            throw new DOMException('Unmounted while waiting for reset', 'AbortError');
          }
        }

        const activeApiKey =
          typeof resolveActiveApiKey === 'function'
            ? resolveActiveApiKey(apiKeyRef.current)
            : apiKeyRef.current || '';

        if (!activeApiKey) {
          throw new Error('Missing API Key for Reading');
        }

        const freshHistory =
          AiMemoryManager && typeof AiMemoryManager.get === 'function'
            ? AiMemoryManager.get()
            : [];

        const metadata = {
          id: `reading_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'reading',
          mode: 'minigame',
          lang: activeLang,
          level: activeLevel,
          topic: activeTopic
        };

        return ExamEngine.hydrateQuestion(metadata, activeApiKey, freshHistory);
      };

      try {
        let hydrated = null;
        try {
          hydrated = await invokeHydrate();
        } catch (firstErr) {
          // Tự cứu 1 nhịp nếu bị StrictMode _triggerZombieKiller cắt ngang khi component vẫn đang mở
          if (
            firstErr?.name === 'AbortError' &&
            isMountedRef.current &&
            queueCoordinatorRef.current?.isActive
          ) {
            await delayMsSafe(1650);
            if (isMountedRef.current && queueCoordinatorRef.current?.isActive) {
              hydrated = await invokeHydrate();
            } else {
              throw firstErr;
            }
          } else {
            throw firstErr;
          }
        }

        const normalized = normalizeReadingCocoon(hydrated);
        if (normalized) {
          // Tự động thu hoạch Tổ kén vào Kho AI (Chuẩn 12 cột)
          if (
            typeof harvestRef.current === 'function' &&
            normalized.isAiGenerated &&
            !normalized._isRescued
          ) {
            const subQStr = normalized.questions
              .map(
                (sq, idx) =>
                  `Q${idx + 1}: ${sq.questionText} (Ans: ${sq.correctAnswer})`
              )
              .join(' | ');
            const safeHarvestLevel = getSafeLevelString(
              activeLevel,
              activeLang === 'zh' ? 'zh_level_4' : 'en_level_4'
            );
            const snippetTitle =
              normalized.title || `${normalized.passage.substring(0, 60)}...`;

            harvestRef.current({
              term: `[Reading] ${snippetTitle}`,
              definition: subQStr,
              meaning: subQStr,
              analysis: normalized.passage.substring(0, 300),
              note: 'Trò chơi: Đọc Hiểu (Tổ kén)',
              level: safeHarvestLevel,
              language: activeLang,
              lang: activeLang
            });
          }

          const sig = normalized.passage.substring(0, 40);
          if (sig) seenSignaturesRef.current.add(sig);

          return { passageData: normalized };
        }
      } catch (e) {
        if (e?.name === 'AbortError' && !isMountedRef.current) {
          throw e;
        }
        console.warn('[Reading] ExamEngine hydrate failed, falling back:', e?.message || e);
      }
    }

    // 3. Cứu hộ khẩn cấp từ FallbackDataEngine / ExamEngine nếu đứt mạng hoặc cạn Key
    const fallbackCocoon = buildEmergencyCocoon();
    if (fallbackCocoon) {
      return fallbackCocoon;
    }

    throw new Error('Không thể tạo đoạn văn Đọc hiểu.');
  }, [buildEmergencyCocoon]);

  // ==========================================================================
  // CHUYỂN SANG TỔ KÉN (ĐOẠN VĂN) TIẾP THEO
  // ==========================================================================
  const loadNextPassage = useCallback(
    async (isFirst = false) => {
      const coordinator = queueCoordinatorRef.current;
      if (!coordinator) return;

      clearAllTimeouts();
      setIsGenerating(true);

      if (isFirst) {
        setAiCountdown(configuredInitWait);
      } else {
        setAiCountdown(0);
      }

      try {
        // Nếu hàng đợi chưa có đạn, gọi maintain() theo chuẩn QueueEngine
        if (typeof coordinator.length === 'function' && coordinator.length() === 0) {
          const waitTimeout = isFirst
            ? Math.max(25000, configuredInitWait * 1000)
            : 20000;
          await coordinator.maintain(isFirst, waitTimeout, !isFirst);
        }

        if (!isMountedRef.current) return;

        let nextData =
          typeof coordinator.pop === 'function' ? coordinator.pop() : null;
        syncQueueLength(coordinator);

        // Chốt chặn cứu hộ trực tiếp nếu hàng đợi cạn sạch
        if (!nextData || !nextData.passageData) {
          nextData = buildEmergencyCocoon();
        }

        if (!isMountedRef.current) return;

        if (!nextData || !nextData.passageData) {
          if (isFirst) {
            notifyToast(
              'Hệ thống AI đang quá tải! Vui lòng kiểm tra API Key hoặc mạng.',
              'error'
            );
            setPassageData(null);
          } else {
            setIsFinished(true);
          }
        } else {
          setPassageData(nextData.passageData);
          setSubIndex(0);
          setCheckStatus('idle');
          setSelectedOptionIndex(null);
          setInputBuffer('');
          setAttempts(0);
          setResultTimer(0);
          setIsResultPaused(false);
          isSubmittingRef.current = false;
          timeUpHandledRef.current = false;

          // Reset đồng hồ tổng cho đoạn văn mới
          const nextLimit = Number(configRef.current?.timeLimit) || 300;
          setTimeLeft(nextLimit);

          // Kích hoạt Phanh AI làm nguội giao diện (chỉ chặn chuyển tổ kén, không khóa câu con)
          setAiWaitTime(configuredCooldown);

          // Tự động focus ô nhập nếu câu đầu tiên là Điền từ
          if (nextData.passageData.questions?.[0]?.type === 'fill_blank') {
            safeSetTimeout(() => {
              if (typeInputRef.current) typeInputRef.current.focus();
            }, 100);
          }
        }
      } catch (err) {
        console.error('[Reading] Load passage error:', err);
        if (!isMountedRef.current) return;
        const rescue = buildEmergencyCocoon();
        if (rescue && rescue.passageData) {
          setPassageData(rescue.passageData);
          setSubIndex(0);
          setCheckStatus('idle');
          setSelectedOptionIndex(null);
          setInputBuffer('');
          setAttempts(0);
          isSubmittingRef.current = false;
          timeUpHandledRef.current = false;
          setTimeLeft(Number(configRef.current?.timeLimit) || 300);
          setAiWaitTime(configuredCooldown);
        } else {
          notifyToast('Hệ thống AI đang quá tải! Vui lòng thử lại sau.', 'error');
          setPassageData(null);
        }
      } finally {
        if (isMountedRef.current) {
          setIsGenerating(false);
        }
      }
    },
    [
      configuredCooldown,
      configuredInitWait,
      clearAllTimeouts,
      safeSetTimeout,
      syncQueueLength,
      buildEmergencyCocoon,
      notifyToast
    ]
  );

  // Khởi tạo QueueCoordinator đúng 1 lần khi vào màn chơi (chống vòng lặp vô hạn)
  useEffect(() => {
    isMountedRef.current = true;

    // Tổ kén có dung lượng lớn nên ưu tiên mặc định trữ sẵn 1 tổ kén dự phòng
    const coordinator = QueueEngine.createQueueCoordinator(fetchTask, 1);
    queueCoordinatorRef.current = coordinator;

    // Polling nhẹ 500ms cập nhật chỉ số băng đạn AI thật trên HUD
    const pollId = setInterval(() => {
      syncQueueLength(coordinator);
    }, 500);

    if (hasSavedPassage) {
      coordinator.maintain(false, 25000, true);
    } else {
      loadNextPassage(true);
    }

    return () => {
      isMountedRef.current = false;
      clearInterval(pollId);
      clearAllTimeouts();
      if (queueCoordinatorRef.current === coordinator) {
        queueCoordinatorRef.current = null;
      }
      if (typeof coordinator.destroy === 'function') {
        coordinator.destroy();
      }
    };
  }, [
    fetchTask,
    hasSavedPassage,
    loadNextPassage,
    clearAllTimeouts,
    syncQueueLength
  ]);

  // ==========================================================================
  // CHUYỂN CÂU HỎI CON HOẶC SANG ĐOẠN VĂN MỚI (NEXT ROUND / HANDLE NEXT)
  // ==========================================================================
  const nextRound = useCallback(() => {
    if (isGenerating) return;
    if (isLastSubQuestion && aiWaitTime > 0) return;

    clearAllTimeouts();
    setResultTimer(0);
    setIsResultPaused(false);

    if (subIndex + 1 < totalSubQuestions) {
      const nextIdx = subIndex + 1;
      setSubIndex(nextIdx);
      setCheckStatus('idle');
      setSelectedOptionIndex(null);
      setInputBuffer('');
      setAttempts(0);
      isSubmittingRef.current = false;

      if (passageData?.questions?.[nextIdx]?.type === 'fill_blank') {
        safeSetTimeout(() => {
          if (typeInputRef.current) typeInputRef.current.focus();
        }, 100);
      }
    } else {
      setPlayedCount((c) => c + 1);
      loadNextPassage(false);
    }
  }, [
    isGenerating,
    isLastSubQuestion,
    aiWaitTime,
    subIndex,
    totalSubQuestions,
    passageData,
    loadNextPassage,
    clearAllTimeouts,
    safeSetTimeout
  ]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((prev) => !prev);
  }, []);

  // Tự động đếm ngược chuyển câu sau khi hiện giải thích (an toàn NaN)
  useEffect(() => {
    if (checkStatus === 'correct' || checkStatus === 'failed') {
      setResultTimer(readSafeMockDelay());
      setIsResultPaused(false);
    }
  }, [checkStatus]);

  useEffect(() => {
    if (
      (checkStatus !== 'correct' && checkStatus !== 'failed') ||
      isResultPaused ||
      timeUpHandledRef.current
    ) {
      return undefined;
    }

    if (resultTimer > 0) {
      const timer = setTimeout(() => setResultTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }

    // Chỉ chờ Phanh AI (aiWaitTime) ở câu cuối cùng trước khi chuyển sang đoạn văn mới
    if (resultTimer === 0 && !isGenerating && (!isLastSubQuestion || aiWaitTime <= 0)) {
      nextRound();
    }
    return undefined;
  }, [
    checkStatus,
    isResultPaused,
    resultTimer,
    aiWaitTime,
    isGenerating,
    isLastSubQuestion,
    nextRound
  ]);

  // Xử lý khi hết giờ đọc cả đoạn văn (tách hoàn toàn khỏi state updater)
  const handlePassageTimeUp = useCallback(() => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    clearAllTimeouts();

    const remainingQuestions = Math.max(1, totalSubQuestions - subIndex);
    setWrongCount((w) => w + remainingQuestions);
    setCombo(1);
    setCheckStatus('failed');

    const activeLang = configRef.current?.lang === 'zh' ? 'zh' : 'en';
    if (typeof onLogWrong === 'function' && currentSubQuestion) {
      const def = currentSubQuestion.questionText || 'Hết giờ đọc bài';
      onLogWrong({
        id: `reading_timeout_${Date.now()}`,
        term: currentSubQuestion.correctAnswer || 'Reading Timeout',
        definition: def,
        meaning: def,
        example: currentSubQuestion.questionText || '',
        analysis: currentSubQuestion.explanation || '',
        language: activeLang
      });
    }

    if (typeof addRetryRef.current === 'function' && passageData) {
      addRetryRef.current('reading', { passageData });
    }

    notifyToast('Hết giờ đọc bài! Đang chuyển sang đoạn văn mới...', 'error');

    safeSetTimeout(() => {
      if (isMountedRef.current) {
        setPlayedCount((c) => c + 1);
        loadNextPassage(false);
      }
    }, 3000);
  }, [
    totalSubQuestions,
    subIndex,
    currentSubQuestion,
    passageData,
    onLogWrong,
    notifyToast,
    loadNextPassage,
    clearAllTimeouts,
    safeSetTimeout
  ]);

  // Đồng hồ đếm thời gian tổng của Đoạn văn (100% Pure Updater chuẩn StrictMode)
  useEffect(() => {
    if (isFinished || !passageData || isGenerating) return undefined;

    const timer = setInterval(() => {
      setTime((t) => t + 1);
      if (config?.timerMode) {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isFinished, passageData, isGenerating, config?.timerMode]);

  // Phản ứng hết giờ tách riêng trong useEffect (0 side-effect trong setTimeLeft)
  useEffect(() => {
    if (
      config?.timerMode &&
      !isFinished &&
      passageData &&
      !isGenerating &&
      timeLeft === 0 &&
      !timeUpHandledRef.current
    ) {
      timeUpHandledRef.current = true;
      handlePassageTimeUp();
    }
  }, [
    config?.timerMode,
    isFinished,
    passageData,
    isGenerating,
    timeLeft,
    handlePassageTimeUp
  ]);

  // ==========================================================================
  // XỬ LÝ CHẤM ĐIỂM CÂU HỎI CON (TRẮC NGHIỆM / TFNG / ĐIỀN TỪ)
  // ==========================================================================
  const handleSuccess = useCallback(() => {
    clearAllTimeouts();
    setCheckStatus('correct');
    setCorrectCount((c) => c + 1);
    setScore((s) => s + 15 * combo);
    setCombo((c) => c + 1);
    safeSetTimeout(() => {
      isSubmittingRef.current = false;
    }, 200);
  }, [combo, clearAllTimeouts, safeSetTimeout]);

  const handleFailure = useCallback(() => {
    clearAllTimeouts();
    setCheckStatus('failed');
    setWrongCount((w) => w + 1);
    setCombo(1);

    const activeLang = configRef.current?.lang === 'zh' ? 'zh' : 'en';
    if (typeof onLogWrong === 'function' && currentSubQuestion) {
      const def = `${currentSubQuestion.questionText || ''} -> Giải thích: ${
        currentSubQuestion.explanation || ''
      }`;
      onLogWrong({
        id: `reading_${Date.now()}_${subIndex}`,
        term:
          currentSubQuestion.type === 'tfng'
            ? `[TFNG] ${currentSubQuestion.questionText || ''} (${
                currentSubQuestion.correctAnswer || ''
              })`
            : currentSubQuestion.correctAnswer || 'Reading',
        definition: def,
        meaning: def,
        example: currentSubQuestion.questionText || '',
        analysis: currentSubQuestion.explanation || '',
        language: activeLang
      });
    }

    if (typeof addRetryRef.current === 'function' && passageData) {
      addRetryRef.current('reading', { passageData });
    }

    safeSetTimeout(() => {
      isSubmittingRef.current = false;
    }, 200);
  }, [
    currentSubQuestion,
    subIndex,
    passageData,
    onLogWrong,
    clearAllTimeouts,
    safeSetTimeout
  ]);

  const handleOptionClick = useCallback(
    (index, isCorrect) => {
      if (
        checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        isGenerating ||
        isSubmittingRef.current
      ) {
        return;
      }
      isSubmittingRef.current = true;
      setSelectedOptionIndex(index);

      if (isCorrect) {
        handleSuccess();
      } else {
        if (attempts === 0) {
          setCheckStatus('wrong_retry');
          setAttempts(1);
          setCombo(1);
          notifyToast('Chưa đúng! Đọc kỹ lại bài xem sao.', 'warning');
          safeSetTimeout(() => {
            if (isMountedRef.current) {
              setSelectedOptionIndex(null);
              setCheckStatus('idle');
            }
            isSubmittingRef.current = false;
          }, 800);
        } else {
          handleFailure();
        }
      }
    },
    [
      checkStatus,
      isGenerating,
      attempts,
      handleSuccess,
      handleFailure,
      notifyToast,
      safeSetTimeout
    ]
  );

  const handleFillSubmit = useCallback(() => {
    if (
      !inputBuffer.trim() ||
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      isSubmittingRef.current ||
      !currentSubQuestion
    ) {
      return;
    }
    isSubmittingRef.current = true;

    const activeLang = configRef.current?.lang === 'zh' ? 'zh' : 'en';
    const cleanUser = Utils.advancedNormalize(inputBuffer, activeLang);
    const cleanTarget = Utils.advancedNormalize(
      currentSubQuestion.correctAnswer,
      activeLang
    );

    if (cleanUser === cleanTarget) {
      handleSuccess();
    } else {
      if (attempts < 2) {
        setCheckStatus('wrong_retry');
        setAttempts((a) => a + 1);
        setCombo(1);
        notifyToast(`Sai rồi! Còn ${2 - attempts} lượt thử.`, 'warning');
        safeSetTimeout(() => {
          if (isMountedRef.current) {
            setCheckStatus('idle');
            if (typeInputRef.current) typeInputRef.current.focus();
          }
          isSubmittingRef.current = false;
        }, 500);
      } else {
        handleFailure();
      }
    }
  }, [
    inputBuffer,
    checkStatus,
    isGenerating,
    currentSubQuestion,
    attempts,
    handleSuccess,
    handleFailure,
    notifyToast,
    safeSetTimeout
  ]);

  const handleSkip = useCallback(() => {
    if (
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      isSubmittingRef.current
    ) {
      return;
    }
    isSubmittingRef.current = true;
    handleFailure();
  }, [checkStatus, isGenerating, handleFailure]);

  // ==========================================================================
  // TỰ ĐỘNG LƯU PHIÊN CHƠI (AUTOSAVE) & THU HỒI ĐẠN KHI THOÁT
  // ==========================================================================
  useEffect(() => {
    latestStateRef.current = {
      score,
      time,
      config,
      isFinished,
      isGenerating,
      passageData,
      subIndex,
      combo,
      playedCount,
      timeLeft,
      correctCount,
      wrongCount,
      needsNextOnResume: checkStatus === 'correct' || checkStatus === 'failed'
    };
  }, [
    score,
    time,
    config,
    isFinished,
    isGenerating,
    passageData,
    subIndex,
    combo,
    playedCount,
    timeLeft,
    correctCount,
    wrongCount,
    checkStatus
  ]);

  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      const st = latestStateRef.current;
      if (
        !st.isFinished &&
        st.passageData &&
        typeof onAutoSave === 'function' &&
        !st.isGenerating
      ) {
        onAutoSave({
          gameType: 'reading',
          score: st.score,
          time: st.time,
          config: st.config,
          readingState: {
            passageData: st.passageData,
            subIndex: st.subIndex,
            combo: st.combo,
            playedCount: st.playedCount,
            timeLeft: st.timeLeft,
            correctCount: st.correctCount,
            wrongCount: st.wrongCount,
            needsNextOnResume: st.needsNextOnResume
          }
        });
      }
    }, 5000);

    return () => clearInterval(autoSaveInterval);
  }, [onAutoSave]);

  const handleSaveAndBack = useCallback(() => {
    clearAllTimeouts();

    // Thu hồi tổ kén chưa dùng trong hàng đợi về Túi nháp bằng API chuẩn getPendingItems()
    const coordinator = queueCoordinatorRef.current;
    if (coordinator && typeof addRetryRef.current === 'function') {
      const remainingItems =
        typeof coordinator.getPendingItems === 'function'
          ? coordinator.getPendingItems()
          : Array.isArray(coordinator.queue)
          ? [...coordinator.queue]
          : [];
      remainingItems.forEach((item) => {
        if (item && item.passageData && !item.passageData._isRescued) {
          addRetryRef.current('reading', item);
        }
      });
    }

    if (!isFinished && passageData && typeof onBack === 'function') {
      onBack({
        gameType: 'reading',
        score,
        time,
        config,
        readingState: {
          passageData,
          subIndex,
          combo,
          playedCount,
          timeLeft,
          correctCount,
          wrongCount,
          needsNextOnResume: checkStatus === 'correct' || checkStatus === 'failed'
        }
      });
    } else if (typeof onBack === 'function') {
      onBack(null);
    }
  }, [
    clearAllTimeouts,
    isFinished,
    passageData,
    onBack,
    score,
    time,
    config,
    subIndex,
    combo,
    playedCount,
    timeLeft,
    correctCount,
    wrongCount,
    checkStatus
  ]);

  return {
    passageData,
    currentSubQuestion,
    subIndex,
    totalSubQuestions,
    inputBuffer,
    setInputBuffer,
    typeInputRef,
    checkStatus,
    selectedOptionIndex,
    attempts,
    score,
    combo,
    playedCount,
    time,
    timeLeft,
    isFinished,
    isGenerating,
    aiCountdown,
    queueLength,
    correctCount,
    wrongCount,
    resultTimer,
    isResultPaused,
    aiWaitTime,
    handleOptionClick,
    handleFillSubmit,
    handleSkip,
    nextRound,
    handleNext: nextRound,
    handleSaveAndBack,
    onSaveToNotebook: saveNotebookFn,
    isBookmarked,
    toggleResultPause
  };
};

// ============================================================================
// 2. COMPONENT ĐIỀU PHỐI TRÒ CHƠI ĐỌC HIỂU (ReadingGame Wrapper)
// ============================================================================
const ReadingPlayWrapper = (props) => {
  const logic = useReadingLogic(props);
  return (
    <ReadingPlayScreen
      {...logic}
      mainColor={props.mainColor || 'slate'}
      config={props.config}
      onEndGame={props.onEndGame || props.onFinish}
      onBack={logic.handleSaveAndBack}
    />
  );
};

export const ReadingGame = (props) => {
  const [internalConfig, setInternalConfig] = useState(
    /** @type {Record<string, any> | null} */ (
      () => props.config || props.savedState?.config || null
    )
  );

  const activeConfig = props.config || internalConfig;
  const effectiveLang = props.lang === 'zh' ? 'zh' : 'en';
  const effectiveLevel =
    props.level ??
    props.currentLevel ??
    (effectiveLang === 'zh' ? 'zh_level_4' : 'en_level_8');
  const effectiveTopic = props.topic ?? props.currentTopic ?? 'general';

  // Memoize mergedConfig để chống tạo object mới mỗi lần render
  const mergedConfig = useMemo(
    () => ({
      sourceMode: 'ai_pure',
      aiMode: true,
      timerMode: true,
      timeLimit: 300,
      lang: effectiveLang,
      level: effectiveLevel,
      topic: effectiveTopic,
      ...(activeConfig || {})
    }),
    [activeConfig, effectiveLang, effectiveLevel, effectiveTopic]
  );

  // Nếu chưa có config (chạy độc lập không qua bước Setup của GameView), hiển thị ReadingSetup
  if (!activeConfig && !props.autoResume) {
    return (
      <ReadingSetup
        mainColor={props.mainColor || 'slate'}
        onStart={(newCfg) =>
          setInternalConfig({
            ...newCfg,
            lang: effectiveLang,
            level: effectiveLevel,
            topic: effectiveTopic
          })
        }
        onBack={() => props.onBack && props.onBack(null)}
      />
    );
  }

  return <ReadingPlayWrapper {...props} config={mergedConfig} />;
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_24_useReadingLogic = useReadingLogic;
  window.useReadingLogic = useReadingLogic;
  window.Block5_24_ReadingGame = ReadingGame;
  window.ReadingGame = ReadingGame;
}

export default ReadingGame;