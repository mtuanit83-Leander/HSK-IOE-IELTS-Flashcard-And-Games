// ============================================================================
// FILE 13/85: src/services/db.js
// NGUỒN GỐC: tang_2.js (Block 2.1d - Database & Memory Sync)
// PHIÊN BẢN: Ver 1.1
// NGÀY GIỜ NÂNG CẤP: 23/11/2026 - 22:36 (GMT+7)
// NHIỆM VỤ: Khởi tạo CSDL IndexedDB (FcDB) siêu tốc với lõi giao dịch bền vững
//           (transaction.oncomplete), đóng kín cửa sổ Race khởi động/Migration
//           (chỉ gán this.db sau Migration + cờ closedDuringInit), tự phục hồi
//           1 nhịp khi kết nối bị đóng đột ngột (onclose / InvalidStateError),
//           Migration độc lập từng khóa chống ghi đè ngược & bỏ qua khóa '_vi',
//           gắn cầu nối window.FcDB, alias del() đồng nhất, tương thích jsdom
//           và vận hành Động cơ Khóa nguyên tử Đa luồng (Atomic Retry Puller).
// ============================================================================

// Cờ khóa đa luồng cấp mô-đun chống xung đột khi nhiều luồng QueueEngine rút thẻ cùng lúc
let retryMutexLock = false;

/**
 * Kiểm tra lỗi kết nối IndexedDB đã bị đóng đột ngột (InvalidStateError)
 * @param {any} err
 * @returns {boolean}
 */
function _isInvalidStateError(err) {
  if (!err) return false;
  if (err.name === 'InvalidStateError') return true;
  if (typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    return msg.includes('closing') || msg.includes('closed');
  }
  return false;
}

/**
 * Lõi đọc nguyên thủy trực tiếp trên IDBDatabase hiện hành
 * @param {IDBDatabase} dbInstance
 * @param {string} key
 * @param {string} storeName
 * @returns {Promise<any>}
 */
function _getRaw(dbInstance, key, storeName) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    const finishReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    try {
      const transaction = dbInstance.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => finishResolve(request.result);
      request.onerror = () =>
        finishReject(request.error || new Error('[FcDB] Get request failed'));
      transaction.onerror = () =>
        finishReject(
          transaction.error || new Error('[FcDB] Get transaction failed')
        );
      transaction.onabort = () =>
        finishReject(
          transaction.error || new Error('[FcDB] Get transaction aborted')
        );
    } catch (err) {
      finishReject(err);
    }
  });
}

/**
 * Lõi ghi nguyên thủy trực tiếp trên IDBDatabase — chỉ resolve khi transaction.oncomplete
 * (Đảm bảo commit 100% xuống đĩa trước khi người dùng hoặc E2E Test bấm F5/reload)
 * @param {IDBDatabase} dbInstance
 * @param {string} key
 * @param {any} value
 * @param {string} storeName
 * @returns {Promise<void>}
 */
function _putRaw(dbInstance, key, value, storeName) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    };
    const finishReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    try {
      const transaction = dbInstance.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value, key);

      transaction.oncomplete = () => finishResolve();
      request.onerror = () =>
        finishReject(request.error || new Error('[FcDB] Put request failed'));
      transaction.onerror = () =>
        finishReject(
          transaction.error || new Error('[FcDB] Put transaction failed')
        );
      transaction.onabort = () =>
        finishReject(
          transaction.error || new Error('[FcDB] Put transaction aborted')
        );
    } catch (err) {
      finishReject(err);
    }
  });
}

/**
 * Lõi xóa nguyên thủy trực tiếp trên IDBDatabase — chỉ resolve khi transaction.oncomplete
 * @param {IDBDatabase} dbInstance
 * @param {string} key
 * @param {string} storeName
 * @returns {Promise<void>}
 */
function _deleteRaw(dbInstance, key, storeName) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = () => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    };
    const finishReject = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    try {
      const transaction = dbInstance.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      transaction.oncomplete = () => finishResolve();
      request.onerror = () =>
        finishReject(
          request.error || new Error('[FcDB] Delete request failed')
        );
      transaction.onerror = () =>
        finishReject(
          transaction.error || new Error('[FcDB] Delete transaction failed')
        );
      transaction.onabort = () =>
        finishReject(
          transaction.error || new Error('[FcDB] Delete transaction aborted')
        );
    } catch (err) {
      finishReject(err);
    }
  });
}

