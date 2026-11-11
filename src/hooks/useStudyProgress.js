/**
 * @file src/hooks/useStudyProgress.js
 * @description Quản lý Hồ sơ học thuật của người dùng (Sổ tay, Đã thuộc, Lỗi sai) và Thuật toán SRS.
 * @origin Tầng 6 - Block 6.5 (Study Progress Logic)
 */

import { STORAGE_KEYS } from '@/config/constants';
import { Utils } from '@/utils/helpers';
import { FcDB } from '@/services/db';

export const useStudyProgress = (core, latestStateRef, callbacks) => {
  const { t, showToast, handleNext } = callbacks;
  const { lang } = core;

  // ==================================================================================
  // 1. QUẢN LÝ SỔ TAY TỪ VỰNG (NOTEBOOK ACTIONS)
  // ==================================================================================
  
  // Hàm lưu Sổ tay (Hỗ trợ cả Toggle đơn lẻ và Cập nhật hàng loạt)
  const handleNotebookSave = async (payload) => {
    if (Array.isArray(payload)) {
      // Trường hợp 1: Cập nhật hàng loạt (từ Modal Sổ tay)
      core.setNotebook(payload);
      if (FcDB && core.isDbReady) {
        await FcDB.set('fc_notebook_' + lang, payload);
      }
      showToast("Đã cập nhật sổ tay!", "success");
      return;
    }

    // Trường hợp 2: Toggle (Thêm/Xóa nhanh từ Flashcard/Game)
    const card = payload;
    const { notebook } = latestStateRef.current;
    const exists = notebook.find(c => c.term === card.term);
    let newNote;
    
    if (exists) {
      newNote = notebook.filter(c => c.term !== card.term);
      showToast("Đã xóa khỏi sổ tay", "info");
    } else {
      newNote = [...notebook, card];
      showToast("Đã thêm vào sổ tay", "success");
    }
    
    core.setNotebook(newNote);
    if (FcDB && core.isDbReady) {
      await FcDB.set('fc_notebook_' + lang, newNote);
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
    
    const currentNotebook = latestStateRef.current.notebook;
    const existingTerms = new Set(currentNotebook.map(i => i.term));
    
    // Kéo toàn bộ kho từ vựng của ngôn ngữ hiện tại (Tất cả Level/Topic) để làm khiên lọc
    const globalDeck = Utils?.safeJsonParse('fc_data_' + lang, []) || [];
    
    let unique = [];
    let aiQueueTargets = [];
    
    wordsToSave.forEach(w => {
      const term = w.term || w;
      if (existingTerms.has(term)) return;
      
      // Quét tìm trên kho tổng (Case-insensitive)
      const localMatch = globalDeck.find(c => c.term.toLowerCase() === term.toLowerCase());
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
      showToast("Từ vựng đã có trong sổ tay!", "info");
      core.setShowWordSelect(false);
      return;
    }
    
    const updated = [...currentNotebook, ...unique];
    core.setNotebook(updated);
    
    // Ghi xuống IndexedDB
    if (FcDB && core.isDbReady) {
      await FcDB.set('fc_notebook_' + lang, updated);
    }
    
    showToast(`Đã thêm ${unique.length} mục vào sổ tay`, "success");
    core.setShowWordSelect(false);
    
    // Kích hoạt AI dịch ngầm CHỈ cho những từ thực sự trống (Vượt qua màng lọc)
    if (core.apiKey && callbacks.processAiQueue && aiQueueTargets.length > 0) {
      aiQueueTargets.forEach(term => {
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
    const { cards, mastered, currentCardIndex } = latestStateRef.current;
    const target = (card && card.term) ? card : cards[currentCardIndex];
    if (!target) return;
    
    const newCards = cards.filter(c => c.term !== target.term);
    const newMastered = [...mastered, target];
    
    core.setCards(newCards);
    core.setMastered(newMastered);
    
    // Cards vẫn lưu ở localStorage theo kiến trúc hiện tại của Tầng 7
    Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
    
    // [INDEXEDDB] Lưu kho Thẻ đã thuộc
    if (FcDB && core.isDbReady) {
      await FcDB.set('fc_mastered_' + lang, newMastered);
    }
    
    if (currentCardIndex >= newCards.length) {
      core.setCurrentCardIndex(Math.max(0, newCards.length - 1));
    }
    showToast("Đã đánh dấu thuộc bài!", "success");
  };

  // Khôi phục thẻ từ Mastered về danh sách học
  const handleRestoreMastered = async (card) => {
    const { cards, mastered } = latestStateRef.current;
    const newMaster = mastered.filter(c => c.term !== card.term);
    const newCards = [card, ...cards];
    
    core.setMastered(newMaster);
    core.setCards(newCards);
    Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
    
    if (FcDB && core.isDbReady) {
      await FcDB.set('fc_mastered_' + lang, newMaster);
    }
    core.setCurrentCardIndex(0);
    showToast("Đã khôi phục thẻ (Lên đầu danh sách)!", "success");
  };

  // Khôi phục toàn bộ thẻ đã thuộc
  const handleRestoreAllMastered = async () => {
    const { cards, mastered } = latestStateRef.current;
    if (mastered.length === 0) {
      showToast("Danh sách trống!", "warning");
      return;
    }
    
    const newCards = [...mastered, ...cards];
    core.setMastered([]);
    core.setCards(newCards);
    Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
    
    if (FcDB && core.isDbReady) {
      await FcDB.set('fc_mastered_' + lang, []);
    }
    core.setCurrentCardIndex(0);
    showToast(`Đã khôi phục ${mastered.length} thẻ lên đầu danh sách!`, "success");
  };

  // ==================================================================================
  // 3. QUẢN LÝ LỖI SAI (MISTAKE TRACKING)
  // ==================================================================================
  
  // Ghi nhận câu sai vào Sổ tay lỗi sai (Incorrect List)
  const handleLogWrong = async (card) => {
    if (!card || !card.term) return;
    const { incorrectList } = core;
    const index = incorrectList.findIndex(c => c.term === card.term);
    let newList;
    
    if (index > -1) {
      newList = [...incorrectList];
      newList[index] = {
        ...newList[index],
        count: (newList[index].count || 1) + 1,
        lastWrong: Date.now()
      };
    } else {
      newList = [...incorrectList, { ...card, count: 1, lastWrong: Date.now() }];
    }
    
    core.setIncorrectList(newList);
    
    // [INDEXEDDB] Lưu Danh sách lỗi sai
    if (FcDB && core.isDbReady) {
      await FcDB.set((STORAGE_KEYS.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang, newList);
    }
  };

  // Xóa một từ khỏi danh sách lỗi sai (Khi user đã thuộc)
  const handleRemoveWrong = async (term) => {
    const { incorrectList } = latestStateRef.current;
    const newList = incorrectList.filter(c => c.term !== term);
    core.setIncorrectList(newList);
    
    if (FcDB && core.isDbReady) {
      await FcDB.set((STORAGE_KEYS.INCORRECT_LIST || 'fc_incorrect_list') + '_' + lang, newList);
    }
    showToast("Đã xóa khỏi danh sách cần nhớ", "success");
  };

  // ==================================================================================
  // 4. THUẬT TOÁN SRS (SPACED REPETITION SYSTEM)
  // ==================================================================================
  
  // Chấm điểm SRS cho thẻ hiện tại
  const handleSrsGrade = (grade) => {
    const current = latestStateRef.current;
    const card = current.cards[current.currentCardIndex];
    if (!card) return;
    
    const srsResult = Utils.calculateSRS(card, grade, current.settings);
    core.setCards(prev => {
      const newCards = [...prev];
      newCards[current.currentCardIndex] = { ...card, ...srsResult };
      Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
      return newCards;
    });
    handleNext();
  };

  // Reset thẻ về trạng thái "Mới" (Xóa dữ liệu SRS)
  const handleResetSrs = () => {
    const current = latestStateRef.current;
    const card = current.cards[current.currentCardIndex];
    if (!card) return;
    
    const { srs_interval, srs_repetition, srs_ease, srs_due, ...rest } = card;
    const newCard = { ...rest };
    
    core.setCards(prev => {
      const newCards = [...prev];
      newCards[current.currentCardIndex] = newCard;
      Utils.safeLocalStorageSet('fc_data_' + lang, newCards);
      return newCards;
    });
    showToast("Đã reset về trạng thái Mới", "info");
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