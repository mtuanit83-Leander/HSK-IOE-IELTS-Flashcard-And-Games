/**
 * @file src/engines/queueEngine.js
 * @description Hạ tầng Điều phối Hàng đợi (Queue Infrastructure). Tách biệt hệ thống Đa luồng & Nạp đạn ngầm (Background Worker) ra khỏi Game Engine.
 * @origin Tầng 2 - Block 2.5 (QueueEngine)
 */

// Import AiFactoryEngine để hỗ trợ tính năng Zombie Killer
// (Lưu ý: Tệp này sẽ được tạo ở bước tiếp theo)
import { AiFactoryEngine } from './aiFactory';

export const QueueEngine = {
  // ĐỘNG CƠ TIÊU DIỆT THÂY MA NGẦM (ZOMBIE KILLER INJECTION)
  _triggerZombieKiller: function() {
    if (AiFactoryEngine && !window.__zombieKillerActive) {
      window.__zombieKillerActive = true;
      
      const origContext = AiFactoryEngine.forgeContext;
      const origMatrix = AiFactoryEngine.forgeMatrix;
      const origBase = AiFactoryEngine.forgeBaseCard;
      
      // Thuốc độc bóp chết mọi nỗ lực gọi AI của vòng lặp Retry
      const killSwitch = async () => { throw new DOMException("Zombies Terminated", "AbortError"); };
      
      AiFactoryEngine.forgeContext = killSwitch;
      AiFactoryEngine.forgeMatrix = killSwitch;
      AiFactoryEngine.forgeBaseCard = killSwitch;
      
      // Giải phóng phong ấn sau 1.5 giây (Đủ thời gian vắt kiệt 5 vòng lặp siêu tốc)
      setTimeout(() => {
        AiFactoryEngine.forgeContext = origContext;
        AiFactoryEngine.forgeMatrix = origMatrix;
        AiFactoryEngine.forgeBaseCard = origBase;
        window.__zombieKillerActive = false;
      }, 1500);
    }
  },

  // ĐỘNG CƠ ĐA LUỒNG (Kiến trúc Sequential Early Resolve - Boomerang Principle)
  createQueueCoordinator: function(fetchDataFn, defaultMaxConcurrent = 4) {
    let aiConfig = { loadingTime: 22, delayMs: 2500, maxAmmo: defaultMaxConcurrent };
    try {
      const cfg = JSON.parse(localStorage.getItem('fc_ai_config'));
      if (cfg) {
        if (cfg.loadingTime) aiConfig.loadingTime = cfg.loadingTime;
        if (cfg.delayMs) aiConfig.delayMs = cfg.delayMs;
        if (cfg.maxAmmo) aiConfig.maxAmmo = cfg.maxAmmo;
      }
    } catch (e) { console.warn("Lỗi đọc fc_ai_config", e); }
    
    const maxConcurrent = aiConfig.maxAmmo;
    
    if (window.__currentGameAbortController) {
      try { window.__currentGameAbortController.abort("New coordinator initialized"); } catch(e) {}
    }
    
    const abortCtrl = new AbortController();
    window.__currentGameAbortController = abortCtrl;
    
    return {
      queue: [],
      isFetching: false,
      isActive: true,
      isBankrupt: false,
      _currentPromise: null,
      _isResolved: false,
      _abortCtrl: abortCtrl,
      
      maintain: function(isInitial = false, timeoutMs = 22000, isOfflineFastTrack = false) {
        if (!this.isActive || this.isBankrupt) return Promise.resolve();
        if (this.queue.length >= maxConcurrent) return Promise.resolve();
        
        const isQueueEmptyStart = this.queue.length === 0;
        
        if (this.isFetching) {
          if (this.queue.length === 0 && this._isResolved) {
            this._isResolved = false;
            this._currentPromise = new Promise((resolve) => {
              this._resolveEarly = () => {
                if (!this._isResolved) {
                  this._isResolved = true;
                  resolve();
                }
              };
              setTimeout(() => { if (this._resolveEarly) this._resolveEarly(); }, timeoutMs);
            });
          }
          return this._currentPromise;
        }
        
        this.isFetching = true;
        this._isResolved = false;
        
        this._currentPromise = new Promise((resolveOuter) => {
          this._resolveEarly = () => {
            if (!this._isResolved) {
              this._isResolved = true;
              resolveOuter();
            }
          };
          
          const runBackground = async () => {
            while (this.queue.length < maxConcurrent && this.isActive) {
              try {
                const data = await fetchDataFn(1);
                if (!this.isActive) break;
                
                if (data) {
                  if (Array.isArray(data)) {
                    this.queue.push(...data);
                  } else {
                    this.queue.push(data);
                  }
                  
                  if (this.queue.length < maxConcurrent && this.isActive) {
                    await new Promise(r => setTimeout(r, aiConfig.delayMs));
                  }
                } else {
                  break;
                }
              } catch (e) {
                if (e.name === 'AbortError' || e.message?.includes('User exited')) break;
                
                if (this.isActive) {
                  console.warn("[QueueEngine] Tạm ngưng 10s do API lỗi:", e.message);
                  await new Promise(r => setTimeout(r, 10000));
                } else {
                  break;
                }
              }
            }
            this.isFetching = false;
          };
          
          runBackground();
          
          const ammoPromise = new Promise((resolveAmmo) => {
            const checkAmmo = () => {
              if (this.queue.length >= 1 || !this.isFetching || this.isBankrupt) {
                resolveAmmo();
              } else {
                setTimeout(checkAmmo, 200);
              }
            };
            checkAmmo();
          });
          
          const enforcedWaitMs = (isQueueEmptyStart && !isOfflineFastTrack) ? (aiConfig.loadingTime * 1000) : 0;
          const timerPromise = new Promise(r => setTimeout(r, enforcedWaitMs));
          
          Promise.all([ammoPromise, timerPromise]).then(() => {
            if (this._resolveEarly) this._resolveEarly();
          });
          
          setTimeout(() => {
            if (this._resolveEarly) this._resolveEarly();
          }, enforcedWaitMs + timeoutMs);
        });
        
        return this._currentPromise;
      },
      
      pop: function() {
        const item = this.queue.shift();
        this.maintain();
        return item;
      },
      
      peek: function() { return this.queue.length > 0 ? this.queue[0] : null; },
      
      destroy: function() {
        this.isActive = false;
        this.queue = [];
        if (this._abortCtrl) {
          try { this._abortCtrl.abort("User exited"); } catch(e) {}
        }
        if (window.__currentGameAbortController) {
          try { window.__currentGameAbortController.abort("User exited"); } catch(e) {}
        }
        QueueEngine._triggerZombieKiller();
      },
      
      length: function() { return this.queue.length; },
      
      getPendingItems: function() { return [...this.queue]; }
    };
  },

  // ĐỘNG CƠ BATCH COORDINATOR (Dành cho Match Game)
  createBatchQueueCoordinator: function(fetchDataFn, defaultMaxConcurrent = 2) {
    let aiConfig = { loadingTime: 22, delayMs: 2500, maxAmmo: defaultMaxConcurrent };
    try {
      const cfg = JSON.parse(localStorage.getItem('fc_ai_config'));
      if (cfg) {
        if (cfg.loadingTime) aiConfig.loadingTime = cfg.loadingTime;
        if (cfg.delayMs) aiConfig.delayMs = cfg.delayMs;
        if (cfg.maxAmmo) aiConfig.maxAmmo = cfg.maxAmmo;
      }
    } catch (e) { console.warn("Lỗi đọc fc_ai_config", e); }
    
    const maxConcurrent = aiConfig.maxAmmo;
    
    if (window.__currentGameAbortController) {
      try { window.__currentGameAbortController.abort("New coordinator initialized"); } catch(e) {}
    }
    
    const abortCtrl = new AbortController();
    window.__currentGameAbortController = abortCtrl;
    
    return {
      queue: [],
      isFetching: false,
      isActive: true,
      isBankrupt: false,
      _currentPromise: null,
      _isResolved: false,
      _abortCtrl: abortCtrl,
      
      maintain: function(isInitial = false, timeoutMs = 22000, isOfflineFastTrack = false) {
        if (!this.isActive || this.isBankrupt) return Promise.resolve();
        if (this.queue.length >= maxConcurrent) return Promise.resolve();
        
        const isQueueEmptyStart = this.queue.length === 0;
        
        if (this.isFetching) {
          if (this.queue.length === 0 && this._isResolved) {
            this._isResolved = false;
            this._currentPromise = new Promise((resolve) => {
              this._resolveEarly = () => {
                if (!this._isResolved) {
                  this._isResolved = true;
                  resolve();
                }
              };
            });
          }
          return this._currentPromise;
        }
        
        this.isFetching = true;
        this._isResolved = false;
        
        this._currentPromise = new Promise((resolveOuter) => {
          this._resolveEarly = () => { if (!this._isResolved) { this._isResolved = true; resolveOuter(); } };
          
          const runBackground = async () => {
            while (this.queue.length < maxConcurrent && this.isActive) {
              try {
                const data = await fetchDataFn();
                if (!this.isActive) break;
                
                if (data) {
                  this.queue.push(data);
                  if (this.queue.length < maxConcurrent && this.isActive) {
                    await new Promise(r => setTimeout(r, aiConfig.delayMs));
                  }
                } else {
                  break;
                }
              } catch (e) {
                if (e.name === 'AbortError' || e.message?.includes('User exited')) break;
                
                if (this.isActive) {
                  console.warn("[QueueEngine] Batch tạm ngưng 10s do API lỗi:", e.message);
                  await new Promise(r => setTimeout(r, 10000));
                } else {
                  break;
                }
              }
            }
            this.isFetching = false;
          };
          
          runBackground();
          
          const ammoPromise = new Promise((resolveAmmo) => {
            const checkAmmo = () => {
              if (this.queue.length >= 1 || !this.isFetching || this.isBankrupt) resolveAmmo();
              else setTimeout(checkAmmo, 200);
            };
            checkAmmo();
          });
          
          const enforcedWaitMs = (isQueueEmptyStart && !isOfflineFastTrack) ? (aiConfig.loadingTime * 1000) : 0;
          const timerPromise = new Promise(r => setTimeout(r, enforcedWaitMs));
          
          Promise.all([ammoPromise, timerPromise]).then(() => {
            if (this._resolveEarly) this._resolveEarly();
          });
          
          setTimeout(() => {
            if (this._resolveEarly) this._resolveEarly();
          }, enforcedWaitMs + 22000);
        });
        
        return this._currentPromise;
      },
      
      pop: function() {
        const item = this.queue.shift();
        this.maintain();
        return item;
      },
      
      peek: function() { return this.queue.length > 0 ? this.queue[0] : null; },
      
      destroy: function() {
        this.isActive = false;
        this.queue = [];
        if (this._abortCtrl) {
          try { this._abortCtrl.abort("User exited"); } catch(e) {}
        }
        if (window.__currentGameAbortController) {
          try { window.__currentGameAbortController.abort("User exited"); } catch(e) {}
        }
        QueueEngine._triggerZombieKiller();
      },
      
      length: function() { return this.queue.length; },
      
      getPendingItems: function() { return [...this.queue]; }
    };
  },

  // ĐỘNG CƠ NẠP ĐỢT CHO BÀI THI TỔNG HỢP (MOCK TEST CHUNKING)
  createMockTestCoordinator: function(fetchChunkFn, chunkSize = 10, prefetchThreshold = 3) {
    if (window.__currentGameAbortController) {
      try { window.__currentGameAbortController.abort("New mock test initialized"); } catch(e) {}
    }
    
    const abortCtrl = new AbortController();
    window.__currentGameAbortController = abortCtrl;
    
    return {
      queue: [],
      isFetching: false,
      isActive: true,
      isBankrupt: false,
      _currentPromise: null,
      totalLoaded: 0,
      _abortCtrl: abortCtrl,
      
      maintain: function() {
        if (!this.isActive || this.isBankrupt) return Promise.resolve();
        if (this.queue.length > prefetchThreshold) return Promise.resolve();
        if (this.isFetching && this._currentPromise) return this._currentPromise;
        
        this.isFetching = true;
        this._currentPromise = new Promise((resolveOuter) => {
          const runBackground = async () => {
            try {
              const chunkData = await fetchChunkFn(chunkSize);
              if (chunkData && Array.isArray(chunkData) && this.isActive) {
                this.queue.push(...chunkData);
                this.totalLoaded += chunkData.length;
              }
            } catch (e) {
              if (e.name !== 'AbortError' && !e.message?.includes('User exited')) {
                if (this.isActive) {
                  console.warn("[QueueEngine] MockTest tạm ngưng 10s do API lỗi:", e.message);
                  await new Promise(r => setTimeout(r, 10000));
                }
              }
            } finally {
              this.isFetching = false;
              resolveOuter();
            }
          };
          runBackground();
        }).finally(() => {
          this._currentPromise = null;
        });
        
        return this._currentPromise;
      },
      
      pop: function() {
        const item = this.queue.shift();
        this.maintain();
        return item;
      },
      
      peek: function() { return this.queue.length > 0 ? this.queue[0] : null; },
      
      destroy: function() {
        this.isActive = false;
        this.queue = [];
        if (this._abortCtrl) {
          try { this._abortCtrl.abort("User exited"); } catch(e) {}
        }
        if (window.__currentGameAbortController) {
          try { window.__currentGameAbortController.abort("User exited"); } catch(e) {}
        }
        QueueEngine._triggerZombieKiller();
      },
      
      length: function() { return this.queue.length; },
      
      getTotalLoaded: function() { return this.totalLoaded; },
      
      getPendingItems: function() { return [...this.queue]; }
    };
  }
};