/**
 * 1. ĐỘNG CƠ RÚT THẺ CÓ KHÓA NGUYÊN TỬ (ATOMIC RETRY PULLER)
 * Xử lý triệt để lỗi bốc trùng 1 thẻ lỗi nhiều lần khi QueueEngine chạy đa luồng.
 * Tích hợp Schema-Agnostic Validator siết chặt kiểu dữ liệu cho 10/10 Mini-Games,
 * xóa chính xác theo tham chiếu object (indexOf) và tự động đồng bộ xuống IndexedDB.
 * @param {string} gameType
 * @param {Record<string, any[]>} retryBagObject
 * @param {string} [lang='en']
 * @returns {any | null}
 */
export const pullRetryCardWithLock = (gameType, retryBagObject, lang = 'en') => {
  // 1. Kiểm tra khóa đa luồng
  if (retryMutexLock) return null;

  // 2. Kiểm tra tính hợp lệ của túi nháp
  if (
    !retryBagObject ||
    !Array.isArray(retryBagObject[gameType]) ||
    retryBagObject[gameType].length === 0
  ) {
    return null;
  }

  // 3. Đổ xúc xắc xác suất 30%
  if (Math.random() >= 0.3) return null;

  // 4. KHÓA LUỒNG VÀ THỰC THI RÚT THẺ
  retryMutexLock = true;
  try {
    // [SCHEMA-AGNOSTIC VALIDATOR] Lọc thẻ lỗi hợp lệ & siết chặt kiểu dữ liệu cho 10/10 Mini-Games
    const validCards = retryBagObject[gameType].filter((c) => {
      if (!c || typeof c !== 'object') return false;
      switch (gameType) {
        case 'oddoneout':
          return Array.isArray(c.words) && c.words.length > 0 && Boolean(c.oddWord);
        case 'fillblank':
          return (
            typeof c.targetWord === 'string' &&
            c.targetWord.trim() !== '' &&
            typeof c.displaySentence === 'string' &&
            c.displaySentence.trim() !== ''
          );
        case 'spotmistake':
          return (
            typeof c.wrongSentence === 'string' &&
            c.wrongSentence.trim() !== '' &&
            typeof c.correction === 'string' &&
            c.correction.trim() !== ''
          );
        case 'pronunciation':
          return (
            typeof c.term === 'string' &&
            c.term.trim() !== '' &&
            Array.isArray(c.options) &&
            c.options.length === 4
          );
        case 'listening':
          return (
            Boolean(c.audioScript) &&
            Array.isArray(c.options) &&
            c.options.length > 0
          );
        case 'reading':
          return Boolean(c.passageContext) && Boolean(c.questionText);
        default:
          return (
            typeof c.term === 'string' &&
            c.term.trim() !== '' &&
            typeof c.definition === 'string' &&
            c.definition.trim() !== ''
          );
      }
    });

    if (validCards.length === 0) {
      retryMutexLock = false;
      return null;
    }

    // Bốc thẻ ngẫu nhiên trong danh sách hợp lệ
    const randIdx = Math.floor(Math.random() * validCards.length);
    const selectedCard = validCards[randIdx];

    // Tìm Index gốc bằng tham chiếu trực tiếp để xóa chính xác tuyệt đối 100%
    const actualIndex = retryBagObject[gameType].indexOf(selectedCard);

    if (actualIndex > -1) {
      // Rút vĩnh viễn khỏi túi nháp trên RAM
      retryBagObject[gameType].splice(actualIndex, 1);

      // Đồng bộ ngầm xuống IndexedDB theo đúng phân vùng ngôn ngữ (tận dụng Auto-Init & Reconnect)
      if (FcDB && typeof FcDB.set === 'function') {
        const safeLang = lang || 'en';
        FcDB.set('fc_global_retry_bag_' + safeLang, retryBagObject).catch(
          () => {}
        );
      }
    }

    // Tự động mở khóa sau 50ms (Nhường đường cho các vi luồng async khác)
    setTimeout(() => {
      retryMutexLock = false;
    }, 50);

    return selectedCard;
  } catch (e) {
    console.error('[Atomic Lock Error]:', e);
    retryMutexLock = false;
    return null;
  }
};

/**
 * 2. ĐỘNG CƠ CƠ SỞ DỮ LIỆU INDEXEDDB (FcDB)
 * Lưu trữ bất đồng bộ dung lượng lớn cho Kho Master Data (4 kho), Sổ tay,
 * Đã thuộc, Lỗi sai, Kho thu hoạch AI và Phiên khảo thí.
 */
