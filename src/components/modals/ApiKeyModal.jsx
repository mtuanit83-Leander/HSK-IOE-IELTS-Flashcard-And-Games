// ============================================================================
// FILE 41/85: src/components/modals/ApiKeyModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.6)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 24/11/2026 - 22:47 (GMT+7)
// NHIỆM VỤ: Modal Quản lý API Key Radar (Kiểm tra sức khỏe Key, Ma trận RPD
//           theo từng Key/Model, Công tắc Auto Cascade & Key trả phí);
//           sạch 0 CRITICAL / 0 HIGH / 0 MEDIUM, khóa kín 2 tầng chống hồi sinh
//           khóa legacy 'fc_apikey', Radar thông minh theo keyPoolRef diệt giấc
//           ngủ 8s thừa, chống NaN:NaN/0p ở badge cooldown, tương thích 100%
//           React 18 StrictMode và chuẩn A11y (Backdrop/Escape/role="dialog").
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../common/Icons';
import { STORAGE_KEYS, AI_MODELS } from '../../config/constants';
import { Utils } from '../../utils/helpers';
import {
  RPDTracker,
  pingGeminiKey,
  getPersistentCooldowns
} from '../../services/geminiApi';

const DEFAULT_AI_MODEL = 'gemini-3.5-flash-lite';
const LEGACY_API_KEY_STORAGE = 'fc_apikey';
const PING_INTERVAL_MS = 8000;

/**
 * Danh sách mô hình dự phòng nếu hằng số chưa nạp kịp
 */
const FALLBACK_MODELS = [
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', rpdLimit: 500 },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', rpdLimit: 500 },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', rpdLimit: 20 },
  { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', rpdLimit: 20 },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', rpdLimit: 20 },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', rpdLimit: 20 },
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', rpdLimit: 20 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', rpdLimit: 20 }
];

/**
 * Helper hiển thị thông báo an toàn qua hệ thống Toast toàn cục
 */
const notify = (msg, type = 'info') => {
  if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
    window.globalShowToast(msg, type);
  } else {
    console.log(`[Toast - ${type}]:`, msg);
  }
};

/**
 * Đọc an toàn chuỗi từ localStorage (chống lỗi khi trình duyệt chặn Storage)
 */
