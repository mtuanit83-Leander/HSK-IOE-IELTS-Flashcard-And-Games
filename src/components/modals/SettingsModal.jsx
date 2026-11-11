/**
 * @file src/components/modals/SettingsModal.jsx
 * @description Chứa giao diện Cài đặt toàn hệ thống (Giao diện, Phông chữ, Âm thanh, Auto-play, SRS, System Logs).
 * @origin Tầng 4 - Block 4.2 (Settings Modal)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '@/components/common/Icons';
import { STORAGE_KEYS, AI_MODELS } from '@/config/constants';
import { Utils } from '@/utils/helpers';

// Helper Components cho SRS Settings
const NumberUnitInput = ({ value, onChange, label }) => (
  <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-2 py-1 shadow-sm focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400">
    <input
      type="number"
      min="0"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-8 text-right font-mono font-bold text-gray-700 outline-none text-sm p-0 m-0"
      placeholder="0"
    />
    <span className="text-[10px] text-gray-400 font-bold uppercase select-none">{label}</span>
  </div>
);

const LevelConfigRow = ({ levelLabel, color, valueStr, onChange }) => {
  const parse = (str) => {
    let d = 0, h = 0, m = 0;
    if (!str) return { d, h, m };
    const matchD = str.match(/(\d+)d/); if (matchD) d = parseInt(matchD[1]);
    const matchH = str.match(/(\d+)h/); if (matchH) h = parseInt(matchH[1]);
    const matchM = str.match(/(\d+)m/); if (matchM) m = parseInt(matchM[1]);
    return { d, h, m };
  };
  
  const format = (obj) => {
    let parts = [];
    if (obj.d > 0) parts.push(`${obj.d}d`);
    if (obj.h > 0) parts.push(`${obj.h}h`);
    if (obj.m > 0) parts.push(`${obj.m}m`);
    return parts.join(' ') || '0m';
  };
  
  const data = parse(valueStr);
  
  const handleChange = (field, val) => {
    const num = parseInt(val) || 0;
    const newData = { ...data, [field]: num };
    onChange(format(newData));
  };
  
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-lg border-l-4 bg-gray-50 border-${color}-500 shadow-sm mb-2`}>
      <div className="mb-2 sm:mb-0 flex items-center gap-2">
        <span className={`text-xs font-bold uppercase text-${color}-600 min-w-[60px]`}>{levelLabel}</span>
        <span className="text-[10px] text-gray-400 bg-white px-1 rounded border hidden sm:inline-block">{valueStr}</span>
      </div>
      <div className="flex gap-2">
        <NumberUnitInput value={data.d} onChange={(v) => handleChange('d', v)} label="d" />
        <NumberUnitInput value={data.h} onChange={(v) => handleChange('h', v)} label="h" />
        <NumberUnitInput value={data.m} onChange={(v) => handleChange('m', v)} label="m" />
      </div>
    </div>
  );
};

const SettingOption = ({ label, options, current, onChange, mainColor }) => (
  <div className="space-y-2">
    <label className="text-sm font-bold">{label}</label>
    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
      {options.map(opt => (
        <button key={opt.val.toString()} onClick={() => onChange(opt.val)} className={`flex-1 py-1 rounded text-xs font-bold transition-all ${current === opt.val ? `bg-white text-${mainColor}-600 shadow` : 'text-gray-500'}`} style={opt.style}>
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

const SettingSlider = ({ label, val, min, max, step, onChange, suffix = '', mainColor }) => (
  <div className="space-y-1">
    <div className="flex justify-between"><label className="text-xs text-gray-600">{label}</label><span className="text-xs font-mono">{val}{suffix}</span></div>
    <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${mainColor}-500`} />
  </div>
);

export const SettingsModal = ({ isOpen, onClose, onApply, initialSettings, voices, testSpeak, onResetData, currentLang, t, uiLang, setUiLang, mainColor, onDone, onUpdate, totalTokens, onResetTokens, systemLogs, onClearLogs }) => {
  const [originalSettings] = useState(initialSettings);
  const [localSettings, setLocalSettings] = useState(initialSettings);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const [keyStats, setKeyStats] = useState({ count: 0, active: 'Chưa có' });
  const [localTotalTokens, setLocalTotalTokens] = useState(totalTokens || 0);
  const [showLogs, setShowLogs] = useState(false); // Trạng thái mở/đóng hộp đen sự kiện
  
  const safeVoices = Array.isArray(voices) ? voices : [];
  const filteredVoices = safeVoices.filter(v => {
    const voiceLang = v.lang.replace('_', '-').toLowerCase();
    if (currentLang === 'zh') {
      return voiceLang.startsWith('zh') || voiceLang.startsWith('cmn') || voiceLang.includes('cn') || voiceLang.includes('tw') || voiceLang.includes('hk');
    }
    return voiceLang.startsWith(currentLang);
  });
  
  const voiceOptions = filteredVoices.length > 0 ? filteredVoices : safeVoices;
  
  useEffect(() => {
    setLocalSettings(initialSettings);
  }, [isOpen, initialSettings]);
  
  useEffect(() => {
    setLocalTotalTokens(totalTokens || 0);
  }, [totalTokens]);
  
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
      const pool = Utils.safeJsonParse('fc_apikey_pool', []);
      const currentKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
      setKeyStats({ count: pool?.length || 0, active: currentKey ? `...${currentKey.slice(-5)}` : 'Chưa có' });
      // Đồng bộ cưỡng bức từ ổ cứng lên State khi mở Modal
      const savedTokens = parseInt(localStorage.getItem('fc_total_tokens') || '0', 10);
      setLocalTotalTokens(savedTokens);
    }
  }, [isOpen]);
  
  const handleChange = (key, value) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    if (onUpdate) onUpdate(newSettings);
  };
  
  const handleCancel = () => {
    if (onUpdate) onUpdate(originalSettings); // Revert
    onClose();
  };
  
  const handleSave = () => {
    onDone();
  };
  
  const handleMouseDown = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    dragRef.current = { isDragging: true, startX: clientX, startY: clientY, initialX: position.x, initialY: position.y };
    
    const move = (e) => {
      if (!dragRef.current.isDragging) return;
      if (e.cancelable) e.preventDefault();
      const cx = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
      const cy = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      setPosition({ x: dragRef.current.initialX + dx, y: dragRef.current.initialY + dy });
    };
    
    const up = () => {
      dragRef.current.isDragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };
    
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  };
  
  const handleResetAIBank = () => {
    if (window.confirm("Bạn có chắc chắn muốn làm mới Ngân hàng đề AI?\n\nHành động này sẽ xóa trí nhớ của AI. Trong các lượt chơi tiếp theo, AI có thể sẽ ra lại những từ vựng cơ bản mà bạn đã gặp trước đó.")) {
      localStorage.removeItem('fc_ai_memory_en');
      localStorage.removeItem('fc_ai_memory_zh');
      localStorage.removeItem('fc_ai_memory'); // Dọn dẹp rác legacy (nếu còn)
      localStorage.removeItem('fc_match_history');
      if (window.globalShowToast) {
        window.globalShowToast("Đã làm mới! Hệ thống đang tải lại...", "success");
      }
      setTimeout(() => window.location.reload(), 500); // Ép reload để xóa RAM
    }
  };
  
  const handleResetTokens = () => {
    if (window.confirm("Bạn có chắc chắn muốn đặt lại bộ đếm Token về 0?")) {
      localStorage.setItem('fc_total_tokens', '0');
      setLocalTotalTokens(0);
      if (onResetTokens) onResetTokens(0);
      if (window.globalShowToast) window.globalShowToast("Đã đặt lại bộ đếm Token", "success");
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-transparent pointer-events-auto"></div>
      <div className="bg-white/95 backdrop-blur-md shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col z-10 overflow-hidden pointer-events-auto rounded-xl border border-gray-200 transition-transform duration-75 ease-out" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <div className="flex justify-between items-center p-4 border-b bg-gray-50/80 cursor-move select-none active:bg-gray-100 transition-colors" onMouseDown={handleMouseDown} onTouchStart={handleMouseDown}>
          <h2 className="text-xl font-bold flex items-center gap-2 pointer-events-none text-gray-700"><Icons.Settings size={20} className="text-gray-500" /> {t('settingsTitle')}</h2>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 flex justify-between items-center text-xs">
            <div className="flex flex-col">
              <span className="font-bold text-purple-700">API Key Pool:</span>
              <span className="text-purple-600 font-mono">Đã nạp: {keyStats.count} keys</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="font-bold text-purple-700">Key đang dùng:</span>
              <span className="text-green-600 font-mono font-bold bg-white px-2 rounded border border-purple-100">{keyStats.active}</span>
            </div>
          </div>
          
          <SettingOption label={t('uiLanguage')} options={[{ val: 'en', label: 'EN' }, { val: 'zh', label: 'CN' }]} current={uiLang} onChange={setUiLang} mainColor={mainColor} />
          
          <div className="space-y-2">
            <SettingOption label="Chế độ SRS (Lặp lại ngắt quãng)" options={[{ val: true, label: 'Bật' }, { val: false, label: 'Tắt' }]} current={localSettings.srsEnabled !== false} onChange={(v) => handleChange('srsEnabled', v)} mainColor={mainColor} />
            {localSettings.srsEnabled !== false && (
              <div className="animate-in fade-in slide-in-from-top-2 pt-2">
                <LevelConfigRow levelLabel={t('srsHard') || "Khó"} color="orange" valueStr={localSettings.srsHard || '2d'} onChange={(v) => handleChange('srsHard', v)} />
                <LevelConfigRow levelLabel={t('srsGood') || "Tốt"} color="blue" valueStr={localSettings.srsGood || '4d'} onChange={(v) => handleChange('srsGood', v)} />
                <LevelConfigRow levelLabel={t('srsEasy') || "Dễ"} color="green" valueStr={localSettings.srsEasy || '7d'} onChange={(v) => handleChange('srsEasy', v)} />
              </div>
            )}
          </div>
          
          <SettingOption label={t('displayMode')} options={[{ val: 'term', label: t('termFirst') }, { val: 'def', label: t('defFirst') }]} current={localSettings.startSide} onChange={(v) => handleChange('startSide', v)} mainColor={mainColor} />
          
          <SettingOption label={t('fontLabel')} options={[{ val: 'sans', label: 'Sans' }, { val: 'serif', label: 'Serif' }, { val: 'kaiti', label: 'Ma Shan', style: { fontFamily: '"Ma Shan Zheng", cursive' } }, { val: 'cn_kaiti', label: '楷体', style: { fontFamily: '"KaiTi", "STKaiti", "楷体", "Ma Shan Zheng", serif' } }, { val: 'callig', label: 'Thư pháp', style: { fontFamily: '"Long Cang", cursive' } }]} current={localSettings.fontFamily} onChange={(v) => handleChange('fontFamily', v)} mainColor={mainColor} />
          
          <SettingOption label={t('fontWeightLabel')} options={[{ val: 'normal', label: t('textNormal') }, { val: 'bold', label: t('textBold') }]} current={localSettings.fontWeight || 'bold'} onChange={(v) => handleChange('fontWeight', v)} mainColor={mainColor} />
          
          <div className="space-y-3">
            <label className="text-sm font-bold">{t('voiceSpeed')} ({localSettings.rate}x)</label>
            <div className="flex gap-2">
              <select value={localSettings.selectedVoice || ''} onChange={(e) => handleChange('selectedVoice', e.target.value)} className="w-full p-2 border rounded flex-1 text-sm">
                {voiceOptions.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
              <button
                onClick={() => {
                  const v = safeVoices.find(voice => voice.name === localSettings.selectedVoice);
                  const text = currentLang === 'zh' ? "你好" : "Hello";
                  testSpeak(text, localSettings.rate, v);
                }}
                className={`p-2 bg-${mainColor}-100 text-${mainColor}-600 rounded`}
                title={t('ttTestVoice')}
              >
                <Icons.Volume2 size={20} />
              </button>
            </div>
            <input type="range" min="0.5" max="2" step="0.1" value={localSettings.rate || 0.8} onChange={(e) => handleChange('rate', parseFloat(e.target.value))} className={`w-full accent-${mainColor}-500`} />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <SettingSlider label={`${t('fontSize')} (Trước)`} val={localSettings.fontSize || 3} min={1.5} max={5} step={0.2} onChange={(v) => handleChange('fontSize', v)} suffix="rem" mainColor={mainColor} />
            <SettingSlider label={`${t('fontSize')} (Sau)`} val={localSettings.backFontSize || 1.25} min={0.7} max={2.5} step={0.1} onChange={(v) => handleChange('backFontSize', v)} suffix="rem" mainColor={mainColor} />
          </div>
          
          <div className="mt-2">
            <SettingSlider label={t('cardSize')} val={localSettings.cardSize || 1} min={0.8} max={2.0} step={0.1} onChange={(v) => handleChange('cardSize', v)} suffix="x" mainColor={mainColor} />
          </div>
          
          <div className="pt-4 border-t">
            <h3 className="text-sm font-bold uppercase mb-3 text-gray-500">{t('autoConfig')}</h3>
            <div className="space-y-4">
              <SettingSlider label={`${t('delayFlip')} (Đọc → Lật)`} val={(localSettings.delayAfterRead || 2000) / 1000} min={0.5} max={20} step={0.5} onChange={(v) => handleChange('delayAfterRead', v * 1000)} suffix="s" mainColor={mainColor} />
              <SettingSlider label={`${t('delayReveal')} (Xem → Ẩn)`} val={(localSettings.delayFlip || 2000) / 1000} min={0.5} max={20} step={0.5} onChange={(v) => handleChange('delayFlip', v * 1000)} suffix="s" mainColor={mainColor} />
              <SettingSlider label={`${t('delayNext')} (Ẩn → Mới)`} val={(localSettings.delayNext || 1500) / 1000} min={0.5} max={20} step={0.5} onChange={(v) => handleChange('delayNext', v * 1000)} suffix="s" mainColor={mainColor} />
              <SettingSlider label={t('repeatCount')} val={localSettings.repeatCount || 1} min={1} max={10} step={1} onChange={(v) => handleChange('repeatCount', v)} suffix=" lần" mainColor={mainColor} />
            </div>
          </div>
          
          <div className="bg-gray-100 p-3 rounded-lg flex justify-between items-center text-xs text-gray-500 font-mono mt-4">
            <span>Tổng Token đã dùng:</span>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-${mainColor}-600`}>{(localTotalTokens || 0).toLocaleString()}</span>
              <button onClick={handleResetTokens} className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-200 rounded transition-colors" title="Đặt lại bộ đếm Token">
                <Icons.RotateCcw size={14} />
              </button>
            </div>
          </div>
          
          {/* [HỘP ĐEN SỰ KIỆN] UI Hiển thị Log - Đã nâng cấp xử lý Details */}
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setShowLogs(!showLogs)} className="w-full bg-gray-50 p-3 flex justify-between items-center hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2 text-gray-700 font-bold text-sm">
                <Icons.AlertCircle size={16} className="text-gray-500"/> Nhật ký hệ thống ({systemLogs?.length || 0})
              </div>
              <Icons.ChevronDown size={16} className={`text-gray-400 transition-transform ${showLogs ? 'rotate-180' : ''}`} />
            </button>
            {showLogs && (
              <div className="p-3 bg-white border-t border-gray-200">
                {systemLogs && systemLogs.length > 0 ? (
                  <div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 mb-3 pr-1">
                      {systemLogs.map(log => {
                        const parts = log.message ? log.message.split(' | Detail: ') : ["Unknown Error"];
                        const mainMsg = parts[0];
                        const detailMsg = parts.slice(1).join(' | Detail: ');
                        
                        return (
                          <div key={log.id} className={`p-2.5 rounded-lg border text-xs flex gap-2 items-start ${log.type === 'error' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-orange-50 border-orange-100 text-orange-700'}`}>
                            <div className="mt-0.5 shrink-0">
                              {log.type === 'error' ? <Icons.X size={14} className="text-red-500" /> : <Icons.AlertCircle size={14} className="text-orange-500" />}
                            </div>
                            <div className="flex flex-col gap-1 w-full overflow-hidden">
                              <span className="font-mono text-[9px] opacity-70 tracking-widest">{log.timeStr}</span>
                              <span className="font-bold break-words leading-tight">{mainMsg}</span>
                              {detailMsg && (
                                <div className="mt-1 p-2 bg-white/60 rounded border border-red-200/50 text-[10px] font-mono break-all text-red-900/80 shadow-inner">
                                  <span className="font-bold text-red-600 mb-0.5 block uppercase tracking-wider">Technical Detail:</span>
                                  {detailMsg}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={onClearLogs} className="w-full py-2.5 bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-95 shadow-sm">
                      <Icons.Trash2 size={16} /> Xóa nhật ký
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-gray-400 italic">Nhật ký trống. Hệ thống đang hoạt động ổn định.</div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-4 space-y-2 px-6">
          <button onClick={handleResetAIBank} className={`w-full p-3 text-${mainColor}-600 border border-${mainColor}-200 rounded flex items-center justify-center gap-2 hover:bg-${mainColor}-50 transition-colors`} title="Xóa bộ nhớ đệm để AI ra đề lại từ đầu">
            <Icons.RefreshCw size={16} /> Làm mới Ngân hàng đề AI
          </button>
          <button onClick={onResetData} className="w-full p-3 text-red-600 border border-red-200 rounded flex items-center justify-center gap-2 hover:bg-red-50 transition-colors">
            <Icons.Trash2 size={16} /> {t('resetData')}
          </button>
        </div>
        
        <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3 mt-4">
          <button onClick={handleCancel} className="px-5 py-2 rounded text-gray-600 font-bold hover:bg-gray-200 transition-colors">Cancel</button>
          <button onClick={handleSave} className={`px-5 py-2 rounded ${mainColor ? `bg-${mainColor}-600` : 'bg-blue-600'} text-white font-bold flex items-center gap-2 hover:opacity-90 transition-colors`}>
            <Icons.Check size={18} /> OK
          </button>
        </div>
      </div>
    </div>
  );
};