/**
 * @file src/components/common/Controls.jsx
 * @description Các component điều khiển dùng chung (Switch, Toggle, Selectors).
 * @origin Tầng 3 - Block 3.1 & 3.2 (Shared UI Components)
 */

import React, { useState } from 'react';
import { Icons } from './Icons';
import { IoeDataEngine } from '@/engines/pedagogyEngine';

export const AiModeSwitch = ({ isAiMode, setAiMode, t, onMissingKey, isLoading, className }) => (
  <div
    className={`flex items-center gap-1 cursor-pointer p-1 rounded-lg hover:bg-gray-50/80 transition-colors ${className || ''}`}
    onClick={(e) => {
      e.stopPropagation();
      if (!isAiMode && !localStorage.getItem('fc_gemini_api_key') && !localStorage.getItem('fc_apikey')) onMissingKey();
      else setAiMode(!isAiMode);
    }}
    title={isLoading ? "AI đang xử lý..." : (isAiMode ? "Chế độ AI: Tự động điền (Đang BẬT)" : "Chế độ AI: Tự động điền (Đang TẮT)")}
  >
    <div className="relative flex items-center justify-center p-1">
      <Icons.Sparkles size={20} className={isLoading ? "text-purple-600 animate-spin" : (isAiMode ? "text-purple-600 fill-purple-100" : "text-gray-300")} />
    </div>
    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-300 flex-none border shadow-sm ${isAiMode ? 'bg-purple-500 border-purple-500' : 'bg-gray-200 border-gray-300'}`}>
      <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isAiMode ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
  </div>
);

// [VÁ LỖI TẦNG 3] Bảo vệ thuộc tính 'icon' không bị undefined
export const MenuToggle = ({ active, setActive, icon: Icon, color, title, subtitle, extra, disabled }) => {
  const activeClass = active ? "bg-" + color + "-50 border-" + color + "-200" : "bg-white border-gray-200";
  const disabledClass = disabled ? "opacity-50 grayscale cursor-not-allowed" : "";
  
  return (
    <div className={`px-4 py-3 rounded-xl border transition-all ${activeClass} ${disabledClass}`}>
      <div className={`flex items-center justify-between ${!disabled ? 'cursor-pointer' : ''}`} onClick={() => !disabled && setActive(!active)}>
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`p-2 rounded-full ${active ? "bg-" + color + "-100 text-" + color + "-600" : "bg-gray-100 text-gray-400"}`}>
              <Icon size={18} />
            </div>
          )}
          <div className="text-left">
            <div className={`text-sm font-bold ${active ? "text-" + color + "-800" : "text-gray-600"}`}>{title}</div>
            <div className="text-xs text-gray-500">{subtitle}</div>
          </div>
        </div>
        <div className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-300 flex-none ${active ? "bg-" + color + "-500" : "bg-gray-300"}`}>
          <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${active ? 'translate-x-5' : ''}`}></div>
        </div>
      </div>
      {active && extra && !disabled && extra}
    </div>
  );
};

// [CẬP NHẬT V2.0] Bộ chọn Cấp độ (Level Selector) - MULTI-SELECT
export const LevelSelector = ({ lang, currentLevel, onSelectLevel, mainColor = 'blue' }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const enLevels = [
    { id: 'en_level_1', label: 'Kiddie', sub: 'Lớp 1-2' },
    { id: 'en_level_2', label: 'Junior', sub: 'Lớp 3-4' },
    { id: 'en_level_3', label: 'Junior+', sub: 'Lớp 5' },
    { id: 'en_level_4', label: 'Discovery', sub: 'Lớp 6-7' },
    { id: 'en_level_5', label: 'Discovery+', sub: 'Lớp 8-9' },
    { id: 'en_level_6', label: 'Pre-IELTS', sub: 'IELTS 4.0' },
    { id: 'en_level_7', label: 'Breakthrough', sub: 'IELTS 5.0' },
    { id: 'en_level_8', label: 'Academic', sub: 'IELTS 6.5' },
    { id: 'en_level_9', label: 'Expert', sub: 'IELTS 7.5+' }
  ];
  
  const zhLevels = [
    { id: 'zh_level_1', label: 'HSK 1', sub: 'Sơ cấp' },
    { id: 'zh_level_2', label: 'HSK 2', sub: 'Sơ cấp' },
    { id: 'zh_level_3', label: 'HSK 3', sub: 'Sơ cấp' },
    { id: 'zh_level_4', label: 'HSK 4', sub: 'Trung cấp' },
    { id: 'zh_level_5', label: 'HSK 5', sub: 'Trung cấp' },
    { id: 'zh_level_6', label: 'HSK 6', sub: 'Trung cấp' },
    { id: 'zh_level_7', label: 'HSK 7', sub: 'Cao cấp' },
    { id: 'zh_level_8', label: 'HSK 8', sub: 'Cao cấp' },
    { id: 'zh_level_9', label: 'HSK 9', sub: 'Cao cấp' }
  ];
  
  const levels = lang === 'zh' ? zhLevels : enLevels;
  
  // Tự động chuyển đổi String (legacy) sang Array
  const currentArr = Array.isArray(currentLevel) ? currentLevel : (currentLevel ? [currentLevel] : []);
  
  const handleToggle = (id) => {
    if (currentArr.includes(id)) {
      onSelectLevel(currentArr.filter(x => x !== id));
    } else {
      onSelectLevel([...currentArr, id]);
    }
  };
  
  // Logic tính toán nhãn hiển thị bên ngoài Dropdown
  let displayMain = "Tất cả";
  let displaySub = "Cấp độ";
  if (currentArr.length === 1) {
    const obj = levels.find(l => l.id === currentArr[0]);
    if (obj) { displayMain = obj.label; displaySub = obj.sub; }
  } else if (currentArr.length > 1) {
    displayMain = `Đã chọn ${currentArr.length}`;
    displaySub = "Nhiều cấp độ";
  }
  
  return (
    <div className="relative inline-block text-left w-full h-full">
      <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center justify-between w-full h-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors`}>
        <div className="flex flex-col items-start overflow-hidden">
          <span className={`text-[10px] sm:text-[11px] font-bold text-${mainColor}-700 leading-none truncate`}>{displayMain}</span>
          <span className="text-[8px] sm:text-[9px] text-gray-400 font-medium leading-none mt-1 truncate">{displaySub}</span>
        </div>
        <Icons.ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
      )}
      
      {isOpen && (
        <div className="absolute right-0 left-0 mt-1 min-w-[160px] bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Nút Reset chọn tất cả */}
          <button onClick={() => { onSelectLevel([]); setIsOpen(false); }} className={`w-full text-left px-3 py-2 flex items-center justify-between border-b border-gray-100 transition-colors ${currentArr.length === 0 ? "bg-" + mainColor + "-50 text-" + mainColor + "-700" : "text-gray-700 hover:bg-gray-50"}`}>
            <span className="font-bold text-sm">Tất cả cấp độ</span>
            {currentArr.length === 0 && <Icons.Check size={16} className={`text-${mainColor}-500`} />}
          </button>
          
          {/* Danh sách các Cấp độ với Checkbox */}
          {levels.map(lv => {
            const isSelected = currentArr.includes(lv.id);
            return (
              <button key={lv.id} onClick={() => handleToggle(lv.id)} className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-gray-50`}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "bg-" + mainColor + "-500 border-" + mainColor + "-500 text-white" : "border-gray-300 bg-white"}`}>
                  {isSelected && <Icons.Check size={12} strokeWidth={3} />}
                </div>
                <div className="flex flex-col flex-1">
                  <span className={`font-bold text-sm ${isSelected ? "text-" + mainColor + "-700" : "text-gray-700"}`}>{lv.label}</span>
                  <span className="text-[10px] text-gray-400">{lv.sub}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// [CẬP NHẬT V2.01] Bộ chọn Chủ đề (Topic Selector) - MULTI-SELECT (Bulletproof String Handling)
export const TopicSelectorDropdown = ({ currentLevel, currentTopic, onSelectTopic, mainColor = 'blue' }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Mảng hóa state cho tương thích ngược (chống TypeError)
  const levelArr = Array.isArray(currentLevel) ? currentLevel : (currentLevel ? [currentLevel] : []);
  const topicArr = Array.isArray(currentTopic) ? currentTopic : (currentTopic ? [currentTopic] : []);
  
  const fallbackTopics = ["Self & Body", "Social Connections", "Living Spaces", "The Natural World", "Food & Health", "Daily Life & Leisure", "School & Career", "Travel & Exploration", "Other"];
  
  // Hợp nhất Chủ đề từ nhiều Level
  let topics = fallbackTopics;
  const rawTopics = IoeDataEngine?.TOPICS;
  
  if (Array.isArray(rawTopics) && rawTopics.length > 0) {
    topics = rawTopics;
  } else if (rawTopics && typeof rawTopics === 'object' && !Array.isArray(rawTopics)) {
    let merged = new Set();
    if (levelArr.length > 0) {
      levelArr.forEach(lv => {
        if (rawTopics[lv] && Array.isArray(rawTopics[lv])) {
          rawTopics[lv].forEach(t => merged.add(t));
        }
      });
      if (merged.size > 0) topics = Array.from(merged);
    } else {
      // Nếu không chọn level nào, lấy tất cả chủ đề có thể
      Object.values(rawTopics).forEach(arr => {
        if(Array.isArray(arr)) arr.forEach(t => merged.add(t));
      });
      if (merged.size > 0) topics = Array.from(merged);
    }
  }
  
  const handleToggle = (topic) => {
    if (topicArr.includes(topic)) {
      onSelectTopic(topicArr.filter(x => x !== topic));
    } else {
      onSelectTopic([...topicArr, topic]);
    }
  };
  
  // Logic tính toán nhãn hiển thị an toàn tuyệt đối
  let displayLabel = "Tất cả chủ đề";
  if (topicArr.length === 1) {
    const firstTopic = topicArr[0];
    if (typeof firstTopic === 'string') {
      // Thay thế .split() bằng .indexOf() và .substring() để an toàn bộ nhớ
      const braceIndex = firstTopic.indexOf(' (');
      const cleanTopic = braceIndex !== -1 ? firstTopic.substring(0, braceIndex) : firstTopic;
      displayLabel = cleanTopic.length > 15 ? cleanTopic.substring(0, 15) + '...' : cleanTopic;
    } else {
      displayLabel = "1 chủ đề";
    }
  } else if (topicArr.length > 1) {
    displayLabel = `Đã chọn ${topicArr.length} chủ đề`;
  }
  
  return (
    <div className="relative inline-block text-left w-full h-full">
      <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center justify-between w-full h-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors`}>
        <div className="flex flex-col items-start overflow-hidden w-full">
          <span className={`text-[10px] sm:text-[11px] font-bold text-${mainColor}-700 leading-none truncate`}>Chủ đề</span>
          <span className="text-[8px] sm:text-[9px] text-gray-500 font-medium leading-none mt-1 truncate w-full text-left">{displayLabel}</span>
        </div>
        <Icons.ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>}
      
      {isOpen && (
        <div className="absolute right-0 left-0 mt-1 min-w-[200px] bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Nút Reset chọn tất cả */}
          <button onClick={() => { onSelectTopic([]); setIsOpen(false); }} className={`w-full text-left px-3 py-2 flex items-center justify-between border-b border-gray-100 transition-colors ${topicArr.length === 0 ? "bg-" + mainColor + "-50 text-" + mainColor + "-700" : "text-gray-700 hover:bg-gray-50"}`}>
            <span className="font-bold text-sm">Tất cả chủ đề</span>
            {topicArr.length === 0 && <Icons.Check size={16} className={`text-${mainColor}-500`} />}
          </button>
          
          {/* Danh sách Chủ đề với Checkbox */}
          {topics.map((topic, idx) => {
            const isSelected = topicArr.includes(topic);
            return (
              <button key={idx} onClick={() => handleToggle(topic)} className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors hover:bg-gray-50`}>
                <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "bg-" + mainColor + "-500 border-" + mainColor + "-500 text-white" : "border-gray-300 bg-white"}`}>
                  {isSelected && <Icons.Check size={12} strokeWidth={3} />}
                </div>
                <span className={`font-bold text-xs w-full leading-snug ${isSelected ? "text-" + mainColor + "-700" : "text-gray-700"}`}>{topic}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TopicSelector = TopicSelectorDropdown;