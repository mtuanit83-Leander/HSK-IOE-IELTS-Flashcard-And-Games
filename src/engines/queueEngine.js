// ============================================================================
// FILE 20/85: src/engines/queueEngine.js
// NGUỒN GỐC: Tầng 2 - Block 2.5 (Queue Engine)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 05:19 (GMT+7)
// NHIỆM VỤ: Động cơ nạp đạn ngầm bất đồng bộ (Sequential Early Resolve,
//           Batch Queue Coordinator & Mock Test Chunking), tự động cắt tiến
//           trình treo (_triggerZombieKiller / _disarmZombieKiller) và quản lý
//           an toàn vòng đời AbortController + Timer.
//           Nâng cấp Ver 1.0 (Giai đoạn 5 - Lượt 5.1 - Diệt 11M Radar & 0 tsc):
//           1. Diệt 11/11 MEDIUM Radar (11x R06B): Import ES Module chuẩn
//              AiFactoryEngine thay cho window.AiFactoryEngine; đọc fc_ai_config
//              an toàn qua safeJsonParse.
//           2. Diệt Q1 & S3: Bổ sung _disarmZombieKiller() tự động gỡ phong ấn
//              ngay khi khởi tạo Coordinator mới (chống StrictMode / mở game mới
//              trong 1.5s bị bắn chết oan), vẫn giữ cờ window.__zombieKillerActive.
//           3. Diệt S1 (Lỗi đơ 22 giây giữa ván): Chỉ ép enforcedWaitMs khi
//              Boolean(isInitial) && isQueueEmptyStart && !isOfflineFastTrack;
//              truyền tiếp _lastOfflineFastTrack từ pop() -> maintain() và đồng
//              bộ cờ _isRearmed giúp đánh thức ngay nhánh chờ re-arm giữa ván.
//           4. Diệt Q2, Q3 & S2: Thêm timeout bảo vệ cho BatchCoordinator nhánh
//              re-arm, giới hạn MAX_CONSECUTIVE_ERRORS = 4 chống vòng lặp lỗi
//              10s vô hạn, dọn sạch mọi timer & giải phóng Promise khi destroy(),
//              và kiểm tra đúng chủ sở hữu AbortController trước khi abort/kill.
// ============================================================================

import { safeJsonParse } from '../utils/helpers.js';
import { AiFactoryEngine } from './aiFactory.js';

const MAX_CONSECUTIVE_ERRORS = 4;
const ERROR_RETRY_DELAY_MS = 10000;
const ZOMBIE_KILLER_DURATION_MS = 1500;

/**
 * Đọc cấu hình lõi AI (fc_ai_config) an toàn kèm biên hợp lệ.
 * @param {number} defaultMaxConcurrent
 * @returns {{ loadingTime: number, delayMs: number, maxAmmo: number }}
 */
const readQueueAiConfig = (defaultMaxConcurrent) => {
  const fallbackAmmo = Math.max(1, Number(defaultMaxConcurrent) || 4);
  const aiConfig = {
    loadingTime: 22,
    delayMs: 2500,
    maxAmmo: fallbackAmmo
  };

  try {
    const cfg = safeJsonParse('fc_ai_config', null);
    if (cfg && typeof cfg === 'object') {
      const loadingTime = Number(cfg.loadingTime);
      const delayMs = Number(cfg.delayMs);
      const maxAmmo = Number(cfg.maxAmmo);

      if (Number.isFinite(loadingTime) && loadingTime >= 0) {
        aiConfig.loadingTime = loadingTime;
      }
      if (Number.isFinite(delayMs) && delayMs >= 0) {
        aiConfig.delayMs = delayMs;
      }
      if (Number.isFinite(maxAmmo) && maxAmmo >= 1) {
        aiConfig.maxAmmo = Math.floor(maxAmmo);
      }
    }
  } catch (e) {
    console.warn('[QueueEngine] Lỗi đọc fc_ai_config:', e);
  }

  return aiConfig;
};

/**
 * Trích xuất thông điệp lỗi an toàn từ unknown.
 * @param {any} err
 * @returns {string}
 */
