// ============================================================================
// FILE 73/85: src/features/exam/ExamReportUI.jsx
// NGUỒN GỐC: Tầng 5 - Block 5.15 (Grand Exam Report UI - Version 1.02)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 06:58 (GMT+7)
// NHIỆM VỤ: Hiển thị Báo cáo Tổng kết bài thi (Mock Test) với Biểu đồ Radar
//           phân tích kỹ năng (Pure SVG), Cảnh báo điểm yếu và Thống kê chi tiết.
//           Nâng cấp Ver 1.0 (Lượt 5.2 - Zero-TSC Polish):
//           1. Diệt trọn 5/5 lỗi tsc --noEmit (1× TS2322 textAnchor + 4× TS2339
//              trên examState) bằng JSDoc chuẩn xác và thu hẹp kiểu an toàn.
//           2. Diệt D1 (Tailwind JIT & SVG Sync): hợp nhất 12 bảng màu tĩnh
//              REPORT_COLOR_THEMES cho cả Tailwind lẫn SVG Radar (0 lớp động).
//           3. Diệt D2 (Toán học & Hiệu năng): dựng Map O(N) chống trùng index
//              gây tràn vòng SVG (> 100%), vá bẫy timeRemaining === undefined và
//              ép nguyên giây trong formatTime.
//           4. Diệt D3 & D4 (A11y, Mobile SVG & Clean Imports): bổ sung chuẩn
//              role="dialog" + phím Escape phân tầng (tôn trọng ExamReviewModal
//              & bộ gõ IME), mở rộng viewBox SVG + rút gọn nhãn dài, gỡ nhánh
//              legacy window.Block5_16_ExamReviewModal.
// ============================================================================

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from '@/components/common/Icons';
import { ExamReviewModal } from './ExamReviewModal';

/**
 * Bảng màu tĩnh hợp nhất 12 tông màu cho cả Tailwind JIT và SVG Radar Chart
 * @type {Record<string, {
 *   headerGradient: string,
 *   ringText: string,
 *   badgeBox: string,
 *   primaryBtn: string,
 *   radar: { stroke: string, fill: string, dot: string }
 * }>}
 */
