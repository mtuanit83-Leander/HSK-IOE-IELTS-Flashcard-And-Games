/**
 * ============================================================================
 * FILE 73/85: src/features/exam/ExamReportUI.jsx
 * @description Hiển thị Báo cáo Tổng kết bài thi (Mock Test) với Biểu đồ Radar
 *              phân tích kỹ năng, Cảnh báo điểm yếu và Thống kê chi tiết.
 * @origin Tầng 5 - Block 5.15 (Grand Exam Report UI - Version 1.02)
 * ============================================================================
 */

import React, { useState } from 'react';
import { Icons } from '@/components/common/Icons';
import { ExamReviewModal } from './ExamReviewModal';

// ============================================================================
// 1. COMPONENT BIỂU ĐỒ RADAR (PURE SVG)
// ============================================================================
export const SkillRadarChart = ({ data, mainColor = 'blue' }) => {
  if (!data || data.length < 3) {
    return (
      <div className="w-full h-48 flex items-center justify-center text-gray-400 italic text-sm bg-gray-50 rounded-xl border border-gray-100">
        Cần ít nhất 3 kỹ năng để vẽ biểu đồ Radar.
      </div>
    );
  }

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 100;
  const numPoints = data.length;

  // Helper tính tọa độ
  const getPoint = (val, index, customRadius = radius) => {
    // Trừ đi PI/2 để đỉnh đầu tiên luôn hướng thẳng lên góc 12 giờ
    const angle = (Math.PI * 2 * index) / numPoints - Math.PI / 2;
    const x = cx + customRadius * val * Math.cos(angle);
    const y = cy + customRadius * val * Math.sin(angle);
    return { x, y };
  };

  // 1. Tạo các đường lưới mạng nhện (Spider Web Grid)
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1];
  const grids = gridLevels.map((level) => {
    const points = data
      .map((_, i) => {
        const p = getPoint(level, i);
        return `${p.x},${p.y}`;
      })
      .join(' ');
    return <polygon key={level} points={points} fill="none" stroke="#e5e7eb" strokeWidth="1" />;
  });

  // 2. Tạo các trục tỏa ra từ tâm
  const axes = data.map((_, i) => {
    const p = getPoint(1, i);
    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth="1" />;
  });

  // 3. Tạo Đa giác Dữ liệu thực tế của học sinh (Data Polygon)
  const dataPoints = data
    .map((d, i) => {
      const p = getPoint(d.score / 100, i);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  // 4. Lấy màu sắc theo mainColor
  const colorMap = {
    blue: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.2)', dot: '#2563eb' },
    sky: { stroke: '#0ea5e9', fill: 'rgba(14, 165, 233, 0.2)', dot: '#0284c7' },
    indigo: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.2)', dot: '#4f46e5' },
    green: { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.2)', dot: '#16a34a' },
    red: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.2)', dot: '#dc2626' },
    purple: { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.2)', dot: '#9333ea' },
    orange: { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.2)', dot: '#ea580c' }
  };
  const theme = colorMap[mainColor] || colorMap.blue;

  return (
    <div className="w-full flex justify-center relative select-none">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[340px] h-auto drop-shadow-sm overflow-visible"
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
        {data.map((d, i) => {
          const p = getPoint(d.score / 100, i);
          return (
            <circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r="4"
              fill={theme.dot}
              className="animate-in zoom-in delay-500"
            />
          );
        })}
        {/* Nhãn Kỹ năng (Labels) */}
        {data.map((d, i) => {
          // Đẩy nhãn ra xa hơn một chút so với bán kính tối đa
          const p = getPoint(1, i, radius + 35);
          // Điều chỉnh text-anchor dựa trên tọa độ X để chữ không bị cắt
          let anchor = 'middle';
          if (p.x < cx - 10) anchor = 'end';
          if (p.x > cx + 10) anchor = 'start';
          // Chặt tên Chapter dài thành 2 dòng nếu cần
          const words = d.label.split(' ');
          const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
          const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
          return (
            <text
              key={`label-${i}`}
              x={p.x}
              y={p.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="text-[10px] sm:text-xs font-bold fill-gray-600"
            >
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
                d.label
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
export const ExamReportUI = ({
  examState = {},
  onExit,
  onBackToMenu,
  mainColor = 'blue',
  onBookmark,
  notebook,
  exportExamToExcel,
  onExportExcel
}) => {
  // [VÁ LỖI MOCK TEST REVIEW] State quản lý Màn hình Review
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const effectiveOnExit = onExit || onBackToMenu;
  const effectiveExportExcel = exportExamToExcel || onExportExcel;

  const SafeExamReviewModal =
    ExamReviewModal ||
    (typeof window !== 'undefined' && (window.Block5_16_ExamReviewModal || window.ExamReviewModal));

  // 1. XỬ LÝ DỮ LIỆU TỔNG QUAN
  const profile = examState.profile || {};
  const blueprint = examState.blueprint || [];
  const answers = examState.answers || [];
  const totalQuestions = blueprint.length;
  const answeredCount = answers.length;
  const correctAnswers = answers.filter((a) => a.isCorrect).length;
  const wrongAnswers = answeredCount - correctAnswers;
  const skippedAnswers = Math.max(0, totalQuestions - answeredCount);
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const timeTaken = profile.timeLimit
    ? Math.max(0, profile.timeLimit - (examState.timeRemaining || 0))
    : 0;

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} phút ${s.toString().padStart(2, '0')} giây`;
  };

  // 2. PHÂN TÍCH THEO CHẶNG (CHAPTER / SKILL)
  // Gom nhóm kết quả dựa trên thuộc tính `chapter` hoặc `type` trong Blueprint
  const chapterStatsMap = {};
  blueprint.forEach((item, idx) => {
    const chapterName = item.chapter || item.type || 'Kỹ năng Khác';
    if (!chapterStatsMap[chapterName]) {
      chapterStatsMap[chapterName] = { total: 0, correct: 0 };
    }
    chapterStatsMap[chapterName].total += 1;
    // Tìm xem user có trả lời câu này chưa
    const userAnswer = answers.find((a) => a.index === idx);
    if (userAnswer && userAnswer.isCorrect) {
      chapterStatsMap[chapterName].correct += 1;
    }
  });

  // Biến đổi Map thành Array để vẽ Chart
  const radarData = Object.keys(chapterStatsMap).map((key) => {
    const stat = chapterStatsMap[key];
    const score = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
    return { label: key, score: score, rawCorrect: stat.correct, rawTotal: stat.total };
  });

  // 3. TÌM ĐIỂM YẾU NHẤT (WEAKNESS ALERT)
  let weakestSkill = null;
  if (radarData.length > 0) {
    // Tìm kỹ năng có score thấp nhất, nhưng phải có ít nhất 2 câu để làm mẫu thử
    const validSkills = radarData.filter((d) => d.rawTotal >= 2);
    if (validSkills.length > 0) {
      weakestSkill = validSkills.reduce((prev, curr) => (prev.score < curr.score ? prev : curr));
    }
  }

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
    headerGradient = `from-${mainColor}-400 to-${mainColor}-600`;
    icon = <Icons.CheckCircle size={48} className="text-white opacity-80" />;
  } else if (accuracy >= 50) {
    verdictTitle = 'Đạt yêu cầu';
    verdictSub = 'Bạn đã qua mức trung bình, nhưng vẫn còn nhiều khoảng trống cần bù đắp.';
    headerGradient = 'from-yellow-400 to-orange-500';
    icon = <Icons.Check size={48} className="text-white opacity-80" />;
  }

  return (
    <React.Fragment>
      <div className="fixed inset-0 z-[1100] bg-gray-50 flex flex-col overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-8 duration-500">
        {/* HEADER KHỔNG LỒ (HERO BANNER) */}
        <div
          className={`w-full bg-gradient-to-br ${headerGradient} pt-12 pb-16 px-6 text-center text-white relative shadow-md shrink-0`}
        >
          {/* Trang trí nền */}
          <div className="absolute top-[-50px] right-[-20px] w-48 h-48 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="absolute bottom-[-30px] left-[-30px] w-32 h-32 bg-black opacity-10 rounded-full blur-xl"></div>
          <div className="relative z-10 flex flex-col items-center animate-in zoom-in duration-500 delay-100">
            <div className="mb-4">{icon}</div>
            <div className="text-sm font-bold tracking-widest uppercase mb-1 opacity-80">
              {profile.name || 'Báo cáo Bài thi'}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 drop-shadow-md">
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
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
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
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * accuracy) / 100}
                    strokeLinecap="round"
                    className={`text-${mainColor}-500 transition-all duration-1000 ease-out`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-gray-800">{accuracy}%</span>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    Độ chính xác
                  </span>
                </div>
              </div>

              {/* Chỉ số nhanh */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-400 uppercase">Hoàn thành</span>
                  <span className="text-lg font-bold text-gray-800">
                    {answeredCount} / {totalQuestions}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-400 uppercase">Thời gian</span>
                  <span className="text-lg font-bold text-gray-800">{formatTime(timeTaken)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-green-500 uppercase flex items-center gap-1">
                    <Icons.Check size={12} /> Đúng
                  </span>
                  <span className="text-lg font-black text-green-600">{correctAnswers}</span>
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
                <div className={`p-2 bg-${mainColor}-50 text-${mainColor}-600 rounded-lg`}>
                  <Icons.Target size={20} />
                </div>
                <h2 className="font-bold text-gray-800 text-lg">Phân tích Kỹ năng</h2>
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
                      <h3 className="font-bold text-red-800 text-base mb-1">Cảnh báo Điểm yếu</h3>
                      <p className="text-sm text-red-700 mb-2 leading-relaxed">
                        Kỹ năng <strong>{weakestSkill.label}</strong> của bạn đang ở mức thấp (
                        <span className="font-black">{weakestSkill.score}%</span>).
                      </p>
                      <p className="text-xs text-red-600/80 italic">
                        Lời khuyên: Hãy xem lại chi tiết lỗi sai và tập trung ôn luyện thêm các dạng
                        bài thuộc chủ đề này.
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
                  <h2 className="font-bold text-gray-800 text-lg">Chi tiết từng Chặng</h2>
                </div>
                <div className="space-y-4">
                  {radarData.map((d, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
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
                        ></div>
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
              className={`w-full sm:w-auto px-8 py-4 bg-${mainColor}-600 text-white font-bold text-lg rounded-2xl shadow-xl shadow-${mainColor}-500/20 hover:bg-${mainColor}-700 active:scale-95 transition-all flex items-center justify-center gap-2`}
            >
              <Icons.CheckCircle size={24} /> Hoàn tất & Về Menu
            </button>
            <button
              type="button"
              onClick={() => setIsReviewModalOpen(true)}
              className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 border-2 border-gray-200 font-bold text-lg rounded-2xl shadow-sm hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Icons.BookOpen size={24} className="text-red-500" /> Xem lại lỗi sai
            </button>
          </div>
        </div>
      </div>

      {/* MÀN HÌNH REVIEW ĐỘC LẬP (NẰM ĐÈ LÊN CÙNG) */}
      {SafeExamReviewModal && (
        <SafeExamReviewModal
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
  window.Block5_15_ExamReportUI = ExamReportUI;
  window.ExamReportUI = ExamReportUI;
}

export default ExamReportUI;