const getErrorMessage = (err) => {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object' && typeof err.message === 'string') return err.message;
  return String(err);
};

/**
 * Kiểm tra lỗi có phải do hủy chủ động (AbortError / User exited) hay không.
 * @param {any} err
 * @returns {boolean}
 */
const isAbortLikeError = (err) => {
  if (!err) return false;
  const name = typeof err === 'object' ? String(err.name || '') : '';
  const msg = getErrorMessage(err);
  return (
    name === 'AbortError' ||
    msg.includes('User exited') ||
    msg.includes('Zombies Terminated')
  );
};

/**
 * Tạo đối tượng AbortError chuẩn (tương thích mọi môi trường trình duyệt & jsdom).
 * @returns {Error | DOMException}
 */
const createZombieAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Zombies Terminated', 'AbortError');
  }
  const err = new Error('Zombies Terminated');
  err.name = 'AbortError';
  return err;
};

/**
 * Gắn AbortController mới cho phiên chơi hiện tại, hủy controller cũ nếu còn.
 * @param {string} reason
 * @returns {AbortController}
 */
const registerActiveAbortController = (reason) => {
  if (typeof window !== 'undefined') {
    const win = /** @type {any} */ (window);
    if (win.__currentGameAbortController) {
      try {
        win.__currentGameAbortController.abort(reason);
      } catch {
        // Bỏ qua lỗi abort controller cũ
      }
    }
  }

  const abortCtrl = new AbortController();
  if (typeof window !== 'undefined') {
    /** @type {any} */ (window).__currentGameAbortController = abortCtrl;
  }
  return abortCtrl;
};

/**
 * Chỉ abort và kích hoạt Zombie Killer nếu controller này vẫn là phiên đang chạy
 * (tránh game cũ unmount muộn bắn chết game mới vừa khởi tạo).
 * @param {AbortController | null} ownAbortCtrl
 * @param {() => void} onTriggerKiller
 */
const releaseOwnedAbortController = (ownAbortCtrl, onTriggerKiller) => {
  let isStillOwner = true;

  if (ownAbortCtrl) {
    try {
      ownAbortCtrl.abort('User exited');
    } catch {
      // Bỏ qua lỗi abort
    }
  }

  if (typeof window !== 'undefined') {
    const win = /** @type {any} */ (window);
    if (win.__currentGameAbortController) {
      if (win.__currentGameAbortController === ownAbortCtrl) {
        try {
          win.__currentGameAbortController.abort('User exited');
        } catch {
          // Bỏ qua lỗi abort
        }
        win.__currentGameAbortController = null;
        isStillOwner = true;
      } else {
        // Đã có Coordinator mới thay thế — tuyệt đối không phá phiên mới
        isStillOwner = false;
      }
    }
  }

  if (isStillOwner && typeof onTriggerKiller === 'function') {
    onTriggerKiller();
  }
};

/**
 * Tạo bộ quản lý Timer cục bộ cho mỗi Coordinator để dọn sạch 100% khi destroy().
 */
const createTimerRegistry = () => {
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const timers = new Set();
  /** @type {Set<() => void>} */
  const sleepResolvers = new Set();

  /**
   * @param {() => void} fn
   * @param {number} ms
   * @returns {ReturnType<typeof setTimeout>}
   */
  const schedule = (fn, ms) => {
    const safeMs = Math.max(0, Number(ms) || 0);
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, safeMs);
    timers.add(id);
    return id;
  };

  /**
   * @param {ReturnType<typeof setTimeout> | null | undefined} id
   */
  const cancel = (id) => {
    if (id !== null && id !== undefined) {
      clearTimeout(id);
      timers.delete(id);
    }
  };

  /**
   * Ngủ có thể bị hủy tức thì khi clearAll() chạy.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  const sleep = (ms) => {
    const safeMs = Math.max(0, Number(ms) || 0);
    if (safeMs === 0) return Promise.resolve();
    return new Promise((resolve) => {
      /** @type {ReturnType<typeof setTimeout> | null} */
      let timerId = null;
      const done = () => {
        if (timerId !== null) {
          clearTimeout(timerId);
          timers.delete(timerId);
          timerId = null;
        }
        sleepResolvers.delete(done);
        resolve(undefined);
      };
      sleepResolvers.add(done);
      timerId = setTimeout(done, safeMs);
      timers.add(timerId);
    });
  };

  const clearAll = () => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    const pendingResolvers = Array.from(sleepResolvers);
    sleepResolvers.clear();
    pendingResolvers.forEach((fn) => {
      try {
        fn();
      } catch {
        // Bỏ qua lỗi giải phóng sleep
      }
    });
  };

  return { schedule, cancel, sleep, clearAll };
};

