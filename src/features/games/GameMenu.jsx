/**
 * @file src/features/games/GameMenu.jsx
 * @description Giao diện Menu chính chọn 10 Mini-games & Cấu hình Phòng thi Khảo thí (Mock Test).
 * @origin Tầng 5 - Block 5.7a (Game Menu & Exam Setup Hub)
 */


import React, { useState, useEffect } from 'react';
import { Icons } from '@/components/common/Icons';
import { LevelSelector, TopicSelectorDropdown } from '@/components/common/Controls';
import { ExamProfiles } from '@/engines/examProfiles';
import { STORAGE_KEYS } from '@/config/constants';
import { normalizeLevelAndTopic } from './common/gameHelpers';


// Icon Hình ảnh nội bộ an toàn cho Game Đoán Hình
const ImageIcon = ({ size = 22, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);


export const GameMenu = ({
  onSelectGame,
  onStartExam,
  onResumeExam,
  onOpenExamPoolManager,
  onOpenAiConfig,
  cardsCount = 0,
  lang = 'en',
  currentLevel,
  setCurrentLevel,
  currentTopic,
  setCurrentTopic,
  gameSessions = {},
  mainColor = 'blue',
  t
}) => {
  const [activeTab, setActiveTab] = useState('minigames'); // 'minigames' | 'exam'
  const [selectedProfileId, setSelectedProfileId] = useState(() =>
    lang === 'zh' ? 'hsk_mini' : 'ioe_mini'
  );
  const [mockDelay, setMockDelay] = useState(() => {
    const saved = localStorage.getItem('fc_mock_delay');
    return saved !== null ? parseInt(saved, 10) : 3;
  });
  const [activeExamSessionId, setActiveExamSessionId] = useState(null);


  // Tự động đồng bộ cấu hình đề thi mặc định khi đổi ngôn ngữ
  useEffect(() => {
    setSelectedProfileId(lang === 'zh' ? 'hsk_mini' : 'ioe_mini');
  }, [lang]);


  // Kiểm tra phiên thi Mock Test đang làm dở
  useEffect(() => {
    const savedExamId = localStorage.getItem(STORAGE_KEYS?.ACTIVE_EXAM || 'fc_active_exam');
    setActiveExamSessionId(savedExamId || null);
  }, [activeTab]);


  const handleDelayChange = (val) => {
    const num = Number(val);
    setMockDelay(num);
    localStorage.setItem('fc_mock_delay', String(num));
  };


  // Danh sách 10 Mini-Games
  const miniGames = [
    {
      id: 'quiz',
      name: t ? t('modeQuiz') || 'Trắc Nghiệm' : 'Trắc Nghiệm',
      desc: 'Phản xạ 4 đáp án đa chiều',
      icon: Icons.Layers,
      color: 'blue',
      badge: 'Phổ biến'
    },
    {
      id: 'match',
      name: t ? t('modeMatch') || 'Nối Ô Từ Vựng' : 'Nối Ô Từ Vựng',
      desc: 'Ghép cặp từ và nghĩa tốc độ cao',
      icon: Icons.Link,
      color: 'teal',
      badge: null
    },
    {
      id: 'scramble',
      name: t ? t('modeScramble') || 'Ghép Câu & Từ' : 'Ghép Câu & Từ',
      desc: 'Sắp xếp mảnh từ hoặc gõ câu',
      icon: Icons.Shuffle,
      color: 'indigo',
      badge: null
    },
    {
      id: 'fillblank',
      name: 'Điền Từ Khuyết',
      desc: 'Hoàn thiện chỗ trống ngữ cảnh',
      icon: Icons.Keyboard,
      color: 'purple',
      badge: 'Collocations'
    },
    {
      id: 'spotmistake',
      name: 'Tìm Lỗi Sai',
      desc: 'Bắt lỗi ngữ pháp & chính tả',
      icon: Icons.Target,
      color: 'red',
      badge: 'Grammar'
    },
    {
      id: 'oddoneout',
      name: 'Từ Khác Loại',
      desc: 'Tư duy phân nhóm từ vựng',
      icon: Icons.Eye,
      color: 'orange',
      badge: null
    },
    {
      id: 'imagequiz',
      name: 'Đoán Hình',
      desc: 'Ghi nhớ từ vựng qua hình ảnh',
      icon: ImageIcon,
      color: 'green',
      badge: 'Visual'
    },
    {
      id: 'pronunciation',
      name: 'Vua Ngữ Âm',
      desc: 'Phân biệt âm đọc & thanh điệu',
      icon: Icons.Mic,
      color: 'pink',
      badge: null
    },
    {
      id: 'listening',
      name: 'Đôi Tai Vàng',
      desc: 'Luyện nghe kịch bản & hội thoại',
      icon: Icons.Headphones,
      color: 'cyan',
      badge: 'Audio'
    },
    {
      id: 'reading',
      name: 'Đọc Hiểu',
      desc: 'Phân tích đoạn văn chuyên sâu',
      icon: Icons.BookOpen,
      color: 'amber',
      badge: 'Passage'
    }
  ];


  // Danh sách Cấu hình Đề thi Khảo thí (Lọc theo ngôn ngữ học hiện tại)
  const allProfiles = Object.values(ExamProfiles.PROFILES || {});
  const availableProfiles = allProfiles.filter((p) =>
    lang === 'zh' ? p.track === 'hsk' : p.track !== 'hsk'
  );


  const handleTriggerStartExam = () => {
    if (!onStartExam) return;
    const { pickedLevel, pickedTopic } = normalizeLevelAndTopic(
      currentLevel,
      currentTopic,
      lang
    );
    onStartExam(selectedProfileId, pickedLevel, pickedTopic);
  };


  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-xl p-4 sm:p-6 flex flex-col justify-between overflow-hidden border-2 border-gray-100 animate-in fade-in">
      {/* HEADER & CHUYỂN TAB (MINI-GAMES vs KHẢO THÍ) */}
      <div className="shrink-0 space-y-3 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl bg-${mainColor}-100 text-${mainColor}-600 shadow-sm`}>
              <Icons.Gamepad2 size={24} />
            </div>
            <div className="text-left">
              <h2 className="text-lg sm:text-xl font-black text-gray-800 leading-tight uppercase tracking-wide">
                Trung Tâm Trò Chơi & Khảo Thí
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                Đang có <b className={`text-${mainColor}-600`}>{cardsCount} thẻ</b> cục bộ • Hỗ trợ AI Tự Sinh vô hạn
              </p>
            </div>
          </div>


          {/* Nút mở nhanh Ngân hàng Đề thi & Cấu hình Lõi AI */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {onOpenExamPoolManager && (
              <button
                type="button"
                onClick={onOpenExamPoolManager}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Quản lý Ngân hàng Đề thi & Tỉ lệ Lai"
              >
                <Icons.Database size={14} />
                <span>Kho Đề Thi</span>
              </button>
            )}
            {onOpenAiConfig && (
              <button
                type="button"
                onClick={onOpenAiConfig}
                className="px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                title="Cấu hình tốc độ nạp đạn Lõi AI"
              >
                <Icons.Cpu size={14} />
                <span>Lõi AI</span>
              </button>
            )}
          </div>
        </div>


        {/* Thanh chuyển Tab */}
        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('minigames')}
            className={`py-2 px-3 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === 'minigames'
                ? `bg-white text-${mainColor}-700 shadow-sm`
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icons.Gamepad2 size={16} />
            <span>10 Mini-Games</span>
          </button>


          <button
            type="button"
            onClick={() => setActiveTab('exam')}
            className={`py-2 px-3 rounded-lg font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all relative ${
              activeTab === 'exam'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                : 'text-gray-600 hover:text-indigo-700'
            }`}
          >
            <Icons.Award size={16} />
            <span>Phòng Thi Ảo (Mock Test)</span>
            {activeExamSessionId && (
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping absolute top-1.5 right-2"></span>
            )}
          </button>
        </div>
      </div>


      {/* NỘI DUNG CHÍNH THEO TAB */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {activeTab === 'minigames' ? (
          /* ================================================================
             TAB 1: LƯỚI 10 MINI-GAMES
             ================================================================ */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-3 py-1">
            {miniGames.map((game) => {
              const IconComp = game.icon || Icons.Gamepad2;
              const hasSavedSession = Boolean(gameSessions && gameSessions[game.id]);


              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onSelectGame && onSelectGame(game.id)}
                  className="group relative p-3.5 rounded-2xl bg-white border-2 border-gray-100 hover:border-blue-300 hover:shadow-md transition-all active:scale-95 flex flex-col items-center text-center justify-between min-h-[128px]"
                >
                  {/* Huy hiệu Phiên chơi đang dở hoặc Nhãn tính năng */}
                  {hasSavedSession ? (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-100 text-orange-700 border border-orange-300 animate-pulse">
                      Đang dở
                    </span>
                  ) : (
                    game.badge && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-bold bg-gray-100 text-gray-500">
                        {game.badge}
                      </span>
                    )
                  )}


                  <div className={`w-12 h-12 rounded-2xl bg-${mainColor}-50 text-${mainColor}-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-sm border border-${mainColor}-100`}>
                    <IconComp size={24} />
                  </div>


                  <div>
                    <div className="font-black text-gray-800 text-xs sm:text-sm leading-tight mb-1">
                      {game.name}
                    </div>
                    <div className="text-[10px] text-gray-400 font-medium line-clamp-2 leading-snug">
                      {game.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* ================================================================
             TAB 2: CẤU HÌNH PHÒNG THI KHẢO THÍ (MOCK TEST)
             ================================================================ */
          <div className="space-y-4 py-1 animate-in fade-in">
            {/* Banner Khôi phục Ca thi đang dở */}
            {activeExamSessionId && onResumeExam && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-orange-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500 text-white shadow">
                    <Icons.Clock size={20} />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-black uppercase tracking-wider text-orange-800">
                      Có một bài thi đang tạm dừng!
                    </div>
                    <div className="text-[11px] text-orange-700 font-medium">
                      Bạn có thể tiếp tục làm bài ngay tại câu hỏi đã dừng trước đó.
                    </div>
                  </div>
                </div>


                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onResumeExam(activeExamSessionId)}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-orange-600 text-white font-bold text-xs rounded-xl shadow hover:bg-orange-700 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Icons.Play size={14} fill="currentColor" /> Tiếp tục thi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem(STORAGE_KEYS?.ACTIVE_EXAM || 'fc_active_exam');
                      setActiveExamSessionId(null);
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg"
                    title="Hủy phiên thi cũ"
                  >
                    <Icons.Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}


            {/* Chọn Cấu trúc Đề thi (Exam Profile Cards) */}
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase tracking-wider block text-left">
                1. Chọn Cấu Trúc Kỳ Thi ({lang === 'zh' ? 'Chuẩn HSK' : 'Chuẩn IOE & IELTS'})
              </label>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableProfiles.map((prof) => {
                  const isSelected = selectedProfileId === prof.id;
                  const minutes = Math.round((prof.timeLimit || 1800) / 60);


                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setSelectedProfileId(prof.id)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-2 ${
                        isSelected
                          ? 'bg-indigo-50/70 border-indigo-600 ring-2 ring-indigo-200 shadow-md'
                          : 'bg-white border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-700 mb-1">
                            {prof.track.toUpperCase()} • {prof.mode.toUpperCase()}
                          </span>
                          <h3 className="font-black text-gray-800 text-base leading-tight">
                            {prof.name}
                          </h3>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <Icons.Check size={12} strokeWidth={3} />}
                        </div>
                      </div>


                      <p className="text-xs text-gray-500 leading-relaxed">
                        {prof.description}
                      </p>


                      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 text-xs font-bold text-gray-600">
                        <span className="flex items-center gap-1">
                          <Icons.Layers size={14} className="text-indigo-500" />
                          {prof.totalQuestions} câu
                        </span>
                        <span className="flex items-center gap-1">
                          <Icons.Clock size={14} className="text-orange-500" />
                          {minutes} phút
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Chọn Cấp độ, Chủ đề & Độ trễ chuyển câu */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-3">
              <div className="text-xs font-black text-gray-500 uppercase tracking-wider text-left">
                2. Thiết lập Cấp độ & Tốc độ Phòng thi
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="h-[44px]">
                  <LevelSelector
                    lang={lang}
                    currentLevel={currentLevel}
                    onSelectLevel={setCurrentLevel}
                    mainColor="indigo"
                  />
                </div>


                <div className="h-[44px]">
                  <TopicSelectorDropdown
                    currentLevel={currentLevel}
                    currentTopic={currentTopic}
                    onSelectTopic={setCurrentTopic}
                    mainColor="indigo"
                  />
                </div>


                {/* Bộ chọn thời gian nghỉ chuyển câu (Mock Delay) */}
                <div className="h-[44px] bg-white border border-gray-200 rounded-lg px-3 flex items-center justify-between shadow-sm">
                  <span className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                    <Icons.Clock size={13} className="text-indigo-500" /> Chuyển câu:
                  </span>
                  <div className="flex gap-1">
                    {[0, 2, 3, 5].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleDelayChange(sec)}
                        className={`px-2 py-1 rounded text-[11px] font-black transition-colors ${
                          mockDelay === sec
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>


            {/* Nút Bắt đầu Kỳ thi */}
            <button
              type="button"
              onClick={handleTriggerStartExam}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-base shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Icons.Play size={20} fill="currentColor" />
              <span>BẮT ĐẦU KỲ THI KHẢO THÍ</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


export default GameMenu;

