// ============================================================================
// FILE 72/85: src/features/exam/ExamUIShell.jsx
// NGUỒN GỐC: tang_5.js (Block 5.14 - Exam UI Shell & Atomic Renderers V2.05)
// PHIÊN BẢN: Ver 1.2
// NGÀY GIỜ NÂNG CẤP: 25/11/2026 - 21:58 (GMT+7)
// NHIỆM VỤ: Khung giao diện phòng thi Khảo thí tổng hợp (Mock Test), màn hình
//           nghỉ chuyển chặng 20s (optimistic_* / phaseIntermission), thanh HUD
//           canh giờ và bộ 9 Atomic Renderers nguyên tử.
//           Nâng cấp Ver 1.2 (từ Ver 1.1):
//           1. Diệt 2/2 lỗi tsc/checkJs trên VS Code:
//              - Truyền tường minh onComplete={undefined} vào <GlobalLoadingScreen/>.
//              - Gỡ prop thừa onPlay và truyền đủ onBackToMenu + onExportExcel
//                vào <ExamReportUI/>.
//           2. Gán giá trị mặc định = undefined cho toàn bộ prop tùy chọn /
//              Dual-Props của ExamUIShell & bổ sung JSDoc cho useState/useRef
//              để giữ xanh 0 Problems tuyệt đối với GameView.jsx.
//           3. Khôi phục toàn bộ 6 chuỗi hiển thị đồng hồ/lượt nghe/chú thích
//              bị lỗi ký tự '$' khi sao chép, đảm bảo không lỗi hiển thị runtime.
// ============================================================================

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Icons } from '@/components/common/Icons';
import { GlobalLoadingScreen } from '@/components/common/GlobalLoadingScreen';
import { Utils } from '@/utils/helpers';
import { ExamReportUI } from './ExamReportUI';

// Bảng màu tĩnh an toàn tuyệt đối với Tailwind JIT Compiler
const EXAM_COLOR_THEMES = {
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    accentBtn: 'bg-indigo-600 hover:bg-indigo-700',
    progress: 'from-indigo-500 to-blue-600'
  },
  sky: {
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    accentBtn: 'bg-sky-600 hover:bg-sky-700',
    progress: 'from-sky-500 to-blue-600'
  },
  red: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    accentBtn: 'bg-red-600 hover:bg-red-700',
    progress: 'from-red-500 to-rose-600'
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accentBtn: 'bg-emerald-600 hover:bg-emerald-700',
    progress: 'from-emerald-500 to-teal-600'
  },
  slate: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    accentBtn: 'bg-slate-700 hover:bg-slate-800',
    progress: 'from-slate-600 to-slate-800'
  }
};

// Nhãn tiếng Việt thân thiện cho từng dạng câu hỏi khảo thí
const QUESTION_TYPE_LABELS = {
  reading: 'Đọc hiểu',
  listening: 'Nghe hiểu',
  image_quiz: 'Đoán hình ảnh',
  pronunciation: 'Vua Ngữ âm',
  odd_one_out: 'Từ khác loại',
  fill_blank: 'Điền từ khuyết',
  spot_mistake: 'Tìm lỗi sai',
  scramble: 'Ghép câu',
  match: 'Nối từ & nghĩa',
  quiz: 'Trắc nghiệm'
};

