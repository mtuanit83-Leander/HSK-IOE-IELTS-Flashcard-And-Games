// ============================================================================
// FILE 78/85: src/hooks/useStudyProgress.js
// NGUỒN GỐC: Tầng 6 - Block 6.5 (Study Progress Logic - Version 1.02)
// NHIỆM VỤ: Chuyên trách quản lý Hồ sơ học thuật của người dùng (Sổ tay,
//           Đã thuộc, Lỗi sai) và Thuật toán SRS.
// ============================================================================

import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';

// Trình lấy FcDB an toàn (Hỗ trợ cả ES Module lẫn Global Window)
const getDb = () => FcDB || (typeof window !== 'undefined' ? window.FcDB : null);

// Trình gom toàn bộ thẻ từ Kho lõi Đa chiều (All Levels/Modes) để phục vụ Local-First Lookup
const buildGlobalLookupDeck = (targetLang) => {
  const combined = [];
  const activeDeck = Utils?.safeJsonParse('fc_data_' + targetLang, []);
  if (Array.isArray(activeDeck)) {
    combined.push(...activeDeck);
  }

  ['vocab', 'sentence'].forEach((mode) => {
    const masterData = Utils?.safeJsonParse(`fc_master_data_${targetLang}_${mode}`, null);
    if (masterData && typeof masterData === 'object') {
      Object.values(masterData).forEach((levelArr) => {
        if (Array.isArray(levelArr)) {
          combined.push(...levelArr);
        }
      });
    }
  });

  return combined;
};

