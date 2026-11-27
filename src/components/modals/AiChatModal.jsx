// ============================================================================
// FILE 40/85: src/components/modals/AiChatModal.jsx
// NGUỒN GỐC: tang_4.js (Block 4.5)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 05:41 (GMT+7)
// NHIỆM VỤ: Cửa sổ Trợ lý AI Chat đa nhiệm (Kéo thả, co giãn, thu nhỏ, phóng to,
//           bôi đen copy văn bản, lưu lịch sử cục bộ & hỗ trợ Markdown an toàn).
//           Nâng cấp Ver 1.0 (Giai đoạn 5 - Lượt 5.1 - Diệt 3M Radar & 0 tsc):
//           1. Diệt 3/3 MEDIUM Radar (2x R05 + 1x R06B): Chuyển fc_ai_chat_history
//              & fc_aichat_size sang Utils.safeJsonParse / Utils.safeLocalStorageSet;
//              gỡ sạch window.Utils?.callGeminiApi, dùng import ES Module chuẩn.
//           2. Diệt M1 & S9 (Bảo mật XSS): Xóa 100% dangerouslySetInnerHTML, thay
//              bằng trình phân tích Markdown React nodes thuần hỗ trợ Bold, Italic,
//              Inline Code (đúng tương phản User/Model) và Bullet List.
//           3. Diệt M2 & M4: Xóa nhánh 'vi' sót trong System Prompt (chỉ 'en'|'zh')
//              và quét API Key đủ 4 tầng qua resolveActiveApiKey (không chặn oan Paid Key).
//           4. Diệt M3 & S8: Dọn sạch 100% document drag/resize listeners & focus
//              timer khi unmount/đóng Modal; kẹp biên viewport chống bay cửa sổ.
//           5. Diệt M5, M6, S10 & 0 Problems tsc: rows={1}, bảng màu tĩnh chống
//              Tailwind JIT purge, cắt trần 50 tin nhắn, khóa Backdrop 2 nhịp chống
//              đóng nhầm khi bôi đen text, bảo vệ bộ gõ IME (Enter & Escape) & A11y.
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../common/Icons';
import { callGeminiApi } from '@/services/geminiApi';
import { Utils } from '@/utils/helpers';
import { resolveActiveApiKey } from '@/features/games/common/gameHelpers';

const MAX_CHAT_MESSAGES = 50;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 360;
const DEFAULT_SIZE = { width: 450, height: 600 };

/** @typedef {{ id: string | number, role: 'user' | 'model', text: string }} ChatMessage */
/** @typedef {{ width: number, height: number }} WindowSize */
/** @typedef {{ x: number, y: number }} WindowPosition */

/**
 * Bảng màu tĩnh chống Tailwind JIT purge trên bản build Production.
 * @type {Record<string, { headerBg: string, headerText: string, userBubble: string, sendBtn: string, ringFocus: string }>}
 */