// Trạng thái nội bộ của bộ tiêu diệt tiến trình treo (Zombie Killer)
/** @type {{ active: boolean, timerId: ReturnType<typeof setTimeout> | null, origContext: any, origMatrix: any, origBase: any }} */
const zombieKillerState = {
  active: false,
  timerId: null,
  origContext: null,
  origMatrix: null,
  origBase: null
};

export const QueueEngine = {
  // GỠ PHONG ẤN NGAY LẬP TỨC KHI MỞ PHIÊN CHƠI MỚI (Chống StrictMode / mở lại game trong 1.5s)
  _disarmZombieKiller: function () {
    if (zombieKillerState.timerId !== null) {
      clearTimeout(zombieKillerState.timerId);
      zombieKillerState.timerId = null;
    }

    const factory = /** @type {any} */ (AiFactoryEngine);
    if (zombieKillerState.active && factory) {
      if (typeof zombieKillerState.origContext === 'function') {
        factory.forgeContext = zombieKillerState.origContext;
      }
      if (typeof zombieKillerState.origMatrix === 'function') {
        factory.forgeMatrix = zombieKillerState.origMatrix;
      }
      if (typeof zombieKillerState.origBase === 'function') {
        factory.forgeBaseCard = zombieKillerState.origBase;
      }
    }

    zombieKillerState.active = false;
    zombieKillerState.origContext = null;
    zombieKillerState.origMatrix = null;
    zombieKillerState.origBase = null;

    if (typeof window !== 'undefined') {
      /** @type {any} */ (window).__zombieKillerActive = false;
    }
  },

  // ĐỘNG CƠ TIÊU DIỆT THÂY MA NGẦM (ZOMBIE KILLER INJECTION - ES Module thuần, 0x R06B)
  _triggerZombieKiller: function () {
    const factory = /** @type {any} */ (AiFactoryEngine);
    if (!factory || zombieKillerState.active) return;

    zombieKillerState.active = true;
    zombieKillerState.origContext = factory.forgeContext;
    zombieKillerState.origMatrix = factory.forgeMatrix;
    zombieKillerState.origBase = factory.forgeBaseCard;

    if (typeof window !== 'undefined') {
      /** @type {any} */ (window).__zombieKillerActive = true;
    }

    // Thuốc độc bóp chết mọi nỗ lực gọi AI của vòng lặp Retry cũ
    /** @type {any} */
    const killSwitch = async () => {
      throw createZombieAbortError();
    };

    factory.forgeContext = killSwitch;
    factory.forgeMatrix = killSwitch;
    factory.forgeBaseCard = killSwitch;

    // Giải phóng phong ấn sau 1.5 giây (hoặc sớm hơn khi _disarmZombieKiller được gọi)
    zombieKillerState.timerId = setTimeout(() => {
      QueueEngine._disarmZombieKiller();
    }, ZOMBIE_KILLER_DURATION_MS);
  },

  // ĐỘNG CƠ ĐA LUỒNG (Kiến trúc Sequential Early Resolve - Boomerang Principle)
  /**
   * @param {(count: number) => Promise<any>} fetchDataFn
   * @param {number} [defaultMaxConcurrent=4]
   */
  createQueueCoordinator: function (fetchDataFn, defaultMaxConcurrent = 4) {
    QueueEngine._disarmZombieKiller();
    const aiConfig = readQueueAiConfig(defaultMaxConcurrent);
    const maxConcurrent = aiConfig.maxAmmo;
    const abortCtrl = registerActiveAbortController('New coordinator initialized');
    const timerReg = createTimerRegistry();

    const coordinator = {
      /** @type {any[]} */
      queue: [],
      isFetching: false,
      isActive: true,
      isBankrupt: false,
      /** @type {Promise<void> | null} */
      _currentPromise: null,
      _isResolved: false,
      _isRearmed: false,
      /** @type {(() => void) | null} */
      _resolveEarly: null,
      _lastOfflineFastTrack: false,
      _abortCtrl: abortCtrl,

      /**
       * @param {boolean} [isInitial=false]
       * @param {number} [timeoutMs=22000]
       * @param {boolean} [isOfflineFastTrack=false]
       * @returns {Promise<void>}
       */
      maintain: function (isInitial = false, timeoutMs = 22000, isOfflineFastTrack = false) {
        if (!this.isActive || this.isBankrupt) return Promise.resolve();
        if (this.queue.length >= maxConcurrent) return Promise.resolve();

        if (isInitial || isOfflineFastTrack) {
          this._lastOfflineFastTrack = Boolean(isOfflineFastTrack);
        }

        const safeTimeoutMs = Math.max(1000, Number(timeoutMs) || 22000);
        const isQueueEmptyStart = this.queue.length === 0;

        if (this.isFetching) {
          if (this.queue.length === 0 && this._isResolved) {
            this._isResolved = false;
            this._isRearmed = true;
            this._currentPromise = new Promise((resolve) => {
              /** @type {ReturnType<typeof setTimeout> | null} */
              let rearmTimer = null;
              this._resolveEarly = () => {
                if (!this._isResolved) {
                  this._isResolved = true;
                  this._isRearmed = false;
                  timerReg.cancel(rearmTimer);
                  rearmTimer = null;
                  resolve(undefined);
                }
              };
              rearmTimer = timerReg.schedule(() => {
                if (this._resolveEarly) this._resolveEarly();
              }, safeTimeoutMs);
            });
          }
          return this._currentPromise || Promise.resolve();
        }

        this.isFetching = true;
        this._isResolved = false;
        this._isRearmed = false;

        this._currentPromise = new Promise((resolveOuter) => {
          /** @type {ReturnType<typeof setTimeout> | null} */
          let hardTimeoutId = null;

          this._resolveEarly = () => {
            if (!this._isResolved) {
              this._isResolved = true;
              this._isRearmed = false;
              timerReg.cancel(hardTimeoutId);
              hardTimeoutId = null;
              resolveOuter(undefined);
            }
          };

          const runBackground = async () => {
            let consecutiveErrors = 0;
            try {
              while (this.queue.length < maxConcurrent && this.isActive && !this.isBankrupt) {
                try {
                  const data = await fetchDataFn(1);
                  if (!this.isActive) break;

                  if (data) {
                    consecutiveErrors = 0;
                    if (Array.isArray(data)) {
                      this.queue.push(...data);
                    } else {
                      this.queue.push(data);
                    }
                    // Đánh thức ngay nhánh chờ giữa ván hoặc re-arm (không chờ 22s)
                    if (
                      (!isInitial || this._isRearmed) &&
                      this.queue.length >= 1 &&
                      !this._isResolved &&
                      this._resolveEarly
                    ) {
                      this._resolveEarly();
                    }
                    if (this.queue.length < maxConcurrent && this.isActive && !this.isBankrupt) {
                      await timerReg.sleep(aiConfig.delayMs);
                    }
                  } else {
                    break;
                  }
                } catch (e) {
                  if (isAbortLikeError(e) || !this.isActive) break;
                  consecutiveErrors += 1;
                  console.warn(
                    `[QueueEngine] Tạm ngưng 10s do API lỗi (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
                    getErrorMessage(e)
                  );
                  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    break;
                  }
                  await timerReg.sleep(ERROR_RETRY_DELAY_MS);
                }
              }
            } finally {
              this.isFetching = false;
              if (
                !this._isResolved &&
                this._resolveEarly &&
                (!this.isActive || this.isBankrupt || !isInitial || this._isRearmed)
              ) {
                this._resolveEarly();
              }
            }
          };

          runBackground();

          const ammoPromise = new Promise((resolveAmmo) => {
            const checkAmmo = () => {
              if (
                !this.isActive ||
                this._isResolved ||
                this.queue.length >= 1 ||
                !this.isFetching ||
                this.isBankrupt
              ) {
                resolveAmmo(undefined);
              } else {
                timerReg.schedule(checkAmmo, 200);
              }
            };
            checkAmmo();
          });

          // [S1] Chỉ ép thời gian chờ loadingTime ở lượt khởi tạo ban đầu (isInitial === true)
          const enforcedWaitMs =
            Boolean(isInitial) && isQueueEmptyStart && !isOfflineFastTrack
              ? aiConfig.loadingTime * 1000
              : 0;
          const timerPromise = timerReg.sleep(enforcedWaitMs);

          Promise.all([ammoPromise, timerPromise]).then(() => {
            if (this._resolveEarly) this._resolveEarly();
          });

          hardTimeoutId = timerReg.schedule(() => {
            if (this._resolveEarly) this._resolveEarly();
          }, enforcedWaitMs + safeTimeoutMs);
        });

        return this._currentPromise;
      },

      pop: function () {
        const item = this.queue.shift();
        this.maintain(false, 22000, this._lastOfflineFastTrack);
        return item;
      },

      peek: function () {
        return this.queue.length > 0 ? this.queue[0] : null;
      },

      destroy: function () {
        this.isActive = false;
        this.isFetching = false;
        this.queue = [];
        timerReg.clearAll();
        if (this._resolveEarly) {
          this._resolveEarly();
        }
        releaseOwnedAbortController(this._abortCtrl, () => {
          QueueEngine._triggerZombieKiller();
        });
      },

      length: function () {
        return this.queue.length;
      },

      getPendingItems: function () {
        return [...this.queue];
      }
    };

    return coordinator;
  },

  // ĐỘNG CƠ BATCH COORDINATOR (Dành cho Match Game)
  /**
   * @param {() => Promise<any>} fetchDataFn
   * @param {number} [defaultMaxConcurrent=2]
   */
  createBatchQueueCoordinator: function (fetchDataFn, defaultMaxConcurrent = 2) {
    QueueEngine._disarmZombieKiller();
    const aiConfig = readQueueAiConfig(defaultMaxConcurrent);
    const maxConcurrent = aiConfig.maxAmmo;
    const abortCtrl = registerActiveAbortController('New coordinator initialized');
    const timerReg = createTimerRegistry();

    const coordinator = {
      /** @type {any[]} */
      queue: [],
      isFetching: false,
      isActive: true,
      isBankrupt: false,
      /** @type {Promise<void> | null} */
      _currentPromise: null,
      _isResolved: false,
      _isRearmed: false,
      /** @type {(() => void) | null} */
      _resolveEarly: null,
      _lastOfflineFastTrack: false,
      _abortCtrl: abortCtrl,

      /**
       * @param {boolean} [isInitial=false]
       * @param {number} [timeoutMs=22000]
       * @param {boolean} [isOfflineFastTrack=false]
       * @returns {Promise<void>}
       */
      maintain: function (isInitial = false, timeoutMs = 22000, isOfflineFastTrack = false) {
        if (!this.isActive || this.isBankrupt) return Promise.resolve();
        if (this.queue.length >= maxConcurrent) return Promise.resolve();

        if (isInitial || isOfflineFastTrack) {
          this._lastOfflineFastTrack = Boolean(isOfflineFastTrack);
        }

        const safeTimeoutMs = Math.max(1000, Number(timeoutMs) || 22000);
        const isQueueEmptyStart = this.queue.length === 0;

        if (this.isFetching) {
          if (this.queue.length === 0 && this._isResolved) {
            this._isResolved = false;
            this._isRearmed = true;
            this._currentPromise = new Promise((resolve) => {
              /** @type {ReturnType<typeof setTimeout> | null} */
              let rearmTimer = null;
              this._resolveEarly = () => {
                if (!this._isResolved) {
                  this._isResolved = true;
                  this._isRearmed = false;
                  timerReg.cancel(rearmTimer);
                  rearmTimer = null;
                  resolve(undefined);
                }
              };
              // [Q2] Thêm timeout bảo vệ nhánh re-arm tránh treo Promise vô hạn
              rearmTimer = timerReg.schedule(() => {
                if (this._resolveEarly) this._resolveEarly();
              }, safeTimeoutMs);
            });
          }
          return this._currentPromise || Promise.resolve();
        }

        this.isFetching = true;
        this._isResolved = false;
        this._isRearmed = false;

        this._currentPromise = new Promise((resolveOuter) => {
          /** @type {ReturnType<typeof setTimeout> | null} */
          let hardTimeoutId = null;

          this._resolveEarly = () => {
            if (!this._isResolved) {
              this._isResolved = true;
              this._isRearmed = false;
              timerReg.cancel(hardTimeoutId);
              hardTimeoutId = null;
              resolveOuter(undefined);
            }
          };

          const runBackground = async () => {
            let consecutiveErrors = 0;
            try {
              while (this.queue.length < maxConcurrent && this.isActive && !this.isBankrupt) {
                try {
                  const data = await fetchDataFn();
                  if (!this.isActive) break;

                  if (data) {
                    consecutiveErrors = 0;
                    this.queue.push(data);
                    if (
                      (!isInitial || this._isRearmed) &&
                      this.queue.length >= 1 &&
                      !this._isResolved &&
                      this._resolveEarly
                    ) {
                      this._resolveEarly();
                    }
                    if (this.queue.length < maxConcurrent && this.isActive && !this.isBankrupt) {
                      await timerReg.sleep(aiConfig.delayMs);
                    }
                  } else {
                    break;
                  }
                } catch (e) {
                  if (isAbortLikeError(e) || !this.isActive) break;
                  consecutiveErrors += 1;
                  console.warn(
                    `[QueueEngine] Batch tạm ngưng 10s do API lỗi (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
                    getErrorMessage(e)
                  );
                  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    break;
                  }
                  await timerReg.sleep(ERROR_RETRY_DELAY_MS);
                }
              }
            } finally {
              this.isFetching = false;
              if (
                !this._isResolved &&
                this._resolveEarly &&
                (!this.isActive || this.isBankrupt || !isInitial || this._isRearmed)
              ) {
                this._resolveEarly();
              }
            }
          };

          runBackground();

          const ammoPromise = new Promise((resolveAmmo) => {
            const checkAmmo = () => {
              if (
                !this.isActive ||
                this._isResolved ||
                this.queue.length >= 1 ||
                !this.isFetching ||
                this.isBankrupt
              ) {
                resolveAmmo(undefined);
              } else {
                timerReg.schedule(checkAmmo, 200);
              }
            };
            checkAmmo();
          });

          // [S1] Chỉ ép thời gian chờ loadingTime ở lượt khởi tạo ban đầu (isInitial === true)
          const enforcedWaitMs =
            Boolean(isInitial) && isQueueEmptyStart && !isOfflineFastTrack
              ? aiConfig.loadingTime * 1000
              : 0;
          const timerPromise = timerReg.sleep(enforcedWaitMs);

          Promise.all([ammoPromise, timerPromise]).then(() => {
            if (this._resolveEarly) this._resolveEarly();
          });

          hardTimeoutId = timerReg.schedule(() => {
            if (this._resolveEarly) this._resolveEarly();
          }, enforcedWaitMs + safeTimeoutMs);
        });

        return this._currentPromise;
      },

      pop: function () {
        const item = this.queue.shift();
        this.maintain(false, 22000, this._lastOfflineFastTrack);
        return item;
      },

      peek: function () {
        return this.queue.length > 0 ? this.queue[0] : null;
      },

      destroy: function () {
        this.isActive = false;
        this.isFetching = false;
        this.queue = [];
        timerReg.clearAll();
        if (this._resolveEarly) {
          this._resolveEarly();
        }
        releaseOwnedAbortController(this._abortCtrl, () => {
          QueueEngine._triggerZombieKiller();
        });
      },

      length: function () {
        return this.queue.length;
      },

      getPendingItems: function () {
        return [...this.queue];
      }
    };

    return coordinator;
  },

  // ĐỘNG CƠ NẠP ĐỢT CHO BÀI THI TỔNG HỢP (MOCK TEST CHUNKING)
  /**
   * @param {(chunkSize: number) => Promise<any[]>} fetchChunkFn
   * @param {number} [chunkSize=10]
   * @param {number} [prefetchThreshold=3]
   */
  createMockTestCoordinator: function (fetchChunkFn, chunkSize = 10, prefetchThreshold = 3) {
    QueueEngine._disarmZombieKiller();
    const abortCtrl = registerActiveAbortController('New mock test initialized');
    const timerReg = createTimerRegistry();

    const coordinator = {
      /** @type {any[]} */
      queue: [],
      isFetching: false,
      isActive: true,
      isBankrupt: false,
      /** @type {Promise<void> | null} */
      _currentPromise: null,
      /** @type {(() => void) | null} */
      _resolveEarly: null,
      totalLoaded: 0,
      _abortCtrl: abortCtrl,

      maintain: function () {
        if (!this.isActive || this.isBankrupt) return Promise.resolve();
        if (this.queue.length > prefetchThreshold) return Promise.resolve();
        if (this.isFetching && this._currentPromise) return this._currentPromise;

        this.isFetching = true;
        this._currentPromise = new Promise((resolveOuter) => {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolveOuter(undefined);
            }
          };
          this._resolveEarly = finish;

          const runBackground = async () => {
            try {
              const chunkData = await fetchChunkFn(chunkSize);
              if (chunkData && Array.isArray(chunkData) && this.isActive) {
                this.queue.push(...chunkData);
                this.totalLoaded += chunkData.length;
              }
            } catch (e) {
              if (!isAbortLikeError(e) && this.isActive) {
                console.warn(
                  '[QueueEngine] MockTest tạm ngưng 10s do API lỗi:',
                  getErrorMessage(e)
                );
                await timerReg.sleep(ERROR_RETRY_DELAY_MS);
              }
            } finally {
              this.isFetching = false;
              finish();
            }
          };

          runBackground();
        }).finally(() => {
          this._currentPromise = null;
          this._resolveEarly = null;
        });

        return this._currentPromise;
      },

      pop: function () {
        const item = this.queue.shift();
        this.maintain();
        return item;
      },

      peek: function () {
        return this.queue.length > 0 ? this.queue[0] : null;
      },

      destroy: function () {
        this.isActive = false;
        this.isFetching = false;
        this.queue = [];
        timerReg.clearAll();
        if (this._resolveEarly) {
          this._resolveEarly();
        }
        releaseOwnedAbortController(this._abortCtrl, () => {
          QueueEngine._triggerZombieKiller();
        });
      },

      length: function () {
        return this.queue.length;
      },

      getTotalLoaded: function () {
        return this.totalLoaded;
      },

      getPendingItems: function () {
        return [...this.queue];
      }
    };

    return coordinator;
  }
};

