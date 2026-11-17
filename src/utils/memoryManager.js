import { safeJsonParse, safeLocalStorageSet, Utils } from './helpers.js';

/**
 * Hệ thống Trí nhớ AI trên RAM (Hybrid Memory Buffer)
 * Giúp triệt tiêu hoàn toàn nút thắt I/O ổ cứng gây giật lag UI khi AI nạp đề liên tục.
 */
export const AiMemoryManager = {
  _buffer: null,
  _saveTimeout: null,
  _isDirty: false,
  _hooksInitialized: false,

  /**
   * Khởi tạo bộ đệm trên RAM từ LocalStorage và gắn các sự kiện bảo vệ dữ liệu
   */
  init: function () {
    if (this._buffer === null) {
      this._buffer = safeJsonParse('fc_ai_memory', []);
      this._setupHooks();
    }
  },

  /**
   * Lấy danh sách từ vựng/câu văn đã sinh trong trí nhớ AI
   */
  get: function () {
    this.init();
    return this._buffer;
  },

  /**
   * Thêm một hoặc nhiều mục từ mới vào bộ nhớ đệm (Giới hạn trượt 400 mục gần nhất)
   */
  add: function (items) {
    this.init();
    let hasChanges = false;
    const itemsToAdd = Array.isArray(items) ? items : [items];

    itemsToAdd.forEach((item) => {
      if (item && !this._buffer.includes(item)) {
        this._buffer.push(item);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      if (this._buffer.length > 400) {
        this._buffer = this._buffer.slice(-400);
      }
      this._isDirty = true;
      this._scheduleSave();
    }
  },

  /**
   * Ghi đè toàn bộ bộ nhớ đệm bằng một mảng mới
   */
  replace: function (newArray) {
    this.init();
    this._buffer = Array.isArray(newArray) ? newArray : [];
    if (this._buffer.length > 400) {
      this._buffer = this._buffer.slice(-400);
    }
    this._isDirty = true;
    this._scheduleSave();
  },

  /**
   * Xóa trắng bộ nhớ đệm AI trên cả RAM và LocalStorage (Dùng khi chuyển ngôn ngữ hoặc Reset)
   */
  clear: function () {
    this._buffer = [];
    this._isDirty = false;
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    try {
      localStorage.removeItem('fc_ai_memory');
    } catch (e) {
      console.warn('[AiMemoryManager] Clear Storage Error:', e);
    }
  },

  /**
   * Lên lịch ghi xuống LocalStorage sau 3 giây (Debounce đợi AI xả đạn xong mới ghi)
   */
  _scheduleSave: function () {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._flush();
    }, 3000);
  },

  /**
   * Ghi ngay lập tức dữ liệu từ RAM xuống LocalStorage
   */
  _flush: function () {
    if (this._isDirty && this._buffer !== null) {
      safeLocalStorageSet('fc_ai_memory', this._buffer);
      this._isDirty = false;
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = null;
      }
    }
  },

  /**
   * Thiết lập lưới an toàn tự động lưu dữ liệu khi người dùng ẩn ứng dụng hoặc đóng Tab
   */
  _setupHooks: function () {
    if (this._hooksInitialized || typeof window === 'undefined') return;
    this._hooksInitialized = true;

    const flushHandler = () => this._flush();

    // Lưới an toàn 1: Vuốt ẩn App trên Mobile (iOS/Android)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushHandler();
      });
    }

    // Lưới an toàn 2: Chuyển trang hoặc đóng Tab trên Desktop
    window.addEventListener('pagehide', flushHandler);
    window.addEventListener('beforeunload', flushHandler);
  }
};

// Gắn trực tiếp vào đối tượng Utils theo luồng 1 chiều để tương thích ngược với các mô-đun gọi Utils.AiMemoryManager
Utils.AiMemoryManager = AiMemoryManager;

export default AiMemoryManager;