const REPORT_COLOR_THEMES = {
  blue: {
    headerGradient: 'from-blue-400 to-blue-600',
    ringText: 'text-blue-500',
    badgeBox: 'bg-blue-50 text-blue-600',
    primaryBtn: 'bg-blue-600 shadow-blue-500/20 hover:bg-blue-700',
    radar: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.2)', dot: '#2563eb' }
  },
  sky: {
    headerGradient: 'from-sky-400 to-sky-600',
    ringText: 'text-sky-500',
    badgeBox: 'bg-sky-50 text-sky-600',
    primaryBtn: 'bg-sky-600 shadow-sky-500/20 hover:bg-sky-700',
    radar: { stroke: '#0ea5e9', fill: 'rgba(14, 165, 233, 0.2)', dot: '#0284c7' }
  },
  indigo: {
    headerGradient: 'from-indigo-400 to-indigo-600',
    ringText: 'text-indigo-500',
    badgeBox: 'bg-indigo-50 text-indigo-600',
    primaryBtn: 'bg-indigo-600 shadow-indigo-500/20 hover:bg-indigo-700',
    radar: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.2)', dot: '#4f46e5' }
  },
  emerald: {
    headerGradient: 'from-emerald-400 to-emerald-600',
    ringText: 'text-emerald-500',
    badgeBox: 'bg-emerald-50 text-emerald-600',
    primaryBtn: 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700',
    radar: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.2)', dot: '#059669' }
  },
  green: {
    headerGradient: 'from-green-400 to-green-600',
    ringText: 'text-green-500',
    badgeBox: 'bg-green-50 text-green-600',
    primaryBtn: 'bg-green-600 shadow-green-500/20 hover:bg-green-700',
    radar: { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.2)', dot: '#16a34a' }
  },
  teal: {
    headerGradient: 'from-teal-400 to-teal-600',
    ringText: 'text-teal-500',
    badgeBox: 'bg-teal-50 text-teal-600',
    primaryBtn: 'bg-teal-600 shadow-teal-500/20 hover:bg-teal-700',
    radar: { stroke: '#14b8a6', fill: 'rgba(20, 184, 166, 0.2)', dot: '#0d9488' }
  },
  cyan: {
    headerGradient: 'from-cyan-400 to-cyan-600',
    ringText: 'text-cyan-500',
    badgeBox: 'bg-cyan-50 text-cyan-600',
    primaryBtn: 'bg-cyan-600 shadow-cyan-500/20 hover:bg-cyan-700',
    radar: { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.2)', dot: '#0891b2' }
  },
  red: {
    headerGradient: 'from-red-400 to-red-600',
    ringText: 'text-red-500',
    badgeBox: 'bg-red-50 text-red-600',
    primaryBtn: 'bg-red-600 shadow-red-500/20 hover:bg-red-700',
    radar: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.2)', dot: '#dc2626' }
  },
  purple: {
    headerGradient: 'from-purple-400 to-purple-600',
    ringText: 'text-purple-500',
    badgeBox: 'bg-purple-50 text-purple-600',
    primaryBtn: 'bg-purple-600 shadow-purple-500/20 hover:bg-purple-700',
    radar: { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.2)', dot: '#9333ea' }
  },
  pink: {
    headerGradient: 'from-pink-400 to-pink-600',
    ringText: 'text-pink-500',
    badgeBox: 'bg-pink-50 text-pink-600',
    primaryBtn: 'bg-pink-600 shadow-pink-500/20 hover:bg-pink-700',
    radar: { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.2)', dot: '#db2777' }
  },
  orange: {
    headerGradient: 'from-orange-400 to-orange-600',
    ringText: 'text-orange-500',
    badgeBox: 'bg-orange-50 text-orange-600',
    primaryBtn: 'bg-orange-600 shadow-orange-500/20 hover:bg-orange-700',
    radar: { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.2)', dot: '#ea580c' }
  },
  slate: {
    headerGradient: 'from-slate-500 to-slate-700',
    ringText: 'text-slate-600',
    badgeBox: 'bg-slate-100 text-slate-700',
    primaryBtn: 'bg-slate-700 shadow-slate-500/20 hover:bg-slate-800',
    radar: { stroke: '#64748b', fill: 'rgba(100, 116, 139, 0.2)', dot: '#475569' }
  }
};

/**
 * Rút gọn nhãn kỹ năng dài để không bị cắt trên màn hình điện thoại nhỏ (< 360px)
 * @param {any} rawLabel
 * @param {number} [maxLen=26]
 * @returns {string}
 */
const truncateSkillLabel = (rawLabel, maxLen = 26) => {
  const clean = String(rawLabel || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 3)).trimEnd()}...`;
};

/**
 * Định dạng thời gian làm bài (luôn làm tròn xuống nguyên giây, chống phần lẻ & số âm)
 * @param {any} sec
 * @returns {string}
 */
const formatDurationVi = (sec) => {
  const totalSec = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${s.toString().padStart(2, '0')} giây`;
};

// ============================================================================
// 1. COMPONENT BIỂU ĐỒ RADAR (PURE SVG)
// ============================================================================
/**
 * @param {{
 *   data?: Array<{ label: string, score: number, rawCorrect?: number, rawTotal?: number }>,
 *   mainColor?: string
 * }} props
 */