// Named Exports chuẩn ES Module theo Mapping.md
/**
 * @param {(count: number) => Promise<any>} fetchDataFn
 * @param {number} [defaultMaxConcurrent=4]
 */
export const createQueueCoordinator = (fetchDataFn, defaultMaxConcurrent = 4) =>
  QueueEngine.createQueueCoordinator(fetchDataFn, defaultMaxConcurrent);

/**
 * @param {() => Promise<any>} fetchDataFn
 * @param {number} [defaultMaxConcurrent=2]
 */
export const createBatchQueueCoordinator = (fetchDataFn, defaultMaxConcurrent = 2) =>
  QueueEngine.createBatchQueueCoordinator(fetchDataFn, defaultMaxConcurrent);

/**
 * @param {(chunkSize: number) => Promise<any[]>} fetchChunkFn
 * @param {number} [chunkSize=10]
 * @param {number} [prefetchThreshold=3]
 */
export const createMockTestCoordinator = (
  fetchChunkFn,
  chunkSize = 10,
  prefetchThreshold = 3
) => QueueEngine.createMockTestCoordinator(fetchChunkFn, chunkSize, prefetchThreshold);

if (typeof window !== 'undefined') {
  /** @type {any} */ (window).QueueEngine = QueueEngine;
}

export default QueueEngine;