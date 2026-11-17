// ============================================================================
// FILE 41/85: src/components/modals/ApiKeyModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.6)
// NHIỆM VỤ: Modal Quản lý API Key Radar (Kiểm tra sức khỏe Key, Ma trận RPD
//           theo từng Key/Model, Công tắc Auto Cascade & Key trả phí).
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

/**
 * Helper hiển thị thông báo an toàn qua hệ thống Toast toàn cục
 */
const notify = (msg, type = 'info') => {
  if (typeof window !== 'undefined' && window.globalShowToast) {
    window.globalShowToast(msg, type);
  } else {
    console.log(`[Toast - ${type}]:`, msg);
  }
};

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
  const [keyPool, setKeyPool] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState({});
  const [newKeyInput, setNewKeyInput] = useState('');

  // State cho Cooldown Slider (Phút)
  const [localCooldown, setLocalCooldown] = useState(120);

  // State cho Model Selector
  const [localAiModel, setLocalAiModel] = useState('gemini-3.5-flash-lite');

  // State cho Premium Mode & Auto Cascade
  const [isPremium, setIsPremium] = useState(false);
  const [isAutoCascade, setIsAutoCascade] = useState(true);

  const abortTestRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      abortTestRef.current = false;
      const pool = Utils?.safeJsonParse
        ? Utils.safeJsonParse('fc_apikey_pool', [])
        : [];
      const currentKey =
        localStorage.getItem(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key') ||
        '';

      let initialPool = Array.isArray(pool) ? [...pool] : [];
      if (currentKey && !initialPool.includes(currentKey)) {
        initialPool.unshift(currentKey);
      } else if (currentKey) {
        initialPool = [
          currentKey,
          ...initialPool.filter((k) => k !== currentKey)
        ];
      }

      setKeyPool(initialPool);
      setNewKeyInput('');
      setTestResults({});

      // Khởi tạo giá trị Cooldown từ Storage
      const config = Utils?.safeJsonParse
        ? Utils.safeJsonParse('fc_ai_config', {})
        : {};
      setLocalCooldown(config.cooldown429 || 120);

      // Khởi tạo giá trị Model từ State hoặc Storage
      const currentAiModel =
        aiModel ||
        localStorage.getItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model') ||
        'gemini-3.5-flash-lite';
      setLocalAiModel(currentAiModel);

      // Khởi tạo trạng thái Premium & Auto Cascade
      setIsPremium(localStorage.getItem('fc_is_premium_key') === 'true');
      setIsAutoCascade(localStorage.getItem('fc_is_auto_cascade') !== 'false');
    }
    return () => {
      abortTestRef.current = true;
    };
  }, [isOpen, aiModel]);

  // Thêm Key mới vào kho
  const handleAddKey = () => {
    const k = newKeyInput.trim();
    if (k && k.length > 20 && !keyPool.includes(k)) {
      const newPool = [k, ...keyPool];
      setKeyPool(newPool);
      Utils.safeLocalStorageSet('fc_apikey_pool', newPool);
      if (setApiKey) setApiKey(k);
      setNewKeyInput('');
      notify('Đã thêm API Key mới!', 'success');
    }
  };

  // Xóa Key khỏi kho
  const handleRemoveKey = (keyToRemove) => {
    const newPool = keyPool.filter((k) => k !== keyToRemove);
    setKeyPool(newPool);
    Utils.safeLocalStorageSet('fc_apikey_pool', newPool);
    if (apiKey === keyToRemove) {
      const nextKey = newPool.length > 0 ? newPool[0] : '';
      if (setApiKey) setApiKey(nextKey);
    }
  };

  // Đặt làm Key ưu tiên số 1
  const handleSetPrimary = (k) => {
    const newPool = [k, ...keyPool.filter((item) => item !== k)];
    setKeyPool(newPool);
    Utils.safeLocalStorageSet('fc_apikey_pool', newPool);
    if (setApiKey) setApiKey(k);
    notify('Đã đổi Key ưu tiên!', 'success');
  };

  // Xử lý kéo Slider Cooldown 429 và lưu thẳng xuống Storage
  const handleCooldownChange = (val) => {
    const newVal = Number(val);
    setLocalCooldown(newVal);
    const config = Utils?.safeJsonParse
      ? Utils.safeJsonParse('fc_ai_config', {})
      : {};
    config.cooldown429 = newVal;
    Utils.safeLocalStorageSet('fc_ai_config', config);
  };

  // Áp dụng Mô hình AI ưu tiên
  const handleApplyModel = () => {
    if (setAiModel) setAiModel(localAiModel);
    localStorage.setItem(STORAGE_KEYS?.AI_MODEL || 'fc_ai_model', localAiModel);
    notify('Đã kích hoạt Mô hình AI ưu tiên!', 'success');
  };

  // Bật/Tắt chế độ Key trả phí (Bỏ qua giới hạn RPD)
  const handleTogglePremium = () => {
    const newVal = !isPremium;
    setIsPremium(newVal);
    localStorage.setItem('fc_is_premium_key', newVal.toString());
    if (newVal) {
      notify('Đã KÍCH HOẠT chế độ Key Trả Phí!', 'success');
    } else {
      notify('Đã TẮT chế độ Key Trả Phí!', 'info');
    }
  };

  // Bật/Tắt chế độ Tự động hạ cấp mô hình (Auto Cascade)
  const handleToggleAutoCascade = () => {
    const newVal = !isAutoCascade;
    setIsAutoCascade(newVal);
    localStorage.setItem('fc_is_auto_cascade', newVal.toString());
    if (newVal) {
      notify('Đã BẬT Tự động hạ cấp mô hình (Cascade)!', 'success');
    } else {
      notify('Đã TẮT Tự động hạ cấp (Khóa cứng mô hình)!', 'warning');
    }
  };

  // Quét Radar kiểm tra sức khỏe toàn bộ kho Key
  const handleTestKeys = async () => {
    if (isTesting) {
      abortTestRef.current = true;
      setIsTesting(false);
      notify('Đã dừng kiểm tra!', 'warning');
      return;
    }
    if (keyPool.length === 0) return;

    setIsTesting(true);
    abortTestRef.current = false;
    const results = { ...testResults };

    for (const k of keyPool) {
      if (abortTestRef.current) break;

      const cooldowns = getPersistentCooldowns
        ? getPersistentCooldowns()
        : Utils.safeJsonParse('fc_api_cooldowns', {});
      const cleanK = k.replace(/["'\s]/g, '');
      const cdData = cooldowns[cleanK];

      // Nếu Key đang thụ án phạt -> Bỏ qua, không gửi request thử
      if (cdData && cdData.expireAt > Date.now()) {
        results[k] = 'cooldown';
        setTestResults({ ...results });
        continue;
      }

      results[k] = 'testing';
      setTestResults({ ...results });

      const pinger =
        pingGeminiKey ||
        (typeof window !== 'undefined' && window.Utils?.pingGeminiKey);

      if (pinger) {
        const res = await pinger(k);
        if (abortTestRef.current) break;
        results[k] = res.status;
      } else {
        results[k] = 0;
      }

      setTestResults({ ...results });

      // Nghỉ 8 giây giữa các lần thử để chống lỗi Spam 429
      await new Promise((r) => setTimeout(r, 8000));
    }

    if (!abortTestRef.current) {
      setIsTesting(false);
      notify('Đã hoàn tất kiểm tra kho đạn!', 'info');
    }
  };

  // Phân giải Huy hiệu trạng thái thông minh có đọc án phạt
  const getStatusBadge = (status, keyStr) => {
    const cooldowns = getPersistentCooldowns
      ? getPersistentCooldowns()
      : Utils.safeJsonParse('fc_api_cooldowns', {});
    const cleanK = keyStr.replace(/["'\s]/g, '');
    const cdData = cooldowns[cleanK];
    const now = Date.now();

    if (cdData && cdData.expireAt > now) {
      const startedAt = new Date(cdData.startedAt);
      const hours = startedAt.getHours().toString().padStart(2, '0');
      const minutes = startedAt.getMinutes().toString().padStart(2, '0');
      const remainMin = Math.ceil((cdData.expireAt - now) / 60000);
      return (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200"
          title="API Key bị tạm khóa để tránh spam"
        >
          ❄️ Khóa lúc {hours}:{minutes} (Còn {remainMin}p)
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

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-purple-50 shrink-0 rounded-t-xl">
          <h3 className="font-bold text-lg flex items-center gap-2 text-purple-700">
            <Icons.Key /> Quản lý API Key (Radar)
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
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
                onClick={handleApplyModel}
                disabled={localAiModel === aiModel}
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
                <div
                  className={`w-8 h-4 rounded-full flex items-center p-0.5 cursor-pointer transition-colors ${
                    isAutoCascade ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                  onClick={handleToggleAutoCascade}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                      isAutoCascade ? 'translate-x-4' : ''
                    }`}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label
                  className="text-[11px] font-bold text-yellow-600 flex items-center gap-1 cursor-pointer select-none"
                  onClick={handleTogglePremium}
                >
                  <span className="text-sm">🌟</span> Bỏ qua giới hạn RPD (Cho
                  Key Trả phí)
                </label>
                <div
                  className={`w-8 h-4 rounded-full flex items-center p-0.5 cursor-pointer transition-colors ${
                    isPremium ? 'bg-yellow-400' : 'bg-gray-300'
                  }`}
                  onClick={handleTogglePremium}
                >
                  <div
                    className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${
                      isPremium ? 'translate-x-4' : ''
                    }`}
                  ></div>
                </div>
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
                    <div className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
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
                {keyPool.map((k, index) => {
                  const isPrimary = apiKey === k;
                  const displayKey =
                    k.length > 15
                      ? `${k.substring(0, 8)}...${k.substring(k.length - 4)}`
                      : k;
                  const status = testResults[k];
                  const cleanK = k.replace(/["'\s]/g, '');

                  const selectedModelObj = activeModelsList.find(
                    (m) => m.id === localAiModel
                  ) || { rpdLimit: 0 };
                  const maxRpd = selectedModelObj.rpdLimit;

                  const tracker =
                    RPDTracker ||
                    (typeof window !== 'undefined' && window.Utils?.RPDTracker);
                  const currentUsage = tracker
                    ? tracker.getUsage(cleanK, localAiModel)
                    : 0;
                  const isDanger = currentUsage >= maxRpd;

                  return (
                    <div
                      key={index}
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
                            onClick={() => handleSetPrimary(k)}
                            className="w-6 h-6 rounded-full border-2 border-gray-200 hover:border-purple-400 flex items-center justify-center shrink-0 transition-colors"
                            title="Đặt làm Key chính"
                          ></button>
                        )}
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-bold text-gray-700">
                            {displayKey}
                          </span>
                          <div className="mt-0.5">
                            {getStatusBadge(status, k)}
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
                        <div className="w-px h-8 bg-gray-200"></div>
                        <button
                          onClick={() => handleRemoveKey(k)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa Key"
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
            onClick={onClose}
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