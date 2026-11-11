/**
 * @file src/hooks/useExamPoolLogic.js
 * @description "Thủ kho" quản lý Ngân hàng đề thi (Exam Harvest Pool), Sổ luân hồi (UID History) và Tỉ lệ Lai (Hybrid Ratio).
 * @origin Tầng 6 - Block 6.8 (Exam Pool Logic)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';

export const useExamPoolLogic = (core, callbacks) => {
  const { showToast } = callbacks;
  
  // --- 1. STATE ĐỊNH NGHĨA ---
  const [examPool, setExamPool] = useState({});
  const [hybridRatio, setHybridRatio] = useState(70);
  const [userExamHistory, setUserExamHistory] = useState([]);
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  
  // Hệ thống Hàng đợi Thu hoạch (Harvest Queue)
  const harvestQueueRef = useRef([]);
  const isProcessingHarvestRef = useRef(false);

  // --- 2. KHỞI TẠO TỪ INDEXEDDB ---
  useEffect(() => {
    if (core.isDbReady && FcDB) {
      FcDB.get('fc_exam_pool').then(data => {
        if (data) setExamPool(data);
      });
      FcDB.get('fc_exam_ratio').then(data => {
        if (data !== undefined && data !== null) setHybridRatio(Number(data));
      });
      FcDB.get('fc_user_exam_history').then(data => {
        if (data && Array.isArray(data)) setUserExamHistory(data);
      });
    }
  }, [core.isDbReady]);

  // --- 3. TIỆN ÍCH LƯU TRỮ (PERSISTENCE) ---
  const savePoolToDB = async (newPool) => {
    setExamPool(newPool);
    if (FcDB) await FcDB.set('fc_exam_pool', newPool);
  };

  const handleRatioChange = async (newRatio) => {
    const num = Number(newRatio);
    setHybridRatio(num);
    if (FcDB) await FcDB.set('fc_exam_ratio', num);
  };

  const handleClearPool = async () => {
    // LƯU Ý: Tầng Giao diện (UI) phải tự triển khai Modal Xác nhận trước khi gọi hàm này, 
    // nghiêm cấm dùng window.confirm() gây chặn luồng trình duyệt.
    await savePoolToDB({});
    if (FcDB) await FcDB.set('fc_user_exam_history', []);
    setUserExamHistory([]);
    showToast("Đã làm rỗng Ngân hàng đề thi và Sổ luân hồi!", "success");
  };

  // [NEW v1.04] TRẠM GÁC TÍNH TOÀN VẸN (DATA INTEGRITY GATEKEEPER)
  const validateQuestionData = (itemObj, qType) => {
    const c = itemObj.content;
    if (!c) return false;
    
    // 1. Kiểm tra giải thích (Bắt buộc cho mọi dạng bài thi chuẩn)
    // Bổ sung c.definition vào danh sách chấp nhận để không vứt bỏ oan câu hỏi từ Lò đúc cơ sở
    const exp = c.explanation || c.analysis || c.hint || c.definition || "";
    if (!exp || String(exp).trim() === "") {
      console.warn("[Gatekeeper] Bị từ chối do thiếu giải thích/định nghĩa:", itemObj);
      return false;
    }
    
    // 2. Kiểm tra theo từng dạng bài
    const isOptionsType = qType.includes('multiple_choice') || qType.includes('match') || qType.includes('listening') || qType.includes('image_quiz') || qType.includes('pronunciation');
    if (isOptionsType) {
      if (!c.options || !Array.isArray(c.options) || c.options.length < 3) {
        console.warn("[Gatekeeper] Bị từ chối do thiếu options hoặc số lượng < 3:", itemObj);
        return false;
      }
      const hasCorrect = c.options.some(opt => opt.isCorrect === true || String(opt.isCorrect).toLowerCase() === 'true');
      if (!hasCorrect) {
        console.warn("[Gatekeeper] Bị từ chối do không có đáp án đúng (isCorrect = true):", itemObj);
        return false;
      }
      const termText = c.term || c.audioScript || c.passage || "";
      if (!termText || String(termText).trim() === "") {
        console.warn("[Gatekeeper] Bị từ chối do câu hỏi/đoạn văn rỗng:", itemObj);
        return false;
      }
    } else if (qType.includes('spot_mistake')) {
      if (!c.wrongSentence || !c.wrongWord || !c.correction) return false;
      // Đảm bảo từ sai có tồn tại thực tế trong câu gốc
      if (!c.wrongSentence.toLowerCase().includes(c.wrongWord.toLowerCase())) {
        console.warn("[Gatekeeper] Bị từ chối do từ sai không khớp với câu gốc:", itemObj);
        return false;
      }
    } else if (qType.includes('fill_blank')) {
      if (!c.displaySentence || !c.targetWord) return false;
      if (!c.displaySentence.includes('[__________]')) {
        console.warn("[Gatekeeper] Bị từ chối do thiếu lỗ hổng [__________]:", itemObj);
        return false;
      }
    } else if (qType.includes('odd_one_out')) {
      if (!c.words || !Array.isArray(c.words) || c.words.length < 4 || !c.oddWord) return false;
    }
    return true; // Dữ liệu hoàn hảo
  };

  // Helper: Phân bổ 1 câu hỏi vào đúng "ngăn kéo" KÈM MÀNG LỌC
  const insertIntoPool = (poolObj, item, lang, level, topic, type) => {
    // Trạm gác chặn dữ liệu rác trước khi chạm vào Cây thư mục
    if (!validateQuestionData(item, type)) {
      return false; // Bỏ qua câu hỏi khuyết tật
    }
    
    if (!poolObj[lang]) poolObj[lang] = {};
    if (!poolObj[lang][level]) poolObj[lang][level] = {};
    const safeTopic = topic || 'General';
    if (!poolObj[lang][level][safeTopic]) poolObj[lang][level][safeTopic] = {};
    if (!poolObj[lang][level][safeTopic][type]) poolObj[lang][level][safeTopic][type] = [];
    
    const targetArray = poolObj[lang][level][safeTopic][type];
    let isDup = false;
    let replaceIdx = -1;
    
    // Trích xuất text để so sánh (chuẩn hóa dựa trên cấu trúc item.content)
    const getCompareText = (content) => {
      if (!content) return "";
      if (content.wrongSentence) return content.wrongSentence;
      if (content.displaySentence) return content.displaySentence;
      if (Array.isArray(content.words)) return content.words.join(' ');
      if (content.audioScript) return content.audioScript;
      if (content.passage) return content.passage;
      return content.term || "";
    };
    
    const newItemText = getCompareText(item.content);
    for (let i = 0; i < targetArray.length; i++) {
      const existing = targetArray[i];
      // 1. Kiểm tra ID ghi đè (Dành cho tính năng Import Excel ngược)
      if (existing.id && item.id && existing.id === item.id) {
        isDup = true;
        replaceIdx = i;
        break;
      }
      
      // 2. Màng lọc 70% (Fuzzy Matching)
      const existingText = getCompareText(existing.content);
      if (newItemText && existingText && Utils && Utils.calculateSimilarity) {
        const simScore = Utils.calculateSimilarity(newItemText, existingText);
        if (simScore >= 0.7) {
          console.log(`[ExamPool] Bị từ chối do giống ${Math.round(simScore*100)}% với câu có sẵn:`, newItemText);
          isDup = true;
          break;
        }
      } else {
        // Fallback nếu không có hàm similarity
        if (JSON.stringify(existing.content) === JSON.stringify(item.content)) {
          isDup = true;
          break;
        }
      }
    }
    
    if (!isDup) {
      // Bơm UID nếu chưa có
      if (!item.id) {
        const uid = "ex_" + type + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        item.id = uid;
      }
      targetArray.push(item);
      return true;
    } else if (replaceIdx !== -1) {
      // Nếu trùng ID, cho phép ghi đè nội dung mới từ Excel (Tính năng sửa lỗi của Admin)
      targetArray[replaceIdx] = item;
      return true;
    }
    return false;
  };

  // --- 3.5 BỘ NÃO HÀNG ĐỢI (CHỐNG RACE CONDITION) ---
  const processHarvestQueue = async () => {
    if (isProcessingHarvestRef.current || harvestQueueRef.current.length === 0) return;
    isProcessingHarvestRef.current = true;
    
    try {
      // Lấy Pool mới nhất từ DB thay vì dùng State RAM để đảm bảo tính nguyên vẹn
      let currentPool = {};
      if (FcDB) {
        const dbData = await FcDB.get('fc_exam_pool');
        if (dbData) currentPool = dbData;
      }
      
      let hasChanges = false;
      let addedCount = 0;
      
      // Xử lý toàn bộ Hàng đợi
      while (harvestQueueRef.current.length > 0) {
        const { item, lang, level, topic, type } = harvestQueueRef.current.shift();
        const isAdded = insertIntoPool(currentPool, item, lang, level, topic, type);
        if (isAdded) {
          hasChanges = true;
          addedCount++;
        }
      }
      
      // Chốt sổ: Cập nhật State và DB MỘT LẦN DUY NHẤT
      if (hasChanges) {
        setExamPool(currentPool);
        if (FcDB) await FcDB.set('fc_exam_pool', currentPool);
        console.log(`[ExamPool] Auto-harvested ${addedCount} new valid items securely.`);
      }
    } catch (e) {
      console.error("[ExamPool] Harvest Queue Error:", e);
    } finally {
      isProcessingHarvestRef.current = false;
      // Nếu trong lúc lưu có thêm câu mới được bắn vào hàng đợi, vòng lặp tự kích hoạt lại
      if (harvestQueueRef.current.length > 0) {
        processHarvestQueue();
      }
    }
  };

  const handleAutoHarvestToPool = useCallback((item, lang, level, topic, type) => {
    harvestQueueRef.current.push({ item, lang, level, topic, type });
    processHarvestQueue();
  }, []);

  // --- 4. BỘ CHUYỂN ĐỔI (MINI-GAME ADAPTER) ---
  const handleImportFromMiniGame = useCallback((file) => {
    if (!file) return;
    setIsPoolLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        if (!XLSX) throw new Error("Thư viện XLSX chưa được tải");
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        
        let addedCount = 0;
        let currentPool = { ...examPool };
        
        for (let i = 0; i < wb.SheetNames.length; i++) {
          const sheetName = wb.SheetNames[i];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
          if (rows.length < 2) continue;
          
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length < 11) continue;
            
            const term = String(row[0] || "").trim();
            const definition = String(row[2] || "").trim();
            const analysis = String(row[3] || "").trim();
            const example = String(row[5] || "").trim();
            const pos = String(row[7] || "").trim();
            const topic = String(row[8] || "General").trim();
            const levelCode = String(row[9] || "en_level_4").trim();
            const langCode = String(row[10] || "en").trim();
            
            if (!term) continue;
            
            let questionContent = {};
            let qType = "";
            
            if (pos === "Spot Mistake") {
              qType = "ioe_spot_mistake";
              questionContent = { wrongSentence: term, wrongWord: "", correction: definition, explanation: analysis };
              if (example.includes("Câu hoàn chỉnh:")) {
                const cleanSentence = example.replace("Câu hoàn chỉnh:", "").trim();
                const wordsOriginal = term.split(" ");
                const wordsClean = cleanSentence.split(" ");
                for (let w = 0; w < wordsOriginal.length; w++) {
                  if (wordsOriginal[w] !== wordsClean[w]) {
                    questionContent.wrongWord = wordsOriginal[w];
                    break;
                  }
                }
              }
            } else if (pos === "Fill Blank") {
              qType = "ioe_fill_blank";
              questionContent = { displaySentence: term, targetWord: definition, hint: analysis };
            } else if (pos === "Odd One Out") {
              qType = "ioe_odd_one_out";
              questionContent = { words: term.split(' • '), oddWord: definition, explanation: analysis };
            } else {
              qType = "ioe_multiple_choice";
              questionContent = { term: term, definition: definition, analysis: analysis, example: example };
            }
            
            const newItem = {
              id: "ex_" + qType + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
              content: questionContent,
              timestamp: Date.now()
            };
            
            const isAdded = insertIntoPool(currentPool, newItem, langCode, levelCode, topic, qType);
            if (isAdded) addedCount++;
          }
        }
        
        if (addedCount > 0) {
          await savePoolToDB(currentPool);
          showToast("Đã nạp và chuyển đổi thành công " + addedCount + " câu hỏi từ Mini-Game!", "success");
        } else {
          showToast("Không tìm thấy dữ liệu hợp lệ hoặc tất cả đã bị loại bỏ.", "warning");
        }
      } catch (err) {
        console.error("Mini-game Import Error:", err);
        showToast("Lỗi đọc file: " + err.message, "error");
      } finally {
        setIsPoolLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  }, [examPool, showToast]);

  // --- 5. EXPORT / XUẤT KHO ---
  const handleExportExamPoolToExcel = useCallback(() => {
    if (!XLSX) {
      showToast("Thư viện Excel chưa được tải!", "error");
      return;
    }
    
    let flatData = [];
    Object.keys(examPool).forEach(lang => {
      Object.keys(examPool[lang]).forEach(level => {
        Object.keys(examPool[lang][level]).forEach(topic => {
          Object.keys(examPool[lang][level][topic]).forEach(type => {
            const items = examPool[lang][level][topic][type];
            items.forEach(item => {
              const c = item.content;
              let termText = c.term || c.displaySentence || c.wrongSentence || (Array.isArray(c.words) ? c.words.join(' • ') : "") || c.audioScript || c.passage || "";
              let defText = c.definition || c.targetWord || c.correction || c.oddWord || c.correctAnswer || "";
              
              // Trích xuất đáp án đúng từ mảng options nếu có
              if (c.options && Array.isArray(c.options)) {
                const correctOpt = c.options.find(o => o.isCorrect === true || String(o.isCorrect).toLowerCase() === 'true');
                if (correctOpt) {
                  defText = correctOpt.text;
                }
              }
              
              flatData.push({
                ID: item.id,
                Language: lang,
                Level: level,
                Topic: topic,
                Type: type,
                Question_Term: termText,
                Correct_Answer: defText,
                Options_JSON: c.options ? JSON.stringify(c.options) : "",
                Explanation: c.explanation || c.analysis || c.hint || c.definition || "",
                AudioScript: c.audioScript || "",
                PassageId: c.passageGroup || "",
                Timestamp: item.timestamp || ""
              });
            });
          });
        });
      });
    });
    
    if (flatData.length === 0) {
      showToast("Ngân hàng đề thi đang trống rỗng!", "warning");
      return;
    }
    
    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Exam_Master_Pool");
    
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, "Exam_Harvest_Pool_" + dateStr + ".xlsx");
    showToast("Đã tải xuống file Ngân hàng đề thi thành công!", "success");
  }, [examPool, showToast]);

  // --- 6. IMPORT / NHẬP NGƯỢC EXCEL TỪ KHO ĐÃ XUẤT ---
  const handleImportFromExcel = useCallback((file) => {
    if (!file) return;
    setIsPoolLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
        if (!XLSX) throw new Error("Thư viện XLSX chưa được tải");
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        
        let addedCount = 0;
        let currentPool = { ...examPool };
        
        const sheetName = wb.SheetNames.includes("Exam_Master_Pool") ? "Exam_Master_Pool" : wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
        
        if (rows.length < 2) {
          throw new Error("File trống hoặc không đúng định dạng chuẩn của Kho Khảo thí.");
        }
        
        const headers = rows[0].map(h => String(h || "").trim());
        const getCol = (name) => headers.indexOf(name);
        
        const cols = {
          id: getCol("ID"), lang: getCol("Language"), level: getCol("Level"), topic: getCol("Topic"),
          type: getCol("Type"), term: getCol("Question_Term"), ans: getCol("Correct_Answer"),
          opts: getCol("Options_JSON"), exp: getCol("Explanation"), audio: getCol("AudioScript"),
          passage: getCol("PassageId"), timestamp: getCol("Timestamp")
        };
        
        if (cols.lang === -1 || cols.level === -1 || cols.type === -1) {
          throw new Error("File bị khuyết các cột bắt buộc (Language, Level, Type). Không thể nạp.");
        }
        
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;
          
          const langCode = String(row[cols.lang] || "").trim();
          const levelCode = String(row[cols.level] || "").trim();
          const topic = String(row[cols.topic] || "General").trim();
          const qType = String(row[cols.type] || "").trim();
          const id = cols.id !== -1 ? String(row[cols.id] || "") : "";
          
          if (!langCode || !levelCode || !qType) continue;
          
          const termText = cols.term !== -1 ? String(row[cols.term] || "") : "";
          const ansText = cols.ans !== -1 ? String(row[cols.ans] || "") : "";
          const expText = cols.exp !== -1 ? String(row[cols.exp] || "") : "";
          const audioText = cols.audio !== -1 ? String(row[cols.audio] || "") : "";
          const passageId = cols.passage !== -1 ? String(row[cols.passage] || "") : "";
          
          let optsArr = [];
          if (cols.opts !== -1 && row[cols.opts]) {
            try { optsArr = JSON.parse(row[cols.opts]); } catch(e) {}
          }
          
          // Nếu Admin cập nhật lại cột Correct_Answer nhưng quên sửa Options_JSON, ta tự động đồng bộ lại mảng cho họ
          if (optsArr.length > 0 && ansText) {
            let foundCorrect = false;
            optsArr.forEach(o => {
              if (o.text === ansText) { o.isCorrect = true; foundCorrect = true; }
              else { o.isCorrect = false; }
            });
            if (!foundCorrect && optsArr.length > 0) {
              optsArr[0].text = ansText;
              optsArr[0].isCorrect = true;
            }
          }
          
          let content = {};
          if (qType === 'ioe_spot_mistake') {
            content = { wrongSentence: termText, correction: ansText, explanation: expText, wrongWord: ansText };
          } else if (qType === 'ioe_fill_blank') {
            content = { displaySentence: termText, targetWord: ansText, hint: expText };
          } else if (qType === 'ioe_odd_one_out') {
            content = { words: termText.split(' • '), oddWord: ansText, explanation: expText };
          } else if (qType === 'ioe_listening') {
            content = { audioScript: audioText, term: termText, options: optsArr, explanation: expText };
          } else if (qType === 'ielts_reading_passage') {
            content = { passage: termText, passageGroup: passageId };
          } else {
            content = { term: termText, definition: ansText, options: optsArr, explanation: expText, passageGroup: passageId };
          }
          
          const newItem = {
            id: id || ("ex_" + qType + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5)),
            content: content,
            timestamp: cols.timestamp !== -1 && row[cols.timestamp] ? Number(row[cols.timestamp]) : Date.now()
          };
          
          const isAdded = insertIntoPool(currentPool, newItem, langCode, levelCode, topic, qType);
          if (isAdded) addedCount++;
        }
        
        if (addedCount > 0) {
          await savePoolToDB(currentPool);
          showToast(`Đã nhập và cập nhật thành công ${addedCount} câu hỏi từ Excel Kho!`, "success");
        } else {
          showToast("Không có thay đổi mới nào được ghi nhận (Bị từ chối bởi Trạm gác).", "warning");
        }
      } catch (err) {
        console.error("Excel Import Kho Error:", err);
        showToast("Lỗi đọc file: " + err.message, "error");
      } finally {
        setIsPoolLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  }, [examPool, showToast]);

  return {
    examPool,
    hybridRatio,
    isPoolLoading,
    handleRatioChange,
    handleClearPool,
    handleImportFromMiniGame,
    handleExportExamPoolToExcel,
    handleImportFromExcel,
    handleAutoHarvestToPool
  };
};