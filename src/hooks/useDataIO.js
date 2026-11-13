/**
 * @file src/hooks/useDataIO.js
 * @description "Người vận chuyển" (The Porter). Chuyên trách nạp/xuất dữ liệu, quản lý file system và dọn rác bộ nhớ.
 * @origin Tầng 6 - Block 6.3 (Data I/O & Persistence)
 */

import React from 'react';
import * as XLSX from 'xlsx';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';
import { STORAGE_KEYS, DEFAULT_SHEETS, DEFAULT_API_KEY_SHEET } from '@/config/constants';

export const useDataIO = (core, latestStateRef, callbacks) => {
  const { t, showToast } = callbacks;
  const { lang } = core;

  // Ref chống gọi trùng lặp khi Auto-Hydrate ở lần đầu kho rỗng
  const autoHydrateRef = React.useRef({});

  // ==================================================================================
  // 1. HỆ THỐNG DỌN RÁC BỘ NHỚ (GARBAGE COLLECTION)
  // ==================================================================================
  React.useEffect(() => {
    const runGarbageCollector = () => {
      try {
        const now = Date.now();
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
        let hasChanges = false;
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
            Object.keys(sessions).forEach(langKey => {
              const langSessions = sessions[langKey];
              if (langSessions && typeof langSessions === 'object') {
                Object.keys(langSessions).forEach(gameType => {
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
            hasChanges = true;
          }
        }
        
        const chatStr = localStorage.getItem('fc_ai_chat_history');
        if (chatStr) {
          let chatHistory = JSON.parse(chatStr);
          if (Array.isArray(chatHistory)) {
            if (isEmergency) {
              chatHistory = chatHistory.slice(-1);
              localStorage.setItem('fc_ai_chat_history', JSON.stringify(chatHistory));
              hasChanges = true;
            } else if (chatHistory.length > 20) {
              chatHistory = chatHistory.slice(-20);
              localStorage.setItem('fc_ai_chat_history', JSON.stringify(chatHistory));
              hasChanges = true;
            }
          }
        }
      } catch (e) {
        console.error("Garbage Collector Failed:", e);
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
  const secureCopy = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(t('syncSuccess')))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        showToast(t('syncSuccess'));
      } else {
        showToast("Trình duyệt chặn copy. Hãy copy thủ công.", "error");
      }
    } catch (err) {
      showToast("Lỗi copy: " + err, "error");
    }
  };

  // ==================================================================================
  // 3. ĐỘNG CƠ TẢI DỮ LIỆU GOOGLE SHEETS (PROXY & GVIZ)
  // ==================================================================================
  // Cách 1: Tải qua Proxy (Lấy toàn bộ file Excel nguyên khối)
  const safeFetchExcel = async (url) => {
    let cleanUrl = url.trim();
    const match = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error("Link không hợp lệ. Không tìm thấy ID của Google Sheet.");
    const sheetId = match[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    const cacheBuster = `&cb=${Date.now()}`;
    
    // [V1.02 FIX] Mạng lưới 7 Node Proxy bọc thép xuyên thủng CORS file://
    const proxies = [
      { name: "Direct", url: exportUrl },
      { name: "AllOrigins", url: `https://api.allorigins.win/raw?url=${encodeURIComponent(exportUrl + cacheBuster)}` },
      { name: "CorsProxyIO", url: `https://corsproxy.io/?${encodeURIComponent(exportUrl + cacheBuster)}` },
      { name: "ThingProxy", url: `https://thingproxy.freeboard.io/fetch/${exportUrl}` },
      { name: "CodeTabs", url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(exportUrl)}` },
      { name: "CorsAnywhere", url: `https://cors-anywhere.herokuapp.com/${exportUrl}` },
      { name: "CorsSH", url: `https://proxy.cors.sh/${exportUrl}` }
    ];
    
    let lastErr = null;
    for (const proxy of proxies) {
      try {
        const res = await fetch(proxy.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 100) throw new Error("File quá nhỏ, lỗi chặn kết nối.");
        
        const header = new Uint8Array(buffer).subarray(0, 2);
        if (header[0] !== 0x50 || header[1] !== 0x4B) {
          throw new Error("LỖI QUYỀN TRUY CẬP: Hãy chắc chắn Link Google Sheet của bạn đã bật quyền 'Bất kỳ ai có liên kết' (Anyone with the link).");
        }
        return buffer;
      } catch (e) {
        lastErr = e;
        console.warn(`[Excel Proxy Fallback] ${proxy.name} thất bại, thử node tiếp theo...`);
        if (e.message.includes("LỖI QUYỀN TRUY CẬP")) throw e;
      }
    }
    throw new Error("Mạng bị chặn Proxy. Sẽ tự động chuyển sang GViz...");
  };

  // Cách 2 (Tuyệt chiêu): Quét từng Tab trực tiếp bằng Google GViz (Bỏ qua Proxy)
  const fetchDirectGvizTabs = async (sheetId, targetLang) => {
    let allNewItems = [];
    let masterDataObj = {};
    let total = 0;
    
    const levelPrefix = targetLang === 'zh' ? 'zh_level_' : 'en_level_';
    const fetchTab = async (sheetName) => {
      const encodedName = encodeURIComponent(sheetName);
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodedName}`;
      try {
        const res = await Utils.fetchWithFallback(gvizUrl);
        if (!res) return null;
        const text = await res.text();
        if (text.trim().startsWith('<')) return null;
        return Utils.parseAndMapCSV(text);
      } catch (e) { return null; }
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
      const defaultTabs = ["Trang tính 1", "Sheet 1", "Sheet1", "Data"];
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
          const res = await Utils.fetchWithFallback(gvizUrl);
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
        } catch (e) {}
      }
    }
    
    return { masterData: masterDataObj, totalCards: total, flatItems: allNewItems };
  };

  // ==================================================================================
  // 4. IMPORT / EXPORT ĐA TẦNG (MULTI-DIMENSIONAL DATA SYNC)
  // ==================================================================================
  const handleImport = async (url, sourceType = 'vocab') => {
    if (!url || !url.trim()) { showToast("Vui lòng nhập URL!", "error"); return; }
    const cleanInputUrl = url.trim();
    core.setIsAiLoading(true);
    
    try {
      let masterData = {};
      let totalCards = 0;
      const levelPrefix = lang === 'zh' ? 'zh_level_' : 'en_level_';
      
      if (cleanInputUrl.includes('docs.google.com')) {
        const match = cleanInputUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error("Link không hợp lệ. Không tìm thấy ID của Google Sheet.");
        const sheetId = match[1];
        let useGvizFallback = false;
        
        try {
          const buffer = await safeFetchExcel(cleanInputUrl);
          const workbook = XLSX.read(buffer, { type: 'array' });
          const numTabs = Math.min(workbook.SheetNames.length, 9);
          
          for (let i = 0; i < numTabs; i++) {
            const sheetName = workbook.SheetNames[i];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
            const parsedCards = Utils.convertRawRowsToCards(rows);
            if (parsedCards.length > 0) {
              const matchLvl = sheetName.match(/\d+/);
              const levelNum = matchLvl ? parseInt(matchLvl[0], 10) : (i + 1);
              masterData[`${levelPrefix}${levelNum}`] = parsedCards;
              totalCards += parsedCards.length;
            }
          }
        } catch (err) {
          if (err.message.includes("LỖI QUYỀN TRUY CẬP")) throw err;
          console.warn("Proxy XLSX Failed, fallback to GViz:", err.message);
          useGvizFallback = true;
        }
        
        if (useGvizFallback) {
          showToast("Mạng đang chặn Proxy, chuyển sang kết nối trực tiếp Google...", "info");
          const { masterData: gvizData, totalCards: gvizTotal } = await fetchDirectGvizTabs(sheetId, lang);
          if (gvizTotal > 0) {
            masterData = gvizData;
            totalCards = gvizTotal;
          } else {
            throw new Error("Không thể tải file (File chưa được chia sẻ Public).");
          }
        }
      } else if (cleanInputUrl.endsWith('.xlsx')) {
        const res = await Utils.fetchWithFallback(cleanInputUrl);
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const numTabs = Math.min(workbook.SheetNames.length, 9);
        
        for (let i = 0; i < numTabs; i++) {
          const sheetName = workbook.SheetNames[i];
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          if (parsedCards.length > 0) {
            const match = sheetName.match(/\d+/);
            const levelNum = match ? parseInt(match[0], 10) : (i + 1);
            masterData[`${levelPrefix}${levelNum}`] = parsedCards;
            totalCards += parsedCards.length;
          }
        }
      } else {
        const res = await Utils.fetchWithFallback(cleanInputUrl);
        const text = await res.text();
        const parsedCards = Utils.parseAndMapCSV(text);
        if (parsedCards.length > 0) {
          masterData[`${levelPrefix}1`] = parsedCards;
          totalCards = parsedCards.length;
        }
      }
      
      if (totalCards > 0) {
        // 1. Lưu kho Master Data vào LocalStorage
        const storageKey = 'fc_master_data_' + lang + '_' + sourceType;
        Utils.safeLocalStorageSet(storageKey, masterData);

        // 2. Tự động lưu luôn URL vừa nạp vào Default URL để người dùng không bị quên bấm "Lưu"
        const defaultUrlKey = (STORAGE_KEYS.DEFAULT_URL || 'fc_default_url') + '_' + lang + '_' + sourceType;
        localStorage.setItem(defaultUrlKey, cleanInputUrl);

        // 3. Đồng bộ chế độ dữ liệu (vocab / sentence) nếu người dùng nạp tab khác với chế độ hiện tại
        if (core.dataMode !== sourceType && core.setDataMode) {
          core.setDataMode(sourceType);
        }

        // 4. Kích hoạt tín hiệu cho Động cơ "Vòi Nước" tại useCoreState lọc lại dữ liệu và lưu xuống fc_data_${lang}
        if (core.setMasterDataVersion) {
          core.setMasterDataVersion(prev => prev + 1);
        } else {
          const firstAvailableKey = Object.keys(masterData)[0];
          if (firstAvailableKey && masterData[firstAvailableKey]) {
            core.setCards(masterData[firstAvailableKey]);
            Utils.safeLocalStorageSet('fc_data_' + lang, masterData[firstAvailableKey]);
          }
        }

        showToast('Đã nạp thành công ' + totalCards + ' thẻ!', "success");
        core.setShowLinkManager(false);
      } else {
        throw new Error("Không tìm thấy dữ liệu hợp lệ");
      }
    } catch (e) {
      showToast("Lỗi nạp Dữ liệu: " + e.message, "error");
    } finally {
      core.setIsAiLoading(false);
    }
  };

  // ==================================================================================
  // 4b. CHỐT CHẶN CACHE-FIRST & AUTO-HYDRATE KHI KHO RỖNG (LẦN ĐẦU MỞ APP)
  // ==================================================================================
  React.useEffect(() => {
    if (!core.isDbReady) return;
    if (core.isStudyingNotebook || core.studySourceName) return;

    const currentMode = core.dataMode || 'vocab';
    const masterKey = 'fc_master_data_' + lang + '_' + currentMode;
    const cachedMaster = Utils.safeJsonParse(masterKey, null);

    // Kiểm tra xem trong Cache đã có ít nhất 1 Level chứa thẻ chưa
    const hasValidCache = cachedMaster && typeof cachedMaster === 'object' && Object.values(cachedMaster).some(
      arr => Array.isArray(arr) && arr.length > 0
    );

    // [CACHE-FIRST]: Nếu đã có dữ liệu trong LocalStorage thì DỪNG NGAY, tuyệt đối không gọi mạng!
    if (hasValidCache) {
      return;
    }

    // Nếu kho thực sự RỖNG (Lần đầu tiên mở App hoặc vừa xóa sạch Cache), tự động tải từ Default Sheet
    const hydrateSignature = lang + '_' + currentMode;
    if (autoHydrateRef.current[hydrateSignature]) return;

    const defaultUrlKey = (STORAGE_KEYS.DEFAULT_URL || 'fc_default_url') + '_' + lang + '_' + currentMode;
    const targetUrl = localStorage.getItem(defaultUrlKey) || DEFAULT_SHEETS?.[lang]?.[currentMode];

    if (targetUrl && targetUrl.trim().length > 5) {
      autoHydrateRef.current[hydrateSignature] = true;
      console.log('[Cache-First] Kho dữ liệu (' + hydrateSignature + ') đang trống. Khởi chạy Auto-Hydrate từ Sheet mặc định...');
      handleImport(targetUrl, currentMode);
    }
  }, [lang, core.dataMode, core.isDbReady]);

  const handleImportToNotebook = async (url) => {
    if (!url) { showToast("Vui lòng nhập URL!", "error"); return; }
    core.setIsAiLoading(true);
    
    try {
      let allNewItems = [];
      if (url.includes('docs.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) throw new Error("Link không hợp lệ.");
        const sheetId = match[1];
        let useGvizFallback = false;
        
        try {
          const buffer = await safeFetchExcel(url);
          const workbook = XLSX.read(buffer, { type: 'array' });
          for (let i = 0; i < workbook.SheetNames.length; i++) {
            const sheetName = workbook.SheetNames[i];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
            const parsedCards = Utils.convertRawRowsToCards(rows);
            allNewItems = allNewItems.concat(parsedCards);
          }
        } catch (err) {
          if (err.message.includes("LỖI QUYỀN TRUY CẬP")) throw err;
          useGvizFallback = true;
        }
        
        if (useGvizFallback) {
          const { flatItems } = await fetchDirectGvizTabs(sheetId, lang);
          if (flatItems.length > 0) {
            allNewItems = flatItems;
          } else {
            throw new Error("Không thể tải file (File chưa được chia sẻ Public).");
          }
        }
      } else if (url.endsWith('.xlsx')) {
        const buffer = await safeFetchExcel(url);
        const workbook = XLSX.read(buffer, { type: 'array' });
        for (let i = 0; i < workbook.SheetNames.length; i++) {
          const sheetName = workbook.SheetNames[i];
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          allNewItems = allNewItems.concat(parsedCards);
        }
      } else {
        const res = await Utils.fetchWithFallback(url);
        const text = await res.text();
        allNewItems = Utils.parseAndMapCSV(text);
      }
      
      if (allNewItems.length > 0) {
        core.setNotebook(prev => {
          const existingTerms = new Set(prev.map(i => i.term));
          const uniqueItems = allNewItems.filter(i => !existingTerms.has(i.term));
          if (uniqueItems.length === 0) {
            showToast("Tất cả từ trong link đã có trong sổ tay!", "info");
            return prev;
          }
          const updated = [...prev, ...uniqueItems];
          // Ghi ngầm Sổ tay xuống IndexedDB (Đã bỏ localStorage)
          if (FcDB) FcDB.set('fc_notebook_' + lang, updated);
          showToast('Đã gộp ' + uniqueItems.length + ' thẻ mới vào Sổ tay!', "success");
          return updated;
        });
        core.setShowLinkManager(false);
      } else {
        throw new Error("Dữ liệu trống");
      }
    } catch (e) {
      showToast("Lỗi nhập vào sổ tay: " + e.message, "error");
    } finally {
      core.setIsAiLoading(false);
    }
  };

  const handleFileImport = (e, sourceType = 'vocab') => {
    const file = e.target.files[0];
    if (!file) return;
    core.setIsAiLoading(true);
    const reader = new FileReader();
    
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        let masterData = {};
        let totalCards = 0;
        const levelPrefix = lang === 'zh' ? 'zh_level_' : 'en_level_';
        const numTabs = Math.min(wb.SheetNames.length, 9);
        
        for (let i = 0; i < numTabs; i++) {
          const sheetName = wb.SheetNames[i];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
          const parsedCards = Utils.convertRawRowsToCards(rows);
          if (parsedCards.length > 0) {
            const match = sheetName.match(/\d+/);
            const levelNum = match ? parseInt(match[0], 10) : (i + 1);
            masterData[`${levelPrefix}${levelNum}`] = parsedCards;
            totalCards += parsedCards.length;
          }
        }
        
        if (totalCards > 0) {
          const targetMode = typeof sourceType === 'string' ? sourceType : (core.dataMode || 'vocab');
          const storageKey = 'fc_master_data_' + lang + '_' + targetMode;
          Utils.safeLocalStorageSet(storageKey, masterData);

          if (core.dataMode !== targetMode && core.setDataMode) {
            core.setDataMode(targetMode);
          }

          if (core.setMasterDataVersion) {
            core.setMasterDataVersion(prev => prev + 1);
          } else {
            const firstAvailableKey = Object.keys(masterData)[0];
            if (firstAvailableKey && masterData[firstAvailableKey]) {
              core.setCards(masterData[firstAvailableKey]);
              Utils.safeLocalStorageSet('fc_data_' + lang, masterData[firstAvailableKey]);
            }
          }

          showToast('Đã tải lên thành công ' + totalCards + ' thẻ từ ' + numTabs + ' Tabs (.xlsx)!', "success");
          core.setShowLinkManager(false);
        } else {
          showToast("Tệp không chứa dữ liệu hợp lệ", "error");
        }
      } catch (err) {
        showToast("Lỗi đọc file: " + err.message, "error");
      } finally {
        core.setIsAiLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleManualImport = (textJson) => {
    try {
      const parsed = JSON.parse(textJson);
      handleAddCard(parsed);
    } catch (e) {
      showToast("Lỗi định dạng JSON: " + e.message, "error");
    }
  };

  const handleAddCard = (newInput) => {
    let items = Array.isArray(newInput) ? newInput : [newInput];
    if (items.length === 0) return;
    const updated = [...core.cards, ...items];
    core.setCards(updated);
    Utils.safeLocalStorageSet('fc_data_' + lang, updated);
    showToast('Thêm ' + items.length + ' thẻ thành công!', "success");
  };

  const handleExportExcel = () => {
    const { cards, notebook, isStudyingNotebook } = latestStateRef.current;
    if (!cards.length) return;
    
    const ws = XLSX.utils.json_to_sheet(isStudyingNotebook ? notebook : cards);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flashcards");
    XLSX.writeFile(wb, `flashcards_${lang}_${Date.now()}.xlsx`);
  };

  const handleExportLink = () => {
    const { cards } = latestStateRef.current;
    const tsv = Utils.jsonToTsv(cards);
    if (!tsv) {
      showToast("Không có dữ liệu!", "warning");
      return;
    }
    secureCopy(tsv);
  };

  const handleCopyForSheet = (dataToCopy) => {
    const tsv = Utils.jsonToTsv(dataToCopy);
    if (!tsv) {
      showToast("Không có dữ liệu để copy!", "warning");
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
            const res = await Utils.fetchWithFallback(gvizUrl);
            if (res) {
              const fetchedText = await res.text();
              if (!fetchedText.trim().startsWith('<')) text = fetchedText;
            }
          } catch (e) {
            console.warn("GViz Proxy Fetch failed:", e);
          }
        }
      }
      
      if (!text) {
        const res = await Utils.fetchWithFallback(url);
        text = await res.text();
      }
      
      const keys = text.split(/[\n,]/).map(k => k.trim()).filter(k => k.length > 20 && !k.includes(' '));
      if (keys.length > 0) {
        Utils.safeLocalStorageSet('fc_apikey_pool', keys);
        core.setApiKey(keys[0]);
        showToast('Đã nạp ' + keys.length + ' API Key!', "success");
      } else {
        showToast("Không tìm thấy Key hợp lệ", "warning");
      }
    } catch (e) {
      showToast("Lỗi tải Key: " + e.message, "error");
    } finally {
      core.setIsAiLoading(false);
    }
  };

  const handleDownloadTemplate = () => window.open(DEFAULT_API_KEY_SHEET, '_blank');

  const handleResetSettings = () => {
    if (core.resetPending) {
      core.setSettings(core.DEFAULT_SETTINGS);
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(core.DEFAULT_SETTINGS));
      showToast("Đã khôi phục cài đặt mặc định!", "success");
      core.setShowSettings(false); core.setResetPending(false);
    } else {
      core.setResetPending(true); showToast("⚠️ Nhấn lần nữa để xác nhận!", "warning");
      if (core.resetTimeoutRef.current) clearTimeout(core.resetTimeoutRef.current);
      core.resetTimeoutRef.current = setTimeout(() => core.setResetPending(false), 3000);
    }
  };

  const handleReloadDefault = () => {
    if (core.resetPending) {
      const currentMode = core.dataMode || 'vocab';
      const defaultUrlKey = (STORAGE_KEYS.DEFAULT_URL || 'fc_default_url') + '_' + lang + '_' + currentMode;
      const linkToLoad = localStorage.getItem(defaultUrlKey) || DEFAULT_SHEETS?.[lang]?.[currentMode];
      if (linkToLoad) {
        handleImport(linkToLoad, currentMode);
      } else {
        core.setCards([]);
        Utils.safeLocalStorageSet('fc_data_' + lang, []);
        showToast("Đã làm trống dữ liệu!", "success");
      }
      core.setResetPending(false);
    } else {
      core.setResetPending(true); showToast("⚠️ Nhấn lần nữa để tải lại dữ liệu!", "warning");
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
      
      // Bổ sung dữ liệu từ IndexedDB vào chung file Backup (Chuẩn hóa đúng tên Key của từng ngôn ngữ)
      if (FcDB) {
        const incBase = STORAGE_KEYS.INCORRECT_LIST || 'fc_incorrect_list';
        const dbKeys = [
          'fc_ai_harvest_pool',
          'fc_global_retry_bag_en',
          'fc_global_retry_bag_zh',
          'fc_notebook_en',
          'fc_notebook_zh',
          'fc_mastered_en',
          'fc_mastered_zh',
          incBase + '_en',
          incBase + '_zh'
        ];
        for (const key of dbKeys) {
          const data = await FcDB.get(key);
          if (data) {
            saveData[key] = JSON.stringify(data); // Stringify để đồng nhất với định dạng LocalStorage lúc phục hồi
          }
        }
      }
      
      const dataStr = JSON.stringify(saveData, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const now = new Date();
      const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `flashcard_save_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast("Đã tạo file sao lưu thành công!", "success");
    } catch (e) {
      console.error("Export save error:", e);
      showToast("Lỗi khi tạo file sao lưu!", "error");
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
              // Đổ tất cả vào LocalStorage. Khi reload lại trang, useCoreState (initPersistence) sẽ tự động chuyển những gì cần thiết vào IndexedDB.
              localStorage.setItem(key, importedData[key]);
              count++;
            }
          }
          
          if (count > 0) {
            showToast('Đã phục hồi ' + count + ' mục. Đang khởi động lại...', "success");
            setTimeout(() => { window.location.reload(); }, 1500);
            resolve(true);
          } else {
            showToast("File không chứa dữ liệu hợp lệ!", "error");
            reject(new Error("Invalid save file"));
          }
        } catch (err) {
          console.error("Import save error:", err);
          showToast("File bị lỗi hoặc không đúng định dạng!", "error");
          reject(err);
        }
      };
      
      reader.onerror = (err) => {
        showToast("Lỗi đọc file!", "error");
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