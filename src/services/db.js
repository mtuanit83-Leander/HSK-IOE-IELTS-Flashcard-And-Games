/**
 * @file src/services/db.js
 * @description Lõi Cơ sở dữ liệu IndexedDB siêu tốc (FcDB) và cơ chế khóa đa luồng (Atomic Lock).
 * @origin Tầng 2 - Block 2.1d (Database & Memory Sync)
 */

// Biến nội bộ quản lý khóa luồng, thay thế cho window.__retryMutexLock
let __retryMutexLock = false;

// ============================================================================
// 1. KHỞI TẠO ĐỘNG CƠ CSDL IndexedDB (FcDB)
// ============================================================================
export const FcDB = {
  dbName: 'FlashcardLiteDB',
  defaultStore: 'keyvaluepairs',
  stores: ['keyvaluepairs', 'exam_sessions', 'mock_contexts'],
  db: null,
  
  init: function() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve();
        return;
      }
      const request = indexedDB.open(this.dbName, 2);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        });
      };
      
      request.onsuccess = async (event) => {
        this.db = event.target.result;
        
        // MIGRATION SCRIPT: Dọn rác LocalStorage cũ sang IndexedDB
        try {
          const oldHarvestPoolStr = localStorage.getItem('fc_ai_harvest_pool');
          if (oldHarvestPoolStr) {
            const oldPool = JSON.parse(oldHarvestPoolStr);
            await this.set('fc_ai_harvest_pool', oldPool);
            localStorage.removeItem('fc_ai_harvest_pool');
            console.log('[FcDB] Migrated Harvest Pool to IndexedDB successfully.');
          }
          
          const oldRetryBagStr = localStorage.getItem('fc_global_retry_bag');
          if (oldRetryBagStr) {
            const oldBag = JSON.parse(oldRetryBagStr);
            // Ép túi nháp lỗi thời sang vùng Tiếng Anh để triệt tiêu lỗi hiển thị nhầm vào game Tiếng Trung
            await this.set('fc_global_retry_bag_en', oldBag);
            localStorage.removeItem('fc_global_retry_bag');
            console.log('[FcDB] Migrated Legacy Global Retry Bag to English Partition successfully.');
          }
          
          const keysToMigrate = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('fc_notebook_') || key.startsWith('fc_mastered_') || key.startsWith('fc_incorrect_list_') || key.startsWith('fc_global_retry_bag_'))) {
              keysToMigrate.push(key);
            }
          }
          
          for (const key of keysToMigrate) {
            const oldDataStr = localStorage.getItem(key);
            if (oldDataStr) {
              try {
                const parsedData = JSON.parse(oldDataStr);
                await this.set(key, parsedData);
                localStorage.removeItem(key);
                console.log(`[FcDB] Migrated ${key} to IndexedDB successfully.`);
              } catch(err) {
                console.warn(`[FcDB] Failed to parse/migrate ${key}:`, err);
              }
            }
          }
        } catch(e) {
          console.error('[FcDB] Migration Error:', e);
        }
        
        resolve();
      };
      
      request.onerror = (event) => {
        console.error('[FcDB] Init Error:', event.target.error);
        reject(event.target.error);
      };
    });
  },
  
  get: function(key, customStore = null) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const targetStore = customStore || this.defaultStore;
      const transaction = this.db.transaction([targetStore], 'readonly');
      const store = transaction.objectStore(targetStore);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },
  
  set: function(key, value, customStore = null) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const targetStore = customStore || this.defaultStore;
      const transaction = this.db.transaction([targetStore], 'readwrite');
      const store = transaction.objectStore(targetStore);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },
  
  remove: function(key, customStore = null) {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const targetStore = customStore || this.defaultStore;
      const transaction = this.db.transaction([targetStore], 'readwrite');
      const store = transaction.objectStore(targetStore);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }
};

// ============================================================================
// 2. ĐỘNG CƠ RÚT THẺ CÓ KHÓA NGUYÊN TỬ (ATOMIC RETRY PULLER)
// Xử lý triệt để lỗi bốc trùng 1 thẻ lỗi nhiều lần khi QueueEngine chạy đa luồng.
// ============================================================================
export const pullRetryCardWithLock = (gameType, retryBagObject, lang = 'en') => {
  // 1. Kiểm tra khóa đa luồng
  if (__retryMutexLock) return null;
  
  // 2. Kiểm tra tính hợp lệ của túi nháp
  if (!retryBagObject || !retryBagObject[gameType] || retryBagObject[gameType].length === 0) return null;
  
  // 3. Đổ xúc xắc 30% (Chỉ lấy lại thẻ sai trong 30% trường hợp để tránh gây nản)
  if (Math.random() >= 0.3) return null;
  
  // 4. KHÓA LUỒNG VÀ THỰC THI RÚT THẺ
  __retryMutexLock = true;
  
  try {
    // [SCHEMA-AGNOSTIC VALIDATOR] Lọc thẻ lỗi hợp lệ theo từng Game
    const validCards = retryBagObject[gameType].filter(c => {
      if (!c) return false;
      switch(gameType) {
        case 'oddoneout': return c.words && c.oddWord;
        case 'fillblank': return c.targetWord && c.displaySentence;
        case 'spotmistake': return c.wrongSentence && c.correction;
        case 'pronunciation': return c.term && c.options && c.options.length === 4;
        case 'listening': return c.audioScript && c.options;
        case 'reading': return c.passageContext && c.questionText;
        default: return c.term && c.term.trim() !== '' && c.definition && c.definition.trim() !== '';
      }
    });
    
    if (validCards.length === 0) {
      __retryMutexLock = false;
      return null;
    }
    
    // Bốc thẻ ngẫu nhiên
    const randIdx = Math.floor(Math.random() * validCards.length);
    const selectedCard = validCards[randIdx];
    
    // Tìm Index gốc để xóa bằng thuật toán nhận diện đa cấu trúc
    const actualIndex = retryBagObject[gameType].findIndex(c => {
      if(!c) return false;
      switch(gameType) {
        case 'oddoneout': return c.oddWord === selectedCard.oddWord;
        case 'fillblank': return c.targetWord === selectedCard.targetWord;
        case 'spotmistake': return c.wrongSentence === selectedCard.wrongSentence;
        case 'pronunciation': return c.term === selectedCard.term && c.options && c.options.length === 4;
        case 'listening': return c.audioScript === selectedCard.audioScript;
        case 'reading': return c.questionText === selectedCard.questionText && c.passageContext === selectedCard.passageContext;
        default: return c.term === selectedCard.term;
      }
    });
    
    if (actualIndex > -1) {
      // Rút vĩnh viễn khỏi túi nháp RAM
      retryBagObject[gameType].splice(actualIndex, 1);
      
      // Ép lưu xuống DB ngầm để đồng bộ chéo theo ĐÚNG phân vùng ngôn ngữ
      const safeLang = lang || 'en';
      FcDB.set('fc_global_retry_bag_' + safeLang, retryBagObject).catch(() => {});
    }
    
    // Tự động mở khóa sau 50ms (Nhường đường cho các vi luồng async khác)
    setTimeout(() => { __retryMutexLock = false; }, 50);
    
    return selectedCard;
  } catch (e) {
    console.error("Atomic Lock Error:", e);
    __retryMutexLock = false;
    return null;
  }
};