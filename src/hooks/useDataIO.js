// ============================================================================
// FILE 77/85: src/hooks/useDataIO.js
// NGUỒN GỐC: Tầng 6 - Block 6.3 (Data I/O & Persistence - Version 1.03)
// PHIÊN BẢN: Ver 1.3
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 21:58 (GMT+7)
// NHIỆM VỤ: "Người vận chuyển" (The Porter) thế hệ mới cho Kiến trúc Kho Master Lai
//           (IndexedDB + RAM Mirror 0ms): tách sạch side-effect khỏi React updater
//           (StrictMode-safe), tối ưu GViz ngắt sớm 0 request khi Sheet Private &
//           quét batch 3 request song song, bộ đếm Loading chống chồng chéo, tối ưu
//           thứ tự đồng bộ handleAddCard không hồi quy và sao lưu/phục hồi Full FcDB.
//           Nâng cấp Ver 1.3 (Hotfix Tải API Key Google Sheet — Diệt KEY-1..KEY-4):
//           1. [KEY-1] Thay Regex cũ chặn dấu "." bằng bộ lọc chuẩn
//              `isValidApiKeyCandidate` & `extractApiKeysFromText`, hỗ trợ trọn vẹn
//              cả API Key định dạng mới có dấu chấm (`AQ.Ab8RN...`) lẫn cũ (`AIzaSy...`),
//              đồng thời chặn tiêu đề cột thuần chữ, chuỗi ngày giờ thuần số & tên file.
//           2. [KEY-2] Nâng cấp `resolveApiKeySheetFetchUrl` gọt ngoặc kép/khoảng trắng
//              và bảo toàn tham số Tab `gid` (`&gid=...`) khi chuyển sang GViz CSV.
//           3. [KEY-3] Tách rõ thông báo lỗi quyền Public/HTML/mạng vs Sheet không có
//              API Key hợp lệ trong `handleFetchApiKey`.
//           4. [KEY-4] Tách CSV/TSV linh hoạt (`\r\n`, `,`, `;`, `\t`, khoảng trắng,
//              BOM UTF-8, `Label:Key`), đồng bộ khóa `STORAGE_KEYS.API_KEY` tức thì &
//              dọn khóa legacy `'fc_apikey'` cũ; giữ nguyên 0/0/0/0 Radar & 0 tsc.
// ============================================================================

import { useEffect, useCallback, useRef } from 'react';
import * as XLSXNamespace from 'xlsx';
import {
  STORAGE_KEYS,
  DEFAULT_SHEETS,
  DEFAULT_API_KEY_SHEET
} from '@/config/constants';
import {
  Utils,
  setMasterDataCache,
  getMasterDataCache
} from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { fetchWithFallback as serviceFetchWithFallback } from '@/services/geminiApi';

// Danh sách 4 kho Master Data 9 Levels (Lưu trên IndexedDB + RAM Mirror 0ms)
const MASTER_DATA_KEYS = [
  'fc_master_data_en_vocab',
  'fc_master_data_en_sentence',
  'fc_master_data_zh_vocab',
  'fc_master_data_zh_sentence'
];

const MASTER_DATA_KEY_SET = new Set(MASTER_DATA_KEYS);

// Danh sách toàn bộ khóa dữ liệu nặng lưu trên IndexedDB (dùng cho Backup & Restore)
const INDEXED_DB_KEYS = [
  ...MASTER_DATA_KEYS,
  'fc_ai_harvest_pool',
  'fc_global_retry_bag',
  'fc_global_retry_bag_en',
  'fc_global_retry_bag_zh',
  'fc_notebook_en',
  'fc_notebook_zh',
  'fc_mastered_en',
  'fc_mastered_zh',
  'fc_incorrect_list_en',
  'fc_incorrect_list_zh',
  'fc_exam_pool',
  'fc_exam_ratio',
  'fc_user_exam_history'
];

const INDEXED_DB_KEY_SET = new Set(INDEXED_DB_KEYS);

// Các khóa tiếng Việt cũ đã khai tử (bỏ qua khi phục hồi file sao lưu cũ)
const DEPRECATED_VI_KEY_REGEX =
  /^fc_(?:data|current_level|current_topic|master_data|notebook|mastered|incorrect_list|global_retry_bag|ai_memory)_vi(?:$|_)/;

/**
 * Trích xuất thông điệp lỗi an toàn từ unknown (tránh ts(18046)).
 * @param {unknown} err
 * @returns {string}
 */
const getErrorMessage = (err) => {
  if (!err) return 'Unknown error';
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

// Chuẩn hóa ngôn ngữ học (chỉ hỗ trợ en | zh)
/**
 * @param {any} val
 * @returns {'en' | 'zh'}
 */
const normalizeLang = (val) => {
  const clean =
    typeof val === 'string'
      ? val.replace(/^["'\s]+|["'\s]+$/g, '').toLowerCase()
      : '';
  return clean === 'zh' ? 'zh' : 'en';
};

// Chuẩn hóa chế độ dữ liệu (chỉ hỗ trợ vocab | sentence)
/**
 * @param {any} val
 * @returns {'vocab' | 'sentence'}
 */
const normalizeDataMode = (val) => {
  const clean =
    typeof val === 'string' ? val.replace(/"/g, '').trim().toLowerCase() : '';
  return clean === 'sentence' ? 'sentence' : 'vocab';
};

// Chuẩn hóa chuỗi so khớp từ vựng (Unicode NFC, bỏ khoảng trắng thừa, không phân biệt hoa thường)
/**
 * @param {any} val
 * @returns {string}
 */
const normalizeTermKey = (val) =>
  String(val || '')
    .normalize('NFC')
    .trim()
    .toLowerCase();

// Kiểm tra đối tượng Master Data hợp lệ
/**
 * @param {any} obj
 * @returns {boolean}
 */
const isValidMasterDataObject = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.values(obj).some((arr) => Array.isArray(arr) && arr.length > 0);
};

// Trình lấy thư viện XLSX an toàn (Hỗ trợ cả ES Module lẫn Global Window, 0 lỗi tsc)
/**
 * @returns {any}
 */
const getXLSX = () => {
  const ns = /** @type {any} */ (XLSXNamespace);
  if (ns && typeof ns.read === 'function') return ns;
  if (ns?.default && typeof ns.default.read === 'function') {
    return ns.default;
  }
  if (typeof window !== 'undefined' && /** @type {any} */ (window).XLSX) {
    return /** @type {any} */ (window).XLSX;
  }
  return null;
};

// Trình gọi fetchWithFallback an toàn (dùng ES Module trực tiếp, không đọc window.Utils)
/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
const callFetchWithFallback = async (url, options = undefined) => {
  if (typeof serviceFetchWithFallback === 'function') {
    return options !== undefined
      ? await /** @type {any} */ (serviceFetchWithFallback)(url, options)
      : await /** @type {any} */ (serviceFetchWithFallback)(url);
  }
  return options !== undefined ? await fetch(url, options) : await fetch(url);
};

// Trình lấy FcDB trực tiếp từ ES Module (không phụ thuộc biến toàn cục window.FcDB)
/**
 * @returns {any}
 */
const getDb = () => FcDB || null;

// Kiểm tra URL Google Sheets dạng xuất bản Web (/d/e/2PACX-.../pub?output=csv)
/**
 * @param {any} rawUrl
 * @returns {boolean}
 */
const isPublishedSheetCsvUrl = (rawUrl) => {
  const trimmed = String(rawUrl || '').trim();
  return (
    /\/d\/e\//i.test(trimmed) ||
    trimmed.includes('/pub') ||
    trimmed.includes('output=csv')
  );
};

// Trích xuất Spreadsheet ID an toàn (chặn bắt nhầm chữ "e" từ link /d/e/2PACX-...)
/**
 * @param {any} rawUrl
 * @returns {string | null}
 */
const extractGoogleSheetId = (rawUrl) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || !trimmed.includes('docs.google.com')) return null;
  if (isPublishedSheetCsvUrl(trimmed)) return null;
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1] && match[1].length > 10) {
    return match[1];
  }
  return null;
};

// [KEY-2] Chuẩn hóa URL lấy API Key (gọt ngoặc kép rác, hỗ trợ cả Sheet chuẩn, Publish CSV & bảo toàn gid)
/**
 * @param {any} rawUrl
 * @returns {string}
 */