const CHAT_MODAL_THEMES = {
  sky: {
    headerBg: 'bg-sky-50',
    headerText: 'text-sky-700',
    userBubble: 'bg-sky-600 text-white',
    sendBtn: 'bg-sky-600 hover:bg-sky-700',
    ringFocus: 'focus:ring-sky-200 focus:border-sky-400'
  },
  red: {
    headerBg: 'bg-red-50',
    headerText: 'text-red-700',
    userBubble: 'bg-red-600 text-white',
    sendBtn: 'bg-red-600 hover:bg-red-700',
    ringFocus: 'focus:ring-red-200 focus:border-red-400'
  },
  blue: {
    headerBg: 'bg-blue-50',
    headerText: 'text-blue-700',
    userBubble: 'bg-blue-600 text-white',
    sendBtn: 'bg-blue-600 hover:bg-blue-700',
    ringFocus: 'focus:ring-blue-200 focus:border-blue-400'
  },
  indigo: {
    headerBg: 'bg-indigo-50',
    headerText: 'text-indigo-700',
    userBubble: 'bg-indigo-600 text-white',
    sendBtn: 'bg-indigo-600 hover:bg-indigo-700',
    ringFocus: 'focus:ring-indigo-200 focus:border-indigo-400'
  },
  emerald: {
    headerBg: 'bg-emerald-50',
    headerText: 'text-emerald-700',
    userBubble: 'bg-emerald-600 text-white',
    sendBtn: 'bg-emerald-600 hover:bg-emerald-700',
    ringFocus: 'focus:ring-emerald-200 focus:border-emerald-400'
  },
  purple: {
    headerBg: 'bg-purple-50',
    headerText: 'text-purple-700',
    userBubble: 'bg-purple-600 text-white',
    sendBtn: 'bg-purple-600 hover:bg-purple-700',
    ringFocus: 'focus:ring-purple-200 focus:border-purple-400'
  },
  amber: {
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-700',
    userBubble: 'bg-amber-600 text-white',
    sendBtn: 'bg-amber-600 hover:bg-amber-700',
    ringFocus: 'focus:ring-amber-200 focus:border-amber-400'
  },
  orange: {
    headerBg: 'bg-orange-50',
    headerText: 'text-orange-700',
    userBubble: 'bg-orange-600 text-white',
    sendBtn: 'bg-orange-600 hover:bg-orange-700',
    ringFocus: 'focus:ring-orange-200 focus:border-orange-400'
  },
  pink: {
    headerBg: 'bg-pink-50',
    headerText: 'text-pink-700',
    userBubble: 'bg-pink-600 text-white',
    sendBtn: 'bg-pink-600 hover:bg-pink-700',
    ringFocus: 'focus:ring-pink-200 focus:border-pink-400'
  },
  slate: {
    headerBg: 'bg-slate-100',
    headerText: 'text-slate-700',
    userBubble: 'bg-slate-700 text-white',
    sendBtn: 'bg-slate-700 hover:bg-slate-800',
    ringFocus: 'focus:ring-slate-200 focus:border-slate-400'
  }
};

/**
 * Tạo danh sách tin nhắn chào mừng mặc định.
 * @returns {ChatMessage[]}
 */
const createInitialMessages = () => [
  {
    id: 'init',
    role: 'model',
    text: 'Xin chào! Tôi là trợ lý AI của Flashcard Lite. Tôi có thể giúp gì cho việc học của bạn hôm nay?'
  }
];

/**
 * Trích xuất thông điệp lỗi an toàn từ unknown (0 lỗi ts(18046)).
 * @param {unknown} err
 * @returns {string}
 */
const getErrorMessage = (err) => {
  if (!err) return 'Không thể kết nối đến AI.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (
    typeof err === 'object' &&
    'message' in err &&
    typeof /** @type {any} */ (err).message === 'string'
  ) {
    return /** @type {any} */ (err).message;
  }
  return String(err);
};

/**
 * Kẹp kích thước cửa sổ an toàn trong phạm vi khung nhìn trình duyệt.
 * @param {any} rawSize
 * @returns {WindowSize}
 */
const clampWindowSize = (rawSize) => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const maxW = Math.max(MIN_WIDTH, vw - 24);
  const maxH = Math.max(MIN_HEIGHT, vh - 24);

  const w = Number(rawSize?.width);
  const h = Number(rawSize?.height);

  return {
    width: Math.max(
      MIN_WIDTH,
      Math.min(maxW, Number.isFinite(w) && w > 0 ? w : DEFAULT_SIZE.width)
    ),
    height: Math.max(
      MIN_HEIGHT,
      Math.min(maxH, Number.isFinite(h) && h > 0 ? h : DEFAULT_SIZE.height)
    )
  };
};

/**
 * Kẹp tọa độ kéo thả để thanh tiêu đề & nút Đóng luôn nằm trong màn hình.
 * @param {WindowPosition} pos
 * @param {WindowSize} size
 * @param {boolean} isMinimized
 * @returns {WindowPosition}
 */
const clampWindowPosition = (pos, size, isMinimized) => {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const effectiveHeight = isMinimized ? 56 : size.height;

  // Giữ ít nhất 120px chiều ngang và thanh tiêu đề 56px luôn nằm trong viewport
  const maxX = Math.max(0, (vw - Math.min(size.width, vw)) / 2 + size.width - 120);
  const maxY = Math.max(0, (vh - Math.min(effectiveHeight, vh)) / 2);

  return {
    x: Math.max(-maxX, Math.min(maxX, Number.isFinite(pos.x) ? pos.x : 0)),
    y: Math.max(-maxY, Math.min(maxY, Number.isFinite(pos.y) ? pos.y : 0))
  };
};

/**
 * Đọc tọa độ con trỏ an toàn cho cả chuột và cảm ứng.
 * @param {any} ev
 * @returns {{ x: number, y: number } | null}
 */
