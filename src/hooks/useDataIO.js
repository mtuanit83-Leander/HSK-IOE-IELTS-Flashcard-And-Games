// ============================================================================
// FILE 77/85: src/hooks/useDataIO.js
// NGUỒN GỐC: Tầng 6 - Block 6.3 (Data I/O & Persistence - Version 1.03)
// NHIỆM VỤ: "Người vận chuyển" (The Porter). Chuyên trách nạp/xuất dữ liệu,
//           quản lý file system và dọn rác bộ nhớ.
// ============================================================================

import { useEffect, useCallback } from 'react';
import * as XLSXNamespace from 'xlsx';
import {
  STORAGE_KEYS,
  DEFAULT_SHEETS,
  DEFAULT_API_KEY_SHEET
} from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { fetchWithFallback as serviceFetchWithFallback } from '@/services/geminiApi';

// Trình lấy thư viện XLSX an toàn (Hỗ trợ cả ES Module lẫn Global Window)
const getXLSX = () => {
  if (XLSXNamespace && XLSXNamespace.read) return XLSXNamespace;
  if (XLSXNamespace?.default && XLSXNamespace.default.read) return XLSXNamespace.default;
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  return null;
};

// Trình gọi fetchWithFallback an toàn
const callFetchWithFallback = async (url, options) => {
  const fn =
    serviceFetchWithFallback ||
    Utils?.fetchWithFallback ||
    (typeof window !== 'undefined' && window.Utils?.fetchWithFallback);
  if (typeof fn === 'function') {
    return await fn(url, options);
  }
  return await fetch(url, options);
};

// Trình lấy FcDB an toàn
const getDb = () => FcDB || (typeof window !== 'undefined' ? window.FcDB : null);

