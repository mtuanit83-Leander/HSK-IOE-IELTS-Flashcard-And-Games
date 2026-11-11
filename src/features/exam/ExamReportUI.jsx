/**
 * @file src/features/exam/ExamReportUI.jsx
 * @description Màn hình Báo cáo Kết quả Khảo thí (Exam Report UI). Hiển thị điểm số, tỷ lệ chính xác và biểu đồ Radar phân tích kỹ năng.
 * @origin Tầng 5 - Block 5.15 (Exam Report)
 */

import React, { useMemo } from 'react';
import { Icons } from '@/components/common/Icons';

// ============================================================================
// COMPONENT: THUẬT TOÁN VẼ BIỂU ĐỒ RADAR SVG THUẦN (KHÔNG DÙNG THƯ VIỆN)
// ============================================================================
const SVGRadarChart = ({ data, mainColor = 'blue' }) => {
  if (!data || data.length < 3) {
    // Fallback sang biểu đồ cột nếu có ít hơn 3 trục kỹ năng
    return (
      <div className="w-full space-y-3">
        {data.map((item, idx) => (
          <div key={idx} className="w-full">
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="text-gray-700">{item.subject}</span>
              <span className={`text-${mainColor}-600`}>{Math.round(item.score)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className={`bg-${mainColor}-500 h-2.5 rounded-full transition-all duration-1000 ease-out`}
                style={{ width: `${Math.max(5, item.score)}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Khởi tạo các thông số hình học cho Radar Chart
  const size = 240;
  const center = size / 2;
  const radius = (size / 2) - 30; // Chừa lề cho chữ
  const numAxes = data.length;
  const angleStep = (Math.PI * 2) / numAxes;

  // Hàm tính toán tọa độ điểm
  const getPoint = (value, index, offset = 0) => {
    // Giá trị value từ 0 đến 100
    const distance = (value / 100) * radius + offset;
    const angle = index * angleStep - Math.PI / 2; // Trừ PI/2 để đỉnh đầu tiên hướng lên 12h
    return {
      x: center + distance * Math.cos(angle),
      y: center + distance * Math.sin(angle)
    };
  };

  // Tạo lưới nhện nền (Grid polygons)
  const gridLevels = [20, 40, 60, 80, 100];
  const gridPolygons = gridLevels.map(level => {
    const points = Array.from({ length: numAxes }).map((_, i) => {
      const p = getPoint(level, i);
      return `${p.x},${p.y}`;
    }).join(' ');
    return <polygon key={`grid-${level}`} points={points} fill="none" stroke="#e5e7eb" strokeWidth="1" />;
  });

  // Tạo các trục nối từ tâm ra viền
  const axes = Array.from({ length: numAxes }).map((_, i) => {
    const p = getPoint(100, i);
    return <line key={`axis-${i}`} x1={center} y1={center} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />;
  });

  // Đổ dữ liệu thật vào Đa giác
  const dataPoints = data.map((item, i) => {
    const p = getPoint(item.score, i);
    return `${p.x},${p.y}`;
  }).join(' ');

  // Vẽ các nhãn (Labels)
  const labels = data.map((item, i) => {
    const p = getPoint(100, i, 15); // Đẩy chữ ra ngoài viền 15px
    
    // Căn lề chữ dựa trên vị trí góc
    let textAnchor = "middle";
    if (p.x < center - 10) textAnchor = "end";
    else if (p.x > center + 10) textAnchor = "start";

    return (
      <text 
        key={`label-${i}`} 
        x={p.x} 
        y={p.y} 
        textAnchor={textAnchor} 
        dominantBaseline="middle"
        className="text-[9px] font-black fill-gray-500 uppercase tracking-wider"
      >
        {item.subject.substring(0, 15)}{item.subject.length > 15 ? '...' : ''}
      </text>
    );
  });

  // Điểm nối của dữ liệu thật
  const dataDots = data.map((item, i) => {
    const p = getPoint(item.score, i);
    return <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="3" className={`fill-${mainColor}-600`} />;
  });

  return (
    <div className="w-full flex justify-center items-center py-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {/* Lưới nhện */}
        {gridPolygons}
        {axes}
        
        {/* Vùng dữ liệu kết quả */}
        <polygon 
          points={dataPoints} 
          className={`fill-${mainColor}-500/30 stroke-${mainColor}-500 transition-all duration-1000 ease-out`}
          strokeWidth="2.5" 
          strokeLinejoin="round" 
        />
        {dataDots}
        
        {/* Chữ */}
        {labels}
      </svg>
    </div>
  );
};


// ============================================================================
// MAIN COMPONENT: EXAM REPORT UI
// ============================================================================
export const ExamReportUI = ({
  examState,
  onReview,
  onRestart,
  onBackToMenu,
  onExportExcel,
  mainColor = 'blue'
}) => {
  // Lấy dữ liệu từ State bài thi
  const { profile, answers, score, blueprint, timeRemaining } = examState;
  const totalQuestions = blueprint.length || answers.length || 1; // Fallback an toàn
  const accuracy = Math.round((answers.filter(a => a.isCorrect).length / totalQuestions) * 100) || 0;
  
  // Tính toán thời gian đã làm
  const totalTimeLimit = profile?.timeLimit || 0;
  const timeUsed = totalTimeLimit > 0 ? (totalTimeLimit - timeRemaining) : 0;
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}p ${s}s`;
  };

  // Phân tích dữ liệu theo nhóm kỹ năng (Skill Analysis)
  const skillData = useMemo(() => {
    const groups = {};
    
    // Lặp qua tất cả đáp án để gom nhóm
    answers.forEach(ans => {
      const meta = ans.questionMetadata || {};
      // Dùng chapter làm nhóm, nếu không có thì lấy type, bần cùng thì dùng "Tổng hợp"
      const groupName = meta.chapter || meta.phase || meta.type || "Tổng hợp";
      
      if (!groups[groupName]) {
        groups[groupName] = { total: 0, correct: 0 };
      }
      
      groups[groupName].total += 1;
      if (ans.isCorrect) {
        groups[groupName].correct += 1;
      }
    });

    // Chuyển đổi thành mảng cho Biểu đồ Radar
    const radarData = Object.keys(groups).map(key => {
      const group = groups[key];
      const percentage = group.total > 0 ? (group.correct / group.total) * 100 : 0;
      
      // Rút gọn tên kỹ năng cho đẹp
      let cleanName = key.replace(/\(.*?\)/g, '').trim(); // Bỏ phần trong ngoặc
      if (cleanName.includes(':')) cleanName = cleanName.split(':')[0].trim(); // Bỏ phần sau dấu hai chấm
      if (cleanName.toLowerCase().includes('passage')) cleanName = 'Đọc Hiểu'; // Chuẩn hóa passage
      
      return {
        subject: cleanName,
        score: percentage,
        fullMark: 100,
        rawCorrect: group.correct,
        rawTotal: group.total
      };
    });

    return radarData;
  }, [answers]);

  // Xếp loại
  let rankIcon = Icons.Award;
  let rankLabel = 'Xuất sắc!';
  let rankColor = 'green';
  let rankDesc = 'Bạn đã nắm vững kiến thức.';
  
  if (accuracy < 40) {
    rankIcon = Icons.AlertCircle;
    rankLabel = 'Cần cố gắng';
    rankColor = 'red';
    rankDesc = 'Hãy xem lại bài và làm nhiều bài tập hơn.';
  } else if (accuracy < 70) {
    rankIcon = Icons.Target;
    rankLabel = 'Đạt yêu cầu';
    rankColor = 'orange';
    rankDesc = 'Đã có nền tảng, nhưng cần rèn luyện thêm.';
  } else if (accuracy < 90) {
    rankIcon = Icons.CheckCircle;
    rankLabel = 'Rất tốt!';
    rankColor = 'blue';
    rankDesc = 'Kiến thức khá vững vàng.';
  }

  const RankIconComp = rankIcon;

  return (
    <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-4">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border-2 border-gray-100 overflow-hidden flex flex-col">
        
        {/* HEADER BÁO CÁO */}
        <div className={`p-6 bg-${mainColor}-50 border-b border-${mainColor}-100 flex flex-col items-center text-center relative`}>
          <div className="absolute top-4 right-4 flex gap-2">
            {onExportExcel && (
              <button 
                onClick={onExportExcel}
                className="p-2 bg-white text-green-600 rounded-full shadow-sm hover:bg-green-50 transition-colors border border-gray-200"
                title="Xuất chi tiết bài làm ra Excel"
              >
                <Icons.Download size={18} />
              </button>
            )}
            <button 
              onClick={onBackToMenu}
              className="p-2 bg-white text-gray-500 rounded-full shadow-sm hover:bg-red-50 hover:text-red-500 transition-colors border border-gray-200"
              title="Thoát"
            >
              <Icons.X size={18} />
            </button>
          </div>

          <div className={`w-20 h-20 bg-${rankColor}-100 text-${rankColor}-600 rounded-full flex items-center justify-center mb-3 shadow-inner border-4 border-${rankColor}-200`}>
            <RankIconComp size={40} />
          </div>
          <h1 className="text-2xl font-black text-gray-800 uppercase tracking-wide">Báo Cáo Khảo Thí</h1>
          <p className="text-sm font-bold text-gray-500 mt-1">{profile?.name || "Bài thi Tổng hợp"}</p>
        </div>

        {/* THÂN BÁO CÁO */}
        <div className="p-4 sm:p-6 flex-1 flex flex-col lg:flex-row gap-6 lg:gap-10">
          
          {/* Cột Trái: Chỉ số tổng quan */}
          <div className="flex-1 flex flex-col gap-4">
            
            <div className={`p-5 rounded-2xl bg-gradient-to-br from-${mainColor}-500 to-${mainColor}-700 text-white shadow-lg flex flex-col items-center justify-center text-center relative overflow-hidden`}>
              <Icons.Target size={120} className="absolute -right-10 -bottom-10 opacity-10" />
              <div className="text-sm font-bold uppercase tracking-widest opacity-80 mb-1">Xếp loại</div>
              <div className="text-3xl font-black mb-1">{rankLabel}</div>
              <div className="text-xs font-medium opacity-90">{rankDesc}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center justify-center text-center shadow-sm">
                <Icons.CheckCircle size={24} className="text-green-500 mb-2" />
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Độ chính xác</div>
                <div className="text-2xl font-black text-gray-800 font-mono mt-1">{accuracy}%</div>
                <div className="text-xs font-bold text-gray-500 mt-1">{answers.filter(a => a.isCorrect).length} / {totalQuestions} câu</div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-center justify-center text-center shadow-sm">
                <Icons.Clock size={24} className="text-orange-500 mb-2" />
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Thời gian làm bài</div>
                <div className="text-2xl font-black text-gray-800 font-mono mt-1">{formatTime(timeUsed)}</div>
                <div className="text-xs font-bold text-gray-500 mt-1">/ {formatTime(totalTimeLimit)}</div>
              </div>
            </div>
            
          </div>

          {/* Cột Phải: Phân tích Kỹ năng (Radar Chart) */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 border-b border-gray-100 pb-3 mb-2 flex items-center gap-2">
              <Icons.Layers size={18} className={`text-${mainColor}-500`} /> 
              Phân tích Kỹ năng
            </h3>
            
            <div className="flex-1 flex items-center justify-center min-h-[250px]">
               <SVGRadarChart data={skillData} mainColor={mainColor} />
            </div>
            
            {/* Legend / Thông tin chi tiết */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              {skillData.map((item, idx) => (
                <div key={idx} className="bg-gray-50 p-2 rounded-lg border border-gray-100 flex justify-between items-center text-[10px] sm:text-xs">
                  <span className="font-bold text-gray-600 truncate mr-2" title={item.subject}>{item.subject}</span>
                  <span className={`font-black ${item.score >= 80 ? 'text-green-600' : (item.score >= 50 ? 'text-orange-500' : 'text-red-500')}`}>
                    {item.rawCorrect}/{item.rawTotal}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
        </div>

        {/* FOOTER ĐIỀU KHIỂN */}
        <div className="p-4 sm:p-6 border-t border-gray-100 bg-white flex flex-col sm:flex-row gap-3">
          <button 
            onClick={onReview}
            className={`flex-1 py-3.5 rounded-xl font-black text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base bg-${mainColor}-600 hover:bg-${mainColor}-700`}
          >
            <Icons.Eye size={20} /> Xem lại chi tiết bài làm
          </button>
          
          <div className="flex gap-3 flex-1">
            <button 
              onClick={onRestart}
              className="flex-1 py-3.5 rounded-xl font-black text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Icons.RotateCcw size={18} /> Thi lại
            </button>
            <button 
              onClick={onBackToMenu}
              className="flex-1 py-3.5 rounded-xl font-black text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Icons.ChevronLeft size={18} /> Về Menu
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ExamReportUI;