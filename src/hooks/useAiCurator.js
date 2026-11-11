/**
 * @file src/hooks/useAiCurator.js
 * @description Quản lý Kho dữ liệu AI tự sinh (AI Harvest Pool). Thu hoạch câu hỏi, bảo trì bộ nhớ, xuất bản dữ liệu sang Excel chuẩn.
 * @origin Tầng 6 - Block 6.6 (AI Curator Logic)
 */

import { useCallback } from 'react';
import * as XLSX from 'xlsx';

export const useAiCurator = (core, latestStateRef, callbacks) => {
  const { t, showToast } = callbacks;
  const { lang } = core;

  // ==================================================================================
  // 1. THU HOẠCH DỮ LIỆU (HARVESTING ACTIONS)
  // ==================================================================================
  const handleSaveToHarvest = useCallback((level, data) => {
    if (!level || !data) return;
    
    // Cập nhật State RAM (Block 6.1 sẽ tự động bắt tín hiệu và ghi ngầm xuống IndexedDB)
    core.setAiHarvestPool(prev => {
      const currentLevelData = prev[level] || [];
      
      // Nhận diện nội dung để chống trùng lặp (Linh hoạt theo game)
      const checkStr = data.displaySentence || data.wrongSentence || data.term || "";
      if (!checkStr) return prev;
      
      const isDuplicate = currentLevelData.some(item =>
        (item.displaySentence === checkStr) ||
        (item.wrongSentence === checkStr) ||
        (item.term === checkStr)
      );
      
      if (isDuplicate) return prev;
      const newData = [...currentLevelData, { ...data, timestamp: Date.now() }];
      return { ...prev, [level]: newData };
    });
    
    // Giải quyết Race Condition: Lùi lại 1000ms để đảm bảo State trên RAM
    // và latestStateRef ở Block 6.4 đã được đồng bộ hoàn tất trước khi đếm dung lượng
    setTimeout(() => {
      handleCheckHarvestMemory();
    }, 1000);
  }, [core.setAiHarvestPool]);

  // ==================================================================================
  // 2. BẢO TRÌ BỘ NHỚ (MAINTENANCE - GỠ BỎ GIỚI HẠN)
  // ==================================================================================
  const handleCheckHarvestMemory = useCallback(() => {
    try {
      const currentPool = latestStateRef.current.aiHarvestPool;
      if (!currentPool) return;
      
      // Tính tổng số mục trong kho
      const totalItems = Object.values(currentPool).reduce((sum, arr) => sum + (arr?.length || 0), 0);
      const WARNING_LIMIT = 50000; // Ngưỡng cảnh báo cực lớn cho IndexedDB
      
      if (totalItems > WARNING_LIMIT && !window.fc_harvest_warned) {
        showToast(`Kho dữ liệu AI hiện đã đạt ${totalItems} câu. Bạn nên xuất ra Excel để Backup an toàn!`, "warning");
        window.fc_harvest_warned = true;
      }
    } catch (e) {
      console.warn("[AiCurator] Maintenance Error:", e);
    }
  }, [latestStateRef, showToast]);

  const handleClearHarvestPool = useCallback(() => {
    if (!window.confirm("Hành động này sẽ xóa vĩnh viễn toàn bộ câu hỏi AI đã thu hoạch. Bạn có chắc chắn?")) {
      return;
    }
    
    // Chỉ Set lên RAM, gỡ bỏ "Double Write" xuống FcDB
    core.setAiHarvestPool({});
    showToast("Đã làm rỗng kho dữ liệu AI!", "success");
  }, [core.setAiHarvestPool, showToast]);

  // ==================================================================================
  // 3. XUẤT BẢN DỮ LIỆU (EXPORTING)
  // ==================================================================================
  const handleExportHarvestToExcel = useCallback(() => {
    const pool = latestStateRef.current.aiHarvestPool;
    
    if (!pool || Object.keys(pool).length === 0) {
      showToast("Kho dữ liệu AI trống!", "warning");
      return;
    }
    
    const wb = XLSX.utils.book_new();
    let hasData = false;
    
    Object.keys(pool).forEach(levelKey => {
      const items = pool[levelKey];
      if (items && items.length > 0) {
        hasData = true;
        
        // Trích xuất thông tin Level và Language từ Key (VD: 'en_level_4')
        const parts = levelKey.split('_');
        const languageCode = parts[0] || 'en';
        const levelCode = levelKey;
        
        const formattedData = items.map(item => {
          let term = '';
          let definition = '';
          let analysis = '';
          let example = '';
          let pos = '';
          
          // NHẬN DIỆN CẤU TRÚC DỮ LIỆU THEO TỪNG GAME (NORMALIZATION)
          if (item.wrongSentence && item.wrongWord && item.correction) {
            pos = "Spot Mistake";
            term = item.wrongSentence;
            definition = item.correction;
            analysis = item.explanation || '';
            example = "Câu hoàn chỉnh: " + item.wrongSentence.replace(item.wrongWord, item.correction);
          } else if (item.displaySentence && item.displaySentence.includes('[__________]') && item.targetWord) {
            pos = "Fill Blank";
            term = item.displaySentence;
            definition = item.targetWord;
            analysis = item.hint || '';
            example = "Câu hoàn chỉnh: " + item.displaySentence.replace('[__________]', item.targetWord);
            if (item.hint) example += " | Bản dịch: " + item.hint;
          } else if (item.words && item.oddWord) {
            pos = "Odd One Out";
            term = Array.isArray(item.words) ? item.words.join(' • ') : item.words;
            definition = item.oddWord;
            analysis = item.explanation || '';
            example = item.hint ? "Nghĩa: " + item.hint : "";
          } else {
            pos = "Pure AI Content";
            term = item.displaySentence || item.term || '';
            definition = item.targetWord || item.definition || '';
            analysis = item.hint || item.explanation || item.analysis || '';
            example = item.example || '';
          }
          
          // Map vào các cột chuẩn của Flashcard Lite (Thêm grammar_type thành cột J)
          return {
            term: term,
            pronunciation: item.pronunciation || '',
            definition: definition,
            analysis: analysis,
            sinoViet: item.sinoViet || '',
            example: example,
            image: item.image || '',
            partOfSpeech: pos,
            topic: item.topic || 'AI Harvested',
            grammar_type: Array.isArray(item.grammar_type) ? item.grammar_type.join(', ') : (item.grammar_type || ''),
            level: levelCode,
            language: languageCode
          };
        });
        
        const ws = XLSX.utils.json_to_sheet(formattedData);
        // Tên sheet giới hạn 31 ký tự
        const sheetName = levelKey.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });
    
    if (!hasData) {
      showToast("Không có câu hỏi nào hợp lệ để xuất!", "warning");
      return;
    }
    
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    XLSX.writeFile(wb, `AI_Harvest_Master_${dateStr}.xlsx`);
    showToast("Đã tải xuống file Excel chuẩn chứa nhãn ngữ pháp!", "success");
  }, [latestStateRef, showToast]);

  // TRẢ VỀ API CHO MAIN CONTROLLER
  return {
    handleSaveToHarvest,
    handleCheckHarvestMemory,
    handleClearHarvestPool,
    handleExportHarvestToExcel
  };
};