export const useDataIO = (core, latestStateRef, callbacks = {}) => {
  const { t, showToast } = callbacks;
  const { lang } = core;

  // ==================================================================================
  // 1. HỆ THỐNG DỌN RÁC BỘ NHỚ (GARBAGE COLLECTION)
  // ==================================================================================
  useEffect(() => {
    const runGarbageCollector = () => {
      try {
        const now = Date.now();
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
        let totalSize = 0;

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          totalSize += (localStorage.getItem(key) || '').length;
        }

        // Nếu dung lượng vượt ngưỡng 4MB, kích hoạt chế độ khẩn cấp
        const isEmergency = totalSize > 4 * 1024 * 1024;
        const sessionsStr = localStorage.getItem('fc_game_sessions');

        if (sessionsStr) {
          let sessions = JSON.parse(sessionsStr);
          let sessionChanged = false;

          if (isEmergency) {
            sessions = {};
            sessionChanged = true;
          } else {
            Object.keys(sessions).forEach((langKey) => {
              const langSessions = sessions[langKey];
              if (langSessions && typeof langSessions === 'object') {
                Object.keys(langSessions).forEach((gameType) => {
                  const session = langSessions[gameType];
                  if (session && now - session.timestamp > THREE_DAYS) {
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
            localStorage.setItem('fc_game_sessions', JSON.stringify(sessions));
          }
        }

        const chatStr = localStorage.getItem('fc_ai_chat_history');
        if (chatStr) {
          let chatHistory = JSON.parse(chatStr);
          if (Array.isArray(chatHistory)) {
            if (isEmergency) {
              chatHistory = chatHistory.slice(-1);
              localStorage.setItem('fc_ai_chat_history', JSON.stringify(chatHistory));
            } else if (chatHistory.length > 20) {
              chatHistory = chatHistory.slice(-20);
              localStorage.setItem('fc_ai_chat_history', JSON.stringify(chatHistory));
            }
          }
        }
      } catch (e) {
        console.error('Garbage Collector Failed:', e);
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
            showToast(typeof t === 'function' ? t('syncSuccess') : 'Đã sao chép!');
          }
        } else if (typeof showToast === 'function') {
          showToast('Trình duyệt chặn copy. Hãy copy thủ công.', 'error');
        }
      } catch (err) {
        if (typeof showToast === 'function') {
          showToast('Lỗi copy: ' + err, 'error');
        }
      }
    },
    [showToast, t]
  );

  const secureCopy = useCallback(
    (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            if (typeof showToast === 'function') {
              showToast(typeof t === 'function' ? t('syncSuccess') : 'Đã sao chép!');
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
  // 3. ĐỘNG CƠ TẢI DỮ LIỆU GOOGLE SHEETS (PROXY & GVIZ)
  // ==================================================================================
  // Cách 1: Tải qua Proxy (Lấy toàn bộ file Excel nguyên khối)
  const safeFetchExcel = async (url) => {
    const cleanUrl = url.trim();
    const match = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error('Link không hợp lệ. Không tìm thấy ID của Google Sheet.');
    const sheetId = match[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    const cacheBuster = `&cb=${Date.now()}`;

    // [V1.02 FIX] Mạng lưới 7 Node Proxy bọc thép xuyên thủng CORS file://
    const proxies = [
      { name: 'Direct', url: exportUrl },
      {
        name: 'AllOrigins',
        url: `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl + cacheBuster)}`
      },
      {
        name: 'CorsProxyIO',
        url: `https://corsproxy.io/?${encodeURIComponent(exportUrl + cacheBuster)}`
      },
      { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${exportUrl}` },
      {
        name: 'CodeTabs',
        url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(exportUrl)}`
      },
      { name: 'CorsAnywhere', url: `https://cors-anywhere.herokuapp.com/${exportUrl}` },
      { name: 'CorsSH', url: `https://proxy.cors.sh/${exportUrl}` }
    ];

    for (const proxy of proxies) {
      try {
        const res = await fetch(proxy.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 100) throw new Error('File quá nhỏ, lỗi chặn kết nối.');
        const header = new Uint8Array(buffer).subarray(0, 2);
        if (header[0] !== 0x50 || header[1] !== 0x4B) {
          throw new Error(
            "LỖI QUYỀN TRUY CẬP: Hãy chắc chắn Link Google Sheet của bạn đã bật quyền 'Bất kỳ ai có liên kết' (Anyone with the link)."
          );
        }
        return buffer;
      } catch (e) {
        console.warn(`[Excel Proxy Fallback] ${proxy.name} thất bại, thử node tiếp theo...`);
        if (e.message && e.message.includes('LỖI QUYỀN TRUY CẬP')) throw e;
      }
    }
    throw new Error('Mạng bị chặn Proxy. Sẽ tự động chuyển sang GViz...');
  };

  // Cách 2 (Tuyệt chiêu): Quét từng Tab trực tiếp bằng Google GViz (Bỏ qua Proxy)
  const fetchDirectGvizTabs = async (sheetId, targetLang) => {
    let allNewItems = [];
    const masterDataObj = {};
    let total = 0;
    // Đã xóa bỏ vi_level_
    const levelPrefix = targetLang === 'zh' ? 'zh_level_' : 'en_level_';

    const fetchTab = async (sheetName) => {
      const encodedName = encodeURIComponent(sheetName);
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedName}`;
      try {
        // Dùng fetchWithFallback thay vì fetch trần để vượt CORS khi chạy file://
        const res = await callFetchWithFallback(gvizUrl);
        if (!res) return null;
        const text = await res.text();
        if (text.trim().startsWith('<')) return null;
        return Utils.parseAndMapCSV(text);
      } catch {
        return null;
      }
    };

    for (let i = 1; i <= 9; i++) {
      const possibleNames = [`Level0${i}`, `Level ${i}`, `Level${i}`, `Sheet${i}`];
      for (const sheetName of possibleNames) {
        const parsedCards = await fetchTab(sheetName);
        if (parsedCards && parsedCards.length > 0) {
          masterDataObj[`${levelPrefix}${i}`] = parsedCards;
          total += parsedCards.length;
          allNewItems = allNewItems.concat(parsedCards);
          break;
        }
      }
    }

    if (total === 0) {
      const defaultTabs = ['Trang tính 1', 'Sheet 1', 'Sheet1', 'Data'];
      for (const sheetName of defaultTabs) {
        const parsedCards = await fetchTab(sheetName);
        if (parsedCards && parsedCards.length > 0) {
          masterDataObj[`${levelPrefix}1`] = parsedCards;
          total += parsedCards.length;
          allNewItems = allNewItems.concat(parsedCards);
          break;
        }
      }
      if (total === 0) {
        const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
        try {
          const res = await callFetchWithFallback(gvizUrl);
          if (res) {
            const text = await res.text();
            if (!text.trim().startsWith('<')) {
              const parsedCards = Utils.parseAndMapCSV(text);
              if (parsedCards && parsedCards.length > 0) {
                masterDataObj[`${levelPrefix}1`] = parsedCards;
                total += parsedCards.length;
                allNewItems = allNewItems.concat(parsedCards);
              }
            }
          }
        } catch {}
      }
    }

    return { masterData: masterDataObj, totalCards: total, flatItems: allNewItems };
  };

  // ==================================================================================
  // 3.5. BỘ ĐỒNG BỘ DỮ LIỆU VỚI ĐỘNG CƠ "VÒI NƯỚC" (WATER FAUCET SYNC)
  // ==================================================================================
  const syncMasterDataToActiveView = (masterData, sourceType) => {
    const storageKey = `fc_master_data_${lang}_${sourceType}`;
    Utils.safeLocalStorageSet(storageKey, masterData);

    // Nếu loại dữ liệu vừa nạp khớp với chế độ đang xem (vocab/sentence) và không ở chế độ học Sổ tay
    const activeDataMode = core.dataMode || 'vocab';
    if (sourceType === activeDataMode && !core.isStudyingNotebook && !core.studySourceName) {
      const levelsArr = Array.isArray(core.currentLevel)
        ? core.currentLevel
        : core.currentLevel
        ? [core.currentLevel]
        : [];
      const topicsArr = Array.isArray(core.currentTopic)
        ? core.currentTopic
        : core.currentTopic
        ? [core.currentTopic]
        : [];

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

      // Nếu Level đang chọn không có trong file vừa nạp, tự động chuyển về Level đầu tiên có dữ liệu
      if (targetCards.length === 0) {
        const availableLevels = Object.keys(masterData).filter(
          (k) => Array.isArray(masterData[k]) && masterData[k].length > 0
        );
        if (availableLevels.length > 0) {
          const fallbackLvl = availableLevels[0];
          targetCards = [...masterData[fallbackLvl]];
          if (typeof core.setCurrentLevel === 'function') {
            core.setCurrentLevel([fallbackLvl]);
          }
        }
      } else if (typeof core.setCurrentLevel === 'function') {
        // Kích hoạt làm tươi tham chiếu mảng để Động cơ Vòi nước ở useCoreState đồng bộ 100%
        core.setCurrentLevel((prev) => (Array.isArray(prev) ? [...prev] : [prev]));
      }

      // Lọc theo Topic đang chọn (nếu có)
      if (topicsArr.length > 0 && targetCards.length > 0) {
        const topicFiltered = targetCards.filter((c) => topicsArr.includes(c.topic));
        if (topicFiltered.length > 0) {
          targetCards = topicFiltered;
        } else if (typeof core.setCurrentTopic === 'function') {
          // Nếu file mới không chứa topic cũ đang chọn, tự động mở khóa bộ lọc Topic
          core.setCurrentTopic([]);
        }
      }

      core.setCards(targetCards);
      Utils.safeLocalStorageSet('fc_data_' + lang, targetCards);
      if (typeof core.setCurrentCardIndex === 'function') {
        core.setCurrentCardIndex(0);
      }
    }
  };

  // ==================================================================================
  // 4. IMPORT / EXPORT ĐA TẦNG (MULTI-DIMENSIONAL DATA SYNC)
  // ==================================================================================
  const handleImport = async (url, sourceType = 'vocab') => {
    if (!url) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập URL!', 'error');
      return;
    }
    core.setIsAiLoading(true);
    try {
      let masterData = {};
      let totalCards = 0;
      const XLSXLib = getXLSX();
      // Đã xóa bỏ vi_level_
      const levelPrefix = lang === 'zh' ? 'zh_level_' : 'en_level_';

      if (url.includes('docs.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('Link không hợp lệ. Không tìm thấy ID của Google Sheet.');
        const sheetId = match[1];
        let useGvizFallback = false;

        try {
          const buffer = await safeFetchExcel(url);
          if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
          const workbook = XLSXLib.read(buffer, { type: 'array' });
          const numTabs = Math.min(workbook.SheetNames.length, 9);

          for (let i = 0; i < numTabs; i++) {
            const sheetName = workbook.SheetNames[i];
            const rows = XLSXLib.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
            const parsedCards = Utils.convertRawRowsToCards(rows);
            if (parsedCards.length > 0) {
              const matchLvl = sheetName.match(/\d+/);
              const levelNum = matchLvl ? parseInt(matchLvl[0], 10) : i + 1;
              masterData[`${levelPrefix}${levelNum}`] = parsedCards;
              totalCards += parsedCards.length;
            }
          }
        } catch (err) {
          if (err.message && err.message.includes('LỖI QUYỀN TRUY CẬP')) throw err;
          console.warn('Proxy XLSX Failed, fallback to GViz:', err.message);
          useGvizFallback = true;
        }

        if (useGvizFallback) {
          if (typeof showToast === 'function') {
            showToast('Mạng đang chặn Proxy, chuyển sang kết nối trực tiếp Google...', 'info');
          }
          const { masterData: gvizData, totalCards: gvizTotal } = await fetchDirectGvizTabs(
            sheetId,
            lang
          );
          if (gvizTotal > 0) {
            masterData = gvizData;
            totalCards = gvizTotal;
          } else {
            throw new Error('Không thể tải file (File chưa được chia sẻ Public).');
          }
        }
      } else if (url.endsWith('.xlsx')) {
        const res = await callFetchWithFallback(url);
        const arrayBuffer = await res.arrayBuffer();
        if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
        const workbook = XLSXLib.read(arrayBuffer, { type: 'array' });
        const numTabs = Math.min(workbook.SheetNames.length, 9);

        for (let i = 0; i < numTabs; i++) {
          const sheetName = workbook.SheetNames[i];
          const rows = XLSXLib.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          if (parsedCards.length > 0) {
            const match = sheetName.match(/\d+/);
            const levelNum = match ? parseInt(match[0], 10) : i + 1;
            masterData[`${levelPrefix}${levelNum}`] = parsedCards;
            totalCards += parsedCards.length;
          }
        }
      } else {
        const res = await callFetchWithFallback(url);
        const text = await res.text();
        const parsedCards = Utils.parseAndMapCSV(text);
        if (parsedCards.length > 0) {
          masterData[`${levelPrefix}1`] = parsedCards;
          totalCards = parsedCards.length;
        }
      }

      if (totalCards > 0) {
        syncMasterDataToActiveView(masterData, sourceType);
        if (typeof showToast === 'function') {
          showToast(`Đã nạp thành công ${totalCards} thẻ!`, 'success');
        }
        core.setShowLinkManager(false);
      } else {
        throw new Error('Không tìm thấy dữ liệu hợp lệ');
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi nạp Dữ liệu: ' + e.message, 'error');
      }
    } finally {
      core.setIsAiLoading(false);
    }
  };

  const handleImportToNotebook = async (url) => {
    if (!url) {
      if (typeof showToast === 'function') showToast('Vui lòng nhập URL!', 'error');
      return;
    }
    core.setIsAiLoading(true);
    try {
      let allNewItems = [];
      const XLSXLib = getXLSX();

      if (url.includes('docs.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error('Link không hợp lệ.');
        const sheetId = match[1];
        let useGvizFallback = false;

        try {
          const buffer = await safeFetchExcel(url);
          if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
          const workbook = XLSXLib.read(buffer, { type: 'array' });
          for (let i = 0; i < workbook.SheetNames.length; i++) {
            const sheetName = workbook.SheetNames[i];
            const rows = XLSXLib.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
            const parsedCards = Utils.convertRawRowsToCards(rows);
            allNewItems = allNewItems.concat(parsedCards);
          }
        } catch (err) {
          if (err.message && err.message.includes('LỖI QUYỀN TRUY CẬP')) throw err;
          useGvizFallback = true;
        }

        if (useGvizFallback) {
          const { flatItems } = await fetchDirectGvizTabs(sheetId, lang);
          if (flatItems.length > 0) {
            allNewItems = flatItems;
          } else {
            throw new Error('Không thể tải file (File chưa được chia sẻ Public).');
          }
        }
      } else if (url.endsWith('.xlsx')) {
        const buffer = await safeFetchExcel(url);
        if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
        const workbook = XLSXLib.read(buffer, { type: 'array' });
        for (let i = 0; i < workbook.SheetNames.length; i++) {
          const sheetName = workbook.SheetNames[i];
          const rows = XLSXLib.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          allNewItems = allNewItems.concat(parsedCards);
        }
      } else {
        const res = await callFetchWithFallback(url);
        const text = await res.text();
        allNewItems = Utils.parseAndMapCSV(text);
      }

      if (allNewItems.length > 0) {
        core.setNotebook((prev) => {
          const existingTerms = new Set(prev.map((i) => i.term));
          const uniqueItems = allNewItems.filter((i) => !existingTerms.has(i.term));
          if (uniqueItems.length === 0) {
            if (typeof showToast === 'function') {
              showToast('Tất cả từ trong link đã có trong sổ tay!', 'info');
            }
            return prev;
          }
          const updated = [...prev, ...uniqueItems];
          // Ghi ngầm Sổ tay xuống IndexedDB
          const dbInstance = getDb();
          if (dbInstance) dbInstance.set('fc_notebook_' + lang, updated);
          if (typeof showToast === 'function') {
            showToast(`Đã gộp ${uniqueItems.length} thẻ mới vào Sổ tay!`, 'success');
          }
          return updated;
        });
        core.setShowLinkManager(false);
      } else {
        throw new Error('Dữ liệu trống');
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi nhập vào sổ tay: ' + e.message, 'error');
      }
    } finally {
      core.setIsAiLoading(false);
    }
  };

  const handleFileImport = (e, sourceType = 'vocab') => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    core.setIsAiLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const XLSXLib = getXLSX();
        if (!XLSXLib) throw new Error('Thư viện XLSX chưa được tải');
        const wb = XLSXLib.read(evt.target.result, { type: 'binary' });
        const masterData = {};
        let totalCards = 0;
        // Đã xóa bỏ vi_level_
        const levelPrefix = lang === 'zh' ? 'zh_level_' : 'en_level_';
        const numTabs = Math.min(wb.SheetNames.length, 9);

        for (let i = 0; i < numTabs; i++) {
          const sheetName = wb.SheetNames[i];
          const rows = XLSXLib.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          if (parsedCards.length > 0) {
            const match = sheetName.match(/\d+/);
            const levelNum = match ? parseInt(match[0], 10) : i + 1;
            masterData[`${levelPrefix}${levelNum}`] = parsedCards;
            totalCards += parsedCards.length;
          }
        }

        if (totalCards > 0) {
          syncMasterDataToActiveView(masterData, sourceType);
          if (typeof showToast === 'function') {
            showToast(
              `Đã tải lên thành công ${totalCards} thẻ từ ${numTabs} Tabs (.xlsx)!`,
              'success'
            );
          }
        } else if (typeof showToast === 'function') {
          showToast('Tệp không chứa dữ liệu hợp lệ', 'error');
        }
      } catch (err) {
        if (typeof showToast === 'function') {
          showToast('Lỗi đọc file: ' + err.message, 'error');
        }
      } finally {
        core.setIsAiLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddCard = (newInput) => {
    const items = Array.isArray(newInput) ? newInput : [newInput];
    if (items.length === 0) return;
    const updated = [...core.cards, ...items];
    core.setCards(updated);
    Utils.safeLocalStorageSet('fc_data_' + lang, updated);
    if (typeof showToast === 'function') {
      showToast(`Thêm ${items.length} thẻ thành công!`, 'success');
    }
  };

  const handleManualImport = (textJson) => {
    try {
      const parsed = JSON.parse(textJson);
      handleAddCard(parsed);
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi định dạng JSON: ' + e.message, 'error');
      }
    }
  };

  const handleExportExcel = () => {
    const { cards, notebook, isStudyingNotebook } = latestStateRef.current;
    const XLSXLib = getXLSX();
    if (!cards?.length || !XLSXLib) return;
    const ws = XLSXLib.utils.json_to_sheet(isStudyingNotebook ? notebook : cards);
    const wb = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wb, ws, 'Flashcards');
    XLSXLib.writeFile(wb, `flashcards_${lang}_${Date.now()}.xlsx`);
  };

  const handleExportLink = () => {
    const { cards } = latestStateRef.current;
    const tsv = Utils.jsonToTsv(cards);
    if (!tsv) {
      if (typeof showToast === 'function') showToast('Không có dữ liệu!', 'warning');
      return;
    }
    secureCopy(tsv);
  };

  const handleCopyForSheet = (dataToCopy) => {
    const tsv = Utils.jsonToTsv(dataToCopy);
    if (!tsv) {
      if (typeof showToast === 'function') showToast('Không có dữ liệu để copy!', 'warning');
      return;
    }
    secureCopy(tsv);
  };

  // ==================================================================================
  // 5. CÁC HÀM TIỆN ÍCH HỆ THỐNG
  // ==================================================================================
  const handleFetchApiKey = async (url) => {
    if (!url) return;
    core.setIsAiLoading(true);
    try {
      let text = '';
      if (url.includes('docs.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match) {
          const gvizUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv`;
          try {
            // Sửa lỗi CORS file:// bằng cách ném gvizUrl qua màng lọc Proxy
            const res = await callFetchWithFallback(gvizUrl);
            if (res) {
              const fetchedText = await res.text();
              if (!fetchedText.trim().startsWith('<')) text = fetchedText;
            }
          } catch (e) {
            console.warn('GViz Proxy Fetch failed:', e);
          }
        }
      }
      if (!text) {
        const res = await callFetchWithFallback(url);
        text = await res.text();
      }
      const keys = text
        .split(/[\n,]/)
        .map((k) => k.trim())
        .filter((k) => k.length > 20 && !k.includes(' '));
      if (keys.length > 0) {
        Utils.safeLocalStorageSet('fc_apikey_pool', keys);
        core.setApiKey(keys[0]);
        if (typeof showToast === 'function') {
          showToast(`Đã nạp ${keys.length} API Key!`, 'success');
        }
      } else if (typeof showToast === 'function') {
        showToast('Không tìm thấy Key hợp lệ', 'warning');
      }
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Lỗi tải Key: ' + e.message, 'error');
      }
    } finally {
      core.setIsAiLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateUrl =
      DEFAULT_API_KEY_SHEET ||
      (typeof window !== 'undefined' ? window.DEFAULT_API_KEY_SHEET : '');
    if (templateUrl) window.open(templateUrl, '_blank');
  };

  const handleResetSettings = () => {
    if (core.resetPending) {
      core.setSettings(core.DEFAULT_SETTINGS);
      localStorage.setItem(
        STORAGE_KEYS?.SETTINGS || 'fc_settings',
        JSON.stringify(core.DEFAULT_SETTINGS)
      );
      if (typeof showToast === 'function') {
        showToast('Đã khôi phục cài đặt mặc định!', 'success');
      }
      core.setShowSettings(false);
      core.setResetPending(false);
    } else {
      core.setResetPending(true);
      if (typeof showToast === 'function') {
        showToast('⚠️ Nhấn lần nữa để xác nhận!', 'warning');
      }
      if (core.resetTimeoutRef.current) clearTimeout(core.resetTimeoutRef.current);
      core.resetTimeoutRef.current = setTimeout(() => core.setResetPending(false), 3000);
    }
  };

  const handleReloadDefault = () => {
    if (core.resetPending) {
      const defUrlKey = (STORAGE_KEYS?.DEFAULT_URL || 'fc_default_url') + '_' + lang + '_vocab';
      const fallbackSheet =
        DEFAULT_SHEETS?.[lang]?.vocab ||
        (typeof window !== 'undefined' ? window.DEFAULT_SHEETS?.[lang]?.vocab : '');
      const linkToLoad = localStorage.getItem(defUrlKey) || fallbackSheet;
      if (linkToLoad) {
        handleImport(linkToLoad, 'vocab');
      } else {
        core.setCards([]);
        Utils.safeLocalStorageSet('fc_data_' + lang, []);
        if (typeof showToast === 'function') {
          showToast('Đã làm trống dữ liệu!', 'success');
        }
      }
      core.setResetPending(false);
    } else {
      core.setResetPending(true);
      if (typeof showToast === 'function') {
        showToast('⚠️ Nhấn lần nữa để tải lại dữ liệu!', 'warning');
      }
      if (core.resetTimeoutRef.current) clearTimeout(core.resetTimeoutRef.current);
      core.resetTimeoutRef.current = setTimeout(() => core.setResetPending(false), 3000);
    }
  };

  // ==================================================================================
  // 6. SAVE/LOAD STATE (Sao lưu & Phục hồi)
  // ==================================================================================
  const handleExportSaveFile = async () => {
    try {
      core.setIsAiLoading(true);
      const saveData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('fc_')) {
          saveData[key] = localStorage.getItem(key);
        }
      }

      // Bổ sung dữ liệu từ IndexedDB vào chung file Backup. [V1.03] Đã gọt sạch các keys '_vi'
      const dbInstance = getDb();
      if (dbInstance) {
        const dbKeys = [
          'fc_ai_harvest_pool',
          'fc_global_retry_bag',
          'fc_global_retry_bag_en',
          'fc_global_retry_bag_zh',
          'fc_notebook_en',
          'fc_notebook_zh',
          'fc_mastered_en',
          'fc_mastered_zh',
          'fc_incorrect_list_en',
          'fc_incorrect_list_zh'
        ];
        for (const key of dbKeys) {
          const data = await dbInstance.get(key);
          if (data) {
            saveData[key] = JSON.stringify(data);
          }
        }
      }

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
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') {
        showToast('Đã tạo file sao lưu thành công!', 'success');
      }
    } catch (e) {
      console.error('Export save error:', e);
      if (typeof showToast === 'function') {
        showToast('Lỗi khi tạo file sao lưu!', 'error');
      }
    } finally {
      core.setIsAiLoading(false);
    }
  };

  const handleImportSaveFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          let count = 0;
          for (const key in importedData) {
            if (key.startsWith('fc_')) {
              localStorage.setItem(key, importedData[key]);
              count++;
            }
          }
          if (count > 0) {
            if (typeof showToast === 'function') {
              showToast(`Đã phục hồi ${count} mục. Đang khởi động lại...`, 'success');
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
          console.error('Import save error:', err);
          if (typeof showToast === 'function') {
            showToast('File bị lỗi hoặc không đúng định dạng!', 'error');
          }
          reject(err);
        }
      };
      reader.onerror = (err) => {
        if (typeof showToast === 'function') {
          showToast('Lỗi đọc file!', 'error');
        }
        reject(err);
      };
      reader.readAsText(file);
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
  window.Block6_3_useDataIO = useDataIO;
  window.Block15_useDataLogic = useDataIO;
  window.useDataLogic = useDataIO;
  window.useDataIO = useDataIO;
}

export default useDataIO;