// ============================================================================
// FILE 79/85: src/hooks/useAiCurator.js
// NGUỒN GỐC: Tầng 6 - Block 6.6 (AI Curator Logic - Version 1.02)
// NHIỆM VỤ: Chuyên trách quản lý Kho dữ liệu AI tự sinh (AI Harvest Pool).
//           Thu hoạch câu hỏi, bảo trì bộ nhớ, xuất bản dữ liệu sang Excel chuẩn.
// ============================================================================

import { useCallback } from 'react';
import * as XLSX from 'xlsx';

// Trình lấy thư viện XLSX an toàn (Hỗ trợ cả ES Module lẫn Global Window)
const getXlsx = () => {
  if (XLSX && XLSX.utils) return XLSX;
  if (typeof window !== 'undefined' && window.XLSX) return window.XLSX;
  return null;
};

export const useAiCurator = (core, latestStateRef, callbacks = {}) => {
  const { showToast } = callbacks;
  const { setAiHarvestPool } = core;

  // ==================================================================================
  // 1. BẢO TRÌ BỘ NHỚ (MAINTENANCE - GỠ BỎ GIỚI HẠN)
  // ==================================================================================
  const handleCheckHarvestMemory = useCallback(() => {
    try {
      const currentPool = latestStateRef.current?.aiHarvestPool;
      if (!currentPool) return;

      // Tính tổng số mục trong kho
      const totalItems = Object.values(currentPool).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
      );
      const WARNING_LIMIT = 50000; // Ngưỡng cảnh báo cực lớn cho IndexedDB

      if (
        totalItems > WARNING_LIMIT &&
        typeof window !== 'undefined' &&
        !window.fc_harvest_warned
      ) {
        if (typeof showToast === 'function') {
          showToast(
            `Kho dữ liệu AI hiện đã đạt ${totalItems} câu. Bạn nên xuất ra Excel để Backup an toàn!`,
            'warning'
          );
        }
        window.fc_harvest_warned = true;
      }
    } catch (e) {
      console.warn('[AiCurator] Maintenance Error:', e);
    }
  }, [latestStateRef, showToast]);

  // ==================================================================================
  // 2. THU HOẠCH DỮ LIỆU (HARVESTING ACTIONS)
  // ==================================================================================
  const handleSaveToHarvest = useCallback(
    (level, data) => {
      if (!level || !data) return;

      // Ép kiểu an toàn cho level (Phòng trường hợp Multi-select truyền xuống mảng)
      const safeLevelKey = Array.isArray(level) ? level[0] : String(level);
      if (!safeLevelKey) return;

      // Cập nhật State RAM (Block 6.1 sẽ tự động bắt tín hiệu và ghi ngầm xuống IndexedDB)
      setAiHarvestPool((prev) => {
        const safePrev = prev || {};
        const currentLevelData = safePrev[safeLevelKey] || [];

        // Nhận diện nội dung để chống trùng lặp (Linh hoạt theo game)
        const checkStr =
          data.displaySentence ||
          data.wrongSentence ||
          data.term ||
          (Array.isArray(data.words) ? data.words.join(' • ') : '');
        if (!checkStr) return safePrev;

        const isDuplicate = currentLevelData.some(
          (item) =>
            item.displaySentence === checkStr ||
            item.wrongSentence === checkStr ||
            item.term === checkStr ||
            (Array.isArray(item.words) && item.words.join(' • ') === checkStr)
        );
        if (isDuplicate) return safePrev;

        const newData = [...currentLevelData, { ...data, timestamp: Date.now() }];
        return { ...safePrev, [safeLevelKey]: newData };
      });

      // Giải quyết Race Condition: Lùi lại 1000ms để đảm bảo State trên RAM
      // và latestStateRef ở Block 6.4 đã được đồng bộ hoàn tất trước khi đếm dung lượng
      setTimeout(() => {
        handleCheckHarvestMemory();
      }, 1000);
    },
    [setAiHarvestPool, handleCheckHarvestMemory]
  );

  const handleClearHarvestPool = useCallback(() => {
    // Chỉ Set lên RAM, gỡ bỏ "Double Write" xuống FcDB (useCoreState sẽ tự đồng bộ)
    setAiHarvestPool({});
    if (typeof showToast === 'function') {
      showToast('Đã làm rỗng kho dữ liệu AI!', 'success');
    }
  }, [setAiHarvestPool, showToast]);

  // ==================================================================================
  // 3. XUẤT BẢN DỮ LIỆU (EXPORTING)
  // ==================================================================================
  const handleExportHarvestToExcel = useCallback(() => {
    const pool = latestStateRef.current?.aiHarvestPool;
    if (!pool || Object.keys(pool).length === 0) {
      if (typeof showToast === 'function') {
        showToast('Kho dữ liệu AI trống!', 'warning');
      }
      return;
    }

    const xlsxLib = getXlsx();
    if (!xlsxLib) {
      if (typeof showToast === 'function') {
        showToast('Thư viện Excel chưa được tải!', 'error');
      }
      return;
    }

    const wb = xlsxLib.utils.book_new();
    let hasData = false;

    Object.keys(pool).forEach((levelKey) => {
      const items = pool[levelKey];
      if (Array.isArray(items) && items.length > 0) {
        hasData = true;
        // Trích xuất thông tin Level và Language từ Key (VD: 'en_level_4')
        const parts = levelKey.split('_');
        const languageCode = parts[0] || 'en';
        const levelCode = levelKey;

        const formattedData = items.map((item) => {
          let term = '';
          let definition = '';
          let analysis = '';
          let example = '';
          let pos = '';

          // NHẬN DIỆN CẤU TRÚC DỮ LIỆU THEO TỪNG GAME (NORMALIZATION)
          if (item.wrongSentence && item.wrongWord && item.correction) {
            pos = 'Spot Mistake';
            term = item.wrongSentence;
            definition = item.correction;
            analysis = item.explanation || '';
            example =
              'Câu hoàn chỉnh: ' +
              item.wrongSentence.replace(item.wrongWord, item.correction);
          } else if (
            item.displaySentence &&
            item.displaySentence.includes('[__________]') &&
            item.targetWord
          ) {
            pos = 'Fill Blank';
            term = item.displaySentence;
            definition = item.targetWord;
            analysis = item.hint || '';
            example =
              'Câu hoàn chỉnh: ' +
              item.displaySentence.replace('[__________]', item.targetWord);
            if (item.hint) example += ' | Bản dịch: ' + item.hint;
          } else if (item.words && item.oddWord) {
            pos = 'Odd One Out';
            term = Array.isArray(item.words) ? item.words.join(' • ') : item.words;
            definition = item.oddWord;
            analysis = item.explanation || '';
            example = item.hint ? 'Nghĩa: ' + item.hint : '';
          } else {
            pos = 'Pure AI Content';
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
            grammar_type: Array.isArray(item.grammar_type)
              ? item.grammar_type.join(', ')
              : item.grammar_type || '',
            level: levelCode,
            language: languageCode
          };
        });

        const ws = xlsxLib.utils.json_to_sheet(formattedData);
        // Tên sheet giới hạn 31 ký tự
        const sheetName = levelKey.substring(0, 31);
        xlsxLib.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    if (!hasData) {
      if (typeof showToast === 'function') {
        showToast('Không có câu hỏi nào hợp lệ để xuất!', 'warning');
      }
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    xlsxLib.writeFile(wb, `AI_Harvest_Master_${dateStr}.xlsx`);
    if (typeof showToast === 'function') {
      showToast('Đã tải xuống file Excel chuẩn chứa nhãn ngữ pháp!', 'success');
    }
  }, [latestStateRef, showToast]);

  // TRẢ VỀ API CHO MAIN CONTROLLER
  return {
    handleSaveToHarvest,
    handleCheckHarvestMemory,
    handleClearHarvestPool,
    handleExportHarvestToExcel
  };
};

if (typeof window !== 'undefined') {
  window.Block6_6_useAiCurator = useAiCurator;
  window.useAiCurator = useAiCurator;
}

export default useAiCurator;