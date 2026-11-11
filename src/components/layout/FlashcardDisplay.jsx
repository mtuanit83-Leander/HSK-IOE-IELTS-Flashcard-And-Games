/**
   * @file src/components/layout/FlashcardDisplay.jsx
   * @description Giao diện hiển thị Thẻ từ vựng 3D khổng lồ, bao gồm input gõ từ, nhảy thẻ nhanh và các nút chức năng.
   * @origin Tầng 3 - Block 3.2 (Layout & Control Components)
   */

  import React, { useState, useEffect, useRef } from 'react';
  import { Icons } from '@/components/common/Icons';
  import { AiModeSwitch } from '@/components/common/Controls';
  import { Utils } from '@/utils/helpers';

  export const FlashcardDisplay = ({ 
    isFlipped, setIsFlipped, isAutoPlaying, currentCardIndex, cards, settings, 
    mainColor, speak, getCardStyle, isAiMode, setAiMode, t, onMissingKey, 
    isLoading, onEnrichCard, onNext, onPrev, onExplainGrammar, onSrsGrade, 
    onResetSrs, isContentHidden, isMuted, onToggleMute, lang, onOpenHanzi, 
    onJumpToCard 
  }) => {
    const currentCard = cards[currentCardIndex];
    const hasImage = currentCard?.image && currentCard.image.trim() !== "";
    const isDefFirst = settings.startSide === 'def';
    const scale = settings.cardSize || 1;
    const isSentence = currentCard ? Utils.detectSentence(currentCard.term) : false;
    
    const [typingInput, setTypingInput] = useState('');
    const [typingStatus, setTypingStatus] = useState('idle');
    const typingInputRef = useRef(null);
    const [jumpInput, setJumpInput] = useState('');
    
    // [V1.09] State ẩn/hiện trường Analysis
    const [showAnalysis, setShowAnalysis] = useState(false);
    
    useEffect(() => {
      setTypingInput('');
      setTypingStatus('idle');
      setJumpInput('');
      setShowAnalysis(false); // Reset state analysis khi đổi thẻ
    }, [currentCardIndex]);
    
    useEffect(() => {
      if (!isFlipped) {
        setShowAnalysis(false); // Tự động ẩn analysis khi lật về mặt trước
      }
    }, [isFlipped]);
    
    useEffect(() => {
      const handleGlobalKeyDown = (e) => {
        if (e.key === 'Delete') {
          if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target !== typingInputRef.current)) {
            return;
          }
          e.preventDefault();
          setTypingInput('');
          setTypingStatus('idle');
          setTimeout(() => {
            typingInputRef.current?.focus();
          }, 10);
        }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);
    
    const [delayedHidden, setDelayedHidden] = useState(isContentHidden);
    useEffect(() => {
      if (isContentHidden) {
        setDelayedHidden(true);
      } else {
        const timer = setTimeout(() => {
          setDelayedHidden(false);
        }, 200);
        return () => clearTimeout(timer);
      }
    }, [isContentHidden, currentCardIndex]);
    
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const minSwipeDistance = 50;
    
    const onTouchStart = (e) => {
      setTouchEnd(null);
      setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
    };
    
    const onTouchMove = (e) => {
      setTouchEnd({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
    };
    
    const onTouchEnd = () => {
      if (!touchStart || !touchEnd) return;
      const distanceX = touchStart.x - touchEnd.x;
      const distanceY = touchStart.y - touchEnd.y;
      if (Math.abs(distanceY) > Math.abs(distanceX)) return;
      if (distanceX > minSwipeDistance && onNext) onNext();
      if (distanceX < -minSwipeDistance && onPrev) onPrev();
    };
    
    const getSrsLabel = (grade) => {
      if (!currentCard || !Utils?.calculateSRS) return "";
      const result = Utils.calculateSRS(currentCard, grade, settings);
      return Utils.getSrsTimeLabel(result.srs_interval);
    };
    
    const getFontFamily = () => {
      const font = settings?.fontFamily || 'sans';
      switch (font) {
        case 'serif': return '"Noto Serif SC", serif';
        case 'kaiti': return '"KaiTi", "STKaiti", "楷体", "LXGW WenKai Lite", serif';
        case 'callig': return '"Long Cang", cursive';
        case 'cn_kaiti': return '"KaiTi", "STKaiti", "楷体", serif';
        default: return 'ui-sans-serif, system-ui, sans-serif';
      }
    };
    
    const handleCheckTyping = () => {
      if (!currentCard) return;
      const clean = (str) => str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").trim();
      const inputClean = clean(typingInput);
      const targetClean = clean(currentCard.term);
      if (inputClean === targetClean) {
        setTypingStatus('correct');
        if (speak && !isAutoPlaying) speak(currentCard.term);
      } else {
        setTypingStatus('wrong');
      }
    };
    
    const handleJumpSubmit = () => {
      if (!jumpInput) return;
      let target = parseInt(jumpInput, 10);
      if (isNaN(target)) { setJumpInput(''); return; }
      if (target < 1) target = 1;
      if (target > cards.length) target = cards.length;
      if (onJumpToCard && target !== currentCardIndex + 1) { onJumpToCard(target); }
      setJumpInput('');
      if (document.activeElement) document.activeElement.blur();
    };
    
    const isSrsEnabled = settings.srsEnabled !== false;
    const sinoVietLabel = mainColor === 'sky' ? "Dịch chi tiết" : t('sinoVietLabel');
    const cardStyle = { '--fc-scale': scale, transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' };
    const inputGroupStyle = { '--fc-scale': scale };

    return (
      <div className="w-full flex flex-col items-center shrink-0 my-auto py-2">
        <style>{`
          /* [VÁ LỖI GIẬT MÀN HÌNH] Giữ chỗ thanh cuộn cho khung App chính, chống layout shift khi lật thẻ 3D */
          div.max-w-7xl.custom-scrollbar {
            scrollbar-gutter: stable;
          }
          .fc-card {
            display: grid;
            width: calc(100% * var(--fc-scale));
            max-width: 100%;
            margin: 0 auto;
            height: calc(360px * var(--fc-scale));
            will-change: transform;
            transform-style: preserve-3d;
            transition: transform 0.7s;
          }
          .fc-face {
            grid-area: 1 / 1;
            backface-visibility: hidden;
            -webkit-backface-visibility: hidden;
            border-radius: 1rem;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
            background-color: white;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          .fc-back {
            transform: rotateY(180deg);
          }
          .fc-input-group {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1rem;
            width: calc(100% * var(--fc-scale));
            max-width: 100%;
            margin-left: auto;
            margin-right: auto;
            box-sizing: border-box;
          }
          .fc-card-image {
            position: relative;
            height: calc(120px * var(--fc-scale));
            width: auto;
            aspect-ratio: 1 / 1;
            flex-shrink: 0;
            margin-bottom: 0.5rem;
          }
          @media (min-width: 768px) {
            .fc-card { width: calc(600px * var(--fc-scale)); }
            .fc-input-group { width: calc(600px * var(--fc-scale)); }
            .fc-card-image {
              position: absolute;
              right: 1rem;
              top: 50%;
              transform: translateY(-50%) rotate(6deg);
              height: 8rem;
              width: 8rem;
              margin-bottom: 0;
            }
            .fc-card-image:hover {
              transform: translateY(-50%) rotate(0deg) scale(1.1);
              z-index: 50;
            }
          }
        `}</style>
        
        <div className="fc-input-group" style={inputGroupStyle}>
          <input
            ref={typingInputRef}
            value={typingInput}
            onChange={(e) => { setTypingInput(e.target.value); setTypingStatus('idle'); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCheckTyping();
                e.target.blur();
              }
            }}
            className={`flex-1 min-w-0 p-3 rounded-xl border-2 outline-none transition-all font-medium shadow-sm ${typingStatus === 'correct' ? 'border-green-500 bg-green-50 text-green-700' : typingStatus === 'wrong' ? 'border-red-500 bg-red-50 text-red-700' : 'border-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'}`}
            placeholder={t('modeScramble').replace('Ghép Câu', 'Gõ lại từ vựng... (Phím Delete để xóa nhanh)')}
            style={{ fontFamily: getFontFamily() }}
            autoComplete="off"
            autoCapitalize="off"
          />
          <button
            onClick={handleCheckTyping}
            className={`px-4 rounded-xl font-bold text-white shadow transition-all active:scale-95 flex items-center justify-center flex-shrink-0 ${typingStatus === 'correct' ? 'bg-green-500' : typingStatus === 'wrong' ? 'bg-red-500' : `bg-${mainColor}-500 hover:bg-${mainColor}-600`}`}
          >
            {typingStatus === 'correct' ? <Icons.Check size={20} /> : (typingStatus === 'wrong' ? <Icons.X size={20} /> : <Icons.CheckCircle size={20} />)}
          </button>
        </div>
        
        <div className="w-full flex justify-center perspective-1000" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div key={currentCardIndex} className="fc-card cursor-pointer" style={cardStyle} onClick={() => !isAutoPlaying && setIsFlipped(!isFlipped)}>
            <div className="fc-face fc-front flex flex-col items-center justify-between p-6 border-2 border-gray-100">
              {!isFlipped && (
                <AiModeSwitch isAiMode={isAiMode} setAiMode={setAiMode} t={t} onMissingKey={onMissingKey} isLoading={isLoading} className="absolute top-3 right-3 z-50" />
              )}
              
              {/* TÍNH NĂNG NHẢY THẺ (QUICK JUMP) */}
              <div className="self-start flex items-center text-xs text-gray-400 relative z-[60]" onClick={e => e.stopPropagation()}>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={jumpInput !== '' ? jumpInput : (currentCardIndex + 1)}
                  onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleJumpSubmit(); }}
                  disabled={isAutoPlaying}
                  className={`w-8 sm:w-10 text-center bg-transparent outline-none transition-all py-0.5 rounded font-bold ${isAutoPlaying ? 'cursor-default' : 'hover:bg-gray-100 focus:bg-blue-50 focus:text-blue-600 focus:ring-1 focus:ring-blue-300 cursor-text'}`}
                  title={isAutoPlaying ? "Đang chạy tự động" : "Nhập số để chuyển thẻ"}
                />
                <span className="mx-0.5">/</span>
                <span>{cards.length}</span>
                {jumpInput !== '' && parseInt(jumpInput, 10) !== currentCardIndex + 1 && (
                  <button onClick={handleJumpSubmit} className="ml-1.5 p-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors flex items-center justify-center shadow-sm">
                    <Icons.Check size={12} strokeWidth={3} />
                  </button>
                )}
              </div>
              
              <div className={`flex-1 flex flex-col md:flex-row items-center justify-center w-full relative min-h-[150px]`}>
                {!delayedHidden ? (
                  <>
                    <div
                      className={`text-center break-words w-full order-2 md:order-1 ${hasImage ? 'md:pr-40' : 'px-4'} flex-1 flex flex-col justify-center overflow-y-auto custom-scrollbar`}
                      style={{ ...getCardStyle(false), fontWeight: settings?.fontWeight || 'bold', fontFamily: isDefFirst ? 'inherit' : getFontFamily() }}
                    >
                      {isDefFirst ? currentCard?.definition : currentCard?.term}
                    </div>
                    {hasImage && (
                      <div className="fc-card-image order-1 md:order-2 p-1 bg-white rounded-xl shadow-md border border-gray-100">
                        <img src={currentCard.image} alt="minh họa" className="w-full h-full object-contain rounded-lg" onError={(e) => { e.target.parentElement.style.display = 'none' }} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 animate-pulse text-gray-300 w-full justify-center">
                    <Icons.Eye size={64} className="opacity-20" />
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-40">Kiểm tra trí nhớ</span>
                      <span className="text-[10px] italic opacity-30 mt-1">Vui lòng tự nhớ mặt chữ...</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-center mt-2 gap-3 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); speak(cards[currentCardIndex]?.term); }}
                  className={`p-3 rounded-full bg-white text-${mainColor}-500 shadow border-2 border-${mainColor}-100 hover:scale-105 disabled:opacity-20`}
                  disabled={isContentHidden}
                >
                  <Icons.Volume2 size={24} />
                </button>
                {lang === 'zh' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); if (onOpenHanzi) onOpenHanzi(cards[currentCardIndex]?.term); }}
                    className={`p-3 rounded-full bg-white text-red-600 shadow border-2 border-red-100 hover:scale-105 transition-transform`}
                    disabled={isContentHidden}
                    title="Tập viết chữ Hán"
                  >
                    <Icons.Brush size={24} />
                  </button>
                )}
                {isAutoPlaying && (
                  <button
                    onClick={(e) => { e.stopPropagation(); if (onToggleMute) onToggleMute(); }}
                    className={`p-3 rounded-full shadow border-2 hover:scale-105 transition-all ${isMuted ? 'bg-red-50 text-red-500 border-red-100' : 'bg-white text-gray-400 border-gray-200'}`}
                    title={isMuted ? "Bật tiếng" : "Tắt tiếng (Giữ thời gian đọc)"}
                  >
                    {isMuted ? <Icons.VolumeX size={24} /> : <Icons.Volume2 size={24} className="opacity-50" />}
                  </button>
                )}
              </div>
            </div>
            
            <div className={`fc-face fc-back bg-${mainColor}-50 border-${mainColor}-100 flex flex-col items-center justify-between pt-6 px-6 pb-2 border-2`}>
              {isSrsEnabled && (
                <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                  {currentCard?.srs_interval ? (
                    <>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border bg-white shadow-sm ${currentCard.srs_interval > 3 ? 'text-green-600 border-green-200' : 'text-orange-600 border-orange-200'}`}>
                        Ôn tập: {Utils?.getSrsTimeLabel ? Utils.getSrsTimeLabel(currentCard.srs_interval) : `${currentCard.srs_interval}d`}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); if (onResetSrs) onResetSrs(); }}
                        className="p-1 bg-white text-gray-400 rounded-full border border-gray-200 hover:text-red-500 hover:border-red-200 hover:bg-red-50 hover:rotate-180 transition-all shadow-sm"
                        title="Reset về trạng thái Mới"
                      >
                        <Icons.RotateCcw size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                      Mới
                    </span>
                  )}
                </div>
              )}
              
              <div
                className="flex flex-col items-center gap-2 overflow-y-auto custom-scrollbar w-full flex-1 justify-start mt-6 min-h-[150px]"
                style={{ ...getCardStyle(true), fontFamily: 'inherit' }}
              >
                {/* [V1.12] TÍCH HỢP HIỂN THỊ TỪ LOẠI NGAY SAU PHIÊN ÂM (Dictionary Style + Parentheses) */}
                <div className={`text-${mainColor}-600 font-medium flex items-center justify-center flex-wrap gap-3`} style={{ fontSize: '1.1em' }}>
                  <span>{currentCard?.pronunciation}</span>
                  {currentCard?.partOfSpeech && !isSentence && (
                    <span className="italic text-[0.75em] opacity-80 lowercase">
                      ({currentCard.partOfSpeech})
                    </span>
                  )}
                </div>
                <div className="text-gray-800 text-center my-1" style={{ fontSize: '1em', marginTop: '8px', fontWeight: settings?.fontWeight || 'bold', fontFamily: isDefFirst ? getFontFamily() : 'inherit' }}>
                  {isDefFirst ? currentCard?.term : currentCard?.definition}
                </div>
                
                {/* [V1.09] Hệ thống Tiết lộ Lũy tiến (Progressive Disclosure) cho trường Analysis */}
                {currentCard?.analysis && (
                  <div className="w-full flex flex-col items-center mt-2 mb-1 animate-in fade-in">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAnalysis(!showAnalysis); }}
                      className={`px-3 py-1.5 rounded-full border shadow-sm transition-colors flex items-center gap-1 font-bold ${showAnalysis ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100'}`}
                      style={{ fontSize: '0.75em' }}
                    >
                      <Icons.Sparkles size={12} /> {showAnalysis ? "Ẩn giải thích" : (isSentence ? "Xem phân tích ngữ pháp" : "Xem phân tích chi tiết")}
                    </button>
                    {showAnalysis && (
                      <div
                        className="w-full text-left bg-white p-3 rounded-xl border border-purple-100 shadow-inner mt-2 text-gray-700 leading-relaxed overflow-y-auto custom-scrollbar animate-in slide-in-from-top-2"
                        style={{ fontSize: '0.85em', maxHeight: '150px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="whitespace-pre-wrap">{currentCard.analysis}</div>
                      </div>
                    )}
                  </div>
                )}
                
                {currentCard?.sinoViet && (
                  <div className="text-gray-500 italic bg-white/50 px-2 py-1 rounded text-center mt-1" style={{ fontSize: '0.85em' }}>
                    <span className="font-bold uppercase opacity-70 mr-1" style={{ fontSize: '0.9em' }}>{sinoVietLabel}:</span>
                    {currentCard?.sinoViet}
                  </div>
                )}
                
                {/* [V1.13 DEFENSIVE RENDERING] Thuật toán Bẻ dòng thông minh nhận diện marker "- " */}
                {currentCard?.example && (
                  <div className="text-gray-600 text-left italic w-full border-t border-gray-200 pt-2 whitespace-pre-wrap mt-2" style={{ fontSize: '0.85em' }}>
                    {currentCard.example.includes('- ')
                      ? currentCard.example.split('- ').filter(p => p.trim() !== '').map(p => '- ' + p.trim()).join('\n')
                      : currentCard.example}
                  </div>
                )}
                
                {!currentCard?.analysis && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onExplainGrammar(); }}
                    className="mt-2 px-3 py-1.5 bg-purple-50 text-purple-600 font-bold border border-purple-200 rounded-full shadow-sm hover:bg-purple-100 transition-colors flex items-center gap-1 shrink-0"
                    style={{ fontSize: '0.75em' }}
                  >
                    <Icons.Sparkles size={12} /> {isSentence ? "Tạo phân tích ngữ pháp" : "Tạo phân tích chi tiết"}
                  </button>
                )}
              </div>
              
              {onSrsGrade && isSrsEnabled && (
                <div className="w-full mt-2 pt-2 border-t border-gray-200/30 grid grid-cols-4 gap-1.5 z-20 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); onSrsGrade('again'); }} className="flex flex-row items-center justify-center gap-1 py-2 px-0.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 active:scale-95 transition-all">
                    <span className="text-[10px] font-bold uppercase">{t('srsAgain')}</span>
                    <span className="text-[9px] opacity-70 font-mono">{getSrsLabel('again')}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onSrsGrade('hard'); }} className="flex flex-row items-center justify-center gap-1 py-2 px-0.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 active:scale-95 transition-all">
                    <span className="text-[10px] font-bold uppercase">{t('srsHard')}</span>
                    <span className="text-[9px] opacity-70 font-mono">{getSrsLabel('hard')}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onSrsGrade('good'); }} className="flex flex-row items-center justify-center gap-1 py-2 px-0.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 active:scale-95 transition-all">
                    <span className="text-[10px] font-bold uppercase">{t('srsGood')}</span>
                    <span className="text-[9px] opacity-70 font-mono">{getSrsLabel('good')}</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onSrsGrade('easy'); }} className="flex flex-row items-center justify-center gap-1 py-2 px-0.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 active:scale-95 transition-all">
                    <span className="text-[10px] font-bold uppercase">{t('srsEasy')}</span>
                    <span className="text-[9px] opacity-70 font-mono">{getSrsLabel('easy')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };