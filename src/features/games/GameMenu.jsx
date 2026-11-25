// ============================================================================
// FILE 50/85: src/features/games/GameMenu.jsx
// NGUỒN GỐC: tang_5.js (Block 5.7 - GameMenu V1.09)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 25/11/2026 - 15:04 (GMT+7)
// NHIỆM VỤ: Giao diện Menu chính (TRAINING MODE) điều hướng 10 Mini-games
//           và hệ thống Đánh giá năng lực (Mock Test IOE / HSK / IELTS).
//           Nâng cấp Ver 1.0:
//           1. Diệt 2/2 MEDIUM Radar (R05_UNSAFE_LOCALSTORAGE_SET) bằng
//              Utils.safeLocalStorageSet cho fc_mock_delay & fc_debug_legacy_ai.
//           2. Vá bẫy NaN & đọc đa định dạng an toàn cho fc_mock_delay.
//           3. Đọc activeExamSession tương thích kép (STORAGE_KEYS.ACTIVE_EXAM
//              & fc_active_exam_session).
//           4. Thanh trừng 3 nhánh di sản 'vi', chuẩn hóa 2 ngôn ngữ en/zh.
//           5. Nhận prop showToast trực tiếp (fallback window.globalShowToast)
//              và chuẩn hóa A11y (button aria-pressed, dialog + phím Escape).
// ============================================================================


import React, { useState, useEffect, useCallback } from 'react';
import { Icons } from '../../components/common/Icons';
import { STORAGE_KEYS } from '../../config/constants';
import { Utils } from '../../utils/helpers';


const MOCK_DELAY_OPTIONS = [0, 3, 5, 8, 15];


/**
 * Đọc khóa phiên thi Khảo thí đang dang dở (tương thích kép giữa các phiên bản khóa)
 */
const readActiveExamSession = () => {
  if (typeof localStorage === 'undefined') return null;
  const candidateKeys = [
    STORAGE_KEYS?.ACTIVE_EXAM || 'fc_active_exam',
    'fc_active_exam_session',
    'fc_active_exam'
  ];
  const seen = new Set();


  for (const key of candidateKeys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const cleaned = raw.trim().replace(/^"+|"+$/g, '').trim();
      if (cleaned && cleaned !== 'null' && cleaned !== 'undefined') {
        return cleaned;
      }
    } catch {
      // Bỏ qua lỗi đọc localStorage trong chế độ hạn chế quyền lưu trữ
    }
  }
  return null;
};


/**
 * Đọc cờ A/B Testing luồng AI Legacy an toàn
 */
const readLegacyAiFlag = () => {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem('fc_debug_legacy_ai');
    if (!raw) return false;
    const cleaned = raw.trim().replace(/^"+|"+$/g, '').toLowerCase();
    return cleaned === 'true';
  } catch {
    return false;
  }
};


/**
 * Đọc thời gian chờ chuyển câu đa định dạng, chống tuyệt đối giá trị NaN
 */
const readConfiguredMockDelay = () => {
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


/**
 * Helper hiển thị Icon an toàn kèm Fallback Emoji nếu thiếu SVG
 */
const MenuIcon = ({
  icon: IconComp,
  fallback = '🎮',
  size = 20,
  className = '',
  fill = 'none'
}) => {
  if (IconComp) {
    return <IconComp size={size} className={className} fill={fill} />;
  }
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {fallback}
    </span>
  );
};


/**
 * Helper dịch chuỗi an toàn (Tránh hiển thị key thô nếu từ điển thiếu)
 */
const safeTranslate = (t, key, fallbackText) => {
  if (!t || typeof t !== 'function') return fallbackText;
  const res = t(key);
  if (!res || res === key) return fallbackText;
  return res;
};


