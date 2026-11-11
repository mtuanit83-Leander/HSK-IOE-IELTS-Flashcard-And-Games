/**
 * @file src/features/games/common/gameHelpers.js
 * @description Kho vũ khí logic dùng chung cho toàn bộ 10 Mini-games & Khảo thí (Tính điểm, Âm thanh SFX, Anti-Streak, Kỷ luật thoát ngang, Chuẩn hóa Multi-select).
 * @origin Tầng 5 - Nhóm 5A (Shared Game Logic)
 */

import { Utils } from '@/utils/helpers';

// ============================================================================
// 1. ĐỘNG CƠ TÍNH ĐIỂM & CHUỖI THẮNG CHUẨN HÓA (SCORING & STREAK ENGINE)
// ============================================================================
/**
 * Tính điểm dựa trên điểm cơ bản, thời gian còn lại, chuỗi thắng (combo) và độ khó.
 * Công thức: Score = BasePoints + floor(TimeLeft * Multiplier) + (Streak * 10)
 */
export const calculateGameScore = (basePoints = 100, timeLeft = 0, streak = 0, difficulty = 'normal') => {
  const safeBase = Number(basePoints) || 100;
  const safeTime = Math.max(0, Number(timeLeft) || 0);
  const safeStreak = Math.max(0, Number(streak) || 0);

  let timeMultiplier = 2;
  if (difficulty === 'hard') timeMultiplier = 4;
  else if (difficulty === 'easy') timeMultiplier = 1;

  const timeBonus = Math.floor(safeTime * timeMultiplier);
  const streakBonus = Math.min(safeStreak * 10, 100); // Trần thưởng combo tối đa +100 điểm/câu

  return safeBase + timeBonus + streakBonus;
};

// ============================================================================
// 2. BỘ TỔNG HỢP ÂM THANH HIỆU ỨNG (WEB AUDIO SFX SYNTHESIZER)
// ============================================================================
/**
 * Phát âm thanh hiệu ứng không cần file MP3 ngoài, dùng chung cho mọi Game & Phòng thi.
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
      // Âm Ting! trong trẻo (Hợp âm Đô trưởng đi lên: C5 -> E5 -> G5)
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
      // Âm Buzzer trầm báo lỗi (Sóng răng cưa đi xuống)
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
      // Âm Fanfare chiến thắng khi hoàn thành màn chơi
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
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
      // Âm gõ nhẹ khi chọn từ hoặc đếm ngược
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
  } catch (e) {
    // Bỏ qua lỗi AudioContext nếu trình duyệt chặn tự động phát
  }
};

// ============================================================================
// 3. THUẬT TOÁN "TRỘN CÓ TRÍ NHỚ" (ANTI-STREAK OPTION SHUFFLER)
// ============================================================================
/**
 * Chống hiện tượng đáp án đúng rơi vào cùng 1 vị trí (VD: toàn đáp án A) quá 2 lần liên tiếp.
 * @param {Array} options Mảng các lựa chọn [{ text, isCorrect, ... }]
 * @param {Object} streakTrackerRef React useRef chứa mảng lịch sử vị trí đúng (VD: useRef([]))
 * @returns {Array} Mảng options mới đã được kiểm duyệt vị trí
 */