const getPointerCoords = (ev) => {
  if (!ev) return null;
  if (ev.touches && ev.touches.length > 0) {
    return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }
  if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
    return { x: ev.clientX, y: ev.clientY };
  }
  return null;
};

/**
 * Đọc lịch sử chat an toàn từ localStorage và kiểm duyệt cấu trúc.
 * @returns {ChatMessage[]}
 */
const loadSavedMessages = () => {
  const saved = Utils.safeJsonParse('fc_ai_chat_history', null);
  if (!Array.isArray(saved) || saved.length === 0) {
    return createInitialMessages();
  }
  const sanitized = saved
    .filter((m) => m && typeof m === 'object' && typeof m.text === 'string')
    .map((m, idx) => ({
      id: m.id ?? `msg_${idx}`,
      role: /** @type {'user' | 'model'} */ (m.role === 'user' ? 'user' : 'model'),
      text: String(m.text)
    }))
    .slice(-MAX_CHAT_MESSAGES);

  return sanitized.length > 0 ? sanitized : createInitialMessages();
};

/**
 * Phân tích định dạng inline Markdown thành mảng React nodes thuần (0% XSS).
 * Hỗ trợ: `code`, **bold**, *italic*.
 * @param {string} line
 * @param {boolean} isUser
 * @param {string} keyPrefix
 * @returns {React.ReactNode[]}
 */