export const useStudyProgress = (core, latestStateRef, callbacks = {}) => {
  const { showToast, handleNext } = callbacks;
  const { lang } = core;

  // ==================================================================================
  // 0. TRÌNH ĐỒNG BỘ SRS XUYÊN KHO LÕI (CHỐNG VÒI NƯỚC RỬA TRÔI & BẢO VỆ BỘ THẺ GỐC)
  // ==================================================================================
  const syncCardSrsAcrossStores = (cardTerm, transformCardFn) => {
    if (!cardTerm || typeof transformCardFn !== 'function') return;
    const state = latestStateRef.current || {};
    const isReviewMode = Boolean(state.isStudyingNotebook || core.isStudyingNotebook || core.studySourceName);
    const dbInstance = getDb();

    // 1. Cập nhật danh sách thẻ đang hiển thị trên màn hình
    core.setCards((prev) => {
      const nextCards = prev.map((c) => (c && c.term === cardTerm ? transformCardFn(c) : c));
      if (!isReviewMode) {
        Utils.safeLocalStorageSet('fc_data_' + lang, nextCards);
      }
      return nextCards;
    });

    // 2. Nếu đang ở chế độ Ôn tập Sổ tay/Lỗi sai, cập nhật ngầm vào fc_data_ gốc mà không ghi đè mất bộ bài chính
    if (isReviewMode) {
      const savedMainDeck = Utils?.safeJsonParse('fc_data_' + lang, null);
      if (Array.isArray(savedMainDeck) && savedMainDeck.length > 0) {
        let mainChanged = false;
        const updatedMainDeck = savedMainDeck.map((c) => {
          if (c && c.term === cardTerm) {
            mainChanged = true;
            return transformCardFn(c);
          }
          return c;
        });
        if (mainChanged) {
          Utils.safeLocalStorageSet('fc_data_' + lang, updatedMainDeck);
        }
      }
    }

    // 3. Tiêm trực tiếp dữ liệu SRS vào Kho lõi Master Data (Ngăn Động cơ Vòi nước rửa trôi khi F5/đổi Level)
    const activeMode = core.dataMode || 'vocab';
    const masterDataKey = `fc_master_data_${lang}_${activeMode}`;
    const masterData = Utils?.safeJsonParse(masterDataKey, null);
    if (masterData && typeof masterData === 'object') {
      let updatedMaster = false;
      Object.keys(masterData).forEach((levelKey) => {
        if (Array.isArray(masterData[levelKey])) {
          const mIdx = masterData[levelKey].findIndex((c) => c && c.term === cardTerm);
          if (mIdx !== -1) {
            masterData[levelKey][mIdx] = transformCardFn(masterData[levelKey][mIdx]);
            updatedMaster = true;
          }
        }
      });
      if (updatedMaster) {
        Utils.safeLocalStorageSet(masterDataKey, masterData);
      }
    }

    // 4. Đồng bộ vào Sổ tay nếu thẻ này cũng nằm trong Sổ tay
    if (Array.isArray(state.notebook) && state.notebook.some((c) => c && c.term === cardTerm)) {
      core.setNotebook((prev) => {
        const nextNote = prev.map((c) => (c && c.term === cardTerm ? transformCardFn(c) : c));
        if (dbInstance && core.isDbReady) {
          dbInstance.set('fc_notebook_' + lang, nextNote);
        }
        return nextNote;
      });
    }

    // 5. Đồng bộ vào Danh sách lỗi sai nếu thẻ này đang nằm trong Sổ tay cần nhớ
    if (
      Array.isArray(state.incorrectList) &&
      state.incorrectList.some((c) => c && c.term === cardTerm)
    ) {
      const incorrectKey = (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang;
      core.setIncorrectList((prev) => {
        const nextInc = prev.map((c) => (c && c.term === cardTerm ? transformCardFn(c) : c));
        if (dbInstance && core.isDbReady) {
          dbInstance.set(incorrectKey, nextInc);
        }
        return nextInc;
      });
    }
  };

  // ==================================================================================
  // 1. QUẢN LÝ SỔ TAY TỪ VỰNG (NOTEBOOK ACTIONS)
  // ==================================================================================
  // Hàm lưu Sổ tay (Hỗ trợ cả Toggle đơn lẻ và Cập nhật hàng loạt)
  const handleNotebookSave = async (payload) => {
    const dbInstance = getDb();

    if (Array.isArray(payload)) {
      // Trường hợp 1: Cập nhật hàng loạt (từ Modal Sổ tay)
      core.setNotebook(payload);
      if (dbInstance && core.isDbReady) {
        await dbInstance.set('fc_notebook_' + lang, payload);
      }
      if (typeof showToast === 'function') {
        showToast('Đã cập nhật sổ tay!', 'success');
      }
      return;
    }

    // Trường hợp 2: Toggle (Thêm/Xóa nhanh từ Flashcard/Game)
    const card = typeof payload === 'string' ? { term: payload } : payload;
    if (!card || !card.term) return;

    const { notebook } = latestStateRef.current;
    const exists = notebook.find((c) => c.term === card.term);
    let newNote;

    if (exists) {
      newNote = notebook.filter((c) => c.term !== card.term);
      if (typeof showToast === 'function') {
        showToast('Đã xóa khỏi sổ tay', 'info');
      }
    } else {
      newNote = [...notebook, card];
      if (typeof showToast === 'function') {
        showToast('Đã thêm vào sổ tay', 'success');
      }
    }

    core.setNotebook(newNote);
    if (dbInstance && core.isDbReady) {
      await dbInstance.set('fc_notebook_' + lang, newNote);
    }
  };

  // Hàm lưu từ vựng từ bộ chọn (Word Selector) - [BẢN VÁ V1.02: GLOBAL LOCAL-FIRST LOOKUP]
  const handleSaveWords = async (items, isPhrase = false) => {
    let wordsToSave = [];
    if (isPhrase && Array.isArray(items)) {
      const separator = lang === 'zh' ? '' : ' ';
      const phrase = items.join(separator);
      wordsToSave = [phrase];
    } else {
      wordsToSave = Array.isArray(items) ? items : [items];
    }

    const currentNotebook = latestStateRef.current.notebook || [];
    const existingTerms = new Set(currentNotebook.map((i) => i.term));

    // Kéo toàn bộ kho từ vựng của ngôn ngữ hiện tại (Tất cả Level/Topic & Master Data) để làm khiên lọc
    const globalDeck = buildGlobalLookupDeck(lang);
    const unique = [];
    const aiQueueTargets = [];

    wordsToSave.forEach((w) => {
      const term = w?.term || w;
      if (!term || existingTerms.has(term)) return;

      // Quét tìm trên kho tổng (Case-insensitive)
      const localMatch = globalDeck.find(
        (c) => c?.term && String(c.term).toLowerCase() === String(term).toLowerCase()
      );

      if (localMatch) {
        // Nếu đã có trong kho tổng: Sao chép 100% dữ liệu nguyên bản, KHÔNG đẩy cho AI
        unique.push({
          ...localMatch,
          term: term, // Đảm bảo đúng chuẩn format chữ hoa/thường vừa bôi đen
          timestamp: Date.now()
        });
        existingTerms.add(term);
      } else {
        // Nếu là từ hoàn toàn mới: Lưu nháp trắng và đẩy cho AI xử lý
        unique.push({
          term: term,
          definition: '',
          pronunciation: '',
          example: '',
          timestamp: Date.now()
        });
        aiQueueTargets.push(term);
        existingTerms.add(term);
      }
    });

    if (unique.length === 0) {
      if (typeof showToast === 'function') {
        showToast('Từ vựng đã có trong sổ tay!', 'info');
      }
      core.setShowWordSelect(false);
      return;
    }

    const updated = [...currentNotebook, ...unique];
    core.setNotebook(updated);

    // Ghi xuống IndexedDB
    const dbInstance = getDb();
    if (dbInstance && core.isDbReady) {
      await dbInstance.set('fc_notebook_' + lang, updated);
    }

    if (typeof showToast === 'function') {
      showToast(`Đã thêm ${unique.length} mục vào sổ tay`, 'success');
    }
    core.setShowWordSelect(false);

    // Kích hoạt AI dịch ngầm CHỈ cho những từ thực sự trống (Vượt qua màng lọc)
    if (core.apiKey && callbacks.processAiQueue && aiQueueTargets.length > 0) {
      aiQueueTargets.forEach((term) => {
        if (!core.aiQueueRef.current.includes(term)) {
          core.aiQueueRef.current.push(term);
        }
      });
      callbacks.processAiQueue();
    }
  };

  // ==================================================================================
  // 2. QUẢN LÝ THẺ ĐÃ THUỘC (MASTERED ACTIONS)
  // ==================================================================================
  // Đánh dấu thẻ là đã thuộc (Xóa khỏi danh sách học, thêm vào kho Mastered)
  const handleMarkMastered = async (card) => {
    const { cards, mastered, currentCardIndex, isStudyingNotebook } = latestStateRef.current;
    const target = card && card.term ? card : cards[currentCardIndex];
    if (!target) return;

    const newCards = cards.filter((c) => c.term !== target.term);
    const existsInMastered = mastered.some((c) => c.term === target.term);
    const newMastered = existsInMastered ? mastered : [...mastered, target];

    core.setCards(newCards);
    core.setMastered(newMastered);

    // Bảo vệ bộ thẻ gốc nếu đang ở chế độ ôn tập Sổ tay
    const isReviewMode = Boolean(isStudyingNotebook || core.isStudyingNotebook || core.studySourceName);
    if (!isReviewMode) {
      Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
    } else {
      const savedMainDeck = Utils?.safeJsonParse('fc_data_' + lang, null);
      if (Array.isArray(savedMainDeck)) {
        const filteredMain = savedMainDeck.filter((c) => c && c.term !== target.term);
        Utils.safeLocalStorageSet('fc_data_' + lang, filteredMain);
      }
    }

    // [INDEXEDDB] Lưu kho Thẻ đã thuộc
    const dbInstance = getDb();
    if (dbInstance && core.isDbReady) {
      await dbInstance.set('fc_mastered_' + lang, newMastered);
    }

    if (currentCardIndex >= newCards.length) {
      core.setCurrentCardIndex(Math.max(0, newCards.length - 1));
    }

    if (typeof showToast === 'function') {
      showToast('Đã đánh dấu thuộc bài!', 'success');
    }
  };

  // Khôi phục thẻ từ Mastered về danh sách học
  const handleRestoreMastered = async (card) => {
    if (!card) return;
    const { cards, mastered, isStudyingNotebook } = latestStateRef.current;
    const newMaster = mastered.filter((c) => c.term !== card.term);
    const newCards = [card, ...cards.filter((c) => c.term !== card.term)];

    core.setMastered(newMaster);
    core.setCards(newCards);

    const isReviewMode = Boolean(isStudyingNotebook || core.isStudyingNotebook || core.studySourceName);
    if (!isReviewMode) {
      Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
    } else {
      const savedMainDeck = Utils?.safeJsonParse('fc_data_' + lang, []);
      if (Array.isArray(savedMainDeck)) {
        const restoredMain = [card, ...savedMainDeck.filter((c) => c && c.term !== card.term)];
        Utils.safeLocalStorageSet('fc_data_' + lang, restoredMain);
      }
    }

    const dbInstance = getDb();
    if (dbInstance && core.isDbReady) {
      await dbInstance.set('fc_mastered_' + lang, newMaster);
    }

    core.setCurrentCardIndex(0);
    if (typeof showToast === 'function') {
      showToast('Đã khôi phục thẻ (Lên đầu danh sách)!', 'success');
    }
  };

  // Khôi phục toàn bộ thẻ đã thuộc
  const handleRestoreAllMastered = async () => {
    const { cards, mastered, isStudyingNotebook } = latestStateRef.current;
    if (!mastered || mastered.length === 0) {
      if (typeof showToast === 'function') {
        showToast('Danh sách trống!', 'warning');
      }
      return;
    }

    const restoredCount = mastered.length;
    const masteredTerms = new Set(mastered.map((m) => m.term));
    const newCards = [...mastered, ...cards.filter((c) => !masteredTerms.has(c.term))];

    core.setMastered([]);
    core.setCards(newCards);

    const isReviewMode = Boolean(isStudyingNotebook || core.isStudyingNotebook || core.studySourceName);
    if (!isReviewMode) {
      Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
    } else {
      const savedMainDeck = Utils?.safeJsonParse('fc_data_' + lang, []);
      if (Array.isArray(savedMainDeck)) {
        const restoredMain = [
          ...mastered,
          ...savedMainDeck.filter((c) => c && !masteredTerms.has(c.term))
        ];
        Utils.safeLocalStorageSet('fc_data_' + lang, restoredMain);
      }
    }

    const dbInstance = getDb();
    if (dbInstance && core.isDbReady) {
      await dbInstance.set('fc_mastered_' + lang, []);
    }

    core.setCurrentCardIndex(0);
    if (typeof showToast === 'function') {
      showToast(`Đã khôi phục ${restoredCount} thẻ lên đầu danh sách!`, 'success');
    }
  };

  // ==================================================================================
  // 3. QUẢN LÝ LỖI SAI (MISTAKE TRACKING)
  // ==================================================================================
  // Ghi nhận câu sai vào Sổ tay lỗi sai (Incorrect List)
  const handleLogWrong = async (card) => {
    if (!card || !card.term) return;
    const { incorrectList } = latestStateRef.current;
    const safeList = Array.isArray(incorrectList) ? incorrectList : [];
    const index = safeList.findIndex((c) => c.term === card.term);
    let newList;

    if (index > -1) {
      newList = [...safeList];
      newList[index] = {
        ...newList[index],
        count: (newList[index].count || 1) + 1,
        lastWrong: Date.now()
      };
    } else {
      newList = [...safeList, { ...card, count: 1, lastWrong: Date.now() }];
    }

    core.setIncorrectList(newList);

    // [INDEXEDDB] Lưu Danh sách lỗi sai
    const dbInstance = getDb();
    const incorrectKey = (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang;
    if (dbInstance && core.isDbReady) {
      await dbInstance.set(incorrectKey, newList);
    }
  };

  // Xóa một từ khỏi danh sách lỗi sai (Khi user đã thuộc)
  const handleRemoveWrong = async (term) => {
    const { incorrectList } = latestStateRef.current;
    const safeList = Array.isArray(incorrectList) ? incorrectList : [];
    const newList = safeList.filter((c) => c.term !== term);

    core.setIncorrectList(newList);

    const dbInstance = getDb();
    const incorrectKey = (STORAGE_KEYS?.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang;
    if (dbInstance && core.isDbReady) {
      await dbInstance.set(incorrectKey, newList);
    }

    if (typeof showToast === 'function') {
      showToast('Đã xóa khỏi danh sách cần nhớ', 'success');
    }
  };

  // ==================================================================================
  // 4. THUẬT TOÁN SRS (SPACED REPETITION SYSTEM)
  // ==================================================================================
  // Chấm điểm SRS cho thẻ hiện tại
  const handleSrsGrade = (grade) => {
    const current = latestStateRef.current;
    const card = current.cards?.[current.currentCardIndex];
    if (!card || !card.term) return;

    const srsResult = Utils.calculateSRS(card, grade, current.settings);
    syncCardSrsAcrossStores(card.term, (targetCard) => ({
      ...targetCard,
      ...srsResult
    }));

    if (typeof handleNext === 'function') {
      handleNext();
    }
  };

  // Reset thẻ về trạng thái "Mới" (Xóa dữ liệu SRS)
  const handleResetSrs = () => {
    const current = latestStateRef.current;
    const card = current.cards?.[current.currentCardIndex];
    if (!card || !card.term) return;

    syncCardSrsAcrossStores(card.term, (targetCard) => {
      const cleaned = { ...targetCard };
      delete cleaned.srs_interval;
      delete cleaned.srs_repetition;
      delete cleaned.srs_ease;
      delete cleaned.srs_due;
      return cleaned;
    });

    if (typeof showToast === 'function') {
      showToast('Đã reset về trạng thái Mới', 'info');
    }
  };

  // TRẢ VỀ API CHO MAIN CONTROLLER
  return {
    handleNotebookSave,
    handleSaveWords,
    handleMarkMastered,
    handleRestoreMastered,
    handleRestoreAllMastered,
    handleLogWrong,
    handleRemoveWrong,
    handleSrsGrade,
    handleResetSrs
  };
};

export const Block6_5_useStudyProgress = useStudyProgress;

if (typeof window !== 'undefined') {
  window.Block6_5_useStudyProgress = useStudyProgress;
  window.useStudyProgress = useStudyProgress;
}

export default useStudyProgress;