export const applyAntiStreakShuffle = (options, streakTrackerRef) => {
  if (!Array.isArray(options) || options.length <= 1) return options;

  let cloned = [...options];
  let correctIdx = cloned.findIndex(
    (o) => o && (o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true')
  );

  if (correctIdx === -1) return cloned;

  const history = streakTrackerRef?.current || [];
  let attempts = 0;

  // Nếu 2 câu trước đó đều có đáp án đúng nằm ở đúng vị trí này -> Cưỡng chế hoán đổi
  while (
    history.length >= 2 &&
    history[0] === correctIdx &&
    history[1] === correctIdx &&
    attempts < 6
  ) {
    let swapIdx = Math.floor(Math.random() * cloned.length);
    if (swapIdx !== correctIdx) {
      const temp = cloned[correctIdx];
      cloned[correctIdx] = cloned[swapIdx];
      cloned[swapIdx] = temp;
      correctIdx = swapIdx;
    }
    attempts++;
  }

  if (streakTrackerRef && Array.isArray(streakTrackerRef.current)) {
    streakTrackerRef.current = [correctIdx, ...history].slice(0, 2);
  }

  return cloned;
};

// ============================================================================
// 4. KỶ LUẬT THOÁT NGANG (EXIT DISCIPLINE HANDLER)
// ============================================================================
/**
 * Nếu người chơi bấm nút Thoát khi câu hỏi đã hiện ra mà chưa trả lời xong,
 * tự động ghi nhận vào Sổ tay Lỗi sai (Incorrect List) và Túi nháp (Retry Bag).
 */
export const handleExitDiscipline = ({
  isPlaying,
  isAnswered,
  currentCard,
  rawQuestionData = null,
  gameType = 'quiz',
  onLogWrong,
  addToRetryBag
}) => {
  if (!isPlaying || isAnswered || !currentCard) return;

  try {
    const targetCard = currentCard.origin || currentCard.question || currentCard;
    if (targetCard && targetCard.term && typeof onLogWrong === 'function') {
      onLogWrong(targetCard);
    }

    if (typeof addToRetryBag === 'function') {
      const payloadToRetry = rawQuestionData || currentCard;
      addToRetryBag(gameType, payloadToRetry);
    }
  } catch (e) {
    console.warn('[ExitDiscipline] Lỗi ghi nhận kỷ luật thoát ngang:', e);
  }
};

// ============================================================================
// 5. VẮC-XIN CHUẨN HÓA MULTI-SELECT LEVEL & TOPIC (ARRAY ARMOR)
// ============================================================================
/**
 * Chuyển đổi an toàn `currentLevel` và `currentTopic` (có thể là Mảng hoặc Chuỗi)
 * thành định dạng chuẩn để truyền vào Lò đúc AI hoặc Bộ lọc Offline.
 */
export const normalizeLevelAndTopic = (currentLevel, currentTopic, lang = 'en') => {
  const defaultLevel = lang === 'zh' ? 'zh_level_1' : 'en_level_4';

  const levelArr = Array.isArray(currentLevel)
    ? currentLevel.filter(Boolean)
    : currentLevel
    ? [String(currentLevel)]
    : [defaultLevel];

  const topicArr = Array.isArray(currentTopic)
    ? currentTopic.filter(Boolean)
    : currentTopic
    ? [String(currentTopic)]
    : [];

  // Chọn 1 Level đại diện ngẫu nhiên nếu người dùng tick chọn nhiều Level cùng lúc
  const pickedLevel =
    levelArr.length > 0
      ? levelArr[Math.floor(Math.random() * levelArr.length)]
      : defaultLevel;

  // Chọn 1 Topic đại diện ngẫu nhiên (hoặc chuỗi rỗng nếu chọn Tất cả)
  const pickedTopic =
    topicArr.length > 0
      ? topicArr[Math.floor(Math.random() * topicArr.length)]
      : '';

  return {
    levelArr,
    topicArr,
    pickedLevel,
    pickedTopic,
    levelLabel: levelArr.join(', ') || defaultLevel,
    topicLabel: topicArr.length > 0 ? topicArr.join(', ') : 'All Topics'
  };
};

// ============================================================================
// 6. ĐỌC CẤU HÌNH THỜI GIAN LÀM NGUỘI UI (UI COOLDOWN READER)
// ============================================================================
export const getConfiguredUiCooldown = (defaultSec = 9) => {
  try {
    const cfg = Utils.safeJsonParse('fc_ai_config', {});
    if (cfg && cfg.uiCooldown !== undefined) {
      return Math.max(0, parseInt(cfg.uiCooldown, 10));
    }
  } catch (e) {}
  return defaultSec;
};

// Gom chung thành Object để tiện import theo cả 2 kiểu (Named hoặc Namespace)
export const GameHelpers = {
  calculateGameScore,
  playGameSFX,
  applyAntiStreakShuffle,
  handleExitDiscipline,
  normalizeLevelAndTopic,
  getConfiguredUiCooldown
};