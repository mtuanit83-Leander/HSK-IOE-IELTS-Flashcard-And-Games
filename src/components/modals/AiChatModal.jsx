// ============================================================================
// FILE 40/85: src/components/modals/AiChatModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.5)
// NHIỆM VỤ: Cửa sổ AI Chat đa nhiệm (Kéo thả, co giãn, thu nhỏ, phóng to, bôi đen copy văn bản).
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../common/Icons';
import { callGeminiApi } from '../../services/geminiApi';

/**
 * Helper hiển thị thông báo an toàn qua hệ thống Toast toàn cục
 */
const notify = (msg, type = 'info') => {
  if (typeof window !== 'undefined' && window.globalShowToast) {
    window.globalShowToast(msg, type);
  } else {
    console.log(`[Toast - ${type}]:`, msg);
  }
};

/**
 * Cửa sổ Trợ lý AI Chat Đa nhiệm (AiChatModal)
 * Hỗ trợ kéo thả (Drag), co giãn (Resize), thu nhỏ/phóng to (Minimize/Maximize)
 * và lưu trữ lịch sử trò chuyện cục bộ.
 */
export const AiChatModal = ({
  isOpen,
  onClose,
  apiKey,
  lang = 'en',
  t = (k) => k,
  mainColor = 'sky'
}) => {
  // --- 1. STATE & REFS ---
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('fc_ai_chat_history');
      return saved
        ? JSON.parse(saved)
        : [
            {
              id: 'init',
              role: 'model',
              text: 'Xin chào! Tôi là trợ lý AI của Flashcard Lite. Tôi có thể giúp gì cho việc học của bạn hôm nay?'
            }
          ];
    } catch {
      return [
        {
          id: 'init',
          role: 'model',
          text: 'Xin chào! Tôi là trợ lý AI của Flashcard Lite. Tôi có thể giúp gì cho việc học của bạn hôm nay?'
        }
      ];
    }
  });

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // State cho Kích thước Cửa sổ
  const [size, setSize] = useState(() => {
    try {
      const savedSize = localStorage.getItem('fc_aichat_size');
      return savedSize ? JSON.parse(savedSize) : { width: 450, height: 600 };
    } catch {
      return { width: 450, height: 600 };
    }
  });

  // State cho Bộ điều khiển Cửa sổ (Windows Controls)
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [preMaxGeometry, setPreMaxGeometry] = useState(null);

  // Refs cho UI
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Ref cho Drag & Resize
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0
  });
  const resizeRef = useRef({
    isResizing: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0
  });

  // --- 2. EFFECTS ---
  // Auto scroll xuống cuối khi có tin nhắn mới
  useEffect(() => {
    if (!isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    try {
      localStorage.setItem('fc_ai_chat_history', JSON.stringify(messages));
    } catch (e) {
      console.warn('Không thể lưu lịch sử chat:', e);
    }
  }, [messages, isMinimized]);

  // Lưu kích thước cửa sổ (chỉ lưu khi không ở chế độ Maximize/Minimize)
  useEffect(() => {
    if (!isMaximized && !isMinimized) {
      try {
        localStorage.setItem('fc_aichat_size', JSON.stringify(size));
      } catch (e) {
        console.warn('Không thể lưu kích thước cửa sổ chat:', e);
      }
    }
  }, [size, isMaximized, isMinimized]);

  // Focus vào input khi mở
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  // --- 3. LOGIC XỬ LÝ CHAT ---
  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const activeApiKey =
      apiKey || localStorage.getItem('fc_gemini_api_key') || '';
    const keyPoolStr = localStorage.getItem('fc_apikey_pool');
    let hasKeyInPool = false;
    try {
      const pool = keyPoolStr ? JSON.parse(keyPoolStr) : [];
      hasKeyInPool = Array.isArray(pool) && pool.length > 0;
    } catch {
      hasKeyInPool = false;
    }

    if (!activeApiKey && !hasKeyInPool) {
      notify('Vui lòng nhập API Key trong Cài đặt trước!', 'warning');
      return;
    }

    const userText = input.trim();
    const newMessage = { id: Date.now(), role: 'user', text: userText };

    setMessages((prev) => [...prev, newMessage]);
    setInput('');
    setIsSending(true);

    try {
      // Xây dựng ngữ cảnh hội thoại (10 tin nhắn gần nhất)
      const historyContext = messages
        .slice(-10)
        .map((m) => `${m.role === 'user' ? 'User' : 'Model'}: ${m.text}`)
        .join('\n');

      const systemPrompt = `Bạn là trợ lý ảo hữu ích cho ứng dụng học từ vựng Flashcard Lite.
Ngôn ngữ học tập hiện tại của người dùng là: ${lang === 'zh' ? 'Tiếng Trung' : lang === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}.
QUY TẮC GIAO TIẾP QUAN TRỌNG:
1. LUÔN LUÔN trả lời và giải thích bằng TIẾNG VIỆT (Vietnamese), trừ khi người dùng yêu cầu dịch sang ngôn ngữ khác hoặc yêu cầu cụ thể khác.
2. Nếu người dùng hỏi về từ vựng, hãy giải thích nghĩa, cách dùng và ví dụ.
3. Trả lời ngắn gọn, súc tích, thân thiện.
Hỗ trợ định dạng Markdown nhẹ (Bold, Italic, List).`;

      const fullPrompt = `${systemPrompt}\n\nLịch sử chat:\n${historyContext}\n\nUser: ${userText}\nModel:`;

      // Gọi API qua service hoặc fallback sang window.Utils
      const apiCaller =
        callGeminiApi ||
        (typeof window !== 'undefined' && window.Utils?.callGeminiApi);

      if (!apiCaller) {
        throw new Error('Dịch vụ kết nối AI chưa sẵn sàng.');
      }

      const result = await apiCaller(fullPrompt, null, activeApiKey);

      const aiMessage = {
        id: Date.now() + 1,
        role: 'model',
        text: result.text || 'Xin lỗi, tôi không thể trả lời lúc này.'
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'model',
          text: `⚠️ Lỗi: ${error.message || 'Không thể kết nối đến AI.'}`
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const confirmClearHistory = () => {
    setMessages([
      {
        id: Date.now(),
        role: 'model',
        text: 'Lịch sử đã được xóa. Chúng ta bắt đầu lại nhé!'
      }
    ]);
    setShowClearConfirm(false);
    notify('Đã xóa lịch sử trò chuyện!', 'info');
  };

  // --- 4. LOGIC CỬA SỔ (WINDOWS CONTROLS) ---
  const handleMaximizeToggle = () => {
    if (isMinimized) setIsMinimized(false);
    if (!isMaximized) {
      setPreMaxGeometry({ position: { ...position }, size: { ...size } });
      setPosition({ x: 0, y: 0 });
      setIsMaximized(true);
    } else {
      if (preMaxGeometry) {
        setPosition(preMaxGeometry.position);
        setSize(preMaxGeometry.size);
      }
      setIsMaximized(false);
    }
  };

  const handleMinimizeToggle = () => {
    setIsMinimized(!isMinimized);
    if (isMaximized && !isMinimized) {
      setIsMaximized(false);
      if (preMaxGeometry) {
        setPosition(preMaxGeometry.position);
        setSize(preMaxGeometry.size);
      }
    }
  };

  // --- 5. LOGIC KÉO THẢ (DRAG) ---
  const handleMouseDown = (e) => {
    if (isMaximized) return;
    if (
      e.target.closest('button') ||
      e.target.closest('input') ||
      e.target.closest('.no-drag')
    ) {
      return;
    }

    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    dragRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      initialX: position.x,
      initialY: position.y
    };

    const move = (ev) => {
      if (!dragRef.current.isDragging) return;
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.type.includes('mouse') ? ev.clientX : ev.touches[0].clientX;
      const cy = ev.type.includes('mouse') ? ev.clientY : ev.touches[0].clientY;
      const dx = cx - dragRef.current.startX;
      const dy = cy - dragRef.current.startY;
      setPosition({
        x: dragRef.current.initialX + dx,
        y: dragRef.current.initialY + dy
      });
    };

    const up = () => {
      dragRef.current.isDragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  };

  // --- 6. LOGIC KÉO GIÃN (RESIZE) ---
  const handleResizeMouseDown = (e) => {
    if (isMaximized || isMinimized) return;
    e.preventDefault();
    e.stopPropagation();

    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    resizeRef.current = {
      isResizing: true,
      startX: clientX,
      startY: clientY,
      startWidth: size.width,
      startHeight: size.height
    };

    const move = (ev) => {
      if (!resizeRef.current.isResizing) return;
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.type.includes('mouse') ? ev.clientX : ev.touches[0].clientX;
      const cy = ev.type.includes('mouse') ? ev.clientY : ev.touches[0].clientY;
      const dx = cx - resizeRef.current.startX;
      const dy = cy - resizeRef.current.startY;

      setSize({
        width: Math.max(
          300,
          Math.min(window.innerWidth - 40, resizeRef.current.startWidth + dx)
        ),
        height: Math.max(
          400,
          Math.min(window.innerHeight - 40, resizeRef.current.startHeight + dy)
        )
      });
    };

    const up = () => {
      resizeRef.current.isResizing = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  };

  // --- 7. RENDER HELPER ---
  const renderMarkdown = (text) => {
    if (!text) return null;
    const html = String(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(
        /`(.*?)`/g,
        '<code class="bg-gray-200 px-1 rounded font-mono text-xs">$1</code>'
      )
      .replace(/\n/g, '<br/>');
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (!isOpen) return null;

  const Icon = (Name, props) =>
    Icons[Name] ? React.createElement(Icons[Name], props) : null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none">
      {/* Overlay click to close */}
      <div
        className="absolute inset-0 bg-transparent pointer-events-auto"
        onClick={onClose}
      ></div>

      <div
        className={`bg-white/95 backdrop-blur-md shadow-2xl flex flex-col z-10 overflow-hidden pointer-events-auto border border-gray-200 transition-all duration-200 ease-out relative ${
          isMaximized ? 'rounded-none' : 'rounded-2xl'
        }`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          width: isMaximized ? '100vw' : `${size.width}px`,
          height: isMinimized
            ? 'auto'
            : isMaximized
              ? '100vh'
              : `${size.height}px`,
          maxWidth: '100vw',
          maxHeight: '100vh',
          top: isMaximized ? 0 : 'auto',
          left: isMaximized ? 0 : 'auto',
          position: isMaximized ? 'fixed' : 'relative'
        }}
      >
        {/* Header (Draggable & Windows Controls) */}
        <div
          className={`flex justify-between items-center p-3 border-b bg-${mainColor}-50 select-none transition-colors ${
            isMaximized ? 'cursor-default' : 'cursor-move active:bg-gray-100'
          }`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onDoubleClick={handleMaximizeToggle}
        >
          <div
            className={`flex items-center gap-2 text-${mainColor}-700 font-bold pointer-events-none`}
          >
            {Icon('Sparkles', { size: 20 })} AI Chat Assistant
          </div>

          <div className="flex gap-1.5 items-center no-drag">
            <button
              onClick={() => setShowClearConfirm(!showClearConfirm)}
              className={`p-1.5 rounded-lg transition-colors mr-1 ${
                showClearConfirm
                  ? 'text-red-600 bg-red-100'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
              title="Xóa lịch sử"
            >
              {Icon('Trash2', { size: 16 })}
            </button>

            <div className="w-px h-4 bg-gray-300 mx-1"></div>

            {/* Nút Minimize */}
            <button
              onClick={handleMinimizeToggle}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              title="Thu nhỏ"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            {/* Nút Maximize / Restore */}
            <button
              onClick={handleMaximizeToggle}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              title={isMaximized ? 'Phục hồi' : 'Phóng to'}
            >
              {isMaximized ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                  <path d="M9 4v16"></path>
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              )}
            </button>

            {/* Nút Close */}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
              title="Đóng"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Thanh xác nhận xóa lịch sử an toàn */}
        {showClearConfirm && !isMinimized && (
          <div className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-center justify-between text-xs animate-in fade-in no-drag">
            <span className="font-bold text-red-700">
              Xóa toàn bộ lịch sử trò chuyện?
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 bg-white text-gray-600 rounded border border-gray-200 font-bold hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                onClick={confirmClearHistory}
                className="px-2.5 py-1 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-sm"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        )}

        {/* Thân Chat & Input (Ẩn khi Minimized, hỗ trợ select-text) */}
        {!isMinimized && (
          <>
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-gray-50 no-drag select-text cursor-text">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm leading-relaxed select-text cursor-text ${
                      msg.role === 'user'
                        ? `bg-${mainColor}-600 text-white rounded-br-none`
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                    }`}
                  >
                    {renderMarkdown(msg.text)}
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex gap-1 items-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t bg-white no-drag pb-4 select-text">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Hỏi tôi bất cứ điều gì..."
                  className="flex-1 p-3 border rounded-xl focus:ring-2 focus:ring-blue-200 outline-none resize-none bg-gray-50 text-sm max-h-24 custom-scrollbar select-text cursor-text"
                  rows="1"
                  style={{ minHeight: '44px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  className={`p-3 rounded-xl bg-${mainColor}-600 text-white shadow-lg hover:bg-${mainColor}-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex-shrink-0 h-[44px] w-[44px] flex items-center justify-center`}
                >
                  {isSending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    Icon('Play', { size: 20, className: 'ml-0.5' })
                  )}
                </button>
              </div>
            </div>

            {/* Resize Grip (Chỉ hiển thị khi không phóng to) */}
            {!isMaximized && (
              <div
                className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-[100] flex items-end justify-end p-1 opacity-40 hover:opacity-100 transition-opacity no-drag"
                onMouseDown={handleResizeMouseDown}
                onTouchStart={handleResizeMouseDown}
                title="Kéo để đổi kích thước"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-gray-500"
                >
                  <path
                    d="M11 1L1 11M11 5L5 11M11 9L9 11"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.AiChatModal = AiChatModal;
}

export default AiChatModal;