const CJK_REGEX = /[\u4e00-\u9fff]/;
const SCRAMBLE_PUNCT_REGEX = /^[，。！？、；：“”‘’（）《》【】「」『』,.!?;:"'()]$/;

// Làm sạch ký tự đánh dấu gạch chân *...* của dạng Vua Ngữ Âm trước khi so sánh/hiển thị
const stripPhoneticStars = (val) => String(val || '').replace(/\*/g, '');

// Chuẩn hóa khóa chuỗi NFC để đối chiếu Bookmark không lệch dấu
const normalizeNfcKey = (val) =>
  String(val || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Định dạng đồng hồ phòng thi (MM:SS)
const formatExamClock = (seconds) => {
  const safeSec = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
};

// Đọc an toàn độ trễ đọc giải thích từ fc_mock_delay (chống NaN & đa định dạng)
const readSafeReviewDelay = () => {
  try {
    if (typeof localStorage === 'undefined') return 3;
    const raw = localStorage.getItem('fc_mock_delay');
    if (raw === null || raw === '') return 3;
    let parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      const jsonVal = JSON.parse(raw);
      parsed = Number(jsonVal);
    }
    if (!Number.isFinite(parsed) || parsed < 0) return 3;
    // Giữ thời gian xem lời giải gọn (1..5s) để tránh đếm đúp với examCooldown ở useExamLogic
    return Math.min(5, Math.max(1, Math.floor(parsed)));
  } catch {
    return 3;
  }
};

// Nội suy ngôn ngữ hiệu lực từ metadata câu hỏi + lang hiện tại (2 nhánh 'en' | 'zh')
const resolveQuestionLang = (meta, fallbackLang = 'en') => {
  const metaLang = String(meta?.lang || meta?.language || '').toLowerCase().trim();
  if (metaLang === 'zh' || metaLang === 'cn') return 'zh';
  if (metaLang === 'en') return 'en';

  const track = String(meta?.track || '').toLowerCase().trim();
  if (track === 'hsk') return 'zh';

  const lvl = Array.isArray(meta?.level)
    ? meta.level.join(',').toLowerCase()
    : String(meta?.level || '').toLowerCase();
  if (lvl.includes('zh') || lvl.includes('hsk')) return 'zh';
  if (track === 'ioe' || track === 'ielts' || lvl.includes('en_level')) return 'en';

  return fallbackLang === 'zh' ? 'zh' : 'en';
};

// Chuẩn hóa mã dạng câu hỏi từ { metadata, content } về 1 trong 10 loại chuẩn
const resolveCanonicalQuestionType = (meta, content, rawQuestion) => {
  const hasPassage = Boolean(
    String(content?.passage || content?.passageData?.passage || '').trim()
  );
  if (hasPassage) return 'reading';

  const rawType = String(
    meta?.type || rawQuestion?.type || content?.type || 'quiz'
  )
    .toLowerCase()
    .trim();

  if (rawType.includes('reading')) return 'reading';
  if (rawType.includes('listening')) return 'listening';
  if (rawType.includes('image_quiz') || rawType.includes('imagequiz')) return 'image_quiz';
  if (rawType.includes('pronunciation')) return 'pronunciation';
  if (rawType.includes('odd_one_out') || rawType.includes('oddoneout')) return 'odd_one_out';
  if (rawType.includes('fill_blank') || rawType.includes('fillblank')) return 'fill_blank';
  if (rawType.includes('spot_mistake') || rawType.includes('spotmistake')) return 'spot_mistake';
  if (rawType.includes('scramble')) return 'scramble';
  if (rawType.includes('match')) {
    // Theo exam/index.js: ioe_match trong Mock Test là MCQ 4 đáp án, chỉ render nối cột khi có pairs
    if (Array.isArray(content?.pairs) && content.pairs.length > 0) return 'match';
    return 'quiz';
  }
  return 'quiz';
};

// Render nổi bật ký tự gạch chân trong câu hỏi Vua Ngữ Âm (VD: c*a*t -> gạch chân a)
const renderHighlightedPhoneticText = (rawText) => {
  const str = String(rawText || '');
  if (!str.includes('*')) return str;
  const parts = str.split(/(\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <u
          key={idx}
          className="decoration-2 underline-offset-4 text-indigo-700 font-black"
        >
          {part.slice(1, -1)}
        </u>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
};

// Render câu đục lỗ với khoảng trống trực quan
const renderClozeSentence = (rawSentence) => {
  const str = String(rawSentence || '');
  const parts = str.split(/(?:\[[\s_]+\]|_{3,})/g);
  if (parts.length <= 1) return str;
  return parts.map((part, idx) => (
    <React.Fragment key={idx}>
      {part}
      {idx < parts.length - 1 && (
        <span className="inline-block min-w-[76px] border-b-4 border-blue-400 mx-1.5 align-baseline" />
      )}
    </React.Fragment>
  ));
};

// Tự tách câu thành mảng token cho Scramble (hỗ trợ cả Tiếng Anh lẫn Tiếng Trung)
const buildScrambledTokens = (content, effectiveLang) => {
  const existingPool =
    content?.scrambledWords || content?.parts || content?.words || null;
  if (Array.isArray(existingPool) && existingPool.length > 0) {
    return existingPool
      .map((w, idx) => ({
        id: 'scr_' + idx + '_' + (typeof w === 'object' && w !== null ? w.text || idx : w),
        text: typeof w === 'object' && w !== null ? String(w.text || '') : String(w || '')
      }))
      .filter((item) => item.text.trim().length > 0);
  }

  const rawSentence = String(
    content?.term || content?.origin?.term || content?.targetSentence || ''
  ).trim();
  if (!rawSentence) return [];

  const isZh = effectiveLang === 'zh' || CJK_REGEX.test(rawSentence);
  let tokens = isZh
    ? Array.from(rawSentence).filter(
        (ch) => ch.trim().length > 0 && !SCRAMBLE_PUNCT_REGEX.test(ch)
      )
    : rawSentence
        .split(/\s+/)
        .map((tok) => tok.trim())
        .filter(Boolean);

  if (tokens.length === 0) {
    tokens = Array.from(rawSentence).filter((ch) => ch.trim().length > 0);
  }

  // Xáo trộn chắc chắn khác thứ tự ban đầu nếu có >= 2 từ khác nhau
  let shuffled =
    typeof Utils?.shuffleArray === 'function' ? Utils.shuffleArray([...tokens]) : [...tokens];
  const hasDistinct = new Set(tokens).size > 1;
  if (hasDistinct && shuffled.join('|') === tokens.join('|')) {
    shuffled = [...shuffled.slice(1), shuffled[0]];
  }

  return shuffled.map((text, idx) => ({
    id: 'scr_' + idx + '_' + text,
    text
  }));
};

// ============================================================================
// COMPONENT PHỤ: MÀN HÌNH NGHỈ CHUYỂN CHẶNG 20 GIÂY (OPTIMISTIC INTERMISSION)
// Chủ động đóng băng đồng hồ phòng thi qua setTransitionState(true/false)
// ============================================================================
const PhaseIntermissionScreen = ({
  phaseName = '',
  initialSeconds = 20,
  cachedCount = 0,
  isHydrating = false,
  setTransitionState = undefined,
  onSkip = undefined
}) => {
  const [countdown, setCountdown] = useState(() =>
    Math.max(0, Number(initialSeconds) || 20)
  );

  // Khóa ref để tránh kích hoạt lại unmount cleanup khi cha truyền hàm mới
  const setTransitionStateRef = useRef(setTransitionState);
  useEffect(() => {
    setTransitionStateRef.current = setTransitionState;
  }, [setTransitionState]);

  // Đóng băng đồng hồ phòng thi suốt thời gian nghỉ chuyển chặng 20s
  useEffect(() => {
    if (typeof setTransitionStateRef.current === 'function') {
      setTransitionStateRef.current(true);
    }
    return () => {
      if (typeof setTransitionStateRef.current === 'function') {
        setTransitionStateRef.current(false);
      }
    };
  }, []);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setTimeout(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white rounded-3xl p-6 text-center shadow-2xl animate-in fade-in">
      <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center mb-5 animate-bounce">
        <Icons.Award size={40} className="text-yellow-400" />
      </div>
      <span className="px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-bold uppercase tracking-widest mb-2">
        Nghỉ chuyển chặng kỹ năng
      </span>
      <h2 className="text-2xl sm:text-3xl font-black mb-2">
        {phaseName || 'Chặng tiếp theo'}
      </h2>
      <p className="text-sm text-indigo-200 max-w-md mb-6">
        Hệ thống đang đồng bộ ngữ cảnh và nạp sẵn câu hỏi cho chặng thi mới. Đạn đã nạp sẵn:{' '}
        <b className="text-yellow-300">{cachedCount} câu</b>
        {isHydrating ? ' (Đang nạp thêm...)' : ''}.
      </p>

      <div className="text-5xl font-mono font-black text-yellow-400 mb-8">
        {countdown}s
      </div>

      {typeof onSkip === 'function' ? (
        <button
          type="button"
          onClick={onSkip}
          className="px-8 py-3.5 bg-white text-indigo-900 hover:bg-indigo-50 font-black rounded-2xl shadow-xl transition-all active:scale-95 flex items-center gap-2"
        >
          <Icons.Play size={18} fill="currentColor" /> Vào chặng mới ngay
        </button>
      ) : (
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 border border-white/20 text-xs font-bold text-indigo-100">
          <span className="w-3 h-3 rounded-full bg-yellow-400 animate-ping" />
          Tự động mở chặng mới ngay khi nạp xong...
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPONENT CON: BỘ RENDER NGUYÊN TỬ CHO TỪNG CÂU HỎI THI (ATOMIC RENDERER)
// Dùng `key={questionKey}` ở tầng cha để tự động reset toàn bộ State khi qua câu mới
// ============================================================================
const AtomicQuestionRenderer = ({
  question,
  currentIndex,
  lang = 'en',
  mainColor = 'indigo',
  onPlay = undefined,
  stopAllSpeech = undefined,
  notifyToast = undefined,
  onBookmark = undefined,
  notebook = undefined,
  onLogWrong = undefined,
  onSubmitAnswer = undefined,
  setTransitionState = undefined,
  examCooldown = 0,
  isHydrating = false
}) => {
  // Bóc chuẩn 2 lớp { id, metadata, content } (tương thích ngược nếu nhận object phẳng)
  const meta = useMemo(
    () => (question?.metadata && typeof question.metadata === 'object' ? question.metadata : {}),
    [question]
  );
  const content = useMemo(
    () =>
      question?.content && typeof question.content === 'object'
        ? question.content
        : question && typeof question === 'object'
        ? question
        : {},
    [question]
  );

  const effectiveLang = useMemo(
    () => resolveQuestionLang(meta, lang),
    [meta, lang]
  );
  const qType = useMemo(
    () => resolveCanonicalQuestionType(meta, content, question),
    [meta, content, question]
  );
  const theme = EXAM_COLOR_THEMES[mainColor] || EXAM_COLOR_THEMES.indigo;

  // State chấm điểm cục bộ trước khi đẩy kết quả lên useExamLogic
  const [localStatus, setLocalStatus] = useState('idle'); // 'idle' | 'correct' | 'wrong'
  const [answerPayloadRecord, setAnswerPayloadRecord] = useState(/** @type {any} */ (''));
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [isCommitted, setIsCommitted] = useState(false);

  // State riêng cho các dạng câu hỏi tương tác
  const [selectedIdx, setSelectedIdx] = useState(/** @type {number | null} */ (null));
  const [textInput, setTextInput] = useState('');
  const [selectedChunks, setSelectedChunks] = useState(/** @type {number[]} */ ([]));
  const [mistakeStep, setMistakeStep] = useState(1); // 1: Chọn từ sai, 2: Gõ từ sửa
  const [scrambleSelected, setScrambleSelected] = useState(
    /** @type {Array<{ id: string, text: string }>} */ ([])
  );
  const [listenPlays, setListenPlays] = useState(0);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [failedImgIndices, setFailedImgIndices] = useState(
    /** @type {Record<number, boolean>} */ ({})
  );

  // State riêng cho dạng bài Nối từ (Match dạng 2 cột)
  const [matchLeftSelected, setMatchLeftSelected] = useState(
    /** @type {{ id: string, text: string, pairId: string } | null} */ (null)
  );
  const [matchedPairIds, setMatchedPairIds] = useState(/** @type {string[]} */ ([]));
  const [matchMistakes, setMatchMistakes] = useState(0);

  // Bộ đếm đọc lời giải thích trước khi đẩy sang useExamLogic
  const [postDelay, setPostDelay] = useState(() => readSafeReviewDelay());
  const [isPaused, setIsPaused] = useState(false);

  const hasSubmittedRef = useRef(false);
  const audioTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const isMountedRef = useRef(true);

  // Khóa cứng ref cho hàm cleanup để unmount effect không chạy oan giữa câu
  const stopAllSpeechRef = useRef(stopAllSpeech);
  const setTransitionStateRef = useRef(setTransitionState);

  useEffect(() => {
    stopAllSpeechRef.current = stopAllSpeech;
  }, [stopAllSpeech]);

  useEffect(() => {
    setTransitionStateRef.current = setTransitionState;
  }, [setTransitionState]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (audioTimerRef.current) {
        clearTimeout(audioTimerRef.current);
        audioTimerRef.current = null;
      }
      if (typeof stopAllSpeechRef.current === 'function') {
        stopAllSpeechRef.current();
      }
      if (typeof setTransitionStateRef.current === 'function') {
        setTransitionStateRef.current(false);
      }
    };
  }, []);

  // Đóng băng đồng hồ phòng thi (timeRemaining) khi thí sinh đang đọc giải thích
  useEffect(() => {
    if (localStatus !== 'idle' && typeof setTransitionStateRef.current === 'function') {
      setTransitionStateRef.current(true);
    }
  }, [localStatus]);

  // Khởi tạo danh sách từ xáo trộn cho dạng bài Ghép câu (Scramble)
  const scramblePool = useMemo(() => {
    if (qType !== 'scramble') return [];
    return buildScrambledTokens(content, effectiveLang);
  }, [qType, content, effectiveLang]);

  // Khởi tạo 2 cột Trái/Phải cho dạng bài Nối ô (Match)
  const matchColumns = useMemo(() => {
    if (qType !== 'match') return { left: [], right: [] };
    const pairs = Array.isArray(content?.pairs) ? content.pairs : [];
    const traps = Array.isArray(content?.traps) ? content.traps : [];

    const left = pairs.map((p, idx) => ({
      id: p.id || 'pair_' + idx,
      text: p.term || p.question || '',
      pairId: p.id || 'pair_' + idx
    }));

    const rightItems = [
      ...pairs.map((p, idx) => ({
        id: 'r_' + (p.id || idx),
        text: p.definition || p.meaning || p.answer || '',
        pairId: p.id || 'pair_' + idx,
        isTrap: false
      })),
      ...traps.map((t, idx) => ({
        id: 'trap_' + idx,
        text:
          typeof t === 'object' && t !== null
            ? t.definition || t.meaning || t.text || ''
            : String(t || ''),
        pairId: 'TRAP_' + idx,
        isTrap: true
      }))
    ];

    return {
      left: typeof Utils?.shuffleArray === 'function' ? Utils.shuffleArray([...left]) : left,
      right:
        typeof Utils?.shuffleArray === 'function'
          ? Utils.shuffleArray([...rightItems])
          : rightItems
    };
  }, [qType, content]);

  // Tách câu thành các mảnh tương tác cho dạng bài Tìm lỗi sai (Shadow Chunking)
  const mistakeChunks = useMemo(() => {
    if (qType !== 'spot_mistake') return [];
    const sentence = String(
      content?.wrongSentence || content?.question?.term || content?.term || ''
    ).trim();
    if (!sentence) return [];

    const hasChinese = CJK_REGEX.test(sentence);
    if (effectiveLang === 'zh' || hasChinese) {
      return Array.from(sentence).filter((ch) => ch.trim().length > 0);
    }
    return sentence.split(/\s+/).filter(Boolean);
  }, [qType, content, effectiveLang]);

  // Trích xuất cấu trúc câu hỏi con khi đang ở dạng Đọc hiểu (Reading)
  const readingDescriptor = useMemo(() => {
    if (qType !== 'reading') return null;
    const passageText = String(
      content?.passage || content?.passageData?.passage || ''
    ).trim();
    const subQ =
      content?.currentSubQuestion ||
      (Array.isArray(content?.passageData?.questions)
        ? content.passageData.questions[0]
        : null) ||
      null;

    const metaType = String(meta?.type || '').toLowerCase();
    const rawSubType = String(
      meta?._subType || subQ?.type || subQ?.subType || ''
    )
      .toLowerCase()
      .trim();

    let subType = 'mcq';
    if (rawSubType === 'fill_blank' || metaType.includes('fill_blank')) {
      subType = 'fill_blank';
    } else if (rawSubType === 'tfng') {
      subType = 'tfng';
    }

    const questionText =
      subType === 'fill_blank'
        ? content?.displaySentence || subQ?.questionText || content?.term || ''
        : content?.term || subQ?.questionText || content?.question?.term || '';

    const correctAnswer =
      subType === 'fill_blank'
        ? content?.targetWord || subQ?.correctAnswer || ''
        : subQ?.correctAnswer || '';

    let options = [];
    if (Array.isArray(content?.options) && content.options.length > 0) {
      options = content.options;
    } else if (Array.isArray(subQ?.options) && subQ.options.length > 0) {
      options = subQ.options;
    } else if (subType === 'tfng') {
      options = ['True', 'False', 'Not Given'];
    }

    return {
      passageText,
      subType,
      questionText,
      correctAnswer,
      options
    };
  }, [qType, content, meta]);

  // Lấy lời giải thích / đáp án chuẩn để hiển thị sau khi chốt câu trả lời
  const explanationInfo = useMemo(() => {
    let rightAns =
      content?.targetWord ||
      content?.oddWord ||
      content?.correction ||
      content?.correctAnswer ||
      readingDescriptor?.correctAnswer ||
      '';

    if (!rightAns && qType === 'scramble') {
      rightAns = content?.term || content?.origin?.term || content?.targetSentence || '';
    }

    if (!rightAns && Array.isArray(content?.options)) {
      const found = content.options.find(
        (o) =>
          o &&
          (o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true')
      );
      if (found) rightAns = stripPhoneticStars(found.text || found.term || '');
    }

    if (!rightAns && content?.origin?.term) {
      rightAns = content.origin.term;
    }

    const explain =
      content?.explanation ||
      content?.analysis ||
      content?.hint ||
      content?.definition ||
      content?.origin?.definition ||
      content?.origin?.meaning ||
      content?.question?.meaning ||
      '';

    return { rightAns: stripPhoneticStars(rightAns), explain: String(explain || '') };
  }, [content, qType, readingDescriptor]);

  // Trích xuất thẻ chuẩn 12 cột để kiểm tra Bookmark & lưu Sổ tay / Lỗi sai
  const bookmarkTarget = useMemo(() => {
    if (!content || typeof content !== 'object') return null;

    if (content.origin && content.origin.term) {
      const orig = content.origin;
      const def = orig.definition || orig.meaning || explanationInfo.explain || '';
      return {
        ...orig,
        term: String(orig.term).trim(),
        definition: def,
        meaning: def,
        language: orig.language || effectiveLang
      };
    }

    if (qType === 'spot_mistake') {
      const term = String(
        content.correction || content.wrongSentence || content.term || ''
      ).trim();
      if (!term) return null;
      const def =
        content.definition ||
        content.explanation ||
        'Sửa "' +
          (content.wrongWord || content.errorWord || '') +
          '" ➔ "' +
          (content.correction || '') +
          '"';
      return {
        term,
        definition: def,
        meaning: def,
        example: content.wrongSentence || '',
        analysis: content.explanation || '',
        language: effectiveLang
      };
    }

    if (qType === 'fill_blank' || readingDescriptor?.subType === 'fill_blank') {
      const term = String(
        content.targetWord || readingDescriptor?.correctAnswer || ''
      ).trim();
      if (!term) return null;
      const def = content.hint || content.definition || content.explanation || '';
      return {
        term,
        definition: def,
        meaning: def,
        example: content.displaySentence || readingDescriptor?.questionText || '',
        analysis: content.explanation || '',
        language: effectiveLang
      };
    }

    if (qType === 'odd_one_out' && content.oddWord) {
      const def = content.explanation || 'Từ khác loại';
      return {
        term: String(content.oddWord).trim(),
        definition: def,
        meaning: def,
        example: Array.isArray(content.words) ? content.words.join(', ') : '',
        analysis: content.explanation || '',
        language: effectiveLang
      };
    }

    const fallbackTerm = stripPhoneticStars(
      content.term ||
        content.question?.term ||
        explanationInfo.rightAns ||
        ''
    ).trim();
    if (!fallbackTerm) return null;

    const fallbackDef =
      content.definition ||
      content.question?.meaning ||
      explanationInfo.explain ||
      explanationInfo.rightAns ||
      '';
    return {
      term: fallbackTerm,
      pronunciation: content.pronunciation || content.question?.phonetic || '',
      definition: fallbackDef,
      meaning: fallbackDef,
      example: content.example || content.displaySentence || '',
      analysis: content.explanation || content.analysis || '',
      language: effectiveLang
    };
  }, [content, qType, readingDescriptor, explanationInfo, effectiveLang]);

  const isBookmarked = useMemo(() => {
    if (!bookmarkTarget?.term || !Array.isArray(notebook)) return false;
    const targetKey = normalizeNfcKey(bookmarkTarget.term);
    if (!targetKey) return false;
    return notebook.some((item) => normalizeNfcKey(item?.term) === targetKey);
  }, [bookmarkTarget, notebook]);

  // Chốt kết quả câu hỏi cục bộ và mở bảng Giải thích
  const finalizeQuestion = useCallback(
    (isCorrect, answerPayload, basePoints = 10) => {
      if (hasSubmittedRef.current || localStatus !== 'idle') return;
      if (typeof stopAllSpeechRef.current === 'function') {
        stopAllSpeechRef.current();
      }

      const pts = isCorrect ? basePoints : 0;
      setLocalStatus(isCorrect ? 'correct' : 'wrong');
      setAnswerPayloadRecord(answerPayload);
      setEarnedPoints(pts);

      if (!isCorrect && typeof onLogWrong === 'function' && bookmarkTarget?.term) {
        const safeDef =
          bookmarkTarget.definition ||
          bookmarkTarget.meaning ||
          explanationInfo.explain ||
          'Câu sai trong kỳ thi Khảo thí';
        onLogWrong({
          id: 'exam_err_' + Date.now() + '_' + currentIndex,
          term: bookmarkTarget.term,
          pronunciation: bookmarkTarget.pronunciation || '',
          definition: safeDef,
          meaning: safeDef,
          example: bookmarkTarget.example || '',
          analysis: bookmarkTarget.analysis || explanationInfo.explain || '',
          language: effectiveLang
        });
      }
    },
    [
      localStatus,
      onLogWrong,
      bookmarkTarget,
      explanationInfo.explain,
      currentIndex,
      effectiveLang
    ]
  );

  // Đẩy kết quả chính thức lên useExamLogic theo ĐÚNG chữ ký submitAnswer(answerObj, isCorrect)
  const commitToExamEngine = useCallback(() => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    setIsCommitted(true);
    if (typeof stopAllSpeechRef.current === 'function') {
      stopAllSpeechRef.current();
    }
    if (typeof setTransitionStateRef.current === 'function') {
      setTransitionStateRef.current(false);
    }

    if (typeof onSubmitAnswer === 'function') {
      onSubmitAnswer(answerPayloadRecord, localStatus === 'correct');
    }
  }, [onSubmitAnswer, answerPayloadRecord, localStatus]);

  // Đồng hồ tự động chuyển câu sau khi đã hiện giải thích
  useEffect(() => {
    if (localStatus === 'idle' || isPaused || isCommitted) return undefined;
    if (postDelay <= 0) {
      commitToExamEngine();
      return undefined;
    }
    const timer = setTimeout(() => {
      setPostDelay((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [localStatus, isPaused, isCommitted, postDelay, commitToExamEngine]);

  // Helper kiểm tra 1 option MCQ có phải đáp án đúng không (làm sạch dấu * trước khi so sánh)
  const isOptionCorrect = useCallback(
    (opt, fallbackCorrectAnswer = '') => {
      if (typeof opt === 'object' && opt !== null && opt.isCorrect !== undefined) {
        return opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true';
      }
      const rawOptText =
        typeof opt === 'object' && opt !== null ? opt.text || opt.term || '' : String(opt || '');
      const rawExpected =
        fallbackCorrectAnswer ||
        content?.correctAnswer ||
        readingDescriptor?.correctAnswer ||
        '';
      const cleanExpected = stripPhoneticStars(rawExpected).trim();
      if (!cleanExpected) return false;

      const cleanOptText = stripPhoneticStars(rawOptText);
      return (
        Utils.advancedNormalize(cleanOptText, effectiveLang) ===
        Utils.advancedNormalize(cleanExpected, effectiveLang)
      );
    },
    [content, readingDescriptor, effectiveLang]
  );

  // ==========================================================================
  // CÁC HÀM XỬ LÝ SỰ KIỆN CHO TỪNG DẠNG BÀI THI
  // ==========================================================================

  // 1. Chọn đáp án Trắc nghiệm / Ngữ âm / Đoán hình / Nghe hiểu / Đọc hiểu MCQ & TFNG
  const handleSelectOption = (opt, idx, fallbackCorrectAnswer = '') => {
    if (localStatus !== 'idle') return;
    setSelectedIdx(idx);

    const rawText =
      typeof opt === 'object' && opt !== null ? opt.text || opt.term || '' : String(opt || '');
    const cleanDisplayText = stripPhoneticStars(rawText).trim();
    const isRight = isOptionCorrect(opt, fallbackCorrectAnswer);

    finalizeQuestion(isRight, cleanDisplayText || rawText, 10);
  };

  // 2. Chọn Từ khác loại (Odd One Out)
  const handleSelectOddWord = (word, idx) => {
    if (localStatus !== 'idle') return;
    setSelectedIdx(idx);
    const isRight =
      Utils.advancedNormalize(word, effectiveLang) ===
      Utils.advancedNormalize(content?.oddWord || '', effectiveLang);
    finalizeQuestion(isRight, word, 10);
  };

  // 3. Kiểm tra Điền từ (Fill Blank & Reading Fill Blank)
  const handleCheckFillBlank = (customVal = null) => {
    if (localStatus !== 'idle') return;
    const rawAns = customVal !== null ? customVal : textInput;
    if (!String(rawAns).trim()) return;

    const target =
      content?.targetWord ||
      readingDescriptor?.correctAnswer ||
      content?.correctAnswer ||
      content?.origin?.term ||
      '';
    const isRight =
      Boolean(String(target).trim()) &&
      Utils.advancedNormalize(rawAns, effectiveLang) ===
        Utils.advancedNormalize(target, effectiveLang);

    setTextInput(String(rawAns));
    finalizeQuestion(isRight, String(rawAns).trim(), 15);
  };

  // 4. Kiểm tra Tìm lỗi sai (Spot Mistake)
  const handleVerifyMistakeChunk = () => {
    if (selectedChunks.length === 0 || localStatus !== 'idle') return;
    setMistakeStep(2);
  };

  const handleCheckMistakeCorrection = () => {
    if (!textInput.trim() || localStatus !== 'idle') return;
    const selectedText = selectedChunks
      .map((i) => mistakeChunks[i])
      .join(effectiveLang === 'zh' ? '' : ' ');

    const expectedError = String(
      content?.wrongWord || content?.errorWord || ''
    ).trim();
    const expectedCorrection = String(content?.correction || '').trim();

    const normSelected = Utils.advancedNormalize(selectedText, effectiveLang);
    const normExpectedError = Utils.advancedNormalize(expectedError, effectiveLang);
    const normInput = Utils.advancedNormalize(textInput, effectiveLang);
    const normExpectedCorrection = Utils.advancedNormalize(
      expectedCorrection,
      effectiveLang
    );

    const hitError =
      Boolean(normExpectedError) &&
      (normSelected === normExpectedError ||
        normSelected.includes(normExpectedError) ||
        normExpectedError.includes(normSelected));

    const hitCorrection =
      (Boolean(normExpectedCorrection) && normInput === normExpectedCorrection) ||
      (Boolean(content?.origin?.term) &&
        normInput === Utils.advancedNormalize(content.origin.term, effectiveLang));

    const isRight = Boolean(hitError && hitCorrection);
    // Đúng schema { selectedWord, correction } của useExamLogic.exportExamToExcel
    finalizeQuestion(
      isRight,
      {
        selectedWord: selectedText,
        correction: textInput.trim(),
        text: 'Chọn: "' + selectedText + '" ➔ Sửa: "' + textInput.trim() + '"'
      },
      15
    );
  };

  // 5. Kiểm tra Ghép câu (Scramble)
  const handleCheckScramble = () => {
    if (localStatus !== 'idle' || scrambleSelected.length === 0) return;
    const joined = scrambleSelected
      .map((item) => item.text)
      .join(effectiveLang === 'zh' ? '' : ' ')
      .trim();

    if (!joined) return;
    const targetSentence =
      content?.term ||
      content?.origin?.term ||
      content?.targetSentence ||
      content?.correctAnswer ||
      '';
    const isRight =
      Boolean(String(targetSentence).trim()) &&
      Utils.advancedNormalize(joined, effectiveLang) ===
        Utils.advancedNormalize(targetSentence, effectiveLang);

    finalizeQuestion(isRight, joined, 15);
  };

  // 6. Xử lý Nối từ (Match dạng 2 cột — hiển thị rõ lượt sai & báo Toast lần sai 1)
  const handleMatchRightClick = (rightItem) => {
    if (localStatus !== 'idle' || !matchLeftSelected) return;
    if (matchedPairIds.includes(rightItem.pairId)) return;

    if (matchLeftSelected.pairId === rightItem.pairId && !rightItem.isTrap) {
      const nextMatched = [...matchedPairIds, rightItem.pairId];
      setMatchedPairIds(nextMatched);
      setMatchLeftSelected(null);

      if (nextMatched.length >= matchColumns.left.length) {
        finalizeQuestion(
          matchMistakes === 0,
          'Hoàn thành nối ' + nextMatched.length + ' cặp (Sai ' + matchMistakes + ' lần)',
          15
        );
      }
    } else {
      const nextMistakes = matchMistakes + 1;
      setMatchMistakes(nextMistakes);
      setMatchLeftSelected(null);
      if (nextMistakes >= 2) {
        finalizeQuestion(false, 'Nối sai quá số lượt quy định', 0);
      } else if (typeof notifyToast === 'function') {
        notifyToast('Nối chưa khớp! Bạn còn 1 lượt thử.', 'warning');
      }
    }
  };

  // 7. Phát âm thanh Kịch bản Nghe (Listening) theo chuẩn 4 tham số useAppLogic Ver 1.1
  const handlePlayListeningScript = () => {
    if (isPlayingAudio) return;
    const maxPlays = content?.maxPlays || 2;
    if (listenPlays >= maxPlays) {
      if (typeof notifyToast === 'function') {
        notifyToast(
          'Bạn đã dùng hết ' + maxPlays + '/' + maxPlays + ' lượt nghe cho câu này.',
          'warning'
        );
      }
      return;
    }

    const scriptText = String(
      content?.audioScript ||
        content?.transcript ||
        content?.question?.term ||
        ''
    ).trim();
    if (!scriptText) {
      if (typeof notifyToast === 'function') {
        notifyToast('Câu hỏi này chưa có kịch bản âm thanh.', 'warning');
      }
      return;
    }
    if (typeof onPlay !== 'function') {
      if (typeof notifyToast === 'function') {
        notifyToast('Bộ phát âm thanh hiện chưa sẵn sàng.', 'error');
      }
      return;
    }

    setListenPlays((p) => p + 1);
    setIsPlayingAudio(true);

    const finishPlayback = () => {
      if (audioTimerRef.current) {
        clearTimeout(audioTimerRef.current);
        audioTimerRef.current = null;
      }
      if (isMountedRef.current) {
        setIsPlayingAudio(false);
      }
    };

    // Truyền chuẩn 4 tham số: speak(text, rate=null, forceVoiceName=null, onEndCallback)
    onPlay(scriptText, null, null, finishPlayback);

    // Timer dự phòng chống kẹt trạng thái nút loa nếu trình duyệt không kích hoạt onend
    const estDuration = Math.min(
      30000,
      Math.max(4000, scriptText.split(/\s+/).length * 520)
    );
    if (audioTimerRef.current) clearTimeout(audioTimerRef.current);
    audioTimerRef.current = setTimeout(finishPlayback, estDuration);
  };

  // Bỏ qua câu hỏi
  const handleSkipQuestion = () => {
    if (localStatus !== 'idle') return;
    if (qType === 'spot_mistake') {
      finalizeQuestion(
        false,
        { selectedWord: '[Bỏ qua]', correction: '', text: '[Bỏ qua]' },
        0
      );
      return;
    }
    finalizeQuestion(false, '[Bỏ qua]', 0);
  };

  // ==========================================================================
  // RENDER GIAO DIỆN CHI TIẾT THEO TỪNG LOẠI CÂU HỎI
  // ==========================================================================
  const renderQuestionBody = () => {
    // ------------------------------------------------------------------------
    // DẠNG 1: ĐỌC HIỂU (READING - SPLIT VIEW: MCQ / TFNG / FILL BLANK)
    // ------------------------------------------------------------------------
    if (qType === 'reading' && readingDescriptor) {
      const { passageText, subType, questionText, correctAnswer, options } =
        readingDescriptor;

      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
          {/* Cột Trái: Bài đọc học thuật */}
          <div className="bg-amber-50/50 border-2 border-amber-100 rounded-2xl p-4 sm:p-5 max-h-[320px] lg:max-h-[440px] overflow-y-auto custom-scrollbar text-left shadow-inner">
            <div className="flex items-center gap-2 text-xs font-black text-amber-800 uppercase tracking-wider mb-3 pb-2 border-b border-amber-200/60">
              <Icons.BookOpen size={16} /> Văn bản Đọc hiểu
            </div>
            <div className="text-sm sm:text-base text-gray-800 leading-relaxed whitespace-pre-line font-serif">
              {passageText}
            </div>
          </div>

          {/* Cột Phải: Câu hỏi & Lựa chọn */}
          <div className="flex flex-col justify-between bg-white border-2 border-gray-100 rounded-2xl p-4 sm:p-5 text-left">
            <div>
              <span className="inline-block px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase mb-2">
                {subType === 'tfng'
                  ? 'True / False / Not Given'
                  : subType === 'fill_blank'
                  ? 'Điền từ vào chỗ trống'
                  : 'Trắc nghiệm Đọc hiểu'}
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-gray-800 mb-4 leading-snug">
                {subType === 'fill_blank'
                  ? renderClozeSentence(questionText)
                  : questionText}
              </h3>

              {subType === 'fill_blank' ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    disabled={localStatus !== 'idle'}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCheckFillBlank();
                    }}
                    placeholder="Gõ từ cần điền vào đây..."
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full p-3.5 rounded-xl border-2 border-gray-200 focus:border-indigo-500 outline-none font-bold text-gray-800"
                  />
                  {localStatus === 'idle' && (
                    <button
                      type="button"
                      onClick={() => handleCheckFillBlank()}
                      disabled={!textInput.trim()}
                      className="w-full py-3 bg-indigo-600 disabled:bg-gray-300 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all"
                    >
                      Chốt đáp án
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {options.map((opt, idx) => {
                    const text =
                      typeof opt === 'object' && opt !== null
                        ? opt.text || opt.term || ''
                        : String(opt || '');
                    const isPicked = selectedIdx === idx;
                    const isCorrectOpt =
                      localStatus !== 'idle' && isOptionCorrect(opt, correctAnswer);

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={localStatus !== 'idle'}
                        onClick={() =>
                          handleSelectOption(opt, idx, correctAnswer)
                        }
                        className={`w-full p-3.5 rounded-xl border-2 text-left font-bold text-sm transition-all flex items-center gap-3 ${
                          localStatus !== 'idle' && isCorrectOpt
                            ? 'bg-green-50 border-green-500 text-green-800'
                            : isPicked && localStatus === 'wrong'
                            ? 'bg-red-50 border-red-500 text-red-800'
                            : 'bg-gray-50 hover:bg-indigo-50/50 border-gray-200 text-gray-700'
                        }`}
                      >
                        <span className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-xs font-black shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1">{text}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 2: ĐÔI TAI VÀNG (LISTENING)
    // ------------------------------------------------------------------------
    if (qType === 'listening') {
      const maxPlays = content?.maxPlays || 2;
      const isOutOfPlays = listenPlays >= maxPlays;
      const options = Array.isArray(content?.options) ? content.options : [];
      const promptText =
        content?.term ||
        content?.questionText ||
        content?.question?.meaning ||
        'Nghe đoạn băng và chọn đáp án đúng nhất:';

      return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-5">
          <div className="flex flex-col items-center p-5 bg-cyan-50/70 border-2 border-cyan-100 rounded-2xl w-full">
            <button
              type="button"
              onClick={handlePlayListeningScript}
              disabled={isPlayingAudio}
              aria-disabled={isOutOfPlays || isPlayingAudio}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all ${
                isPlayingAudio
                  ? 'bg-cyan-600 text-white ring-8 ring-cyan-200 animate-pulse'
                  : isOutOfPlays
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white active:scale-95'
              }`}
              aria-label="Phát đoạn băng nghe hiểu"
            >
              <Icons.Headphones size={34} />
            </button>
            <span className="mt-2.5 text-xs font-bold text-cyan-800">
              {isPlayingAudio
                ? 'Đang phát băng âm thanh...'
                : isOutOfPlays
                ? 'Đã hết lượt nghe (' + listenPlays + '/' + maxPlays + ' lần)'
                : 'Lượt nghe: ' + listenPlays + '/' + maxPlays + ' lần'}
            </span>
          </div>

          <h3 className="text-base sm:text-xl font-black text-gray-800 text-center">
            {promptText}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {options.map((opt, idx) => {
              const text =
                typeof opt === 'object' && opt !== null
                  ? opt.text || opt.term || ''
                  : String(opt || '');
              const isPicked = selectedIdx === idx;
              const isCorrectOpt = localStatus !== 'idle' && isOptionCorrect(opt);

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={localStatus !== 'idle'}
                  onClick={() => handleSelectOption(opt, idx)}
                  className={`p-4 rounded-xl border-2 text-left font-bold text-sm transition-all flex items-center gap-3 ${
                    localStatus !== 'idle' && isCorrectOpt
                      ? 'bg-green-50 border-green-500 text-green-800'
                      : isPicked && localStatus === 'wrong'
                      ? 'bg-red-50 border-red-500 text-red-800'
                      : 'bg-white hover:bg-cyan-50/40 border-gray-200 text-gray-700'
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-black shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">{text}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 3: ĐOÁN HÌNH ẢNH (IMAGE QUIZ)
    // ------------------------------------------------------------------------
    if (qType === 'image_quiz') {
      const options = Array.isArray(content?.options) ? content.options : [];
      const targetTerm =
        content?.term ||
        content?.question?.term ||
        content?.targetWord ||
        content?.questionText ||
        '';
      const targetPhonetic =
        content?.pronunciation || content?.question?.phonetic || '';

      return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-5">
          <div className="text-center">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
              Chọn hình ảnh minh họa đúng cho từ:
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-gray-800 mt-1">
              {targetTerm}
            </h3>
            {targetPhonetic && (
              <p className="text-sm font-mono text-gray-500 mt-0.5">
                {targetPhonetic}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3.5 w-full">
            {options.map((opt, idx) => {
              const labelText =
                typeof opt === 'object' && opt !== null
                  ? opt.text || opt.term || ''
                  : String(opt || '');
              const kw =
                (typeof opt === 'object' && opt !== null
                  ? opt.image_keyword || opt.definition || opt.text || opt.term
                  : String(opt || '')) || 'object';

              let imgUrl =
                typeof opt === 'object' && opt !== null && opt.image
                  ? String(opt.image).trim()
                  : '';
              if (!imgUrl && typeof Utils?.buildSmartImageUrl === 'function') {
                imgUrl = Utils.buildSmartImageUrl(kw, '', 'vocab') || '';
              }
              if (!imgUrl) {
                imgUrl =
                  'https://tse2.mm.bing.net/th?q=' +
                  encodeURIComponent(kw + ' clipart cartoon vector') +
                  '&w=300&h=300&c=7&rs=1&p=0';
              }

              const isPicked = selectedIdx === idx;
              const isCorrectOpt = localStatus !== 'idle' && isOptionCorrect(opt);
              const imgFailed = Boolean(failedImgIndices[idx]);

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={localStatus !== 'idle'}
                  onClick={() => handleSelectOption(opt, idx)}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all bg-white ${
                    localStatus !== 'idle' && isCorrectOpt
                      ? 'border-green-500 ring-4 ring-green-100'
                      : isPicked && localStatus === 'wrong'
                      ? 'border-red-500 ring-4 ring-red-100'
                      : 'border-gray-200 hover:border-emerald-400'
                  }`}
                >
                  {imgFailed ? (
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center p-2 text-center">
                      <Icons.Image size={26} className="text-emerald-400 mb-1" />
                      <span className="text-xs font-bold text-emerald-800 line-clamp-2">
                        {labelText}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={imgUrl}
                      alt={labelText || kw}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImgIndices((prev) => ({ ...prev, [idx]: true }))
                      }
                      className="w-28 h-28 sm:w-32 sm:h-32 object-contain rounded-xl"
                      loading="lazy"
                    />
                  )}
                  {localStatus !== 'idle' && (
                    <span className="text-xs font-bold text-gray-700">
                      {labelText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 4: TỪ KHÁC LOẠI (ODD ONE OUT)
    // ------------------------------------------------------------------------
    if (qType === 'odd_one_out') {
      const words = Array.isArray(content?.words) ? content.words : [];
      const expectedOddNorm = Utils.advancedNormalize(
        content?.oddWord || '',
        effectiveLang
      );

      return (
        <div className="w-full max-w-xl mx-auto flex flex-col items-center space-y-5">
          <div className="text-center">
            <span className="text-xs font-bold text-pink-600 uppercase tracking-wider">
              Tìm từ không cùng nhóm với 3 từ còn lại:
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3.5 w-full">
            {words.map((w, idx) => {
              const wordStr =
                typeof w === 'object' && w !== null
                  ? w.text || w.term || ''
                  : String(w || '');
              const isPicked = selectedIdx === idx;
              const isCorrectWord =
                localStatus !== 'idle' &&
                Utils.advancedNormalize(wordStr, effectiveLang) === expectedOddNorm;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={localStatus !== 'idle'}
                  onClick={() => handleSelectOddWord(wordStr, idx)}
                  className={`p-5 rounded-2xl border-2 font-black text-base sm:text-lg transition-all ${
                    localStatus !== 'idle' && isCorrectWord
                      ? 'bg-green-50 border-green-500 text-green-800'
                      : isPicked && localStatus === 'wrong'
                      ? 'bg-red-50 border-red-500 text-red-800'
                      : 'bg-white hover:bg-pink-50/40 border-gray-200 text-gray-800'
                  }`}
                >
                  {wordStr}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 5: ĐIỀN TỪ KHUYẾT (FILL BLANK)
    // ------------------------------------------------------------------------
    if (qType === 'fill_blank') {
      const wordBank = Array.isArray(content?.wordBank) ? content.wordBank : [];
      const displaySentence =
        content?.displaySentence ||
        content?.term ||
        content?.question?.term ||
        '';
      const hintText = content?.hint || content?.definition || '';

      return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-5">
          <div className="w-full p-5 bg-blue-50/50 border-2 border-blue-100 rounded-2xl text-center">
            <p className="text-lg sm:text-xl font-black text-gray-800 leading-relaxed">
              {renderClozeSentence(displaySentence)}
            </p>
            {hintText && (
              <p className="text-xs sm:text-sm text-gray-500 font-medium mt-2 italic">
                💡 {hintText}
              </p>
            )}
          </div>

          {wordBank.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {wordBank.map((wb, idx) => {
                const wbText =
                  typeof wb === 'object' && wb !== null
                    ? wb.text || ''
                    : String(wb || '');
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={localStatus !== 'idle'}
                    onClick={() => handleCheckFillBlank(wbText)}
                    className="px-4 py-2 bg-white hover:bg-blue-50 border-2 border-blue-200 rounded-xl font-bold text-sm text-blue-700 shadow-sm active:scale-95 transition-all"
                  >
                    {wbText}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 w-full">
            <input
              type="text"
              value={textInput}
              disabled={localStatus !== 'idle'}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCheckFillBlank();
              }}
              placeholder="Gõ từ còn thiếu vào đây..."
              autoComplete="off"
              spellCheck="false"
              className="flex-1 p-3.5 rounded-xl border-2 border-gray-200 focus:border-blue-500 outline-none font-bold text-gray-800"
            />
            {localStatus === 'idle' && (
              <button
                type="button"
                disabled={!textInput.trim()}
                onClick={() => handleCheckFillBlank()}
                className="px-6 py-3.5 bg-blue-600 disabled:bg-gray-300 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all"
              >
                Kiểm tra
              </button>
            )}
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 6: TÌM LỖI SAI (SPOT MISTAKE - 2 STEPS)
    // ------------------------------------------------------------------------
    if (qType === 'spot_mistake') {
      const sentenceHint =
        content?.definition ||
        content?.origin?.definition ||
        content?.origin?.meaning ||
        '';

      return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-5">
          <div className="text-center">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">
              Bước 1: Chạm vào từ bị sai trong câu ➔ Bước 2: Gõ từ sửa lại cho đúng
            </span>
            {sentenceHint && (
              <p className="text-xs sm:text-sm text-gray-500 mt-1 italic">
                Nghĩa câu: {sentenceHint}
              </p>
            )}
          </div>

          <div className="w-full p-5 bg-red-50/40 border-2 border-red-100 rounded-2xl flex flex-wrap justify-center gap-2">
            {mistakeChunks.map((chunk, idx) => {
              const isSelected = selectedChunks.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={localStatus !== 'idle'}
                  onClick={() => {
                    setSelectedChunks((prev) =>
                      prev.includes(idx)
                        ? prev.filter((i) => i !== idx)
                        : [...prev, idx].sort((a, b) => a - b)
                    );
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold text-base sm:text-lg border-2 transition-all ${
                    isSelected
                      ? 'bg-red-600 text-white border-red-600 shadow-md scale-105'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-red-300'
                  }`}
                >
                  {chunk}
                </button>
              );
            })}
          </div>

          {mistakeStep === 1 && localStatus === 'idle' && (
            <button
              type="button"
              disabled={selectedChunks.length === 0}
              onClick={handleVerifyMistakeChunk}
              className="px-6 py-3 bg-red-600 disabled:bg-gray-300 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Xác nhận vị trí sai ➔ Sửa lỗi
            </button>
          )}

          {mistakeStep === 2 && (
            <div className="flex flex-col sm:flex-row gap-2 w-full animate-in fade-in">
              <input
                type="text"
                value={textInput}
                disabled={localStatus !== 'idle'}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCheckMistakeCorrection();
                }}
                placeholder="Gõ từ đúng để thay thế cho từ sai..."
                autoComplete="off"
                spellCheck="false"
                className="flex-1 p-3.5 rounded-xl border-2 border-red-300 focus:border-red-500 outline-none font-bold text-gray-800"
              />
              {localStatus === 'idle' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMistakeStep(1)}
                    className="px-4 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm"
                  >
                    Chọn lại
                  </button>
                  <button
                    type="button"
                    disabled={!textInput.trim()}
                    onClick={handleCheckMistakeCorrection}
                    className="px-6 py-3.5 bg-red-600 disabled:bg-gray-300 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all"
                  >
                    Chốt sửa lỗi
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 7: GHÉP CÂU (SCRAMBLE)
    // ------------------------------------------------------------------------
    if (qType === 'scramble') {
      const remainingPool = scramblePool.filter(
        (item) => !scrambleSelected.some((s) => s.id === item.id)
      );
      const meaningHint =
        content?.definition ||
        content?.origin?.definition ||
        content?.origin?.meaning ||
        '';

      return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-4">
          {meaningHint && (
            <div className="w-full p-3.5 bg-orange-50 border border-orange-200 rounded-xl text-center text-sm font-bold text-orange-900">
              💡 Nghĩa: {meaningHint}
            </div>
          )}

          {/* Khung câu đang ghép */}
          <div className="w-full min-h-[76px] p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl flex flex-wrap items-center gap-2">
            {scrambleSelected.length === 0 ? (
              <span className="text-xs text-gray-400 font-medium mx-auto">
                Chạm vào các thẻ từ bên dưới theo đúng thứ tự để ghép thành câu...
              </span>
            ) : (
              scrambleSelected.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={localStatus !== 'idle'}
                  onClick={() =>
                    setScrambleSelected((prev) =>
                      prev.filter((s) => s.id !== item.id)
                    )
                  }
                  className="px-3.5 py-2 bg-orange-600 text-white font-bold text-sm rounded-xl shadow-sm hover:bg-orange-700 transition-all"
                >
                  {item.text}
                </button>
              ))
            )}
          </div>

          {/* Kho thẻ từ bên dưới */}
          <div className="w-full p-4 bg-white border border-gray-200 rounded-2xl flex flex-wrap justify-center gap-2">
            {remainingPool.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={localStatus !== 'idle'}
                onClick={() =>
                  setScrambleSelected((prev) => [...prev, item])
                }
                className="px-3.5 py-2 bg-gray-100 hover:bg-orange-50 text-gray-800 border border-gray-300 font-bold text-sm rounded-xl transition-all active:scale-95"
              >
                {item.text}
              </button>
            ))}
          </div>

          {localStatus === 'idle' && (
            <button
              type="button"
              disabled={scrambleSelected.length === 0}
              onClick={handleCheckScramble}
              className="w-full py-3.5 bg-orange-600 disabled:bg-gray-300 hover:bg-orange-700 text-white font-bold rounded-xl shadow-md transition-all"
            >
              Kiểm tra câu ghép
            </button>
          )}
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG 8: NỐI TỪ & NGHĨA (MATCH 2 CỘT)
    // ------------------------------------------------------------------------
    if (qType === 'match') {
      return (
        <div className="w-full max-w-3xl mx-auto space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-2 text-center">
            <span className="text-xs font-bold text-purple-700 uppercase">
              Chọn 1 ô bên Trái rồi chạm vào ô tương ứng bên Phải ({matchedPairIds.length}/
              {matchColumns.left.length} cặp)
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                matchMistakes > 0
                  ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              Sai: {matchMistakes}/2
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Cột Trái */}
            <div className="space-y-2.5">
              {matchColumns.left.map((item) => {
                const isMatched = matchedPairIds.includes(item.pairId);
                const isSelected = matchLeftSelected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isMatched || localStatus !== 'idle'}
                    onClick={() => setMatchLeftSelected(item)}
                    className={`w-full p-3.5 rounded-xl border-2 font-bold text-sm text-left transition-all ${
                      isMatched
                        ? 'bg-green-50 border-green-300 text-green-700 opacity-50'
                        : isSelected
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                        : 'bg-white hover:bg-purple-50 border-gray-200 text-gray-800'
                    }`}
                  >
                    {item.text}
                  </button>
                );
              })}
            </div>

            {/* Cột Phải */}
            <div className="space-y-2.5">
              {matchColumns.right.map((item) => {
                const isMatched = matchedPairIds.includes(item.pairId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isMatched || localStatus !== 'idle'}
                    onClick={() => handleMatchRightClick(item)}
                    className={`w-full p-3.5 rounded-xl border-2 font-bold text-sm text-left transition-all ${
                      isMatched
                        ? 'bg-green-50 border-green-300 text-green-700 opacity-50'
                        : 'bg-white hover:bg-indigo-50 border-gray-200 text-gray-700'
                    }`}
                  >
                    {item.text}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // ------------------------------------------------------------------------
    // DẠNG MẶC ĐỊNH: TRẮC NGHIỆM CHUẨN & VUA NGỮ ÂM (QUIZ / PRONUNCIATION / MOCK MATCH)
    // ------------------------------------------------------------------------
    const promptText =
      content?.term ||
      content?.question?.term ||
      content?.questionText ||
      content?.prompt ||
      (qType === 'pronunciation'
        ? 'Chọn từ có phần gạch chân phát âm khác với các từ còn lại:'
        : 'Chọn đáp án đúng nhất:');
    const promptPhonetic =
      content?.pronunciation || content?.question?.phonetic || '';

    const options = Array.isArray(content?.options)
      ? content.options
      : Array.isArray(content?.words)
      ? content.words.map((w) => ({
          text: String(w || ''),
          isCorrect:
            Utils.advancedNormalize(stripPhoneticStars(w), effectiveLang) ===
            Utils.advancedNormalize(
              stripPhoneticStars(content?.oddWord || content?.correctAnswer || ''),
              effectiveLang
            )
        }))
      : [];

    return (
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center space-y-5">
        <div className="w-full p-5 bg-indigo-50/50 border-2 border-indigo-100 rounded-2xl text-center">
          {qType === 'pronunciation' && (
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black uppercase mb-2">
              Vua Ngữ Âm • Phân biệt phát âm
            </span>
          )}
          <h3 className="text-lg sm:text-2xl font-black text-gray-800 leading-snug">
            {renderClozeSentence(promptText)}
          </h3>
          {promptPhonetic && (
            <p className="text-sm font-mono text-indigo-600 mt-1">
              {promptPhonetic}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          {options.map((opt, idx) => {
            const text =
              typeof opt === 'object' && opt !== null
                ? opt.text || opt.term || ''
                : String(opt || '');
            const isPicked = selectedIdx === idx;
            const isCorrectOpt = localStatus !== 'idle' && isOptionCorrect(opt);

            return (
              <button
                key={idx}
                type="button"
                disabled={localStatus !== 'idle'}
                onClick={() => handleSelectOption(opt, idx)}
                className={`p-4 rounded-2xl border-2 text-left font-bold text-sm sm:text-base transition-all flex items-center gap-3 ${
                  localStatus !== 'idle' && isCorrectOpt
                    ? 'bg-green-50 border-green-500 text-green-800 shadow-sm'
                    : isPicked && localStatus === 'wrong'
                    ? 'bg-red-50 border-red-500 text-red-800 shadow-sm'
                    : 'bg-white hover:bg-indigo-50/40 border-gray-200 text-gray-800'
                }`}
              >
                <span className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-xs font-black shrink-0">
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1">
                  {qType === 'pronunciation'
                    ? renderHighlightedPhoneticText(text)
                    : text}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const isRescuedQuestion = Boolean(content?._isRescued || content?._isFallback);
  const displayTypeLabel = QUESTION_TYPE_LABELS[qType] || qType;

  return (
    <div className="w-full flex flex-col justify-between flex-1">
      {/* Thanh công cụ phụ của Câu hỏi (Loa đọc mẫu & Lưu Sổ tay) */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-3 py-1 rounded-lg border font-black text-xs uppercase tracking-wider ${theme.badge}`}
          >
            Dạng bài: {displayTypeLabel}
          </span>
          {isRescuedQuestion && (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
              Kho dự phòng
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {typeof onPlay === 'function' &&
            bookmarkTarget?.term &&
            qType !== 'listening' && (
              <button
                type="button"
                onClick={() => onPlay(bookmarkTarget.term, null, null, null)}
                className="p-2 rounded-xl bg-gray-100 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 transition-colors"
                title="Nghe phát âm"
                aria-label="Nghe phát âm"
              >
                <Icons.Volume2 size={18} />
              </button>
            )}
          {typeof onBookmark === 'function' && bookmarkTarget && (
            <button
              type="button"
              onClick={() => onBookmark(bookmarkTarget)}
              className={`p-2 rounded-xl border transition-colors ${
                isBookmarked
                  ? 'bg-yellow-50 border-yellow-300 text-yellow-600'
                  : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-yellow-600'
              }`}
              title={isBookmarked ? 'Đã lưu trong Sổ tay' : 'Lưu vào Sổ tay'}
              aria-label="Lưu vào Sổ tay"
            >
              <Icons.Bookmark
                size={18}
                fill={isBookmarked ? 'currentColor' : 'none'}
              />
            </button>
          )}
        </div>
      </div>

      {/* Nội dung tương tác chính */}
      <div className="my-auto py-2">{renderQuestionBody()}</div>

      {/* Bảng Giải thích & Điều khiển Chuyển câu sau khi trả lời */}
      {localStatus !== 'idle' && (
        <div
          className={`mt-5 p-4 rounded-2xl border-2 animate-in slide-in-from-bottom-2 ${
            localStatus === 'correct'
              ? 'bg-green-50/90 border-green-200 text-green-900'
              : 'bg-red-50/90 border-red-200 text-red-900'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-left space-y-1">
              <div className="font-black text-sm sm:text-base flex items-center gap-1.5">
                {localStatus === 'correct' ? (
                  <>
                    <Icons.Check size={18} className="text-green-600" /> Chính xác! (+{earnedPoints} điểm)
                  </>
                ) : (
                  <>
                    <Icons.X size={18} className="text-red-600" /> Chưa chính xác!
                  </>
                )}
              </div>
              {explanationInfo.rightAns && (
                <p className="text-xs sm:text-sm font-bold">
                  Đáp án đúng:{' '}
                  <span className="underline">{explanationInfo.rightAns}</span>
                </p>
              )}
              {explanationInfo.explain && (
                <p className="text-xs text-gray-700 leading-relaxed">
                  💡 {explanationInfo.explain}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isCommitted && (
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  className="px-3 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-700 font-bold text-xs hover:bg-gray-100"
                >
                  {isPaused ? '▶️ Tiếp tục đếm' : '⏸️ Dừng (' + postDelay + 's)'}
                </button>
              )}
              <button
                type="button"
                disabled={isCommitted}
                onClick={commitToExamEngine}
                className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-1.5 transition-all ${
                  isCommitted
                    ? 'bg-indigo-400 cursor-not-allowed'
                    : theme.accentBtn
                }`}
              >
                {isCommitted ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>
                      {examCooldown > 0
                        ? 'Đang chuyển câu (' + examCooldown + 's)...'
                        : isHydrating
                        ? 'Đang nạp câu kế tiếp...'
                        : 'Đang chuyển câu...'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>Câu tiếp</span>
                    <Icons.ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nút Bỏ qua câu hỏi nếu học sinh không biết làm */}
      {localStatus === 'idle' && (
        <div className="mt-6 pt-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={handleSkipQuestion}
            className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
          >
            Bỏ qua câu này <Icons.ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPONENT CHÍNH: KHUNG GIAO DIỆN PHÒNG THI TỔNG HỢP (ExamUIShell)
// ============================================================================
export const ExamUIShell = ({
  examLogic = undefined,
  question: directQuestion = undefined,
  currentIndex: directIndex = undefined,
  totalQuestions: directTotal = undefined,
  timeLeft: directTimeLeft = undefined,
  onAnswerSubmit: directSubmit = undefined,
  onSpeak = undefined,
  onPlay = undefined,
  speak = undefined,
  stopSpeaking = undefined,
  onPause = undefined,
  showToast = undefined,
  onBookmark = undefined,
  notebook = undefined,
  onLogWrong = undefined,
  onOpenIncorrect = undefined,
  onExit = undefined,
  lang = 'en',
  mainColor = 'indigo'
}) => {
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const examState = examLogic?.examState || {
    status: 'playing',
    currentIndex: directIndex || 0,
    timeRemaining: directTimeLeft || 0,
    blueprint: new Array(directTotal || 1).fill({}),
    score: 0
  };

  const activeQuestion = examLogic?.currentQuestion ?? directQuestion ?? null;
  const activeIndex = examState.currentIndex ?? directIndex ?? 0;
  const totalQuestions = examState.blueprint?.length || directTotal || 1;
  const timeRemaining = examState.timeRemaining ?? directTimeLeft ?? 0;
  const cachedCount = examLogic?.cachedCount ?? 0;
  const examCooldown = examLogic?.examCooldown ?? 0;
  const isHydrating = Boolean(examLogic?.isHydrating);
  const speakFn = onPlay || speak || onSpeak;
  const theme = EXAM_COLOR_THEMES[mainColor] || EXAM_COLOR_THEMES.indigo;

  // Thông báo Toast tương thích kép (hỗ trợ prop showToast từ GameView & fallback global)
  const notifyToast = useCallback(
    (msg, type = 'info') => {
      const text = String(msg || '').trim();
      if (!text) return;
      if (typeof showToast === 'function') {
        showToast(text, type);
      } else if (typeof window !== 'undefined' && typeof window.globalShowToast === 'function') {
        window.globalShowToast(text, type);
      }
    },
    [showToast]
  );

  // Ngắt hoàn toàn giọng đọc TTS khi chuyển câu / thoát phòng thi / unmount
  const stopAllSpeech = useCallback(() => {
    try {
      if (typeof stopSpeaking === 'function') {
        stopSpeaking();
      } else if (typeof onPause === 'function') {
        onPause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {
      console.warn('[ExamUIShell] Stop speech warning:', e);
    }
  }, [stopSpeaking, onPause]);

  // Khóa ref để cleanup unmount của ExamUIShell chỉ chạy khi thực sự rời phòng thi
  const stopAllSpeechRef = useRef(stopAllSpeech);
  useEffect(() => {
    stopAllSpeechRef.current = stopAllSpeech;
  }, [stopAllSpeech]);

  useEffect(() => {
    return () => {
      if (typeof stopAllSpeechRef.current === 'function') {
        stopAllSpeechRef.current();
      }
    };
  }, []);

  // Thoát phòng thi an toàn (tránh gọi đúp quitExam vì GameView.onExit đã gọi tập trung)
  const handleExitRoom = useCallback(() => {
    stopAllSpeech();
    if (typeof onExit === 'function') {
      onExit();
    } else if (typeof examLogic?.quitExam === 'function') {
      examLogic.quitExam();
    }
  }, [stopAllSpeech, onExit, examLogic]);

  // Nộp bài thi sớm
  const handleForceSubmit = useCallback(() => {
    stopAllSpeech();
    if (typeof examLogic?.setTransitionState === 'function') {
      examLogic.setTransitionState(false);
    }
    if (typeof examLogic?.forceSubmitExam === 'function') {
      examLogic.forceSubmitExam();
    }
  }, [stopAllSpeech, examLogic]);

  // Đóng Modal xác nhận bằng phím Escape (A11y)
  useEffect(() => {
    if (!showExitConfirm && !showSubmitConfirm) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowExitConfirm(false);
        setShowSubmitConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showExitConfirm, showSubmitConfirm]);

  // 1. TRẠNG THÁI ĐANG KHỞI TẠO ĐỀ THI (PRELOADING)
  if (examState.status === 'loading') {
    return (
      <GlobalLoadingScreen
        duration={examState.preloadCountdown || 30}
        queueLength={cachedCount}
        text="Phòng Thi Đang Khởi Tạo..."
        subText="Đang nạp ngân hàng đề và phân bổ tổ kén câu hỏi"
        mainColor={mainColor}
        onComplete={undefined}
        onCancel={handleExitRoom}
      />
    );
  }

  // 2. TRẠNG THÁI LỖI KHỞI TẠO KỲ THI
  if (examState.status === 'error') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 rounded-2xl border-2 border-red-200 p-6 text-center animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
          <Icons.AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-black text-red-700 mb-2">
          Không thể khởi tạo Phòng thi
        </h2>
        <p className="text-sm text-red-600 mb-6 max-w-md">
          Kết nối mạng bị gián đoạn hoặc chưa cấu hình API Key hợp lệ. Vui lòng kiểm tra lại và thử lại.
        </p>
        <button
          type="button"
          onClick={handleExitRoom}
          className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md transition-all"
        >
          Quay lại Menu
        </button>
      </div>
    );
  }

  // 3. TRẠNG THÁI HOÀN THÀNH BÀI THI -> HIỂN THỊ BÁO CÁO GRAND REPORT
  if (examState.status === 'completed') {
    return (
      <ExamReportUI
        examState={examState}
        mainColor={mainColor}
        onExit={handleExitRoom}
        onBackToMenu={handleExitRoom}
        exportExamToExcel={examLogic?.exportExamToExcel}
        onExportExcel={examLogic?.exportExamToExcel}
        onBookmark={onBookmark}
        notebook={notebook}
      />
    );
  }

  // 4. MÀN HÌNH NGHỈ CHUYỂN CHẶNG 20 GIÂY (OPTIMISTIC_* HOẶC LEGACY PHASE INTERMISSION)
  const isOptimisticIntermission = Boolean(
    activeQuestion &&
      (String(activeQuestion.id || '').startsWith('optimistic_') ||
        (activeQuestion.metadata && activeQuestion.content === null))
  );
  const isLegacyIntermission = Boolean(examState.phaseIntermission?.isActive);

  if (isOptimisticIntermission || isLegacyIntermission) {
    const nextPhaseName =
      examState.phaseIntermission?.nextPhaseName ||
      activeQuestion?.metadata?.chapter ||
      activeQuestion?.metadata?.phase ||
      examState.blueprint?.[activeIndex]?.chapter ||
      'Chặng tiếp theo';
    const initialSecs = examState.phaseIntermission?.countdown ?? 20;

    return (
      <PhaseIntermissionScreen
        key={'intermission_' + (activeQuestion?.id || activeIndex) + '_' + nextPhaseName}
        phaseName={nextPhaseName}
        initialSeconds={initialSecs}
        cachedCount={cachedCount}
        isHydrating={isHydrating}
        setTransitionState={examLogic?.setTransitionState}
        onSkip={
          typeof examLogic?.skipPhaseIntermission === 'function'
            ? examLogic.skipPhaseIntermission
            : undefined
        }
      />
    );
  }

  // 5. GIAO DIỆN PHÒNG THI ĐANG DIỄN RA (PLAYING)
  const progressPercent = Math.min(
    100,
    Math.round(((activeIndex + 1) / Math.max(1, totalQuestions)) * 100)
  );
  const currentPhaseLabel =
    activeQuestion?.metadata?.chapter ||
    activeQuestion?.metadata?.phase ||
    activeQuestion?.phaseName ||
    examState.blueprint?.[activeIndex]?.chapter ||
    examState.blueprint?.[activeIndex]?.phaseName ||
    examState.profile?.name ||
    'Khảo thí Tổng hợp';

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-gray-200 overflow-hidden relative">
      {/* THANH HUD ĐỈNH PHÒNG THI */}
      <div className="w-full bg-slate-900 text-white px-3 sm:px-5 py-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white transition-colors"
            title="Rời phòng thi"
            aria-label="Rời phòng thi"
          >
            <Icons.X size={18} />
          </button>

          <button
            type="button"
            onClick={() => setShowSubmitConfirm(true)}
            className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
          >
            Nộp bài
          </button>

          <div className="hidden md:flex flex-col text-left ml-2">
            <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
              {currentPhaseLabel}
            </span>
            <span className="text-xs font-extrabold text-white">
              Câu {activeIndex + 1} / {totalQuestions} • Điểm: {examState.score || 0}
            </span>
          </div>
        </div>

        {/* Đồng hồ đếm ngược trung tâm */}
        <div
          className={`px-3.5 py-1.5 rounded-xl font-mono font-black text-sm sm:text-base flex items-center gap-1.5 border ${
            timeRemaining <= 60
              ? 'bg-red-600 text-white border-red-400 animate-pulse'
              : 'bg-white/10 text-yellow-300 border-white/20'
          }`}
        >
          <Icons.Clock size={16} />
          <span>{formatExamClock(timeRemaining)}</span>
        </div>

        {/* Huy hiệu Đạn dự trữ & Sổ tay lỗi sai */}
        <div className="flex items-center gap-2">
          <div
            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-[11px] font-bold flex items-center gap-1"
            title="Số câu hỏi đã nạp sẵn trong bộ đệm"
          >
            <Icons.Zap size={13} className="text-yellow-400" />
            <span>Đạn: {cachedCount}</span>
          </div>

          {typeof onOpenIncorrect === 'function' && (
            <button
              type="button"
              onClick={onOpenIncorrect}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-orange-300 transition-colors"
              title="Xem Sổ tay Lỗi sai"
              aria-label="Xem Sổ tay Lỗi sai"
            >
              <Icons.AlertCircle size={18} />
            </button>
          )}
        </div>
      </div>

      {/* THANH SUB-BAR TIẾN ĐỘ & ĐIỂM CHUYÊN BIỆT CHO MOBILE (< 768px) */}
      <div className="flex md:hidden items-center justify-between gap-2 px-3 py-1.5 bg-slate-800 text-slate-100 text-[11px] font-bold border-t border-slate-700/70 shrink-0">
        <span className="truncate text-indigo-200 uppercase tracking-wide">
          {currentPhaseLabel}
        </span>
        <span className="shrink-0 text-white">
          Câu {activeIndex + 1}/{totalQuestions} • {examState.score || 0}đ
        </span>
      </div>

      {/* THANH TIẾN ĐỘ BÀI THI */}
      <div className="w-full h-1.5 bg-gray-100 shrink-0">
        <div
          className={`h-full bg-gradient-to-r ${theme.progress} transition-all duration-300`}
          style={{ width: progressPercent + '%' }}
        />
      </div>

      {/* KHU VỰC HIỂN THỊ CÂU HỎI NGUYÊN TỬ */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col">
        {!activeQuestion ? (
          <div className="m-auto flex flex-col items-center justify-center text-center p-6">
            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
            <p className="text-sm font-bold text-indigo-700 animate-pulse">
              {examCooldown > 0
                ? 'Đang chuẩn bị câu ' + (activeIndex + 1) + ' (' + examCooldown + 's)...'
                : 'Đang nạp câu hỏi số ' + (activeIndex + 1) + '...'}
            </p>
          </div>
        ) : (
          <AtomicQuestionRenderer
            key={'exam_q_' + activeIndex + '_' + (activeQuestion.id || '')}
            question={activeQuestion}
            currentIndex={activeIndex}
            lang={lang}
            mainColor={mainColor}
            onPlay={speakFn}
            stopAllSpeech={stopAllSpeech}
            notifyToast={notifyToast}
            onBookmark={onBookmark}
            notebook={notebook}
            onLogWrong={onLogWrong}
            onSubmitAnswer={examLogic?.submitAnswer || directSubmit}
            setTransitionState={examLogic?.setTransitionState}
            examCooldown={examCooldown}
            isHydrating={isHydrating}
          />
        )}
      </div>

      {/* MODAL XÁC NHẬN NỘP BÀI SỚM */}
      {showSubmitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-submit-modal-title"
          className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowSubmitConfirm(false)}
        >
          <div
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-gray-100 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
              <Icons.Award size={28} />
            </div>
            <h3
              id="exam-submit-modal-title"
              className="text-lg font-black text-gray-800 mb-2"
            >
              Nộp bài thi ngay?
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed">
              Bạn đang ở câu <b>{activeIndex + 1}/{totalQuestions}</b>. Các câu chưa làm sẽ được tính là 0 điểm để tổng kết báo cáo năng lực.
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleForceSubmit();
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md"
              >
                Chốt nộp bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XÁC NHẬN THOÁT PHÒNG THI */}
      {showExitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-exit-modal-title"
          className="fixed inset-0 z-[250] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-gray-100 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <Icons.AlertCircle size={28} />
            </div>
            <h3
              id="exam-exit-modal-title"
              className="text-lg font-black text-gray-800 mb-2"
            >
              Rời khỏi phòng thi?
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed">
              Nếu thoát lúc này, bài thi hiện tại sẽ bị hủy. Bạn có muốn nộp bài để xem báo cáo trước khi thoát không?
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  handleForceSubmit();
                }}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md"
              >
                Nộp bài & Xem kết quả
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  handleExitRoom();
                }}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl text-sm"
              >
                Hủy bài thi & Thoát
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2 text-gray-400 hover:text-gray-600 font-bold text-xs mt-1"
              >
                Quay lại làm tiếp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_14_ExamUIShell = ExamUIShell;
  window.ExamUIShell = ExamUIShell;
}

export default ExamUIShell;