const renderInlineMarkdown = (line, isUser, keyPrefix) => {
  if (!line) return [];
  const tokenRegex = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  /** @type {React.ReactNode[]} */
  const nodes = [];
  let lastIndex = 0;
  let match = tokenRegex.exec(line);
  let partIdx = 0;

  while (match !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}_${partIdx++}`;

    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      nodes.push(
        <code
          key={key}
          className={
            isUser
              ? 'bg-white/20 text-white px-1.5 py-0.5 rounded font-mono text-xs'
              : 'bg-gray-100 text-gray-800 border border-gray-200 px-1.5 py-0.5 rounded font-mono text-xs'
          }
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      token.startsWith('**') &&
      token.endsWith('**') &&
      token.length >= 4
    ) {
      nodes.push(
        <strong key={key} className="font-bold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (
      token.startsWith('*') &&
      token.endsWith('*') &&
      token.length >= 2
    ) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
    match = tokenRegex.exec(line);
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
};

/**
 * Render Markdown thuần bằng React nodes (hỗ trợ Bullet List, xuống dòng, Bold/Italic/Code, 0% XSS).
 * @param {string} text
 * @param {boolean} isUser
 * @returns {React.ReactNode}
 */
const renderMarkdown = (text, isUser) => {
  if (!text) return null;
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');

  return (
    <div className="space-y-1 break-words">
      {lines.map((line, lineIdx) => {
        const bulletMatch = line.match(/^\s*([-*•])\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div
              key={`ln_${lineIdx}`}
              className="flex items-start gap-2 pl-1 leading-relaxed"
            >
              <span
                className={`mt-0.5 font-bold select-none ${
                  isUser ? 'text-white/80' : 'text-gray-400'
                }`}
              >
                •
              </span>
              <span className="flex-1">
                {renderInlineMarkdown(bulletMatch[2], isUser, `b_${lineIdx}`)}
              </span>
            </div>
          );
        }

        if (!line.trim()) {
          return <div key={`ln_${lineIdx}`} className="h-1.5" />;
        }

        return (
          <div key={`ln_${lineIdx}`} className="leading-relaxed">
            {renderInlineMarkdown(line, isUser, `p_${lineIdx}`)}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Cửa sổ Trợ lý AI Chat Đa nhiệm (AiChatModal)
 * Hỗ trợ kéo thả (Drag), co giãn (Resize), thu nhỏ/phóng to (Minimize/Maximize)
 * và lưu trữ lịch sử trò chuyện cục bộ an toàn.
 *
 * @param {{
 *   isOpen?: boolean,
 *   onClose?: () => void,
 *   apiKey?: string,
 *   lang?: string,
 *   t?: (key: string) => string,
 *   mainColor?: string,
 *   showToast?: (msg: string, type?: string) => void
 * }} props
 */
export const AiChatModal = ({
  isOpen = false,
  onClose = undefined,
  apiKey = '',
  lang = 'en',
  t = (k) => k,
  mainColor = 'sky',
  showToast = undefined
}) => {
  const safeLang = lang === 'zh' || lang === 'cn' ? 'zh' : 'en';
  const theme = CHAT_MODAL_THEMES[mainColor] || CHAT_MODAL_THEMES.sky;

  // --- 1. STATE & REFS ---
  const [messages, setMessages] = useState(loadSavedMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // State kích thước cửa sổ có kẹp biên viewport
  const [size, setSize] = useState(() => {
    const savedSize = Utils.safeJsonParse('fc_aichat_size', DEFAULT_SIZE);
    return clampWindowSize(savedSize);
  });

  // State điều khiển cửa sổ (Windows Controls)
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  /** @type {[({ position: WindowPosition, size: WindowSize } | null), React.Dispatch<React.SetStateAction<{ position: WindowPosition, size: WindowSize } | null>>]} */
  const [preMaxGeometry, setPreMaxGeometry] = useState(
    /** @type {{ position: WindowPosition, size: WindowSize } | null} */ (null)
  );
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Refs an toàn StrictMode & chống Stale Closure
  const isMountedRef = useRef(true);
  const isSendingRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const isMinimizedRef = useRef(isMinimized);
  isMinimizedRef.current = isMinimized;

  /** @type {React.MutableRefObject<HTMLDivElement | null>} */
  const messagesEndRef = useRef(null);
  /** @type {React.MutableRefObject<HTMLTextAreaElement | null>} */
  const inputRef = useRef(null);
  /** @type {React.MutableRefObject<ReturnType<typeof setTimeout> | null>} */
  const focusTimerRef = useRef(null);
  /** @type {React.MutableRefObject<(() => void) | null>} */
  const activeDocCleanupRef = useRef(null);
  const backdropMouseDownRef = useRef(false);

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

  /**
   * Thông báo an toàn ưu tiên prop showToast, dự phòng globalShowToast.
   */
  const notify = useCallback(
    /**
     * @param {string} msg
     * @param {string} [type='info']
     */
    (msg, type = 'info') => {
      if (typeof showToast === 'function') {
        showToast(msg, type);
      } else if (
        typeof window !== 'undefined' &&
        typeof /** @type {any} */ (window).globalShowToast === 'function'
      ) {
        /** @type {any} */ (window).globalShowToast(msg, type);
      } else {
        console.log(`[Toast - ${type}]:`, msg);
      }
    },
    [showToast]
  );

  // Dọn sạch mọi document listener đang hoạt động (Drag/Resize)
  const cleanupActiveDocListeners = useCallback(() => {
    dragRef.current.isDragging = false;
    resizeRef.current.isResizing = false;
    if (activeDocCleanupRef.current) {
      activeDocCleanupRef.current();
      activeDocCleanupRef.current = null;
    }
  }, []);

  // --- 2. EFFECTS ---
  // Theo dõi vòng đời mount/unmount chuẩn React 18 StrictMode
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupActiveDocListeners();
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [cleanupActiveDocListeners]);

  // Dọn listener & xác nhận xóa khi đóng Modal; kẹp biên lại khi mở Modal
  useEffect(() => {
    if (!isOpen) {
      cleanupActiveDocListeners();
      setShowClearConfirm(false);
      backdropMouseDownRef.current = false;
      return;
    }
    setSize((prev) => clampWindowSize(prev));
    setPosition((prev) =>
      clampWindowPosition(prev, sizeRef.current, isMinimizedRef.current)
    );
  }, [isOpen, cleanupActiveDocListeners]);

  // Tự kẹp biên khi người dùng đổi kích thước cửa sổ trình duyệt / xoay màn hình
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const handleViewportResize = () => {
      setSize((prev) => {
        const clamped = clampWindowSize(prev);
        setPosition((prevPos) =>
          clampWindowPosition(prevPos, clamped, isMinimizedRef.current)
        );
        return clamped;
      });
    };
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [isOpen]);

  // Phím Escape đóng Modal có bảo vệ bộ gõ IME Tiếng Trung/Việt
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    /** @param {KeyboardEvent} e */
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !e.isComposing) {
        if (showClearConfirm) {
          setShowClearConfirm(false);
        } else if (typeof onClose === 'function') {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showClearConfirm]);

  // Lưu lịch sử chat (cắt trần 50 tin) qua Utils.safeLocalStorageSet & chỉ scroll khi đang mở
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    const trimmedMessages = messages.slice(-MAX_CHAT_MESSAGES);
    Utils.safeLocalStorageSet('fc_ai_chat_history', trimmedMessages);
  }, [messages, isOpen, isMinimized]);

  // Lưu kích thước cửa sổ qua Utils.safeLocalStorageSet
  useEffect(() => {
    if (!isMaximized && !isMinimized) {
      Utils.safeLocalStorageSet('fc_aichat_size', size);
    }
  }, [size, isMaximized, isMinimized]);

  // Focus vào ô nhập khi mở (có dọn sạch timer)
  useEffect(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (isOpen && !isMinimized) {
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        inputRef.current?.focus();
      }, 100);
    }
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [isOpen, isMinimized]);

  // --- 3. LOGIC XỬ LÝ CHAT ---
  const handleSend = useCallback(async () => {
    const userText = input.trim();
    if (!userText || isSendingRef.current) return;

    // [M4] Quét API Key đủ 4 tầng (prop -> active key -> paid key -> key pool)
    const activeApiKey = resolveActiveApiKey(apiKey);
    if (!activeApiKey) {
      notify('Vui lòng nhập API Key trong Cài đặt trước!', 'warning');
      return;
    }

    const historySnapshot = messagesRef.current.slice(-10);
    /** @type {ChatMessage} */
    const newMessage = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      text: userText
    };

    isSendingRef.current = true;
    setMessages((prev) => [...prev, newMessage].slice(-MAX_CHAT_MESSAGES));
    setInput('');
    setIsSending(true);

    try {
      const historyContext = historySnapshot
        .map((m) => `${m.role === 'user' ? 'User' : 'Model'}: ${m.text}`)
        .join('\n');

      // [M2] Thanh trừng nhánh 'vi' cũ: chỉ còn Tiếng Trung ('zh') hoặc Tiếng Anh ('en')
      const targetLangLabel = safeLang === 'zh' ? 'Tiếng Trung' : 'Tiếng Anh';
      const systemPrompt = `Bạn là trợ lý ảo hữu ích cho ứng dụng học từ vựng Flashcard Lite.
Ngôn ngữ học tập hiện tại của người dùng là: ${targetLangLabel}.
QUY TẮC GIAO TIẾP QUAN TRỌNG:
1. LUÔN LUÔN trả lời và giải thích bằng TIẾNG VIỆT (Vietnamese), trừ khi người dùng yêu cầu dịch sang ngôn ngữ khác hoặc yêu cầu cụ thể khác.
2. Nếu người dùng hỏi về từ vựng, hãy giải thích nghĩa, cách dùng và ví dụ.
3. Trả lời ngắn gọn, súc tích, thân thiện.
Hỗ trợ định dạng Markdown nhẹ (Bold, Italic, List).`;

      const fullPrompt = `${systemPrompt}\n\nLịch sử chat:\n${historyContext}\n\nUser: ${userText}\nModel:`;

      if (typeof callGeminiApi !== 'function') {
        throw new Error('Dịch vụ kết nối AI chưa sẵn sàng.');
      }
/** @type {any} */
      const result = await callGeminiApi(fullPrompt, null, activeApiKey);
      const replyText =
        typeof result === 'string'
          ? result.trim()
          : typeof result?.text === 'string'
            ? result.text.trim()
            : '';

      if (!isMountedRef.current) return;

      /** @type {ChatMessage} */
      const aiMessage = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'model',
        text: replyText || 'Xin lỗi, tôi không thể trả lời lúc này.'
      };

      setMessages((prev) => [...prev, aiMessage].slice(-MAX_CHAT_MESSAGES));
    } catch (error) {
      console.error('Chat Error:', getErrorMessage(error));
      if (!isMountedRef.current) return;
      /** @type {ChatMessage} */
      const errMessage = {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'model',
        text: `⚠️ Lỗi: ${getErrorMessage(error)}`
      };
      setMessages((prev) => [...prev, errMessage].slice(-MAX_CHAT_MESSAGES));
    } finally {
      isSendingRef.current = false;
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  }, [input, apiKey, safeLang, notify]);

  const confirmClearHistory = useCallback(() => {
    setMessages([
      {
        id: `clear_${Date.now()}`,
        role: 'model',
        text: 'Lịch sử đã được xóa. Chúng ta bắt đầu lại nhé!'
      }
    ]);
    setShowClearConfirm(false);
    notify('Đã xóa lịch sử trò chuyện!', 'info');
  }, [notify]);

  // --- 4. LOGIC CỬA SỔ (WINDOWS CONTROLS) ---
  const handleMaximizeToggle = useCallback(() => {
    setIsMinimized(false);
    setIsMaximized((prevMax) => {
      if (!prevMax) {
        setPreMaxGeometry({ position: { ...position }, size: { ...size } });
        setPosition({ x: 0, y: 0 });
        return true;
      }
      if (preMaxGeometry) {
        const clampedSize = clampWindowSize(preMaxGeometry.size);
        setSize(clampedSize);
        setPosition(
          clampWindowPosition(preMaxGeometry.position, clampedSize, false)
        );
      }
      return false;
    });
  }, [position, size, preMaxGeometry]);

  const handleMinimizeToggle = useCallback(() => {
    setIsMinimized((prevMin) => {
      const nextMin = !prevMin;
      if (isMaximized && nextMin) {
        setIsMaximized(false);
        if (preMaxGeometry) {
          const clampedSize = clampWindowSize(preMaxGeometry.size);
          setSize(clampedSize);
          setPosition(
            clampWindowPosition(preMaxGeometry.position, clampedSize, true)
          );
        }
      }
      return nextMin;
    });
  }, [isMaximized, preMaxGeometry]);

  // --- 5. LOGIC KÉO THẢ (DRAG) CÓ DỌN LISTENER & KẸP BIÊN ---
  /** @param {any} e */
  const handleMouseDown = (e) => {
    if (isMaximized) return;
    const targetEl = e?.target;
    if (
      targetEl &&
      typeof targetEl.closest === 'function' &&
      (targetEl.closest('button') ||
        targetEl.closest('input') ||
        targetEl.closest('.no-drag'))
    ) {
      return;
    }

    const coords = getPointerCoords(e);
    if (!coords) return;

    cleanupActiveDocListeners();

    dragRef.current = {
      isDragging: true,
      startX: coords.x,
      startY: coords.y,
      initialX: position.x,
      initialY: position.y
    };

    /** @param {any} ev */
    const move = (ev) => {
      if (!dragRef.current.isDragging) return;
      if (ev.cancelable) ev.preventDefault();
      const pt = getPointerCoords(ev);
      if (!pt) return;
      const dx = pt.x - dragRef.current.startX;
      const dy = pt.y - dragRef.current.startY;
      setPosition(
        clampWindowPosition(
          {
            x: dragRef.current.initialX + dx,
            y: dragRef.current.initialY + dy
          },
          sizeRef.current,
          isMinimizedRef.current
        )
      );
    };

    const up = () => {
      cleanupActiveDocListeners();
    };

    const removeListeners = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
    };

    activeDocCleanupRef.current = removeListeners;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
  };

  // --- 6. LOGIC KÉO GIÃN (RESIZE) CÓ DỌN LISTENER & KẸP BIÊN ---
  /** @param {any} e */
  const handleResizeMouseDown = (e) => {
    if (isMaximized || isMinimized) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const coords = getPointerCoords(e);
    if (!coords) return;

    cleanupActiveDocListeners();

    resizeRef.current = {
      isResizing: true,
      startX: coords.x,
      startY: coords.y,
      startWidth: size.width,
      startHeight: size.height
    };

    /** @param {any} ev */
    const move = (ev) => {
      if (!resizeRef.current.isResizing) return;
      if (ev.cancelable) ev.preventDefault();
      const pt = getPointerCoords(ev);
      if (!pt) return;
      const dx = pt.x - resizeRef.current.startX;
      const dy = pt.y - resizeRef.current.startY;

      const nextSize = clampWindowSize({
        width: resizeRef.current.startWidth + dx,
        height: resizeRef.current.startHeight + dy
      });
      setSize(nextSize);
    };

    const up = () => {
      cleanupActiveDocListeners();
    };

    const removeListeners = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
    };

    activeDocCleanupRef.current = removeListeners;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
  };

  // Khóa Backdrop 2 nhịp: chỉ đóng khi nhấn & thả chuột trái cùng nằm trên lớp nền
  /** @param {React.MouseEvent<HTMLDivElement>} e */
  const handleBackdropMouseDown = (e) => {
    backdropMouseDownRef.current =
      e.button === 0 && e.target === e.currentTarget;
  };

  /** @param {React.MouseEvent<HTMLDivElement>} e */
  const handleBackdropClick = (e) => {
    if (
      backdropMouseDownRef.current &&
      e.target === e.currentTarget &&
      typeof onClose === 'function'
    ) {
      onClose();
    }
    backdropMouseDownRef.current = false;
  };

  if (!isOpen) return null;

  const SparklesIcon = Icons?.Sparkles;
  const TrashIcon = Icons?.Trash2;
  const PlayIcon = Icons?.Play;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
      data-i18n-ready={typeof t === 'function' ? '1' : '0'}
    >
      {/* Overlay click 2 nhịp chống đóng nhầm khi bôi đen văn bản */}
      <div
        className="absolute inset-0 bg-transparent pointer-events-auto"
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-modal-title"
        className={`bg-white/95 backdrop-blur-md shadow-2xl flex flex-col z-10 overflow-hidden pointer-events-auto border border-gray-200 transition-shadow duration-200 ease-out relative ${
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
          className={`flex justify-between items-center p-3 border-b ${theme.headerBg} select-none transition-colors ${
            isMaximized ? 'cursor-default' : 'cursor-move active:bg-gray-100'
          }`}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onDoubleClick={handleMaximizeToggle}
        >
          <div
            id="ai-chat-modal-title"
            className={`flex items-center gap-2 ${theme.headerText} font-bold pointer-events-none`}
          >
            {SparklesIcon ? <SparklesIcon size={20} /> : null}
            <span>AI Chat Assistant</span>
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white/70 border border-current/20">
              {safeLang === 'zh' ? 'ZH' : 'EN'}
            </span>
          </div>

          <div className="flex gap-1.5 items-center no-drag">
            <button
              type="button"
              onClick={() => setShowClearConfirm((prev) => !prev)}
              className={`p-1.5 rounded-lg transition-colors mr-1 ${
                showClearConfirm
                  ? 'text-red-600 bg-red-100'
                  : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
              }`}
              title="Xóa lịch sử"
              aria-label="Xóa lịch sử trò chuyện"
            >
              {TrashIcon ? <TrashIcon size={16} /> : null}
            </button>

            <div className="w-px h-4 bg-gray-300 mx-1" />

            {/* Nút Minimize */}
            <button
              type="button"
              onClick={handleMinimizeToggle}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              title={isMinimized ? 'Mở rộng' : 'Thu nhỏ'}
              aria-label={isMinimized ? 'Mở rộng cửa sổ chat' : 'Thu nhỏ cửa sổ chat'}
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
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {/* Nút Maximize / Restore */}
            <button
              type="button"
              onClick={handleMaximizeToggle}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
              title={isMaximized ? 'Phục hồi' : 'Phóng to'}
              aria-label={isMaximized ? 'Phục hồi kích thước cửa sổ' : 'Phóng to toàn màn hình'}
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
                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                  <path d="M9 4v16" />
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
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
              )}
            </button>

            {/* Nút Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
              title="Đóng"
              aria-label="Đóng cửa sổ AI Chat"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
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
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 bg-white text-gray-600 rounded border border-gray-200 font-bold hover:bg-gray-100"
              >
                Hủy
              </button>
              <button
                type="button"
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
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm leading-relaxed select-text cursor-text ${
                        isUser
                          ? `${theme.userBubble} rounded-br-none`
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                      }`}
                    >
                      {renderMarkdown(msg.text, isUser)}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex gap-1 items-center">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    />
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
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent?.isComposing
                    ) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Hỏi tôi bất cứ điều gì..."
                  className={`flex-1 p-3 border rounded-xl focus:ring-2 ${theme.ringFocus} outline-none resize-none bg-gray-50 text-sm max-h-24 custom-scrollbar select-text cursor-text`}
                  rows={1}
                  style={{ minHeight: '44px' }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  aria-label="Gửi tin nhắn"
                  className={`p-3 rounded-xl ${theme.sendBtn} text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex-shrink-0 h-[44px] w-[44px] flex items-center justify-center`}
                >
                  {isSending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : PlayIcon ? (
                    <PlayIcon size={20} className="ml-0.5" />
                  ) : null}
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
  /** @type {any} */ (window).AiChatModal = AiChatModal;
}

export default AiChatModal;