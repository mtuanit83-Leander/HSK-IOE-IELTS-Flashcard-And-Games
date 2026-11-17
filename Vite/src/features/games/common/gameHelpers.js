// ============================================================================
// FILE 48/85: src/features/games/common/gameHelpers.js
// NGUỒN GỐC: tang_5.js (Rút trích & Chuẩn hóa từ 10 Mini-Games) + transshipment-02.js
// NHIỆM VỤ: Chứa các hàm tiện ích dùng chung cho 10 Mini-Games & Khảo thí:
//           Tính điểm, Âm thanh SFX, Chống lặp vị trí đáp án (Anti-Streak),
//           Ép kiểu an toàn cho mảng Level/Topic, Định dạng thời gian,
//           Đóng gói thẻ lỗi sai đa cấu trúc và Kỷ luật thoát ngang.
// ============================================================================

import { Utils } from '../../../utils/helpers';

// ============================================================================
// 1. VẮC-XIN CHUẨN HÓA MULTI-SELECT LEVEL & TOPIC (ARRAY ARMOR)
// ============================================================================

/**
 * Lấy chuỗi Level an toàn (tương thích ngược 100% với các hàm ở tang_5.js)
 * @param {string|string[]} level
 * @param {string} defaultLevel
 * @returns {string}
 */
export const getSafeLevelString = (level, defaultLevel = 'level_4_discovery_basic') => {
  if (Array.isArray(level)) {
    return level.length > 0 && level[0] ? String(level[0]) : defaultLevel;
  }
  return level ? String(level) : defaultLevel;
};

/**
 * Chuyển đổi an toàn `currentLevel` và `currentTopic` (Mảng hoặc Chuỗi)
 * và hỗ trợ bốc ngẫu nhiên 1 Level / Topic trong danh sách người dùng đã chọn.
 */
export const normalizeLevelAndTopic = (currentLevel, currentTopic, lang = 'en') => {
  const defaultLevel = lang === 'zh' ? 'zh_level_1' : 'en_level_4';

  const levelArr = Array.isArray(currentLevel)
    ? currentLevel.filter(Boolean).map(String)
    : currentLevel
    ? [String(currentLevel)]
    : [defaultLevel];

  const topicArr = Array.isArray(currentTopic)
    ? currentTopic.filter(Boolean).map(String)
    : currentTopic
    ? [String(currentTopic)]
    : [];

  const pickedLevel =
    levelArr.length > 0
      ? levelArr[Math.floor(Math.random() * levelArr.length)]
      : defaultLevel;

  const pickedTopic =
    topicArr.length > 0
      ? topicArr[Math.floor(Math.random() * topicArr.length)]
      : '';

  return {
    levelArr,
    topicArr,
    pickedLevel,
    pickedTopic,
    safeLevelString: levelArr[0] || defaultLevel,
    levelLabel: levelArr.join(', ') || defaultLevel,
    topicLabel: topicArr.length > 0 ? topicArr.join(', ') : 'All Topics'
  };
};

// ============================================================================
// 2. THUẬT TOÁN "TRỘN CÓ TRÍ NHỚ" (ANTI-STREAK OPTION & WORD SHUFFLER)
// ============================================================================

/**
 * Chống hiện tượng đáp án đúng rơi vào cùng 1 vị trí quá 2 lần liên tiếp.
 * Hỗ trợ cả mảng `options` ([{ text, isCorrect }]) và mảng `words` (['a', 'b', 'c', 'd'] kèm `oddWord`).
 * @param {Array} items Mảng options hoặc mảng words
 * @param {Object} streakTrackerRef React useRef chứa mảng lịch sử vị trí đúng (VD: useRef([]))
 * @param {string|null} oddWord Từ khác loại (chỉ truyền khi dùng cho game OddOneOut)
 * @returns {Array} Mảng mới đã được kiểm duyệt vị trí
 */
