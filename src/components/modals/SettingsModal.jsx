// ============================================================================
// FILE 36/85: src/components/modals/SettingsModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.2)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 18:31 (GMT+7)
// NHIỆM VỤ: Modal Cài đặt hệ thống, cấu hình SRS, giọng đọc, tốc độ Auto-play
//           và Hộp đen Nhật ký hệ thống (systemLogs).
//           Nâng cấp Lượt 4.1 (Diệt 1H Radar, dập 20+ lỗi tsc & vá S17..S23):
//           1. Diệt 1/1 HIGH Radar (R05): Thay localStorage.setItem('fc_total_tokens')
//              bằng Utils.safeLocalStorageSet; bọc try/catch toàn bộ đọc/xóa Storage.
//           2. Diệt F18 & S17: Chụp ảnh cấu hình gốc (originalSettingsRef &
//              originalUiLangRef) đúng lúc mở modal qua prevIsOpenRef để nút Cancel
//              hoàn tác chuẩn xác cho phiên hiện tại (gồm cả uiLang).
//           3. Diệt S18: Kẹp an toàn đầu vào SRS (d: 0..365, h: 0..23, m: 0..59)
//              chống số âm & tràn mốc thời gian.
//           4. Diệt F19, S19 & S20: Dọn 100% Drag Listeners & 3 Timers khi đóng
//              hoặc unmount; kiểm tra an toàn TouchEvent & kẹp tọa độ kéo trong
//              khung nhìn; bổ sung nút đóng X, Backdrop 2 nhịp, Escape bảo vệ IME
//              và đầy đủ A11y (role="dialog", aria-modal, type="button").
//           5. Diệt F20 & F21: Gọi AiMemoryManager.clear() hủy timer debounce 3s
//              trước khi xóa trí nhớ AI; đọc API Key 3 tầng tương thích kép
//              (fc_gemini_api_key / fc_apikey / fc_paid_apikey); chống NaN Token.
//           6. Diệt F22, S22 & S23: Bảng màu tĩnh SETTINGS_COLOR_THEMES &
//              SRS_ROW_THEMES (xóa 100% class động), Math.round(v * 1000) chống
//              lệch dấu phẩy động, sửa (undefinedx) -> (rate ?? 0.8), thêm option
//              mặc định cho <select> giọng đọc và hỗ trợ prop showToast tùy chọn.
// ============================================================================


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../common/Icons';
import { STORAGE_KEYS } from '../../config/constants';
import { Utils } from '../../utils/helpers';
import { AiMemoryManager } from '../../utils/memoryManager';


/**
 * Bảng màu tĩnh 100% chống Tailwind JIT purge (Diệt F22)
 * @type {Record<string, { optionActive: string, accent: string, voiceBtn: string, tokenText: string, aiResetBtn: string, primaryBtn: string }>}
 */
const SETTINGS_COLOR_THEMES = {
  sky: {
    optionActive: 'bg-white text-sky-600 shadow',
    accent: 'accent-sky-500',
    voiceBtn: 'bg-sky-100 text-sky-600 hover:bg-sky-200',
    tokenText: 'text-sky-600',
    aiResetBtn: 'text-sky-600 border border-sky-200 hover:bg-sky-50',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700'
  },
  blue: {
    optionActive: 'bg-white text-blue-600 shadow',
    accent: 'accent-blue-500',
    voiceBtn: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
    tokenText: 'text-blue-600',
    aiResetBtn: 'text-blue-600 border border-blue-200 hover:bg-blue-50',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700'
  },
  red: {
    optionActive: 'bg-white text-red-600 shadow',
    accent: 'accent-red-500',
    voiceBtn: 'bg-red-100 text-red-600 hover:bg-red-200',
    tokenText: 'text-red-600',
    aiResetBtn: 'text-red-600 border border-red-200 hover:bg-red-50',
    primaryBtn: 'bg-red-600 hover:bg-red-700'
  },
  indigo: {
    optionActive: 'bg-white text-indigo-600 shadow',
    accent: 'accent-indigo-500',
    voiceBtn: 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200',
    tokenText: 'text-indigo-600',
    aiResetBtn: 'text-indigo-600 border border-indigo-200 hover:bg-indigo-50',
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700'
  },
  emerald: {
    optionActive: 'bg-white text-emerald-600 shadow',
    accent: 'accent-emerald-500',
    voiceBtn: 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200',
    tokenText: 'text-emerald-600',
    aiResetBtn: 'text-emerald-600 border border-emerald-200 hover:bg-emerald-50',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700'
  },
  purple: {
    optionActive: 'bg-white text-purple-600 shadow',
    accent: 'accent-purple-500',
    voiceBtn: 'bg-purple-100 text-purple-600 hover:bg-purple-200',
    tokenText: 'text-purple-600',
    aiResetBtn: 'text-purple-600 border border-purple-200 hover:bg-purple-50',
    primaryBtn: 'bg-purple-600 hover:bg-purple-700'
  },
  orange: {
    optionActive: 'bg-white text-orange-600 shadow',
    accent: 'accent-orange-500',
    voiceBtn: 'bg-orange-100 text-orange-600 hover:bg-orange-200',
    tokenText: 'text-orange-600',
    aiResetBtn: 'text-orange-600 border border-orange-200 hover:bg-orange-50',
    primaryBtn: 'bg-orange-600 hover:bg-orange-700'
  },
  pink: {
    optionActive: 'bg-white text-pink-600 shadow',
    accent: 'accent-pink-500',
    voiceBtn: 'bg-pink-100 text-pink-600 hover:bg-pink-200',
    tokenText: 'text-pink-600',
    aiResetBtn: 'text-pink-600 border border-pink-200 hover:bg-pink-50',
    primaryBtn: 'bg-pink-600 hover:bg-pink-700'
  },
  cyan: {
    optionActive: 'bg-white text-cyan-600 shadow',
    accent: 'accent-cyan-500',
    voiceBtn: 'bg-cyan-100 text-cyan-600 hover:bg-cyan-200',
    tokenText: 'text-cyan-600',
    aiResetBtn: 'text-cyan-600 border border-cyan-200 hover:bg-cyan-50',
    primaryBtn: 'bg-cyan-600 hover:bg-cyan-700'
  },
  slate: {
    optionActive: 'bg-white text-slate-600 shadow',
    accent: 'accent-slate-500',
    voiceBtn: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    tokenText: 'text-slate-600',
    aiResetBtn: 'text-slate-600 border border-slate-200 hover:bg-slate-50',
    primaryBtn: 'bg-slate-600 hover:bg-slate-700'
  }
};