const safeReadStorage = (key, fallback = '') => {
  if (!key || typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Chuẩn hóa chuỗi API Key: gọt khoảng trắng & dấu ngoặc kép/đơn dư thừa
 */
const cleanKeyStr = (val) => {
  if (typeof val !== 'string') return '';
  return val.replace(/["'\s]/g, '').trim();
};

/**
 * Đọc danh sách án phạt cooldown an toàn từ geminiApi hoặc Storage
 */
const readActiveCooldowns = () => {
  try {
    if (typeof getPersistentCooldowns === 'function') {
      const data = getPersistentCooldowns();
      if (data && typeof data === 'object') return data;
    }
  } catch {
    // Fallback đọc trực tiếp qua Utils.safeJsonParse
  }
  const fallback = Utils.safeJsonParse('fc_api_cooldowns', {});
  return fallback && typeof fallback === 'object' ? fallback : {};
};

/**
 * Modal Quản lý API Key & Radar Kiểm tra Sức khỏe Kho khóa (ApiKeyModal)
 */
export const ApiKeyModal = ({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  aiModel,
  setAiModel,
  t = (k) => k
}) => {
  const apiKeyStorageKey = STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key';
  const aiModelStorageKey = STORAGE_KEYS?.AI_MODEL || 'fc_ai_model';

  const [keyPool, setKeyPool] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [newKeyInput, setNewKeyInput] = useState('');

  // State cho Cooldown Slider (Phút)
  const [localCooldown, setLocalCooldown] = useState(120);

  // State cho Model Selector & giá trị đang áp dụng thực tế
  const [localAiModel, setLocalAiModel] = useState(DEFAULT_AI_MODEL);
  const [appliedAiModel, setAppliedAiModel] = useState(DEFAULT_AI_MODEL);

  // State cho Premium Mode & Auto Cascade
  const [isPremium, setIsPremium] = useState(false);
  const [isAutoCascade, setIsAutoCascade] = useState(true);

  // Refs quản lý vòng đời Modal, kho đạn trực tiếp & hủy tức thì bộ đếm ngủ 8s
  const prevIsOpenRef = useRef(false);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const keyPoolRef = useRef(keyPool);
  keyPoolRef.current = keyPool;

  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  const aiModelRef = useRef(aiModel);
  aiModelRef.current = aiModel;

  const abortTestRef = useRef(false);
  const testRunIdRef = useRef(0);
  const pingTimerRef = useRef(null);
  const pingResolveRef = useRef(null);
  const handleCloseModalRef = useRef(null);

  // Chỉ phát Toast khi Modal đang mở (chặn Toast trễ sau khi người dùng đã đóng)
  const safeNotify = (msg, type = 'info') => {
    if (isOpenRef.current) {
      notify(msg, type);
    }
  };

  // Hủy lập tức luồng quét & đánh thức Promise ngủ 8 giây đang treo
  const cancelPingWorker = () => {
    abortTestRef.current = true;
    testRunIdRef.current += 1;
    if (pingTimerRef.current) {
      clearTimeout(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pingResolveRef.current) {
      const resolveFn = pingResolveRef.current;
      pingResolveRef.current = null;
      resolveFn();
    }
  };

  // Bộ đếm chờ có thể hủy tức thì (không treo 8s khi bấm Dừng hoặc đóng Modal)
  const cancellablePingDelay = (ms) =>
    new Promise((resolve) => {
      if (abortTestRef.current) {
        resolve();
        return;
      }
      pingResolveRef.current = resolve;
      pingTimerRef.current = setTimeout(() => {
        pingTimerRef.current = null;
        pingResolveRef.current = null;
        resolve();
      }, ms);
    });

  // Đóng Modal an toàn kèm hủy Radar nếu đang chạy
  const handleCloseModal = () => {
    cancelPingWorker();
    setIsTesting(false);
    if (onClose) onClose();
  };
  handleCloseModalRef.current = handleCloseModal;

  // Dọn dẹp bộ đếm & đặt lại prevIsOpenRef khi unmount (tương thích 100% React 18 StrictMode)
  useEffect(() => {
    return () => {
      prevIsOpenRef.current = false;
      cancelPingWorker();
    };
  }, []);

  // Lắng nghe phím Escape để đóng Modal an toàn
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (typeof handleCloseModalRef.current === 'function') {
          handleCloseModalRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Effect 1: Chỉ khởi tạo kho Key & reset bản nháp khi isOpen chuyển false -> true
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen && !wasOpen) {
      cancelPingWorker();
      abortTestRef.current = false;
      setIsTesting(false);

      // Nạp và khử trùng kho Key theo thứ tự gốc
      const rawPool = Utils.safeJsonParse('fc_apikey_pool', []);
      const dedupedPool = [];
      const seenKeys = new Set();
      if (Array.isArray(rawPool)) {
        for (const item of rawPool) {
          const cleaned = cleanKeyStr(item);
          if (cleaned && !seenKeys.has(cleaned)) {
            seenKeys.add(cleaned);
            dedupedPool.push(cleaned);
          }
        }
      }

      // Ưu tiên đọc Key đa tầng: prop apiKey -> STORAGE_KEYS.API_KEY -> 'fc_apikey'
      const primaryCandidate =
        cleanKeyStr(apiKeyRef.current) ||
        cleanKeyStr(safeReadStorage(apiKeyStorageKey, '')) ||
        cleanKeyStr(safeReadStorage(LEGACY_API_KEY_STORAGE, ''));

      let initialPool = dedupedPool;
      if (primaryCandidate) {
        initialPool = [
          primaryCandidate,
          ...dedupedPool.filter((k) => k !== primaryCandidate)
        ];
      }

      keyPoolRef.current = initialPool;
      setKeyPool(initialPool);
      setNewKeyInput('');
      setTestResults({});

      // Khởi tạo Cooldown 429 an toàn trong biên 10..1440 phút
      const rawConfig = Utils.safeJsonParse('fc_ai_config', {});
      const parsedCooldown = Number(rawConfig?.cooldown429);
      const safeCooldown = Number.isFinite(parsedCooldown)
        ? Math.min(1440, Math.max(10, parsedCooldown))
        : 120;
      setLocalCooldown(safeCooldown);

      // Khởi tạo Mô hình AI hiện hành
      const currentAiModel =
        aiModelRef.current ||
        safeReadStorage(aiModelStorageKey, '') ||
        DEFAULT_AI_MODEL;
      setLocalAiModel(currentAiModel);
      setAppliedAiModel(currentAiModel);

      // Khởi tạo trạng thái Premium & Auto Cascade
      setIsPremium(safeReadStorage('fc_is_premium_key', '') === 'true');
      setIsAutoCascade(safeReadStorage('fc_is_auto_cascade', '') !== 'false');
    } else if (!isOpen && wasOpen) {
      cancelPingWorker();
      setIsTesting(false);
    }
  }, [isOpen, apiKeyStorageKey, aiModelStorageKey]);

  // Effect 2: Đồng bộ riêng localAiModel khi prop aiModel đổi (KHÔNG reset testResults / newKeyInput)
  useEffect(() => {
    if (isOpen && aiModel) {
      setLocalAiModel(aiModel);
      setAppliedAiModel(aiModel);
    }
  }, [isOpen, aiModel]);

  // Đồng bộ đồng thời khóa chính & khóa legacy (nếu đang tồn tại)
  const syncPrimaryKeyStorage = (nextKey) => {
    Utils.safeLocalStorageSet(apiKeyStorageKey, nextKey || null);
    if (
      LEGACY_API_KEY_STORAGE !== apiKeyStorageKey &&
      safeReadStorage(LEGACY_API_KEY_STORAGE, '') !== ''
    ) {
      Utils.safeLocalStorageSet(LEGACY_API_KEY_STORAGE, nextKey || null);
    }
  };

  // Thêm Key mới vào kho đạn
  const handleAddKey = () => {
    const k = cleanKeyStr(newKeyInput);
    if (!k) return;

    if (k.length <= 20) {
      safeNotify('API Key không hợp lệ (độ dài tối thiểu > 20 ký tự)!', 'warning');
      return;
    }

    if (keyPool.includes(k)) {
      safeNotify('API Key này đã có sẵn trong kho đạn!', 'warning');
      return;
    }

    const newPool = [k, ...keyPool];
    keyPoolRef.current = newPool;
    setKeyPool(newPool);
    Utils.safeLocalStorageSet('fc_apikey_pool', newPool);
    syncPrimaryKeyStorage(k);
    if (setApiKey) setApiKey(k);
    setNewKeyInput('');
    safeNotify('Đã thêm API Key mới!', 'success');
  };

  // Xóa Key khỏi kho (khóa kín 2 tầng chống hồi sinh từ cả fc_gemini_api_key lẫn fc_apikey)
  const handleRemoveKey = (keyToRemove) => {
    const newPool = keyPool.filter((k) => k !== keyToRemove);
    keyPoolRef.current = newPool;
    setKeyPool(newPool);
    Utils.safeLocalStorageSet('fc_apikey_pool', newPool);

    setTestResults((prev) => {
      if (!(keyToRemove in prev)) return prev;
      const next = { ...prev };
      delete next[keyToRemove];
      return next;
    });

    const activePropKey = cleanKeyStr(apiKey);
    const activeStoredKey = cleanKeyStr(safeReadStorage(apiKeyStorageKey, ''));
    const activeLegacyKey = cleanKeyStr(safeReadStorage(LEGACY_API_KEY_STORAGE, ''));
    const nextKey = newPool.length > 0 ? newPool[0] : '';

    if (newPool.length === 0) {
      // Kho đạn rỗng -> xóa sạch cả 2 khóa để tuyệt đối không hồi sinh Key legacy cũ
      Utils.safeLocalStorageSet(apiKeyStorageKey, null);
      if (LEGACY_API_KEY_STORAGE !== apiKeyStorageKey) {
        Utils.safeLocalStorageSet(LEGACY_API_KEY_STORAGE, null);
      }
      if (setApiKey) setApiKey('');
    } else {
      if (activeStoredKey === keyToRemove) {
        Utils.safeLocalStorageSet(apiKeyStorageKey, nextKey);
      }
      if (
        LEGACY_API_KEY_STORAGE !== apiKeyStorageKey &&
        activeLegacyKey === keyToRemove
      ) {
        Utils.safeLocalStorageSet(LEGACY_API_KEY_STORAGE, nextKey);
      }
      if (
        activePropKey === keyToRemove ||
        (!activePropKey &&
          (activeStoredKey === keyToRemove || activeLegacyKey === keyToRemove))
      ) {
        if (setApiKey) setApiKey(nextKey);
      }
    }

    safeNotify('Đã xóa API Key khỏi kho đạn!', 'info');
  };

  // Đặt làm Key ưu tiên số 1
  const handleSetPrimary = (k) => {
    const newPool = [k, ...keyPool.filter((item) => item !== k)];
    keyPoolRef.current = newPool;
    setKeyPool(newPool);
    Utils.safeLocalStorageSet('fc_apikey_pool', newPool);
    syncPrimaryKeyStorage(k);
    if (setApiKey) setApiKey(k);
    safeNotify('Đã đổi Key ưu tiên!', 'success');
  };

  // Xử lý kéo Slider Cooldown 429 và cập nhật bất biến xuống Storage
  const handleCooldownChange = (val) => {
    const parsed = Number(val);
    const clampedVal = Number.isFinite(parsed)
      ? Math.min(1440, Math.max(10, parsed))
      : 120;
    setLocalCooldown(clampedVal);

    const rawConfig = Utils.safeJsonParse('fc_ai_config', {});
    const safeConfig =
      rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
        ? rawConfig
        : {};

    Utils.safeLocalStorageSet('fc_ai_config', {
      ...safeConfig,
      cooldown429: clampedVal
    });
  };

  // Áp dụng Mô hình AI ưu tiên (qua Utils.safeLocalStorageSet - 0 lỗi HIGH)
  const handleApplyModel = () => {
    if (setAiModel) setAiModel(localAiModel);
    setAppliedAiModel(localAiModel);
    const saved = Utils.safeLocalStorageSet(aiModelStorageKey, localAiModel);
    if (saved) {
      safeNotify('Đã kích hoạt Mô hình AI ưu tiên!', 'success');
    } else {
      safeNotify('Đã đổi mô hình tạm thời (trình duyệt chặn lưu bộ nhớ).', 'warning');
    }
  };

  // Bật/Tắt chế độ Key trả phí (Bỏ qua giới hạn RPD)
  const handleTogglePremium = () => {
    const newVal = !isPremium;
    setIsPremium(newVal);
    Utils.safeLocalStorageSet('fc_is_premium_key', String(newVal));
    if (newVal) {
      safeNotify('Đã KÍCH HOẠT chế độ Key Trả Phí!', 'success');
    } else {
      safeNotify('Đã TẮT chế độ Key Trả Phí!', 'info');
    }
  };

  // Bật/Tắt chế độ Tự động hạ cấp mô hình (Auto Cascade)
  const handleToggleAutoCascade = () => {
    const newVal = !isAutoCascade;
    setIsAutoCascade(newVal);
    Utils.safeLocalStorageSet('fc_is_auto_cascade', String(newVal));
    if (newVal) {
      safeNotify('Đã BẬT Tự động hạ cấp mô hình (Cascade)!', 'success');
    } else {
      safeNotify('Đã TẮT Tự động hạ cấp (Khóa cứng mô hình)!', 'warning');
    }
  };

  // Quét Radar kiểm tra sức khỏe toàn bộ kho Key (bỏ qua Key đã xóa & diệt giấc ngủ 8s thừa)
  const handleTestKeys = async () => {
    if (isTesting) {
      cancelPingWorker();
      setIsTesting(false);
      safeNotify('Đã dừng kiểm tra!', 'warning');
      return;
    }

    const snapshotKeys = [...keyPool];
    if (snapshotKeys.length === 0) return;

    cancelPingWorker();
    abortTestRef.current = false;
    const myRunId = ++testRunIdRef.current;
    setIsTesting(true);

    try {
      for (let i = 0; i < snapshotKeys.length; i++) {
        if (abortTestRef.current || testRunIdRef.current !== myRunId) break;

        const k = snapshotKeys[i];
        // Bỏ qua ngay nếu Key vừa bị người dùng xóa giữa chừng
        if (!keyPoolRef.current.includes(k)) continue;

        const cooldowns = readActiveCooldowns();
        const cleanK = cleanKeyStr(k);
        const cdData = cooldowns[cleanK];

        // Nếu Key đang thụ án phạt -> Bỏ qua, không gửi request thử và không ngủ 8s
        if (cdData && cdData.expireAt > Date.now()) {
          setTestResults((prev) => ({ ...prev, [k]: 'cooldown' }));
          continue;
        }

        setTestResults((prev) => ({ ...prev, [k]: 'testing' }));

        let statusCode = 0;
        if (typeof pingGeminiKey === 'function') {
          try {
            const res = await pingGeminiKey(k);
            statusCode = typeof res?.status === 'number' ? res.status : 0;
          } catch {
            statusCode = 0;
          }
        }

        if (abortTestRef.current || testRunIdRef.current !== myRunId) break;
        // Không ghi kết quả mồ côi nếu Key bị xóa ngay lúc đang chờ mạng
        if (!keyPoolRef.current.includes(k)) continue;

        setTestResults((prev) => ({ ...prev, [k]: statusCode }));

        // Chỉ nghỉ 8s nếu phía sau thực sự còn ít nhất 1 Key sống chưa bị xóa & không đang cooldown
        const latestCooldowns = readActiveCooldowns();
        const nowAfterPing = Date.now();
        const hasNextTestableKey = snapshotKeys.slice(i + 1).some((nextKey) => {
          if (!keyPoolRef.current.includes(nextKey)) return false;
          const nextCd = latestCooldowns[cleanKeyStr(nextKey)];
          return !(nextCd && nextCd.expireAt > nowAfterPing);
        });

        if (hasNextTestableKey) {
          await cancellablePingDelay(PING_INTERVAL_MS);
        }
      }

      if (!abortTestRef.current && testRunIdRef.current === myRunId) {
        safeNotify('Đã hoàn tất kiểm tra kho đạn!', 'info');
      }
    } finally {
      if (testRunIdRef.current === myRunId) {
        setIsTesting(false);
      }
    }
  };

  // Phân giải Huy hiệu trạng thái thông minh (chống NaN:NaN & khóa sàn 1p)
  const getStatusBadge = (status, keyStr, cooldownsMap) => {
    const cleanK = cleanKeyStr(keyStr);
    const cdData = cooldownsMap[cleanK];
    const now = Date.now();

    if (cdData && cdData.expireAt > now) {
      const remainMin = Math.max(1, Math.ceil((cdData.expireAt - now) / 60000));
      const startedAt =
        cdData.startedAt !== undefined && cdData.startedAt !== null
          ? new Date(cdData.startedAt)
          : null;
      const hasValidStart = Boolean(
        startedAt && Number.isFinite(startedAt.getTime())
      );

      if (hasValidStart) {
        const hours = startedAt.getHours().toString().padStart(2, '0');
        const minutes = startedAt.getMinutes().toString().padStart(2, '0');
        return (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200"
            title="API Key bị tạm khóa để tránh spam"
          >
            ❄️ Khóa lúc {hours}:{minutes} (Còn {remainMin}p)
          </span>
        );
      }

      return (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200"
          title="API Key bị tạm khóa để tránh spam"
        >
          ❄️ Đang khóa (Còn {remainMin}p)
        </span>
      );
    }

    if (status === 'testing') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 animate-pulse">
          Đang thử...
        </span>
      );
    }
    if (status === 200) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
          🟢 Sẵn sàng
        </span>
      );
    }
    if (status === 429) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
          🟠 Quá tải
        </span>
      );
    }
    if (status === 400 || status === 403) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
          🔴 Hỏng
        </span>
      );
    }
    if (status === 408) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">
          ⏳ Mạng yếu
        </span>
      );
    }
    if (status === 0) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          Lỗi mạng
        </span>
      );
    }
    return null;
  };

  if (!isOpen) return null;

  const activeModelsList =
    Array.isArray(AI_MODELS) && AI_MODELS.length > 0
      ? AI_MODELS
      : FALLBACK_MODELS;

  const effectiveCurrentModel =
    aiModel ||
    appliedAiModel ||
    safeReadStorage(aiModelStorageKey, '') ||
    DEFAULT_AI_MODEL;

  const activePrimaryKey =
    cleanKeyStr(apiKey) ||
    cleanKeyStr(safeReadStorage(apiKeyStorageKey, '')) ||
    cleanKeyStr(safeReadStorage(LEGACY_API_KEY_STORAGE, ''));

  const cooldownsSnapshot = readActiveCooldowns();
  const selectedModelObj = activeModelsList.find(
    (m) => m.id === localAiModel
  ) || { rpdLimit: 0 };
  const maxRpd = Number(selectedModelObj.rpdLimit) || 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="apikey-modal-title"
      onClick={handleCloseModal}
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-purple-50 shrink-0 rounded-t-xl">
          <h3
            id="apikey-modal-title"
            className="font-bold text-lg flex items-center gap-2 text-purple-700"
          >
            <Icons.Key /> Quản lý API Key (Radar)
          </h3>
          <button
            type="button"
            onClick={handleCloseModal}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Đóng"
          >
            <Icons.X />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 bg-gray-50/50">
          {/* Thêm Key thủ công */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Thêm Key thủ công
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
                className="flex-1 p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-200 outline-none font-mono"
                placeholder={t('apiKeyPlace') || 'Dán Gemini API Key vào đây...'}
              />
              <button
                type="button"
                onClick={handleAddKey}
                disabled={!newKeyInput.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-bold shadow hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1 transition-all active:scale-95"
              >
                <Icons.Plus size={18} /> Thêm
              </button>
            </div>
          </div>

          {/* Cấu hình Mô hình Ưu tiên và Switch Toggles */}
          <div className="space-y-2 bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[11px] font-bold text-blue-800 uppercase tracking-widest flex items-center gap-1">
                <Icons.Layers size={12} /> Mô hình ưu tiên (Cascade)
              </label>
            </div>

            <div className="flex gap-2">
              <select
                value={localAiModel}
                onChange={(e) => setLocalAiModel(e.target.value)}
                className="flex-1 p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-300 outline-none font-medium text-gray-700"
              >
                {activeModelsList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyModel}
                disabled={localAiModel === effectiveCurrentModel}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-95 text-sm"
              >
                Áp dụng
              </button>
            </div>

            {/* Toggles Auto Cascade & Premium */}
            <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-blue-200/50">
              <div className="flex items-center justify-between">
                <label
                  className="text-[11px] font-bold text-blue-800 flex items-center gap-1 cursor-pointer select-none"
                  onClick={handleToggleAutoCascade}
                >
                  <span className="text-sm">🌊</span> Tự động hạ cấp mô hình
                  (Auto Cascade)
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAutoCascade}
                  onClick={handleToggleAutoCascade}
                  className={`w-8 h-4 rounded-full flex items-center p-0.5 cursor-pointer transition-colors ${
                    isAutoCascade ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                      isAutoCascade ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <label
                  className="text-[11px] font-bold text-yellow-600 flex items-center gap-1 cursor-pointer select-none"
                  onClick={handleTogglePremium}
                >
                  <span className="text-sm">🌟</span> Bỏ qua giới hạn RPD (Cho
                  Key Trả phí)
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPremium}
                  onClick={handleTogglePremium}
                  className={`w-8 h-4 rounded-full flex items-center p-0.5 cursor-pointer transition-colors ${
                    isPremium ? 'bg-yellow-400' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                      isPremium ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Khối cài đặt Thời gian phạt 429 */}
          <div className="space-y-2 bg-orange-50 p-3 rounded-xl border border-orange-100 shadow-sm">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-bold text-orange-800 uppercase tracking-widest flex items-center gap-1">
                <Icons.Clock size={12} /> Thời gian phạt 429
              </label>
              <span className="text-sm font-mono font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-lg">
                {localCooldown} phút
              </span>
            </div>
            <p className="text-[10px] text-orange-700/80 mb-2 leading-tight">
              Thời gian đóng băng API Key khi bị lỗi Quá tải (Mặc định: 120p).
              Áp dụng ngay khi kéo.
            </p>
            <input
              type="range"
              min="10"
              max="1440"
              step="10"
              value={localCooldown}
              onChange={(e) => handleCooldownChange(e.target.value)}
              className="w-full h-1.5 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[9px] text-orange-400 mt-1 font-bold">
              <span>10p</span>
              <span>24h</span>
            </div>
          </div>

          {/* Danh sách Kho đạn dự phòng */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                Kho đạn dự phòng ({keyPool.length})
              </label>
              <button
                type="button"
                onClick={handleTestKeys}
                disabled={keyPool.length === 0}
                className={`text-[10px] font-bold px-3 py-1.5 border rounded-lg flex items-center gap-1 transition-all active:scale-95 ${
                  isTesting
                    ? 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'
                    : 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 disabled:opacity-50'
                }`}
              >
                {isTesting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    Dừng kiểm tra
                  </>
                ) : (
                  <>
                    <Icons.Search size={14} />
                    Kiểm tra sức khỏe
                  </>
                )}
              </button>
            </div>

            {keyPool.length === 0 ? (
              <div className="text-center text-sm text-gray-400 italic p-4 bg-white rounded-xl border border-dashed border-gray-200">
                Kho đạn đang trống. Vui lòng thêm Key!
              </div>
            ) : (
              <div className="space-y-2">
                {keyPool.map((k) => {
                  const isPrimary = activePrimaryKey === k;
                  const displayKey =
                    k.length > 15
                      ? `${k.substring(0, 8)}...${k.substring(k.length - 4)}`
                      : k;
                  const status = testResults[k];
                  const cleanK = cleanKeyStr(k);

                  const currentUsage =
                    typeof RPDTracker?.getUsage === 'function'
                      ? RPDTracker.getUsage(cleanK, localAiModel)
                      : 0;
                  const isDanger = maxRpd > 0 && currentUsage >= maxRpd;

                  return (
                    <div
                      key={k}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all shadow-sm ${
                        isPrimary
                          ? 'bg-purple-50 border-purple-200'
                          : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isPrimary ? (
                          <div
                            className="w-6 h-6 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center shrink-0"
                            title="Key đang dùng chính"
                          >
                            <Icons.Check size={14} strokeWidth={3} />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(k)}
                            className="w-6 h-6 rounded-full border-2 border-gray-200 hover:border-purple-400 flex items-center justify-center shrink-0 transition-colors"
                            title="Đặt làm Key chính"
                            aria-label="Đặt làm Key chính"
                          />
                        )}
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-bold text-gray-700">
                            {displayKey}
                          </span>
                          <div className="mt-0.5">
                            {getStatusBadge(status, k, cooldownsSnapshot)}
                          </div>
                        </div>
                      </div>

                      {/* Giao diện RPD Matrix bên cạnh thùng rác */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[8px] font-bold text-gray-400 uppercase leading-none mb-0.5">
                            Đã dùng
                          </div>
                          <div
                            className={`text-[11px] font-mono font-black leading-none ${
                              isPremium
                                ? 'text-yellow-500'
                                : isDanger
                                ? 'text-red-500'
                                : 'text-blue-600'
                            }`}
                            title={`Hạn mức theo mô hình: ${localAiModel}`}
                          >
                            {isPremium ? '∞' : `${currentUsage}/${maxRpd}`}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <button
                          type="button"
                          onClick={() => handleRemoveKey(k)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa Key"
                          aria-label="Xóa Key"
                        >
                          <Icons.Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-white shrink-0 rounded-b-xl flex justify-between items-center">
          <p className="text-[10px] text-gray-400 italic">
            * Các key hỏng (400) bạn có thể tự xóa bằng tay.
          </p>
          <button
            type="button"
            onClick={handleCloseModal}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold shadow hover:bg-purple-700 transition-all active:scale-95"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.ApiKeyModal = ApiKeyModal;
}

export default ApiKeyModal;