export const FcDB = {
  dbName: 'FlashcardLiteDB',
  defaultStore: 'keyvaluepairs',
  stores: ['keyvaluepairs', 'exam_sessions', 'mock_contexts'],
  /** @type {IDBDatabase | null} */
  db: null,
  /** @type {Promise<void> | null} */
  _initPromise: null,

  /**
   * Đảm bảo kết nối IndexedDB đã hoàn tất init + Migration trước mọi thao tác CRUD
   * @returns {Promise<IDBDatabase | null>}
   */
  _ensureReady: async function () {
    if (typeof indexedDB === 'undefined') {
      return null;
    }
    if (this._initPromise) {
      await this._initPromise;
    }
    if (!this.db) {
      await this.init();
    }
    return this.db;
  },

  /**
   * Thực thi thao tác IndexedDB với cơ chế tự mở lại kết nối 1 nhịp nếu gặp InvalidStateError
   * @param {(dbRef: IDBDatabase) => Promise<any>} operation
   * @param {any} fallbackWhenNoIndexedDB
   * @returns {Promise<any>}
   */
  _execWithReconnect: async function (operation, fallbackWhenNoIndexedDB) {
    if (typeof indexedDB === 'undefined') {
      return fallbackWhenNoIndexedDB;
    }

    const dbRef = await this._ensureReady();
    if (!dbRef) {
      throw new Error('DB not initialized');
    }

    try {
      return await operation(dbRef);
    } catch (err) {
      if (!_isInvalidStateError(err)) {
        throw err;
      }

      // Đóng an toàn kết nối đã bị trình duyệt/OS ngắt và tự phục hồi đúng 1 nhịp
      if (this.db === dbRef) {
        try {
          dbRef.close();
        } catch {
          // Bỏ qua lỗi khi đóng kết nối đã ngắt
        }
        this.db = null;
      }

      const freshDb = await this._ensureReady();
      if (!freshDb) {
        throw err;
      }
      return await operation(freshDb);
    }
  },

  /**
   * Khởi tạo kết nối IndexedDB với khóa Singleton chống chạy trùng Migration Script,
   * trì hoãn gán this.db tới sau khi Migration hoàn tất (0% cửa sổ Race).
   * @returns {Promise<void>}
   */
  init: function () {
    if (this._initPromise) {
      return this._initPromise;
    }
    if (this.db) {
      return Promise.resolve(undefined);
    }
    // Lá chắn an toàn cho môi trường không có IndexedDB (Vitest/jsdom/SSR)
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(undefined);
    }

    /** @type {Promise<void>} */
    const initPromise = new Promise((resolve, reject) => {
      /** @type {IDBOpenDBRequest} */
      let request;
      try {
        request = indexedDB.open(this.dbName, 2);
      } catch (openErr) {
        if (this._initPromise === initPromise) {
          this._initPromise = null;
        }
        console.error('[FcDB] Open Error:', openErr);
        reject(openErr);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        this.stores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });
      };

      request.onblocked = () => {
        console.warn('[FcDB] Database open blocked by another tab.');
      };

      request.onsuccess = async () => {
        const dbInstance = request.result;
        let closedDuringInit = false;

        // Tự động đóng & giải phóng kết nối nếu tab khác nâng cấp DB hoặc OS/Safari tự đóng khi ngủ sâu
        dbInstance.onversionchange = () => {
          closedDuringInit = true;
          try {
            dbInstance.close();
          } catch {
            // Bỏ qua lỗi khi đóng kết nối cũ
          }
          if (this.db === dbInstance) {
            this.db = null;
          }
        };

        dbInstance.onclose = () => {
          closedDuringInit = true;
          if (this.db === dbInstance) {
            this.db = null;
          }
        };

        /**
         * Di cư độc lập từng khóa từ LocalStorage sang IndexedDB:
         * - Có try/catch riêng cho từng khóa (không làm hủy dây chuyền các khóa còn lại)
         * - Không ghi đè ngược nếu khóa đích trong IndexedDB đã có dữ liệu mới hơn
         * - Dọn sạch khóa cũ khỏi LocalStorage để giải phóng quota 5MB
         * @param {string} sourceKey
         * @param {string} targetKey
         * @returns {Promise<void>}
         */
        const migrateSingleKey = async (sourceKey, targetKey) => {
          if (closedDuringInit) return;
          const rawStr = localStorage.getItem(sourceKey);
          if (!rawStr) return;

          try {
            const parsedData = JSON.parse(rawStr);
            const existing = await _getRaw(
              dbInstance,
              targetKey,
              this.defaultStore
            );
            if (existing === undefined || existing === null) {
              await _putRaw(
                dbInstance,
                targetKey,
                parsedData,
                this.defaultStore
              );
              console.log(
                `[FcDB] Migrated ${sourceKey} -> ${targetKey} to IndexedDB successfully.`
              );
            }
            localStorage.removeItem(sourceKey);
          } catch (err) {
            console.warn(`[FcDB] Failed to migrate ${sourceKey}:`, err);
          }
        };

        // KỊCH BẢN DI CƯ (MIGRATION SCRIPT): Chạy trực tiếp trên dbInstance TRƯỚC khi mở cổng this.db
        if (
          typeof localStorage !== 'undefined' &&
          dbInstance.objectStoreNames.contains(this.defaultStore)
        ) {
          try {
            await migrateSingleKey('fc_ai_harvest_pool', 'fc_ai_harvest_pool');
            // Ép túi nháp lỗi thời sang phân vùng Tiếng Anh để triệt tiêu lỗi hiển thị nhầm sang Tiếng Trung
            await migrateSingleKey(
              'fc_global_retry_bag',
              'fc_global_retry_bag_en'
            );

            const keysToMigrate = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (
                key &&
                !key.endsWith('_vi') &&
                (key.startsWith('fc_notebook_') ||
                  key.startsWith('fc_mastered_') ||
                  key.startsWith('fc_incorrect_list_') ||
                  key.startsWith('fc_global_retry_bag_'))
              ) {
                keysToMigrate.push(key);
              }
            }

            for (const key of keysToMigrate) {
              if (closedDuringInit) break;
              await migrateSingleKey(key, key);
            }
          } catch (e) {
            console.error('[FcDB] Migration Error:', e);
          }
        }

        // Chỉ công bố kết nối ra this.db khi toàn bộ Migration đã hoàn tất & kết nối còn mở
        if (!closedDuringInit) {
          this.db = dbInstance;
        }
        if (this._initPromise === initPromise) {
          this._initPromise = null;
        }
        resolve(undefined);
      };

      request.onerror = () => {
        if (this._initPromise === initPromise) {
          this._initPromise = null;
        }
        console.error('[FcDB] Init Error:', request.error);
        reject(request.error);
      };
    });

    this._initPromise = initPromise;
    return initPromise;
  },

  /**
   * Đọc dữ liệu theo khóa (tự động đợi init/Migration & phục hồi 1 nhịp nếu DB bị đóng)
   * @param {string} key
   * @param {string | null} [customStore]
   * @returns {Promise<any>}
   */
  get: async function (key, customStore = null) {
    const targetStore = customStore || this.defaultStore;
    return this._execWithReconnect((dbRef) => {
      if (!dbRef.objectStoreNames.contains(targetStore)) {
        return Promise.resolve(null);
      }
      return _getRaw(dbRef, key, targetStore);
    }, null);
  },

  /**
   * Ghi dữ liệu theo khóa (đảm bảo transaction.oncomplete & tự phục hồi 1 nhịp nếu DB bị đóng)
   * @param {string} key
   * @param {any} value
   * @param {string | null} [customStore]
   * @returns {Promise<void>}
   */
  set: async function (key, value, customStore = null) {
    const targetStore = customStore || this.defaultStore;
    await this._execWithReconnect((dbRef) => {
      if (!dbRef.objectStoreNames.contains(targetStore)) {
        return Promise.reject(new Error(`Store ${targetStore} does not exist`));
      }
      return _putRaw(dbRef, key, value, targetStore);
    }, undefined);
  },

  /**
   * Xóa dữ liệu theo khóa (đảm bảo transaction.oncomplete & tự phục hồi 1 nhịp nếu DB bị đóng)
   * @param {string} key
   * @param {string | null} [customStore]
   * @returns {Promise<void>}
   */
  remove: async function (key, customStore = null) {
    const targetStore = customStore || this.defaultStore;
    await this._execWithReconnect((dbRef) => {
      if (!dbRef.objectStoreNames.contains(targetStore)) {
        return Promise.resolve(undefined);
      }
      return _deleteRaw(dbRef, key, targetStore);
    }, undefined);
  },

  /**
   * Alias tương thích 100% cho các module gọi FcDB.del(key)
   * @param {string} key
   * @param {string | null} [customStore]
   * @returns {Promise<void>}
   */
  del: function (key, customStore = null) {
    return this.remove(key, customStore);
  }
};

// Gắn cầu nối toàn cục phục vụ đồng bộ chéo RAM Mirror, Playwright E2E và tương thích legacy
if (typeof window !== 'undefined') {
  window.FcDB = FcDB;
  Object.assign(window, { pullRetryCardWithLock });
}

export default FcDB;