const resolveApiKeySheetFetchUrl = (rawUrl) => {
  const trimmed = String(rawUrl || '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
  if (!trimmed) return '';
  if (trimmed.includes('/gviz/tq') || isPublishedSheetCsvUrl(trimmed)) {
    return trimmed;
  }
  const sheetId = extractGoogleSheetId(trimmed);
  if (sheetId) {
    const gidMatch = trimmed.match(/[?#&]gid=(\d+)/i);
    const gidParam = gidMatch && gidMatch[1] ? `&gid=${gidMatch[1]}` : '';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gidParam}`;
  }
  return trimmed;
};

// [KEY-1] Kiểm tra chuỗi ứng viên có phải API Key Google/Gemini hợp lệ (hỗ trợ cả AIza* & AQ.*)
/**
 * @param {string} token
 * @returns {boolean}
 */
const isValidApiKeyCandidate = (token) => {
  if (!token || typeof token !== 'string') return false;
  // 1. Độ dài 20..256 ký tự, chỉ gồm chữ, số, dấu chấm '.', gạch dưới '_', gạch nối '-'
  if (!/^[A-Za-z0-9._-]{20,256}$/.test(token)) return false;
  // 2. Chặn dấu chấm ở đầu/cuối hoặc dấu chấm kép ".."
  if (token.startsWith('.') || token.endsWith('.') || token.includes('..')) {
    return false;
  }
  // 3. Bắt buộc có cả chữ cái và chữ số (loại tiêu đề cột thuần chữ & chuỗi ngày giờ thuần số)
  if (!/[A-Za-z]/.test(token) || !/\d/.test(token)) return false;
  // 4. Loại bỏ tên miền / tên tệp phổ biến lỡ ghi trong Sheet
  if (
    /\.(?:com|net|org|vn|io|dev|app|gov|edu|google|csv|tsv|xlsx|xls|json|txt|html|htm|pdf|doc|docx)$/i.test(
      token
    )
  ) {
    return false;
  }
  return true;
};

// [KEY-1 + KEY-4] Bóc tách và khử trùng lặp danh sách API Key từ văn bản CSV/TSV/Text
/**
 * @param {string} rawText
 * @returns {string[]}
 */
const extractApiKeysFromText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return [];
  const rawTokens = rawText
    .replace(/^\uFEFF/, '')
    .split(/[\r\n,;\t\s"'()[\]{}<>]+/);

  /** @type {Set<string>} */
  const uniqueKeys = new Set();

  for (const rawToken of rawTokens) {
    const token = rawToken.trim();
    if (!token || token.includes('/')) continue;

    if (token.includes(':') || token.includes('=')) {
      const subParts = token.split(/[:=]+/);
      for (const part of subParts) {
        const cleanPart = part.trim();
        if (isValidApiKeyCandidate(cleanPart)) {
          uniqueKeys.add(cleanPart);
        }
      }
    } else if (isValidApiKeyCandidate(token)) {
      uniqueKeys.add(token);
    }
  }

  return Array.from(uniqueKeys);
};

// Kiểm tra đường dẫn trỏ tới tệp Excel (.xlsx / .xls) kể cả khi có query string
/**
 * @param {any} rawUrl
 * @returns {boolean}
 */
const isExcelUrl = (rawUrl) =>
  /\.xlsx?(?:$|[?#])/i.test(String(rawUrl || '').trim());

// Tạo chữ ký nội dung đặc trưng cho danh sách thẻ để phát hiện GViz trả trùng Tab 1
/**
 * @param {any} cards
 * @returns {string}
 */
const buildCardsSignature = (cards) => {
  if (!Array.isArray(cards) || cards.length === 0) return '';
  const sampleIndices = [
    0,
    1,
    2,
    Math.floor(cards.length / 2),
    cards.length - 1
  ];
  /** @type {string[]} */
  const parts = [];
  const seenIdx = new Set();
  sampleIndices.forEach((idx) => {
    if (idx >= 0 && idx < cards.length && !seenIdx.has(idx)) {
      seenIdx.add(idx);
      const c = cards[idx] || {};
      parts.push(
        `${String(c.term || '').trim()}|${String(c.definition || '').trim()}`
      );
    }
  });
  return `${cards.length}::${parts.join('||')}`;
};

// Xác định chỉ số cấp độ chuẩn (1..9) cho 1 tab trong Workbook Excel, tránh đè khóa
/**
 * @param {string} sheetName
 * @param {number} tabIndex
 * @param {string} levelPrefix
 * @param {Record<string, any>} masterData
 * @returns {string}
 */
const resolveWorkbookLevelKey = (
  sheetName,
  tabIndex,
  levelPrefix,
  masterData
) => {
  const matchLvl = String(sheetName || '').match(/\d+/);
  if (matchLvl) {
    const parsedNum = parseInt(matchLvl[0], 10);
    if (parsedNum >= 1 && parsedNum <= 9) {
      const preferredKey = `${levelPrefix}${parsedNum}`;
      if (!masterData[preferredKey]) return preferredKey;
    }
  }
  const indexKey = `${levelPrefix}${Math.min(tabIndex + 1, 9)}`;
  if (!masterData[indexKey]) return indexKey;
  for (let slot = 1; slot <= 9; slot++) {
    const candidate = `${levelPrefix}${slot}`;
    if (!masterData[candidate]) return candidate;
  }
  return indexKey;
};

// Trích xuất tối đa 9 Tabs từ Workbook Excel thành Master Data phân theo Level
/**
 * @param {any} workbook
 * @param {any} XLSXLib
 * @param {'en' | 'zh'} targetLang
 * @returns {{ masterData: Record<string, any>, totalCards: number, numTabs: number }}
 */
const extractMasterDataFromWorkbook = (workbook, XLSXLib, targetLang) => {
  /** @type {Record<string, any>} */
  const masterData = {};
  let totalCards = 0;
  const levelPrefix = targetLang === 'zh' ? 'zh_level_' : 'en_level_';
  const sheetNames = Array.isArray(workbook?.SheetNames)
    ? workbook.SheetNames
    : [];
  const numTabs = Math.min(sheetNames.length, 9);

  for (let i = 0; i < numTabs; i++) {
    const sheetName = sheetNames[i];
    const sheet = workbook.Sheets?.[sheetName];
    if (!sheet) continue;
    const rows = XLSXLib.utils.sheet_to_json(sheet, { header: 1 });
    const parsedCards = Utils.convertRawRowsToCards(rows);
    if (parsedCards.length > 0) {
      const levelKey = resolveWorkbookLevelKey(
        sheetName,
        i,
        levelPrefix,
        masterData
      );
      masterData[levelKey] = parsedCards;
      totalCards += parsedCards.length;
    }
  }

  return { masterData, totalCards, numTabs };
};

// Fetch kèm timeout an toàn giúp các Proxy Node chết không treo tiến trình
/**
 * @param {string} url
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<Response>}
 */
const fetchWithTimeout = async (url, timeoutMs = 15000) => {
  if (typeof AbortController === 'undefined') {
    return await fetch(url);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Hook quản lý Nhập/Xuất dữ liệu, Đồng bộ Kho Master Lai & Sao lưu/Phục hồi Full FcDB.
 * @param {Record<string, any>} core
 * @param {any} latestStateRef
 * @param {{ t?: (key: string) => string, showToast?: (msg: string, type?: string) => void }} [callbacks={}]
 */
export const useDataIO = (core, latestStateRef, callbacks = {}) => {
  const { t, showToast } = callbacks;

  // Giữ tham chiếu core mới nhất trong Ref để triệt tiêu 100% Stale Closure sau các lệnh await
  const coreRef = useRef(core);
  coreRef.current = core;

  // Bộ đếm tác vụ I/O song song chống tắt sớm vòng quay Loading khi bấm nạp đè
  const pendingIoCountRef = useRef(0);

  const beginLoading = useCallback(() => {
    pendingIoCountRef.current += 1;
    const liveCore = coreRef.current;
    if (typeof liveCore?.setIsAiLoading === 'function') {
      liveCore.setIsAiLoading(true);
    }
  }, []);

  const endLoading = useCallback(() => {
    pendingIoCountRef.current = Math.max(0, pendingIoCountRef.current - 1);
    if (pendingIoCountRef.current === 0) {
      const liveCore = coreRef.current;
      if (typeof liveCore?.setIsAiLoading === 'function') {
        liveCore.setIsAiLoading(false);
      }
    }
  }, []);

  // ==================================================================================
  // 1. HỆ THỐNG DỌN RÁC BỘ NHỚ (GARBAGE COLLECTION)
  // ==================================================================================
  useEffect(() => {
    const runGarbageCollector = () => {
      if (typeof localStorage === 'undefined') return;
      try {
        const now = Date.now();
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

        // Dọn các bản Master Data cũ còn sót trên localStorage nếu đã có trong RAM Mirror / IndexedDB
        MASTER_DATA_KEYS.forEach((mKey) => {
          try {
            if (
              getMasterDataCache(mKey, null) &&
              localStorage.getItem(mKey) !== null
            ) {
              localStorage.removeItem(mKey);
            }
          } catch {
            // Bỏ qua lỗi xóa storage
          }
        });

        let totalSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          totalSize += key.length + (localStorage.getItem(key) || '').length;
        }

        // Nếu dung lượng vượt ngưỡng 4MB, kích hoạt chế độ khẩn cấp
        const isEmergency = totalSize > 4 * 1024 * 1024;
        const sessionsStr = localStorage.getItem('fc_game_sessions');

        if (sessionsStr) {
          try {
            let sessions = JSON.parse(sessionsStr);
            let sessionChanged = false;

            if (
              !sessions ||
              typeof sessions !== 'object' ||
              Array.isArray(sessions)
            ) {
              sessions = {};
              sessionChanged = true;
            } else if (isEmergency) {
              sessions = {};
              sessionChanged = true;
            } else {
              Object.keys(sessions).forEach((langKey) => {
                const langSessions = sessions[langKey];
                if (
                  langSessions &&
                  typeof langSessions === 'object' &&
                  !Array.isArray(langSessions)
                ) {
                  Object.keys(langSessions).forEach((gameType) => {
                    const session = langSessions[gameType];
                    if (
                      session &&
                      typeof session.timestamp === 'number' &&
                      now - session.timestamp > THREE_DAYS
                    ) {
                      delete langSessions[gameType];
                      sessionChanged = true;
                    }
                  });
                  if (Object.keys(langSessions).length === 0) {
                    delete sessions[langKey];
                    sessionChanged = true;
                  }
                }
              });
            }

            if (sessionChanged) {
              Utils.safeLocalStorageSet('fc_game_sessions', sessions);
            }
          } catch {
            // Bỏ qua JSON lỗi ở fc_game_sessions
          }
        }

        const chatStr = localStorage.getItem('fc_ai_chat_history');
        if (chatStr) {
          try {
            let chatHistory = JSON.parse(chatStr);
            if (Array.isArray(chatHistory)) {
              if (isEmergency) {
                chatHistory = chatHistory.slice(-1);
                Utils.safeLocalStorageSet('fc_ai_chat_history', chatHistory);
              } else if (chatHistory.length > 20) {
                chatHistory = chatHistory.slice(-20);
                Utils.safeLocalStorageSet('fc_ai_chat_history', chatHistory);
              }
            }
          } catch {
            // Bỏ qua JSON lỗi ở fc_ai_chat_history
          }
        }
      } catch (e) {
        console.error('Garbage Collector Failed:', getErrorMessage(e));
      }
    };

    const gcTimer = setTimeout(() => {
      runGarbageCollector();
    }, 2000);

    return () => clearTimeout(gcTimer);
  }, []);

  // ==================================================================================
  // 2. CÁC HÀM TIỆN ÍCH FILE SYSTEM
  // ==================================================================================
  const fallbackCopy = useCallback(
    /** @param {string} text */
    (text) => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          if (typeof showToast === 'function') {
            showToast(
              typeof t === 'function' ? t('syncSuccess') : 'Đã sao chép!'
            );
          }
        } else if (typeof showToast === 'function') {
          showToast('Trình duyệt chặn copy. Hãy copy thủ công.', 'error');
        }
      } catch (err) {
        if (typeof showToast === 'function') {
          showToast('Lỗi copy: ' + getErrorMessage(err), 'error');
        }
      }
    },
    [showToast, t]
  );

  const secureCopy = useCallback(
    /** @param {string} text */
    (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            if (typeof showToast === 'function') {
              showToast(
                typeof t === 'function' ? t('syncSuccess') : 'Đã sao chép!'
              );
            }
          })
          .catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    },
    [fallbackCopy, showToast, t]
  );

  // ==================================================================================
  // 3. ĐỘNG CƠ TẢI DỮ LIỆU GOOGLE SHEETS (7-PROXY XLSX & GVIZ CHỐNG NHÂN BẢN TAB 1)
  // ==================================================================================
  // Cách 1: Tải qua Proxy (Lấy toàn bộ file Excel nguyên khối giữ nguyên tên & số lượng Tab)
  /**
   * @param {string} url
   * @returns {Promise<ArrayBuffer>}
   */
  const safeFetchExcel = async (url) => {
    const cleanUrl = String(url || '').trim();
    const sheetId = extractGoogleSheetId(cleanUrl);
    if (!sheetId) {
      throw new Error('Link không hợp lệ. Không tìm thấy ID của Google Sheet.');
    }
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    const cacheBuster = `&cb=${Date.now()}`;

    // Mạng lưới 7 Node Proxy bọc thép xuyên thủng CORS
    const proxies = [
      { name: 'Direct', url: exportUrl },
      {
        name: 'AllOrigins',
        url: `https://api.allorigins.win/raw?url=${encodeURIComponent(
          exportUrl + cacheBuster
        )}`
      },
      {
        name: 'CorsProxyIO',
        url: `https://corsproxy.io/?${encodeURIComponent(
          exportUrl + cacheBuster
        )}`
      },
      {
        name: 'ThingProxy',
        url: `https://thingproxy.freeboard.io/fetch/${exportUrl}`
      },
      {
        name: 'CodeTabs',
        url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(
          exportUrl
        )}`
      },
      {
        name: 'CorsAnywhere',
        url: `https://cors-anywhere.herokuapp.com/${exportUrl}`
      },
      { name: 'CorsSH', url: `https://proxy.cors.sh/${exportUrl}` }
    ];

    for (const proxy of proxies) {
      try {
        const res = await fetchWithTimeout(proxy.url, 15000);
        if (!res || !res.ok) throw new Error(`HTTP ${res?.status || 'ERR'}`);
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 100) {
          throw new Error('File quá nhỏ, lỗi chặn kết nối.');
        }
        const header = new Uint8Array(buffer).subarray(0, 2);
        // Kiểm tra chữ ký ZIP (PK) của định dạng .xlsx
        if (header[0] !== 0x50 || header[1] !== 0x4b) {
          throw new Error(
            "LỖI QUYỀN TRUY CẬP: Hãy chắc chắn Link Google Sheet của bạn đã bật quyền 'Bất kỳ ai có liên kết' (Anyone with the link)."
          );
        }
        return buffer;
      } catch (e) {
        const errMsg = getErrorMessage(e);
        console.warn(
          `[Excel Proxy Fallback] ${proxy.name} thất bại, thử node tiếp theo...`
        );
        if (errMsg.includes('LỖI QUYỀN TRUY CẬP')) throw e;
      }
    }
    throw new Error('Mạng bị chặn Proxy. Sẽ tự động chuyển sang GViz...');
  };

  // Cách 2: Quét từng Tab trực tiếp bằng Google GViz có Bộ lọc Chữ ký, Batch 3x & Ngắt sớm
  /**
   * @param {string} sheetId
   * @param {any} targetLang
   * @returns {Promise<{ masterData: Record<string, any>, totalCards: number, flatItems: any[] }>}
   */
  const fetchDirectGvizTabs = async (sheetId, targetLang) => {
    /** @type {any[]} */
    let allNewItems = [];
    /** @type {Record<string, any>} */
    const masterDataObj = {};
    let total = 0;
    const safeLang = normalizeLang(targetLang);
    const levelPrefix = safeLang === 'zh' ? 'zh_level_' : 'en_level_';

    // Trả về 3 trạng thái rõ ràng để phân biệt Tab trống vs Sheet bị khóa Private (HTML/HTTP error)
    /**
     * @param {string} gvizUrl
     * @returns {Promise<{ status: 'ok' | 'empty_csv' | 'blocked', cards: any[] | null }>}
     */
    const fetchTabDetailedByUrl = async (gvizUrl) => {
      try {
        const res = await callFetchWithFallback(gvizUrl);
        if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
          return { status: 'blocked', cards: null };
        }
        const text = await res.text();
        const trimmedText = String(text || '').trim();
        if (!trimmedText || trimmedText.startsWith('<')) {
          return { status: 'blocked', cards: null };
        }
        const parsed = Utils.parseAndMapCSV(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { status: 'ok', cards: parsed };
        }
        return { status: 'empty_csv', cards: [] };
      } catch {
        return { status: 'blocked', cards: null };
      }
    };

    /**
     * @param {string} sheetName
     */
    const fetchTabDetailed = async (sheetName) => {
      const encodedName = encodeURIComponent(sheetName);
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedName}`;
      return await fetchTabDetailedByUrl(gvizUrl);
    };

    // Bước 0: Thăm dò Tab mặc định — nếu bị khóa quyền (Private/HTML), ngắt tức thì với 0 request thừa
    const defaultUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const defaultRes = await fetchTabDetailedByUrl(defaultUrl);
    if (defaultRes.status === 'blocked') {
      return { masterData: masterDataObj, totalCards: 0, flatItems: [] };
    }
    /** @type {any[] | null} */
    const defaultCards = defaultRes.status === 'ok' ? defaultRes.cards : null;
    const defaultSig = buildCardsSignature(defaultCards);

    // Mẫu đặt tên Tab phổ biến theo ngôn ngữ
    /**
     * @param {number} idx
     * @returns {Array<{ id: string, name: string }>}
     */
    const getCandidatePatterns = (idx) => {
      const pad = idx < 10 ? `0${idx}` : `${idx}`;
      if (safeLang === 'zh') {
        return [
          { id: 'hsk_space', name: `HSK ${idx}` },
          { id: 'hsk_tight', name: `HSK${idx}` },
          { id: 'hsk_pad', name: `HSK${pad}` },
          { id: 'level_pad', name: `Level${pad}` },
          { id: 'level_space', name: `Level ${idx}` },
          { id: 'level_tight', name: `Level${idx}` },
          { id: 'sheet_tight', name: `Sheet${idx}` },
          { id: 'sheet_space', name: `Sheet ${idx}` }
        ];
      }
      return [
        { id: 'level_pad', name: `Level${pad}` },
        { id: 'level_space', name: `Level ${idx}` },
        { id: 'level_tight', name: `Level${idx}` },
        { id: 'lop_space', name: `Lớp ${idx}` },
        { id: 'grade_space', name: `Grade ${idx}` },
        { id: 'sheet_tight', name: `Sheet${idx}` },
        { id: 'sheet_space', name: `Sheet ${idx}` }
      ];
    };

    const seenSignatures = new Set();
    /** @type {string | null} */
    let matchedPatternId = null;
    let consecutiveMisses = 0;
    const BATCH_SIZE = 3;

    /**
     * @param {number} levelIdx
     * @param {any[] | null} cards
     * @returns {string | null}
     */
    const isAcceptedForLevel = (levelIdx, cards) => {
      if (!Array.isArray(cards) || cards.length === 0) return null;
      const sig = buildCardsSignature(cards);
      if (
        levelIdx > 1 &&
        (seenSignatures.has(sig) || (defaultSig && sig === defaultSig))
      ) {
        return null;
      }
      return sig;
    };

    for (let i = 1; i <= 9; i++) {
      const candidates = getCandidatePatterns(i);
      /** @type {{ candidate: { id: string, name: string }, cards: any[], sig: string } | null} */
      let foundEntry = null;

      // Ưu tiên bắn 1 request duy nhất cho mẫu tên tab vừa khớp ở vòng trước
      let remainingCandidates = candidates;
      if (matchedPatternId) {
        const preferred = candidates.find((c) => c.id === matchedPatternId);
        if (preferred) {
          const prefRes = await fetchTabDetailed(preferred.name);
          if (prefRes.status === 'ok' && prefRes.cards) {
            const acceptedSig = isAcceptedForLevel(i, prefRes.cards);
            if (acceptedSig) {
              foundEntry = {
                candidate: preferred,
                cards: prefRes.cards,
                sig: acceptedSig
              };
            }
          }
          remainingCandidates = candidates.filter(
            (c) => c.id !== matchedPatternId
          );
        }
      }

      // Quét các mẫu còn lại theo batch nhỏ 3 request song song (tăng tốc 3-5x, tránh rate-limit 429)
      if (!foundEntry) {
        for (let b = 0; b < remainingCandidates.length; b += BATCH_SIZE) {
          const batch = remainingCandidates.slice(b, b + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async (candidate) => ({
              candidate,
              res: await fetchTabDetailed(candidate.name)
            }))
          );

          for (const item of batchResults) {
            if (item.res.status !== 'ok' || !item.res.cards) continue;
            const acceptedSig = isAcceptedForLevel(i, item.res.cards);
            if (acceptedSig) {
              foundEntry = {
                candidate: item.candidate,
                cards: item.res.cards,
                sig: acceptedSig
              };
              break;
            }
          }

          if (foundEntry) break;
        }
      }

      if (foundEntry) {
        consecutiveMisses = 0;
        seenSignatures.add(foundEntry.sig);
        if (i > 1) {
          matchedPatternId = foundEntry.candidate.id;
        }
        masterDataObj[`${levelPrefix}${i}`] = foundEntry.cards;
        total += foundEntry.cards.length;
        allNewItems = allNewItems.concat(foundEntry.cards);
      } else if (i >= 2) {
        consecutiveMisses += 1;
        // Dừng sớm nếu 2 cấp độ liên tiếp không có tab mới khác Tab 1
        if (consecutiveMisses >= 2) {
          break;
        }
      }
    }

    // Fallback cuối cùng nếu Sheet chỉ có 1 tab tên tùy chỉnh (VD: "Trang tính 1", "Data")
    if (total === 0 && defaultCards && defaultCards.length > 0) {
      masterDataObj[`${levelPrefix}1`] = defaultCards;
      total = defaultCards.length;
      allNewItems = [...defaultCards];
    }

    return {
      masterData: masterDataObj,
      totalCards: total,
      flatItems: allNewItems
    };
  };

  // ==================================================================================
  // 3.5. BỘ ĐỒNG BỘ DỮ LIỆU VỚI KHO MASTER LAI (INDEXEDDB + RAM MIRROR 0MS + VÒI NƯỚC)
  // ==================================================================================
  /**
   * @param {Record<string, any>} masterData
   * @param {any} [sourceType='vocab']
   * @param {any} [targetLangOverride=null]
   * @returns {Promise<boolean>}
   */
  const syncMasterDataToActiveView = async (
    masterData,
    sourceType = 'vocab',
    targetLangOverride = null
  ) => {
    if (!isValidMasterDataObject(masterData)) return false;

    const liveCore = coreRef.current || core;
    const liveRefState = latestStateRef?.current || {};
    const activeLang = normalizeLang(
      targetLangOverride || liveRefState.lang || liveCore.lang
    );
    const safeSourceType = normalizeDataMode(sourceType);
    const storageKey = `fc_master_data_${activeLang}_${safeSourceType}`;

    // 1. Nạp ngay vào RAM Mirror 0ms để toàn bộ 85 files (Controls, Vòi nước, Engines) đọc tức thì
    const ramSaved = setMasterDataCache(storageKey, masterData);
    if (!ramSaved) return false;

    // 2. Lưu bền vững xuống IndexedDB (FcDB) — triệt tiêu hoàn toàn giới hạn 5MB localStorage
    let persisted = false;
    const dbInstance = getDb();
    if (dbInstance) {
      try {
        if (typeof dbInstance.init === 'function') {
          await dbInstance.init();
        }
        await dbInstance.set(storageKey, masterData);
        persisted = true;
        // Dọn sạch bản cũ (nếu có) khỏi localStorage để giải phóng Quota
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            // Bỏ qua lỗi quyền truy cập
          }
        }
      } catch (dbErr) {
        console.warn(
          `[DataIO] IndexedDB persist failed (${storageKey}):`,
          getErrorMessage(dbErr)
        );
      }
    }

    // Fallback nếu FcDB không khả dụng
    if (!persisted) {
      persisted = Utils.safeLocalStorageSet(storageKey, masterData);
    }

    // 3. Đồng bộ tức thì với giao diện nếu loại dữ liệu vừa nạp khớp với Ngôn ngữ & Chế độ đang xem
    const currentUiLang = normalizeLang(liveRefState.lang || liveCore.lang);
    const activeDataMode = normalizeDataMode(
      liveRefState.dataMode ?? liveCore.dataMode
    );
    const isStudyingNotebook = Boolean(
      liveRefState.isStudyingNotebook ?? liveCore.isStudyingNotebook
    );
    const studySourceName =
      liveRefState.studySourceName ?? liveCore.studySourceName;

    if (
      activeLang === currentUiLang &&
      safeSourceType === activeDataMode &&
      !isStudyingNotebook &&
      !studySourceName
    ) {
      const rawLevels = liveRefState.currentLevel ?? liveCore.currentLevel;
      const rawTopics = liveRefState.currentTopic ?? liveCore.currentTopic;
      const levelsArr = Array.isArray(rawLevels)
        ? rawLevels
        : rawLevels
          ? [rawLevels]
          : [];
      const topicsArr = Array.isArray(rawTopics)
        ? rawTopics
        : rawTopics
          ? [rawTopics]
          : [];

      /** @type {any[]} */
      let targetCards = [];
      if (levelsArr.length === 0) {
        Object.values(masterData).forEach((arr) => {
          if (Array.isArray(arr)) targetCards = targetCards.concat(arr);
        });
      } else {
        levelsArr.forEach((lv) => {
          if (masterData[lv] && Array.isArray(masterData[lv])) {
            targetCards = targetCards.concat(masterData[lv]);
          }
        });
      }

      // Nếu Level đang chọn không có thẻ trong bộ mới nạp -> Tự động chuyển sang Level đầu tiên có dữ liệu
      if (targetCards.length === 0) {
        const availableLevels = Object.keys(masterData).filter(
          (k) => Array.isArray(masterData[k]) && masterData[k].length > 0
        );
        if (availableLevels.length > 0) {
          const fallbackLvl = availableLevels[0];
          targetCards = [...masterData[fallbackLvl]];
          if (typeof liveCore.setCurrentLevel === 'function') {
            liveCore.setCurrentLevel([fallbackLvl]);
          }
        }
      }

      // Lọc theo Topic đang chọn — nếu không tồn tại trong bộ mới nạp thì mở khóa bộ lọc Topic
      if (topicsArr.length > 0 && targetCards.length > 0) {
        const topicFiltered = targetCards.filter((c) =>
          topicsArr.includes(c.topic)
        );
        if (topicFiltered.length > 0) {
          targetCards = topicFiltered;
        } else if (typeof liveCore.setCurrentTopic === 'function') {
          liveCore.setCurrentTopic([]);
        }
      }

      // Fallback trực tiếp nếu bản useCoreState chưa có tín hiệu bumpMasterDataVersion
      if (typeof liveCore.bumpMasterDataVersion !== 'function') {
        liveCore.setCards(targetCards);
        Utils.safeLocalStorageSet('fc_data_' + activeLang, targetCards);
        if (typeof liveCore.setCurrentCardIndex === 'function') {
          liveCore.setCurrentCardIndex(0);
        }
        if (typeof liveCore.setIsFlipped === 'function') {
          liveCore.setIsFlipped(false);
        }
      }
    }

    // 4. Luôn phát tín hiệu phiên bản mới để Động cơ Vòi nước & các Dropdown tự động cập nhật 0ms
    if (typeof liveCore.bumpMasterDataVersion === 'function') {
      liveCore.bumpMasterDataVersion();
    }

    return persisted;
  };

  // ==================================================================================
  // 4. IMPORT / EXPORT ĐA TẦNG (MULTI-DIMENSIONAL DATA SYNC)
  // ==================================================================================
  /**
   * @param {string} url
   * @param {any} [sourceType='vocab']
   */
  const handleImport = async (url, sourceType = 'vocab') => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) {
      if (typeof showToast === 'function') {
        showToast('Vui lòng nhập URL!', 'error');
      }
      return;
    }

    const liveCore = coreRef.current || core;
    const importLang = normalizeLang(liveCore.lang);
    const safeSourceType = normalizeDataMode(sourceType);
    const levelPrefix = importLang === 'zh' ? 'zh_level_' : 'en_level_';

    beginLoading();
    try {
      /** @type {Record<string, any>} */
      let masterData = {};
      let totalCards = 0;
      const XLSXLib = getXLSX();
      const sheetId = extractGoogleSheetId(cleanUrl);

      if (sheetId) {
        let useGvizFallback = false;

        try {
          const buffer = await safeFetchExcel(cleanUrl);
          if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
          const workbook = XLSXLib.read(buffer, { type: 'array' });
          const extracted = extractMasterDataFromWorkbook(
            workbook,
            XLSXLib,
            importLang
          );
          masterData = extracted.masterData;
          totalCards = extracted.totalCards;
        } catch (err) {
          const errMsg = getErrorMessage(err);
          if (errMsg.includes('LỖI QUYỀN TRUY CẬP')) {
            throw err;
          }
          console.warn('Proxy XLSX Failed, fallback to GViz:', errMsg);
          useGvizFallback = true;
        }

        if (useGvizFallback) {
          if (typeof showToast === 'function') {
            showToast(
              'Mạng đang chặn Proxy, chuyển sang kết nối trực tiếp Google...',
              'info'
            );
          }
          const { masterData: gvizData, totalCards: gvizTotal } =
            await fetchDirectGvizTabs(sheetId, importLang);
          if (gvizTotal > 0) {
            masterData = gvizData;
            totalCards = gvizTotal;
          } else {
            throw new Error(
              'Không thể tải file (File chưa được chia sẻ Public).'
            );
          }
        }
      } else if (isExcelUrl(cleanUrl)) {
        const res = await callFetchWithFallback(cleanUrl);
        if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
          throw new Error(
            `Không thể tải tệp Excel (HTTP ${res?.status || 'ERR'})`
          );
        }
        const arrayBuffer = await res.arrayBuffer();
        if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
        const workbook = XLSXLib.read(arrayBuffer, { type: 'array' });
        const extracted = extractMasterDataFromWorkbook(
          workbook,
          XLSXLib,
          importLang
        );
        masterData = extracted.masterData;
        totalCards = extracted.totalCards;
      } else {
        // Hỗ trợ link CSV trực tiếp và link Google Sheets Publish-to-Web (/d/e/2PACX-.../pub?output=csv)
        const res = await callFetchWithFallback(cleanUrl);
        if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
          throw new Error(
            `Không thể tải tệp CSV (HTTP ${res?.status || 'ERR'})`
          );
        }
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) {
          throw new Error(
            'Đường dẫn trả về HTML thay vì dữ liệu CSV (Kiểm tra lại quyền chia sẻ Public).'
          );
        }
        const parsedCards = Utils.parseAndMapCSV(text);
        if (parsedCards.length > 0) {
          masterData[`${levelPrefix}1`] = parsedCards;
          totalCards = parsedCards.length;
        }
      }

      if (totalCards > 0) {
        const savedOk = await syncMasterDataToActiveView(
          masterData,
          safeSourceType,
          importLang
        );
        const tabCount = Object.keys(masterData).length;
        const modeLabel = safeSourceType === 'sentence' ? 'Câu Văn' : 'Từ Vựng';
        if (savedOk) {
          if (typeof showToast === 'function') {
            showToast(
              `Đã nạp thành công ${totalCards} thẻ ${modeLabel} (${tabCount} Level)!`,
              'success'
            );
          }
          (coreRef.current || liveCore).setShowLinkManager(false);
        } else if (typeof showToast === 'function') {
          showToast(
            `Đã tải ${totalCards} thẻ vào RAM nhưng không thể lưu bền vững vào bộ nhớ trình duyệt!`,
            'warning'
          );
        }
      } else {
        throw new Error('Không tìm thấy dữ liệu hợp lệ');
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi nạp Dữ liệu: ' + getErrorMessage(e), 'error');
      }
    } finally {
      endLoading();
    }
  };

  /**
   * @param {string} url
   */
  const handleImportToNotebook = async (url) => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) {
      if (typeof showToast === 'function') {
        showToast('Vui lòng nhập URL!', 'error');
      }
      return;
    }

    const liveCore = coreRef.current || core;
    const targetLang = normalizeLang(liveCore.lang);
    beginLoading();
    try {
      /** @type {any[]} */
      let allNewItems = [];
      const XLSXLib = getXLSX();
      const sheetId = extractGoogleSheetId(cleanUrl);

      if (sheetId) {
        let useGvizFallback = false;

        try {
          const buffer = await safeFetchExcel(cleanUrl);
          if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
          const workbook = XLSXLib.read(buffer, { type: 'array' });
          for (let i = 0; i < workbook.SheetNames.length; i++) {
            const sheetName = workbook.SheetNames[i];
            const rows = XLSXLib.utils.sheet_to_json(
              workbook.Sheets[sheetName],
              { header: 1 }
            );
            const parsedCards = Utils.convertRawRowsToCards(rows);
            allNewItems = allNewItems.concat(parsedCards);
          }
        } catch (err) {
          const errMsg = getErrorMessage(err);
          if (errMsg.includes('LỖI QUYỀN TRUY CẬP')) {
            throw err;
          }
          useGvizFallback = true;
        }

        if (useGvizFallback) {
          const { flatItems } = await fetchDirectGvizTabs(sheetId, targetLang);
          if (flatItems.length > 0) {
            allNewItems = flatItems;
          } else {
            throw new Error(
              'Không thể tải file (File chưa được chia sẻ Public).'
            );
          }
        }
      } else if (isExcelUrl(cleanUrl)) {
        // Hỗ trợ tải trực tiếp link .xlsx ngoài (không qua safeFetchExcel vốn chỉ dành cho Google Sheet ID)
        const res = await callFetchWithFallback(cleanUrl);
        if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
          throw new Error(`HTTP ${res?.status || 'ERR'}`);
        }
        const buffer = await res.arrayBuffer();
        if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
        const workbook = XLSXLib.read(buffer, { type: 'array' });
        for (let i = 0; i < workbook.SheetNames.length; i++) {
          const sheetName = workbook.SheetNames[i];
          const rows = XLSXLib.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1
          });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          allNewItems = allNewItems.concat(parsedCards);
        }
      } else {
        const res = await callFetchWithFallback(cleanUrl);
        if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
          throw new Error(`HTTP ${res?.status || 'ERR'}`);
        }
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) {
          throw new Error('Dữ liệu trả về không phải CSV hợp lệ.');
        }
        allNewItems = Utils.parseAndMapCSV(text);
      }

      if (allNewItems.length > 0) {
        const currentCore = coreRef.current || liveCore;
        const dbInstance = getDb();
        if (dbInstance && typeof dbInstance.init === 'function') {
          try {
            await dbInstance.init();
          } catch (initErr) {
            console.warn(
              '[DataIO] FcDB init before notebook merge failed:',
              getErrorMessage(initErr)
            );
          }
        }

        // [S18] Chống trùng lặp chuẩn Unicode NFC + case-insensitive trong chính nguồn vừa tải & sổ tay hiện tại
        /**
         * @param {any[]} existingList
         */
        const mergeUnique = (existingList) => {
          const safeExisting = Array.isArray(existingList) ? existingList : [];
          const existingTerms = new Set(
            safeExisting.map((i) => normalizeTermKey(i?.term))
          );
          /** @type {any[]} */
          const uniqueItems = [];
          allNewItems.forEach((item) => {
            const key = normalizeTermKey(item?.term);
            if (key && !existingTerms.has(key)) {
              existingTerms.add(key);
              uniqueItems.push(item);
            }
          });
          return {
            uniqueItems,
            updated: [...safeExisting, ...uniqueItems]
          };
        };

        const isSameLang = normalizeLang(currentCore.lang) === targetLang;
        /** @type {any[]} */
        let baseNotebook = [];

        if (isSameLang) {
          const latestNote = latestStateRef?.current?.notebook;
          baseNotebook = Array.isArray(latestNote)
            ? latestNote
            : Array.isArray(currentCore.notebook)
              ? currentCore.notebook
              : [];
        } else if (dbInstance) {
          const existingDbNote = await dbInstance.get(
            'fc_notebook_' + targetLang
          );
          baseNotebook = Array.isArray(existingDbNote) ? existingDbNote : [];
        }

        // Tính toán & thực thi side-effect hoàn toàn bên ngoài React setState updater (StrictMode-safe)
        const { uniqueItems, updated } = mergeUnique(baseNotebook);

        if (uniqueItems.length === 0) {
          if (typeof showToast === 'function') {
            showToast('Tất cả từ trong link đã có trong sổ tay!', 'info');
          }
        } else {
          if (isSameLang) {
            currentCore.setNotebook(updated);
          }
          if (dbInstance) {
            try {
              await dbInstance.set('fc_notebook_' + targetLang, updated);
            } catch (saveErr) {
              console.warn(
                '[DataIO] Save notebook failed:',
                getErrorMessage(saveErr)
              );
            }
          }
          if (typeof showToast === 'function') {
            showToast(
              isSameLang
                ? `Đã gộp ${uniqueItems.length} thẻ mới vào Sổ tay!`
                : `Đã gộp ${uniqueItems.length} thẻ mới vào Sổ tay (${targetLang.toUpperCase()})!`,
              'success'
            );
          }
        }

        currentCore.setShowLinkManager(false);
      } else {
        throw new Error('Dữ liệu trống');
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi nhập vào sổ tay: ' + getErrorMessage(e), 'error');
      }
    } finally {
      endLoading();
    }
  };

  /**
   * @param {any} e
   * @param {any} [sourceType='vocab']
   */
  const handleFileImport = (e, sourceType = 'vocab') => {
    const inputEl = e?.target;
    const file = inputEl?.files?.[0];
    if (!file) return;

    const liveCore = coreRef.current || core;
    const importLang = normalizeLang(liveCore.lang);
    const safeSourceType = normalizeDataMode(sourceType);
    const isCsvFile = /\.(?:csv|tsv|txt)$/i.test(file.name || '');

    beginLoading();
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        /** @type {Record<string, any>} */
        let masterData = {};
        let totalCards = 0;
        let numTabs = 1;
        const resultData = evt?.target?.result;

        if (isCsvFile) {
          const text = typeof resultData === 'string' ? resultData : '';
          const parsedCards = Utils.parseAndMapCSV(text);
          if (parsedCards.length > 0) {
            const levelPrefix = importLang === 'zh' ? 'zh_level_' : 'en_level_';
            masterData[`${levelPrefix}1`] = parsedCards;
            totalCards = parsedCards.length;
          }
        } else {
          const XLSXLib = getXLSX();
          if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
          if (!resultData) throw new Error('Nội dung tệp Excel bị trống');
          const wb = XLSXLib.read(resultData, { type: 'array' });
          const extracted = extractMasterDataFromWorkbook(
            wb,
            XLSXLib,
            importLang
          );
          masterData = extracted.masterData;
          totalCards = extracted.totalCards;
          numTabs = extracted.numTabs;
        }

        if (totalCards > 0) {
          const savedOk = await syncMasterDataToActiveView(
            masterData,
            safeSourceType,
            importLang
          );
          if (savedOk) {
            if (typeof showToast === 'function') {
              showToast(
                isCsvFile
                  ? `Đã tải lên thành công ${totalCards} thẻ (.csv)!`
                  : `Đã tải lên thành công ${totalCards} thẻ từ ${numTabs} Tabs (.xlsx)!`,
                'success'
              );
            }
          } else if (typeof showToast === 'function') {
            showToast(
              `Đã nạp ${totalCards} thẻ vào RAM nhưng không thể lưu xuống bộ nhớ trình duyệt!`,
              'warning'
            );
          }
        } else if (typeof showToast === 'function') {
          showToast('Tệp không chứa dữ liệu hợp lệ', 'error');
        }
      } catch (err) {
        if (typeof showToast === 'function') {
          showToast('Lỗi đọc file: ' + getErrorMessage(err), 'error');
        }
      } finally {
        if (inputEl) inputEl.value = '';
        endLoading();
      }
    };

    reader.onerror = () => {
      if (typeof showToast === 'function') {
        showToast('Lỗi đọc tệp từ thiết bị!', 'error');
      }
      if (inputEl) inputEl.value = '';
      endLoading();
    };

    try {
      if (isCsvFile) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    } catch (syncErr) {
      if (typeof showToast === 'function') {
        showToast(
          'Không thể khởi tạo trình đọc tệp: ' + getErrorMessage(syncErr),
          'error'
        );
      }
      if (inputEl) inputEl.value = '';
      endLoading();
    }
  };

  /**
   * @param {any} newInput
   */
  const handleAddCard = (newInput) => {
    const rawItems = Array.isArray(newInput) ? newInput : [newInput];
    const items = Utils.sanitizeCards(rawItems);
    if (items.length === 0) {
      if (typeof showToast === 'function') {
        showToast('Không có thẻ hợp lệ để thêm!', 'warning');
      }
      return;
    }

    const liveCore = coreRef.current || core;
    const liveState = latestStateRef?.current || {};
    const activeLang = normalizeLang(liveState.lang || liveCore.lang);
    const activeMode = normalizeDataMode(
      liveState.dataMode ?? liveCore.dataMode
    );
    const currentCards = Array.isArray(liveState.cards)
      ? liveState.cards
      : Array.isArray(liveCore.cards)
        ? liveCore.cards
        : [];

    // 1. Cập nhật RAM Mirror & IndexedDB TRƯỚC setCards để Dropdown Topic/Level tự nhận diện
    //    Topic mới ngay trong cùng nhịp render mà KHÔNG kích hoạt Động cơ Vòi nước (tránh reset index/re-shuffle)
    const isStudyingNotebook = Boolean(
      liveState.isStudyingNotebook ?? liveCore.isStudyingNotebook
    );
    const studySourceName =
      liveState.studySourceName ?? liveCore.studySourceName;

    if (!isStudyingNotebook && !studySourceName) {
      const storageKey = `fc_master_data_${activeLang}_${activeMode}`;
      const existingMaster = getMasterDataCache(storageKey, null);
      const levelPrefix = activeLang === 'zh' ? 'zh_level_' : 'en_level_';
      const rawLevels = liveState.currentLevel ?? liveCore.currentLevel;
      const targetLevelKey =
        Array.isArray(rawLevels) && rawLevels.length > 0
          ? rawLevels[0]
          : typeof rawLevels === 'string' && rawLevels.trim()
            ? rawLevels.trim()
            : `${levelPrefix}1`;

      /** @type {Record<string, any>} */
      const nextMaster =
        existingMaster &&
        typeof existingMaster === 'object' &&
        !Array.isArray(existingMaster)
          ? { ...existingMaster }
          : {};
      const existingLevelCards = Array.isArray(nextMaster[targetLevelKey])
        ? nextMaster[targetLevelKey]
        : [];
      nextMaster[targetLevelKey] = [...existingLevelCards, ...items];

      setMasterDataCache(storageKey, nextMaster);
      const dbInstance = getDb();
      if (dbInstance) {
        Promise.resolve(dbInstance.set(storageKey, nextMaster)).catch((err) =>
          console.warn(
            '[DataIO] Sync manual card to IndexedDB failed:',
            getErrorMessage(err)
          )
        );
      }
    }

    // 2. Cập nhật danh sách hiển thị hiện tại & bộ đệm phẳng
    const updated = [...currentCards, ...items];
    liveCore.setCards(updated);
    Utils.safeLocalStorageSet('fc_data_' + activeLang, updated);

    if (typeof showToast === 'function') {
      showToast(`Thêm ${items.length} thẻ thành công!`, 'success');
    }
  };

  /**
   * @param {string} textJson
   */
  const handleManualImport = (textJson) => {
    try {
      const parsed = JSON.parse(textJson);
      handleAddCard(parsed);
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi định dạng JSON: ' + getErrorMessage(e), 'error');
      }
    }
  };

  const handleExportExcel = () => {
    const liveCore = coreRef.current || core;
    const liveState = latestStateRef?.current || {};
    const activeLang = normalizeLang(liveState.lang || liveCore.lang);
    const cards = liveState.cards ?? liveCore.cards;
    const notebook = liveState.notebook ?? liveCore.notebook;
    const isStudyingNotebook = Boolean(
      liveState.isStudyingNotebook ?? liveCore.isStudyingNotebook
    );
    const dataToExport = isStudyingNotebook ? notebook : cards;

    const XLSXLib = getXLSX();
    if (!XLSXLib) {
      if (typeof showToast === 'function') {
        showToast('Thư viện Excel chưa sẵn sàng!', 'error');
      }
      return;
    }
    if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
      if (typeof showToast === 'function') {
        showToast('Không có dữ liệu để xuất Excel!', 'warning');
      }
      return;
    }

    const ws = XLSXLib.utils.json_to_sheet(dataToExport);
    const wb = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wb, ws, 'Flashcards');
    XLSXLib.writeFile(wb, `flashcards_${activeLang}_${Date.now()}.xlsx`);
  };

  const handleExportLink = () => {
    const liveCore = coreRef.current || core;
    const cards = latestStateRef?.current?.cards ?? liveCore.cards;
    const tsv = Utils.jsonToTsv(cards);
    if (!tsv) {
      if (typeof showToast === 'function') {
        showToast('Không có dữ liệu!', 'warning');
      }
      return;
    }
    secureCopy(tsv);
  };

  /**
   * @param {any[]} dataToCopy
   */
  const handleCopyForSheet = (dataToCopy) => {
    const tsv = Utils.jsonToTsv(dataToCopy);
    if (!tsv) {
      if (typeof showToast === 'function') {
        showToast('Không có dữ liệu để copy!', 'warning');
      }
      return;
    }
    secureCopy(tsv);
  };

  // ==================================================================================
  // 5. CÁC HÀM TIỆN ÍCH HỆ THỐNG (TẢI API KEY HỖ TRỢ ĐẦY ĐỦ AIza* & AQ.*)
  // ==================================================================================
  /**
   * @param {string} url
   */
  const handleFetchApiKey = async (url) => {
    const cleanUrl = String(url || '')
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .trim();
    if (!cleanUrl) return;
    const liveCore = coreRef.current || core;
    beginLoading();
    try {
      let text = '';
      let fetchedValidCsv = false;
      let sawBlockedHtml = false;
      /** @type {string[]} */
      const candidateUrls = [];

      const resolvedUrl = resolveApiKeySheetFetchUrl(cleanUrl);
      if (resolvedUrl) candidateUrls.push(resolvedUrl);
      if (cleanUrl && cleanUrl !== resolvedUrl) candidateUrls.push(cleanUrl);

      for (const targetUrl of candidateUrls) {
        try {
          const res = await callFetchWithFallback(targetUrl);
          if (!res || (typeof res.ok === 'boolean' && !res.ok)) {
            continue;
          }
          const fetchedText = await res.text();
          const trimmedText = String(fetchedText || '').trim();
          if (!trimmedText) continue;
          if (trimmedText.startsWith('<')) {
            sawBlockedHtml = true;
            continue;
          }
          text = fetchedText;
          fetchedValidCsv = true;
          break;
        } catch (e) {
          console.warn('API Key Sheet Fetch failed:', getErrorMessage(e));
        }
      }

      if (!fetchedValidCsv) {
        if (typeof showToast === 'function') {
          showToast(
            sawBlockedHtml
              ? 'Không thể đọc Google Sheet (kiểm tra quyền chia sẻ Public "Bất kỳ ai có liên kết")!'
              : 'Không thể tải dữ liệu từ link Google Sheet!',
            'error'
          );
        }
        return;
      }

      const keys = extractApiKeysFromText(text);

      if (keys.length > 0) {
        const currentCore = coreRef.current || liveCore;
        const primaryKeyName = STORAGE_KEYS?.API_KEY || 'fc_gemini_api_key';
        const currentActiveKey =
          typeof currentCore.apiKey === 'string' ? currentCore.apiKey.trim() : '';
        const nextActiveKey =
          currentActiveKey && keys.includes(currentActiveKey)
            ? currentActiveKey
            : keys[0];

        Utils.safeLocalStorageSet('fc_apikey_pool', keys);
        Utils.safeLocalStorageSet(primaryKeyName, nextActiveKey);
        if (primaryKeyName !== 'fc_apikey') {
          Utils.safeLocalStorageSet('fc_apikey', null);
        }
        currentCore.setApiKey(nextActiveKey);

        if (typeof showToast === 'function') {
          showToast(`Đã nạp ${keys.length} API Key!`, 'success');
        }
      } else if (typeof showToast === 'function') {
        showToast('Không tìm thấy API Key hợp lệ trong Sheet!', 'warning');
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi tải Key: ' + getErrorMessage(e), 'error');
      }
    } finally {
      endLoading();
    }
  };

  // [S18] Cô lập tab ngoài bằng 'noopener,noreferrer' và dùng trực tiếp hằng số ES Module
  const handleDownloadTemplate = () => {
    const templateUrl = String(DEFAULT_API_KEY_SHEET || '').trim();
    if (templateUrl && typeof window !== 'undefined') {
      window.open(templateUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleResetSettings = () => {
    const liveCore = coreRef.current || core;
    if (liveCore.resetPending) {
      if (liveCore.resetTimeoutRef?.current) {
        clearTimeout(liveCore.resetTimeoutRef.current);
        liveCore.resetTimeoutRef.current = null;
      }
      liveCore.setSettings(liveCore.DEFAULT_SETTINGS);
      Utils.safeLocalStorageSet(
        STORAGE_KEYS?.SETTINGS || 'fc_settings',
        liveCore.DEFAULT_SETTINGS
      );
      if (typeof showToast === 'function') {
        showToast('Đã khôi phục cài đặt mặc định!', 'success');
      }
      liveCore.setShowSettings(false);
      liveCore.setResetPending(false);
    } else {
      liveCore.setResetPending(true);
      if (typeof showToast === 'function') {
        showToast('⚠️ Nhấn lần nữa để xác nhận!', 'warning');
      }
      if (liveCore.resetTimeoutRef?.current) {
        clearTimeout(liveCore.resetTimeoutRef.current);
      }
      if (liveCore.resetTimeoutRef) {
        liveCore.resetTimeoutRef.current = setTimeout(
          () => (coreRef.current || liveCore).setResetPending(false),
          3000
        );
      }
    }
  };

  const handleReloadDefault = () => {
    const liveCore = coreRef.current || core;
    const activeLang = normalizeLang(liveCore.lang);
    const activeMode = normalizeDataMode(liveCore.dataMode);

    if (liveCore.resetPending) {
      if (liveCore.resetTimeoutRef?.current) {
        clearTimeout(liveCore.resetTimeoutRef.current);
        liveCore.resetTimeoutRef.current = null;
      }
      const defUrlKey =
        (STORAGE_KEYS?.DEFAULT_URL || 'fc_default_url') +
        '_' +
        activeLang +
        '_' +
        activeMode;
      let savedDefaultUrl = '';
      if (typeof localStorage !== 'undefined') {
        try {
          savedDefaultUrl = localStorage.getItem(defUrlKey) || '';
        } catch {
          savedDefaultUrl = '';
        }
      }
      const safeDefaultSheets = /** @type {Record<string, any>} */ (
        DEFAULT_SHEETS || {}
      );
      const fallbackSheet = String(
        safeDefaultSheets?.[activeLang]?.[activeMode] || ''
      ).trim();
      const linkToLoad = savedDefaultUrl || fallbackSheet;

      if (linkToLoad) {
        handleImport(linkToLoad, activeMode);
      } else {
        const storageKey = `fc_master_data_${activeLang}_${activeMode}`;
        setMasterDataCache(storageKey, /** @type {any} */ (null));
        const dbInstance = getDb();
        if (dbInstance) {
          Promise.resolve(
            typeof dbInstance.del === 'function'
              ? dbInstance.del(storageKey)
              : dbInstance.set(storageKey, null)
          ).catch((err) =>
            console.warn(
              '[DataIO] Clear master store failed:',
              getErrorMessage(err)
            )
          );
        }
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem(storageKey);
          } catch {
            // Bỏ qua lỗi xóa storage
          }
        }
        liveCore.setCards([]);
        Utils.safeLocalStorageSet('fc_data_' + activeLang, []);
        if (typeof liveCore.bumpMasterDataVersion === 'function') {
          liveCore.bumpMasterDataVersion();
        }
        if (typeof showToast === 'function') {
          showToast('Đã làm trống dữ liệu!', 'success');
        }
      }
      liveCore.setResetPending(false);
    } else {
      liveCore.setResetPending(true);
      const modeLabel = activeMode === 'sentence' ? 'Câu Văn' : 'Từ Vựng';
      if (typeof showToast === 'function') {
        showToast(
          `⚠️ Nhấn lần nữa để tải lại dữ liệu ${modeLabel}!`,
          'warning'
        );
      }
      if (liveCore.resetTimeoutRef?.current) {
        clearTimeout(liveCore.resetTimeoutRef.current);
      }
      if (liveCore.resetTimeoutRef) {
        liveCore.resetTimeoutRef.current = setTimeout(
          () => (coreRef.current || liveCore).setResetPending(false),
          3000
        );
      }
    }
  };

  // ==================================================================================
  // 6. SAVE/LOAD STATE (SAO LƯU & PHỤC HỒI FULL INDEXEDDB + LOCALSTORAGE)
  // ==================================================================================
  const handleExportSaveFile = async () => {
    beginLoading();
    try {
      /** @type {Record<string, any>} */
      const saveData = {};

      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            key.startsWith('fc_') &&
            !DEPRECATED_VI_KEY_REGEX.test(key)
          ) {
            let val = localStorage.getItem(key);
            if (key === 'fc_lang') {
              const cleanLang = String(val || '')
                .replace(/^["'\s]+|["'\s]+$/g, '')
                .toLowerCase();
              if (cleanLang === 'vi') {
                val = JSON.stringify('en');
              }
            }
            saveData[key] = val;
          }
        }
      }

      // Thu thập toàn bộ dữ liệu từ IndexedDB (gồm cả 4 kho Master Data 9 Levels)
      const dbInstance = getDb();
      if (dbInstance) {
        if (typeof dbInstance.init === 'function') {
          await dbInstance.init();
        }
        for (const key of INDEXED_DB_KEYS) {
          try {
            const data = await dbInstance.get(key);
            if (data !== undefined && data !== null) {
              saveData[key] = JSON.stringify(data);
            }
          } catch (readErr) {
            console.warn(
              `[DataIO] Backup read failed (${key}):`,
              getErrorMessage(readErr)
            );
          }
        }
      }

      // Dự phòng: Nếu 4 kho Master Data đang nằm trên RAM Mirror mà chưa có trong saveData -> bổ sung ngay
      MASTER_DATA_KEYS.forEach((mKey) => {
        if (!saveData[mKey]) {
          const ramData = getMasterDataCache(mKey, null);
          if (isValidMasterDataObject(ramData)) {
            saveData[mKey] = JSON.stringify(ramData);
          }
        }
      });

      const dataStr = JSON.stringify(saveData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const dateStr = `${now.getFullYear()}${(now.getMonth() + 1)
        .toString()
        .padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now
        .getHours()
        .toString()
        .padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `flashcard_save_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // [S16] Trì hoãn giải phóng Blob URL 1000ms để Safari/iOS hoàn tất khởi tạo lượt tải xuống
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Bỏ qua lỗi giải phóng URL
        }
      }, 1000);
      if (typeof showToast === 'function') {
        showToast('Đã tạo file sao lưu đầy đủ thành công!', 'success');
      }
    } catch (e) {
      console.error('Export save error:', getErrorMessage(e));
      if (typeof showToast === 'function') {
        showToast('Lỗi khi tạo file sao lưu!', 'error');
      }
    } finally {
      endLoading();
    }
  };

  /**
   * @param {File} file
   * @returns {Promise<boolean>}
   */
  const handleImportSaveFile = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }

      beginLoading();
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const rawText =
            typeof e?.target?.result === 'string' ? e.target.result : '';
          const importedData = JSON.parse(rawText);
          if (
            !importedData ||
            typeof importedData !== 'object' ||
            Array.isArray(importedData)
          ) {
            throw new Error('Invalid save file structure');
          }

          const dbInstance = getDb();
          if (dbInstance && typeof dbInstance.init === 'function') {
            await dbInstance.init();
          }

          let count = 0;
          const entries = Object.entries(importedData);

          for (const [key, rawVal] of entries) {
            if (!key.startsWith('fc_') || DEPRECATED_VI_KEY_REGEX.test(key)) {
              continue;
            }
            if (rawVal === undefined || rawVal === null) {
              continue;
            }

            // [S17] Chặn triệt để lỗ hổng phục hồi tệp sao lưu cũ tái sinh fc_lang = 'vi'
            let safeVal = rawVal;
            if (key === 'fc_lang') {
              const cleanLang = String(rawVal)
                .replace(/^["'\s]+|["'\s]+$/g, '')
                .toLowerCase();
              if (cleanLang === 'vi') {
                safeVal = JSON.stringify('en');
              }
            }

            // Các khóa dữ liệu lớn (4 Kho Master Data + Sổ tay + Kho AI + Kho Đề thi) ghi thẳng vào IndexedDB
            if (INDEXED_DB_KEY_SET.has(key) && dbInstance) {
              let parsedVal = safeVal;
              if (typeof safeVal === 'string') {
                try {
                  parsedVal = JSON.parse(safeVal);
                } catch {
                  // Giữ nguyên nếu chuỗi thô hợp lệ
                }
              }
              if (parsedVal === undefined || parsedVal === null) {
                continue;
              }
              await dbInstance.set(key, parsedVal);
              if (MASTER_DATA_KEY_SET.has(key)) {
                if (isValidMasterDataObject(parsedVal)) {
                  setMasterDataCache(key, parsedVal);
                }
                if (typeof localStorage !== 'undefined') {
                  try {
                    localStorage.removeItem(key);
                  } catch {
                    // Bỏ qua lỗi xóa storage
                  }
                }
              }
              count++;
            } else if (MASTER_DATA_KEY_SET.has(key)) {
              // Nhánh dự phòng khi không có FcDB: chủ động parse JSON sang Plain Object cho RAM Mirror
              let parsedMaster = safeVal;
              if (typeof safeVal === 'string') {
                try {
                  parsedMaster = JSON.parse(safeVal);
                } catch {
                  parsedMaster = null;
                }
              }
              if (isValidMasterDataObject(parsedMaster)) {
                const saved = Utils.safeLocalStorageSet(key, parsedMaster);
                if (saved) count++;
              }
            } else {
              const saved = Utils.safeLocalStorageSet(key, safeVal);
              if (saved) count++;
            }
          }

          if (count > 0) {
            if (typeof showToast === 'function') {
              showToast(
                `Đã phục hồi ${count} mục dữ liệu. Đang khởi động lại...`,
                'success'
              );
            }
            setTimeout(() => {
              window.location.reload();
            }, 1500);
            resolve(true);
          } else {
            if (typeof showToast === 'function') {
              showToast('File không chứa dữ liệu hợp lệ!', 'error');
            }
            reject(new Error('Invalid save file'));
          }
        } catch (err) {
          console.error('Import save error:', getErrorMessage(err));
          if (typeof showToast === 'function') {
            showToast('File bị lỗi hoặc không đúng định dạng!', 'error');
          }
          reject(err);
        } finally {
          endLoading();
        }
      };

      reader.onerror = (err) => {
        endLoading();
        if (typeof showToast === 'function') {
          showToast('Lỗi đọc file!', 'error');
        }
        reject(err);
      };

      try {
        reader.readAsText(file);
      } catch (syncErr) {
        endLoading();
        if (typeof showToast === 'function') {
          showToast('Không thể đọc file sao lưu!', 'error');
        }
        reject(syncErr);
      }
    });
  };

  return {
    handleImport,
    handleImportToNotebook,
    handleFileImport,
    handleManualImport,
    handleAddCard,
    handleExportExcel,
    handleExportLink,
    handleCopyForSheet,
    handleFetchApiKey,
    handleDownloadTemplate,
    handleResetSettings,
    handleReloadDefault,
    handleExportSaveFile,
    handleImportSaveFile,
    secureCopy
  };
};

export const useDataLogic = useDataIO;
export const Block6_3_useDataIO = useDataIO;

if (typeof window !== 'undefined') {
  const win = /** @type {any} */ (window);
  win.Block6_3_useDataIO = useDataIO;
  win.Block15_useDataLogic = useDataIO;
  win.useDataLogic = useDataIO;
  win.useDataIO = useDataIO;
}

export default useDataIO;