export const GameMenu = ({
  t,
  mainColor = 'indigo',
  lang = 'en',
  dataMode = 'vocab',
  gameSessions = {},
  showToast,
  // Bộ callback chuẩn từ Block 5.7 (tang_5.js)
  onSelectQuiz,
  onStartMatch,
  onStartScramble,
  onStartFillBlank,
  onStartSpotMistake,
  onStartOddOneOut,
  onStartImageQuiz,
  onStartPronunciation,
  onStartListening,
  onStartReading,
  onResume,
  onStartMockTest,
  onResumeMockTest,
  // Bộ callback mở rộng tương thích kiến trúc mới
  onSelectGame,
  onStartExam,
  onResumeExam,
  onClearSession,
  onOpenExamPoolManager,
  onOpenAiConfig
}) => {
  const [matchAiMode, setMatchAiMode] = useState(false);
  const [pendingResumeGame, setPendingResumeGame] = useState(null);


  // [CHIẾN DỊCH SKELETON SAVE] Khởi tạo trực tiếp bài thi Khảo thí đang dang dở
  const [activeExamSession, setActiveExamSession] = useState(readActiveExamSession);


  // [A/B TESTING] Cờ tính năng cho QA (Chuyển đổi luồng AI 2-Shot cũ và 1-Shot mới)
  const [useLegacyAi, setUseLegacyAi] = useState(readLegacyAiFlag);


  // Bộ chọn thời gian chờ chuyển câu (0s, 3s, 5s, 8s, 15s) - Chống NaN tuyệt đối
  const [mockDelay, setMockDelay] = useState(readConfiguredMockDelay);


  // Helper phát thông báo ưu tiên prop showToast, fallback window.globalShowToast
  const notifyToast = useCallback(
    (msg, type = 'info') => {
      if (typeof showToast === 'function') {
        showToast(msg, type);
        return;
      }
      if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
        window.globalShowToast(msg, type);
      }
    },
    [showToast]
  );


  // Đồng bộ lại activeExamSession nếu localStorage thay đổi từ tab/luồng khác
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncExamSession = () => {
      setActiveExamSession(readActiveExamSession());
    };
    window.addEventListener('storage', syncExamSession);
    return () => window.removeEventListener('storage', syncExamSession);
  }, []);


  // Đóng Modal "Tiếp tục trò chơi?" khi nhấn phím Escape
  useEffect(() => {
    if (!pendingResumeGame || typeof window === 'undefined') return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPendingResumeGame(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingResumeGame]);


  const handleMockDelayChange = (val) => {
    const safeVal = Number.isFinite(Number(val)) && Number(val) >= 0 ? Math.floor(Number(val)) : 3;
    setMockDelay(safeVal);
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_mock_delay', String(safeVal));
    }
  };


  const handleToggleLegacyAi = () => {
    const nextState = !useLegacyAi;
    setUseLegacyAi(nextState);
    if (Utils && typeof Utils.safeLocalStorageSet === 'function') {
      Utils.safeLocalStorageSet('fc_debug_legacy_ai', String(nextState));
    }
    notifyToast(
      nextState
        ? 'Đã BẬT luồng AI 2-Shot cũ (Chậm hơn)'
        : 'Đã TẮT (Dùng luồng 1-Shot siêu tốc mới)',
      nextState ? 'warning' : 'success'
    );
  };


  // Điều phối mở Game mới (Hỗ trợ cả prop riêng lẻ lẫn onSelectGame)
  const triggerNewGame = (type, options = {}) => {
    if (onClearSession && options.clearOldSession) {
      onClearSession(type);
    }
    if (type === 'quiz' && onSelectQuiz) return onSelectQuiz(options);
    if (type === 'match' && onStartMatch) return onStartMatch(matchAiMode, options);
    if (type === 'scramble' && onStartScramble) return onStartScramble(options);
    if (type === 'fillblank' && onStartFillBlank) return onStartFillBlank(options);
    if (type === 'spotmistake' && onStartSpotMistake) return onStartSpotMistake(options);
    if (type === 'oddoneout' && onStartOddOneOut) return onStartOddOneOut(options);
    if (type === 'imagequiz' && onStartImageQuiz) return onStartImageQuiz(options);
    if (type === 'pronunciation' && onStartPronunciation) return onStartPronunciation(options);
    if (type === 'listening' && onStartListening) return onStartListening(options);
    if (type === 'reading' && onStartReading) return onStartReading(options);


    if (onSelectGame) {
      onSelectGame(type, { matchAiMode, ...options });
    }
    return undefined;
  };


  // Điều phối khôi phục ván đang dở
  const triggerResumeGame = (type) => {
    if (onResume) {
      onResume(type);
    } else if (onSelectGame) {
      onSelectGame(type, { autoResume: true, matchAiMode });
    }
  };


  // Điều phối bắt đầu bài thi Khảo thí
  const triggerStartMockTest = (profileId) => {
    if (onStartMockTest) {
      onStartMockTest(profileId);
    } else if (onStartExam) {
      onStartExam(profileId);
    }
  };


  // Điều phối tiếp tục bài thi Khảo thí
  const triggerResumeMockTest = (sessionId) => {
    if (onResumeMockTest) {
      onResumeMockTest(sessionId);
    } else if (onResumeExam) {
      onResumeExam(sessionId);
    }
  };


  // Huy hiệu "Tiếp tục" màu vàng nảy ở góc thẻ game
  const ResumeBadge = ({ type }) => {
    if (!gameSessions || !gameSessions[type]) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          triggerResumeGame(type);
        }}
        className="absolute -top-3 -right-2 bg-yellow-500 text-white px-3 py-1.5 rounded-full shadow-lg border-2 border-white font-bold text-[10px] flex items-center gap-1 hover:bg-yellow-600 hover:scale-110 transition-all animate-bounce z-20"
        title="Vào thẳng ván đang chơi"
      >
        <MenuIcon icon={Icons.Play} fallback="▶️" size={10} fill="currentColor" /> Tiếp tục
      </button>
    );
  };


  // [BẢN VÁ V1.09] Sử dụng trực tiếp dataMode từ Tầng 6 (Strict Routing)
  const activeDataMode = dataMode || 'vocab';
  const safeLang = lang === 'zh' ? 'zh' : 'en';


  // Các hàm xử lý khi click vào từng thẻ Game
  const handleQuizClick = () => {
    if (gameSessions?.['quiz']) setPendingResumeGame('quiz');
    else triggerNewGame('quiz');
  };
  const handleMatchClick = () => {
    if (gameSessions?.['match']) setPendingResumeGame('match');
    else triggerNewGame('match', { matchAiMode });
  };
  const handleScrambleClick = () => {
    if (gameSessions?.['scramble']) setPendingResumeGame('scramble');
    else triggerNewGame('scramble');
  };
  const handleFillBlankClick = () => {
    if (gameSessions?.['fillblank']) setPendingResumeGame('fillblank');
    else triggerNewGame('fillblank');
  };
  const handleSpotMistakeClick = () => {
    if (gameSessions?.['spotmistake']) setPendingResumeGame('spotmistake');
    else triggerNewGame('spotmistake');
  };
  const handleOddOneOutClick = () => {
    if (gameSessions?.['oddoneout']) setPendingResumeGame('oddoneout');
    else triggerNewGame('oddoneout');
  };
  const handleImageQuizClick = () => {
    if (gameSessions?.['imagequiz']) setPendingResumeGame('imagequiz');
    else triggerNewGame('imagequiz');
  };
  const handlePronunciationClick = () => {
    if (gameSessions?.['pronunciation']) setPendingResumeGame('pronunciation');
    else triggerNewGame('pronunciation');
  };
  const handleListeningClick = () => {
    if (gameSessions?.['listening']) setPendingResumeGame('listening');
    else triggerNewGame('listening');
  };
  const handleReadingClick = () => {
    if (gameSessions?.['reading']) setPendingResumeGame('reading');
    else triggerNewGame('reading');
  };


  // Bảng màu chủ đạo tĩnh an toàn với Tailwind JIT Compiler
  const isRedTheme = mainColor === 'red';
  const themeCircleBg = isRedTheme ? 'bg-red-50' : 'bg-indigo-50';
  const themeIconText = isRedTheme ? 'text-red-600' : 'text-indigo-600';
  const themeTitleText = isRedTheme ? 'text-red-800' : 'text-indigo-900';
  const themeSparkleText = isRedTheme ? 'text-red-500' : 'text-indigo-500';
  const themeQuizBtn = isRedTheme
    ? 'border-red-100 hover:border-red-400 hover:bg-red-50'
    : 'border-indigo-100 hover:border-indigo-400 hover:bg-indigo-50';
  const themeQuizIconBox = isRedTheme
    ? 'bg-red-100 text-red-600 group-hover:bg-red-600 group-hover:text-white'
    : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white';
  const themeModalIconBox = isRedTheme
    ? 'bg-red-100 text-red-600'
    : 'bg-indigo-100 text-indigo-600';
  const themeModalPrimaryBtn = isRedTheme
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-indigo-600 hover:bg-indigo-700';


  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto text-center animate-in fade-in z-10 relative px-2 sm:px-6 pt-2">
      {/* 1. THANH CÔNG CỤ GÓC TRÊN PHẢI: AI CONFIG & A/B TESTING TOGGLE */}
      <div className="w-full flex justify-end gap-2 mb-2">
        {onOpenAiConfig && (
          <button
            type="button"
            onClick={onOpenAiConfig}
            className="text-[9px] sm:text-[10px] font-bold px-2.5 py-1 rounded border flex items-center gap-1.5 transition-all shadow-sm bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100"
            title="Cài đặt thông số cho Động cơ AI (Loading, Delay, Băng đạn)"
          >
            <MenuIcon icon={Icons.Sparkles} fallback="✨" size={12} />
            Cài đặt Lõi AI
          </button>
        )}
        <button
          type="button"
          aria-pressed={useLegacyAi}
          onClick={handleToggleLegacyAi}
          className={`text-[9px] sm:text-[10px] font-bold px-2.5 py-1 rounded border flex items-center gap-1.5 transition-all shadow-sm ${
            useLegacyAi
              ? 'bg-red-50 text-red-600 border-red-200'
              : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title="Chuyển đổi giữa kiến trúc Lắp ráp cũ và Đúc nguyên khối mới"
        >
          <MenuIcon icon={Icons.Settings} fallback="⚙️" size={12} />
          Dev: Legacy ({useLegacyAi ? 'ON' : 'OFF'})
        </button>
      </div>


      {/* 2. HEADER BIỂU TƯỢNG & TIÊU ĐỀ TRAINING MODE */}
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 ${themeCircleBg} rounded-full flex items-center justify-center mb-3 sm:mb-4 shadow-inner`}
      >
        <MenuIcon icon={Icons.Gamepad2} fallback="🎮" size={28} className={themeIconText} />
      </div>
      <h2 className={`text-lg sm:text-xl font-black ${themeTitleText} mb-1 uppercase tracking-wide`}>
        {safeTranslate(t, 'gameTitle', 'TRAINING MODE')}
      </h2>
      <p className="text-gray-500 text-[11px] sm:text-xs mb-6 sm:mb-8">
        Chọn chế độ luyện tập để bắt đầu
      </p>


      {/* 3. BANNER KHÔI PHỤC BÀI THI KHẢO THÍ ĐANG DANG DỞ */}
      {activeExamSession && (
        <div className="w-full bg-gradient-to-r from-orange-500 to-red-500 p-4 sm:p-5 rounded-2xl shadow-lg mb-8 relative overflow-hidden group animate-in slide-in-from-top-4 border-2 border-orange-300">
          <div className="absolute -right-6 -top-6 opacity-20 group-hover:scale-110 transition-transform duration-500">
            <MenuIcon icon={Icons.AlertCircle} fallback="⚠️" size={100} />
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
            <div>
              <h3 className="text-white font-black text-lg flex items-center gap-2">
                <MenuIcon icon={Icons.Clock} fallback="⏱️" size={20} /> Bài thi đang dang dở!
              </h3>
              <p className="text-white/90 text-xs sm:text-sm mt-1 font-medium">
                Hệ thống phát hiện bạn có một bài thi Khảo thí chưa hoàn thành (do tải lại trang hoặc mất mạng).
              </p>
            </div>
            <button
              type="button"
              onClick={() => triggerResumeMockTest(activeExamSession)}
              className="w-full sm:w-auto px-6 py-3 bg-white text-red-600 font-bold rounded-xl shadow-md hover:bg-gray-50 active:scale-95 transition-all whitespace-nowrap flex items-center justify-center gap-2"
            >
              <MenuIcon icon={Icons.Play} fallback="▶️" size={18} fill="currentColor" /> Tiếp tục thi
            </button>
          </div>
        </div>
      )}


      {/* 4. BỐ CỤC 2 CỘT CHÍNH: LUYỆN TẬP HÀNG NGÀY (TRÁI) & ĐÁNH GIÁ NĂNG LỰC (PHẢI) */}
      <div className="flex flex-col md:flex-row w-full gap-5 lg:gap-8 pb-10 text-left items-start">
        {/* ====================================================================
            CỘT TRÁI: LUYỆN TẬP HÀNG NGÀY (STRICT ROUTING THEO DATAMODE)
            ==================================================================== */}
        <div className="flex-1 flex flex-col gap-3 w-full">
          <div className="flex items-center gap-2 mb-1 px-2">
            <MenuIcon icon={Icons.Sparkles} fallback="✨" size={16} className={themeSparkleText} />
            <h3 className="text-sm sm:text-base font-bold text-gray-700 uppercase tracking-wider">
              Luyện tập hàng ngày
            </h3>
          </div>


          {/* Nút lớn: Trắc Nghiệm */}
          <div className="relative group w-full">
            <button
              type="button"
              onClick={handleQuizClick}
              className={`w-full p-3 sm:p-4 bg-white border-2 ${themeQuizBtn} rounded-2xl transition-all flex items-center gap-3 shadow-sm group active:scale-95`}
            >
              <div className={`p-2.5 sm:p-3 ${themeQuizIconBox} rounded-xl transition-colors`}>
                <MenuIcon icon={Icons.Layers} fallback="📚" size={22} />
              </div>
              <div className="text-left flex-1">
                <div className="font-bold text-base sm:text-lg text-gray-800 leading-tight mb-0.5">
                  Trắc Nghiệm
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500 font-medium">
                  4-5 đáp án, Hẹn giờ, Luyện nghe...
                </div>
              </div>
              <MenuIcon
                icon={Icons.ChevronRight}
                fallback="▶"
                size={18}
                className="text-gray-300 hidden sm:block"
              />
            </button>
            <ResumeBadge type="quiz" />
          </div>


          {/* Lưới 2 cột các Mini-games */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
            {/* Match Game (Có nút ngôi sao bật/tắt AI tạo nhiễu khó chuẩn button A11y) */}
            <div className="relative group h-full">
              <button
                type="button"
                onClick={handleMatchClick}
                className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-purple-100 rounded-xl sm:rounded-2xl hover:border-purple-400 hover:bg-purple-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 z-10 relative group"
              >
                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <MenuIcon icon={Icons.Link} fallback="🔗" size={20} />
                </div>
                <div className="text-center mt-0.5">
                  <div className="font-bold text-gray-800 text-xs sm:text-sm">
                    {safeTranslate(t, 'modeMatch', 'Nối Ô')}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                    Nối từ & nghĩa
                  </div>
                </div>
              </button>
              <button
                type="button"
                aria-pressed={matchAiMode}
                aria-label="Bật/Tắt AI tạo nhiễu khó"
                className={`absolute top-2 right-2 p-1 rounded-full cursor-pointer transition-all z-20 ${
                  matchAiMode
                    ? 'bg-purple-100 text-purple-600 ring-1 ring-purple-200'
                    : 'bg-gray-100 text-gray-300 hover:bg-gray-200'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setMatchAiMode((prev) => !prev);
                }}
                title="Bật/Tắt AI tạo nhiễu khó"
              >
                <MenuIcon
                  icon={Icons.Sparkles}
                  fallback="✨"
                  size={12}
                  fill={matchAiMode ? 'currentColor' : 'none'}
                />
              </button>
              <ResumeBadge type="match" />
            </div>


            {/* Scramble Game */}
            <div className="relative group h-full">
              <button
                type="button"
                onClick={handleScrambleClick}
                className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-orange-100 rounded-xl sm:rounded-2xl hover:border-orange-400 hover:bg-orange-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
              >
                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  <MenuIcon icon={Icons.Shuffle} fallback="🔀" size={20} />
                </div>
                <div className="text-center mt-0.5">
                  <div className="font-bold text-gray-800 text-xs sm:text-sm">
                    {safeTranslate(t, 'modeScramble', 'Ghép Câu')}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                    Xếp từ / chữ cái
                  </div>
                </div>
              </button>
              <ResumeBadge type="scramble" />
            </div>


            {/* NHÓM GAME TỪ VỰNG (HIỂN THỊ KHI DATAMODE === 'vocab') */}
            {activeDataMode === 'vocab' && (
              <>
                {/* Từ Khác Loại */}
                <div className="relative group h-full animate-in zoom-in">
                  <button
                    type="button"
                    onClick={handleOddOneOutClick}
                    className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-pink-100 rounded-xl sm:rounded-2xl hover:border-pink-400 hover:bg-pink-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                  >
                    <div className="p-2 bg-pink-100 text-pink-600 rounded-lg group-hover:bg-pink-600 group-hover:text-white transition-colors">
                      <MenuIcon icon={Icons.Eye} fallback="👁️" size={20} />
                    </div>
                    <div className="text-center mt-0.5">
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">Từ Khác Loại</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                        Lạc loài trong nhóm
                      </div>
                    </div>
                  </button>
                  <ResumeBadge type="oddoneout" />
                </div>


                {/* Đoán Hình */}
                <div className="relative group h-full animate-in zoom-in">
                  <button
                    type="button"
                    onClick={handleImageQuizClick}
                    className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-emerald-100 rounded-xl sm:rounded-2xl hover:border-emerald-400 hover:bg-emerald-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                  >
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <MenuIcon icon={Icons.Image} fallback="🖼️" size={20} />
                    </div>
                    <div className="text-center mt-0.5">
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">Đoán Hình</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                        Nhìn chữ chọn ảnh
                      </div>
                    </div>
                  </button>
                  <ResumeBadge type="imagequiz" />
                </div>


                {/* Vua Ngữ Âm (Chỉ hiển thị cho Tiếng Anh) */}
                {safeLang === 'en' && (
                  <div className="relative group h-full animate-in zoom-in col-span-2">
                    <button
                      type="button"
                      onClick={handlePronunciationClick}
                      className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-indigo-100 rounded-xl sm:rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                    >
                      <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <MenuIcon icon={Icons.Mic} fallback="🎤" size={20} />
                      </div>
                      <div className="text-center mt-0.5">
                        <div className="font-bold text-gray-800 text-xs sm:text-sm">Vua Ngữ Âm</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                          Phân biệt phát âm
                        </div>
                      </div>
                    </button>
                    <ResumeBadge type="pronunciation" />
                  </div>
                )}
              </>
            )}


            {/* NHÓM GAME CÂU VĂN (HIỂN THỊ KHI DATAMODE === 'sentence') */}
            {activeDataMode === 'sentence' && (
              <>
                {/* Điền Từ */}
                <div className="relative group h-full animate-in zoom-in">
                  <button
                    type="button"
                    onClick={handleFillBlankClick}
                    className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-blue-100 rounded-xl sm:rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                  >
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <MenuIcon icon={Icons.Keyboard} fallback="⌨️" size={20} />
                    </div>
                    <div className="text-center mt-0.5">
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">Điền Từ</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                        Luyện gõ chính xác
                      </div>
                    </div>
                  </button>
                  <ResumeBadge type="fillblank" />
                </div>


                {/* Tìm Lỗi Sai */}
                <div className="relative group h-full animate-in zoom-in">
                  <button
                    type="button"
                    onClick={handleSpotMistakeClick}
                    className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-red-100 rounded-xl sm:rounded-2xl hover:border-red-400 hover:bg-red-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                  >
                    <div className="p-2 bg-red-100 text-red-600 rounded-lg group-hover:bg-red-600 group-hover:text-white transition-colors">
                      <MenuIcon icon={Icons.Brain} fallback="🧠" size={20} />
                    </div>
                    <div className="text-center mt-0.5">
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">Tìm Lỗi Sai</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                        Săn lỗi ngữ pháp
                      </div>
                    </div>
                  </button>
                  <ResumeBadge type="spotmistake" />
                </div>


                {/* Đôi Tai Vàng */}
                <div className="relative group h-full animate-in zoom-in">
                  <button
                    type="button"
                    onClick={handleListeningClick}
                    className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-cyan-100 rounded-xl sm:rounded-2xl hover:border-cyan-400 hover:bg-cyan-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                  >
                    <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                      <MenuIcon icon={Icons.Headphones} fallback="🎧" size={20} />
                    </div>
                    <div className="text-center mt-0.5">
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">Đôi Tai Vàng</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                        Luyện nghe hiểu
                      </div>
                    </div>
                  </button>
                  <ResumeBadge type="listening" />
                </div>


                {/* Đọc Hiểu */}
                <div className="relative group h-full animate-in zoom-in">
                  <button
                    type="button"
                    onClick={handleReadingClick}
                    className="w-full h-full min-h-[90px] sm:min-h-[105px] p-3 sm:p-4 bg-white border-2 border-slate-100 rounded-xl sm:rounded-2xl hover:border-slate-400 hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-2 shadow-sm group active:scale-95"
                  >
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg group-hover:bg-slate-600 group-hover:text-white transition-colors">
                      <MenuIcon icon={Icons.BookOpen} fallback="📖" size={20} />
                    </div>
                    <div className="text-center mt-0.5">
                      <div className="font-bold text-gray-800 text-xs sm:text-sm">Đọc Hiểu</div>
                      <div className="text-[9px] sm:text-[10px] text-gray-400 font-medium mt-0.5 leading-tight">
                        Thám tử đọc hiểu
                      </div>
                    </div>
                  </button>
                  <ResumeBadge type="reading" />
                </div>
              </>
            )}
          </div>
        </div>


        {/* ====================================================================
            CỘT PHẢI: ĐÁNH GIÁ NĂNG LỰC (MOCK TEST PRO & CHỜ CHUYỂN CÂU)
            ==================================================================== */}
        <div className="w-full md:w-[280px] lg:w-[320px] shrink-0 flex flex-col gap-3 mt-4 md:mt-0 animate-in slide-in-from-right-8">
          <div className="flex items-center justify-between w-full mb-1 px-2">
            <div className="flex items-center gap-2">
              <MenuIcon icon={Icons.Award} fallback="🏆" size={16} className="text-red-500" />
              <h3 className="text-sm sm:text-base font-bold text-gray-700 uppercase tracking-wider">
                Đánh giá năng lực
              </h3>
            </div>
            {onOpenExamPoolManager && (
              <button
                type="button"
                onClick={onOpenExamPoolManager}
                className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors shadow-sm flex items-center gap-1 active:scale-95"
                title="Quản lý Ngân hàng đề thi"
              >
                <MenuIcon icon={Icons.Database} fallback="🗄️" size={14} />
                <span className="text-[10px] font-bold hidden sm:inline">Ngân hàng đề</span>
              </button>
            )}
          </div>


          <div className="bg-gradient-to-b from-blue-50 to-indigo-50/50 p-3 sm:p-4 rounded-2xl border border-blue-100 shadow-sm flex flex-col gap-3 w-full">
            {/* Thẻ PRO 1: Khảo thí IOE (Tiếng Anh) / Thi Thử HSK (Tiếng Trung) */}
            <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-md flex flex-col items-start gap-2.5 text-left border border-white/20 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-150 transition-transform duration-500">
                <MenuIcon icon={Icons.Award} fallback="🏆" size={60} />
              </div>
              <div className="flex justify-between w-full items-center relative z-10">
                <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
                  <MenuIcon icon={Icons.Award} fallback="🏆" size={16} />
                </div>
                <div className="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm tracking-widest border border-white/30">
                  PRO
                </div>
              </div>
              <div className="relative z-10 mt-1 w-full">
                <div className="font-black text-lg leading-tight mb-1">
                  {safeLang === 'zh' ? 'Thi Thử HSK' : 'Khảo thí IOE'}
                </div>
                <div className="flex gap-2 w-full mt-2">
                  <button
                    type="button"
                    onClick={() => triggerStartMockTest(safeLang === 'zh' ? 'hsk_std' : 'ioe_std')}
                    className="flex-1 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-xs font-bold transition-colors border border-white/30 active:scale-95 flex flex-col items-center"
                  >
                    <span>Tiêu chuẩn</span>
                    <span className="text-[9px] font-normal opacity-90">
                      {safeLang === 'zh' ? '(45 câu)' : '(200 câu)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerStartMockTest(safeLang === 'zh' ? 'hsk_mini' : 'ioe_mini')
                    }
                    className="flex-1 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-xs font-bold transition-colors border border-white/30 active:scale-95 flex flex-col items-center"
                  >
                    <span>Mini Test</span>
                    <span className="text-[9px] font-normal opacity-90">
                      {safeLang === 'zh' ? '(15 câu)' : '(50 câu)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>


            {/* Thẻ PRO 2: IELTS Reading (Chỉ hiện khi học Tiếng Anh) */}
            {safeLang === 'en' && (
              <div className="p-4 bg-gradient-to-br from-rose-500 to-red-600 text-white rounded-xl shadow-md flex flex-col items-start gap-2.5 text-left border border-white/20 relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 opacity-10 group-hover:scale-150 transition-transform duration-500">
                  <MenuIcon icon={Icons.BookOpen} fallback="📖" size={60} />
                </div>
                <div className="flex justify-between w-full items-center relative z-10">
                  <div className="p-1.5 bg-white/20 backdrop-blur-sm rounded-lg">
                    <MenuIcon icon={Icons.BookOpen} fallback="📖" size={16} />
                  </div>
                  <div className="bg-white/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm tracking-widest border border-white/30">
                    PRO
                  </div>
                </div>
                <div className="relative z-10 mt-1 w-full">
                  <div className="font-black text-lg leading-tight mb-1">IELTS Reading</div>
                  <div className="flex gap-2 w-full mt-2">
                    <button
                      type="button"
                      onClick={() => triggerStartMockTest('ielts_std')}
                      className="flex-1 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-xs font-bold transition-colors border border-white/30 active:scale-95 flex flex-col items-center"
                    >
                      <span>Full Test</span>
                      <span className="text-[9px] font-normal opacity-90">(60 phút)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerStartMockTest('ielts_mini')}
                      className="flex-1 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-xs font-bold transition-colors border border-white/30 active:scale-95 flex flex-col items-center"
                    >
                      <span>Mini Test</span>
                      <span className="text-[9px] font-normal opacity-90">(15 phút)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* Lưu ý kết nối mạng & API Key */}
            <div className="mt-1 p-2.5 bg-white/60 backdrop-blur-md rounded-lg border border-white text-center text-[9px] sm:text-[10px] text-gray-500 font-medium leading-relaxed">
              <p className="flex items-center justify-center gap-1 mb-0.5">
                <MenuIcon
                  icon={Icons.AlertCircle}
                  fallback="⚠️"
                  size={12}
                  className="text-orange-400"
                />
                Bài thi bám sát cấu trúc chuẩn.
              </p>
              <p>Yêu cầu kết nối mạng ổn định & API Key.</p>
            </div>


            {/* Bộ chọn thời gian chờ chuyển câu (0s, 3s, 5s, 8s, 15s) */}
            <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MenuIcon
                    icon={Icons.Clock}
                    fallback="⏱️"
                    size={16}
                    className="text-orange-500"
                  />
                  <span className="text-xs font-bold text-gray-700">Chờ chuyển câu:</span>
                </div>
                <span className="text-[10px] font-mono bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold shadow-inner">
                  {mockDelay}s
                </span>
              </div>
              <div className="flex justify-between gap-1 w-full">
                {MOCK_DELAY_OPTIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={mockDelay === sec}
                    onClick={() => handleMockDelayChange(sec)}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all border ${
                      mockDelay === sec
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md scale-105 z-10'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-orange-50'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gray-400 italic text-center mt-1">
                Tạo thời gian chết giúp AI nạp đạn, tránh sập mạng.
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* 5. POPUP MODAL XÁC NHẬN "TIẾP TỤC TRÒ CHƠI?" */}
      {pendingResumeGame && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="resume-game-modal-title"
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPendingResumeGame(null)}
        >
          <div
            className="bg-white p-5 sm:p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-gray-100 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`w-14 h-14 ${themeModalIconBox} rounded-full flex items-center justify-center mb-4 shadow-inner`}
            >
              <MenuIcon icon={Icons.Play} fallback="▶️" size={24} fill="currentColor" />
            </div>
            <h3
              id="resume-game-modal-title"
              className="text-lg sm:text-xl font-black text-gray-800 mb-2"
            >
              Tiếp tục trò chơi?
            </h3>
            <p className="text-gray-600 text-xs sm:text-sm mb-6">
              Bạn đang có một ván chơi chưa hoàn thành. Bạn muốn tiếp tục hay bắt đầu ván mới?
            </p>
            <div className="flex flex-col w-full gap-2.5">
              <button
                type="button"
                onClick={() => {
                  triggerResumeGame(pendingResumeGame);
                  setPendingResumeGame(null);
                }}
                className={`w-full py-2.5 sm:py-3 ${themeModalPrimaryBtn} text-white font-bold rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 text-sm sm:text-base`}
              >
                <MenuIcon icon={Icons.Play} fallback="▶️" size={18} fill="currentColor" /> Tiếp tục
                chơi
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerNewGame(pendingResumeGame, { clearOldSession: true });
                  setPendingResumeGame(null);
                }}
                className="w-full py-2.5 sm:py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <MenuIcon icon={Icons.RefreshCw} fallback="🔄" size={16} /> Bắt đầu ván mới
              </button>
              <button
                type="button"
                onClick={() => setPendingResumeGame(null)}
                className="w-full py-2 text-gray-400 hover:text-gray-600 font-bold text-xs sm:text-sm mt-1 transition-colors"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


if (typeof window !== 'undefined') {
  window.GameMenu = GameMenu;
  window.Block5_7_GameMenu = GameMenu;
}


export default GameMenu;