/**
 * Bảng màu tĩnh cho các hàng cấu hình SRS (Diệt F22)
 * @type {Record<string, { border: string, text: string }>}
 */
const SRS_ROW_THEMES = {
  orange: { border: 'border-orange-500', text: 'text-orange-600' },
  blue: { border: 'border-blue-500', text: 'text-blue-600' },
  green: { border: 'border-green-500', text: 'text-green-600' }
};


/**
 * Đọc an toàn từ localStorage
 * @param {string} key
 * @returns {string}
 */
const safeStorageGet = (key) => {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};


/**
 * Xóa an toàn một khóa khỏi localStorage
 * @param {string} key
 */
const safeStorageRemove = (key) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // Bỏ qua an toàn khi Private Mode hoặc trình duyệt khóa Storage
  }
};


/**
 * Làm sạch chuỗi API Key khỏi dấu nháy & khoảng trắng thừa
 * @param {any} raw
 * @returns {string}
 */
const cleanApiKey = (raw) =>
  typeof raw === 'string' ? raw.replace(/['"\s]/g, '').trim() : '';


/**
 * Kẹp số nguyên an toàn trong khoảng [min, max] (Diệt S18)
 * @param {any} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clampInt = (val, min, max) => {
  const num = parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
};


/**
 * Trích xuất tọa độ con trỏ an toàn cho cả chuột và cảm ứng (Diệt S19)
 * @param {MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent} ev
 * @returns {{ x: number, y: number } | null}
 */
const getPointerCoords = (ev) => {
  if ('touches' in ev) {
    const touch = ev.touches?.[0] || ev.changedTouches?.[0];
    if (!touch) return null;
    return { x: touch.clientX, y: touch.clientY };
  }
  return { x: ev.clientX, y: ev.clientY };
};


// --- HELPER COMPONENTS CHO CẤU HÌNH SRS ---


/**
 * Ô nhập số có đơn vị thời gian cho SRS
 * @param {Object} props
 * @param {number} props.value
 * @param {(val: string) => void} props.onChange
 * @param {string} props.label
 * @param {number} [props.min]
 * @param {number} [props.max]
 */
const NumberUnitInput = ({ value, onChange, label, min = 0, max = 365 }) => (
  <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-2 py-1 shadow-sm focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400">
    <input
      type="number"
      min={min}
      max={max}
      value={value > 0 ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-10 text-right font-mono font-bold text-gray-700 outline-none text-sm p-0 m-0"
      placeholder="0"
      aria-label={label}
    />
    <span className="text-[10px] text-gray-400 font-bold uppercase select-none">
      {label}
    </span>
  </div>
);


/**
 * Hàng cấu hình khoảng lặp lại SRS theo từng mức độ (Khó / Tốt / Dễ)
 * @param {Object} props
 * @param {string} props.levelLabel
 * @param {string} props.color
 * @param {string} props.valueStr
 * @param {(nextVal: string) => void} props.onChange
 */
const LevelConfigRow = ({ levelLabel, color, valueStr, onChange }) => {
  const rowTheme = SRS_ROW_THEMES[color] || SRS_ROW_THEMES.blue;


  /**
   * @param {any} str
   * @returns {{ d: number, h: number, m: number }}
   */
  const parse = (str) => {
    let d = 0;
    let h = 0;
    let m = 0;
    if (typeof str !== 'string' || !str.trim()) return { d, h, m };
    const matchD = str.match(/(\d+)d/);
    if (matchD) d = clampInt(matchD[1], 0, 365);
    const matchH = str.match(/(\d+)h/);
    if (matchH) h = clampInt(matchH[1], 0, 23);
    const matchM = str.match(/(\d+)m/);
    if (matchM) m = clampInt(matchM[1], 0, 59);
    return { d, h, m };
  };


  /**
   * @param {{ d: number, h: number, m: number }} obj
   * @returns {string}
   */
  const format = (obj) => {
    const parts = [];
    if (obj.d > 0) parts.push(`${obj.d}d`);
    if (obj.h > 0) parts.push(`${obj.h}h`);
    if (obj.m > 0) parts.push(`${obj.m}m`);
    return parts.join(' ') || '0m';
  };


  const data = parse(valueStr);


  /**
   * @param {'d' | 'h' | 'm'} field
   * @param {string} val
   */
  const handleChange = (field, val) => {
    const maxLimit = field === 'd' ? 365 : field === 'h' ? 23 : 59;
    const num = clampInt(val, 0, maxLimit);
    const newData = { ...data, [field]: num };
    onChange(format(newData));
  };


  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg border-l-4 bg-gray-50 ${rowTheme.border} shadow-sm mb-2`}
    >
      <div className="mb-2 sm:mb-0 flex items-center gap-2">
        <span
          className={`text-xs font-bold uppercase ${rowTheme.text} min-w-[60px]`}
        >
          {levelLabel}
        </span>
        <span className="text-[10px] text-gray-400 bg-white px-1 rounded border hidden sm:inline-block">
          {valueStr || '0m'}
        </span>
      </div>
      <div className="flex gap-2">
        <NumberUnitInput
          value={data.d}
          onChange={(v) => handleChange('d', v)}
          label="d"
          min={0}
          max={365}
        />
        <NumberUnitInput
          value={data.h}
          onChange={(v) => handleChange('h', v)}
          label="h"
          min={0}
          max={23}
        />
        <NumberUnitInput
          value={data.m}
          onChange={(v) => handleChange('m', v)}
          label="m"
          min={0}
          max={59}
        />
      </div>
    </div>
  );
};


/**
 * Nhóm nút chọn cấu hình phân đoạn
 * @param {Object} props
 * @param {string} props.label
 * @param {Array<{ val: any, label: string, style?: React.CSSProperties }>} props.options
 * @param {any} props.current
 * @param {((val: any) => void) | undefined} props.onChange
 * @param {string} props.mainColor
 */
const SettingOption = ({ label, options, current, onChange, mainColor }) => {
  const theme = SETTINGS_COLOR_THEMES[mainColor] || SETTINGS_COLOR_THEMES.sky;
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold">{label}</label>
      <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
        {options.map((opt) => {
          const isSelected = current === opt.val;
          return (
            <button
              key={String(opt.val)}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                if (typeof onChange === 'function') onChange(opt.val);
              }}
              className={`flex-1 py-1 rounded text-xs font-bold transition-all ${
                isSelected ? theme.optionActive : 'text-gray-500 hover:text-gray-700'
              }`}
              style={opt.style}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};


/**
 * Thanh trượt điều chỉnh thông số
 * @param {Object} props
 * @param {string} props.label
 * @param {number} props.val
 * @param {number} props.min
 * @param {number} props.max
 * @param {number} props.step
 * @param {(val: number) => void} props.onChange
 * @param {string} [props.suffix]
 * @param {string} props.mainColor
 */
const SettingSlider = ({
  label,
  val,
  min,
  max,
  step,
  onChange,
  suffix = '',
  mainColor
}) => {
  const theme = SETTINGS_COLOR_THEMES[mainColor] || SETTINGS_COLOR_THEMES.sky;
  const safeVal = Number.isFinite(val) ? val : min;
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <label className="text-xs text-gray-600">{label}</label>
        <span className="text-xs font-mono">
          {safeVal}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeVal}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className={`w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer ${theme.accent}`}
      />
    </div>
  );
};


/**
 * Modal Cài đặt Toàn Hệ thống (SettingsModal)
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {(() => void) | undefined} [props.onClose]
 * @param {((settings: Record<string, any>) => void) | undefined} [props.onApply]
 * @param {Record<string, any>} [props.initialSettings]
 * @param {any[]} [props.voices]
 * @param {((text: string, rate?: number, voice?: any) => void) | undefined} [props.testSpeak]
 * @param {(() => void) | undefined} [props.onResetData]
 * @param {string} [props.currentLang]
 * @param {((key: string) => string) | undefined} [props.t]
 * @param {string} [props.uiLang]
 * @param {((lang: string) => void) | undefined} [props.setUiLang]
 * @param {string} [props.mainColor]
 * @param {(() => void) | undefined} [props.onDone]
 * @param {((settings: Record<string, any>) => void) | undefined} [props.onUpdate]
 * @param {number} [props.totalTokens]
 * @param {((val?: number) => void) | undefined} [props.onResetTokens]
 * @param {any[]} [props.systemLogs]
 * @param {(() => void) | undefined} [props.onClearLogs]
 * @param {((msg: string, type?: string) => void) | undefined} [props.showToast]
 */
export const SettingsModal = ({
  isOpen,
  onClose = undefined,
  onApply = undefined,
  initialSettings = {},
  voices = [],
  testSpeak = undefined,
  onResetData = undefined,
  currentLang = 'en',
  t = (k) => k,
  uiLang = 'en',
  setUiLang = undefined,
  mainColor = 'sky',
  onDone = undefined,
  onUpdate = undefined,
  totalTokens = 0,
  onResetTokens = undefined,
  systemLogs = [],
  onClearLogs = undefined,
  showToast = undefined
}) => {
  const [localSettings, setLocalSettings] = useState(
    /** @type {Record<string, any>} */ ({ ...(initialSettings || {}) })
  );
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [keyStats, setKeyStats] = useState({ count: 0, active: 'Chưa có' });
  const [localTotalTokens, setLocalTotalTokens] = useState(
    Number.isFinite(Number(totalTokens)) && Number(totalTokens) > 0
      ? Math.floor(Number(totalTokens))
      : 0
  );
  const [showLogs, setShowLogs] = useState(false);


  // State xác nhận 2 bước an toàn (thay thế hộp thoại native)
  const [confirmAiReset, setConfirmAiReset] = useState(false);
  const [confirmTokenReset, setConfirmTokenReset] = useState(false);


  // Refs quản lý ảnh chụp gốc cho nút Cancel (Diệt F18 & S17) và dọn dẹp tài nguyên (Diệt F19 & S19)
  const prevIsOpenRef = useRef(false);
  const originalSettingsRef = useRef(
    /** @type {Record<string, any>} */ ({ ...(initialSettings || {}) })
  );
  const originalUiLangRef = useRef(uiLang);
  const modalBoxRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const backdropMouseDownRef = useRef(false);
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0
  });
  const dragCleanupRef = useRef(/** @type {(() => void) | null} */ (null));
  const aiResetTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  );
  const tokenResetTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  );
  const reloadTimerRef = useRef(
    /** @type {ReturnType<typeof setTimeout> | null} */ (null)
  );
  const handleCancelRef = useRef(/** @type {() => void} */ (() => {}));


  const theme = SETTINGS_COLOR_THEMES[mainColor] || SETTINGS_COLOR_THEMES.sky;


  // Helper hiển thị Toast ưu tiên prop showToast -> fallback globalShowToast
  const notify = useCallback(
    (msg, type = 'warning') => {
      if (typeof showToast === 'function') {
        showToast(msg, type);
        return;
      }
      if (
        typeof window !== 'undefined' &&
        typeof /** @type {any} */ (window).globalShowToast === 'function'
      ) {
        /** @type {any} */ (window).globalShowToast(msg, type);
      } else {
        console.warn(`[Toast - ${type}]:`, msg);
      }
    },
    [showToast]
  );


  // Dọn sạch toàn bộ Drag Listeners & Timers (Diệt F19)
  const cleanupDragAndTimers = useCallback(() => {
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
    dragRef.current.isDragging = false;


    if (aiResetTimerRef.current) {
      clearTimeout(aiResetTimerRef.current);
      aiResetTimerRef.current = null;
    }
    if (tokenResetTimerRef.current) {
      clearTimeout(tokenResetTimerRef.current);
      tokenResetTimerRef.current = null;
    }
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
  }, []);


  // Dọn tài nguyên tuyệt đối khi unmount
  useEffect(() => {
    return () => {
      cleanupDragAndTimers();
    };
  }, [cleanupDragAndTimers]);


  const safeVoices = Array.isArray(voices) ? voices : [];
  const filteredVoices = safeVoices.filter((v) => {
    const voiceLang = String(v?.lang || '')
      .replace('_', '-')
      .toLowerCase();
    if (currentLang === 'zh') {
      return (
        voiceLang.startsWith('zh') ||
        voiceLang.startsWith('cmn') ||
        voiceLang.includes('cn') ||
        voiceLang.includes('tw') ||
        voiceLang.includes('hk')
      );
    }
    return voiceLang.startsWith(String(currentLang || 'en').toLowerCase());
  });
  const voiceOptions = filteredVoices.length > 0 ? filteredVoices : safeVoices;


  // Đồng bộ localSettings khi mở hoặc khi initialSettings thay đổi từ ngoài
  useEffect(() => {
    if (isOpen) {
      setLocalSettings({ ...(initialSettings || {}) });
    }
  }, [isOpen, initialSettings]);


  useEffect(() => {
    const safePropTokens = Number(totalTokens);
    setLocalTotalTokens(
      Number.isFinite(safePropTokens) && safePropTokens > 0
        ? Math.floor(safePropTokens)
        : 0
    );
  }, [totalTokens]);


  // Chụp ảnh cấu hình gốc & nạp thống kê mỗi khi mở Modal (Diệt F18, S17, F21)
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = Boolean(isOpen);


    if (isOpen && !wasOpen) {
      originalSettingsRef.current = { ...(initialSettings || {}) };
      originalUiLangRef.current = uiLang;
      backdropMouseDownRef.current = false;
      setPosition({ x: 0, y: 0 });
      setConfirmAiReset(false);
      setConfirmTokenReset(false);


      // Đếm số Key hợp lệ trong Pool (lọc chuỗi rỗng/quá ngắn)
      const rawPool = Utils?.safeJsonParse
        ? Utils.safeJsonParse('fc_apikey_pool', [])
        : [];
      const validPoolCount = Array.isArray(rawPool)
        ? rawPool.filter((k) => cleanApiKey(k).length >= 10).length
        : 0;


      // Đọc API Key đang kích hoạt theo 3 tầng tương thích kép (Diệt F21)
      const primaryKey = cleanApiKey(
        safeStorageGet(STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key')
      );
      const legacyKey = cleanApiKey(safeStorageGet('fc_apikey'));
      const paidKey = cleanApiKey(safeStorageGet('fc_paid_apikey'));
      const activeKey = primaryKey || legacyKey || paidKey;


      setKeyStats({
        count: validPoolCount,
        active: activeKey
          ? activeKey.length >= 5
            ? `...${activeKey.slice(-5)}`
            : `...${activeKey}`
          : 'Chưa có'
      });


      // Đọc tổng Token chống NaN
      const rawSavedTokens = safeStorageGet('fc_total_tokens');
      if (rawSavedTokens !== '') {
        const parsedTokens = Number(rawSavedTokens);
        setLocalTotalTokens(
          Number.isFinite(parsedTokens) && parsedTokens >= 0
            ? Math.floor(parsedTokens)
            : 0
        );
      } else {
        const safePropTokens = Number(totalTokens);
        setLocalTotalTokens(
          Number.isFinite(safePropTokens) && safePropTokens > 0
            ? Math.floor(safePropTokens)
            : 0
        );
      }
    } else if (!isOpen && wasOpen) {
      backdropMouseDownRef.current = false;
      cleanupDragAndTimers();
      setConfirmAiReset(false);
      setConfirmTokenReset(false);
    }
  }, [isOpen, initialSettings, uiLang, totalTokens, cleanupDragAndTimers]);


  /**
   * Cập nhật 1 thuộc tính cài đặt & phát trực tiếp ra cha để xem trước
   * @param {string} key
   * @param {any} value
   */
  const handleChange = (key, value) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    if (typeof onUpdate === 'function') onUpdate(newSettings);
  };


  // Hoàn tác chính xác về ảnh chụp của phiên mở hiện tại (gồm cả uiLang) (Diệt F18 & S17)
  const handleCancel = useCallback(() => {
    cleanupDragAndTimers();
    const snapshot = { ...originalSettingsRef.current };
    setLocalSettings(snapshot);
    if (typeof onUpdate === 'function') onUpdate(snapshot);
    if (
      typeof setUiLang === 'function' &&
      originalUiLangRef.current &&
      originalUiLangRef.current !== uiLang
    ) {
      setUiLang(originalUiLangRef.current);
    }
    if (typeof onClose === 'function') onClose();
  }, [cleanupDragAndTimers, onUpdate, setUiLang, uiLang, onClose]);


  handleCancelRef.current = handleCancel;


  const handleSave = () => {
    cleanupDragAndTimers();
    if (typeof onDone === 'function') onDone();
    else if (typeof onApply === 'function') onApply(localSettings);
    else if (typeof onClose === 'function') onClose();
  };


  // Hỗ trợ đóng Modal bằng phím Escape (bảo vệ bộ gõ IME Tiếng Trung/Việt) (Diệt S20)
  useEffect(() => {
    if (!isOpen) return undefined;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.stopPropagation();
        handleCancelRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);


  /**
   * Kéo thả hộp thoại có giới hạn khung nhìn & tự dọn sạch Listener (Diệt F19 & S19)
   * @param {React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>} e
   */
  const handleDragStart = (e) => {
    if (e.type === 'mousedown' && /** @type {React.MouseEvent} */ (e).button !== 0) {
      return;
    }
    const startCoords = getPointerCoords(e);
    if (!startCoords) return;


    // Dọn listener cũ nếu có thao tác chồng chéo
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }


    dragRef.current = {
      isDragging: true,
      startX: startCoords.x,
      startY: startCoords.y,
      initialX: position.x,
      initialY: position.y
    };


    /** @param {MouseEvent | TouchEvent} ev */
    const move = (ev) => {
      if (!dragRef.current.isDragging) return;
      if (ev.cancelable) ev.preventDefault();
      const coords = getPointerCoords(ev);
      if (!coords) return;


      const rawX = dragRef.current.initialX + (coords.x - dragRef.current.startX);
      const rawY = dragRef.current.initialY + (coords.y - dragRef.current.startY);


      // Kẹp tọa độ trong khung nhìn để Header không bao giờ trôi khỏi màn hình
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
      const boxRect = modalBoxRef.current?.getBoundingClientRect();
      const boxW = boxRect?.width || Math.min(448, vw - 32);
      const boxH = boxRect?.height || Math.min(600, vh * 0.9);


      const maxX = Math.max(40, (vw + boxW) / 2 - 80);
      const minY = Math.min(0, -(vh - boxH) / 2 + 8);
      const maxY = Math.max(40, (vh + boxH) / 2 - 72);


      setPosition({
        x: Math.min(maxX, Math.max(-maxX, rawX)),
        y: Math.min(maxY, Math.max(minY, rawY))
      });
    };


    const up = () => {
      dragRef.current.isDragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
      dragCleanupRef.current = null;
    };


    dragCleanupRef.current = up;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
  };


  const handleResetAIBank = () => {
    if (!confirmAiReset) {
      setConfirmAiReset(true);
      notify('Nhấn lần nữa để xác nhận làm mới Ngân hàng đề AI!', 'warning');
      if (aiResetTimerRef.current) clearTimeout(aiResetTimerRef.current);
      aiResetTimerRef.current = setTimeout(() => {
        setConfirmAiReset(false);
        aiResetTimerRef.current = null;
      }, 4000);
      return;
    }


    if (aiResetTimerRef.current) {
      clearTimeout(aiResetTimerRef.current);
      aiResetTimerRef.current = null;
    }


    // Diệt F20 & S21: Hủy timer debounce 3s & xóa RAM buffer của AiMemoryManager trước
    try {
      if (AiMemoryManager && typeof AiMemoryManager.clear === 'function') {
        AiMemoryManager.clear();
      }
    } catch {
      // Tiếp tục dọn sạch localStorage
    }


    safeStorageRemove('fc_ai_memory_en');
    safeStorageRemove('fc_ai_memory_zh');
    safeStorageRemove('fc_ai_memory');
    safeStorageRemove('fc_match_history');
    setConfirmAiReset(false);


    notify('Đã làm mới! Hệ thống đang tải lại...', 'success');
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }, 500);
  };


  const handleResetTokens = () => {
    if (!confirmTokenReset) {
      setConfirmTokenReset(true);
      if (tokenResetTimerRef.current) clearTimeout(tokenResetTimerRef.current);
      tokenResetTimerRef.current = setTimeout(() => {
        setConfirmTokenReset(false);
        tokenResetTimerRef.current = null;
      }, 3500);
      return;
    }


    if (tokenResetTimerRef.current) {
      clearTimeout(tokenResetTimerRef.current);
      tokenResetTimerRef.current = null;
    }


    // Diệt 1/1 HIGH Radar (R05): Ghi an toàn qua Utils.safeLocalStorageSet
    Utils?.safeLocalStorageSet?.('fc_total_tokens', '0');
    setLocalTotalTokens(0);
    setConfirmTokenReset(false);
    if (typeof onResetTokens === 'function') onResetTokens(0);
    notify('Đã đặt lại bộ đếm Token', 'success');
  };


  if (!isOpen) return null;


  const safeRate =
    Number.isFinite(Number(localSettings.rate)) && Number(localSettings.rate) > 0
      ? Number(localSettings.rate)
      : 0.8;
  const safeSystemLogs = Array.isArray(systemLogs) ? systemLogs : [];


  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      {/* Backdrop 2 nhịp chống đóng nhầm khi kéo thanh trượt hoặc bôi đen văn bản */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onMouseDown={(e) => {
          backdropMouseDownRef.current =
            e.button === 0 && e.target === e.currentTarget;
        }}
        onClick={(e) => {
          const shouldClose =
            backdropMouseDownRef.current && e.target === e.currentTarget;
          backdropMouseDownRef.current = false;
          if (shouldClose) handleCancel();
        }}
      ></div>


      <div
        ref={modalBoxRef}
        className="bg-white/95 backdrop-blur-md shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col z-10 overflow-hidden rounded-xl border border-gray-200 transition-transform duration-75 ease-out"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* Header kéo thả kèm nút đóng X chuẩn A11y (Diệt S20) */}
        <div
          className="flex justify-between items-center p-4 border-b bg-gray-50/80 cursor-move select-none active:bg-gray-100 transition-colors"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <h2
            id="settings-modal-title"
            className="text-xl font-bold flex items-center gap-2 pointer-events-none text-gray-700"
          >
            <Icons.Settings size={20} className="text-gray-500" />{' '}
            {t('settingsTitle')}
          </h2>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={handleCancel}
            aria-label="Đóng"
            className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors cursor-pointer"
          >
            <Icons.X size={20} />
          </button>
        </div>


        {/* Nội dung cuộn */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Thống kê API Key Pool */}
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 flex justify-between items-center text-xs">
            <div className="flex flex-col">
              <span className="font-bold text-purple-700">API Key Pool:</span>
              <span className="text-purple-600 font-mono">
                Đã nạp: {keyStats.count} keys
              </span>
            </div>
            <div className="flex flex-col text-right">
              <span className="font-bold text-purple-700">Key đang dùng:</span>
              <span className="text-green-600 font-mono font-bold bg-white px-2 rounded border border-purple-100">
                {keyStats.active}
              </span>
            </div>
          </div>


          {/* Ngôn ngữ giao diện */}
          <SettingOption
            label={t('uiLanguage')}
            options={[
              { val: 'en', label: 'EN' },
              { val: 'zh', label: 'CN' }
            ]}
            current={uiLang}
            onChange={(v) => {
              if (typeof setUiLang === 'function') setUiLang(v);
            }}
            mainColor={mainColor}
          />


          {/* Cấu hình SRS (Spaced Repetition System) */}
          <div className="space-y-2">
            <SettingOption
              label="Chế độ SRS (Lặp lại ngắt quãng)"
              options={[
                { val: true, label: 'Bật' },
                { val: false, label: 'Tắt' }
              ]}
              current={localSettings.srsEnabled !== false}
              onChange={(v) => handleChange('srsEnabled', v)}
              mainColor={mainColor}
            />
            {localSettings.srsEnabled !== false && (
              <div className="animate-in fade-in slide-in-from-top-2 pt-2">
                <LevelConfigRow
                  levelLabel={t('srsHard') || 'Khó'}
                  color="orange"
                  valueStr={localSettings.srsHard || '2d'}
                  onChange={(v) => handleChange('srsHard', v)}
                />
                <LevelConfigRow
                  levelLabel={t('srsGood') || 'Tốt'}
                  color="blue"
                  valueStr={localSettings.srsGood || '4d'}
                  onChange={(v) => handleChange('srsGood', v)}
                />
                <LevelConfigRow
                  levelLabel={t('srsEasy') || 'Dễ'}
                  color="green"
                  valueStr={localSettings.srsEasy || '7d'}
                  onChange={(v) => handleChange('srsEasy', v)}
                />
              </div>
            )}
          </div>


          {/* Chế độ hiển thị mặt thẻ */}
          <SettingOption
            label={t('displayMode')}
            options={[
              { val: 'term', label: t('termFirst') },
              { val: 'def', label: t('defFirst') }
            ]}
            current={localSettings.startSide || 'term'}
            onChange={(v) => handleChange('startSide', v)}
            mainColor={mainColor}
          />


          {/* Phông chữ */}
          <SettingOption
            label={t('fontLabel')}
            options={[
              { val: 'sans', label: 'Sans' },
              { val: 'serif', label: 'Serif' },
              {
                val: 'kaiti',
                label: 'Ma Shan',
                style: { fontFamily: '"Ma Shan Zheng", cursive' }
              },
              {
                val: 'cn_kaiti',
                label: '楷体',
                style: {
                  fontFamily:
                    '"KaiTi", "STKaiti", "楷体", "Ma Shan Zheng", serif'
                }
              },
              {
                val: 'callig',
                label: 'Thư pháp',
                style: { fontFamily: '"Long Cang", cursive' }
              }
            ]}
            current={localSettings.fontFamily || 'sans'}
            onChange={(v) => handleChange('fontFamily', v)}
            mainColor={mainColor}
          />


          {/* Độ đậm chữ */}
          <SettingOption
            label={t('fontWeightLabel')}
            options={[
              { val: 'normal', label: t('textNormal') },
              { val: 'bold', label: t('textBold') }
            ]}
            current={localSettings.fontWeight || 'bold'}
            onChange={(v) => handleChange('fontWeight', v)}
            mainColor={mainColor}
          />


          {/* Giọng đọc & Tốc độ đọc (Diệt S22 & S23) */}
          <div className="space-y-3">
            <label className="text-sm font-bold">
              {t('voiceSpeed')} ({safeRate}x)
            </label>
            <div className="flex gap-2">
              <select
                value={localSettings.selectedVoice || ''}
                onChange={(e) => handleChange('selectedVoice', e.target.value)}
                className="w-full p-2 border rounded flex-1 text-sm bg-white"
              >
                <option value="">Mặc định trình duyệt</option>
                {voiceOptions.map((v, idx) => (
                  <option key={`${v?.name || 'voice'}_${v?.lang || ''}_${idx}`} value={v?.name || ''}>
                    {v?.name} ({v?.lang})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const v = safeVoices.find(
                    (voice) => voice?.name === localSettings.selectedVoice
                  );
                  const text = currentLang === 'zh' ? '你好' : 'Hello';
                  if (typeof testSpeak === 'function') {
                    testSpeak(text, safeRate, v);
                  }
                }}
                className={`p-2 rounded transition-colors ${theme.voiceBtn}`}
                title={t('ttTestVoice')}
                aria-label={t('ttTestVoice') || 'Nghe thử giọng đọc'}
              >
                <Icons.Volume2 size={20} />
              </button>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={safeRate}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (Number.isFinite(parsed)) handleChange('rate', parsed);
              }}
              className={`w-full ${theme.accent}`}
            />
          </div>


          {/* Cỡ chữ & Kích thước thẻ */}
          <div className="grid grid-cols-2 gap-4">
            <SettingSlider
              label={`${t('fontSize')} (Trước)`}
              val={Number(localSettings.fontSize) || 3}
              min={1.5}
              max={5}
              step={0.2}
              onChange={(v) => handleChange('fontSize', v)}
              suffix="rem"
              mainColor={mainColor}
            />
            <SettingSlider
              label={`${t('fontSize')} (Sau)`}
              val={Number(localSettings.backFontSize) || 1.25}
              min={0.7}
              max={2.5}
              step={0.1}
              onChange={(v) => handleChange('backFontSize', v)}
              suffix="rem"
              mainColor={mainColor}
            />
          </div>
          <div className="mt-2">
            <SettingSlider
              label={t('cardSize')}
              val={Number(localSettings.cardSize) || 1}
              min={0.8}
              max={2.0}
              step={0.1}
              onChange={(v) => handleChange('cardSize', v)}
              suffix="x"
              mainColor={mainColor}
            />
          </div>


          {/* Cấu hình Tự động phát (Auto-Play) — dùng Math.round chống sai số float (Diệt S22) */}
          <div className="pt-4 border-t">
            <h3 className="text-sm font-bold uppercase mb-3 text-gray-500">
              {t('autoConfig')}
            </h3>
            <div className="space-y-4">
              <SettingSlider
                label={`${t('delayFlip')} (Đọc → Lật)`}
                val={(Number(localSettings.delayAfterRead) || 2000) / 1000}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(v) =>
                  handleChange('delayAfterRead', Math.round(v * 1000))
                }
                suffix="s"
                mainColor={mainColor}
              />
              <SettingSlider
                label={`${t('delayReveal')} (Xem → Ẩn)`}
                val={(Number(localSettings.delayFlip) || 2000) / 1000}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(v) =>
                  handleChange('delayFlip', Math.round(v * 1000))
                }
                suffix="s"
                mainColor={mainColor}
              />
              <SettingSlider
                label={`${t('delayNext')} (Ẩn → Mới)`}
                val={(Number(localSettings.delayNext) || 1500) / 1000}
                min={0.5}
                max={20}
                step={0.5}
                onChange={(v) =>
                  handleChange('delayNext', Math.round(v * 1000))
                }
                suffix="s"
                mainColor={mainColor}
              />
              <SettingSlider
                label={t('repeatCount')}
                val={Number(localSettings.repeatCount) || 1}
                min={1}
                max={10}
                step={1}
                onChange={(v) => handleChange('repeatCount', Math.round(v))}
                suffix=" lần"
                mainColor={mainColor}
              />
            </div>
          </div>


          {/* Bộ đếm Token */}
          <div className="bg-gray-100 p-3 rounded-lg flex justify-between items-center text-xs text-gray-500 font-mono mt-4">
            <span>Tổng Token đã dùng:</span>
            <div className="flex items-center gap-2">
              <span className={`font-bold ${theme.tokenText}`}>
                {(localTotalTokens || 0).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={handleResetTokens}
                className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                  confirmTokenReset
                    ? 'bg-red-500 text-white font-bold animate-pulse'
                    : 'text-gray-400 hover:text-red-500 hover:bg-gray-200'
                }`}
                title="Đặt lại bộ đếm Token"
                aria-label="Đặt lại bộ đếm Token"
              >
                <Icons.RotateCcw size={14} />
                {confirmTokenReset && (
                  <span className="text-[10px]">Xác nhận?</span>
                )}
              </button>
            </div>
          </div>


          {/* Hộp đen sự kiện (System Logs) */}
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              aria-expanded={showLogs}
              onClick={() => setShowLogs((prev) => !prev)}
              className="w-full bg-gray-50 p-3 flex justify-between items-center hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                <Icons.AlertCircle size={16} className="text-gray-500" /> Nhật
                ký hệ thống ({safeSystemLogs.length})
              </div>
              <Icons.ChevronDown
                size={16}
                className={`text-gray-400 transition-transform ${
                  showLogs ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showLogs && (
              <div className="p-3 bg-white border-t border-gray-200">
                {safeSystemLogs.length > 0 ? (
                  <div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 mb-3 pr-1">
                      {safeSystemLogs.map((log, idx) => {
                        const rawMsg =
                          typeof log?.message === 'string' && log.message
                            ? log.message
                            : 'Unknown Error';
                        const parts = rawMsg.split(' | Detail: ');
                        const mainMsg = parts[0];
                        const detailMsg = parts.slice(1).join(' | Detail: ');
                        return (
                          <div
                            key={log?.id ?? `log_${idx}`}
                            className={`p-2.5 rounded-lg border text-xs flex gap-2 items-start ${
                              log?.type === 'error'
                                ? 'bg-red-50 border-red-100 text-red-700'
                                : 'bg-orange-50 border-orange-100 text-orange-700'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {log?.type === 'error' ? (
                                <Icons.X size={14} className="text-red-500" />
                              ) : (
                                <Icons.AlertCircle
                                  size={14}
                                  className="text-orange-500"
                                />
                              )}
                            </div>
                            <div className="flex flex-col gap-1 w-full overflow-hidden">
                              <span className="font-mono text-[9px] opacity-70 tracking-widest">
                                {log?.timeStr || ''}
                              </span>
                              <span className="font-bold break-words leading-tight">
                                {mainMsg}
                              </span>
                              {detailMsg && (
                                <div className="mt-1 p-2 bg-white/60 rounded border border-red-200/50 text-[10px] font-mono break-all text-red-900/80 shadow-inner">
                                  <span className="font-bold text-red-600 mb-0.5 block uppercase tracking-wider">
                                    Technical Detail:
                                  </span>
                                  {detailMsg}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof onClearLogs === 'function') onClearLogs();
                      }}
                      className="w-full py-2.5 bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95 shadow-sm"
                    >
                      <Icons.Trash2 size={16} /> Xóa nhật ký
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-gray-400 italic">
                    Nhật ký trống. Hệ thống đang hoạt động ổn định.
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Nút Làm mới Ngân hàng AI & Reset Cài đặt */}
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleResetAIBank}
              className={`w-full p-3 rounded flex items-center justify-center gap-2 transition-colors font-bold ${
                confirmAiReset
                  ? 'bg-orange-500 text-white border border-orange-600 animate-pulse'
                  : theme.aiResetBtn
              }`}
              title="Xóa bộ nhớ đệm để AI ra đề lại từ đầu"
            >
              <Icons.RefreshCw size={16} />{' '}
              {confirmAiReset
                ? 'Nhấn lần nữa để xác nhận xóa trí nhớ AI!'
                : 'Làm mới Ngân hàng đề AI'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof onResetData === 'function') onResetData();
              }}
              className="w-full p-3 text-red-600 border border-red-200 rounded flex items-center justify-center gap-2 hover:bg-red-50 transition-colors"
            >
              <Icons.Trash2 size={16} /> {t('resetData')}
            </button>
          </div>
        </div>


        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-5 py-2 rounded text-gray-600 font-bold hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-5 py-2 rounded ${theme.primaryBtn} text-white font-bold flex items-center gap-2 transition-colors`}
          >
            <Icons.Check size={18} /> OK
          </button>
        </div>
      </div>
    </div>
  );
};


// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).SettingsModal = SettingsModal;
}


export default SettingsModal;