export const applyAntiStreakShuffle = (items, streakTrackerRef, oddWord = null) => {
  if (!Array.isArray(items) || items.length <= 1) return items;

  const cloned = [...items];
  let correctIdx = -1;

  if (oddWord !== null && oddWord !== undefined) {
    const cleanOdd = String(oddWord).toLowerCase().trim();
    correctIdx = cloned.findIndex(
      (w) => String(w).toLowerCase().trim() === cleanOdd
    );
  } else {
    correctIdx = cloned.findIndex(
      (o) => o && (o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true')
    );
  }

  if (correctIdx === -1) return cloned;

  const history = streakTrackerRef?.current || [];
  let shuffleCount = 0;

  while (
    history.length >= 2 &&
    history[0] === correctIdx &&
    history[1] === correctIdx &&
    shuffleCount < 5
  ) {
    let swapIdx = Math.floor(Math.random() * cloned.length);
    while (swapIdx === correctIdx) {
      swapIdx = Math.floor(Math.random() * cloned.length);
    }
    const temp = cloned[correctIdx];
    cloned[correctIdx] = cloned[swapIdx];
    cloned[swapIdx] = temp;
    correctIdx = swapIdx;
    shuffleCount++;
  }

  if (streakTrackerRef && Array.isArray(streakTrackerRef.current)) {
    streakTrackerRef.current = [correctIdx, ...history].slice(0, 2);
  }

  return cloned;
};

/**
 * Áp dụng Anti-Streak trực tiếp lên đối tượng câu hỏi `data` (tương thích 100% với tang_5.js).
 * Tự động nhận diện cấu trúc `data.options` hoặc `data.words` + `data.oddWord`.
 */
export const applyAntiStreak = (data, streakTrackerRef) => {
  if (!data || typeof data !== 'object') return data;

  if (Array.isArray(data.options) && data.options.length > 1) {
    return {
      ...data,
      options: applyAntiStreakShuffle(data.options, streakTrackerRef)
    };
  }

  if (Array.isArray(data.words) && data.oddWord && data.words.length > 1) {
    return {
      ...data,
      words: applyAntiStreakShuffle(data.words, streakTrackerRef, data.oddWord)
    };
  }

  return data;
};

// ============================================================================
// 3. CỖ MÁY ĐÓNG GÓI LỖI SAI ĐA CẤU TRÚC & KỶ LUẬT THOÁT NGANG
// ============================================================================

/**
 * Chuẩn hóa dữ liệu câu hỏi của bất kỳ Mini-game nào thành cấu trúc thẻ Lỗi sai (`mistakeCard`)
 * có đầy đủ trường `.term` và `.definition` để lưu vào Sổ tay cần nhớ (`onLogWrong`).
 */
export const createMistakePayload = (question, gameType = 'quiz', extraTags = []) => {
  if (!question) return null;

  const typeKey = String(gameType || 'quiz').toLowerCase();
  const baseId = `mistake_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const tags = [typeKey, ...extraTags.filter(Boolean)];

  // 1. Game Điền từ (FillBlank)
  if (typeKey.includes('fillblank') || typeKey.includes('fill_blank')) {
    const baseData = question.origin || {};
    const targetWord = question.targetWord || baseData.term || '';
    const displaySentence = question.displaySentence || baseData.term || '';
    const underlinedTarget = targetWord
      ? targetWord.split('').map((ch) => ch + '\u0332').join('')
      : '';
    const sentenceWithUnderline = displaySentence.includes('[__________]')
      ? displaySentence.replace('[__________]', underlinedTarget)
      : displaySentence || targetWord;

    return {
      ...baseData,
      id: baseId,
      type: 'mistake',
      term: sentenceWithUnderline,
      definition: baseData.definition || question.hint || 'Thử thách Điền từ',
      example: displaySentence.replace('[__________]', targetWord),
      tags,
      timestamp: Date.now()
    };
  }

  // 2. Game Tìm lỗi sai (SpotMistake)
  if (typeKey.includes('spotmistake') || typeKey.includes('spot_mistake')) {
    const baseData = question.origin || {};
    const correction = question.correction || baseData.term || '';
    const wrongSentence = question.wrongSentence || baseData.term || '';
    const wrongWord = question.wrongWord || '';
    const underlinedCorrection = correction
      ? correction.split('').map((ch) => ch + '\u0332').join('')
      : '';
    const sentenceWithUnderline =
      wrongWord && wrongSentence.includes(wrongWord)
        ? wrongSentence.replace(wrongWord, underlinedCorrection)
        : wrongSentence || correction;

    return {
      ...baseData,
      id: baseId,
      type: 'mistake',
      term: sentenceWithUnderline,
      definition: baseData.definition || question.hint || 'Thử thách Tìm lỗi sai',
      analysis: question.explanation || '',
      example: `Lỗi: ${wrongWord} -> Sửa: ${correction}`,
      tags,
      timestamp: Date.now()
    };
  }

  // 3. Game Từ khác loại (OddOneOut)
  if (typeKey.includes('oddoneout') || typeKey.includes('odd_one_out')) {
    const baseData = (question.originCards && question.originCards[0]) || question.origin || {};
    const wordsStr = Array.isArray(question.words)
      ? question.words.join(' • ')
      : String(question.words || question.oddWord || '');

    return {
      ...baseData,
      id: baseId,
      type: 'mistake',
      term: wordsStr,
      definition: `Từ khác loại: ${question.oddWord || ''}`,
      analysis: question.explanation || '',
      example: `Nhóm từ: ${Array.isArray(question.words) ? question.words.join(', ') : wordsStr}`,
      tags,
      timestamp: Date.now()
    };
  }

  // 4. Game Vua Ngữ Âm (Pronunciation)
  if (typeKey.includes('pronunciation')) {
    const options = Array.isArray(question.options) ? question.options : [];
    const correctOpt = options.find((o) => o && o.isCorrect);
    const cleanTerm = correctOpt ? correctOpt.text : question.term || '';

    return {
      id: baseId,
      type: 'mistake',
      term: options.length > 0 ? options.map((o) => o.text).join(' • ') : cleanTerm,
      definition: `Phát âm khác: ${cleanTerm}`,
      analysis: question.definition || question.explanation || 'Câu hỏi phân biệt ngữ âm',
      tags,
      timestamp: Date.now()
    };
  }

  // 5. Game Đôi Tai Vàng (Listening)
  if (typeKey.includes('listening')) {
    const options = Array.isArray(question.options) ? question.options : [];
    const correctOpt = options.find((o) => o && o.isCorrect);
    const ansText = correctOpt ? correctOpt.text : 'Chưa rõ';

    return {
      id: baseId,
      type: 'mistake',
      term: `Nghe: ${question.term || question.question || ''}`,
      definition: `Đáp án: ${ansText}`,
      analysis: question.explanation || '',
      example: `Transcript: ${question.audioScript || ''}`,
      tags,
      timestamp: Date.now()
    };
  }

  // 6. Game Đọc Hiểu (Reading)
  if (typeKey.includes('reading')) {
    const ansText = question.correctAnswer || 'Chưa rõ';
    let typeName = 'Đọc hiểu';
    if (question.type === 'tfng') typeName = 'True/False/Not Given';
    else if (question.type === 'fill_blank') typeName = 'Điền từ';

    return {
      id: baseId,
      type: 'mistake',
      term: `[${typeName}] ${question.questionText || question.term || ''}`,
      definition: `Đáp án: ${ansText}`,
      analysis: question.explanation || 'Không có giải thích.',
      example: question.passageContext
        ? `Trích đoạn văn:\n${String(question.passageContext).substring(0, 150)}...`
        : '',
      tags,
      timestamp: Date.now()
    };
  }

  // 7. Mặc định cho Quiz, Match, Scramble, ImageQuiz
  const baseCard = question.origin || question.question || question;
  if (!baseCard || !baseCard.term) return null;

  return {
    ...baseCard,
    id: baseId,
    type: 'mistake',
    term: baseCard.term,
    definition: baseCard.definition || 'Từ vựng cần ôn tập',
    tags,
    timestamp: Date.now()
  };
};

/**
 * Kỷ luật thoát ngang: Nếu người chơi thoát khi câu hỏi đã hiện ra mà chưa trả lời xong,
 * tự động ghi nhận vào Sổ tay Lỗi sai (`onLogWrong`) và Túi nháp (`addToRetryBag`).
 */
export const handleExitDiscipline = ({
  isPlaying = true,
  isAnswered = false,
  currentCard,
  rawQuestionData = null,
  gameType = 'quiz',
  extraTags = [],
  onLogWrong,
  addToRetryBag
}) => {
  if (!isPlaying || isAnswered || !currentCard) return;

  try {
    if (typeof onLogWrong === 'function') {
      const mistakeCard = createMistakePayload(currentCard, gameType, extraTags);
      if (mistakeCard && mistakeCard.term) {
        onLogWrong(mistakeCard);
      }
    }

    if (typeof addToRetryBag === 'function') {
      const payloadToRetry = rawQuestionData || currentCard;
      addToRetryBag(gameType, payloadToRetry);
    }
  } catch (err) {
    console.warn('[ExitDiscipline] Lỗi ghi nhận kỷ luật thoát ngang:', err);
  }
};

// ============================================================================
// 4. THU HỒI ĐẠN CHƯA BẮN TỪ QUEUE ENGINE KHI AUTO-SAVE
// ============================================================================

/**
 * Thu hồi các thẻ chưa sử dụng nằm trong hàng đợi của QueueEngine và gộp với bộ bài hiện tại.
 */
export const mergePendingDeckFromCoordinator = (coordinator, currentDeck = []) => {
  let pendingCards = [];
  if (coordinator && typeof coordinator.getPendingItems === 'function') {
    const pendingTasks = coordinator.getPendingItems() || [];
    pendingTasks.forEach((task) => {
      if (!task) return;
      if (Array.isArray(task.pairs)) {
        pendingCards.push(...task.pairs);
      } else if (Array.isArray(task.originCards) && task.originCards.length > 0) {
        pendingCards.push(task.originCards[0]);
      } else if (task.origin) {
        pendingCards.push(task.origin);
      } else if (task.question) {
        pendingCards.push(task.question);
      } else if (task.passage && task.questions) {
        pendingCards.push(task);
      } else if (task.term) {
        pendingCards.push(task);
      }
    });
  }

  const combined = [...pendingCards, ...(Array.isArray(currentDeck) ? currentDeck : [])];
  return combined.filter(
    (item, idx, arr) =>
      item &&
      idx ===
        arr.findIndex((t) =>
          t.term && item.term ? t.term === item.term : t === item
        )
  );
};

// ============================================================================
// 5. ĐỘNG CƠ TÍNH ĐIỂM & HIỆU ỨNG ÂM THANH (SCORING & WEB AUDIO SFX)
// ============================================================================

/**
 * Tính điểm dựa trên điểm cơ bản, thời gian còn lại, chuỗi thắng (combo) và độ khó.
 */
export const calculateGameScore = (
  basePoints = 100,
  timeLeft = 0,
  streak = 0,
  difficulty = 'normal'
) => {
  const safeBase = Number(basePoints) || 100;
  const safeTime = Math.max(0, Number(timeLeft) || 0);
  const safeStreak = Math.max(0, Number(streak) || 0);

  let timeMultiplier = 2;
  if (difficulty === 'hard' || difficulty === 'hell') timeMultiplier = 4;
  else if (difficulty === 'easy') timeMultiplier = 1;

  const timeBonus = Math.floor(safeTime * timeMultiplier);
  const streakBonus = Math.min(safeStreak * 10, 100);

  return safeBase + timeBonus + streakBonus;
};

/**
 * Phát âm thanh hiệu ứng trực tiếp bằng Web Audio API (0ms latency, không cần file MP3 ngoài).
 * @param {'correct' | 'wrong' | 'finish' | 'tick' | 'click'} type
 * @param {boolean} isMuted
 */
export const playGameSFX = (type = 'correct', isMuted = false) => {
  if (isMuted) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!window.fc_audioCtx) {
      window.fc_audioCtx = new AudioContextClass();
    }
    const ctx = window.fc_audioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;

    if (type === 'correct') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } else if (type === 'wrong') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.35);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'finish') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const startTime = now + idx * 0.11;
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.45);
      });
    } else if (type === 'tick' || type === 'click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {
    // Bỏ qua an toàn nếu trình duyệt chặn tự động phát âm thanh
  }
};

// ============================================================================
// 6. CÁC HÀM ĐỊNH DẠNG THỜI GIAN & CẤU HÌNH UI COOLDOWN
// ============================================================================

/**
 * Định dạng số giây thành chuỗi `m:ss` (VD: 65 -> "1:05")
 */
export const formatGameTime = (seconds = 0) => {
  const safeSec = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(safeSec / 60);
  const s = safeSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Lấy class màu chữ cho đồng hồ đếm ngược dựa trên tỉ lệ thời gian còn lại
 */
export const getTimerColor = (timeLeft = 0, totalTime = 30) => {
  const ratio = totalTime > 0 ? timeLeft / totalTime : 1;
  if (ratio > 0.6) return 'text-green-600';
  if (ratio > 0.3) return 'text-orange-500';
  return 'text-red-600 animate-pulse';
};

/**
 * Đọc thời gian làm nguội UI (UI Cooldown) từ cấu hình Lõi AI (`fc_ai_config`)
 */
export const getConfiguredUiCooldown = (defaultSec = 9) => {
  try {
    const cfg = Utils.safeJsonParse('fc_ai_config', {});
    if (cfg && cfg.uiCooldown !== undefined) {
      return Math.max(0, parseInt(cfg.uiCooldown, 10));
    }
  } catch {
    // Fallback an toàn về giá trị mặc định
  }
  return defaultSec;
};

export const GameHelpers = {
  getSafeLevelString,
  normalizeLevelAndTopic,
  applyAntiStreakShuffle,
  applyAntiStreak,
  createMistakePayload,
  handleExitDiscipline,
  mergePendingDeckFromCoordinator,
  calculateGameScore,
  playGameSFX,
  formatGameTime,
  getTimerColor,
  getConfiguredUiCooldown
};

if (typeof window !== 'undefined') {
  window.GameHelpers = GameHelpers;
}

export default GameHelpers;