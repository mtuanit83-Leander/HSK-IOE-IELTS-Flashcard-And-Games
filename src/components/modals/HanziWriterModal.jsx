/**
 * @file src/components/modals/HanziWriterModal.jsx
 * @description Chứa tính năng Tập viết chữ Hán (Hanzi Writer Modal). Đóng gói trọn vẹn UI và logic cục bộ của một tính năng cụ thể.
 * @origin Tầng 4 - Block 4.1 (Feature Modals - Hanzi Writer)
 */

import React, { useState, useEffect, useRef } from 'react';
import HanziWriter from 'hanzi-writer';
import { Icons } from '@/components/common/Icons';

export const HanziWriterModal = ({ isOpen, onClose, char, t, mainColor }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [charData, setCharData] = useState(null); // Lưu dữ liệu chữ Hán
  const [quizStatus, setQuizStatus] = useState("Vẽ nét đầu tiên vào ô trên!");
  const [statusColor, setStatusColor] = useState("text-slate-500 bg-slate-50 border-slate-200");
  
  // Refs
  const writerRef = useRef(null);
  const quizWriterRef = useRef(null);
  const fanContainerRef = useRef(null);
  const demoDivRef = useRef(null);
  const quizDivRef = useRef(null);

  // EFFECT 1: Tải dữ liệu khi mở Modal
  useEffect(() => {
    if (isOpen && char) {
      setIsLoading(true);
      setCharData(null);
      
      HanziWriter.loadCharacterData(char)
        .then(data => {
          setCharData(data); // Lưu dữ liệu
          setIsLoading(false); // Kích hoạt render giao diện chính
        })
        .catch(e => {
          console.error("Load Hanzi Data Failed:", e);
          setQuizStatus("Lỗi tải dữ liệu. Vui lòng kiểm tra mạng.");
          setIsLoading(false);
        });
    }
  }, [isOpen, char]);

  // EFFECT 2: Khởi tạo Writer khi DOM đã sẵn sàng (!isLoading)
  useEffect(() => {
    if (!isLoading && charData && demoDivRef.current && quizDivRef.current) {
      // Dọn dẹp cũ
      demoDivRef.current.innerHTML = '';
      quizDivRef.current.innerHTML = '';
      if (fanContainerRef.current) fanContainerRef.current.innerHTML = '';
      
      const commonOptions = {
        width: 300,
        height: 300,
        padding: 20,
        strokeColor: '#1e293b',
        outlineColor: '#e2e8f0',
        drawingColor: '#2563eb',
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 500,
        charDataLoader: (char, onComplete) => onComplete(charData) // Dùng luôn data đã tải
      };
      
      try {
        // 1. Writer Demo
        writerRef.current = HanziWriter.create(demoDivRef.current, char, {
          ...commonOptions,
          showOutline: true
        });
        writerRef.current.showCharacter();
        
        // 2. Writer Quiz
        quizWriterRef.current = HanziWriter.create(quizDivRef.current, char, {
          ...commonOptions,
          showOutline: true,
          showHintAfterMisses: 1,
          highlightOnComplete: true
        });
        quizWriterRef.current.showOutline();
        
        // Thiết lập Quiz Logic
        quizWriterRef.current.quiz({
          onMistake: () => {
            setQuizStatus("Sai rồi! Hãy thử lại.");
            setStatusColor("text-red-500 bg-red-50 border-red-200 animate-pulse");
          },
          onCorrectStroke: () => {
            setQuizStatus("Đúng! Tiếp tục nào.");
            setStatusColor("text-blue-500 bg-blue-50 border-blue-200");
          },
          onComplete: () => {
            setQuizStatus("Xuất sắc! Bạn đã thuộc bài.");
            setStatusColor("text-green-600 bg-green-100 border-green-200 font-bold");
          }
        });
        
        // 3. Tạo Stroke Fan (Tách nét)
        if (fanContainerRef.current) {
          for (let i = 0; i < charData.strokes.length; i++) {
            const div = document.createElement('div');
            div.className = "w-16 h-16 border border-red-100 bg-white rounded-lg relative mb-2 mr-2 shrink-0 hanzi-grid-bg";
            div.style.width = '64px';
            div.style.height = '64px';
            fanContainerRef.current.appendChild(div);
            
            const smallWriter = HanziWriter.create(div, char, {
              width: 64, height: 64, padding: 5,
              strokeColor: '#334155', outlineColor: '#cbd5e1', showOutline: true,
              charDataLoader: (c, cb) => cb(charData)
            });
            // Vẽ tĩnh (không animation) cho nhanh
            smallWriter.hideCharacter();
            for (let j = 0; j <= i; j++) {
              // Dùng animateStroke nhưng speed cực nhanh để hiện nét
              smallWriter.animateStroke(j, { speed: 100 });
            }
          }
        }
        
        // Chạy demo sau 1s
        setTimeout(() => writerRef.current?.animateCharacter(), 1000);
      } catch (e) {
        console.error("Init Writer Error:", e);
      }
    }
  }, [isLoading, charData, char]); // Chạy khi loading xong và có data

  // Các hàm điều khiển
  const handleAnimate = () => writerRef.current?.animateCharacter();
  const handleSlowAnimate = () => writerRef.current?.animateCharacter({ strokeAnimationSpeed: 0.2 });
  const handleHint = () => quizWriterRef.current?.animateStroke(quizWriterRef.current?._quiz?.currentStrokeIndex || 0);
  const handleResetQuiz = () => {
    if (quizWriterRef.current) {
      quizWriterRef.current.cancelQuiz();
      quizWriterRef.current.hideCharacter();
      quizWriterRef.current.showOutline();
      quizWriterRef.current.quiz({
        onMistake: () => { setQuizStatus("Sai rồi!"); setStatusColor("text-red-500 bg-red-50 border-red-200"); },
        onCorrectStroke: () => { setQuizStatus("Đúng!"); setStatusColor("text-blue-500 bg-blue-50 border-blue-200"); },
        onComplete: () => { setQuizStatus("Hoàn thành!"); setStatusColor("text-green-600 bg-green-100 border-green-200 font-bold"); }
      });
      setQuizStatus("Vẽ nét đầu tiên vào ô trên!");
      setStatusColor("text-slate-500 bg-slate-50 border-slate-200");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-white flex flex-col animate-in slide-in-from-bottom-10">
      {/* Header */}
      <div className={`p-4 bg-${mainColor}-600 text-white flex justify-between items-center shadow-md shrink-0`}>
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <Icons.ChevronLeft size={28} />
          </button>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-4xl font-serif leading-none">{char}</h1>
              <span className="text-sm opacity-80 uppercase tracking-widest font-bold">Tập Viết</span>
            </div>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] opacity-60 uppercase">Powered by HanziWriter</p>
        </div>
      </div>
      
      {/* Content Scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 bg-gray-50">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <div className={`w-10 h-10 border-4 border-${mainColor}-500 border-t-transparent rounded-full animate-spin mb-3`}></div>
            <p>Đang tải dữ liệu bút thuận...</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            {/* Khu vực Chính: Demo & Quiz */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Cột Trái: Demo */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                  Mô phỏng nét bút
                </h3>
                <div className="relative mb-6">
                  <div className="absolute inset-0 border-2 border-red-200 rounded-xl pointer-events-none hanzi-grid-bg"></div>
                  <div ref={demoDivRef} className="cursor-pointer" style={{ width: '300px', height: '300px' }} onClick={handleAnimate}></div>
                </div>
                <div className="flex gap-2 w-full max-w-[300px]">
                  <button onClick={handleAnimate} className="flex-1 py-3 bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-colors">
                    <Icons.Play size={18} className="inline mr-1"/> Xem lại
                  </button>
                  <button onClick={handleSlowAnimate} className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">
                    <Icons.Clock size={18} className="inline mr-1"/> Xem chậm
                  </button>
                </div>
              </div>
              
              {/* Cột Phải: Quiz */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center">
                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                  <span className="w-2 h-6 bg-green-500 rounded-full"></span>
                  Thực hành
                </h3>
                <div className="relative mb-6">
                  <div className="absolute inset-0 border-2 border-red-200 rounded-xl pointer-events-none hanzi-grid-bg"></div>
                  <div ref={quizDivRef} className="cursor-crosshair" style={{ width: '300px', height: '300px' }}></div>
                </div>
                <div className={`w-full max-w-[300px] py-2 px-4 rounded-lg text-center text-sm font-bold border mb-4 transition-colors ${statusColor}`}>
                  {quizStatus}
                </div>
                <div className="flex gap-2 w-full max-w-[300px]">
                  <button onClick={handleHint} className="flex-1 py-3 bg-purple-50 text-purple-600 font-bold rounded-xl hover:bg-purple-100 transition-colors">
                    <Icons.Sparkles size={18} className="inline mr-1"/> Gợi ý
                  </button>
                  <button onClick={handleResetQuiz} className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">
                    <Icons.RotateCcw size={18} className="inline mr-1"/> Làm lại
                  </button>
                </div>
              </div>
            </div>
            
            {/* Khu vực Dưới: Stroke Fan */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-700 mb-6 flex items-center gap-2">
                <span className="w-2 h-6 bg-orange-500 rounded-full"></span>
                Thứ tự từng nét
              </h3>
              <div ref={fanContainerRef} className="flex flex-wrap justify-center gap-2"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};