export const SkillRadarChart = ({ data = [], mainColor = 'blue' }) => {
  const safeData = Array.isArray(data) ? data : [];
  if (safeData.length < 3) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-gray-400 italic text-sm bg-gray-50 rounded-xl border border-gray-100 px-4 text-center">
        Cần ít nhất 3 kỹ năng để vẽ biểu đồ Radar.
      </div>
    );
  }

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 96;
  const numPoints = safeData.length;

  /**
   * Tính tọa độ (x, y) trên vòng tròn Radar
   * @param {number} val
   * @param {number} index
   * @param {number} [customRadius=radius]
   */
  const getPoint = (val, index, customRadius = radius) => {
    const safeVal = Math.min(1, Math.max(0, Number.isFinite(val) ? val : 0));
    // Trừ đi PI/2 để đỉnh đầu tiên luôn hướng thẳng lên góc 12 giờ
    const angle = (Math.PI * 2 * index) / numPoints - Math.PI / 2;
    const x = cx + customRadius * safeVal * Math.cos(angle);
    const y = cy + customRadius * safeVal * Math.sin(angle);
    return { x, y };
  };

  // 1. Các đường lưới mạng nhện (Spider Web Grid)
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];
  const grids = gridLevels.map((level) => {
    const points = safeData
      .map((_, i) => {
        const p = getPoint(level, i);
        return `${p.x},${p.y}`;
      })
      .join(' ');
    return (
      <polygon
        key={level}
        points={points}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="1"
      />
    );
  });

  // 2. Các trục tỏa ra từ tâm
  const axes = safeData.map((_, i) => {
    const p = getPoint(1, i);
    return (
      <line
        key={i}
        x1={cx}
        y1={cy}
        x2={p.x}
        y2={p.y}
        stroke="#e5e7eb"
        strokeWidth="1"
      />
    );
  });

  // 3. Đa giác dữ liệu thực tế của thí sinh (kẹp cứng [0, 100])
  const normalizedData = safeData.map((d) => ({
    ...d,
    clampedScore: Math.min(100, Math.max(0, Number(d?.score) || 0)),
    fullLabel: String(d?.label || 'Kỹ năng Khác').trim() || 'Kỹ năng Khác'
  }));

  const dataPoints = normalizedData
    .map((d, i) => {
      const p = getPoint(d.clampedScore / 100, i);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  // 4. Lấy bảng màu tĩnh đồng bộ 12 tông màu
  const theme = (REPORT_COLOR_THEMES[mainColor] || REPORT_COLOR_THEMES.blue).radar;

  return (
    <div className="w-full flex justify-center relative select-none px-1">
      <svg
        viewBox="-24 -8 348 316"
        role="img"
        aria-label="Biểu đồ Radar phân tích kỹ năng bài thi"
        className="w-full max-w-[360px] h-auto drop-shadow-sm overflow-visible"
      >
        {grids}
        {axes}
        {/* Vùng Polygon chứa Data */}
        <polygon
          points={dataPoints}
          fill={theme.fill}
          stroke={theme.stroke}
          strokeWidth="3"
          strokeLinejoin="round"
          className="animate-in fade-in zoom-in duration-700 delay-300"
        />
        {/* Các điểm Dot trên Data Polygon */}
        {normalizedData.map((d, i) => {
          const p = getPoint(d.clampedScore / 100, i);
          return (
            <circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r="4"
              fill={theme.dot}
              className="animate-in zoom-in delay-500"
            >
              <title>{`${d.fullLabel}: ${d.clampedScore}%`}</title>
            </circle>
          );
        })}
        {/* Nhãn Kỹ năng (Labels) */}
        {normalizedData.map((d, i) => {
          // Đẩy nhãn ra xa nhẹ so với bán kính tối đa
          const p = getPoint(1, i, radius + 30);
          /** @type {'middle' | 'end' | 'start'} */
          let anchor = 'middle';
          if (p.x < cx - 10) anchor = 'end';
          if (p.x > cx + 10) anchor = 'start';

          const displayLabel = truncateSkillLabel(d.fullLabel, 26);
          const words = displayLabel.split(/\s+/).filter(Boolean);
          const splitAt = Math.ceil(words.length / 2);
          const line1 = words.slice(0, splitAt).join(' ');
          const line2 = words.slice(splitAt).join(' ');

          return (
            <text
              key={`label-${i}`}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="text-[10px] sm:text-xs font-bold fill-gray-600"
            >
              <title>{`${d.fullLabel}: ${d.clampedScore}%`}</title>
              {words.length > 3 ? (
                <>
                  <tspan x={p.x} dy="-0.6em">
                    {line1}
                  </tspan>
                  <tspan x={p.x} dy="1.2em">
                    {line2}
                  </tspan>
                </>
              ) : (
                displayLabel
              )}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

// ============================================================================
// 2. COMPONENT CHÍNH (GRAND REPORT UI)
// ============================================================================
/**
 * @param {Record<string, any>} props
 */
export const ExamReportUI = ({
  examState = {},
  onExit = undefined,
  onBackToMenu = undefined,
  mainColor = 'blue',
  onBookmark = undefined,
  notebook = [],
  exportExamToExcel = undefined,
  onExportExcel = undefined
}) => {
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const effectiveOnExit =
    typeof onExit === 'function'
      ? onExit
      : typeof onBackToMenu === 'function'
      ? onBackToMenu
      : undefined;
  const effectiveExportExcel =
    typeof exportExamToExcel === 'function'
      ? exportExamToExcel
      : typeof onExportExcel === 'function'
      ? onExportExcel
      : undefined;

  const effectiveOnExitRef = useRef(effectiveOnExit);
  effectiveOnExitRef.current = effectiveOnExit;

  // Hỗ trợ đóng Báo cáo bằng phím Escape (phân tầng: nhường ExamReviewModal khi đang mở & bỏ qua IME)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      if (isReviewModalOpen) return;
      if (typeof effectiveOnExitRef.current === 'function') {
        e.preventDefault();
        effectiveOnExitRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReviewModalOpen]);

  const theme = REPORT_COLOR_THEMES[mainColor] || REPORT_COLOR_THEMES.blue;

  // 1. XỬ LÝ DỮ LIỆU TỔNG QUAN & PHÂN TÍCH CHẶNG O(N)
  const reportStats = useMemo(() => {
    /** @type {Record<string, any>} */
    const safeExamState =
      examState && typeof examState === 'object' ? examState : {};
    /** @type {Record<string, any>} */
    const profile =
      safeExamState.profile && typeof safeExamState.profile === 'object'
        ? safeExamState.profile
        : {};
    /** @type {Array<Record<string, any>>} */
    const blueprint = Array.isArray(safeExamState.blueprint)
      ? safeExamState.blueprint
      : [];
    /** @type {Array<Record<string, any>>} */
    const answers = Array.isArray(safeExamState.answers)
      ? safeExamState.answers
      : [];

    const totalQuestions = blueprint.length;

    // Gom đáp án theo chỉ mục câu hỏi bằng Map O(N) (chặn trùng index gây tràn > 100%)
    /** @type {Map<number, Record<string, any>>} */
    const answersByIndex = new Map();
    for (let i = 0; i < answers.length; i++) {
      const ans = answers[i];
      if (!ans || typeof ans !== 'object') continue;
      const idx = Number(ans.index);
      if (
        Number.isInteger(idx) &&
        idx >= 0 &&
        (totalQuestions === 0 || idx < totalQuestions)
      ) {
        answersByIndex.set(idx, ans);
      }
    }

    const answeredCount = answersByIndex.size;
    let correctAnswers = 0;
    answersByIndex.forEach((ans) => {
      if (ans.isCorrect) correctAnswers += 1;
    });
    const wrongAnswers = Math.max(0, answeredCount - correctAnswers);
    const skippedAnswers = Math.max(0, totalQuestions - answeredCount);
    const accuracy =
      totalQuestions > 0
        ? Math.min(100, Math.max(0, Math.round((correctAnswers / totalQuestions) * 100)))
        : 0;

    // Tính thời gian làm bài an toàn (tránh bẫy timeRemaining === undefined báo hết 100% thời gian)
    const rawTimeLimit = Number(profile.timeLimit);
    const hasTimeRemaining =
      safeExamState.timeRemaining !== undefined &&
      safeExamState.timeRemaining !== null &&
      Number.isFinite(Number(safeExamState.timeRemaining));
    let timeTaken = 0;
    if (Number.isFinite(rawTimeLimit) && rawTimeLimit > 0 && hasTimeRemaining) {
      timeTaken = Math.min(
        rawTimeLimit,
        Math.max(0, rawTimeLimit - Number(safeExamState.timeRemaining))
      );
    } else if (
      safeExamState.timeTaken !== undefined &&
      safeExamState.timeTaken !== null &&
      Number.isFinite(Number(safeExamState.timeTaken))
    ) {
      timeTaken = Math.max(0, Number(safeExamState.timeTaken));
    } else if (
      safeExamState.elapsedSeconds !== undefined &&
      safeExamState.elapsedSeconds !== null &&
      Number.isFinite(Number(safeExamState.elapsedSeconds))
    ) {
      timeTaken = Math.max(0, Number(safeExamState.elapsedSeconds));
    }

    // Phân tích theo chặng (Chapter / Skill) O(N)
    /** @type {Record<string, { total: number, correct: number }>} */
    const chapterStatsMap = {};
    for (let idx = 0; idx < blueprint.length; idx++) {
      const item = blueprint[idx];
      const chapterName = String(
        item?.chapter || item?.type || 'Kỹ năng Khác'
      ).trim() || 'Kỹ năng Khác';
      if (!chapterStatsMap[chapterName]) {
        chapterStatsMap[chapterName] = { total: 0, correct: 0 };
      }
      chapterStatsMap[chapterName].total += 1;
      const userAnswer = answersByIndex.get(idx);
      if (userAnswer && userAnswer.isCorrect) {
        chapterStatsMap[chapterName].correct += 1;
      }
    }

    const radarData = Object.keys(chapterStatsMap).map((key) => {
      const stat = chapterStatsMap[key];
      const score =
        stat.total > 0
          ? Math.min(100, Math.max(0, Math.round((stat.correct / stat.total) * 100)))
          : 0;
      return {
        label: key,
        score,
        rawCorrect: stat.correct,
        rawTotal: stat.total
      };
    });

    // Tìm điểm yếu nhất (yêu cầu mẫu >= 2 câu)
    /** @type {{ label: string, score: number, rawCorrect: number, rawTotal: number } | null} */
    let weakestSkill = null;
    const validSkills = radarData.filter((d) => d.rawTotal >= 2);
    if (validSkills.length > 0) {
      weakestSkill = validSkills.reduce((prev, curr) =>
        prev.score < curr.score ? prev : curr
      );
    }

    return {
      profile,
      totalQuestions,
      answeredCount,
      correctAnswers,
      wrongAnswers,
      skippedAnswers,
      accuracy,
      timeTaken,
      radarData,
      weakestSkill
    };
  }, [examState]);

  const {
    profile,
    totalQuestions,
    answeredCount,
    correctAnswers,
    wrongAnswers,
    skippedAnswers,
    accuracy,
    timeTaken,
    radarData,
    weakestSkill
  } = reportStats;

  // 4. ĐÁNH GIÁ CHUNG (VERDICT)
  let verdictTitle = 'Cần nỗ lực hơn!';
  let verdictSub = 'Đừng nản chí, hãy ôn tập lại các lỗi sai nhé.';
  let headerGradient = 'from-orange-500 to-red-500';
  let icon = <Icons.AlertCircle size={48} className="text-white opacity-80" />;

  if (accuracy >= 90) {
    verdictTitle = 'Xuất sắc!';
    verdictSub = 'Kết quả tuyệt vời! Bạn đã nắm rất vững kiến thức.';
    headerGradient = 'from-emerald-400 to-green-600';
    icon = <Icons.Award size={48} className="text-white opacity-80" />;
  } else if (accuracy >= 70) {
    verdictTitle = 'Khá Tốt!';
    verdictSub = 'Bạn có nền tảng vững vàng. Chỉ cần tỉ mỉ thêm chút nữa.';
    headerGradient = theme.headerGradient;
    icon = <Icons.CheckCircle size={48} className="text-white opacity-80" />;
  } else if (accuracy >= 50) {
    verdictTitle = 'Đạt yêu cầu';
    verdictSub =
      'Bạn đã qua mức trung bình, nhưng vẫn còn nhiều khoảng trống cần bù đắp.';
    headerGradient = 'from-yellow-400 to-orange-500';
    icon = <Icons.Check size={48} className="text-white opacity-80" />;
  }

  const circleCircumference = 251.2;
  const strokeDashoffset = Math.max(
    0,
    circleCircumference - (circleCircumference * accuracy) / 100
  );

  return (
    <React.Fragment>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-report-title"
        className="fixed inset-0 z-[1100] bg-gray-50 flex flex-col overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-8 duration-500"
      >
        {/* HEADER KHỔNG LỒ (HERO BANNER) */}
        <div
          className={`w-full bg-gradient-to-br ${headerGradient} pt-12 pb-16 px-6 text-center text-white relative shadow-md shrink-0`}
        >
          {/* Trang trí nền */}
          <div className="absolute top-[-50px] right-[-20px] w-48 h-48 bg-white opacity-10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-[-30px] left-[-30px] w-32 h-32 bg-black opacity-10 rounded-full blur-xl pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center animate-in zoom-in duration-500 delay-100">
            <div className="mb-4">{icon}</div>
            <div className="text-sm font-bold tracking-widest uppercase mb-1 opacity-80">
              {profile.name || 'Báo cáo Bài thi'}
            </div>
            <h1
              id="exam-report-title"
              className="text-4xl md:text-5xl font-black tracking-tight mb-2 drop-shadow-md"
            >
              {verdictTitle}
            </h1>
            <p className="text-sm md:text-base font-medium opacity-90 max-w-md mx-auto">
              {verdictSub}
            </p>
          </div>
        </div>

        {/* PHẦN NỘI DUNG BÁO CÁO (NẰM ĐÈ LÊN HEADER MỘT CHÚT) */}
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 -mt-8 relative z-20 pb-16">
          {/* 1. THẺ ĐIỂM SỐ TỔNG QUAN (SCORECARD) */}
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border border-gray-100 mb-6 animate-in slide-in-from-bottom-4 duration-500 delay-200">
            <div className="flex items-center gap-6">
              {/* Vòng tròn Điểm */}
              <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 100 100"
                  aria-hidden="true"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#f3f4f6"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={circleCircumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={`${theme.ringText} transition-all duration-1000 ease-out`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-gray-800">
                    {accuracy}%
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    Độ chính xác
                  </span>
                </div>
              </div>

              {/* Chỉ số nhanh */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    Hoàn thành
                  </span>
                  <span className="text-lg font-bold text-gray-800">
                    {answeredCount} / {totalQuestions}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    Thời gian
                  </span>
                  <span className="text-lg font-bold text-gray-800">
                    {formatDurationVi(timeTaken)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-green-500 uppercase flex items-center gap-1">
                    <Icons.Check size={12} /> Đúng
                  </span>
                  <span className="text-lg font-black text-green-600">
                    {correctAnswers}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-red-400 uppercase flex items-center gap-1">
                    <Icons.X size={12} /> Sai / Bỏ qua
                  </span>
                  <span className="text-lg font-black text-red-500">
                    {wrongAnswers + skippedAnswers}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* 2. BIỂU ĐỒ RADAR (SKILL ANALYSIS) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center animate-in slide-in-from-bottom-4 duration-500 delay-300">
              <div className="w-full flex items-center gap-2 mb-6 border-b border-gray-100 pb-3">
                <div className={`p-2 ${theme.badgeBox} rounded-lg`}>
                  <Icons.Target size={20} />
                </div>
                <h2 className="font-bold text-gray-800 text-lg">
                  Phân tích Kỹ năng
                </h2>
              </div>
              <SkillRadarChart data={radarData} mainColor={mainColor} />
            </div>

            {/* 3. CHI TIẾT & CẢNH BÁO (DETAILS & ALERTS) */}
            <div className="flex flex-col gap-6">
              {/* Thẻ Cảnh báo Điểm yếu */}
              {weakestSkill && weakestSkill.score < 80 && (
                <div className="bg-red-50 rounded-2xl shadow-sm border border-red-100 p-5 animate-in slide-in-from-bottom-4 duration-500 delay-400">
                  <div className="flex gap-3 items-start">
                    <div className="p-2 bg-red-100 text-red-600 rounded-full mt-1 shrink-0">
                      <Icons.AlertCircle size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-red-800 text-base mb-1">
                        Cảnh báo Điểm yếu
                      </h3>
                      <p className="text-sm text-red-700 mb-2 leading-relaxed">
                        Kỹ năng <strong>{weakestSkill.label}</strong> của bạn
                        đang ở mức thấp (
                        <span className="font-black">
                          {weakestSkill.score}%
                        </span>
                        ).
                      </p>
                      <p className="text-xs text-red-600/80 italic">
                        Lời khuyên: Hãy xem lại chi tiết lỗi sai và tập trung ôn
                        luyện thêm các dạng bài thuộc chủ đề này.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Danh sách Chi tiết */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex-1 animate-in slide-in-from-bottom-4 duration-500 delay-500">
                <div className="w-full flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
                  <div className="p-2 bg-gray-50 text-gray-600 rounded-lg">
                    <Icons.Layers size={20} />
                  </div>
                  <h2 className="font-bold text-gray-800 text-lg">
                    Chi tiết từng Chặng
                  </h2>
                </div>
                <div className="space-y-4">
                  {radarData.map((d, i) => (
                    <div key={`${d.label}-${i}`} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-sm">
                        <span
                          className="font-bold text-gray-700 line-clamp-1 flex-1 pr-2"
                          title={d.label}
                        >
                          {d.label}
                        </span>
                        <span className="font-mono font-bold text-gray-500 text-xs shrink-0">
                          {d.rawCorrect}/{d.rawTotal} (
                          <span
                            className={
                              d.score >= 80
                                ? 'text-green-600'
                                : d.score >= 50
                                ? 'text-orange-500'
                                : 'text-red-500'
                            }
                          >
                            {d.score}%
                          </span>
                          )
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            d.score >= 80
                              ? 'bg-green-500'
                              : d.score >= 50
                              ? 'bg-orange-400'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${d.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4. KHU VỰC HÀNH ĐỘNG (ACTION BUTTONS) */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-4 animate-in slide-in-from-bottom-8 duration-500 delay-700">
            <button
              type="button"
              onClick={effectiveOnExit}
              className={`w-full sm:w-auto px-8 py-4 ${theme.primaryBtn} text-white font-bold text-lg rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2`}
            >
              <Icons.CheckCircle size={24} /> Hoàn tất & Về Menu
            </button>
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 border-2 border-gray-200 font-bold text-lg rounded-2xl shadow-sm hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icons.BookOpen size={24} className="text-red-500" /> Xem lại lỗi
              sai
            </button>
          </div>
        </div>
      </div>

      {/* MÀN HÌNH REVIEW ĐỘC LẬP (NẰM ĐÈ LÊN CÙNG) */}
      {ExamReviewModal && (
        <ExamReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          examState={examState}
          mainColor={mainColor}
          onBookmark={onBookmark}
          notebook={notebook}
          onExportExcel={effectiveExportExcel}
        />
      )}
    </React.Fragment>
  );
};

if (typeof window !== 'undefined') {
  const win = /** @type {any} */ (window);
  win.Block5_15_ExamReportUI = ExamReportUI;
  win.ExamReportUI = ExamReportUI;
}

export default ExamReportUI;